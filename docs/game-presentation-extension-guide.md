# Game Presentation Extension Guide

## Purpose

This guide records the validated architecture and extension points for future title-screen, presentation and graphical work. It is intended to prevent repeated discovery work and to keep visual changes separate from the reverse-engineered gameplay model.

## Validated baseline

The following behavior was verified in real-world Linux AppImage reviews during the 2.0 and 2.1 work:

- Player 1 Power Hit: `Z` or `Left Shift`;
- Player 2 Power Hit: `Enter` or `Left Control`;
- `P` pauses and resumes the game;
- the AppImage starts and runs correctly with the current Electron wrapper;
- the web bundle and all five supported locale outputs pass CI.

These controls are the reference baseline for future presentation work. A title-screen or graphical change must not silently modify them.

## Architectural ownership

### Application bootstrap

`src/resources/js/main.js`

Responsibilities:

- applies the effective color scheme before the game runtime loads;
- prepares the lightweight loading and integrated-menu shell;
- defers the heavy game runtime until after the initial shell can paint;
- reports a localized bootstrap failure if the runtime import fails.

Use this file only for lightweight application bootstrap. Do not place PixiJS setup, game-state logic or screen-specific animation here.

### Game runtime

`src/resources/js/game_runtime.js`

Responsibilities:

- registers and creates the PixiJS renderer, stage, ticker and loader;
- loads the sprite sheet;
- constructs `PikachuVolleyball`;
- hydrates persisted gameplay settings;
- owns visibility-based audio mute and unmute behavior;
- constructs `GameCommands` and mounts the integrated menu;
- performs deferred audio warm-up;
- starts the game and render loop.

Use this file to connect runtime components. Keep deterministic gameplay state in the shared core and presentation-specific state in the view or host adapter rather than adding either to the runtime bootstrap.

### Shared gameplay core

Primary ownership:

- `src/resources/js/game_core.cjs`;
- `src/resources/js/shared_core.js`;
- `src/resources/js/physics.js`;
- `src/resources/js/rand.js`.

`game_core.cjs` is the host-neutral authority for deterministic lifecycle, scoring, timing, slow motion, practice/reset, quick-rematch and ordered gameplay effects. `shared_core.js` constructs that core around the existing reverse-engineered `PikaPhysics` implementation.

The shared core must remain independent of DOM, PixiJS, localStorage, Electron and SDL/native APIs. Physics, AI decisions, RNG ordering, scoring and frame timing must not be duplicated in a host adapter.

`physics.js` continues to contain the reverse-engineered simulation/AI behavior. Presentation work must consume its state through the shared-core boundary rather than mutate simulation state for visual convenience.

### Browser/Electron gameplay adapter

`src/resources/js/pikavolley.js`

`PikachuVolleyball` remains the web application's public controller facade, but it is now an adapter over the shared `GameCore` rather than the owner of a separate lifecycle/scoring implementation.

Responsibilities:

- translates browser keyboard state into serializable frame input;
- maps ordered core effects to the existing Pixi view and audio adapters;
- preserves the existing public command/settings surface expected by the integrated menu;
- owns host-only DOM details such as the quick-rematch hint and the practice-reset key event;
- keeps the current state handler function surface compatible with the browser render loop.

The deterministic state IDs remain:

- `intro`;
- `menu`;
- `after-menu-selection`;
- `before-start-of-new-game`;
- `start-of-new-game`;
- `round`;
- `after-end-of-round`;
- `before-start-of-next-round`.

Frame counters and transition rules belong to `GameCore`. A future title-screen redesign should change presentation or an explicitly approved core state transition; it should not reintroduce timing/scoring rules into `pikavolley.js`.

Safe procedure for a new presentation state:

1. Characterize the accepted transition and frame behavior first.
2. Add a dedicated view container in `view.js` when new canvas presentation is required.
3. Add or change the explicit host-neutral lifecycle state in the shared core only when the feature genuinely changes lifecycle ownership.
4. Keep the `PikachuVolleyball` adapter mapping narrow and free of duplicate gameplay rules.
5. Use semantic input edges from `keyboard.js` for confirmation.
6. Keep transitions explicit and serializable.
7. Add regression evidence for both shared-core behavior and visible host presentation.

### Rendering and visual composition

`src/resources/js/view.js`

Responsibilities:

- creates PixiJS containers and sprites;
- controls visibility and draw order;
- renders the intro, game menu, players, ball, scoreboards and messages;
- applies presentation-only animation.

Future changes to the title presentation, backgrounds, scoreboards, messages or decorative details should normally be made here. Rendering changes must consume shared-core presentation snapshots/effects without mutating simulation values.

### Graphical assets

Primary locations:

- `src/resources/assets/images/`;
- `src/resources/assets/sprite_sheets/` or the current sprite-sheet JSON/PNG assets;
- `src/resources/js/assets_path.js`;
- sprite-resource references inside `view.js`.

When replacing or extending artwork:

- preserve sprite frame identifiers unless the corresponding view references are updated in the same change;
- keep transparent padding and sprite anchors consistent;
- use integer pixel dimensions for pixel-art assets;
- verify both Sharp and Soft graphics modes;
- verify the asset is copied by Webpack into `dist/resources/assets/`;
- avoid embedding presentation assets directly in JavaScript.

If a sprite-sheet layout changes, treat the JSON and PNG as one atomic asset update.

### Simulation boundary

`src/resources/js/physics.js`

This file contains reverse-engineered gameplay behavior. Presentation work should not change:

- player or ball positions used by the engine;
- collision rules;
- velocities or acceleration;
- scoring-relevant collision state;
- AI decisions;
- RNG ordering;
- frame-rate assumptions.

A visual effect may read simulation state through the core's presentation snapshot, but it should not write to physics fields unless the feature is explicitly a gameplay change with its own preservation review.

### Integrated application interface

Primary ownership:

- `src/resources/js/integrated_menu.js`;
- `src/resources/js/game_commands.js`;
- `src/resources/js/settings_store.js` and `settings_store.cjs`;
- `src/resources/js/game_settings.cjs`;
- `src/resources/integrated-menu.css`;
- `src/resources/js/integrated_menu_strings.js` and related localized menu copy.

The integrated menu is the game page's DOM UI authority and is mounted as an HTML overlay above the canvas. It is intentionally separate from the PixiJS game presentation. Future game-screen redesigns may change the canvas content without rebuilding application commands.

Use `game_commands.js` for restart, pause, options, locale changes, control changes and desktop quit. Commands that affect deterministic gameplay should cross the existing `PikachuVolleyball`/`GameCore` boundary rather than reimplement the rule in the menu layer. Persist supported application settings through the settings store. Do not reconnect operations through hidden legacy buttons, checkboxes or simulated clicks.

### Desktop boundary

- `desktop/main.js`;
- `desktop/preload.js`.

The renderer remains sandboxed with context isolation enabled and Node.js integration disabled. Desktop-only features must be exposed through narrow preload APIs and explicit IPC handlers.

Do not use `executeJavaScript` to control the renderer.

## Recommended future workflow

### Title or opening-screen redesign

1. Create a dedicated branch from the current integration branch.
2. Capture the current intro timing and transition behavior.
3. Build the new view without changing physics.
4. Keep keyboard confirmation compatible with both players.
5. Test intro timeout, manual confirmation and AI-versus-AI fallback.
6. Validate shared-core characterization, web output and AppImage behavior.
7. Compare the final transition timing with the preservation matrix.

### Graphical-detail update

1. Identify whether the change belongs to an asset, `view.js`, CSS overlay or a combination.
2. Update the smallest owning layer.
3. Verify Sharp and Soft rendering.
4. Check 800×600 minimum desktop size and maximized windows.
5. Check Firefox, Chromium and packaged Electron rendering while Electron remains the fallback.
6. Record screenshots and affected preservation-matrix rows in the PR.

## Required checks

For any future presentation change:

- `npm run quality:check`;
- shared-core characterization for affected lifecycle/gameplay boundaries;
- locale-output validation;
- AppImage packaging when desktop behavior or packaging is affected;
- title/menu transition smoke test;
- Player 1 and Player 2 confirmation controls;
- `P` pause behavior;
- focus-loss input cleanup;
- no packaged native menu regression;
- no changes to physics, RNG ordering or game timing unless explicitly approved.

## Decision record

The project intentionally modernizes the application shell without coupling those changes to the reverse-engineered gameplay model. Phase 4 established one host-neutral deterministic gameplay authority in `GameCore`, with `pikavolley.js` as the browser/Electron adapter and `game_runtime.js` as the composition root. Future visual work should build on those boundaries rather than putting scoring/timing/physics rules back into host adapters, reconnecting legacy DOM controls, or mixing desktop packaging concerns into gameplay state.
