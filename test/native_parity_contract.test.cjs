'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const settingsModule = require('../src/resources/js/settings_store.cjs');
const controlsModule = require('../src/resources/js/control_bindings.cjs');
const inputModule = require('../src/resources/js/input_actions.cjs');
const menuModule = require('../src/resources/js/menu_logic.cjs');
const presentationModule = require('../src/resources/js/game_presentation.cjs');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('native parity freezes application setting values and defaults', () => {
  assert.deepEqual(settingsModule.DEFAULT_SETTINGS, {
    graphic: 'sharp',
    bgm: 'on',
    sfx: 'stereo',
    speed: 'medium',
    winningScore: '15',
  });
  assert.deepEqual(settingsModule.VALID_VALUES.graphic, ['sharp', 'soft']);
  assert.deepEqual(settingsModule.VALID_VALUES.bgm, ['on', 'off']);
  assert.deepEqual(settingsModule.VALID_VALUES.sfx, ['stereo', 'mono', 'off']);
  assert.deepEqual(settingsModule.VALID_VALUES.speed, ['slow', 'medium', 'fast']);
  assert.deepEqual(settingsModule.VALID_VALUES.winningScore, ['5', '10', '15']);
  assert.deepEqual(settingsModule.VALID_VALUES.colorScheme, ['light', 'dark']);
});

test('native parity freezes control schema and recovery keys', () => {
  assert.equal(controlsModule.CONTROL_BINDING_VERSION, 1);
  assert.equal(controlsModule.CONTROL_BINDING_STORAGE_KEY, 'pv-control-bindings-v1');
  assert.deepEqual(controlsModule.RESERVED_CONTROL_CODES, [
    'Escape',
    'KeyP',
    'KeyB',
  ]);
  assert.deepEqual(controlsModule.DEFAULT_CONTROL_BINDINGS, {
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
});

test('native parity freezes semantic actions and power-hit alternates', () => {
  assert.equal(inputModule.INPUT_ACTIONS.PAUSE, 'pause');
  assert.equal(inputModule.INPUT_ACTIONS.PRACTICE_RESET, 'practiceReset');
  assert.equal(inputModule.GLOBAL_PAUSE_KEY, 'KeyP');
  assert.deepEqual(inputModule.getPowerHitKeyCodes('KeyZ'), [
    'KeyZ',
    'ShiftLeft',
  ]);
  assert.deepEqual(inputModule.getPowerHitKeyCodes('Enter'), [
    'Enter',
    'ControlLeft',
  ]);
});

test('native parity freezes menu confirm keys and locale normalization', () => {
  assert.deepEqual(menuModule.SUPPORTED_LOCALES, ['en', 'es-ar', 'ca', 'ko', 'zh']);
  assert.deepEqual(menuModule.MENU_CONFIRM_KEYS, [
    'Enter',
    'KeyZ',
    'ShiftLeft',
    'ControlLeft',
  ]);
  assert.equal(menuModule.wrapIndex(-1, 5), 4);
  assert.equal(menuModule.normalizeLocale('es-AR'), 'es-ar');
  assert.equal(menuModule.normalizeLocale('ko-KR'), 'ko');
  assert.equal(menuModule.normalizeLocale('zh-CN'), 'zh');
  assert.equal(menuModule.normalizeLocale('unknown'), 'en');
});

test('native parity freezes detached presentation snapshot ownership', () => {
  const physics = {
    player1: {
      x: 10,
      y: 20,
      state: 3,
      frameNumber: 1,
      divingDirection: -1,
    },
    player2: {
      x: 400,
      y: 30,
      state: 5,
      frameNumber: 2,
      divingDirection: 1,
    },
    ball: {
      x: 200,
      y: 100,
      rotation: 4,
      punchEffectRadius: 12,
      punchEffectX: 205,
      punchEffectY: 110,
      isPowerHit: true,
      previousX: 195,
      previousY: 98,
      previousPreviousX: 190,
      previousPreviousY: 96,
    },
  };

  const radius = presentationModule.advancePunchEffect(physics.ball);
  assert.equal(radius, 12);
  assert.equal(physics.ball.punchEffectRadius, 10);

  assert.deepEqual(
    presentationModule.createGamePresentationState(physics, {
      punchEffectRadius: radius,
    }),
    {
      player1: {
        x: 10,
        y: 20,
        state: 3,
        frameNumber: 1,
        divingDirection: -1,
      },
      player2: {
        x: 400,
        y: 30,
        state: 5,
        frameNumber: 2,
        divingDirection: 1,
      },
      ball: {
        x: 200,
        y: 100,
        rotation: 4,
        punchEffectRadius: 12,
        punchEffectX: 205,
        punchEffectY: 110,
        isPowerHit: true,
        previousX: 195,
        previousY: 98,
        previousPreviousX: 190,
        previousPreviousY: 96,
      },
    }
  );
});

test('native parity freezes accepted audio constants', () => {
  const source = read('src/resources/js/audio.js');
  assert.match(source, /properBGMVolume = 0\.2;/);
  assert.match(source, /properSFXVolume = 0\.35;/);
  assert.match(source, /new filters\.StereoFilter\(-0\.75\)/);
  assert.match(source, /new filters\.StereoFilter\(0\.75\)/);
});

test('native parity freezes critical presentation formulas before extraction', () => {
  const source = read('src/resources/js/view.js');
  assert.match(source, /mark\.alpha \+ 1 \/ 25/);
  assert.match(source, /mark\.alpha - 1 \/ 25/);
  assert.match(source, /const sizeArray = \[20, 22, 25, 27, 30, 27, 25, 22, 20\]/);
  assert.match(source, /this\.sittingPikachuTilesDisplacement \+ 2/);
  assert.match(source, /frameCounter > 71/);
  assert.match(source, /ball\.punchEffectRadius -= 2/);
  assert.match(source, /player1\.scale\.x = player1\.divingDirection === -1 \? -1 : 1/);
  assert.match(source, /player2\.scale\.x = player2\.divingDirection === 1 \? 1 : -1/);
  assert.match(source, /this\.messages\.ready\.x = 176/);
  assert.match(source, /this\.messages\.ready\.y = 38/);
  assert.match(source, /gameEndMessage\.x = 216 - w \/ 2/);
});
