'use strict';

const CONTROL_BINDING_VERSION = 1;
const CONTROL_BINDING_STORAGE_KEY = 'pv-control-bindings-v1';

const CONTROL_BINDING_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'p1.left', player: 1, action: 'moveLeft', defaultCode: 'KeyD' }),
  Object.freeze({ id: 'p1.right', player: 1, action: 'moveRight', defaultCode: 'KeyG' }),
  Object.freeze({ id: 'p1.up', player: 1, action: 'moveUp', defaultCode: 'KeyR' }),
  Object.freeze({ id: 'p1.down', player: 1, action: 'moveDown', defaultCode: 'KeyV' }),
  Object.freeze({ id: 'p1.downRight', player: 1, action: 'moveDownRight', defaultCode: 'KeyF' }),
  Object.freeze({ id: 'p1.powerPrimary', player: 1, action: 'powerHit', defaultCode: 'KeyZ' }),
  Object.freeze({ id: 'p1.powerAlternate', player: 1, action: 'powerHit', defaultCode: 'ShiftLeft' }),
  Object.freeze({ id: 'p2.left', player: 2, action: 'moveLeft', defaultCode: 'ArrowLeft' }),
  Object.freeze({ id: 'p2.right', player: 2, action: 'moveRight', defaultCode: 'ArrowRight' }),
  Object.freeze({ id: 'p2.up', player: 2, action: 'moveUp', defaultCode: 'ArrowUp' }),
  Object.freeze({ id: 'p2.down', player: 2, action: 'moveDown', defaultCode: 'ArrowDown' }),
  Object.freeze({ id: 'p2.powerPrimary', player: 2, action: 'powerHit', defaultCode: 'Enter' }),
  Object.freeze({ id: 'p2.powerAlternate', player: 2, action: 'powerHit', defaultCode: 'ControlLeft' }),
]);

const RESERVED_CONTROL_CODES = Object.freeze([
  'Escape',
  'KeyP',
  'KeyB',
]);

const DEFAULT_CONTROL_BINDINGS = Object.freeze(
  Object.fromEntries(
    CONTROL_BINDING_DEFINITIONS.map(({ id, defaultCode }) => [id, defaultCode])
  )
);

function cloneDefaultControlBindings() {
  return { ...DEFAULT_CONTROL_BINDINGS };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isValidKeyboardCode(code) {
  return (
    typeof code === 'string' &&
    code.length > 0 &&
    code.length <= 40 &&
    !/\s/.test(code)
  );
}

function getDefinition(bindingId) {
  return CONTROL_BINDING_DEFINITIONS.find(({ id }) => id === bindingId) || null;
}

function sanitizeControlBindings(value) {
  const source = isPlainObject(value?.bindings) ? value.bindings : value;
  const sanitized = cloneDefaultControlBindings();
  if (!isPlainObject(source)) return sanitized;

  for (const definition of CONTROL_BINDING_DEFINITIONS) {
    const candidate = source[definition.id];
    if (
      !isValidKeyboardCode(candidate) ||
      RESERVED_CONTROL_CODES.includes(candidate)
    ) {
      continue;
    }

    const conflict = CONTROL_BINDING_DEFINITIONS.find(
      ({ id }) => id !== definition.id && sanitized[id] === candidate
    );
    if (conflict) continue;
    sanitized[definition.id] = candidate;
  }

  return sanitized;
}

function validateControlBinding(bindings, bindingId, code) {
  const definition = getDefinition(bindingId);
  if (!definition) return { ok: false, reason: 'unknown-binding' };
  if (!isValidKeyboardCode(code)) return { ok: false, reason: 'invalid-key' };
  if (RESERVED_CONTROL_CODES.includes(code)) {
    return { ok: false, reason: 'reserved-key', code };
  }

  const current = sanitizeControlBindings(bindings);
  const conflict = CONTROL_BINDING_DEFINITIONS.find(
    ({ id }) => id !== bindingId && current[id] === code
  );
  if (conflict) {
    return {
      ok: false,
      reason: 'key-conflict',
      code,
      conflictId: conflict.id,
    };
  }

  return {
    ok: true,
    bindings: { ...current, [bindingId]: code },
    bindingId,
    code,
  };
}

function resetControlBindings(bindings, scope = 'all') {
  if (scope === 'all') return cloneDefaultControlBindings();
  const player = scope === 'player1' ? 1 : scope === 'player2' ? 2 : null;
  if (player === null) return sanitizeControlBindings(bindings);

  const next = sanitizeControlBindings(bindings);
  const targetDefinitions = CONTROL_BINDING_DEFINITIONS.filter(
    (definition) => definition.player === player
  );
  const targetIds = new Set(targetDefinitions.map(({ id }) => id));
  const targetDefaultCodes = new Set(
    targetDefinitions.map(({ defaultCode }) => defaultCode)
  );

  for (const definition of targetDefinitions) {
    next[definition.id] = definition.defaultCode;
  }

  for (const definition of CONTROL_BINDING_DEFINITIONS) {
    if (
      !targetIds.has(definition.id) &&
      targetDefaultCodes.has(next[definition.id])
    ) {
      next[definition.id] = definition.defaultCode;
    }
  }

  return sanitizeControlBindings(next);
}

function getPlayerKeyboardConfig(bindings, player) {
  const current = sanitizeControlBindings(bindings);
  const prefix = player === 2 ? 'p2' : 'p1';
  return {
    left: current[`${prefix}.left`],
    right: current[`${prefix}.right`],
    up: current[`${prefix}.up`],
    down: current[`${prefix}.down`],
    downRight: player === 1 ? current['p1.downRight'] : null,
    powerHit: [
      current[`${prefix}.powerPrimary`],
      current[`${prefix}.powerAlternate`],
    ],
  };
}

function formatKeyboardCode(code) {
  const labels = {
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ShiftLeft: 'LEFT SHIFT',
    ShiftRight: 'RIGHT SHIFT',
    ControlLeft: 'LEFT CTRL',
    ControlRight: 'RIGHT CTRL',
    AltLeft: 'LEFT ALT',
    AltRight: 'RIGHT ALT',
    MetaLeft: 'LEFT META',
    MetaRight: 'RIGHT META',
    Enter: 'ENTER',
    Space: 'SPACE',
    Backspace: 'BACKSPACE',
    Tab: 'TAB',
  };
  if (labels[code]) return labels[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return code.replace('Numpad', 'NUM ' ).toUpperCase();
  return String(code || '').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

function serializeControlBindings(bindings) {
  return JSON.stringify({
    version: CONTROL_BINDING_VERSION,
    bindings: sanitizeControlBindings(bindings),
  });
}

function parseControlBindings(serialized) {
  if (typeof serialized !== 'string' || serialized.length === 0) {
    return cloneDefaultControlBindings();
  }
  try {
    const parsed = JSON.parse(serialized);
    if (parsed?.version !== CONTROL_BINDING_VERSION) {
      return cloneDefaultControlBindings();
    }
    return sanitizeControlBindings(parsed);
  } catch {
    return cloneDefaultControlBindings();
  }
}

module.exports = {
  CONTROL_BINDING_VERSION,
  CONTROL_BINDING_STORAGE_KEY,
  CONTROL_BINDING_DEFINITIONS,
  RESERVED_CONTROL_CODES,
  DEFAULT_CONTROL_BINDINGS,
  cloneDefaultControlBindings,
  sanitizeControlBindings,
  validateControlBinding,
  resetControlBindings,
  getPlayerKeyboardConfig,
  formatKeyboardCode,
  serializeControlBindings,
  parseControlBindings,
};
