'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STAGE = path.join(ROOT, '.neutralino-spike');
const BINARY = path.join(
  STAGE,
  'neutralino-dist',
  'pikachu-volleyball-neutralino-spike-linux_x64'
);
const OUTPUT = path.resolve(
  process.argv[2] || path.join(ROOT, 'neutralino-spike-artifact', 'metrics.json')
);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
  if (!fs.existsSync(BINARY)) {
    throw new Error(`Missing Neutralino Linux x64 binary: ${BINARY}`);
  }

  const config = JSON.parse(
    fs.readFileSync(path.join(STAGE, 'neutralino.config.json'), 'utf8')
  );
  const stats = fs.statSync(BINARY);
  const report = {
    generatedAt: new Date().toISOString(),
    sourceCommit: process.env.GITHUB_SHA || null,
    frameworkVersion: config.cli.binaryVersion,
    clientVersion: config.cli.clientVersion,
    binaryName: path.basename(BINARY),
    binaryBytes: stats.size,
    binaryMiB: Number((stats.size / 1024 / 1024).toFixed(2)),
    sha256: sha256(BINARY),
    embeddedResources: true,
    electronAppImageBaselineBytes: 97094772,
    electronAppImageBaselineMiB: 92.6,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
