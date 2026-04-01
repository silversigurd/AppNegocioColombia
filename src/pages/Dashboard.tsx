import React, { useEffect, useState } from 'react';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SearchIcon from '@mui/icons-material/Search';
import PrintIcon from '@mui/icons-material/Print';
import Ticket from '../components/Ticket';
import PedidoTicket from '../components/PedidoTicket';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';


// --- COMPONENTES AUXILIARES ---

interface KpiCardProps {
    title: string;
    value: string | number;
    trend: string;
    positive: boolean;
    icon: React.ReactNode;
    colorClass: string;
}

function KpiCard({ title, value, trend, positive, icon, colorClass }: KpiCardProps) {
    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
                    <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colorClass}`}>
                    {icon}
                </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {trend}
                </span>
                <span className="text-xs text-slate-400 font-medium">vs ayer</span>
            </div>
        </div>
    );
}

// --- COMPONENTE PRINCIPAL ---

export default function Dashboard() {
    const [searchQuery, setSearchQuery] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [stats, setStats] = useState({
        ventasHoy: 0,
        productosBajoStock: 0,
        clientesActivos: 0,
        ticketsEmitidos: 0
    });
    const [movimientos, setMovimientos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { settings } = useSettings();

    const formatCurrency = (amount: number) => {
        return amount.toLocaleString(settings.pais === 'Colombia' ? 'es-CO' : 'es-AR', {
            style: 'currency',
            currency: settings.pais === 'Colombia' ? 'COP' : 'ARS',
            minimumFractionDigits: 0
        });
    };


    // Ticket View State
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const [selectedTicketData, setSelectedTicketData] = useState<any>(null);
    const [selectedTicketItems, setSelectedTicketItems] = useState<any[]>([]);

    // Pedido Ticket View State (For Egresos from Providers)
    const [isPedidoModalOpen, setIsPedidoModalOpen] = useState(false);
    const [selectedPedidoData, setSelectedPedidoData] = useState<any>(null);
    const [selectedPedidoItems, setSelectedPedidoItems] = useState<any[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const { ipc } = await import('../utils/ipc');
            const sucursalId = 1;
            const hoy = new Date().toISOString().split('T')[0];

            const [resumen, prBajoStock, movs] = await Promise.all([
                ipc.invoke('get-ventas-resumen', sucursalId, hoy),
                ipc.invoke('get-productos', sucursalId).then((prods: any[]) =>
                    (prods || []).filter(p => p.stock <= (p.stock_minimo || 5)).length
                ),
                ipc.invoke('get-movimientos', sucursalId)
            ]);

            setStats({
                ventasHoy: resumen?.total_ventas || 0,
                ticketsEmitidos: resumen?.cantidad_ventas || 0,
                productosBajoStock: prBajoStock || 0,
                clientesActivos: 15
            });
            setMovimientos(movs || []);
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewTicket = async (movimiento: any) => {
        try {
            const { ipc } = await import('../utils/ipc');

            // 1. Es una Venta (INGRESO)
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
            // 2. Es un Egreso linkeado a una Orden de Compra (PEDIDO)
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

    // Filtrado de movimientos
    const filteredMovimientos = movimientos.filter(m => {
        const query = searchQuery.toLowerCase();
        return (
            m.concepto.toLowerCase().includes(query) ||
            m.monto.toString().includes(query)
        );
    });

    const displayMovimientos = isExpanded ? filteredMovimientos : filteredMovimientos.slice(0, 5);

    return (
        <div className="flex flex-col gap-6 text-slate-800 pb-10">
            {/* Top Banner */}
            <div className="w-full bg-gradient-to-r from-primary-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl shadow-primary-500/20 relative overflow-hidden">
                <div className="relative z-10">
                    <h1 className="text-3xl font-bold mb-2">
                        ¡Hola, {user?.rol === 'Empleado' ? (user.empleado_nombre || user.username) : 'Administrador'}! 👋
                    </h1>
                    {user?.rol === 'Admin' && (
                        <p className="text-primary-100 max-w-lg text-sm leading-relaxed">
                            Aquí tienes el resumen de la actividad de tu comercio en el día de hoy.
                            Revisa los indicadores clave y mantén el inventario al día.
                        </p>
                    )}
                </div>
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute right-20 -bottom-20 w-40 h-40 bg-indigo-400/20 rounded-full blur-2xl"></div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    title="Ventas del Día"
                    value={formatCurrency(stats.ventasHoy)}
                    trend="+12%"
                    positive={true}
                    icon={<TrendingUpIcon className="text-emerald-500" />}
                    colorClass="bg-emerald-50 text-emerald-600"
                />
                <KpiCard
                    title="Tickets Emitidos"
                    value={stats.ticketsEmitidos}
                    trend="+5%"
                    positive={true}
                    icon={<ReceiptIcon className="text-blue-500" />}
                    colorClass="bg-blue-50 text-blue-600"
                />
                <KpiCard
                    title="Alertas de Stock"
                    value={stats.productosBajoStock}
                    trend="Revisar"
                    positive={stats.productosBajoStock === 0}
                    icon={<Inventory2Icon className="text-rose-500" />}
                    colorClass="bg-rose-50 text-rose-600"
                />
                {/* <KpiCard
                    title="Clientes Frecuentes"
                    value={stats.clientesActivos}
                    trend="Estable"
                    positive={true}
                    icon={<GroupIcon className="text-purple-500" />}
                    colorClass="bg-purple-50 text-purple-600"
                /> */}
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-800">Evolución de Ventas (Semanal)</h3>
                        <select className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none text-slate-600">
                            <option>Esta semana</option>
                            <option>Semana pasada</option>
                        </select>
                    </div>
                    <div className="w-full h-64 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center justify-center">
                        <p className="text-slate-400 text-sm font-medium">Gráfico de barras interactivo aquí</p>
                    </div>
                </div>

                {/* Integrated Activity Search Panel */}
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col transition-all duration-300 ${isExpanded ? 'h-[600px]' : 'h-fit'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800">Actividad Reciente</h3>
                    </div>

                    {/* Integrated Search Bar */}
                    <div className="relative mb-5">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 scale-90" />
                        <input
                            type="text"
                            placeholder="Buscar transacciones..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 transition-all text-sm text-slate-700 font-medium"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className={`flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar`}>
                        {loading ? (
                            <div className="flex justify-center p-8">
                                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : filteredMovimientos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-slate-400 opacity-60">
                                <SearchIcon sx={{ fontSize: 32, mb: 1 }} />
                                <p className="text-xs font-bold uppercase tracking-wider">Sin resultados</p>
                            </div>
                        ) : (
                            displayMovimientos.map((mov, i) => (
                                <div
                                    key={mov.id || i}
                                    onClick={() => (mov.venta_id || mov.pedido_id) && handleViewTicket(mov)}
                                    className={`flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group ${(mov.venta_id || mov.pedido_id) ? 'cursor-pointer' : ''}`}
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mov.tipo === 'INGRESO' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
                                        {mov.tipo === 'INGRESO' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-bold text-slate-700 truncate group-hover:text-primary-600 transition-colors">{mov.concepto}</p>
                                            {(mov.venta_id || mov.pedido_id) && (
                                                <ReceiptIcon className="text-slate-300 group-hover:text-primary-400 scale-75 opacity-0 group-hover:opacity-100 transition-all" fontSize="small" />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] font-black uppercase text-slate-400">{new Date(mov.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span className="text-[10px] text-slate-300">•</span>
                                            <span className={`text-xs font-black ${mov.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {mov.tipo === 'INGRESO' ? '+' : '-'}{formatCurrency(mov.monto)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {!loading && filteredMovimientos.length > 5 && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="w-full mt-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] text-primary-600 bg-primary-50 hover:bg-primary-100 transition-all active:scale-95 shadow-sm"
                        >
                            {isExpanded ? 'Ver Menos Actividad' : `Ver ${filteredMovimientos.length} Transacciones`}
                        </button>
                    )}
                </div>
            </div>

            {/* Ticket Detail Modal */}
            {isTicketModalOpen && selectedTicketData && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <ReceiptIcon className="text-primary-600" />
                                    Detalle de Ticket #{selectedTicketData.id}
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
                            <div className="space-y-4 max-h-[300px] overflow-y-auto mb-6 pr-2 custom-scrollbar">
                                {selectedTicketItems.map((item: any, i: number) => (
                                    <div key={i} className="flex justify-between items-start border-b border-slate-50 pb-3">
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
                                    <span>IVA / Impuestos</span>
                                    <span>{formatCurrency(selectedTicketData.impuestos)}</span>
                                </div>
                                {selectedTicketData.medio_pago && (
                                    <div className="flex justify-between text-xs font-bold text-slate-500">
                                        <span>Medio de Pago</span>
                                        <span className="text-primary-700">{selectedTicketData.medio_pago}</span>
                                    </div>
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

            {/* Venta Ticket Print Wrapper (Hidden by default, used internally by Ticket.tsx logic if needed, but here we just render the new Ticket modal component) */}
            {isTicketModalOpen && selectedTicketData && (
                <Ticket
                    ventaData={selectedTicketData}
                    items={selectedTicketItems}
                    onClose={() => setIsTicketModalOpen(false)}
                />
            )}

            {/* Pedido Ticket Modal */}
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
