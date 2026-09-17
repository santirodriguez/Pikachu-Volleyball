'use strict';

const inputActionsModule = require('./input_actions.cjs');

const { INPUT_ACTIONS } = inputActionsModule;

/**
 * Convert one semantic InputActionState snapshot into the historical player
 * input shape consumed by PikaPhysics/GameCore.
 * @param {{down?:Object<string,boolean>,pressed?:Object<string,boolean>}} snapshot
 * @return {{xDirection:number,yDirection:number,powerHit:number,confirm:number,back:number,pause:number,practiceReset:number}}
 */
function createFrameInputFromActionSnapshot(snapshot = {}) {
  const down = snapshot.down || {};
  const pressed = snapshot.pressed || {};
  const downRight = Boolean(down[INPUT_ACTIONS.MOVE_DOWN_RIGHT]);

  let xDirection = 0;
  if (down[INPUT_ACTIONS.MOVE_LEFT]) {
    xDirection = -1;
  } else if (down[INPUT_ACTIONS.MOVE_RIGHT] || downRight) {
    xDirection = 1;
  }

  let yDirection = 0;
  if (down[INPUT_ACTIONS.MOVE_UP]) {
    yDirection = -1;
  } else if (down[INPUT_ACTIONS.MOVE_DOWN] || downRight) {
    yDirection = 1;
  }

  return {
    xDirection,
    yDirection,
    powerHit: pressed[INPUT_ACTIONS.POWER_HIT] ? 1 : 0,
    confirm: pressed[INPUT_ACTIONS.CONFIRM] ? 1 : 0,
    back: pressed[INPUT_ACTIONS.BACK] ? 1 : 0,
    pause: pressed[INPUT_ACTIONS.PAUSE] ? 1 : 0,
    practiceReset: pressed[INPUT_ACTIONS.PRACTICE_RESET] ? 1 : 0,
  };
}

module.exports = {
  createFrameInputFromActionSnapshot,
};
