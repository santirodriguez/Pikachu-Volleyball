'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const METADATA_PATH = path.join(ROOT, 'packaging', 'linux', 'metadata.env');
const PACKAGE_SCRIPT_PATH = path.join(ROOT, 'scripts', 'package-neutralino-linux.sh');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'neutralino-production.yml');

function readMetadata() {
  const values = {};
  for (const rawLine of fs.readFileSync(METADATA_PATH, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    assert.ok(separator > 0, `invalid Linux packaging metadata line: ${line}`);
    const key = line.slice(0, separator);
    let value = line.slice(separator + 1);
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

test('Linux package identity stays centralized and aligned with Neutralino', () => {
  const metadata = readMetadata();
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'neutralino', 'neutralino.config.json'), 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(metadata.PV_PACKAGE_VERSION, packageJson.version);
  assert.equal(metadata.PV_PACKAGE_VERSION, config.version);
  assert.equal(metadata.PV_APPLICATION_ID, config.applicationId);
  assert.equal(metadata.PV_BINARY_NAME, `${config.cli.binaryName}-linux_x64`);
  assert.equal(metadata.PV_DEB_ARCH, 'amd64');
  assert.equal(metadata.PV_RPM_ARCH, 'x86_64');
});

test('Linux dependency metadata keeps system WebKit, audio, and xdg-open support', () => {
  const metadata = readMetadata();
  assert.match(metadata.PV_DEB_DEPENDS, /libwebkit2gtk-4\.1-0 \| libwebkit2gtk-4\.0-37/);
  assert.match(metadata.PV_DEB_DEPENDS, /gstreamer1\.0-plugins-good/);
  assert.match(metadata.PV_DEB_DEPENDS, /xdg-utils/);
  assert.match(metadata.PV_RPM_REQUIRES, /webkit2gtk4\.1/);
  assert.match(metadata.PV_RPM_REQUIRES, /gstreamer1-plugins-good/);
  assert.match(metadata.PV_RPM_REQUIRES, /xdg-utils/);
});

test('Linux packaging preserves the accepted runtime boundary and reproducibility controls', () => {
  const script = fs.readFileSync(PACKAGE_SCRIPT_PATH, 'utf8');
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'neutralino', 'neutralino.config.json'), 'utf8'));
  assert.match(script, /sha256sum -c SHA256SUMS/);
  assert.match(script, /sourceDateEpoch/);
  assert.match(script, /tar --sort=name --mtime=/);
  assert.match(script, /--owner=0 --group=0 --numeric-owner/);
  assert.match(script, /gzip -n/);
  assert.match(script, /Type=Application/);
  assert.match(script, /Categories=Game;ArcadeGame;/);
  assert.doesNotMatch(script, /appimage/i);
  assert.doesNotMatch(script, /flatpak/i);
  assert.deepEqual(config.nativeAllowList, ['app.exit', 'extensions.dispatch', 'extensions.getStats']);
});

test('Neutralino production workflow has durable v3 packaging coverage', () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(workflow, /- 'v3-\*'/);
  assert.doesNotMatch(workflow, /v3-phase4-electron-retirement/);
  assert.match(workflow, /packaging\/linux\/\*\*/);
  assert.match(workflow, /Build Linux distribution twice/);
  assert.match(workflow, /Validate Debian-family package/);
  assert.match(workflow, /Validate Fedora RPM package/);
  assert.match(workflow, /debian:bookworm-20260824-slim@sha256:/);
  assert.match(workflow, /fedora:44@sha256:/);
  assert.doesNotMatch(workflow, /arm64/i);
});
