/**
 * build-cliente.cjs
 * Arma un instalador dedicado para UN cliente, con su propia base de datos Turso
 * horneada adentro. El cliente instala + activa la licencia y ya queda
 * sincronizando con su base — sin pasos técnicos de su lado.
 *
 * Uso:
 *   npm run build:cliente                     -> lista clientes guardados y pregunta
 *   npm run build:cliente -- panaderia-lucia  -> usa (o crea) ese cliente
 *
 * Los datos de cada cliente se guardan en scripts/clientes.local.json
 * (git-ignored) para no re-tipear la URL y el token cada vez.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CLIENTES_FILE = path.join(__dirname, 'clientes.local.json');
const OUT_DIR = path.join(ROOT, 'dist-clientes');
const BUILD_OUT = path.join(ROOT, 'dist-electron');
const GENERATED = path.join(ROOT, 'src', 'backend', 'secrets.generated.cjs');
const pkg = require(path.join(ROOT, 'package.json'));

// ── Lectura de stdin robusta (funciona en terminal y con input redirigido) ──
const rl = readline.createInterface({ input: process.stdin });
const _lines = [];
const _waiters = [];
let _closed = false;
rl.on('line', (l) => {
  if (_waiters.length) _waiters.shift()(l);
  else _lines.push(l);
});
rl.on('close', () => { _closed = true; while (_waiters.length) _waiters.shift()(null); });

function ask(q) {
  process.stdout.write(q);
  return new Promise((res) => {
    if (_lines.length) return res(_lines.shift());
    if (_closed) return res(null);
    _waiters.push(res);
  }).then((v) => (v == null ? '' : String(v).trim()));
}

function fail(msg) {
  console.error(`\n${msg}\n`);
  process.exitCode = 1;
  rl.close();
  throw new Error('__handled__');
}

function loadClientes() {
  try { return JSON.parse(fs.readFileSync(CLIENTES_FILE, 'utf8')); } catch { return {}; }
}
function saveClientes(data) {
  fs.writeFileSync(CLIENTES_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')       // saca tildes/diacríticos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function testTurso(url, token) {
  let createClient;
  try { ({ createClient } = require('@libsql/client')); }
  catch { console.log('  (aviso: @libsql/client no disponible, se omite el test de conexión)'); return true; }
  try {
    const c = createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken: token });
    await c.execute('SELECT 1');
    return true;
  } catch (err) {
    console.log(`  No se pudo conectar a la base: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\n=== Instalador por cliente - CommerceOS Pro Colombia ===\n');

  // MATIAS_API_KEY tiene que estar disponible (viene del .env de la raíz)
  try { require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true }); } catch { /* noop */ }
  if (!process.env.MATIAS_API_KEY) {
    fail('Falta MATIAS_API_KEY en el .env de la raíz. Es comun a todos los clientes.');
  }

  const clientes = loadClientes();
  let slug = process.argv[2] ? slugify(process.argv[2]) : '';

  if (!slug) {
    const nombres = Object.keys(clientes);
    if (nombres.length) {
      console.log('Clientes guardados:');
      nombres.forEach((s) => console.log(`  - ${s}  (${clientes[s].nombre})`));
      console.log('');
    }
    slug = slugify(await ask('Slug del cliente (ej: panaderia-lucia): '));
  }
  if (!slug) fail('Slug vacio. Cancelado.');

  let cli = clientes[slug];
  if (cli) {
    console.log(`\nUsando cliente guardado: ${cli.nombre} (${slug})`);
    const cambiar = (await ask('Actualizar URL/token? [s/N]: ')).toLowerCase();
    if (cambiar === 's' || cambiar === 'si') cli = null;
  }

  if (!cli) {
    const nombre = (await ask('Nombre del negocio: ')) || slug;
    const url = await ask('TURSO_DATABASE_URL (libsql://...): ');
    const token = await ask('TURSO_AUTH_TOKEN: ');
    if (!/^libsql:\/\/|^https:\/\//.test(url) || !token) {
      fail('URL o token invalidos. Cancelado.');
    }
    console.log('\nProbando conexion con Turso...');
    if (!(await testTurso(url, token))) fail('Cancelado.');
    console.log('  Conexion OK');
    cli = { nombre, tursoUrl: url, tursoToken: token };
    clientes[slug] = cli;
    saveClientes(clientes);
    console.log(`  Guardado en ${path.relative(ROOT, CLIENTES_FILE)}`);
  }

  rl.close();

  console.log(`\n> Compilando instalador para "${cli.nombre}" - v${pkg.version}\n`);

  const env = {
    ...process.env,
    TURSO_DATABASE_URL: cli.tursoUrl,
    TURSO_AUTH_TOKEN: cli.tursoToken,
  };

  let buildOk = true;
  try {
    execSync('npm run electron:dist', { cwd: ROOT, stdio: 'inherit', env });
  } catch {
    buildOk = false;
  } finally {
    // No dejar el token del cliente en el arbol de trabajo
    if (fs.existsSync(GENERATED)) fs.rmSync(GENERATED, { force: true });
  }
  if (!buildOk) fail('Fallo el build.');

  // Ubicar el .exe recien generado y copiarlo con el nombre del cliente
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const exe = fs.readdirSync(BUILD_OUT)
    .filter((f) => f.toLowerCase().endsWith('.exe'))
    .map((f) => ({ f, t: fs.statSync(path.join(BUILD_OUT, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];

  if (!exe) fail(`Build OK pero no encontre el .exe en ${path.relative(ROOT, BUILD_OUT)}`);

  const dest = path.join(OUT_DIR, `CommerceOS-Pro_${slug}_v${pkg.version}.exe`);
  fs.copyFileSync(path.join(BUILD_OUT, exe.f), dest);

  console.log('\n----------------------------------------------');
  console.log(`Instalador listo: ${path.relative(ROOT, dest)}`);
  console.log('----------------------------------------------');
  console.log(`\nMandale ESE archivo a ${cli.nombre}. Al instalar:`);
  console.log('  1. Abre la app -> aparece la pantalla de activacion con su Hardware ID.');
  console.log('  2. Te pasa ese ID -> corres  node scripts/generate-key.cjs <id>  -> le devolves la clave.');
  console.log('  3. Activa y ya queda sincronizando con su base Turso.\n');
}

main().catch((e) => {
  if (e && e.message === '__handled__') return;
  console.error(e);
  process.exitCode = 1;
});
