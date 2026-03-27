import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ipc } from '../utils/ipc';
import configJson from '../config.json';

interface BusinessSettings {
    pais: string;
    businessName: string;
    taxId: string; // Unified: CUIT (AR) or NIT (CO)
    businessCuit: string; // Argentina (Legacy/Separate)
    businessNit: string; // Colombia (Legacy/Separate)
    businessAddress: string;
    tagline: string;
    printerProfile: string;
    logoPath: string | null;
    logoBase64: string | null;
    hrEmpresaSize: string;
    hrAplicaFondoCese: boolean; // Argentina
    hrCctTope: number; // Argentina
    arcaCompliance2026: boolean; // Argentina
    dianCompliance2026: boolean; // Colombia
}

const defaultSettings: BusinessSettings = {
    pais: 'Colombia',
    businessName: configJson.businessName || 'Mi Comercio',
    taxId: '',
    businessCuit: configJson.businessCuit || '',
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
    dianCompliance2026: false,
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
                pais: dbSettings.pais || 'Colombia',
                businessName: dbSettings.businessName || defaultSettings.businessName,
                taxId: dbSettings.pais === 'Colombia' ? (dbSettings.businessNit || '') : (dbSettings.businessCuit || ''),
                businessCuit: dbSettings.businessCuit || defaultSettings.businessCuit,
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
                dianCompliance2026: parseBool(dbSettings.dianCompliance2026),
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
