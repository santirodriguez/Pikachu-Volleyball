'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { FIXTURE } = require('./electron-migration-fixture.cjs');

const tsvPath = process.argv[2];
const reportPath = process.argv[3];
const userData = process.argv[4] || null;
if (!tsvPath || !reportPath) {
  throw new Error(
    'usage: node scripts/write-electron-migration-fixture.cjs <fixture.tsv> <report.json> [user-data-dir]'
  );
}

for (const value of Object.values(FIXTURE)) {
  if (value.includes('\t') || value.includes('\n') || value.includes('\r')) {
    throw new Error('Fixture values must remain single-line TSV-safe strings.');
  }
}

fs.mkdirSync(path.dirname(tsvPath), { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(
  tsvPath,
  Object.entries(FIXTURE).map(([key, value]) => `${key}\t${value}`).join('\n') + '\n'
);
fs.writeFileSync(
  reportPath,
  `${JSON.stringify({ userData, fixture: FIXTURE, stored: FIXTURE }, null, 2)}\n`
);
