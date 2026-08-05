'use strict';

import { localStorageWrapper } from './utils/local_storage_wrapper.js';
import { loadControlBindings, saveControlBindings } from './control_bindings.js';
import controlBindingsModule from './control_bindings.cjs';
import menuLogicModule from './menu_logic.cjs';

const {
  CONTROL_BINDING_DEFINITIONS,
  sanitizeControlBindings,
  validateControlBinding,
  resetControlBindings,
  getPlayerKeyboardConfig,
  formatKeyboardCode,
} = controlBindingsModule;
const { buildLocaleUrl, normalizeLocale } = menuLogicModule;

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
  practiceMode: false,
});

/**
 * Build the single command surface used by the integrated menu.
 * @param {import('./pikavolley.js').PikachuVolleyball} pikaVolley
 * @param {import('@pixi/ticker').Ticker} ticker
 */
export function createGameCommands(pikaVolley, ticker) {
  const pauseButton = document.getElementById('pause-btn');
  let controlBindings = loadControlBindings();

  function resetInputs() {
    for (const keyboard of pikaVolley.keyboardArray) {
      keyboard.reset();
    }
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
    const nextPaused = Boolean(paused);
    pikaVolley.paused = nextPaused;
    pauseButton?.classList.toggle('selected', nextPaused);
    resetInputs();
    emitPauseState();
    return nextPaused;
  }

  function togglePaused() {
    return setPaused(!pikaVolley.paused);
  }

  function restartMatch() {
    setPaused(false);
    pikaVolley.restart();
    resetInputs();
  }

  function getStoredValue(key, fallback) {
    return localStorageWrapper.get(STORAGE_KEYS[key]) || fallback;
  }

  function getSpeedName() {
    if (pikaVolley.normalFPS === 20) return 'slow';
    if (pikaVolley.normalFPS === 30) return 'fast';
    return 'medium';
  }

  function getCurrentLocale() {
    return normalizeLocale(document.documentElement.lang);
  }

  function getSettings() {
    const canvas = document.getElementById('game-canvas');
    return {
      graphic: getStoredValue(
        'graphic',
        canvas?.classList.contains('graphic-soft') ? 'soft' : 'sharp'
      ),
      bgm: getStoredValue('bgm', DEFAULT_SETTINGS.bgm),
      sfx: getStoredValue('sfx', DEFAULT_SETTINGS.sfx),
      speed: getStoredValue('speed', getSpeedName()),
      winningScore: String(pikaVolley.winningScore),
      practiceMode: pikaVolley.isPracticeMode,
      colorScheme: document.documentElement.dataset.colorScheme || 'light',
      locale: getCurrentLocale(),
      controlBindings: { ...controlBindings },
      controlDefinitions: CONTROL_BINDING_DEFINITIONS.map((definition) => ({
        ...definition,
      })),
    };
  }

  function setGraphic(value) {
    if (!['sharp', 'soft'].includes(value)) return false;
    document
      .getElementById('game-canvas')
      ?.classList.toggle('graphic-soft', value === 'soft');
    localStorageWrapper.set(STORAGE_KEYS.graphic, value);
    return true;
  }

  function setColorScheme(value) {
    if (!['light', 'dark'].includes(value)) return false;
    document.documentElement.dataset.colorScheme = value;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', value === 'dark' ? '#202124' : '#FFFFFF');
    document.querySelectorAll('.dark-color-scheme-checkbox').forEach((element) => {
      element.checked = value === 'dark';
    });
    localStorageWrapper.set(STORAGE_KEYS.colorScheme, value);
    return true;
  }

  function setBgm(value) {
    if (!['on', 'off'].includes(value)) return false;
    pikaVolley.audio.turnBGMVolume(value === 'on');
    localStorageWrapper.set(STORAGE_KEYS.bgm, value);
    return true;
  }

  function setSfx(value) {
    if (!['stereo', 'mono', 'off'].includes(value)) return false;
    pikaVolley.audio.turnSFXVolume(value !== 'off');
    if (value !== 'off') {
      pikaVolley.isStereoSound = value === 'stereo';
    }
    localStorageWrapper.set(STORAGE_KEYS.sfx, value);
    return true;
  }

  function setSpeed(value) {
    const fpsBySpeed = { slow: 20, medium: 25, fast: 30 };
    const fps = fpsBySpeed[value];
    if (fps === undefined) return false;
    pikaVolley.normalFPS = fps;
    ticker.maxFPS = fps;
    localStorageWrapper.set(STORAGE_KEYS.speed, value);
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
    pikaVolley.winningScore = numericValue;
    localStorageWrapper.set(STORAGE_KEYS.winningScore, String(numericValue));
    return { ok: true };
  }

  function setPracticeMode(enabled) {
    pikaVolley.isPracticeMode = Boolean(enabled);
    return true;
  }

  function resetDefaults() {
    setGraphic(DEFAULT_SETTINGS.graphic);
    setBgm(DEFAULT_SETTINGS.bgm);
    setSfx(DEFAULT_SETTINGS.sfx);
    setSpeed(DEFAULT_SETTINGS.speed);
    setPracticeMode(DEFAULT_SETTINGS.practiceMode);
    pikaVolley.winningScore = Number(DEFAULT_SETTINGS.winningScore);
    localStorageWrapper.set(
      STORAGE_KEYS.winningScore,
      DEFAULT_SETTINGS.winningScore
    );
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
