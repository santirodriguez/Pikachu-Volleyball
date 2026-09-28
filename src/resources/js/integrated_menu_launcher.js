'use strict';

import inputActionsModule from './input_actions.cjs';
import { getIntegratedMenuStrings } from './integrated_menu_strings.js';

const { shouldHandlePauseShortcut } = inputActionsModule;

/**
 * Mount the lightweight pause trigger and load the full menu only on first use.
 * @param {ReturnType<import('./game_commands.js').createGameCommands>} commands
 */
export function setUpIntegratedMenuLauncher(commands) {
  const container = document.getElementById('game-canvas-container');
  if (container === null) return;

  addIntegratedMenuStylesheet();
  document.documentElement.classList.add('integrated-menu-enabled');

  const strings = getIntegratedMenuStrings(commands.getCurrentLocale());
  const triggerLabel = strings.trigger;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'pv-menu-trigger';
  trigger.className = 'pv-menu-trigger';
  trigger.innerHTML = `<kbd>P</kbd> ${triggerLabel}`;
  trigger.setAttribute('aria-label', `${triggerLabel} (P)`);

  const status = document.createElement('p');
  status.id = 'pv-menu-launcher-status';
  status.className = 'pv-menu-launcher-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  status.hidden = true;

  container.appendChild(trigger);
  container.appendChild(status);

  let loading = false;

  function attachLauncher() {
    trigger.addEventListener('click', requestMenuOpen);
    window.addEventListener('keydown', handleKeyDown, true);
  }

  function detachLauncher() {
    trigger.removeEventListener('click', requestMenuOpen);
    window.removeEventListener('keydown', handleKeyDown, true);
  }

  function handleKeyDown(event) {
    if (shouldHandlePauseShortcut(event)) {
      consumeMenuEvent(event);
      requestMenuOpen();
      return;
    }

    if (event.code === 'Escape') {
      consumeMenuEvent(event);
    }
  }

  function requestMenuOpen() {
    if (loading) return;
    loading = true;
    status.hidden = true;
    status.textContent = '';
    trigger.removeAttribute('aria-describedby');
    commands.setPaused(true);
    trigger.hidden = true;
    detachLauncher();
    trigger.remove();
    loadIntegratedMenu(commands)
      .then(() => {
        status.remove();
      })
      .catch((error) => {
        loading = false;
        commands.setPaused(false);
        commands.resetInputs();
        if (!trigger.isConnected) {
          container.insertBefore(trigger, status);
        }
        trigger.hidden = false;
        status.textContent = strings.launcherError;
        status.hidden = false;
        trigger.setAttribute('aria-describedby', status.id);
        attachLauncher();
        trigger.focus();
        console.error('Unable to load integrated menu.', error);
      });
  }

  attachLauncher();
}

/**
 * @param {ReturnType<import('./game_commands.js').createGameCommands>} commands
 */
async function loadIntegratedMenu(commands) {
  markPerformance('pv-menu-import-start');
  const { setUpIntegratedMenu } = await import('./integrated_menu.js');
  markPerformance('pv-menu-import-ready');

  setUpIntegratedMenu(commands);
  if (document.getElementById('pv-menu-overlay') === null) {
    throw new Error('Integrated menu did not mount.');
  }
  markPerformance('pv-menu-mounted');

  markPerformance('pv-menu-open-dispatch');
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      code: 'KeyP',
      bubbles: true,
      cancelable: true,
    })
  );
}

function consumeMenuEvent(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function addIntegratedMenuStylesheet() {
  if (document.getElementById('integrated-menu-stylesheet') !== null) return;
  const link = document.createElement('link');
  link.id = 'integrated-menu-stylesheet';
  link.rel = 'stylesheet';
  link.href = '../resources/integrated-menu.css';
  document.head.appendChild(link);
}

function markPerformance(name) {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(name);
  }
}
