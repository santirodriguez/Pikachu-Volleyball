'use strict';

const settingsModule = require('./settings_store.cjs');
const controlsModule = require('./control_bindings.cjs');
const menuModule = require('./menu_logic.cjs');

const {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  sanitizeSetting,
  normalizeSystemColorScheme,
} = settingsModule;
const {
  CONTROL_BINDING_STORAGE_KEY,
  parseControlBindings,
  serializeControlBindings,
} = controlsModule;
const { SUPPORTED_LOCALES, normalizeLocale } = menuModule;

const NATIVE_LOCALE_STORAGE_KEY = 'pv-native-locale';

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseDocument(serialized) {
  if (typeof serialized !== 'string' || serialized.length === 0) return {};
  try {
    const parsed = JSON.parse(serialized);
    if (!isPlainObject(parsed)) return {};
    if (parsed.schema === 1 && isPlainObject(parsed.values)) {
      return parsed.values;
    }
    return parsed;
  } catch {
    return {};
  }
}

function sanitizeNativeLocale(value) {
  return SUPPORTED_LOCALES.includes(value) ? value : null;
}

function normalizeNativePreferences(
  serialized,
  systemColorScheme = 'light',
  systemLocale = 'en'
) {
  const values = parseDocument(serialized);
  const settings = {};
  for (const [name, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    settings[name] =
      sanitizeSetting(name, values[STORAGE_KEYS[name]]) || defaultValue;
  }
  settings.colorScheme =
    sanitizeSetting('colorScheme', values[STORAGE_KEYS.colorScheme]) ||
    normalizeSystemColorScheme(systemColorScheme);

  return {
    settings,
    controlBindings: parseControlBindings(
      values[CONTROL_BINDING_STORAGE_KEY]
    ),
    locale:
      sanitizeNativeLocale(values[NATIVE_LOCALE_STORAGE_KEY]) ||
      normalizeLocale(systemLocale),
  };
}

function serializeNativePreferences(settings, controlBindings, locale) {
  const values = {};
  for (const [name, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    values[STORAGE_KEYS[name]] =
      sanitizeSetting(name, settings?.[name]) || defaultValue;
  }
  values[STORAGE_KEYS.colorScheme] =
    sanitizeSetting('colorScheme', settings?.colorScheme) ||
    normalizeSystemColorScheme(settings?.colorScheme);
  values[CONTROL_BINDING_STORAGE_KEY] =
    serializeControlBindings(controlBindings);

  const sanitizedLocale = sanitizeNativeLocale(locale);
  if (sanitizedLocale !== null) {
    values[NATIVE_LOCALE_STORAGE_KEY] = sanitizedLocale;
  }

  return JSON.stringify({
    schema: 1,
    values,
  });
}

module.exports = {
  NATIVE_LOCALE_STORAGE_KEY,
  sanitizeNativeLocale,
  normalizeNativePreferences,
  serializeNativePreferences,
};
