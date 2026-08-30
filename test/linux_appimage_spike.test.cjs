'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const envText = fs.readFileSync(path.join(root, 'packaging/linux/appimage-spike.env'), 'utf8');
const scriptText = fs.readFileSync(path.join(root, 'scripts/build-neutralino-appimage-spike.sh'), 'utf8');

function envValue(name) {
  const match = envText.match(new RegExp(`^${name}=(.+)$`, 'm'));
  assert.ok(match, `missing ${name}`);
  return match[1].trim();
}

test('AppImage spike pins immutable tool identities and hashes', () => {
  for (const name of [
    'PV_APPIMAGE_TOOL_COMMIT',
    'PV_APPIMAGE_RUNTIME_COMMIT',
    'PV_LINUXDEPLOY_COMMIT',
    'PV_LINUXDEPLOY_GTK_COMMIT',
  ]) {
    assert.match(envValue(name), /^[0-9a-f]{40}$/);
  }
  for (const name of [
    'PV_APPIMAGE_TOOL_SHA256',
    'PV_APPIMAGE_RUNTIME_SHA256',
    'PV_LINUXDEPLOY_SHA256',
  ]) {
    assert.match(envValue(name), /^[0-9a-f]{64}$/);
  }
  assert.match(envValue('PV_LINUXDEPLOY_GTK_GIT_BLOB'), /^[0-9a-f]{40}$/);
  assert.match(envValue('PV_APPIMAGE_BUILDER_IMAGE'), /@sha256:[0-9a-f]{64}$/);
  assert.match(envValue('PV_APPIMAGE_DEBIAN12_IMAGE'), /@sha256:[0-9a-f]{64}$/);
  assert.match(envValue('PV_APPIMAGE_UBUNTU2204_IMAGE'), /@sha256:[0-9a-f]{64}$/);
  assert.match(envValue('PV_APPIMAGE_UBUNTU2404_IMAGE'), /@sha256:[0-9a-f]{64}$/);
  assert.match(envValue('PV_APPIMAGE_FEDORA44_IMAGE'), /@sha256:[0-9a-f]{64}$/);
  assert.match(envValue('PV_APPIMAGE_OPENSUSE160_IMAGE'), /@sha256:[0-9a-f]{64}$/);
});

test('thin and bundled candidates remain distinct one-file AppImage experiments', () => {
  const thin = envValue('PV_APPIMAGE_THIN_NAME');
  const bundled = envValue('PV_APPIMAGE_BUNDLED_NAME');
  assert.notEqual(thin, bundled);
  assert.match(thin, /\.AppImage$/);
  assert.match(bundled, /\.AppImage$/);
  assert.match(scriptText, /--runtime-file/);
  assert.match(scriptText, /APPIMAGE_EXTRACT_AND_RUN=1/);
});

test('AppImage spike preserves accepted relative native-extension layout', () => {
  assert.match(
    scriptText,
    /usr\/bin\/extensions\/\$PV_EXTENSION_NAME/,
    'external-link helper must remain next to the Neutralino executable under extensions/',
  );
  assert.match(scriptText, /NO_STRIP=1/);
  assert.match(scriptText, /copy_core "\$appdir"/);
});

test('bundled candidate does not intentionally ship glibc or the ELF loader', () => {
  assert.match(scriptText, /libc\.so/);
  assert.match(scriptText, /ld-linux/);
  assert.match(scriptText, /rm -f .*libc\.so/s);
  assert.match(scriptText, /GST_PLUGIN_SYSTEM_PATH_1_0=/);
});

test('spike does not reintroduce retired Electron packaging', () => {
  assert.doesNotMatch(envText, /electron/i);
  assert.doesNotMatch(scriptText, /electron-builder|app\.asar|chrome-sandbox/i);
});
