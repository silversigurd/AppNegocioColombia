import { useState, useEffect } from 'react';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { utils, writeFile } from 'xlsx';

import { ipc } from '../utils/ipc';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

interface Product {
    id?: number;
    codigo: string;
    nombre: string;
    descripcion: string;
    precio_compra: number;
    precio_venta: number;
    categoria_id: number | string;
    stock: number;
    iva_alicuota?: number;
    tasa_internos?: number;
    categoria_nombre?: string;
    tipo_impuesto_co?: string;
}

interface Category {
    id: number;
    nombre: string;
}

export default function Inventory() {
    const { user } = useAuth();
    const { settings } = useSettings();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<Product>({
        codigo: '',
        nombre: '',
        descripcion: '',
        precio_compra: 0,
        precio_venta: 0,
        categoria_id: '',
        stock: 0,
        iva_alicuota: 21,
        tasa_internos: 0,
        tipo_impuesto_co: 'IVA_19'
    });

    // Category Management State
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Delete Confirmation State
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<number | null>(null);

    // Category Delete Confirm State
    const [categoryToDelete, setCategoryToDelete] = useState<number | null>(null);
    const [deleteCatConfirmOpen, setDeleteCatConfirmOpen] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [productsData, categoriesData] = await Promise.all([
                ipc.invoke('get-productos', 1),
                ipc.invoke('get-categorias')
            ]);
            setProducts(productsData);
            setCategories(categoriesData);
        } catch (error) {
            console.error('Failed to load inventory data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (product: Product | null = null) => {
        if (product) {
            setEditingProduct(product);
            setFormData({ ...product });
        } else {
            setEditingProduct(null);
            setFormData({
                codigo: '',
                nombre: '',
                descripcion: '',
                precio_compra: 0,
                precio_venta: 0,
                categoria_id: '',
                stock: 0,
                iva_alicuota: 21,
                tasa_internos: 0,
                tipo_impuesto_co: 'IVA_19'
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const dataToSave = {
                ...formData,
                sucursal_id: 1,
                categoria_id: formData.categoria_id === '' ? null : formData.categoria_id
            };

            if (editingProduct) {
                await ipc.invoke('update-producto', dataToSave);
            } else {
                await ipc.invoke('save-producto', { ...dataToSave, stock_inicial: formData.stock });
            }

            setIsModalOpen(false);
            loadData();
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Error al guardar el producto. Verifique que el código no esté duplicado.');
        }
    };

    const confirmDelete = (id: number) => {
        setProductToDelete(id);
        setDeleteConfirmOpen(true);
    };

    const handleDelete = async () => {
        if (productToDelete !== null) {
            try {
                await ipc.invoke('delete-producto', productToDelete);
                loadData();
            } catch (error) {
                console.error('Error deleting product:', error);
            } finally {
                setDeleteConfirmOpen(false);
                setProductToDelete(null);
            }
        }
    };

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            const newCat = await ipc.invoke('save-categoria', newCategoryName);
            setCategories([...categories, newCat]);
            setNewCategoryName('');
            // Optional: Automatically select the new category
            setFormData(prev => ({ ...prev, categoria_id: newCat.id }));
        } catch (error) {
            console.error('Error adding category:', error);
            alert('Error al añadir la categoría.');
        }
    };

    const confirmDeleteCategory = (id: number) => {
        setCategoryToDelete(id);
        setDeleteCatConfirmOpen(true);
    };

    const handleDeleteCategory = async () => {
        if (categoryToDelete !== null) {
            try {
                await ipc.invoke('delete-categoria', categoryToDelete);
                setCategories(categories.filter(c => c.id !== categoryToDelete));
                if (formData.categoria_id === categoryToDelete) {
                    setFormData(prev => ({ ...prev, categoria_id: '' }));
                }
                loadData(); // To refresh category names in the list
            } catch (error) {
                console.error('Error deleting category:', error);
                alert('Error al eliminar la categoría.');
            } finally {
                setDeleteCatConfirmOpen(false);
                setCategoryToDelete(null);
            }
        }
    };

    const filteredProducts = products.filter(p =>
        (p.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.codigo || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // --- EXPORT LOGIC ---
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

    const handleExportExcel = () => {
        setIsExportMenuOpen(false);
        const exportData = products.map(p => ({
            'Código': p.codigo,
            'Nombre': p.nombre,
            'Categoría': p.categoria_nombre || 'General',
            'Stock Disponible': p.stock,
            'Costo Unitario ($)': p.precio_compra,
            'Precio Venta ($)': p.precio_venta,
            'Valorización Costo ($)': p.stock * p.precio_compra,
            'Valorización Venta ($)': p.stock * p.precio_venta
        }));

        const wb = utils.book_new();
        const ws = utils.json_to_sheet(exportData);
        utils.book_append_sheet(wb, ws, 'Inventario');
        writeFile(wb, `Inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleExportPDF = () => {
        setIsExportMenuOpen(false);
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text('Reporte de Inventario', 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Fecha de emisión: ${new Date().toLocaleString('es-AR')}`, 14, 30);

        const tableData = products.map(p => [
            p.codigo,
            p.nombre,
            p.categoria_nombre || 'General',
            p.stock.toString(),
            `$${p.precio_compra.toLocaleString('es-AR')}`,
            `$${p.precio_venta.toLocaleString('es-AR')}`
        ]);

        autoTable(doc, {
            startY: 35,
            head: [['Código', 'Producto', 'Categoría', 'Stock', 'Costo Unit.', 'Pr. Venta']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] }, // Primary color
            styles: { fontSize: 8 },
            columnStyles: {
                3: { halign: 'center', fontStyle: 'bold' },
                4: { halign: 'right' },
                5: { halign: 'right', fontStyle: 'bold' }
            }
        });

        doc.save(`Inventario_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    return (
        <div className="flex flex-col h-full animate-fade-in text-slate-800">
            {/* Header section */}
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Gestión de Inventario</h1>
                    <p className="text-sm text-slate-500 mt-1">Administra los productos y controla el stock de la sucursal.</p>
                </div>
                {user?.rol === 'Admin' && (
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-primary-500/30 active:scale-95"
                    >
                        <AddIcon fontSize="small" />
                        <span>Nuevo Producto</span>
                    </button>
                )}
            </div>

            {/* Toolbar / Filters */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between gap-4 mb-6">
                <div className="flex-1 max-w-lg relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fontSize="small" />
                    <input
                        type="text"
                        placeholder="Buscar por código o nombre..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-50 transition-all font-medium text-slate-700 shadow-inner"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 relative">
                    <button
                        onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95"
                    >
                        <FileDownloadIcon fontSize="small" />
                        <span>Exportar Inventario</span>
                        <KeyboardArrowDownIcon fontSize="small" className={`transform transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Export Dropdown Menu */}
                    {isExportMenuOpen && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden z-20 animate-fade-in">
                            <button
                                onClick={handleExportPDF}
                                className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-bold text-slate-700 flex items-center gap-3 transition-colors border-b border-slate-50"
                            >
                                <PictureAsPdfIcon fontSize="small" className="text-rose-500" />
                                Exportar PDF
                            </button>
                            <button
                                onClick={handleExportExcel}
                                className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-bold text-slate-700 flex items-center gap-3 transition-colors"
                            >
                                <TableChartIcon fontSize="small" className="text-emerald-500" />
                                Exportar Excel
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 overflow-hidden flex flex-col">
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr className="border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/80 backdrop-blur-md">
                                <th className="px-6 py-4">Código</th>
                                <th className="px-6 py-4">Producto</th>
                                <th className="px-6 py-4">Categoría</th>
                                <th className="px-6 py-4 text-right">Precio Venta</th>
                                <th className="px-6 py-4 text-center">Stock</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="font-bold text-sm uppercase tracking-widest">Cargando...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-2 text-slate-300">
                                            <Inventory2Icon sx={{ fontSize: 64, opacity: 0.2 }} />
                                            <p className="font-bold text-lg text-slate-400">Sin productos</p>
                                            <p className="text-sm">No se encontraron resultados para tu búsqueda.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredProducts.map((product) => (
                                <tr key={product.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <span className="font-mono text-xs font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{product.codigo}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-slate-700 leading-tight">{product.nombre}</p>
                                        <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">Costo: ${product.precio_compra}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${product.categoria_nombre ? 'bg-primary-50 text-primary-600' : 'bg-slate-100 text-slate-400'}`}>
                                            {product.categoria_nombre || 'General'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-black text-slate-800 text-right">
                                        ${product.precio_venta.toLocaleString('es-AR')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${product.stock <= 5
                                                ? 'bg-rose-50 text-rose-600 border-rose-100 animate-pulse'
                                                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                }`}>
                                                {product.stock} un.
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {user?.rol === 'Admin' && (
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleOpenModal(product)}
                                                    className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-600 flex items-center justify-center hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all shadow-sm active:scale-90"
                                                >
                                                    <EditIcon fontSize="small" />
                                                </button>
                                                <button
                                                    onClick={() => product.id && confirmDelete(product.id)}
                                                    className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-rose-500 flex items-center justify-center hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all shadow-sm active:scale-90"
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Product Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200 text-slate-800">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-1">
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Código Barra</label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                        value={formData.codigo}
                                        onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Categoría</label>
                                    <div className="flex gap-2">
                                        <select
                                            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700 appearance-none"
                                            value={formData.categoria_id}
                                            onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                                        >
                                            <option value="">General</option>
                                            {categories.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => setIsCategoryModalOpen(true)}
                                            className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-primary-600 flex items-center justify-center hover:bg-primary-50 transition-all active:scale-95"
                                            title="Nueva Categoría"
                                        >
                                            <AddIcon fontSize="small" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Nombre del Producto</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                    value={formData.nombre}
                                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Costo ($)</label>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                        value={formData.precio_compra}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => setFormData({ ...formData, precio_compra: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Venta ($)</label>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                        value={formData.precio_venta}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => setFormData({ ...formData, precio_venta: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Stock</label>
                                    <input
                                        required
                                        type="number"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                        value={formData.stock}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            {/* Argentina: ARCA Compliance */}
                            {settings.pais === 'Argentina' && settings.arcaCompliance2026 && (
                                <div className="p-4 bg-primary-50 rounded-2xl border border-primary-100 grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-black uppercase text-primary-600 mb-1 ml-1">Alícuota IVA</label>
                                        <select
                                            className="w-full px-4 py-3 bg-white border border-primary-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-100 transition-all font-bold text-slate-700 appearance-none"
                                            value={formData.iva_alicuota}
                                            onChange={(e) => setFormData({ ...formData, iva_alicuota: Number(e.target.value) })}
                                        >
                                            <option value={21}>21% (General)</option>
                                            <option value={10.5}>10.5% (Reducida)</option>
                                            <option value={27}>27% (Especial)</option>
                                            <option value={0}>0% (Exento/No Gravado)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-black uppercase text-primary-600 mb-1 ml-1">Imp. Internos (%)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-4 py-3 bg-white border border-primary-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary-100 transition-all font-bold text-slate-700"
                                            value={formData.tasa_internos}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => setFormData({ ...formData, tasa_internos: Number(e.target.value) })}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            )}
                            {/* Colombia: DIAN Tax Type per Product */}
                            {settings.pais === 'Colombia' && (
                                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-3">
                                    <label className="block text-[11px] font-black uppercase text-amber-700 mb-1 ml-1">🇨🇴 Tipo de Impuesto DIAN (Colombia 2026)</label>
                                    <select
                                        className="w-full px-4 py-3 bg-white border border-amber-200 rounded-2xl outline-none focus:ring-4 focus:ring-amber-100 transition-all font-bold text-slate-700 appearance-none"
                                        value={formData.tipo_impuesto_co || 'IVA_19'}
                                        onChange={(e) => setFormData({ ...formData, tipo_impuesto_co: e.target.value })}
                                    >
                                        <option value="IVA_19">IVA 19% — Tarifa general</option>
                                        <option value="IVA_5">IVA 5% — Tarifa diferencial</option>
                                        <option value="EXENTO">Exento de IVA (0%) — exportaciones, carnes, verd.</option>
                                        <option value="EXCLUIDO">Excluido de IVA — servicios educativos, transporte</option>
                                        <option value="IPOC_8">IPOC 8% — Comidas preparadas (cafetería/restaurante)</option>
                                        <option value="SALUDABLE_BEBIDA">Imp. Saludable — Bebida Azucarada</option>
                                        <option value="SALUDABLE_ULTRAPROCESADO">Imp. Saludable — Ultraprocesado</option>
                                    </select>
                                    {(formData.tipo_impuesto_co === 'IPOC_8') && (
                                        <p className="text-[10px] text-amber-700 bg-amber-100 px-3 py-2 rounded-xl font-semibold">
                                            ⚠️ IPOC y IVA son excluyentes. Este producto NO cobrará IVA adicional.
                                        </p>
                                    )}
                                    {(formData.tipo_impuesto_co === 'EXCLUIDO' || formData.tipo_impuesto_co === 'EXENTO') && (
                                        <p className="text-[10px] text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl font-semibold">
                                            ✓ Este producto no genera IVA en el tiquete POS.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-white bg-primary-600 hover:bg-primary-700 shadow-xl shadow-primary-500/30 transition-all flex items-center justify-center gap-2"
                                >
                                    <SaveIcon fontSize="small" />
                                    {editingProduct ? 'Actualizar' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Category Management Modal */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-800">Gestionar Categorías</h2>
                            <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                                <CloseIcon />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Nueva categoría..."
                                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-primary-50 focus:border-primary-400 transition-all font-bold text-slate-700"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                                />
                                <button
                                    onClick={handleAddCategory}
                                    className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95"
                                >
                                    Agregar
                                </button>
                            </div>

                            <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                                {categories.length === 0 ? (
                                    <p className="text-center text-slate-400 py-4 text-sm font-medium">No hay categorías personalizadas.</p>
                                ) : (
                                    categories.map(cat => (
                                        <div key={cat.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-primary-200 transition-colors">
                                            <span className="font-bold text-slate-700">{cat.nombre}</span>
                                            <button
                                                onClick={() => confirmDeleteCategory(cat.id)}
                                                className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="Eliminar categoría"
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <button
                                                onClick={() => setIsCategoryModalOpen(false)}
                                                className="w-full mt-4 px-6 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all"
                                            >
                                                Cerrar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200 p-6 text-center">
                        <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <DeleteIcon fontSize="large" />
                        </div>
                        <h2 className="text-xl font-bold mb-2">¿Eliminar Producto?</h2>
                        <p className="text-slate-500 text-sm mb-6">
                            Esta acción no se puede deshacer. El producto será removido permanentemente del inventario.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setDeleteConfirmOpen(false);
                                    setProductToDelete(null);
                                }}
                                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/30 transition-all"
                            >
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Category Delete Confirmation Modal */}
            {deleteCatConfirmOpen && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200 p-6 text-center">
                        <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <DeleteIcon fontSize="large" />
                        </div>
                        <h2 className="text-xl font-bold mb-2">¿Eliminar Categoría?</h2>
                        <p className="text-slate-500 text-sm mb-6">
                            Los productos que pertenezcan a esta categoría pasarán a ser parte de la categoría "General".
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setDeleteCatConfirmOpen(false);
                                    setCategoryToDelete(null);
                                }}
                                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeleteCategory}
                                className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/30 transition-all"
                            >
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
