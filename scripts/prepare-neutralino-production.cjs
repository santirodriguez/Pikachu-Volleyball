'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SOURCE = path.join(ROOT, 'desktop', 'neutralino');
const TEST_SOURCE = path.join(ROOT, 'test', 'neutralino');
const STAGE = path.join(ROOT, '.neutralino-production');
const RESOURCES = path.join(STAGE, 'resources');
const REQUIRED_LOCALES = ['en', 'es-ar', 'ca', 'ko', 'zh'];
const REQUIRED_ASSETS = [
  path.join('resources', 'assets', 'images', 'sprite_sheet.json'),
  path.join('resources', 'assets', 'sounds', 'bgm.mp3'),
  path.join('resources', 'assets', 'sounds', 'WAVE145_1.wav'),
];
const SMOKE_ONLY = process.argv.includes('--smoke-only');

function assertFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Missing required Neutralino production input: ${filePath}`);
  }
}

function findSourceMaps(directory) {
  const matches = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) matches.push(...findSourceMaps(entryPath));
    else if (entry.name.endsWith('.map')) matches.push(entryPath);
  }
  return matches;
}

function readProductionConfig() {
  return JSON.parse(fs.readFileSync(path.join(SOURCE, 'neutralino.config.json'), 'utf8'));
}

function sourceDate() {
  const raw = process.env.SOURCE_DATE_EPOCH;
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer for production staging.');
  }
  const date = new Date(Number(raw) * 1000);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid SOURCE_DATE_EPOCH: ${raw}`);
  }
  return date;
}

function normalizeTreeTimestamp(directory, date) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) normalizeTreeTimestamp(entryPath, date);
    else if (entry.isFile()) fs.utimesSync(entryPath, date, date);
  }
  fs.utimesSync(directory, date, date);
}

function prepareProductionStage() {
  assertFile(path.join(SOURCE, 'neutralino.config.json'));
  assertFile(path.join(SOURCE, 'preload.js'));
  assertFile(path.join(SOURCE, 'extensions', 'external-link-linux.c'));
  assertFile(path.join(SOURCE, 'patches', 'neutralino-6.9.0-host-navigation.patch'));
  for (const locale of REQUIRED_LOCALES) assertFile(path.join(DIST, locale, 'index.html'));
  for (const relativePath of REQUIRED_ASSETS) assertFile(path.join(DIST, relativePath));
  const sourceMaps = findSourceMaps(DIST);
  if (sourceMaps.length) throw new Error(`Production web output contains source maps: ${sourceMaps.join(', ')}`);

  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(RESOURCES, { recursive: true });
  fs.cpSync(DIST, RESOURCES, { recursive: true });
  fs.writeFileSync(path.join(STAGE, 'neutralino.config.json'), `${JSON.stringify(readProductionConfig(), null, 2)}\n`);
  fs.copyFileSync(path.join(SOURCE, 'preload.js'), path.join(RESOURCES, 'neutralino-preload.js'));

  const deterministicDate = sourceDate();
  normalizeTreeTimestamp(RESOURCES, deterministicDate);
  fs.utimesSync(path.join(STAGE, 'neutralino.config.json'), deterministicDate, deterministicDate);
  process.stdout.write(`Prepared production Neutralino staging at ${STAGE} with SOURCE_DATE_EPOCH=${process.env.SOURCE_DATE_EPOCH}\n`);
}

function prepareSmokeStage() {
  assertFile(path.join(STAGE, 'neutralino.config.json'));
  assertFile(path.join(RESOURCES, 'neutralino-preload.js'));
  const probes = ['smoke-probe.js', 'external-link-probe.js', 'host-navigation-probe.js'];
  for (const probe of probes) assertFile(path.join(TEST_SOURCE, probe));

  const productionConfig = readProductionConfig();
  const parts = [
    "'use strict';\n(() => {\n  const args = Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [];\n  const prefix = '--dev-pv-smoke-phase=';\n  const phaseArg = args.find((arg) => arg.startsWith(prefix));\n  const phase = phaseArg ? phaseArg.slice(prefix.length) : 'none';\n  const marker = `PV_NEUTRALINO_BOOTSTRAP phase=${phase} neutralino=${window.Neutralino ? 'yes' : 'no'} args=${args.length}`;\n  console.error(marker);\n  if (phase !== 'write' && phase !== 'none') return;\n  const title = `Pikachu Volleyball [PV_SMOKE injector=yes phase=${phase} neutralino=${window.Neutralino ? 'yes' : 'no'} args=${args.length}]`;\n  const mark = () => { document.title = title; };\n  mark();\n  window.addEventListener('DOMContentLoaded', mark, { once: true });\n  window.addEventListener('load', mark, { once: true });\n})();\n",
    fs.readFileSync(path.join(SOURCE, 'preload.js'), 'utf8'),
    ...probes.map((probe) => fs.readFileSync(path.join(TEST_SOURCE, probe), 'utf8')),
  ];
  fs.writeFileSync(path.join(RESOURCES, 'neutralino-smoke-preload.js'), parts.join('\n'));

  const smokeConfig = JSON.parse(JSON.stringify(productionConfig));
  smokeConfig.nativeAllowList = [...productionConfig.nativeAllowList, 'app.writeProcessOutput'];
  smokeConfig.logging = { enabled: true, writeToLogFile: false };
  smokeConfig.modes.window.enableInspector = true;
  smokeConfig.modes.window.openInspectorOnStartup = false;
  smokeConfig.modes.window.injectScript = '/resources/neutralino-smoke-preload.js';
  fs.writeFileSync(path.join(STAGE, 'neutralino.config.json'), `${JSON.stringify(smokeConfig, null, 2)}\n`);
  process.stdout.write(`Prepared Neutralino validation overlay at ${STAGE}\n`);
}

if (SMOKE_ONLY) prepareSmokeStage();
else prepareProductionStage();
