'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STAGE = path.join(ROOT, '.neutralino-spike');
const BINARY_NAME = 'pikachu-volleyball-neutralino-spike-linux_x64';
const EXTENSION_NAME = 'pv-external-link-linux_x64';
const HOST_NAV_METADATA = path.join(
  STAGE,
  'neutralino-host-navigation-runtime.json'
);
const PHASE1_BINARY_BYTES = 6023776;
const OUTPUT = path.resolve(
  process.argv[2] || path.join(ROOT, 'neutralino-spike-artifact', 'metrics.json')
);

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function findFiles(directory, name, matches = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      findFiles(entryPath, name, matches);
    } else if (entry.name === name) {
      matches.push(entryPath);
    }
  }
  return matches;
}

function preferDistributionFile(files) {
  return (
    files.find((file) => file.includes(`${path.sep}neutralino-dist${path.sep}`)) ||
    files[0] ||
    null
  );
}

function main() {
  const binary = preferDistributionFile(findFiles(STAGE, BINARY_NAME));
  const extension = preferDistributionFile(findFiles(STAGE, EXTENSION_NAME));
  if (!binary) {
    throw new Error(`Missing Neutralino Linux x64 binary: ${BINARY_NAME}`);
  }
  if (!extension) {
    throw new Error(`Missing Neutralino external-link extension: ${EXTENSION_NAME}`);
  }
  if (!fs.existsSync(HOST_NAV_METADATA)) {
    throw new Error('Missing patched Neutralino host-navigation provenance.');
  }

  const config = JSON.parse(
    fs.readFileSync(path.join(STAGE, 'neutralino.config.json'), 'utf8')
  );
  const hostNavigationRuntime = JSON.parse(
    fs.readFileSync(HOST_NAV_METADATA, 'utf8')
  );
  const binaryStats = fs.statSync(binary);
  const extensionStats = fs.statSync(extension);
  const combinedBytes = binaryStats.size + extensionStats.size;
  const report = {
    generatedAt: new Date().toISOString(),
    sourceCommit: process.env.GITHUB_SHA || null,
    frameworkVersion: config.cli.binaryVersion,
    clientVersion: config.cli.clientVersion,
    binaryName: path.basename(binary),
    binaryBytes: binaryStats.size,
    binaryMiB: Number((binaryStats.size / 1024 / 1024).toFixed(2)),
    sha256: sha256(binary),
    embeddedResources: true,
    hostNavigationRuntime,
    externalLinkExtension: {
      name: path.basename(extension),
      bytes: extensionStats.size,
      kib: Number((extensionStats.size / 1024).toFixed(2)),
      sha256: sha256(extension),
      bundledRuntimeDependency: false,
    },
    combinedNeutralinoFootprintBytes: combinedBytes,
    combinedNeutralinoFootprintMiB: Number(
      (combinedBytes / 1024 / 1024).toFixed(2)
    ),
    phase1EmbeddedBinaryBaselineBytes: PHASE1_BINARY_BYTES,
    phase1CombinedDeltaBytes: combinedBytes - PHASE1_BINARY_BYTES,
    electronAppImageBaselineBytes: 97094772,
    electronAppImageBaselineMiB: 92.6,
  };

  const outputDirectory = path.dirname(OUTPUT);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.copyFileSync(binary, path.join(outputDirectory, BINARY_NAME));
  fs.chmodSync(path.join(outputDirectory, BINARY_NAME), 0o755);
  fs.copyFileSync(extension, path.join(outputDirectory, EXTENSION_NAME));
  fs.chmodSync(path.join(outputDirectory, EXTENSION_NAME), 0o755);
  fs.copyFileSync(
    HOST_NAV_METADATA,
    path.join(outputDirectory, 'neutralino-host-navigation-runtime.json')
  );
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
