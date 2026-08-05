'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONTROL_BINDING_DEFINITIONS,
  DEFAULT_CONTROL_BINDINGS,
  RESERVED_CONTROL_CODES,
  cloneDefaultControlBindings,
  sanitizeControlBindings,
  validateControlBinding,
  resetControlBindings,
  getPlayerKeyboardConfig,
  formatKeyboardCode,
  serializeControlBindings,
  parseControlBindings,
} = require('../src/resources/js/control_bindings.cjs');

test('default controls preserve the Fedora-validated contract', () => {
  assert.deepEqual(DEFAULT_CONTROL_BINDINGS, {
    'p1.left': 'KeyD',
    'p1.right': 'KeyG',
    'p1.up': 'KeyR',
    'p1.down': 'KeyV',
    'p1.downRight': 'KeyF',
    'p1.powerPrimary': 'KeyZ',
    'p1.powerAlternate': 'ShiftLeft',
    'p2.left': 'ArrowLeft',
    'p2.right': 'ArrowRight',
    'p2.up': 'ArrowUp',
    'p2.down': 'ArrowDown',
    'p2.powerPrimary': 'Enter',
    'p2.powerAlternate': 'ControlLeft',
  });
  assert.equal(
    new Set(Object.values(DEFAULT_CONTROL_BINDINGS)).size,
    CONTROL_BINDING_DEFINITIONS.length
  );
});

test('sanitizes malformed, reserved and duplicate saved values', () => {
  const sanitized = sanitizeControlBindings({
    'p1.left': 'KeyQ',
    'p1.right': 'KeyQ',
    'p1.up': 'KeyP',
    'p2.left': null,
  });
  assert.equal(sanitized['p1.left'], 'KeyQ');
  assert.equal(sanitized['p1.right'], 'KeyG');
  assert.equal(sanitized['p1.up'], 'KeyR');
  assert.equal(sanitized['p2.left'], 'ArrowLeft');
});

test('rejects global reserved keys', () => {
  for (const code of RESERVED_CONTROL_CODES) {
    const result = validateControlBinding(
      DEFAULT_CONTROL_BINDINGS,
      'p1.left',
      code
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'reserved-key');
  }
});

test('rejects a key already assigned to another gameplay action', () => {
  const result = validateControlBinding(
    DEFAULT_CONTROL_BINDINGS,
    'p1.left',
    'ArrowLeft'
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'key-conflict');
  assert.equal(result.conflictId, 'p2.left');
});

test('returns a complete binding set for a valid change', () => {
  const result = validateControlBinding(
    DEFAULT_CONTROL_BINDINGS,
    'p1.left',
    'KeyQ'
  );
  assert.equal(result.ok, true);
  assert.equal(result.bindings['p1.left'], 'KeyQ');
  assert.equal(result.bindings['p2.powerAlternate'], 'ControlLeft');
});

test('resets one player and resolves cross-player use of its defaults', () => {
  const custom = cloneDefaultControlBindings();
  custom['p1.left'] = 'KeyQ';
  custom['p2.left'] = 'KeyD';
  const reset = resetControlBindings(custom, 'player1');
  assert.equal(reset['p1.left'], 'KeyD');
  assert.equal(reset['p2.left'], 'ArrowLeft');
});

test('builds exact keyboard configurations for both players', () => {
  const playerOne = getPlayerKeyboardConfig(DEFAULT_CONTROL_BINDINGS, 1);
  const playerTwo = getPlayerKeyboardConfig(DEFAULT_CONTROL_BINDINGS, 2);
  assert.deepEqual(playerOne.powerHit, ['KeyZ', 'ShiftLeft']);
  assert.equal(playerOne.downRight, 'KeyF');
  assert.deepEqual(playerTwo.powerHit, ['Enter', 'ControlLeft']);
  assert.equal(playerTwo.downRight, null);
});

test('serializes and parses the current storage version', () => {
  const custom = cloneDefaultControlBindings();
  custom['p1.left'] = 'KeyQ';
  assert.deepEqual(parseControlBindings(serializeControlBindings(custom)), custom);
});

test('recovers defaults from invalid JSON or obsolete versions', () => {
  assert.deepEqual(parseControlBindings('{broken'), DEFAULT_CONTROL_BINDINGS);
  assert.deepEqual(
    parseControlBindings(JSON.stringify({ version: 99, bindings: {} })),
    DEFAULT_CONTROL_BINDINGS
  );
});

test('formats KeyboardEvent.code values for the menu', () => {
  assert.equal(formatKeyboardCode('KeyQ'), 'Q');
  assert.equal(formatKeyboardCode('ControlLeft'), 'LEFT CTRL');
  assert.equal(formatKeyboardCode('ArrowUp'), 'UP');
  assert.equal(formatKeyboardCode('Numpad7'), 'NUM 7');
});
