'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SOURCE = path.join(ROOT, 'desktop', 'neutralino-spike');
const STAGE = path.join(ROOT, '.neutralino-spike');
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
    throw new Error(`Missing required Neutralino spike input: ${filePath}`);
  }
}

function findSourceMaps(directory) {
  const matches = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findSourceMaps(entryPath));
    } else if (entry.name.endsWith('.map')) {
      matches.push(entryPath);
    }
  }
  return matches;
}

function readProductionConfig() {
  return JSON.parse(
    fs.readFileSync(path.join(SOURCE, 'neutralino.config.json'), 'utf8')
  );
}

function prepareProductionStage() {
  assertFile(path.join(SOURCE, 'neutralino.config.json'));
  assertFile(path.join(SOURCE, 'preload.js'));
  assertFile(path.join(SOURCE, 'smoke-probe.js'));

  for (const locale of REQUIRED_LOCALES) {
    assertFile(path.join(DIST, locale, 'index.html'));
  }
  for (const relativePath of REQUIRED_ASSETS) {
    assertFile(path.join(DIST, relativePath));
  }

  const sourceMaps = findSourceMaps(DIST);
  if (sourceMaps.length > 0) {
    throw new Error(
      `Production web output contains source maps: ${sourceMaps.join(', ')}`
    );
  }

  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(RESOURCES, { recursive: true });
  fs.cpSync(DIST, RESOURCES, { recursive: true });

  const config = readProductionConfig();
  fs.writeFileSync(
    path.join(STAGE, 'neutralino.config.json'),
    `${JSON.stringify(config, null, 2)}\n`
  );
  fs.copyFileSync(
    path.join(SOURCE, 'preload.js'),
    path.join(RESOURCES, 'neutralino-preload.js')
  );

  process.stdout.write(
    `Prepared production Neutralino spike staging at ${STAGE}\n`
  );
}

function prepareSmokeStage() {
  assertFile(path.join(STAGE, 'neutralino.config.json'));
  assertFile(path.join(RESOURCES, 'neutralino-preload.js'));
  assertFile(path.join(SOURCE, 'smoke-probe.js'));

  const productionConfig = readProductionConfig();
  const preload = fs.readFileSync(path.join(SOURCE, 'preload.js'), 'utf8');
  const smokeProbe = fs.readFileSync(
    path.join(SOURCE, 'smoke-probe.js'),
    'utf8'
  );
  const smokeBootstrap = `'use strict';\n(() => {\n  const args = Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [];\n  const prefix = '--dev-pv-smoke-phase=';\n  const phaseArg = args.find((arg) => arg.startsWith(prefix));\n  const phase = phaseArg ? phaseArg.slice(prefix.length) : 'none';\n  if (phase !== 'write' && phase !== 'none') return;\n  const title = \`Pikachu Volleyball [PV_SMOKE injector=yes phase=\${phase} neutralino=\${window.Neutralino ? 'yes' : 'no'} args=\${args.length}]\`;\n  const mark = () => {\n    document.title = title;\n  };\n  mark();\n  window.addEventListener('DOMContentLoaded', mark, { once: true });\n  window.addEventListener('load', mark, { once: true });\n})();\n`;
  fs.writeFileSync(
    path.join(RESOURCES, 'neutralino-smoke-preload.js'),
    `${smokeBootstrap}\n${preload}\n${smokeProbe}`
  );

  const smokeConfig = JSON.parse(JSON.stringify(productionConfig));
  smokeConfig.nativeAllowList = [
    ...productionConfig.nativeAllowList,
    'app.writeProcessOutput',
  ];
  smokeConfig.logging = { enabled: true, writeToLogFile: false };
  smokeConfig.modes.window.injectScript =
    '/resources/neutralino-smoke-preload.js';
  fs.writeFileSync(
    path.join(STAGE, 'neutralino.config.json'),
    `${JSON.stringify(smokeConfig, null, 2)}\n`
  );

  process.stdout.write(`Prepared Neutralino Fedora smoke staging at ${STAGE}\n`);
}

if (SMOKE_ONLY) {
  prepareSmokeStage();
} else {
  prepareProductionStage();
}
