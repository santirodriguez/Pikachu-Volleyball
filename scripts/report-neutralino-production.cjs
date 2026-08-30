'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STAGE = path.join(ROOT, '.neutralino-production');
const ARTIFACT_ROOT = path.join(ROOT, 'neutralino-production-artifact');
const BUNDLE_NAME = 'pikachu-volleyball-neutralino-production-parity-linux-x64';
const BUNDLE = path.join(ARTIFACT_ROOT, BUNDLE_NAME);
const BINARY_NAME = 'pikachu-volleyball-neutralino-linux_x64';
const EXTENSION_NAME = 'pv-external-link-linux_x64';
const HOST_NAV_METADATA = path.join(
  STAGE,
  'neutralino-host-navigation-runtime.json'
);
const PHASE1_RAW_RUNTIME_BYTES = 6023776;
const PHASE2_RAW_RUNTIME_AND_HELPER_BYTES = 6046384;
const ELECTRON_APPIMAGE_BYTES = 97094772;

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function findFiles(directory, name, matches = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) findFiles(entryPath, name, matches);
    else if (entry.name === name) matches.push(entryPath);
  }
  return matches;
}

function preferDistributionFile(files) {
  return (
    files.find((file) =>
      file.includes(`${path.sep}neutralino-dist${path.sep}`)
    ) ||
    files[0] ||
    null
  );
}

const binary = preferDistributionFile(findFiles(STAGE, BINARY_NAME));
const extension = preferDistributionFile(findFiles(STAGE, EXTENSION_NAME));
if (!binary || !extension || !fs.existsSync(HOST_NAV_METADATA)) {
  throw new Error('Missing Neutralino production build output or provenance.');
}

const config = JSON.parse(
  fs.readFileSync(path.join(STAGE, 'neutralino.config.json'), 'utf8')
);
const hostNavigationRuntime = JSON.parse(
  fs.readFileSync(HOST_NAV_METADATA, 'utf8')
);
const binaryStats = fs.statSync(binary);
const extensionStats = fs.statSync(extension);
const rawRuntimeBytes = hostNavigationRuntime.binaryBytes;
const rawRuntimeAndHelperBytes = rawRuntimeBytes + extensionStats.size;
const productionRuntimeAndHelperBytes = binaryStats.size + extensionStats.size;

const report = {
  generatedAt: new Date().toISOString(),
  sourceCommit: process.env.GITHUB_SHA || process.env.PV_SOURCE_SHA || null,
  frameworkVersion: config.cli.binaryVersion,
  upstreamCommit: hostNavigationRuntime.upstreamCommit,
  cliVersion: '11.7.2',
  clientVersion: config.cli.clientVersion,
  applicationId: config.applicationId,
  rendererNativeAllowList: config.nativeAllowList,
  hostNavigationPatchSha256: hostNavigationRuntime.patchSha256,
  patchedRuntime: {
    name: 'neutralino-linux_x64',
    bytes: rawRuntimeBytes,
    sha256: hostNavigationRuntime.binarySha256,
  },
  embeddedBinary: {
    name: BINARY_NAME,
    bytes: binaryStats.size,
    sha256: sha256(binary),
  },
  externalLinkHelper: {
    name: EXTENSION_NAME,
    bytes: extensionStats.size,
    sha256: sha256(extension),
    bundledRuntimeDependency: false,
  },
  rawRuntimeAndHelperBytes,
  rawRuntimeAndHelperMiB: Number(
    (rawRuntimeAndHelperBytes / 1024 / 1024).toFixed(2)
  ),
  productionRuntimeAndHelperBytes,
  productionRuntimeAndHelperMiB: Number(
    (productionRuntimeAndHelperBytes / 1024 / 1024).toFixed(2)
  ),
  embeddedResourceOverheadBytes: binaryStats.size - rawRuntimeBytes,
  phase1RawRuntimeBaselineBytes: PHASE1_RAW_RUNTIME_BYTES,
  phase1PatchedRuntimeDeltaBytes: rawRuntimeBytes - PHASE1_RAW_RUNTIME_BYTES,
  phase2RawRuntimeAndHelperBaselineBytes: PHASE2_RAW_RUNTIME_AND_HELPER_BYTES,
  phase2RawRuntimeAndHelperDeltaBytes:
    rawRuntimeAndHelperBytes - PHASE2_RAW_RUNTIME_AND_HELPER_BYTES,
  electronAppImageBaselineBytes: ELECTRON_APPIMAGE_BYTES,
  electronAppImageBaselineMiB: 92.6,
  productionArtifactContents: [
    BINARY_NAME,
    `extensions/${EXTENSION_NAME}`,
    'provenance.json',
    'SHA256SUMS',
  ],
};

fs.rmSync(ARTIFACT_ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(BUNDLE, 'extensions'), { recursive: true });
fs.copyFileSync(binary, path.join(BUNDLE, BINARY_NAME));
fs.chmodSync(path.join(BUNDLE, BINARY_NAME), 0o755);
fs.copyFileSync(extension, path.join(BUNDLE, 'extensions', EXTENSION_NAME));
fs.chmodSync(path.join(BUNDLE, 'extensions', EXTENSION_NAME), 0o755);
fs.writeFileSync(
  path.join(BUNDLE, 'provenance.json'),
  `${JSON.stringify(report, null, 2)}\n`
);
const sums = [
  BINARY_NAME,
  `extensions/${EXTENSION_NAME}`,
  'provenance.json',
]
  .map((relative) => `${sha256(path.join(BUNDLE, relative))}  ${relative}`)
  .join('\n');
fs.writeFileSync(path.join(BUNDLE, 'SHA256SUMS'), `${sums}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
