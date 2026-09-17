#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="${PV_PHASE5_NATIVE_ROOT:-$ROOT/build/phase5/native-host}"
TOOLCHAIN_ROOT="$BUILD_ROOT/toolchain"
EVIDENCE_DIR="$BUILD_ROOT/evidence"
BUNDLE="$BUILD_ROOT/native-app.bundle.js"
BINARY="$BUILD_ROOT/pikachu-volleyball-native"
APPDIR="$BUILD_ROOT/PikachuVolleyballNative.AppDir"
OUTPUT="$BUILD_ROOT/Pikachu-Volleyball-Native-x86_64.AppImage"
MAX_APPIMAGE_BYTES=$((30 * 1024 * 1024))

rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT" "$EVIDENCE_DIR"

npx webpack --config "$ROOT/webpack.native.js"
if [[ ! -s "$BUNDLE" ]]; then
  echo "Native application bundle is missing or empty: $BUNDLE" >&2
  exit 1
fi

# Reuse the already accepted Phase 3 pin/download/build authority while Phase 5
# proves the production composition root. The resulting AppDir is then rebuilt
# around the production host; spike executables/scripts are not retained.
PV_NATIVE_BUILD_ROOT="$TOOLCHAIN_ROOT" \
  bash "$ROOT/desktop/native-spike/build-appimage.sh"

PREFIX="$TOOLCHAIN_ROOT/prefix"
QUICKJS_SOURCE="$TOOLCHAIN_ROOT/sources/quickjs"
BASE_APPIMAGE="$TOOLCHAIN_ROOT/Pikachu-Volleyball-Native-Spike-x86_64.AppImage"
APPIMAGETOOL="$TOOLCHAIN_ROOT/downloads/appimagetool-x86_64.AppImage"
APPIMAGE_RUNTIME="$TOOLCHAIN_ROOT/downloads/runtime-x86_64"

for required in \
  "$PREFIX" \
  "$QUICKJS_SOURCE/libquickjs.a" \
  "$BASE_APPIMAGE" \
  "$APPIMAGETOOL" \
  "$APPIMAGE_RUNTIME"; do
  if [[ ! -e "$required" ]]; then
    echo "Phase 3 toolchain input is missing: $required" >&2
    exit 1
  fi
done

export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig:$PREFIX/lib64/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

cc -std=c11 -O2 -Wall -Wextra -Wpedantic -D_GNU_SOURCE \
  -I"$QUICKJS_SOURCE" \
  $(pkg-config --cflags sdl3 libpng) \
  "$ROOT/desktop/native/native_main.c" "$QUICKJS_SOURCE/libquickjs.a" \
  -o "$BINARY" \
  $(pkg-config --libs sdl3 libpng) \
  -lm -ldl -pthread -latomic \
  -Wl,-rpath,'$ORIGIN/../lib'
strip --strip-unneeded "$BINARY"
patchelf --set-rpath '$ORIGIN/../lib' "$BINARY"

rm -rf "$BUILD_ROOT/extract"
mkdir -p "$BUILD_ROOT/extract"
(
  cd "$BUILD_ROOT/extract"
  "$BASE_APPIMAGE" --appimage-extract >/dev/null
)
cp -a "$BUILD_ROOT/extract/squashfs-root" "$APPDIR"

rm -f \
  "$APPDIR/usr/bin/pikachu-volleyball-native-spike" \
  "$APPDIR/usr/bin/pikachu-volleyball-native-unicode-probe" \
  "$APPDIR/usr/bin/spike.js" \
  "$APPDIR/usr/bin/integrated_menu_strings.js" \
  "$APPDIR/pikachu-volleyball-native-spike.desktop" \
  "$APPDIR/pikachu-volleyball-native-spike.png"

if [[ -d "$APPDIR/usr/share/licenses/native-spike" ]]; then
  mv "$APPDIR/usr/share/licenses/native-spike" \
    "$APPDIR/usr/share/licenses/pikachu-volleyball-native"
fi

install -m 0755 "$BINARY" "$APPDIR/usr/bin/pikachu-volleyball-native"
install -m 0644 "$BUNDLE" "$APPDIR/usr/bin/native-app.bundle.js"

cat > "$APPDIR/AppRun" <<'APP_RUN'
#!/usr/bin/env bash
set -euo pipefail
APPDIR="$(cd "$(dirname "$0")" && pwd)"
export LD_LIBRARY_PATH="$APPDIR/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$APPDIR/usr/bin/pikachu-volleyball-native" "$@"
APP_RUN
chmod 0755 "$APPDIR/AppRun"

cat > "$APPDIR/pikachu-volleyball-native.desktop" <<'DESKTOP_ENTRY'
[Desktop Entry]
Type=Application
Name=Pikachu Volleyball
Exec=pikachu-volleyball-native
Icon=pikachu-volleyball-native
Categories=Game;
Terminal=false
DESKTOP_ENTRY
install -m 0644 \
  "$ROOT/src/resources/assets/images/IDI_PIKAICON-1_gap_filled_192.png" \
  "$APPDIR/pikachu-volleyball-native.png"

LD_LIBRARY_PATH="$APPDIR/usr/lib" ldd "$APPDIR/usr/bin/pikachu-volleyball-native" \
  | tee "$EVIDENCE_DIR/host-ldd.txt"
if grep -q 'not found' "$EVIDENCE_DIR/host-ldd.txt"; then
  echo 'Native production host has unresolved shared libraries.' >&2
  exit 1
fi

framebuffer="$EVIDENCE_DIR/native-menu-framebuffer.bmp"
render_trace="$EVIDENCE_DIR/native-menu-render.json"
xvfb-run -a env \
  SDL_AUDIODRIVER=dummy \
  SDL_RENDER_DRIVER=software \
  PV_NATIVE_FRAMEBUFFER_PATH="$framebuffer" \
  PV_NATIVE_RENDER_TRACE_PATH="$render_trace" \
  "$APPDIR/AppRun" --self-test \
  | tee "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_host_self_test=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_graphics_bridge=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_framebuffer_variation=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
test -s "$framebuffer"
test -s "$render_trace"
framebuffer_bytes="$(stat -c%s "$framebuffer")"
framebuffer_sha256="$(sha256sum "$framebuffer" | awk '{print $1}')"
render_trace_bytes="$(stat -c%s "$render_trace")"
render_trace_sha256="$(sha256sum "$render_trace" | awk '{print $1}')"
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGETOOL" \
  --runtime-file "$APPIMAGE_RUNTIME" \
  --comp zstd \
  --no-appstream \
  "$APPDIR" "$OUTPUT"
chmod 0755 "$OUTPUT"

bytes="$(stat -c%s "$OUTPUT")"
mib="$(awk -v bytes="$bytes" 'BEGIN { printf "%.2f", bytes / 1048576 }')"
sha256="$(sha256sum "$OUTPUT" | awk '{print $1}')"
headroom_bytes=$((MAX_APPIMAGE_BYTES - bytes))
bundle_bytes="$(stat -c%s "$BUNDLE")"
bundle_sha256="$(sha256sum "$BUNDLE" | awk '{print $1}')"
host_bytes="$(stat -c%s "$BINARY")"
host_sha256="$(sha256sum "$BINARY" | awk '{print $1}')"
base_bytes="$(stat -c%s "$BASE_APPIMAGE")"
base_sha256="$(sha256sum "$BASE_APPIMAGE" | awk '{print $1}')"

if (( bytes > MAX_APPIMAGE_BYTES )); then
  {
    echo 'size_gate=FAIL'
    echo "bytes=$bytes"
    echo "mib=$mib"
    echo "limit_bytes=$MAX_APPIMAGE_BYTES"
    echo "native_bundle_bytes=$bundle_bytes"
    echo "native_bundle_sha256=$bundle_sha256"
  } | tee "$EVIDENCE_DIR/summary.txt"
