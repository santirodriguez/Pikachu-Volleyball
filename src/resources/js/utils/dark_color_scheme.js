'use strict';

import { settingsStore } from '../settings_store.js';
import gameSettingsModule from '../game_settings.cjs';

const { applyColorScheme } = gameSettingsModule;

setUpDarkColorSchemeCheckbox();

/**
 * Set up dark color scheme checkbox for pages that still expose the legacy
 * checkbox, such as update history. Game pages use the application shell and
 * integrated menu instead.
 */
function setUpDarkColorSchemeCheckbox() {
  const darkColorSchemeCheckboxElements = Array.from(
    document.getElementsByClassName('dark-color-scheme-checkbox')
  );
  const colorScheme = settingsStore.getSettings().colorScheme;

  applyColorScheme(colorScheme, document);
  darkColorSchemeCheckboxElements.forEach((elem) => {
    // @ts-ignore
    elem.checked = colorScheme === 'dark';
  });

  darkColorSchemeCheckboxElements.forEach((elem) => {
    elem.addEventListener('change', () => {
      // @ts-ignore
      const nextColorScheme = elem.checked ? 'dark' : 'light';
      settingsStore.set('colorScheme', nextColorScheme);
      applyColorScheme(nextColorScheme, document);
      darkColorSchemeCheckboxElements.forEach((element) => {
        if (element !== elem) {
          // @ts-ignore
          element.checked = elem.checked;
        }
      });
    });
  });
}
