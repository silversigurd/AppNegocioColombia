const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { setupIpcHandlers } = require('./src/backend/ipcHandlers.cjs');

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simplicity in this local app. In a real-world secure app, use preload scripts.
    },
    // aesthetic options
    autoHideMenuBar: true,
  });

  if (isDev) {
    // In dev mode, load the Vite server URL
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Handle native printing request from renderer to avoid blocking main thread
  ipcMain.handle('print-current-page', async (event, options) => {
    return new Promise((resolve) => {
      event.sender.print(options || { silent: false, printBackground: true }, (success, failureReason) => {
        resolve({ success, failureReason });
      });
    });
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
