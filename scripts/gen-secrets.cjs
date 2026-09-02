/**
 * gen-secrets.cjs
 * Genera src/backend/secrets.generated.cjs con las credenciales tomadas del
 * ENTORNO DE BUILD (o del .env de la máquina que compila).
 *
 * Se ejecuta automáticamente antes de `electron:dist` / `electron:build`.
 * El archivo generado queda dentro del bundle empaquetado pero NUNCA se commitea
 * (está en .gitignore).
 *
 * En desarrollo NO hace falta correrlo: la app lee el .env de la raíz.
 */
const fs = require('fs');
const path = require('path');

// Si hay un .env en la raíz, lo usamos como fuente además del entorno real.
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
} catch { /* dotenv es devDependency; si no está, seguimos con process.env */ }

// Credenciales COMUNES a todas las instalaciones (modelo "Casa de Software").
// La URL/token puntual de Turso por negocio NO va acá: se configura por
// instalación desde Ajustes y se guarda cifrada en userData (ver tenantConfig.cjs).
const KEYS = [
  'MATIAS_API_KEY',        // requerida — key única del desarrollador ante MATIAS
  'MATIAS_API_URL',        // opcional — default sandbox
  'TURSO_DATABASE_URL',    // opcional — base por defecto (útil para tu propio despliegue / pruebas)
  'TURSO_AUTH_TOKEN',      // opcional — token de esa base por defecto
];

const out = {};
const faltantes = [];
for (const k of KEYS) {
  if (process.env[k]) out[k] = process.env[k];
  else faltantes.push(k);
}

if (!out.MATIAS_API_KEY) {
  console.error('\n[gen-secrets] ❌ Falta MATIAS_API_KEY en el entorno/.env. Build abortado.\n');
  process.exit(1);
}
if (faltantes.length) {
  console.warn(`[gen-secrets] ⚠️  Sin valor (se omiten): ${faltantes.join(', ')}`);
}

const dest = path.join(__dirname, '..', 'src', 'backend', 'secrets.generated.cjs');
const contenido =
  `// ARCHIVO GENERADO por scripts/gen-secrets.cjs — NO EDITAR, NO COMMITEAR.\n` +
  `// Generado: ${new Date().toISOString()}\n` +
  `module.exports = ${JSON.stringify(out, null, 2)};\n`;

fs.writeFileSync(dest, contenido, 'utf8');
console.log(`[gen-secrets] ✅ ${path.relative(path.join(__dirname, '..'), dest)} — claves: ${Object.keys(out).join(', ')}`);
