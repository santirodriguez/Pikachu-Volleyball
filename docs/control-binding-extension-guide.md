# Control Binding Extension Guide

## Purpose

This document records the stable control-remapping architecture introduced for Pikachu Volleyball 2.0. Future input changes should begin here instead of rediscovering keyboard ownership across the controller, menu and storage layers.

## Validated Default Contract

The following defaults were validated in the Linux AppImage workflow before remapping was introduced:

### Player 1

- Left: `KeyD`
- Right: `KeyG`
- Jump: `KeyR`
- Down: `KeyV`
- Down-right shortcut: `KeyF`
- Power Hit primary: `KeyZ`
- Power Hit alternate: `ShiftLeft`

### Player 2

- Left: `ArrowLeft`
- Right: `ArrowRight`
- Jump: `ArrowUp`
- Down: `ArrowDown`
- Power Hit primary: `Enter`
- Power Hit alternate: `ControlLeft`

### Fixed Global Keys

- Pause menu: `KeyP`
- Practice ball reset: `KeyB`
- Menu back and cancellation: `Escape`

Global keys are intentionally excluded from gameplay remapping. They remain recovery paths when a custom configuration is invalid or unfamiliar.

## Ownership Map

### `src/resources/js/control_bindings.cjs`

Single source of truth for:

- editable binding definitions;
- default `KeyboardEvent.code` values;
- reserved keys;
- saved-data sanitization;
- conflict detection;
- player-specific reset behavior;
- storage serialization version;
- human-readable key labels.

This module is pure CommonJS so Node unit tests can exercise it without a browser.

### `src/resources/js/control_bindings.js`

Browser storage adapter. It reads and writes the versioned binding payload through the existing local-storage wrapper.

### `src/resources/js/keyboard.js`

Runtime semantic input state. `PikaKeyboard.setBindings()` replaces action mappings without replacing global event listeners or altering the simulation.

### `src/resources/js/game_commands.js`

Operational boundary used by the menu. It applies validated bindings to both existing keyboard objects, clears held state and persists accepted changes.

### `src/resources/js/integrated_menu.js`

User interaction only:

1. select an action;
2. capture a `KeyboardEvent.code`;
3. validate reserved-key and conflict rules;
4. display the proposed change;
5. accept or cancel;
6. refresh the visible binding list.

The menu must never write directly to local storage or mutate keyboard internals.

## Storage Contract

Storage key:

```text
pv-control-bindings-v1
```

Payload:

```json
{
  "version": 1,
  "bindings": {
    "p1.left": "KeyD"
  }
}
```

Missing actions, malformed JSON, obsolete versions, reserved values and duplicate assignments recover safely to defaults. Do not remove version checks when evolving the schema.

## Adding an Editable Action

1. Add one definition to `CONTROL_BINDING_DEFINITIONS`.
2. Give it a unique default `KeyboardEvent.code`.
3. Add localized action labels to the Phase 3 menu strings.
4. Include it in `getPlayerKeyboardConfig()` or the appropriate future input adapter.
5. Add conflict, persistence, reset and runtime tests.
6. Verify keyboard-only and mouse-only editing in the AppImage.

Do not add direct `keydown` listeners for individual gameplay actions. All gameplay keys must continue through semantic action state.

## Changing Defaults

Default changes are compatibility-sensitive. Before changing them:

- confirm that no default duplicates another editable action;
- check fixed global keys;
- update the preservation matrix and user-facing controls copy;
- update unit tests;
- test simultaneous movement and Power Hit;
- test focus loss and pause transitions;
- verify both players in a packaged AppImage.

A default change does not automatically overwrite a valid saved custom configuration. Schema migration must be explicit when that behavior is required.

## Simulation Boundary

Control remapping may change which key activates an existing semantic action. It must not change:

- physics calculations;
- frame timing;
- collision rules;
- AI decisions;
- scoring;
- movement semantics;
- Power Hit edge behavior.

Two keys assigned to the same semantic Power Hit action must still produce one edge event, not duplicate hits.

## Required Validation

At minimum:

- default contract tests;
- malformed-storage recovery;
- reserved-key rejection;
- cross-player conflict rejection;
- per-player and global reset;
- exact Power Hit arrays after remapping;
- persistence through application restart;
- language change with custom controls retained;
- focus-loss cleanup;
- keyboard-only editor navigation;
- packaged AppImage smoke test.
