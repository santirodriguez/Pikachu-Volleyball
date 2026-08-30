# Neutralino production runtime

Phase 4 keeps the accepted Neutralino 6.9.0 production runtime unchanged while retiring Electron from the supported v3 desktop toolchain. Neutralino is now the sole supported v3 desktop runtime.

This remains an internal v3 desktop artifact. It is not the final Linux distribution/AppImage design and is not a public release artifact. Final distribution policy belongs to Phase 5.

## Runtime ownership

Production Neutralino inputs live under `desktop/neutralino/`:

- `neutralino.config.json` — production runtime/window/native-permission configuration.
- `preload.js` — the narrow `pvDesktop` renderer bridge.
- `extensions/external-link-linux.c` — native Linux external-link mediator.
- `patches/neutralino-6.9.0-host-navigation.patch` — deterministic WebKitGTK host-navigation enforcement patch.

Validation-only probes live under `test/neutralino/` and are not copied into the production artifact.

## Pinned build inputs

- Neutralino framework/runtime: `6.9.0`.
- Neutralino client: `6.9.0`.
- Neutralino CLI: `@neutralinojs/neu@11.7.2`.
- Neutralino upstream source commit: `2cec764ac5e3ccc5b1b44d046d6e6d6c85c3099e`.
- Linux build container: `ubuntu:focal-20250404@sha256:c664f8f86ed5a386b0a340d981b8f81714e21a8b9c73f658c4bea56aa179d54a` on `linux/amd64`.
- Ubuntu package snapshot: `20250404T000000Z`.
- Runtime and native helper use the same GCC/G++/binutils and development packages resolved from that pinned snapshot. Their exact package versions, compiler identities, builder image, platform and snapshot are recorded in build provenance.
- Repository-owned host-navigation patch and native external-link helper are hashed into build provenance.

The build derives `SOURCE_DATE_EPOCH` from the exact source commit unless it is explicitly supplied, propagates it to the native builder, records it in provenance, and normalizes production staging-resource mtimes to that value before resource embedding. The runner CA bundle is mounted only to bootstrap TLS verification while reaching the pinned signed Ubuntu snapshot; it is removed from the container APT override before compilation and is not packaged into the candidate.

The generic Linux desktop command and the explicit Neutralino command resolve to the same supported build path:

```text
npm run build:desktop:linux
npm run build:desktop:neutralino
```

The build records the source commit, source date epoch, pinned runtime inputs, patch/runtime/helper hashes, sizes, artifact contents, checksums and resolved build-toolchain identities.

## Reproducibility gate

The v3 Neutralino Actions gate proves reproducibility with two independent clean builds from the exact same source commit. The harness creates two detached temporary Git worktrees at that SHA. Each worktree independently runs `npm ci` and the complete `build:desktop:neutralino` path using the pinned builder described above; build outputs and dependency trees are not shared between the two worktrees.

Each build captures SHA-256 and size for these layers, in order:

1. raw patched Neutralino runtime;
2. native external-link helper;
3. embedded production Neutralino binary;
4. `provenance.json`;
5. `SHA256SUMS`;
6. final `.tar.gz` artifact.

The gate succeeds only when all required components, including the final tarball, are byte-identical across both builds. Staged resource content and metadata trees must also match after `SOURCE_DATE_EPOCH` normalization. If a binary differs, the evidence includes ELF note/build-ID and section diagnostics; text-manifest differences include the first differing line; all binary differences include the first differing byte offset. The first divergent required component or resource-input layer is reported explicitly rather than reducing the failure to two final tar hashes.

Reproducibility evidence is stored outside the temporary worktrees and uploaded with failure-safe Actions steps, including hidden evidence files. Build-stage status and real exit codes are persisted. The first successful candidate is copied to the workflow workspace before the second build begins, so a later build or validation failure does not discard the exact available candidate and its diagnostics.

Final archive creation is deterministic: entries are name-sorted, archive ownership is normalized to numeric root, mtimes are normalized to the Unix epoch, and gzip timestamp/name metadata is disabled with `gzip -n`.

## Identity and persistence

Phase 4 preserves the Neutralino application ID accepted in the earlier migration phases:

```text
com.santirodriguez.pikachuvolleyball.neutralino-spike
```

The old internal suffix remains solely to avoid changing the accepted Neutralino system-data identity during runtime retirement. `dataLocation` remains `system`, and the port remains `48471`. A public identity/application-data migration is outside Phase 4.

Application settings and control bindings continue to use Web Storage and are validated across a real Neutralino restart on Fedora/WebKitGTK.

## Security boundary

The production renderer allowlist remains exactly:

```text
app.exit
extensions.dispatch
extensions.getStats
```

`Neutralino.os.open`, arbitrary filesystem access, shell/process execution, generic networking, updater APIs, telemetry, and unrelated native privileges are not granted to renderer JavaScript.

External destinations continue through the accepted trusted path: untrusted renderer URL candidate -> extension IPC -> native final URL validation -> `xdg-open` by argv without a shell. Same-window top-level navigation remains enforced by the patched native WebKitGTK `decide-policy` handler.

The CI validation harness creates a temporary validation configuration that additionally grants `app.writeProcessOutput` and injects smoke probes. That configuration is test-only. The clean production artifact is built and launched before the validation overlay is created.

## Artifact composition

The Linux x64 Neutralino bundle contains exactly:

```text
pikachu-volleyball-neutralino-linux_x64
extensions/pv-external-link-linux_x64
provenance.json
SHA256SUMS
```

The Neutralino executable contains the production web resources through embedded-resource mode. Electron, Electron Builder, `app.asar`, Chromium/Electron launcher files, smoke probes, attack servers, diagnostic logs, source trees, compilers, build dependencies, and Node modules are not shipped in the bundle.

The historical `production-parity` filename used by the build scripts is retained for reproducibility continuity. It no longer denotes an Electron fallback or a dual-runtime support policy.

## Linux runtime assumptions

The validated Fedora 44 environment provides GTK 3, WebKitGTK 4.1, X11 windowing support, and GStreamer base/good plugins for the exercised MP3/WAV audio path. The native external-link mediator expects `xdg-open` to be available when an approved external URL is opened.

If required GTK/WebKitGTK shared libraries are absent, the executable cannot start its native WebView and fails before normal application startup. Phase 4 preserves that known dependency instead of choosing a final bundling strategy; final dependency packaging, installers and AppImage/distribution design belong to Phase 5.

## Validation boundary

GitHub Actions runs the repository production dependency audit, full `quality:check`, explicit Electron-retirement assertions, production web/PWA build for all five locales, Neutralino static tests, two-build component-level reproducibility gate, checksum/exact-content verification, a clean launch of the extracted embedded artifact, and Fedora 44/WebKitGTK desktop/security probes. The exact embedded binary is then reused for the validation overlay so the deeper tests do not silently exercise a different development runtime.

The Fedora validation records named stage transitions and the real container exit code. Production-build diagnostics, reproducibility evidence, Fedora desktop/security evidence, and the available production candidate are uploaded with failure-safe behavior so an ordinary validation failure remains diagnosable server-side.

Startup and memory observations are diagnostic only. The frozen 2.1 Electron/AppImage metrics remain a directional historical baseline, not a directly comparable performance threshold for the Neutralino runtime.
