# Linux distribution model

Phase 5 packages the accepted Neutralino desktop runtime without changing its runtime/security architecture. The repository-owned four-file production bundle remains the canonical runtime input; distribution packaging copies those exact runtime/helper bytes into user-facing formats.

This is v3 development packaging, not a public release or publication step. Product identity remains provisional until the separately approved rebranding phase.

## Selected formats

The supported Phase 5 Linux distribution outputs are x86_64/amd64 only:

```text
pikachu-volleyball-neutralino-linux-x64.tar.gz
pikachu-volleyball-neutralino_2.1.0_amd64.deb
pikachu-volleyball-neutralino-2.1.0-1.x86_64.rpm
SHA256SUMS
```

The portable tarball is the canonical low-level artifact. The Debian package is intended for current Debian/Ubuntu systems and the RPM is validated for Fedora 44. AppImage and Flatpak are not part of Phase 5. ARM64 is deferred until it can receive its own reproducible patched-runtime build and meaningful runtime validation.

## Runtime dependency policy

GTK, WebKitGTK, GStreamer, and desktop utilities remain system-native rather than being bundled into the application.

The patched Neutralino executable has direct ELF dependencies on the normal GTK 3/GLib/Cairo/GdkPixbuf/X11/XCB/libpng/C/C++ runtime stack. WebKitGTK is loaded dynamically by the accepted Neutralino runtime, preferring the 4.1 ABI and falling back to the 4.0 ABI. GStreamer Good plugins are part of the supported MP3/WAV path. The external-link helper expects `xdg-open` after its native URL validation succeeds.

The Debian package declares those requirements with Debian package names, including the WebKitGTK 4.1/4.0 alternative and t64-compatible alternatives where relevant. The Fedora RPM uses normal RPM ELF dependency generation plus explicit requirements for `webkit2gtk4.1`, `gstreamer1-plugins-good`, and `xdg-utils`.

No Node.js, Python, Electron, Chromium, compiler, or development package is an end-user runtime dependency.

## Installed layout

Both native packages install the accepted runtime payload under a private application directory:

```text
/usr/lib/pikachu-volleyball-neutralino/
├── pikachu-volleyball-neutralino-linux_x64
├── extensions/
│   └── pv-external-link-linux_x64
├── provenance.json
└── SHA256SUMS
```

Desktop integration adds:

```text
/usr/bin/pikachu-volleyball-neutralino
/usr/share/applications/com.santirodriguez.pikachuvolleyball.neutralino-spike.desktop
/usr/share/icons/hicolor/512x512/apps/com.santirodriguez.pikachuvolleyball.neutralino-spike.png
/usr/share/doc/pikachu-volleyball-neutralino/README-LINUX.txt
```

The launcher only `exec`s the installed Neutralino executable. The native extension remains beside the executable at the path already required by `${NL_PATH}/extensions/...`; packaging does not add another native IPC or shell boundary.

The desktop entry uses the existing repository icon. No new branding asset is introduced by Phase 5.

## Packaging metadata ownership

`packaging/linux/metadata.env` is the single owner for provisional package name, version, application ID, install path, binary/helper names, architectures, and distro dependency declarations.

This deliberately limits later identity migration work: Phase 6 should not need to edit unrelated package scripts merely to change a name or desktop ID.

## Build and reproducibility model

`npm run build:desktop:neutralino` still produces the accepted internal four-file runtime artifact. `npm run package:desktop:linux` packages an existing production bundle; it does not rebuild or relink Neutralino.

The package script verifies the production bundle checksum, uses the `sourceDateEpoch` recorded in production provenance, normalizes staged file mtimes, uses deterministic tar/gzip metadata for the portable archive, applies `SOURCE_DATE_EPOCH` controls to native packages, and keeps the embedded Neutralino executable and external-link helper byte-for-byte identical across all selected formats.

CI builds the distribution twice and requires the portable tarball, `.deb`, and `.rpm` to be byte-identical between builds.

## Validation

Phase 5 validation preserves the existing runtime reproducibility, Fedora/WebKitGTK, persistence, input, audio, Quit, external-link, and adversarial navigation gates and adds:

- ELF `DT_NEEDED` reporting for the runtime/helper;
- exact portable archive inventory/checksums;
- Debian and RPM package metadata inspection;
- byte comparison of runtime/helper payloads across formats;
- clean Debian-family dependency resolution and installed launch validation;
- Fedora 44 RPM dependency resolution and installed launch validation;
- `.desktop` and icon installation checks;
- package uninstall checks;
- a portable negative test for missing desktop dependencies;
- final artifact size and checksum reporting.

Debian-family validation covers Debian 12, Ubuntu 22.04, and Ubuntu 24.04. The RPM remains Fedora-family scope rather than a claim of universal RPM-distro compatibility.

## Deferred formats and architectures

AppImage is intentionally omitted. Keeping WebKitGTK system-native would add little over the portable tarball, while bundling WebKitGTK/GStreamer would erase most of Neutralino's footprint advantage and transfer maintenance of a large, security-sensitive web stack into the application package.

Flatpak is deferred because the current dependency problem does not justify adding a second application sandbox/security model.

Linux ARM64 remains a future expansion. Upstream support exists, but the repository does not yet have the accepted patched-runtime reproducibility and real ARM64 runtime/security validation required to ship it with the same confidence as x86_64.
