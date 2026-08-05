'use strict';

import inputActionsModule from './input_actions.cjs';
import menuLogicModule from './menu_logic.cjs';
import { getIntegratedMenuStrings } from './integrated_menu_strings.js';

const { shouldHandlePauseShortcut } = inputActionsModule;
const { wrapIndex, isMenuConfirmKey } = menuLogicModule;

const LANGUAGES = Object.freeze([
  { locale: 'en', label: 'English' },
  { locale: 'es-ar', label: 'Español' },
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

  const strings = getIntegratedMenuStrings(commands.getCurrentLocale());
  const navIds = commands.isDesktop() ? [...NAV_IDS, 'quit'] : [...NAV_IDS];
  let selectedNavIndex = 0;
  let panelControlIndex = 0;
  let mode = 'nav';
  let pendingConfirmation = null;

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
        <h3>${strings.confirmation.title}</h3>
        <p id="pv-menu-modal-message"></p>
        <div class="pv-menu-modal-actions">
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
  const modalMessage = overlay.querySelector('#pv-menu-modal-message');
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
        '[data-setting], [data-locale], [data-command], .pv-menu-about-link'
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
      control.classList.toggle('is-keyboard-selected', controlIndex === panelControlIndex);
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

  function applyLanguage(locale) {
    if (!locale) return;
    if (locale === commands.getCurrentLocale()) {
      setStatus(strings.status.currentLanguage);
      return;
    }
    const apply = () => commands.changeLanguage(locale);
    if (commands.isMatchInProgress()) {
      showConfirmation(strings.language.restartWarning, apply);
    } else {
      apply();
    }
  }

  function showConfirmation(message, callback) {
    pendingConfirmation = callback;
    mode = 'modal';
    if (modalMessage !== null) modalMessage.textContent = message;
    if (modal !== null) modal.hidden = false;
    overlay.querySelector('[data-modal-action="accept"]')?.focus();
    confirmationSound();
  }

  function closeConfirmation() {
    pendingConfirmation = null;
    if (modal !== null) modal.hidden = true;
    mode = 'nav';
    renderNavigation({ focus: true });
    setHints(false);
  }

  async function acceptConfirmation() {
    const callback = pendingConfirmation;
    pendingConfirmation = null;
    if (callback) await callback();
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
    closeConfirmation();
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
    const modalActions = Array.from(
      overlay.querySelectorAll('[data-modal-action]')
    );
    const focusedIndex = Math.max(0, modalActions.indexOf(document.activeElement));
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      modalActions[wrapIndex(focusedIndex + 1, modalActions.length)]?.focus();
    } else if (isMenuConfirmKey(event.code)) {
      if (document.activeElement?.dataset.modalAction === 'cancel') {
        closeConfirmation();
      } else {
        acceptConfirmation();
      }
    } else if (event.code === 'Escape' || event.code === 'KeyP') {
      closeConfirmation();
    }
  }

  navButtons.forEach((button, index) => {
    button.addEventListener('mouseenter', () => {
      if (selectedNavIndex !== index) selectNav(index, { playSound: true });
    });
    button.addEventListener('focus', () => {
      if (mode === 'nav' && selectedNavIndex !== index) selectNav(index);
    });
    button.addEventListener('click', () => {
      selectNav(index);
      if (button.dataset.navId === 'continue') activateNavItem();
    });
  });

  overlay.querySelector('[data-modal-action="accept"]')?.addEventListener('click', acceptConfirmation);
  overlay.querySelector('[data-modal-action="cancel"]')?.addEventListener('click', closeConfirmation);
  trigger.addEventListener('click', openMenu);

  window.addEventListener(
    'keydown',
    (event) => {
      if (shouldHandlePauseShortcut(event)) {
        consumeMenuEvent(event);
        if (mode === 'modal') {
          closeConfirmation();
        } else if (overlay.hidden) {
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
      if (mode === 'modal') {
        handleModalKey(event);
      } else if (mode === 'panel') {
        handlePanelKey(event);
      } else if (event.code === 'ArrowDown') {
        selectNav(selectedNavIndex + 1, { focus: true, playSound: true });
      } else if (event.code === 'ArrowUp') {
        selectNav(selectedNavIndex - 1, { focus: true, playSound: true });
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
  if (id === 'practiceMode') return value === 'true' ? strings.values.on : strings.values.off;
  return strings.values[value] || String(value).toUpperCase();
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
    return `${panelHeading(strings.continue.kicker, strings.continue.title, strings.continue.body)}
      <div class="pv-menu-poster">${strings.continue.poster}</div>`;
  }
  if (id === 'restart') {
    return `${panelHeading(strings.restart.kicker, strings.restart.title, strings.restart.body, true)}
      <div class="pv-menu-warning">${strings.restart.warning}</div>
      <button type="button" class="pv-menu-primary-action pv-menu-danger-action" data-command="restart">${strings.restart.action}</button>`;
  }
  if (id === 'match') {
    return `${panelHeading(strings.match.kicker, strings.match.title, strings.match.body)}
      <div class="pv-menu-settings">
        ${settingMarkup('winningScore', strings.match.winningScore, ['15', '10', '5'], settings.winningScore, strings)}
        ${settingMarkup('speed', strings.match.speed, ['medium', 'fast', 'slow'], settings.speed, strings)}
        ${settingMarkup('practiceMode', strings.match.practice, ['false', 'true'], String(settings.practiceMode), strings)}
      </div>
      <button type="button" class="pv-menu-secondary-action" data-command="reset-defaults">${strings.match.reset}</button>`;
  }
  if (id === 'controls') {
    return `${panelHeading(strings.controls.kicker, strings.controls.title, strings.controls.body)}
      <div class="pv-menu-control-grid">
        <div><strong>${strings.controls.player1}</strong><span>D / G</span><small>${strings.controls.move}</small></div>
        <div><strong>${strings.controls.player1}</strong><span>R / V / F</span><small>${strings.controls.jumpDown}</small></div>
        <div class="is-accent"><strong>${strings.controls.player1} · ${strings.controls.powerHit}</strong><span>Z / LEFT SHIFT</span></div>
        <div class="is-accent"><strong>${strings.controls.player2} · ${strings.controls.powerHit}</strong><span>ENTER / LEFT CTRL</span></div>
        <div><strong>${strings.controls.player2}</strong><span>ARROW KEYS</span><small>${strings.controls.move}</small></div>
        <div><strong>${strings.controls.pause}</strong><span>P</span><small>${strings.controls.practiceReset}: B</small></div>
      </div>`;
  }
  if (id === 'audio') {
    return `${panelHeading(strings.audio.kicker, strings.audio.title, strings.audio.body)}
      <div class="pv-menu-settings">
        ${settingMarkup('graphic', strings.audio.graphics, ['sharp', 'soft'], settings.graphic, strings)}
        ${settingMarkup('bgm', strings.audio.bgm, ['on', 'off'], settings.bgm, strings)}
        ${settingMarkup('sfx', strings.audio.sfx, ['stereo', 'mono', 'off'], settings.sfx, strings)}
      </div>`;
  }
  if (id === 'language') {
    return `${panelHeading(strings.language.kicker, strings.language.title, strings.language.body)}
      <div class="pv-menu-language-grid">
        ${LANGUAGES.map(
          ({ locale, label }) => `
            <button
              type="button"
              data-locale="${locale}"
              class="${locale === settings.locale ? 'is-current' : ''}"
            >
              <span>${label}</span>
              ${locale === settings.locale ? `<small>${strings.language.current}</small>` : ''}
            </button>
          `
        ).join('')}
      </div>`;
  }
  if (id === 'about') {
    return `${panelHeading(strings.about.kicker, strings.about.title, strings.about.body)}
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
    return `${panelHeading(strings.quit.kicker, strings.quit.title, strings.quit.body, true)}
      <div class="pv-menu-warning">${strings.quit.warning}</div>
      <button type="button" class="pv-menu-primary-action pv-menu-danger-action" data-command="quit">${strings.quit.action}</button>`;
  }
  return '';
}
