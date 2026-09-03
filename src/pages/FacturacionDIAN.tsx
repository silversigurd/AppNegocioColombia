import { useState, useEffect, useCallback, useRef } from 'react';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { ipc } from '../utils/ipc';
import { useSettings } from '../context/SettingsContext';

interface FacturaPendiente {
    venta_id: number;
    tipo: 'FACTURA' | 'NC';
    numero_factura: number | null;
    prefijo: string;
    estado: 'PENDIENTE' | 'ERROR';
    estado_dian: string | null;
    error_mensaje: string | null;
    intentos: number;
    cufe: string | null;
    qr_dian_url: string | null;
    total: number;
    fecha_venta: string;
    cliente_identificacion: string | null;
    ultimo_intento: string | null;
}

export default function FacturacionDIAN() {
    const { settings } = useSettings();
    const [facturas, setFacturas] = useState<FacturaPendiente[]>([]);
    const [loading, setLoading] = useState(true);
    const [reintentando, setReintentando] = useState<number | null>(null);
    const [reintentandoTodas, setReintentandoTodas] = useState(false);
    const [flash, setFlash] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const mostrarFlash = (tipo: 'ok' | 'error', texto: string) => {
        setFlash({ tipo, texto });
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(null), 6000);
    };

    const cargar = useCallback(async (silencioso = false) => {
        if (!silencioso) setLoading(true);
        try {
            const data = await ipc.invoke('get-facturas-pendientes');
            setFacturas(data || []);
        } catch (e) {
            console.error('Error cargando facturas pendientes:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        cargar();
        // El job automático de fondo puede ir resolviéndolas — refrescamos solo.
        const int = setInterval(() => cargar(true), 30000);
        return () => {
            clearInterval(int);
            if (flashTimer.current) clearTimeout(flashTimer.current);
        };
    }, [cargar]);

    const reintentarUna = async (f: FacturaPendiente) => {
        setReintentando(f.venta_id);
        try {
            const canal = f.tipo === 'NC' ? 'reintentar-nota-credito' : 'reintentar-factura';
            const r = await ipc.invoke(canal, f.venta_id);
            const etiqueta = f.tipo === 'NC' ? 'Nota crédito' : 'Factura';
            if (r.success) {
                mostrarFlash('ok', `${etiqueta} de la venta #${f.venta_id} emitida.`);
            } else {
                mostrarFlash('error', `Venta #${f.venta_id}: ${r.error || 'No se pudo emitir.'}`);
            }
            await cargar(true);
        } catch (e) {
            mostrarFlash('error', e instanceof Error ? e.message : 'Error al reintentar.');
        } finally {
            setReintentando(null);
        }
    };

    const reintentarTodas = async () => {
        setReintentandoTodas(true);
        try {
            const r = await ipc.invoke('reintentar-todas-facturas');
            mostrarFlash(
                r.emitidas > 0 ? 'ok' : 'error',
                `Procesadas ${r.procesadas} · emitidas ${r.emitidas} · siguen pendientes ${r.sigueFallando}.`
            );
            await cargar(true);
        } catch (e) {
            mostrarFlash('error', e instanceof Error ? e.message : 'Error al reintentar en lote.');
        } finally {
            setReintentandoTodas(false);
        }
    };

    const formatCurrency = (amount: number) =>
        (amount || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    const nPendientes = facturas.filter((f) => f.estado === 'PENDIENTE').length;
    const nError = facturas.filter((f) => f.estado === 'ERROR').length;

    if (!settings.dianCompliance2026) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 gap-3">
                <ReceiptLongIcon style={{ fontSize: 48 }} className="text-slate-300" />
                <p className="font-bold text-slate-600">La facturación electrónica DIAN está desactivada.</p>
                <p className="text-sm">Actívala en Ajustes → Facturación Electrónica para usar este módulo.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full animate-fade-in">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Facturación Electrónica DIAN</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Facturas que no se pudieron emitir en el momento de la venta. Se reintentan solas cada pocos
                        minutos mientras haya conexión; también podés forzar el reintento acá.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => cargar()}
                        className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl font-bold transition-colors border border-slate-200"
                    >
                        <RefreshIcon fontSize="small" /> Actualizar
                    </button>
                    <button
                        onClick={reintentarTodas}
                        disabled={reintentandoTodas || facturas.length === 0}
                        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white px-4 py-2.5 rounded-xl font-bold transition-colors shadow-lg shadow-primary-500/20"
                    >
                        <RefreshIcon fontSize="small" className={reintentandoTodas ? 'animate-spin' : ''} />
                        {reintentandoTodas ? 'Reintentando…' : 'Reintentar todas'}
                    </button>
                </div>
            </div>

            {flash && (
                <div
                    className={`mb-4 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 ${
                        flash.tipo === 'ok'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                >
                    {flash.tipo === 'ok' ? <CheckCircleIcon fontSize="small" /> : <ErrorOutlineIcon fontSize="small" />}
                    {flash.texto}
                </div>
            )}

            {/* Resumen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                        <HourglassEmptyIcon />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Pendientes</p>
                        <h2 className="text-3xl font-black text-slate-800">{nPendientes}</h2>
                        <p className="text-xs text-slate-400">Se reintentan automáticamente</p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
                        <ErrorOutlineIcon />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Rechazadas</p>
                        <h2 className="text-3xl font-black text-slate-800">{nError}</h2>
                        <p className="text-xs text-slate-400">La DIAN rechazó los datos — revisá y reintentá a mano</p>
                    </div>
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th className="px-6 py-4">Venta</th>
                                <th className="px-6 py-4">Factura</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4 text-right">Total</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4">Motivo</th>
                                <th className="px-6 py-4 text-center">Intentos</th>
                                <th className="px-6 py-4 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="font-medium">Cargando…</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : facturas.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                                        <CheckCircleIcon className="text-emerald-400 mb-2" style={{ fontSize: 40 }} />
                                        <p className="font-bold text-slate-500">No hay facturas pendientes.</p>
                                        <p className="text-sm">Todas las ventas se facturaron correctamente ante la DIAN.</p>
                                    </td>
                                </tr>
                            ) : (
                                facturas.map((f) => (
                                    <tr key={`${f.tipo}-${f.venta_id}`} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-700">
                                            #{f.venta_id}
                                            {f.tipo === 'NC' && <span className="ml-1 text-[9px] font-black bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">NOTA CRÉDITO</span>}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {f.numero_factura ? `${f.prefijo || ''}${f.numero_factura}` : '—'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500">
                                            {new Date(f.fecha_venta).toLocaleString('es-CO')}
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-slate-700">
                                            {formatCurrency(f.total)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${
                                                    f.estado === 'ERROR'
                                                        ? 'bg-rose-100 text-rose-700'
                                                        : 'bg-amber-100 text-amber-700'
                                                }`}
                                            >
                                                {f.estado === 'ERROR' ? 'Rechazada' : 'Pendiente'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-500 max-w-xs">
                                            <span title={f.error_mensaje || ''} className="line-clamp-2">
                                                {f.error_mensaje || '—'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center text-sm text-slate-500">{f.intentos}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => reintentarUna(f)}
                                                disabled={reintentando === f.venta_id || reintentandoTodas}
                                                className="inline-flex items-center gap-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-primary-200"
                                            >
                                                <RefreshIcon
                                                    fontSize="small"
                                                    className={reintentando === f.venta_id ? 'animate-spin' : ''}
                                                />
                                                {reintentando === f.venta_id ? 'Emitiendo…' : 'Reintentar'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <p className="text-xs text-slate-400 mt-4 flex items-center gap-1">
                <OpenInNewIcon style={{ fontSize: 14 }} />
                El reintento automático corre en segundo plano cada 5 minutos con espera creciente entre intentos.
            </p>
        </div>
    );
}
