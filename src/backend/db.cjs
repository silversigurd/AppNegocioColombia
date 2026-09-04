const { createClient } = require('@libsql/client');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { app } = require('electron');
const { secret } = require('./secrets.cjs');

const isProd = process.mainModule.filename.indexOf('app.asar') !== -1;
const dbPath = isProd
  ? path.join(app.getPath('userData'), 'commerce_data_local.db')
  : path.join(__dirname, '..', '..', 'commerce_data_local.db');

// ── Resolución de credenciales Turso ─────────────────────────────────────────
// Prioridad: base propia de esta instalación (userData, cifrada)  →  base por
// defecto horneada en el build / .env.  Si no hay ninguna, la app corre 100%
// local sin sincronización (no bloquea nada).
let tursoUrl;
let tursoToken;
try {
  const { readTenant, resetFlagFile } = require('./tenantConfig.cjs');

  // Si se cambió de base TAl urso, descartar la réplica local vieja antes de abrir
  // el cliente (metadata del remoto anterior rompería el sync).
  try {
    const flag = resetFlagFile();
    if (fs.existsSync(flag)) {
      for (const suf of ['', '-shm', '-wal', '-info', '-client_wal_index']) {
        const f = dbPath + suf;
        if (fs.existsSync(f)) fs.rmSync(f, { force: true });
      }
      fs.rmSync(flag, { force: true });
      console.log('[DB] Réplica local descartada por cambio de base Turso.');
    }
  } catch (err) {
    console.warn('[DB] No se pudo descartar la réplica local:', err.message);
  }

  const t = readTenant();
  if (t) { tursoUrl = t.url; tursoToken = t.token; }
} catch (err) {
  console.warn('[DB] No se pudo leer la config Turso de la instalación:', err.message);
}
tursoUrl = tursoUrl || secret('TURSO_DATABASE_URL');
tursoToken = tursoToken || secret('TURSO_AUTH_TOKEN');

const syncEnabled = Boolean(tursoUrl && tursoToken);

// Archivos auxiliares que libSQL crea junto al .db (WAL, metadata de la réplica…)
const REPLICA_SUFFIXES = ['-shm', '-wal', '-info', '-client_wal_index', '-journal'];

// Aparta la réplica local corrupta/incompatible para volver a bajarla limpia de
// Turso. Se renombra (no se borra) el .db principal por si hubiera datos que
// nunca llegaron a sincronizar; los auxiliares sí se eliminan.
function _apartarReplicaLocal(motivo) {
  try {
    if (fs.existsSync(dbPath)) {
      const bak = `${dbPath}.corrupta-${Date.now()}`;
      fs.renameSync(dbPath, bak);
      console.warn(`[DB] Réplica local apartada (${motivo}). Copia: ${path.basename(bak)}`);
    }
  } catch (err) {
    console.error('[DB] No se pudo apartar el .db principal:', err.message);
  }
  for (const suf of REPLICA_SUFFIXES) {
    try { fs.rmSync(dbPath + suf, { force: true }); } catch { /* noop */ }
  }
}

// Embedded replica: escribe/lee local (rápido, funciona offline) y sincroniza
// en background con Turso cuando hay internet y credenciales.
const clientOpts = { url: `file:${dbPath}`, syncInterval: 60 };
if (syncEnabled) {
  clientOpts.syncUrl = tursoUrl;
  clientOpts.authToken = tursoToken;
}

// libSQL abre el archivo de forma ansiosa dentro de createClient(). Si la réplica
// local quedó en un estado incompatible (típico al pasar de "sin sync" a "con
// sync", o tras un cierre sucio: "invalid local state: db file exists but
// metadata file does not"), la apartamos y reintentamos una vez con réplica
// nueva — Turso es la fuente de verdad, se vuelve a bajar entera.
function _abrirCliente() {
  try {
    return createClient(clientOpts);
  } catch (err) {
    const msg = String(err && err.message || err);
    const recuperable = syncEnabled && /invalid local state|metadata file does not|not a database|file is (not|encrypted)/i.test(msg);
    if (!recuperable) throw err;
    console.error('[DB] Error abriendo la réplica local:', msg);
    _apartarReplicaLocal('estado local inválido');
    return createClient(clientOpts); // segundo intento; si falla, que reviente
  }
}

const db = _abrirCliente();

if (syncEnabled) {
  // Sincronización inicial al arrancar (trae cambios pendientes de la nube)
  db.sync().catch((err) => console.error('Error en sync inicial:', err));
} else {
  console.warn('[DB] Sin credenciales de Turso — modo local sin sincronización en la nube.');
}

// Helpers — la API de libSQL ya es async/await nativo
async function dbRun(sql, params = []) {
  return db.execute({ sql, args: params });
}

async function dbGet(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows[0];
}

async function dbAll(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows;
}

async function initDb() {
  console.log("Iniciando inicialización de base de datos...");

  try {
    // 1. Sucursales
    await dbRun(`CREATE TABLE IF NOT EXISTS Sucursales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      direccion TEXT,
      telefono TEXT
    )`);

    // 2. Empleados
    await dbRun(`CREATE TABLE IF NOT EXISTS Empleados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      cargo TEXT,
      tarifa_hora REAL,
      sucursal_id INTEGER,
      dni TEXT,
      cuil TEXT,
      direccion TEXT,
      partido TEXT,
      localidad TEXT,
      obra_social TEXT,
      fecha_ingreso TEXT,
      categoria_cct TEXT,
      sueldo_basico REAL,
      jornada_laboral TEXT,
      horas_parcial INTEGER DEFAULT 0,
      contrato_filepath TEXT,
      modalidad_contratacion TEXT DEFAULT 'Formal',
      estado TEXT DEFAULT 'Activo',
      fecha_egreso TEXT,
      causal_egreso TEXT,
      telefono TEXT,
      indemnizacion_json TEXT,
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id)
    )`);

    const empleadosMig = [
      "dni TEXT", "cuil TEXT", "direccion TEXT", "partido TEXT", "localidad TEXT",
      "obra_social TEXT", "fecha_ingreso TEXT", "categoria_cct TEXT", "sueldo_basico REAL",
      "jornada_laboral TEXT", "horas_parcial INTEGER DEFAULT 0", "contrato_filepath TEXT",
      "modalidad_contratacion TEXT DEFAULT 'Formal'", "estado TEXT DEFAULT 'Activo'",
      "fecha_egreso TEXT", "causal_egreso TEXT", "telefono TEXT", "indemnizacion_json TEXT",
      "ajustes_proximos_json TEXT"
    ];
    for (const col of empleadosMig) {
      await dbRun(`ALTER TABLE Empleados ADD COLUMN ${col}`).catch(() => { });
    }

    await dbRun(`UPDATE Empleados SET estado = 'Activo' WHERE estado IS NULL`);
    await dbRun(`UPDATE Empleados SET modalidad_contratacion = 'Formal' WHERE modalidad_contratacion IS NULL`);

    // 2.1 Liquidaciones
    await dbRun(`CREATE TABLE IF NOT EXISTS Liquidaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empleado_id INTEGER NOT NULL,
      periodo TEXT NOT NULL,
      fecha_pago TEXT,
      banco_deposito TEXT,
      total_bruto REAL DEFAULT 0,
      total_retenciones REAL DEFAULT 0,
      total_neto REAL DEFAULT 0,
      FOREIGN KEY(empleado_id) REFERENCES Empleados(id)
    )`);

    // 2.2 ConceptosLiquidacion
    await dbRun(`CREATE TABLE IF NOT EXISTS ConceptosLiquidacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      liquidacion_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      unidad TEXT,
      importe REAL NOT NULL,
      FOREIGN KEY(liquidacion_id) REFERENCES Liquidaciones(id) ON DELETE CASCADE
    )`);

    // 3. Clientes
    await dbRun(`CREATE TABLE IF NOT EXISTS Clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      nit_cedula TEXT,
      eps TEXT,
      fondo_pensiones TEXT,
      arl TEXT,
      autoriza_datos INTEGER DEFAULT 0,
      fecha_autorizacion TEXT,
      datos_suprimidos INTEGER DEFAULT 0
    )`);

    const clientMig = ["eps TEXT", "fondo_pensiones TEXT", "arl TEXT"];
    for (const col of clientMig) {
      await dbRun(`ALTER TABLE Clientes ADD COLUMN ${col}`).catch(() => { });
    }

    // 4. Proveedores
    await dbRun(`CREATE TABLE IF NOT EXISTS Proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      contacto TEXT,
      telefono TEXT,
      nombre_fantasia TEXT,
      cuit TEXT,
      condicion_iva TEXT,
      condicion_iibb TEXT,
      direccion TEXT,
      email_compras TEXT,
      email_pagos TEXT,
      plazo_pago INTEGER DEFAULT 0,
      cbu TEXT,
      rubro TEXT,
      saldo_actual REAL DEFAULT 0,
      preventista_nombre TEXT,
      preventista_telefono TEXT,
      dia_visita TEXT,
      dia_entrega TEXT,
      limite_credito REAL DEFAULT 0,
      minimo_compra REAL DEFAULT 0,
      moneda_compra TEXT DEFAULT 'COP',
      retencion_ganancias REAL DEFAULT 0,
      retencion_iibb REAL DEFAULT 0,
      vencimiento_certificado_exencion TEXT,
      saldo_envases INTEGER DEFAULT 0
    )`);

    const provMig = [
      "nombre_fantasia TEXT", "cuit TEXT", "condicion_iva TEXT", "condicion_iibb TEXT",
      "direccion TEXT", "email_compras TEXT", "email_pagos TEXT", "plazo_pago INTEGER DEFAULT 0",
      "cbu TEXT", "rubro TEXT", "saldo_actual REAL DEFAULT 0", "preventista_nombre TEXT",
      "preventista_telefono TEXT", "dia_visita TEXT", "dia_entrega TEXT",
      "limite_credito REAL DEFAULT 0", "minimo_compra REAL DEFAULT 0", "moneda_compra TEXT DEFAULT 'COP'",
      "retencion_ganancias REAL DEFAULT 0", "retencion_iibb REAL DEFAULT 0",
      "vencimiento_certificado_exencion TEXT", "saldo_envases INTEGER DEFAULT 0"
    ];
    for (const col of provMig) {
      await dbRun(`ALTER TABLE Proveedores ADD COLUMN ${col}`).catch(() => { });
    }

    // 5. Categorias
    await dbRun(`CREATE TABLE IF NOT EXISTS Categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL
    )`);

    // 6. Productos
    await dbRun(`CREATE TABLE IF NOT EXISTS Productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio_compra REAL NOT NULL,
      precio_venta REAL NOT NULL,
      impuesto_porcentaje REAL DEFAULT 0,
      categoria_id INTEGER,
      proveedor_id INTEGER,
      FOREIGN KEY(categoria_id) REFERENCES Categorias(id) ON DELETE SET NULL,
      FOREIGN KEY(proveedor_id) REFERENCES Proveedores(id) ON DELETE SET NULL
    )`);
    await dbRun(`ALTER TABLE Productos ADD COLUMN iva_alicuota REAL DEFAULT 21`).catch(() => { });
    await dbRun(`ALTER TABLE Productos ADD COLUMN tasa_internos REAL DEFAULT 0`).catch(() => { });
    await dbRun(`UPDATE Productos SET iva_alicuota = 21 WHERE iva_alicuota IS NULL`);
    await dbRun(`ALTER TABLE Productos ADD COLUMN tipo_impuesto_co TEXT DEFAULT 'IVA_19'`).catch(() => { });
    await dbRun(`ALTER TABLE Productos ADD COLUMN es_producto_saludable INTEGER DEFAULT 0`).catch(() => { });
    await dbRun(`ALTER TABLE Productos ADD COLUMN activo INTEGER DEFAULT 1`).catch(() => { });
    await dbRun(`UPDATE Productos SET activo = 1 WHERE activo IS NULL`);

    // 7. Inventario
    await dbRun(`CREATE TABLE IF NOT EXISTS Inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      sucursal_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 0,
      minimo_stock INTEGER DEFAULT 0,
      FOREIGN KEY(producto_id) REFERENCES Productos(id) ON DELETE CASCADE,
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id) ON DELETE CASCADE,
      UNIQUE(producto_id, sucursal_id)
    )`);

    // 8. Configuracion
    await dbRun(`CREATE TABLE IF NOT EXISTS Configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )`);

    const countrySet = await dbGet('SELECT valor FROM Configuracion WHERE clave = ?', ['pais']);
    if (!countrySet) {
      await dbRun('INSERT INTO Configuracion (clave, valor) VALUES (?, ?)', ['pais', 'Colombia']);
    }

    // Empleados — campos Colombia 2026
    const colombiaEmpFields = [
      "cedula_ciudadania TEXT", "documento_extranjeria TEXT", "rut TEXT",
      "eps TEXT", "fondo_pensiones TEXT", "arl TEXT",
      "vacunacion_rabia BOOLEAN DEFAULT 0", "matricula_profesional TEXT"
    ];
    for (const col of colombiaEmpFields) {
      await dbRun(`ALTER TABLE Empleados ADD COLUMN ${col}`).catch(() => { });
    }

    // Proveedores — campos Colombia 2026
    const colombiaProvFields = [
      "nit TEXT", "responsable_iva BOOLEAN DEFAULT 1",
      "responsabilidad_tributaria TEXT DEFAULT 'R-99-PN'",
      "codigo_postal TEXT", "email_facturacion TEXT", "codigo_ciiu TEXT"
    ];
    for (const col of colombiaProvFields) {
      await dbRun(`ALTER TABLE Proveedores ADD COLUMN ${col}`).catch(() => { });
    }

    // Productos — campos Colombia 2026
    const colombiaProdFields = ["registro_ica TEXT", "lote TEXT", "fecha_vencimiento TEXT"];
    for (const col of colombiaProdFields) {
      await dbRun(`ALTER TABLE Productos ADD COLUMN ${col}`).catch(() => { });
    }

    // 8.5 Usuarios
    await dbRun(`CREATE TABLE IF NOT EXISTS Usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol TEXT CHECK(rol IN ('Admin', 'Empleado')) NOT NULL,
      empleado_id INTEGER,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(empleado_id) REFERENCES Empleados(id) ON DELETE SET NULL
    )`);
    await dbRun(`ALTER TABLE Usuarios ADD COLUMN nombre_propietario TEXT`).catch(() => { });
    await dbRun(`ALTER TABLE Usuarios ADD COLUMN empleado_id INTEGER REFERENCES Empleados(id) ON DELETE SET NULL`).catch(() => { });

    // 9. Ventas
    await dbRun(`CREATE TABLE IF NOT EXISTS Ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      total REAL NOT NULL,
      subtotal REAL NOT NULL,
      impuestos REAL NOT NULL,
      cliente_id INTEGER,
      sucursal_id INTEGER NOT NULL,
      empleado_id INTEGER,
      FOREIGN KEY(cliente_id) REFERENCES Clientes(id),
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id),
      FOREIGN KEY(empleado_id) REFERENCES Empleados(id)
    )`);
    await dbRun(`ALTER TABLE Ventas ADD COLUMN impuestos_internos REAL DEFAULT 0`).catch(() => { });
    await dbRun(`ALTER TABLE Ventas ADD COLUMN cliente_identificacion TEXT`).catch(() => { });
    await dbRun(`ALTER TABLE Ventas ADD COLUMN regimen_transparencia BOOLEAN DEFAULT 0`).catch(() => { });
    await dbRun(`ALTER TABLE Ventas ADD COLUMN cude_local TEXT`).catch(() => { });
    await dbRun(`ALTER TABLE Ventas ADD COLUMN medio_pago TEXT DEFAULT 'EFECTIVO'`).catch(() => { });
    await dbRun(`ALTER TABLE Ventas ADD COLUMN es_b2b INTEGER DEFAULT 0`).catch(() => { });
    await dbRun(`ALTER TABLE Ventas ADD COLUMN iva_19 REAL DEFAULT 0`).catch(() => { });
    await dbRun(`ALTER TABLE Ventas ADD COLUMN iva_5 REAL DEFAULT 0`).catch(() => { });
    await dbRun(`ALTER TABLE Ventas ADD COLUMN ipoc REAL DEFAULT 0`).catch(() => { });
    await dbRun(`ALTER TABLE Ventas ADD COLUMN imp_saludable REAL DEFAULT 0`).catch(() => { });

    // 9.1 DetallesVenta
    await dbRun(`CREATE TABLE IF NOT EXISTS DetallesVenta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY(venta_id) REFERENCES Ventas(id),
      FOREIGN KEY(producto_id) REFERENCES Productos(id)
    )`);

    // 10. MovimientosCaja
    await dbRun(`CREATE TABLE IF NOT EXISTS MovimientosCaja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      tipo TEXT CHECK(tipo IN ('INGRESO', 'EGRESO')) NOT NULL,
      monto REAL NOT NULL,
      concepto TEXT NOT NULL,
      sucursal_id INTEGER NOT NULL,
      venta_id INTEGER,
      pedido_id INTEGER,
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id),
      FOREIGN KEY(venta_id) REFERENCES Ventas(id)
    )`);
    await dbRun(`ALTER TABLE MovimientosCaja ADD COLUMN pedido_id INTEGER`).catch(() => { });

    // 11. Pedidos
    await dbRun(`CREATE TABLE IF NOT EXISTS Pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER NOT NULL,
      sucursal_id INTEGER NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      estado TEXT DEFAULT 'PENDIENTE',
      total REAL NOT NULL,
      pagado BOOLEAN DEFAULT 0,
      FOREIGN KEY(proveedor_id) REFERENCES Proveedores(id),
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id)
    )`);
    await dbRun(`ALTER TABLE Pedidos ADD COLUMN percepciones_recibidas REAL DEFAULT 0`).catch(() => { });
    await dbRun(`ALTER TABLE Pedidos ADD COLUMN retenciones_aplicadas REAL DEFAULT 0`).catch(() => { });

    const colombiaPedidosFields = [
      "cufe TEXT", "fecha_emision_fe TEXT",
      "evento_acuse_recibo BOOLEAN DEFAULT 0",
      "evento_recibo_bienes BOOLEAN DEFAULT 0",
      "evento_aceptacion_expresa BOOLEAN DEFAULT 0"
    ];
    for (const col of colombiaPedidosFields) {
      await dbRun(`ALTER TABLE Pedidos ADD COLUMN ${col}`).catch(() => { });
    }

    // 12. DetallesPedido
    await dbRun(`CREATE TABLE IF NOT EXISTS DetallesPedido (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      precio_compra_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY(pedido_id) REFERENCES Pedidos(id),
      FOREIGN KEY(producto_id) REFERENCES Productos(id)
    )`);

    // 13. FacturasElectronicas — registro DIAN por venta
    await dbRun(`CREATE TABLE IF NOT EXISTS FacturasElectronicas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL UNIQUE,
      numero_factura INTEGER,
      cufe TEXT,
      estado TEXT DEFAULT 'PENDIENTE',
      estado_dian TEXT,
      descripcion_dian TEXT,
      error_mensaje TEXT,
      xml_url TEXT,
      pdf_url TEXT,
      qr_url TEXT,
      qr_dian_url TEXT,
      fecha_emision DATETIME DEFAULT CURRENT_TIMESTAMP,
      intentos INTEGER DEFAULT 0,
      FOREIGN KEY(venta_id) REFERENCES Ventas(id)
    )`);
    await dbRun(`ALTER TABLE FacturasElectronicas ADD COLUMN qr_base64 TEXT`).catch(() => { });
    // Marca de tiempo del último intento de emisión — la usa el job de reintento
    // automático para espaciar los reintentos (backoff exponencial).
    await dbRun(`ALTER TABLE FacturasElectronicas ADD COLUMN ultimo_intento DATETIME`).catch(() => { });

    // 13.b NotasCredito — anulación / devolución de una venta ya facturada ante la DIAN
    await dbRun(`CREATE TABLE IF NOT EXISTS NotasCredito (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL UNIQUE,
      factura_venta_id INTEGER,
      numero_nc INTEGER,
      prefijo_nc TEXT,
      concepto INTEGER DEFAULT 2,
      motivo TEXT,
      monto REAL DEFAULT 0,
      cufe_factura_ref TEXT,
      cufe TEXT,
      estado TEXT DEFAULT 'PENDIENTE',
      estado_dian TEXT,
      descripcion_dian TEXT,
      error_mensaje TEXT,
      xml_url TEXT,
      pdf_url TEXT,
      qr_url TEXT,
      qr_dian_url TEXT,
      qr_base64 TEXT,
      intentos INTEGER DEFAULT 0,
      ultimo_intento DATETIME,
      fecha_emision DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(venta_id) REFERENCES Ventas(id)
    )`);
    // Marca en la venta que fue anulada por una nota crédito (para el POS/Finanzas)
    await dbRun(`ALTER TABLE Ventas ADD COLUMN anulada INTEGER DEFAULT 0`).catch(() => { });

    // Seed Sucursal Principal
    const countSuc = await dbGet('SELECT COUNT(*) as count FROM Sucursales');
    if (countSuc.count === 0) {
      const res = await dbRun(`INSERT INTO Sucursales (nombre, direccion) VALUES ('Sede Principal', 'Dirección por defecto')`);
      const sucursalId = Number(res.lastInsertRowid);

      const seedProducts = [
        { codigo: '23232323', nombre: 'Galletitas Don Satur', precio_compra: 500, precio_venta: 750 },
        { codigo: '35353535', nombre: 'Milanesa de carne', precio_compra: 6000, precio_venta: 8000 },
        { codigo: '98989898', nombre: 'Chipa', precio_compra: 3500, precio_venta: 5000 }
      ];

      for (const p of seedProducts) {
        await dbRun(`INSERT OR IGNORE INTO Productos (codigo, nombre, precio_compra, precio_venta) VALUES (?, ?, ?, ?)`,
          [p.codigo, p.nombre, p.precio_compra, p.precio_venta]);
        const prod = await dbGet('SELECT id FROM Productos WHERE codigo = ?', [p.codigo]);
        if (prod) {
          await dbRun(`INSERT OR IGNORE INTO Inventario (producto_id, sucursal_id, cantidad) VALUES (?, ?, ?)`,
            [prod.id, sucursalId, 50]);
        }
      }
    }

    // Seed Admin
    const countUser = await dbGet('SELECT COUNT(*) as count FROM Usuarios');
    if (countUser.count === 0) {
      const defaultHash = crypto.createHash('sha256').update('admin').digest('hex');
      await dbRun(`INSERT INTO Usuarios (username, password_hash, rol) VALUES (?, ?, ?)`,
        ['Principal', defaultHash, 'Admin']);
    }

    console.log("Base de datos inicializada correctamente.");
  } catch (err) {
    console.error("Error inicializando base de datos:", err);
    throw err;
  }
}

const dbReady = initDb();

module.exports = { db, dbReady, dbPath, dbRun, dbGet, dbAll, syncEnabled, tursoUrl };
