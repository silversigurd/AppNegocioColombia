import React from 'react';
import config from '../config.json';

interface TicketProps {
    // Accept either individual fields or a full ventaData object
    id?: string | number;
    fecha?: string;
    items?: any[];
    total?: number;
    subtotal?: number;
    impuestos?: number;
    ventaData?: any; // Full venta object containing the above fields
    onClose?: () => void;
}

export default function Ticket({ id, fecha, items, total, subtotal, impuestos, ventaData }: TicketProps) {
    // Resolve values from ventaData if provided, otherwise use individual props
    const ticketId = ventaData?.id ?? id;
    const ticketFecha = ventaData?.fecha ?? fecha;
    const ticketItems = (ventaData?.items ?? items) || [];
    const ticketTotal = ventaData?.total ?? total ?? 0;
    const ticketSubtotal = ventaData?.subtotal ?? subtotal ?? 0;
    const ticketImpuestos = ventaData?.impuestos ?? impuestos ?? 0;

    return (
        <div className="print-only text-slate-900 font-mono text-xs w-[80mm] mx-auto p-4 bg-white">
            <div className="text-center mb-6 space-y-1">
                <h1 className="text-xl font-bold uppercase tracking-widest">{config.businessName}</h1>
                <p className="text-[10px]">{config.tagline}</p>
                <div className="border-y border-dashed border-slate-300 py-2 my-2">
                    <p className="font-bold">TICKET DE VENTA #{ticketId}</p>
                    <p>{ticketFecha ? new Date(ticketFecha).toLocaleString('es-AR') : ''}</p>
                </div>
            </div>

            <div className="space-y-2 mb-6">
                <div className="flex justify-between font-black border-b border-slate-200 pb-1 uppercase text-[9px]">
                    <span className="w-1/2">Descripción</span>
                    <span className="w-1/6 text-center">Cant</span>
                    <span className="w-1/3 text-right">Total</span>
                </div>
                {ticketItems.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between items-start gap-1">
                        <span className="w-1/2 truncate font-medium">{item.producto_nombre || item.nombre}</span>
                        <span className="w-1/6 text-center">{item.cantidad}</span>
                        <span className="w-1/3 text-right font-bold">${(item.subtotal || (item.precio_venta * (item.quantity || item.cantidad)))?.toLocaleString('es-AR')}</span>
                    </div>
                ))}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-4 space-y-1">
                <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>${ticketSubtotal.toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between">
                    <span>IVA / Impuestos:</span>
                    <span>${ticketImpuestos.toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between text-base font-black pt-2 border-t border-slate-900 mt-2">
                    <span>TOTAL:</span>
                    <span>${ticketTotal.toLocaleString('es-AR')}</span>
                </div>
            </div>

            <div className="mt-8 text-center space-y-2">
                <p className="font-bold">¡GRACIAS POR SU COMPRA!</p>
                <p className="text-[8px] opacity-70">Desarrollado por CommerceOS Pro</p>
                <div className="flex justify-center mt-4">
                    {/* Placeholder for QR if needed */}
                    <div className="w-20 h-20 border border-slate-200 flex items-center justify-center text-[8px] text-slate-300">
                        QR FISCAL
                    </div>
                </div>
            </div>
        </div>
    );
}

