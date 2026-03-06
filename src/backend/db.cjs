const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const { app } = require('electron');

// Determinamos la ruta de la base de datos
// Si estamos en producción (empaquetado), intentamos ponerla junto al ejecutable o en userData
// Para máxima "portabilidad", usaremos una subcarpeta en la ruta del app o userData.
const isProd = process.mainModule.filename.indexOf('app.asar') !== -1;
let dbPath;

if (!isProd) {
  // Desarrollo
  dbPath = path.join(__dirname, '..', '..', 'commerce_data.sqlite');
} else {
  // Producción: Lo ponemos en la carpeta de datos de usuario para asegurar permisos de escritura
  // Pero permitimos que sea portable si el usuario mueve la carpeta (se puede ajustar luego)
  dbPath = path.join(app.getPath('userData'), 'commerce_data.sqlite');
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos', err.message);
  } else {
    console.log(`Conectado a la base de datos SQLite en: ${dbPath}`);
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    // 1. Sucursales
    db.run(`CREATE TABLE IF NOT EXISTS Sucursales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      direccion TEXT,
      telefono TEXT
    )`);

    // 2. Empleados
    db.run(`CREATE TABLE IF NOT EXISTS Empleados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      cargo TEXT,
      tarifa_hora REAL,
      sucursal_id INTEGER,
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id)
    )`);

    // 3. Clientes
    db.run(`CREATE TABLE IF NOT EXISTS Clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      direccion TEXT
    )`);

    // 4. Proveedores
    db.run(`CREATE TABLE IF NOT EXISTS Proveedores (
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
      saldo_actual REAL DEFAULT 0
    )`, (err) => {
      if (!err) {
        const nuevasColumnas = [
          "ALTER TABLE Proveedores ADD COLUMN nombre_fantasia TEXT",
          "ALTER TABLE Proveedores ADD COLUMN cuit TEXT",
          "ALTER TABLE Proveedores ADD COLUMN condicion_iva TEXT",
          "ALTER TABLE Proveedores ADD COLUMN condicion_iibb TEXT",
          "ALTER TABLE Proveedores ADD COLUMN direccion TEXT",
          "ALTER TABLE Proveedores ADD COLUMN email_compras TEXT",
          "ALTER TABLE Proveedores ADD COLUMN email_pagos TEXT",
          "ALTER TABLE Proveedores ADD COLUMN plazo_pago INTEGER DEFAULT 0",
          "ALTER TABLE Proveedores ADD COLUMN cbu TEXT",
          "ALTER TABLE Proveedores ADD COLUMN rubro TEXT",
          "ALTER TABLE Proveedores ADD COLUMN saldo_actual REAL DEFAULT 0"
        ];
        nuevasColumnas.forEach(col => db.run(col, () => { })); // Ignore duplicate errors
      }
    });

    // 5. Categorias
    db.run(`CREATE TABLE IF NOT EXISTS Categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL
    )`);

    // 6. Productos
    db.run(`CREATE TABLE IF NOT EXISTS Productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio_compra REAL NOT NULL,
      precio_venta REAL NOT NULL,
      impuesto_porcentaje REAL DEFAULT 0,
      categoria_id INTEGER,
      proveedor_id INTEGER,
      FOREIGN KEY(categoria_id) REFERENCES Categorias(id),
      FOREIGN KEY(proveedor_id) REFERENCES Proveedores(id)
    )`);

    // 7. InventarioPorSucursal (Relación Muchos a Muchos con Stock)
    db.run(`CREATE TABLE IF NOT EXISTS Inventario (
      producto_id INTEGER,
      sucursal_id INTEGER,
      cantidad INTEGER DEFAULT 0,
      stock_minimo INTEGER DEFAULT 5,
      PRIMARY KEY (producto_id, sucursal_id),
      FOREIGN KEY(producto_id) REFERENCES Productos(id),
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id)
    )`);

    // 8. Ventas (Comprobantes)
    db.run(`CREATE TABLE IF NOT EXISTS Ventas (
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

    // 9. DetallesVenta
    db.run(`CREATE TABLE IF NOT EXISTS DetallesVenta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY(venta_id) REFERENCES Ventas(id),
      FOREIGN KEY(producto_id) REFERENCES Productos(id)
    )`);

    // 10. MovimientosCaja (Ingresos y Egresos / Pagos y Cobros)
    db.run(`CREATE TABLE IF NOT EXISTS MovimientosCaja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      tipo TEXT CHECK(tipo IN ('INGRESO', 'EGRESO')) NOT NULL,
      monto REAL NOT NULL,
      concepto TEXT NOT NULL,
      sucursal_id INTEGER NOT NULL,
      venta_id INTEGER,
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id),
      FOREIGN KEY(venta_id) REFERENCES Ventas(id)
    )`);

    // Insertar Sucursal Principal por defecto si no existe
    db.get('SELECT COUNT(*) as count FROM Sucursales', (err, row) => {
      if (row && row.count === 0) {
        db.run(`INSERT INTO Sucursales (nombre, direccion) VALUES ('Sede Principal', 'Dirección por defecto')`, function (err) {
          if (!err) {
            const sucursalId = this.lastID;
            // Seed products requested by user
            const seedProducts = [
              { codigo: '23232323', nombre: 'Galletitas Don Satur', precio_compra: 500, precio_venta: 750 },
              { codigo: '35353535', nombre: 'Milanesa de carne', precio_compra: 6000, precio_venta: 8000 },
              { codigo: '98989898', nombre: 'Chipa', precio_compra: 3500, precio_venta: 5000 }
            ];

            seedProducts.forEach(p => {
              db.run(`INSERT OR IGNORE INTO Productos (codigo, nombre, precio_compra, precio_venta) VALUES (?, ?, ?, ?)`,
                [p.codigo, p.nombre, p.precio_compra, p.precio_venta], function (err) {
                  if (!err) {
                    const productoId = this.lastID;
                    if (productoId) {
                      db.run(`INSERT OR IGNORE INTO Inventario (producto_id, sucursal_id, cantidad) VALUES (?, ?, ?)`, [productoId, sucursalId, 50]);
                    } else {
                      // If already exists, still ensure inventory exists
                      db.get('SELECT id FROM Productos WHERE codigo = ?', [p.codigo], (err, row) => {
                        if (row) db.run(`INSERT OR IGNORE INTO Inventario (producto_id, sucursal_id, cantidad) VALUES (?, ?, ?)`, [row.id, sucursalId, 50]);
                      });
                    }
                  }
                });
            });
          }
        });
      } else {
        // Even if sucursal exists, ensure these specific products are there
        const seedProducts = [
          { codigo: '23232323', nombre: 'Galletitas Don Satur', precio_compra: 500, precio_venta: 750 },
          { codigo: '35353535', nombre: 'Milanesa de carne', precio_compra: 6000, precio_venta: 8000 },
          { codigo: '98989898', nombre: 'Chipa', precio_compra: 3500, precio_venta: 5000 }
        ];
        seedProducts.forEach(p => {
          db.run(`INSERT OR IGNORE INTO Productos (codigo, nombre, precio_compra, precio_venta) VALUES (?, ?, ?, ?)`,
            [p.codigo, p.nombre, p.precio_compra, p.precio_venta], function (err) {
              db.get('SELECT id FROM Productos WHERE codigo = ?', [p.codigo], (err, row) => {
                if (row) db.run(`INSERT OR IGNORE INTO Inventario (producto_id, sucursal_id, cantidad) VALUES (?, ?, ?)`, [row.id, 1, 50]);
              });
            });
        });
      }
    });
  });
}

module.exports = db;
