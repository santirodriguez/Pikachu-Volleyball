'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getAllowedExternalUrl } = require('../desktop/external-link-policy.cjs');

const binary = path.resolve(
  __dirname,
  '..',
  '.neutralino-spike',
  'extensions',
  'pv-external-link-linux_x64'
);

const cases = [
  'https://santiagorodriguez.com',
  'https://santiagorodriguez.com/about?from=desktop#phase2',
  'https://www.santiagorodriguez.com/',
  'https://github.com/santirodriguez/pikachu-volleyball',
  'https://github.com:443/gorisanson/pikachu-volleyball?tab=readme#readme',
  'file:///tmp/pikachu-volleyball',
  'javascript:alert(1)',
  'data:text/html,pikachu',
  'not a url',
  'http://santiagorodriguez.com',
  'https://example.com',
  'https://github.com.evil.example/santirodriguez/pikachu-volleyball',
  'https://evil.github.com/santirodriguez/pikachu-volleyball',
  'https://sub.santiagorodriguez.com/',
  'https://santiagorodriguez.com.evil.example/',
  'https://github.com/santirodriguez/pikachu-volleyball/issues',
  'https://github.com/santirodriguez/pikachu-volleyball/',
  'https://github.com/gorisanson/pikachu-volleyball/tree/master',
  'https://user@santiagorodriguez.com/',
  'https://santiagorodriguez.com:444/',
  'https://github.com\\@evil.example/santirodriguez/pikachu-volleyball',
];

for (const candidate of cases) {
  const electronAllowed = getAllowedExternalUrl(candidate) !== null;
  const result = spawnSync(binary, ['--check-url', candidate], {
    encoding: 'utf8',
  });
  const neutralinoAllowed = result.status === 0;
  assert.equal(
    neutralinoAllowed,
    electronAllowed,
    `Desktop external-link policy diverged for ${candidate}`
  );
}

process.stdout.write(`Validated ${cases.length} Electron/Neutralino URL policy cases.\n`);
