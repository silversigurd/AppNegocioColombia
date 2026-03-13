import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ipc } from '../utils/ipc';
import configJson from '../config.json';

interface BusinessSettings {
    businessName: string;
    businessCuit: string;
    businessAddress: string;
    tagline: string;
    printerProfile: string;
    logoPath: string | null;
    logoBase64: string | null;
    hrEmpresaSize: string;
    hrAplicaFondoCese: boolean;
    hrCctTope: number;
}

const defaultSettings: BusinessSettings = {
    businessName: configJson.businessName || 'Mi Comercio',
    businessCuit: configJson.businessCuit || '',
    businessAddress: configJson.businessAddress || '',
    tagline: configJson.tagline || '',
    printerProfile: configJson.printerProfile || '80mm',
    logoPath: null,
    logoBase64: null,
    hrEmpresaSize: 'pyme1',
    hrAplicaFondoCese: false,
    hrCctTope: 0,
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

            setSettings({
                businessName: dbSettings.businessName || defaultSettings.businessName,
                businessCuit: dbSettings.businessCuit || defaultSettings.businessCuit,
                businessAddress: dbSettings.businessAddress || defaultSettings.businessAddress,
                tagline: dbSettings.tagline || defaultSettings.tagline,
                printerProfile: dbSettings.printerProfile || defaultSettings.printerProfile,
                logoPath: dbSettings.logoPath || null,
                logoBase64,
                hrEmpresaSize: dbSettings.hrEmpresaSize || defaultSettings.hrEmpresaSize,
                hrAplicaFondoCese: dbSettings.hrAplicaFondoCese === 'true' || dbSettings.hrAplicaFondoCese === true,
                hrCctTope: Number(dbSettings.hrCctTope) || defaultSettings.hrCctTope,
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
