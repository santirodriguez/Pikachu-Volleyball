'use strict';

const fs = require('node:fs');
const path = require('node:path');

const evidence = path.resolve(process.argv[2] || '.neutralino-reproducibility');
const build1Dir = path.join(evidence, 'build-1');
const build2Dir = path.join(evidence, 'build-2');
const manifest1 = JSON.parse(fs.readFileSync(path.join(build1Dir, 'manifest.json'), 'utf8'));
const manifest2 = JSON.parse(fs.readFileSync(path.join(build2Dir, 'manifest.json'), 'utf8'));
const order = [
  'rawPatchedRuntime',
  'externalLinkHelper',
  'embeddedProductionBinary',
  'provenance',
  'sha256sums',
  'finalTarball',
];

function capturedPath(buildDir, component) {
  return path.join(buildDir, component.capturedFile);
}

function firstByteDifference(leftPath, rightPath) {
  const leftFd = fs.openSync(leftPath, 'r');
  const rightFd = fs.openSync(rightPath, 'r');
  const leftBuffer = Buffer.allocUnsafe(64 * 1024);
  const rightBuffer = Buffer.allocUnsafe(64 * 1024);
  let offset = 0;
  try {
    while (true) {
      const leftRead = fs.readSync(leftFd, leftBuffer, 0, leftBuffer.length, offset);
      const rightRead = fs.readSync(rightFd, rightBuffer, 0, rightBuffer.length, offset);
      const compared = Math.min(leftRead, rightRead);
      for (let index = 0; index < compared; index += 1) {
        if (leftBuffer[index] !== rightBuffer[index]) {
          return { offset: offset + index, build1Byte: leftBuffer[index], build2Byte: rightBuffer[index] };
        }
      }
      if (leftRead !== rightRead) return { offset: offset + compared, build1Byte: null, build2Byte: null };
      if (leftRead === 0) return null;
      offset += leftRead;
    }
  } finally {
    fs.closeSync(leftFd);
    fs.closeSync(rightFd);
  }
}

function firstLineDifference(leftPath, rightPath) {
  const left = fs.readFileSync(leftPath, 'utf8').split('\n');
  const right = fs.readFileSync(rightPath, 'utf8').split('\n');
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    if (left[index] !== right[index]) {
      return { line: index + 1, build1: left[index] ?? null, build2: right[index] ?? null };
    }
  }
  return null;
}

function buildId(buildDir, componentName) {
  const notes = path.join(buildDir, 'elf', `${componentName}-notes.txt`);
  if (!fs.existsSync(notes)) return null;
  const match = fs.readFileSync(notes, 'utf8').match(/Build ID:\s*([0-9a-f]+)/i);
  return match ? match[1] : null;
}

function firstResourceDifference() {
  const left = JSON.parse(fs.readFileSync(path.join(build1Dir, 'resources.json'), 'utf8'));
  const right = JSON.parse(fs.readFileSync(path.join(build2Dir, 'resources.json'), 'utf8'));
  const max = Math.max(left.files.length, right.files.length);
  for (let index = 0; index < max; index += 1) {
    const a = left.files[index] || null;
    const b = right.files[index] || null;
    if (!a || !b || a.path !== b.path || a.bytes !== b.bytes || a.sha256 !== b.sha256 || a.mode !== b.mode || a.mtimeMs !== b.mtimeMs) {
      return { build1: a, build2: b };
    }
  }
  return null;
}

if (manifest1.sourceCommit !== manifest2.sourceCommit) {
  throw new Error(`Reproducibility captures use different source commits: ${manifest1.sourceCommit} vs ${manifest2.sourceCommit}`);
}

const comparisons = {};
let firstDifference = null;
for (const name of order) {
  const build1 = manifest1.components[name];
  const build2 = manifest2.components[name];
  if (!build1 || !build2) throw new Error(`Missing reproducibility component: ${name}`);
  const match = build1.bytes === build2.bytes && build1.sha256 === build2.sha256;
  const detail = { build1, build2, match };
  if (!match) {
    detail.firstByteDifference = firstByteDifference(capturedPath(build1Dir, build1), capturedPath(build2Dir, build2));
    if (name === 'provenance' || name === 'sha256sums') {
      detail.firstLineDifference = firstLineDifference(capturedPath(build1Dir, build1), capturedPath(build2Dir, build2));
    }
    if (['rawPatchedRuntime', 'externalLinkHelper', 'embeddedProductionBinary'].includes(name)) {
      detail.elfBuildId = {
        build1: buildId(build1Dir, name),
        build2: buildId(build2Dir, name),
      };
    }
    if (!firstDifference) firstDifference = name;
  }
  comparisons[name] = detail;
}

const resourceComparison = {
  contentMatch: manifest1.resources.contentTreeSha256 === manifest2.resources.contentTreeSha256,
  metadataMatch: manifest1.resources.metadataTreeSha256 === manifest2.resources.metadataTreeSha256,
  build1: manifest1.resources,
  build2: manifest2.resources,
};
if (!resourceComparison.contentMatch || !resourceComparison.metadataMatch) {
  resourceComparison.firstDifference = firstResourceDifference();
  if (!firstDifference) {
    firstDifference = resourceComparison.contentMatch ? 'resources.metadata' : 'resources.content';
  }
}

const result = {
  schemaVersion: 1,
  sourceCommit: manifest1.sourceCommit,
  firstDifference,
  match: firstDifference === null,
  components: comparisons,
  resources: resourceComparison,
};
fs.writeFileSync(path.join(evidence, 'comparison.json'), `${JSON.stringify(result, null, 2)}\n`);

const lines = [
  `source_sha=${result.sourceCommit}`,
  `match=${result.match}`,
  `first_difference=${firstDifference || 'none'}`,
];
for (const name of order) {
  const item = comparisons[name];
  lines.push(`${name}.match=${item.match}`);
  lines.push(`${name}.build1.bytes=${item.build1.bytes}`);
  lines.push(`${name}.build1.sha256=${item.build1.sha256}`);
  lines.push(`${name}.build2.bytes=${item.build2.bytes}`);
  lines.push(`${name}.build2.sha256=${item.build2.sha256}`);
  if (item.elfBuildId) {
    lines.push(`${name}.build1.elf_build_id=${item.elfBuildId.build1 || 'none'}`);
    lines.push(`${name}.build2.elf_build_id=${item.elfBuildId.build2 || 'none'}`);
  }
  if (item.firstByteDifference) lines.push(`${name}.first_byte_difference=${JSON.stringify(item.firstByteDifference)}`);
  if (item.firstLineDifference) lines.push(`${name}.first_line_difference=${JSON.stringify(item.firstLineDifference)}`);
}
lines.push(`resources.content_match=${resourceComparison.contentMatch}`);
lines.push(`resources.metadata_match=${resourceComparison.metadataMatch}`);
lines.push(`resources.build1.content_sha256=${resourceComparison.build1.contentTreeSha256}`);
lines.push(`resources.build2.content_sha256=${resourceComparison.build2.contentTreeSha256}`);
lines.push(`resources.build1.metadata_sha256=${resourceComparison.build1.metadataTreeSha256}`);
lines.push(`resources.build2.metadata_sha256=${resourceComparison.build2.metadataTreeSha256}`);
if (resourceComparison.firstDifference) lines.push(`resources.first_difference=${JSON.stringify(resourceComparison.firstDifference)}`);
fs.writeFileSync(path.join(evidence, 'comparison.txt'), `${lines.join('\n')}\n`);
fs.writeFileSync(path.join(evidence, 'first-difference.txt'), `${firstDifference || 'none'}\n`);
fs.writeFileSync(path.join(evidence, 'exit-code.txt'), `${result.match ? 0 : 1}\n`);
process.stdout.write(`${lines.join('\n')}\n`);
if (!result.match) process.exitCode = 1;
