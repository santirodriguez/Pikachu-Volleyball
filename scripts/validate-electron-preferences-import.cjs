'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const settingsModule = require('../src/resources/js/settings_store.cjs');
const controlsModule = require('../src/resources/js/control_bindings.cjs');

const seedPath = process.argv[2];
const importedPath = process.argv[3];
if (!seedPath || !importedPath) {
  throw new Error(
    'usage: node scripts/validate-electron-preferences-import.cjs <seed-report.json> <imported.json>'
  );
}

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const imported = JSON.parse(fs.readFileSync(importedPath, 'utf8'));
assert.equal(imported.schema, 1);
assert.deepEqual(imported.values, seed.fixture);

const memory = new Map(Object.entries(imported.values));
const storage = {
  get: (key) => memory.get(key) ?? null,
  set: (key, value) => memory.set(key, value),
};
const settingsStore = settingsModule.createSettingsStore(storage, () => 'light');
assert.deepEqual(settingsStore.getSettings(), {
  graphic: 'soft',
  bgm: 'off',
  sfx: 'mono',
  speed: 'fast',
  winningScore: '10',
  colorScheme: 'dark',
});

const controls = controlsModule.parseControlBindings(
  imported.values[controlsModule.CONTROL_BINDING_STORAGE_KEY]
);
assert.deepEqual(controls, JSON.parse(seed.fixture['pv-control-bindings-v1']).bindings);

const originValues = new Set(Object.values(imported.origins || {}));
assert.ok(originValues.size >= 1, 'Importer did not report Electron storage origin');

process.stdout.write(
  `${JSON.stringify(
    {
      migration_import_gate: 'PASS',
      rawValuesMatchElectron: true,
      sharedSettingsSanitization: 'PASS',
      sharedControlSanitization: 'PASS',
      observedOrigins: [...originValues],
    },
    null,
    2
  )}\n`
);
