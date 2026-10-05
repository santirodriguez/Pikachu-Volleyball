# Control Binding Extension Guide

## Purpose

This document records the stable control-remapping contract introduced in 2.0 and its current Web and SDL3 + QuickJS owners. Future input changes should begin here instead of rediscovering keyboard ownership across the controller, menu and storage layers.

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

Browser runtime semantic input state. `PikaKeyboard.setBindings()` replaces action mappings without replacing global event listeners or altering the simulation.

### `src/resources/js/game_commands.js`

Browser operational boundary used by the DOM menu. It applies validated bindings to both existing keyboard objects, clears held state and persists accepted changes.

### `src/resources/js/integrated_menu.js`

User interaction only:

1. select an action;
2. capture a `KeyboardEvent.code`;
3. validate reserved-key and conflict rules;
4. display the proposed change;
5. accept or cancel;
6. refresh the visible binding list.

The menu must never write directly to local storage or mutate keyboard internals.

### Native input and menu owners

`src/resources/js/input_actions.cjs` and `input_frame.cjs` translate semantic action
state into host-neutral frame input. `native_app.js` uses those same definitions
and `control_bindings.cjs` to rebuild both players' action states after validated
changes, reset held state and mark preferences dirty.

`native_menu_state.js` owns capture, confirmation, cancellation, player grouping,
Tab traversal and pointer/accessibility activation. It calls the native command
surface in `native_app.js`, never filesystem APIs or simulation internals.
`desktop/native/native_main.c` translates SDL scancodes to the existing code names,
clears input on focus loss and performs atomic preference I/O. The renderer and
AccessKit consumers use the menu state's geometry rather than independent targets.

Both hosts reject repeated destructive confirmation events only inside menus.
Keep gameplay's original held-key and Power Hit behavior intact. Native Quit exits
the process; ordinary Web play has no Quit command.

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

Web stores this payload under the existing local-storage key. Native stores the
same serialized binding payload inside schema 1 `values`, via
`native_preferences.cjs`; the C host owns the `preferences.json` file and atomic
replacement. The SDL preference identity remains `santirodriguez` /
`Pikachu Volleyball`. The optional `pv-native-locale` value preserves an explicitly
selected supported locale; missing/invalid values fall back to system locale.
Locale changes retain control bindings while restarting the match. The bounded
Electron importer is upgrade compatibility, not an active runtime. Never migrate
IDs merely to match a new display name.

## Adding an Editable Action

1. Add one definition to `CONTROL_BINDING_DEFINITIONS`.
2. Give it a unique default `KeyboardEvent.code`.
3. Add localized action labels to `integrated_menu_strings.js` for all five locales.
4. Include it in `getPlayerKeyboardConfig()` and verify both the browser keyboard and native action-state adapters, including SDL scancode coverage.
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
- keyboard-only editor navigation, Tab/Shift+Tab containment and return focus;
- pointer and AT-SPI capture/cancel/reset paths, with repeat-safe confirmation;
- packaged AppImage smoke test.
