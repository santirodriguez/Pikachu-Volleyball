'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SPIKE_ROOT = __dirname;
const REPOSITORY_ROOT = path.resolve(SPIKE_ROOT, '..', '..');
const SOURCE_DIST = path.join(REPOSITORY_ROOT, 'dist');
const TARGET_DIST = path.join(SPIKE_ROOT, 'dist');
const STAGE_DIR = path.join(SPIKE_ROOT, '.stage');
const ICON_SOURCE = path.join(
  REPOSITORY_ROOT,
  'src',
  'resources',
  'assets',
  'images',
  'IDI_PIKAICON-1_gap_filled_512.png'
);
const ICON_TARGET = path.join(STAGE_DIR, 'icon.png');

if (!fs.existsSync(SOURCE_DIST)) {
  throw new Error('Missing root dist/. Run the current v3 web build first.');
}
if (!fs.existsSync(ICON_SOURCE)) {
  throw new Error(`Missing application icon: ${ICON_SOURCE}`);
}

fs.rmSync(TARGET_DIST, { recursive: true, force: true });
fs.rmSync(STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(STAGE_DIR, { recursive: true });
fs.cpSync(SOURCE_DIST, TARGET_DIST, { recursive: true, force: true });
fs.copyFileSync(ICON_SOURCE, ICON_TARGET);

console.log(`Prepared Electron standalone spike payload from ${SOURCE_DIST}.`);
