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

test('current release metadata, public notes and five histories agree', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  const releasePath = `docs/releases/v${pkg.version}.md`;
  assert.ok(read(releasePath).includes(pkg.version));
  assert.ok(read('README.md').includes(`](${releasePath})`));
  const { SUPPORTED_LOCALES } = require('../src/resources/js/menu_logic.cjs');
  for (const locale of SUPPORTED_LOCALES) {
    const history = read(`src/${locale}/update-history/index.html`);
    const firstEntry = history
      .split('<div class="indent-minus">')[1]
      ?.split('</p>')[0];
    assert.ok(
      firstEntry?.includes(pkg.version),
      `${locale}: current history entry`
    );
  }
});

test('README native screenshots are valid repository-owned PNG resources', () => {
  const screenshots = [
    ...read('README.md').matchAll(/src="(docs\/screenshots\/[^"]+\.png)"/g),
  ];
  assert.ok(screenshots.length >= 2, 'gameplay and menu screenshots');
  for (const [, relativePath] of screenshots) {
    const png = fs.readFileSync(path.join(ROOT, relativePath));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.subarray(12, 16).toString(), 'IHDR');
    assert.ok(
      png.readUInt32BE(16) >= 800,
      `${relativePath}: readable native width`
    );
    assert.ok(
      png.readUInt32BE(20) >= 600,
      `${relativePath}: readable native height`
    );
  }
});

test('current extension guides reference existing native and browser owners', () => {
  for (const guide of [
    'docs/game-presentation-extension-guide.md',
    'docs/control-binding-extension-guide.md',
  ]) {
    const document = read(guide);
    for (const retired of retiredElectronPaths) {
      assert.ok(
        !document.includes(retired),
        `${guide}: retired owner ${retired}`
      );
    }
    const references = [
      ...document.matchAll(
        /`((?:src\/resources\/js|desktop\/native|scripts)\/[^`\s;]+\.(?:js|cjs|c|sh))`/g
      ),
    ];
    assert.ok(references.length > 0);
    for (const [, relativePath] of references) {
      assert.ok(
        fs.existsSync(path.join(ROOT, relativePath)),
        `${guide}: missing ${relativePath}`
      );
    }
  }
});
