import React, { useEffect, useState } from 'react';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import GroupIcon from '@mui/icons-material/Group';
import ReceiptIcon from '@mui/icons-material/Receipt';

export default function Dashboard() {
    const [stats, setStats] = useState({
        ventasHoy: 12500.5,
        productosBajoStock: 12,
        clientesActivos: 154,
        ticketsEmitidos: 45
    });

    return (
        <div className="flex flex-col gap-6">

            {/* Top Banner */}
            <div className="w-full bg-gradient-to-r from-primary-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl shadow-primary-500/20 relative overflow-hidden">
                <div className="relative z-10">
                    <h1 className="text-3xl font-bold mb-2">¡Hola, Administrador! 👋</h1>
                    <p className="text-primary-100 max-w-lg text-sm leading-relaxed">
                        Aquí tienes el resumen de la actividad de tu comercio en el día de hoy.
                        Revisa los indicadores clave y mantén el inventario al día.
                    </p>
                </div>
                {/* Decorative background elements */}
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute right-20 -bottom-20 w-40 h-40 bg-indigo-400/20 rounded-full blur-2xl"></div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    title="Ventas del Día"
                    value={`$${stats.ventasHoy.toLocaleString('es-AR')}`}
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
                    positive={false}
                    icon={<Inventory2Icon className="text-rose-500" />}
                    colorClass="bg-rose-50 text-rose-600"
                />
                <KpiCard
                    title="Clientes Frecuentes"
                    value={stats.clientesActivos}
                    trend="Estable"
                    positive={true}
                    icon={<GroupIcon className="text-purple-500" />}
                    colorClass="bg-purple-50 text-purple-600"
                />
            </div>

            {/* Main Content Area (Charts / Tables Placeholder) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-800">Evolución de Ventas (Semanal)</h3>
                        <select className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none text-slate-600">
                            <option>Esta semana</option>
                            <option>Semana pasada</option>
                        </select>
                    </div>
                    {/* Chart Placeholder */}
                    <div className="w-full h-64 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center justify-center">
                        <p className="text-slate-400 text-sm font-medium">Gráfico de barras interactivo aquí</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-800">Actividad Reciente</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="flex items-start gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                    <ReceiptIcon className="text-blue-500" fontSize="small" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">Nueva Venta #00{i}</p>
                                    <p className="text-xs text-slate-500 mt-1">Hace {i * 15} minutos • $ {(Math.random() * 5000).toFixed(2)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 transition-colors">
                        Ver todas las transacciones
                    </button>
                </div>
            </div>

        </div>
    );
}

function KpiCard({ title, value, trend, positive, icon, colorClass }) {
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
