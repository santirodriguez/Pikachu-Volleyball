'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STAGE = path.join(ROOT, '.neutralino-spike');
const BINARY_NAME = 'pikachu-volleyball-neutralino-spike-linux_x64';
const OUTPUT = path.resolve(
  process.argv[2] || path.join(ROOT, 'neutralino-spike-artifact', 'metrics.json')
);

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function findFile(directory, name) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(entryPath, name);
      if (nested) return nested;
    } else if (entry.name === name) {
      return entryPath;
    }
  }
  return null;
}

function main() {
  const binary = findFile(STAGE, BINARY_NAME);
  if (!binary) {
    throw new Error(`Missing Neutralino Linux x64 binary: ${BINARY_NAME}`);
  }

  const config = JSON.parse(
    fs.readFileSync(path.join(STAGE, 'neutralino.config.json'), 'utf8')
  );
  const stats = fs.statSync(binary);
  const report = {
    generatedAt: new Date().toISOString(),
    sourceCommit: process.env.GITHUB_SHA || null,
    frameworkVersion: config.cli.binaryVersion,
    clientVersion: config.cli.clientVersion,
    binaryName: path.basename(binary),
    binaryBytes: stats.size,
    binaryMiB: Number((stats.size / 1024 / 1024).toFixed(2)),
    sha256: sha256(binary),
    embeddedResources: true,
    electronAppImageBaselineBytes: 97094772,
    electronAppImageBaselineMiB: 92.6,
  };

  const outputDirectory = path.dirname(OUTPUT);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.copyFileSync(binary, path.join(outputDirectory, BINARY_NAME));
  fs.chmodSync(path.join(outputDirectory, BINARY_NAME), 0o755);
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
