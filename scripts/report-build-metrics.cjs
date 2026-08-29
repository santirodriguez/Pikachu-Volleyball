'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');
const DIST_DIR = path.join(ROOT, 'dist');
const APP_DIR = path.join(RELEASE_DIR, 'linux-unpacked');
const ASAR_PATH = path.join(APP_DIR, 'resources', 'app.asar');

const BASELINES = Object.freeze({
  v200: 90911841,
  previousOptimizationCheckpoint: 83297939,
  preObservabilityCandidate: 81834404,
});

function fileSize(filePath) {
  return fs.statSync(filePath).size;
}

function directorySize(directoryPath) {
  if (!fs.existsSync(directoryPath)) return null;
  let total = 0;
  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile()) total += fileSize(entryPath);
    }
  }
  return total;
}

function listFiles(directoryPath, predicate = () => true) {
  if (!fs.existsSync(directoryPath)) return [];
  const files = [];
  const stack = [directoryPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile() && predicate(entryPath)) files.push(entryPath);
    }
  }
  return files.sort();
}

function relativeFromRoot(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function bytesDelta(value, baseline) {
  if (value === null) return null;
  const bytes = value - baseline;
  return {
    bytes,
    percent: Number(((bytes / baseline) * 100).toFixed(2)),
  };
}

function topLevelBreakdown(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];
  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .map((entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      return {
        name: entry.name,
        bytes: entry.isDirectory() ? directorySize(entryPath) : fileSize(entryPath),
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

function buildReport() {
  const appImages = listFiles(
    RELEASE_DIR,
    (filePath) => path.dirname(filePath) === RELEASE_DIR && filePath.endsWith('.AppImage')
  );
  const appImagePath = appImages.length === 1 ? appImages[0] : null;
  const appImageBytes = appImagePath ? fileSize(appImagePath) : null;
  const jsChunks = listFiles(DIST_DIR, (filePath) => filePath.endsWith('.js')).map(
    (filePath) => ({ path: relativeFromRoot(filePath), bytes: fileSize(filePath) })
  );

  return {
    generatedAt: new Date().toISOString(),
    distBytes: directorySize(DIST_DIR),
    assetBytes: directorySize(path.join(DIST_DIR, 'resources', 'assets')),
    assetBreakdown: topLevelBreakdown(path.join(DIST_DIR, 'resources', 'assets')),
    jsChunks,
    jsTotalBytes: jsChunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
    appAsarBytes: fs.existsSync(ASAR_PATH) ? fileSize(ASAR_PATH) : null,
    linuxUnpackedBytes: directorySize(APP_DIR),
    linuxUnpackedBreakdown: topLevelBreakdown(APP_DIR),
    appImage: appImagePath
      ? { path: relativeFromRoot(appImagePath), bytes: appImageBytes }
      : null,
    baselines: BASELINES,
    appImageDeltas: appImageBytes
      ? {
          v200: bytesDelta(appImageBytes, BASELINES.v200),
          previousOptimizationCheckpoint: bytesDelta(
            appImageBytes,
            BASELINES.previousOptimizationCheckpoint
          ),
          preObservabilityCandidate: bytesDelta(
            appImageBytes,
            BASELINES.preObservabilityCandidate
          ),
        }
      : null,
  };
}

function markdown(report) {
  const lines = [
    '## Build size report',
    '',
    `- dist: \`${report.distBytes ?? 'n/a'}\` bytes`,
    `- production assets: \`${report.assetBytes ?? 'n/a'}\` bytes`,
    `- JavaScript total: \`${report.jsTotalBytes}\` bytes`,
    `- app.asar: \`${report.appAsarBytes ?? 'n/a'}\` bytes`,
    `- linux-unpacked logical size: \`${report.linuxUnpackedBytes ?? 'n/a'}\` bytes`,
    `- AppImage: \`${report.appImage?.bytes ?? 'n/a'}\` bytes`,
    '',
    '### JavaScript chunks',
    '',
    '| Chunk | Bytes |',
    '|---|---:|',
    ...report.jsChunks.map((chunk) => `| \`${chunk.path}\` | ${chunk.bytes} |`),
  ];

  if (report.appImageDeltas) {
    lines.push(
      '',
      '### AppImage baselines',
      '',
      `- v2.0.0 (90,911,841 bytes): \`${report.appImageDeltas.v200.bytes}\` bytes (${report.appImageDeltas.v200.percent >= 0 ? '+' : ''}${report.appImageDeltas.v200.percent}%)`,
      `- previous optimization checkpoint (83,297,939 bytes): \`${report.appImageDeltas.previousOptimizationCheckpoint.bytes}\` bytes (${report.appImageDeltas.previousOptimizationCheckpoint.percent >= 0 ? '+' : ''}${report.appImageDeltas.previousOptimizationCheckpoint.percent}%)`,
      `- pre-observability v2.1 candidate (81,834,404 bytes): \`${report.appImageDeltas.preObservabilityCandidate.bytes}\` bytes (${report.appImageDeltas.preObservabilityCandidate.percent >= 0 ? '+' : ''}${report.appImageDeltas.preObservabilityCandidate.percent}%)`
    );
  }

  return `${lines.join('\n')}\n`;
}

const report = buildReport();
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const markdownOutput = markdown(report);
process.stdout.write(markdownOutput);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownOutput);
}
