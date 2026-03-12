import { Outlet, Link, useLocation } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import StoreIcon from '@mui/icons-material/Store';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const navItems = [
    { path: '/', label: 'Panel de Control', icon: <DashboardIcon /> },
    { path: '/pos', label: 'Punto de Venta', icon: <PointOfSaleIcon /> },
    { path: '/inventario', label: 'Inventario', icon: <InventoryIcon /> },
    // { path: '/clientes', label: 'Clientes', icon: <PeopleIcon /> },
    { path: '/proveedores', label: 'Proveedores', icon: <LocalShippingIcon />, roles: ['Admin'] },
    { path: '/caja', label: 'Caja y Finanzas', icon: <AccountBalanceWalletIcon />, roles: ['Admin'] },
    { path: '/sucursales', label: 'RRHH', icon: <StoreIcon />, roles: ['Admin'] },
    { path: '/usuarios', label: 'Usuarios', icon: <ManageAccountsIcon />, roles: ['Admin'] },
    { path: '/ajustes', label: 'Ajustes', icon: <SettingsIcon />, roles: ['Admin'] },
];

export default function Layout() {
    const location = useLocation();
    const { user, logout } = useAuth();
    const { settings } = useSettings();

    // Use base64 encoded logo injected from the DB via IPC to bypass file:/// restrictions
    const logoUrl = settings.logoBase64 || null;

    return (
        <div className="flex h-screen w-full bg-slate-50 text-slate-800">
            {/* Sidebar */}
            <aside className="no-print w-64 h-full bg-white border-r border-slate-200 shadow-xl flex flex-col z-10 transition-all duration-300">
                <div className="p-6 flex items-center gap-3 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-600 to-primary-400 flex items-center justify-center text-white shadow-lg shadow-primary-500/30 overflow-hidden shrink-0">
                        {logoUrl ? (
                            <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
                        ) : (
                            <StoreIcon />
                        )}
                    </div>
                    <div className="min-w-0">
                        <h1 className="font-bold text-lg leading-tight text-slate-900 truncate">{settings.businessName}</h1>
                        <p className="text-xs text-slate-500 font-medium truncate">{settings.tagline}</p>
                    </div>
                </div>

                <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto mt-4">
                    {navItems.map((item) => {
                        // Filter by Role
                        if (item.roles && user && !item.roles.includes(user.rol)) return null;

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

                <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 px-2 py-2">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 flex items-center justify-center text-slate-700 font-bold text-sm shadow-inner overflow-hidden border border-slate-300">
                            {user?.username.substring(0, 2).toUpperCase() || 'U'}
                        </div>
                        <div className="flex flex-col">
                            <p className="text-sm font-bold text-slate-800 leading-tight">{user?.username}</p>
                            <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">{user?.rol}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex shrink-0"
                        title="Cerrar Sesión"
                    >
                        <LogoutIcon fontSize="small" />
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
                {/* Top Header */}
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
