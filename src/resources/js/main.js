/**
 * Lightweight application bootstrap.
 *
 * The game runtime is imported only after the initial shell has had a chance to
 * paint, keeping Pixi and the game implementation off the critical startup path.
 */
'use strict';

const BOOTSTRAP_ERROR_MESSAGES = Object.freeze({
  en: 'Unable to start the game.',
  'es-ar': 'No se pudo iniciar el juego.',
  ca: "No s'ha pogut iniciar el joc.",
  ko: '게임을 시작할 수 없습니다.',
  zh: '无法启动游戏。',
});

markPerformance('pv-bootstrap-start');
prepareIntegratedMenuShell();
prepareLoadingShell();
scheduleGameRuntime();

/**
 * Hide the legacy toolbar and load integrated menu styles before the game runtime.
 */
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

/**
 * Prepare the existing loading shell without initializing the game runtime.
 */
function prepareLoadingShell() {
  const loadingBox = document.getElementById('loading-box');
  const aboutBox = document.getElementById('about-box');
  const gameDropdownBtn = document.getElementById('game-dropdown-btn');
  const optionsDropdownBtn = document.getElementById('options-dropdown-btn');

  if (gameDropdownBtn !== null) gameDropdownBtn.disabled = true;
  if (optionsDropdownBtn !== null) optionsDropdownBtn.disabled = true;
  aboutBox?.classList.add('hidden');
  loadingBox?.classList.remove('hidden');
}

/**
 * Wait for the initial shell paint before importing the heavy game runtime.
 */
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

/**
 * Keep startup failures visible instead of leaving the loading shell hanging.
 * @param {unknown} error
 */
function showBootstrapError(error) {
  console.error('Failed to start Pikachu Volleyball runtime.', error);
  const loadingBox = document.getElementById('loading-box');
  const message = loadingBox?.querySelector('p');
  if (message !== null && message !== undefined) {
    message.textContent = getBootstrapErrorMessage();
  }
  loadingBox?.classList.remove('hidden');
}

/**
 * Return the localized startup failure message for the current page.
 * @returns {string}
 */
function getBootstrapErrorMessage() {
  const locale = document.documentElement.lang.toLowerCase();
  return BOOTSTRAP_ERROR_MESSAGES[locale] || BOOTSTRAP_ERROR_MESSAGES.en;
}

/**
 * Add a performance mark when supported by the current runtime.
 * @param {string} name
 */
function markPerformance(name) {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(name);
  }
}
