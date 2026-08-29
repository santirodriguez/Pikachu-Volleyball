const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');

const APP_NAME = 'Pikachu Volleyball';
const STARTUP_METRICS_FILE = process.env.PV_STARTUP_METRICS_FILE || null;
const PROCESS_STARTED_AT_MS = Date.now() - process.uptime() * 1000;
const startupMarks = {
  'pv-electron-process-start': 0,
};
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

function markStartup(name) {
  startupMarks[name] = Number((Date.now() - PROCESS_STARTED_AT_MS).toFixed(2));
}

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

async function getRendererMarks() {
  if (!mainWindow || mainWindow.isDestroyed()) return {};
  return mainWindow.webContents.executeJavaScript(`
    Object.fromEntries(
      performance.getEntriesByType('mark')
        .filter((entry) => entry.name.startsWith('pv-'))
        .map((entry) => [entry.name, Number(entry.startTime.toFixed(2))])
    )
  `);
}

async function waitForRendererCondition(expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const matched = await mainWindow.webContents.executeJavaScript(
      `Boolean(${expression})`
    );
    if (matched) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

async function runStartupMeasurement() {
  if (!STARTUP_METRICS_FILE || !mainWindow || mainWindow.isDestroyed()) return;

  const hasFirstFrame = await waitForRendererCondition(
    `performance.getEntriesByName('pv-first-game-frame', 'mark').length`
  );
  if (!hasFirstFrame) throw new Error('Timed out waiting for first game frame');
  markStartup('pv-first-game-frame-observed');

  await mainWindow.webContents.executeJavaScript(`
    (() => {
      performance.mark('pv-menu-open-request');
      window.addEventListener('pv-pause-changed', function onPause(event) {
        if (event.detail?.paused === true) {
          performance.mark('pv-menu-paused');
          window.removeEventListener('pv-pause-changed', onPause);
        }
      });
    })()
  `);
  mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'P' });
  mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'P' });

  const menuUsable = await waitForRendererCondition(`
    (() => {
      const overlay = document.getElementById('pv-menu-overlay');
      const active = document.activeElement;
      return overlay && !overlay.hidden && active && overlay.contains(active);
    })()
  `);
  if (!menuUsable) throw new Error('Timed out waiting for first menu open');
  await mainWindow.webContents.executeJavaScript(
    `performance.mark('pv-menu-usable')`
  );
  markStartup('pv-first-menu-observed');

  const rendererMarks = await getRendererMarks();
  const bootstrapOffset = startupMarks['pv-did-finish-load'] - (rendererMarks['pv-bootstrap-start'] || 0);
  const report = {
    generatedAt: new Date().toISOString(),
    note: 'Fresh packaged process and temporary user-data directory; OS filesystem cache is not forcibly cleared.',
    mainProcessMarksMs: startupMarks,
    rendererMarks,
    endToEndMs: {
      processStartToFirstGameFrame: Number(
        (bootstrapOffset + rendererMarks['pv-first-game-frame']).toFixed(2)
      ),
      processStartToMenuUsable: Number(
        (bootstrapOffset + rendererMarks['pv-menu-usable']).toFixed(2)
      ),
    },
  };

  fs.mkdirSync(path.dirname(STARTUP_METRICS_FILE), { recursive: true });
  fs.writeFileSync(STARTUP_METRICS_FILE, `${JSON.stringify(report, null, 2)}\n`);
  app.quit();
}

function createMainWindow() {
  markStartup('pv-window-create-start');
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
  markStartup('pv-window-created');

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
    markStartup('pv-did-finish-load');
    mainWindow.setTitle(APP_NAME);
    runStartupMeasurement().catch((error) => {
      console.error('Startup measurement failed.', error);
      app.exit(1);
    });
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    markStartup('pv-ready-to-show');
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
  markStartup('pv-electron-app-ready');
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
