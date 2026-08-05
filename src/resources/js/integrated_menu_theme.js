'use strict';

const COPY = Object.freeze({
  en: { label: 'Interface Theme', light: 'LIGHT', dark: 'DARK' },
  'es-ar': { label: 'Tema de interfaz', light: 'CLARO', dark: 'OSCURO' },
  ca: { label: 'Tema de la interfície', light: 'CLAR', dark: 'FOSC' },
  ko: { label: '인터페이스 테마', light: '라이트', dark: '다크' },
  zh: { label: '界面主题', light: '浅色', dark: '深色' },
});

/**
 * Preserve the existing light/dark preference after the legacy toolbar is hidden.
 * @param {ReturnType<import('./game_commands.js').createGameCommands>} commands
 */
export function setUpIntegratedMenuTheme(commands) {
  const detail = document.getElementById('pv-menu-detail');
  if (detail === null) return;

  const copy = COPY[commands.getCurrentLocale()] || COPY.en;

  function addThemeControl() {
    const settings = detail.querySelector('.pv-menu-settings');
    const graphicControl = detail.querySelector('[data-setting="graphic"]');
    if (
      settings === null ||
      graphicControl === null ||
      detail.querySelector('[data-command="color-scheme"]') !== null
    ) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pv-menu-setting';
    button.dataset.command = 'color-scheme';

    function render() {
      const current = commands.getSettings().colorScheme;
      button.innerHTML = `
        <span>${copy.label}</span>
        <strong>${current === 'dark' ? copy.dark : copy.light}</strong>
        <span class="pv-menu-setting-arrows" aria-hidden="true">◀ ▶</span>
      `;
    }

    button.addEventListener('click', () => {
      const current = commands.getSettings().colorScheme;
      commands.setColorScheme(current === 'dark' ? 'light' : 'dark');
      render();
    });

    render();
    graphicControl.insertAdjacentElement('afterend', button);
  }

  const observer = new MutationObserver(addThemeControl);
  observer.observe(detail, { childList: true, subtree: true });
  addThemeControl();
}
