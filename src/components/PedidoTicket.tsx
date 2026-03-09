import React from 'react';
import PrintIcon from '@mui/icons-material/Print';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BusinessIcon from '@mui/icons-material/Business';

interface PedidoTicketProps {
    pedidoData: any;
    items: any[];
    onClose: () => void;
}

export default function PedidoTicket({ pedidoData, items, onClose }: PedidoTicketProps) {
    if (!pedidoData) return null;

    const handlePrint = () => {
        const printContent = document.getElementById('pedido-ticket-content');
        if (printContent) {
            const originalContents = document.body.innerHTML;
            document.body.innerHTML = printContent.innerHTML;
            window.print();
            document.body.innerHTML = originalContents;
            window.location.reload();
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Visual Header */}
                <div className="bg-emerald-600 p-6 text-center relative overflow-hidden shrink-0">
                    <div className="relative z-10 text-white">
                        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
                            <ReceiptLongIcon fontSize="large" />
                        </div>
                        <h2 className="text-2xl font-black tracking-tight drop-shadow-sm">ORDEN DE COMPRA</h2>
                        <p className="text-emerald-100 font-medium text-sm">Comprobante Interno #{String(pedidoData.id).padStart(6, '0')}</p>
                    </div>
                </div>

                {/* Main Content Area */}
                <div id="pedido-ticket-content" className="flex-1 overflow-y-auto p-6 bg-slate-50 relative custom-scrollbar">

                    {/* Metadata */}
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 mb-6 flex justify-between items-center">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha de Emisión</p>
                            <p className="font-semibold text-slate-700">{new Date(pedidoData.fecha).toLocaleString('es-AR')}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Estado</p>
                            <span className={`text-xs px-2 py-1 rounded font-bold ${pedidoData.estado === 'RECIBIDO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {pedidoData.estado}
                            </span>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 mb-6">
                        <div className="flex gap-3 items-center mb-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                                <BusinessIcon fontSize="small" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Proveedor</p>
                                <p className="font-bold text-slate-800">{pedidoData.proveedor_nombre}</p>
                                <p className="text-xs font-semibold text-slate-500">CUIT: {pedidoData.proveedor_cuit || 'N/A'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Products List */}
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 px-2 border-b border-slate-200 pb-2">Artículos Recibidos</h3>
                        <div className="space-y-4 px-2">
                            {items && items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-start">
                                    <div className="flex-1 pr-4">
                                        <p className="font-bold text-slate-800 text-sm leading-tight mb-1">{item.producto_nombre}</p>
                                        <p className="text-xs font-medium text-slate-500">{item.cantidad} x ${item.precio_compra_unitario?.toFixed(2)}</p>
                                    </div>
                                    <p className="font-bold text-slate-700 text-sm">${item.subtotal?.toFixed(2)}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t-2 border-dashed border-slate-200 my-6"></div>

                    {/* Totals */}
                    <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                        <div className="flex justify-between items-center">
                            <span className="font-black text-emerald-800 uppercase tracking-wider">Total Final</span>
                            <span className="text-2xl font-black text-emerald-600">${pedidoData.total?.toLocaleString('es-AR')}</span>
                        </div>
                        <div className="mt-2 text-right">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${pedidoData.pagado ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>
                                {pedidoData.pagado ? 'PAGO ASENTADO' : 'PENDIENTE DE PAGO'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 bg-white border-t border-slate-100 flex gap-3 shrink-0">
                    <button
                        onClick={handlePrint}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
                        <PrintIcon fontSize="small" /> Imprimir
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold transition-colors shadow-lg shadow-emerald-500/20">
                        Aceptar
                    </button>
                </div>
            </div>
        </div>
    );
}
