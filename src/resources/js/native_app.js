'use strict';

import { createGameCore } from './shared_core.js';
import inputActionsModule from './input_actions.cjs';
import inputFrameModule from './input_frame.cjs';
import controlBindingsModule from './control_bindings.cjs';
import settingsStoreModule from './settings_store.cjs';
import gameSettingsModule from './game_settings.cjs';

const { INPUT_ACTIONS, InputActionState } = inputActionsModule;
const { createFrameInputFromActionSnapshot } = inputFrameModule;
const {
  CONTROL_BINDING_STORAGE_KEY,
  parseControlBindings,
  getPlayerKeyboardConfig,
} = controlBindingsModule;
const {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  sanitizeSetting,
  normalizeSystemColorScheme,
} = settingsStoreModule;
const { FPS_BY_SPEED } = gameSettingsModule;

let application = null;

function parsePreferences(serialized) {
  if (typeof serialized !== 'string' || serialized.length === 0) return {};
  try {
    const parsed = JSON.parse(serialized);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function normalizeSettings(preferences) {
  const settings = {};
  for (const [name, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    settings[name] =
      sanitizeSetting(name, preferences[STORAGE_KEYS[name]]) || defaultValue;
  }
  settings.colorScheme =
    sanitizeSetting('colorScheme', preferences[STORAGE_KEYS.colorScheme]) ||
    normalizeSystemColorScheme(preferences.systemColorScheme);
  return settings;
}

function createPlayerActionState(controlBindings, player) {
  const bindings = getPlayerKeyboardConfig(controlBindings, player);
  const isPlayerOne = player === 1;
  return new InputActionState({
    [INPUT_ACTIONS.MOVE_LEFT]: bindings.left,
    [INPUT_ACTIONS.MOVE_RIGHT]: bindings.right,
    [INPUT_ACTIONS.MOVE_UP]: bindings.up,
    [INPUT_ACTIONS.MOVE_DOWN]: bindings.down,
    [INPUT_ACTIONS.MOVE_DOWN_RIGHT]: bindings.downRight || null,
    [INPUT_ACTIONS.POWER_HIT]: bindings.powerHit,
    [INPUT_ACTIONS.CONFIRM]: bindings.powerHit,
    [INPUT_ACTIONS.BACK]: 'Escape',
    [INPUT_ACTIONS.PAUSE]: null,
    [INPUT_ACTIONS.PRACTICE_RESET]: isPlayerOne ? 'KeyB' : null,
  });
}

function requireApplication() {
  if (application === null) {
    throw new Error('Native application is not initialized');
  }
  return application;
}

export function initialize(serializedPreferences = '{}') {
  const preferences = parsePreferences(serializedPreferences);
  const settings = normalizeSettings(preferences);
  const controlBindings = parseControlBindings(
    preferences[CONTROL_BINDING_STORAGE_KEY]
  );
  const core = createGameCore();
  core.normalFPS = FPS_BY_SPEED[settings.speed];
  core.winningScore = Number(settings.winningScore);
  core.isStereoSound = settings.sfx === 'stereo';

  application = {
    core,
    settings,
    controlBindings,
    actionStates: [
      createPlayerActionState(controlBindings, 1),
      createPlayerActionState(controlBindings, 2),
    ],
    fixedDownCodes: new Set(),
    lastResult: core.finish(),
  };
  return true;
}

export function handleKey(code, isDown, repeat = false) {
  const active = requireApplication();
  if (typeof code !== 'string' || code.length === 0) return false;

  if (code === 'KeyP') {
    if (isDown) {
      if (!repeat && !active.fixedDownCodes.has(code)) {
        active.fixedDownCodes.add(code);
        active.core.setPaused(!active.core.isPaused());
      }
    } else {
      active.fixedDownCodes.delete(code);
    }
    return true;
  }

  let handled = false;
  for (const actionState of active.actionStates) {
    handled =
      (isDown
        ? actionState.handleKeyDown(code)
        : actionState.handleKeyUp(code)) || handled;
  }
  return handled;
}

export function resetInputs() {
  const active = requireApplication();
  for (const actionState of active.actionStates) actionState.reset();
  active.fixedDownCodes.clear();
  return true;
}

export function step() {
  const active = requireApplication();
  const actionSnapshots = active.actionStates.map((actionState) =>
    actionState.createSnapshot()
  );
  const frameInputs = actionSnapshots.map(createFrameInputFromActionSnapshot);

  if (frameInputs[0].practiceReset === 1) {
    active.core.requestPracticeReset();
  }

  active.lastResult = active.core.step({ players: frameInputs });
  return active.lastResult;
}

export function stepJson() {
  return JSON.stringify(step());
}

export function getState() {
  const active = requireApplication();
  return {
    settings: { ...active.settings },
    controlBindings: { ...active.controlBindings },
    core: active.core.getSnapshot(),
    lastEffects: active.lastResult.effects.map((effect) => [...effect]),
  };
}

export function getStateJson() {
  return JSON.stringify(getState());
}

export function getStateId() {
  return requireApplication().core.getCurrentStateId();
}

export function getTargetFps() {
  return requireApplication().core.normalFPS;
}

export function setPracticeMode(enabled) {
  const active = requireApplication();
  active.lastResult = active.core.setPracticeMode(Boolean(enabled));
  return active.core.isPracticeMode;
}
