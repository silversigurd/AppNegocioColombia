/**
 * tenantConfig.cjs
 * Credenciales de Turso PROPIAS de esta instalación (una base por negocio).
 *
 * Se guardan cifradas (AES-256-GCM) en userData/tenant.json, con clave derivada
 * del machineId del equipo + SECRET_SALT. Así:
 *   - No viajan en el repo ni en el instalador genérico.
 *   - Copiar el archivo a otra máquina no sirve (la clave depende del hardware).
 *
 * La URL/token se cargan desde Ajustes → "Conexión Turso" (handler set-turso-config).
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');
const { machineIdSync } = require('node-machine-id');

const SECRET_SALT = 'CommerceOS_Pro_Secret_2026';

function _key() {
  const hwId = machineIdSync({ original: true });
  return crypto.createHash('sha256').update(SECRET_SALT + '::turso::' + hwId).digest(); // 32 bytes
}

function _file() {
  return path.join(app.getPath('userData'), 'tenant.json');
}

/** Devuelve { url, token } o null si no hay config o no se puede descifrar. */
function readTenant() {
  try {
    const raw = fs.readFileSync(_file(), 'utf8');
    const { iv, data, tag } = JSON.parse(raw);
    const decipher = crypto.createDecipheriv('aes-256-gcm', _key(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]);
    const obj = JSON.parse(dec.toString('utf8'));
    if (obj && obj.url && obj.token) return obj;
    return null;
  } catch {
    return null;
  }
}

/** Guarda { url, token } cifrado. Pasar null/objeto vacío borra la config. */
function writeTenant(obj) {
  const file = _file();
  if (!obj || !obj.url || !obj.token) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', _key(), iv);
  const payload = JSON.stringify({ url: obj.url, token: obj.token });
  const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.writeFileSync(file, JSON.stringify({
    iv: iv.toString('hex'),
    data: enc.toString('hex'),
    tag: tag.toString('hex'),
  }), 'utf8');
}

// ── Reset de la réplica local ────────────────────────────────────────────────
// Cambiar de base Turso invalida el archivo de réplica local (tiene metadata del
// remoto anterior). Dejamos una marca que db.cjs procesa en el próximo arranque,
// antes de abrir el cliente (los archivos están bloqueados mientras la app corre).
function _resetFlagFile() {
  return path.join(app.getPath('userData'), '.reset-replica');
}

function markReplicaReset() {
  try { fs.writeFileSync(_resetFlagFile(), new Date().toISOString(), 'utf8'); } catch { /* noop */ }
}

module.exports = { readTenant, writeTenant, tenantFile: _file, markReplicaReset, resetFlagFile: _resetFlagFile };
