import React, { useState } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import MoreVertIcon from '@mui/icons-material/MoreVert';

const MOCK_CLIENTS = [
    { id: 1, nombre: 'Juan Pérez', telefono: '+54 11 1234-5678', email: 'juan.perez@email.com', compras: 12, total_gastado: 145000 },
    { id: 2, nombre: 'María González', telefono: '+54 11 9876-5432', email: 'maria.g@email.com', compras: 5, total_gastado: 23500 },
    { id: 3, nombre: 'Empresa XY S.A.', telefono: '+54 11 5555-5555', email: 'compras@empresaxy.com', compras: 34, total_gastado: 890000 },
];

export default function Clients() {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredClients = MOCK_CLIENTS.filter(c =>
        c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full animate-fade-in">
            {/* Header section */}
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Directorio de Clientes</h1>
                    <p className="text-sm text-slate-500 mt-1">Registra nuevos clientes y analiza su historial de compras.</p>
                </div>
                <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/30">
                    <PersonAddAlt1Icon fontSize="small" />
                    <span>Nuevo Cliente</span>
                </button>
            </div>

            {/* Toolbar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4 mb-6">
                <div className="flex-1 relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fontSize="small" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, empresa o correo electrónico..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Grid of Clients */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto pb-6">
                {filteredClients.map(client => (
                    <div key={client.id} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-shadow relative group">
                        <button className="absolute top-4 right-4 text-slate-300 hover:text-slate-600 transition-colors">
                            <MoreVertIcon />
                        </button>

                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xl uppercase shadow-inner">
                                {client.nombre.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 line-clamp-1">{client.nombre}</h3>
                                <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded text-xs font-bold border border-emerald-100 mt-1 inline-block">
                                    Activo
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2 mb-6">
                            <div className="flex items-center gap-3 text-sm text-slate-500">
                                <PhoneIcon fontSize="small" className="text-slate-400" />
                                <span className="truncate">{client.telefono}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-slate-500">
                                <EmailIcon fontSize="small" className="text-slate-400" />
                                <span className="truncate">{client.email}</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
                            <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Compras</p>
                                <p className="font-bold text-slate-800">{client.compras} <span className="text-xs font-normal text-slate-500">veces</span></p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Acumulado</p>
                                <p className="font-black text-indigo-600">${client.total_gastado.toLocaleString('es-AR')}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
