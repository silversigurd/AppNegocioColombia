import React from 'react';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';

export default function Providers() {
    return (
        <div className="flex flex-col h-full items-center justify-center animate-fade-in text-center p-8">
            <div className="w-24 h-24 rounded-full bg-indigo-50 flex items-center justify-center mb-6 shadow-inner">
                <LocalShippingIcon className="text-indigo-400" style={{ fontSize: 48 }} />
            </div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Directorio de Proveedores</h1>
            <p className="text-slate-500 max-w-md">
                Gestiona tus distribuidores, realiza pedidos rápidos y mantén su información de contacto actualizada.
            </p>
            <button className="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/30">
                Agregar Proveedor
            </button>
        </div>
    );
}
