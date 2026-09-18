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
const presentationMathModule = require('../src/resources/js/presentation_math.cjs');

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

test('native parity freezes extracted shared presentation formulas', () => {
  assert.deepEqual(presentationMathModule.FIGHT_SIZE_SEQUENCE, [
    20,
    22,
    25,
    27,
    30,
    27,
    25,
    22,
    20,
  ]);
  assert.equal(presentationMathModule.stepIntroMarkAlpha(1, 0), 0.04);
  assert.equal(presentationMathModule.getPlayerScaleX(1, 3, -1), -1);
  assert.equal(presentationMathModule.getPlayerScaleX(2, 3, 1), 1);
  assert.deepEqual(
    presentationMathModule.getPunchLayout({
      punchEffectRadius: 20,
      punchEffectX: 200,
      punchEffectY: 272,
    }),
    {
      visible: true,
      x: 200,
      y: 272,
      width: 36,
      height: 36,
    }
  );
  assert.deepEqual(
    presentationMathModule.getGameEndLayout(50, 96, 24),
    {
      visible: true,
      x: 168,
      y: 50,
      width: 96,
      height: 24,
    }
  );

  const source = read('src/resources/js/view.js');
  assert.match(source, /this\.messages\.ready\.x = 176/);
  assert.match(source, /this\.messages\.ready\.y = 38/);
  assert.match(source, /getPlayerFrameIndex\(state, frameNumber\)/);
});


test('native menu reuses production locale/control policy and exact link allowlist', () => {
  const source = read('src/resources/js/native_menu_state.js');
  assert.match(source, /getIntegratedMenuStrings/);
  assert.match(source, /SUPPORTED_LOCALES/);
  assert.match(source, /CONTROL_BINDING_DEFINITIONS/);
  assert.match(source, /previewControlBinding/);
  assert.match(source, /https:\/\/santiagorodriguez\.com/);
  assert.match(
    source,
    /https:\/\/github\.com\/santirodriguez\/pikachu-volleyball/
  );
  assert.match(
    source,
    /https:\/\/github\.com\/gorisanson\/pikachu-volleyball/
  );
  assert.doesNotMatch(source, /child_process|exec\(|spawn\(|shell:/);
});

test('native app exposes one menu state to keyboard pointer accessibility and platform host', () => {
  const source = read('src/resources/js/native_app.js');
  assert.match(source, /createNativeMenuState/);
  assert.match(source, /handlePointer/);
  assert.match(source, /handleAccessibilityAction/);
  assert.match(source, /getMenuFrameJson/);
  assert.match(source, /drainPlatformCommands/);
  assert.match(source, /getAllowedExternalUrls/);
});
