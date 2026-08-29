'use strict';

import settingsStoreModule from './settings_store.cjs';
import { localStorageWrapper } from './utils/local_storage_wrapper.js';

const { createSettingsStore } = settingsStoreModule;

function getSystemColorScheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export const settingsStore = createSettingsStore(
  localStorageWrapper,
  getSystemColorScheme
);
