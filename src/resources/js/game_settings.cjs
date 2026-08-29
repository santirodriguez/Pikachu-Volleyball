'use strict';

const GAME_SETTING_NAMES = Object.freeze([
  'graphic',
  'bgm',
  'sfx',
  'speed',
  'winningScore',
]);

const FPS_BY_SPEED = Object.freeze({
  slow: 20,
  medium: 25,
  fast: 30,
});

const THEME_COLOR_LIGHT = '#FFFFFF';
const THEME_COLOR_DARK = '#202124';

function applyColorScheme(colorScheme, documentObject = document) {
  if (!['light', 'dark'].includes(colorScheme)) return false;
  documentObject.documentElement.dataset.colorScheme = colorScheme;
  const themeColorMetaElement = documentObject.querySelector(
    'meta[name="theme-color"]'
  );
  themeColorMetaElement?.setAttribute(
    'content',
    colorScheme === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
  );
  return true;
}

function applyGameSetting(
  name,
  value,
  pikaVolley,
  ticker,
  documentObject = document
) {
  if (name === 'graphic') {
    if (!['sharp', 'soft'].includes(value)) return false;
    documentObject
      .getElementById('game-canvas')
      ?.classList.toggle('graphic-soft', value === 'soft');
    return true;
  }

  if (name === 'bgm') {
    if (!['on', 'off'].includes(value)) return false;
    pikaVolley.audio.turnBGMVolume(value === 'on');
    return true;
  }

  if (name === 'sfx') {
    if (!['stereo', 'mono', 'off'].includes(value)) return false;
    pikaVolley.audio.turnSFXVolume(value !== 'off');
    if (value !== 'off') {
      pikaVolley.isStereoSound = value === 'stereo';
    }
    return true;
  }

  if (name === 'speed') {
    const fps = FPS_BY_SPEED[value];
    if (fps === undefined) return false;
    pikaVolley.normalFPS = fps;
    ticker.maxFPS = fps;
    return true;
  }

  if (name === 'winningScore') {
    const numericValue = Number(value);
    if (![5, 10, 15].includes(numericValue)) return false;
    pikaVolley.winningScore = numericValue;
    return true;
  }

  return false;
}

function hydrateGameSettings(
  settings,
  pikaVolley,
  ticker,
  documentObject = document
) {
  for (const name of GAME_SETTING_NAMES) {
    applyGameSetting(name, settings[name], pikaVolley, ticker, documentObject);
  }
}

module.exports = {
  GAME_SETTING_NAMES,
  FPS_BY_SPEED,
  THEME_COLOR_LIGHT,
  THEME_COLOR_DARK,
  applyColorScheme,
  applyGameSetting,
  hydrateGameSettings,
};
