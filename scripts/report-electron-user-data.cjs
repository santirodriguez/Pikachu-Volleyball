'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const reportPath = process.env.PV_ELECTRON_PATH_REPORT;
if (!reportPath) {
  throw new Error('PV_ELECTRON_PATH_REPORT is required');
}

app.whenReady().then(() => {
  const report = {
    name: app.getName(),
    appData: app.getPath('appData'),
    userData: app.getPath('userData'),
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
