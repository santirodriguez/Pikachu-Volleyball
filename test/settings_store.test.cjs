'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  createSettingsStore,
} = require('../src/resources/js/settings_store.cjs');
const {
  applyColorScheme,
  applyGameSetting,
  hydrateGameSettings,
} = require('../src/resources/js/game_settings.cjs');

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => values.set(key, value),
    values,
  };
}

function createRuntimeFixture() {
  const canvasClasses = new Set();
  const canvas = {
    classList: {
      toggle(name, enabled) {
        if (enabled) canvasClasses.add(name);
        else canvasClasses.delete(name);
      },
    },
  };
  const themeMeta = {
    content: null,
    setAttribute(name, value) {
      if (name === 'content') this.content = value;
    },
  };
  const documentObject = {
    documentElement: { dataset: {} },
    getElementById: (id) => (id === 'game-canvas' ? canvas : null),
    querySelector: (selector) =>
      selector === 'meta[name="theme-color"]' ? themeMeta : null,
  };
  const bgmCalls = [];
  const sfxCalls = [];
  const pikaVolley = {
    audio: {
      turnBGMVolume: (enabled) => bgmCalls.push(enabled),
      turnSFXVolume: (enabled) => sfxCalls.push(enabled),
    },
    isStereoSound: true,
    normalFPS: 25,
    winningScore: 15,
  };
  const ticker = { maxFPS: 25 };
  return {
    canvasClasses,
    themeMeta,
    documentObject,
    bgmCalls,
    sfxCalls,
    pikaVolley,
    ticker,
  };
}

test('returns historical defaults when no persisted settings exist', () => {
  const store = createSettingsStore(createMemoryStorage(), () => 'light');
  assert.deepEqual(store.getSettings(), {
    ...DEFAULT_SETTINGS,
    colorScheme: 'light',
  });
});

test('loads every valid persisted setting without changing its value', () => {
  const storage = createMemoryStorage({
    [STORAGE_KEYS.graphic]: 'soft',
    [STORAGE_KEYS.bgm]: 'off',
    [STORAGE_KEYS.sfx]: 'mono',
    [STORAGE_KEYS.speed]: 'fast',
    [STORAGE_KEYS.winningScore]: '10',
    [STORAGE_KEYS.colorScheme]: 'dark',
  });
  const store = createSettingsStore(storage, () => 'light');
  assert.deepEqual(store.getSettings(), {
    graphic: 'soft',
    bgm: 'off',
    sfx: 'mono',
    speed: 'fast',
    winningScore: '10',
    colorScheme: 'dark',
  });
});

test('falls back safely from invalid persisted values', () => {
  const storage = createMemoryStorage({
    [STORAGE_KEYS.graphic]: 'blurred',
    [STORAGE_KEYS.bgm]: 'yes',
    [STORAGE_KEYS.sfx]: 'surround',
    [STORAGE_KEYS.speed]: 'turbo',
    [STORAGE_KEYS.winningScore]: '99',
    [STORAGE_KEYS.colorScheme]: 'sepia',
  });
  const store = createSettingsStore(storage, () => 'dark');
  assert.deepEqual(store.getSettings(), {
    ...DEFAULT_SETTINGS,
    colorScheme: 'dark',
  });
});

test('saves valid updates and rejects unknown or invalid settings', () => {
  const storage = createMemoryStorage();
  const store = createSettingsStore(storage);
  assert.equal(store.set('speed', 'slow'), true);
  assert.equal(storage.values.get(STORAGE_KEYS.speed), 'slow');
  assert.equal(store.set('speed', 'turbo'), false);
  assert.equal(storage.values.get(STORAGE_KEYS.speed), 'slow');
  assert.equal(store.set('practiceMode', 'true'), false);
  assert.equal(storage.values.has('practiceMode'), false);
});

test('reset defaults restores gameplay settings without overwriting theme', () => {
  const storage = createMemoryStorage({
    [STORAGE_KEYS.graphic]: 'soft',
    [STORAGE_KEYS.bgm]: 'off',
    [STORAGE_KEYS.sfx]: 'mono',
    [STORAGE_KEYS.speed]: 'fast',
    [STORAGE_KEYS.winningScore]: '5',
    [STORAGE_KEYS.colorScheme]: 'dark',
  });
  const store = createSettingsStore(storage, () => 'light');
  assert.deepEqual(store.resetDefaults(), {
    ...DEFAULT_SETTINGS,
    colorScheme: 'dark',
  });
});

test('uses system theme only when no explicit theme is persisted', () => {
  const storage = createMemoryStorage();
  const store = createSettingsStore(storage, () => 'dark');
  assert.equal(store.getSettings().colorScheme, 'dark');
  assert.equal(storage.values.has(STORAGE_KEYS.colorScheme), false);
  assert.equal(store.set('colorScheme', 'light'), true);
  assert.equal(store.getSettings().colorScheme, 'light');
});

test('hydrates graphics, audio, speed and winning score exactly from settings', () => {
  const fixture = createRuntimeFixture();
  hydrateGameSettings(
    {
      graphic: 'soft',
      bgm: 'off',
      sfx: 'mono',
      speed: 'fast',
      winningScore: '10',
    },
    fixture.pikaVolley,
    fixture.ticker,
    fixture.documentObject
  );
  assert.equal(fixture.canvasClasses.has('graphic-soft'), true);
  assert.deepEqual(fixture.bgmCalls, [false]);
  assert.deepEqual(fixture.sfxCalls, [true]);
  assert.equal(fixture.pikaVolley.isStereoSound, false);
  assert.equal(fixture.pikaVolley.normalFPS, 30);
  assert.equal(fixture.ticker.maxFPS, 30);
  assert.equal(fixture.pikaVolley.winningScore, 10);
});

test('SFX off preserves the current stereo mode while muting effects', () => {
  const fixture = createRuntimeFixture();
  fixture.pikaVolley.isStereoSound = false;
  assert.equal(
    applyGameSetting(
      'sfx',
      'off',
      fixture.pikaVolley,
      fixture.ticker,
      fixture.documentObject
    ),
    true
  );
  assert.deepEqual(fixture.sfxCalls, [false]);
  assert.equal(fixture.pikaVolley.isStereoSound, false);
});

test('applies light and dark themes without using legacy checkboxes', () => {
  const fixture = createRuntimeFixture();
  assert.equal(applyColorScheme('dark', fixture.documentObject), true);
  assert.equal(
    fixture.documentObject.documentElement.dataset.colorScheme,
    'dark'
  );
  assert.equal(fixture.themeMeta.content, '#202124');
  assert.equal(applyColorScheme('light', fixture.documentObject), true);
  assert.equal(
    fixture.documentObject.documentElement.dataset.colorScheme,
    'light'
  );
  assert.equal(fixture.themeMeta.content, '#FFFFFF');
  assert.equal(applyColorScheme('sepia', fixture.documentObject), false);
});
