'use strict';

import { loadControlBindings, saveControlBindings } from './control_bindings.js';
import controlBindingsModule from './control_bindings.cjs';
import menuLogicModule from './menu_logic.cjs';
import settingsStoreModule from './settings_store.cjs';
import gameSettingsModule from './game_settings.cjs';
import { settingsStore } from './settings_store.js';

const {
  CONTROL_BINDING_DEFINITIONS,
  sanitizeControlBindings,
  validateControlBinding,
  resetControlBindings,
  getPlayerKeyboardConfig,
  formatKeyboardCode,
} = controlBindingsModule;
const { buildLocaleUrl, normalizeLocale } = menuLogicModule;
const { DEFAULT_SETTINGS } = settingsStoreModule;
const { applyColorScheme, applyGameSetting } = gameSettingsModule;

/**
 * Build the single command surface used by the integrated menu.
 * @param {import('./pikavolley.js').PikachuVolleyball} pikaVolley
 * @param {import('@pixi/ticker').Ticker} ticker
 */
export function createGameCommands(pikaVolley, ticker) {
  let controlBindings = loadControlBindings();
  let appSettings = settingsStore.getSettings();

  function resetInputs() {
    for (const keyboard of pikaVolley.keyboardArray) keyboard.reset();
  }

  function applyControlBindingsToGame(bindings, persist = false) {
    controlBindings = sanitizeControlBindings(bindings);
    pikaVolley.keyboardArray[0].setBindings(
      getPlayerKeyboardConfig(controlBindings, 1)
    );
    pikaVolley.keyboardArray[1].setBindings(
      getPlayerKeyboardConfig(controlBindings, 2)
    );
    resetInputs();
    if (persist) saveControlBindings(controlBindings);
    return { ...controlBindings };
  }

  applyControlBindingsToGame(controlBindings);

  function emitPauseState() {
    window.dispatchEvent(
      new CustomEvent('pv-pause-changed', {
        detail: { paused: pikaVolley.paused },
      })
    );
  }

  function setPaused(paused) {
    pikaVolley.paused = Boolean(paused);
    resetInputs();
    emitPauseState();
    return pikaVolley.paused;
  }

  function togglePaused() {
    return setPaused(!pikaVolley.paused);
  }

  function restartMatch() {
    setPaused(false);
    pikaVolley.restart();
    resetInputs();
  }

  function getCurrentLocale() {
    return normalizeLocale(document.documentElement.lang);
  }

  function getSettings() {
    return {
      ...appSettings,
      winningScore: String(pikaVolley.winningScore),
      practiceMode: pikaVolley.isPracticeMode,
      locale: getCurrentLocale(),
      controlBindings: { ...controlBindings },
      controlDefinitions: CONTROL_BINDING_DEFINITIONS.map((definition) => ({
        ...definition,
      })),
    };
  }

  function setPersistedGameSetting(name, value) {
    if (!settingsStore.set(name, value)) return false;
    if (!applyGameSetting(name, value, pikaVolley, ticker, document)) {
      return false;
    }
    appSettings = { ...appSettings, [name]: value };
    return true;
  }

  function setGraphic(value) {
    return setPersistedGameSetting('graphic', value);
  }
  function setBgm(value) {
    return setPersistedGameSetting('bgm', value);
  }
  function setSfx(value) {
    return setPersistedGameSetting('sfx', value);
  }
  function setSpeed(value) {
    return setPersistedGameSetting('speed', value);
  }

  function setColorScheme(value) {
    if (!settingsStore.set('colorScheme', value)) return false;
    if (!applyColorScheme(value, document)) return false;
    appSettings = { ...appSettings, colorScheme: value };
    return true;
  }

  function isMatchInProgress() {
    return ![
      pikaVolley.intro,
      pikaVolley.menu,
      pikaVolley.afterMenuSelection,
      pikaVolley.beforeStartOfNewGame,
    ].includes(pikaVolley.state);
  }

  function setWinningScore(value) {
    const numericValue = Number(value);
    if (![5, 10, 15].includes(numericValue)) {
      return { ok: false, reason: 'invalid' };
    }
    if (pikaVolley.isPracticeMode) {
      return { ok: false, reason: 'practice-mode' };
    }
    if (
      isMatchInProgress() &&
      pikaVolley.scores.some((score) => score >= numericValue)
    ) {
      return { ok: false, reason: 'score-reached' };
    }
    if (!setPersistedGameSetting('winningScore', String(numericValue))) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true };
  }

  function setPracticeMode(enabled) {
    pikaVolley.isPracticeMode = Boolean(enabled);
    return true;
  }

  function resetDefaults() {
    setPracticeMode(false);
    settingsStore.resetDefaults();
    for (const [name, value] of Object.entries(DEFAULT_SETTINGS)) {
      applyGameSetting(name, value, pikaVolley, ticker, document);
    }
    appSettings = { ...appSettings, ...DEFAULT_SETTINGS };
  }

  function previewControlBinding(bindingId, code) {
    return validateControlBinding(controlBindings, bindingId, code);
  }

  function setControlBinding(bindingId, code) {
    const result = validateControlBinding(controlBindings, bindingId, code);
    if (!result.ok) return result;
    applyControlBindingsToGame(result.bindings, true);
    return {
      ok: true,
      bindingId,
      code,
      label: formatKeyboardCode(code),
      bindings: { ...controlBindings },
    };
  }

  function resetControlBindingScope(scope) {
    const next = resetControlBindings(controlBindings, scope);
    applyControlBindingsToGame(next, true);
    return { ok: true, scope, bindings: { ...controlBindings } };
  }

  function isDesktop() {
    const queryDesktop =
      new URLSearchParams(window.location.search).get('desktop') === '1';
    return Boolean(window.pvDesktop?.isDesktop || queryDesktop);
  }

  function changeLanguage(locale) {
    window.location.assign(
      buildLocaleUrl(window.location.href, locale, isDesktop())
    );
  }

  async function quit() {
    if (!window.pvDesktop?.quit) return false;
    await window.pvDesktop.quit();
    return true;
  }

  return Object.freeze({
    setPaused,
    togglePaused,
    isPaused: () => pikaVolley.paused,
    restartMatch,
    resetInputs,
    getSettings,
    setGraphic,
    setColorScheme,
    setBgm,
    setSfx,
    setSpeed,
    setWinningScore,
    setPracticeMode,
    resetDefaults,
    previewControlBinding,
    setControlBinding,
    resetControlBindingScope,
    formatControlCode: formatKeyboardCode,
    isMatchInProgress,
    getCurrentLocale,
    isDesktop,
    changeLanguage,
    quit,
  });
}
