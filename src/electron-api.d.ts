export { };

declare global {
    interface Window {
        require: (module: 'electron') => {
            ipcRenderer: {
                invoke: (channel: string, ...args: any[]) => Promise<any>;
                on: (channel: string, func: (...args: any[]) => void) => void;
                send: (channel: string, ...args: any[]) => void;
            };
        };
    }
}
