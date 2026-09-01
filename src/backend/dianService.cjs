/**
 * dianService.cjs
 * Cliente para MATIAS API — emisión de facturas electrónicas ante la DIAN.
 * Documentación: https://docs.matias-api.com/
 *
 * La URL base se lee de process.env.MATIAS_API_URL (default = sandbox).
 * La API key se lee de process.env.MATIAS_API_KEY.
 * Nunca hardcodear credenciales aquí.
 */

const BASE_URL = process.env.MATIAS_API_URL || 'https://sandbox-api.matias-api.com/api/ubl2.1';

// ─── Catálogo de impuestos ────────────────────────────────────────────────────
// Mapa de tipo_impuesto_co (campo en tabla Productos) → {tax_id, percent}.
// tax_id "1" = IVA según especificación UBL 2.1 DIAN.
// Los IDs de IPOC y saludable se complementan al cargar el catálogo vía GET /taxes.
let TAX_CATALOG = {
  IVA_19:                   { tax_id: '1',  percent: 19 },
  IVA_5:                    { tax_id: '1',  percent: 5  },
  EXENTO:                   null,
  EXCLUIDO:                 null,
  IPOC_8:                   { tax_id: '18', percent: 8  }, // Impuesto al Consumo (Art. 512-1 ET)
  SALUDABLE_BEBIDA:         { tax_id: '22', percent: null }, // nominal por unidad — verificar
  SALUDABLE_ULTRAPROCESADO: { tax_id: '23', percent: null }, // nominal por unidad — verificar
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
    const data = await res.json();
    // data es un array de { id, name, description, ... }
    // Actualizamos los IDs si encontramos coincidencias por nombre
    if (Array.isArray(data)) {
      for (const tax of data) {
        const name = (tax.name || tax.description || '').toLowerCase();
        if (name.includes('consumo') && name.includes('8')) {
          TAX_CATALOG.IPOC_8 = { tax_id: String(tax.id), percent: 8 };
        }
        if (name.includes('saludable') && name.includes('bebida')) {
          TAX_CATALOG.SALUDABLE_BEBIDA = { tax_id: String(tax.id), percent: null };
        }
        if (name.includes('saludable') && name.includes('ultra')) {
          TAX_CATALOG.SALUDABLE_ULTRAPROCESADO = { tax_id: String(tax.id), percent: null };
        }
      }
    }
    _catalogLoaded = true;
  } catch (err) {
    console.warn('[DIAN] No se pudo cargar catálogo de impuestos:', err.message);
  }
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

function _buildLines(items) {
  return items.map((item) => {
    const taxInfo = TAX_CATALOG[item.tipo_impuesto_co] ?? TAX_CATALOG['IVA_19'];
    const baseAmount = parseFloat(item.subtotal);

    const tax_totals = [];
    if (taxInfo && taxInfo.percent !== null) {
      tax_totals.push({
        tax_id: taxInfo.tax_id,
        tax_amount: parseFloat((baseAmount * taxInfo.percent / 100).toFixed(2)),
        taxable_amount: parseFloat(baseAmount.toFixed(2)),
        percent: taxInfo.percent,
      });
    }

    return {
      invoiced_quantity: String(item.cantidad),
      quantity_units_id: '1093',                          // UN (unidades)
      line_extension_amount: baseAmount.toFixed(2),
      free_of_charge_indicator: false,
      description: item.nombre || `Producto ${item.producto_id}`,
      code: item.codigo || String(item.producto_id),
      type_item_identifications_id: '4',
      reference_price_id: '1',
      price_amount: parseFloat(item.precio_unitario).toFixed(2),
      base_quantity: String(item.cantidad),
      tax_totals,
    };
  });
}

function _buildTaxTotals(ventaData) {
  const { iva_19 = 0, iva_5 = 0, ipoc_8 = 0 } = ventaData;
  const totals = [];

  if (iva_19 > 0) {
    totals.push({
      tax_id: '1',
      tax_amount: parseFloat(iva_19.toFixed(2)),
      taxable_amount: parseFloat((iva_19 / 0.19).toFixed(2)),
      percent: 19,
    });
  }
  if (iva_5 > 0) {
    totals.push({
      tax_id: '1',
      tax_amount: parseFloat(iva_5.toFixed(2)),
      taxable_amount: parseFloat((iva_5 / 0.05).toFixed(2)),
      percent: 5,
    });
  }
  if (ipoc_8 > 0) {
    totals.push({
      tax_id: TAX_CATALOG.IPOC_8?.tax_id || '18',
      tax_amount: parseFloat(ipoc_8.toFixed(2)),
      taxable_amount: parseFloat((ipoc_8 / 0.08).toFixed(2)),
      percent: 8,
    });
  }

  return totals;
}

function buildPayload(ventaData, cliente, items, settings, numeroFactura) {
  const { total, subtotal, medio_pago, iva_19 = 0, iva_5 = 0, ipoc_8 = 0, imp_saludable = 0, cliente_identificacion } = ventaData;

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];

  const paymentInfo = MEDIO_PAGO_MAP[medio_pago] || MEDIO_PAGO_MAP['EFECTIVO'];
  const impuestosTotal = iva_19 + iva_5 + ipoc_8 + imp_saludable;

  return {
    resolution_number: String(settings.dian_resolucion || ''),
    prefix: settings.dian_prefijo || '',
    document_number: String(numeroFactura),
    graphic_representation: 0,
    send_email: 1,
    operation_type_id: 1,
    type_document_id: 7,       // Factura electrónica de venta
    date: dateStr,
    time: timeStr,
    payments: [{
      payment_method_id: paymentInfo.payment_method_id,
      means_payment_id: paymentInfo.means_payment_id,
      value_paid: parseFloat(total).toFixed(2),
      payment_due_date: dateStr,
    }],
    customer: _buildCustomer(cliente, settings, cliente_identificacion),
    lines: _buildLines(items),
    legal_monetary_totals: {
      line_extension_amount: parseFloat(subtotal).toFixed(2),
      tax_exclusive_amount: parseFloat(subtotal).toFixed(2),
      tax_inclusive_amount: parseFloat(total).toFixed(2),
      payable_amount: parseFloat(total),
      total_allowance: '0.00',
      total_charges: '0.00',
    },
    tax_totals: _buildTaxTotals(ventaData),
  };
}

// ─── Función principal de emisión ─────────────────────────────────────────────

async function emitirFactura(ventaData, cliente, items, settings, numeroFactura) {
  await _loadTaxCatalog();

  const apiKey = process.env.MATIAS_API_KEY;
  if (!apiKey) {
    throw new Error('MATIAS_API_KEY no está configurada en el entorno.');
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

  const data = await res.json();

  // HTTP 200/201 = procesado (puede ser aprobado o con warnings)
  // HTTP 422 = rechazado por DIAN con detalles
  // Otros 4xx/5xx = error inesperado
  if (!res.ok && res.status !== 422) {
    throw new Error(`MATIAS API ${res.status}: ${data.message || JSON.stringify(data)}`);
  }

  return {
    success: data.success === true,
    cufe: data.XmlDocumentKey || null,
    estado_dian: data.response?.StatusCode || null,
    descripcion_dian: data.response?.StatusDescription || null,
    mensaje_dian: data.response?.StatusMessage || null,
    errores_dian: data.response?.ErrorMessage?.string || [],
    xml_url: data.AttachedDocument?.url || null,
    pdf_url: data.pdf?.url || null,
    qr_url: data.qr?.url || null,
    qr_dian_url: data.qr?.qrDian || null,
    raw: data,
  };
}

module.exports = { emitirFactura, buildPayload };
