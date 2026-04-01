import React, { useState } from 'react';
import { ipc } from '../utils/ipc';
import { useSettings } from '../context/SettingsContext';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import StorefrontIcon from '@mui/icons-material/Storefront';
import PrintIcon from '@mui/icons-material/Print';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FolderIcon from '@mui/icons-material/Folder';
import { ICA_POR_MUNICIPIO, UVT_2026, SMMLV_2026, AUX_TRANSPORTE_2026 } from '../utils/colombiaConstants';



export default function Settings() {
    const { settings, reloadSettings } = useSettings();

    const [form, setForm] = useState({
        businessName: settings.businessName,
        businessNit: settings.businessNit, // Colombia
        businessAddress: settings.businessAddress,
        tagline: settings.tagline,
        printerProfile: settings.printerProfile,
        pais: 'Colombia',
        hrEmpresaSize: settings.hrEmpresaSize,
        dianCompliance2026: settings.dianCompliance2026,
        // Colombia 2026
        tieneCafeteria: settings.tieneCafeteria ?? false,
        esResponsableIVA: settings.esResponsableIVA ?? true,
        municipio: settings.municipio || 'Bogotá D.C.',
        tasaICA: settings.tasaICA || 11.04,
        resolucionDIAN: settings.resolucionDIAN || '',
    });

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [taxIdError, setTaxIdError] = useState('');

    const handleTaxIdChange = (val: string) => {
        // Colombia NIT logic: 9 digits base + 1 verification digit (DV) = 10 total
        const typed = val.replace(/\D/g, '').slice(0, 10);
        let formatted = typed;
        if (typed.length > 9) {
            formatted = typed.slice(0, 9) + '-' + typed.slice(9, 10);
        }
        setForm({ ...form, businessNit: formatted });
        
        if (typed.length > 0 && typed.length < 9) {
            setTaxIdError('El NIT debe tener al menos 9 dígitos según normativa DIAN.');
        } else {
            setTaxIdError('');
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            await ipc.invoke('save-settings', {
                ...form
            });

            await reloadSettings();
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full animate-fade-in text-slate-800 max-w-3xl mx-auto">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <SettingsIcon className="text-slate-500" />
                        Ajustes de CommerceOS Pro
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Configuración y parámetros fiscales para Colombia.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-primary-500/30 active:scale-95 disabled:opacity-60"
                >
                    {saved ? <CheckCircleIcon fontSize="small" /> : <SaveIcon fontSize="small" />}
                    <span>{saved ? '¡Guardado!' : saving ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
            </div>

            <div className="space-y-6 pb-12">



                {/* Business Info */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <StorefrontIcon fontSize="small" /> Datos del Comercio
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Nombre Legal / Razón Social</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                value={form.businessName}
                                onChange={e => setForm({ ...form, businessName: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Tipo de Comercio</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                value={form.tagline || ''}
                                placeholder="Ej: Administración Almacén"
                                onChange={e => setForm({ ...form, tagline: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">
                                    NIT
                                </label>
                                <input
                                    type="text"
                                    className={`w-full px-4 py-3 bg-slate-50 border rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700 ${taxIdError ? 'border-rose-400' : 'border-slate-200'}`}
                                    value={form.businessNit || ''}
                                    onChange={e => handleTaxIdChange(e.target.value)}
                                    placeholder={'Ej: 900123456-7'}
                                />
                                {taxIdError ? (
                                    <p className="text-xs text-rose-500 mt-1 font-semibold">{taxIdError}</p>
                                ) : (
                                    <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                                        <p className="text-[10px] text-blue-700 leading-tight">
                                            <strong>ℹ️ Info DIAN:</strong> El NIT consta de nueve dígitos y se otorga a través de la Dirección de Impuestos y Aduanas Nacionales –DIAN– con el fin de llevar un registro detallado de las obligaciones tributarias por las que deben responder los colombianos.
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Dirección</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                    value={form.businessAddress}
                                    onChange={e => setForm({ ...form, businessAddress: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Printer Settings */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <PrintIcon fontSize="small" /> Configuración de Impresora
                    </h2>
                    <div>
                        <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Ancho del Ticket</label>
                        <select
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700 appearance-none"
                            value={form.printerProfile}
                            onChange={e => setForm({ ...form, printerProfile: e.target.value })}
                        >
                            <option value="58mm">58mm (Térmica compacta)</option>
                            <option value="80mm">80mm (Térmica estándar)</option>
                            <option value="A4">A4 (Impresora de oficina)</option>
                        </select>
                        <p className="text-[10px] text-slate-400 mt-1 ml-1">El ancho afecta el formato del texto en los tickets impresos.</p>
                    </div>
                </div>

                {/* Normativa Laboral */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <SettingsIcon fontSize="small" /> 
                        Normativa Laboral (CST)
                    </h2>
                    <div className="space-y-4">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
                            <p><strong>Nota Colombia 2026:</strong> La normativa CST aplica automáticamente la reducción de jornada a 210h y los recargos vigentes vinculados con el SMMLV. El periodo de prueba estándar es de 2 meses para contratos indefinidos.</p>
                        </div>
                    </div>
                </div>

                {/* Colombia 2026 - Panel de Parámetros Fiscales */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 border-l-4 border-l-yellow-400">
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                            <span className="text-yellow-500">📋</span> Colombia 2026 — Parámetros Fiscales
                        </h2>
                        <div className="grid grid-cols-3 gap-3 mb-5">
                            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 text-center">
                                <p className="text-[10px] font-black uppercase text-amber-600 mb-1">UVT 2026</p>
                                <p className="text-lg font-black text-amber-800">${UVT_2026.toLocaleString('es-CO')}</p>
                                <p className="text-[9px] text-amber-500">Res. DIAN 238/2025</p>
                            </div>
                            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
                                <p className="text-[10px] font-black uppercase text-emerald-600 mb-1">SMMLV 2026</p>
                                <p className="text-lg font-black text-emerald-800">${SMMLV_2026.toLocaleString('es-CO')}</p>
                                <p className="text-[9px] text-emerald-500">Decreto 1469/2025</p>
                            </div>
                            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-center">
                                <p className="text-[10px] font-black uppercase text-blue-600 mb-1">Aux. Transporte</p>
                                <p className="text-lg font-black text-blue-800">${AUX_TRANSPORTE_2026.toLocaleString('es-CO')}</p>
                                <p className="text-[9px] text-blue-500">Decreto 1470/2025</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div>
                                    <p className="text-sm font-bold text-slate-700">Responsable del IVA</p>
                                    <p className="text-[10px] text-slate-500">Ingresos &gt; 3.500 UVT anuales (~$183M). Si es No Responsable, el tiquete no discrimina IVA.</p>
                                </div>
                                <div onClick={() => setForm({ ...form, esResponsableIVA: !form.esResponsableIVA })} className={`ml-4 w-12 h-6 rounded-full p-1 cursor-pointer transition-colors shrink-0 ${form.esResponsableIVA ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                    <div className={`bg-white w-4 h-4 rounded-full transition-transform ${form.esResponsableIVA ? 'translate-x-6' : 'translate-x-0'}`} />
                                </div>
                            </div>
                            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div>
                                    <p className="text-sm font-bold text-slate-700">¿Tiene sección de cafetería / restaurante?</p>
                                    <p className="text-[10px] text-slate-500">Activa IPOC 8% para comidas preparadas (excluyente con IVA).</p>
                                </div>
                                <div onClick={() => setForm({ ...form, tieneCafeteria: !form.tieneCafeteria })} className={`ml-4 w-12 h-6 rounded-full p-1 cursor-pointer transition-colors shrink-0 ${form.tieneCafeteria ? 'bg-orange-500' : 'bg-slate-300'}`}>
                                    <div className={`bg-white w-4 h-4 rounded-full transition-transform ${form.tieneCafeteria ? 'translate-x-6' : 'translate-x-0'}`} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Municipio / Ciudad (ICA)</label>
                                <select
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-amber-50 focus:border-amber-400 transition-all font-bold text-slate-700 appearance-none"
                                    value={form.municipio}
                                    onChange={e => { const tasa = ICA_POR_MUNICIPIO[e.target.value] ?? 9.68; setForm({ ...form, municipio: e.target.value, tasaICA: tasa }); }}
                                >
                                    {Object.keys(ICA_POR_MUNICIPIO).map(m => (
                                        <option key={m} value={m}>{m} — ICA {ICA_POR_MUNICIPIO[m]}/1000</option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-slate-400 mt-1 ml-1">Tasa ICA activa: {form.tasaICA}/1000</p>
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">N° Resolución POS DIAN (referencia interna)</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                    value={form.resolucionDIAN}
                                    onChange={e => setForm({ ...form, resolucionDIAN: e.target.value })}
                                    placeholder="Ej: 000165-2023 (opcional)"
                                />
                            </div>
                            <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 text-[11px] text-sky-800 leading-relaxed">
                                <strong>ℹ️ Nota:</strong> Este sistema genera documentos POS de uso interno con CUDE local (no habilitado DIAN). La habilitación como Operador de Facturación Electrónica es responsabilidad del establecimiento comercial.
                            </div>
                        </div>
                    </div>
                {/* Cumplimiento Tributario */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 border-l-4 border-l-amber-400">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <StorefrontIcon fontSize="small" className="text-amber-500" /> Compliance Fiscal
                    </h2>
                    <div className="flex items-center justify-between bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                        <div>
                            <p className="text-sm font-bold text-slate-700">DIAN POS Electrónico 2026 (Interno)</p>
                            <p className="text-[10px] text-slate-500">Genera CUDE local, desglose de tipos de IVA y campos Anexo 1.9.</p>
                        </div>
                        <div
                            onClick={() => setForm({ ...form, dianCompliance2026: !form.dianCompliance2026 })}
                            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${form.dianCompliance2026 ? 'bg-amber-500' : 'bg-slate-300'}`}
                        >
                            <div className={`bg-white w-4 h-4 rounded-full shadow-sm transition-transform ${form.dianCompliance2026 ? 'translate-x-6' : 'translate-x-0'}`} />
                        </div>
                    </div>
                </div>

                {/* Copia de Seguridad */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 border-l-4 border-l-blue-400">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <FolderIcon fontSize="small" className="text-blue-500" /> Copia de Seguridad
                    </h2>
                    <p className="text-xs text-slate-500 mb-4">
                        Haz clic en el botón de abajo para abrir la carpeta donde se guarda tu base de datos.
                        Desde allí puedes copiar el archivo <code className="bg-slate-100 px-1 rounded text-primary-700 font-bold">commerce_data.sqlite</code> a un USB para respaldo.
                    </p>
                    <button
                        onClick={() => ipc.invoke('open-db-folder')}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-200 active:scale-95 text-xs"
                    >
                        <FolderIcon fontSize="small" /> Abrir Carpeta de Base de Datos
                    </button>
                </div>

            </div>
        </div>
    );
}
