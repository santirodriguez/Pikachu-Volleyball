'use strict';

import { createGameCore } from './shared_core.js';
import inputActionsModule from './input_actions.cjs';
import inputFrameModule from './input_frame.cjs';
import controlBindingsModule from './control_bindings.cjs';
import settingsStoreModule from './settings_store.cjs';
import gameSettingsModule from './game_settings.cjs';
import nativeAudioModule from './native_audio_state.cjs';
import nativePreferencesModule from './native_preferences.cjs';
import { createNativeRenderState } from './native_render_state.js';

const { INPUT_ACTIONS, InputActionState } = inputActionsModule;
const { createFrameInputFromActionSnapshot } = inputFrameModule;
const {
  validateControlBinding,
  resetControlBindings,
  getPlayerKeyboardConfig,
} = controlBindingsModule;
const { DEFAULT_SETTINGS, sanitizeSetting } = settingsStoreModule;
const { FPS_BY_SPEED } = gameSettingsModule;
const { createNativeAudioState } = nativeAudioModule;
const {
  normalizeNativePreferences,
  serializeNativePreferences,
} = nativePreferencesModule;

let application = null;

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
  const normalized = normalizeNativePreferences(serializedPreferences);
  const settings = normalized.settings;
  const controlBindings = normalized.controlBindings;
  const renderState = createNativeRenderState(settings.graphic);
  const audioState = createNativeAudioState(settings);
  const core = createGameCore();
  core.normalFPS = FPS_BY_SPEED[settings.speed];
  core.winningScore = Number(settings.winningScore);
  core.isStereoSound = settings.sfx === 'stereo';

  application = {
    core,
    renderState,
    audioState,
    settings,
    controlBindings,
    actionStates: [
      createPlayerActionState(controlBindings, 1),
      createPlayerActionState(controlBindings, 2),
    ],
    fixedDownCodes: new Set(),
    preferencesDirty: false,
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
  active.renderState.applyEffects(active.lastResult.effects);
  active.audioState.applyEffects(active.lastResult.effects);
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
    audio: active.audioState.getState(),
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
  active.renderState.applyEffects(active.lastResult.effects);
  return active.core.isPracticeMode;
}

export function getRenderFrame() {
  return requireApplication().renderState.getRenderFrame();
}

export function getRenderFrameJson() {
  return JSON.stringify(getRenderFrame());
}


function rebuildActionStates(active) {
  active.actionStates = [
    createPlayerActionState(active.controlBindings, 1),
    createPlayerActionState(active.controlBindings, 2),
  ];
  active.fixedDownCodes.clear();
}

export function drainAudioCommands() {
  return requireApplication().audioState.drain();
}

export function getPersistedPreferencesJson() {
  const active = requireApplication();
  return serializeNativePreferences(active.settings, active.controlBindings);
}

export function setSetting(name, value) {
  const active = requireApplication();
  const sanitized = sanitizeSetting(name, value);
  if (sanitized === null) return false;

  if (name === 'winningScore') {
    const numeric = Number(sanitized);
    if (active.core.isPracticeMode) return false;
    if (
      active.core.isMatchInProgress() &&
      active.core.scores.some((score) => score >= numeric)
    ) {
      return false;
    }
    active.core.winningScore = numeric;
  } else if (name === 'speed') {
    active.core.normalFPS = FPS_BY_SPEED[sanitized];
  } else if (name === 'sfx') {
    active.core.isStereoSound = sanitized === 'stereo';
  } else if (name === 'graphic') {
    active.renderState.setGraphicMode(sanitized);
  }

  active.settings = { ...active.settings, [name]: sanitized };
  active.preferencesDirty = true;
  if (name === 'bgm' || name === 'sfx') {
    active.audioState.updateSettings(active.settings);
  }
  return true;
}

export function setControlBinding(bindingId, code) {
  const active = requireApplication();
  const result = validateControlBinding(
    active.controlBindings,
    bindingId,
    code
  );
  if (!result.ok) return result;
  active.controlBindings = result.bindings;
  active.preferencesDirty = true;
  rebuildActionStates(active);
  return {
    ok: true,
    bindingId,
    code,
    bindings: { ...active.controlBindings },
  };
}

export function resetControlBindingScope(scope) {
  const active = requireApplication();
  active.controlBindings = resetControlBindings(
    active.controlBindings,
    scope
  );
  active.preferencesDirty = true;
  rebuildActionStates(active);
  return {
    ok: true,
    scope,
    bindings: { ...active.controlBindings },
  };
}

export function resetDefaults() {
  const active = requireApplication();
  active.core.setPracticeMode(false);
  for (const [name, value] of Object.entries(DEFAULT_SETTINGS)) {
    setSetting(name, value);
  }
  return true;
}


export function consumePreferencesDirty() {
  const active = requireApplication();
  const dirty = active.preferencesDirty;
  active.preferencesDirty = false;
  return dirty;
}
