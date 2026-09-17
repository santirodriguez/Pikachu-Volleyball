# Phase 5 Native parity

## Status

Phase 5 implementation starts from `v3-restart` commit `7df08af860b5c07605f07ba6b9087dabcab189c1` after `CORE_PARITY = PASS`.

This phase targets `NATIVE_PARITY` for the SDL3 + QuickJS desktop path. Electron remains the validated fallback. Web/PWA behavior remains in scope for regression validation. Phase 5 does not authorize Electron retirement, promotion to `main`, a version bump, tag, release, publication, deployment, alternate Linux package formats, or broad distribution claims.

## Architecture boundary

The production native path is separate from `desktop/native-spike/`. The spike remains feasibility provenance.

The intended production ownership is:

- shared JavaScript gameplay authority: the accepted Phase 4 `GameCore`, `PikaPhysics`, AI and RNG implementation;
- native application JavaScript bundle: host-neutral presentation, menu, settings, controls and localization behavior required by QuickJS;
- SDL3 platform host: windowing, render execution, audio device/mixing, SDL event translation, persistent file I/O, accessibility adapter, external-link opening, quit and startup/error reporting;
- native preferences store: atomic JSON persisted outside the AppImage, with values sanitized by the existing pure JavaScript rules;
- accessibility adapter: AccessKit C candidate on Linux, with AT-SPI behavior proven before full UI migration.

No physics, AI, scoring, collision or gameplay timing rule may be reimplemented in C.

## 5.0 Frozen parity oracles

Before production native code moves user-visible ownership, `test/native_parity_contract.test.cjs` freezes the current accepted contracts needed by the native port:

- application setting defaults and valid values;
- control-binding defaults, reserved recovery keys and serialized schema;
- semantic input actions and Power Hit alternates;
- presentation snapshot ownership and punch-effect render-step ordering;
- menu navigation helpers and locale normalization;
- accepted audio volume and stereo-pan constants;
- critical presentation formulas for intro, menu, player/ball rendering and game-end animation;
- source ownership boundaries for `view.js`, `audio.js`, `integrated_menu.js`, `integrated_menu_strings.js`, `settings_store.cjs`, `control_bindings.cjs` and `game_presentation.cjs`.

These are behavioral/refactor oracles, not a permanent requirement that the original source files remain byte-identical.

## 5.1 Fail-fast blockers

### Accessibility

The first candidate is AccessKit C `0.22.3`, pinned to upstream commit `826d672661f9453c8b269ab3946dbcbae6300555`.

Before a full menu port proceeds, the native branch must prove on Linux that an SDL window can expose a semantic tree through AT-SPI with:

- window/dialog and interactive control roles;
- labels and state;
- assistive focus synchronized with visual focus;
- focus actions initiated from assistive technology;
- dynamic updates and live status text;
- modal state suitable for confirmation dialogs.

Keyboard-only navigation is not sufficient evidence for this gate. The build must also record the AccessKit dependency closure and native AppImage size impact.

### Electron preference migration

A controlled 2.1-compatible Electron profile must be generated with non-default values for:

- `pv-offline-graphic`;
- `pv-offline-bgm`;
- `pv-offline-sfx`;
- `pv-offline-speed`;
- `pv-offline-winningScore`;
- `colorScheme`;
- `pv-control-bindings-v1`.

The actual on-disk Chromium localStorage representation is evidence, not an assumed implementation detail. The native importer must be automatic and idempotent on first native launch, sanitize through the existing application rules, and atomically write the native store. A bounded LevelDB reader is acceptable if the measured Electron profile confirms that backend. Bundling Chromium, Node.js or WebKit merely to migrate preferences is not acceptable.

If accessibility or migration cannot be proven with a bounded implementation, Phase 5 stops for architecture review rather than weakening `NATIVE_PARITY`.

## Ordered implementation checkpoints

1. **5.0 — parity oracles:** freeze presentation/audio/menu/settings/control/migration behavior before refactors.
2. **5.1 — fail-fast blockers:** prove AccessKit/AT-SPI and real Electron preference migration.
3. **5.2 — production host:** create the deliberate QuickJS native bundle and `desktop/native/` SDL3 host while retaining Phase 3 pins unless evidence requires an explicit change.
4. **5.3 — graphics:** move only reusable presentation math to host-neutral JavaScript; SDL executes render commands against the production sprite atlas. Preserve Sharp/Soft, draw order, intro/menu/game animations, scores, clouds/waves, fades and quick-rematch presentation.
5. **5.4 — audio, controls, preferences:** preserve production audio events/volumes/panning, exact controls/remapping/recovery keys, settings guards and persistence/migration.
6. **5.5 — native UI:** native pause menu, five locales, keyboard/pointer operation, AccessKit accessibility, localized startup/error reporting, exact external-link allowlist and native Quit.
7. **5.6 — closure:** exact-head Web/PWA, Electron fallback, shared-core and native artifact validation; production native AppImage must remain at or below 30 MiB.

## Gate

`NATIVE_PARITY` requires all of the following on the same exact task head:

- Phase 4 shared-core fingerprints remain accepted;
- native intro, original mode selection, match/round/game-end/quick-rematch/practice flows pass;
- Sharp/Soft graphics and presentation checks pass;
- BGM plus stereo/mono/off SFX behavior passes;
- speed and winning-score settings and their guards pass;
- control defaults, Power Hit alternates, remapping, reset, recovery keys and focus-loss cleanup pass;
- persisted settings, persisted controls and Electron-to-native migration pass;
- `en`, `es-ar`, `ca`, `ko` and `zh` render correctly;
- keyboard and pointer menu paths pass;
- AT-SPI accessibility tree, focus and actions pass;
- localized fatal startup/error behavior passes;
- external-link allowlist and negative security vectors pass;
- native Quit passes;
- Web/PWA and Electron fallback regressions remain green;
- a real native AppImage is `<= 30 MiB`, with exact artifact and bundle hashes recorded;
- runner capability limitations are reported separately from product failures.

Passing this gate still does not authorize Electron removal or release work.
