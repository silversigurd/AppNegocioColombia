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
    impuestos_internos?: number;
    cliente_identificacion?: string;
    regimen_transparencia?: boolean;
    vendedor?: string;
    ventaData?: any;
    onClose?: () => void;
}

export default function Ticket({
    id, fecha, items, total, subtotal, impuestos,
    impuestos_internos, cliente_identificacion, regimen_transparencia,
    vendedor, ventaData
}: TicketProps) {
    // Read live settings from DB instead of static config.json
    const { settings } = useSettings();

    const ticketId = ventaData?.id ?? id;
    const ticketFecha = ventaData?.fecha ?? fecha;
    const ticketItems = (ventaData?.items ?? items) || [];
    const ticketTotal = ventaData?.total ?? total ?? 0;
    const ticketSubtotal = ventaData?.subtotal ?? subtotal ?? 0;
    const ticketImpuestos = ventaData?.impuestos ?? impuestos ?? 0;
    const ticketInternos = ventaData?.impuestos_internos ?? impuestos_internos ?? 0;
    const ticketCliente = ventaData?.cliente_identificacion ?? cliente_identificacion;
    const isTransparente = ventaData?.regimen_transparencia ?? regimen_transparencia ?? false;
    const ticketVendedor = ventaData?.vendedor ?? vendedor;

    const width = getProfileWidth(settings.printerProfile || '80mm');
    const border = divider(width, '-');

    let ticketText = '';

    // Header logic
    ticketText += centerText(settings.businessName || '', width) + '\n';
    if (settings.pais === 'Colombia' && settings.taxId) {
        ticketText += centerText(`NIT: ${settings.taxId}`, width) + '\n';
    } else if (settings.businessCuit) {
        ticketText += centerText(`CUIT: ${settings.businessCuit}`, width) + '\n';
    }
    
    if (settings.businessAddress) ticketText += centerText(settings.businessAddress, width) + '\n';
    ticketText += centerText(settings.tagline || '', width) + '\n';

    ticketText += border + '\n';
    ticketText += centerText(settings.pais === 'Colombia' ? 'FACTURA DE VENTA POS' : `TICKET DE VENTA #${ticketId}`, width) + '\n';
    if (settings.pais === 'Colombia') {
        ticketText += centerText(`N°: ${ticketId}`, width) + '\n';
    }
    
    if (ticketFecha) {
        const locale = settings.pais === 'Colombia' ? 'es-CO' : 'es-AR';
        ticketText += centerText(new Date(ticketFecha).toLocaleString(locale), width) + '\n';
    }
    
    if (ticketCliente) {
        const label = settings.pais === 'Colombia' ? 'ADQUIRIENTE' : 'CLIENTE';
        ticketText += centerText(`${label}: ${ticketCliente}`, width) + '\n';
    }
    
    if (ticketVendedor) ticketText += centerText(`Vendedor: ${ticketVendedor}`, width) + '\n';
    ticketText += border + '\n';

    // Items
    ticketItems.forEach((item: any) => {
        const name = item.producto_nombre || item.nombre || 'Articulo';
        const qty = item.cantidad || item.quantity || 1;
        const sub = item.subtotal || (item.precio_venta * qty);

        const locale = settings.pais === 'Colombia' ? 'es-CO' : 'es-AR';
        const priceText = `$${sub?.toLocaleString(locale, { minimumFractionDigits: 0 })}`;
        ticketText += formatItemLine(qty, name, priceText, width) + '\n';
    });

    ticketText += border + '\n';

    // Totals
    const locale = settings.pais === 'Colombia' ? 'es-CO' : 'es-AR';
    
    if (settings.pais === 'Colombia') {
        ticketText += formatTotalLine('Subtotal:', `$${ticketSubtotal.toLocaleString(locale, { minimumFractionDigits: 0 })}`, width) + '\n';
        ticketText += formatTotalLine('IVA (19%):', `$${ticketImpuestos.toLocaleString(locale, { minimumFractionDigits: 0 })}`, width) + '\n';
    } else if (settings.arcaCompliance2026 || isTransparente) {
        ticketText += formatTotalLine('Neto Gravado:', `$${ticketSubtotal.toLocaleString(locale)}`, width) + '\n';
        ticketText += formatTotalLine('IVA:', `$${ticketImpuestos.toLocaleString(locale)}`, width) + '\n';
        if (ticketInternos > 0) {
            ticketText += formatTotalLine('Imp. Internos:', `$${ticketInternos.toLocaleString(locale)}`, width) + '\n';
        }
    } else {
        ticketText += formatTotalLine('Subtotal:', `$${ticketSubtotal.toLocaleString(locale)}`, width) + '\n';
        ticketText += formatTotalLine('Impuestos:', `$${ticketImpuestos.toLocaleString(locale)}`, width) + '\n';
    }
    
    ticketText += formatTotalLine('TOTAL:', `$${ticketTotal.toLocaleString(locale, { minimumFractionDigits: 0 })}`, width) + '\n';

    ticketText += border + '\n';
    
    if (settings.pais === 'Colombia') {
        ticketText += centerText('SISTEMA POS ELECTRÓNICO DIAN 2026', width) + '\n';
        ticketText += centerText('Resolución habilitación N° 123456...', width) + '\n';
        ticketText += centerText('No aplica Retenciones en POS', width) + '\n';
    } else if (settings.arcaCompliance2026 || isTransparente) {
        ticketText += centerText('Régimen de Transparencia Fiscal', width) + '\n';
        ticketText += centerText('Ley 27.743 - ARCA', width) + '\n';
    } else {
        ticketText += centerText('No valido como factura', width) + '\n';
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
