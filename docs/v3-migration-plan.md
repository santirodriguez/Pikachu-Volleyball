# Pikachu Volleyball v3 Migration Plan

## Purpose

Version 3 is a staged desktop-runtime migration built on the stable Pikachu Volleyball 2.1 product state. The migration preserves gameplay and web behavior while desktop infrastructure changes behind explicit validation gates.

The frozen source baseline is `main` commit `d7735b13654904a5b48a0c2d1217c8b8507a8409` (Pikachu Volleyball 2.1.0).

## Branch model

- `main`: stable published line. Do not develop v3 directly here.
- `v3`: integration branch for approved v3 work.
- `v3-<task>`: focused task branches targeting `v3`.
- Final promotion: `v3` -> `main`, only after a separately approved release gate.

Every task branch starts from the current verified `v3` head unless a task explicitly requires another base. Merge, release, tag, deployment, repository rename, and publication remain separate actions requiring explicit authorization.

## Preservation contract

Unless an approved phase explicitly changes a requirement, v3 preserves the accepted 2.1 behavior recorded in `docs/v2.1-preservation-baseline.md`, including:

- physics, collision equations, AI decisions, scoring rules, and historical game-state timing;
- 25 FPS normal simulation and 5 FPS slow motion behavior;
- intro, menu, inactivity, match, round, game-end, quick-rematch, and practice flows;
- current default controls, remapping, settings persistence, audio, graphics, and theme behavior;
- all five production locales and browser/PWA behavior;
- startup and first-frame observability semantics where the active desktop runtime exposes equivalent checkpoints;
- Electron security properties and restricted external navigation while Electron remains present.

Migration work may reorganize ownership and replace desktop infrastructure, but it must not silently change user-visible or simulation behavior.

## Program roadmap

- Phase 0 — Foundation and regression baseline — complete
- Phase 1 — Neutralino compatibility spike — complete (`NEUTRALINO_GO`)
- Phase 2 — Desktop platform boundary — complete (`NEUTRALINO_SECURITY_GO`)
- Phase 3 — Production Neutralino parity
- Phase 4 — Electron retirement
- Phase 5 — Linux distribution
- Phase 6 — Internal rebranding
- Phase 7 — Custom brand assets
- Phase 8 — Classic / Enhanced presentation boundary
- Phase 9 — Enhanced presentation
- Phase 10 — Fine payload optimization
- Phase 11 — Release readiness
- Phase 12 — Final promotion / publication

Completing a phase authorizes neither the next phase nor any merge, release, deployment, or publication action.

## Desktop responsibility ownership

The desktop migration keeps application-facing capability deliberately narrow:

| Responsibility | Owner |
|---|---|
| Desktop detection, runtime identity, application-initiated Quit | Renderer-facing application capability |
| External-link validation/opening, navigation restrictions, renderer native permissions, Electron webPreferences | Host-owned security/navigation policy |
| Electron development menu and inspector access | Development-only tooling |
| Startup metrics, Neutralino probes, artifact-size reports, Linux smoke harnesses | Validation/measurement tooling |

The common renderer contract is limited to `pvDesktop.isDesktop`, `pvDesktop.runtime`, and `pvDesktop.quit()`. Host navigation policy is not forced into that contract merely for runtime symmetry.

## Phase 2 accepted Neutralino boundary

Phase 2 completed with `NEUTRALINO_SECURITY_GO`. The accepted Linux candidate is Neutralino `6.9.0` rebuilt from pinned upstream commit `2cec764ac5e3ccc5b1b44d046d6e6d6c85c3099e` with the deterministic WebKitGTK host-navigation patch stored in the repository.

The trusted Neutralino desktop boundary consists of the patched native WebKitGTK navigation policy plus the Linux native external-link helper:

- top-level same-window navigation is host-owned and must not allow renderer-controlled navigation to leave trusted application content;
- cross-origin navigation candidates are denied in the main WebView and may be forwarded only through the trusted external-opening path;
- the native external-link helper performs final URL parsing and allowlist enforcement before invoking `xdg-open` directly without a shell;
- unrestricted `Neutralino.os.open` remains unavailable to renderer JavaScript;
- `extensions.dispatch` is the narrow renderer-to-helper IPC path, with `extensions.getStats` retained because Neutralino 6.9.0 requires it internally for extension dispatch;
- Electron remains present with its existing trusted navigation and renderer-isolation properties.

The host-owned same-window navigation restriction is a required security property of the accepted Neutralino path, not a smoke-only workaround or renderer-side convention.

## Current migration gate

Phase 2 is complete. Phase 3 is responsible for productionizing the accepted Neutralino candidate, including packaging integration, runtime provenance, reproducible patched-runtime building, maintenance of the pinned upstream commit and deterministic patch, and production parity around the trusted native helper and host-navigation boundary.

Phase 3 does not authorize Electron retirement. Electron retirement remains Phase 4 and requires its own approved gate.

## Publication rule

No v3 tag, GitHub release, production deployment, repository rename, or other public release action is allowed before the final release gate is explicitly approved.

## Regression evidence hierarchy

Use the strongest available evidence in this order:

1. deterministic behavior-focused characterization tests;
2. existing unit/build/security gates;
3. reproducible build and startup metrics tied to an exact commit;
4. real desktop artifact smoke validation for behavior that hosted CI cannot faithfully reproduce.

CI startup timings are diagnostic comparison points, not universal performance thresholds. Environment and filesystem cache state can materially affect absolute numbers.
