# Neutralino production runtime

Phase 3 promotes the accepted Neutralino 6.9.0 candidate into a production-oriented desktop runtime while keeping Electron as the production comparison and fallback runtime.

This is an internal production-parity candidate. It is not the final AppImage/distribution design and is not a public release artifact.

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
- Repository-owned host-navigation patch and native external-link helper are hashed into build provenance.

Build the experimental production-parity candidate with:

```text
npm run build:desktop:neutralino
```

The build records the source commit, pinned runtime inputs, patch/runtime/helper hashes, sizes, artifact contents, and checksums.

## Identity and persistence

Phase 3 intentionally keeps the existing Neutralino application ID:

```text
com.santirodriguez.pikachuvolleyball.neutralino-spike
```

The old internal suffix is retained solely to avoid changing the accepted Neutralino system-data identity during productionization. `dataLocation` remains `system`, and the port remains `48471`. A public identity/application-data migration is outside Phase 3.

Application settings and control bindings continue to use Web Storage and are validated across a real Neutralino restart on Fedora/WebKitGTK.

## Security boundary

The production renderer allowlist remains exactly:

```text
app.exit
extensions.dispatch
extensions.getStats
```

`Neutralino.os.open`, arbitrary filesystem access, shell/process execution, generic networking, updater APIs, telemetry, and unrelated native privileges are not granted to renderer JavaScript.

External destinations continue through the Phase 2 trusted path: untrusted renderer URL candidate -> extension IPC -> native final URL validation -> `xdg-open` by argv without a shell. Same-window top-level navigation remains enforced by the patched native WebKitGTK `decide-policy` handler.

The CI parity harness creates a temporary validation configuration that additionally grants `app.writeProcessOutput` and injects smoke probes. That configuration is test-only. The clean production artifact is built and launched before the validation overlay is created.

## Artifact composition

The experimental Linux x64 production-parity bundle contains exactly:

```text
pikachu-volleyball-neutralino-linux_x64
extensions/pv-external-link-linux_x64
provenance.json
SHA256SUMS
```

The Neutralino executable contains the production web resources through embedded-resource mode. Smoke probes, attack servers, diagnostic logs, source trees, compilers, build dependencies, and Node modules are not shipped in the bundle.

## Linux runtime assumptions

The validated Fedora 44 environment provides GTK 3, WebKitGTK 4.1, X11 windowing support, and GStreamer base/good plugins for the exercised MP3/WAV audio path. The native external-link mediator expects `xdg-open` to be available when an approved external URL is opened.

If required GTK/WebKitGTK shared libraries are absent, the executable cannot start its native WebView and fails before normal application startup. Phase 3 records that dependency instead of bundling system libraries; final dependency packaging/installers/AppImage design belong to the later Linux distribution phase.

## Validation boundary

GitHub Actions runs the repository production dependency audit, full `quality:check`, production web/PWA build for all five locales, Neutralino static tests, a clean launch of the extracted embedded artifact, and Fedora 44/WebKitGTK parity/security probes. The exact embedded binary is then reused for the validation overlay so the deeper tests do not silently exercise a different development runtime.

Startup and memory observations are diagnostic only. They must not be treated as Neutralino-versus-Electron performance claims unless measurement boundaries are made directly comparable.
