// Utility to handle IPC calls easily
const { ipcRenderer } = window.require('electron');

export const invoke = async (channel: string, ...args: any[]) => {
    try {
        return await ipcRenderer.invoke(channel, ...args);
    } catch (error) {
        console.error(`Error invoking IPC channel ${channel}:`, error);
        throw error;
    }
};

export const ipc = {
    invoke,
    // Add other methods if needed (on, send, etc.)
};
