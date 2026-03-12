import { useState, useEffect } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import PaymentsIcon from '@mui/icons-material/Payments';
import PrintIcon from '@mui/icons-material/Print';
import Ticket from '../components/Ticket';
import { ipc } from '../utils/ipc';
import { useAuth } from '../context/AuthContext';

type Product = { id: number, codigo: string, nombre: string, precio_venta: number, stock: number };
type CartItem = Product & { quantity: number };

export default function POS() {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // Last Sale Info for Printing
    const [lastSale, setLastSale] = useState<any>(null);
    const [showPrintOptions, setShowPrintOptions] = useState(false);

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        setLoading(true);
        try {
            const data = await ipc.invoke('get-productos', 1);
            setProducts(data);
        } catch (error) {
            console.error('Error loading products for POS:', error);
        } finally {
            setLoading(false);
        }
    };

    // Barcode Scanner Logic
    useEffect(() => {
        let buffer = '';
        let lastKeyTime = Date.now();

        const handleKeyDown = (e: KeyboardEvent) => {
            const currentTime = Date.now();

            // If it's been more than 50ms since last key, it's probably not a scanner
            if (currentTime - lastKeyTime > 50) {
                buffer = '';
            }

            lastKeyTime = currentTime;

            if (e.key === 'Enter') {
                if (buffer.length > 3) {
                    const product = products.find(p => p.codigo === buffer);
                    if (product) {
                        addToCart(product);
                        setSearchTerm(''); // Clear search
                        buffer = '';
                        // Optional: play a sound?
                    }
                }
                buffer = '';
            } else if (e.key.length === 1) {
                buffer += e.key;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [products, cart]); // Re-bind when products change

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

    const filteredProducts = products.filter(p =>
        (p.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.codigo || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const subtotal = cart.reduce((acc, item) => acc + (item.precio_venta * item.quantity), 0);
    const tax = subtotal * 0.21; // 21% IVA Ejemplo
    const total = subtotal + tax;

    const confirmPayment = async () => {
        if (cart.length === 0) return;

        try {
            const saleData = {
                total,
                subtotal,
                impuestos: tax,
                sucursal_id: 1,
                items: cart.map(item => ({
                    producto_id: item.id,
                    cantidad: item.quantity,
                    precio_unitario: item.precio_venta,
                    subtotal: item.precio_venta * item.quantity
                }))
            };

            const result = await ipc.invoke('save-venta', saleData);

            // Set last sale info for possible re-printing
            setLastSale({
                id: result.ventaId,
                fecha: new Date().toISOString(),
                items: [...cart],
                total,
                subtotal,
                impuestos: tax,
                vendedor: user?.empleado_nombre || user?.username || 'Sistema'
            });
            setShowPrintOptions(true);

            alert('Venta realizada con éxito!');
            setCart([]);
            loadProducts(); // Reload stock
        } catch (error) {
            console.error('Error recording sale:', error);
            alert('Error al procesar la venta.');
        }
    };

    return (
        <>
            <div className="flex gap-6 h-full animate-fade-in text-slate-800">

                {/* Left Column: Product Selection */}
                <div className="flex-1 flex flex-col gap-6">
                    <div>
                        <h1 className="text-2xl font-bold">Terminal de Venta</h1>
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
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && searchTerm) {
                                    const product = products.find(p => p.codigo === searchTerm || p.nombre.toLowerCase() === searchTerm.toLowerCase());
                                    if (product) {
                                        addToCart(product);
                                        setSearchTerm('');
                                    }
                                }
                            }}
                        />
                    </div>

                    {/* Quick Products Grid */}
                    <div className="flex-1 overflow-y-auto">
                        <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Productos</h3>
                        {loading ? (
                            <div className="flex justify-center p-12">
                                <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredProducts.map(product => (
                                    <div
                                        key={product.id}
                                        className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-primary-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-34 group"
                                        onClick={() => addToCart(product)}
                                    >
                                        <div>
                                            <div className="flex justify-between items-start mb-1">
                                                <p className="text-[10px] font-bold text-slate-400">{product.codigo}</p>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${product.stock > 5 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                    Stock: {product.stock}
                                                </span>
                                            </div>
                                            <h4 className="font-bold leading-tight group-hover:text-primary-600 transition-colors line-clamp-2">{product.nombre}</h4>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <span className="text-lg font-black">${product.precio_venta}</span>
                                            <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center group-hover:bg-primary-600 group-hover:text-white transition-colors">
                                                <AddShoppingCartIcon fontSize="small" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Cart & Checkout */}
                <div className="w-[400px] bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col overflow-hidden shrink-0">
                    <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="font-bold text-lg flex items-center gap-2">
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
                                            <h4 className="font-bold text-sm truncate pr-6">{item.nombre}</h4>
                                            <p className="text-primary-600 font-bold text-sm leading-none mt-1">${item.precio_venta}</p>
                                        </div>
                                        <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1 border border-slate-200">
                                            <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }} className="w-7 h-7 flex items-center justify-center rounded-md bg-white text-slate-600 shadow-sm hover:text-primary-600 font-bold">-</button>
                                            <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                                            <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 1); }} className="w-7 h-7 flex items-center justify-center rounded-md bg-white text-slate-600 shadow-sm hover:text-primary-600 font-bold">+</button>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
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
                                <span className="font-bold">Total</span>
                                <span className="text-4xl font-black text-primary-600 tracking-tight">
                                    ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        <button
                            disabled={cart.length === 0}
                            onClick={confirmPayment}
                            className="w-full bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-xl shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                        >
                            <PaymentsIcon /> Confirmar Pago
                        </button>
                    </div>
                </div>

            </div>

            {/* Print Options Backdrop/Overlay */}
            {showPrintOptions && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200 p-8 text-center">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <PaymentsIcon sx={{ fontSize: 32 }} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">¡Venta Exitosa!</h2>
                        <p className="text-slate-500 text-sm mb-6">¿Deseas imprimir el ticket de esta venta?</p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => {
                                    // Delay the state update so Electron print spooler catches the DOM
                                    setTimeout(() => {
                                        window.print();
                                    }, 100);

                                    // Close modal after giving some time to the print dialog
                                    setTimeout(() => {
                                        setShowPrintOptions(false);
                                    }, 1500);
                                }}
                                className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/30 transition-all active:scale-95"
                            >
                                <PrintIcon /> Imprimir Ticket
                            </button>
                            <button
                                onClick={() => setShowPrintOptions(false)}
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3.5 rounded-2xl font-bold transition-all"
                            >
                                Continuar sin imprimir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden Ticket for Printing */}
            {lastSale && (
                <Ticket
                    id={lastSale.id}
                    fecha={lastSale.fecha}
                    items={lastSale.items}
                    total={lastSale.total}
                    subtotal={lastSale.subtotal}
                    impuestos={lastSale.impuestos}
                    vendedor={lastSale.vendedor}
                />
            )}
        </>
    );
}
