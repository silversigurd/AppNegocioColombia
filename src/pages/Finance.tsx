import { useState, useEffect } from 'react';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PrintIcon from '@mui/icons-material/Print';
import { ipc } from '../utils/ipc';
import Ticket from '../components/Ticket';
import PedidoTicket from '../components/PedidoTicket';
import { useSettings } from '../context/SettingsContext';

export default function Finance() {
    const { settings } = useSettings();
    const [movements, setMovements] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('TODOS');

    // Ticket View State (Sales)
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const [selectedTicketData, setSelectedTicketData] = useState<any>(null);
    const [selectedTicketItems, setSelectedTicketItems] = useState<any[]>([]);

    // Pedido Ticket View State (Purchase Orders)
    const [isPedidoModalOpen, setIsPedidoModalOpen] = useState(false);
    const [selectedPedidoData, setSelectedPedidoData] = useState<any>(null);
    const [selectedPedidoItems, setSelectedPedidoItems] = useState<any[]>([]);

    // Nota crédito (anulación)
    const [ncModalOpen, setNcModalOpen] = useState(false);
    const [ncMotivo, setNcMotivo] = useState('');
    const [ncBusy, setNcBusy] = useState(false);
    const [ncMsg, setNcMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

    const recargarVenta = async (ventaId: number) => {
        const venta = await ipc.invoke('get-venta-por-id', ventaId);
        if (venta) setSelectedTicketData(venta);
    };

    const emitirNC = async () => {
        if (!selectedTicketData) return;
        setNcBusy(true); setNcMsg(null);
        try {
            const r = await ipc.invoke('emitir-nota-credito', { venta_id: selectedTicketData.id, motivo: ncMotivo.trim(), concepto: 2 });
            if (r.success) {
                setNcMsg({ tipo: 'ok', texto: `Nota crédito ${r.prefijo_nc}${r.numero_nc} emitida. La venta quedó anulada.` });
                setNcModalOpen(false); setNcMotivo('');
                await recargarVenta(selectedTicketData.id);
                await loadMovements();
            } else {
                setNcMsg({ tipo: 'err', texto: r.error || 'No se pudo emitir la nota crédito.' });
            }
        } catch (e) {
            setNcMsg({ tipo: 'err', texto: e instanceof Error ? e.message : 'Error al emitir la nota crédito.' });
        } finally {
            setNcBusy(false);
        }
    };

    const reintentarNC = async () => {
        if (!selectedTicketData) return;
        setNcBusy(true); setNcMsg(null);
        try {
            const r = await ipc.invoke('reintentar-nota-credito', selectedTicketData.id);
            setNcMsg(r.success
                ? { tipo: 'ok', texto: 'Nota crédito emitida.' }
                : { tipo: 'err', texto: r.error || 'Sigue pendiente.' });
            await recargarVenta(selectedTicketData.id);
            await loadMovements();
        } catch (e) {
            setNcMsg({ tipo: 'err', texto: e instanceof Error ? e.message : 'Error.' });
        } finally {
            setNcBusy(false);
        }
    };

    useEffect(() => {
        loadMovements();
    }, []);

    const loadMovements = async () => {
        setLoading(true);
        try {
            const data = await ipc.invoke('get-movimientos', 1);
            setMovements(data);
        } catch (error) {
            console.error('Error loading movements:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = async (movimiento: any) => {
        try {
            // 1. Venta (INGRESO)
            if (movimiento.venta_id) {
                const [venta, items] = await Promise.all([
                    ipc.invoke('get-venta-por-id', movimiento.venta_id),
                    ipc.invoke('get-venta-detalle', movimiento.venta_id)
                ]);

                if (venta) {
                    setSelectedTicketData(venta);
                    setSelectedTicketItems(items || []);
                    setIsTicketModalOpen(true);
                }
            }
            // 2. Pedido (EGRESO)
            else if (movimiento.pedido_id) {
                const [pedido, items] = await Promise.all([
                    ipc.invoke('get-pedido-por-id', movimiento.pedido_id),
                    ipc.invoke('get-detalle-pedido', movimiento.pedido_id)
                ]);

                if (pedido) {
                    setSelectedPedidoData(pedido);
                    setSelectedPedidoItems(items || []);
                    setIsPedidoModalOpen(true);
                }
            }
        } catch (error) {
            console.error('Error fetching details:', error);
            alert('Error al obtener los detalles del movimiento.');
        }
    };

    const filteredMovements = movements.filter(m => filter === 'TODOS' || m.tipo === filter);

    const totalIngresos = movements.filter(m => m.tipo === 'INGRESO').reduce((acc, m) => acc + m.monto, 0);
    const totalEgresos = movements.filter(m => m.tipo === 'EGRESO').reduce((acc, m) => acc + m.monto, 0);
    const balance = totalIngresos - totalEgresos;

    const formatCurrency = (amount: number) => {
        return amount.toLocaleString(settings.pais === 'Colombia' ? 'es-CO' : 'es-AR', {
            style: 'currency',
            currency: settings.pais === 'Colombia' ? 'COP' : 'ARS',
            minimumFractionDigits: 0
        });
    };

    return (
        <div className="flex flex-col h-full animate-fade-in">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">
                        {settings.pais === 'Colombia' ? 'Gestión Financiera y Tributaria' : 'Flujo de Caja'}
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {settings.pais === 'Colombia' ? 'Control de ingresos, egresos e impuestos (IVA, ICA, Retenciones).' : 'Control de ingresos, egresos y balance general.'}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2.5 rounded-xl font-bold transition-colors border border-emerald-200">
                        <ArrowUpwardIcon fontSize="small" /> Nuevo Ingreso
                    </button>
                    <button className="flex items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 px-4 py-2.5 rounded-xl font-bold transition-colors border border-rose-200">
                        <ArrowDownwardIcon fontSize="small" /> Nuevo Egreso
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Balance Total</p>
                        <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500">
                            <AccountBalanceWalletIcon />
                        </div>
                    </div>
                    <h2 className="text-3xl font-black text-slate-800">{formatCurrency(balance)}</h2>
                </div>

                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 shadow-md shadow-emerald-500/20 text-white">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-sm font-bold text-emerald-100 uppercase tracking-widest">Ingresos</p>
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                            <ArrowUpwardIcon />
                        </div>
                    </div>
                    <h2 className="text-3xl font-black">{formatCurrency(totalIngresos)}</h2>
                </div>

                <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl p-6 shadow-md shadow-rose-500/20 text-white">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-sm font-bold text-rose-100 uppercase tracking-widest">Egresos</p>
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                            <ArrowDownwardIcon />
                        </div>
                    </div>
                    <h2 className="text-3xl font-black">{formatCurrency(totalEgresos)}</h2>
                </div>
            </div>

            {/* Transactions List */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800">Últimos Movimientos</h3>
                    <div className="flex items-center gap-2">
                        <FilterAltIcon className="text-slate-400" fontSize="small" />
                        <select
                            className="bg-white border border-slate-200 text-sm font-medium rounded-lg px-3 py-1.5 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                        >
                            <option value="TODOS">Todos</option>
                            <option value="INGRESO">Ingresos</option>
                            <option value="EGRESO">Egresos</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-white">
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Concepto</th>
                                <th className="px-6 py-4">Método</th>
                                <th className="px-6 py-4 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="font-medium">Cargando movimientos...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredMovements.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        No se encontraron movimientos registrados
                                    </td>
                                </tr>
                            ) : filteredMovements.map((mov) => (
                                <tr
                                    key={mov.id}
                                    onClick={() => (mov.venta_id || mov.pedido_id) ? handleViewDetails(mov) : window.alert('Este es un abono de caja manual sin detalle de artículos.')}
                                    className={`transition-colors border-b border-slate-50 cursor-pointer hover:bg-slate-50 group`}
                                >
                                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(mov.fecha).toLocaleString()}</td>
                                    <td className="px-6 py-4 font-medium text-slate-700">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${mov.tipo === 'INGRESO' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
                                                    {mov.tipo === 'INGRESO' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                                                </div>
                                                {mov.concepto}
                                            </div>
                                            {(mov.venta_id || mov.pedido_id) && (
                                                <ReceiptIcon className="text-slate-300 group-hover:text-primary-400 scale-75 opacity-0 group-hover:opacity-100 transition-all" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">
                                        <span className="bg-slate-100 px-2.5 py-1 rounded-md">{mov.metodo || 'Venta Terminal'}</span>
                                    </td>
                                    <td className={`px-6 py-4 text-right font-bold ${mov.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {mov.tipo === 'INGRESO' ? '+' : '-'}{formatCurrency(mov.monto)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals for Details */}
            {isTicketModalOpen && selectedTicketData && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <ReceiptIcon className="text-primary-600" />
                                    Detalle de {settings.pais === 'Colombia' ? 'Factura/Ticket' : 'Ticket'} #{selectedTicketData.id}
                                </h2>
                                <p className="text-[10px] font-black uppercase text-slate-400 mt-1">
                                    {new Date(selectedTicketData.fecha).toLocaleString(settings.pais === 'Colombia' ? 'es-CO' : 'es-AR')}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => window.print()}
                                    className="p-2 hover:bg-primary-50 text-primary-600 rounded-full transition-colors"
                                    title="Imprimir Ticket"
                                >
                                    <PrintIcon />
                                </button>
                                <button onClick={() => setIsTicketModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                                    <CloseIcon />
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="space-y-4 max-h-[300px] overflow-y-auto mb-6 pr-2 custom-scrollbar border-b pb-4">
                                {selectedTicketItems.map((item: any, i: number) => (
                                    <div key={i} className="flex justify-between items-start border-b border-slate-50 pb-3 last:border-0">
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-slate-700">{item.producto_nombre}</p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                                                {item.cantidad} x {formatCurrency(item.precio_unitario)}
                                            </p>
                                        </div>
                                        <p className="text-sm font-black text-slate-800">
                                            {formatCurrency(item.subtotal)}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                                <div className="flex justify-between text-xs font-bold text-slate-500">
                                    <span>Subtotal</span>
                                    <span>{formatCurrency(selectedTicketData.subtotal)}</span>
                                </div>
                                {settings.pais === 'Colombia' ? (
                                    <>
                                        {(selectedTicketData.iva_19 || 0) > 0 && (
                                            <div className="flex justify-between text-[11px] font-bold text-slate-500">
                                                <span>IVA (19%)</span>
                                                <span>{formatCurrency(selectedTicketData.iva_19)}</span>
                                            </div>
                                        )}
                                        {(selectedTicketData.iva_5 || 0) > 0 && (
                                            <div className="flex justify-between text-[11px] font-bold text-slate-500">
                                                <span>IVA (5%)</span>
                                                <span>{formatCurrency(selectedTicketData.iva_5)}</span>
                                            </div>
                                        )}
                                        {(selectedTicketData.ipoc || 0) > 0 && (
                                            <div className="flex justify-between text-[11px] font-bold text-slate-500">
                                                <span>Impoconsumo (8%)</span>
                                                <span>{formatCurrency(selectedTicketData.ipoc)}</span>
                                            </div>
                                        )}
                                        {(selectedTicketData.imp_saludable || 0) > 0 && (
                                            <div className="flex justify-between text-[11px] font-bold text-slate-500">
                                                <span>Imp. Saludable</span>
                                                <span>{formatCurrency(selectedTicketData.imp_saludable)}</span>
                                            </div>
                                        )}
                                        
                                        <div className="flex justify-between text-[10px] font-bold text-slate-400 italic mt-2 border-t border-slate-100 pt-1">
                                            <span>ReteFuente (Est. 2.5%)</span>
                                            <span>-{formatCurrency(selectedTicketData.total * 0.025)}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] font-bold text-slate-400 italic">
                                            <span>ICA (Est. {settings.tasaICA || 11.04}/1000)</span>
                                            <span>-{formatCurrency(selectedTicketData.total * ((settings.tasaICA || 11.04) / 1000))}</span>
                                        </div>
                                        {selectedTicketData.medio_pago && (
                                            <div className="flex justify-between text-xs font-bold text-slate-500 mt-2 border-t border-slate-100 pt-2">
                                                <span>Medio de Pago</span>
                                                <span className="text-primary-700">{selectedTicketData.medio_pago}</span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex justify-between text-xs font-bold text-slate-500">
                                        <span>IVA / Impuestos</span>
                                        <span>{formatCurrency(selectedTicketData.impuestos)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-lg font-black text-slate-800 pt-2 border-t border-slate-200">
                                    <span>TOTAL</span>
                                    <span className="text-primary-600">{formatCurrency(selectedTicketData.total)}</span>
                                </div>
                            </div>

                            {(selectedTicketData.cude_local || selectedTicketData.dian_pdf_url) && (
                                <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Factura Electrónica DIAN</p>
                                    {selectedTicketData.dian_numero_factura && (
                                        <p className="text-xs font-bold text-slate-600">
                                            N° {selectedTicketData.dian_prefijo || ''}{selectedTicketData.dian_numero_factura}
                                        </p>
                                    )}
                                    {selectedTicketData.cude_local && (
                                        <p className="text-[10px] font-mono text-slate-500 break-all leading-tight">
                                            CUFE: {selectedTicketData.cude_local}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {selectedTicketData.dian_pdf_url && (
                                            <button
                                                onClick={() => ipc.invoke('open-external', selectedTicketData.dian_pdf_url)}
                                                className="text-xs font-bold bg-white border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                                            >
                                                Ver factura PDF (DIAN) →
                                            </button>
                                        )}
                                        {selectedTicketData.dian_qr_dian_url && (
                                            <button
                                                onClick={() => ipc.invoke('open-external', selectedTicketData.dian_qr_dian_url)}
                                                className="text-xs font-bold bg-white border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                                            >
                                                Verificar en la DIAN →
                                            </button>
                                        )}
                                    </div>
                                    {selectedTicketData.dian_pendiente && (
                                        <p className="text-[10px] font-bold text-amber-600">
                                            ⚠️ Factura pendiente de emisión — revisá el módulo "Facturación DIAN".
                                        </p>
                                    )}

                                    {/* Nota crédito / anulación */}
                                    {selectedTicketData.nc_estado === 'EMITIDA' ? (
                                        <div className="mt-2 pt-2 border-t border-emerald-200">
                                            <p className="text-[11px] font-black text-rose-600">VENTA ANULADA — Nota Crédito {selectedTicketData.nc_prefijo}{selectedTicketData.nc_numero}</p>
                                            {selectedTicketData.nc_motivo && <p className="text-[10px] text-slate-500 mt-0.5">Motivo: {selectedTicketData.nc_motivo}</p>}
                                            {selectedTicketData.nc_cufe && <p className="text-[10px] font-mono text-slate-500 break-all leading-tight">CUFE NC: {selectedTicketData.nc_cufe}</p>}
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {selectedTicketData.nc_pdf_url && (
                                                    <button onClick={() => ipc.invoke('open-external', selectedTicketData.nc_pdf_url)} className="text-[11px] font-bold bg-white border border-rose-200 text-rose-700 px-2.5 py-1 rounded-lg hover:bg-rose-50">PDF nota crédito →</button>
                                                )}
                                                {selectedTicketData.nc_qr_dian_url && (
                                                    <button onClick={() => ipc.invoke('open-external', selectedTicketData.nc_qr_dian_url)} className="text-[11px] font-bold bg-white border border-rose-200 text-rose-700 px-2.5 py-1 rounded-lg hover:bg-rose-50">Verificar NC en la DIAN →</button>
                                                )}
                                            </div>
                                        </div>
                                    ) : selectedTicketData.nc_estado ? (
                                        <div className="mt-2 pt-2 border-t border-emerald-200">
                                            <p className="text-[11px] font-bold text-amber-600">Nota crédito {selectedTicketData.nc_estado === 'ERROR' ? 'rechazada' : 'pendiente'}.</p>
                                            <button onClick={reintentarNC} disabled={ncBusy} className="mt-1 text-xs font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
                                                {ncBusy ? 'Reintentando…' : 'Reintentar nota crédito'}
                                            </button>
                                        </div>
                                    ) : (selectedTicketData.dian_estado === 'EMITIDA' && (
                                        <div className="mt-2 pt-2 border-t border-emerald-200">
                                            <button
                                                onClick={() => { setNcMsg(null); setNcMotivo(''); setNcModalOpen(true); }}
                                                className="text-xs font-bold bg-rose-50 border border-rose-200 text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-100 transition-colors"
                                            >
                                                Anular con Nota Crédito
                                            </button>
                                        </div>
                                    ))}

                                    {ncMsg && (
                                        <p className={`text-[11px] font-bold mt-1 ${ncMsg.tipo === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>{ncMsg.texto}</p>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={() => setIsTicketModalOpen(false)}
                                className="w-full mt-6 py-4 rounded-2xl font-bold text-white bg-primary-600 hover:bg-primary-700 shadow-xl shadow-primary-500/30 transition-all active:scale-95"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isTicketModalOpen && selectedTicketData && (
                <Ticket
                    ventaData={selectedTicketData}
                    items={selectedTicketItems}
                    onClose={() => setIsTicketModalOpen(false)}
                />
            )}

            {isPedidoModalOpen && selectedPedidoData && (
                <PedidoTicket
                    pedidoData={selectedPedidoData}
                    items={selectedPedidoItems}
                    onClose={() => setIsPedidoModalOpen(false)}
                />
            )}

            {/* Modal: Nota crédito (anulación) */}
            {ncModalOpen && selectedTicketData && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-6 animate-scale-in">
                        <h2 className="text-lg font-bold text-slate-800">Anular venta #{selectedTicketData.id}</h2>
                        <p className="text-sm text-slate-500 mt-1 leading-snug">
                            Se emite una <strong>nota crédito electrónica</strong> ante la DIAN por el total
                            ({formatCurrency(selectedTicketData.total)}). Se repone el stock y se registra el
                            egreso en caja. Esta acción no se puede deshacer.
                        </p>
                        <label className="block text-[11px] font-black uppercase text-slate-400 mt-4 mb-1">Motivo de la anulación</label>
                        <textarea
                            value={ncMotivo}
                            onChange={e => setNcMotivo(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 text-sm"
                            placeholder="Ej: El cliente devolvió la mercadería / error en los datos de la factura"
                        />
                        {ncMsg && ncMsg.tipo === 'err' && <p className="text-[11px] font-bold text-rose-600 mt-1">{ncMsg.texto}</p>}
                        <div className="flex gap-2 mt-5">
                            <button onClick={() => setNcModalOpen(false)} disabled={ncBusy} className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Cancelar</button>
                            <button
                                onClick={emitirNC}
                                disabled={ncBusy || ncMotivo.trim().length < 8}
                                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300"
                            >
                                {ncBusy ? 'Emitiendo…' : 'Emitir nota crédito'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Icon for closing modal
function CloseIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    );
}

