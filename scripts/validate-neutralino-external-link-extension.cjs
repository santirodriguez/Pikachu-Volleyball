'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const binary = path.resolve(
  __dirname,
  '..',
  '.neutralino-production',
  'extensions',
  'pv-external-link-linux_x64'
);

const cases = [
  ['https://santiagorodriguez.com', true],
  ['https://santiagorodriguez.com/about?from=desktop#phase2', true],
  ['https://www.santiagorodriguez.com/', true],
  ['https://github.com/santirodriguez/pikachu-volleyball', true],
  ['https://github.com:443/gorisanson/pikachu-volleyball?tab=readme#readme', true],
  ['file:///tmp/pikachu-volleyball', false],
  ['javascript:alert(1)', false],
  ['data:text/html,pikachu', false],
  ['not a url', false],
  ['http://santiagorodriguez.com', false],
  ['https://example.com', false],
  ['https://github.com.evil.example/santirodriguez/pikachu-volleyball', false],
  ['https://evil.github.com/santirodriguez/pikachu-volleyball', false],
  ['https://sub.santiagorodriguez.com/', false],
  ['https://santiagorodriguez.com.evil.example/', false],
  ['https://github.com/santirodriguez/pikachu-volleyball/issues', false],
  ['https://github.com/santirodriguez/pikachu-volleyball/', false],
  ['https://github.com/gorisanson/pikachu-volleyball/tree/master', false],
  ['https://user@santiagorodriguez.com/', false],
  ['https://santiagorodriguez.com:444/', false],
  ['https://github.com\\@evil.example/santirodriguez/pikachu-volleyball', false],
];

for (const [candidate, expectedAllowed] of cases) {
  const result = spawnSync(binary, ['--check-url', candidate], {
    encoding: 'utf8',
  });
  const neutralinoAllowed = result.status === 0;
  assert.equal(
    neutralinoAllowed,
    expectedAllowed,
    `Neutralino external-link policy produced an unexpected result for ${candidate}`
  );
}

process.stdout.write(
  `Validated ${cases.length} Neutralino external-link URL policy cases.\n`
);
