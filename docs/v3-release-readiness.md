# Phase 6 Release Readiness

## Status

Phase 6 is complete and integrated into `v3-restart`.

The exact task head
`1c091c945c4fe94412c2fe3969a17399b32b2939` passed
`RELEASE_READY=PASS` before PR #90 was squash-merged. The integrated
`v3-restart` commit is
`0a84f0a010ab5ce2626d5e8ad06b8a036400b4b2`.

The validated Phase 6 candidate measured `9,419,256` bytes (~8.98 MiB) with
AppImage SHA-256
`e504eaa3a3efbd3840fb4c693b1f9dc496db19ebe5122b57bd56dc4d41961fc1`.
Two independent builds were byte-identical and Debian 12, Ubuntu 22.04,
Ubuntu 24.04, Fedora 44 and openSUSE Leap 16.0 all passed the exact candidate
matrix.

Phase 6 deliberately did not change the package version and did not authorize
promotion to `main`, tag creation, GitHub Release publication, deployment or
distribution.

The current post-`RELEASE_READY` requirement is a fresh integrated candidate
plus the human acceptance pass in [v3 Manual AppImage QA](v3-manual-qa.md)
before any `main` promotion is considered.

## Release architecture

The supported Linux desktop path is now the production native AppImage:

- shared JavaScript gameplay authority remains unchanged;
- SDL3 owns windowing/input/render execution;
- QuickJS executes the accepted shared application/game logic;
- AccessKit provides Linux accessibility integration;
- LevelDB is used only by the bounded legacy Electron preference importer;
- Web/PWA remains a supported product output.

Electron is no longer part of the supported desktop build or release dependency
graph. Compatibility with existing 2.1 Electron users is retained through the
native preference importer and a deterministic LevelDB regression fixture.

## Production builder

`scripts/build-native-appimage.sh` is the release-owned native builder.
It builds the production AppDir directly and does not use the Phase 3 native
spike AppImage as a template.

`scripts/build-native-toolchain.sh` owns the pinned release inputs inherited
from the accepted feasibility/parity work:

- SDL3 `3.4.16`;
- SDL3_ttf `3.2.2`;
- QuickJS `2026-06-04`;
- GNU Unifont `17.0.04`;
- appimagetool `1.9.1`;
- AppImage runtime `20251108`.

The production builder separately retains the accepted pins for LevelDB and
AccessKit. Downloaded/source inputs are checksum or commit verified.

The AppDir contains the native host, native JavaScript bundle, production
assets/audio/font, the legacy preference importer, provenance, and required
license/notice material. Runtime libraries copied into the AppImage have their
available Debian copyright metadata copied into the runtime license inventory.

The hard native architecture size limit remains `30 MiB`.

## Legacy preference migration without Electron tooling

The migration regression no longer requires Electron to be installed.

- `scripts/electron-migration-fixture.cjs` owns the accepted non-default
  legacy preference values;
- `scripts/write-electron-migration-fixture.cjs` serializes those values into
  deterministic fixture input;
- `desktop/native/electron_preferences_fixture.cc` writes the measured
  Chromium localStorage LevelDB key/value representation directly;
- the production `electron_preferences_importer.cc` reads that fixture using
  the same bounded code shipped to users.

This keeps the real upgrade contract while allowing Electron and
electron-builder to leave the supported dependency/tooling graph.

## Reproducibility and provenance

Phase 6 requires two independent clean builds of the exact same task head.

The final AppImages must be byte-identical. The gate also compares the native
JavaScript bundle, native host, migration importer, provenance and normalized
AppDir inventory/content fingerprints.

The build derives `SOURCE_DATE_EPOCH` from the exact source commit and
normalizes AppDir timestamps before SquashFS creation. Machine-readable
`provenance.json` records the source head, source epoch, architecture,
package/compression type and pinned release toolchain inputs.

Phase 6 exact-head evidence is now historical and may be recorded here because
the validated task head and its later squash-merge commit are both fixed. New
release-candidate evidence must still be tied to the exact head that produced
the artifact.

## Dependency, security and license closure

The release gate inspects the actual AppImage, not incidental runner package
presence.

Required evidence includes:

- no unresolved ELF dependencies;
- packaged runtime/file inventory;
- GLIBC/GLIBCXX symbol-version inventory where emitted;
- no Electron/Chromium/Node/WebKitGTK/GStreamer runtime payload;
- exact external-link allowlist behavior;
- native Quit and localized startup/error behavior;
- bundled third-party license/notice material;
- atomic native preferences and the legacy preference importer.

## Linux validation scope

The exact reproducible x86_64 AppImage is exercised on:

- Debian 12;
- Ubuntu 22.04;
- Ubuntu 24.04;
- Fedora 44;
- openSUSE Leap 16.0.

The primary Ubuntu build also requires real direct AppImage execution. Matrix
containers use extract-and-run for cross-distribution runtime evidence because
container FUSE capabilities are not equivalent to a normal desktop host.

The matrix validates the production self-test, including gameplay bridge,
graphics, audio, input/settings and persistence behavior. Production AT-SPI
semantics are validated separately against the exact release AppDir on the
primary Linux build.

This is representative evidence for the named environments, not a universal
Linux compatibility claim.

## Release workflow boundary

`.github/workflows/release-appimage.yml` now builds the native AppImage from
the definitive checked-out source.

During Phase 6 it remains version-agnostic. A future authorized release event
must have a tag matching the then-current package version, and the final
AppImage is rebuilt from that tag rather than promoting a temporary candidate.

Phase 6 itself does not:

- change `2.1.0`;
- create a tag;
- create or publish a GitHub Release;
- attach public release assets;
- promote `v3-restart` to `main`.

## RELEASE_READY gate

`RELEASE_READY` requires one exact task head to prove:

1. repository quality and Web/PWA outputs remain green;
2. accepted shared-core trace remains byte-identical under Node.js and pinned
   QuickJS;
3. the production native AppImage builder is independent of the Phase 3 spike;
4. two clean builds produce byte-identical AppImages and matching component
   fingerprints;
5. dependency, security and license inventories pass;
6. Electron retirement assertions pass while legacy preference migration still
   passes;
7. production AT-SPI accessibility behavior passes;
8. the exact candidate passes the representative Linux matrix;
9. direct AppImage execution passes on the primary supported host;
10. startup-to-ready observation is recorded;
11. the final AppImage remains at or below `30 MiB`;
12. exact artifact, bundle, host, provenance and core-trace hashes are recorded.

Phase 6 passed this gate and was integrated into `v3-restart`.

For post-Phase-6 candidates, this workflow remains the durable automated
release-candidate gate, but its metadata check is no longer hard-coded to
`2.1.0`: package and lock versions must agree and matching release notes must
exist.

Automated readiness is not the final pre-`main` decision. A current AppImage
must also pass the manual checklist in [v3 Manual AppImage QA](v3-manual-qa.md).

Neither automated readiness nor manual QA authorizes promotion to `main`,
tagging, GitHub Release publication or public distribution.
