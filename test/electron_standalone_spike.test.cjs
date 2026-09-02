'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SPIKE = path.join(ROOT, 'spikes', 'electron-standalone');
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

test('Electron standalone spike stays isolated from the supported root toolchain', () => {
  const rootPackage = readJson('package.json');
  const spikePackage = readJson('spikes/electron-standalone/package.json');

  for (const dependencyName of ['electron', 'electron-builder']) {
    assert.equal(rootPackage.dependencies?.[dependencyName], undefined);
    assert.equal(rootPackage.devDependencies?.[dependencyName], undefined);
  }
  assert.equal(rootPackage.main, undefined);
  assert.equal(rootPackage.build, undefined);
  assert.equal(spikePackage.devDependencies.electron, '44.1.1');
  assert.equal(spikePackage.devDependencies['electron-builder'], '26.15.7');
  assert.equal(spikePackage.build.electronVersion, '44.1.1');
  assert.equal(spikePackage.main, 'main.cjs');
  assert.equal(fs.existsSync(path.join(ROOT, 'desktop', 'main.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'desktop', 'preload.js')), false);
});

test('Electron bridge and BrowserWindow keep the renderer privilege boundary narrow', () => {
  const main = read('spikes/electron-standalone/main.cjs');
  const preload = read('spikes/electron-standalone/preload.cjs');

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /webviewTag:\s*false/);
  assert.match(main, /devTools:\s*!app\.isPackaged/);
  assert.match(main, /app\.enableSandbox\(\)/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /will-frame-navigate/);
  assert.match(main, /will-redirect/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.doesNotMatch(main, /--no-sandbox|disable-gpu-sandbox/);

  assert.match(preload, /isDesktop:\s*true/);
  assert.match(preload, /runtime:\s*'electron'/);
  assert.match(preload, /quit:\s*\(\) => ipcRenderer\.invoke\('pv:quit'\)/);
  assert.doesNotMatch(preload, /shell|fs\.|child_process|exec\(|spawn\(/);
});

test('Electron external-link policy matches the current v3 allowlist contract', () => {
  const { normalizeAllowedExternalUrl } = require(path.join(
    SPIKE,
    'external-link-policy.cjs'
  ));

  const allowed = [
    ['https://santiagorodriguez.com', 'https://santiagorodriguez.com/'],
    [
      'https://www.santiagorodriguez.com/about?x=1#y',
      'https://www.santiagorodriguez.com/about?x=1#y',
    ],
    [
      'HTTPS://GITHUB.COM:443/santirodriguez/pikachu-volleyball?tab=readme',
      'https://github.com/santirodriguez/pikachu-volleyball?tab=readme',
    ],
    [
      'https://github.com/gorisanson/pikachu-volleyball#readme',
      'https://github.com/gorisanson/pikachu-volleyball#readme',
    ],
  ];
  for (const [candidate, normalized] of allowed) {
    assert.equal(normalizeAllowedExternalUrl(candidate), normalized, candidate);
  }

  const forbidden = [
    'file:///tmp/pikachu-volleyball',
    'javascript:alert(1)',
    'data:text/html,pikachu',
    'not a url',
    'https://example.com',
    'https://github.com.evil.example/santirodriguez/pikachu-volleyball',
    'https://sub.santiagorodriguez.com/',
    'https://github.com/santirodriguez/pikachu-volleyball/issues',
    'https://user@github.com/santirodriguez/pikachu-volleyball',
    'https://github.com:444/santirodriguez/pikachu-volleyball',
    'https://github.com\\@evil.example/santirodriguez/pikachu-volleyball',
    ' https://santiagorodriguez.com',
    'https://github.com/santirodriguez/../santirodriguez/pikachu-volleyball',
    'https://github.com/santirodriguez/%70ikachu-volleyball',
  ];
  for (const candidate of forbidden) {
    assert.equal(normalizeAllowedExternalUrl(candidate), null, candidate);
  }
});

test('AppImage launcher fails closed on sandbox and packaged-runtime escape switches', () => {
  const patch = read('spikes/electron-standalone/patch-appimage-launcher.cjs');

  for (const switchName of [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-web-security',
    '--allow-file-access-from-files',
    '--allow-running-insecure-content',
    '--remote-debugging-port',
    '--remote-debugging-pipe',
    '--inspect-brk',
    '--js-flags',
    '--disable-site-isolation-trials',
    '--disable-features',
  ]) {
    assert.equal(patch.includes(switchName), true, switchName);
  }
  assert.match(
    patch,
    /Chromium sandbox prerequisites are unavailable; refusing to launch unsandboxed/
  );
  assert.match(patch, /EXPECTED_APP_BUILDER_LIB_VERSION = '26\.15\.7'/);
  assert.match(
    patch,
    /4d3b63afc9939ace718e0b3537e2b1508c15fde7fd030206cbe207bcb6a8f030/
  );
});
