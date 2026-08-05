'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  INPUT_ACTIONS,
  PLAYER_ONE_PRIMARY_POWER_HIT_KEY,
  PLAYER_ONE_ALTERNATE_POWER_HIT_KEY,
  InputActionState,
  getPowerHitKeyCodes,
  normalizeKeyCodes,
} = require('../src/resources/js/input_actions.cjs');

function createPlayerOneState() {
  return new InputActionState({
    [INPUT_ACTIONS.MOVE_LEFT]: 'KeyD',
    [INPUT_ACTIONS.MOVE_RIGHT]: 'KeyG',
    [INPUT_ACTIONS.MOVE_UP]: 'KeyR',
    [INPUT_ACTIONS.MOVE_DOWN]: 'KeyV',
    [INPUT_ACTIONS.POWER_HIT]: getPowerHitKeyCodes(
      PLAYER_ONE_PRIMARY_POWER_HIT_KEY
    ),
    [INPUT_ACTIONS.CONFIRM]: getPowerHitKeyCodes(
      PLAYER_ONE_PRIMARY_POWER_HIT_KEY
    ),
  });
}

test('normalizes key bindings and removes duplicates', () => {
  assert.deepEqual(normalizeKeyCodes(['KeyZ', 'KeyZ', null, '']), ['KeyZ']);
  assert.deepEqual(normalizeKeyCodes('ControlLeft'), ['ControlLeft']);
});

test('adds ControlLeft only to the historical Player 1 Power Hit binding', () => {
  assert.deepEqual(getPowerHitKeyCodes(PLAYER_ONE_PRIMARY_POWER_HIT_KEY), [
    PLAYER_ONE_PRIMARY_POWER_HIT_KEY,
    PLAYER_ONE_ALTERNATE_POWER_HIT_KEY,
  ]);
  assert.deepEqual(getPowerHitKeyCodes('Enter'), ['Enter']);
  assert.deepEqual(
    getPowerHitKeyCodes([
      PLAYER_ONE_PRIMARY_POWER_HIT_KEY,
      PLAYER_ONE_ALTERNATE_POWER_HIT_KEY,
    ]),
    [PLAYER_ONE_PRIMARY_POWER_HIT_KEY, PLAYER_ONE_ALTERNATE_POWER_HIT_KEY]
  );
});

test('ignores keys that are not bound', () => {
  const state = createPlayerOneState();
  assert.equal(state.handleKeyDown('KeyQ'), false);
  assert.equal(state.handleKeyUp('KeyQ'), false);
  assert.equal(state.isActionDown(INPUT_ACTIONS.POWER_HIT), false);
});

test('emits one Power Hit edge for the existing Z binding', () => {
  const state = createPlayerOneState();
  state.handleKeyDown('KeyZ');

  assert.equal(
    state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT],
    true
  );
  assert.equal(
    state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT],
    false
  );
});

test('emits one Power Hit edge for ControlLeft', () => {
  const state = createPlayerOneState();
  state.handleKeyDown('ControlLeft');

  const snapshot = state.createSnapshot();
  assert.equal(snapshot.pressed[INPUT_ACTIONS.POWER_HIT], true);
  assert.equal(snapshot.pressed[INPUT_ACTIONS.CONFIRM], true);
});

test('does not duplicate Power Hit when both bindings are held', () => {
  const state = createPlayerOneState();
  state.handleKeyDown('KeyZ');
  state.handleKeyDown('ControlLeft');

  assert.equal(
    state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT],
    true
  );
  assert.equal(
    state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT],
    false
  );

  state.handleKeyUp('KeyZ');
  assert.equal(
    state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT],
    false
  );
});

test('supports ControlLeft and jump at the same time', () => {
  const state = createPlayerOneState();
  state.handleKeyDown('ControlLeft');
  state.handleKeyDown('KeyR');

  const snapshot = state.createSnapshot();
  assert.equal(snapshot.down[INPUT_ACTIONS.MOVE_UP], true);
  assert.equal(snapshot.pressed[INPUT_ACTIONS.POWER_HIT], true);
});

test('allows Power Hit again after all bindings are released', () => {
  const state = createPlayerOneState();
  state.handleKeyDown('ControlLeft');
  state.createSnapshot();
  state.handleKeyUp('ControlLeft');
  state.createSnapshot();
  state.handleKeyDown('ControlLeft');

  assert.equal(
    state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT],
    true
  );
});

test('reset clears held keys and edge history', () => {
  const state = createPlayerOneState();
  state.handleKeyDown('ControlLeft');
  state.createSnapshot();
  state.reset();

  const snapshot = state.createSnapshot();
  assert.equal(snapshot.down[INPUT_ACTIONS.POWER_HIT], false);
  assert.equal(snapshot.pressed[INPUT_ACTIONS.POWER_HIT], false);
});
