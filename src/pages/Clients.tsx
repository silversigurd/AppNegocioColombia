import React, { useState, useEffect } from 'react';
import { ipc } from '../utils/ipc';
import { useSettings } from '../context/SettingsContext';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import LockPersonIcon from '@mui/icons-material/LockPerson';
import BadgeIcon from '@mui/icons-material/Badge';

interface Client {
    id?: number;
    nombre: string;
    telefono: string;
    email: string;
    nit_cedula?: string;        // Colombia: Cédula o NIT del cliente
    eps?: string;               // Colombia: EPS del cliente
    fondo_pensiones?: string;   // Colombia: Fondo de Pensiones
    arl?: string;               // Colombia: ARL
    autoriza_datos?: number;    // 1 = autoriza, 0 = no autoriza (Ley 1581)
    fecha_autorizacion?: string;
    datos_suprimidos?: number;  // 1 = solicitó supresión de datos
}

const initialForm: Client = {
    nombre: '',
    telefono: '',
    email: '',
    nit_cedula: '',
    eps: '',
    fondo_pensiones: '',
    arl: '',
    autoriza_datos: 0,
    fecha_autorizacion: '',
    datos_suprimidos: 0,
};

export default function Clients() {
    const { settings } = useSettings();
    const isColombia = settings.pais === 'Colombia';

    const [clients, setClients] = useState<Client[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState<Client>(initialForm);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const loadClients = async () => {
        try {
            const data = await ipc.invoke('get-clients', {});
            setClients(data || []);
        } catch (e) {
            console.error('Error loading clients', e);
        }
    };

    useEffect(() => { loadClients(); }, []);

    const filteredClients = clients.filter(c =>
        c.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.nit_cedula?.includes(searchTerm)
    );

    const openNew = () => {
        setForm({ ...initialForm });
        setIsEditing(false);
        setShowModal(true);
    };

    const openEdit = (client: Client) => {
        setForm({ ...client });
        setIsEditing(true);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.nombre.trim()) return;
        setSaving(true);
        try {
            const payload = {
                ...form,
                autoriza_datos: form.autoriza_datos ? 1 : 0,
                fecha_autorizacion: form.autoriza_datos && !form.fecha_autorizacion
                    ? new Date().toISOString().split('T')[0]
                    : form.fecha_autorizacion,
            };
            if (isEditing && form.id) {
                await ipc.invoke('update-client', payload);
            } else {
                await ipc.invoke('add-client', payload);
            }
            await loadClients();
            setShowModal(false);
        } catch (e) {
            console.error('Error saving client', e);
        } finally {
            setSaving(false);
        }
    };

    const handleSuprimir = async (client: Client) => {
        if (!client.id) return;
        if (!confirm(`¿Suprimir los datos de ${client.nombre}? Esta acción no se puede deshacer (Ley 1581).`)) return;
        try {
            await ipc.invoke('suprimir-datos-cliente', { id: client.id });
            await loadClients();
        } catch (e) {
            console.error('Error suppressing data', e);
        }
    };

    return (
        <div className="flex flex-col h-full animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Directorio de Clientes</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {isColombia ? 'Gestión conforme Ley 1581 (Habeas Data) · Colombia' : 'Clientes registrados'}
                    </p>
                </div>
                <button
                    onClick={openNew}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/30"
                >
                    <PersonAddAlt1Icon fontSize="small" />
                    <span>Nuevo Cliente</span>
                </button>
            </div>

            {/* Search */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4 mb-6">
                <div className="flex-1 relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fontSize="small" />
                    <input
                        type="text"
                        placeholder={isColombia ? 'Buscar por nombre, cédula/NIT o correo...' : 'Buscar por nombre o email...'}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto pb-6">
                {filteredClients.map(client => (
                    <div
                        key={client.id}
                        onClick={() => openEdit(client)}
                        className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-shadow relative group cursor-pointer"
                    >
                        {client.datos_suprimidos ? (
                            <div className="absolute top-3 right-3 bg-red-100 text-red-600 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Suprimido</div>
                        ) : client.autoriza_datos ? (
                            <div className="absolute top-3 right-3 bg-emerald-100 text-emerald-600 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide">Autoriza</div>
                        ) : null}

                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xl uppercase shadow-inner">
                                {client.nombre.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 line-clamp-1">{client.nombre}</h3>
                                {client.nit_cedula && (
                                    <span className="text-[10px] text-slate-500 font-medium flex items-center gap-0.5">
                                        <BadgeIcon sx={{ fontSize: 11 }} /> {client.nit_cedula}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            {client.telefono && (
                                <div className="flex items-center gap-3 text-sm text-slate-500">
                                    <PhoneIcon fontSize="small" className="text-slate-400" />
                                    <span className="truncate">{client.telefono}</span>
                                </div>
                            )}
                            {client.email && (
                                <div className="flex items-center gap-3 text-sm text-slate-500">
                                    <EmailIcon fontSize="small" className="text-slate-400" />
                                    <span className="truncate">{client.email}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {filteredClients.length === 0 && (
                    <div className="col-span-full text-center py-16 text-slate-400">
                        <PersonAddAlt1Icon sx={{ fontSize: 48 }} />
                        <p className="mt-2 font-semibold">No hay clientes registrados todavía.</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white rounded-t-3xl z-10">
                            <h2 className="text-lg font-bold text-slate-800">
                                {isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                                <CloseIcon />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Nombre / Razón Social *</label>
                                <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700"
                                    value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                            </div>

                            {isColombia && (
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Cédula / NIT</label>
                                    <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700"
                                        value={form.nit_cedula || ''} onChange={e => setForm({ ...form, nit_cedula: e.target.value })}
                                        placeholder="1234567890" />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Teléfono</label>
                                    <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700"
                                        value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Correo Electrónico</label>
                                    <input type="email" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700"
                                        value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                                </div>
                            </div>

                            {isColombia && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">EPS</label>
                                            <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700"
                                                value={form.eps || ''} onChange={e => setForm({ ...form, eps: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Fondo de Pensiones</label>
                                            <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700"
                                                value={form.fondo_pensiones || ''} onChange={e => setForm({ ...form, fondo_pensiones: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">ARL</label>
                                        <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-bold text-slate-700"
                                            value={form.arl || ''} onChange={e => setForm({ ...form, arl: e.target.value })} />
                                    </div>

                                    {/* Habeas Data - Ley 1581 */}
                                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                                        <div className="flex items-start gap-3">
                                            <LockPersonIcon className="text-blue-500 mt-0.5 shrink-0" fontSize="small" />
                                            <div className="flex-1">
                                                <p className="text-sm font-bold text-blue-800 mb-1">Habeas Data — Ley 1581 de 2012</p>
                                                <p className="text-[10px] text-blue-600 mb-3 leading-relaxed">
                                                    El cliente autoriza el tratamiento de sus datos personales para fines comerciales, de acuerdo a la Política de Tratamiento de Datos del establecimiento.
                                                </p>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!form.autoriza_datos}
                                                        onChange={e => setForm({
                                                            ...form,
                                                            autoriza_datos: e.target.checked ? 1 : 0,
                                                            fecha_autorizacion: e.target.checked ? new Date().toISOString().split('T')[0] : '',
                                                        })}
                                                        className="w-4 h-4 accent-blue-500 rounded"
                                                    />
                                                    <span className="text-xs font-bold text-blue-700">
                                                        El cliente autoriza el tratamiento de sus datos
                                                    </span>
                                                </label>
                                                {form.autoriza_datos && form.fecha_autorizacion && (
                                                    <p className="text-[9px] text-blue-500 mt-1 ml-6">Autorizado el {form.fecha_autorizacion}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {isEditing && form.id && !form.datos_suprimidos && (
                                        <button
                                            type="button"
                                            onClick={() => { setShowModal(false); handleSuprimir(form); }}
                                            className="w-full text-center text-xs text-red-500 hover:text-red-700 font-bold underline"
                                        >
                                            Solicitar supresión de datos (Ley 1581 — Derecho al Olvido)
                                        </button>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-500 font-bold rounded-xl hover:bg-slate-100 transition-colors">
                                Cancelar
                            </button>
                            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-colors disabled:opacity-60">
                                <SaveIcon fontSize="small" />
                                <span>{saving ? 'Guardando...' : 'Guardar'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
