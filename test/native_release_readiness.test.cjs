'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

const retiredElectronPaths = [
  'desktop/main.js',
  'desktop/preload.js',
  'scripts/patch-appimage-launcher.cjs',
  'scripts/prune-packaged-node-modules.cjs',
  'scripts/measure-startup.cjs',
  'scripts/report-build-metrics.cjs',
  'scripts/report-electron-user-data.cjs',
  'scripts/seed-electron-migration-fixture.cjs',
];

test('Electron is absent from the supported dependency graph', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');

  for (const dependencyName of ['electron', 'electron-builder']) {
    assert.equal(pkg.dependencies?.[dependencyName], undefined);
    assert.equal(pkg.devDependencies?.[dependencyName], undefined);
    assert.equal(lock.packages?.['']?.dependencies?.[dependencyName], undefined);
    assert.equal(lock.packages?.['']?.devDependencies?.[dependencyName], undefined);
    assert.equal(lock.packages?.[`node_modules/${dependencyName}`], undefined);
  }
});

test('generic desktop commands target the production native AppImage builder', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.main, undefined);
  assert.equal(pkg.build, undefined);
  assert.equal(pkg.scripts['start:desktop'], undefined);
  assert.equal(pkg.scripts['build:appimage'], 'npm run build:desktop:linux');
  assert.equal(
    pkg.scripts['build:desktop:linux'],
    'bash scripts/build-native-appimage.sh'
  );

  for (const command of Object.values(pkg.scripts)) {
    assert.doesNotMatch(command, /(?:^|\s)(?:electron|electron-builder)(?:\s|$)/);
  }
});

test('retired Electron implementation paths are absent', () => {
  for (const relativePath of retiredElectronPaths) {
    assert.equal(
      fs.existsSync(path.join(ROOT, relativePath)),
      false,
      `Retired path still exists: ${relativePath}`
    );
  }
});

test('release builder is independent from the Phase 3 spike build primitive', () => {
  const builder = read('scripts/build-native-appimage.sh');
  assert.match(builder, /scripts\/build-native-toolchain\.sh/);
  assert.doesNotMatch(builder, /desktop\/native-spike\/build-appimage\.sh/);
  assert.match(builder, /native_release_builder=PASS/);
  assert.match(builder, /phase3_build_primitive_dependency=NONE/);
});

test('legacy Electron migration remains testable without Electron', () => {
  assert.equal(
    fs.existsSync(path.join(ROOT, 'desktop/native/electron_preferences_importer.cc')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(ROOT, 'desktop/native/electron_preferences_fixture.cc')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(ROOT, 'scripts/electron-migration-fixture.cjs')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(ROOT, 'scripts/write-electron-migration-fixture.cjs')),
    true
  );
});
