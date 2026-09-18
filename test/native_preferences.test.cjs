'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const controlsModule = require('../src/resources/js/control_bindings.cjs');
const {
  normalizeNativePreferences,
  serializeNativePreferences,
} = require('../src/resources/js/native_preferences.cjs');

test('native preferences accept migration wrapper and sanitize through shared rules', () => {
  const serialized = JSON.stringify({
    schema: 1,
    values: {
      'pv-offline-graphic': 'soft',
      'pv-offline-bgm': 'off',
      'pv-offline-sfx': 'mono',
      'pv-offline-speed': 'fast',
      'pv-offline-winningScore': '10',
      colorScheme: 'dark',
      'pv-control-bindings-v1': JSON.stringify({
        version: 1,
        bindings: {
          ...controlsModule.DEFAULT_CONTROL_BINDINGS,
          'p1.left': 'KeyA',
        },
      }),
    },
  });

  const result = normalizeNativePreferences(serialized);
  assert.deepEqual(result.settings, {
    graphic: 'soft',
    bgm: 'off',
    sfx: 'mono',
    speed: 'fast',
    winningScore: '10',
    colorScheme: 'dark',
  });
  assert.equal(result.controlBindings['p1.left'], 'KeyA');
});

test('native preferences fail closed to shared defaults for invalid values', () => {
  const result = normalizeNativePreferences(
    JSON.stringify({
      'pv-offline-graphic': 'blur',
      'pv-offline-speed': 'turbo',
      'pv-offline-winningScore': '99',
      colorScheme: 'sepia',
      'pv-control-bindings-v1': '{broken',
    })
  );
  assert.equal(result.settings.graphic, 'sharp');
  assert.equal(result.settings.speed, 'medium');
  assert.equal(result.settings.winningScore, '15');
  assert.equal(result.settings.colorScheme, 'light');
  assert.deepEqual(
    result.controlBindings,
    controlsModule.DEFAULT_CONTROL_BINDINGS
  );
});

test('native preferences serialize exactly the seven accepted persisted keys', () => {
  const serialized = serializeNativePreferences(
    {
      graphic: 'soft',
      bgm: 'off',
      sfx: 'mono',
      speed: 'slow',
      winningScore: '5',
      colorScheme: 'dark',
    },
    {
      ...controlsModule.DEFAULT_CONTROL_BINDINGS,
      'p2.left': 'KeyJ',
    }
  );
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.schema, 1);
  assert.deepEqual(Object.keys(parsed.values).sort(), [
    'colorScheme',
    'pv-control-bindings-v1',
    'pv-offline-bgm',
    'pv-offline-graphic',
    'pv-offline-sfx',
    'pv-offline-speed',
    'pv-offline-winningScore',
  ]);
  assert.equal(parsed.values['pv-offline-graphic'], 'soft');
  assert.equal(parsed.values['pv-offline-winningScore'], '5');
  assert.equal(
    JSON.parse(parsed.values['pv-control-bindings-v1']).bindings['p2.left'],
    'KeyJ'
  );
});
