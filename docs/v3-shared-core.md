# v3 Shared Core Evidence

## Decision

Phase 4 gate candidate: `CORE_PARITY = PASS`, subject to exact-head closeout validation after this tracked evidence is committed.

The Phase 4 question was whether the accepted Pikachu Volleyball 2.1 gameplay behavior could move behind a host-neutral JavaScript core without changing physics, AI decisions, RNG ordering, lifecycle timing, scoring, slow motion, practice behavior, quick rematch, or the browser/PWA product, while also proving that the same core executes deterministically under the pinned QuickJS runtime selected by the native feasibility phase.

The measured answer is yes.

This phase does **not** complete the native host. It establishes one shared deterministic gameplay authority that Web/Electron already consume and that the future SDL3 + QuickJS host can execute without a second gameplay implementation.

## Final architecture

### Reverse-engineered simulation

`src/resources/js/physics.js` remains the authoritative reverse-engineered physics and AI implementation. Phase 4 does not rewrite it in C and does not change its collision equations, movement rules, AI behavior, or random-number consumption.

`src/resources/js/rand.js` remains the RNG entry point used by the simulation.

### Host-neutral gameplay core

`src/resources/js/game_core.cjs` owns the deterministic orchestration that both browser/Electron and QuickJS require:

- lifecycle state and frame transitions;
- scores, winning score, serve side, round-end and game-end state;
- pause behavior;
- slow-motion counters and cadence;
- practice-reset semantics;
- quick-rematch and restart semantics;
- ordered gameplay effects;
- serializable gameplay and physics snapshots.

The core receives the existing physics model by injection. It does not import DOM, Pixi, localStorage, Electron, SDL, or native host APIs.

`src/resources/js/shared_core.js` is the small factory that constructs `GameCore` around the existing `PikaPhysics` implementation.

### Browser and Electron adapter

`src/resources/js/pikavolley.js` remains the canonical `PikachuVolleyball` facade expected by the rest of the web application, but it is now an adapter over `GameCore` rather than a second gameplay implementation.

It translates:

- browser keyboard state into serializable frame input;
- ordered core effects into Pixi view calls;
- ordered audio effects into the existing `PikaAudio` adapter;
- quick-rematch visibility and practice-reset DOM events at the host boundary.

`src/resources/js/game_runtime.js` remains the browser/Electron composition root for Pixi renderer/ticker/loader setup, startup marks, persisted-setting hydration, menu wiring, visibility audio policy and the render loop.

Persistence, locale navigation, color-scheme DOM state, integrated menu presentation, desktop Quit and Electron security remain outside the gameplay core.

There is one gameplay authority at the end of Phase 4. The temporary second adapter and legacy differential harness used while proving the migration were removed after parity was established.

## Reference characterization before authority moved

Before routing production through the shared core, Phase 4 captured deterministic reference traces from the accepted `v3-restart` controller at integration source:

`60f978ec77e1a2c8adf5d56ae14102dccf41d1a9`

The trace covered physics, power-hit behavior, deterministic AI, lifecycle boundaries, scoring, slow motion, winning-score behavior, quick rematch, practice reset, pause and restart. It recorded relevant gameplay/physics state, RNG ordering and ordered observable effects.

Frozen full reference trace SHA-256:

`cc627e56e7bb13b4a82fe29c25bdcef2bbd379e566d9d36469528d1afa2d9863`

Frozen section SHA-256 values:

- physics: `9826b7e4209d294d2a835c8b4b7e8448d61adcd0925b1b8163c255f59313c1bd`
- AI: `c364a39dc050575baa810d4f79146e2fa290254dbaadcb3be3b94a4525116b1b`
- lifecycle: `2515c79999f144a0ae0359d8b1d6790a576d48286e86db73896417af69303502`
- scoring: `b49cd572039c40e3c3251bb45f8305af4d7032ea6989ec2691b7fe8e14d152f7`
- commands: `0183daa48c4712c052d49592bfe5e2e01e462414656468a1a9a483a846b51df0`

Pull Request Quality run `35275143149` reproduced the reference trace while the accepted controller was still production authority.

The candidate shared-core browser adapter was then run through the same deterministic scenarios before production routing changed. Pull Request Quality run `35275668434` reproduced the same full trace hash and every section hash.

Only after that differential parity passed was Web/Electron routed through the shared-core adapter.

## Existing 2.1 characterization remains authoritative

The existing `test/v2_1_characterization.test.cjs` scenarios remain in the repository and retain their accepted behavior assertions. Its controller harness was updated only so those same assertions exercise the canonical `pikavolley.js` facade with `GameCore` injected.

The characterization continues to protect, among other behavior:

- initial gravity and ground collision;
- power-hit collision semantics;
- deterministic AI decisions;
- historical frame totals;
- 25 FPS normal and 5 FPS slow-motion behavior;
- intro/menu inactivity transitions;
- 15/15/71 pre-match boundaries;
- pause freeze;
- scoring and winning-score behavior;
- quick-rematch frame boundary and automatic return;
- practice reset.

No accepted expected value was relaxed to make the shared core pass.

The canonical shared-core Web/Electron state passed Pull Request Quality run `35276967590`, including lint, all unit/characterization tests, production web build, all five locale-output gates and the production source-map guard.

## Portable Node/V8 and QuickJS parity

Phase 4 adds `src/resources/js/core_parity_runner.js` plus `webpack.core-parity.js` to create one deliberate, non-minified, source-map-free shared-core artifact from the same production gameplay sources.

That artifact is executed independently under:

- Node.js `22.12.0` / V8;
- pinned QuickJS `2026-06-04`.

The QuickJS source archive remains checksum-pinned to:

`b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a`

The portable scenario exercises deterministic physics, AI, RNG ordering, lifecycle, scoring, slow motion, winning score, quick rematch, practice reset, pause and restart. The runner contains explicit accepted-value assertions in addition to producing canonical JSON.

Pre-closeout Phase 4 workflow run `35276967601` produced:

- cross-engine parity: PASS;
- expected portable trace SHA-256: `1f8cf2eff81d0fcacd671882cb96e5c39b33fc05462e2b61b8937e059d70efb1`;
- Node/V8 trace SHA-256: `1f8cf2eff81d0fcacd671882cb96e5c39b33fc05462e2b61b8937e059d70efb1`;
- QuickJS output: byte-for-byte identical to Node/V8;
- shared-core bundle: `71,798` bytes;
- shared-core bundle SHA-256: `787d4954faf997b7bb93d78700a8f4137b8ef05344e982d9982bf937a5e029db`.

The workflow fails if the two engines differ **or** if they agree on output that no longer matches the frozen portable trace fingerprint.

An earlier workflow iteration reached the same useful JSON but failed byte comparison because the QuickJS test wrapper wrote the two literal characters `\\n` instead of a real line ending. Artifact inspection isolated that difference to the harness terminator. The fix changed only the wrapper line ending; no gameplay/core rule was changed to resolve the failure.

## Native architecture budget with the real core artifact

Phase 4 does not substitute a raw bundle-size estimate for AppImage evidence.

`scripts/build-phase4-core-appimage.sh` first invokes the proven Phase 3 native builder, then inserts the **exact already-validated shared-core bundle artifact** into the AppImage, verifies its hash after extraction, repacks with the same pinned AppImage runtime/tooling and Zstd policy, reruns the native and Unicode self-tests, and enforces the `30 MiB` architecture budget.

Pre-closeout workflow run `35276967601` produced the shared-core AppImage evidence:

- AppImage size: `11,558,984` bytes (`11.02 MiB`);
- hard architecture limit: `31,457,280` bytes (`30 MiB`);
- remaining headroom: `19,898,296` bytes (about `18.98 MiB`);
- AppImage SHA-256: `1c66c0df0b3237af4ee4020b8b2002661beb1ee410dfac0dded16112d6b83ab2`;
- Phase 3 base AppImage: `11,528,696` bytes;
- incremental AppImage cost after including the real shared-core bundle: `30,288` bytes (about `0.029 MiB`);
- source shared-core bundle SHA-256: `787d4954faf997b7bb93d78700a8f4137b8ef05344e982d9982bf937a5e029db`;
- packaged shared-core bundle SHA-256: `787d4954faf997b7bb93d78700a8f4137b8ef05344e982d9982bf937a5e029db`.

Execution checks all passed:

- direct AppImage base self-test;
- direct AppImage Unicode self-test;
- `APPIMAGE_EXTRACT_AND_RUN=1` base self-test;
- `APPIMAGE_EXTRACT_AND_RUN=1` Unicode self-test;
- extracted `AppRun` base self-test;
- extracted `AppRun` Unicode self-test.

The Unicode probe again rendered the real production language labels for `en`, `es-ar`, `ca`, `ko` and `zh`.

The measured artifact therefore retains roughly `18.98 MiB` of the native architecture budget for Phase 5 work. That headroom remains a measurement to recheck in later phases, not a promise that future parity work is free.

## Historical lessons applied

Phase 4 deliberately avoids repeating the discarded-v3 mistakes:

- it does not select another WebView runtime or return to WebKitGTK/GStreamer portability work;
- it does not change the AppImage requirement;
- it does not explore RPM/DEB/tar as substitutes;
- it does not tune compression as a migration strategy;
- it reuses the historical validation discipline without copying a nonexistent historical shared-core architecture;
- it keeps the reverse-engineered physics/AI implementation rather than rewriting behavior to fit the native host;
- it proves a deliberate QuickJS bundle from the same shared source instead of relying on the Phase 3 probe's in-memory ES-module adaptation technique;
- it validates actual behavior and artifact contents rather than runner package names.

## What Phase 4 does not prove

`CORE_PARITY` is a gameplay-core migration gate, not `NATIVE_PARITY` or `RELEASE_READY`.

Phase 4 does **not** yet prove:

- full SDL graphics and animation parity;
- complete native audio timing, panning, volume and settings parity;
- complete native controls/remapping integration;
- native menu, localization and accessibility parity;
- settings/persistence migration into the native host;
- final native startup/error behavior;
- representative final Linux distribution/desktop validation;
- release-grade reproducibility of the final native AppImage;
- Electron retirement;
- release/version/tag/publication readiness.

Electron remains the validated desktop fallback while Phase 5 is developed.

## Closeout rule

Because a tracked evidence document cannot contain the SHA and workflow identifiers of the commit that contains itself without creating another commit, the exact final Phase 4 head and its exact-head closeout workflow runs are recorded in PR #88 after this document and the active plan are committed.

`CORE_PARITY` may be treated as final only when that exact head passes both Pull Request Quality and Phase 4 Core Parity and the final PR diff is reviewed for scope.

No merge of PR #88, Phase 5 work, promotion to `main`, version bump, tag, release or publication is authorized by this document.
