'use strict';

const fs = require('node:fs');

const reportPath = process.argv[2];
const inspectionPath = process.argv[3];
if (!reportPath || !inspectionPath) {
  throw new Error(
    'usage: node scripts/validate-electron-migration-fixture.cjs <seed-report.json> <inspection.json>'
  );
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const inspection = JSON.parse(fs.readFileSync(inspectionPath, 'utf8'));
const requiredKeys = [
  'pv-offline-graphic',
  'pv-offline-bgm',
  'pv-offline-sfx',
  'pv-offline-speed',
  'pv-offline-winningScore',
  'colorScheme',
  'pv-control-bindings-v1',
];

if (JSON.stringify(report.fixture) !== JSON.stringify(report.stored)) {
  throw new Error('Electron localStorage fixture did not round-trip exactly.');
}
if (inspection.levelDbDetected !== true) {
  throw new Error('Electron user-data did not expose a LevelDB localStorage directory.');
}

const candidateFiles = Array.isArray(inspection.candidateFiles)
  ? inspection.candidateFiles
  : [];
const observedKeys = new Set(candidateFiles.flatMap((file) => file.matches || []));
for (const key of requiredKeys) {
  if (!observedKeys.has(key)) {
    throw new Error(`Electron on-disk profile does not contain expected key: ${key}`);
  }
}

const levelDbCandidates = candidateFiles.filter((file) =>
  file.path.split(/[\\/]/).includes('leveldb')
);
if (levelDbCandidates.length === 0) {
  throw new Error('Expected preference keys were not observed inside LevelDB files.');
}

const result = {
  migration_storage_gate: 'PASS',
  requiredKeys,
  levelDbDetected: true,
  matchingLevelDbFiles: levelDbCandidates.map((file) => ({
    path: file.path,
    bytes: file.bytes,
    sha256: file.sha256,
    matches: file.matches,
  })),
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
