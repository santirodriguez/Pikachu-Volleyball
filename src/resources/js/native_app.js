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
import {
  createNativeMenuState,
  NATIVE_ABOUT_URLS,
} from './native_menu_state.js';

const { INPUT_ACTIONS, InputActionState } = inputActionsModule;
const { createFrameInputFromActionSnapshot } = inputFrameModule;
const {
  CONTROL_BINDING_DEFINITIONS,
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

function applyCoreResult(active, result) {
  active.lastResult = result;
  active.renderState.applyEffects(result.effects);
  active.audioState.applyEffects(result.effects);
  return result;
}

function rebuildActionStates(active) {
  active.actionStates = [
    createPlayerActionState(active.controlBindings, 1),
    createPlayerActionState(active.controlBindings, 2),
  ];
  active.fixedDownCodes.clear();
}

function createMenuCommands() {
  return Object.freeze({
    setPaused: (paused) => requireApplication().core.setPaused(paused),
    resetInputs,
    restartMatch: () => {
      const active = requireApplication();
      active.core.setPaused(false);
      applyCoreResult(active, active.core.restart());
      resetInputs();
      return true;
    },
    restartForLocale: () => {
      const active = requireApplication();
      active.core.setPaused(false);
      applyCoreResult(active, active.core.restart());
      resetInputs();
      return true;
    },
    getSettings: () => {
      const active = requireApplication();
      return {
        ...active.settings,
        winningScore: String(active.core.winningScore),
        practiceMode: active.core.isPracticeMode,
        controlBindings: { ...active.controlBindings },
        controlDefinitions: CONTROL_BINDING_DEFINITIONS.map((definition) => ({
          ...definition,
        })),
      };
    },
    setSetting,
    setWinningScore,
    setPracticeMode,
    previewControlBinding,
    setControlBinding,
    resetControlBindingScope,
    resetDefaults,
    isMatchInProgress: () => requireApplication().core.isMatchInProgress(),
    requestPlatformCommand,
  });
}

export function initialize(serializedPreferences = '{}', initialLocale = 'en') {
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
    platformCommands: [],
    menuState: null,
    lastResult: core.finish(),
  };
  application.menuState = createNativeMenuState(
    createMenuCommands(),
    initialLocale
  );
  return true;
}

export function handleKey(code, isDown, repeat = false) {
  const active = requireApplication();
  if (typeof code !== 'string' || code.length === 0) return false;

  if (active.menuState.handleKey(code, isDown, repeat)) {
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

export function handlePointer(x, y, isDown = true) {
  const active = requireApplication();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return active.menuState.handlePointer(x, y, Boolean(isDown));
}

export function handleAccessibilityAction(nodeId, action) {
  const active = requireApplication();
  if (!Number.isInteger(nodeId) || typeof action !== 'string') return false;
  return active.menuState.handleAccessibilityAction(nodeId, action);
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

  return applyCoreResult(active, active.core.step({ players: frameInputs }));
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
    locale: active.menuState.getLocale(),
    menu: active.menuState.getFrame(),
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
  applyCoreResult(active, active.core.setPracticeMode(Boolean(enabled)));
  return active.core.isPracticeMode;
}

export function getRenderFrame() {
  const active = requireApplication();
  return {
    ...active.renderState.getRenderFrame(),
    locale: active.menuState.getLocale(),
    quickRematchText: active.menuState.getQuickRematchHint(),
  };
}

export function getRenderFrameJson() {
  return JSON.stringify(getRenderFrame());
}

export function getMenuFrame() {
  return requireApplication().menuState.getFrame();
}

export function getMenuFrameJson() {
  return JSON.stringify(getMenuFrame());
}

export function getLocale() {
  return requireApplication().menuState.getLocale();
}

export function setLocale(locale) {
  return requireApplication().menuState.setLocale(locale);
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

export function setWinningScore(value) {
  const active = requireApplication();
  const sanitized = sanitizeSetting('winningScore', String(value));
  if (sanitized === null) return { ok: false, reason: 'invalid' };

  const numeric = Number(sanitized);
  if (active.core.isPracticeMode) {
    return { ok: false, reason: 'practice-mode' };
  }
  if (
    active.core.isMatchInProgress() &&
    active.core.scores.some((score) => score >= numeric)
  ) {
    return { ok: false, reason: 'score-reached' };
  }
  if (!setSetting('winningScore', sanitized)) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true };
}

export function previewControlBinding(bindingId, code) {
  const active = requireApplication();
  return validateControlBinding(active.controlBindings, bindingId, code);
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
  setPracticeMode(false);
  for (const [name, value] of Object.entries(DEFAULT_SETTINGS)) {
    setSetting(name, value);
  }
  return true;
}

export function requestPlatformCommand(command) {
  const active = requireApplication();
  if (!command || typeof command.type !== 'string') return false;
  active.platformCommands.push({ ...command });
  return true;
}

export function drainPlatformCommands() {
  const active = requireApplication();
  const commands = active.platformCommands.map((command) => ({ ...command }));
  active.platformCommands.length = 0;
  return commands;
}

export function getAllowedExternalUrls() {
  return [...NATIVE_ABOUT_URLS];
}

export function consumePreferencesDirty() {
  const active = requireApplication();
  const dirty = active.preferencesDirty;
  active.preferencesDirty = false;
  return dirty;
}
