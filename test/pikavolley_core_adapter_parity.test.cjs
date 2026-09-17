'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  createCoreAdapterTraces,
} = require('../scripts/capture-v3-core-adapter-traces.cjs');

const EXPECTED_FULL_HASH =
  'cc627e56e7bb13b4a82fe29c25bdcef2bbd379e566d9d36469528d1afa2d9863';
const EXPECTED_SECTION_HASHES = Object.freeze({
  physics: '9826b7e4209d294d2a835c8b4b7e8448d61adcd0925b1b8163c255f59313c1bd',
  ai: 'c364a39dc050575baa810d4f79146e2fa290254dbaadcb3be3b94a4525116b1b',
  lifecycle: '2515c79999f144a0ae0359d8b1d6790a576d48286e86db73896417af69303502',
  scoring: 'b49cd572039c40e3c3251bb45f8305af4d7032ea6989ec2691b7fe8e14d152f7',
  commands: '0183daa48c4712c052d49592bfe5e2e01e462414656468a1a9a483a846b51df0',
});

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

test('shared-core browser adapter matches the frozen accepted controller traces', () => {
  const traces = createCoreAdapterTraces();

  for (const [section, expectedHash] of Object.entries(
    EXPECTED_SECTION_HASHES
  )) {
    assert.equal(hash(traces[section]), expectedHash, `${section} parity changed`);
  }
  assert.equal(hash(traces), EXPECTED_FULL_HASH);
});
