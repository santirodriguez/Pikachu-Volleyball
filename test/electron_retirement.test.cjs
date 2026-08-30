'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));

const retiredPaths = [
  'desktop/main.js',
  'desktop/preload.js',
  'desktop/external-link-policy.cjs',
  'scripts/patch-appimage-launcher.cjs',
  'scripts/prune-packaged-node-modules.cjs',
  'scripts/measure-startup.cjs',
  'scripts/report-build-metrics.cjs',
  '.github/workflows/release-appimage.yml',
  '.github/workflows/phase4-lockfile-refresh.yml',
];

test('Electron packages and electron-builder are absent from the supported dependency graph', () => {
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

test('package metadata exposes only the Neutralino desktop build path', () => {
  const pkg = readJson('package.json');

  assert.equal(pkg.main, undefined);
  assert.equal(pkg.build, undefined);
  assert.equal(pkg.scripts['start:desktop'], undefined);
  assert.equal(pkg.scripts['build:appimage'], undefined);
  assert.equal(pkg.scripts['build:desktop:linux'], 'npm run build:desktop:neutralino');
  assert.equal(
    pkg.scripts['build:desktop:neutralino'],
    'bash scripts/build-neutralino-production.sh'
  );

  for (const command of Object.values(pkg.scripts)) {
    assert.doesNotMatch(command, /(?:^|\s)(?:electron|electron-builder)(?:\s|$)/);
  }
});

test('retired Electron and AppImage implementation files are absent', () => {
  for (const relativePath of retiredPaths) {
    assert.equal(
      fs.existsSync(path.join(ROOT, relativePath)),
      false,
      `Retired path still exists: ${relativePath}`
    );
  }

  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'desktop')).sort(), ['neutralino']);
});

test('accepted Neutralino renderer privilege boundary remains exact', () => {
  const config = readJson('desktop/neutralino/neutralino.config.json');
  assert.deepEqual(config.nativeAllowList, [
    'app.exit',
    'extensions.dispatch',
    'extensions.getStats',
  ]);
  assert.equal(config.nativeAllowList.includes('os.open'), false);
});
