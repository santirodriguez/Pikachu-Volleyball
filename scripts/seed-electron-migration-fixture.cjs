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

const { FIXTURE: fixture } = require('./electron-migration-fixture.cjs');

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
