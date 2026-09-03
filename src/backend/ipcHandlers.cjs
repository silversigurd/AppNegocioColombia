const { ipcMain, app, shell, dialog } = require('electron');
const { createClient } = require('@libsql/client');
const { db, dbReady, dbPath, dbRun, dbGet, dbAll, syncEnabled, tursoUrl } = require('./db.cjs');
const { emitirFactura } = require('./dianService.cjs');
const { procesarFactura, procesarPendientes } = require('./facturacionPendientes.cjs');
const { readTenant, writeTenant, markReplicaReset } = require('./tenantConfig.cjs');
const { secret } = require('./secrets.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

const SECRET_SALT = 'CommerceOS_Pro_Secret_2026';

async function setupIpcHandlers() {
    // Wait for DB initialization (migrations) before allowing IPC calls to proceed
    await dbReady;

    // --- SUCURSALES ---
    ipcMain.handle('get-sucursales', async () => {
        return dbAll('SELECT * FROM Sucursales');
    });

    // --- PRODUCTOS ---
    ipcMain.handle('get-productos', async (event, sucursal_id) => {
        const query = `
            SELECT p.*, c.nombre as categoria_nombre, pr.nombre as proveedor_nombre, i.cantidad as stock
            FROM Productos p
            LEFT JOIN Categorias c ON p.categoria_id = c.id
            LEFT JOIN Proveedores pr ON p.proveedor_id = pr.id
            LEFT JOIN Inventario i ON p.id = i.producto_id AND i.sucursal_id = ?
        `;
        return dbAll(query, [sucursal_id]);
    });

    // --- VENTAS RESUMEN (PARA DASHBOARD) ---
    ipcMain.handle('get-ventas-resumen', async (event, sucursal_id, fecha) => {
        return dbGet(
            `SELECT SUM(total) as total_ventas, COUNT(id) as cantidad_ventas FROM Ventas WHERE sucursal_id = ? AND date(fecha) = date(?)`,
            [sucursal_id, fecha]
        );
    });

    // --- GUARDAR VENTA ---
    ipcMain.handle('save-venta', async (event, saleData) => {
        const {
            total, subtotal, impuestos, impuestos_internos, cliente_id, cliente_identificacion,
            sucursal_id, regimen_transparencia, items, medio_pago, dianCompliance2026,
            iva_19, iva_5, ipoc_8, imp_saludable
        } = saleData;

        // ── 1. Guardar la venta en la DB (esto nunca falla por DIAN) ──────────
        let ventaId;
        try {
            await dbRun('BEGIN');

            const resVenta = await dbRun(
                `INSERT INTO Ventas (total, subtotal, impuestos, impuestos_internos, cliente_id, cliente_identificacion,
                    sucursal_id, regimen_transparencia, medio_pago, cude_local, iva_19, iva_5, ipoc, imp_saludable)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    total, subtotal, impuestos, impuestos_internos || 0, cliente_id || null,
                    cliente_identificacion || null, sucursal_id, regimen_transparencia ? 1 : 0,
                    medio_pago || 'EFECTIVO', null, // cude_local se actualiza cuando DIAN responde
                    iva_19 || 0, iva_5 || 0, ipoc_8 || 0, imp_saludable || 0
                ]
            );

            ventaId = Number(resVenta.lastInsertRowid);

            for (const item of items) {
                await dbRun(
                    `INSERT INTO DetallesVenta (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)`,
                    [ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal]
                );
                await dbRun(
                    `UPDATE Inventario SET cantidad = cantidad - ? WHERE producto_id = ? AND sucursal_id = ?`,
                    [item.cantidad, item.producto_id, sucursal_id]
                );
            }

            await dbRun(
                `INSERT INTO MovimientosCaja (tipo, monto, concepto, sucursal_id, venta_id) VALUES (?, ?, ?, ?, ?)`,
                ['INGRESO', total, `Venta Ticket #${ventaId}`, sucursal_id, ventaId]
            );

            await dbRun('COMMIT');
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }

        // ── 2. Emisión DIAN (fuera de la transacción de venta) ───────────────
        if (!dianCompliance2026) {
            return { success: true, ventaId };
        }

        // Leer settings necesarios para armar el payload
        const settingsRows = await dbAll("SELECT clave, valor FROM Configuracion");
        const settings = {};
        settingsRows.forEach(r => { settings[r.clave] = r.valor; });

        // Verificar que la resolución DIAN esté configurada
        if (!settings.dian_resolucion || !settings.dian_numero_actual) {
            await dbRun(
                `INSERT OR IGNORE INTO FacturasElectronicas (venta_id, estado, error_mensaje, intentos)
                 VALUES (?, 'PENDIENTE', 'Resolución DIAN no configurada en ajustes del negocio.', 1)`,
                [ventaId]
            );
            return { success: true, ventaId, dian_pendiente: true, dian_error: 'Resolución DIAN no configurada.' };
        }

        // Reservar número de factura
        const numeroFactura = parseInt(settings.dian_numero_actual, 10);
        await dbRun(
            "UPDATE Configuracion SET valor = ? WHERE clave = 'dian_numero_actual'",
            [String(numeroFactura + 1)]
        );

        // Registrar en FacturasElectronicas como PENDIENTE antes de llamar a MATIAS
        await dbRun(
            `INSERT INTO FacturasElectronicas (venta_id, numero_factura, estado, intentos) VALUES (?, ?, 'PENDIENTE', 1)`,
            [ventaId, numeroFactura]
        );

        // Obtener datos del cliente (si aplica) y los ítems con nombres y tipo de impuesto
        const [cliente, itemsConDetalle] = await Promise.all([
            cliente_id ? dbGet('SELECT * FROM Clientes WHERE id = ?', [cliente_id]) : Promise.resolve(null),
            dbAll(
                `SELECT dv.*, p.nombre, p.codigo, p.tipo_impuesto_co, p.es_producto_saludable
                 FROM DetallesVenta dv
                 JOIN Productos p ON dv.producto_id = p.id
                 WHERE dv.venta_id = ?`,
                [ventaId]
            ),
        ]);

        // Llamar a MATIAS API
        try {
            const resultado = await emitirFactura(saleData, cliente, itemsConDetalle, settings, numeroFactura);

            if (resultado.success) {
                // Factura emitida y aprobada por DIAN
                await dbRun(
                    `UPDATE FacturasElectronicas SET
                        estado = 'EMITIDA', cufe = ?, estado_dian = ?, descripcion_dian = ?,
                        xml_url = ?, pdf_url = ?, qr_url = ?, qr_dian_url = ?, qr_base64 = ?
                     WHERE venta_id = ?`,
                    [
                        resultado.cufe, resultado.estado_dian, resultado.descripcion_dian,
                        resultado.xml_url, resultado.pdf_url, resultado.qr_url, resultado.qr_dian_url,
                        resultado.qr_base64, ventaId
                    ]
                );
                // Guardar CUFE en la venta también
                await dbRun('UPDATE Ventas SET cude_local = ? WHERE id = ?', [resultado.cufe, ventaId]);

                return {
                    success: true,
                    ventaId,
                    dian_emitida: true,
                    cufe: resultado.cufe,
                    pdf_url: resultado.pdf_url,
                    qr_url: resultado.qr_url,
                    qr_dian_url: resultado.qr_dian_url,
                    qr_base64: resultado.qr_base64,
                    numero_factura: numeroFactura,
                    prefijo: settings.dian_prefijo || '',
                };
            } else if (resultado.queued) {
                // MATIAS la recibió pero la DIAN aún no respondió — queda en cola para reintento
                await dbRun(
                    `UPDATE FacturasElectronicas SET estado = 'PENDIENTE', cufe = ?, error_mensaje = ? WHERE venta_id = ?`,
                    [resultado.cufe, 'En cola de la DIAN — se reintenta la consulta.', ventaId]
                );
                return {
                    success: true, ventaId, dian_pendiente: true,
                    dian_error: 'Factura en cola de la DIAN.', numero_factura: numeroFactura,
                };
            } else {
                // MATIAS respondió pero DIAN rechazó
                const errorMsg = resultado.errores_dian.join(' | ') || resultado.descripcion_dian || 'Rechazada por DIAN';
                await dbRun(
                    `UPDATE FacturasElectronicas SET estado = 'ERROR', estado_dian = ?, descripcion_dian = ?, error_mensaje = ? WHERE venta_id = ?`,
                    [resultado.estado_dian, resultado.descripcion_dian, errorMsg, ventaId]
                );
                return {
                    success: true,
                    ventaId,
                    dian_pendiente: true,
                    dian_error: errorMsg,
                    numero_factura: numeroFactura,
                };
            }
        } catch (err) {
            // Error de red o inesperado — la venta está guardada, la factura queda PENDIENTE para reintento
            console.error('[DIAN] Error al emitir factura:', err.message);
            await dbRun(
                `UPDATE FacturasElectronicas SET estado = 'PENDIENTE', error_mensaje = ? WHERE venta_id = ?`,
                [err.message, ventaId]
            );
            return {
                success: true,
                ventaId,
                dian_pendiente: true,
                dian_error: err.message,
                numero_factura: numeroFactura,
            };
        }
    });

    // --- CATEGORIAS ---
    ipcMain.handle('get-categorias', async () => {
        return dbAll('SELECT * FROM Categorias ORDER BY nombre ASC');
    });

    ipcMain.handle('save-categoria', async (event, nombre) => {
        const res = await dbRun('INSERT INTO Categorias (nombre) VALUES (?)', [nombre]);
        return { id: Number(res.lastInsertRowid), nombre };
    });

    ipcMain.handle('delete-categoria', async (event, id) => {
        try {
            await dbRun('BEGIN');
            await dbRun('UPDATE Productos SET categoria_id = NULL WHERE categoria_id = ?', [id]);
            await dbRun('DELETE FROM Categorias WHERE id = ?', [id]);
            await dbRun('COMMIT');
            return { success: true };
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }
    });

    // --- PRODUCTO CRUD ---
    ipcMain.handle('save-producto', async (event, producto) => {
        const {
            codigo, nombre, descripcion, precio_compra, precio_venta, iva_alicuota,
            tasa_internos, categoria_id, sucursal_id, stock_inicial, tipo_impuesto_co, es_producto_saludable
        } = producto;

        try {
            await dbRun('BEGIN');
            const res = await dbRun(
                `INSERT INTO Productos (codigo, nombre, descripcion, precio_compra, precio_venta, iva_alicuota,
                    tasa_internos, categoria_id, tipo_impuesto_co, es_producto_saludable)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    codigo, nombre, descripcion, precio_compra, precio_venta,
                    iva_alicuota || 21, tasa_internos || 0, categoria_id,
                    tipo_impuesto_co || 'IVA_19', es_producto_saludable ? 1 : 0
                ]
            );
            const productoId = Number(res.lastInsertRowid);
            await dbRun(
                `INSERT INTO Inventario (producto_id, sucursal_id, cantidad) VALUES (?, ?, ?)`,
                [productoId, sucursal_id, stock_inicial || 0]
            );
            await dbRun('COMMIT');
            return { success: true, id: productoId };
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }
    });

    ipcMain.handle('update-producto', async (event, producto) => {
        const {
            id, codigo, nombre, descripcion, precio_compra, precio_venta, iva_alicuota,
            tasa_internos, categoria_id, stock, sucursal_id, tipo_impuesto_co, es_producto_saludable
        } = producto;

        try {
            await dbRun('BEGIN');
            await dbRun(
                `UPDATE Productos SET codigo = ?, nombre = ?, descripcion = ?, precio_compra = ?, precio_venta = ?,
                    iva_alicuota = ?, tasa_internos = ?, categoria_id = ?, tipo_impuesto_co = ?, es_producto_saludable = ?
                 WHERE id = ?`,
                [
                    codigo, nombre, descripcion, precio_compra, precio_venta,
                    iva_alicuota || 21, tasa_internos || 0, categoria_id,
                    tipo_impuesto_co || 'IVA_19', es_producto_saludable ? 1 : 0, id
                ]
            );
            await dbRun(
                `INSERT OR REPLACE INTO Inventario (producto_id, sucursal_id, cantidad) VALUES (?, ?, ?)`,
                [id, sucursal_id, stock]
            );
            await dbRun('COMMIT');
            return { success: true };
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }
    });

    ipcMain.handle('delete-producto', async (event, id) => {
        try {
            await dbRun('BEGIN');
            await dbRun('DELETE FROM Inventario WHERE producto_id = ?', [id]);
            await dbRun('DELETE FROM Productos WHERE id = ?', [id]);
            await dbRun('COMMIT');
            return { success: true };
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }
    });

    // --- MOVIMIENTOS CAJA ---
    ipcMain.handle('get-movimientos', async (event, sucursal_id) => {
        return dbAll(
            `SELECT * FROM MovimientosCaja WHERE sucursal_id = ? ORDER BY fecha DESC`,
            [sucursal_id]
        );
    });

    // --- DETALLES DE VENTA ---
    ipcMain.handle('get-venta-detalle', async (event, ventaId) => {
        return dbAll(
            `SELECT dv.*, p.nombre as producto_nombre
             FROM DetallesVenta dv
             JOIN Productos p ON dv.producto_id = p.id
             WHERE dv.venta_id = ?`,
            [ventaId]
        );
    });

    ipcMain.handle('get-venta-por-id', async (event, ventaId) => {
        const venta = await dbGet(`SELECT * FROM Ventas WHERE id = ?`, [ventaId]);
        if (!venta) return null;

        // Adjuntar datos de la factura electrónica para reimprimir el ticket con CUFE + QR
        const fe = await dbGet(
            `SELECT numero_factura, cufe, estado, qr_base64, qr_dian_url FROM FacturasElectronicas WHERE venta_id = ?`,
            [ventaId]
        );
        if (fe) {
            venta.cude_local = venta.cude_local || fe.cufe;
            venta.dian_qr_base64 = fe.qr_base64 || null;
            venta.dian_qr_dian_url = fe.qr_dian_url || null;
            venta.dian_numero_factura = fe.numero_factura || null;
            venta.dian_pendiente = fe.estado === 'PENDIENTE' || fe.estado === 'ERROR';
        }
        const pref = await dbGet("SELECT valor FROM Configuracion WHERE clave = 'dian_prefijo'");
        venta.dian_prefijo = pref ? pref.valor : null;
        return venta;
    });

    // --- PROVEEDORES ---
    ipcMain.handle('get-proveedores', async () => {
        return dbAll('SELECT * FROM Proveedores ORDER BY nombre ASC');
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
        const res = await dbRun(query, [
            nombre, contacto || null, telefono || null, nombre_fantasia || null, cuit || null, nit || null,
            responsable_iva ? 1 : 0, responsabilidad_tributaria || 'R-99-PN', codigo_postal || null,
            email_facturacion || null, codigo_ciiu || null, condicion_iva || null, condicion_iibb || null,
            direccion || null, email_compras || null, email_pagos || null, plazo_pago || 0, cbu || null,
            rubro || null, saldo_actual || 0, preventista_nombre || null, preventista_telefono || null,
            dia_visita || null, dia_entrega || null, limite_credito || 0, minimo_compra || 0,
            moneda_compra || 'COP', retencion_ganancias || 0, retencion_iibb || 0,
            vencimiento_certificado_exencion || null, saldo_envases || 0
        ]);
        return { success: true, id: Number(res.lastInsertRowid) };
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

        const query = `
            UPDATE Proveedores SET
                nombre = ?, contacto = ?, telefono = ?, nombre_fantasia = ?, cuit = ?, nit = ?, responsable_iva = ?,
                responsabilidad_tributaria = ?, codigo_postal = ?, email_facturacion = ?, codigo_ciiu = ?,
                condicion_iva = ?, condicion_iibb = ?, direccion = ?, email_compras = ?,
                email_pagos = ?, plazo_pago = ?, cbu = ?, rubro = ?, saldo_actual = ?,
                preventista_nombre = ?, preventista_telefono = ?, dia_visita = ?, dia_entrega = ?,
                limite_credito = ?, minimo_compra = ?, moneda_compra = ?, retencion_ganancias = ?,
                retencion_iibb = ?, vencimiento_certificado_exencion = ?, saldo_envases = ?
            WHERE id = ?
        `;
        await dbRun(query, [
            nombre, contacto || null, telefono || null, nombre_fantasia || null, cuit || null, nit || null,
            responsable_iva ? 1 : 0, responsabilidad_tributaria || 'R-99-PN', codigo_postal || null,
            email_facturacion || null, codigo_ciiu || null, condicion_iva || null, condicion_iibb || null,
            direccion || null, email_compras || null, email_pagos || null, plazo_pago || 0, cbu || null,
            rubro || null, saldo_actual || 0, preventista_nombre || null, preventista_telefono || null,
            dia_visita || null, dia_entrega || null, limite_credito || 0, minimo_compra || 0,
            moneda_compra || 'COP', retencion_ganancias || 0, retencion_iibb || 0,
            vencimiento_certificado_exencion || null, saldo_envases || 0, id
        ]);
        return { success: true };
    });

    ipcMain.handle('delete-proveedor', async (event, id) => {
        try {
            await dbRun('BEGIN');
            await dbRun('UPDATE Productos SET proveedor_id = NULL WHERE proveedor_id = ?', [id]);
            await dbRun('DELETE FROM Proveedores WHERE id = ?', [id]);
            await dbRun('COMMIT');
            return { success: true };
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }
    });

    // --- PEDIDOS (ÓRDENES DE COMPRA) ---
    ipcMain.handle('get-pedidos-por-proveedor', async (event, proveedor_id, sucursal_id) => {
        return dbAll(
            `SELECT * FROM Pedidos WHERE proveedor_id = ? AND sucursal_id = ? ORDER BY fecha DESC`,
            [proveedor_id, sucursal_id]
        );
    });

    ipcMain.handle('get-detalle-pedido', async (event, pedido_id) => {
        return dbAll(
            `SELECT dp.*, p.nombre as producto_nombre, p.codigo
             FROM DetallesPedido dp
             JOIN Productos p ON dp.producto_id = p.id
             WHERE dp.pedido_id = ?`,
            [pedido_id]
        );
    });

    ipcMain.handle('save-pedido', async (event, pedidoData) => {
        const { proveedor_id, sucursal_id, total, items, cufe, fecha_emision_fe } = pedidoData;

        try {
            await dbRun('BEGIN');
            const resPedido = await dbRun(
                `INSERT INTO Pedidos (proveedor_id, sucursal_id, total, estado, pagado, cufe, fecha_emision_fe)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [proveedor_id, sucursal_id, total, 'PENDIENTE', 0, cufe || null, fecha_emision_fe || null]
            );
            const pedidoId = Number(resPedido.lastInsertRowid);

            for (const item of items) {
                await dbRun(
                    `INSERT INTO DetallesPedido (pedido_id, producto_id, cantidad, precio_compra_unitario, subtotal)
                     VALUES (?, ?, ?, ?, ?)`,
                    [pedidoId, item.producto_id, item.cantidad, item.precio_compra, item.subtotal]
                );
            }

            await dbRun('COMMIT');
            return { success: true, pedidoId };
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }
    });

    ipcMain.handle('confirmar-recepcion-pedido', async (event, pedido_id, sucursal_id) => {
        try {
            await dbRun('BEGIN');
            await dbRun("UPDATE Pedidos SET estado = 'RECIBIDO' WHERE id = ?", [pedido_id]);

            const detalles = await dbAll("SELECT * FROM DetallesPedido WHERE pedido_id = ?", [pedido_id]);

            for (const d of detalles) {
                await dbRun(
                    "UPDATE Productos SET precio_compra = ? WHERE id = ?",
                    [d.precio_compra_unitario, d.producto_id]
                );
                await dbRun(
                    `INSERT INTO Inventario (producto_id, sucursal_id, cantidad)
                     VALUES (?, ?, ?)
                     ON CONFLICT(producto_id, sucursal_id)
                     DO UPDATE SET cantidad = cantidad + ?`,
                    [d.producto_id, sucursal_id, d.cantidad, d.cantidad]
                );
            }

            await dbRun('COMMIT');
            return { success: true };
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }
    });

    ipcMain.handle('registrar-pago-pedido', async (event, pedido_id, sucursal_id, proveedor_id, total, pago_inmediato) => {
        try {
            await dbRun('BEGIN');
            await dbRun("UPDATE Pedidos SET pagado = 1 WHERE id = ?", [pedido_id]);

            if (pago_inmediato) {
                await dbRun(
                    `INSERT INTO MovimientosCaja (tipo, monto, concepto, sucursal_id, pedido_id) VALUES (?, ?, ?, ?, ?)`,
                    ['EGRESO', total, `Pago Orden Compra #${pedido_id}`, sucursal_id, pedido_id]
                );
                await dbRun('COMMIT');
                return { success: true, type: 'caja' };
            } else {
                await dbRun(
                    "UPDATE Proveedores SET saldo_actual = saldo_actual + ? WHERE id = ?",
                    [total, proveedor_id]
                );
                await dbRun('COMMIT');
                return { success: true, type: 'cc' };
            }
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }
    });

    ipcMain.handle('get-pedido-por-id', async (event, pedido_id) => {
        return dbGet(
            `SELECT pe.*, pro.nombre as proveedor_nombre, pro.nit as proveedor_nit
             FROM Pedidos pe
             JOIN Proveedores pro ON pe.proveedor_id = pro.id
             WHERE pe.id = ?`,
            [pedido_id]
        );
    });

    ipcMain.handle('update-pedido-dian-events', async (event, id, eventos) => {
        const { evento_acuse_recibo, evento_recibo_bienes, evento_aceptacion_expresa } = eventos;
        await dbRun(
            `UPDATE Pedidos SET evento_acuse_recibo = ?, evento_recibo_bienes = ?, evento_aceptacion_expresa = ? WHERE id = ?`,
            [evento_acuse_recibo ? 1 : 0, evento_recibo_bienes ? 1 : 0, evento_aceptacion_expresa ? 1 : 0, id]
        );
        return { success: true };
    });

    // --- EMPLEADOS (RRHH) ---
    ipcMain.handle('get-empleados', async (event, sucursal_id) => {
        let query = `SELECT * FROM Empleados WHERE (estado = 'Activo' OR estado IS NULL)`;
        const params = [];
        if (sucursal_id) {
            query += ' AND sucursal_id = ?';
            params.push(sucursal_id);
        }
        return dbAll(query, params);
    });

    ipcMain.handle('get-empleados-desvinculados', async () => {
        return dbAll(`SELECT * FROM Empleados WHERE estado = 'Desvinculado' ORDER BY fecha_egreso DESC`);
    });

    ipcMain.handle('save-empleado', async (event, empleado) => {
        const {
            nombre, cargo, tarifa_hora, sucursal_id, dni, cuil,
            cedula_ciudadania, rut, eps, fondo_pensiones, arl,
            direccion, partido, localidad, obra_social, fecha_ingreso,
            categoria_cct, sueldo_basico, jornada_laboral, horas_parcial, contrato_filepath,
            modalidad_contratacion, telefono, ajustes_proximos_json
        } = empleado;

        const query = `
            INSERT INTO Empleados (
                nombre, cargo, tarifa_hora, sucursal_id, dni, cuil,
                cedula_ciudadania, rut, eps, fondo_pensiones, arl,
                direccion, partido, localidad, obra_social, fecha_ingreso,
                categoria_cct, sueldo_basico, jornada_laboral, horas_parcial, contrato_filepath,
                modalidad_contratacion, telefono, ajustes_proximos_json, estado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo')
        `;
        const res = await dbRun(query, [
            nombre, cargo || null, tarifa_hora || 0, sucursal_id || null, dni || null, cuil || null,
            cedula_ciudadania || null, rut || null, eps || null, fondo_pensiones || null, arl || null,
            direccion || null, partido || null, localidad || null, obra_social || null, fecha_ingreso || null,
            categoria_cct || null, sueldo_basico || 0, jornada_laboral || null, horas_parcial || 0,
            contrato_filepath || null, modalidad_contratacion || 'Formal', telefono || null, ajustes_proximos_json || null
        ]);
        return { success: true, id: Number(res.lastInsertRowid) };
    });

    ipcMain.handle('update-empleado', async (event, empleado) => {
        const {
            id, nombre, cargo, tarifa_hora, sucursal_id, dni, cuil,
            cedula_ciudadania, rut, eps, fondo_pensiones, arl,
            direccion, partido, localidad, obra_social, fecha_ingreso,
            categoria_cct, sueldo_basico, jornada_laboral, horas_parcial, contrato_filepath,
            modalidad_contratacion, telefono, ajustes_proximos_json
        } = empleado;

        const query = `
            UPDATE Empleados SET
                nombre = ?, cargo = ?, tarifa_hora = ?, sucursal_id = ?, dni = ?, cuil = ?,
                cedula_ciudadania = ?, rut = ?, eps = ?, fondo_pensiones = ?, arl = ?,
                direccion = ?, partido = ?, localidad = ?, obra_social = ?, fecha_ingreso = ?,
                categoria_cct = ?, sueldo_basico = ?, jornada_laboral = ?, horas_parcial = ?, contrato_filepath = ?,
                modalidad_contratacion = ?, telefono = ?, ajustes_proximos_json = ?
            WHERE id = ?
        `;
        await dbRun(query, [
            nombre, cargo || null, tarifa_hora || 0, sucursal_id || null, dni || null, cuil || null,
            cedula_ciudadania || null, rut || null, eps || null, fondo_pensiones || null, arl || null,
            direccion || null, partido || null, localidad || null, obra_social || null, fecha_ingreso || null,
            categoria_cct || null, sueldo_basico || 0, jornada_laboral || null, horas_parcial || 0,
            contrato_filepath || null, modalidad_contratacion || 'Formal', telefono || null,
            ajustes_proximos_json || null, id
        ]);
        return { success: true };
    });

    ipcMain.handle('delete-empleado', async (event, id) => {
        await dbRun('DELETE FROM Empleados WHERE id = ?', [id]);
        return { success: true };
    });

    ipcMain.handle('desvincular-empleado', async (event, { id, causal_egreso, fecha_egreso, indemnizacion_json }) => {
        await dbRun(
            `UPDATE Empleados SET estado = 'Desvinculado', causal_egreso = ?, fecha_egreso = ?, indemnizacion_json = ? WHERE id = ?`,
            [causal_egreso, fecha_egreso, indemnizacion_json || null, id]
        );
        return { success: true };
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

            try {
                await dbRun('UPDATE Empleados SET contrato_filepath = ? WHERE id = ?', [destPath, empleadoId]);
                return { success: true, filepath: destPath };
            } catch (err) {
                return { success: false, error: err.message };
            }
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

            await dbRun('UPDATE Empleados SET contrato_filepath = ? WHERE id = ?', [destPath, empleadoId]);
            return { success: true, filepath: destPath };
        } catch (error) {
            console.error('Error uploading contract:', error);
            throw error;
        }
    });

    // --- LIQUIDACIONES DE SUELDO ---
    ipcMain.handle('save-liquidacion', async (event, liquidacionData) => {
        const { empleado_id, periodo, fecha_pago, banco_deposito, total_bruto, total_retenciones, total_neto, conceptos } = liquidacionData;

        try {
            await dbRun('BEGIN');
            const resLiq = await dbRun(
                `INSERT INTO Liquidaciones (empleado_id, periodo, fecha_pago, banco_deposito, total_bruto, total_retenciones, total_neto)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [empleado_id, periodo, fecha_pago, banco_deposito, total_bruto, total_retenciones, total_neto]
            );
            const liquidacionId = Number(resLiq.lastInsertRowid);

            for (const c of conceptos) {
                await dbRun(
                    `INSERT INTO ConceptosLiquidacion (liquidacion_id, tipo, descripcion, unidad, importe) VALUES (?, ?, ?, ?, ?)`,
                    [liquidacionId, c.tipo, c.descripcion, c.unidad || null, c.importe]
                );
            }

            await dbRun('COMMIT');
            return { success: true, liquidacionId };
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }
    });

    ipcMain.handle('get-liquidaciones-empleado', async (event, empleado_id) => {
        const liquidaciones = await dbAll(
            'SELECT * FROM Liquidaciones WHERE empleado_id = ? ORDER BY id DESC',
            [empleado_id]
        );

        const results = [];
        for (const liq of liquidaciones) {
            const conceptos = await dbAll(
                'SELECT * FROM ConceptosLiquidacion WHERE liquidacion_id = ?',
                [liq.id]
            );
            results.push({ ...liq, conceptos });
        }
        return results;
    });

    // --- USUARIOS Y AUTENTICACIÓN ---
    ipcMain.handle('login', async (event, username, password) => {
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        const query = `
            SELECT u.id, u.username, u.rol, u.empleado_id, u.nombre_propietario, e.nombre as empleado_nombre
            FROM Usuarios u
            LEFT JOIN Empleados e ON u.empleado_id = e.id
            WHERE u.username = ? AND u.password_hash = ?
        `;
        const row = await dbGet(query, [username, hash]);
        if (row) {
            return { success: true, user: row };
        } else {
            return { success: false, error: 'Usuario o contraseña incorrectos' };
        }
    });

    ipcMain.handle('get-usuarios', async () => {
        return dbAll(
            `SELECT u.id, u.username, u.rol, u.empleado_id, u.fecha_creacion, u.nombre_propietario, e.nombre as empleado_nombre
             FROM Usuarios u
             LEFT JOIN Empleados e ON u.empleado_id = e.id
             ORDER BY u.id ASC`
        );
    });

    ipcMain.handle('save-usuario', async (event, userData) => {
        const { username, password, rol, empleado_id, nombre_propietario } = userData;
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        const empId = empleado_id || null;

        try {
            const res = await dbRun(
                'INSERT INTO Usuarios (username, password_hash, rol, empleado_id, nombre_propietario) VALUES (?, ?, ?, ?, ?)',
                [username, hash, rol, empId, nombre_propietario || null]
            );
            return { success: true, id: Number(res.lastInsertRowid) };
        } catch (err) {
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
                return { success: false, error: 'El nombre de usuario ya existe.' };
            }
            throw err;
        }
    });

    ipcMain.handle('update-usuario', async (event, userData) => {
        const { id, username, password, rol, empleado_id, nombre_propietario } = userData;
        const empId = empleado_id || null;

        if (password && password.trim() !== '') {
            const hash = crypto.createHash('sha256').update(password).digest('hex');
            await dbRun(
                'UPDATE Usuarios SET username = ?, password_hash = ?, rol = ?, empleado_id = ?, nombre_propietario = ? WHERE id = ?',
                [username, hash, rol, empId, nombre_propietario || null, id]
            );
        } else {
            await dbRun(
                'UPDATE Usuarios SET username = ?, rol = ?, empleado_id = ?, nombre_propietario = ? WHERE id = ?',
                [username, rol, empId, nombre_propietario || null, id]
            );
        }
        return { success: true };
    });

    ipcMain.handle('delete-usuario', async (event, id) => {
        const row = await dbGet('SELECT username FROM Usuarios WHERE id = ?', [id]);
        if (row && row.username === 'Principal') {
            return { success: false, error: 'No se puede eliminar el usuario Principal.' };
        }
        await dbRun('DELETE FROM Usuarios WHERE id = ?', [id]);
        return { success: true };
    });

    // --- AJUSTES DEL NEGOCIO ---
    ipcMain.handle('get-settings', async () => {
        const rows = await dbAll("SELECT clave, valor FROM Configuracion WHERE clave NOT LIKE 'license%'");
        const settings = {};
        if (rows) {
            rows.forEach(row => { settings[row.clave] = row.valor; });
        }
        return settings;
    });

    ipcMain.handle('save-settings', async (event, settings) => {
        try {
            await dbRun('BEGIN');
            for (const [clave, valor] of Object.entries(settings)) {
                await dbRun(
                    "INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES (?, ?)",
                    [clave, String(valor)]
                );
            }
            await dbRun('COMMIT');
            return { success: true };
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => { });
            throw err;
        }
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
        const hwId = machineIdSync({ original: true });
        const row = await dbGet("SELECT valor FROM Configuracion WHERE clave = 'license_key'");

        if (!row) {
            return { activated: false, machineId: hwId };
        }

        const savedKey = row.valor;
        const hash = crypto.createHmac('sha256', SECRET_SALT).update(hwId).digest('hex');
        const expectedKey = hash.substring(0, 16).toUpperCase().match(/.{1,4}/g).join('-');

        return { activated: savedKey === expectedKey, machineId: hwId };
    });

    ipcMain.handle('activate-license', async (event, enteredKey) => {
        const hwId = machineIdSync({ original: true });
        const hash = crypto.createHmac('sha256', SECRET_SALT).update(hwId).digest('hex');
        const expectedKey = hash.substring(0, 16).toUpperCase().match(/.{1,4}/g).join('-');

        if (enteredKey.trim() === expectedKey) {
            await dbRun(
                "INSERT OR REPLACE INTO Configuracion (clave, valor) VALUES ('license_key', ?)",
                [expectedKey]
            );
            return { success: true };
        } else {
            return { success: false, error: 'Clave de activación inválida para este equipo.' };
        }
    });

    // --- CONEXIÓN TURSO (una base por negocio) ---
    ipcMain.handle('get-turso-status', async () => {
        const tenant = readTenant();
        const maskUrl = (u) => {
            if (!u) return null;
            const host = String(u).replace(/^\w+:\/\//, '');       // saca libsql:// o https://
            const sub = host.split('.')[0] || host;
            return sub.length > 8 ? `${sub.slice(0, 8)}….turso.io` : `${sub}.turso.io`;
        };
        let fuente = 'ninguna';
        if (tenant) fuente = 'instalacion';
        else if (secret('TURSO_DATABASE_URL')) fuente = 'build';

        return {
            syncEnabled,                       // estado real con el que arrancó la app
            fuente,                            // 'instalacion' | 'build' | 'ninguna'
            urlActual: maskUrl(tursoUrl),
            tieneConfigInstalacion: Boolean(tenant),
        };
    });

    ipcMain.handle('set-turso-config', async (event, { url, token }) => {
        url = (url || '').trim();
        token = (token || '').trim();
        if (!url || !token) {
            return { success: false, error: 'Faltan la URL o el token de Turso.' };
        }
        if (!/^libsql:\/\/|^https:\/\//.test(url)) {
            return { success: false, error: 'La URL debe empezar con libsql:// o https://' };
        }

        // Probar la conexión antes de guardar
        try {
            const test = createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken: token });
            await test.execute('SELECT 1');
        } catch (err) {
            return { success: false, error: `No se pudo conectar: ${err.message}` };
        }

        try {
            writeTenant({ url, token });
            markReplicaReset();
        } catch (err) {
            return { success: false, error: `No se pudo guardar la configuración: ${err.message}` };
        }
        return { success: true, restartRequired: true };
    });

    ipcMain.handle('clear-turso-config', async () => {
        try {
            writeTenant(null);
            markReplicaReset();
            return { success: true, restartRequired: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('restart-app', async () => {
        app.relaunch();
        app.exit(0);
    });

    // --- CLIENTES (Colombia 2026 - Ley 1581 Habeas Data) ---
    ipcMain.handle('get-clients', async (event, opts) => {
        const search = opts?.search || '';
        if (search) {
            return dbAll(
                `SELECT * FROM Clientes WHERE nombre LIKE ? OR email LIKE ? OR nit_cedula LIKE ? ORDER BY nombre ASC`,
                [`%${search}%`, `%${search}%`, `%${search}%`]
            );
        }
        return dbAll(`SELECT * FROM Clientes ORDER BY nombre ASC`);
    });

    ipcMain.handle('add-client', async (event, client) => {
        const { nombre, telefono, email, nit_cedula, eps, fondo_pensiones, arl, autoriza_datos, fecha_autorizacion, datos_suprimidos } = client;
        const res = await dbRun(
            `INSERT INTO Clientes (nombre, telefono, email, nit_cedula, eps, fondo_pensiones, arl, autoriza_datos, fecha_autorizacion, datos_suprimidos)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                nombre, telefono || null, email || null, nit_cedula || null,
                eps || null, fondo_pensiones || null, arl || null,
                autoriza_datos || 0, fecha_autorizacion || null, datos_suprimidos || 0
            ]
        );
        return { success: true, id: Number(res.lastInsertRowid) };
    });

    ipcMain.handle('update-client', async (event, client) => {
        const { id, nombre, telefono, email, nit_cedula, eps, fondo_pensiones, arl, autoriza_datos, fecha_autorizacion, datos_suprimidos } = client;
        await dbRun(
            `UPDATE Clientes SET nombre = ?, telefono = ?, email = ?, nit_cedula = ?, eps = ?, fondo_pensiones = ?, arl = ?,
             autoriza_datos = ?, fecha_autorizacion = ?, datos_suprimidos = ? WHERE id = ?`,
            [
                nombre, telefono || null, email || null, nit_cedula || null,
                eps || null, fondo_pensiones || null, arl || null,
                autoriza_datos || 0, fecha_autorizacion || null, datos_suprimidos || 0, id
            ]
        );
        return { success: true };
    });

    // Ley 1581 — Derecho a la supresión de datos (Art. 8 literal e)
    ipcMain.handle('suprimir-datos-cliente', async (event, { id }) => {
        await dbRun(
            `UPDATE Clientes SET nombre = '[SUPRIMIDO]', telefono = NULL, email = NULL, nit_cedula = NULL,
             eps = NULL, fondo_pensiones = NULL, arl = NULL, autoriza_datos = 0, datos_suprimidos = 1 WHERE id = ?`,
            [id]
        );
        return { success: true };
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

    // --- FACTURAS ELECTRÓNICAS DIAN ---

    ipcMain.handle('get-facturas-pendientes', async () => {
        const [rows, pref] = await Promise.all([
            dbAll(
                `SELECT fe.*, v.total, v.fecha AS fecha_venta, v.sucursal_id, v.cliente_identificacion
                 FROM FacturasElectronicas fe
                 JOIN Ventas v ON fe.venta_id = v.id
                 WHERE fe.estado IN ('PENDIENTE', 'ERROR')
                 ORDER BY fe.fecha_emision DESC`
            ),
            dbGet("SELECT valor FROM Configuracion WHERE clave = 'dian_prefijo'"),
        ]);
        const prefijo = pref ? pref.valor : '';
        return rows.map((r) => ({ ...r, prefijo }));
    });

    // Solo el conteo — para el badge del menú lateral
    ipcMain.handle('get-facturas-pendientes-count', async () => {
        const row = await dbGet(
            `SELECT COUNT(*) AS n FROM FacturasElectronicas WHERE estado IN ('PENDIENTE', 'ERROR')`
        );
        return row ? Number(row.n) : 0;
    });

    // Reintenta en lote todas las pendientes + con error (ignora el backoff)
    ipcMain.handle('reintentar-todas-facturas', async () => {
        return procesarPendientes({ soloAuto: false });
    });

    ipcMain.handle('get-factura-por-venta', async (event, venta_id) => {
        return dbGet(
            `SELECT * FROM FacturasElectronicas WHERE venta_id = ?`,
            [venta_id]
        );
    });

    ipcMain.handle('reintentar-factura', async (event, venta_id) => {
        const r = await procesarFactura(venta_id, { auto: false });
        return {
            success: r.success,
            dian_emitida: r.success,
            estado: r.estado,
            cufe: r.cufe || null,
            error: r.success ? null : r.error,
        };
    });
}

module.exports = { setupIpcHandlers };
