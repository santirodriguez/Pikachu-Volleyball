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
- Phase 4 — Electron retirement — complete and merged in PR #84
- Phase 5 — Linux distribution — implementation and server-side validation in progress on `v3-phase5-linux-distribution`
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
| Linux archive/native package metadata, system dependency declarations and desktop integration | Phase 5 Linux distribution work |

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

Phase 4 removed Electron only after Neutralino production parity had been accepted and merged. The accepted Neutralino architecture was not redesigned during retirement.

The retirement scope was:

- remove the direct `electron` and `electron-builder` dependencies and their unreachable npm lockfile graph;
- remove the Electron main process, Electron preload, Electron-only JavaScript external-link policy, Electron AppImage launcher patch, packaged-module pruning, Electron startup/build metrics, and Electron AppImage release workflow;
- remove `start:desktop` and `build:appimage`; retarget the generic `build:desktop:linux` command to the supported `build:desktop:neutralino` path;
- keep the renderer-facing `pvDesktop` usage runtime-neutral and keep the accepted Neutralino preload contract unchanged;
- make the native external-link helper's explicit allowed/rejected URL vectors the policy validation authority instead of comparing it with retired Electron JavaScript;
- add explicit retirement assertions covering dependencies, package metadata, retired paths, supported desktop commands, and the exact Neutralino renderer privilege allowlist;
- keep the reproducibility, exact-artifact, Fedora 44/WebKitGTK, persistence, input, audio, game-flow, Quit, external-link and adversarial navigation gates;
- preserve the frozen 2.1 Electron/AppImage baseline as historical comparison evidence rather than deleting or rewriting it.

The Neutralino runtime remains `6.9.0`; the pinned upstream runtime source at `2cec764ac5e3ccc5b1b44d046d6e6d6c85c3099e`, repository-owned WebKitGTK host-navigation patch, native external-link helper, application ID, production allowlist and four-file runnable bundle contract remain unchanged.

Phase 4 was reviewed at head `f4f5c313e313f248a8937628afd33b75d6b28307` and merged by PR #84 into `v3` at `b080f3e4fbfa77c0327ac8c89628acd63614a47e`. Its exact-head server-side gate passed clean installation, dependency audit, all quality tests, two independent reproducible Neutralino builds, exact four-file artifact validation and Fedora 44/WebKitGTK runtime/security validation. Electron is no longer part of the supported v3 desktop toolchain.

The frozen 2.1 Electron AppImage remains historical comparison evidence only. Phase 4 deliberately left Linux packaging and end-user dependency policy to Phase 5.

## Phase 5 Linux distribution

Phase 5 keeps the accepted four-file Neutralino production bundle as the canonical runtime input and adds a distribution layer around those exact runtime/helper bytes. It does not rebuild or relink the accepted runtime while packaging.

The selected x86_64/amd64 formats are:

- a deterministic portable `.tar.gz` as the canonical low-level artifact;
- an amd64 `.deb` for current Debian/Ubuntu systems;
- an x86_64 `.rpm` validated for Fedora-family systems, with Fedora 44 as the concrete runtime gate.

GTK 3, WebKitGTK, GStreamer and `xdg-utils` remain system-native dependencies. The packages declare the distribution-facing dependency names rather than bundling a large WebKitGTK/GStreamer stack. AppImage is intentionally not selected because bundling that stack would materially undermine the size/maintenance advantage of the system-webview architecture, while leaving it unbundled would add little over the portable archive. Flatpak is deferred because no demonstrated dependency problem justifies introducing a second application sandbox/security model. ARM64 is deferred until the patched runtime, native helper, reproducibility and real runtime/security validation can be maintained as a first-class matrix.

Package identity, provisional application ID, install paths, architecture names and dependency declarations are centralized under `packaging/linux/metadata.env` so the later rebranding phase does not need to duplicate identity changes across unrelated packaging logic.

Native packages install the application under `/usr/lib/pikachu-volleyball-neutralino`, expose a small `/usr/bin/pikachu-volleyball-neutralino` launcher, install a `.desktop` file and reuse the existing repository 512px icon. No new branding asset is introduced.

The Neutralino production workflow now has durable `v3` / `v3-*` coverage instead of a phase-specific push trigger. The Phase 5 gate builds all selected formats twice, requires byte-identical package outputs, checks that the accepted runtime/helper bytes remain identical across formats, inspects package metadata and dependencies, tests a controlled portable failure without required desktop libraries, and performs clean install/launch/uninstall validation on Debian 12, Ubuntu 22.04, Ubuntu 24.04 and Fedora 44. Exact-head final results and artifact hashes belong in the Phase 5 pull-request closeout evidence.

See `docs/linux-distribution.md` for the distribution contract and package layout.

## Current migration gate

Phases 0 through 4 are merged and complete. Phase 5 is active on `v3-phase5-linux-distribution`; its implementation must pass the complete exact-head runtime, reproducibility, packaging and clean-install matrix before a separate merge decision.

Phase 5 does not authorize Phase 6, a merge, a release, a tag, publication, repository rename, deployment or any change to `main`.

## Linux runtime dependencies / limitations

The Neutralino runtime intentionally relies on Linux system facilities rather than bundling a browser engine. The executable directly depends on the GTK 3/GLib/Cairo/GdkPixbuf/X11/XCB/libpng/C/C++ runtime stack, while WebKitGTK is loaded dynamically by the accepted Neutralino runtime (4.1 preferred, 4.0 fallback where available).

The validated MP3/WAV path requires GStreamer Good plugins. Approved external URLs require `xdg-open` from `xdg-utils` after native helper validation. Native `.deb`/`.rpm` packages declare these dependencies; the portable archive documents them. Missing required GTK/WebKitGTK libraries prevents normal native-WebView startup and is treated as an understandable dependency failure rather than a reason to bundle WebKitGTK.

No Node.js, Python, Electron, Chromium, compiler or development package is an end-user runtime dependency.

## Publication rule

No v3 tag, GitHub release, production deployment, repository rename, or other public release action is allowed before the final release gate is explicitly approved.

## Regression evidence hierarchy

Use the strongest available evidence in this order:

1. deterministic behavior-focused characterization tests;
2. existing unit/build/security gates;
3. reproducible build and startup metrics tied to an exact commit;
4. real desktop artifact smoke validation for behavior that hosted CI cannot faithfully reproduce.

CI startup timings are diagnostic comparison points, not universal performance thresholds. Environment and filesystem cache state can materially affect absolute numbers.
