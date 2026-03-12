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
    vendedor?: string;
    ventaData?: any; // Full venta object containing the above fields
    onClose?: () => void;
}

export default function Ticket({ id, fecha, items, total, subtotal, impuestos, vendedor, ventaData }: TicketProps) {
    // Read live settings from DB instead of static config.json
    const { settings } = useSettings();

    const ticketId = ventaData?.id ?? id;
    const ticketFecha = ventaData?.fecha ?? fecha;
    const ticketItems = (ventaData?.items ?? items) || [];
    const ticketTotal = ventaData?.total ?? total ?? 0;
    const ticketSubtotal = ventaData?.subtotal ?? subtotal ?? 0;
    const ticketImpuestos = ventaData?.impuestos ?? impuestos ?? 0;
    const ticketVendedor = ventaData?.vendedor ?? vendedor;

    const width = getProfileWidth(settings.printerProfile || '80mm');
    const border = divider(width, '-');

    let ticketText = '';

    // Header — uses DB settings, not the static config.json
    ticketText += centerText(settings.businessName || '', width) + '\n';
    if (settings.businessCuit) ticketText += centerText(`CUIT: ${settings.businessCuit}`, width) + '\n';
    if (settings.businessAddress) ticketText += centerText(settings.businessAddress, width) + '\n';
    ticketText += centerText(settings.tagline || '', width) + '\n';

    ticketText += border + '\n';
    ticketText += centerText(`TICKET DE VENTA #${ticketId}`, width) + '\n';
    if (ticketFecha) ticketText += centerText(new Date(ticketFecha).toLocaleString('es-AR'), width) + '\n';
    if (ticketVendedor) ticketText += centerText(`Atendido por: ${ticketVendedor}`, width) + '\n';
    ticketText += border + '\n';

    // Items
    ticketItems.forEach((item: any) => {
        const name = item.producto_nombre || item.nombre || 'Articulo';
        const qty = item.cantidad || item.quantity || 1;
        const sub = item.subtotal || (item.precio_venta * qty);

        const priceText = `$${sub?.toLocaleString('es-AR')}`;
        ticketText += formatItemLine(qty, name, priceText, width) + '\n';
    });

    ticketText += border + '\n';

    // Totals
    ticketText += formatTotalLine('Subtotal:', `$${ticketSubtotal.toLocaleString('es-AR')}`, width) + '\n';
    ticketText += formatTotalLine('IVA/Impuestos:', `$${ticketImpuestos.toLocaleString('es-AR')}`, width) + '\n';
    ticketText += formatTotalLine('TOTAL:', `$${ticketTotal.toLocaleString('es-AR')}`, width) + '\n';

    ticketText += border + '\n';
    ticketText += centerText('No valido como factura', width) + '\n';
    ticketText += centerText('¡GRACIAS POR SU COMPRA!', width) + '\n';

    return (
        <div className="print-only text-black bg-white mx-auto w-max p-4">
            <pre className="font-mono text-[11px] whitespace-pre-wrap m-0 p-0 leading-tight">
                {ticketText}
            </pre>
        </div>
    );
}
