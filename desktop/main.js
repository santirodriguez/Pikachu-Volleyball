const path = require('path');
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');

const APP_NAME = 'Pikachu Volleyball';
const ALLOWED_EXTERNAL_URLS = new Set([
  'https://github.com/santirodriguez/pikachu-volleyball',
  'https://github.com/gorisanson/pikachu-volleyball',
]);
const ALLOWED_WEBSITE_ORIGINS = new Set([
  'https://santiagorodriguez.com',
  'https://www.santiagorodriguez.com',
]);

/** @type {BrowserWindow | null} */
let mainWindow = null;

function isAllowedExternalUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (ALLOWED_WEBSITE_ORIGINS.has(url.origin)) return true;
    return ALLOWED_EXTERNAL_URLS.has(`${url.origin}${url.pathname}`);
  } catch {
    return false;
  }
}

function isLocalAppUrl(urlString) {
  try {
    return new URL(urlString).protocol === 'file:';
  } catch {
    return false;
  }
}

function installApplicationMenu() {
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
    return;
  }

  const developmentMenu = Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools', accelerator: 'F12' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]);
  Menu.setApplicationMenu(developmentMenu);
}

function loadEnglishApplication() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'en', 'index.html'), {
    query: { desktop: '1' },
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: app.isPackaged,
    backgroundColor: '#101010',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (app.isPackaged) {
    mainWindow.setMenuBarVisibility(false);
  }

  loadEnglishApplication();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isLocalAppUrl(url)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setTitle(APP_NAME);
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('pv:quit', () => {
  app.quit();
  return true;
});

app.whenReady().then(() => {
  installApplicationMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
