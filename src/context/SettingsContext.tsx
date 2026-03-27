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
    dianCompliance2026: boolean; // Colombia — DIAN POS interno (local)
    // Colombia 2026 - Nuevos campos
    tieneCafeteria: boolean;       // Activa soporte IPOC 8% para sección de comidas
    esResponsableIVA: boolean;     // false = No Responsable de IVA (< 3.500 UVT ingresos)
    municipio: string;             // Municipio para cálculo de ICA
    tasaICA: number;               // Tasa ICA del municipio (ej: 11.04 = 11.04/1000)
    resolucionDIAN: string;        // Número de resolución habilitación POS (referencia interna)
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
    dianCompliance2026: true, // Activo por defecto en Colombia
    // Colombia 2026 defaults
    tieneCafeteria: false,
    esResponsableIVA: true,
    municipio: 'Bogotá D.C.',
    tasaICA: 11.04,
    resolucionDIAN: '',
};

interface SettingsContextType {
    settings: BusinessSettings;
    reloadSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
    settings: defaultSettings,
    reloadSettings: async () => { },
});

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);

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
            });
        } catch (e) {
            console.error('Failed to load settings from DB', e);
        }
    };

    useEffect(() => {
        reloadSettings();
    }, []);

    return (
        <SettingsContext.Provider value={{ settings, reloadSettings }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    return useContext(SettingsContext);
}
