import React, { useState } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import PaymentsIcon from '@mui/icons-material/Payments';

const MOCK_PRODUCTS = [
    { id: 1, codigo: 'P001', nombre: 'Alimento Balanceado Perro Adulto 15kg', precio: 12500, stock: 24 },
    { id: 2, codigo: 'P002', nombre: 'Piedras Sanitarias Gato 4kg', precio: 2100, stock: 5 },
    { id: 3, codigo: 'P003', nombre: 'Juguete Mordillo Goma', precio: 1500, stock: 45 },
];

type Product = { id: number, codigo: string, nombre: string, precio: number, stock: number };
type CartItem = Product & { quantity: number };

export default function POS() {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    const addToCart = (product: Product) => {
        const existing = cart.find(item => item.id === product.id);
        if (existing) {
            setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
        } else {
            setCart([...cart, { ...product, quantity: 1 }]);
        }
    };

    const removeFromCart = (id: number) => {
        setCart(cart.filter(item => item.id !== id));
    };

    const updateQuantity = (id: number, delta: number) => {
        setCart(cart.map(item => {
            if (item.id === id) {
                const newQ = item.quantity + delta;
                return newQ > 0 ? { ...item, quantity: newQ } : item;
            }
            return item;
        }));
    };

    const subtotal = cart.reduce((acc, item) => acc + (item.precio * item.quantity), 0);
    const tax = subtotal * 0.21; // 21% IVA Ejemplo
    const total = subtotal + tax;

    return (
        <div className="flex gap-6 h-full animate-fade-in">

            {/* Left Column: Product Selection */}
            <div className="flex-1 flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Terminal de Venta</h1>
                    <p className="text-sm text-slate-500 mt-1">Busca productos y agrégalos al carrito.</p>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-500" fontSize="medium" />
                    <input
                        type="text"
                        placeholder="Escanear código de barras o buscar producto..."
                        className="w-full pl-12 pr-6 py-4 bg-white border-2 border-slate-200 rounded-2xl text-lg focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100 transition-all font-semibold text-slate-700 placeholder:text-slate-400 shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Quick Products Grid */}
                <div className="flex-1 overflow-y-auto">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Productos Rápidos</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        {MOCK_PRODUCTS.map(product => (
                            <div
                                key={product.id}
                                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-primary-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-32 group"
                                onClick={() => addToCart(product)}
                            >
                                <div>
                                    <p className="text-xs font-bold text-slate-400 mb-1">{product.codigo}</p>
                                    <h4 className="font-bold text-slate-800 leading-tight group-hover:text-primary-600 transition-colors line-clamp-2">{product.nombre}</h4>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-lg font-black text-slate-800">${product.precio}</span>
                                    <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center group-hover:bg-primary-600 group-hover:text-white transition-colors">
                                        <AddShoppingCartIcon fontSize="small" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Column: Cart & Checkout */}
            <div className="w-[400px] bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col overflow-hidden shrink-0">
                <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <ReceiptLongIcon className="text-primary-500" /> Detalle de Venta
                    </h2>
                    <span className="bg-white px-3 py-1 rounded-lg text-sm font-bold text-slate-600 shadow-sm border border-slate-200">
                        {cart.length} items
                    </span>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-2">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center gap-3">
                            <PointOfSaleIcon style={{ fontSize: 64 }} className="text-slate-200" />
                            <p className="font-medium text-slate-500">El carrito está vacío</p>
                            <p className="text-sm">Agrega productos desde el panel izquierdo o escaneando un código.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {cart.map((item) => (
                                <div key={item.id} className="p-3 bg-white rounded-2xl border border-slate-100 flex items-center gap-3 relative group">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-sm text-slate-800 truncate pr-6">{item.nombre}</h4>
                                        <p className="text-primary-600 font-bold text-sm leading-none mt-1">${item.precio}</p>
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1 border border-slate-200">
                                        <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-md bg-white text-slate-600 shadow-sm hover:text-primary-600 font-bold">-</button>
                                        <span className="w-6 text-center text-sm font-bold text-slate-800">{item.quantity}</span>
                                        <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-md bg-white text-slate-600 shadow-sm hover:text-primary-600 font-bold">+</button>
                                    </div>
                                    <button
                                        onClick={() => removeFromCart(item.id)}
                                        className="absolute -top-2 -right-2 w-7 h-7 bg-white rounded-full border border-slate-200 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-rose-50 transition-all shadow-sm"
                                    >
                                        <DeleteOutlineIcon style={{ fontSize: 16 }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Totals & Checkout */}
                <div className="p-6 bg-slate-50 border-t border-slate-200 mt-auto">
                    <div className="space-y-3 mb-6 relative">
                        <div className="flex justify-between text-sm font-medium text-slate-500">
                            <span>Subtotal</span>
                            <span>${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-sm font-medium text-slate-500">
                            <span>IVA (21%)</span>
                            <span>${tax.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>

                        <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-slate-300"></div>

                        <div className="flex justify-between items-end pt-4">
                            <span className="font-bold text-slate-800">Total</span>
                            <span className="text-4xl font-black text-primary-600 tracking-tight">
                                ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>

                    <button
                        disabled={cart.length === 0}
                        className="w-full bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-xl shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                    >
                        <PaymentsIcon /> Confirmar Pago
                    </button>
                </div>
            </div>

        </div>
    );
}
