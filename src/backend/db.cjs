const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
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
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id)
    )`);

    // Ensure all optional columns exist (safe to run every startup; SQLite ignores duplicate column errors)
    const empleadosMigrations = [
      "ALTER TABLE Empleados ADD COLUMN dni TEXT",
      "ALTER TABLE Empleados ADD COLUMN cuil TEXT",
      "ALTER TABLE Empleados ADD COLUMN direccion TEXT",
      "ALTER TABLE Empleados ADD COLUMN partido TEXT",
      "ALTER TABLE Empleados ADD COLUMN localidad TEXT",
      "ALTER TABLE Empleados ADD COLUMN obra_social TEXT",
      "ALTER TABLE Empleados ADD COLUMN fecha_ingreso TEXT",
      "ALTER TABLE Empleados ADD COLUMN categoria_cct TEXT",
      "ALTER TABLE Empleados ADD COLUMN sueldo_basico REAL",
      "ALTER TABLE Empleados ADD COLUMN jornada_laboral TEXT",
      "ALTER TABLE Empleados ADD COLUMN horas_parcial INTEGER DEFAULT 0",
      "ALTER TABLE Empleados ADD COLUMN contrato_filepath TEXT",
      "ALTER TABLE Empleados ADD COLUMN modalidad_contratacion TEXT DEFAULT 'Formal'",
      "ALTER TABLE Empleados ADD COLUMN estado TEXT DEFAULT 'Activo'",
      "ALTER TABLE Empleados ADD COLUMN fecha_egreso TEXT",
      "ALTER TABLE Empleados ADD COLUMN causal_egreso TEXT"
    ];
    empleadosMigrations.forEach(cmd => {
      db.run(cmd, (innerErr) => {
        if (innerErr && !innerErr.message.includes('duplicate column name')) {
          console.error(`Error en migracion Empleados: ${cmd}`, innerErr.message);
        }
      });
    });

    // Back-fill: set estado = 'Activo' for any existing rows that have NULL estado
    db.run(`UPDATE Empleados SET estado = 'Activo' WHERE estado IS NULL`);
    db.run(`UPDATE Empleados SET modalidad_contratacion = 'Formal' WHERE modalidad_contratacion IS NULL`);

    // 2.1 Liquidaciones (Recibos de Sueldo)
    db.run(`CREATE TABLE IF NOT EXISTS Liquidaciones (
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

    // 2.2 Conceptos Liquidacion (Detalle del Recibo)
    db.run(`CREATE TABLE IF NOT EXISTS ConceptosLiquidacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      liquidacion_id INTEGER NOT NULL,
      tipo TEXT NOT NULL, 
      descripcion TEXT NOT NULL,
      unidad TEXT,
      importe REAL NOT NULL,
      FOREIGN KEY(liquidacion_id) REFERENCES Liquidaciones(id) ON DELETE CASCADE
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
          "ALTER TABLE Proveedores ADD COLUMN saldo_actual REAL DEFAULT 0",
          "ALTER TABLE Proveedores ADD COLUMN preventista_nombre TEXT",
          "ALTER TABLE Proveedores ADD COLUMN preventista_telefono TEXT",
          "ALTER TABLE Proveedores ADD COLUMN dia_visita TEXT",
          "ALTER TABLE Proveedores ADD COLUMN dia_entrega TEXT",
          "ALTER TABLE Proveedores ADD COLUMN limite_credito REAL DEFAULT 0",
          "ALTER TABLE Proveedores ADD COLUMN minimo_compra REAL DEFAULT 0",
          "ALTER TABLE Proveedores ADD COLUMN moneda_compra TEXT DEFAULT 'ARS'",
          "ALTER TABLE Proveedores ADD COLUMN retencion_ganancias REAL DEFAULT 0",
          "ALTER TABLE Proveedores ADD COLUMN retencion_iibb REAL DEFAULT 0",
          "ALTER TABLE Proveedores ADD COLUMN vencimiento_certificado_exencion TEXT",
          "ALTER TABLE Proveedores ADD COLUMN saldo_envases INTEGER DEFAULT 0"
        ];
        nuevasColumnas.forEach(cmd => {
          db.run(cmd, (innerErr) => {
            // Ignoramos el error si la columna ya existe
            if (innerErr && !innerErr.message.includes('duplicate column name')) {
              console.error(`Error al añadir columna a Proveedores: ${cmd}`, innerErr.message);
            }
          });
        });
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
      FOREIGN KEY(categoria_id) REFERENCES Categorias(id) ON DELETE SET NULL,
      FOREIGN KEY(proveedor_id) REFERENCES Proveedores(id) ON DELETE SET NULL
    )`);

    // 7. Inventario (Relación Producto-Sucursal)
    db.run(`CREATE TABLE IF NOT EXISTS Inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      sucursal_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 0,
      minimo_stock INTEGER DEFAULT 0,
      FOREIGN KEY(producto_id) REFERENCES Productos(id) ON DELETE CASCADE,
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id) ON DELETE CASCADE,
      UNIQUE(producto_id, sucursal_id)
    )`);

    // 8. Configuracion (Para licencia y variables globales)
    db.run(`CREATE TABLE IF NOT EXISTS Configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )`);

    // 8.5 Usuarios (Autenticación y Roles)
    db.run(`CREATE TABLE IF NOT EXISTS Usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol TEXT CHECK(rol IN ('Admin', 'Empleado')) NOT NULL,
      empleado_id INTEGER,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(empleado_id) REFERENCES Empleados(id) ON DELETE SET NULL
    )`);
    // Add empleado_id to existing Usuarios tables (for upgrades)
    db.run(`ALTER TABLE Usuarios ADD COLUMN empleado_id INTEGER REFERENCES Empleados(id) ON DELETE SET NULL`, () => { });

    // 9. Ventas (Comprobantes)
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
      pedido_id INTEGER,
      FOREIGN KEY(sucursal_id) REFERENCES Sucursales(id),
      FOREIGN KEY(venta_id) REFERENCES Ventas(id),
      FOREIGN KEY(pedido_id) REFERENCES Pedidos(id)
    )`, (err) => {
      // Migración retroactiva si ya existe pero le falta la columna
      if (!err) {
        db.run("ALTER TABLE MovimientosCaja ADD COLUMN pedido_id INTEGER", () => { }); // Ignore duplicate errors
      }
    });

    // 11. Pedidos (Ordenes de Compra a Proveedores)
    db.run(`CREATE TABLE IF NOT EXISTS Pedidos (
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

    // 12. DetallesPedido
    db.run(`CREATE TABLE IF NOT EXISTS DetallesPedido (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      precio_compra_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY(pedido_id) REFERENCES Pedidos(id),
      FOREIGN KEY(producto_id) REFERENCES Productos(id)
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

    // Seed default User Admin "Principal" if it doesn't exist
    db.get('SELECT COUNT(*) as count FROM Usuarios', (err, row) => {
      if (row && row.count === 0) {
        // Default password is "admin". We hash it here.
        const defaultHash = crypto.createHash('sha256').update('admin').digest('hex');
        db.run(
          `INSERT INTO Usuarios (username, password_hash, rol) VALUES (?, ?, ?)`,
          ['Principal', defaultHash, 'Admin'],
          function (err) {
            if (err) console.error("Could not seed default admin user.", err);
          }
        );
      }
    });
  });
}

module.exports = db;
