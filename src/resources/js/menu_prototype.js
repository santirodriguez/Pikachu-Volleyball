'use strict';

const MENU_PROTOTYPE_QUERY = 'menuPrototype';
const MENU_PROTOTYPE_ENABLED =
  new URLSearchParams(window.location.search).get(MENU_PROTOTYPE_QUERY) === '1';

const MENU_ITEMS = [
  { id: 'continue', label: 'Continue' },
  { id: 'restart', label: 'Restart Match' },
  { id: 'match', label: 'Match Settings' },
  { id: 'controls', label: 'Controls' },
  { id: 'audio', label: 'Audio & Graphics' },
  { id: 'language', label: 'Language' },
  { id: 'about', label: 'About' },
];

if (MENU_PROTOTYPE_ENABLED) {
  setUpMenuPrototype();
}

function setUpMenuPrototype() {
  const container = document.getElementById('game-canvas-container');
  if (container === null) {
    return;
  }

  addPrototypeStylesheet();
  document.documentElement.classList.add('menu-prototype-enabled');

  const isDesktop =
    new URLSearchParams(window.location.search).get('desktop') === '1' ||
    window.location.protocol === 'file:';
  const items = isDesktop
    ? [...MENU_ITEMS, { id: 'quit', label: 'Quit' }]
    : MENU_ITEMS;

  const overlay = document.createElement('section');
  overlay.id = 'menu-prototype-overlay';
  overlay.className = 'menu-prototype-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'menu-prototype-title');
  overlay.innerHTML = `
    <div class="menu-prototype-shell" tabindex="-1">
      <header class="menu-prototype-header">
        <div class="menu-prototype-brand">
          <img
            class="menu-prototype-icon"
            src="../resources/assets/images/IDI_PIKAICON-0.png"
            alt=""
            aria-hidden="true"
          />
          <div>
            <p class="menu-prototype-eyebrow">PIKACHU VOLLEYBALL</p>
            <h2 id="menu-prototype-title">PAUSED</h2>
          </div>
        </div>
        <span class="menu-prototype-chip">2.0 PROTOTYPE</span>
      </header>
      <div class="menu-prototype-body">
        <nav class="menu-prototype-nav" aria-label="Pause menu">
          ${items
            .map(
              (item, index) => `
                <button
                  type="button"
                  class="menu-prototype-nav-item"
                  data-menu-index="${index}"
                  data-menu-id="${item.id}"
                  aria-selected="false"
                >
                  <span class="menu-prototype-cursor" aria-hidden="true">▶</span>
                  <span>${item.label}</span>
                </button>
              `
            )
            .join('')}
        </nav>
        <section
          id="menu-prototype-detail"
          class="menu-prototype-detail"
          aria-live="polite"
        ></section>
      </div>
      <footer class="menu-prototype-footer">
        <div class="menu-prototype-hints" aria-label="Keyboard controls">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>Z</kbd><kbd>Ctrl</kbd><kbd>Enter</kbd> Select</span>
          <span><kbd>Esc</kbd> Back</span>
        </div>
        <p id="menu-prototype-status" class="menu-prototype-status">
          Visual prototype only — gameplay settings are not changed.
        </p>
      </footer>
    </div>
  `;

  const reopenHint = document.createElement('button');
  reopenHint.type = 'button';
  reopenHint.id = 'menu-prototype-reopen';
  reopenHint.className = 'menu-prototype-reopen';
  reopenHint.innerHTML = '<kbd>Esc</kbd> Menu';
  reopenHint.hidden = true;

  container.appendChild(overlay);
  container.appendChild(reopenHint);

  const navItems = Array.from(
    overlay.querySelectorAll('.menu-prototype-nav-item')
  );
  const detail = overlay.querySelector('#menu-prototype-detail');
  const status = overlay.querySelector('#menu-prototype-status');
  const shell = overlay.querySelector('.menu-prototype-shell');
  let selectedIndex = Math.min(2, navItems.length - 1);

  const navigationSound = createMenuSound(
    '../resources/assets/sounds/WAVE143_1.wav',
    0.18
  );
  const confirmationSound = createMenuSound(
    '../resources/assets/sounds/WAVE144_1.wav',
    0.2
  );

  function renderSelectedItem({ focus = false, playSound = false } = {}) {
    navItems.forEach((item, index) => {
      const selected = index === selectedIndex;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
      item.tabIndex = selected ? 0 : -1;
    });

    const selectedItem = navItems[selectedIndex];
    if (selectedItem === undefined || detail === null) {
      return;
    }

    detail.innerHTML = getPanelMarkup(selectedItem.dataset.menuId);
    wireSettingButtons(detail, status, confirmationSound);

    if (focus) {
      selectedItem.focus();
    }
    if (playSound) {
      navigationSound();
    }
  }

  function selectIndex(index, options = {}) {
    selectedIndex = (index + navItems.length) % navItems.length;
    renderSelectedItem(options);
  }

  function activateSelectedItem() {
    const selectedItem = navItems[selectedIndex];
    if (selectedItem === undefined) {
      return;
    }

    confirmationSound();
    const itemId = selectedItem.dataset.menuId;
    if (itemId === 'continue') {
      closePrototype();
      return;
    }

    if (status !== null) {
      status.textContent = getActionStatus(itemId);
    }
  }

  function openPrototype() {
    overlay.hidden = false;
    reopenHint.hidden = true;
    requestAnimationFrame(() => {
      shell?.focus();
      renderSelectedItem({ focus: true });
    });
  }

  function closePrototype() {
    overlay.hidden = true;
    reopenHint.hidden = false;
    reopenHint.focus();
  }

  navItems.forEach((item, index) => {
    item.addEventListener('mouseenter', () => {
      if (selectedIndex !== index) {
        selectIndex(index, { playSound: true });
      }
    });
    item.addEventListener('focus', () => {
      if (selectedIndex !== index) {
        selectIndex(index);
      }
    });
    item.addEventListener('click', () => {
      selectIndex(index);
      activateSelectedItem();
    });
  });

  reopenHint.addEventListener('click', openPrototype);

  window.addEventListener(
    'keydown',
    (event) => {
      if (overlay.hidden) {
        if (event.code === 'Escape') {
          consumeMenuEvent(event);
          openPrototype();
        }
        return;
      }

      if (event.code === 'ArrowDown') {
        consumeMenuEvent(event);
        selectIndex(selectedIndex + 1, { focus: true, playSound: true });
      } else if (event.code === 'ArrowUp') {
        consumeMenuEvent(event);
        selectIndex(selectedIndex - 1, { focus: true, playSound: true });
      } else if (
        event.code === 'Enter' ||
        event.code === 'KeyZ' ||
        event.code === 'ControlLeft'
      ) {
        consumeMenuEvent(event);
        activateSelectedItem();
      } else if (event.code === 'Escape') {
        consumeMenuEvent(event);
        closePrototype();
      }
    },
    true
  );

  renderSelectedItem();
  openPrototype();
}

function consumeMenuEvent(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function addPrototypeStylesheet() {
  if (document.getElementById('menu-prototype-stylesheet') !== null) {
    return;
  }
  const link = document.createElement('link');
  link.id = 'menu-prototype-stylesheet';
  link.rel = 'stylesheet';
  link.href = '../resources/menu-prototype.css';
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

function wireSettingButtons(container, status, confirmationSound) {
  const settings = container.querySelectorAll('.menu-prototype-setting');
  settings.forEach((setting) => {
    setting.addEventListener('click', () => {
      const options = setting.dataset.options?.split('|') || [];
      const value = setting.querySelector('.menu-prototype-setting-value');
      if (options.length === 0 || value === null) {
        return;
      }
      const currentIndex = Number(setting.dataset.optionIndex || 0);
      const nextIndex = (currentIndex + 1) % options.length;
      setting.dataset.optionIndex = String(nextIndex);
      value.textContent = options[nextIndex];
      confirmationSound();
      if (status !== null) {
        status.textContent = 'Prototype value changed for visual review only.';
      }
    });
  });
}

function getActionStatus(itemId) {
  const statuses = {
    restart: 'Restart action previewed; the current match was not changed.',
    match: 'Match settings panel selected.',
    controls: 'Controls panel selected.',
    audio: 'Audio and graphics panel selected.',
    language: 'Language panel selected, including Catalan layout testing.',
    about: 'About panel selected.',
    quit: 'Quit action previewed; the application remains open.',
  };
  return statuses[itemId] || 'Prototype action selected.';
}

function getPanelMarkup(panelId) {
  const panels = {
    continue: `
      <div class="menu-prototype-panel-heading">
        <span class="menu-prototype-kicker">MATCH</span>
        <h3>Ready to return?</h3>
        <p>The current game will continue with the same score and settings.</p>
      </div>
      <div class="menu-prototype-poster">
        <span>KEEP THE RALLY GOING</span>
      </div>
    `,
    restart: `
      <div class="menu-prototype-panel-heading">
        <span class="menu-prototype-kicker menu-prototype-kicker-danger">MATCH</span>
        <h3>Restart Match</h3>
        <p>Start the current matchup again without leaving the game screen.</p>
      </div>
      <div class="menu-prototype-warning">
        Current score and round progress will be cleared.
      </div>
    `,
    match: `
      <div class="menu-prototype-panel-heading">
        <span class="menu-prototype-kicker">GAMEPLAY</span>
        <h3>Match Settings</h3>
        <p>Compact controls designed to stay readable over the court.</p>
      </div>
      <div class="menu-prototype-settings">
        ${getSettingMarkup('Winning Score', ['15 PTS', '10 PTS', '5 PTS'], 0)}
        ${getSettingMarkup('Game Speed', ['MEDIUM', 'FAST', 'SLOW'], 0)}
        ${getSettingMarkup('Practice Mode', ['OFF', 'ON'], 0)}
      </div>
    `,
    controls: `
      <div class="menu-prototype-panel-heading">
        <span class="menu-prototype-kicker">INPUT</span>
        <h3>Controls</h3>
        <p>Existing controls remain intact while the new binding is highlighted.</p>
      </div>
      <div class="menu-prototype-control-grid">
        <div><strong>PLAYER 1</strong><span>D / G</span><small>Move</small></div>
        <div><strong>PLAYER 1</strong><span>R / V</span><small>Jump / Down</small></div>
        <div class="is-accent"><strong>POWER HIT</strong><span>Z / LEFT CTRL</span><small>Hit / Confirm</small></div>
        <div><strong>PLAYER 2</strong><span>ARROWS / ENTER</span><small>Move / Hit</small></div>
      </div>
    `,
    audio: `
      <div class="menu-prototype-panel-heading">
        <span class="menu-prototype-kicker">PRESENTATION</span>
        <h3>Audio & Graphics</h3>
        <p>Modern grouping without replacing the original visual character.</p>
      </div>
      <div class="menu-prototype-settings">
        ${getSettingMarkup('Graphics', ['SHARP', 'SOFT'], 0)}
        ${getSettingMarkup('BGM', ['ON', 'OFF'], 0)}
        ${getSettingMarkup('SFX', ['STEREO', 'MONO', 'OFF'], 0)}
      </div>
    `,
    language: `
      <div class="menu-prototype-panel-heading">
        <span class="menu-prototype-kicker">LOCALE</span>
        <h3>Language</h3>
        <p class="menu-prototype-long-copy">Català preview: Configuració d’àudio i gràfics per a una experiència de joc coherent.</p>
      </div>
      <div class="menu-prototype-language-grid">
        <button type="button" class="is-current">English</button>
        <button type="button">Español</button>
        <button type="button">Català</button>
        <button type="button">한국어</button>
        <button type="button">中文</button>
      </div>
    `,
    about: `
      <div class="menu-prototype-panel-heading">
        <span class="menu-prototype-kicker">VERSION 2.0</span>
        <h3>Classic game, cohesive shell</h3>
        <p>Original physics and personality, with a cleaner desktop and web experience.</p>
      </div>
      <div class="menu-prototype-about-mark">
        <span>1997</span>
        <strong>→</strong>
        <span>2.0</span>
      </div>
    `,
    quit: `
      <div class="menu-prototype-panel-heading">
        <span class="menu-prototype-kicker menu-prototype-kicker-danger">DESKTOP</span>
        <h3>Quit Game</h3>
        <p>Desktop-only actions stay inside the same visual system as the game.</p>
      </div>
      <div class="menu-prototype-warning">Return to the desktop?</div>
    `,
  };
  return panels[panelId] || panels.match;
}

function getSettingMarkup(label, options, selectedIndex) {
  return `
    <button
      type="button"
      class="menu-prototype-setting"
      data-options="${options.join('|')}"
      data-option-index="${selectedIndex}"
    >
      <span>${label}</span>
      <strong class="menu-prototype-setting-value">${options[selectedIndex]}</strong>
      <span class="menu-prototype-setting-arrows" aria-hidden="true">◀ ▶</span>
    </button>
  `;
}
