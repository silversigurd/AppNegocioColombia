import React, { useState } from 'react';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FilterAltIcon from '@mui/icons-material/FilterAlt';

const MOCK_MOVEMENTS = [
    { id: 1, fecha: '2026-03-05 14:30', tipo: 'INGRESO', concepto: 'Venta Ticket #0045', monto: 12500, metodo: 'Efectivo' },
    { id: 2, fecha: '2026-03-05 15:15', tipo: 'EGRESO', concepto: 'Pago a Proveedor (DogChow)', monto: 85000, metodo: 'Transferencia' },
    { id: 3, fecha: '2026-03-05 16:00', tipo: 'INGRESO', concepto: 'Venta Ticket #0046', monto: 3500, metodo: 'Tarjeta Débito' },
    { id: 4, fecha: '2026-03-05 16:45', tipo: 'EGRESO', concepto: 'Gastos de limpieza', monto: 1200, metodo: 'Efectivo' },
];

export default function Finance() {
    const [filter, setFilter] = useState('TODOS');

    const filteredMovements = MOCK_MOVEMENTS.filter(m => filter === 'TODOS' || m.tipo === filter);

    const totalIngresos = MOCK_MOVEMENTS.filter(m => m.tipo === 'INGRESO').reduce((acc, m) => acc + m.monto, 0);
    const totalEgresos = MOCK_MOVEMENTS.filter(m => m.tipo === 'EGRESO').reduce((acc, m) => acc + m.monto, 0);
    const balance = totalIngresos - totalEgresos;

    return (
        <div className="flex flex-col h-full animate-fade-in">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Flujo de Caja</h1>
                    <p className="text-sm text-slate-500 mt-1">Control de ingresos, egresos y balance general.</p>
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
                    <h2 className="text-3xl font-black text-slate-800">${balance.toLocaleString('es-AR')}</h2>
                </div>

                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 shadow-md shadow-emerald-500/20 text-white">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-sm font-bold text-emerald-100 uppercase tracking-widest">Ingresos</p>
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                            <ArrowUpwardIcon />
                        </div>
                    </div>
                    <h2 className="text-3xl font-black">${totalIngresos.toLocaleString('es-AR')}</h2>
                </div>

                <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl p-6 shadow-md shadow-rose-500/20 text-white">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-sm font-bold text-rose-100 uppercase tracking-widest">Egresos</p>
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                            <ArrowDownwardIcon />
                        </div>
                    </div>
                    <h2 className="text-3xl font-black">${totalEgresos.toLocaleString('es-AR')}</h2>
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
                            {filteredMovements.map((mov) => (
                                <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-sm text-slate-500">{mov.fecha}</td>
                                    <td className="px-6 py-4 font-medium text-slate-700">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${mov.tipo === 'INGRESO' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
                                                {mov.tipo === 'INGRESO' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                                            </div>
                                            {mov.concepto}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">
                                        <span className="bg-slate-100 px-2.5 py-1 rounded-md">{mov.metodo}</span>
                                    </td>
                                    <td className={`px-6 py-4 text-right font-bold ${mov.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {mov.tipo === 'INGRESO' ? '+' : '-'}${mov.monto.toLocaleString('es-AR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}
