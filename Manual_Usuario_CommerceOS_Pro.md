# Manual de Usuario Integral: CommerceOS Pro (Edición Colombia 2026)

Bienvenido a **CommerceOS Pro**, su sistema de gestión comercial, logística y de capital humano, ajustado a los lineamientos legales, tributarios y laborales de la **República de Colombia** (Estatuto Tributario, Resolución DIAN 238/2025, CST y Ley 2466 de 2025).

Este manual lo acompaña paso a paso por cada pantalla del sistema.

> [!IMPORTANT]
> **Credenciales de Acceso por Defecto**
> La primera vez que inicie el programa, se le solicitará iniciar sesión. Introduzca:
> - **Usuario:** Principal
> - **Contraseña:** admin
>
> *Le recomendamos encarecidamente cambiar esta contraseña desde el módulo Usuarios apenas ingrese por primera vez.*

> [!NOTE]
> **Su versión puede no incluir todos los módulos.** CommerceOS Pro se distribuye en dos planes: **Básico** y **Avanzado**. El plan Avanzado suma el módulo completo de **RRHH** (legajos, nómina, liquidaciones, desvinculaciones). Si en su menú lateral no aparece "RRHH", su instalación corresponde al plan Básico — consulte con su proveedor si desea ampliarlo.

---

## 1. Activación e Instalación Inicial

1. **Instalación:** Ejecute el instalador `.exe` provisto.
2. **Activación por Hardware:** Al abrir la aplicación por primera vez, si no está activada, el sistema mostrará una pantalla de bloqueo ("Sistema Bloqueado") con un **Código de Solicitud (Hardware ID)** único de su computador.
3. Copie ese código y envíelo a su proveedor (email, WhatsApp).
4. Su proveedor le devolverá una **Llave de Activación** con formato `XXXX-XXXX-XXXX-XXXX`. Escríbala en el campo correspondiente y presione **"Desbloquear Sistema"**.
5. La activación queda ligada a ese computador específico. Si cambia de equipo, deberá solicitar una llave nueva con el Hardware ID del equipo nuevo.

---

## 2. Iniciar Sesión

En la pantalla de login ingrese su **Usuario** y **Contraseña** y presione "Iniciar Sesión". Si las credenciales son incorrectas, el sistema se lo indicará en pantalla sin darle pistas de cuál de los dos datos falló (por seguridad).

---

## 3. Panel de Control (Dashboard)

Es la primera pantalla que ve al iniciar sesión. Resume la actividad del día:

- **Tarjetas (KPIs):** "Ventas del Día" (en pesos colombianos), "Tickets Emitidos" y "Alertas de Stock" (productos cuyo stock está en o por debajo del mínimo configurado — 5 unidades por defecto si no le puso uno propio).
- **Evolución de Ventas (Semanal):** gráfico de barras con el total vendido cada uno de los últimos 7 días.
- **Actividad Reciente:** lista cronológica de ingresos (ventas) y egresos (pagos a proveedores), con buscador propio. Haga clic sobre cualquier movimiento para ver el comprobante completo (ticket de venta o remito de compra) y, si corresponde, reimprimirlo.

---

## 4. Punto de Venta (POS)

La pantalla que va a usar todo el día, pensada para ser rápida.

### 4.1 Armar la venta
1. Escriba en el buscador el nombre o código del producto, o **escanee el código de barras** — el sistema detecta automáticamente cuando el ingreso viene de un lector (no hace falta hacer clic en nada, apenas se lee el código el producto entra al carrito) — o haga clic directamente sobre la tarjeta del producto en la grilla.
2. Ajuste cantidades con los botones **+ / -** dentro de cada línea del carrito, o quite un producto con el ícono de papelera.
3. El sistema le avisa con un mensaje si intenta vender más unidades de las que hay en stock, o si el producto está agotado.

### 4.2 Datos de la venta
- **Cédula/NIT del Cliente:** opcional para ventas normales, mostrando el aviso siguiente:
  - Si el total de la venta supera **100 UVT** (el sistema calcula el monto exacto en pesos según la UVT vigente), la ley exige identificar al comprador — el sistema bloquea "Confirmar Pago" hasta que complete este campo.
- **Medio de Pago:** Efectivo, Tarjeta de Crédito, Tarjeta de Débito, Transferencia o Billetera Virtual (Nequi, DaviPlata, etc.).

### 4.3 Confirmar el pago y la factura electrónica
Al presionar **"Confirmar Pago"**, la venta se guarda al instante — no espera a la DIAN para no hacerlo esperar en la caja. Si tiene la Facturación Electrónica activada (ver sección Ajustes), en el mismo modal de "¡Venta Exitosa!" va a ver el estado de la factura actualizarse solo, en este orden:
1. **"⏳ Emitiendo factura electrónica…"** — está viajando hacia la DIAN vía MATIAS, tarda unos segundos.
2. **"✅ Factura electrónica emitida"** — aparece el CUFE (el número único de la factura ante la DIAN) y un enlace para ver el PDF oficial.
3. Si la DIAN tarda demasiado o no hay internet, verá **"⚠️ Factura pendiente de emisión"** — la venta ya quedó registrada igual, y el sistema la reintenta solo más tarde (ver módulo **Facturación DIAN**, sección 8).

### 4.4 Imprimir el ticket
- **"Vista Previa del Ticket"** abre una ventana con el ticket tal cual va a salir impreso, antes de gastar papel.
- **"Imprimir Ticket"** manda directo a la impresora térmica configurada.
- **"Nueva Venta"** limpia el carrito para atender al siguiente cliente.

---

## 5. Inventario

Control de mercadería, precios y stock.

### 5.1 Productos
1. **"Nuevo Producto":** complete Código de Barras, Categoría, Nombre, Costo y Precio de Venta.
2. **Tipo de Impuesto DIAN** (por producto): elija entre IVA 19% (general), IVA 5% (diferencial), Exento, Excluido, IPOC 8% (comidas preparadas de cafetería/restaurante — excluyente con IVA) o Impuesto Saludable (bebida azucarada / ultraprocesado). El sistema calcula el impuesto correcto de cada producto automáticamente en el POS según lo que elija acá.
3. **Categorías:** gestiónelas desde el botón "+" junto al selector de Categoría — puede crear y eliminar categorías propias; los productos de una categoría eliminada pasan a "General" automáticamente.
4. **Editar:** el ícono de lápiz permite corregir precios o cualquier otro dato.
5. **Eliminar:** si el producto **nunca se vendió ni se compró**, se borra por completo. Si ya tiene ventas o pedidos de compra asociados, el sistema **no lo borra** (rompería el historial de esas facturas) — lo marca como inactivo y desaparece del listado, pero las ventas/facturas viejas que lo mencionan siguen intactas.

### 5.2 Exportar
El botón **"Exportar Inventario"** ofrece:
- **Exportar Excel:** una planilla `.xlsx` con código, nombre, categoría, stock, costo, precio de venta y valorización (costo y venta), con columnas ya anchas y números con separador de miles.
- **Exportar PDF:** un reporte imprimible con la misma información en formato tabla.

---

## 6. Proveedores y Compras

Directorio de proveedores, órdenes de compra y cuentas corrientes.

### 6.1 Directorio
Cree la ficha de cada proveedor con Razón Social, NIT (con dígito de verificación validado automáticamente), Responsabilidad DIAN, dirección, preventista (nombre y celular), día de visita/entrega, EPS/datos fiscales avanzados (banco, plazo de pago, mínimo de compra, moneda, retenciones, saldo de cuenta corriente y de envases retornables) — estos últimos campos aparecen al presionar "Opciones Avanzadas (Fiscales)".

### 6.2 Pedidos y Recepción de Mercadería
1. Desde el ícono de recibo en la tarjeta del proveedor, entre a "Pedidos / Compras".
2. **"Generar Pedido":** arme la lista de productos que le pidió al proveedor, con cantidad y costo pactado, y guarde.
3. Cuando llega la mercadería, vuelva a ese pedido y presione **"Confirmar Recepción"** — el stock del inventario sube automáticamente con las cantidades exactas del pedido.
4. **Eventos DIAN** (Acuse, Recibo, Aceptación): tres casillas para llevar registro del ciclo de facturación electrónica de compras frente al proveedor.

### 6.3 Pago de la Orden
Presione **"Registrar Pago/Gasto"** y elija:
- **"Pagué en el momento":** sale de la Caja como egreso inmediato.
- **"Dejar a Fiado":** no sale plata de caja; se suma a la Deuda (Cuenta Corriente) con ese proveedor.

---

## 7. Caja y Finanzas

Panorama de ingresos y egresos del negocio.

- **Tarjetas de resumen:** Balance Total, Ingresos y Egresos acumulados.
- **Últimos Movimientos:** tabla filtrable por Todos / Ingresos / Egresos. Cada venta o pago a proveedor se puede abrir haciendo clic para ver el detalle completo.
- **Detalle de Factura/Ticket:** desglosa subtotal, IVA/IPOC/Impuesto Saludable, medio de pago, y — si la venta se facturó ante la DIAN — el CUFE, el número de factura y accesos directos para "Ver factura PDF (DIAN)" y "Verificar en la DIAN" (abren en su navegador).
- **Anular una venta (Nota Crédito):** si una venta ya facturada necesita anularse (devolución, error de datos), desde su detalle presione **"Anular con Nota Crédito"**, escriba el motivo (mínimo 8 caracteres) y confirme. El sistema emite la nota crédito electrónica ante la DIAN, repone el stock vendido y registra el egreso en caja automáticamente. **Esta acción no se puede deshacer.**

---

## 8. Facturación DIAN

Solo visible si tiene la Facturación Electrónica activada en Ajustes. Acá viven las facturas (o notas crédito) que **no se pudieron emitir en el momento de la venta** — por ejemplo, por un corte de internet.

- **Pendientes:** se están reintentando solas, cada pocos minutos, sin que usted haga nada.
- **Rechazadas:** la DIAN encontró un problema real en los datos — revise el motivo indicado y corrija lo que corresponda antes de reintentar.
- **"Reintentar"** (por fila) o **"Reintentar todas"** (en bloque): fuerza el reintento inmediato en vez de esperar al ciclo automático.
- Cuando la lista está vacía, todas sus ventas están correctamente facturadas ante la DIAN.

---

## 9. Módulo de RRHH *(solo plan Avanzado)*

Adaptado a la **Ley 2466 de 2025** y al **CST Colombiano**.

### 9.1 Alta de Empleados
Complete Cédula de Ciudadanía, RUT, Fecha de Ingreso, Categoría, Sueldo Básico, Jornada Laboral, EPS, Fondo de Pensiones y ARL, y elija la **Modalidad de Contrato**: Indefinido, Término Fijo (máx. 4 años), Obra o Labor Determinada, o No registrado (Informal).

> [!WARNING]
> Un empleado marcado como **"No registrado (Informal)"** queda con la generación de contratos y recibos de nómina bloqueada por el propio sistema, para evitar contingencias legales por trabajo no declarado.

### 9.2 Nómina y Novedades del Mes
Desde "Administrar Empleado" → **"Liquidar Periodo"**, el sistema calcula automáticamente el sueldo del mes considerando:
- La jornada legal vigente (42 horas semanales desde julio de 2026).
- El Auxilio de Transporte, si el empleado gana hasta 2 SMMLV.
- Recargos por Hora Nocturna, Hora Extra Diurna, Hora Extra Nocturna y Dominical — cargue las horas del mes en "Novedades del Mes" y el sistema calcula el valor de cada una según el salario del empleado.
- Los descuentos de Salud (4%) y Pensión (4%).

El recibo se puede exportar en PDF con un clic.

### 9.3 Desvinculación
1. Presione el ícono de la puerta roja sobre el empleado activo.
2. El sistema le muestra un panel con el marco legal aplicable (debido proceso, fueros de estabilidad, sanción moratoria).
3. Elija la Causal real de egreso (Renuncia, Despido con/sin justa causa, Mutuo acuerdo, Expiración de término fijo, etc.) según el CST.
4. **Indemnización automática:** si la causal es Despido sin justa causa, el sistema calcula solo la indemnización correspondiente según el tipo de contrato, el salario y la antigüedad (tabla de días de la Ley 2466), además de las prestaciones sociales proporcionales (cesantías, intereses, prima, vacaciones) que se liquidan siempre, sin importar la causal.
5. El empleado pasa al **Historial de Bajas**, donde queda su ficha y sus recibos preservados para siempre, aunque ya no aparezca entre los activos.

---

## 10. Usuarios

Solo accesible con rol *Administrador*.

- Vea todos los usuarios del sistema, empezando por `Principal` (la cuenta raíz, que no se puede eliminar ni renombrar).
- **"Nuevo Usuario":** cree cuentas para sus cajeros con rol *Empleado* (acceso restringido: solo pueden vender y consultar stock, sin ver métricas del negocio ni liquidar sueldos) o *Administrador* (acceso total).
- **Empleado Vinculado:** al crear un usuario no-Principal, puede asociarlo a una ficha del módulo RRHH — así, en los tickets que ese usuario emita, se imprime el nombre real del empleado en vez de su nombre de usuario de sistema.
- El usuario `Principal` en cambio tiene un campo propio, **"Nombre propietario"**, que es el que sale impreso en sus tickets.

---

## 11. Ajustes del Sistema

Haga clic en el ícono de tuerca del menú.

### 11.1 Datos del Comercio
Nombre legal / razón social, tipo de comercio, NIT (el sistema valida el dígito de verificación DIAN mientras escribe) y dirección — estos datos salen impresos en el encabezado de todos sus tickets y planillas.

### 11.2 Configuración de Impresora
Elija el ancho del ticket: 58mm, 80mm (el más común en térmicas de POS) o A4 (impresora de oficina).

### 11.3 Parámetros Fiscales Colombia 2026
Muestra en pantalla la UVT, el SMMLV y el Auxilio de Transporte vigentes (actualizados por el sistema, no hace falta cargarlos a mano). Acá también configura:
- **Responsable del IVA:** desactívelo si su negocio no supera 3.500 UVT anuales — el tiquete deja de discriminar IVA.
- **¿Tiene cafetería/restaurante?:** activa el Impoconsumo (IPOC) 8% para sus productos de comida preparada.
- **Municipio (ICA):** selecciona la tasa de Industria y Comercio de su ciudad, usada como referencia informativa en el detalle de cada venta.

### 11.4 Facturación Electrónica (DIAN / MATIAS)
Cargue el **Número de Resolución**, **Prefijo** y **Número Actual de Factura** que le entregó la DIAN (el sistema le avisa si está en entorno de pruebas -sandbox- o en producción real). También: ID de Ciudad para MATIAS, email para consumidor final anónimo, y dos interruptores — generar PDF de la factura (necesita el logo cargado en el portal de MATIAS) y enviar la factura por email al cliente. Un aviso en pantalla le confirma si la facturación ya quedó bien configurada o si todavía falta algo.

El interruptor maestro **"Facturación Electrónica DIAN"**, en la sección "Compliance Fiscal", prende o apaga todo el módulo (POS, ticket y el menú "Facturación DIAN").

### 11.5 Conexión a la Nube (Turso)
Si su negocio tiene una base de datos en la nube asignada (respaldo automático + sincronización), acá ve si está activa y puede cargar/cambiar la URL y el token que le haya dado su proveedor. Después de guardar hay que **reiniciar la app** (botón incluido) para que tome el cambio.

### 11.6 Copia de Seguridad
Si tiene la nube conectada, el respaldo ya es automático. De todas formas, el botón **"Abrir Carpeta de Base de Datos"** le abre directamente la carpeta donde vive su archivo local (`commerce_data_local.db`) para que pueda copiarlo a un pendrive o a Google Drive cuando quiera, sin tener que buscar rutas de Windows a mano.

---

## 12. Preguntas Frecuentes

**¿Perdí internet, puedo seguir vendiendo?**
Sí. El POS, el Inventario y todo lo demás funcionan 100% local. Solo la sincronización con la nube (si la tiene) y la emisión inmediata ante la DIAN esperan a que vuelva la conexión — las facturas pendientes se emiten solas apenas hay señal.

**Cambié de computador, ¿pierdo mis datos?**
No, si tiene la Conexión a la Nube (Turso) configurada: instale la app en el equipo nuevo, actívela con una llave nueva, y sus datos bajan solos. Si no tiene nube configurada, copie el archivo `commerce_data_local.db` (ver sección 11.6) al equipo nuevo, en la misma carpeta.
