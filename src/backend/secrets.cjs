/**
 * secrets.cjs
 * Acceso centralizado a credenciales, con dos fuentes según el modo:
 *
 *   - Desarrollo:  .env en la raíz del proyecto (cargado con dotenv).
 *   - Producción:  src/backend/secrets.generated.cjs, horneado en el build por
 *                  scripts/gen-secrets.cjs (git-ignored, va dentro del asar).
 *
 * Además hidrata process.env con lo que venga del archivo generado, para que
 * cualquier `process.env.X` existente en el resto del código siga funcionando
 * en producción sin cambios.
 */
const path = require('path');
const fs = require('fs');

// 1. Cargar .env de la raíz si existe (desarrollo). No pisa vars ya definidas.
try {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath, quiet: true });
  }
} catch { /* dotenv no disponible (build empaquetado sin devDeps): ok */ }

// 2. Cargar el archivo generado en build (producción).
let generated = {};
try {
  generated = require('./secrets.generated.cjs') || {};
} catch { /* no existe en desarrollo: ok */ }

// 3. Hidratar process.env con lo generado (sin pisar lo que ya haya).
for (const [k, v] of Object.entries(generated)) {
  if (process.env[k] === undefined || process.env[k] === '') {
    process.env[k] = v;
  }
}

/**
 * Devuelve el valor de una credencial: primero el entorno real, después el
 * archivo generado, y por último el fallback opcional.
 */
function secret(name, fallback = undefined) {
  const fromEnv = process.env[name];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  if (generated[name] !== undefined && generated[name] !== '') return generated[name];
  return fallback;
}

module.exports = { secret };
