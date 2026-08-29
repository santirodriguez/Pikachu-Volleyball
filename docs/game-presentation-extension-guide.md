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

Use this file to connect runtime components. Keep presentation-specific state in the controller or view rather than adding it to the runtime bootstrap.

### Game state flow

`src/resources/js/pikavolley.js`

The controller stores the current state as a function reference in `this.state`. Important presentation states include:

- `intro`;
- `menu`;
- `afterMenuSelection`;
- `beforeStartOfNewGame`;
- `startOfNewGame`;
- `round`;
- `afterEndOfRound`;
- `beforeStartOfNextRound`.

Each state uses `frameCounter` and values in `frameTotal` to preserve original timing. A future title-screen redesign should be introduced as a dedicated state or as a replacement view for an existing presentation state. It should not be implemented by changing physics timing or by adding unrelated conditions to `round`.

Safe procedure for a new presentation state:

1. Add a dedicated view container in `view.js`.
2. Register the container in the `PikachuVolleyball` constructor.
3. Add an explicit controller state method.
4. Reset `frameCounter` when entering and leaving the state.
5. Use semantic input edges from `keyboard.js` for confirmation.
6. Keep the transition to the existing menu or match states explicit.
7. Add a regression test or documented AppImage check for the transition.

### Rendering and visual composition

`src/resources/js/view.js`

Responsibilities:

- creates PixiJS containers and sprites;
- controls visibility and draw order;
- renders the intro, game menu, players, ball, scoreboards and messages;
- applies presentation-only animation.

Future changes to the title presentation, backgrounds, scoreboards, messages or decorative details should normally be made here. Rendering changes must consume state from the controller or physics model without mutating simulation values.

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
- scoring detection;
- AI decisions;
- frame-rate assumptions.

A visual effect may read simulation state, but it should not write to physics fields unless the feature is explicitly a gameplay change with its own preservation review.

### Integrated application interface

Primary ownership:

- `src/resources/js/integrated_menu.js`;
- `src/resources/js/game_commands.js`;
- `src/resources/js/settings_store.js` and `settings_store.cjs`;
- `src/resources/js/game_settings.cjs`;
- `src/resources/integrated-menu.css`;
- `src/resources/js/integrated_menu_strings.js` and related localized menu copy.

The integrated menu is the game page's DOM UI authority and is mounted as an HTML overlay above the canvas. It is intentionally separate from the PixiJS game presentation. Future game-screen redesigns may change the canvas content without rebuilding application commands.

Use `game_commands.js` for restart, pause, options, locale changes, control changes and desktop quit. Persist supported application settings through the settings store. Do not reconnect operations through hidden legacy buttons, checkboxes or simulated clicks.

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
6. Validate web and AppImage builds.
7. Compare the final transition timing with the preservation matrix.

### Graphical-detail update

1. Identify whether the change belongs to an asset, `view.js`, CSS overlay or a combination.
2. Update the smallest owning layer.
3. Verify Sharp and Soft rendering.
4. Check 800×600 minimum desktop size and maximized windows.
5. Check Firefox, Chromium and packaged Electron rendering.
6. Record screenshots and affected preservation-matrix rows in the PR.

## Required checks

For any future presentation change:

- `npm run quality:check`;
- locale-output validation;
- AppImage packaging;
- title/menu transition smoke test;
- Player 1 and Player 2 confirmation controls;
- `P` pause behavior;
- focus-loss input cleanup;
- no packaged native menu regression;
- no changes to physics or game timing unless explicitly approved.

## Decision record

The project intentionally modernizes the application shell without coupling those changes to the reverse-engineered gameplay model. Future visual work should build on the documented bootstrap, runtime, menu and rendering boundaries above rather than reconnecting legacy DOM controls or mixing desktop packaging concerns into game-state code.
