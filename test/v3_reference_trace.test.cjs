'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  createReferenceTraces,
} = require('../scripts/capture-v3-reference-traces.cjs');

const REFERENCE_TRACE_SHA256 =
  'cc627e56e7bb13b4a82fe29c25bdcef2bbd379e566d9d36469528d1afa2d9863';
const REFERENCE_SECTION_SHA256 = Object.freeze({
  physics: '9826b7e4209d294d2a835c8b4b7e8448d61adcd0925b1b8163c255f59313c1bd',
  ai: 'c364a39dc050575baa810d4f79146e2fa290254dbaadcb3be3b94a4525116b1b',
  lifecycle: '2515c79999f144a0ae0359d8b1d6790a576d48286e86db73896417af69303502',
  scoring: 'b49cd572039c40e3c3251bb45f8305af4d7032ea6989ec2691b7fe8e14d152f7',
  commands: '0183daa48c4712c052d49592bfe5e2e01e462414656468a1a9a483a846b51df0',
});

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

test('freezes deterministic Phase 4 reference traces from the accepted controller', () => {
  const traces = createReferenceTraces();

  assert.equal(traces.schemaVersion, 1);
  assert.equal(
    traces.source,
    'v3-restart@60f978ec77e1a2c8adf5d56ae14102dccf41d1a9'
  );
  assert.equal(hash(traces), REFERENCE_TRACE_SHA256);
  for (const [section, expectedHash] of Object.entries(
    REFERENCE_SECTION_SHA256
  )) {
    assert.equal(hash(traces[section]), expectedHash, `${section} trace changed`);
  }

  assert.equal(traces.physics.checkpoints.length, 3);
  assert.deepEqual(traces.physics.rngTrace, [1, 2, 3]);
  assert.deepEqual(traces.physics.checkpoints[2].physics.ball, {
    x: 100,
    y: 100,
    xVelocity: 10,
    yVelocity: -30,
    expectedLandingPointX: 340,
    rotation: 0,
    fineRotation: 0,
    punchEffectRadius: 20,
    punchEffectX: 100,
    punchEffectY: 100,
    isPowerHit: true,
    previousX: 56,
    previousY: 3,
    previousPreviousX: 56,
    previousPreviousY: 1,
  });

  assert.equal(traces.ai.checkpoints.length, 6);
  assert.deepEqual(traces.ai.rngTrace, [0, 7919, 15838, 23757]);
  assert.deepEqual(
    traces.ai.checkpoints.map(({ rngCalls }) => rngCalls),
    [2, 2, 2, 3, 4, 4]
  );
  assert.deepEqual(traces.ai.checkpoints[5].inputs, [
    { xDirection: 1, yDirection: 0, powerHit: 0 },
    { xDirection: 1, yDirection: 0, powerHit: 0 },
  ]);
  assert.deepEqual(
    {
      player1X: traces.ai.checkpoints[5].physics.player1.x,
      player1Y: traces.ai.checkpoints[5].physics.player1.y,
      player2X: traces.ai.checkpoints[5].physics.player2.x,
      ballX: traces.ai.checkpoints[5].physics.ball.x,
      ballY: traces.ai.checkpoints[5].physics.ball.y,
      ballXVelocity: traces.ai.checkpoints[5].physics.ball.xVelocity,
      ballYVelocity: traces.ai.checkpoints[5].physics.ball.yVelocity,
      expectedLandingPointX:
        traces.ai.checkpoints[5].physics.ball.expectedLandingPointX,
    },
    {
      player1X: 146,
      player1Y: 229,
      player2X: 308,
      ballX: 180,
      ballY: 200,
      ballXVelocity: 10,
      ballYVelocity: -14,
      expectedLandingPointX: 360,
    }
  );

  assert.deepEqual(
    traces.lifecycle.checkpoints.map(({ name, state, frameCounter }) => ({
      name,
      state,
      frameCounter,
    })),
    [
      { name: 'intro-first-frame', state: 'intro', frameCounter: 1 },
      { name: 'intro-timeout', state: 'menu', frameCounter: 0 },
      {
        name: 'menu-inactivity',
        state: 'after-menu-selection',
        frameCounter: 0,
      },
      {
        name: 'after-menu-boundary',
        state: 'before-start-of-new-game',
        frameCounter: 0,
      },
      {
        name: 'before-game-boundary',
        state: 'start-of-new-game',
        frameCounter: 0,
      },
      { name: 'start-game-boundary', state: 'round', frameCounter: 0 },
    ]
  );
  assert.deepEqual(traces.lifecycle.checkpoints[0].effects, [
    ['intro.visible', true],
    ['fade.set', 0],
    ['audio.stop', 'bgm'],
    ['intro.drawMark', 0],
  ]);

  assert.deepEqual(
    traces.scoring.checkpoints.map(
      ({ name, scores, roundEnded, gameEnded, slowMotionFramesLeft }) => ({
        name,
        scores,
        roundEnded,
        gameEnded,
        slowMotionFramesLeft,
      })
    ),
    [
      {
        name: 'score-right',
        scores: [0, 1],
        roundEnded: true,
        gameEnded: false,
        slowMotionFramesLeft: 6,
      },
      {
        name: 'slow-motion-fifth-tick',
        scores: [0, 1],
        roundEnded: true,
        gameEnded: false,
        slowMotionFramesLeft: 5,
      },
      {
        name: 'winning-score',
        scores: [0, 1],
        roundEnded: true,
        gameEnded: true,
        slowMotionFramesLeft: 0,
      },
    ]
  );

  assert.deepEqual(
    traces.commands.checkpoints.map(({ name }) => name),
    [
      'quick-rematch-before',
      'quick-rematch-trigger',
      'practice-reset',
      'paused-loop',
      'restart',
    ]
  );
  assert.equal(traces.commands.checkpoints[1].state, 'start-of-new-game');
  assert.equal(traces.commands.checkpoints[2].isPracticeMode, true);
  assert.deepEqual(
    traces.commands.checkpoints[3].before,
    traces.commands.checkpoints[3].after
  );
  assert.equal(traces.commands.checkpoints[4].state, 'intro');
});

module.exports = { REFERENCE_SECTION_SHA256, REFERENCE_TRACE_SHA256 };
