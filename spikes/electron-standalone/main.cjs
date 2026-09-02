'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  session,
  shell,
} = require('electron');
const { normalizeAllowedExternalUrl } = require('./external-link-policy.cjs');
const { runSmoke } = require('./smoke.cjs');

const APP_NAME = 'Pikachu Volleyball';
const DIST_ROOT = path.resolve(__dirname, 'dist');
const DIST_PREFIX = `${DIST_ROOT}${path.sep}`;
const SMOKE_PREFIX = '--pv-electron-smoke=';
const SMOKE_MODE =
  process.argv.find((argument) => argument.startsWith(SMOKE_PREFIX))?.slice(
    SMOKE_PREFIX.length
  ) || null;
const SUPPORTED_SMOKE_MODES = new Set([
  'write',
  'read',
  'keyboard',
  'window',
  'locales',
  'navigation',
  'external-links',
  'quit',
]);
const securityStats = {
  externalAllowed: 0,
  externalRejected: 0,
  externalLaunchSucceeded: 0,
  externalLaunchFailed: 0,
  navigationBlocked: 0,
  frameNavigationBlocked: 0,
  windowOpenDenied: 0,
};

if (SMOKE_MODE && !SUPPORTED_SMOKE_MODES.has(SMOKE_MODE)) {
  console.error(`Unsupported Electron smoke mode: ${SMOKE_MODE}`);
  process.exit(2);
}

app.enableSandbox();

/** @type {BrowserWindow | null} */
let mainWindow = null;
let smokeStarted = false;

function getSecurityStats() {
  return { ...securityStats };
}

function isTrustedLocalNavigation(urlString) {
  let targetPath;
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'file:') return false;
    targetPath = path.resolve(fileURLToPath(parsed));
  } catch {
    return false;
  }

  if (!targetPath.startsWith(DIST_PREFIX)) return false;
  if (path.extname(targetPath).toLowerCase() !== '.html') return false;
  return fs.existsSync(targetPath);
}

async function openExternalSafely(urlString) {
  const normalized = normalizeAllowedExternalUrl(urlString);
  if (!normalized) {
    securityStats.externalRejected += 1;
    return false;
  }

  securityStats.externalAllowed += 1;
  if (SMOKE_MODE) {
    console.error(`PV_ELECTRON_EXTERNAL_OPEN ${normalized}`);
  }
  try {
    await shell.openExternal(normalized);
    securityStats.externalLaunchSucceeded += 1;
    return true;
  } catch (error) {
    securityStats.externalLaunchFailed += 1;
    if (SMOKE_MODE) {
      console.error(
        `PV_ELECTRON_EXTERNAL_OPEN_FAILED ${String(error?.message || error)}`
      );
    }
    return false;
  }
}

function installApplicationMenu() {
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
    return;
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
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
    ])
  );
}

function installSessionSecurity() {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false)
  );
}

function loadEnglishApplication() {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve();
  return mainWindow.loadFile(path.join(DIST_ROOT, 'en', 'index.html'), {
    query: { desktop: '1' },
  });
}

function installNavigationPolicy(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    securityStats.windowOpenDenied += 1;
    void openExternalSafely(url);
    return { action: 'deny' };
  });

  const readNavigationUrl = (event, legacyUrl) =>
    typeof event?.url === 'string' ? event.url : legacyUrl;
  const readIsMainFrame = (event, legacyIsMainFrame) =>
    typeof event?.isMainFrame === 'boolean'
      ? event.isMainFrame
      : Boolean(legacyIsMainFrame);

  window.webContents.on(
    'will-frame-navigate',
    (event, legacyUrl, _legacyIsInPlace, legacyIsMainFrame) => {
      const url = readNavigationUrl(event, legacyUrl);
      if (isTrustedLocalNavigation(url)) return;
      event.preventDefault();
      securityStats.navigationBlocked += 1;
      securityStats.frameNavigationBlocked += 1;
      if (readIsMainFrame(event, legacyIsMainFrame)) {
        void openExternalSafely(url);
      }
    }
  );

  window.webContents.on('will-redirect', (event, legacyUrl) => {
    const url = readNavigationUrl(event, legacyUrl);
    if (isTrustedLocalNavigation(url)) return;
    event.preventDefault();
    securityStats.navigationBlocked += 1;
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
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
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      devTools: !app.isPackaged,
      safeDialogs: true,
      navigateOnDragDrop: false,
    },
  });

  if (app.isPackaged) mainWindow.setMenuBarVisibility(false);
  installNavigationPolicy(mainWindow);

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setTitle(APP_NAME);
    if (!SMOKE_MODE || smokeStarted) return;
    smokeStarted = true;
    runSmoke({
      mode: SMOKE_MODE,
      mainWindow,
      app,
      distRoot: DIST_ROOT,
      getSecurityStats,
    });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (!SMOKE_MODE) return;
    console.error(`PV_ELECTRON_RENDERER_GONE ${JSON.stringify(details)}`);
    app.exit(1);
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void loadEnglishApplication();
}

ipcMain.handle('pv:quit', (event) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (event.sender !== mainWindow.webContents) return false;
  app.quit();
  return true;
});

app.whenReady().then(() => {
  installApplicationMenu();
  installSessionSecurity();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
