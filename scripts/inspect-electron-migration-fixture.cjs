'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = process.argv[2];
if (!root) throw new Error('usage: node scripts/inspect-electron-migration-fixture.cjs <user-data-dir>');

const needles = [
  'pv-offline-graphic',
  'pv-offline-bgm',
  'pv-offline-sfx',
  'pv-offline-speed',
  'pv-offline-winningScore',
  'colorScheme',
  'pv-control-bindings-v1'
];

function walk(directory) {
  const entries = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) entries.push(...walk(absolute));
    else if (entry.isFile()) entries.push(absolute);
  }
  return entries;
}

const files = walk(root).map((absolute) => {
  const buffer = fs.readFileSync(absolute);
  const utf8 = buffer.toString('utf8');
  const utf16le = buffer.toString('utf16le');
  const matches = needles.filter((needle) =>
    utf8.includes(needle) || utf16le.includes(needle)
  );
  return {
    path: path.relative(root, absolute),
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    matches
  };
});

const candidateFiles = files.filter(({ matches }) => matches.length > 0);
const levelDbFiles = files.filter(({ path: relative }) =>
  relative.split(path.sep).includes('leveldb')
);

process.stdout.write(`${JSON.stringify({
  root,
  candidateFiles,
  levelDbFiles,
  levelDbDetected: levelDbFiles.length > 0
}, null, 2)}\n`);
