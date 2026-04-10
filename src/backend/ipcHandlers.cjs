const { ipcMain, app, shell, dialog } = require('electron');
const { db, dbReady, dbPath } = require('./db.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

const SECRET_SALT = 'CommerceOS_Pro_Secret_2026';

async function setupIpcHandlers() {
    // Wait for DB initialization (migrations) before allowing IPC calls to proceed
    await dbReady;
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

    // --- GUARDAR VENTA ---
    ipcMain.handle('save-venta', async (event, saleData) => {
        const { total, subtotal, impuestos, impuestos_internos, cliente_id, cliente_identificacion, sucursal_id, regimen_transparencia, items,
                medio_pago, dianCompliance2026, iva_19, iva_5, ipoc_8, imp_saludable } = saleData;

        const cude_local = dianCompliance2026 ? crypto.randomUUID() : null;

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                const stmtVenta = db.prepare('INSERT INTO Ventas (total, subtotal, impuestos, impuestos_internos, cliente_id, cliente_identificacion, sucursal_id, regimen_transparencia, medio_pago, cude_local, iva_19, iva_5, ipoc, imp_saludable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                stmtVenta.run(
                    total, subtotal, impuestos, impuestos_internos || 0, cliente_id || null, cliente_identificacion || null, sucursal_id, regimen_transparencia ? 1 : 0, 
                    medio_pago || 'EFECTIVO', cude_local, iva_19 || 0, iva_5 || 0, ipoc_8 || 0, imp_saludable || 0, 
                    function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }

                    const ventaId = this.lastID;
                    const stmtDetalle = db.prepare('INSERT INTO DetallesVenta (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)');
                    const stmtStock = db.prepare('UPDATE Inventario SET cantidad = cantidad - ? WHERE producto_id = ? AND sucursal_id = ?');
                    const stmtMovimiento = db.prepare('INSERT INTO MovimientosCaja (tipo, monto, concepto, sucursal_id, venta_id) VALUES (?, ?, ?, ?, ?)');

                    items.forEach(item => {
                        stmtDetalle.run(ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal);
                        stmtStock.run(item.cantidad, item.producto_id, sucursal_id);
                    });

                    stmtMovimiento.run('INGRESO', total, `Venta Ticket #${ventaId}`, sucursal_id, ventaId);

                    stmtDetalle.finalize();
                    stmtStock.finalize();
                    stmtMovimiento.finalize();

                    db.run('COMMIT', (err) => {
                        if (err) reject(err);
                        else resolve({ success: true, ventaId, cude_local });
                    });
                });
            });
        });
    });

    // --- CATEGORIAS ---
    ipcMain.handle('get-categorias', async () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM Categorias ORDER BY nombre ASC', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    ipcMain.handle('save-categoria', async (event, nombre) => {
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO Categorias (nombre) VALUES (?)', [nombre], function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, nombre });
            });
        });
    });

    ipcMain.handle('delete-categoria', async (event, id) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                // Al borrar una categoría, ponemos en NULL el categoria_id de los productos asociados
                db.run('UPDATE Productos SET categoria_id = NULL WHERE categoria_id = ?', [id]);
                db.run('DELETE FROM Categorias WHERE id = ?', [id], function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    db.run('COMMIT', (err) => {
                        if (err) reject(err);
                        else resolve({ success: true });
                    });
                });
            });
        });
    });

    // --- PRODUCTO CRUD ---
    ipcMain.handle('save-producto', async (event, producto) => {
        const { codigo, nombre, descripcion, precio_compra, precio_venta, iva_alicuota, tasa_internos, categoria_id, sucursal_id, stock_inicial, tipo_impuesto_co, es_producto_saludable } = producto;
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(
                    'INSERT INTO Productos (codigo, nombre, descripcion, precio_compra, precio_venta, iva_alicuota, tasa_internos, categoria_id, tipo_impuesto_co, es_producto_saludable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [codigo, nombre, descripcion, precio_compra, precio_venta, iva_alicuota || 21, tasa_internos || 0, categoria_id, tipo_impuesto_co || 'IVA_19', es_producto_saludable ? 1 : 0],
                    function (err) {
                        if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                        }
                        const productoId = this.lastID;
                        db.run(
                            'INSERT INTO Inventario (producto_id, sucursal_id, cantidad) VALUES (?, ?, ?)',
                            [productoId, sucursal_id, stock_inicial || 0],
                            (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                }
                                db.run('COMMIT', (err) => {
                                    if (err) reject(err);
                                    else resolve({ success: true, id: productoId });
                                });
                            }
                        );
                    }
                );
            });
        });
    });

    ipcMain.handle('update-producto', async (event, producto) => {
        const { id, codigo, nombre, descripcion, precio_compra, precio_venta, iva_alicuota, tasa_internos, categoria_id, stock, sucursal_id, tipo_impuesto_co, es_producto_saludable } = producto;
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(
                    'UPDATE Productos SET codigo = ?, nombre = ?, descripcion = ?, precio_compra = ?, precio_venta = ?, iva_alicuota = ?, tasa_internos = ?, categoria_id = ?, tipo_impuesto_co = ?, es_producto_saludable = ? WHERE id = ?',
                    [codigo, nombre, descripcion, precio_compra, precio_venta, iva_alicuota || 21, tasa_internos || 0, categoria_id, tipo_impuesto_co || 'IVA_19', es_producto_saludable ? 1 : 0, id],
                    (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                        }
                        db.run(
                            'INSERT OR REPLACE INTO Inventario (producto_id, sucursal_id, cantidad) VALUES (?, ?, ?)',
                            [id, sucursal_id, stock],
                            (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                }
                                db.run('COMMIT', (err) => {
                                    if (err) reject(err);
                                    else resolve({ success: true });
                                });
                            }
                        );
                    }
                );
            });
        });
    });

    ipcMain.handle('delete-producto', async (event, id) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run('DELETE FROM Inventario WHERE producto_id = ?', [id]);
                db.run('DELETE FROM Productos WHERE id = ?', [id], function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    db.run('COMMIT', (err) => {
                        if (err) reject(err);
                        else resolve({ success: true });
                    });
                });
            });
        });
    });

    // --- MOVIMIENTOS CAJA ---
    ipcMain.handle('get-movimientos', async (event, sucursal_id) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM MovimientosCaja 
                WHERE sucursal_id = ? 
                ORDER BY fecha DESC
            `;
            db.all(query, [sucursal_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    // --- DETALLES DE VENTA ---
    ipcMain.handle('get-venta-detalle', async (event, ventaId) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT dv.*, p.nombre as producto_nombre
                FROM DetallesVenta dv
                JOIN Productos p ON dv.producto_id = p.id
                WHERE dv.venta_id = ?
            `;
            db.all(query, [ventaId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    ipcMain.handle('get-venta-por-id', async (event, ventaId) => {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM Ventas WHERE id = ?`;
            db.get(query, [ventaId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    });

    // --- PROVEEDORES ---
    ipcMain.handle('get-proveedores', async () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM Proveedores ORDER BY nombre ASC', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    ipcMain.handle('save-proveedor', async (event, pro) => {
        const {
            nombre, contacto, telefono, nombre_fantasia, cuit, nit, responsable_iva,
            responsabilidad_tributaria, codigo_postal, email_facturacion, codigo_ciiu,
            condicion_iva, condicion_iibb, direccion, email_compras,
            email_pagos, plazo_pago, cbu, rubro, saldo_actual,
            preventista_nombre, preventista_telefono, dia_visita, dia_entrega, limite_credito, minimo_compra,
            moneda_compra, retencion_ganancias, retencion_iibb, vencimiento_certificado_exencion, saldo_envases
        } = pro;

        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO Proveedores (
                    nombre, contacto, telefono, nombre_fantasia, cuit, nit, responsable_iva,
                    responsabilidad_tributaria, codigo_postal, email_facturacion, codigo_ciiu,
                    condicion_iva, condicion_iibb, direccion, email_compras, 
                    email_pagos, plazo_pago, cbu, rubro, saldo_actual,
                    preventista_nombre, preventista_telefono, dia_visita, dia_entrega, limite_credito, minimo_compra,
                    moneda_compra, retencion_ganancias, retencion_iibb, vencimiento_certificado_exencion, saldo_envases
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            db.run(query, [
                nombre, contacto || null, telefono || null, nombre_fantasia || null, cuit || null, nit || null, responsable_iva ? 1 : 0,
                responsabilidad_tributaria || 'R-99-PN', codigo_postal || null, email_facturacion || null, codigo_ciiu || null,
                condicion_iva || null, condicion_iibb || null, direccion || null, email_compras || null,
                email_pagos || null, plazo_pago || 0, cbu || null, rubro || null, saldo_actual || 0,
                preventista_nombre || null, preventista_telefono || null, dia_visita || null, dia_entrega || null, limite_credito || 0, minimo_compra || 0,
                moneda_compra || 'COP', retencion_ganancias || 0, retencion_iibb || 0, vencimiento_certificado_exencion || null, saldo_envases || 0
            ], function (err) {
                if (err) reject(err);
                else resolve({ success: true, id: this.lastID });
            });
        });
    });

    ipcMain.handle('update-proveedor', async (event, pro) => {
        const {
            id, nombre, contacto, telefono, nombre_fantasia, cuit, nit, responsable_iva,
            responsabilidad_tributaria, codigo_postal, email_facturacion, codigo_ciiu,
            condicion_iva, condicion_iibb, direccion, email_compras,
            email_pagos, plazo_pago, cbu, rubro, saldo_actual,
            preventista_nombre, preventista_telefono, dia_visita, dia_entrega, limite_credito, minimo_compra,
            moneda_compra, retencion_ganancias, retencion_iibb, vencimiento_certificado_exencion, saldo_envases
        } = pro;

        return new Promise((resolve, reject) => {
            const query = `
                UPDATE Proveedores SET 
                    nombre = ?, contacto = ?, telefono = ?, nombre_fantasia = ?, cuit = ?, nit = ?, responsable_iva = ?,
                    responsabilidad_tributaria = ?, codigo_postal = ?, email_facturacion = ?, codigo_ciiu = ?,
                    condicion_iva = ?, condicion_iibb = ?, direccion = ?, email_compras = ?, 
                    email_pagos = ?, plazo_pago = ?, cbu = ?, rubro = ?, saldo_actual = ?,
                    preventista_nombre = ?, preventista_telefono = ?, dia_visita = ?, dia_entrega = ?, limite_credito = ?, minimo_compra = ?,
                    moneda_compra = ?, retencion_ganancias = ?, retencion_iibb = ?, vencimiento_certificado_exencion = ?, saldo_envases = ?
                WHERE id = ?
            `;
            db.run(query, [
                nombre, contacto || null, telefono || null, nombre_fantasia || null, cuit || null, nit || null, responsable_iva ? 1 : 0,
                responsabilidad_tributaria || 'R-99-PN', codigo_postal || null, email_facturacion || null, codigo_ciiu || null,
                condicion_iva || null, condicion_iibb || null, direccion || null, email_compras || null,
                email_pagos || null, plazo_pago || 0, cbu || null, rubro || null, saldo_actual || 0,
                preventista_nombre || null, preventista_telefono || null, dia_visita || null, dia_entrega || null, limite_credito || 0, 
                minimo_compra || 0, moneda_compra || 'COP', retencion_ganancias || 0, retencion_iibb || 0, vencimiento_certificado_exencion || null, saldo_envases || 0, id
            ], function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    });

    ipcMain.handle('delete-proveedor', async (event, id) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run('UPDATE Productos SET proveedor_id = NULL WHERE proveedor_id = ?', [id]);
                db.run('DELETE FROM Proveedores WHERE id = ?', [id], function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    db.run('COMMIT', (err) => {
                        if (err) reject(err);
                        else resolve({ success: true });
                    });
                });
            });
        });
    });
    // --- PEDIDOS (ÓRDENES DE COMPRA) ---
    ipcMain.handle('get-pedidos-por-proveedor', async (event, proveedor_id, sucursal_id) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM Pedidos 
                WHERE proveedor_id = ? AND sucursal_id = ?
                ORDER BY fecha DESC
            `;
            db.all(query, [proveedor_id, sucursal_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    ipcMain.handle('get-detalle-pedido', async (event, pedido_id) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT dp.*, p.nombre as producto_nombre, p.codigo
                FROM DetallesPedido dp
                JOIN Productos p ON dp.producto_id = p.id
                WHERE dp.pedido_id = ?
            `;
            db.all(query, [pedido_id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    ipcMain.handle('save-pedido', async (event, pedidoData) => {
        const { proveedor_id, sucursal_id, total, items, cufe, fecha_emision_fe } = pedidoData;

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                const stmtPedido = db.prepare('INSERT INTO Pedidos (proveedor_id, sucursal_id, total, estado, pagado, cufe, fecha_emision_fe) VALUES (?, ?, ?, ?, ?, ?, ?)');
                stmtPedido.run(proveedor_id, sucursal_id, total, 'PENDIENTE', 0, cufe || null, fecha_emision_fe || null, function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }

                    const pedidoId = this.lastID;
                    const stmtDetalle = db.prepare('INSERT INTO DetallesPedido (pedido_id, producto_id, cantidad, precio_compra_unitario, subtotal) VALUES (?, ?, ?, ?, ?)');

                    items.forEach(item => {
                        stmtDetalle.run(pedidoId, item.producto_id, item.cantidad, item.precio_compra, item.subtotal);
                    });

                    stmtDetalle.finalize();

                    db.run('COMMIT', (err) => {
                        if (err) reject(err);
                        else resolve({ success: true, pedidoId });
                    });
                });
            });
        });
    });

    ipcMain.handle('confirmar-recepcion-pedido', async (event, pedido_id, sucursal_id) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // 1. Marcar como RECIBIDO
                db.run("UPDATE Pedidos SET estado = 'RECIBIDO' WHERE id = ?", [pedido_id], function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }

                    // 2. Traer los detalles para sumar al inventario y actualizar el costo
                    db.all("SELECT * FROM DetallesPedido WHERE pedido_id = ?", [pedido_id], (err, detalles) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                        }

                        const stmtCosto = db.prepare("UPDATE Productos SET precio_compra = ? WHERE id = ?");
                        const stmtInventario = db.prepare(`
                            INSERT INTO Inventario (producto_id, sucursal_id, cantidad) 
                            VALUES (?, ?, ?) 
                            ON CONFLICT(producto_id, sucursal_id) 
                            DO UPDATE SET cantidad = cantidad + ?
                        `);

                        detalles.forEach(d => {
                            stmtCosto.run(d.precio_compra_unitario, d.producto_id);
                            stmtInventario.run(d.producto_id, sucursal_id, d.cantidad, d.cantidad);
                        });

                        stmtCosto.finalize();
                        stmtInventario.finalize();

                        db.run('COMMIT', (err) => {
                            if (err) reject(err);
                            else resolve({ success: true });
                        });
                    });
                });
            });
        });
    });

    ipcMain.handle('registrar-pago-pedido', async (event, pedido_id, sucursal_id, proveedor_id, total, pago_inmediato) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // 1. Marcar el pedido como pagado
                db.run("UPDATE Pedidos SET pagado = 1 WHERE id = ?", [pedido_id], function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }

                    if (pago_inmediato) {
                        // Descontar plata de la caja
                        db.run("INSERT INTO MovimientosCaja (tipo, monto, concepto, sucursal_id, pedido_id) VALUES (?, ?, ?, ?, ?)",
                            ['EGRESO', total, `Pago Orden Compra #${pedido_id}`, sucursal_id, pedido_id],
                            (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                }
                                db.run('COMMIT', (err) => {
                                    if (err) reject(err);
                                    else resolve({ success: true, type: 'caja' });
                                });
                            }
                        );
                    } else {
                        // Queda debiendo en Cuenta Corriente (Aumentamos el saldo del proveedor)
                        db.run("UPDATE Proveedores SET saldo_actual = saldo_actual + ? WHERE id = ?",
                            [total, proveedor_id],
                            (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                }
                                db.run('COMMIT', (err) => {
                                    if (err) reject(err);
                                    else resolve({ success: true, type: 'cc' });
                                });
                            }
                        );
                    }
                });
            });
        });
    });

    ipcMain.handle('get-pedido-por-id', async (event, pedido_id) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT pe.*, pro.nombre as proveedor_nombre, pro.nit as proveedor_nit
                FROM Pedidos pe
                JOIN Proveedores pro ON pe.proveedor_id = pro.id
                WHERE pe.id = ?
            `;
            db.get(query, [pedido_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    });

    ipcMain.handle('update-pedido-dian-events', async (event, id, eventos) => {
        const { evento_acuse_recibo, evento_recibo_bienes, evento_aceptacion_expresa } = eventos;
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE Pedidos SET evento_acuse_recibo = ?, evento_recibo_bienes = ?, evento_aceptacion_expresa = ? WHERE id = ?`,
                [evento_acuse_recibo ? 1 : 0, evento_recibo_bienes ? 1 : 0, evento_aceptacion_expresa ? 1 : 0, id],
                function (err) {
                    if (err) reject(err);
                    else resolve({ success: true });
                }
            );
        });
    });
    // --- EMPLEADOS (RRHH) ---
    ipcMain.handle('get-empleados', async (event, sucursal_id) => {
        return new Promise((resolve, reject) => {
            // Only return Activo employees; Desvinculados are archived and shown in history
            let query = `SELECT * FROM Empleados WHERE (estado = 'Activo' OR estado IS NULL)`;
            const params = [];
            if (sucursal_id) {
                query += ' AND sucursal_id = ?';
                params.push(sucursal_id);
            }
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    ipcMain.handle('get-empleados-desvinculados', async (event, sucursal_id) => {
        return new Promise((resolve, reject) => {
            let query = `SELECT * FROM Empleados WHERE estado = 'Desvinculado' ORDER BY fecha_egreso DESC`;
            db.all(query, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    ipcMain.handle('save-empleado', async (event, empleado) => {
        const {
            nombre, cargo, tarifa_hora, sucursal_id, dni, cuil,
            cedula_ciudadania, rut, eps, fondo_pensiones, arl,
            direccion, partido, localidad, obra_social, fecha_ingreso,
            categoria_cct, sueldo_basico, jornada_laboral, horas_parcial, contrato_filepath,
            modalidad_contratacion, telefono, ajustes_proximos_json
        } = empleado;

        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO Empleados (
                    nombre, cargo, tarifa_hora, sucursal_id, dni, cuil,
                    cedula_ciudadania, rut, eps, fondo_pensiones, arl,
                    direccion, partido, localidad, obra_social, fecha_ingreso,
                    categoria_cct, sueldo_basico, jornada_laboral, horas_parcial, contrato_filepath,
                    modalidad_contratacion, telefono, ajustes_proximos_json, estado
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo')
            `;
            db.run(query, [
                nombre, cargo || null, tarifa_hora || 0, sucursal_id || null, dni || null, cuil || null,
                cedula_ciudadania || null, rut || null, eps || null, fondo_pensiones || null, arl || null,
                direccion || null, partido || null, localidad || null, obra_social || null, fecha_ingreso || null,
                categoria_cct || null, sueldo_basico || 0, jornada_laboral || null, horas_parcial || 0, contrato_filepath || null,
                modalidad_contratacion || 'Formal', telefono || null, ajustes_proximos_json || null
            ], function (err) {
                if (err) reject(err);
                else resolve({ success: true, id: this.lastID });
            });
        });
    });

    ipcMain.handle('update-empleado', async (event, empleado) => {
        const {
            id, nombre, cargo, tarifa_hora, sucursal_id, dni, cuil,
            cedula_ciudadania, rut, eps, fondo_pensiones, arl,
            direccion, partido, localidad, obra_social, fecha_ingreso,
            categoria_cct, sueldo_basico, jornada_laboral, horas_parcial, contrato_filepath,
            modalidad_contratacion, telefono, ajustes_proximos_json
        } = empleado;

        return new Promise((resolve, reject) => {
            const query = `
                UPDATE Empleados SET 
                    nombre = ?, cargo = ?, tarifa_hora = ?, sucursal_id = ?, dni = ?, cuil = ?,
                    cedula_ciudadania = ?, rut = ?, eps = ?, fondo_pensiones = ?, arl = ?,
                    direccion = ?, partido = ?, localidad = ?, obra_social = ?, fecha_ingreso = ?,
                    categoria_cct = ?, sueldo_basico = ?, jornada_laboral = ?, horas_parcial = ?, contrato_filepath = ?,
                    modalidad_contratacion = ?, telefono = ?, ajustes_proximos_json = ?
                WHERE id = ?
            `;
            db.run(query, [
                nombre, cargo || null, tarifa_hora || 0, sucursal_id || null, dni || null, cuil || null,
                cedula_ciudadania || null, rut || null, eps || null, fondo_pensiones || null, arl || null,
                direccion || null, partido || null, localidad || null, obra_social || null, fecha_ingreso || null,
                categoria_cct || null, sueldo_basico || 0, jornada_laboral || null, horas_parcial || 0, contrato_filepath || null,
                modalidad_contratacion || 'Formal', telefono || null, ajustes_proximos_json || null, id
            ], function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    });

    ipcMain.handle('delete-empleado', async (event, id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM Empleados WHERE id = ?', [id], function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    });

    ipcMain.handle('desvincular-empleado', async (event, { id, causal_egreso, fecha_egreso, indemnizacion_json }) => {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE Empleados SET estado = 'Desvinculado', causal_egreso = ?, fecha_egreso = ?, indemnizacion_json = ? WHERE id = ?
            `;
            db.run(query, [causal_egreso, fecha_egreso, indemnizacion_json || null, id], function (err) {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    });

    ipcMain.handle('select-contrato-empleado', async (event, empleadoId) => {
        try {
            const { canceled, filePaths } = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }]
            });

            if (canceled || filePaths.length === 0) {
                return { success: false, error: 'Cancelado' };
            }

            const sourcePath = filePaths[0];
            const userDataPath = app.getPath('userData');
            const contractsDir = path.join(userDataPath, 'contratos_rrhh');

            if (!fs.existsSync(contractsDir)) {
                fs.mkdirSync(contractsDir, { recursive: true });
            }

            const fileName = `contrato_${empleadoId}_${Date.now()}${path.extname(sourcePath)}`;
            const destPath = path.join(contractsDir, fileName);

            fs.copyFileSync(sourcePath, destPath);

            return new Promise((resolve, reject) => {
                db.run('UPDATE Empleados SET contrato_filepath = ? WHERE id = ?', [destPath, empleadoId], function (err) {
                    if (err) resolve({ success: false, error: err.message });
                    else resolve({ success: true, filepath: destPath });
                });
            });
        } catch (error) {
            console.error('Error selecting contract:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('upload-contrato-empleado', async (event, sourcePath, empleadoId) => {
        try {
            const userDataPath = app.getPath('userData');
            const contractsDir = path.join(userDataPath, 'contratos_rrhh');

            if (!fs.existsSync(contractsDir)) {
                fs.mkdirSync(contractsDir, { recursive: true });
            }

            const fileName = `contrato_${empleadoId}_${Date.now()}${path.extname(sourcePath)}`;
            const destPath = path.join(contractsDir, fileName);

            fs.copyFileSync(sourcePath, destPath);

            // Update user in DB with new path
            return new Promise((resolve, reject) => {
                db.run('UPDATE Empleados SET contrato_filepath = ? WHERE id = ?', [destPath, empleadoId], function (err) {
                    if (err) reject(err);
                    else resolve({ success: true, filepath: destPath });
                });
            });
        } catch (error) {
            console.error('Error uploading contract:', error);
            throw error;
        }
    });

    // --- LIQUIDACIONES DE SUELDO ---
    ipcMain.handle('save-liquidacion', async (event, liquidacionData) => {
        const { empleado_id, periodo, fecha_pago, banco_deposito, total_bruto, total_retenciones, total_neto, conceptos } = liquidacionData;

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                const stmtLiq = db.prepare(`
                    INSERT INTO Liquidaciones (empleado_id, periodo, fecha_pago, banco_deposito, total_bruto, total_retenciones, total_neto) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                stmtLiq.run([empleado_id, periodo, fecha_pago, banco_deposito, total_bruto, total_retenciones, total_neto], function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }

                    const liquidacionId = this.lastID;
                    const stmtConcepto = db.prepare(`
                        INSERT INTO ConceptosLiquidacion (liquidacion_id, tipo, descripcion, unidad, importe) 
                        VALUES (?, ?, ?, ?, ?)
                    `);

                    conceptos.forEach(c => {
                        stmtConcepto.run([liquidacionId, c.tipo, c.descripcion, c.unidad || null, c.importe]);
                    });

                    stmtConcepto.finalize();
                    stmtLiq.finalize();

                    db.run('COMMIT', (err) => {
                        if (err) reject(err);
                        else resolve({ success: true, liquidacionId });
                    });
                });
            });
        });
    });

    ipcMain.handle('get-liquidaciones-empleado', async (event, empleado_id) => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM Liquidaciones WHERE empleado_id = ? ORDER BY id DESC', [empleado_id], async (err, liquidaciones) => {
                if (err) return reject(err);

                // Fetch conceptos for each
                const results = [];
                for (const liq of liquidaciones) {
                    const conceptos = await new Promise((res, rej) => {
                        db.all('SELECT * FROM ConceptosLiquidacion WHERE liquidacion_id = ?', [liq.id], (err2, rows) => {
                            if (err2) rej(err2);
                            else res(rows);
                        });
                    });
                    results.push({ ...liq, conceptos });
                }
                resolve(results);
            });
        });
    });

    // --- USUARIOS Y AUTENTICACIÓN ---
    ipcMain.handle('login', async (event, username, password) => {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256').update(password).digest('hex');
            // JOIN with Empleados to get the seller's full name for receipts
            const query = `
                SELECT u.id, u.username, u.rol, u.empleado_id, u.nombre_propietario, e.nombre as empleado_nombre
                FROM Usuarios u
                LEFT JOIN Empleados e ON u.empleado_id = e.id
                WHERE u.username = ? AND u.password_hash = ?
            `;
            db.get(query, [username, hash], (err, row) => {
                if (err) reject(err);
                if (row) {
                    resolve({ success: true, user: row });
                } else {
                    resolve({ success: false, error: 'Usuario o contraseña incorrectos' });
                }
            });
        });
    });

    ipcMain.handle('get-usuarios', async () => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT u.id, u.username, u.rol, u.empleado_id, u.fecha_creacion, u.nombre_propietario, e.nombre as empleado_nombre
                FROM Usuarios u
                LEFT JOIN Empleados e ON u.empleado_id = e.id
                ORDER BY u.id ASC
            `;
            db.all(query, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    ipcMain.handle('save-usuario', async (event, userData) => {
        return new Promise((resolve, reject) => {
            const { username, password, rol, empleado_id, nombre_propietario } = userData;
            const hash = crypto.createHash('sha256').update(password).digest('hex');
            const empId = empleado_id || null;

            db.run('INSERT INTO Usuarios (username, password_hash, rol, empleado_id, nombre_propietario) VALUES (?, ?, ?, ?, ?)', [username, hash, rol, empId, nombre_propietario || null], function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        resolve({ success: false, error: 'El nombre de usuario ya existe.' });
                    } else {
                        reject(err);
                    }
                } else {
                    resolve({ success: true, id: this.lastID });
                }
            });
        });
    });

    ipcMain.handle('update-usuario', async (event, userData) => {
        return new Promise((resolve, reject) => {
            const { id, username, password, rol, empleado_id, nombre_propietario } = userData;
            const empId = empleado_id || null;

            if (password && password.trim() !== '') {
                // Update with new password
                const hash = crypto.createHash('sha256').update(password).digest('hex');
                db.run('UPDATE Usuarios SET username = ?, password_hash = ?, rol = ?, empleado_id = ?, nombre_propietario = ? WHERE id = ?', [username, hash, rol, empId, nombre_propietario || null, id], function (err) {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            } else {
                // Update without changing password
                db.run('UPDATE Usuarios SET username = ?, rol = ?, empleado_id = ?, nombre_propietario = ? WHERE id = ?', [username, rol, empId, nombre_propietario || null, id], function (err) {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            }
        });
    });

    ipcMain.handle('delete-usuario', async (event, id) => {
        return new Promise((resolve, reject) => {
            // Protect "Principal" from deletion (assuming ID 1 or username)
            db.get('SELECT username FROM Usuarios WHERE id = ?', [id], (err, row) => {
                if (err) return reject(err);
                if (row && row.username === 'Principal') {
                    return resolve({ success: false, error: 'No se puede eliminar el usuario Principal.' });
                }

                db.run('DELETE FROM Usuarios WHERE id = ?', [id], function (err) {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        });
    });

    // --- AJUSTES DEL NEGOCIO ---
    ipcMain.handle('get-settings', async () => {
        return new Promise((resolve) => {
            db.all("SELECT clave, valor FROM Configuracion WHERE clave NOT LIKE 'license%'", [], (err, rows) => {
                const settings = {};
                if (!err && rows) {
                    rows.forEach(row => { settings[row.clave] = row.valor; });
                }
                resolve(settings);
            });
        });
    });

    ipcMain.handle('save-settings', async (event, settings) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare("INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES (?, ?)");
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                Object.entries(settings).forEach(([clave, valor]) => {
                    stmt.run([clave, String(valor)]);
                });
                stmt.finalize();
                db.run("COMMIT", (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            });
        });
    });

    ipcMain.handle('save-logo', async (event, sourcePath) => {
        try {
            const userDataPath = app.getPath('userData');
            const logoDir = path.join(userDataPath, 'branding');
            if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

            const ext = path.extname(sourcePath) || '.png';
            const destPath = path.join(logoDir, `logo${ext}`);
            fs.copyFileSync(sourcePath, destPath);

            return { success: true, logoPath: destPath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-logo-base64', async (event, logoPath) => {
        try {
            if (!logoPath || !fs.existsSync(logoPath)) return null;
            const ext = path.extname(logoPath).substring(1) || 'png';
            const base64Data = fs.readFileSync(logoPath, { encoding: 'base64' });
            return `data:image/${ext};base64,${base64Data}`;
        } catch (err) {
            console.error('Error reading logo:', err);
            return null;
        }
    });

    // --- LICENCIAS (ACTIVACION POR HARDWARE) ---

    ipcMain.handle('check-license', async () => {
        return new Promise((resolve) => {
            const hwId = machineIdSync({ original: true });

            db.get("SELECT valor FROM Configuracion WHERE clave = 'license_key'", [], (err, row) => {
                if (err || !row) {
                    resolve({ activated: false, machineId: hwId });
                    return;
                }

                const savedKey = row.valor;

                // Hash the current machine ID with our secret salt
                const hash = crypto.createHmac('sha256', SECRET_SALT)
                    .update(hwId)
                    .digest('hex');

                const expectedKey = hash.substring(0, 16).toUpperCase().match(/.{1,4}/g).join('-');

                if (savedKey === expectedKey) {
                    resolve({ activated: true, machineId: hwId });
                } else {
                    resolve({ activated: false, machineId: hwId });
                }
            });
        });
    });

    ipcMain.handle('activate-license', async (event, enteredKey) => {
        return new Promise((resolve, reject) => {
            const hwId = machineIdSync({ original: true });

            const hash = crypto.createHmac('sha256', SECRET_SALT)
                .update(hwId)
                .digest('hex');

            const expectedKey = hash.substring(0, 16).toUpperCase().match(/.{1,4}/g).join('-');

            if (enteredKey.trim() === expectedKey) {
                // Save valid key to DB
                db.run("INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('license_key', ?)", [expectedKey], (err) => {
                    if (err) reject(err);
                    else resolve({ success: true });
                });
            } else {
                resolve({ success: false, error: 'Clave de activación inválida para este equipo.' });
            }
        });
    });
    // --- CLIENTES (Colombia 2026 - Ley 1581 Habeas Data) ---
    ipcMain.handle('get-clients', async (event, opts) => {
        return new Promise((resolve, reject) => {
            const search = opts?.search || '';
            const query = search
                ? `SELECT * FROM Clientes WHERE nombre LIKE ? OR email LIKE ? OR nit_cedula LIKE ? ORDER BY nombre ASC`
                : `SELECT * FROM Clientes ORDER BY nombre ASC`;
            const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    });

    ipcMain.handle('add-client', async (event, client) => {
        const { nombre, telefono, email, nit_cedula, eps, fondo_pensiones, arl, autoriza_datos, fecha_autorizacion, datos_suprimidos } = client;
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO Clientes (nombre, telefono, email, nit_cedula, eps, fondo_pensiones, arl, autoriza_datos, fecha_autorizacion, datos_suprimidos)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [nombre, telefono || null, email || null, nit_cedula || null, eps || null, fondo_pensiones || null, arl || null,
                 autoriza_datos || 0, fecha_autorizacion || null, datos_suprimidos || 0],
                function (err) {
                    if (err) reject(err);
                    else resolve({ success: true, id: this.lastID });
                }
            );
        });
    });

    ipcMain.handle('update-client', async (event, client) => {
        const { id, nombre, telefono, email, nit_cedula, eps, fondo_pensiones, arl, autoriza_datos, fecha_autorizacion, datos_suprimidos } = client;
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE Clientes SET nombre = ?, telefono = ?, email = ?, nit_cedula = ?, eps = ?, fondo_pensiones = ?, arl = ?,
                 autoriza_datos = ?, fecha_autorizacion = ?, datos_suprimidos = ? WHERE id = ?`,
                [nombre, telefono || null, email || null, nit_cedula || null, eps || null, fondo_pensiones || null, arl || null,
                 autoriza_datos || 0, fecha_autorizacion || null, datos_suprimidos || 0, id],
                function (err) {
                    if (err) reject(err);
                    else resolve({ success: true });
                }
            );
        });
    });

    // Ley 1581 — Derecho a la supresión de datos (Art. 8 literal e)
    ipcMain.handle('suprimir-datos-cliente', async (event, { id }) => {
        return new Promise((resolve, reject) => {
            // Anonymize personal data but keep the purchase record (historial commercial)
            db.run(
                `UPDATE Clientes SET nombre = '[SUPRIMIDO]', telefono = NULL, email = NULL, nit_cedula = NULL,
                 eps = NULL, fondo_pensiones = NULL, arl = NULL, autoriza_datos = 0,
                 datos_suprimidos = 1 WHERE id = ?`,
                [id],
                function (err) {
                    if (err) reject(err);
                    else resolve({ success: true });
                }
            );
        });
    });

    ipcMain.handle('abrir-archivo', async (event, filePath) => {
        try {
            if (!filePath || !fs.existsSync(filePath)) {
                return { success: false, error: 'Archivo no encontrado en la ruta especificada.' };
            }
            const err = await shell.openPath(filePath);
            if (err) return { success: false, error: err };
            return { success: true };
        } catch (error) {
            console.error('Error opening file:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('open-db-folder', async () => {
        try {
            await shell.showItemInFolder(dbPath);
            return { success: true };
        } catch (error) {
            console.error('Error opening DB folder:', error);
            return { success: false, error: error.message };
        }
    });

}

module.exports = { setupIpcHandlers };
