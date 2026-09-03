import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ipc } from '../utils/ipc';
import configJson from '../config.json';

interface BusinessSettings {
    pais: string;
    businessName: string;
    taxId: string; // Unified: NIT (CO)
    businessNit: string; // Colombia
    businessAddress: string;
    tagline: string;
    printerProfile: string;
    logoPath: string | null;
    logoBase64: string | null;
    hrEmpresaSize: string;
    hrAplicaFondoCese: boolean; // Argentina
    hrCctTope: number; // Argentina
    arcaCompliance2026: boolean; // Argentina
    dianCompliance2026: boolean; // Colombia — habilita emisión via MATIAS API
    // Colombia 2026 - Parámetros fiscales
    tieneCafeteria: boolean;       // Activa soporte IPOC 8% para sección de comidas
    esResponsableIVA: boolean;     // false = No Responsable de IVA (< 3.500 UVT ingresos)
    municipio: string;             // Municipio para cálculo de ICA
    tasaICA: number;               // Tasa ICA del municipio (ej: 11.04 = 11.04/1000)
    resolucionDIAN: string;        // Referencia interna (legacy)
    // MATIAS API — Facturación Electrónica DIAN
    dian_resolucion: string;       // Número de resolución DIAN (ej: 18764074347312)
    dian_prefijo: string;          // Prefijo de la factura (ej: SETP)
    dian_numero_actual: string;    // Número secuencial actual (ej: 1)
    dian_prefijo_nc: string;       // Prefijo de las notas crédito (ej: NCFE)
    dian_numero_nc_actual: string; // Número secuencial actual de notas crédito
    dian_ciudad_id: string;        // ID de ciudad MATIAS (Bogotá = 836)
    dian_email_consumidor: string; // Email para compradores anónimos
    dian_graphic_representation: boolean; // MATIAS genera el PDF (requiere logo cargado en su portal)
    dian_send_email: boolean;            // MATIAS envía la factura por email al cliente
}

const defaultSettings: BusinessSettings = {
    pais: 'Colombia',
    businessName: configJson.businessName || 'Mi Comercio',
    taxId: '',
    businessNit: '',
    businessAddress: configJson.businessAddress || '',
    tagline: configJson.tagline || '',
    printerProfile: configJson.printerProfile || '80mm',
    logoPath: null,
    logoBase64: null,
    hrEmpresaSize: 'pyme1',
    hrAplicaFondoCese: false,
    hrCctTope: 0,
    arcaCompliance2026: false,
    dianCompliance2026: true,
    // Colombia 2026 defaults
    tieneCafeteria: false,
    esResponsableIVA: true,
    municipio: 'Bogotá D.C.',
    tasaICA: 11.04,
    resolucionDIAN: '',
    // MATIAS API defaults
    dian_resolucion: '',
    dian_prefijo: '',
    dian_numero_actual: '1',
    dian_prefijo_nc: 'NCFE',
    dian_numero_nc_actual: '1',
    dian_ciudad_id: '836',
    dian_email_consumidor: '',
    dian_graphic_representation: false,
    dian_send_email: false,
};

interface SettingsContextType {
    settings: BusinessSettings;
    reloadSettings: () => Promise<void>;
    loaded: boolean; // true una vez que se leyó la config real de la DB (no los defaults)
}

const SettingsContext = createContext<SettingsContextType>({
    settings: defaultSettings,
    reloadSettings: async () => { },
    loaded: false,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
    const [loaded, setLoaded] = useState(false);

    const reloadSettings = async () => {
        try {
            const dbSettings = await ipc.invoke('get-settings');
            let logoBase64 = null;
            if (dbSettings.logoPath) {
                logoBase64 = await ipc.invoke('get-logo-base64', dbSettings.logoPath);
            }

            const parseBool = (val: any) => val === 'true' || val === true || val === 1 || val === '1';

            setSettings({
                pais: 'Colombia', // Forced for Colombia 2026 version
                businessName: dbSettings.businessName || defaultSettings.businessName,
                taxId: dbSettings.businessNit || '',
                businessNit: dbSettings.businessNit || '',
                businessAddress: dbSettings.businessAddress || defaultSettings.businessAddress,
                tagline: dbSettings.tagline || defaultSettings.tagline,
                printerProfile: dbSettings.printerProfile || defaultSettings.printerProfile,
                logoPath: dbSettings.logoPath || null,
                logoBase64,
                hrEmpresaSize: dbSettings.hrEmpresaSize || defaultSettings.hrEmpresaSize,
                hrAplicaFondoCese: parseBool(dbSettings.hrAplicaFondoCese),
                hrCctTope: Number(dbSettings.hrCctTope) || defaultSettings.hrCctTope,
                arcaCompliance2026: parseBool(dbSettings.arcaCompliance2026),
                dianCompliance2026: parseBool(dbSettings.dianCompliance2026 ?? true),
                // Colombia 2026
                tieneCafeteria: parseBool(dbSettings.tieneCafeteria),
                esResponsableIVA: parseBool(dbSettings.esResponsableIVA ?? true),
                municipio: dbSettings.municipio || defaultSettings.municipio,
                tasaICA: Number(dbSettings.tasaICA) || defaultSettings.tasaICA,
                resolucionDIAN: dbSettings.resolucionDIAN || '',
                // MATIAS API
                dian_resolucion: dbSettings.dian_resolucion || '',
                dian_prefijo: dbSettings.dian_prefijo || '',
                dian_numero_actual: dbSettings.dian_numero_actual || '1',
                dian_prefijo_nc: dbSettings.dian_prefijo_nc || 'NCFE',
                dian_numero_nc_actual: dbSettings.dian_numero_nc_actual || '1',
                dian_ciudad_id: dbSettings.dian_ciudad_id || '836',
                dian_email_consumidor: dbSettings.dian_email_consumidor || '',
                dian_graphic_representation: parseBool(dbSettings.dian_graphic_representation),
                dian_send_email: parseBool(dbSettings.dian_send_email),
            });
        } catch (e) {
            console.error('Failed to load settings from DB', e);
        } finally {
            setLoaded(true);
        }
    };

    useEffect(() => {
        reloadSettings();
    }, []);

    return (
        <SettingsContext.Provider value={{ settings, reloadSettings, loaded }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    return useContext(SettingsContext);
}
