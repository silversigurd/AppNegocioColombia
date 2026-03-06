import React from 'react';
import StoreIcon from '@mui/icons-material/Store';

export default function Branches() {
    return (
        <div className="flex flex-col h-full items-center justify-center animate-fade-in text-center p-8">
            <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center mb-6 shadow-inner">
                <StoreIcon className="text-emerald-400" style={{ fontSize: 48 }} />
            </div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Administración de Sucursales y RRHH</h1>
            <p className="text-slate-500 max-w-md">
                Controla los empleados de cada sucursal, registra horarios laborados y calcula sus salarios según las horas.
            </p>
            <div className="flex gap-4 mt-8">
                <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-bold transition-all shadow-sm">
                    Gestionar Personal
                </button>
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/30">
                    Nueva Sucursal
                </button>
            </div>
        </div>
    );
}
