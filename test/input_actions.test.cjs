'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  INPUT_ACTIONS,
  PLAYER_ONE_PRIMARY_POWER_HIT_KEY,
  PLAYER_ONE_ALTERNATE_POWER_HIT_KEY,
  PLAYER_TWO_PRIMARY_POWER_HIT_KEY,
  PLAYER_TWO_ALTERNATE_POWER_HIT_KEY,
  GLOBAL_PAUSE_KEY,
  InputActionState,
  getPowerHitKeyCodes,
  normalizeKeyCodes,
  shouldHandlePauseShortcut,
} = require('../src/resources/js/input_actions.cjs');

function createPlayerState(primaryPowerHitKey, movement = {}) {
  const powerHitKeys = getPowerHitKeyCodes(primaryPowerHitKey);
  return new InputActionState({
    [INPUT_ACTIONS.MOVE_LEFT]: movement.left || null,
    [INPUT_ACTIONS.MOVE_RIGHT]: movement.right || null,
    [INPUT_ACTIONS.MOVE_UP]: movement.up || null,
    [INPUT_ACTIONS.MOVE_DOWN]: movement.down || null,
    [INPUT_ACTIONS.POWER_HIT]: powerHitKeys,
    [INPUT_ACTIONS.CONFIRM]: powerHitKeys,
  });
}

function createPlayerOneState() {
  return createPlayerState(PLAYER_ONE_PRIMARY_POWER_HIT_KEY, {
    left: 'KeyD',
    right: 'KeyG',
    up: 'KeyR',
    down: 'KeyV',
  });
}

function createPlayerTwoState() {
  return createPlayerState(PLAYER_TWO_PRIMARY_POWER_HIT_KEY, {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
  });
}

test('normalizes key bindings and removes duplicates', () => {
  assert.deepEqual(normalizeKeyCodes(['KeyZ', 'KeyZ', null, '']), ['KeyZ']);
  assert.deepEqual(normalizeKeyCodes('ControlLeft'), ['ControlLeft']);
});

test('maps both default Power Hit bindings to their approved alternates', () => {
  assert.deepEqual(getPowerHitKeyCodes(PLAYER_ONE_PRIMARY_POWER_HIT_KEY), [
    PLAYER_ONE_PRIMARY_POWER_HIT_KEY,
    PLAYER_ONE_ALTERNATE_POWER_HIT_KEY,
  ]);
  assert.deepEqual(getPowerHitKeyCodes(PLAYER_TWO_PRIMARY_POWER_HIT_KEY), [
    PLAYER_TWO_PRIMARY_POWER_HIT_KEY,
    PLAYER_TWO_ALTERNATE_POWER_HIT_KEY,
  ]);
});

test('does not add alternate keys to custom Power Hit bindings', () => {
  assert.deepEqual(getPowerHitKeyCodes('Space'), ['Space']);
});

test('does not add ControlLeft to Player 1', () => {
  const state = createPlayerOneState();
  assert.equal(state.handleKeyDown('ControlLeft'), false);
  assert.equal(state.isActionDown(INPUT_ACTIONS.POWER_HIT), false);
});

test('emits one Player 1 Power Hit edge for Z or ShiftLeft', () => {
  for (const code of [
    PLAYER_ONE_PRIMARY_POWER_HIT_KEY,
    PLAYER_ONE_ALTERNATE_POWER_HIT_KEY,
  ]) {
    const state = createPlayerOneState();
    state.handleKeyDown(code);
    const snapshot = state.createSnapshot();
    assert.equal(snapshot.pressed[INPUT_ACTIONS.POWER_HIT], true);
    assert.equal(snapshot.pressed[INPUT_ACTIONS.CONFIRM], true);
    assert.equal(state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT], false);
  }
});

test('emits one Player 2 Power Hit edge for Enter or ControlLeft', () => {
  for (const code of [
    PLAYER_TWO_PRIMARY_POWER_HIT_KEY,
    PLAYER_TWO_ALTERNATE_POWER_HIT_KEY,
  ]) {
    const state = createPlayerTwoState();
    state.handleKeyDown(code);
    const snapshot = state.createSnapshot();
    assert.equal(snapshot.pressed[INPUT_ACTIONS.POWER_HIT], true);
    assert.equal(snapshot.pressed[INPUT_ACTIONS.CONFIRM], true);
    assert.equal(state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT], false);
  }
});

test('does not duplicate Power Hit when both bindings are held', () => {
  const state = createPlayerTwoState();
  state.handleKeyDown(PLAYER_TWO_PRIMARY_POWER_HIT_KEY);
  state.handleKeyDown(PLAYER_TWO_ALTERNATE_POWER_HIT_KEY);

  assert.equal(state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT], true);
  assert.equal(state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT], false);

  state.handleKeyUp(PLAYER_TWO_PRIMARY_POWER_HIT_KEY);
  assert.equal(state.createSnapshot().pressed[INPUT_ACTIONS.POWER_HIT], false);
});

test('supports movement and alternate Power Hit at the same time', () => {
  const playerOne = createPlayerOneState();
  playerOne.handleKeyDown(PLAYER_ONE_ALTERNATE_POWER_HIT_KEY);
  playerOne.handleKeyDown('KeyR');
  let snapshot = playerOne.createSnapshot();
  assert.equal(snapshot.down[INPUT_ACTIONS.MOVE_UP], true);
  assert.equal(snapshot.pressed[INPUT_ACTIONS.POWER_HIT], true);

  const playerTwo = createPlayerTwoState();
  playerTwo.handleKeyDown(PLAYER_TWO_ALTERNATE_POWER_HIT_KEY);
  playerTwo.handleKeyDown('ArrowUp');
  snapshot = playerTwo.createSnapshot();
  assert.equal(snapshot.down[INPUT_ACTIONS.MOVE_UP], true);
  assert.equal(snapshot.pressed[INPUT_ACTIONS.POWER_HIT], true);
});

test('reset clears held keys and edge history', () => {
  const state = createPlayerTwoState();
  state.handleKeyDown(PLAYER_TWO_ALTERNATE_POWER_HIT_KEY);
  state.createSnapshot();
  state.reset();

  const snapshot = state.createSnapshot();
  assert.equal(snapshot.down[INPUT_ACTIONS.POWER_HIT], false);
  assert.equal(snapshot.pressed[INPUT_ACTIONS.POWER_HIT], false);
});

test('handles P as a non-repeating global pause shortcut', () => {
  assert.equal(
    shouldHandlePauseShortcut({ code: GLOBAL_PAUSE_KEY, repeat: false }),
    true
  );
  assert.equal(
    shouldHandlePauseShortcut({ code: GLOBAL_PAUSE_KEY, repeat: true }),
    false
  );
  assert.equal(
    shouldHandlePauseShortcut({ code: 'Escape', repeat: false }),
    false
  );
});

test('does not trigger pause while editing text or controls', () => {
  for (const tagName of ['input', 'textarea', 'select']) {
    assert.equal(
      shouldHandlePauseShortcut({
        code: GLOBAL_PAUSE_KEY,
        repeat: false,
        target: { tagName },
      }),
      false
    );
  }

  assert.equal(
    shouldHandlePauseShortcut({
      code: GLOBAL_PAUSE_KEY,
      repeat: false,
      target: { isContentEditable: true },
    }),
    false
  );
});
