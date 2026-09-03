// ─────────────────────────────────────────────────────────────────────────────
//  Facturas electrónicas pendientes — reintento manual y job automático
//
//  Cuando una venta no logra emitir la factura ante la DIAN (sin internet,
//  MATIAS caído, factura "en cola de la DIAN"), la venta se guarda igual y la
//  fila de FacturasElectronicas queda en estado PENDIENTE. Este módulo reintenta
//  esas facturas:
//    - `procesarFactura(venta_id)`  → un reintento puntual (lo usa el botón
//                                     "Reintentar" del frontend).
//    - job automático               → recorre las PENDIENTE cada X minutos con
//                                     backoff exponencial por fila.
//
//  Las facturas en estado ERROR (rechazadas por la DIAN por contenido inválido)
//  NO se reintentan automáticamente: reintentar el mismo payload no las va a
//  arreglar. El botón manual sí las cubre, para después de corregir los datos.
// ─────────────────────────────────────────────────────────────────────────────

const { dbRun, dbGet, dbAll } = require('./db.cjs');
const { emitirFactura } = require('./dianService.cjs');

const MAX_INTENTOS_AUTO = 15;   // tras esto, el job deja de tocar la fila (sigue reintenable a mano)
const BACKOFF_MAX_MIN = 120;    // tope del backoff exponencial entre intentos

let jobTimer = null;
let corriendo = false;          // evita solapar dos corridas del job

// ── Núcleo: reintenta una factura concreta ───────────────────────────────────
async function procesarFactura(venta_id, { auto = false } = {}) {
  const [venta, fe, items, settingsRows] = await Promise.all([
    dbGet('SELECT * FROM Ventas WHERE id = ?', [venta_id]),
    dbGet('SELECT * FROM FacturasElectronicas WHERE venta_id = ?', [venta_id]),
    dbAll(
      `SELECT dv.*, p.nombre, p.codigo, p.tipo_impuesto_co, p.es_producto_saludable
       FROM DetallesVenta dv
       JOIN Productos p ON dv.producto_id = p.id
       WHERE dv.venta_id = ?`,
      [venta_id]
    ),
    dbAll('SELECT clave, valor FROM Configuracion'),
  ]);

  if (!venta) return { success: false, estado: null, error: 'Venta no encontrada.' };
  if (!fe) return { success: false, estado: null, error: 'No hay factura registrada para esta venta.' };
  if (fe.estado === 'EMITIDA') return { success: false, estado: 'EMITIDA', error: 'La factura ya fue emitida.' };

  const settings = {};
  settingsRows.forEach((r) => { settings[r.clave] = r.valor; });

  if (!settings.dian_resolucion || !fe.numero_factura) {
    await dbRun(
      `UPDATE FacturasElectronicas SET estado = 'PENDIENTE', error_mensaje = ?, ultimo_intento = CURRENT_TIMESTAMP WHERE venta_id = ?`,
      ['Resolución DIAN no configurada en Ajustes.', venta_id]
    );
    return { success: false, estado: 'PENDIENTE', error: 'Resolución DIAN no configurada.' };
  }

  const cliente = venta.cliente_id
    ? await dbGet('SELECT * FROM Clientes WHERE id = ?', [venta.cliente_id])
    : null;

  await dbRun(
    'UPDATE FacturasElectronicas SET intentos = intentos + 1, ultimo_intento = CURRENT_TIMESTAMP WHERE venta_id = ?',
    [venta_id]
  );

  try {
    const r = await emitirFactura(venta, cliente, items, settings, fe.numero_factura);

    if (r.success) {
      await dbRun(
        `UPDATE FacturasElectronicas SET
            estado = 'EMITIDA', cufe = ?, estado_dian = ?, descripcion_dian = ?,
            xml_url = ?, pdf_url = ?, qr_url = ?, qr_dian_url = ?, qr_base64 = ?, error_mensaje = NULL
         WHERE venta_id = ?`,
        [r.cufe, r.estado_dian, r.descripcion_dian, r.xml_url, r.pdf_url, r.qr_url, r.qr_dian_url, r.qr_base64, venta_id]
      );
      await dbRun('UPDATE Ventas SET cude_local = ? WHERE id = ?', [r.cufe, venta_id]);
      console.log(`[DIAN] Factura de la venta #${venta_id} emitida en reintento${auto ? ' automático' : ''}. CUFE ${r.cufe}`);
      return { success: true, estado: 'EMITIDA', cufe: r.cufe };
    }

    if (r.queued) {
      await dbRun(
        `UPDATE FacturasElectronicas SET estado = 'PENDIENTE', cufe = ?, error_mensaje = ? WHERE venta_id = ?`,
        [r.cufe, 'En cola de la DIAN — se reintenta la consulta.', venta_id]
      );
      return { success: false, estado: 'PENDIENTE', error: 'Factura en cola de la DIAN.' };
    }

    const errorMsg = (r.errores_dian && r.errores_dian.join(' | ')) || r.descripcion_dian || 'Rechazada por la DIAN';
    await dbRun(
      `UPDATE FacturasElectronicas SET estado = 'ERROR', estado_dian = ?, descripcion_dian = ?, error_mensaje = ? WHERE venta_id = ?`,
      [r.estado_dian, r.descripcion_dian, errorMsg, venta_id]
    );
    return { success: false, estado: 'ERROR', error: errorMsg };
  } catch (err) {
    // Error de red / MATIAS caído → sigue PENDIENTE, se reintenta después
    await dbRun(
      `UPDATE FacturasElectronicas SET estado = 'PENDIENTE', error_mensaje = ? WHERE venta_id = ?`,
      [err.message, venta_id]
    );
    return { success: false, estado: 'PENDIENTE', error: err.message };
  }
}

// ── Job automático ──────────────────────────────────────────────────────────
function _backoffVencido(fe) {
  if (!fe.ultimo_intento) return true;
  const esperaMin = Math.min(2 ** (fe.intentos || 0), BACKOFF_MAX_MIN);
  const ultimo = new Date(String(fe.ultimo_intento).replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(ultimo)) return true;
  return Date.now() - ultimo >= esperaMin * 60 * 1000;
}

async function procesarPendientes({ soloAuto = true } = {}) {
  const resumen = { candidatas: 0, procesadas: 0, emitidas: 0, sigueFallando: 0 };
  try {
    // Automático: solo PENDIENTE y con margen de intentos. Manual (lote): también
    // las ERROR, por si el negocio ya corrigió los datos.
    const filas = await dbAll(
      soloAuto
        ? `SELECT venta_id, intentos, ultimo_intento FROM FacturasElectronicas
           WHERE estado = 'PENDIENTE' AND intentos < ${MAX_INTENTOS_AUTO}
           ORDER BY fecha_emision ASC`
        : `SELECT venta_id, intentos, ultimo_intento FROM FacturasElectronicas
           WHERE estado IN ('PENDIENTE', 'ERROR')
           ORDER BY fecha_emision ASC`
    );
    resumen.candidatas = filas.length;

    for (const fe of filas) {
      if (soloAuto && !_backoffVencido(fe)) continue;
      resumen.procesadas += 1;
      const r = await procesarFactura(fe.venta_id, { auto: soloAuto });
      if (r.success) resumen.emitidas += 1;
      else resumen.sigueFallando += 1;
      // pequeño respiro para no golpear la API de MATIAS en ráfaga
      await new Promise((res) => setTimeout(res, 800));
    }
  } catch (err) {
    console.error('[DIAN] Error recorriendo facturas pendientes:', err.message);
  }
  return resumen;
}

async function _tick() {
  if (corriendo) return;
  corriendo = true;
  try {
    // ¿Está activada la facturación electrónica en este negocio?
    const flag = await dbGet("SELECT valor FROM Configuracion WHERE clave = 'dianCompliance2026'");
    const activa = !flag || flag.valor === 'true' || flag.valor === '1' || flag.valor === 1;
    if (!activa) return;

    const r = await procesarPendientes({ soloAuto: true });
    if (r.procesadas > 0) {
      console.log(`[DIAN] Job de reintento: ${r.procesadas} procesadas, ${r.emitidas} emitidas, ${r.sigueFallando} siguen pendientes.`);
    }
  } finally {
    corriendo = false;
  }
}

function iniciarJobReintento({ intervaloMs = 5 * 60 * 1000, arranqueMs = 25 * 1000 } = {}) {
  if (jobTimer) return;
  setTimeout(() => { _tick().catch(() => { }); }, arranqueMs);
  jobTimer = setInterval(() => { _tick().catch(() => { }); }, intervaloMs);
  if (jobTimer.unref) jobTimer.unref();
  console.log('[DIAN] Job de reintento de facturas pendientes iniciado.');
}

module.exports = { procesarFactura, procesarPendientes, iniciarJobReintento };
