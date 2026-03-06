import * as XLSX from 'xlsx';

export const exportToExcel = (data: any[], fileName: string, sheetName: string = 'Sheet 1') => {
    // 1. Create a new workbook
    const workbook = XLSX.utils.book_new();

    // 2. Convert data to worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // 3. Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // 4. Save the file
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
};

export const exportVentasToExcel = (ventas: any[]) => {
    const formattedData = ventas.map(v => ({
        'ID Venta': v.id,
        'Fecha': v.fecha,
        'Total ($)': v.total,
        'Subtotal ($)': v.subtotal,
        'Impuestos ($)': v.impuestos,
        'ID Sucursal': v.sucursal_id
    }));
    exportToExcel(formattedData, 'Reporte_Ventas', 'Ventas');
};

export const exportInventarioToExcel = (inventario: any[]) => {
    const formattedData = inventario.map(i => ({
        'Código': i.codigo,
        'Producto': i.nombre,
        'Stock Actual': i.stock,
        'Precio Costo ($)': i.precio_compra,
        'Precio Venta ($)': i.precio_venta
    }));
    exportToExcel(formattedData, 'Reporte_Inventario', 'Stock');
};
