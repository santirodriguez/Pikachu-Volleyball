# v3 Native Feasibility Evidence

## Decision

Phase 3 gate: `NATIVE_GO = PASS`.

This decision approves moving to the shared-core phase after this evidence is integrated. It does **not** mean the native runtime has production parity, and it does not authorize a merge, release, version bump, or removal of the Electron fallback.

The feasibility question for this phase was deliberately narrower: can a bounded SDL3 + QuickJS host use real Pikachu Volleyball content, cover the required desktop primitives, render the existing production locales, and produce a real standalone AppImage below the `30 MiB` gate with enough room to justify continuing?

The measured answer is yes.

## Final artifact

Final Phase 3 AppImage:

- file: `Pikachu-Volleyball-Native-Spike-x86_64.AppImage`
- size: `11,528,696` bytes (`10.99 MiB`)
- hard feasibility limit: `31,457,280` bytes (`30 MiB`)
- remaining headroom: `19,928,584` bytes (about `19.0 MiB`)
- SHA-256: `b35b0c90f2049ec7e619d3628516a004991fd36cd964a9ff8b274980808616e2`
- AppImage SquashFS compression: Zstd
- SquashFS block size: `131072` bytes

The final artifact is intentionally larger than the first successful native spike because it includes the Unicode text stack and a pan-Unicode font rather than relying on fonts installed by the target distribution.

## Pinned native inputs

The spike builds from verified, pinned inputs:

- SDL3 `3.4.16`
- SDL3_ttf `3.2.2`
- QuickJS `2026-06-04`
- GNU Unifont `17.0.04`
- appimagetool `1.9.1`
- AppImage runtime `20251108`

SDL3_ttf uses FreeType and HarfBuzz. The resulting linked runtime dependencies required by the two spike executables are collected into the AppDir, while the normal glibc/system-loader boundary remains outside the bundle.

## Functional evidence

The native spike demonstrates the following with real project content rather than placeholder-only fixtures.

### Rendering and assets

SDL3 creates the native window/renderer and loads the production `sprite_sheet.png` through libpng.

Validated sprite dimensions from the real project asset:

- `476 x 885`

The rendered self-test passed before packaging, through the AppImage runtime, and from the extracted AppRun path.

### Input and QuickJS

A QuickJS state machine drives the representative menu path while SDL3 supplies keyboard events.

The automated path proves:

- keyboard event delivery from SDL3;
- Up/Down menu navigation;
- locale selection through Left/Right;
- Enter activation;
- native host to QuickJS function calls;
- QuickJS state returned to the native host.

Final automated state:

- selected menu entry: Audio
- locale: `es-ar`
- audio request count: `1`

### Audio

The spike exercises two existing production audio assets:

- `WAVE140_1.wav` is loaded and queued through the SDL3 audio path;
- `bgm.mp3` is opened and decoded with mpg123.

The MP3 probe decoded real PCM data at `44100 Hz`, two channels. The WAV playback path also completed successfully under the CI dummy audio device.

This proves the selected native architecture can consume the project's current WAV and MP3 formats. It is not yet a claim that the complete game's audio behavior, volume policy, timing, or settings parity is finished.

## Production locale evidence

All five production locale HTML files are packaged/read during the base self-test:

- `en`
- `es-ar`
- `ca`
- `ko`
- `zh`

The stronger Unicode probe also consumes the existing production source `src/resources/js/integrated_menu_strings.js` and calls its public `getIntegratedMenuStrings()` API.

Because that source is an ES module while the bounded QuickJS probe evaluates a global script, the probe removes exactly one expected `export` keyword **in memory**. It validates the exact exported function signature and refuses to continue if the module shape differs. The production source file is not modified and translations are not copied into the probe.

SDL3_ttf plus the bundled Unifont font then validates glyph availability and renders the real language-label text returned by the production menu-string API:

- `en`: `Language` — PASS
- `es-ar`: `Idioma` — PASS
- `ca`: `Idioma` — PASS
- `ko`: `언어` — PASS
- `zh`: `语言` — PASS

The Korean and Chinese checks therefore prove actual UTF-8 glyph coverage and rendering inside the AppImage instead of merely proving that locale files exist on disk.

## AppImage execution evidence

For the final artifact, all of the following passed:

- direct AppImage base self-test;
- direct AppImage Unicode self-test;
- `APPIMAGE_EXTRACT_AND_RUN=1` base self-test;
- `APPIMAGE_EXTRACT_AND_RUN=1` Unicode self-test;
- extracted `AppRun` base self-test;
- extracted `AppRun` Unicode self-test;
- bundled linked-library check with no unresolved dependency reported.

The direct-execution harness only classifies a failure as an environment limitation when it matches a known FUSE/AppImage host-capability error. Unknown non-zero exits are product/test failures rather than automatic skips.

## Validation runs

Final native feasibility run:

- GitHub Actions run: `35271721020`
- result: PASS

Final repository regression run on the same branch head:

- Pull Request Quality run: `35271721022`
- result: PASS

The quality run includes the established package/lock consistency, production dependency audit, lint, unit/characterization tests, production web build, locale-output checks, and source-map guard.

## Why `NATIVE_GO` passes

The final spike satisfies the feasibility gate without restructuring the game first:

1. SDL3 handles representative rendering and keyboard input.
2. QuickJS executes native-hosted application state and host calls.
3. The runtime consumes real graphics, WAV, MP3, and production locale data.
4. SDL3_ttf renders real English, Spanish, Catalan, Korean, and Chinese menu strings with a bundled font.
5. A real direct-executing x86_64 AppImage passes the automated runtime checks.
6. The artifact is `10.99 MiB`, leaving about `19.0 MiB` before the `30 MiB` limit.
7. The repository's existing web/game regression suite remains green.

The remaining headroom is materially larger than the frozen 2.1 web application payload and existing project assets, so the result provides reasonable room for the next phase to integrate the characterized shared core. This is still a budget that Phase 4 and later phases must measure continuously rather than assume indefinitely.

## What this phase does not prove

`NATIVE_GO` is an architecture-feasibility decision, not a parity claim.

Phase 3 does **not** yet prove:

- full gameplay execution under QuickJS;
- physics/AI/scoring/RNG/timing parity in the native host;
- complete graphics or animation parity;
- complete audio timing, mixing, volume, or settings parity;
- control remapping parity;
- settings migration/persistence parity;
- full menu flow parity;
- screen-reader or other assistive-technology semantics;
- complete accessibility parity;
- representative cross-distribution/desktop AppImage validation;
- final dependency minimization or release packaging;
- reproducible release-grade AppImage output across clean builders.

Those are later gates. In particular, the keyboard-operable representative menu and UTF-8 rendering prove the feasibility of an accessible/localized UI path; they do not substitute for Phase 5 accessibility parity work.

## Historical lessons applied

This spike deliberately avoids repeating the discarded-v3 mistakes:

- it proves AppImage directly instead of substituting RPM/DEB/tar;
- it does not reintroduce a WebView/WebKitGTK/GStreamer runtime;
- it does not create a compression-tuning subproject;
- it tests runtime behavior rather than incidental runner package absence;
- it keeps environment limitations distinct from product failures;
- it uses pinned hashes and records the real artifact measurements;
- it leaves production gameplay, web sources, Electron, package metadata, and existing packaging untouched while feasibility is being decided.

## Next phase boundary

After this Phase 3 evidence is explicitly approved for integration, Phase 4 may begin.

Phase 4 must characterize behavior before moving it and isolate only the boundaries required by the proven native target. The Electron path remains the validated desktop fallback while the shared core is migrated. Web/PWA must remain green throughout.

The next gate is `CORE_PARITY`, not release readiness.
