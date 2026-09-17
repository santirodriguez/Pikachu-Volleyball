'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  createReferenceTraces,
} = require('../scripts/capture-v3-reference-traces.cjs');

test('captures deterministic Phase 4 reference traces from the accepted controller', () => {
  const traces = createReferenceTraces();
  const serialized = JSON.stringify(traces);
  const traceHash = crypto.createHash('sha256').update(serialized).digest('hex');

  assert.equal(traces.schemaVersion, 1);
  assert.equal(
    traces.source,
    'v3-restart@60f978ec77e1a2c8adf5d56ae14102dccf41d1a9'
  );
  assert.equal(traces.physics.checkpoints.length, 3);
  assert.equal(traces.ai.checkpoints.length, 6);
  assert.equal(traces.lifecycle.checkpoints.length, 6);
  assert.equal(traces.scoring.checkpoints.length, 3);
  assert.equal(traces.commands.checkpoints.length, 5);

  assert.deepEqual(
    traces.lifecycle.checkpoints.map(({ name }) => name),
    [
      'intro-first-frame',
      'intro-timeout',
      'menu-inactivity',
      'after-menu-boundary',
      'before-game-boundary',
      'start-game-boundary',
    ]
  );
  assert.deepEqual(
    traces.scoring.checkpoints.map(({ name }) => name),
    ['score-right', 'slow-motion-fifth-tick', 'winning-score']
  );

  process.stdout.write(`V3_REFERENCE_TRACE_SHA256=${traceHash}\n`);
});
