'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const ROOT = path.resolve(__dirname, '..');
const userData = process.env.PV_MIGRATION_USER_DATA;
const reportPath = process.env.PV_MIGRATION_REPORT;

if (!userData || !reportPath) {
  throw new Error('PV_MIGRATION_USER_DATA and PV_MIGRATION_REPORT are required');
}

const fixture = Object.freeze({
  'pv-offline-graphic': 'soft',
  'pv-offline-bgm': 'off',
  'pv-offline-sfx': 'mono',
  'pv-offline-speed': 'fast',
  'pv-offline-winningScore': '10',
  colorScheme: 'dark',
  'pv-control-bindings-v1': JSON.stringify({
    version: 1,
    bindings: {
      'p1.left': 'KeyA',
      'p1.right': 'KeyS',
      'p1.up': 'KeyW',
      'p1.down': 'KeyX',
      'p1.downRight': 'KeyC',
      'p1.powerPrimary': 'KeyQ',
      'p1.powerAlternate': 'ShiftRight',
      'p2.left': 'Numpad4',
      'p2.right': 'Numpad6',
      'p2.up': 'Numpad8',
      'p2.down': 'Numpad2',
      'p2.powerPrimary': 'Numpad0',
      'p2.powerAlternate': 'ControlRight'
    }
  })
});

app.setPath('userData', userData);

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  await window.loadFile(path.join(ROOT, 'dist', 'en', 'index.html'), {
    query: { desktop: '1' }
  });

  const serialized = JSON.stringify(fixture);
  const stored = await window.webContents.executeJavaScript(`
    (() => {
      const values = ${serialized};
      localStorage.clear();
      for (const [key, value] of Object.entries(values)) {
        localStorage.setItem(key, value);
      }
      return Object.fromEntries(
        Object.keys(values).map((key) => [key, localStorage.getItem(key)])
      );
    })()
  `);

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify({ userData, fixture, stored }, null, 2)}\n`
  );
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
