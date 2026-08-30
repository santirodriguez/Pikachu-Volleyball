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

function main() {
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

  const config = JSON.parse(
    fs.readFileSync(path.join(SOURCE, 'neutralino.config.json'), 'utf8')
  );
  fs.writeFileSync(
    path.join(STAGE, 'neutralino.config.json'),
    `${JSON.stringify(config, null, 2)}\n`
  );

  const preload = fs.readFileSync(path.join(SOURCE, 'preload.js'), 'utf8');
  const smokeProbe = fs.readFileSync(
    path.join(SOURCE, 'smoke-probe.js'),
    'utf8'
  );
  fs.writeFileSync(path.join(RESOURCES, 'neutralino-preload.js'), preload);
  fs.writeFileSync(
    path.join(RESOURCES, 'neutralino-smoke-preload.js'),
    `${preload}\n${smokeProbe}`
  );

  const smokeConfig = JSON.parse(JSON.stringify(config));
  smokeConfig.nativeAllowList = [
    ...config.nativeAllowList,
    'app.writeProcessOutput',
  ];
  smokeConfig.logging = { enabled: true, writeToLogFile: false };
  smokeConfig.modes.window.injectScript =
    '/resources/neutralino-smoke-preload.js';
  fs.writeFileSync(
    path.join(STAGE, 'neutralino.smoke.config.json'),
    `${JSON.stringify(smokeConfig, null, 2)}\n`
  );

  process.stdout.write(`Prepared Neutralino spike staging at ${STAGE}\n`);
}

main();
