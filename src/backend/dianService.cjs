/**
 * dianService.cjs
 * Cliente para MATIAS API — emisión de facturas electrónicas ante la DIAN.
 * Documentación: https://docs.matias-api.com/
 *
 * La URL base se lee de process.env.MATIAS_API_URL (default = sandbox).
 * La API key se lee de process.env.MATIAS_API_KEY.
 * Nunca hardcodear credenciales aquí.
 */

const { secret } = require('./secrets.cjs');

const BASE_URL = secret('MATIAS_API_URL') || 'https://sandbox-api.matias-api.com/api/ubl2.1';
const IS_SANDBOX = /sandbox/i.test(BASE_URL);

// ─── Catálogo de impuestos ────────────────────────────────────────────────────
// Mapa de tipo_impuesto_co (campo en tabla Productos) → {tax_id, percent}.
// tax_id = campo "id" del catálogo GET /taxes de MATIAS (verificado en sandbox 2026-09):
//   1  = IVA (code 01)
//   4  = INC — Impuesto Nacional al Consumo, 8% restaurantes/bares (code 04)
//   20 = IBUA — bebidas ultraprocesadas azucaradas (code 34)
//   21 = ICUI — comestibles ultraprocesados (code 35)
let TAX_CATALOG = {
  IVA_19:                   { tax_id: '1',  percent: 19 },
  IVA_5:                    { tax_id: '1',  percent: 5  },
  EXENTO:                   null,
  EXCLUIDO:                 null,
  IPOC_8:                   { tax_id: '4',  percent: 8  }, // INC (Art. 512-1 ET)
  SALUDABLE_BEBIDA:         { tax_id: '20', percent: null }, // IBUA — tarifa nominal por unidad
  SALUDABLE_ULTRAPROCESADO: { tax_id: '21', percent: null }, // ICUI — tarifa nominal por unidad
};

// Mapeo medio_pago del sistema → means_payment_id DIAN (UBL 2.1)
const MEDIO_PAGO_MAP = {
  EFECTIVO:        { payment_method_id: 1, means_payment_id: 10 }, // Cash
  TARJETA:         { payment_method_id: 1, means_payment_id: 48 }, // Tarjeta crédito (genérico)
  TARJETA_CREDITO: { payment_method_id: 1, means_payment_id: 48 }, // Tarjeta crédito
  TARJETA_DEBITO:  { payment_method_id: 1, means_payment_id: 47 }, // Tarjeta débito
  TRANSFERENCIA:   { payment_method_id: 1, means_payment_id: 42 }, // Transferencia bancaria
  PSE:             { payment_method_id: 1, means_payment_id: 99 }, // PSE
  APPS:            { payment_method_id: 1, means_payment_id: 99 }, // Billeteras digitales (Nequi, DaviPlata)
};

// ─── Catálogo remoto de impuestos ─────────────────────────────────────────────
let _catalogLoaded = false;

async function _loadTaxCatalog() {
  if (_catalogLoaded) return;
  try {
    const res = await fetch(`${BASE_URL}/taxes`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const json = await res.json();
    // Respuesta: { dataRecords: { data: [ { id, name_taxe, description, code } ] }, success }
    const list = json?.dataRecords?.data || (Array.isArray(json) ? json : []);
    const idPorCodigo = {};
    for (const tax of list) idPorCodigo[String(tax.code)] = String(tax.id);

    // Confirmamos/actualizamos los IDs por código DIAN (más estable que el nombre)
    if (idPorCodigo['04']) TAX_CATALOG.IPOC_8.tax_id = idPorCodigo['04'];                  // INC
    if (idPorCodigo['34']) TAX_CATALOG.SALUDABLE_BEBIDA.tax_id = idPorCodigo['34'];        // IBUA
    if (idPorCodigo['35']) TAX_CATALOG.SALUDABLE_ULTRAPROCESADO.tax_id = idPorCodigo['35']; // ICUI

    _catalogLoaded = true;
  } catch (err) {
    console.warn('[DIAN] No se pudo cargar catálogo de impuestos:', err.message);
  }
}

// ─── Helpers numéricos y de settings ─────────────────────────────────────────

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function _parseBool(val, fallback = false) {
  if (val === undefined || val === null || val === '') return fallback;
  return val === true || val === 1 || val === 'true' || val === '1';
}

// ─── Desglose fiscal por línea ───────────────────────────────────────────────
// Espeja EXACTAMENTE la lógica de POS.tsx → calculateTotals() para Colombia.
// El sistema guarda precios CON impuestos incluidos (bruto). Acá los "abrimos":
// base gravable (neto) + montos de cada impuesto, todos a 2 decimales, de modo
// que la suma de líneas reconcilie con los totales del payload que exige la DIAN.
function _computeLineTax(item, settings) {
  const esResponsableIVA = _parseBool(settings.esResponsableIVA, true);
  const tieneCafeteria = _parseBool(settings.tieneCafeteria, false);

  const tipo = item.tipo_impuesto_co || 'IVA_19';
  const cantidad = Number(item.cantidad) || 0;

  let ivaPercent = 0;
  let ipocPercent = 0;
  let saludablePercent = 0;

  if (tipo === 'IVA_19') ivaPercent = 19;
  else if (tipo === 'IVA_5') ivaPercent = 5;
  else if (tipo === 'IPOC_8') ipocPercent = 8;

  if (item.es_producto_saludable) saludablePercent = 20; // 20% bebidas/ultraprocesados

  // Si el local tiene cafetería, el IPOC reemplaza al IVA en esos ítems
  if (tieneCafeteria && tipo === 'IPOC_8') ivaPercent = 0;
  // No Responsable de IVA → no discrimina IVA
  if (!esResponsableIVA) ivaPercent = 0;

  const totalRate = (ivaPercent + ipocPercent + saludablePercent) / 100;

  // Precio unitario neto derivado del bruto, y base de línea = neto unitario * cantidad
  const grossUnit = round2(Number(item.precio_unitario) || 0);
  const netUnit = round2(grossUnit / (1 + totalRate));
  const baseNeta = round2(netUnit * cantidad);
  const gross = round2(grossUnit * cantidad);

  const ivaAmount = round2(baseNeta * ivaPercent / 100);
  const ipocAmount = round2(baseNeta * ipocPercent / 100);
  const saludableAmount = round2(baseNeta * saludablePercent / 100);

  return {
    item,
    cantidad,
    netUnit,
    gross,
    baseNeta,
    ivaPercent, ivaAmount,
    ipocPercent, ipocAmount,
    saludablePercent, saludableAmount,
    // total de línea reconstruido desde las partes (lo que la DIAN recalcula)
    lineTotal: round2(baseNeta + ivaAmount + ipocAmount + saludableAmount),
  };
}

// ─── Construcción del payload ─────────────────────────────────────────────────

function _buildCustomer(cliente, settings, clienteIdentificacion) {
  const emailConsumidor = settings.dian_email_consumidor || 'sin-correo@consumidor.co';
  const ciudadId = settings.dian_ciudad_id || '836';

  // Cliente registrado en el sistema (con datos completos)
  if (cliente && cliente.nit_cedula) {
    return {
      country_id: '45',
      city_id: ciudadId,
      identity_document_id: '3',
      type_organization_id: 2,
      tax_regime_id: 2,
      tax_level_id: 5,
      company_name: cliente.nombre,
      dni: cliente.nit_cedula.replace(/[^0-9]/g, ''),
      mobile: cliente.telefono || '',
      email: cliente.email || emailConsumidor,
      address: cliente.direccion || 'Sin dirección',
      postal_code: '000000',
    };
  }

  // Cédula/NIT ingresada manualmente en el POS (sin cliente registrado)
  const dniLimpio = clienteIdentificacion ? clienteIdentificacion.replace(/[^0-9]/g, '') : '';
  if (dniLimpio && dniLimpio.length >= 5) {
    return {
      country_id: '45',
      city_id: ciudadId,
      identity_document_id: '3',
      type_organization_id: 2,
      tax_regime_id: 2,
      tax_level_id: 5,
      company_name: 'Consumidor Final',
      dni: dniLimpio,
      mobile: '',
      email: emailConsumidor,
      address: 'Sin dirección',
      postal_code: '000000',
    };
  }

  // Consumidor final anónimo (NIT estándar DIAN)
  return {
    country_id: '45',
    city_id: ciudadId,
    identity_document_id: '3',
    type_organization_id: 2,
    tax_regime_id: 2,
    tax_level_id: 5,
    company_name: 'Consumidor Final',
    dni: '222222222222',
    mobile: '',
    email: emailConsumidor,
    address: 'Sin dirección',
    postal_code: '000000',
  };
}

function _buildLines(lineas) {
  return lineas.map((l) => {
    const item = l.item;
    const tax_totals = [];

    if (l.ivaPercent > 0) {
      tax_totals.push({
        tax_id: '1',
        tax_amount: l.ivaAmount,
        taxable_amount: l.baseNeta,
        percent: l.ivaPercent,
      });
    }
    if (l.ipocPercent > 0) {
      tax_totals.push({
        tax_id: TAX_CATALOG.IPOC_8?.tax_id || '4',
        tax_amount: l.ipocAmount,
        taxable_amount: l.baseNeta,
        percent: l.ipocPercent,
      });
    }
    if (l.saludablePercent > 0) {
      tax_totals.push({
        tax_id: TAX_CATALOG.SALUDABLE_BEBIDA?.tax_id || '20',
        tax_amount: l.saludableAmount,
        taxable_amount: l.baseNeta,
        percent: l.saludablePercent,
      });
    }

    return {
      invoiced_quantity: String(l.cantidad),
      quantity_units_id: '1093',                          // UN (unidades)
      line_extension_amount: l.baseNeta.toFixed(2),       // base gravable (sin impuestos)
      free_of_charge_indicator: false,
      description: item.nombre || `Producto ${item.producto_id}`,
      code: item.codigo || String(item.producto_id),
      type_item_identifications_id: '4',
      reference_price_id: '1',
      price_amount: l.netUnit.toFixed(2),                 // precio unitario neto
      base_quantity: String(l.cantidad),
      tax_totals,
    };
  });
}

// Agrupa los impuestos de todas las líneas por tipo+porcentaje (formato tax_totals de UBL 2.1)
function _buildTaxTotals(lineas) {
  const groups = {};
  const add = (tax_id, percent, taxable, amount) => {
    const key = `${tax_id}|${percent}`;
    if (!groups[key]) groups[key] = { tax_id, percent, taxable_amount: 0, tax_amount: 0 };
    groups[key].taxable_amount = round2(groups[key].taxable_amount + taxable);
    groups[key].tax_amount = round2(groups[key].tax_amount + amount);
  };

  for (const l of lineas) {
    if (l.ivaPercent > 0) add('1', l.ivaPercent, l.baseNeta, l.ivaAmount);
    if (l.ipocPercent > 0) add(TAX_CATALOG.IPOC_8?.tax_id || '4', l.ipocPercent, l.baseNeta, l.ipocAmount);
    if (l.saludablePercent > 0) add(TAX_CATALOG.SALUDABLE_BEBIDA?.tax_id || '20', l.saludablePercent, l.baseNeta, l.saludableAmount);
  }

  return Object.values(groups);
}

function buildPayload(ventaData, cliente, items, settings, numeroFactura) {
  const { medio_pago, cliente_identificacion } = ventaData;

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];

  const paymentInfo = MEDIO_PAGO_MAP[medio_pago] || MEDIO_PAGO_MAP['EFECTIVO'];

  // Desglose fiscal por línea — única fuente de verdad para TODOS los totales
  const lineas = (items || []).map((item) => _computeLineTax(item, settings));

  const sum = (fn) => round2(lineas.reduce((acc, l) => acc + fn(l), 0));
  const baseTotal = sum((l) => l.baseNeta);
  const impuestosTotal = sum((l) => l.ivaAmount + l.ipocAmount + l.saludableAmount);
  const payableAmount = round2(baseTotal + impuestosTotal);

  // Aviso si el total reconstruido no cuadra con lo cobrado (redondeo esperado ≤ pocos pesos)
  const totalCobrado = round2(Number(ventaData.total) || 0);
  if (totalCobrado > 0 && Math.abs(totalCobrado - payableAmount) > 2) {
    console.warn(
      `[DIAN] Descuadre factura #${numeroFactura}: cobrado ${totalCobrado} vs reconstruido ${payableAmount}`
    );
  }

  // graphic_representation / send_email: MATIAS genera el PDF (y lo manda por email).
  // Requiere que el emisor tenga logo cargado en el portal de MATIAS; sin logo,
  // su generador de PDF falla (500). Por eso default 0 y se habilita desde settings
  // cuando el negocio ya cargó su logo.
  const graphicRep = _parseBool(settings.dian_graphic_representation, false) ? 1 : 0;
  const customerEmail = _buildCustomer(cliente, settings, cliente_identificacion).email;
  const sendEmail = (graphicRep === 1 && _parseBool(settings.dian_send_email, false) && customerEmail
    && !/consumidor\.co$/i.test(customerEmail)) ? 1 : 0;

  return {
    resolution_number: String(settings.dian_resolucion || ''),
    prefix: settings.dian_prefijo || '',
    document_number: String(numeroFactura),
    graphic_representation: graphicRep,
    send_email: sendEmail,
    operation_type_id: 1,
    type_document_id: 7,       // Factura electrónica de venta
    date: dateStr,
    time: timeStr,
    payments: [{
      payment_method_id: paymentInfo.payment_method_id,
      means_payment_id: paymentInfo.means_payment_id,
      value_paid: payableAmount.toFixed(2),
      payment_due_date: dateStr,
    }],
    customer: _buildCustomer(cliente, settings, cliente_identificacion),
    lines: _buildLines(lineas),
    legal_monetary_totals: {
      line_extension_amount: baseTotal.toFixed(2),
      tax_exclusive_amount: baseTotal.toFixed(2),
      tax_inclusive_amount: payableAmount.toFixed(2),
      payable_amount: payableAmount,
      total_allowance: '0.00',
      total_charges: '0.00',
    },
    tax_totals: _buildTaxTotals(lineas),
  };
}

// ─── Función principal de emisión ─────────────────────────────────────────────

async function emitirFactura(ventaData, cliente, items, settings, numeroFactura) {
  await _loadTaxCatalog();

  const apiKey = secret('MATIAS_API_KEY');
  if (!apiKey) {
    throw new Error('MATIAS_API_KEY no está configurada (falta en el build o en el .env).');
  }

  const payload = buildPayload(ventaData, cliente, items, settings, numeroFactura);

  let res;
  try {
    res = await fetch(`${BASE_URL}/invoice`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000), // 30 segundos máximo
    });
  } catch (err) {
    // Error de red (sin internet, timeout)
    throw new Error(`Sin conexión con MATIAS API: ${err.message}`);
  }

  const data = await res.json().catch(() => ({}));

  // Respuestas observadas en sandbox:
  //  OK:        { uuid, message, send_to_queue, XmlDocumentKey (CUFE),
  //              response: { IsValid:"true", StatusCode:"00", StatusDescription, StatusMessage,
  //                          ErrorMessage:{string:""}, XmlBase64Bytes } }
  //  Error MATIAS (no DIAN): { success:false, message, line, file }
  //  Rechazo DIAN:  response.IsValid:"false" + response.ErrorMessage.string con detalle
  if (data && data.success === false) {
    throw new Error(`MATIAS API ${res.status}: ${data.message || JSON.stringify(data)}`);
  }
  if (!res.ok && res.status !== 422) {
    throw new Error(`MATIAS API ${res.status}: ${data.message || JSON.stringify(data)}`);
  }

  const r = data.response || {};
  const isValid = String(r.IsValid).toLowerCase() === 'true' || r.StatusCode === '00';
  const queued = !isValid && (data.send_to_queue === 1 || data.send_to_queue === true);

  // ErrorMessage.string puede venir como "", string, o array
  let errores = r.ErrorMessage && r.ErrorMessage.string !== undefined ? r.ErrorMessage.string : [];
  if (typeof errores === 'string') errores = errores ? [errores] : [];
  if (!Array.isArray(errores)) errores = errores ? [String(errores)] : [];
  errores = errores.filter(Boolean);

  const result = {
    success: isValid,
    queued,
    cufe: data.XmlDocumentKey || r.XmlDocumentKey || null,
    estado_dian: r.StatusCode || null,
    descripcion_dian: r.StatusDescription || null,
    mensaje_dian: r.StatusMessage || null,
    errores_dian: errores,
    xml_base64: r.XmlBase64Bytes || null,
    xml_url: data.AttachedDocument?.url || data.xml?.url || null,
    pdf_url: data.pdf?.url || data.GraphicRepresentation?.url || null,
    qr_url: data.qr?.url || null,
    qr_dian_url: data.qr?.qrDian || r.QRCode || null,
    qr_base64: null,
    uuid: data.uuid || null,
    raw: data,
  };

  // El QR (imagen PNG que genera MATIAS con el formato exacto que exige la DIAN)
  // se descarga ahora y se guarda embebido, para que el ticket lo imprima aunque
  // después no haya internet o el host del QR se caiga.
  if (isValid && result.qr_url) {
    result.qr_base64 = await _fetchQrDataUri(result.qr_url);
  }

  return result;
}

async function _fetchQrDataUri(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 200 * 1024) return null; // sanity: un QR pesa ~1-3 KB
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

module.exports = { emitirFactura, buildPayload, BASE_URL, IS_SANDBOX };
