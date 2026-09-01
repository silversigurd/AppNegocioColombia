# Contexto para Claude Code — CommerceOS Pro (Turso + DIAN)

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