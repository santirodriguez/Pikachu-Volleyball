'use strict';

/**
 * Build a detached presentation snapshot from the live physics model.
 * The returned object intentionally contains only values needed by GameView.
 * @param {Object} physics
 * @param {{ punchEffectRadius?: number }} [overrides]
 * @return {Object}
 */
function createGamePresentationState(physics, overrides = {}) {
  const { player1, player2, ball } = physics;
  const punchEffectRadius =
    overrides.punchEffectRadius === undefined
      ? ball.punchEffectRadius
      : overrides.punchEffectRadius;

  return {
    player1: createPlayerPresentationState(player1),
    player2: createPlayerPresentationState(player2),
    ball: {
      x: ball.x,
      y: ball.y,
      rotation: ball.rotation,
      punchEffectRadius,
      punchEffectX: ball.punchEffectX,
      punchEffectY: ball.punchEffectY,
      isPowerHit: ball.isPowerHit,
      previousX: ball.previousX,
      previousY: ball.previousY,
      previousPreviousX: ball.previousPreviousX,
      previousPreviousY: ball.previousPreviousY,
    },
  };
}

/**
 * Advance the gameplay-owned punch effect by one historical render step.
 * Returns the pre-step radius because the existing view decrements its detached
 * presentation value before drawing; this preserves the exact visible sequence.
 * @param {Object} ball
 * @return {number}
 */
function advancePunchEffect(ball) {
  const radiusBeforeFrame = ball.punchEffectRadius;
  if (radiusBeforeFrame > 0) {
    ball.punchEffectRadius = radiusBeforeFrame - 2;
  }
  return radiusBeforeFrame;
}

function createPlayerPresentationState(player) {
  return {
    x: player.x,
    y: player.y,
    state: player.state,
    frameNumber: player.frameNumber,
    divingDirection: player.divingDirection,
  };
}

module.exports = {
  createGamePresentationState,
  advancePunchEffect,
};
