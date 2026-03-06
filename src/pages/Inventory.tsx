import React, { useState, useEffect } from 'react';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import Inventory2Icon from '@mui/icons-material/Inventory2';

// Mocked Data, this will be fetched from Electron IPC later
const MOCK_PRODUCTS = [
    { id: 1, codigo: 'P001', nombre: 'Alimento Balanceado Perro Adulto 15kg', categoria: 'Alimentos', precio_compra: 8500, precio_venta: 12500, stock: 24, stock_minimo: 10 },
    { id: 2, codigo: 'P002', nombre: 'Piedras Sanitarias Gato 4kg', categoria: 'Higiene', precio_compra: 1200, precio_venta: 2100, stock: 5, stock_minimo: 15 },
    { id: 3, codigo: 'P003', nombre: 'Juguete Mordillo Goma', categoria: 'Accesorios', precio_compra: 800, precio_venta: 1500, stock: 45, stock_minimo: 10 },
];

export default function Inventory() {
    const [products, setProducts] = useState(MOCK_PRODUCTS);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredProducts = products.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.codigo.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full animate-fade-in">
            {/* Header section */}
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Gestión de Inventario</h1>
                    <p className="text-sm text-slate-500 mt-1">Administra los productos y controla el stock de la sucursal.</p>
                </div>
                <button className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-lg shadow-primary-500/30">
                    <AddIcon fontSize="small" />
                    <span>Nuevo Producto</span>
                </button>
            </div>

            {/* Toolbar / Filters */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4 mb-6">
                <div className="flex-1 relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fontSize="small" />
                    <input
                        type="text"
                        placeholder="Buscar por código o nombre..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all font-medium text-slate-700 placeholder:text-slate-400"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button className="flex items-center gap-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl font-medium transition-colors text-sm">
                    <FilterListIcon fontSize="small" />
                    <span>Filtros avanzados</span>
                </button>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                                <th className="px-6 py-4">Código</th>
                                <th className="px-6 py-4">Producto</th>
                                <th className="px-6 py-4">Categoría</th>
                                <th className="px-6 py-4 text-right">Precio de Venta</th>
                                <th className="px-6 py-4 text-center">Stock</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredProducts.map((product) => (
                                <tr key={product.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="px-6 py-4 text-sm font-medium text-slate-600">
                                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs">{product.codigo}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-slate-800">{product.nombre}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">Costo: ${product.precio_compra}</p>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                                        {product.categoria}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-800 text-right">
                                        ${product.precio_venta.toLocaleString('es-AR')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${product.stock <= product.stock_minimo
                                                ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                                : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                }`}>
                                                {product.stock} un.
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 transition-colors">
                                                <EditIcon fontSize="small" />
                                            </button>
                                            <button className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 transition-colors">
                                                <DeleteIcon fontSize="small" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {filteredProducts.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        <Inventory2Icon className="text-slate-300 mb-3" style={{ fontSize: 48 }} />
                                        <p className="text-base font-medium text-slate-600">No se encontraron productos</p>
                                        <p className="text-sm">Intenta buscar con otros términos.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                <div className="p-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500 bg-slate-50/30">
                    <p>Mostrando {filteredProducts.length} de {products.length} productos</p>
                    <div className="flex gap-1">
                        <button className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors font-medium">Anterior</button>
                        <button className="px-3 py-1.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 shadow-sm shadow-primary-500/20">1</button>
                        <button className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors font-medium">Siguiente</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
