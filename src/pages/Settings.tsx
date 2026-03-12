import React, { useState, useRef, useEffect } from 'react';
import { ipc } from '../utils/ipc';
import { useSettings } from '../context/SettingsContext';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import SettingsIcon from '@mui/icons-material/Settings';
import StorefrontIcon from '@mui/icons-material/Storefront';
import PrintIcon from '@mui/icons-material/Print';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';



export default function Settings() {
    const { settings, reloadSettings } = useSettings();

    const [form, setForm] = useState({
        businessName: settings.businessName,
        businessCuit: settings.businessCuit,
        businessAddress: settings.businessAddress,
        tagline: settings.tagline,
        printerProfile: settings.printerProfile,
    });

    const [logoPreview, setLogoPreview] = useState<string | null>(settings.logoBase64 || null);
    const [selectedLogoPath, setSelectedLogoPath] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Keep form in sync when settings reload from DB (e.g. after save or initial async load).
    // Always update logoPreview from settings — after save the returned logoPath is canonical.
    useEffect(() => {
        setForm({
            businessName: settings.businessName,
            businessCuit: settings.businessCuit,
            businessAddress: settings.businessAddress,
            tagline: settings.tagline,
            printerProfile: settings.printerProfile,
        });
        setLogoPreview(settings.logoBase64 || null);
        setSelectedLogoPath(null);
    }, [settings]);

    const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Show blob preview immediately while user sees their choice
        setLogoPreview(URL.createObjectURL(file));
        // file.path is available in Electron (contextIsolation: false)
        const electronFile = file as any;
        if (electronFile.path) {
            setSelectedLogoPath(electronFile.path);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            let logoPath = settings.logoPath;

            // If a new logo was selected, copy it to AppData first
            if (selectedLogoPath) {
                const result = await ipc.invoke('save-logo', selectedLogoPath);
                if (result.success) {
                    logoPath = result.logoPath;
                    setSelectedLogoPath(null); // Reset so preview switches to file:// after reload
                }
            }

            await ipc.invoke('save-settings', {
                ...form,
                ...(logoPath ? { logoPath } : {}),
            });

            await reloadSettings(); // This triggers the useEffect above to sync form + preview
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
                        Ajustes del Sistema
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Personaliza los datos de tu comercio que aparecen en la interfaz y en los tickets.</p>
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

            <div className="space-y-6">

                {/* Logo Section */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <StorefrontIcon fontSize="small" /> Logo del Comercio
                    </h2>
                    <div className="flex items-center gap-6">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 hover:border-primary-400 bg-slate-50 hover:bg-primary-50 flex items-center justify-center cursor-pointer transition-all overflow-hidden group"
                        >
                            {logoPreview ? (
                                <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                            ) : (
                                <div className="text-center text-slate-400 group-hover:text-primary-500 transition-colors p-2">
                                    <UploadIcon />
                                    <p className="text-[10px] font-bold mt-1">Subir logo</p>
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-700 mb-1">Imagen del logo</p>
                            <p className="text-xs text-slate-500 mb-3">Recomendado: PNG con fondo transparente, mínimo 200×200 px. Se muestra en la barra lateral.</p>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="text-sm font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1"
                            >
                                <UploadIcon fontSize="small" /> Seleccionar imagen...
                            </button>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoSelect}
                        />
                    </div>
                </div>

                {/* Business Info */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <StorefrontIcon fontSize="small" /> Datos del Comercio
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Nombre del Comercio</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                value={form.businessName}
                                onChange={e => setForm({ ...form, businessName: e.target.value })}
                                placeholder="Ej: Almacén Don Juan"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">CUIT</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                    value={form.businessCuit}
                                    onChange={e => setForm({ ...form, businessCuit: e.target.value })}
                                    placeholder="20-12345678-9"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Dirección</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                    value={form.businessAddress}
                                    onChange={e => setForm({ ...form, businessAddress: e.target.value })}
                                    placeholder="Av. Principal 123, Ciudad"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Eslogan / Descripción corta</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                value={form.tagline}
                                onChange={e => setForm({ ...form, tagline: e.target.value })}
                                placeholder="Ej: Productos de calidad al mejor precio"
                            />
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

            </div>
        </div>
    );
}
