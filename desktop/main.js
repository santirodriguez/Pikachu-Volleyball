const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');

const APP_NAME = 'Pikachu Volleyball';
const STARTUP_METRICS_FILE = process.env.PV_STARTUP_METRICS_FILE || null;
const PERFORMANCE_METRICS_FILE =
  process.env.PV_PERFORMANCE_METRICS_FILE || null;
const STARTUP_USER_DATA_DIR = process.env.PV_STARTUP_USER_DATA_DIR || null;
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

if (STARTUP_USER_DATA_DIR) {
  app.setPath('userData', STARTUP_USER_DATA_DIR);
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function markStartup(name) {
  startupMarks[name] = Number((Date.now() - PROCESS_STARTED_AT_MS).toFixed(2));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const query = { desktop: '1' };
  if (PERFORMANCE_METRICS_FILE) {
    query.performanceDiagnostics = '1';
  }
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'en', 'index.html'), {
    query,
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

async function getPerformanceDiagnosticsSnapshot() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow.webContents.executeJavaScript(`
    window.__pvPerformanceDiagnostics?.snapshot?.() || null
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
    await delay(20);
  }
  return false;
}

async function pressKeyForFrame(keyCode, holdMs = 80) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode });
  await delay(holdMs);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  await delay(60);
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
  const report = {
    generatedAt: new Date().toISOString(),
    note: 'Fresh packaged process and temporary user-data directory; OS filesystem cache is not forcibly cleared. Main-process observation points include up to one 20 ms polling interval.',
    mainProcessMarksMs: startupMarks,
    rendererMarks,
    endToEndMs: {
      processStartToFirstGameFrame:
        startupMarks['pv-first-game-frame-observed'],
      processStartToMenuUsable: startupMarks['pv-first-menu-observed'],
    },
  };

  fs.mkdirSync(path.dirname(STARTUP_METRICS_FILE), { recursive: true });
  fs.writeFileSync(STARTUP_METRICS_FILE, `${JSON.stringify(report, null, 2)}\n`);
  app.quit();
}

async function runPerformanceMeasurement() {
  if (
    !PERFORMANCE_METRICS_FILE ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return;
  }

  const hasFirstFrame = await waitForRendererCondition(
    `performance.getEntriesByName('pv-first-game-frame', 'mark').length`
  );
  if (!hasFirstFrame) throw new Error('Timed out waiting for first game frame');
  markStartup('pv-first-game-frame-observed');

  const diagnosticsReady = await waitForRendererCondition(
    `window.__pvPerformanceDiagnostics?.ready === true`,
    3000
  );
  if (!diagnosticsReady) {
    throw new Error('Timed out waiting for renderer performance diagnostics');
  }

  await pressKeyForFrame('Z');
  const menuReady = await waitForRendererCondition(
    `window.__pvPerformanceDiagnostics?.currentState === 'menu'`,
    3000
  );
  if (!menuReady) throw new Error('Timed out waiting for game menu state');

  await pressKeyForFrame('Z');
  await pressKeyForFrame('Z');

  const roundReady = await waitForRendererCondition(
    `window.__pvPerformanceDiagnostics?.currentState === 'round'`,
    12000
  );
  if (!roundReady) throw new Error('Timed out waiting for active round state');
  markStartup('pv-round-observed');

  const baselineSnapshot = await getPerformanceDiagnosticsSnapshot();
  const baselineRoundSamples = baselineSnapshot?.roundSampleCount || 0;
  const enoughRoundSamples = await waitForRendererCondition(
    `window.__pvPerformanceDiagnostics?.roundSampleCount >= ${
      baselineRoundSamples + 100
    }`,
    20000
  );
  if (!enoughRoundSamples) {
    throw new Error('Timed out collecting active-round frame samples');
  }
  markStartup('pv-round-sample-complete');

  const rendererMarks = await getRendererMarks();
  const rendererDiagnostics = await getPerformanceDiagnosticsSnapshot();
  markStartup('pv-performance-report-write');
  const report = {
    generatedAt: new Date().toISOString(),
    note: 'Opt-in packaged diagnostic run. Gameplay rules and normal runtime behavior are unchanged. Main-process observation points include up to one 20 ms polling interval.',
    mainProcessMarksMs: startupMarks,
    rendererMarks,
    rendererDiagnostics,
    endToEndMs: {
      processStartToFirstGameFrame:
        startupMarks['pv-first-game-frame-observed'],
      processStartToRound: startupMarks['pv-round-observed'],
      processStartToSampleComplete:
        startupMarks['pv-round-sample-complete'],
      processStartToReportWrite:
        startupMarks['pv-performance-report-write'],
    },
  };

  fs.mkdirSync(path.dirname(PERFORMANCE_METRICS_FILE), { recursive: true });
  fs.writeFileSync(
    PERFORMANCE_METRICS_FILE,
    `${JSON.stringify(report, null, 2)}\n`
  );
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
    const measurement = PERFORMANCE_METRICS_FILE
      ? runPerformanceMeasurement()
      : runStartupMeasurement();
    measurement.catch((error) => {
      console.error('Packaged measurement failed.', error);
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
