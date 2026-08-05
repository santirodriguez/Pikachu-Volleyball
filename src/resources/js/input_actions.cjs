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

function normalizeKeyCodes(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.filter((code) => typeof code === 'string' && code))];
}

function normalizeBindings(bindings) {
  const normalized = {};
  for (const [action, codes] of Object.entries(bindings)) {
    normalized[action] = normalizeKeyCodes(codes);
  }
  return normalized;
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
    if (!this.boundCodes.has(code)) {
      return false;
    }
    this.downCodes.add(code);
    return true;
  }

  handleKeyUp(code) {
    if (!this.boundCodes.has(code)) {
      return false;
    }
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
  InputActionState,
  normalizeKeyCodes,
};
