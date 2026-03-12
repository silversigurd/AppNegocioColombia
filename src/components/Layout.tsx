import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import PeopleIcon from '@mui/icons-material/People';
import StoreIcon from '@mui/icons-material/Store';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';

import config from '../config.json';

const navItems = [
    { path: '/', label: 'Panel de Control', icon: <DashboardIcon /> },
    { path: '/pos', label: 'Punto de Venta', icon: <PointOfSaleIcon /> },
    { path: '/inventario', label: 'Inventario', icon: <InventoryIcon /> },
    // { path: '/clientes', label: 'Clientes', icon: <PeopleIcon /> },
    { path: '/proveedores', label: 'Proveedores', icon: <LocalShippingIcon /> },
    { path: '/caja', label: 'Caja y Finanzas', icon: <AccountBalanceWalletIcon /> },
    { path: '/sucursales', label: 'RRHH', icon: <StoreIcon /> },
];

export default function Layout() {
    const location = useLocation();
    const [activeBranch, setActiveBranch] = useState('Sede Principal'); // Mock para empezar

    return (
        <div className="flex h-screen w-full bg-slate-50 text-slate-800">
            {/* Sidebar - Premium Glassmorphism Look */}
            <aside className="no-print w-64 h-full bg-white border-r border-slate-200 shadow-xl flex flex-col z-10 transition-all duration-300">
                <div className="p-6 flex items-center gap-3 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-600 to-primary-400 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
                        <StoreIcon />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg leading-tight text-slate-900">{config.businessName}</h1>
                        <p className="text-xs text-slate-500 font-medium">{config.tagline}</p>
                    </div>
                </div>

                {/* Creador de Contexto: Sucursal Actual */}
                <div className="px-6 py-4">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Sucursal Activa</label>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-2 cursor-pointer hover:border-primary-400 transition-colors">
                        <select className="w-full bg-transparent text-sm font-semibold outline-none cursor-pointer">
                            <option>{activeBranch}</option>
                        </select>
                    </div>
                </div>

                <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                    ? 'bg-primary-50 text-primary-700 shadow-sm'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                <div className={`${isActive ? 'text-primary-600' : 'text-slate-400'} transition-colors`}>
                                    {item.icon}
                                </div>
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-100">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
                            AD
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-700">Admin</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
                {/* Top Header if needed */}
                <header className="no-print h-16 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center px-8 shrink-0">
                    <h2 className="text-xl font-bold text-slate-800">
                        {navItems.find(i => i.path === location.pathname)?.label || 'Sistema'}
                    </h2>
                </header>

                {/* Router View */}
                <div className="flex-1 overflow-auto p-8 relative">
                    <div className="max-w-7xl mx-auto w-full h-full animate-fade-in">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
