'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const inputActionsModule = require('../src/resources/js/input_actions.cjs');
const inputFrameModule = require('../src/resources/js/input_frame.cjs');

const { INPUT_ACTIONS, InputActionState } = inputActionsModule;
const { createFrameInputFromActionSnapshot } = inputFrameModule;

function createState() {
  return new InputActionState({
    [INPUT_ACTIONS.MOVE_LEFT]: 'KeyA',
    [INPUT_ACTIONS.MOVE_RIGHT]: 'KeyD',
    [INPUT_ACTIONS.MOVE_UP]: 'KeyW',
    [INPUT_ACTIONS.MOVE_DOWN]: 'KeyS',
    [INPUT_ACTIONS.MOVE_DOWN_RIGHT]: 'KeyX',
    [INPUT_ACTIONS.POWER_HIT]: ['KeyZ', 'ShiftLeft'],
    [INPUT_ACTIONS.CONFIRM]: ['KeyZ', 'ShiftLeft'],
    [INPUT_ACTIONS.BACK]: 'Escape',
    [INPUT_ACTIONS.PAUSE]: null,
    [INPUT_ACTIONS.PRACTICE_RESET]: 'KeyB',
  });
}

test('shared frame input preserves movement precedence and down-right shortcut', () => {
  const state = createState();
  state.handleKeyDown('KeyA');
  state.handleKeyDown('KeyD');
  state.handleKeyDown('KeyX');
  assert.deepEqual(createFrameInputFromActionSnapshot(state.createSnapshot()), {
    xDirection: -1,
    yDirection: 1,
    powerHit: 0,
    confirm: 0,
    back: 0,
    pause: 0,
    practiceReset: 0,
  });
});

test('shared frame input preserves Power Hit edge semantics', () => {
  const state = createState();
  state.handleKeyDown('KeyZ');
  const first = createFrameInputFromActionSnapshot(state.createSnapshot());
  const held = createFrameInputFromActionSnapshot(state.createSnapshot());
  state.handleKeyDown('ShiftLeft');
  const alternateWhileHeld = createFrameInputFromActionSnapshot(
    state.createSnapshot()
  );
  state.handleKeyUp('KeyZ');
  state.handleKeyUp('ShiftLeft');
  createFrameInputFromActionSnapshot(state.createSnapshot());
  state.handleKeyDown('ShiftLeft');
  const alternateEdge = createFrameInputFromActionSnapshot(
    state.createSnapshot()
  );

  assert.equal(first.powerHit, 1);
  assert.equal(first.confirm, 1);
  assert.equal(held.powerHit, 0);
  assert.equal(alternateWhileHeld.powerHit, 0);
  assert.equal(alternateEdge.powerHit, 1);
  assert.equal(alternateEdge.confirm, 1);
});

test('shared frame input exposes fixed semantic recovery edges', () => {
  const state = createState();
  state.handleKeyDown('Escape');
  state.handleKeyDown('KeyB');
  const frame = createFrameInputFromActionSnapshot(state.createSnapshot());
  assert.equal(frame.back, 1);
  assert.equal(frame.practiceReset, 1);
});
