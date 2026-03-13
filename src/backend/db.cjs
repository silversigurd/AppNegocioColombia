const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const { app } = require('electron');

// Determinamos la ruta de la base de datos
const isProd = process.mainModule.filename.indexOf('app.asar') !== -1;
let dbPath;

if (!isProd) {
  dbPath = path.join(__dirname, '..', '..', 'commerce_data.sqlite');
} else {
  dbPath = path.join(app.getPath('userData'), 'commerce_data.sqlite');
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos', err.message);
  } else {
    console.log(`Conectado a la base de datos SQLite en: ${dbPath}`);
  }
});

// Helper para ejecutar comandos en secuencia con Promesas
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
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
      direccion TEXT
    )`);

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
      moneda_compra TEXT DEFAULT 'ARS',
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
      "limite_credito REAL DEFAULT 0", "minimo_compra REAL DEFAULT 0", "moneda_compra TEXT DEFAULT 'ARS'",
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

    // 9. DetallesVenta
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

    // Seed Sucursal Principal
    const countSuc = await dbGet('SELECT COUNT(*) as count FROM Sucursales');
    if (countSuc.count === 0) {
      const res = await dbRun(`INSERT INTO Sucursales (nombre, direccion) VALUES ('Sede Principal', 'Dirección por defecto')`);
      const sucursalId = res.lastID;

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
          await dbRun(`INSERT OR IGNORE INTO Inventario (producto_id, sucursal_id, cantidad) VALUES (?, ?, ?)`, [prod.id, sucursalId, 50]);
        }
      }
    }

    // Seed Admin
    const countUser = await dbGet('SELECT COUNT(*) as count FROM Usuarios');
    if (countUser.count === 0) {
      const defaultHash = crypto.createHash('sha256').update('admin').digest('hex');
      await dbRun(`INSERT INTO Usuarios (username, password_hash, rol) VALUES (?, ?, ?)`, ['Principal', defaultHash, 'Admin']);
    }

    console.log("Base de datos inicializada correctamente.");
  } catch (err) {
    console.error("Error inicializando base de datos:", err);
    throw err;
  }
}

// Exportamos una promesa que indica cuando la DB está lista
const dbReady = initDb();

module.exports = { db, dbReady };
