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
const { emitirFactura, emitirNotaCredito, consultarDocumento, qrPngDesdeData } = require('./dianService.cjs');

// Conceptos DIAN de nota crédito (discrepancy_response.response_id)
const CONCEPTOS_NC = {
  1: 'Devolución parcial',
  2: 'Anulación de factura',
  3: 'Rebaja o descuento',
  4: 'Ajuste de precio',
  5: 'Descuento por pronto pago',
  6: 'Descuento por volumen',
};

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

  if (!settings.dian_resolucion || !String(settings.dian_resolucion).trim() || !fe.numero_factura) {
    const msg = !fe.numero_factura
      ? 'Esta factura no tiene número asignado. Revisá "Número actual de factura" en Ajustes → Facturación Electrónica.'
      : 'Falta el N° de resolución DIAN en Ajustes → Facturación Electrónica.';
    await dbRun(
      `UPDATE FacturasElectronicas SET estado = 'PENDIENTE', error_mensaje = ?, ultimo_intento = CURRENT_TIMESTAMP WHERE venta_id = ?`,
      [msg, venta_id]
    );
    return { success: false, estado: 'PENDIENTE', error: msg };
  }

  const cliente = venta.cliente_id
    ? await dbGet('SELECT * FROM Clientes WHERE id = ?', [venta.cliente_id])
    : null;

  await dbRun(
    'UPDATE FacturasElectronicas SET intentos = intentos + 1, ultimo_intento = CURRENT_TIMESTAMP WHERE venta_id = ?',
    [venta_id]
  );

  // ── Caso "en cola de la DIAN": ya se envió (tenemos CUFE) → CONSULTAR estado,
  //    no re-emitir (re-emitir el mismo número puede duplicar o rechazar). ──────
  if (fe.cufe) {
    try {
      const est = await consultarDocumento({ prefijo: settings.dian_prefijo, numero: fe.numero_factura });

      if (est.found && est.valid) {
        let qrBase64 = fe.qr_base64;
        if (!qrBase64 && est.qr_data_b64) qrBase64 = await qrPngDesdeData(est.qr_data_b64);
        await dbRun(
          `UPDATE FacturasElectronicas SET
              estado = 'EMITIDA', cufe = ?, estado_dian = ?, descripcion_dian = 'Autorizada (consulta de estado).',
              qr_dian_url = COALESCE(?, qr_dian_url), qr_base64 = COALESCE(?, qr_base64), error_mensaje = NULL
           WHERE venta_id = ?`,
          [est.cufe || fe.cufe, est.estado_dian, est.qr_dian_url, qrBase64, venta_id]
        );
        await dbRun('UPDATE Ventas SET cude_local = ? WHERE id = ?', [est.cufe || fe.cufe, venta_id]);
        console.log(`[DIAN] Venta #${venta_id}: la DIAN ya validó la factura en cola (consulta de estado${auto ? ', automática' : ''}).`);
        return { success: true, estado: 'EMITIDA', cufe: est.cufe || fe.cufe };
      }

      if (est.found && !est.valid) {
        await dbRun(
          `UPDATE FacturasElectronicas SET estado = 'PENDIENTE', error_mensaje = ? WHERE venta_id = ?`,
          ['La DIAN todavía está validando la factura (en cola).', venta_id]
        );
        return { success: false, estado: 'PENDIENTE', error: 'La DIAN todavía está validando la factura.' };
      }

      // No aparece en MATIAS → el envío no quedó registrado; se re-emite abajo.
      console.warn(`[DIAN] Venta #${venta_id}: tiene CUFE local pero MATIAS no la encuentra. Se re-emite.`);
    } catch (err) {
      await dbRun(
        `UPDATE FacturasElectronicas SET estado = 'PENDIENTE', error_mensaje = ? WHERE venta_id = ?`,
        [`Consulta de estado falló: ${err.message}`, venta_id]
      );
      return { success: false, estado: 'PENDIENTE', error: err.message };
    }
  }

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

// ─────────────────────────────────────────────────────────────────────────────
//  NOTAS CRÉDITO — anulación de una venta ya facturada
// ─────────────────────────────────────────────────────────────────────────────

async function _cargarContextoVenta(venta_id) {
  const [venta, factura, items, settingsRows] = await Promise.all([
    dbGet('SELECT * FROM Ventas WHERE id = ?', [venta_id]),
    dbGet('SELECT * FROM FacturasElectronicas WHERE venta_id = ?', [venta_id]),
    dbAll(
      `SELECT dv.*, p.nombre, p.codigo, p.tipo_impuesto_co, p.es_producto_saludable
       FROM DetallesVenta dv JOIN Productos p ON dv.producto_id = p.id
       WHERE dv.venta_id = ?`,
      [venta_id]
    ),
    dbAll('SELECT clave, valor FROM Configuracion'),
  ]);
  const settings = {};
  settingsRows.forEach((r) => { settings[r.clave] = r.valor; });
  const cliente = venta && venta.cliente_id
    ? await dbGet('SELECT * FROM Clientes WHERE id = ?', [venta.cliente_id])
    : null;
  return { venta, factura, items, settings, cliente };
}

// Envía la NC a la DIAN y, si queda EMITIDA, aplica los efectos contables UNA vez:
// repone stock, registra el EGRESO en caja y marca la venta como anulada.
async function _emitirYGuardarNC(venta_id, { auto = false } = {}) {
  const nc = await dbGet('SELECT * FROM NotasCredito WHERE venta_id = ?', [venta_id]);
  if (!nc) return { success: false, estado: null, error: 'No hay nota crédito registrada para esta venta.' };
  if (nc.estado === 'EMITIDA') return { success: false, estado: 'EMITIDA', error: 'La nota crédito ya fue emitida.' };

  const { venta, factura, items, settings, cliente } = await _cargarContextoVenta(venta_id);
  if (!venta || !factura) return { success: false, estado: null, error: 'Venta o factura no encontrada.' };
  if (!factura.cufe || !factura.numero_factura) {
    return { success: false, estado: 'ERROR', error: 'La factura original no tiene CUFE/número — no se puede anular.' };
  }

  await dbRun(
    'UPDATE NotasCredito SET intentos = intentos + 1, ultimo_intento = CURRENT_TIMESTAMP WHERE venta_id = ?',
    [venta_id]
  );

  const prefijoFactura = settings.dian_prefijo || '';
  const fechaFactura = String(factura.fecha_emision || venta.fecha || new Date().toISOString()).split('T')[0].split(' ')[0];

  let r;
  try {
    r = await emitirNotaCredito(
      venta, cliente, items, settings, nc.numero_nc,
      { numeroFacturaCompleto: `${prefijoFactura}${factura.numero_factura}`, fechaFactura, cufeFactura: factura.cufe },
      nc.concepto || 2,
      nc.motivo
    );
  } catch (err) {
    await dbRun(
      `UPDATE NotasCredito SET estado = 'PENDIENTE', error_mensaje = ? WHERE venta_id = ?`,
      [err.message, venta_id]
    );
    return { success: false, estado: 'PENDIENTE', error: err.message };
  }

  if (!r.success) {
    if (r.queued) {
      await dbRun(
        `UPDATE NotasCredito SET estado = 'PENDIENTE', cufe = ?, error_mensaje = ? WHERE venta_id = ?`,
        [r.cufe, 'Nota crédito en cola de la DIAN.', venta_id]
      );
      return { success: false, estado: 'PENDIENTE', error: 'Nota crédito en cola de la DIAN.' };
    }
    const msg = (r.errores_dian && r.errores_dian.join(' | ')) || r.descripcion_dian || 'Rechazada por la DIAN';
    await dbRun(
      `UPDATE NotasCredito SET estado = 'ERROR', estado_dian = ?, descripcion_dian = ?, error_mensaje = ? WHERE venta_id = ?`,
      [r.estado_dian, r.descripcion_dian, msg, venta_id]
    );
    return { success: false, estado: 'ERROR', error: msg };
  }

  // ── NC autorizada: aplicar efectos (una sola vez, en transacción) ──────────
  try {
    await dbRun('BEGIN');
    await dbRun(
      `UPDATE NotasCredito SET
          estado = 'EMITIDA', cufe = ?, estado_dian = ?, descripcion_dian = ?,
          xml_url = ?, pdf_url = ?, qr_url = ?, qr_dian_url = ?, qr_base64 = ?, error_mensaje = NULL
       WHERE venta_id = ? AND estado != 'EMITIDA'`,
      [r.cufe, r.estado_dian, r.descripcion_dian, r.xml_url, r.pdf_url, r.qr_url, r.qr_dian_url, r.qr_base64, venta_id]
    );
    // Reponer stock de todos los ítems de la venta anulada
    for (const it of items) {
      await dbRun(
        'UPDATE Inventario SET cantidad = cantidad + ? WHERE producto_id = ? AND sucursal_id = ?',
        [it.cantidad, it.producto_id, venta.sucursal_id]
      );
    }
    // Registrar el egreso de caja por la devolución
    await dbRun(
      `INSERT INTO MovimientosCaja (tipo, monto, concepto, sucursal_id, venta_id) VALUES ('EGRESO', ?, ?, ?, ?)`,
      [nc.monto || venta.total, `Anulación venta #${venta_id} — Nota crédito ${nc.prefijo_nc || ''}${nc.numero_nc}`, venta.sucursal_id, venta_id]
    );
    await dbRun('UPDATE Ventas SET anulada = 1 WHERE id = ?', [venta_id]);
    await dbRun('COMMIT');
  } catch (err) {
    await dbRun('ROLLBACK').catch(() => { });
    console.error(`[DIAN] NC #${venta_id} autorizada pero fallaron los efectos contables:`, err.message);
    // La NC quedó EMITIDA en la DIAN; dejamos la fila en un estado que lo refleje.
    await dbRun(
      `UPDATE NotasCredito SET estado = 'EMITIDA', cufe = ?, error_mensaje = ? WHERE venta_id = ?`,
      [r.cufe, `Autorizada, pero revisar stock/caja: ${err.message}`, venta_id]
    ).catch(() => { });
    return { success: true, estado: 'EMITIDA', cufe: r.cufe, warning: err.message };
  }

  console.log(`[DIAN] Nota crédito de la venta #${venta_id} emitida${auto ? ' (reintento automático)' : ''}. CUFE ${r.cufe}`);
  return { success: true, estado: 'EMITIDA', cufe: r.cufe };
}

// Crea la NC (reserva número) y la emite. Para el botón "Anular" del frontend.
async function emitirNotaCreditoPorVenta(venta_id, { motivo, concepto = 2 } = {}) {
  const { venta, factura, items, settings } = await _cargarContextoVenta(venta_id);
  if (!venta) return { success: false, error: 'Venta no encontrada.' };
  if (!factura || factura.estado !== 'EMITIDA' || !factura.cufe) {
    return { success: false, error: 'La factura de esta venta no está emitida ante la DIAN — no se puede anular todavía.' };
  }
  const yaHay = await dbGet('SELECT estado FROM NotasCredito WHERE venta_id = ?', [venta_id]);
  if (yaHay && yaHay.estado === 'EMITIDA') return { success: false, error: 'Esta venta ya tiene una nota crédito emitida.' };
  if (!String(motivo || '').trim() || String(motivo).trim().length < 8) {
    return { success: false, error: 'Indicá el motivo de la anulación (mínimo 8 caracteres).' };
  }

  const total = (items || []).reduce((a, it) => a + (Number(it.subtotal) || 0), 0) || venta.total;
  const prefijoNC = settings.dian_prefijo_nc || 'NCFE';

  // Reservar número de NC
  const numeroNC = parseInt(settings.dian_numero_nc_actual || '1', 10) || 1;
  await dbRun("INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('dian_numero_nc_actual', ?)", [String(numeroNC + 1)]);

  await dbRun(
    `INSERT OR REPLACE INTO NotasCredito
       (venta_id, factura_venta_id, numero_nc, prefijo_nc, concepto, motivo, monto, cufe_factura_ref, estado, intentos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', 0)`,
    [venta_id, venta_id, numeroNC, prefijoNC, concepto, String(motivo).trim(), total, factura.cufe]
  );

  const r = await _emitirYGuardarNC(venta_id, { auto: false });
  return {
    success: r.success,
    estado: r.estado,
    cufe: r.cufe || null,
    numero_nc: numeroNC,
    prefijo_nc: prefijoNC,
    error: r.success ? null : r.error,
    warning: r.warning || null,
  };
}

async function procesarNotaCredito(venta_id) {
  return _emitirYGuardarNC(venta_id, { auto: false });
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

    // Notas crédito pendientes (mismo criterio)
    const ncs = await dbAll(
      soloAuto
        ? `SELECT venta_id, intentos, ultimo_intento FROM NotasCredito
           WHERE estado = 'PENDIENTE' AND intentos < ${MAX_INTENTOS_AUTO} ORDER BY fecha_emision ASC`
        : `SELECT venta_id, intentos, ultimo_intento FROM NotasCredito
           WHERE estado IN ('PENDIENTE', 'ERROR') ORDER BY fecha_emision ASC`
    );
    for (const nc of ncs) {
      if (soloAuto && !_backoffVencido(nc)) continue;
      resumen.candidatas += 1;
      resumen.procesadas += 1;
      const r = await procesarNotaCredito(nc.venta_id);
      if (r.success) resumen.emitidas += 1;
      else resumen.sigueFallando += 1;
      await new Promise((res) => setTimeout(res, 800));
    }
  } catch (err) {
    console.error('[DIAN] Error recorriendo pendientes:', err.message);
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

module.exports = {
  procesarFactura,
  procesarPendientes,
  iniciarJobReintento,
  emitirNotaCreditoPorVenta,
  procesarNotaCredito,
  CONCEPTOS_NC,
};
