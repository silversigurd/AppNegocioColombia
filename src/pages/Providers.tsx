import React, { useState, useEffect } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BusinessIcon from '@mui/icons-material/Business';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { ipc } from '../utils/ipc';

type Proveedor = {
    id?: number;
    nombre: string;
    nombre_fantasia: string;
    cuit: string;
    condicion_iva: string;
    condicion_iibb: string;
    direccion: string;
    email_compras: string;
    email_pagos: string;
    telefono: string;
    plazo_pago: number;
    cbu: string;
    rubro: string;
    saldo_actual: number;
};

const CONDICIONES_IVA = ['Responsable Inscripto', 'Monotributista', 'Exento', 'Consumidor Final'];
const CONDICIONES_IIBB = ['Local', 'Convenio Multilateral', 'Exento', 'No Inscripto'];

// Validador de CUIT Argentino (Módulo 11)
function validarCUIT(cuit: string): boolean {
    if (!cuit) return false;
    const cleanCuit = cuit.replace(/[-_]/g, '');
    if (cleanCuit.length !== 11 || !/^\d+$/.test(cleanCuit)) return false;

    const [, , digito] = [
        cleanCuit.substring(0, 2),
        cleanCuit.substring(2, 10),
        parseInt(cleanCuit.substring(10, 11), 10)
    ];

    let sum = 0;
    const mul = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    for (let i = 0; i < 10; i++) {
        sum += parseInt(cleanCuit[i], 10) * mul[i];
    }

    const mod = sum % 11;
    let computedDigito = mod === 0 ? 0 : 11 - mod;

    // Si da 11 (mod=0), el digito es 0. 
    // Si da 10, generalmente indica que el cuit pre-asignado no es valido, se usa el flag de genero
    if (computedDigito === 11) computedDigito = 0;
    if (computedDigito === 10) return false; // Invalido normalmente

    return computedDigito === digito;
}

export default function Providers() {
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [cuitError, setCuitError] = useState('');

    const [formData, setFormData] = useState<Proveedor>({
        nombre: '', nombre_fantasia: '', cuit: '',
        condicion_iva: 'Responsable Inscripto', condicion_iibb: 'Local',
        direccion: '', email_compras: '', email_pagos: '',
        telefono: '', plazo_pago: 0, cbu: '', rubro: '', saldo_actual: 0
    });

    useEffect(() => {
        loadProveedores();
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

    const handleOpenModal = (prov?: Proveedor) => {
        if (prov) {
            setEditingId(prov.id!);
            setFormData(prov);
        } else {
            setEditingId(null);
            setFormData({
                nombre: '', nombre_fantasia: '', cuit: '',
                condicion_iva: 'Responsable Inscripto', condicion_iibb: 'Local',
                direccion: '', email_compras: '', email_pagos: '',
                telefono: '', plazo_pago: 0, cbu: '', rubro: '', saldo_actual: 0
            });
        }
        setCuitError('');
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.nombre) {
            return alert('La Razón Social / Nombre es olbigatorio.');
        }

        if (formData.cuit && !validarCUIT(formData.cuit)) {
            return setCuitError('El CUIT ingresado no es válido (Módulo 11 falló).');
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

    const filteredProveedores = proveedores.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.nombre_fantasia && p.nombre_fantasia.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.cuit && p.cuit.includes(searchTerm))
    );

    return (
        <div className="flex flex-col h-full animate-fade-in text-slate-800">
            {/* Header section */}
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Directorio de Proveedores</h1>
                    <p className="text-sm text-slate-500 mt-1">Gestiona compras, retenciones e información de contacto.</p>
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
                        placeholder="Buscar por razón social, nombre fantasía o CUIT..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto pb-6">
                {loading ? (
                    <div className="flex justify-center p-12"><div className="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div></div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredProveedores.map(p => (
                            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-shadow relative group">
                                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleOpenModal(p)} className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 transition-colors">
                                        <EditIcon fontSize="small" />
                                    </button>
                                    <button onClick={() => handleDelete(p.id!)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 transition-colors">
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
                                            CUIT: {p.cuit || 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2 mb-4">
                                    <div className="flex items-center gap-3 text-sm text-slate-500">
                                        <PhoneIcon fontSize="smal" className="text-slate-400" />
                                        <span className="truncate">{p.telefono || 'Sin teléfono'}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-slate-500">
                                        <EmailIcon fontSize="smal" className="text-slate-400" />
                                        <span className="truncate">{p.email_compras || p.email_pagos || 'Sin email'}</span>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Condición</p>
                                        <p className="text-xs font-semibold text-slate-700">{p.condicion_iva}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1 justify-end">
                                            <AccountBalanceWalletIcon style={{ fontSize: 12 }} /> Saldo Vencido
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
                    <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <AddBusinessIcon className="text-indigo-500" />
                                {editingId ? 'Editar Proveedor' : 'Alta de Nuevo Proveedor'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-500 font-bold">
                                ✕
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                {/* SECCION 1 */}
                                <div className="md:col-span-2"><h3 className="text-sm font-bold uppercase tracking-wider text-indigo-600 border-b border-indigo-100 pb-2 mb-4">A. Datos de Cabecera (Obligatorios)</h3></div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">Razón Social *</label>
                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500"
                                        value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">Nombre Fantasía</label>
                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500"
                                        value={formData.nombre_fantasia} onChange={e => setFormData({ ...formData, nombre_fantasia: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">CUIT (11 dígitos, sin guiones)</label>
                                    <input type="text" maxLength={11} className={`w-full bg-slate-50 border ${cuitError ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-indigo-500'} rounded-xl px-4 py-2.5 outline-none transition-colors`}
                                        value={formData.cuit} onChange={e => {
                                            setFormData({ ...formData, cuit: e.target.value });
                                            if (cuitError) setCuitError('');
                                        }} />
                                    {cuitError && <p className="text-rose-500 text-xs font-bold mt-1">{cuitError}</p>}
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-slate-600 mb-1">Condición IVA</label>
                                        <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500"
                                            value={formData.condicion_iva} onChange={e => setFormData({ ...formData, condicion_iva: e.target.value })}>
                                            {CONDICIONES_IVA.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-slate-600 mb-1">Condición IIBB</label>
                                        <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500"
                                            value={formData.condicion_iibb} onChange={e => setFormData({ ...formData, condicion_iibb: e.target.value })}>
                                            {CONDICIONES_IIBB.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* SECCION 2 */}
                                <div className="md:col-span-2 mt-4"><h3 className="text-sm font-bold uppercase tracking-wider text-emerald-600 border-b border-emerald-100 pb-2 mb-4">B. Datos de Contacto y Logística</h3></div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-bold text-slate-600 mb-1">Domicilio Legal/Comercial</label>
                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500"
                                        value={formData.direccion} onChange={e => setFormData({ ...formData, direccion: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">Email de Compras/Ventas</label>
                                    <input type="email" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500"
                                        value={formData.email_compras} onChange={e => setFormData({ ...formData, email_compras: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">Email de Pagos/Tesorería</label>
                                    <input type="email" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500"
                                        value={formData.email_pagos} onChange={e => setFormData({ ...formData, email_pagos: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">Teléfono</label>
                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500"
                                        value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} />
                                </div>

                                {/* SECCION 3 */}
                                <div className="md:col-span-2 mt-4"><h3 className="text-sm font-bold uppercase tracking-wider text-amber-600 border-b border-amber-100 pb-2 mb-4">C. Configuración Comercial</h3></div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">Plazo de Pago (Días)</label>
                                    <input type="number" min="0" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-amber-500"
                                        value={formData.plazo_pago} onChange={e => setFormData({ ...formData, plazo_pago: parseInt(e.target.value) || 0 })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">CBU / Alias (22 dígitos o Alias)</label>
                                    <input type="text" maxLength={22} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-amber-500"
                                        value={formData.cbu} onChange={e => setFormData({ ...formData, cbu: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">Rubro / Categoría</label>
                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-amber-500"
                                        value={formData.rubro} onChange={e => setFormData({ ...formData, rubro: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">Saldo Actual Incial ($)</label>
                                    <input type="number" step="0.01" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-amber-500"
                                        value={formData.saldo_actual} onChange={e => setFormData({ ...formData, saldo_actual: parseFloat(e.target.value) || 0 })} />
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                            <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">
                                Cancelar
                            </button>
                            <button onClick={handleSave} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-all active:scale-95">
                                Guardar Proveedor
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
