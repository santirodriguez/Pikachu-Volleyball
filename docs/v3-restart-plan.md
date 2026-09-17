# Pikachu Volleyball v3 Restart Plan

This document is the active migration plan for the new v3 attempt. It deliberately starts from the stable 2.1 release on `main` and requires measured evidence before committing to a new desktop architecture.

Historical `v3` and `v3-phase5-linux-distribution` work is evidence only. The restart does not branch from those lines and does not inherit their runtime decisions.

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

## Phase 1 — Baseline & guardrails

Objective: make the stable 2.1 behavior and measurements an explicit gate before architectural experimentation.

Required evidence:

- integration branch created from the frozen source commit;
- preservation contract remains active;
- critical physics, AI, timing, scoring, lifecycle, quick-rematch, pause, and practice behavior has automated characterization coverage;
- repository quality and locale-output checks run for `v3-restart` pull requests;
- no production gameplay, Electron runtime, packaging configuration, branding, or version metadata changes.

Gate: `BASELINE_LOCKED`.

## Phase 2 — Electron candidate

Objective: evaluate a current supported Electron candidate with the smallest coherent dependency/tooling change before considering a native migration.

Measure a real AppImage and record at least:

- artifact size and contents;
- startup observations;
- relevant memory/runtime observations when practical;
- sandbox and navigation behavior;
- compatibility with the supported Linux test matrix;
- web and gameplay regression results.

Gate:

- `ELECTRON_KEEP` when the supported Electron candidate satisfies the product requirements well enough to avoid a native migration; or
- `NATIVE_SPIKE` when measured constraints justify testing the native alternative.

Do not reject the candidate solely because unrelated or transitive packages happen to exist in a CI image. Validate the product's actual dependency and runtime contract.

## Phase 3 — Native feasibility

Objective: prove or disprove the proposed SDL3 + QuickJS direction with a bounded prototype before migrating the application.

The spike must exercise real project content, including representative rendering, input, audio, assets, the five locales, and at least one accessible menu path. It must produce a real AppImage.

Gate: `NATIVE_GO` only when functional feasibility is demonstrated and the AppImage is no larger than `30 MiB` with reasonable headroom for the remaining production requirements.

A failed feasibility gate ends the native migration path rather than starting a large refactor anyway.

## Phase 4 — Shared core

Objective: move only the runtime boundaries needed by the proven target while preserving the web product and current desktop fallback during the transition.

Before refactoring a behavior, characterize it. Separate only the necessary input, rendering, audio, settings, and host boundaries. Preserve deterministic ordering and externally meaningful game behavior.

Gate: `CORE_PARITY` when reference and migrated scenarios preserve timing, scoring, physics, AI decisions, and RNG ordering for the agreed characterization set.

## Phase 5 — Native parity

Objective: complete the native host without changing the accepted product behavior.

Required parity includes graphics, audio, controls/remapping, menus, all five locales, accessibility behavior, preferences, settings migration, startup/error behavior, and relevant desktop security boundaries.

Gate: `NATIVE_PARITY` with the full functional matrix passing while web/PWA validation remains green.

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
