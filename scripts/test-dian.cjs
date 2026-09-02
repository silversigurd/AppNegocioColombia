/**
 * test-dian.cjs — prueba de punta a punta contra el sandbox de MATIAS API.
 *
 *   node scripts/test-dian.cjs            -> descubrimiento (GET /taxes, /resolutions)
 *                                            + arma el payload y lo imprime (NO envía)
 *   node scripts/test-dian.cjs --send     -> además hace el POST /invoice real
 *
 * Usa MATIAS_API_KEY del .env de la raíz. Los datos de la resolución se toman de
 * scripts/dian-test.local.json si existe (git-ignored), si no de estos defaults.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
try { require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true }); } catch { /* noop */ }

const { buildPayload, emitirFactura } = require(path.join(ROOT, 'src', 'backend', 'dianService.cjs'));

const BASE_URL = process.env.MATIAS_API_URL || 'https://sandbox-api.matias-api.com/api/ubl2.1';
const API_KEY = process.env.MATIAS_API_KEY;
const SEND = process.argv.includes('--send');

const DEFAULTS = {
  // Resolución precargada en el sandbox de MATIAS (GET /resolutions, type_document_id 7)
  dian_resolucion: '18760000001',
  dian_prefijo: 'FEV',
  dian_numero_actual: String(Math.floor(Math.random() * 900) + 50), // rango 1..1000
  dian_ciudad_id: '836',
  dian_email_consumidor: 'pruebas@consumidor.co',
  esResponsableIVA: 'true',
  tieneCafeteria: 'false',
};
let settings = { ...DEFAULTS };
try {
  const local = JSON.parse(fs.readFileSync(path.join(__dirname, 'dian-test.local.json'), 'utf8'));
  settings = { ...settings, ...local };
  console.log('· Config tomada de scripts/dian-test.local.json');
} catch { console.log('· Config: defaults (creá scripts/dian-test.local.json para overridear)'); }

if (!API_KEY) {
  console.error('\n❌ Falta MATIAS_API_KEY en el .env de la raíz.\n');
  process.exit(1);
}

const H = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

async function get(pathname) {
  console.log(`\n──── GET ${pathname} ────`);
  try {
    const res = await fetch(`${BASE_URL}${pathname}`, { headers: H });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    console.log(`HTTP ${res.status}`);
    console.log(typeof body === 'string' ? body.slice(0, 2000) : JSON.stringify(body, null, 2).slice(0, 4000));
    return { status: res.status, body };
  } catch (err) {
    console.log(`ERROR de red: ${err.message}`);
    return null;
  }
}

// Venta de prueba: 2 ítems, IVA 19% y IVA 5%, consumidor final
const ventaData = {
  total: 8500,
  medio_pago: 'EFECTIVO',
  cliente_identificacion: null,
};
const items = [
  { producto_id: 1, nombre: 'Gaseosa 400ml', codigo: 'G400', cantidad: 2, precio_unitario: 3500, subtotal: 7000, tipo_impuesto_co: 'IVA_19', es_producto_saludable: 0 },
  { producto_id: 2, nombre: 'Pan tajado', codigo: 'PAN1', cantidad: 1, precio_unitario: 1500, subtotal: 1500, tipo_impuesto_co: 'IVA_5', es_producto_saludable: 0 },
];

(async () => {
  console.log(`\n=== Prueba DIAN / MATIAS sandbox ===`);
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`API key:  ${API_KEY.slice(0, 12)}… (${API_KEY.length} chars)`);

  // 1. Descubrimiento
  if (process.argv.includes('--discover')) {
    await get('/taxes');
    await get('/resolutions');
    await get('/company');
  }

  // 2. Armar payload con la lógica real del sistema
  const numeroFactura = parseInt(settings.dian_numero_actual, 10);
  const payload = buildPayload(ventaData, null, items, settings, numeroFactura);

  console.log(`\n──── PAYLOAD POST /invoice ────`);
  console.log(JSON.stringify(payload, null, 2));

  // Chequeo de reconciliación
  const sumLines = payload.lines.reduce((a, l) => a + parseFloat(l.line_extension_amount), 0);
  const sumTax = payload.tax_totals.reduce((a, t) => a + t.tax_amount, 0);
  console.log(`\nΣ líneas: ${sumLines.toFixed(2)} · Σ impuestos: ${sumTax.toFixed(2)} · payable: ${payload.legal_monetary_totals.payable_amount}`);

  if (!SEND) {
    console.log(`\n(dry-run — corré con  --send  para emitir de verdad)\n`);
    return;
  }

  // 3. Emitir usando el MISMO código que la app (emitirFactura)
  console.log(`\n──── emitirFactura() → POST /invoice ────`);
  try {
    const resultado = await emitirFactura(ventaData, null, items, settings, numeroFactura);
    console.log(JSON.stringify({ ...resultado, raw: undefined, xml_base64: resultado.xml_base64 ? '(base64 omitido)' : null }, null, 2));
    console.log(`\n${resultado.success ? '✅ AUTORIZADA' : resultado.queued ? '🕒 EN COLA' : '❌ RECHAZADA/ERROR'}` +
      (resultado.cufe ? ` — CUFE ${resultado.cufe}` : ''));
  } catch (err) {
    console.log(`❌ ${err.message}`);
  }
})();
