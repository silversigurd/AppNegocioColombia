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
    medio_pago?: string;
    ventaData?: any;
    onClose?: () => void;
}

export default function Ticket({
    id, fecha, items, total, subtotal, impuestos,
    cliente_identificacion, vendedor, medio_pago, ventaData
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
    const cufe = ventaData?.cude_local;
    const dianQrBase64 = ventaData?.dian_qr_base64;
    const dianQrUrl = ventaData?.dian_qr_dian_url;
    const dianNumero = ventaData?.dian_numero_factura;
    const dianPrefijo = ventaData?.dian_prefijo;
    const dianPendiente = ventaData?.dian_pendiente;
    const medioPagoRaw = ventaData?.medio_pago || ventaData?.medioPago || medio_pago || 'EFECTIVO';
    const iva19 = ventaData?.iva_19 ?? 0;
    const iva5 = ventaData?.iva_5 ?? 0;
    const ipoc = ventaData?.ipoc ?? 0;
    const impSaludable = ventaData?.imp_saludable ?? 0;

    const medioPagoMap: Record<string, string> = {
        'EFECTIVO': 'EFECTIVO',
        'TARJETA_CREDITO': 'TARJETA DE CRÉDITO',
        'TARJETA_DEBITO': 'TARJETA DE DÉBITO',
        'TRANSFERENCIA': 'TRANSFERENCIA',
        'APPS': 'BILLETERA VIRTUAL'
    };
    const medioPago = medioPagoMap[String(medioPagoRaw).toUpperCase()] || medioPagoRaw;

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

        const priceText = `$${Math.round(sub).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        ticketText += formatItemLine(qty, name, priceText, width) + '\n';
    });

    ticketText += border + '\n';

    // Totals
    const formatCOP = (val: number) => `$${Math.round(val).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    
    ticketText += formatTotalLine('Subtotal:', formatCOP(ticketSubtotal), width) + '\n';
    if (iva19 > 0) ticketText += formatTotalLine('IVA 19%:', formatCOP(iva19), width) + '\n';
    if (iva5 > 0) ticketText += formatTotalLine('IVA 5%:', formatCOP(iva5), width) + '\n';
    if (ipoc > 0) ticketText += formatTotalLine('IPOC 8%:', formatCOP(ipoc), width) + '\n';
    if (impSaludable > 0) ticketText += formatTotalLine('Imp.Saludable:', formatCOP(impSaludable), width) + '\n';
    if (iva19 === 0 && iva5 === 0 && ipoc === 0 && impSaludable === 0 && ticketImpuestos > 0) {
        ticketText += formatTotalLine('IVA:', formatCOP(ticketImpuestos), width) + '\n';
    }
    
    ticketText += formatTotalLine('TOTAL:', formatCOP(ticketTotal), width) + '\n';

    ticketText += border + '\n';
    
    if (medioPago) {
        ticketText += centerText(`MÉTODO DE PAGO: ${medioPago}`, width) + '\n';
        ticketText += border + '\n';
    }

    if (settings.dianCompliance2026) {
        ticketText += centerText('FACTURA ELECTRÓNICA DE VENTA', width) + '\n';
        const resolucion = settings.dian_resolucion || settings.resolucionDIAN || 'Sin resolución registrada';
        ticketText += centerText(`Resolución DIAN N° ${resolucion}`, width) + '\n';
        if (dianPrefijo && dianNumero) {
            ticketText += centerText(`Factura: ${dianPrefijo}${dianNumero}`, width) + '\n';
        }
        if (cufe) {
            ticketText += centerText('CUFE:', width) + '\n';
            const c = String(cufe);
            for (let i = 0; i < c.length; i += width) ticketText += c.slice(i, i + width) + '\n';
        } else if (dianPendiente) {
            ticketText += centerText('Factura electrónica EN TRÁMITE ante la DIAN.', width) + '\n';
            ticketText += centerText('Se envía cuando se restablezca la conexión.', width) + '\n';
        }
        ticketText += border + '\n';
    }

    ticketText += centerText('¡GRACIAS POR SU COMPRA!', width) + '\n';

    const showQr = settings.dianCompliance2026 && cufe && (dianQrBase64 || dianQrUrl);

    return (
        // El CSS de impresión fuerza `.print-only { width: 100vw }`, así que la
        // caja del ticket ocupa toda la hoja. El wrapper interno `w-max mx-auto`
        // NO es .print-only, mantiene el ancho real del ticket (el de la línea
        // más larga, ej. el CUFE) y lo centra en la hoja. Así el <pre> y el QR
        // comparten la misma caja y el QR queda centrado justo debajo del texto
        // (antes el QR se centraba respecto de los 100vw → aparecía a la derecha).
        <div className="print-only text-black bg-white p-4">
            <div className="w-max mx-auto">
                <pre className="font-mono text-[11px] whitespace-pre-wrap m-0 p-0 leading-tight">
                    {ticketText}
                </pre>
                {showQr && (
                    <div className="flex flex-col items-center mt-1 font-mono text-[9px] leading-tight">
                        {dianQrBase64
                            ? <img src={dianQrBase64} alt="QR DIAN" className="w-32 h-32" />
                            : <img src={dianQrUrl} alt="QR DIAN" className="w-32 h-32" />}
                        <span className="mt-1">Verifique esta factura en:</span>
                        <span className="break-all text-center">catalogo-vpfe.dian.gov.co</span>
                    </div>
                )}
            </div>
        </div>
    );
}
