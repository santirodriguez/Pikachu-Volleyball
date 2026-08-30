'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(process.argv[2] || '.');
const output = path.resolve(process.argv[3] || path.join(root, '.neutralino-reproducibility', 'capture'));
const bundleName = 'pikachu-volleyball-neutralino-production-parity-linux-x64';
const artifactName = `${bundleName}.tar.gz`;
const bundle = path.join(root, 'neutralino-production-artifact', bundleName);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Missing reproducibility component: ${filePath}`);
  }
}

function copyFile(source, relativeDestination) {
  assertFile(source);
  const destination = path.join(output, relativeDestination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return destination;
}

function listResourceFiles(directory, prefix = '') {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const result = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...listResourceFiles(absolute, relative));
      continue;
    }
    if (!entry.isFile()) continue;
    const stats = fs.statSync(absolute);
    result.push({
      path: relative,
      bytes: stats.size,
      sha256: sha256(absolute),
      mode: stats.mode & 0o777,
      mtimeMs: stats.mtimeMs,
    });
  }
  return result;
}

function treeSha(entries, includeMetadata) {
  const digest = crypto.createHash('sha256');
  for (const entry of entries) {
    const value = includeMetadata
      ? [entry.path, entry.bytes, entry.sha256, entry.mode, entry.mtimeMs]
      : [entry.path, entry.bytes, entry.sha256, entry.mode];
    digest.update(`${JSON.stringify(value)}\n`);
  }
  return digest.digest('hex');
}

function writeElfDiagnostics(componentName, source) {
  const diagnosticDir = path.join(output, 'elf');
  fs.mkdirSync(diagnosticDir, { recursive: true });
  for (const [suffix, args] of [
    ['notes', ['-n', source]],
    ['sections', ['-SW', source]],
  ]) {
    let text;
    try {
      text = execFileSync('readelf', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    } catch (error) {
      text = `readelf unavailable or failed: ${error.message}\n`;
    }
    fs.writeFileSync(path.join(diagnosticDir, `${componentName}-${suffix}.txt`), text);
  }
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'files'), { recursive: true });

const specs = [
  ['rawPatchedRuntime', path.join(root, '.neutralino-production', 'bin', 'neutralino-linux_x64'), 'raw-patched-neutralino-runtime'],
  ['externalLinkHelper', path.join(root, '.neutralino-production', 'extensions', 'pv-external-link-linux_x64'), 'external-link-helper'],
  ['embeddedProductionBinary', path.join(bundle, 'pikachu-volleyball-neutralino-linux_x64'), 'embedded-production-binary'],
  ['provenance', path.join(bundle, 'provenance.json'), 'provenance.json'],
  ['sha256sums', path.join(bundle, 'SHA256SUMS'), 'SHA256SUMS'],
  ['finalTarball', path.join(root, artifactName), artifactName],
];

const components = {};
for (const [name, source, captureName] of specs) {
  const captured = copyFile(source, path.join('files', captureName));
  const stats = fs.statSync(source);
  components[name] = {
    bytes: stats.size,
    sha256: sha256(source),
    capturedFile: path.relative(output, captured).split(path.sep).join('/'),
  };
  if (['rawPatchedRuntime', 'externalLinkHelper', 'embeddedProductionBinary'].includes(name)) {
    writeElfDiagnostics(name, source);
  }
}

for (const relative of [
  '.neutralino-production/build-toolchain.txt',
  '.neutralino-production/neutralino-host-navigation-runtime.json',
  '.neutralino-production/diagnostics/production-build.log',
]) {
  const source = path.join(root, relative);
  if (fs.existsSync(source) && fs.statSync(source).isFile()) {
    copyFile(source, path.join('metadata', relative.replaceAll('/', '__')));
  }
}

const resourceRoot = path.join(root, '.neutralino-production', 'resources');
if (!fs.existsSync(resourceRoot)) throw new Error(`Missing Neutralino resource stage: ${resourceRoot}`);
const resourceFiles = listResourceFiles(resourceRoot);
const resources = {
  count: resourceFiles.length,
  contentTreeSha256: treeSha(resourceFiles, false),
  metadataTreeSha256: treeSha(resourceFiles, true),
  files: resourceFiles,
};
fs.writeFileSync(path.join(output, 'resources.json'), `${JSON.stringify(resources, null, 2)}\n`);

try {
  const listing = execFileSync('tar', ['-tvzf', path.join(root, artifactName)], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(output, 'tar-listing.txt'), listing);
} catch (error) {
  fs.writeFileSync(path.join(output, 'tar-listing.txt'), `tar listing failed: ${error.message}\n`);
}

const manifest = {
  schemaVersion: 1,
  sourceCommit: process.env.PV_SOURCE_SHA || process.env.GITHUB_SHA || null,
  components,
  resources: {
    count: resources.count,
    contentTreeSha256: resources.contentTreeSha256,
    metadataTreeSha256: resources.metadataTreeSha256,
  },
};
fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

for (const [name, component] of Object.entries(components)) {
  process.stdout.write(`PV_REPRO_COMPONENT name=${name} bytes=${component.bytes} sha256=${component.sha256}\n`);
}
process.stdout.write(`PV_REPRO_RESOURCES count=${resources.count} content_sha256=${resources.contentTreeSha256} metadata_sha256=${resources.metadataTreeSha256}\n`);
