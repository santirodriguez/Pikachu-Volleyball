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
- restricted desktop navigation and a narrow renderer/native capability boundary.

The frozen baseline's Electron/AppImage rows remain historical evidence for 2.1. They do not require v3 to retain Electron after the separately approved retirement phase.

Migration work may reorganize ownership and replace desktop infrastructure, but it must not silently change user-visible or simulation behavior.

## Program roadmap

- Phase 0 — Foundation and regression baseline — complete
- Phase 1 — Neutralino compatibility spike — complete (`NEUTRALINO_GO`)
- Phase 2 — Desktop platform boundary — complete (`NEUTRALINO_SECURITY_GO`)
- Phase 3 — Production Neutralino parity — complete and merged in PR #83
- Phase 4 — Electron retirement — implementation and server-side validation complete on `v3-phase4-electron-retirement`; merge pending
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
| External-link validation/opening, navigation restrictions, renderer native permissions | Host-owned security/navigation policy |
| Neutralino runtime patching, native helper build, reproducibility, startup probes and artifact-size reports | Desktop build/validation tooling |
| Final Linux packaging, bundled runtime dependencies and distribution format | Phase 5 Linux distribution work |

The common renderer contract is limited to `pvDesktop.isDesktop`, `pvDesktop.runtime`, and `pvDesktop.quit()`. Host navigation policy is not forced into that contract merely for runtime symmetry.

## Phase 2 accepted Neutralino boundary

Phase 2 completed with `NEUTRALINO_SECURITY_GO`. The accepted Linux candidate is Neutralino `6.9.0` rebuilt from pinned upstream commit `2cec764ac5e3ccc5b1b44d046d6e6d6c85c3099e` with the deterministic WebKitGTK host-navigation patch stored in the repository.

The trusted Neutralino desktop boundary consists of the patched native WebKitGTK navigation policy plus the Linux native external-link helper:

- top-level same-window navigation is host-owned and must not allow renderer-controlled navigation to leave trusted application content;
- cross-origin navigation candidates are denied in the main WebView and may be forwarded only through the trusted external-opening path;
- the native external-link helper performs final URL parsing and allowlist enforcement before invoking `xdg-open` directly without a shell;
- unrestricted `Neutralino.os.open` remains unavailable to renderer JavaScript;
- `extensions.dispatch` is the narrow renderer-to-helper IPC path, with `extensions.getStats` retained because Neutralino 6.9.0 requires it internally for extension dispatch.

At the end of Phase 2 Electron still existed as the established desktop path. That was a historical migration constraint, not a permanent requirement after Phase 4.

The host-owned same-window navigation restriction is a required security property of the accepted Neutralino path, not a smoke-only workaround or renderer-side convention.

## Phase 3 production parity closure

Phase 3 productionized the accepted Phase 2 Neutralino boundary without changing the runtime selection, renderer/native trust model, gameplay semantics, or final Linux distribution policy.

The production renderer native allowlist remains exactly:

```text
app.exit
extensions.dispatch
extensions.getStats
```

`Neutralino.os.open` remains unavailable to renderer JavaScript. The Linux external-link mediator and patched WebKitGTK same-window navigation boundary remain the accepted security architecture.

The production build is reproducible from a clean source commit using pinned artifact-producing inputs:

- Neutralino framework/runtime `6.9.0` from upstream commit `2cec764ac5e3ccc5b1b44d046d6e6d6c85c3099e`;
- Neutralino CLI `11.7.2` from CLI source commit `387dca0aa4a100b3b69ef17774185fd6cb2c3da4`, installed from its lockfile;
- Node.js `22.12.0` Linux x64 distribution verified by SHA-256;
- pinned Ubuntu Focal builder image digest and Ubuntu archive snapshot;
- recorded npm, project lockfile, CLI lockfile, compiler and package identities;
- source-derived `SOURCE_DATE_EPOCH` with staged resource mtimes normalized after `neu update` and before resource embedding;
- dirty or source-SHA-mismatched production working trees rejected before building.

CI performs two independent detached clean builds of the same exact source SHA and compares the first differing layer across the raw patched runtime, native helper, embedded production binary, `provenance.json`, `SHA256SUMS`, final tarball, resource contents and resource metadata. A mismatch fails the gate and persists component diagnostics.

The last implementation validation before the Phase 3 closeout documentation change was exact source `29113a52a01fb41109ba163fdebb1f24339d69b3`. Both the push and pull-request production workflows passed completely. The two isolated builds matched at every compared layer:

- raw patched runtime: `2,876,248` bytes, SHA-256 `4ece99c126a7e17dfc86605221c2258ee546585687fb9425eea7e3917d54da33`;
- external-link helper: `18,568` bytes, SHA-256 `20872aeac3ff8ed173b26bcb016135f0dcce35eb6b5eff146e9838658b38d794`;
- embedded production binary: `6,025,488` bytes, SHA-256 `c2c6c7391d8576af434c1a8c9075486e1c0b712c1e65fe28cbb969ce53baeec9`;
- resource content tree SHA-256: `8eec5de5bdc30bb0bac1e178f1a925c0549149a07d43a0c05a3bf5004f5fbb27`;
- resource metadata tree SHA-256: `02ba8b171320b078296664651b4684d933b5432b36b89ef9c53648e449f480fc`.

That validation produced byte-identical final tarballs in both isolated builds. Run-specific final source/provenance/tarball hashes are recorded in PR #83 closeout evidence because tracked documentation cannot contain the SHA of the commit that contains itself without creating another commit.

The runnable Neutralino bundle contains exactly four files:

```text
pikachu-volleyball-neutralino-linux_x64
extensions/pv-external-link-linux_x64
provenance.json
SHA256SUMS
```

The server-side Phase 3 gate covered production dependency audit, `quality:check`, deterministic/characterization tests, five locale web/PWA outputs, exact artifact composition and checksums, extracted production artifact startup, Fedora 44 with real WebKitGTK/GTK, persistence, desktop runtime identity, default/minimum window sizing, keyboard/input, exercised MP3/WAV audio and game-flow settings/restart behavior, Quit, external-link policy and adversarial same-window navigation attempts.

PR #83 merged into `v3` at `6a374c4661b47ef9507694682d1039003f31c217`. Phase 3 intentionally ended with Electron still present so retirement could be reviewed as its own phase.

## Phase 4 Electron retirement

Phase 4 removes Electron only after Neutralino production parity has been accepted and merged. The accepted Neutralino architecture is not redesigned during retirement.

The retirement scope is:

- remove the direct `electron` and `electron-builder` dependencies and regenerate the npm lockfile so their unreachable package graph disappears;
- remove the Electron main process, Electron preload, Electron-only JavaScript external-link policy, Electron AppImage launcher patch, packaged-module pruning, Electron startup/build metrics, and Electron AppImage release workflow;
- remove `start:desktop` and `build:appimage`; retarget the generic `build:desktop:linux` command to the supported `build:desktop:neutralino` path;
- keep the renderer-facing `pvDesktop` usage runtime-neutral and keep the accepted Neutralino preload contract unchanged;
- make the native external-link helper's explicit allowed/rejected URL vectors the policy validation authority instead of comparing it with retired Electron JavaScript;
- add explicit retirement assertions covering dependencies, package metadata, retired paths, supported desktop commands, and the exact Neutralino renderer privilege allowlist;
- keep the reproducibility, exact-artifact, Fedora 44/WebKitGTK, persistence, input, audio, game-flow, Quit, external-link and adversarial navigation gates;
- preserve the frozen 2.1 Electron/AppImage baseline as historical comparison evidence rather than deleting or rewriting it.

The Neutralino runtime remains `6.9.0`; the pinned upstream runtime source at `2cec764ac5e3ccc5b1b44d046d6e6d6c85c3099e`, repository-owned WebKitGTK host-navigation patch, native external-link helper, application ID, production allowlist and four-file runnable bundle contract remain unchanged.

### Phase 4 implementation evidence

The exact implementation head `629d02857db90fcbf184ec9e3dd868d32b129c98` passed the complete server-side `Neutralino Desktop Production` gate in GitHub Actions run `33332976254` before this closeout documentation commit.

Retirement evidence on that head includes:

- `electron` and `electron-builder` are absent from direct dependencies and the regenerated lockfile; direct development dependencies dropped from 13 to 11 and lockfile package entries dropped from 582 to 435;
- `npm ci` installed 434 packages and audited 435 packages; the production dependency audit reported no blocking vulnerability;
- the Electron main/preload/configuration path, Electron AppImage builder/launcher/pruning/metrics scripts and Electron release workflow are absent, and no supported desktop command invokes Electron, `electron-builder`, or the retired AppImage build path;
- `quality:check` passed with all 63 Node tests, including preservation/characterization, desktop-boundary, Neutralino production and explicit Electron-retirement assertions; the five production locale web/PWA outputs remained part of the build gate;
- two independent clean production builds were byte-identical across all compared layers;
- the production tarball was `3,593,332` bytes (about `3.43 MiB`) with SHA-256 `fdfcee79477a7b3cd783ee1a07314593aa9aea638b26eb758aefa80fb7e2780a`;
- the patched Neutralino runtime was `831,976` bytes with SHA-256 `323292ecea71af9d9ce6deb06cd7b9178d3ace661d6a536effdb468fbe6f13cf`;
- the native external-link helper was `14,648` bytes with SHA-256 `afa1b13dced42ceb101265376dbed08c57591c236f43f09261b057947d7aea3d`;
- real Fedora 44/WebKitGTK validation passed runtime startup, default/minimum window behavior, persistence across restart, renderer bridge shape, keyboard and touch input, original-style local/round/AI flows, pre-gesture audio behavior, legal Quit, approved external-link opening, and adversarial navigation attempts;
- renderer privilege checks preserved the exact `app.exit`, `extensions.dispatch`, `extensions.getStats` allowlist while keeping `Neutralino.os.open` and `app.writeProcessOutput` unavailable;
- the runnable Neutralino artifact contains no Electron runtime, `app.asar`, Electron preload/main process, or Chromium `chrome-sandbox` payload.

The frozen 2.1 Electron AppImage remains `97,094,772` bytes (`92.60 MiB`). Comparing it directionally with the Phase 4 production tarball shows a large reduction in the repository-produced desktop payload, but this is not an apples-to-apples final distribution comparison: Phase 5 still owns final Linux packaging, dependency bundling, installer/AppImage decisions and end-user distribution footprint.

The final Phase 4 closeout commit must be validated again because provenance and final artifact hashes are source-SHA-specific. As in Phase 3, the exact final closeout SHA, final-run artifact hashes and exact-head Codex result belong in the pull-request closeout evidence rather than in a tracked file that would need another commit to describe itself.

Phase 4 does not choose the final Linux distribution format. Final installer/AppImage design, dependency bundling and end-user distribution policy belong to Phase 5.

## Current migration gate

Phase 3 is merged and complete. Phase 4 implementation and its pre-closeout server-side validation are complete on `v3-phase4-electron-retirement`. The closeout documentation commit still requires its own exact-head server-side validation and a fresh exact-head Codex review before the branch is ready for a separate merge decision.

Phase 4 does not authorize Phase 5, a merge, a release, a tag, publication, repository rename, deployment or any change to `main`.

## Linux runtime dependencies / limitations

The Neutralino artifact intentionally relies on Linux system facilities rather than bundling the final distribution environment. Fedora 44 validation uses GTK 3, WebKitGTK 4.1, X11 tooling, GStreamer base/good plugins for exercised MP3/WAV playback, and `xdg-open` for approved external URLs.

Missing required GTK/WebKitGTK shared libraries prevents normal native-WebView startup. Final dependency bundling and AppImage/distribution policy remain deferred to Phase 5. No Node.js, Python or backend runtime is bundled in the production four-file artifact.

## Publication rule

No v3 tag, GitHub release, production deployment, repository rename, or other public release action is allowed before the final release gate is explicitly approved.

## Regression evidence hierarchy

Use the strongest available evidence in this order:

1. deterministic behavior-focused characterization tests;
2. existing unit/build/security gates;
3. reproducible build and startup metrics tied to an exact commit;
4. real desktop artifact smoke validation for behavior that hosted CI cannot faithfully reproduce.

CI startup timings are diagnostic comparison points, not universal performance thresholds. Environment and filesystem cache state can materially affect absolute numbers.
