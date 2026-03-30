import { useState, useEffect } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BusinessIcon from '@mui/icons-material/Business';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import InventoryIcon from '@mui/icons-material/Inventory';
import EmojiPeopleIcon from '@mui/icons-material/EmojiPeople';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ReceiptIcon from '@mui/icons-material/Receipt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { ipc } from '../utils/ipc';
import { useSettings } from '../context/SettingsContext';

type Proveedor = {
    id?: number;
    nombre: string;
    nombre_fantasia: string;
    nit: string;
    responsabilidad_tributaria: string;
    responsable_iva: boolean;
    direccion: string;
    codigo_postal: string;
    email_compras: string;
    email_pagos: string;
    email_facturacion: string;
    telefono: string;
    plazo_pago: number;
    cbu: string;
    rubro: string;
    codigo_ciiu: string;
    saldo_actual: number;
    // --- V2 Fields ---
    preventista_nombre: string;
    preventista_telefono: string;
    dia_visita: string;
    dia_entrega: string;
    limite_credito: number;
    minimo_compra: number;
    moneda_compra: string;
    retencion_ganancias: number;
    retencion_iibb: number;
    vencimiento_certificado_exencion: string;
    saldo_envases: number;
};

type DetallePedido = {
    id?: number;
    pedido_id?: number;
    producto_id: number;
    producto_nombre?: string;
    codigo?: string;
    cantidad: number;
    precio_compra: number;
    subtotal: number;
};

type Pedido = {
    id?: number;
    proveedor_id: number;
    sucursal_id: number;
    fecha?: string;
    estado: 'PENDIENTE' | 'RECIBIDO';
    total: number;
    percepciones_recibidas?: number;
    retenciones_aplicadas?: number;
    pagado: boolean;
    items?: DetallePedido[];
    // --- Colombia DIAN Fields ---
    cufe?: string;
    fecha_emision_fe?: string;
    evento_acuse_recibo?: boolean;
    evento_recibo_bienes?: boolean;
    evento_aceptacion_expresa?: boolean;
};

const RESPONSABILIDADES_DIAN = [
    { code: 'O-13', label: 'Gran Contribuyente' },
    { code: 'O-15', label: 'Autorretenedor' },
    { code: 'O-23', label: 'Agente de retención IVA' },
    { code: 'O-47', label: 'Régimen Simple de Tributación' },
    { code: 'R-99-PN', label: 'No Responsable (Persona Natural)' },
];
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'No Visitador'];
const MONEDAS = ['COP', 'USD'];

const emptyFormData: Proveedor = {
    nombre: '', nombre_fantasia: '', nit: '',
    responsabilidad_tributaria: 'R-99-PN', responsable_iva: false,
    direccion: '', codigo_postal: '', email_compras: '', email_pagos: '', email_facturacion: '',
    telefono: '', plazo_pago: 0, cbu: '', rubro: '', codigo_ciiu: '', saldo_actual: 0,
    preventista_nombre: '', preventista_telefono: '', dia_visita: 'No Visitador', dia_entrega: 'No Visitador',
    limite_credito: 0, minimo_compra: 0, moneda_compra: 'COP',
    retencion_ganancias: 0, retencion_iibb: 0, vencimiento_certificado_exencion: '', saldo_envases: 0
};

// Validador de NIT Colombiano (Módulo 11)
function validarNIT(nit: string): boolean {
    if (!nit) return false;
    const fullNit = nit.replace(/\D/g, "");
    if (fullNit.length < 5 || fullNit.length > 15) return false;

    // Si el usuario ingresó el dígito de verificación (ej: 9001234567)
    // El último dígito es el DV.
    const nitBase = fullNit.slice(0, -1);
    const dvIngresado = parseInt(fullNit.slice(-1), 10);

    const factores = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    let suma = 0;
    for (let i = 0; i < nitBase.length; i++) {
        suma += parseInt(nitBase[nitBase.length - 1 - i], 10) * factores[i];
    }
    const residuo = suma % 11;
    const dvCalculado = residuo > 1 ? 11 - residuo : residuo;

    return dvCalculado === dvIngresado;
}

export default function Providers() {
    const { settings } = useSettings();
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [cuitError, setCuitError] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isViewOnly, setIsViewOnly] = useState(false);

    // Orders State
    const [isPedidosModalOpen, setIsPedidosModalOpen] = useState(false);
    const [activeProveedorId, setActiveProveedorId] = useState<number | null>(null);
    const [proveedorPedidos, setProveedorPedidos] = useState<Pedido[]>([]);
    const [isNuevoPedidoOpen, setIsNuevoPedidoOpen] = useState(false);
    const [productosDisponibles, setProductosDisponibles] = useState<any[]>([]); // To be fetched

    // New Order Form State
    const [nuevoPedidoItems, setNuevoPedidoItems] = useState<DetallePedido[]>([]);
    const [percepcionesRec, setPercepcionesRec] = useState(0);
    const [retencionesApl, setRetencionesApl] = useState(0);

    const [formData, setFormData] = useState<Proveedor>(emptyFormData);

    useEffect(() => {
        loadProveedores();
        loadProductos();
    }, []);

    const loadProveedores = async () => {
        setLoading(true);
        try {
            const data = await ipc.invoke('get-proveedores');
            setProveedores(data);
        } catch (error) {
            console.error('Error cargando proveedores:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadProductos = async () => {
        try {
            // Sucursal 1 por defecto 
            const data = await ipc.invoke('get-productos', 1);
            setProductosDisponibles(data);
        } catch (error) {
            console.error('Error cargando productos:', error);
        }
    };

    const handleOpenModal = (prov?: Proveedor, isView = false) => {
        if (prov) {
            setEditingId(prov.id!);
            setFormData({ ...emptyFormData, ...prov }); // Merge to ensure all fields exist

            if (isView) {
                // Comprobar si hay info avanzada cargada
                const hasAdvancedInfo =
                    (prov.cbu && prov.cbu.trim() !== '') ||
                    (prov.plazo_pago && prov.plazo_pago > 0) ||
                    (prov.minimo_compra && prov.minimo_compra > 0) ||
                    (prov.limite_credito && prov.limite_credito > 0) ||
                    (prov.moneda_compra && prov.moneda_compra !== 'ARS') ||
                    (prov.email_pagos && prov.email_pagos.trim() !== '') ||
                    (prov.saldo_actual && prov.saldo_actual !== 0) ||
                    (prov.retencion_ganancias && prov.retencion_ganancias > 0) ||
                    (prov.retencion_iibb && prov.retencion_iibb > 0) ||
                    (prov.vencimiento_certificado_exencion && prov.vencimiento_certificado_exencion.trim() !== '');

                setShowAdvanced(hasAdvancedInfo as boolean);
            } else {
                setShowAdvanced(false);
            }
        } else {
            setEditingId(null);
            setFormData(emptyFormData);
            setShowAdvanced(false);
        }
        setCuitError('');
        setIsViewOnly(isView);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.nombre) {
            return alert('Al menos debes ingresar un Nombre o Razón Social.');
        }

        if (formData.nit && !validarNIT(formData.nit)) {
            setCuitError('El NIT ingresado no parece válido según el Dígito de Verificación.');
        } else {
            setCuitError('');
        }

        try {
            if (editingId) {
                await ipc.invoke('update-proveedor', { ...formData, id: editingId });
            } else {
                await ipc.invoke('save-proveedor', formData);
            }
            setIsModalOpen(false);
            loadProveedores();
        } catch (error) {
            console.error('Error guardando proveedor:', error);
            alert('Hubo un error al guardar el proveedor.');
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('¿Seguro que deseas eliminar este proveedor?')) return;
        try {
            await ipc.invoke('delete-proveedor', id);
            loadProveedores();
        } catch (error) {
            console.error('Error eliminando proveedor:', error);
            alert('Error al eliminar');
        }
    };

    // --- ORDERS LOGIC ---
    const handleOpenPedidosDesc = async (provId: number) => {
        setActiveProveedorId(provId);
        try {
            // Assuming sucursal 1 for now (expandable later based on auth context)
            const pedidos = await ipc.invoke('get-pedidos-por-proveedor', provId, 1);
            setProveedorPedidos(pedidos);
            setIsPedidosModalOpen(true);
        } catch (err) {
            console.error("Error loading pedidos", err);
        }
    };

    const handleConfirmarRecepcion = async (pedidoId: number) => {
        if (!window.confirm('¿Confirmas la recepción física de estos productos? Esto incrementará tu stock.')) return;
        try {
            await ipc.invoke('confirmar-recepcion-pedido', pedidoId, 1);
            // Reload list
            const pedidos = await ipc.invoke('get-pedidos-por-proveedor', activeProveedorId, 1);
            setProveedorPedidos(pedidos);
        } catch (err) {
            console.error(err);
            alert('Error confirmando recepción');
        }
    };

    const handleRegistrarPago = async (pedidoId: number, total: number) => {
        const confirmarIntencion = window.confirm(`Estás por asentar el pago/gasto de esta orden por $${total.toFixed(2)}.\n\n¿Deseas continuar?`);
        if (!confirmarIntencion) return;

        const isCaja = window.confirm("¿De dónde salió el dinero para pagar esto?\n\n• Presiona [ACEPTAR] si pagaste en el momento (Saca dinero de la Caja / Cuenta Bancaria actual).\n\n• Presiona [CANCELAR] si lo dejaron fiado (El total se sumará automáticamente a la deuda de la Cuenta Corriente del Proveedor).");

        try {
            await ipc.invoke('registrar-pago-pedido', pedidoId, 1, activeProveedorId, total, isCaja);
            // Reload list
            const pedidos = await ipc.invoke('get-pedidos-por-proveedor', activeProveedorId, 1);
            setProveedorPedidos(pedidos);
            // Refresh proveedores to reflect any Cuenta Corriente balance updates
            loadProveedores();
        } catch (err) {
            console.error(err);
            alert('Error registrando el pago');
        }
    };

    const handleUpdateDianEvents = async (pedido: Pedido, eventField: string, val: boolean) => {
        const nuevosEventos = {
            evento_acuse_recibo: pedido.evento_acuse_recibo,
            evento_recibo_bienes: pedido.evento_recibo_bienes,
            evento_aceptacion_expresa: pedido.evento_aceptacion_expresa,
            [eventField]: val
        };

        try {
            await ipc.invoke('update-pedido-dian-events', pedido.id, nuevosEventos);
            // Reload list
            const pedidos = await ipc.invoke('get-pedidos-por-proveedor', activeProveedorId, 1);
            setProveedorPedidos(pedidos);
        } catch (err) {
            console.error(err);
            alert('Error actualizando eventos DIAN');
        }
    };

    const handleAgregarItemPedido = (productId: string) => {
        if (!productId) return;
        const prod = productosDisponibles.find(p => p.id === parseInt(productId));
        if (!prod) return;

        // Verificar si ya existe en el pedido
        if (nuevoPedidoItems.some(i => i.producto_id === prod.id)) {
            return alert('Este producto ya está en el pedido. Puede modificar su cantidad.');
        }

        setNuevoPedidoItems([...nuevoPedidoItems, {
            producto_id: prod.id,
            producto_nombre: prod.nombre,
            codigo: prod.codigo,
            cantidad: 1,
            precio_compra: prod.precio_compra,
            subtotal: prod.precio_compra
        }]);
    };

    const handleUpdateItem = (index: number, field: 'cantidad' | 'precio_compra', val: number) => {
        const newItems = [...nuevoPedidoItems];
        newItems[index] = { ...newItems[index], [field]: val };
        newItems[index].subtotal = newItems[index].cantidad * newItems[index].precio_compra;
        setNuevoPedidoItems(newItems);
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...nuevoPedidoItems];
        newItems.splice(index, 1);
        setNuevoPedidoItems(newItems);
    };

    const handleGenerarNuevoPedido = async () => {
        if (nuevoPedidoItems.length === 0) return alert('El pedido debe tener al menos un producto.');

        const totalPedido = nuevoPedidoItems.reduce((acc: number, curr: any) => acc + curr.subtotal, 0);

        try {
            // Generamos un CUFE local para control interno
            const cufe = `CUFE-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
            const fechaEmision = new Date().toISOString();

            await ipc.invoke('save-pedido', {
                proveedor_id: activeProveedorId,
                sucursal_id: 1,
                total: totalPedido + percepcionesRec - retencionesApl,
                percepciones_recibidas: percepcionesRec,
                retenciones_aplicadas: retencionesApl,
                cufe: cufe,
                fecha_emision_fe: fechaEmision,
                items: nuevoPedidoItems
            });

            setIsNuevoPedidoOpen(false);
            setNuevoPedidoItems([]);
            setPercepcionesRec(0);
            setRetencionesApl(0);

            // Recargar vista histórica
            const pedidos = await ipc.invoke('get-pedidos-por-proveedor', activeProveedorId, 1);
            setProveedorPedidos(pedidos);

        } catch (error) {
            console.error('Error guardando pedido:', error);
            alert('Error generando orden de compra.');
        }
    };
    // -------------------

    const filteredProveedores = proveedores.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.nombre_fantasia && p.nombre_fantasia.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.nit && p.nit.includes(searchTerm))
    );

    return (
        <div className="flex flex-col h-full animate-fade-in text-slate-800">
            {/* Header section */}
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Directorio de Proveedores</h1>
                    <p className="text-sm text-slate-500 mt-1">Gestión integral de logística, compras y retenciones impositivas.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/30">
                    <AddBusinessIcon fontSize="small" />
                    <span>Nuevo Proveedor</span>
                </button>
            </div>

            {/* Toolbar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6 flex gap-4">
                <div className="flex-1 relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fontSize="small" />
                    <input
                        type="text"
                        placeholder="Buscar por razón social, nombre fantasía o NIT..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto pb-6">
                {(loading as boolean) ? (
                    <div className="flex justify-center p-12"><div className="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div></div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                        {filteredProveedores.map((p: any) => (
                            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow relative group flex flex-col">
                                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <button onClick={() => handleOpenPedidosDesc(p.id!)} className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors" title="Pedidos / Compras">
                                        <ReceiptIcon fontSize="small" />
                                    </button>
                                    <button onClick={() => handleOpenModal(p, true)} className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center hover:bg-sky-100 transition-colors" title="Ver Info">
                                        <VisibilityIcon fontSize="small" />
                                    </button>
                                    <button onClick={() => handleOpenModal(p)} className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 transition-colors" title="Editar">
                                        <EditIcon fontSize="small" />
                                    </button>
                                    <button onClick={() => handleDelete(p.id!)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 transition-colors" title="Eliminar">
                                        <DeleteOutlineIcon fontSize="small" />
                                    </button>
                                </div>

                                <div className="flex gap-4 items-start mb-4 pr-16">
                                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                        <BusinessIcon />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-slate-800 line-clamp-1" title={p.nombre}>{p.nombre}</h3>
                                        {p.nombre_fantasia && <p className="text-xs font-semibold text-slate-500 line-clamp-1">{p.nombre_fantasia}</p>}
                                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold mt-1 inline-block border border-slate-200">
                                            NIT: {p.nit || 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2 mb-4 flex-1">
                                    {p.preventista_nombre && (
                                        <div className="flex items-center gap-2 text-xs text-slate-600 bg-sky-50 px-2 py-1.5 rounded-lg border border-sky-100">
                                            <EmojiPeopleIcon fontSize="inherit" className="text-sky-500" />
                                            <span className="font-semibold line-clamp-1">Prev: {p.preventista_nombre}</span>
                                            {p.preventista_telefono && <span className="text-slate-400">({p.preventista_telefono})</span>}
                                        </div>
                                    )}
                                    {p.dia_visita && p.dia_visita !== 'No Visitador' && (
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <LocalShippingIcon fontSize="inherit" className="text-slate-400" />
                                            <span>Visita: <b>{p.dia_visita}</b> | Entrega: <b>{p.dia_entrega}</b></span>
                                        </div>
                                    )}
                                    {p.saldo_envases > 0 && (
                                        <div className="flex items-center gap-2 text-xs text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                                            <InventoryIcon fontSize="inherit" />
                                            <span>Adeuda {p.saldo_envases} envases</span>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Responsabilidad</p>
                                        <p className="text-xs font-semibold text-slate-700">{p.responsabilidad_tributaria}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1 justify-end">
                                            <AccountBalanceWalletIcon style={{ fontSize: 12 }} /> Saldo Cta. Cte.
                                        </p>
                                        <p className={`font-black ${p.saldo_actual > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            ${p.saldo_actual.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className={`bg-white w-full ${showAdvanced ? 'max-w-5xl' : 'max-w-2xl'} rounded-3xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh] transition-all duration-300`}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <AddBusinessIcon className="text-indigo-500" />
                                    {isViewOnly ? 'Información del Proveedor' : editingId ? 'Editar Proveedor' : 'Alta de Nuevo Proveedor'}
                                </h2>
                                <p className="text-xs text-slate-500 mt-1">{isViewOnly ? 'Detalles fiscales y logísticos' : 'Complete la información del contacto'}</p>
                            </div>
                            <div className="flex gap-4 items-center">
                                <button
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${showAdvanced ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                                >
                                    {showAdvanced ? 'Ocultar Avanzado' : 'Opciones Avanzadas (Fiscales)'}
                                </button>
                                <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-500 font-bold transition-colors">
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
                            <fieldset disabled={isViewOnly} className={`grid grid-cols-1 ${showAdvanced ? 'lg:grid-cols-2 gap-x-12' : ''} gap-y-10 focus:outline-none`}>

                                {/* COLUMNA IZQUIERDA */}
                                <div className="space-y-8">
                                    {/* SECCION 1 */}
                                    <div>
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2 border-b border-indigo-100 pb-2 mb-4">
                                            <AccountBalanceIcon fontSize="small" /> A. Datos Generales y Fiscales
                                        </h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 mb-1">Razón Social *</label>
                                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 text-sm"
                                                    value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} />
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Nombre Fantasía</label>
                                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 text-sm"
                                                        value={formData.nombre_fantasia} onChange={e => setFormData({ ...formData, nombre_fantasia: e.target.value })} />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">NIT (Con DV, ej: 9001234567)</label>
                                                    <input type="text" maxLength={15} placeholder="9000000000" className={`w-full bg-slate-50 border ${cuitError ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-indigo-500'} rounded-xl px-4 py-2.5 outline-none transition-colors text-sm font-mono`}
                                                        value={formData.nit} onChange={e => {
                                                            const val = e.target.value.replace(/[^\d]/g, '');
                                                            setFormData({ ...formData, nit: val });
                                                            if (cuitError) setCuitError('');
                                                        }} />
                                                    {cuitError && <p className="text-rose-500 text-xs font-bold mt-1">{cuitError}</p>}
                                                </div>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Responsabilidad DIAN</label>
                                                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 text-sm"
                                                        value={formData.responsabilidad_tributaria} onChange={e => setFormData({ ...formData, responsabilidad_tributaria: e.target.value })}>
                                                        {RESPONSABILIDADES_DIAN.map(r => <option key={r.code} value={r.code}>{r.label} ({r.code})</option>)}
                                                    </select>
                                                </div>
                                                <div className="flex-1 flex flex-col justify-center">
                                                    <label className="flex items-center gap-2 cursor-pointer mt-4">
                                                        <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" 
                                                            checked={formData.responsable_iva} onChange={e => setFormData({...formData, responsable_iva: e.target.checked})} />
                                                        <span className="text-xs font-bold text-slate-600">Responsable de IVA</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECCION 2 */}
                                    <div>
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-2 border-b border-emerald-100 pb-2 mb-4">
                                            <LocalShippingIcon fontSize="small" /> B. Logística y Contacto
                                        </h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 mb-1">Domicilio Legal/Comercial</label>
                                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-sm"
                                                    value={formData.direccion} onChange={e => setFormData({ ...formData, direccion: e.target.value })} />
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Preventista (Nombre)</label>
                                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-sm"
                                                        value={formData.preventista_nombre} onChange={e => setFormData({ ...formData, preventista_nombre: e.target.value })} />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Celular Preventista</label>
                                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-sm"
                                                        value={formData.preventista_telefono} onChange={e => setFormData({ ...formData, preventista_telefono: e.target.value })} />
                                                </div>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Día de Visita</label>
                                                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-sm"
                                                        value={formData.dia_visita} onChange={e => setFormData({ ...formData, dia_visita: e.target.value })}>
                                                        {DIAS_SEMANA.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Día de Entrega Promedio</label>
                                                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-sm"
                                                        value={formData.dia_entrega} onChange={e => setFormData({ ...formData, dia_entrega: e.target.value })}>
                                                        {DIAS_SEMANA.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Teléfono Principal</label>
                                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-sm"
                                                        value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Código Postal</label>
                                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-sm"
                                                        value={formData.codigo_postal} onChange={e => setFormData({ ...formData, codigo_postal: e.target.value })} />
                                                </div>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Código CIIU (Actividad)</label>
                                                    <input type="text" placeholder="Ej: 4711" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-sm"
                                                        value={formData.codigo_ciiu} onChange={e => setFormData({ ...formData, codigo_ciiu: e.target.value })} />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Stock: Saldo de Envases</label>
                                                    <input type="number" min="0" className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 outline-none focus:border-amber-500 text-sm font-bold text-amber-900"
                                                        value={formData.saldo_envases} onFocus={(e) => e.target.select()} onChange={e => setFormData({ ...formData, saldo_envases: parseInt(e.target.value) || 0 })} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* COLUMNA DERECHA (AVANZADA) */}
                                {showAdvanced && (
                                    <div className="space-y-8 animate-fade-in border-l border-slate-100 pl-12">
                                        {/* SECCION 3 */}
                                        <div>
                                            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-600 flex items-center gap-2 border-b border-amber-100 pb-2 mb-4">
                                                <AccountBalanceWalletIcon fontSize="small" /> C. Finanzas y Pagos
                                            </h3>
                                            <div className="space-y-4">
                                                <div className="flex gap-4">
                                                    <div className="flex-[2]">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">Banco / N° de Cuenta (Ahorros o Corriente)</label>
                                                        <input type="text" placeholder="Ej: Bancolombia Ahorros 123..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-amber-500 text-sm font-mono"
                                                            value={formData.cbu} onChange={e => setFormData({ ...formData, cbu: e.target.value })} />
                                                    </div>
                                                    <div className="flex-[1]">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">Plazo de Pago</label>
                                                        <div className="relative">
                                                            <input type="number" min="0" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 outline-none focus:border-amber-500 text-sm"
                                                                value={formData.plazo_pago} onFocus={(e) => e.target.select()} onChange={e => setFormData({ ...formData, plazo_pago: parseInt(e.target.value) || 0 })} />
                                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">días</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-4">
                                                    <div className="flex-1">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">Mínimo de Compra</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">$</span>
                                                            <input type="number" step="0.01" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-4 py-2.5 outline-none focus:border-amber-500 text-sm"
                                                                value={formData.minimo_compra} onFocus={(e) => e.target.select()} onChange={e => setFormData({ ...formData, minimo_compra: parseFloat(e.target.value) || 0 })} />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">Límite de Crédito Permitido</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">$</span>
                                                            <input type="number" step="0.01" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-4 py-2.5 outline-none focus:border-amber-500 text-sm"
                                                                value={formData.limite_credito} onFocus={(e) => e.target.select()} onChange={e => setFormData({ ...formData, limite_credito: parseFloat(e.target.value) || 0 })} />
                                                        </div>
                                                    </div>
                                                    <div className="w-24">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">Moneda</label>
                                                        <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2.5 outline-none focus:border-amber-500 text-sm font-bold"
                                                            value={formData.moneda_compra} onChange={e => setFormData({ ...formData, moneda_compra: e.target.value })}>
                                                            {MONEDAS.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="flex gap-4">
                                                    <div className="flex-1">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">Email Pagos/Tesorería</label>
                                                        <input type="email" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-amber-500 text-sm"
                                                            value={formData.email_pagos} onChange={e => setFormData({ ...formData, email_pagos: e.target.value })} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">Email Facturación Electrónica</label>
                                                        <input type="email" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-amber-500 text-sm"
                                                            value={formData.email_facturacion} onChange={e => setFormData({ ...formData, email_facturacion: e.target.value })} />
                                                    </div>
                                                </div>
                                                <div className="flex gap-4">
                                                    <div className="flex-1">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">Saldo Cta. Cte. Actual</label>
                                                        <input type="number" step="0.01" className={`w-full border rounded-xl px-4 py-2.5 outline-none focus:border-amber-500 text-sm font-bold ${formData.saldo_actual > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200'}`}
                                                            value={formData.saldo_actual} onFocus={(e) => e.target.select()} onChange={e => setFormData({ ...formData, saldo_actual: parseFloat(e.target.value) || 0 })} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SECCION 4 */}
                                        <div>
                                            <h3 className="text-sm font-bold uppercase tracking-wider text-rose-600 flex items-center gap-2 border-b border-rose-100 pb-2 mb-4">
                                                <ReceiptIcon fontSize="small" /> D. Configuración Tributaria / Retenciones
                                            </h3>
                                            <div className="space-y-4">
                                                <div className="flex gap-4">
                                                    <div className="flex-1">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">ReteFuente %</label>
                                                        <div className="relative">
                                                            <input type="number" step="0.1" max="100" min="0" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 outline-none focus:border-rose-500 text-sm"
                                                                value={formData.retencion_ganancias} onFocus={(e) => e.target.select()} onChange={e => setFormData({ ...formData, retencion_ganancias: parseFloat(e.target.value) || 0 })} />
                                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">ReteICA %</label>
                                                        <div className="relative">
                                                            <input type="number" step="0.01" max="100" min="0" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 outline-none focus:border-rose-500 text-sm"
                                                                value={formData.retencion_iibb} onFocus={(e) => e.target.select()} onChange={e => setFormData({ ...formData, retencion_iibb: parseFloat(e.target.value) || 0 })} />
                                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-600 mb-1">Certificado de No Retención / Exención</label>
                                                    <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-rose-500 text-sm"
                                                        value={formData.vencimiento_certificado_exencion} onChange={e => setFormData({ ...formData, vencimiento_certificado_exencion: e.target.value })} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </fieldset>
                        </div>

                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
                            <button onClick={() => setIsModalOpen(false)} className={`px-6 py-2.5 rounded-xl font-bold transition-colors ${isViewOnly ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'text-slate-600 hover:bg-slate-200'}`}>
                                {isViewOnly ? 'Cerrar' : 'Cancelar'}
                            </button>
                            {!isViewOnly && (
                                <button onClick={handleSave} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-all active:scale-95">
                                    Guardar Expediente
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* MODAL PEDIDOS (HISTÓRICO) */}
            {isPedidosModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-slate-50 w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-800">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <ReceiptIcon className="text-emerald-500" />
                                    Órdenes de Compra al Proveedor
                                </h2>
                                <p className="text-xs text-slate-500 mt-1">Gestiona pedidos, recepciones de stock y pagos.</p>
                            </div>
                            <button
                                onClick={() => setIsNuevoPedidoOpen(true)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl font-medium transition-colors shadow-lg shadow-emerald-500/30">
                                + Generar Pedido
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                            {proveedorPedidos.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <ReceiptIcon sx={{ fontSize: 48 }} className="mb-4 opacity-20" />
                                    <p>Aún no has generado ningún pedido para este proveedor.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {proveedorPedidos.map(pedido => (
                                        <div key={pedido.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
                                            <div>
                                                <div className="flex gap-2 items-center mb-1">
                                                    <span className="font-bold text-slate-800">Pedido #{pedido.id}</span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${pedido.estado === 'RECIBIDO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {pedido.estado}
                                                    </span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${pedido.pagado ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {pedido.pagado ? 'PAGADO/EN CC' : 'FALTA PAGAR'}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <p className="text-xs text-slate-500">Total: <b className="text-slate-700">${pedido.total.toFixed(2)}</b></p>
                                                    {pedido.cufe && <p className="text-[10px] font-mono text-slate-400">CUFE: {pedido.cufe}</p>}
                                                </div>
                                                
                                                {/* DIAN EVENTS TRACKING */}
                                                <div className="mt-3 flex gap-3 border-t border-slate-100 pt-2">
                                                    <label className="flex items-center gap-1.5 cursor-pointer group">
                                                        <input type="checkbox" className="w-3.5 h-3.5 rounded text-emerald-600" 
                                                            checked={!!pedido.evento_acuse_recibo} 
                                                            onChange={e => handleUpdateDianEvents(pedido, 'evento_acuse_recibo', e.target.checked)} />
                                                        <span className="text-[10px] font-bold text-slate-500 group-hover:text-emerald-600 transition-colors">Acuse</span>
                                                    </label>
                                                    <label className="flex items-center gap-1.5 cursor-pointer group">
                                                        <input type="checkbox" className="w-3.5 h-3.5 rounded text-emerald-600" 
                                                            checked={!!pedido.evento_recibo_bienes} 
                                                            onChange={e => handleUpdateDianEvents(pedido, 'evento_recibo_bienes', e.target.checked)} />
                                                        <span className="text-[10px] font-bold text-slate-500 group-hover:text-emerald-600 transition-colors">Recibo</span>
                                                    </label>
                                                    <label className="flex items-center gap-1.5 cursor-pointer group">
                                                        <input type="checkbox" className="w-3.5 h-3.5 rounded text-emerald-600" 
                                                            checked={!!pedido.evento_aceptacion_expresa} 
                                                            onChange={e => handleUpdateDianEvents(pedido, 'evento_aceptacion_expresa', e.target.checked)} />
                                                        <span className="text-[10px] font-bold text-slate-500 group-hover:text-emerald-600 transition-colors">Aceptación</span>
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                {pedido.estado === 'PENDIENTE' && (
                                                    <button onClick={() => handleConfirmarRecepcion(pedido.id!)} className="px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200">
                                                        Confirmar Recepción
                                                    </button>
                                                )}
                                                {!pedido.pagado && (
                                                    <button onClick={() => handleRegistrarPago(pedido.id!, pedido.total)} className="px-3 py-1.5 text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200">
                                                        Registrar Pago/Gasto
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 flex justify-end bg-white shrink-0">
                            <button onClick={() => setIsPedidosModalOpen(false)} className="px-6 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                                Cerrar Ventana
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL NUEVO PEDIDO */}
            {isNuevoPedidoOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
                    <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-800">
                        <div className="p-6 border-b border-slate-100 bg-emerald-50 text-emerald-800">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <AddBusinessIcon /> Generar Nueva Orden de Compra
                            </h2>
                            <p className="text-sm opacity-80 mt-1">Acuerda precios de costo y cantidades antes de recibir la mercadería.</p>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                            <div className="mb-6 text-slate-800">
                                <label className="block text-sm font-bold text-slate-700 mb-2">Añadir Producto al Pedido</label>
                                <select
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 font-medium text-slate-800"
                                    onChange={(e) => { handleAgregarItemPedido(e.target.value); e.target.value = ''; }}
                                    defaultValue=""
                                >
                                    <option value="" disabled className="text-slate-400">-- Selecciona un producto para agregar --</option>
                                    {productosDisponibles.map(p => (
                                        <option key={p.id} value={p.id} className="text-slate-800">{p.codigo} - {p.nombre} (Costo Válido: ${p.precio_compra})</option>
                                    ))}
                                </select>
                            </div>

                            {nuevoPedidoItems.length > 0 && (
                                <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:border-emerald-500 transition-colors">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-bold">
                                            <tr>
                                                <th className="px-4 py-3">Producto</th>
                                                <th className="px-4 py-3 w-32">Cantidad</th>
                                                <th className="px-4 py-3 w-32">Costo Pactado</th>
                                                <th className="px-4 py-3 w-32 text-right">Subtotal</th>
                                                <th className="px-4 py-3 w-16"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {nuevoPedidoItems.map((item: any, index: number) => (
                                                <tr key={index} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-slate-800 line-clamp-1">{item.producto_nombre}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input type="number" min="1" className="w-full border rounded-lg px-2 py-1 text-center"
                                                            value={item.cantidad || ''} onFocus={(e) => e.target.select()} onChange={e => handleUpdateItem(index, 'cantidad', parseInt(e.target.value) || 0)} />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="relative">
                                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                                            <input type="number" step="0.01" min="0" className="w-full border rounded-lg pl-6 pr-2 py-1 text-center"
                                                                value={item.precio_compra || ''} onFocus={(e) => e.target.select()} onChange={e => handleUpdateItem(index, 'precio_compra', parseFloat(e.target.value) || 0)} />
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-slate-700">
                                                        ${item.subtotal.toFixed(2)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <button onClick={() => handleRemoveItem(index)} className="text-rose-400 hover:text-rose-600">
                                                            <DeleteOutlineIcon fontSize="small" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {settings.dianCompliance2026 && (
                                        <div className="bg-white p-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 mb-1">Cargos Adicionales / Flete ($)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none focus:border-emerald-500"
                                                    value={percepcionesRec}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => setPercepcionesRec(parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 mb-1">Descuentos / Retenciones ($)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none focus:border-rose-500"
                                                    value={retencionesApl}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => setRetencionesApl(parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <div className="bg-emerald-50 p-4 border-t border-emerald-100 flex justify-between items-center text-sm">
                                        <div className="flex flex-col">
                                            <span className="text-slate-500">Monto Neto: ${nuevoPedidoItems.reduce((acc: number, curr: any) => acc + curr.subtotal, 0).toFixed(2)}</span>
                                            {settings.dianCompliance2026 && (
                                                <span className="text-slate-500 text-xs">Ajustes: +${percepcionesRec} / -${retencionesApl}</span>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span className="block font-bold text-emerald-800">Total a Pagar:</span>
                                            <span className="text-xl font-black text-emerald-700">
                                                ${(nuevoPedidoItems.reduce((acc: number, curr: any) => acc + curr.subtotal, 0) + percepcionesRec - retencionesApl).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
                            <button onClick={() => { setIsNuevoPedidoOpen(false); setNuevoPedidoItems([]) }} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                                Cancelar
                            </button>
                            <button onClick={handleGenerarNuevoPedido} className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 transition-all active:scale-95">
                                Generar Orden Formal
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
