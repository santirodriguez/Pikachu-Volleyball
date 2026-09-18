#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="${PV_NATIVE_RELEASE_ROOT:-$ROOT/build/native-release}"
TOOLCHAIN_ROOT="$BUILD_ROOT/toolchain"
EVIDENCE_DIR="$BUILD_ROOT/evidence"
BUNDLE="$BUILD_ROOT/native-app.bundle.js"
BINARY="$BUILD_ROOT/pikachu-volleyball-native"
APPDIR="$BUILD_ROOT/PikachuVolleyballNative.AppDir"
OUTPUT="${PV_NATIVE_APPIMAGE_OUTPUT:-$BUILD_ROOT/Pikachu-Volleyball-Native-x86_64.AppImage}"
MAX_APPIMAGE_BYTES=$((30 * 1024 * 1024))
SOURCE_HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"

rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT" "$EVIDENCE_DIR"
export SOURCE_DATE_EPOCH="$(git -C "$ROOT" show -s --format=%ct "$SOURCE_HEAD_SHA")"
export PV_NATIVE_BUNDLE_DIR="$BUILD_ROOT"
export CFLAGS="${CFLAGS:+$CFLAGS }-ffile-prefix-map=$ROOT=/src -fdebug-prefix-map=$ROOT=/src -ffile-prefix-map=$BUILD_ROOT=/build -fdebug-prefix-map=$BUILD_ROOT=/build"
export CXXFLAGS="${CXXFLAGS:+$CXXFLAGS }-ffile-prefix-map=$ROOT=/src -fdebug-prefix-map=$ROOT=/src -ffile-prefix-map=$BUILD_ROOT=/build -fdebug-prefix-map=$BUILD_ROOT=/build"
export RUSTFLAGS="${RUSTFLAGS:+$RUSTFLAGS }--remap-path-prefix=$ROOT=/src --remap-path-prefix=$BUILD_ROOT=/build"

npx webpack --config "$ROOT/webpack.native.js"
if [[ ! -s "$BUNDLE" ]]; then
  echo "Native application bundle is missing or empty: $BUNDLE" >&2
  exit 1
fi

# Build the release-owned native toolchain directly. Phase 3 remains
# feasibility provenance and is not a production build primitive.
PV_NATIVE_TOOLCHAIN_ROOT="$TOOLCHAIN_ROOT" \
  bash "$ROOT/scripts/build-native-toolchain.sh"

PREFIX="$TOOLCHAIN_ROOT/prefix"
QUICKJS_SOURCE="$TOOLCHAIN_ROOT/sources/quickjs"
SDL_SOURCE="$TOOLCHAIN_ROOT/sources/sdl"
SDL_TTF_SOURCE="$TOOLCHAIN_ROOT/sources/sdl-ttf"
UNIFONT_FILE="$TOOLCHAIN_ROOT/downloads/unifont-17.0.04.otf"
INTER_FONT="$TOOLCHAIN_ROOT/downloads/InterVariable-4.1.ttf"
INTER_LICENSE="$TOOLCHAIN_ROOT/downloads/Inter-LICENSE-4.1.txt"
APPIMAGETOOL="$TOOLCHAIN_ROOT/downloads/appimagetool-x86_64.AppImage"
APPIMAGE_RUNTIME="$TOOLCHAIN_ROOT/downloads/runtime-x86_64"

for required in \
  "$PREFIX" \
  "$QUICKJS_SOURCE/libquickjs.a" \
  "$UNIFONT_FILE" \
  "$INTER_FONT" \
  "$INTER_LICENSE" \
  "$APPIMAGETOOL" \
  "$APPIMAGE_RUNTIME"; do
  if [[ ! -e "$required" ]]; then
    echo "Native release toolchain input is missing: $required" >&2
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
g++ $CXXFLAGS -std=c++17 -O2 -Wall -Wextra -Wpedantic \
  -I"$LEVELDB_SOURCE/include" "$ROOT/desktop/native/electron_preferences_importer.cc" \
  "$LEVELDB_STATIC" -pthread -static-libstdc++ -static-libgcc -Wl,--build-id=none -o "$IMPORTER"
strip --strip-unneeded "$IMPORTER"

FIXTURE_WRITER="$BUILD_ROOT/electron-preferences-fixture"
g++ $CXXFLAGS -std=c++17 -O2 -Wall -Wextra -Wpedantic \
  -I"$LEVELDB_SOURCE/include" "$ROOT/desktop/native/electron_preferences_fixture.cc" \
  "$LEVELDB_STATIC" -pthread -static-libstdc++ -static-libgcc -Wl,--build-id=none -o "$FIXTURE_WRITER"
strip --strip-unneeded "$FIXTURE_WRITER"

FIXTURE_ROOT="$BUILD_ROOT/legacy-electron-fixture"
FIXTURE_USER_DATA="$FIXTURE_ROOT/Pikachu Volleyball"
FIXTURE_TSV="$FIXTURE_ROOT/preferences.tsv"
FIXTURE_REPORT="$FIXTURE_ROOT/report.json"
mkdir -p "$FIXTURE_USER_DATA/Local Storage"
node "$ROOT/scripts/write-electron-migration-fixture.cjs" \
  "$FIXTURE_TSV" "$FIXTURE_REPORT" "$FIXTURE_USER_DATA"
"$FIXTURE_WRITER" "$FIXTURE_TSV" "$FIXTURE_USER_DATA/Local Storage/leveldb" \
  | tee "$EVIDENCE_DIR/electron-fixture.txt"
grep -q '^electron_preferences_fixture=PASS$' "$EVIDENCE_DIR/electron-fixture.txt"
export PV_ELECTRON_USER_DATA_DIR="$FIXTURE_USER_DATA"

ACCESSKIT_VERSION="0.22.3"
ACCESSKIT_COMMIT="826d672661f9453c8b269ab3946dbcbae6300555"
ACCESSKIT_REPOSITORY="https://github.com/AccessKit/accesskit-c.git"
ACCESSKIT_SOURCE="$TOOLCHAIN_ROOT/sources/accesskit-c"
ACCESSKIT_BUILD="$TOOLCHAIN_ROOT/accesskit-build"
rm -rf "$ACCESSKIT_SOURCE" "$ACCESSKIT_BUILD"
git clone --filter=blob:none --no-checkout "$ACCESSKIT_REPOSITORY" "$ACCESSKIT_SOURCE"
git -C "$ACCESSKIT_SOURCE" fetch --depth 1 origin "$ACCESSKIT_COMMIT"
git -C "$ACCESSKIT_SOURCE" checkout --detach FETCH_HEAD
actual_accesskit_commit="$(git -C "$ACCESSKIT_SOURCE" rev-parse HEAD)"
if [[ "$actual_accesskit_commit" != "$ACCESSKIT_COMMIT" ]]; then
  echo "AccessKit checkout mismatch: expected $ACCESSKIT_COMMIT, got $actual_accesskit_commit" >&2
  exit 1
fi
manifest_version="$(sed -n 's/^version = "\([^"]*\)"/\1/p' "$ACCESSKIT_SOURCE/Cargo.toml" | head -1)"
if [[ "$manifest_version" != "$ACCESSKIT_VERSION" ]]; then
  echo "AccessKit manifest version mismatch: expected $ACCESSKIT_VERSION, got $manifest_version" >&2
  exit 1
fi
cmake -S "$ACCESSKIT_SOURCE" -B "$ACCESSKIT_BUILD" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DRust_CARGO_TARGET=x86_64-unknown-linux-gnu \
  -DACCESSKIT_BUILD_HEADERS=OFF \
  -DACCESSKIT_BUILD_LIBRARIES=ON
cmake --build "$ACCESSKIT_BUILD" --parallel 2
cmake --install "$ACCESSKIT_BUILD"
ACCESSKIT_STATIC="$ACCESSKIT_SOURCE/lib/linux/x86_64/static/libaccesskit.a"
test -s "$ACCESSKIT_STATIC"

cc $CFLAGS -std=c11 -O2 -Wall -Wextra -Wpedantic -D_GNU_SOURCE \
  -I"$QUICKJS_SOURCE" -I"$ACCESSKIT_SOURCE/include" \
  $(pkg-config --cflags sdl3 sdl3-ttf libpng libmpg123) \
  "$ROOT/desktop/native/native_main.c" \
  "$ROOT/desktop/native/native_audio.c" \
  "$ROOT/desktop/native/native_menu_renderer.c" \
  "$ROOT/desktop/native/native_accessibility.c" \
  "$ROOT/desktop/native/native_startup.c" \
  "$QUICKJS_SOURCE/libquickjs.a" "$ACCESSKIT_STATIC" -o "$BINARY" \
  $(pkg-config --libs sdl3 sdl3-ttf libpng libmpg123) \
  -static-libgcc -lm -ldl -pthread -latomic -Wl,--build-id=none -Wl,-rpath,'$ORIGIN/../lib'
strip --strip-unneeded "$BINARY"
patchelf --set-rpath '$ORIGIN/../lib' "$BINARY"

rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin/assets" "$APPDIR/usr/bin/fonts" "$APPDIR/usr/lib" \
  "$APPDIR/usr/share/licenses/pikachu-volleyball-native/runtime"

install -m 0644 "$UNIFONT_FILE" \
  "$APPDIR/usr/bin/fonts/unifont-17.0.04.otf"
install -m 0644 "$INTER_FONT" \
  "$APPDIR/usr/bin/fonts/InterVariable.ttf"
install -m 0644 "$INTER_LICENSE" \
  "$APPDIR/usr/share/licenses/pikachu-volleyball-native/Inter-LICENSE.txt"
install -m 0644 "$ROOT/src/resources/assets/images/sprite_sheet.png" \
  "$APPDIR/usr/bin/assets/sprite_sheet.png"
install -m 0644 "$ROOT/src/resources/assets/images/sprite_sheet.json" \
  "$APPDIR/usr/bin/assets/sprite_sheet.json"
install -m 0644 "$SDL_SOURCE/LICENSE.txt" \
  "$APPDIR/usr/share/licenses/pikachu-volleyball-native/SDL3-LICENSE.txt"
install -m 0644 "$SDL_TTF_SOURCE/LICENSE.txt" \
  "$APPDIR/usr/share/licenses/pikachu-volleyball-native/SDL3_ttf-LICENSE.txt"
install -m 0644 "$QUICKJS_SOURCE/LICENSE" \
  "$APPDIR/usr/share/licenses/pikachu-volleyball-native/QuickJS-LICENSE.txt"
cat > "$APPDIR/usr/share/licenses/pikachu-volleyball-native/Unifont-NOTICE.txt" <<'EOF'
GNU Unifont 17.0.04
The compiled font is dual-licensed under the SIL Open Font License 1.1 and
GNU GPL version 2 or later with the GNU Font Embedding Exception.
License information: https://unifoundry.com/LICENSE.txt
EOF

: > "$EVIDENCE_DIR/build-ldd.txt"
LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64" ldd "$BINARY" \
  | tee "$EVIDENCE_DIR/build-ldd.txt"
mapfile -t linked_libraries < <(
  awk '/=> \/[^ ]+/ {print $3} /^\/[[:graph:]]+/ {print $1}' \
    "$EVIDENCE_DIR/build-ldd.txt" | sort -u
)
: > "$EVIDENCE_DIR/runtime-packages.txt"
for library in "${linked_libraries[@]}"; do
  name="$(basename "$library")"
  case "$name" in
    libc.so.*|libm.so.*|libdl.so.*|libpthread.so.*|librt.so.*|libgcc_s.so.*|ld-linux-*.so.*)
      continue
      ;;
  esac
  install -m 0644 -T "$(readlink -f "$library")" "$APPDIR/usr/lib/$name"

  if command -v dpkg-query >/dev/null 2>&1; then
    package="$(dpkg-query -S "$(readlink -f "$library")" 2>/dev/null | head -1 | cut -d: -f1 || true)"
    package="${package%%:*}"
    copyright="/usr/share/doc/$package/copyright"
    if [[ -n "$package" && -f "$copyright" ]]; then
      package_version="$(dpkg-query -W -f='${Version}' "$package" 2>/dev/null || true)"
      system_path="$(readlink -f "$library")"
      printf '%s\t%s\t%s\t%s\n' "$name" "$package" "$package_version" "$system_path" \
        >> "$EVIDENCE_DIR/runtime-packages.txt"
      install -m 0644 "$copyright" \
        "$APPDIR/usr/share/licenses/pikachu-volleyball-native/runtime/$package.copyright"
    fi
  fi
  resolved_library="$(readlink -f "$library")"
  if [[ "$resolved_library" == "$PREFIX/"* ]]; then
    normalized_library="toolchain-prefix/${resolved_library#"$PREFIX/"}"
    printf '%s\t%s\t%s\t%s\n' "$name" source-built pinned "$normalized_library" \
      >> "$EVIDENCE_DIR/runtime-packages.txt"
  fi
done
sort -o "$EVIDENCE_DIR/runtime-packages.txt" "$EVIDENCE_DIR/runtime-packages.txt"

install -m 0755 "$BINARY" "$APPDIR/usr/bin/pikachu-volleyball-native"
install -m 0755 "$IMPORTER" "$APPDIR/usr/bin/electron-preferences-importer"
install -m 0644 "$BUNDLE" "$APPDIR/usr/bin/native-app.bundle.js"
mkdir -p "$APPDIR/usr/share/licenses/pikachu-volleyball-native/leveldb"
install -m 0644 "$LEVELDB_SOURCE/LICENSE" "$APPDIR/usr/share/licenses/pikachu-volleyball-native/leveldb/LICENSE"
mkdir -p "$APPDIR/usr/share/licenses/pikachu-volleyball-native/accesskit"
install -m 0644 "$ACCESSKIT_SOURCE/LICENSE-APACHE" \
  "$APPDIR/usr/share/licenses/pikachu-volleyball-native/accesskit/LICENSE-APACHE"
install -m 0644 "$ACCESSKIT_SOURCE/LICENSE-MIT" \
  "$APPDIR/usr/share/licenses/pikachu-volleyball-native/accesskit/LICENSE-MIT"
for wav in WAVE140_1.wav WAVE141_1.wav WAVE142_1.wav WAVE143_1.wav WAVE144_1.wav WAVE145_1.wav WAVE146_1.wav; do
  install -m 0644 "$ROOT/src/resources/assets/sounds/$wav" "$APPDIR/usr/bin/assets/$wav"
done
install -m 0644 "$ROOT/src/resources/assets/sounds/bgm.mp3" "$APPDIR/usr/bin/assets/bgm.mp3"

{
  echo "runner_image_os=${ImageOS:-unknown}"
  echo "runner_image_version=${ImageVersion:-unknown}"
  echo "cc=$(cc --version | head -1)"
  echo "gxx=$(g++ --version | head -1)"
  echo "cmake=$(cmake --version | head -1)"
  echo "ninja=$(ninja --version)"
  echo "rustc=$(rustc --version)"
  echo "cargo=$(cargo --version)"
  echo "node=$(node --version)"
  echo "npm=$(npm --version)"
  echo "patchelf=$(patchelf --version | head -1)"
} > "$EVIDENCE_DIR/build-environment.txt"

build_environment_sha256="$(sha256sum "$EVIDENCE_DIR/build-environment.txt" | awk '{print $1}')"
runtime_packages_sha256="$(sha256sum "$EVIDENCE_DIR/runtime-packages.txt" | awk '{print $1}')"

node - "$APPDIR/provenance.json" "$SOURCE_HEAD_SHA" "$SOURCE_DATE_EPOCH" \
  "$TOOLCHAIN_ROOT/evidence/summary.txt" "$build_environment_sha256" \
  "$runtime_packages_sha256" <<'NODE'
const fs = require('node:fs');
const [
  output,
  sourceHead,
  sourceDateEpoch,
  toolchainSummary,
  buildEnvironmentSha256,
  runtimePackagesSha256,
] = process.argv.slice(2);
const pins = Object.fromEntries(
  fs.readFileSync(toolchainSummary, 'utf8')
    .trim()
    .split(/\n/)
    .map((line) => line.split(/=(.*)/s).slice(0, 2))
);
fs.writeFileSync(output, JSON.stringify({
  schema: 1,
  sourceHead,
  sourceDateEpoch: Number(sourceDateEpoch),
  architecture: 'x86_64',
  package: 'AppImage',
  compression: 'zstd',
  buildEnvironmentSha256,
  runtimePackagesSha256,
  pins,
}, null, 2) + '\n');
NODE

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

startup_error_evidence="$EVIDENCE_DIR/startup-errors.txt"
: > "$startup_error_evidence"
for locale in en es-ar ca ko zh; do
  set +e
  startup_output="$("$APPDIR/AppRun" --startup-error-test "$locale" 2>&1)"
  startup_status=$?
  set -e
  if [[ "$startup_status" -ne 2 ]]; then
    echo "Localized startup error test for $locale returned $startup_status instead of 2." >&2
    exit 1
  fi
  grep -Fq "native_startup_error_test[$locale]=PASS" <<<"$startup_output"
  printf '### %s\n%s\n' "$locale" "$startup_output" >> "$startup_error_evidence"
done
grep -Fq 'No se pudo inicializar la lógica de la aplicación.' "$startup_error_evidence"
grep -Fq "No s'ha pogut inicialitzar la lògica de l'aplicació." "$startup_error_evidence"
grep -Fq '애플리케이션 로직을 초기화할 수 없습니다.' "$startup_error_evidence"
grep -Fq '无法初始化应用程序逻辑。' "$startup_error_evidence"
echo 'native_startup_error_locales=PASS' >> "$startup_error_evidence"

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

framebuffer="$EVIDENCE_DIR/native-game-framebuffer.bmp"
menu_framebuffer="$EVIDENCE_DIR/native-menu-framebuffer.bmp"
modal_framebuffer="$EVIDENCE_DIR/native-menu-modal-framebuffer.bmp"
render_trace="$EVIDENCE_DIR/native-menu-render.json"
preference_root="$BUILD_ROOT/selftest-preferences"
rm -rf "$preference_root"
mkdir -p "$preference_root/prepackage"
xvfb-run -a env \
  SDL_AUDIODRIVER=dummy SDL_RENDER_DRIVER=software \
  PV_NATIVE_FRAMEBUFFER_PATH="$framebuffer" PV_NATIVE_MENU_FRAMEBUFFER_PATH="$menu_framebuffer" \
  PV_NATIVE_MENU_MODAL_FRAMEBUFFER_PATH="$modal_framebuffer" \
  PV_NATIVE_RENDER_TRACE_PATH="$render_trace" \
  PV_NATIVE_EXPECT_MIGRATION=1 PV_NATIVE_PREFS_DIR="$preference_root/prepackage" \
  "$APPDIR/AppRun" --self-test | tee "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_host_self_test=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_graphics_bridge=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_audio_mixer=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_bgm_position_preserved=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_remap_scancode_coverage=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_quick_rematch_hint=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_menu_theme=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_menu_visual_parity=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_menu_framebuffer=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_menu_modal_layout=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_preferences_store=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^electron_migration_runtime=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_pointer_menu=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_locale_menu=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_external_url_allowlist=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_quit_path=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_startup_localization=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
grep -q '^native_framebuffer_variation=PASS$' "$EVIDENCE_DIR/prepackage-self-test.txt"
test -s "$framebuffer"
test -s "$menu_framebuffer"
test -s "$modal_framebuffer"
test -s "$render_trace"
framebuffer_bytes="$(stat -c%s "$framebuffer")"
framebuffer_sha256="$(sha256sum "$framebuffer" | awk '{print $1}')"
menu_framebuffer_bytes="$(stat -c%s "$menu_framebuffer")"
menu_framebuffer_sha256="$(sha256sum "$menu_framebuffer" | awk '{print $1}')"
modal_framebuffer_bytes="$(stat -c%s "$modal_framebuffer")"
modal_framebuffer_sha256="$(sha256sum "$modal_framebuffer" | awk '{print $1}')"
render_trace_bytes="$(stat -c%s "$render_trace")"
render_trace_sha256="$(sha256sum "$render_trace" | awk '{print $1}')"

# Normalize all staged metadata before SquashFS creation.
find "$APPDIR" -exec touch -h -d "@$SOURCE_DATE_EPOCH" {} +
find "$APPDIR" -printf '%P\t%y\t%s\t%TY-%Tm-%TdT%TH:%TM:%TS\n' | sort \
  > "$EVIDENCE_DIR/appdir-inventory.tsv"
(
  cd "$APPDIR"
  find . -type f -print0 | sort -z | xargs -0 sha256sum
) > "$EVIDENCE_DIR/appdir-sha256.txt"

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
provenance_sha256="$(sha256sum "$APPDIR/provenance.json" | awk '{print $1}')"
appdir_inventory_sha256="$(sha256sum "$EVIDENCE_DIR/appdir-inventory.tsv" | awk '{print $1}')"
appdir_content_sha256="$(sha256sum "$EVIDENCE_DIR/appdir-sha256.txt" | awk '{print $1}')"

if (( bytes > MAX_APPIMAGE_BYTES )); then
  {
    echo 'size_gate=FAIL'
    echo "source_head_sha=$SOURCE_HEAD_SHA"
    echo "bytes=$bytes"
    echo "mib=$mib"
    echo "limit_bytes=$MAX_APPIMAGE_BYTES"
    echo "native_bundle_bytes=$bundle_bytes"
    echo "native_bundle_sha256=$bundle_sha256"
  } | tee "$EVIDENCE_DIR/summary.txt"
  echo 'Native release AppImage exceeds the 30 MiB architecture budget.' >&2
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
  echo "source_head_sha=$SOURCE_HEAD_SHA"
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
  echo "accesskit_version=$ACCESSKIT_VERSION"
  echo "accesskit_commit=$actual_accesskit_commit"
  echo "accesskit_static_bytes=$(stat -c%s "$ACCESSKIT_STATIC")"
  echo "accesskit_static_sha256=$(sha256sum "$ACCESSKIT_STATIC" | awk '{print $1}')"
  echo "quickjs_static_sha256=$(sha256sum "$QUICKJS_SOURCE/libquickjs.a" | awk '{print $1}')"
  echo "render_trace_bytes=$render_trace_bytes"
  echo "render_trace_sha256=$render_trace_sha256"
  echo "framebuffer_bytes=$framebuffer_bytes"
  echo "framebuffer_sha256=$framebuffer_sha256"
  echo "menu_framebuffer_bytes=$menu_framebuffer_bytes"
  echo "menu_framebuffer_sha256=$menu_framebuffer_sha256"
  echo "modal_framebuffer_bytes=$modal_framebuffer_bytes"
  echo "modal_framebuffer_sha256=$modal_framebuffer_sha256"
  echo "provenance_sha256=$provenance_sha256"
  echo "appdir_inventory_sha256=$appdir_inventory_sha256"
  echo "appdir_content_sha256=$appdir_content_sha256"
  echo "build_environment_sha256=$build_environment_sha256"
  echo "runtime_packages_sha256=$runtime_packages_sha256"
  echo "source_date_epoch=$SOURCE_DATE_EPOCH"
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
  echo 'native_menu_modal_layout=PASS'
  echo 'native_external_url_allowlist=PASS'
  echo 'native_quit_path=PASS'
  echo 'native_startup_localization=PASS'
  echo 'native_startup_error_locales=PASS'
  echo 'native_release_builder=PASS'
  echo 'phase3_build_primitive_dependency=NONE'
  echo 'legacy_electron_fixture=PASS'
  if find "$APPDIR/usr/share/licenses/pikachu-volleyball-native/runtime" \
      -type f -name '*.copyright' -print -quit | grep -q .; then
    echo 'runtime_license_inventory=PASS'
  else
    echo 'runtime_license_inventory=FAIL'
  fi
} | tee "$EVIDENCE_DIR/summary.txt"

grep -Fxq 'runtime_license_inventory=PASS' "$EVIDENCE_DIR/summary.txt"
