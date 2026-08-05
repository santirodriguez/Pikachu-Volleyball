'use strict';

import inputActionsModule from './input_actions.cjs';
import menuLogicModule from './menu_logic.cjs';
import controlBindingsModule from './control_bindings.cjs';
import { getIntegratedMenuStrings } from './integrated_menu_strings.js';
import { getPhase3MenuStrings } from './integrated_menu_phase3_strings.js';

const { shouldHandlePauseShortcut } = inputActionsModule;
const { wrapIndex, isMenuConfirmKey } = menuLogicModule;
const { formatKeyboardCode } = controlBindingsModule;

const LANGUAGES = Object.freeze([
  { locale: 'en', label: 'English' },
  { locale: 'es-ar', label: 'Español' },
  { locale: 'ca', label: 'Català' },
  { locale: 'ko', label: '한국어' },
  { locale: 'zh', label: '中文' },
]);

const NAV_IDS = Object.freeze([
  'continue',
  'restart',
  'match',
  'controls',
  'audio',
  'language',
  'about',
]);

/**
 * Mount the production pause menu over the game canvas.
 * @param {ReturnType<import('./game_commands.js').createGameCommands>} commands
 */
export function setUpIntegratedMenu(commands) {
  const container = document.getElementById('game-canvas-container');
  if (container === null) return;

  addIntegratedMenuStylesheet();
  document.documentElement.classList.add('integrated-menu-enabled');

  const locale = commands.getCurrentLocale();
  const strings = getPhase3MenuStrings(
    locale,
    getIntegratedMenuStrings(locale)
  );
  const navIds = commands.isDesktop() ? [...NAV_IDS, 'quit'] : [...NAV_IDS];
  let selectedNavIndex = 0;
  let panelControlIndex = 0;
  let mode = 'nav';
  let pendingConfirmation = null;
  let modalContext = 'standard';
  let controlCapture = null;

  const overlay = document.createElement('section');
  overlay.id = 'pv-menu-overlay';
  overlay.className = 'pv-menu-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'pv-menu-title');
  overlay.innerHTML = `
    <div class="pv-menu-shell" tabindex="-1">
      <header class="pv-menu-header">
        <div class="pv-menu-brand">
          <img
            class="pv-menu-icon"
            src="../resources/assets/images/IDI_PIKAICON-0.png"
            alt=""
            aria-hidden="true"
          />
          <div>
            <p class="pv-menu-eyebrow">PIKACHU VOLLEYBALL</p>
            <h2 id="pv-menu-title">${strings.paused}</h2>
          </div>
        </div>
        <span class="pv-menu-chip">${strings.chip}</span>
      </header>
      <div class="pv-menu-body">
        <nav class="pv-menu-nav" aria-label="Pause menu">
          ${navIds
            .map(
              (id, index) => `
                <button
                  type="button"
                  class="pv-menu-nav-item"
                  data-nav-index="${index}"
                  data-nav-id="${id}"
                  aria-selected="false"
                >
                  <span class="pv-menu-cursor" aria-hidden="true">▶</span>
                  <span>${strings.nav[id]}</span>
                </button>
              `
            )
            .join('')}
        </nav>
        <section id="pv-menu-detail" class="pv-menu-detail" aria-live="polite"></section>
      </div>
      <footer class="pv-menu-footer">
        <div id="pv-menu-hints" class="pv-menu-hints"></div>
        <p id="pv-menu-status" class="pv-menu-status">${strings.status.ready}</p>
      </footer>
    </div>
    <div id="pv-menu-modal" class="pv-menu-modal" role="alertdialog" aria-modal="true" hidden>
      <div class="pv-menu-modal-card">
        <span class="pv-menu-kicker pv-menu-kicker-danger">!</span>
        <h3 id="pv-menu-modal-title">${strings.confirmation.title}</h3>
        <p id="pv-menu-modal-message"></p>
        <div id="pv-menu-modal-actions" class="pv-menu-modal-actions">
          <button type="button" data-modal-action="accept">${strings.confirmation.accept}</button>
          <button type="button" data-modal-action="cancel">${strings.confirmation.cancel}</button>
        </div>
      </div>
    </div>
  `;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'pv-menu-trigger';
  trigger.className = 'pv-menu-trigger';
  trigger.innerHTML = `<kbd>P</kbd> ${strings.trigger}`;
  trigger.setAttribute('aria-label', `${strings.trigger} (P)`);

  container.appendChild(overlay);
  container.appendChild(trigger);

  const shell = overlay.querySelector('.pv-menu-shell');
  const detail = overlay.querySelector('#pv-menu-detail');
  const hints = overlay.querySelector('#pv-menu-hints');
  const status = overlay.querySelector('#pv-menu-status');
  const modal = overlay.querySelector('#pv-menu-modal');
  const modalTitle = overlay.querySelector('#pv-menu-modal-title');
  const modalMessage = overlay.querySelector('#pv-menu-modal-message');
  const modalActions = overlay.querySelector('#pv-menu-modal-actions');
  const navButtons = Array.from(overlay.querySelectorAll('.pv-menu-nav-item'));
  const navigationSound = createMenuSound(
    '../resources/assets/sounds/WAVE143_1.wav',
    0.16
  );
  const confirmationSound = createMenuSound(
    '../resources/assets/sounds/WAVE144_1.wav',
    0.2
  );

  function setStatus(message) {
    if (status !== null) status.textContent = message;
  }

  function setHints(panelMode = false) {
    if (hints === null) return;
    if (panelMode) {
      hints.innerHTML = `
        <span><kbd>↑</kbd><kbd>↓</kbd> ${strings.hints.navigate}</span>
        <span><kbd>←</kbd><kbd>→</kbd> ${strings.hints.change}</span>
        <span><kbd>Esc</kbd> ${strings.hints.returnToMenu}</span>
      `;
      return;
    }
    hints.innerHTML = `
      <span><kbd>↑</kbd><kbd>↓</kbd> ${strings.hints.navigate}</span>
      <span><kbd>Z</kbd><kbd>Shift</kbd><kbd>Ctrl</kbd><kbd>Enter</kbd> ${strings.hints.select}</span>
      <span><kbd>Esc</kbd> ${strings.hints.back}</span>
    `;
  }

  function renderNavigation({ focus = false, playSound = false } = {}) {
    navButtons.forEach((button, index) => {
      const selected = index === selectedNavIndex;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
    if (focus) navButtons[selectedNavIndex]?.focus();
    if (playSound) navigationSound();
  }

  function selectNav(index, options = {}) {
    selectedNavIndex = wrapIndex(index, navButtons.length);
    mode = 'nav';
    panelControlIndex = 0;
    renderNavigation(options);
    renderPanel();
    setHints(false);
  }

  function currentNavId() {
    return navButtons[selectedNavIndex]?.dataset.navId || 'continue';
  }

  function renderPanel() {
    if (detail === null) return;
    const id = currentNavId();
    detail.innerHTML = getPanelMarkup(id, strings, commands.getSettings());
    wirePanelControls();
  }

  function wirePanelControls() {
    if (detail === null) return;

    detail.querySelectorAll('[data-setting]').forEach((button) => {
      button.addEventListener('click', () => cycleSetting(button, 1));
    });

    detail.querySelectorAll('[data-locale]').forEach((button) => {
      button.addEventListener('click', () => applyLanguage(button.dataset.locale));
    });

    detail.querySelectorAll('[data-control-id]').forEach((button) => {
      button.addEventListener('click', () => {
        startControlCapture(button.dataset.controlId);
      });
    });

    detail.querySelectorAll('[data-control-reset]').forEach((button) => {
      button.addEventListener('click', () => {
        const returnIndex = panelControlIndex;
        commands.resetControlBindingScope(button.dataset.controlReset);
        confirmationSound();
        setStatus(strings.controls.resetDone);
        renderPanel();
        focusPanelControl(returnIndex);
      });
    });

    detail.querySelector('[data-command="restart"]')?.addEventListener('click', () => {
      showConfirmation(strings.restart.warning, () => {
        commands.restartMatch();
        closeMenu(false);
      });
    });

    detail.querySelector('[data-command="reset-defaults"]')?.addEventListener('click', () => {
      commands.resetDefaults();
      confirmationSound();
      setStatus(strings.status.defaults);
      renderPanel();
    });

    detail.querySelector('[data-command="quit"]')?.addEventListener('click', () => {
      showConfirmation(strings.quit.warning, async () => {
        const didQuit = await commands.quit();
        if (!didQuit) {
          closeConfirmation();
          setStatus(strings.status.quitUnavailable);
        }
      });
    });
  }

  function getPanelControls() {
    if (detail === null) return [];
    return Array.from(
      detail.querySelectorAll(
        '[data-setting], [data-locale], [data-command], [data-control-id], [data-control-reset], .pv-menu-about-link'
      )
    );
  }

  function focusPanelControl(index, playSound = false) {
    const controls = getPanelControls();
    if (controls.length === 0) {
      mode = 'nav';
      renderNavigation({ focus: true });
      return;
    }
    mode = 'panel';
    panelControlIndex = wrapIndex(index, controls.length);
    controls.forEach((control, controlIndex) => {
      control.classList.toggle(
        'is-keyboard-selected',
        controlIndex === panelControlIndex
      );
    });
    controls[panelControlIndex].focus();
    setHints(true);
    if (playSound) navigationSound();
  }

  function activateNavItem() {
    const id = currentNavId();
    confirmationSound();
    if (id === 'continue') {
      closeMenu(true);
      return;
    }
    if (id === 'restart') {
      showConfirmation(strings.restart.warning, () => {
        commands.restartMatch();
        closeMenu(false);
      });
      return;
    }
    if (id === 'quit') {
      showConfirmation(strings.quit.warning, async () => {
        const didQuit = await commands.quit();
        if (!didQuit) {
          closeConfirmation();
          setStatus(strings.status.quitUnavailable);
        }
      });
      return;
    }
    focusPanelControl(0);
  }

  function cycleSetting(button, direction) {
    const setting = button.dataset.setting;
    const values = (button.dataset.values || '').split('|').filter(Boolean);
    if (!setting || values.length === 0) return;

    const currentValue = button.dataset.value;
    const currentIndex = Math.max(0, values.indexOf(currentValue));
    const nextValue = values[wrapIndex(currentIndex + direction, values.length)];
    let result = true;

    if (setting === 'winningScore') {
      result = commands.setWinningScore(nextValue);
    } else if (setting === 'speed') {
      result = commands.setSpeed(nextValue);
    } else if (setting === 'practiceMode') {
      result = commands.setPracticeMode(nextValue === 'true');
    } else if (setting === 'graphic') {
      result = commands.setGraphic(nextValue);
    } else if (setting === 'bgm') {
      result = commands.setBgm(nextValue);
    } else if (setting === 'sfx') {
      result = commands.setSfx(nextValue);
    }

    if (result?.ok === false) {
      if (result.reason === 'practice-mode') {
        setStatus(strings.status.practiceScore);
      } else if (result.reason === 'score-reached') {
        setStatus(strings.status.scoreReached);
      }
      return;
    }
    if (result === false) return;

    confirmationSound();
    setStatus(strings.status.changed);
    const previousIndex = panelControlIndex;
    renderPanel();
    focusPanelControl(previousIndex);
  }

  function applyLanguage(nextLocale) {
    if (!nextLocale) return;
    if (nextLocale === commands.getCurrentLocale()) {
      setStatus(strings.status.currentLanguage);
      return;
    }
    const apply = () => commands.changeLanguage(nextLocale);
    if (commands.isMatchInProgress()) {
      showConfirmation(strings.language.restartWarning, apply);
    } else {
      apply();
    }
  }

  function replaceTokens(template, tokens) {
    return Object.entries(tokens).reduce(
      (message, [key, value]) => message.replace(`{${key}}`, value),
      template
    );
  }

  function getControlActionLabel(bindingId) {
    return strings.controls.actions[bindingId] || bindingId;
  }

  function startControlCapture(bindingId) {
    if (!bindingId) return;
    controlCapture = {
      bindingId,
      returnIndex: panelControlIndex,
      candidateCode: null,
    };
    pendingConfirmation = null;
    modalContext = 'control-capture';
    mode = 'capture';
    showModal(
      strings.controls.captureTitle,
      replaceTokens(strings.controls.captureBody, {
        action: getControlActionLabel(bindingId),
      }),
      false
    );
    shell?.focus();
    confirmationSound();
  }

  function handleControlCaptureKey(event) {
    if (event.code === 'Escape') {
      cancelControlCapture();
      return;
    }
    if (event.repeat) return;

    const result = commands.previewControlBinding(
      controlCapture?.bindingId,
      event.code
    );
    if (!result.ok) {
      if (result.reason === 'key-conflict') {
        setModalMessage(
          replaceTokens(strings.controls.conflict, {
            action: getControlActionLabel(result.conflictId),
          })
        );
      } else {
        setModalMessage(strings.controls.reserved);
      }
      return;
    }

    controlCapture.candidateCode = event.code;
    modalContext = 'control-confirm';
    mode = 'modal';
    showModal(
      strings.controls.proposedTitle,
      replaceTokens(strings.controls.proposedBody, {
        key: commands.formatControlCode(event.code),
        action: getControlActionLabel(controlCapture.bindingId),
      }),
      true
    );
    overlay.querySelector('[data-modal-action="accept"]')?.focus();
  }

  function applyControlCapture() {
    if (!controlCapture?.candidateCode) return;
    const returnIndex = controlCapture.returnIndex;
    const result = commands.setControlBinding(
      controlCapture.bindingId,
      controlCapture.candidateCode
    );
    if (!result.ok) {
      modalContext = 'control-capture';
      mode = 'capture';
      setModalMessage(strings.controls.reserved);
      setModalActionsVisible(false);
      return;
    }
    clearModal();
    controlCapture = null;
    mode = 'panel';
    setStatus(strings.controls.saved);
    confirmationSound();
    renderPanel();
    focusPanelControl(returnIndex);
  }

  function cancelControlCapture() {
    const returnIndex = controlCapture?.returnIndex || 0;
    clearModal();
    controlCapture = null;
    mode = 'panel';
    renderPanel();
    focusPanelControl(returnIndex);
  }

  function setModalMessage(message) {
    if (modalMessage !== null) modalMessage.textContent = message;
  }

  function setModalActionsVisible(visible) {
    if (modalActions !== null) modalActions.hidden = !visible;
  }

  function showModal(title, message, showActions = true) {
    if (modalTitle !== null) modalTitle.textContent = title;
    setModalMessage(message);
    setModalActionsVisible(showActions);
    if (modal !== null) modal.hidden = false;
  }

  function showConfirmation(message, callback) {
    pendingConfirmation = callback;
    modalContext = 'standard';
    mode = 'modal';
    showModal(strings.confirmation.title, message, true);
    overlay.querySelector('[data-modal-action="accept"]')?.focus();
    confirmationSound();
  }

  function clearModal() {
    pendingConfirmation = null;
    modalContext = 'standard';
    if (modal !== null) modal.hidden = true;
    setModalActionsVisible(true);
  }

  function closeConfirmation() {
    clearModal();
    mode = 'nav';
    renderNavigation({ focus: true });
    setHints(false);
  }

  async function acceptModalAction() {
    if (modalContext === 'control-confirm') {
      applyControlCapture();
      return;
    }
    const callback = pendingConfirmation;
    pendingConfirmation = null;
    if (callback) await callback();
  }

  function cancelModalAction() {
    if (
      modalContext === 'control-capture' ||
      modalContext === 'control-confirm'
    ) {
      cancelControlCapture();
      return;
    }
    closeConfirmation();
  }

  function openMenu() {
    if (!overlay.hidden) return;
    commands.setPaused(true);
    overlay.hidden = false;
    trigger.hidden = true;
    mode = 'nav';
    selectedNavIndex = 0;
    panelControlIndex = 0;
    setStatus(strings.status.ready);
    renderNavigation();
    renderPanel();
    setHints(false);
    requestAnimationFrame(() => navButtons[0]?.focus() || shell?.focus());
  }

  function closeMenu(resumeMatch = true) {
    clearModal();
    controlCapture = null;
    overlay.hidden = true;
    trigger.hidden = false;
    if (resumeMatch) commands.setPaused(false);
    commands.resetInputs();
    trigger.focus();
  }

  function handlePanelKey(event) {
    const controls = getPanelControls();
    if (controls.length === 0) {
      mode = 'nav';
      return;
    }
    if (event.code === 'ArrowDown') {
      focusPanelControl(panelControlIndex + 1, true);
    } else if (event.code === 'ArrowUp') {
      focusPanelControl(panelControlIndex - 1, true);
    } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      const control = controls[panelControlIndex];
      if (control?.dataset.setting) {
        cycleSetting(control, event.code === 'ArrowRight' ? 1 : -1);
      } else if (control?.dataset.locale) {
        focusPanelControl(
          panelControlIndex + (event.code === 'ArrowRight' ? 1 : -1),
          true
        );
      }
    } else if (isMenuConfirmKey(event.code)) {
      const control = controls[panelControlIndex];
      if (control?.dataset.setting) {
        cycleSetting(control, 1);
      } else {
        control?.click();
      }
    } else if (event.code === 'Escape') {
      mode = 'nav';
      renderNavigation({ focus: true });
      setHints(false);
    }
  }

  function handleModalKey(event) {
    const actions = Array.from(
      overlay.querySelectorAll('[data-modal-action]')
    );
    const focusedIndex = Math.max(0, actions.indexOf(document.activeElement));
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      actions[wrapIndex(focusedIndex + 1, actions.length)]?.focus();
    } else if (isMenuConfirmKey(event.code)) {
      if (document.activeElement?.dataset.modalAction === 'cancel') {
        cancelModalAction();
      } else {
        acceptModalAction();
      }
    } else if (event.code === 'Escape' || event.code === 'KeyP') {
      cancelModalAction();
    }
  }

  navButtons.forEach((button, index) => {
    button.addEventListener('mouseenter', () => {
      if (selectedNavIndex !== index) {
        selectNav(index, { playSound: true });
      }
    });
    button.addEventListener('focus', () => {
      if (mode === 'nav' && selectedNavIndex !== index) selectNav(index);
    });
    button.addEventListener('click', () => {
      selectNav(index);
      if (button.dataset.navId === 'continue') activateNavItem();
    });
  });

  overlay
    .querySelector('[data-modal-action="accept"]')
    ?.addEventListener('click', acceptModalAction);
  overlay
    .querySelector('[data-modal-action="cancel"]')
    ?.addEventListener('click', cancelModalAction);
  trigger.addEventListener('click', openMenu);

  window.addEventListener(
    'keydown',
    (event) => {
      if (mode === 'capture') {
        consumeMenuEvent(event);
        handleControlCaptureKey(event);
        return;
      }

      if (mode === 'modal') {
        consumeMenuEvent(event);
        handleModalKey(event);
        return;
      }

      if (shouldHandlePauseShortcut(event)) {
        consumeMenuEvent(event);
        if (overlay.hidden) {
          openMenu();
        } else {
          closeMenu(true);
        }
        return;
      }

      if (overlay.hidden) {
        if (event.code === 'Escape') consumeMenuEvent(event);
        return;
      }

      if (event.code !== 'Tab') consumeMenuEvent(event);
      if (mode === 'panel') {
        handlePanelKey(event);
      } else if (event.code === 'ArrowDown') {
        selectNav(selectedNavIndex + 1, {
          focus: true,
          playSound: true,
        });
      } else if (event.code === 'ArrowUp') {
        selectNav(selectedNavIndex - 1, {
          focus: true,
          playSound: true,
        });
      } else if (isMenuConfirmKey(event.code)) {
        activateNavItem();
      } else if (event.code === 'Escape') {
        closeMenu(true);
      }
    },
    true
  );

  window.addEventListener(
    'keyup',
    (event) => {
      if (!overlay.hidden && event.code !== 'Tab') consumeMenuEvent(event);
    },
    true
  );

  renderNavigation();
  renderPanel();
  setHints(false);
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

function createMenuSound(source, volume) {
  const audio = new Audio(source);
  audio.preload = 'auto';
  audio.volume = volume;
  return () => {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };
}

function settingMarkup(id, label, values, currentValue, strings) {
  return `
    <button
      type="button"
      class="pv-menu-setting"
      data-setting="${id}"
      data-values="${values.join('|')}"
      data-value="${currentValue}"
    >
      <span>${label}</span>
      <strong>${displaySettingValue(id, currentValue, strings)}</strong>
      <span class="pv-menu-setting-arrows" aria-hidden="true">◀ ▶</span>
    </button>
  `;
}

function displaySettingValue(id, value, strings) {
  if (id === 'winningScore') return `${value} ${strings.values.points}`;
  if (id === 'practiceMode') {
    return value === 'true' ? strings.values.on : strings.values.off;
  }
  return strings.values[value] || String(value).toUpperCase();
}

function controlBindingMarkup(definition, strings, bindings) {
  const action = strings.controls.actions[definition.id] || definition.id;
  const code = bindings[definition.id] || definition.defaultCode;
  return `
    <button
      type="button"
      class="pv-control-binding"
      data-control-id="${definition.id}"
    >
      <span class="pv-control-binding-copy">
        <small>${action}</small>
        <strong>${formatKeyboardCode(code)}</strong>
      </span>
      <span class="pv-control-binding-change">${strings.controls.change}</span>
    </button>
  `;
}

function controlGroupMarkup(player, strings, settings) {
  const definitions = settings.controlDefinitions.filter(
    (definition) => definition.player === player
  );
  return `
    <section class="pv-control-player">
      <h4>${player === 1 ? strings.controls.player1 : strings.controls.player2}</h4>
      <div class="pv-control-player-bindings">
        ${definitions
          .map((definition) =>
            controlBindingMarkup(
              definition,
              strings,
              settings.controlBindings
            )
          )
          .join('')}
      </div>
    </section>
  `;
}

function getPanelMarkup(id, strings, settings) {
  const panelHeading = (section, title, body, danger = false) => `
    <div class="pv-menu-panel-heading">
      <span class="pv-menu-kicker ${danger ? 'pv-menu-kicker-danger' : ''}">${section}</span>
      <h3>${title}</h3>
      <p>${body}</p>
    </div>
  `;

  if (id === 'continue') {
    return `${panelHeading(
      strings.continue.kicker,
      strings.continue.title,
      strings.continue.body
    )}
      <div class="pv-menu-poster">${strings.continue.poster}</div>`;
  }
  if (id === 'restart') {
    return `${panelHeading(
      strings.restart.kicker,
      strings.restart.title,
      strings.restart.body,
      true
    )}
      <div class="pv-menu-warning">${strings.restart.warning}</div>
      <button type="button" class="pv-menu-primary-action pv-menu-danger-action" data-command="restart">${strings.restart.action}</button>`;
  }
  if (id === 'match') {
    return `${panelHeading(
      strings.match.kicker,
      strings.match.title,
      strings.match.body
    )}
      <div class="pv-menu-settings">
        ${settingMarkup(
          'winningScore',
          strings.match.winningScore,
          ['15', '10', '5'],
          settings.winningScore,
          strings
        )}
        ${settingMarkup(
          'speed',
          strings.match.speed,
          ['medium', 'fast', 'slow'],
          settings.speed,
          strings
        )}
        ${settingMarkup(
          'practiceMode',
          strings.match.practice,
          ['false', 'true'],
          String(settings.practiceMode),
          strings
        )}
      </div>
      <button type="button" class="pv-menu-secondary-action" data-command="reset-defaults">${strings.match.reset}</button>`;
  }
  if (id === 'controls') {
    return `${panelHeading(
      strings.controls.kicker,
      strings.controls.title,
      strings.controls.body
    )}
      <div class="pv-control-editor">
        <div class="pv-control-groups">
          ${controlGroupMarkup(1, strings, settings)}
          ${controlGroupMarkup(2, strings, settings)}
        </div>
        <div class="pv-control-reset-actions">
          <button type="button" data-control-reset="player1">${strings.controls.resetPlayer1}</button>
          <button type="button" data-control-reset="player2">${strings.controls.resetPlayer2}</button>
          <button type="button" data-control-reset="all">${strings.controls.resetAll}</button>
        </div>
        <p class="pv-control-fixed-keys"><strong>P</strong> — ${strings.controls.pause} · <strong>B</strong> — ${strings.controls.practiceReset}</p>
      </div>`;
  }
  if (id === 'audio') {
    return `${panelHeading(
      strings.audio.kicker,
      strings.audio.title,
      strings.audio.body
    )}
      <div class="pv-menu-settings">
        ${settingMarkup(
          'graphic',
          strings.audio.graphics,
          ['sharp', 'soft'],
          settings.graphic,
          strings
        )}
        ${settingMarkup(
          'bgm',
          strings.audio.bgm,
          ['on', 'off'],
          settings.bgm,
          strings
        )}
        ${settingMarkup(
          'sfx',
          strings.audio.sfx,
          ['stereo', 'mono', 'off'],
          settings.sfx,
          strings
        )}
      </div>`;
  }
  if (id === 'language') {
    return `${panelHeading(
      strings.language.kicker,
      strings.language.title,
      strings.language.body
    )}
      <div class="pv-menu-language-grid">
        ${LANGUAGES.map(
          ({ locale, label }) => `
            <button
              type="button"
              data-locale="${locale}"
              class="${locale === settings.locale ? 'is-current' : ''}"
            >
              <span>${label}</span>
              ${
                locale === settings.locale
                  ? `<small>${strings.language.current}</small>`
                  : ''
              }
            </button>
          `
        ).join('')}
      </div>`;
  }
  if (id === 'about') {
    return `${panelHeading(
      strings.about.kicker,
      strings.about.title,
      strings.about.body
    )}
      <div class="pv-menu-about-copy">
        <p>${strings.about.original}</p>
        <p>${strings.about.reverse}</p>
        <p>${strings.about.fork}</p>
        <p class="pv-menu-about-punchline">${strings.about.punchline}</p>
      </div>
      <div class="pv-menu-about-links">
        <a class="pv-menu-about-link" href="https://santiagorodriguez.com" target="_blank" rel="noopener">${strings.about.website}</a>
        <a class="pv-menu-about-link" href="https://github.com/santirodriguez/pikachu-volleyball" target="_blank" rel="noopener">${strings.about.source}</a>
      </div>`;
  }
  if (id === 'quit') {
    return `${panelHeading(
      strings.quit.kicker,
      strings.quit.title,
      strings.quit.body,
      true
    )}
      <div class="pv-menu-warning">${strings.quit.warning}</div>
      <button type="button" class="pv-menu-primary-action pv-menu-danger-action" data-command="quit">${strings.quit.action}</button>`;
  }
  return '';
}
