import { useSettings } from '../context/SettingsContext';
import { getProfileWidth, centerText, divider, formatItemLine, formatTotalLine } from '../utils/ticketFormatter';

interface TicketProps {
    // Accept either individual fields or a full ventaData object
    id?: string | number;
    fecha?: string;
    items?: any[];
    total?: number;
    subtotal?: number;
    impuestos?: number;
    cliente_identificacion?: string;
    vendedor?: string;
    ventaData?: any;
    onClose?: () => void;
}

export default function Ticket({
    id, fecha, items, total, subtotal, impuestos,
    cliente_identificacion, vendedor, ventaData
}: TicketProps) {
    // Read live settings from DB instead of static config.json
    const { settings } = useSettings();

    const ticketId = ventaData?.id ?? id;
    const ticketFecha = ventaData?.fecha ?? fecha;
    const ticketItems = (ventaData?.items ?? items) || [];
    const ticketTotal = ventaData?.total ?? total ?? 0;
    const ticketSubtotal = ventaData?.subtotal ?? subtotal ?? 0;
    const ticketImpuestos = ventaData?.impuestos ?? impuestos ?? 0;
    const ticketCliente = ventaData?.cliente_identificacion ?? cliente_identificacion;
    const ticketVendedor = ventaData?.vendedor ?? vendedor;
    // Colombia 2026 fields
    const cudeLocal = ventaData?.cude_local;
    const medioPago = ventaData?.medio_pago;
    const iva19 = ventaData?.iva_19 ?? 0;
    const iva5 = ventaData?.iva_5 ?? 0;
    const ipoc = ventaData?.ipoc ?? 0;
    const impSaludable = ventaData?.imp_saludable ?? 0;

    const width = getProfileWidth(settings.printerProfile || '80mm');
    const border = divider(width, '-');

    let ticketText = '';

    // Header logic
    ticketText += centerText(settings.businessName || '', width) + '\n';
    if (settings.taxId || settings.businessNit) {
        ticketText += centerText(`NIT: ${settings.taxId || settings.businessNit}`, width) + '\n';
    }
    
    if (settings.businessAddress) ticketText += centerText(settings.businessAddress, width) + '\n';
    ticketText += centerText(settings.tagline || '', width) + '\n';

    ticketText += border + '\n';
    ticketText += centerText('FACTURA DE VENTA POS', width) + '\n';
    ticketText += centerText(`N°: ${ticketId}`, width) + '\n';
    
    if (ticketFecha) {
        ticketText += centerText(new Date(ticketFecha).toLocaleString('es-CO'), width) + '\n';
    }
    
    if (ticketCliente) {
        ticketText += centerText(`ADQUIRIENTE: ${ticketCliente}`, width) + '\n';
    }
    
    if (ticketVendedor) ticketText += centerText(`Vendedor: ${ticketVendedor}`, width) + '\n';
    ticketText += border + '\n';

    // Items
    ticketItems.forEach((item: any) => {
        const name = item.producto_nombre || item.nombre || 'Articulo';
        const qty = item.cantidad || item.quantity || 1;
        const sub = item.subtotal || (item.precio_venta * qty);

        const priceText = `$${sub?.toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;
        ticketText += formatItemLine(qty, name, priceText, width) + '\n';
    });

    ticketText += border + '\n';

    // Totals
    const locale = 'es-CO';
    
    ticketText += formatTotalLine('Subtotal:', `$${ticketSubtotal.toLocaleString(locale, { minimumFractionDigits: 0 })}`, width) + '\n';
    if (iva19 > 0) ticketText += formatTotalLine('IVA 19%:', `$${iva19.toLocaleString(locale, { minimumFractionDigits: 0 })}`, width) + '\n';
    if (iva5 > 0) ticketText += formatTotalLine('IVA 5%:', `$${iva5.toLocaleString(locale, { minimumFractionDigits: 0 })}`, width) + '\n';
    if (ipoc > 0) ticketText += formatTotalLine('IPOC 8%:', `$${ipoc.toLocaleString(locale, { minimumFractionDigits: 0 })}`, width) + '\n';
    if (impSaludable > 0) ticketText += formatTotalLine('Imp.Saludable:', `$${impSaludable.toLocaleString(locale, { minimumFractionDigits: 0 })}`, width) + '\n';
    if (iva19 === 0 && iva5 === 0 && ipoc === 0 && impSaludable === 0 && ticketImpuestos > 0) {
        ticketText += formatTotalLine('IVA:', `$${ticketImpuestos.toLocaleString(locale, { minimumFractionDigits: 0 })}`, width) + '\n';
    }
    
    ticketText += formatTotalLine('TOTAL:', `$${ticketTotal.toLocaleString(locale, { minimumFractionDigits: 0 })}`, width) + '\n';

    ticketText += border + '\n';
    
    ticketText += border + '\n';
    if (medioPago) ticketText += centerText(`Medio de Pago: ${medioPago}`, width) + '\n';
    ticketText += centerText('SISTEMA POS ELECTRÓNICO DIAN 2026', width) + '\n';
    const resolucion = settings.resolucionDIAN || 'Sin resolución registrada';
    ticketText += centerText(`Resol. ${resolucion}`, width) + '\n';
    ticketText += centerText('No aplica Retenciones en POS', width) + '\n';
    if (cudeLocal) {
        ticketText += centerText(`CUDE: ${cudeLocal.substring(0, 20)}...`, width) + '\n';
    }
    
    ticketText += centerText('¡GRACIAS POR SU COMPRA!', width) + '\n';

    return (
        <div className="print-only text-black bg-white mx-auto w-max p-4">
            <pre className="font-mono text-[11px] whitespace-pre-wrap m-0 p-0 leading-tight">
                {ticketText}
            </pre>
        </div>
    );
}
