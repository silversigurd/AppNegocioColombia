import React, { useState, useEffect, useRef } from 'react';
import { ipc } from '../utils/ipc';
import { useSettings } from '../context/SettingsContext';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import StorefrontIcon from '@mui/icons-material/Storefront';
import PrintIcon from '@mui/icons-material/Print';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FolderIcon from '@mui/icons-material/Folder';
import { ICA_POR_MUNICIPIO, UVT_2026, SMMLV_2026, AUX_TRANSPORTE_2026 } from '../utils/colombiaConstants';



const buildForm = (settings: ReturnType<typeof useSettings>['settings']) => ({
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
    // MATIAS API
    dian_resolucion: settings.dian_resolucion || '',
    dian_prefijo: settings.dian_prefijo || '',
    dian_numero_actual: settings.dian_numero_actual || '1',
    dian_prefijo_nc: settings.dian_prefijo_nc || 'NCFE',
    dian_numero_nc_actual: settings.dian_numero_nc_actual || '1',
    dian_ciudad_id: settings.dian_ciudad_id || '836',
    dian_email_consumidor: settings.dian_email_consumidor || '',
    dian_graphic_representation: settings.dian_graphic_representation ?? false,
    dian_send_email: settings.dian_send_email ?? false,
});

export default function Settings() {
    const { settings, reloadSettings, loaded } = useSettings();

    const [form, setForm] = useState(() => buildForm(settings));

    // Si al montar el componente la config todavía no había terminado de leerse
    // de la DB (form quedó con defaults), la re-hidratamos cuando llega. Sin
    // esto, abrir Ajustes en el primer segundo tras arrancar mostraba campos
    // vacíos y al Guardar se perdía lo que ya estaba configurado (ej: resolución
    // DIAN) → la venta fallaba con "Resolución DIAN no configurada".
    const hidratado = useRef(false);
    useEffect(() => {
        if (loaded && !hidratado.current) {
            hidratado.current = true;
            setForm(buildForm(settings));
        }
    }, [loaded, settings]);

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [taxIdError, setTaxIdError] = useState('');

    // Entorno MATIAS activo (sandbox vs producción)
    const [dianEnv, setDianEnv] = useState<{ sandbox: boolean; baseUrl: string; apiKeyPresente: boolean } | null>(null);
    useEffect(() => { ipc.invoke('get-dian-env').then(setDianEnv).catch(() => { }); }, []);

    // --- Conexión Turso (una base por negocio) ---
    const [tursoStatus, setTursoStatus] = useState<any>(null);
    const [tursoForm, setTursoForm] = useState({ url: '', token: '' });
    const [tursoMsg, setTursoMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [tursoBusy, setTursoBusy] = useState(false);

    const refreshTurso = () => ipc.invoke('get-turso-status').then(setTursoStatus).catch(() => { });
    useEffect(() => { refreshTurso(); }, []);

    const guardarTurso = async () => {
        setTursoBusy(true); setTursoMsg(null);
        try {
            const r = await ipc.invoke('set-turso-config', tursoForm);
            if (r.success) {
                setTursoMsg({ type: 'ok', text: 'Conexión verificada y guardada. Reiniciá la app para aplicar los cambios.' });
                setTursoForm({ url: '', token: '' });
                await refreshTurso();
            } else {
                setTursoMsg({ type: 'err', text: r.error || 'No se pudo guardar.' });
            }
        } catch (e: any) {
            setTursoMsg({ type: 'err', text: e?.message || 'Error inesperado.' });
        } finally {
            setTursoBusy(false);
        }
    };

    const quitarTurso = async () => {
        setTursoBusy(true); setTursoMsg(null);
        try {
            await ipc.invoke('clear-turso-config');
            setTursoMsg({ type: 'ok', text: 'Configuración eliminada. Reiniciá la app.' });
            await refreshTurso();
        } finally {
            setTursoBusy(false);
        }
    };

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
            // Normalizaciones antes de persistir
            const payload = {
                ...form,
                dian_resolucion: String(form.dian_resolucion || '').trim(),
                dian_prefijo: String(form.dian_prefijo || '').trim().toUpperCase(),
                // el número nunca debe quedar vacío / < 1 o la venta no factura
                dian_numero_actual: String(
                    Math.max(1, parseInt(String(form.dian_numero_actual), 10) || 1)
                ),
                dian_prefijo_nc: String(form.dian_prefijo_nc || 'NCFE').trim().toUpperCase(),
                dian_numero_nc_actual: String(
                    Math.max(1, parseInt(String(form.dian_numero_nc_actual), 10) || 1)
                ),
            };
            setForm(payload);
            await ipc.invoke('save-settings', payload);

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
                            {dianEnv && (
                                <div className={`rounded-xl p-3 text-[11px] leading-relaxed border ${dianEnv.sandbox ? 'bg-blue-50 border-blue-100 text-blue-800' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
                                    {dianEnv.sandbox
                                        ? <><strong>🧪 Entorno de PRUEBAS (sandbox MATIAS).</strong> Las facturas NO tienen validez legal. Usá la resolución precargada del sandbox: <strong>N° 18760000001</strong>, prefijo <strong>FEV</strong>, número <strong>1</strong>. Con tus datos reales de resolución la DIAN de prueba las rechaza.</>
                                        : <><strong>✅ Entorno de PRODUCCIÓN.</strong> Cargá la resolución real que registraste en MATIAS para tu NIT.</>
                                    }
                                    {!dianEnv.apiKeyPresente && <div className="mt-1 font-black text-rose-600">⚠️ No hay API key de MATIAS en esta instalación.</div>}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">N° Resolución DIAN</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                        value={form.dian_resolucion}
                                        onChange={e => setForm({ ...form, dian_resolucion: e.target.value })}
                                        placeholder={dianEnv?.sandbox ? '18760000001' : 'Ej: 18764074347312'}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Prefijo de Factura</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                        value={form.dian_prefijo}
                                        onChange={e => setForm({ ...form, dian_prefijo: e.target.value.toUpperCase() })}
                                        placeholder="Ej: SETP"
                                        maxLength={4}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Número Actual de Factura</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                        value={form.dian_numero_actual}
                                        onChange={e => setForm({ ...form, dian_numero_actual: e.target.value })}
                                        placeholder="1"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1 ml-1">El sistema lo incrementa automáticamente tras cada emisión.</p>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">ID Ciudad (MATIAS)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                        value={form.dian_ciudad_id}
                                        onChange={e => setForm({ ...form, dian_ciudad_id: e.target.value })}
                                        placeholder="836 = Bogotá D.C."
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Prefijo Nota Crédito</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                        value={form.dian_prefijo_nc}
                                        onChange={e => setForm({ ...form, dian_prefijo_nc: e.target.value.toUpperCase() })}
                                        placeholder={dianEnv?.sandbox ? 'NCFE' : 'Ej: NC'}
                                        maxLength={4}
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1 ml-1">Para anular ventas (devolución / error).</p>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Número Actual Nota Crédito</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                        value={form.dian_numero_nc_actual}
                                        onChange={e => setForm({ ...form, dian_numero_nc_actual: e.target.value })}
                                        placeholder="1"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Email para Consumidor Final (anónimo)</label>
                                <input
                                    type="email"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                    value={form.dian_email_consumidor}
                                    onChange={e => setForm({ ...form, dian_email_consumidor: e.target.value })}
                                    placeholder="sin-correo@consumidor.co"
                                />
                                <p className="text-[10px] text-slate-400 mt-1 ml-1">Se usa cuando el comprador no registra email. MATIAS lo requiere en el XML.</p>
                            </div>

                            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                                <div className="flex items-center justify-between p-3">
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Generar PDF de la factura</p>
                                        <p className="text-[10px] text-slate-400">Requiere haber cargado el logo del negocio en el portal de MATIAS. Sin logo, la emisión falla.</p>
                                    </div>
                                    <div
                                        onClick={() => setForm({ ...form, dian_graphic_representation: !form.dian_graphic_representation })}
                                        className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors shrink-0 ml-4 ${form.dian_graphic_representation ? 'bg-primary-500' : 'bg-slate-300'}`}
                                    >
                                        <div className={`bg-white w-4 h-4 rounded-full transition-transform ${form.dian_graphic_representation ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-3">
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Enviar factura por email al cliente</p>
                                        <p className="text-[10px] text-slate-400">Solo si el PDF está activo y el cliente tiene email real.</p>
                                    </div>
                                    <div
                                        onClick={() => form.dian_graphic_representation && setForm({ ...form, dian_send_email: !form.dian_send_email })}
                                        className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ml-4 ${!form.dian_graphic_representation ? 'bg-slate-200 cursor-not-allowed' : form.dian_send_email ? 'bg-primary-500 cursor-pointer' : 'bg-slate-300 cursor-pointer'}`}
                                    >
                                        <div className={`bg-white w-4 h-4 rounded-full transition-transform ${form.dian_send_email && form.dian_graphic_representation ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </div>
                                </div>
                            </div>

                            {(() => {
                                const guardada = Boolean(settings.dian_resolucion && String(settings.dian_resolucion).trim());
                                const sinGuardar = String(form.dian_resolucion || '').trim() !== String(settings.dian_resolucion || '').trim()
                                    || String(form.dian_prefijo || '').trim() !== String(settings.dian_prefijo || '').trim()
                                    || String(form.dian_numero_actual || '') !== String(settings.dian_numero_actual || '');
                                return (
                                    <div className={`rounded-xl p-4 text-[11px] leading-relaxed border ${guardada ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                                        {guardada
                                            ? <><strong>✅ Facturación DIAN configurada y guardada.</strong> Las ventas con "Facturación Electrónica" activa se emiten ante la DIAN vía MATIAS API. Las que fallen por conexión quedan en cola para reintento.</>
                                            : <><strong>⚠️ Facturación DIAN sin configurar.</strong> Completá N° de resolución, prefijo y número, y tocá <strong>Guardar Cambios</strong> (arriba). Sin esto, las ventas se guardan pero no se emite la factura.</>
                                        }
                                        {sinGuardar && <div className="mt-2 font-black text-rose-600">● Tenés cambios sin guardar — tocá "Guardar Cambios" para que apliquen.</div>}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                {/* Cumplimiento Tributario */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 border-l-4 border-l-amber-400">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <StorefrontIcon fontSize="small" className="text-amber-500" /> Compliance Fiscal
                    </h2>
                    <div className="flex items-center justify-between bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                        <div>
                            <p className="text-sm font-bold text-slate-700">Facturación Electrónica DIAN (MATIAS API)</p>
                            <p className="text-[10px] text-slate-500">Emite facturas ante la DIAN vía MATIAS API. Requiere resolución configurada arriba.</p>
                        </div>
                        <div
                            onClick={() => setForm({ ...form, dianCompliance2026: !form.dianCompliance2026 })}
                            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${form.dianCompliance2026 ? 'bg-amber-500' : 'bg-slate-300'}`}
                        >
                            <div className={`bg-white w-4 h-4 rounded-full shadow-sm transition-transform ${form.dianCompliance2026 ? 'translate-x-6' : 'translate-x-0'}`} />
                        </div>
                    </div>
                </div>

                {/* Conexión Turso (Nube) */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 border-l-4 border-l-indigo-400">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <FolderIcon fontSize="small" className="text-indigo-500" /> Conexión a la Nube (Turso)
                    </h2>

                    <div className={`rounded-xl p-3 mb-4 text-[11px] font-bold border flex items-center gap-2 ${
                        tursoStatus?.syncEnabled
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            : 'bg-amber-50 border-amber-100 text-amber-700'
                    }`}>
                        <div className={`w-2 h-2 rounded-full ${tursoStatus?.syncEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        {tursoStatus?.syncEnabled
                            ? <>Sincronización activa {tursoStatus?.urlActual ? `(${tursoStatus.urlActual})` : ''} · origen: {tursoStatus?.fuente === 'instalacion' ? 'este equipo' : 'configuración por defecto'}</>
                            : <>Sin sincronización — el sistema funciona local. Cargá la base de este negocio abajo.</>}
                    </div>

                    <p className="text-xs text-slate-500 mb-3">
                        Cada negocio usa su propia base de datos en la nube. Pegá la URL y el token que
                        corresponden a este negocio. Se guardan cifrados en este equipo y se verifican al guardar.
                    </p>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">URL de la base (libsql://…)</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-mono text-xs text-slate-700"
                                value={tursoForm.url}
                                onChange={e => setTursoForm({ ...tursoForm, url: e.target.value })}
                                placeholder="libsql://negocio-xxxx.aws-us-east-1.turso.io"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Token de acceso</label>
                            <input
                                type="password"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all font-mono text-xs text-slate-700"
                                value={tursoForm.token}
                                onChange={e => setTursoForm({ ...tursoForm, token: e.target.value })}
                                placeholder="eyJhbGciOi…"
                            />
                        </div>

                        {tursoMsg && (
                            <div className={`rounded-xl p-3 text-[11px] font-bold border ${
                                tursoMsg.type === 'ok'
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                    : 'bg-rose-50 border-rose-100 text-rose-700'
                            }`}>
                                {tursoMsg.text}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={guardarTurso}
                                disabled={tursoBusy || !tursoForm.url || !tursoForm.token}
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-200 active:scale-95 text-xs"
                            >
                                {tursoBusy ? 'Verificando…' : 'Verificar y guardar'}
                            </button>
                            {tursoStatus?.tieneConfigInstalacion && (
                                <button
                                    onClick={quitarTurso}
                                    disabled={tursoBusy}
                                    className="flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all active:scale-95 text-xs disabled:opacity-50"
                                >
                                    Quitar configuración
                                </button>
                            )}
                            <button
                                onClick={() => ipc.invoke('restart-app')}
                                className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-amber-200 active:scale-95 text-xs"
                            >
                                Reiniciar app
                            </button>
                        </div>
                    </div>
                </div>

                {/* Copia de Seguridad */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 border-l-4 border-l-blue-400">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <FolderIcon fontSize="small" className="text-blue-500" /> Copia de Seguridad
                    </h2>
                    <p className="text-xs text-slate-500 mb-4">
                        Cuando la sincronización con Turso está activa, la base se respalda sola en la nube. El archivo local de réplica
                        está en <code className="bg-slate-100 px-1 rounded text-primary-700 font-bold">commerce_data_local.db</code>.
                        Podés abrirlo desde aquí para hacer un respaldo adicional en USB.
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
