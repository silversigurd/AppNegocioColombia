/**
 * colombiaConstants.ts
 * Constantes regulatorias oficiales de Colombia para el ciclo 2026.
 * Fuentes: Decretos 1469 y 1470 de 2025, Resolución DIAN 238 de 2025.
 * NOTA: Este sistema opera de forma totalmente local (sin API DIAN).
 *       La habilitación ante la DIAN como operador POS electrónico es
 *       responsabilidad del establecimiento comercial, no del software.
 */

// =============================================================
// UNIDAD DE VALOR TRIBUTARIO (UVT) 2026
// Resolución DIAN 238 de 2025
// =============================================================
export const UVT_2026 = 52374; // COP

// =============================================================
// SALARIO MÍNIMO Y AUXILIO DE TRANSPORTE 2026
// Decretos 1469 y 1470 de 2025
// =============================================================
export const SMMLV_2026 = 1_750_905; // COP/mes
export const AUX_TRANSPORTE_2026 = 249_095; // COP/mes
export const AUX_CONECTIVIDAD_2026 = 249_095; // Teletrabajo - mismo valor
export const INGRESO_MINIMO_TOTAL_2026 = SMMLV_2026 + AUX_TRANSPORTE_2026; // $2.000.000
export const SMMLV_DIARIO_2026 = Math.round(SMMLV_2026 / 30); // $58.363/día
export const SALARIO_INTEGRAL_MINIMO_2026 = SMMLV_2026 * 13; // 13 SMMLV

// Umbral de 2 SMMLV para Auxilio de Transporte
export const TOPE_AUX_TRANSPORTE = SMMLV_2026 * 2; // $3.501.810

// =============================================================
// JORNADA LABORAL - LEY 2101 DE 2021
// Transición efectiva el 16 de julio de 2026 (42h/semana)
// =============================================================
export const FECHA_TRANSICION_JORNADA = new Date('2026-07-16');
export const DIVISOR_HORAS_44 = 220;   // Hasta 15/07/2026 (44h/semana)
export const DIVISOR_HORAS_42 = 210;   // Desde 16/07/2026 (42h/semana)

/**
 * Retorna el divisor de horas correcto según la fecha de liquidación.
 * @param fechaLiquidacion - La fecha del período de liquidación
 */
export function getDivisorHoras(fechaLiquidacion: Date = new Date()): number {
    return fechaLiquidacion >= FECHA_TRANSICION_JORNADA ? DIVISOR_HORAS_42 : DIVISOR_HORAS_44;
}

/**
 * Retorna el valor de la hora ordinaria según el salario y la fecha.
 */
export function getValorHoraOrdinaria(salarioBasico: number, fechaLiquidacion: Date = new Date()): number {
    const divisor = getDivisorHoras(fechaLiquidacion);
    return salarioBasico / divisor;
}

// =============================================================
// TABLA DE RECARGOS - REFORMA LABORAL 2026
// Vigente desde julio 2026:
// - Jornada nocturna inicia a las 7:00 PM (antes 9:00 PM)
// - Recargo dominical en progresión al 100%
// =============================================================
export const RECARGOS_2026 = {
    NOCTURNO: 0.35,                    // 35% sobre hora ordinaria
    HORA_EXTRA_DIURNA: 0.25,           // 25% adicional (paga 1.25x)
    HORA_EXTRA_NOCTURNA: 0.75,         // 75% adicional (paga 1.75x)
    DOMINICAL_ORDINARIO: 0.90,         // 90% adicional (paga 1.90x) — progresivo a 100%
    HORA_EXTRA_DIURNA_DOMINICAL: 1.15, // 115% adicional (paga 2.15x)
    HORA_EXTRA_NOCTURNA_DOMINICAL: 1.65, // 165% adicional (paga 2.65x)
} as const;

// Inicio de la jornada nocturna (07:00 PM = 19:00h) — Reforma 2026
export const INICIO_JORNADA_NOCTURNA_HORA = 19; // 7:00 PM

// =============================================================
// SEGURIDAD SOCIAL Y PARAFISCALES 2026
// =============================================================
export const APORTES_EMPLEADOR_2026 = {
    SALUD: 0.085,           // 8.5%
    PENSION: 0.12,          // 12%
    ARL_NIVEL_1: 0.00522,   // 0.522% (Comercio - Nivel I)
    ARL_NIVEL_2: 0.01044,   // 1.044% (Nivel II)
    ARL_NIVEL_3: 0.02436,   // 2.436% (Nivel III)
    ARL_NIVEL_4: 0.04350,   // 4.350% (Nivel IV)
    ARL_NIVEL_5: 0.06960,   // 6.960% (Nivel V)
    CAJA_COMPENSACION: 0.04, // 4%
    // SENA e ICBF: exonerados para trabajadores < 10 SMMLV
};

export const APORTES_EMPLEADO_2026 = {
    SALUD: 0.04,    // 4%
    PENSION: 0.04,  // 4%
};

// Exoneración empleador: aplica para trabajadores que devenguen < 10 SMMLV
export const TOPE_EXONERACION_EMPLEADOR = SMMLV_2026 * 10;

// =============================================================
// PRESTACIONES SOCIALES 2026
// =============================================================
export const PRESTACIONES = {
    PRIMA_SERVICIOS: 1 / 12,     // 1 mes de salario por año (pago semestral)
    CESANTIAS: 1 / 12,           // 1 mes de salario por año
    INT_CESANTIAS: 0.12,         // 12% anual sobre cesantías
    VACACIONES: 15 / 360,        // 15 días hábiles por año (divisor 360 según CST)
};

// =============================================================
// UMBRALES FISCALES EN UVT (2026)
// =============================================================
export const UMBRALES_UVT = {
    RESPONSABLE_IVA: 3500,        // Ingresos anuales que obligan a responsable de IVA
    IDENTIFICACION_COMPRADOR: 100, // Ventas que requieren identificación del comprador ($5.237.000)
    DEDUCIBLE_EFECTIVO: 100,       // Límite de pagos en efectivo deducibles por transacción
    MIN_SANCION_DIAN: 10,          // Sanción mínima DIAN (10 UVT)
};

/** Convierte UVTs a pesos COP según UVT 2026 */
export function uvtAPesos(uvt: number): number {
    return uvt * UVT_2026;
}

/** Convierte pesos COP a UVTs */
export function pesosAUvt(pesos: number): number {
    return pesos / UVT_2026;
}

// Umbral absoluto en pesos para identificación de comprador (100 UVT)
export const LIMITE_IDENTIFICACION_COMPRADOR_COP = uvtAPesos(UMBRALES_UVT.IDENTIFICACION_COMPRADOR); // $5.237.000

// =============================================================
// IVA Y OTROS IMPUESTOS
// =============================================================
export const TASAS_IVA = {
    GENERAL: 0.19,      // Tarifa general
    REDUCIDA: 0.05,     // Tarifa diferencial (algunos alimentos procesados, etc.)
    EXENTO: 0,          // Bienes exentos (exportaciones) — IVA 0% recuperable
    EXCLUIDO: null,     // Bienes excluidos — no son objeto de IVA
};

// Impuesto Nacional al Consumo (IPOC) - Excluyente con IVA en comidas
export const IPOC_COMIDAS = 0.08; // 8% para comidas preparadas en restaurantes/cafeterías

// Impuestos Saludables (Ley de Financiamiento)
export const IMP_SALUDABLE = {
    BEBIDAS_AZUCARADAS_PORC: 0.20,      // 20% del precio de venta (aproximado 2026)
    ULTRAPROCESADOS_PORC: 0.10,         // 10% del precio de venta (aproximado 2026)
};

// ICA por municipio (tarifa en por mil, ej: 11.04 = 11.04/1000)
export const ICA_POR_MUNICIPIO: Record<string, number> = {
    'Bogotá D.C.': 11.04,
    'Medellín': 9.68,
    'Cali': 11.04,
    'Barranquilla': 8.00,
    'Bucaramanga': 9.68,
    'Cartagena': 7.00,
    'Manizales': 9.68,
    'Pereira': 9.68,
    'Santa Marta': 7.00,
    'Otro': 9.68,
};

// ReteFuente estimada para declarantes (solo informativo en flujo de caja)
export const RETE_FUENTE_ESTIMADA = 0.025; // 2.5%

// =============================================================
// INDEMNIZACIONES POR DESPIDO INJUSTO — LEY 2466 DE 2025 (Art. 64 CST reformado)
// Vigente para contratos terminados desde julio de 2025
//
// Salarios INFERIOR a 10 SMLMV ($17.509.050):
//   - Menos de 1 año:      35 días de salario
//   - 1 año a < 5 años:    35 días + 15 días × (años_subsiguientes)
//   - 5 años a < 10 años:  35 días + 30 días × (años_subsiguientes)
//   - 10 años o más:       35 días + 60 días × (años_subsiguientes)
//
// Salarios IGUAL O SUPERIOR a 10 SMLMV:
//   - Primer año:          20 días
//   - Años siguientes:     15 días × (años_subsiguientes)
//
// Contratos término FIJO o OBRA: salarios pendientes, mínimo 45 días
// =============================================================
export const TOPE_INDEM_BAJO = SMMLV_2026 * 10;   // $17.509.050
export const INDEM_BAJO_PRIMER_ANO = 35;            // días (subió de 30 a 35 — Ley 2466)
export const INDEM_BAJO_1A5 = 15;                   // días por año subsiguiente (tramo 1–4 años extra)
export const INDEM_BAJO_5A10 = 30;                  // días por año subsiguiente (tramo 5–9 años extra)
export const INDEM_BAJO_MAS10 = 60;                 // días por año subsiguiente (10+ años extra)
export const INDEM_ALTO_PRIMER_ANO = 20;            // días (sin cambio)
export const INDEM_ALTO_SIGUIENTES = 15;            // días por año adicional (sin cambio)

// Piso mínimo para contratos a término fijo y obra (Ley 2466/2025)
export const INDEM_FIJO_MIN_DIAS = 45;

// Periodo de prueba (Art. 78 CST) — 2 meses para contratos indefinidos
export const PERIODO_PRUEBA_MESES = 2;
