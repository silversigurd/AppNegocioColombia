# Manual de Usuario: CommerceOS Pro (2026)
## Sistema Integral de Gestión Comercial y Recursos Humanos

---

### 1. Introducción al Sistema
**CommerceOS Pro** es una plataforma de software de escritorio diseñada para optimizar la gestión integral de operaciones comerciales, incluyendo control de inventario, procesos de venta y administración de recursos humanos. Este sistema garantiza el estricto cumplimiento de la normativa laboral argentina vigente, en particular la **Ley Bases 2024** y la **nueva reforma laboral**.

---

### 2. Implementación, Activación y Proceso de Instalación
#### Instalación
1. Ejecute el archivo instalador con el nombre `CommerceOS Pro Setup.exe`.
2. Revise y acepte los **Términos y Condiciones (EULA)** de uso.
3. El sistema completará la instalación y generará un acceso directo en el escritorio del equipo.

#### Activación mediante Hardware ID
Al iniciar la aplicación por primera vez, el sistema presentará un código de identificación único denominado **Hardware ID**.
1. Copie este código y remítalo a su proveedor de software.
2. Recibirá una **Clave de Activación** (Ej: `ABCD-1234-EFGH-5678`).
3. Introduzca la clave en el campo correspondiente para desbloquear la licencia de forma permanente.

---

### 3. Panel de Control (Dashboard)
Al acceder al sistema, el usuario visualizará un resumen ejecutivo en tiempo real de la actividad del negocio, que incluye:
- **Ventas del día**: Indicador del total de ingresos generados durante la jornada actual.
- **Stock Crítico**: Alerta sobre los productos cuyas existencias requieren reposición inmediata.

---

### 4. Módulo de Punto de Venta (POS)
El módulo de Ventas está diseñado para procesar transacciones de manera eficiente y ágil.
1. **Búsqueda de Productos**: Localice artículos por denominación o mediante la lectura de códigos de barras.
2. **Gestión del Carrito**: Permite ajustar cantidades o eliminar productos de la transacción con facilidad.
3. **Emisión de Comprobante**: Al finalizar la venta, se genera un ticket de comprobante (conforme a la normativa 2026) apto para impresión directa.

---

### 5. Gestión de Inventario
Este módulo asegura un control exhaustivo sobre las existencias de productos.
- **Registro de Productos**: Permite definir la denominación, categoría, precio de costo, precio de venta y stock inicial de cada artículo.
- **Ajustes de Stock**: Herramienta para la modificación manual de existencias debido a mermas, roturas o ingresos de nueva mercadería.
- **Filtros de Búsqueda**: Facilita la localización de productos por categoría o nivel de stock bajo.

---

### 6. Módulo de Proveedores
Gestione la cadena de suministro y mantenga un registro centralizado de sus contactos comerciales.
- **Registro de Proveedores**: Almacene nombres, CUIT/CUIL, teléfonos, correos electrónicos y direcciones.
- **Vinculación**: Facilita la identificación de qué proveedor suministra cada artículo del inventario.
- **Búsqueda Rápida**: Localice contactos por nombre o rubro comercial para agilizar pedidos.

---

### 7. Recursos Humanos (RRHH) – Marco Legal 2024
Este módulo ha sido completamente actualizado para garantizar la observancia de la Ley Bases 2024.

#### Configuración del Perfil de Empresa
En la sección **Ajustes > RRHH**, se debe definir el tamaño de la empresa para aplicar el marco legal correspondiente:
- **PyME 1**: Periodo de prueba establecido en 6 meses.
- **PyME 2**: Periodo de prueba establecido en 8 meses.
- **Gran Empresa**: Periodo de prueba establecido en 12 meses.

---

### 8. Administración de Empleados
- **Alta de Empleados**: Registre datos personales, CUIT/CUIL, información de contacto y fecha de ingreso.
- **Cese Laboral**: Al procesar la baja de un empleado, el sistema calcula automáticamente la liquidación final y la indemnización, considerando:
    - El periodo de prueba vigente (según la clasificación de la empresa).
    - La activación del **Fondo de Cese** (si corresponde).
    - El **Tope de CCT** (según el Fallo Vizzoti).
- **Compensación Económica**: Función para generar formalmente notas de liquidación final y documentar acuerdos voluntarios de pago.

---

### 9. Módulo de Caja y Finanzas
- **Historial de Ventas**: Acceso detallado a todas las transacciones pasadas, incluyendo desglose de productos e impuestos aplicados.
- **Arqueo de Caja**: Resumen de los ingresos totales clasificados por cada medio de pago.
- **Liquidaciones**: Registro histórico de todos los ceses laborales y los pagos finales realizados a empleados.

---

### 10. Configuración General del Sistema
El panel de ajustes (ícono de engranaje) permite la personalización de los siguientes parámetros:
- **Datos del Comercio**: Edición de la razón social, CUIT, dirección y carga del logotipo para su inclusión en los tickets.
- **ARCA 2026**: Activación o desactivación del modo de cumplimiento con las directrices de transparencia fiscal.
- **Módulo Usuarios**: Herramienta para la administración de accesos al sistema y la modificación de contraseñas de usuario.

---

### 11. Mantenimiento y Seguridad de la Información
- **Base de Datos**: La información se almacena de forma local en el equipo del usuario para garantizar la máxima privacidad.
- **Copias de Seguridad (Backups)**: Se recomienda encarecidamente la realización de copias periódicas de la base de datos para prevenir la pérdida de datos. Para acceder al archivo de base de datos:
  1. Presione simultáneamente las teclas **Windows + R** en el teclado.
  2. En la ventana de ejecución, introduzca el siguiente comando: `%APPDATA%\CommerceOS Pro` y luego presione **Aceptar**.
  3. Se abrirá la carpeta de datos, donde se encuentra el archivo `commerce_data.sqlite`. Copie este archivo en una ubicación segura (como una unidad USB o un servicio de almacenamiento en la nube).
- **Soporte Técnico**: En caso de incidencias o errores, consulte el registro de actividad o contacte con el desarrollador, teniendo su Hardware ID a disposición.

---
*Manual generado automáticamente para la versión 1.0.1 de CommerceOS Pro.*
