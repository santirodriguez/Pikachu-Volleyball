const path = require('path');
const { app, BrowserWindow, Menu, shell } = require('electron');

const APP_NAME = 'Pikachu Volleyball';
const FORK_SOURCE_URL = 'https://github.com/santirodriguez/pikachu-volleyball';
const SUPPORTED_LOCALES = ['en', 'ko', 'zh', 'es-ar'];

/** @type {BrowserWindow | null} */
let mainWindow = null;

function getLocaleFromURL(urlString) {
  try {
    const url = new URL(urlString);
    const locale = url.pathname.split('/').filter(Boolean).at(-2);
    return SUPPORTED_LOCALES.includes(locale) ? locale : 'en';
  } catch {
    return 'en';
  }
}

function loadLocale(locale) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const safeLocale = SUPPORTED_LOCALES.includes(locale) ? locale : 'en';
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', safeLocale, 'index.html'), {
    query: { desktop: '1' },
  });
}

function openAboutOverlay() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.executeJavaScript(
    "window.dispatchEvent(new CustomEvent('pv-desktop-open-about'));",
    true
  );
}

function isAllowedExternalUrl(urlString) {
  return urlString === FORK_SOURCE_URL;
}

function isLocalAppUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'file:';
  } catch {
    return false;
  }
}

function buildViewSubmenu() {
  const submenu = [{ role: 'togglefullscreen' }];

  if (!app.isPackaged) {
    submenu.push(
      { type: 'separator' },
      {
        label: 'Reload',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.reload();
          }
        },
      },
      {
        label: 'Force Reload',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.reloadIgnoringCache();
          }
        },
      },
      {
        label: 'Toggle Developer Tools',
        accelerator: 'F12',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.toggleDevTools();
          }
        },
      }
    );
  }

  return submenu;
}

function buildAppMenu() {
  const locale = mainWindow ? getLocaleFromURL(mainWindow.webContents.getURL()) : 'en';

  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about', label: `About ${APP_NAME}` },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Game',
      submenu: [
        {
          label: 'Restart Match',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) {
              return;
            }
            mainWindow.webContents.executeJavaScript(
              "document.getElementById('restart-btn')?.click();",
              true
            );
          },
        },
        {
          label: 'Pause / Resume',
          accelerator: 'Space',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) {
              return;
            }
            mainWindow.webContents.executeJavaScript(
              "document.getElementById('pause-btn')?.click();",
              true
            );
          },
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Language',
      submenu: [
        {
          label: 'English',
          type: 'radio',
          checked: locale === 'en',
          click: () => loadLocale('en'),
        },
        {
          label: '한국어',
          type: 'radio',
          checked: locale === 'ko',
          click: () => loadLocale('ko'),
        },
        {
          label: '中文',
          type: 'radio',
          checked: locale === 'zh',
          click: () => loadLocale('zh'),
        },
        {
          label: 'Español',
          type: 'radio',
          checked: locale === 'es-ar',
          click: () => loadLocale('es-ar'),
        },
      ],
    },
    {
      label: 'View',
      submenu: buildViewSubmenu(),
    },
    {
      role: 'help',
      submenu: [
        {
          label: `About ${APP_NAME}`,
          click: () => openAboutOverlay(),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: false,
    backgroundColor: '#101010',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  loadLocale('en');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isLocalAppUrl(url)) {
      return;
    }
    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.setTitle(APP_NAME);
    buildAppMenu();
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
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
