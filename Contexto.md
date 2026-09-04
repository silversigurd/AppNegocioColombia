# Contexto para Claude Code — CommerceOS Pro (Turso + DIAN)

## ⏸️ ESTADO ACTUAL (2026-09-04) — En pausa, esperando primer cliente real

**Dónde estamos:** el desarrollo técnico del sistema (POS, Turso, facturación DIAN) está funcionalmente completo y probado contra el sandbox de MATIAS. Versión actual: **v1.1.8** — sobre la base de v1.1.7 (commit `35782af`) se sumó una ronda de fixes de uso real en Inventario y POS (ver detalle más abajo: borrado de productos, velocidad de "Confirmar Pago", vista previa de ticket, export a Excel).

**Por qué estamos parados:** para seguir avanzando en serio (probar con datos reales, habilitación real ante la DIAN, ajustar impuesto saludable IBUA/ICUI con casos reales, numeración sin huecos, onboarding real vía `build:cliente`) hace falta un **negocio real habilitado** que provea:
- NIT y datos fiscales reales (para pasar de sandbox a producción en MATIAS).
- Catálogo de productos e impuestos reales (para validar IBUA/ICUI, que hoy es una aproximación).
- Uso real del POS para encontrar bugs que el sandbox no expone.

Sin ese cliente, seguir "adelantando" trabajo es especulativo — el roadmap de mejoras DIAN (#3 y #5, ver abajo) quedó **deliberadamente pausado** a la espera de decidir con el usuario cuál sigue, en vez de seguir construyendo a ciegas.

**Lo que SÍ quedó listo mientras se espera:**
- Motor de facturación electrónica (emisión, consulta de estado, notas crédito, reintentos automáticos, PDF/QR) — verificado end-to-end contra sandbox.
- Manejo de credenciales por-negocio (Turso + MATIAS_API_KEY horneados por build) y script `build:cliente` para generar un instalador por cliente — **nunca usado todavía** (no existe `scripts/clientes.local.json` ni nada en `dist-clientes/`), es la vía pensada para cuando aparezca el primer cliente.
- UI de facturas/notas crédito pendientes con reintento manual y automático.

**Qué falta decidir/hacer cuando aparezca el cliente:**
1. Elegir con el usuario si seguir #3 (IBUA/ICUI real) o #5 (numeración sin huecos) del roadmap — o directamente priorizar lo que el cliente real necesite.
2. Migrar la cuenta MATIAS de sandbox a producción para ese negocio (requiere certificado digital + resolución DIAN real del cliente).
3. Correr `npm run build:cliente -- <slug>` por primera vez de punta a punta.
4. Deuda técnica pendiente sin urgencia: sacar `sqlite3` de `dependencies`/scripts de build (ya no se usa, quedó de antes de Turso).

**Instrucción para todas las sesiones:** cada vez que se haga un cambio real en el proyecto durante esta conversación, actualizar esta sección (y el resto del documento si corresponde) para que `Contexto.md` refleje siempre el estado vigente.

**2026-09-04 — fix: no se podían borrar productos con historial en Inventario.** Causa: `delete-producto` (`ipcHandlers.cjs`) hacía `DELETE FROM Productos` sin chequear si el producto tenía ventas (`DetallesVenta`) o pedidos (`DetallesPedido`) asociados; esas tablas tienen FK a `Productos` sin `ON DELETE CASCADE`/`SET NULL`, así que la query fallaba con `SQLITE_CONSTRAINT: FOREIGN KEY constraint failed` — y el error solo se logueaba en consola, nunca se mostraba al usuario, por eso "no dejaba" sin explicación. Confirmado el bug real reproduciéndolo contra una copia offline del `commerce_data_local.db` real (no se tocó la base real ni Turso).
- Fix: columna nueva `Productos.activo` (`db.cjs`, migración idempotente, default 1). `delete-producto` ahora chequea si el producto tiene ventas/pedidos; si tiene, hace soft-delete (`activo=0`, se oculta pero preserva el historial/facturación vieja intacta); si no tiene, borra en serio como antes. `get-productos` ahora filtra `WHERE activo = 1`.
- Edición de productos (`update-producto`) se revisó de punta a punta: no tenía el bug, el flujo ya andaba bien (queda confirmado, no se tocó código de edición).
- **Regresión propia detectada y corregida en la misma sesión:** el aviso de soft-delete se implementó primero con `window.alert()`, y eso rompió el modal de "Nuevo Producto" (los inputs dejaban de aceptar teclado) — bug conocido de Electron: al cerrarse un `alert()` nativo, la ventana no siempre recupera el foco de teclado del renderer. `POS.tsx` ya tenía documentado este mismo problema con un toast inline ("no roba el foco como window.alert"). Se replicó ese patrón en `Inventory.tsx`: estado `toast`/`showToast()` + banner fijo arriba (`z-[300]`, autodesaparece a los 4s), y se migraron **todos** los `alert()` de la página (guardar producto, borrar producto, agregar/borrar categoría) al mismo toast — no solo los que yo había agregado.
- Verificado: `tsc --noEmit` y `eslint` limpios. Probado en runtime real vía `npm run electron:dev` (HMR aplicó el fix sin errores). Falta: que el usuario confirme en la ventana abierta que el modal de "Nuevo Producto" ya acepta texto con normalidad después de borrar un producto.

**2026-09-04 — fix: "Confirmar Pago" lento + no hay vista previa del ticket.** Dos pedidos del usuario en la misma sesión.
1. **"Confirmar Pago" tardaba mucho.** Causa confirmada: `save-venta` (`ipcHandlers.cjs`) hacía `await emitirFactura(...)` (llamada de red a MATIAS/DIAN) **dentro** del mismo handler IPC que "Confirmar Pago" espera — el botón quedaba bloqueado hasta que la DIAN respondía. Fix: la venta se guarda igual que antes (rápido, todo local), se reserva el número de factura y se inserta la fila `FacturasElectronicas` en PENDIENTE (también local, rápido), pero la llamada a MATIAS ahora se dispara con `procesarFactura(ventaId)` **sin awaitear** (fire-and-forget) — se reutilizó tal cual el núcleo que ya usa el job de reintento automático (`facturacionPendientes.cjs`), así que se sacaron ~80 líneas duplicadas de `save-venta`. El handler devuelve al instante con `dian_procesando: true`. El frontend (`POS.tsx`) muestra "⏳ Emitiendo factura electrónica…" y hace polling de `get-factura-por-venta` cada 2s (hasta 8 intentos) para completar el CUFE/QR en el modal y en el ticket apenas la DIAN responde; si tarda más, el job de reintento ya existente la termina tomando igual. El ticket ya sabía mostrar "factura EN TRÁMITE" para este caso (no hizo falta tocar `Ticket.tsx` para esto).
2. **Vista previa del ticket.** El diálogo nativo de impresión de Windows decía "esta aplicación no admite la vista previa de impresión" — es una limitación de cómo Electron integra `window.print()` con el diálogo nativo en Windows (no hay flag simple para habilitar el preview de ese diálogo). Se implementó vista previa propia: `Ticket.tsx` ahora acepta un prop `preview` (si es true, no aplica la clase `print-only` que lo mantiene siempre oculto salvo al imprimir). En `POS.tsx`, el modal "¡Venta Exitosa!" ahora tiene un botón "Vista Previa del Ticket" que abre un modal propio (scrolleable, `no-print`) con el ticket renderizado tal cual va a salir por impresora, más un botón "Imprimir" adentro.
- Verificado: `tsc --noEmit` y `eslint` limpios (sin regresiones nuevas — quedan 2 warnings/errores preexistentes de antes de esta sesión, no tocados). Falta: probar en la app real que 1) el pago se confirma rápido y el CUFE aparece solo unos segundos después, y 2) la vista previa muestra el ticket bien.
- **Nota operativa de esta sesión:** al reiniciar `npm run electron:dev` varias veces, quedaron procesos `electron.exe`/`vite` colgados de corridas anteriores (Windows no siempre mata el árbol completo al cerrar la ventana) ocupando el puerto 5173 y abriendo una segunda ventana con backend desactualizado. Se identificaron por `CommandLine` (`Get-CimInstance Win32_Process`) antes de matarlos, para no tocar nada que no fuera de esta sesión de dev. Si vuelve a pasar: cerrar la ventana de la app no alcanza, hay que matar el proceso a mano o reiniciar antes de seguir probando.

**2026-09-04 — fix: Excel de Inventario mal estructurado.** `handleExportExcel` (`Inventory.tsx`) generaba la hoja con `utils.json_to_sheet()` sin definir `!cols` (ancho de columna) ni formato numérico — Excel abre eso con el ancho default angosto (~8 caracteres), así que encabezados largos como "Valorización Costo ($)" quedaban cortados/amontonados y los números salían pelados sin separador de miles. Reproducido generando el .xlsx real con una copia offline de la base (misma técnica que las otras veces, sin tocar la base real) para confirmar antes de tocar código.
- Fix: se calcula `ws['!cols']` por columna según el contenido más largo (encabezado incluido, tope 40 caracteres) para que cada columna tenga el ancho que necesita; y se aplica formato `#,##0` (separador de miles) a las columnas numéricas (Stock, Costo Unitario, Precio Venta, Valorización Costo, Valorización Venta). De paso, `p.stock` ahora usa `?? 0` en vez de multiplicarse crudo (evita `NaN`/vacío si un producto no tiene fila de `Inventario` para la sucursal).
- Verificado: se regeneró el .xlsx con la misma lógica ya corregida contra datos reales (offline) y se confirmó `!cols` con anchos por columna + celdas con `z: '#,##0'`. `tsc`/`eslint` limpios.

---

## Qué es este proyecto
CommerceOS Pro (repo: `AppNegocioColombia`) es un sistema de gestión comercial para negocios en Colombia: POS, Inventario, Clientes, Proveedores/Compras, Finanzas y RRHH (con cálculo de liquidaciones según Ley 2466 de 2025 / CST Colombiano). Está construido en **Electron + React/TypeScript + Vite**, con backend en `src/backend/` usando archivos `.cjs`.

Este documento cubre dos frentes de trabajo dentro del plan más amplio para hacer el sistema comercialmente viable (ver también `CAMBIOS_CommerceOS_Pro.md` si existe en el repo):
1. Migración de la base de datos de SQLite local a **Turso** (SQLite distribuido en la nube, vía `@libsql/client`) — **completada**, ver sección de abajo.
2. Integración de **facturación electrónica DIAN** vía MATIAS API — **en curso**, es lo que sigue.

## Por qué se está haciendo esto
- La base actual (`commerce_data.sqlite`) vive solo local en la máquina del usuario, con backup manual.
- Turso permite mantener el modo "embedded replica": el sistema sigue leyendo/escribiendo local (rápido, funciona offline — crítico para un local con wifi inestable) mientras sincroniza en background con la nube.
- Esto da respaldo automático, la base para multi-sucursal a futuro, y es el mismo lugar donde después se van a guardar los datos de facturación electrónica DIAN (CUFE, estado de aprobación) cuando se implemente esa parte.

## Estado actual — YA COMPLETADO
1. ✅ Cuenta de Turso creada, CLI instalada y autenticada (vía WSL en Windows).
2. ✅ Base de datos creada en Turso: `commerceos-pro`, región `aws-us-east-1` (Virginia).
3. ✅ URL de conexión obtenida: `libsql://commerceos-pro-silversigurd.aws-us-east-1.turso.io`
4. ✅ Token de acceso a la base generado (guardado en `.env`, NO en este documento).
5. ✅ `.env` creado en la raíz del proyecto con `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
6. ✅ `.env` agregado al `.gitignore`.

## Estado actual — PENDIENTE (esto es lo que sigue)

### Paso 4 — Instalar dependencias
```
npm install @libsql/client dotenv
```

### Paso 5 — Cargar variables de entorno en el proceso principal de Electron
En `main.cjs`, como primera línea del archivo (antes de cualquier otro `require`):
```js
require('dotenv').config();
```
Esto es necesario porque `db.cjs` va a leer `process.env.TURSO_DATABASE_URL` y `process.env.TURSO_AUTH_TOKEN`.

### Paso 6 — Reescribir `src/backend/db.cjs`
El archivo actual usa el paquete `sqlite3` con callbacks envueltos en promesas manualmente. Hay que reemplazar la conexión por `@libsql/client`, que ya es async/await nativo. Estructura objetivo:

```js
const { createClient } = require('@libsql/client');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { app } = require('electron');

const isProd = process.mainModule.filename.indexOf('app.asar') !== -1;
const localDbPath = isProd
  ? path.join(app.getPath('userData'), 'commerce_data_local.db')
  : path.join(__dirname, '..', '..', 'commerce_data_local.db');

// Embedded replica: escribe/lee local (rápido, funciona offline)
// y sincroniza en background con Turso cuando hay internet
const db = createClient({
  url: `file:${localDbPath}`,
  syncUrl: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
  syncInterval: 60, // segundos
});

// Sincronización inicial al arrancar
db.sync().catch((err) => console.error('Error en sync inicial:', err));

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
```

**Importante:** las funciones `dbRun`/`dbGet` mantienen la misma firma hacia afuera (siguen siendo funciones `async` que se usan con `await`), así que el código que ya las llama en el resto del proyecto no debería necesitar cambios — salvo lo del Paso 7.

El resto de `db.cjs` (el bloque `initDb()` con todos los `CREATE TABLE IF NOT EXISTS` — Sucursales, Empleados, etc.) **no necesita reescritura**, es SQL estándar compatible con libSQL. Solo confirmar que `initDb()` se siga invocando al levantar la app.

### Paso 7 — Revisar usos directos de la API vieja de sqlite3
Buscar si en `src/backend/ipcHandlers.cjs` (o cualquier otro archivo) se llama directamente a `db.get(...)`, `db.all(...)` o `db.run(...)` con la sintaxis de callback de `sqlite3`, en vez de pasar por los helpers `dbRun`/`dbGet`/`dbAll`. Esa sintaxis no existe en `@libsql/client` y hay que migrarla.
```
grep -rn "db\.\(get\|all\|run\)(" src/
```
Cualquier resultado encontrado ahí debe reescribirse para usar `dbRun`, `dbGet`, `dbAll`, o `db.execute()` directamente con `await`.

### Paso 8 — Actualizar `.gitignore`
El nuevo archivo de réplica local tampoco debe subirse al repo:
```
echo "commerce_data_local.db" >> .gitignore
```

### Paso 9 — Probar
1. Correr la app en modo dev.
2. Hacer una operación de prueba (crear un empleado, una venta).
3. Cortar la conexión a internet y hacer otra operación — debe seguir funcionando (embedded replica local).
4. Reconectar y esperar el `syncInterval` (60s), o forzar sync manual llamando `db.sync()`.
5. Verificar en el dashboard de Turso (turso.tech → base `commerceos-pro` → Data) que los datos aparecen ahí.

## Notas sobre la migración a Turso
- El proyecto ya tenía datos reales de prueba en `commerce_data.sqlite` (ruta: `%APPDATA%\CommerceOS Pro Colombia\` en producción, o raíz del proyecto en dev). Si hace falta migrar datos existentes de ese archivo a la nueva base, avisar antes de sobreescribir nada — no asumir que hay que migrar automáticamente.
- No hardcodear la URL ni el token de Turso en ningún archivo del código fuente — siempre vía `process.env`.
- Mantener el mismo patrón de nombres de tabla y columnas ya existente (Sucursales, Empleados, etc.) — no renombrar nada como parte de esta migración.
- **Estado: verificado y funcionando.** Se confirmaron escrituras y sincronización real (datos de prueba visibles tanto local como en el dashboard de Turso, sección Edit Data).

---

## Frente 2 — Integración de facturación electrónica DIAN (MATIAS API)

### Por qué
Sin esto el sistema no es apto para operar legalmente con un negocio formal en Colombia (facturación electrónica obligatoria por ley). Es la prioridad más alta del plan comercial completo — sin esto no hay venta posible.

### Proveedor elegido: MATIAS API
- Modalidad "Software Propio": cada negocio que factura queda habilitado directamente ante la DIAN con su propio NIT — no hay intermediario legal entre el negocio y la DIAN, MATIAS solo provee la conexión técnica (arma el XML UBL 2.1, firma digitalmente, transmite, devuelve CUFE).
- Tiene un plan específico de **"Casa de Software"** pensado para este caso exacto: un desarrollador que construye un sistema y lo distribuye a múltiples clientes/negocios, cada uno facturando por separado bajo la misma integración técnica.
- Sandbox 100% gratuito, sin contrato, mismos endpoints que producción — ideal para desarrollar y probar todo el flujo antes de tener un cliente real pagando.

### Estado actual
- ✅ Identificado el proveedor y el plan a usar.
- ⬜ **Pendiente:** crear cuenta en el sandbox (esto lo hace el usuario manualmente en el navegador, no es tarea de código):
  - URL de registro: `https://sandbox-auth.matias-api.com/`
  - Documentación técnica: `https://docs.matias-api.com/`
  - API sandbox: `sandbox-api.matias-api.com`
- ⬜ Generar API key de sandbox una vez creada la cuenta.

### Lo que sigue una vez haya API key de sandbox (esto sí es Claude Code)
1. Agregar `MATIAS_API_KEY` (o el nombre de variable que indique la doc) al `.env` — nunca hardcodeada.
2. Revisar la documentación de MATIAS (`docs.matias-api.com`) para el endpoint de emisión de factura y el formato exacto del JSON esperado (emisor, adquiriente, ítems, impuestos).
3. En el módulo POS (buscar el handler correspondiente en `src/backend/ipcHandlers.cjs`), agregar el paso de emisión de factura electrónica **después de confirmar el pago**: armar el payload con los datos de la venta, hacer el `POST` al endpoint de MATIAS, y esperar la respuesta.
4. Extender el schema de la tabla de ventas (o crear una tabla relacionada, ej. `FacturasElectronicas`) para guardar: CUFE, estado de aprobación DIAN, URL del XML firmado, URL del PDF. Esto va en la misma base Turso ya migrada.
5. Manejar fallos de conexión: si el POST a MATIAS falla (sin internet, error del servicio), la venta debe poder completarse igual en el sistema (no bloquear el POS), pero queda marcada como "factura pendiente de emisión" para reintentar cuando vuelva la conexión — similar en espíritu al sync de Turso.
6. Mostrar en el ticket/comprobante impreso el CUFE y el estado de la factura una vez emitida.
7. Probar en sandbox con una venta de prueba de punta a punta antes de tocar nada de producción.

### Nota importante
El sandbox no requiere certificado digital ni habilitación real ante la DIAN — sirve para desarrollar y probar el flujo técnico. La habilitación real (RUT, certificado digital, resolución DIAN) es un trámite aparte que se hace **por cada negocio real** que use el sistema en producción, no antes de tener un cliente concreto.

### Estado de la prueba end-to-end (2026-09-02) — ✅ FACTURA AUTORIZADA

Contrato real de MATIAS (verificado contra sandbox):
- Base URL `https://sandbox-api.matias-api.com/api/ubl2.1`, auth `Authorization: Bearer <PAT>`. La `MATIAS_API_KEY` del `.env` es ese PAT.
- `POST /invoice` — estructura del payload confirmada; el `buildPayload` de `dianService.cjs` coincide con la doc.
- El **sandbox ya trae una resolución precargada**: `resolution_number: "18760000001"`, `prefix: "FEV"`, rango 1–1000, vigente hasta 2030. No hay que registrar nada para probar.
- `GET /taxes` devuelve `{ dataRecords: { data: [...] } }`. IDs reales: IVA=**1**, INC (impoconsumo 8%)=**4**, IBUA (bebidas azucaradas)=**20**, ICUI (comestibles ultraprocesados)=**21**. `dianService` ya usa estos.
- El emisor/empresa NO va en el payload — MATIAS lo deriva del PAT. `GET /company` muestra los datos (COMMERCEOS PRO SAS, NIT 900123633).
- Respuesta OK: `{ XmlDocumentKey: <CUFE>, response: { IsValid:"true", StatusCode:"00", StatusMessage, ... }, qr: { url, qrDian } }` — **NO trae `success:true` en la raíz** (el `emitirFactura` ya se corrigió para leer `response.IsValid`/`StatusCode`).
- El **QR viene aunque `graphic_representation` esté en 0** (`qr.url` = PNG, `qr.qrDian` = URL de verificación DIAN).

Bug de MATIAS sandbox (RESUELTO 2026-09-03): con `graphic_representation: 1` o `send_email: 1` daba HTTP 500 (`Attempt to read property "image" on null`) porque la empresa no tenía **logo** cargado. El logo se sube desde el **portal web de MATIAS** (`sandbox-auth.matias-api.com`), no por API. **Logo ya cargado + verificado**: `node scripts/test-dian.cjs --send` con `dian_graphic_representation: "true"` → factura AUTORIZADA y `pdf_url` real (PDF 1.4, ~39 KB, 200 OK). El `buildPayload` sigue dejando ambos en 0 por default (cada negocio carga su propio logo); se activan desde Ajustes → Facturación Electrónica ("Generar PDF de la factura" / "Enviar factura por email"). `send_email` además exige que la venta tenga cliente con email real (no consumidor final anónimo).

**Herramienta:** `node scripts/test-dian.cjs [--send] [--discover]` — prueba el flujo real contra el sandbox usando `emitirFactura()`. Config override en `scripts/dian-test.local.json` (git-ignored).

### Pendientes DIAN
- ✅ CUFE + QR en el ticket (`Ticket.tsx`, 2026-09-02): título "FACTURA ELECTRÓNICA DE VENTA", `dian_resolucion` real, prefijo+número, CUFE completo, y el QR embebido. `emitirFactura` descarga el PNG del QR de MATIAS y lo guarda como data-URI (`qr_base64`, columna nueva en `FacturasElectronicas`) → imprime offline. `get-venta-por-id` hace join con `FacturasElectronicas` para reimpresiones.
- ✅ UI de facturas pendientes + reintento automático (2026-09-03):
  - `src/backend/facturacionPendientes.cjs`: `procesarFactura(venta_id)` (núcleo extraído del viejo handler `reintentar-factura`), `procesarPendientes({soloAuto})` y `iniciarJobReintento()` (job cada 5 min, arranque a los 25 s, backoff exponencial 2^intentos min tope 120, corta a 15 intentos automáticos; ERROR = rechazo DIAN, no se auto-reintenta). Columna nueva `FacturasElectronicas.ultimo_intento`.
  - `main.cjs` arranca el job tras `setupIpcHandlers()`.
  - Handlers nuevos/cambiados en `ipcHandlers.cjs`: `reintentar-factura` ahora delega en `procesarFactura`; `get-facturas-pendientes` devuelve `prefijo` + `fecha_venta`; nuevos `get-facturas-pendientes-count` (badge) y `reintentar-todas-facturas` (lote, incluye ERROR, ignora backoff).
  - Frontend: nueva página `src/pages/FacturacionDIAN.tsx` (ruta `/facturacion-dian`, solo Admin, refresco cada 30 s, resumen Pendientes/Rechazadas, botón "Reintentar todas" + por fila). Ítem de menú "Facturación DIAN" en `Layout.tsx` con badge rojo (poll 60 s), oculto si `dianCompliance2026` off.
- Impuesto saludable: se manda como 20% ad-valorem; la ley IBUA/ICUI es tarifa nominal por unidad (el sandbox igual lo acepta).
- ✅ Logo del emisor cargado en el portal MATIAS (2026-09-03) → PDF + envío por email habilitados. Falta que cada instalación active los toggles en Ajustes.
- ✅ v1.1.5 (2026-09-03): (mejora #4) PDF de la DIAN en reimpresiones. `get-venta-por-id` ahora trae `pdf_url`/`estado`; modal de Caja y Finanzas muestra bloque "Factura Electrónica DIAN" con N°, CUFE y botones "Ver factura PDF (DIAN)" / "Verificar en la DIAN". Nuevo handler `open-external` (shell.openExternal) + `setWindowOpenHandler` en `main.cjs` para abrir URLs http(s) en el navegador del sistema. (mejora #6) Job de reintento automático **verificado** con harness real contra sandbox: crea PENDIENTE → `procesarPendientes({soloAuto:true})` → EMITIDA con CUFE, backoff respetado. Caveat conocido: una factura `queued` (con CUFE, DIAN lenta) se re-emite en vez de consultarse estado → eso es la mejora #1.

### Roadmap mejoras de facturación (2026-09-03, acordado con el usuario)
1. ✅ v1.1.6 — Consulta de estado real en la DIAN para facturas `queued`. `dianService.consultarDocumento({prefijo,numero})` → `GET /documents?number=<prefijo><numero>` (filtro `number` = match exacto de `document_number`; `is_valid`/`send_to_queue` dicen el estado; `jsonData.qrData` es el texto del QR en base64). `procesarFactura`: si `fe.cufe` existe → consulta en vez de re-emitir; si la DIAN ya validó → EMITIDA + genera el QR PNG con `qrPngDesdeData()` (dep nueva `qrcode`); si sigue en cola → PENDIENTE sin re-enviar; si MATIAS no la encuentra → re-emite. Verificado con harness vs sandbox.
2. ✅ v1.1.7 — **Notas crédito (anulación total)**. Ruta real `POST /notes/credit` (`type_document_id:5`, `operation_type_id:12`, `billing_reference:{number,date,uuid}`, `discrepancy_response:{reference_id,response_id}` — concepto 2 = anulación). Sandbox trae resolución NC precargada prefijo `NCFE`. `dianService.emitirNotaCredito()` + `buildPayload(...,opts)` con rama NC. Tabla `NotasCredito`, columna `Ventas.anulada`. `facturacionPendientes`: `emitirNotaCreditoPorVenta()` (reserva número, emite, y al quedar EMITIDA repone stock + EGRESO en caja + `anulada=1` en transacción), `procesarNotaCredito()` retry, y el job automático + `get-facturas-pendientes` ahora incluyen NCs (campo `tipo`). Config `dian_prefijo_nc`/`dian_numero_nc_actual` en Ajustes. UI: botón "Anular con Nota Crédito" en el modal de detalle de venta (Caja y Finanzas) + modal de motivo. Verificado vs sandbox (factura→NC AUTORIZADA, stock/caja/anulada OK). Pendiente a futuro: devolución parcial (concepto 1), ticket impreso propio de la NC.
3. Impuesto saludable IBUA (bebidas, tarifa $/100ml por tramo de azúcar) vs ICUI (ultraprocesados, 20% ad-valorem — el actual sirve para ICUI). Requiere campos nuevos en Productos + tablas de tarifa 2026.
4. ✅ hecho en v1.1.5.
5. Numeración consecutiva sin huecos: `dian_numero_actual` se incrementa antes de llamar a MATIAS; si rechaza, el número queda quemado. La DIAN exige consecutivo.
6. ✅ verificado en v1.1.5.
- ✅ v1.1.4 (2026-09-03): fix rechazo DIAN por medio de pago. `MEDIO_PAGO_MAP` en `dianService.cjs` usaba `means_payment_id: 99` para APPS (Nequi/DaviPlata) y PSE, y `47` para tarjeta débito — todos INACTIVOS en el catálogo DIAN (`GET /payment-means`) → rechazo directo. Corregido: APPS→42 (Consignación bancaria), PSE→31, TARJETA_DEBITO→49. Verificado contra sandbox: todos AUTORIZADA. Activos DIAN: 10, 30, 31, 42, 48, 49, ZZZ, 71, 72.
- ✅ v1.1.2 (2026-09-03): fix "Resolución DIAN no configurada" al vender. Causas cubiertas: (a) `Settings.tsx` no re-hidrataba el `form` si la config llegaba de la DB después de montar el componente → al Guardar se perdía la resolución ya cargada. Ahora `SettingsContext` expone `loaded` y `Settings` re-hidrata una vez. (b) mensajes de error genéricos → ahora dicen exactamente qué campo falta (resolución vs número). (c) `handleSave` normaliza: `dian_numero_actual` nunca queda vacío/<1, resolución/prefijo con trim. (d) el instalador apunta al **sandbox** MATIAS (`MATIAS_API_URL` no horneada) → nuevo handler `get-dian-env` + banner en Ajustes que avisa "entorno de PRUEBAS" y muestra los valores del sandbox (resolución 18760000001 / prefijo FEV / número 1). Con datos reales de resolución el sandbox rechaza.

---

## Manejo de credenciales (2026-09-02)

### Cómo llegan al ejecutable
- **Desarrollo:** `.env` en la raíz (git-ignored). `src/backend/secrets.cjs` lo carga con dotenv.
- **Producción:** `npm run gen:secrets` (corre solo dentro de `electron:dist` / `electron:build`) lee el entorno de la máquina de build y escribe `src/backend/secrets.generated.cjs` (git-ignored, se empaqueta en el asar). `secrets.cjs` lo carga y además hidrata `process.env`.
- Accesor único: `const { secret } = require('./secrets.cjs'); secret('MATIAS_API_KEY')`.
- Se hornean: `MATIAS_API_KEY` (obligatoria), `MATIAS_API_URL` (opcional), `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (opcionales, base por defecto para pruebas propias).

### Turso: una base por negocio

**Vía principal (onboarding a distancia): instalador por cliente.** El dev está en Argentina y los clientes en Colombia:
```
npm run build:cliente -- panaderia-lucia
```
`scripts/build-cliente.cjs` pide (o recuerda, en `scripts/clientes.local.json` git-ignored) la URL + token Turso de ese negocio, prueba la conexión, corre `electron:dist` con esas vars en el entorno (se hornean), y deja el `.exe` en `dist-clientes/CommerceOS-Pro_<slug>_v<version>.exe`. El cliente instala + activa la licencia (flujo por Hardware ID, ya remoto) y listo. Tras el build borra `secrets.generated.cjs`.

**Vía secundaria (fallback / cambio de base): Ajustes → "Conexión a la Nube (Turso)".**
- Se pega URL + token, se prueba la conexión (`SELECT 1`) y se guarda cifrado (AES-256-GCM, clave derivada del machineId) en `userData/tenant.json` — ver `src/backend/tenantConfig.cjs`. Útil para cambiar de base o hacerlo por AnyDesk.
- `db.cjs` resuelve credenciales así: `tenant.json` (instalación) → `secret()` (build/.env) → si no hay ninguna, corre 100% local sin sync (no bloquea nada).
- Cambiar la base requiere **reiniciar la app** (el cliente libSQL se crea al cargar el módulo). El botón "Reiniciar app" en Ajustes lo hace (`app.relaunch()`). Al cambiar, `db.cjs` descarta la réplica local vieja en el próximo arranque (marca `.reset-replica` en userData).
- Handlers IPC: `get-turso-status`, `set-turso-config`, `clear-turso-config`, `restart-app`.
- **Pendiente / a futuro:** (a) auto-aprovisionar la base por cliente vía Turso Platform API para tener un solo instalador; (b) auto-updater (`electron-updater` + GitHub Releases) — hoy actualizar = mandar el `.exe` nuevo.