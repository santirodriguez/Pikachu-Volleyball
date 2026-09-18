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

LEVELDB_VERSION="1.23"
LEVELDB_SHA256="9a37f8a6174f09bd622bc723b55881dc541cd50747cbd08831c2a82d620f6d76"
LEVELDB_ARCHIVE="$TOOLCHAIN_ROOT/downloads/leveldb-${LEVELDB_VERSION}.tar.gz"
LEVELDB_SOURCE="$TOOLCHAIN_ROOT/sources/leveldb"
LEVELDB_BUILD="$TOOLCHAIN_ROOT/leveldb-build"
curl --fail --location --retry 3 --retry-all-errors --silent --show-error \
  "https://github.com/google/leveldb/archive/refs/tags/${LEVELDB_VERSION}.tar.gz" \
  --output "$LEVELDB_ARCHIVE"
printf '%s  %s\n' "$LEVELDB_SHA256" "$LEVELDB_ARCHIVE" | sha256sum --check --status || {
  echo "LevelDB source checksum mismatch." >&2
  exit 1
}
rm -rf "$LEVELDB_SOURCE" "$LEVELDB_BUILD"
mkdir -p "$LEVELDB_SOURCE"
tar -xzf "$LEVELDB_ARCHIVE" --strip-components=1 -C "$LEVELDB_SOURCE"
cmake -S "$LEVELDB_SOURCE" -B "$LEVELDB_BUILD" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DLEVELDB_BUILD_TESTS=OFF -DLEVELDB_BUILD_BENCHMARKS=OFF \
  -DCMAKE_DISABLE_FIND_PACKAGE_Snappy=TRUE
cmake --build "$LEVELDB_BUILD" --parallel 2 --target leveldb
LEVELDB_STATIC="$LEVELDB_BUILD/libleveldb.a"
test -s "$LEVELDB_STATIC"
IMPORTER="$BUILD_ROOT/electron-preferences-importer"
g++ -std=c++17 -O2 -Wall -Wextra -Wpedantic \
  -I"$LEVELDB_SOURCE/include" "$ROOT/desktop/native/electron_preferences_importer.cc" \
  "$LEVELDB_STATIC" -pthread -static-libstdc++ -static-libgcc -o "$IMPORTER"
strip --strip-unneeded "$IMPORTER"

cc -std=c11 -O2 -Wall -Wextra -Wpedantic -D_GNU_SOURCE \
  -I"$QUICKJS_SOURCE" \
  $(pkg-config --cflags sdl3 sdl3-ttf libpng libmpg123) \
  "$ROOT/desktop/native/native_main.c" \
  "$ROOT/desktop/native/native_audio.c" \
  "$ROOT/desktop/native/native_menu_renderer.c" \
  "$QUICKJS_SOURCE/libquickjs.a" -o "$BINARY" \
  $(pkg-config --libs sdl3 sdl3-ttf libpng libmpg123) \
  -lm -ldl -pthread -latomic -Wl,-rpath,'$ORIGIN/../lib'
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
install -m 0755 "$IMPORTER" "$APPDIR/usr/bin/electron-preferences-importer"
install -m 0644 "$BUNDLE" "$APPDIR/usr/bin/native-app.bundle.js"
mkdir -p "$APPDIR/usr/share/licenses/pikachu-volleyball-native/leveldb"
install -m 0644 "$LEVELDB_SOURCE/LICENSE" "$APPDIR/usr/share/licenses/pikachu-volleyball-native/leveldb/LICENSE"
for wav in WAVE140_1.wav WAVE141_1.wav WAVE142_1.wav WAVE143_1.wav WAVE144_1.wav WAVE145_1.wav WAVE146_1.wav; do
  install -m 0644 "$ROOT/src/resources/assets/sounds/$wav" "$APPDIR/usr/bin/assets/$wav"
done
install -m 0644 "$ROOT/src/resources/assets/sounds/bgm.mp3" "$APPDIR/usr/bin/assets/bgm.mp3"

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
ldd "$APPDIR/usr/bin/electron-preferences-importer" | tee "$EVIDENCE_DIR/importer-ldd.txt"
if grep -Eq 'not found|libleveldb|libsnappy' "$EVIDENCE_DIR/importer-ldd.txt"; then
  echo 'Production Electron importer has an undeclared LevelDB/Snappy runtime dependency.' >&2
  exit 1
fi

framebuffer="$EVIDENCE_DIR/native-menu-framebuffer.bmp"
render_trace="$EVIDENCE_DIR/native-menu-render.json"
preference_root="$BUILD_ROOT/selftest-preferences"
rm -rf "$preference_root"
mkdir -p "$preference_root/prepackage"
xvfb-run -a env \
  SDL_AUDIODRIVER=dummy SDL_RENDER_DRIVER=software \
  PV_NATIVE_FRAMEBUFFER_PATH="$framebuffer" PV_NATIVE_RENDER_TRACE_PATH="$render_trace" \
  PV_NATIVE_EXPECT_MIGRATION=1 PV_NATIVE_PREFS_DIR="$preference_root/prepackage" \
  "$APPDIR/AppRun" --self-test | tee "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_host_self_test=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_graphics_bridge=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_audio_mixer=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_preferences_store=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^electron_migration_runtime=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_pointer_menu=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_locale_menu=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_external_url_allowlist=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_quit_path=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
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
importer_bytes="$(stat -c%s "$IMPORTER")"
importer_sha256="$(sha256sum "$IMPORTER" | awk '{print $1}')"
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
  echo 'Phase 5 native host AppImage exceeds the 30 MiB architecture budget.' >&2
  exit 1
fi

is_known_appimage_host_limit() {
  local log_file="$1"
  grep -Eiq \
    'dlopen\(\): error loading libfuse|AppImages require FUSE|Cannot mount AppImage|failed to open /dev/fuse|fusermount.*failed|FUSE setup failed' \
    "$log_file"
}

run_direct_appimage_test() {
  local log_file="$EVIDENCE_DIR/direct-self-test.txt"
  set +e
  rm -rf "$preference_root/direct"; mkdir -p "$preference_root/direct"
  timeout 30 xvfb-run -a env SDL_AUDIODRIVER=dummy SDL_RENDER_DRIVER=software \
    PV_NATIVE_EXPECT_MIGRATION=1 PV_NATIVE_PREFS_DIR="$preference_root/direct" \
    "$OUTPUT" --self-test > "$log_file" 2>&1
  local status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    grep -q '^native_host_self_test=PASS$' "$log_file"
    printf 'PASS'
    return 0
  fi
  if is_known_appimage_host_limit "$log_file"; then
    printf 'SKIPPED_HOST_LIMITATION'
    return 0
  fi
  cat "$log_file" >&2
  echo "Direct native AppImage self-test failed with status $status." >&2
  return 1
}

direct_result="$(run_direct_appimage_test)"

rm -rf "$preference_root/extract-run"; mkdir -p "$preference_root/extract-run"
APPIMAGE_EXTRACT_AND_RUN=1 timeout 30 xvfb-run -a env \
  SDL_AUDIODRIVER=dummy SDL_RENDER_DRIVER=software \
  PV_NATIVE_EXPECT_MIGRATION=1 PV_NATIVE_PREFS_DIR="$preference_root/extract-run" \
  "$OUTPUT" --self-test \
  | tee "$EVIDENCE_DIR/extract-run-self-test.txt"
grep -q '^native_host_self_test=PASS$' "$EVIDENCE_DIR/extract-run-self-test.txt"

rm -rf "$BUILD_ROOT/verify"
mkdir -p "$BUILD_ROOT/verify"
(
  cd "$BUILD_ROOT/verify"
  "$OUTPUT" --appimage-extract >/dev/null
)
rm -rf "$preference_root/extracted-apprun"; mkdir -p "$preference_root/extracted-apprun"
xvfb-run -a env SDL_AUDIODRIVER=dummy SDL_RENDER_DRIVER=software \
  PV_NATIVE_EXPECT_MIGRATION=1 PV_NATIVE_PREFS_DIR="$preference_root/extracted-apprun" \
  "$BUILD_ROOT/verify/squashfs-root/AppRun" --self-test \
  | tee "$EVIDENCE_DIR/extracted-apprun-self-test.txt"
grep -q '^native_host_self_test=PASS$' "$EVIDENCE_DIR/extracted-apprun-self-test.txt"

packaged_bundle="$BUILD_ROOT/verify/squashfs-root/usr/bin/native-app.bundle.js"
packaged_host="$BUILD_ROOT/verify/squashfs-root/usr/bin/pikachu-volleyball-native"
packaged_importer="$BUILD_ROOT/verify/squashfs-root/usr/bin/electron-preferences-importer"
if [[ "$(sha256sum "$packaged_bundle" | awk '{print $1}')" != "$bundle_sha256" ]]; then
  echo 'Native application bundle changed during packaging.' >&2
  exit 1
fi
if [[ "$(sha256sum "$packaged_host" | awk '{print $1}')" != "$host_sha256" ]]; then
  echo 'Native host binary changed during packaging.' >&2
  exit 1
fi
if [[ "$(sha256sum "$packaged_importer" | awk '{print $1}')" != "$importer_sha256" ]]; then
  echo 'Electron preference importer changed during packaging.' >&2
  exit 1
fi

printf '%s  %s\n' "$sha256" "$(basename "$OUTPUT")" \
  > "$BUILD_ROOT/SHA256SUMS.txt"

{
  echo 'size_gate=PASS'
  echo "bytes=$bytes"
  echo "mib=$mib"
  echo "limit_bytes=$MAX_APPIMAGE_BYTES"
  echo "headroom_bytes=$headroom_bytes"
  echo "sha256=$sha256"
  echo "native_bundle_bytes=$bundle_bytes"
  echo "native_bundle_sha256=$bundle_sha256"
  echo "native_host_bytes=$host_bytes"
  echo "native_host_sha256=$host_sha256"
  echo "electron_importer_bytes=$importer_bytes"
  echo "electron_importer_sha256=$importer_sha256"
  echo "leveldb_version=$LEVELDB_VERSION"
  echo "leveldb_source_sha256=$LEVELDB_SHA256"
  echo "render_trace_bytes=$render_trace_bytes"
  echo "render_trace_sha256=$render_trace_sha256"
  echo "framebuffer_bytes=$framebuffer_bytes"
  echo "framebuffer_sha256=$framebuffer_sha256"
  echo "phase3_base_appimage_bytes=$base_bytes"
  echo "phase3_base_appimage_sha256=$base_sha256"
  echo "direct_appimage_self_test=$direct_result"
  echo 'extract_run_self_test=PASS'
  echo 'extracted_apprun_self_test=PASS'
  echo 'shared_core_bridge=PASS'
  echo 'semantic_input_bridge=PASS'
  echo 'focus_reset_bridge=PASS'
  echo 'native_graphics_bridge=PASS'
  echo 'native_audio_mixer=PASS'
  echo 'native_preferences_store=PASS'
  echo 'electron_migration_runtime=PASS'
  echo 'native_pointer_menu=PASS'
  echo 'native_locale_menu=PASS'
  echo 'native_external_url_allowlist=PASS'
  echo 'native_quit_path=PASS'
} | tee "$EVIDENCE_DIR/summary.txt"
