# Pikachu Volleyball v3 Migration Plan

## Purpose

Version 3 is a staged desktop-runtime migration built on the stable Pikachu Volleyball 2.1 product state. The migration must preserve gameplay and web behavior while allowing the desktop implementation to change behind explicit validation gates.

The frozen source baseline is `main` commit `d7735b13654904a5b48a0c2d1217c8b8507a8409` (Pikachu Volleyball 2.1.0).

## Branch model

- `main`: stable published line. Do not develop v3 directly here.
- `v3`: integration branch for approved v3 work.
- `v3-<task>`: focused task branches targeting `v3`.
- Final promotion: `v3` -> `main`, only after a separately approved release gate.

Every task branch must start from the current verified `v3` head unless a task explicitly requires another base. Merge, release, tag, deployment, repository rename, and production publication remain separate actions requiring explicit authorization.

## Preservation contract

Unless an approved phase explicitly changes a requirement, v3 must preserve the accepted 2.1 behavior recorded in `docs/v2.1-preservation-baseline.md`, including:

- physics, collision equations, AI decisions, scoring rules, and historical game-state timing;
- 25 FPS normal simulation and 5 FPS slow motion behavior;
- intro, menu, inactivity, match, round, game-end, quick-rematch, and practice flows;
- current default controls, remapping, settings persistence, audio, graphics, and theme behavior;
- all five production locales and browser/PWA behavior;
- startup ordering and first-frame observability semantics where the desktop runtime still exposes equivalent checkpoints;
- desktop security properties and restricted external navigation during any phase that still uses Electron.

Migration work may reorganize ownership and replace desktop infrastructure, but it must not silently change user-visible or simulation behavior.

## Phase 0 - Foundation and regression baseline

Goal: create the v3 integration line and improve regression evidence before desktop-runtime changes begin.

Deliverables:

- establish `v3` and the `v3-<task>` branch model;
- retarget pull-request CI to `v3`;
- freeze the exact 2.1 source, build, package, and startup evidence;
- add material characterization coverage for physics, AI, timing, and lifecycle transitions;
- keep package version `2.1.0` and make no Electron, gameplay, visual, asset, or branding changes.

Exit gate:

- PR quality checks pass on the exact Phase 0 head;
- the branch diff is limited to repository policy, CI, tests, and migration/baseline documentation;
- `main` remains unchanged;
- the Phase 0 PR is explicitly approved and merged into `v3`.

## Phase 1 - Desktop runtime boundary

Goal: define the smallest runtime-independent boundary required to host the existing web/game application in a replacement desktop shell.

Expected work:

- inventory Electron-specific assumptions and IPC/navigation/security behavior;
- define runtime-neutral interfaces for the narrow desktop capabilities the renderer actually consumes;
- preserve the current web build and game runtime unchanged where practical;
- add equivalence tests before replacing Electron behavior.

Gate: no Electron removal or replacement is authorized merely by Phase 0. The concrete runtime choice and implementation require a separately reviewed Phase 1 blueprint.

## Phase 2 - Replacement desktop runtime

Goal: implement the approved desktop runtime behind the Phase 1 boundary while preserving the 2.1 application behavior.

Expected validation:

- regression/characterization suite;
- production web build and all locale outputs;
- security/navigation behavior;
- desktop startup and first usable frame/menu evidence;
- real Linux artifact and smoke validation.

## Phase 3 - Packaging and operational hardening

Goal: make the replacement runtime reproducible and release-ready.

Expected work:

- deterministic packaging and artifact naming;
- package-content and size reporting;
- startup metrics comparable to the frozen 2.1 evidence where semantics are equivalent;
- dependency and security checks appropriate to the replacement runtime;
- migration cleanup only after replacement behavior is proven.

## Phase 4 - Release readiness and promotion

Goal: prepare a stable v3 candidate without publishing it prematurely.

Required gates:

- full automated validation on the exact candidate head;
- real Linux artifact smoke test;
- preservation review against the frozen 2.1 baseline;
- documentation/release notes/version changes reviewed as a separate release-preparation step;
- explicit authorization for the final `v3` -> `main` promotion.

## Publication rule

No v3 tag, GitHub release, production deployment, repository rename, or other public release action is allowed before the final release gate is explicitly approved. A phase completion or `Go` for implementation does not imply permission to publish.

## Regression evidence hierarchy

Use the strongest available evidence in this order:

1. deterministic behavior-focused characterization tests;
2. existing unit/build/security gates;
3. reproducible build and startup metrics tied to an exact commit;
4. real desktop artifact smoke validation for behavior that hosted CI cannot faithfully reproduce.

CI startup timings are diagnostic comparison points, not universal performance thresholds. Environment and filesystem cache state can materially affect absolute numbers.
