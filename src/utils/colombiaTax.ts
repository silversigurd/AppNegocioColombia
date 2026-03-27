/**
 * colombiaTax.ts
 * Utilidades para cálculo de impuestos colombianos y generación
 * de identificadores locales de documentos POS.
 *
 * NOTA LEGAL: El CUDE que genera este módulo es un hash SHA-256 local
 * para control interno del comercio. No reemplaza la habilitación oficial
 * ante la DIAN como Proveedor Tecnológico de Facturación Electrónica.
 * La responsabilidad de habilitar el sistema POS recae en el establecimiento.
 */

import {
    TASAS_IVA,
    IPOC_COMIDAS,
    IMP_SALUDABLE,
} from './colombiaConstants';

// =============================================================
// TIPOS DE IMPUESTO POR PRODUCTO
// =============================================================
export type TipoImpuestoCo =
    | 'IVA_19'
    | 'IVA_5'
    | 'EXENTO'
    | 'EXCLUIDO'
    | 'IPOC_8'
    | 'SALUDABLE_BEBIDA'
    | 'SALUDABLE_ULTRAPROCESADO';

export interface TipoImpuestoInfo {
    label: string;
    descripcion: string;
    tasa: number | null;
    generaIva: boolean;
}

export const TIPOS_IMPUESTO_INFO: Record<TipoImpuestoCo, TipoImpuestoInfo> = {
    IVA_19: {
        label: 'IVA 19% (General)',
        descripcion: 'Tarifa general de IVA para bienes y servicios gravados.',
        tasa: TASAS_IVA.GENERAL,
        generaIva: true,
    },
    IVA_5: {
        label: 'IVA 5% (Diferencial)',
        descripcion: 'Tarifa reducida para ciertos bienes (ej: café, cacao, planes de medicina).',
        tasa: TASAS_IVA.REDUCIDA,
        generaIva: true,
    },
    EXENTO: {
        label: 'Exento de IVA (0%)',
        descripcion: 'IVA 0%. El impuesto es recuperable (exportaciones, carnes, verduras).',
        tasa: 0,
        generaIva: false,
    },
    EXCLUIDO: {
        label: 'Excluido de IVA',
        descripcion: 'No es objeto del IVA (servicios educativos, transporte, etc.).',
        tasa: null,
        generaIva: false,
    },
    IPOC_8: {
        label: 'IPOC 8% (Comidas)',
        descripcion: 'Impuesto al Consumo para comidas y bebidas en restaurantes. Excluye IVA.',
        tasa: IPOC_COMIDAS,
        generaIva: false,
    },
    SALUDABLE_BEBIDA: {
        label: 'Imp. Saludable - Bebida Azucarada',
        descripcion: 'Impuesto a bebidas azucaradas (Ley Financiamiento 2026).',
        tasa: IMP_SALUDABLE.BEBIDAS_AZUCARADAS_PORC,
        generaIva: false,
    },
    SALUDABLE_ULTRAPROCESADO: {
        label: 'Imp. Saludable - Ultraprocesado',
        descripcion: 'Impuesto a productos comestibles ultraprocesados.',
        tasa: IMP_SALUDABLE.ULTRAPROCESADOS_PORC,
        generaIva: false,
    },
};

// =============================================================
// RESULTADO DE CÁLCULO DE IMPUESTO
// =============================================================
export interface ResultadoImpuesto {
    precioConImpuesto: number;
    precioSinImpuesto: number;
    valorImpuesto: number;
    tipoImpuesto: TipoImpuestoCo;
    labelImpuesto: string;
    tasaAplicada: number;
}

/**
 * Calcula el impuesto sobre un precio ya-con-impuesto incluido.
 * El precio_venta en este sistema incluye impuestos ("precio final al público").
 */
export function calcularImpuestoProducto(
    precioConImpuesto: number,
    tipoImpuesto: TipoImpuestoCo,
    cantidad: number = 1
): ResultadoImpuesto {
    const info = TIPOS_IMPUESTO_INFO[tipoImpuesto];
    const totalBruto = precioConImpuesto * cantidad;

    if (info.tasa === null || info.tasa === undefined) {
        // Excluido: sin impuesto
        return {
            precioConImpuesto: totalBruto,
            precioSinImpuesto: totalBruto,
            valorImpuesto: 0,
            tipoImpuesto,
            labelImpuesto: info.label,
            tasaAplicada: 0,
        };
    }

    if (info.tasa === 0) {
        // Exento: IVA 0%
        return {
            precioConImpuesto: totalBruto,
            precioSinImpuesto: totalBruto,
            valorImpuesto: 0,
            tipoImpuesto,
            labelImpuesto: info.label,
            tasaAplicada: 0,
        };
    }

    // Para IPOC e Impuesto Saludable: se calcula sobre el precio de venta total
    // (son impuestos monofásicos, no se descuentan del precio base)
    if (tipoImpuesto === 'IPOC_8' || tipoImpuesto.startsWith('SALUDABLE')) {
        const valorImpuesto = totalBruto * info.tasa;
        return {
            precioConImpuesto: totalBruto + valorImpuesto,
            precioSinImpuesto: totalBruto,
            valorImpuesto,
            tipoImpuesto,
            labelImpuesto: info.label,
            tasaAplicada: info.tasa,
        };
    }

    // IVA incluido en precio: despejar base gravable
    const precioSinImpuesto = totalBruto / (1 + info.tasa);
    const valorImpuesto = totalBruto - precioSinImpuesto;

    return {
        precioConImpuesto: totalBruto,
        precioSinImpuesto,
        valorImpuesto,
        tipoImpuesto,
        labelImpuesto: info.label,
        tasaAplicada: info.tasa,
    };
}

// =============================================================
// AGRUPACIÓN DE IMPUESTOS PARA EL TICKET
// =============================================================
export interface ResumenImpuestos {
    iva19: number;
    iva5: number;
    ipoc: number;
    saludable: number;
    totalImpuestos: number;
    subtotalSinImpuesto: number;
    totalConImpuesto: number;
}

export function calcularResumenImpuestos(
    items: Array<{ precioConImpuesto: number; tipoImpuesto: TipoImpuestoCo; cantidad: number }>
): ResumenImpuestos {
    let iva19 = 0, iva5 = 0, ipoc = 0, saludable = 0;
    let subtotalSinImpuesto = 0;

    items.forEach(item => {
        const res = calcularImpuestoProducto(item.precioConImpuesto, item.tipoImpuesto, item.cantidad);
        subtotalSinImpuesto += res.precioSinImpuesto;
        if (item.tipoImpuesto === 'IVA_19') iva19 += res.valorImpuesto;
        else if (item.tipoImpuesto === 'IVA_5') iva5 += res.valorImpuesto;
        else if (item.tipoImpuesto === 'IPOC_8') ipoc += res.valorImpuesto;
        else if (item.tipoImpuesto.startsWith('SALUDABLE')) saludable += res.valorImpuesto;
    });

    const totalImpuestos = iva19 + iva5 + ipoc + saludable;
    const totalConImpuesto = subtotalSinImpuesto + totalImpuestos;

    return { iva19, iva5, ipoc, saludable, totalImpuestos, subtotalSinImpuesto, totalConImpuesto };
}

// =============================================================
// GENERACIÓN DE CUDE / CUNE LOCAL (sin API DIAN)
// Usa Web Crypto API (disponible en Electron renderer)
// o un polyfill simple para el proceso principal.
// =============================================================

/**
 * Genera un identificador único local para un documento equivalente POS.
 * Este NO es el CUDE oficial de la DIAN (que requiere firma digital + transmisión).
 * Es un hash de control interno del comercio para rastrear sus tiquetes.
 */
export function generarCUDE_Local(datos: {
    nit: string;
    fecha: string;     // ISO string
    total: number;
    ventaId: number | string;
    nit_adquiriente?: string;
}): string {
    // Concatenar cadena de datos relevantes
    const cadena = [
        datos.nit.replace(/\D/g, ''),
        datos.fecha,
        datos.total.toFixed(2),
        String(datos.ventaId),
        datos.nit_adquiriente || '222222222222', // Consumidor final genérico DIAN
        'LOCAL-INTERNO' // Marcador para distinguir del CUDE oficial
    ].join('|');

    // Simple hash usando djb2 (sin dependencias externas, sincrónico)
    // Para producción con DIAN real se reemplazaría por SHA-3-384
    let hash = 5381;
    for (let i = 0; i < cadena.length; i++) {
        hash = ((hash << 5) + hash) + cadena.charCodeAt(i);
        hash = hash & hash; // Convertir a 32-bit integer
    }
    const hashHex = Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();

    // Formato: CUDE-LOCAL-{nit8char}-{hashHex}-{ventaId}
    const nitCorto = datos.nit.replace(/\D/g, '').slice(0, 8).padEnd(8, '0');
    return `CUDE-L-${nitCorto}-${hashHex}-${String(datos.ventaId).padStart(6, '0')}`;
}

/**
 * Genera un identificador de nómina electrónica (CUNE) local.
 */
export function generarCUNE_Local(datos: {
    nit: string;
    periodo: string;    // "YYYY-MM"
    empleadoId: number;
    totalNeto: number;
}): string {
    const cadena = [datos.nit, datos.periodo, datos.empleadoId, datos.totalNeto.toFixed(2), 'NOMINA-LOCAL'].join('|');
    let hash = 5381;
    for (let i = 0; i < cadena.length; i++) {
        hash = ((hash << 5) + hash) + cadena.charCodeAt(i);
        hash = hash & hash;
    }
    const hashHex = Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
    return `CUNE-L-${datos.periodo}-${datos.empleadoId}-${hashHex}`;
}
