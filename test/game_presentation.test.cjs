'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createGamePresentationState,
  advancePunchEffect,
} = require('../src/resources/js/game_presentation.cjs');

function createPhysicsFixture() {
  return {
    player1: {
      x: 40,
      y: 244,
      state: 3,
      frameNumber: 7,
      divingDirection: -1,
      ignored: { mutable: true },
    },
    player2: {
      x: 392,
      y: 210,
      state: 1,
      frameNumber: 4,
      divingDirection: 1,
      ignored: { mutable: true },
    },
    ball: {
      x: 216,
      y: 180,
      rotation: 4,
      punchEffectRadius: 20,
      punchEffectX: 215,
      punchEffectY: 272,
      isPowerHit: true,
      previousX: 210,
      previousY: 174,
      previousPreviousX: 204,
      previousPreviousY: 169,
      ignored: { mutable: true },
    },
  };
}

test('builds a detached presentation snapshot with only view-facing values', () => {
  const physics = createPhysicsFixture();
  const before = structuredClone(physics);
  const snapshot = createGamePresentationState(physics);

  assert.deepEqual(snapshot, {
    player1: {
      x: 40,
      y: 244,
      state: 3,
      frameNumber: 7,
      divingDirection: -1,
    },
    player2: {
      x: 392,
      y: 210,
      state: 1,
      frameNumber: 4,
      divingDirection: 1,
    },
    ball: {
      x: 216,
      y: 180,
      rotation: 4,
      punchEffectRadius: 20,
      punchEffectX: 215,
      punchEffectY: 272,
      isPowerHit: true,
      previousX: 210,
      previousY: 174,
      previousPreviousX: 204,
      previousPreviousY: 169,
    },
  });
  assert.deepEqual(physics, before);
  assert.notStrictEqual(snapshot.player1, physics.player1);
  assert.notStrictEqual(snapshot.player2, physics.player2);
  assert.notStrictEqual(snapshot.ball, physics.ball);

  snapshot.player1.x = -1;
  snapshot.ball.previousX = -1;
  assert.equal(physics.player1.x, 40);
  assert.equal(physics.ball.previousX, 210);
});

test('allows the controller to preserve a pre-step punch radius in the snapshot', () => {
  const physics = createPhysicsFixture();
  physics.ball.punchEffectRadius = 18;

  const snapshot = createGamePresentationState(physics, {
    punchEffectRadius: 20,
  });

  assert.equal(snapshot.ball.punchEffectRadius, 20);
  assert.equal(physics.ball.punchEffectRadius, 18);
});

test('preserves the historical punch-effect sequence outside the live view model', () => {
  const physics = createPhysicsFixture();
  const renderedRadii = [];

  for (let frame = 0; frame < 11; frame++) {
    const radiusBeforeFrame = advancePunchEffect(physics.ball);
    const snapshot = createGamePresentationState(physics, {
      punchEffectRadius: radiusBeforeFrame,
    });

    if (snapshot.ball.punchEffectRadius > 0) {
      snapshot.ball.punchEffectRadius -= 2;
      renderedRadii.push(snapshot.ball.punchEffectRadius);
    } else {
      renderedRadii.push(null);
    }
  }

  assert.deepEqual(renderedRadii, [18, 16, 14, 12, 10, 8, 6, 4, 2, 0, null]);
  assert.equal(physics.ball.punchEffectRadius, 0);
});
