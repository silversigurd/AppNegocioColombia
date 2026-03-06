const { ipcMain } = require('electron');
const db = require('./db.cjs');

function setupIpcHandlers() {
    // Ejemplos básicos de operaciones (se pueden expandir según necesidad)

    // --- SUCURSALES ---
    ipcMain.handle('get-sucursales', async () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM Sucursales', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    // --- PRODUCTOS ---
    ipcMain.handle('get-productos', async (event, sucursal_id) => {
        return new Promise((resolve, reject) => {
            let query = `
        SELECT p.*, c.nombre as categoria_nombre, pr.nombre as proveedor_nombre, i.cantidad as stock
        FROM Productos p
        LEFT JOIN Categorias c ON p.categoria_id = c.id
        LEFT JOIN Proveedores pr ON p.proveedor_id = pr.id
        LEFT JOIN Inventario i ON p.id = i.producto_id AND i.sucursal_id = ?
      `;
            db.all(query, [sucursal_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    // --- VENTAS RESUMEN (PARA DASHBOARD) ---
    ipcMain.handle('get-ventas-resumen', async (event, sucursal_id, fecha) => {
        return new Promise((resolve, reject) => {
            let query = `SELECT SUM(total) as total_ventas, COUNT(id) as cantidad_ventas FROM Ventas WHERE sucursal_id = ? AND date(fecha) = date(?)`;
            db.get(query, [sucursal_id, fecha], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        })
    });
}

module.exports = { setupIpcHandlers };
