/**
 * Lightweight application bootstrap.
 *
 * The game runtime is imported only after the initial shell has had a chance to
 * paint, keeping Pixi and the game implementation off the critical startup path.
 */
'use strict';

import { settingsStore } from './settings_store.js';
import gameSettingsModule from './game_settings.cjs';

const { applyColorScheme } = gameSettingsModule;
const BOOTSTRAP_ERROR_MESSAGES = Object.freeze({
  en: 'Unable to start the game.',
  'es-ar': 'No se pudo iniciar el juego.',
  ca: "No s'ha pogut iniciar el joc.",
  ko: '게임을 시작할 수 없습니다.',
  zh: '无法启动游戏。',
});

markPerformance('pv-bootstrap-start');
applyColorScheme(settingsStore.getSettings().colorScheme, document);
prepareIntegratedMenuShell();
prepareLoadingShell();
scheduleGameRuntime();

function prepareIntegratedMenuShell() {
  document.documentElement.classList.add('integrated-menu-enabled');
  const stylesheets = [
    ['integrated-menu-stylesheet', '../resources/integrated-menu.css'],
    ['phase3-menu-stylesheet', '../resources/phase3-menu.css'],
  ];
  for (const [id, href] of stylesheets) {
    if (document.getElementById(id) !== null) continue;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

function prepareLoadingShell() {
  document.getElementById('loading-box')?.classList.remove('hidden');
}

function scheduleGameRuntime() {
  window.requestAnimationFrame(() => {
    markPerformance('pv-shell-ready');
    window.requestAnimationFrame(async () => {
      markPerformance('pv-runtime-import-start');
      try {
        const { startGameRuntime } = await import('./game_runtime.js');
        startGameRuntime();
      } catch (error) {
        showBootstrapError(error);
      }
    });
  });
}

function showBootstrapError(error) {
  console.error('Failed to start Pikachu Volleyball runtime.', error);
  const loadingBox = document.getElementById('loading-box');
  const message = loadingBox?.querySelector('p');
  if (message !== null && message !== undefined) message.textContent = getBootstrapErrorMessage();
  loadingBox?.classList.remove('hidden');
}

function getBootstrapErrorMessage() {
  const locale = document.documentElement.lang.toLowerCase();
  return BOOTSTRAP_ERROR_MESSAGES[locale] || BOOTSTRAP_ERROR_MESSAGES.en;
}

function markPerformance(name) {
  if (typeof performance !== 'undefined' && performance.mark) performance.mark(name);
}
