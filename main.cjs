require('dotenv').config();
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// ============================================================
// CRITICAL: Set the app name and userData path BEFORE importing
// any other module (especially db.cjs which reads app.getPath).
// This isolates the Colombia DB from the Argentina app which
// also uses Electron and would otherwise share %APPDATA%/my-desktop-app/
// ============================================================
app.setName('CommerceOS Pro Colombia');
// This sets: %APPDATA%\CommerceOS Pro Colombia\ on Windows
// argv/env overrides happen before setPath, so this is safe:
const colombiaUserDataPath = path.join(app.getPath('appData'), 'CommerceOS Pro Colombia');
app.setPath('userData', colombiaUserDataPath);

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

app.whenReady().then(async () => {
  await setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
