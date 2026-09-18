# Pikachu Volleyball v3 Restart Plan

This document is the active migration plan for the new v3 attempt. It deliberately starts from the stable 2.1 release on `main` and requires measured evidence before committing to a new desktop architecture.

Historical `v3` and `v3-phase5-linux-distribution` work is mandatory evidence, not a code base. The restart does not branch from those lines and does not inherit their runtime decisions, but each phase must review relevant historical experiments before repeating work.

## Design authority

The restart follows the evidence-first direction agreed for this attempt:

- preserve the stable 2.1 product before architecture work;
- evaluate a currently supported Electron candidate before considering a native migration;
- keep AppImage as the Linux distribution target;
- if Electron is not sufficient, prove SDL3 + QuickJS with a bounded native feasibility spike before refactoring the application around it;
- require a real native AppImage no larger than `30 MiB` with reasonable headroom before approving the native migration;
- move shared-core boundaries only after feasibility is established;
- preserve browser/PWA behavior throughout the migration;
- require functional parity and reproducible AppImage evidence before release readiness.

These constraints are the current design authority and outrank historical runtime or packaging decisions from the discarded v3 branches.

## Frozen source baseline

The restart begins from:

- source commit: `d7735b13654904a5b48a0c2d1217c8b8507a8409`;
- package version: `2.1.0`;
- active regression authority: `docs/v2.1-preservation-baseline.md`.

Historical release evidence produced from that exact source commit records:

- AppImage: `97,094,772` bytes (`92.60 MiB`);
- `dist`: `3,104,830` bytes;
- assets: `2,536,399` bytes;
- JavaScript: `486,219` bytes;
- `app.asar`: `3,125,473` bytes;
- AppImage SHA-256: `ed8767ad236b1c40327372c5933979a3e8deee077493c9e16ef9e6e232886888`;
- CI process to first completed game frame: `4,293.03 ms`;
- CI process to first menu usable: `4,375.03 ms`.

The startup values are diagnostic CI observations, not universal performance thresholds. Future comparisons must record the environment and artifact being measured.

## Preservation contract

Unless a later task explicitly changes a requirement with regression evidence, preserve:

- physics, collision equations, AI decisions, scoring rules, RNG ordering, and historical game-state timing;
- 25 FPS normal gameplay and 5 FPS slow motion;
- intro, mode selection, inactivity, match, round, game-end, quick-rematch, restart, and practice flows;
- controls, remapping, settings persistence, audio, graphics, themes, accessibility behavior, and all five production locales;
- browser/PWA behavior while desktop work proceeds;
- startup observability where the selected runtime supports it;
- sandboxing, restricted navigation, and narrow desktop bridges while Electron remains active.

The full accepted 2.1 behavior remains defined in `docs/v2.1-preservation-baseline.md`.

## Historical evidence and lessons ledger

The discarded v3 branches contain useful measurements and failed hypotheses. Before starting work that overlaps an old experiment, inspect the relevant old documentation, workflow, and result. Reuse conclusions or narrowly reviewed test techniques where they still apply; do not carry the old implementation forward wholesale.

### Runtime selection

The previous v3 attempt selected Neutralino early, completed substantial compatibility and platform work, retired Electron, and only then discovered that Linux distribution constraints materially changed the value proposition. This restart therefore delays runtime commitment until the cheaper supported Electron path is measured and, if necessary, the native alternative is proven with a real artifact.

### AppImage is the distribution rule

The historical Phase 5 path selected a deterministic `.tar.gz` plus `.deb` and `.rpm`, with system GTK3, WebKitGTK, GStreamer, and `xdg-utils` dependencies. It explicitly rejected AppImage for that Neutralino architecture because bundling the WebKitGTK/GStreamer runtime erased much of the size and maintenance advantage.

That conclusion is useful evidence about Neutralino, but `.tar.gz`, `.deb`, and `.rpm` are not substitutes for the current v3 requirement. Do not redirect the restart into RPM/DEB/tar packaging when an AppImage gate is required. Alternative package formats may only be investigated if a later requirement explicitly authorizes them.

### Do not repeat the WebKitGTK/GStreamer packaging loop

Historical workflows tested both a thin Neutralino AppImage that still depended on distro WebKitGTK/GStreamer and a bundled-runtime AppImage that attempted to carry their dependency closure. Those experiments already demonstrated why that architecture was a poor fit for the current AppImage objective. Do not repeat them during the restart unless a newly approved architecture genuinely requires that dependency stack.

The native fallback for this restart is SDL3 + QuickJS, not another WebView runtime experiment.

### Compression is a measured variable, not a project direction

The stable 2.1 Electron package already uses a known working packaging configuration, including normal builder compression and Zstd AppImage SquashFS. Historical work also explored compression and packaging variants.

Do not spend a phase cycling compressors or settings based on intuition. Start from the known working configuration. Change compression only when a measured candidate shows a material reason, and compare real AppImages side by side for size, startup/runtime behavior, reproducibility, and compatibility. A smaller artifact alone does not justify a less reliable packaging path.

### Validate the product contract, not incidental runner packages

A historical Electron standalone matrix tried to prove independence from WebKitGTK/GStreamer by failing when package names matching `webkit` or `gstreamer` were installed in the test image. On Fedora, unrelated/transitive dependencies caused that assertion to fail before the Electron candidate itself was meaningfully tested.

Do not use package absence as a product gate. Validate the actual AppImage contents, required libraries, startup, gameplay, sandboxing, external-navigation restrictions, and supported runtime behavior.

### Separate CI-host limitations from product failures

A historical direct-FUSE smoke required unprivileged user namespaces and failed when the hosted runner could not write its UID map. That is evidence about the runner environment, not by itself evidence that the AppImage is broken.

Capability-dependent checks must report the missing host capability separately. When direct execution is unavailable, use an appropriate secondary validation such as extraction-based smoke without pretending that it is equivalent to final direct AppImage validation.

### Keep partial portability evidence in proportion

A build that extracts, starts in one container, or works only after installing a WebView runtime is not final AppImage readiness. Each gate must state what was actually proven and what still requires representative Linux/desktop validation.

## Phase 1 — Baseline & guardrails

Objective: make the stable 2.1 behavior and measurements an explicit gate before architectural experimentation.

Required evidence:

- integration branch created from the frozen source commit;
- preservation contract remains active;
- critical physics, AI, timing, scoring, lifecycle, quick-rematch, pause, and practice behavior has automated characterization coverage;
- repository quality and locale-output checks run for `v3-restart` pull requests;
- no production gameplay, Electron runtime, packaging configuration, branding, or version metadata changes.

Gate: `BASELINE_LOCKED`.

Status: passed on `v3-restart` head `43680c7984ff5a9506d4722da84e5a58712b711a` with Pull Request Quality run `35265685053`.

## Phase 2 — Electron candidate

Objective: evaluate a current supported Electron candidate with the smallest coherent dependency/tooling change before considering a native migration.

Before implementation, review the historical Electron standalone spike for useful security, reproducibility, and runtime checks, while explicitly removing the invalid package-absence and runner-capability assumptions described above.

Start from the current known-working AppImage compression policy. Do not add RPM, DEB, tar, WebKitGTK/GStreamer portability work, or compression experiments to the initial candidate.

Measure a real AppImage and record at least:

- exact Electron and packaging-tool versions;
- artifact size, hash, and relevant contents;
- reproducibility of the candidate build where practical;
- startup observations;
- relevant memory/runtime observations when practical;
- sandbox and navigation behavior;
- actual runtime/dependency contract;
- compatibility with the supported Linux test matrix;
- web and gameplay regression results.

Gate:

- `ELECTRON_KEEP` when the supported Electron candidate satisfies the product requirements well enough to avoid a native migration; or
- `NATIVE_SPIKE` when measured constraints justify testing the native alternative.

Do not reject the candidate solely because unrelated or transitive packages happen to exist in a CI image. Validate the product's actual dependency and runtime contract.

### Phase 2 result

The candidate isolated the packaged Electron runtime from every other meaningful variable:

- packaged Electron: `44.4.1`;
- installed/frozen Electron development dependency: `35.7.5`;
- `electron-builder`: `26.15.7`;
- `app-builder-lib`: `26.15.7`;
- package metadata and lockfile unchanged;
- `npm ci` dependency tree unchanged after installation;
- web `dist` built once with the frozen baseline toolchain and checksum-locked before packaging;
- existing normal builder compression and Zstd AppImage SquashFS policy preserved;
- existing fail-closed AppRun security transform preserved.

The clean AppImage measured:

- size: `116,955,256` bytes (`111.54 MiB`);
- delta from frozen 2.1 AppImage: `+19,860,484` bytes (`+20.45%`);
- SHA-256: `605325c655ae12524572a16201ba697ebcfdffff03775bbebae27cc48366804c`;
- SquashFS: Zstd with `131,072` byte blocks;
- exactly one Electron locale pack: `en-US.pak`;
- no packaged production source maps;
- no redundant packaged `node_modules` in `app.asar`;
- no packaged WebKitGTK/GStreamer runtime content;
- fail-closed AppRun rejection of sandbox-disabling switches remained intact.

The application payload was unchanged from the frozen 2.1 baseline:

- `dist`: `3,104,830` bytes;
- assets: `2,536,399` bytes;
- JavaScript: `486,219` bytes;
- `app.asar`: `3,125,473` bytes.

Therefore the measured AppImage increase comes from the supported Electron runtime rather than application growth or a compression/package-format experiment.

The exact clean candidate executed successfully as an extracted packaged runtime on:

- Debian 12;
- Ubuntu 22.04;
- Ubuntu 24.04;
- Fedora 44;
- openSUSE Leap 16.0.

The hosted direct-AppImage smoke was explicitly recorded as `SKIPPED` because the GitHub hosted runner did not provide the unprivileged user-namespace capability required by the fail-closed launcher policy. That host limitation is not recorded as a product failure, and extraction-based runtime validation is not represented as equivalent to final representative direct-AppImage validation.

CI startup observations were intentionally not used as a pass/fail threshold. The frozen 2.1 reference was about `4.29 s` to first completed game frame, while Electron 44 candidate iterations ranged from roughly `2.22 s` to `6.67 s` on hosted CI. The spread is large enough that a single hosted-runner startup observation is diagnostic evidence only.

Phase 2 conclusion: Electron `44.4.1` is functionally viable with the existing security and AppImage packaging model, but upgrading to a currently supported Electron runtime makes the already-large AppImage materially larger while the application payload remains byte-for-byte at the 2.1 baseline size. That is sufficient measured evidence to test the bounded native alternative rather than committing the project to the larger Electron runtime without first checking the native feasibility target.

Gate: `NATIVE_SPIKE` — PASS.

This gate does **not** select the native architecture. Electron remains the validated fallback. Phase 3 must still prove SDL3 + QuickJS with real project content and the native AppImage size target before any migration or shared-core refactor is authorized.

## Phase 3 — Native feasibility

Objective: prove or disprove the proposed SDL3 + QuickJS direction with a bounded prototype before migrating the application.

The spike must exercise real project content, including representative rendering, input, audio, assets, the five locales, and at least one accessible menu path. It must produce a real AppImage.

Gate: `NATIVE_GO` only when functional feasibility is demonstrated and the AppImage is no larger than `30 MiB` with reasonable headroom for the remaining production requirements.

A failed feasibility gate ends the native migration path rather than starting a large refactor anyway.

### Phase 3 result

`NATIVE_GO` passed and the evidence was integrated through PR #87. The final feasibility AppImage measured `11,528,696` bytes (`10.99 MiB`), leaving about `19.0 MiB` below the `30 MiB` gate, and exercised real SDL3 rendering/input, QuickJS host calls, production graphics/WAV/MP3 inputs and real UTF-8 text for all five production locales.

The detailed pinned inputs, artifact hash, runtime checks, Unicode evidence and explicit limitations are recorded in `docs/v3-native-feasibility.md`.

Gate: `NATIVE_GO` — PASS.

This gate proved architecture feasibility, not native feature parity. Electron remains the validated fallback while the shared core and native host are migrated behind later gates.

## Phase 4 — Shared core

Objective: move only the runtime boundaries needed by the proven target while preserving the web product and current desktop fallback during the transition.

Before refactoring a behavior, characterize it. Separate only the necessary input, rendering, audio, settings, and host boundaries. Preserve deterministic ordering and externally meaningful game behavior.

Gate: `CORE_PARITY` when reference and migrated scenarios preserve timing, scoring, physics, AI decisions, and RNG ordering for the agreed characterization set.

### Phase 4 result

The shared-core migration preserves the existing reverse-engineered `physics.js`/AI implementation and creates one host-neutral JavaScript gameplay authority rather than rewriting gameplay in C or maintaining separate browser/native rules.

Final ownership is:

- `physics.js` + `rand.js`: reverse-engineered simulation, AI and RNG source;
- `game_core.cjs`: deterministic lifecycle, scoring, timing, slow motion, practice/reset, quick-rematch and ordered gameplay effects;
- `shared_core.js`: core construction around the existing physics model;
- `pikavolley.js`: canonical browser/Electron adapter over the shared core;
- `game_runtime.js`: Pixi/ticker/loader/startup composition;
- persistence, locale navigation, integrated DOM menu, color scheme and desktop Quit remain outside the core.

Before changing production authority, deterministic reference traces were frozen from the accepted controller. A candidate shared-core adapter then reproduced the same full trace and physics/AI/lifecycle/scoring/command section hashes before Web/Electron routing changed.

The canonical production facade continues to pass the established 2.1 characterization expectations and all five web/PWA locale-output gates.

The same deliberate shared-core bundle was executed under Node.js `22.12.0`/V8 and pinned QuickJS `2026-06-04`. Pre-closeout run `35276967601` produced byte-identical canonical output with portable trace SHA-256 `1f8cf2eff81d0fcacd671882cb96e5c39b33fc05462e2b61b8937e059d70efb1`. The workflow also freezes that fingerprint so two engines agreeing on a new result does not silently redefine accepted behavior.

The validated shared-core bundle is `71,798` bytes with SHA-256 `787d4954faf997b7bb93d78700a8f4137b8ef05344e982d9982bf937a5e029db`.

A real AppImage was then built from the proven Phase 3 native runtime with that exact validated bundle included and hash-checked after packaging. Pre-closeout run `35276967601` measured:

- AppImage: `11,558,984` bytes (`11.02 MiB`);
- SHA-256: `1c66c0df0b3237af4ee4020b8b2002661beb1ee410dfac0dded16112d6b83ab2`;
- remaining budget below `30 MiB`: `19,898,296` bytes (about `18.98 MiB`);
- incremental AppImage cost over the Phase 3 feasibility artifact: `30,288` bytes (about `0.029 MiB`);
- packaged shared-core bundle SHA-256 exactly matched the validated source bundle;
- direct AppImage, extract-and-run and extracted AppRun base/Unicode self-tests passed.

Detailed architecture, frozen reference hashes, cross-engine evidence, native artifact measurements and remaining limitations are recorded in `docs/v3-shared-core.md`.

The tracked closeout documentation is intentionally followed by exact-head CI; the final PR head and those closeout run identifiers belong in PR #88 because a tracked document cannot include the commit that contains itself without creating another commit.

Gate candidate: `CORE_PARITY` — PASS after exact-head Pull Request Quality and Phase 4 Core Parity both pass and the final diff remains within this phase's scope.

Phase 4 does not complete full native graphics/audio/menu/accessibility/settings parity and does not retire Electron. Those are Phase 5 concerns.

## Phase 5 — Native parity

Objective: complete the native host without changing the accepted product behavior.

Required parity includes graphics, audio, controls/remapping, menus, all five locales, accessibility behavior, preferences, settings migration, startup/error behavior, and relevant desktop security boundaries.

Gate: `NATIVE_PARITY` with the full functional matrix passing while web/PWA validation remains green.

### Phase 5 implementation result

The production candidate is SDL3 + QuickJS with the accepted Phase 4 JavaScript gameplay core remaining authoritative. Platform work is isolated behind serializable input/render/audio/menu/preference boundaries; gameplay rules were not rewritten in C.

The Phase 5 branch includes:

- production sprite-atlas rendering and shared presentation formulas;
- native audio mixing with accepted BGM/SFX semantics;
- semantic keyboard input, remapping and focus-loss cleanup;
- atomic native settings/control persistence and bounded Electron preference migration;
- a JavaScript-owned native pause/menu model rendered through SDL3_ttf with all five locales;
- AccessKit/AT-SPI integration from the same menu/focus snapshot, including assistive focus/actions, modal state and live status;
- localized startup failures, exact external-link allowlisting and direct native Quit;
- exact-head regression jobs for the Phase 4 core fingerprint and Electron 44 fallback.

The gate is intentionally emitted only by the exact-head Phase 5 closure workflow after all independent jobs pass. Dynamic run IDs and final artifact hashes are recorded with PR #89 rather than embedded into a tracked file that would itself create a new head.

Passing this gate does not authorize Electron retirement or any Phase 6/release action.

## Phase 6 — AppImage & release readiness

Objective: turn the selected architecture into a reproducible release candidate.

Required evidence includes:

- reproducible AppImage generation;
- final dependency inventory;
- artifact size and startup measurements;
- CI gates based on actual product requirements;
- representative Linux distribution/desktop validation;
- release documentation and remaining manual checks.

Gate: `RELEASE_READY`.

Promotion to `main`, version bump, tag creation, release publication, and distribution remain separate explicit decisions after this gate.

## Operating rule

The sequence is:

`measure -> test the cheapest supported solution -> prove the alternative -> migrate only after evidence`

A later phase must not begin merely because implementation work is available. Its preceding gate must be satisfied first.
