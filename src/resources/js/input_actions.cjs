'use strict';

const INPUT_ACTIONS = Object.freeze({
  MOVE_LEFT: 'moveLeft',
  MOVE_RIGHT: 'moveRight',
  MOVE_UP: 'moveUp',
  MOVE_DOWN: 'moveDown',
  MOVE_DOWN_RIGHT: 'moveDownRight',
  POWER_HIT: 'powerHit',
  CONFIRM: 'confirm',
  BACK: 'back',
  PAUSE: 'pause',
  PRACTICE_RESET: 'practiceReset',
});

const PLAYER_ONE_PRIMARY_POWER_HIT_KEY = 'KeyZ';
const PLAYER_ONE_ALTERNATE_POWER_HIT_KEY = 'ShiftLeft';
const PLAYER_TWO_PRIMARY_POWER_HIT_KEY = 'Enter';
const PLAYER_TWO_ALTERNATE_POWER_HIT_KEY = 'ControlLeft';
const GLOBAL_PAUSE_KEY = 'KeyP';

const DEFAULT_POWER_HIT_ALTERNATES = Object.freeze({
  [PLAYER_ONE_PRIMARY_POWER_HIT_KEY]: PLAYER_ONE_ALTERNATE_POWER_HIT_KEY,
  [PLAYER_TWO_PRIMARY_POWER_HIT_KEY]: PLAYER_TWO_ALTERNATE_POWER_HIT_KEY,
});

function normalizeKeyCodes(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.filter((code) => typeof code === 'string' && code))];
}

function getPowerHitKeyCodes(powerHit) {
  const keyCodes = normalizeKeyCodes(powerHit);
  if (Array.isArray(powerHit)) return keyCodes;

  for (const [primaryKey, alternateKey] of Object.entries(
    DEFAULT_POWER_HIT_ALTERNATES
  )) {
    if (keyCodes.includes(primaryKey) && !keyCodes.includes(alternateKey)) {
      keyCodes.push(alternateKey);
    }
  }
  return keyCodes;
}

function normalizeBindings(bindings) {
  const normalized = {};
  for (const [action, codes] of Object.entries(bindings)) {
    normalized[action] = normalizeKeyCodes(codes);
  }
  return normalized;
}

function isEditableTarget(target) {
  if (target === null || typeof target !== 'object') {
    return false;
  }
  const tagName =
    typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  return (
    target.isContentEditable === true ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  );
}

function shouldHandlePauseShortcut(event) {
  return Boolean(
    event &&
      event.code === GLOBAL_PAUSE_KEY &&
      event.repeat !== true &&
      !isEditableTarget(event.target)
  );
}

class InputActionState {
  constructor(bindings) {
    this.bindings = normalizeBindings(bindings);
    this.boundCodes = new Set(Object.values(this.bindings).flat());
    this.downCodes = new Set();
    this.previousActionDown = new Map(
      Object.keys(this.bindings).map((action) => [action, false])
    );
  }

  handleKeyDown(code) {
    if (!this.boundCodes.has(code)) return false;
    this.downCodes.add(code);
    return true;
  }

  handleKeyUp(code) {
    if (!this.boundCodes.has(code)) return false;
    this.downCodes.delete(code);
    return true;
  }

  isActionDown(action) {
    const codes = this.bindings[action] || [];
    return codes.some((code) => this.downCodes.has(code));
  }

  createSnapshot() {
    const down = {};
    const pressed = {};
    for (const action of Object.keys(this.bindings)) {
      const isDown = this.isActionDown(action);
      down[action] = isDown;
      pressed[action] = isDown && !this.previousActionDown.get(action);
      this.previousActionDown.set(action, isDown);
    }
    return { down, pressed };
  }

  reset() {
    this.downCodes.clear();
    for (const action of Object.keys(this.bindings)) {
      this.previousActionDown.set(action, false);
    }
  }
}

module.exports = {
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
};
