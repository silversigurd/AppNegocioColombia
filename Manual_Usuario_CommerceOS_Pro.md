# Manual de Usuario: CommerceOS Pro (2026)
## Sistema Integral de Gestión Comercial y RRHH

---

### 1. Introducción
**CommerceOS Pro** es una solución de escritorio diseñada para simplificar la gestión de comercios, control de inventario, ventas y administración de recursos humanos, cumpliendo estrictamente con la normativa laboral argentina vigente (Ley Bases 2024).

---

### 2. Instalación y Activación
#### Instalación
1. Ejecute el instalador `CommerceOS Pro Setup.exe`.
2. Lea y acepte los **Términos y Condiciones (EULA)**.
3. El sistema se instalará y creará un acceso directo en su escritorio.

#### Activación por Hardware ID
Al iniciar por primera vez, el sistema mostrará un código único llamado **Hardware ID**.
1. Copie este código y envíelo a su proveedor.
2. Recibirá una **Clave de Activación** (Ej: `ABCD-1234-EFGH-5678`).
3. Ingrese la clave para desbloquear el sistema permanentemente.

---

### 3. Panel de Control (Dashboard)
Al ingresar, visualizará un resumen en tiempo real de su negocio:
- **Ventas del día**: Total recaudado en la jornada actual.
- **Stock Crítico**: Alerta de productos que necesitan reposición.
- **Próximos Vencimientos**: (Si aplica) productos cerca de su fecha de caducidad.

---

### 4. Punto de Venta (POS)
El módulo de Ventas permite procesar transacciones de forma ágil.
1. **Búsqueda**: Busque productos por nombre o código de barras.
2. **Carrito**: Ajuste cantidades o elimine productos con un clic.
3. **Medios de Pago**: Soporta Efectivo, Tarjeta y Transferencia.
4. **Emisión de Ticket**: Al finalizar, se generará un comprobante (adaptado a normativas 2026) que puede imprimirse directamente.

---

### 5. Gestión de Inventario
Mantenga sus existencias bajo control absoluto.
- **Agregar Productos**: Defina nombre, categoría, precio de costo, precio de venta y stock inicial.
- **Ajustes de Stock**: Modifique existencias manualmente por roturas o ingresos de mercadería.
- **Filtros**: Busque por categorías o niveles de stock bajo.

---

### 6. Recursos Humanos (RRHH) - Marco Legal 2024
Este módulo ha sido actualizado para cumplir con la **Ley Bases 2024**.

#### Configuración de Empresa
En la sección de **Ajustes > RRHH**, defina el tamaño de su empresa:
- **PyME 1**: Periodo de prueba de 6 meses.
- **PyME 2**: Periodo de prueba de 8 meses.
- **Gran Empresa**: Periodo de prueba de 12 meses.

#### Gestión de Empleados
- **Alta**: Registre datos personales, CUIT/CUIL, teléfono y fecha de ingreso.
- **Cese Laboral**: Al dar de baja a un empleado, el sistema calculará automáticamente la indemnización basada en:
    - Periodo de prueba vigente (según tamaño de empresa).
    - Opción de **Fondo de Cese** (si está activado).
    - Tope de CCT (Fallo Vizzoti).
- **Compensación Económica**: Herramienta para generar notas de liquidación final y acuerdos voluntarios de pago de vacaciones o rubros no retenibles.

---

### 7. Finanzas y Sucursales
- **Historial de Ventas**: Revise todas las transacciones pasadas con detalle de productos e impuestos.
- **Arqueo de Caja**: Resumen de ingresos por cada medio de pago.
- **Liquidaciones**: Registro histórico de bajas de empleados y pagos realizados.

---

### 8. Configuración del Sistema
Desde el engranaje de ajustes puede personalizar:
- **Datos del Comercio**: Nombre, CUIT, Dirección y Logo para los tickets.
- **ARCA 2026**: Active o desactive el modo de cumplimiento para transparencia fiscal.
- **Usuarios**: Administre quién tiene acceso al sistema y cambie contraseñas.

---

### 9. Mantenimiento y Seguridad
- **Base de Datos**: Los datos se almacenan localmente en su PC para máxima privacidad.
- **Copias de Seguridad (Backups)**: Se recomienda realizar copias periódicas de su base de datos para evitar pérdida de información. Para encontrar el archivo fácilmente:
  1. Presione la combinación de teclas **Windows + R** en su teclado.
  2. En la pequeña ventana que aparecerá, pegue lo siguiente: `%APPDATA%\CommerceOS Pro` y luego presione **Aceptar**.
  3. Se abrirá la carpeta donde verá el archivo llamado `commerce_data.sqlite`. Cópielo a un lugar seguro (como un pendrive o una carpeta en la nube).
- **Soporte**: En caso de errores, consulte el registro de actividad o contacte al desarrollador con su Hardware ID a mano.

---
*Manual generado automáticamente para la versión 1.0.1 de CommerceOS Pro.*
