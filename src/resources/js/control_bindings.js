'use strict';

import { localStorageWrapper } from './utils/local_storage_wrapper.js';
import controlBindingsModule from './control_bindings.cjs';

const {
  CONTROL_BINDING_STORAGE_KEY,
  cloneDefaultControlBindings,
  parseControlBindings,
  serializeControlBindings,
} = controlBindingsModule;

export function loadControlBindings() {
  const serialized = localStorageWrapper.get(CONTROL_BINDING_STORAGE_KEY);
  return serialized
    ? parseControlBindings(serialized)
    : cloneDefaultControlBindings();
}

export function saveControlBindings(bindings) {
  localStorageWrapper.set(
    CONTROL_BINDING_STORAGE_KEY,
    serializeControlBindings(bindings)
  );
}
