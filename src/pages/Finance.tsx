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
                                    onClick={() => (mov.venta_id || mov.pedido_id) && handleViewDetails(mov)}
                                    className={`transition-colors border-b border-slate-50 ${(mov.venta_id || mov.pedido_id) ? 'cursor-pointer hover:bg-slate-50 group' : ''}`}
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
                                <div className="flex justify-between text-xs font-bold text-slate-500">
                                    <span>{settings.pais === 'Colombia' ? 'IVA (19%)' : 'IVA / Impuestos'}</span>
                                    <span>{formatCurrency(selectedTicketData.impuestos)}</span>
                                </div>
                                {settings.pais === 'Colombia' && (
                                    <>
                                        <div className="flex justify-between text-[10px] font-bold text-slate-400 italic">
                                            <span>ReteFuente (Est. 2.5%)</span>
                                            <span>-{formatCurrency(selectedTicketData.total * 0.025)}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] font-bold text-slate-400 italic">
                                            <span>ICA (Est. 11.04/1000)</span>
                                            <span>-{formatCurrency(selectedTicketData.total * 0.01104)}</span>
                                        </div>
                                    </>
                                )}
                                <div className="flex justify-between text-lg font-black text-slate-800 pt-2 border-t border-slate-200">
                                    <span>TOTAL</span>
                                    <span className="text-primary-600">{formatCurrency(selectedTicketData.total)}</span>
                                </div>
                            </div>

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

