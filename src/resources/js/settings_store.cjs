'use strict';

const STORAGE_KEYS = Object.freeze({
  graphic: 'pv-offline-graphic',
  bgm: 'pv-offline-bgm',
  sfx: 'pv-offline-sfx',
  speed: 'pv-offline-speed',
  winningScore: 'pv-offline-winningScore',
  colorScheme: 'colorScheme',
});

const DEFAULT_SETTINGS = Object.freeze({
  graphic: 'sharp',
  bgm: 'on',
  sfx: 'stereo',
  speed: 'medium',
  winningScore: '15',
});

const VALID_VALUES = Object.freeze({
  graphic: Object.freeze(['sharp', 'soft']),
  bgm: Object.freeze(['on', 'off']),
  sfx: Object.freeze(['stereo', 'mono', 'off']),
  speed: Object.freeze(['slow', 'medium', 'fast']),
  winningScore: Object.freeze(['5', '10', '15']),
  colorScheme: Object.freeze(['light', 'dark']),
});

const RESETTABLE_SETTING_NAMES = Object.freeze(Object.keys(DEFAULT_SETTINGS));

function sanitizeSetting(name, value) {
  const validValues = VALID_VALUES[name];
  if (!validValues || !validValues.includes(value)) return null;
  return value;
}

function normalizeSystemColorScheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

function createSettingsStore(storage, getSystemColorScheme = () => 'light') {
  function readSetting(name) {
    return sanitizeSetting(name, storage.get(STORAGE_KEYS[name]));
  }

  function getSettings() {
    const settings = {};
    for (const name of RESETTABLE_SETTING_NAMES) {
      settings[name] = readSetting(name) || DEFAULT_SETTINGS[name];
    }
    settings.colorScheme =
      readSetting('colorScheme') ||
      normalizeSystemColorScheme(getSystemColorScheme());
    return settings;
  }

  function set(name, value) {
    const sanitized = sanitizeSetting(name, value);
    if (sanitized === null) return false;
    storage.set(STORAGE_KEYS[name], sanitized);
    return true;
  }

  function resetDefaults() {
    for (const name of RESETTABLE_SETTING_NAMES) {
      storage.set(STORAGE_KEYS[name], DEFAULT_SETTINGS[name]);
    }
    return getSettings();
  }

  return Object.freeze({
    getSettings,
    set,
    resetDefaults,
  });
}

module.exports = {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  VALID_VALUES,
  RESETTABLE_SETTING_NAMES,
  sanitizeSetting,
  normalizeSystemColorScheme,
  createSettingsStore,
};
