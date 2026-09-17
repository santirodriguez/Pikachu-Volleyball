#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SPIKE_DIR="$ROOT/desktop/native-spike"
BUILD_ROOT="${PV_NATIVE_BUILD_ROOT:-$ROOT/build/native-spike}"
DOWNLOAD_DIR="$BUILD_ROOT/downloads"
SOURCE_DIR="$BUILD_ROOT/sources"
PREFIX="$BUILD_ROOT/prefix"
APPDIR="$BUILD_ROOT/PikachuVolleyballNativeSpike.AppDir"
EVIDENCE_DIR="$BUILD_ROOT/evidence"
OUTPUT="$BUILD_ROOT/Pikachu-Volleyball-Native-Spike-x86_64.AppImage"

SDL_VERSION="3.4.16"
SDL_SHA256="7322236cd12090c3eb40b9728be4d49c76f66ad17d04369584d4ecad5cf77c68"
SDL_URL="https://github.com/libsdl-org/SDL/releases/download/release-${SDL_VERSION}/SDL3-${SDL_VERSION}.tar.gz"

SDL_TTF_VERSION="3.2.2"
SDL_TTF_SHA256="63547d58d0185c833213885b635a2c0548201cc8f301e6587c0be1a67e1e045d"
SDL_TTF_URL="https://github.com/libsdl-org/SDL_ttf/releases/download/release-${SDL_TTF_VERSION}/SDL3_ttf-${SDL_TTF_VERSION}.tar.gz"

QUICKJS_VERSION="2026-06-04"
QUICKJS_SHA256="b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a"
QUICKJS_URL="https://bellard.org/quickjs/quickjs-${QUICKJS_VERSION}.tar.xz"

UNIFONT_VERSION="17.0.04"
UNIFONT_SHA256="d1f664a9753b9c6b7ff357128749e32b5d3eee90c7c03618363fabd43a39b5b7"
UNIFONT_URL="https://ftp.gnu.org/gnu/unifont/unifont-${UNIFONT_VERSION}/unifont-${UNIFONT_VERSION}.otf"

APPIMAGETOOL_VERSION="1.9.1"
APPIMAGETOOL_SHA256="ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0"
APPIMAGETOOL_URL="https://github.com/AppImage/appimagetool/releases/download/${APPIMAGETOOL_VERSION}/appimagetool-x86_64.AppImage"

APPIMAGE_RUNTIME_VERSION="20251108"
APPIMAGE_RUNTIME_SHA256="2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d"
APPIMAGE_RUNTIME_URL="https://github.com/AppImage/type2-runtime/releases/download/${APPIMAGE_RUNTIME_VERSION}/runtime-x86_64"

MAX_APPIMAGE_BYTES=$((30 * 1024 * 1024))

rm -rf "$BUILD_ROOT"
mkdir -p "$DOWNLOAD_DIR" "$SOURCE_DIR" "$PREFIX" "$EVIDENCE_DIR"

fetch_verified() {
  local url="$1"
  local sha256="$2"
  local output="$3"
  curl --fail --location --retry 3 --retry-all-errors --silent --show-error \
    "$url" --output "$output"
  printf '%s  %s\n' "$sha256" "$output" | sha256sum --check --status || {
    echo "Checksum mismatch for $url" >&2
    exit 1
  }
}

SDL_ARCHIVE="$DOWNLOAD_DIR/SDL3-${SDL_VERSION}.tar.gz"
SDL_TTF_ARCHIVE="$DOWNLOAD_DIR/SDL3_ttf-${SDL_TTF_VERSION}.tar.gz"
QUICKJS_ARCHIVE="$DOWNLOAD_DIR/quickjs-${QUICKJS_VERSION}.tar.xz"
UNIFONT_FILE="$DOWNLOAD_DIR/unifont-${UNIFONT_VERSION}.otf"
APPIMAGETOOL="$DOWNLOAD_DIR/appimagetool-x86_64.AppImage"
APPIMAGE_RUNTIME="$DOWNLOAD_DIR/runtime-x86_64"

fetch_verified "$SDL_URL" "$SDL_SHA256" "$SDL_ARCHIVE"
fetch_verified "$SDL_TTF_URL" "$SDL_TTF_SHA256" "$SDL_TTF_ARCHIVE"
fetch_verified "$QUICKJS_URL" "$QUICKJS_SHA256" "$QUICKJS_ARCHIVE"
fetch_verified "$UNIFONT_URL" "$UNIFONT_SHA256" "$UNIFONT_FILE"
fetch_verified "$APPIMAGETOOL_URL" "$APPIMAGETOOL_SHA256" "$APPIMAGETOOL"
fetch_verified "$APPIMAGE_RUNTIME_URL" "$APPIMAGE_RUNTIME_SHA256" "$APPIMAGE_RUNTIME"
chmod 0755 "$APPIMAGETOOL" "$APPIMAGE_RUNTIME"

mkdir -p "$SOURCE_DIR/sdl" "$SOURCE_DIR/sdl-ttf" "$SOURCE_DIR/quickjs"
tar -xzf "$SDL_ARCHIVE" --strip-components=1 -C "$SOURCE_DIR/sdl"
tar -xzf "$SDL_TTF_ARCHIVE" --strip-components=1 -C "$SOURCE_DIR/sdl-ttf"
tar -xJf "$QUICKJS_ARCHIVE" --strip-components=1 -C "$SOURCE_DIR/quickjs"

cmake -S "$SOURCE_DIR/sdl" -B "$BUILD_ROOT/sdl-build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$PREFIX" \
  -DSDL_SHARED=ON \
  -DSDL_STATIC=OFF \
  -DSDL_TESTS=OFF
cmake --build "$BUILD_ROOT/sdl-build" --parallel 2
cmake --install "$BUILD_ROOT/sdl-build"

export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig:$PREFIX/lib64/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

cmake -S "$SOURCE_DIR/sdl-ttf" -B "$BUILD_ROOT/sdl-ttf-build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$PREFIX" \
  -DCMAKE_PREFIX_PATH="$PREFIX" \
  -DBUILD_SHARED_LIBS=ON \
  -DSDLTTF_INSTALL=ON \
  -DSDLTTF_SAMPLES=OFF \
  -DSDLTTF_VENDORED=OFF \
  -DSDLTTF_HARFBUZZ=ON \
  -DSDLTTF_PLUTOSVG=OFF \
  -DSDLTTF_STRICT=ON
cmake --build "$BUILD_ROOT/sdl-ttf-build" --parallel 2
cmake --install "$BUILD_ROOT/sdl-ttf-build"

make -C "$SOURCE_DIR/quickjs" -j2 libquickjs.a

BINARY="$BUILD_ROOT/pikachu-volleyball-native-spike"
UNICODE_BINARY="$BUILD_ROOT/pikachu-volleyball-native-unicode-probe"
cc -std=c11 -O2 -Wall -Wextra -D_GNU_SOURCE \
  -I"$SOURCE_DIR/quickjs" \
  $(pkg-config --cflags sdl3 libpng libmpg123) \
  "$SPIKE_DIR/native_spike.c" "$SOURCE_DIR/quickjs/libquickjs.a" \
  -o "$BINARY" \
  $(pkg-config --libs sdl3 libpng libmpg123) \
  -lm -ldl -pthread -latomic \
  -Wl,-rpath,'$ORIGIN/../lib'

cc -std=c11 -O2 -Wall -Wextra -D_GNU_SOURCE \
  -I"$SOURCE_DIR/quickjs" \
  $(pkg-config --cflags sdl3-ttf) \
  "$SPIKE_DIR/unicode_probe.c" "$SOURCE_DIR/quickjs/libquickjs.a" \
  -o "$UNICODE_BINARY" \
  $(pkg-config --libs sdl3-ttf) \
  -lm -ldl -pthread -latomic \
  -Wl,-rpath,'$ORIGIN/../lib'

mkdir -p "$APPDIR/usr/bin/assets" "$APPDIR/usr/bin/locales" \
  "$APPDIR/usr/bin/fonts" "$APPDIR/usr/lib" \
  "$APPDIR/usr/share/licenses/native-spike"
install -m 0755 "$BINARY" "$APPDIR/usr/bin/pikachu-volleyball-native-spike"
install -m 0755 "$UNICODE_BINARY" \
  "$APPDIR/usr/bin/pikachu-volleyball-native-unicode-probe"
install -m 0644 "$SPIKE_DIR/spike.js" "$APPDIR/usr/bin/spike.js"
install -m 0644 "$ROOT/src/resources/js/integrated_menu_strings.js" \
  "$APPDIR/usr/bin/integrated_menu_strings.js"
install -m 0644 "$UNIFONT_FILE" \
  "$APPDIR/usr/bin/fonts/unifont-${UNIFONT_VERSION}.otf"
install -m 0644 "$ROOT/src/resources/assets/images/sprite_sheet.png" \
  "$APPDIR/usr/bin/assets/sprite_sheet.png"
install -m 0644 "$ROOT/src/resources/assets/images/sprite_sheet.json" \
  "$APPDIR/usr/bin/assets/sprite_sheet.json"
install -m 0644 "$ROOT/src/resources/assets/sounds/WAVE140_1.wav" \
  "$APPDIR/usr/bin/assets/WAVE140_1.wav"
install -m 0644 "$ROOT/src/resources/assets/sounds/bgm.mp3" \
  "$APPDIR/usr/bin/assets/bgm.mp3"

for locale in en es-ar ca ko zh; do
  mkdir -p "$APPDIR/usr/bin/locales/$locale"
  install -m 0644 "$ROOT/src/$locale/index.html" \
    "$APPDIR/usr/bin/locales/$locale/index.html"
done

install -m 0644 "$SOURCE_DIR/sdl/LICENSE.txt" \
  "$APPDIR/usr/share/licenses/native-spike/SDL3-LICENSE.txt"
install -m 0644 "$SOURCE_DIR/sdl-ttf/LICENSE.txt" \
  "$APPDIR/usr/share/licenses/native-spike/SDL3_ttf-LICENSE.txt"
install -m 0644 "$SOURCE_DIR/quickjs/LICENSE" \
  "$APPDIR/usr/share/licenses/native-spike/QuickJS-LICENSE.txt"
cat > "$APPDIR/usr/share/licenses/native-spike/Unifont-NOTICE.txt" <<EOF
GNU Unifont ${UNIFONT_VERSION}
Source: ${UNIFONT_URL}
The compiled font is dual-licensed under the SIL Open Font License 1.1 and
GNU GPL version 2 or later with the GNU Font Embedding Exception.
License information is embedded in the font and published at:
https://unifoundry.com/LICENSE.txt
https://unifoundry.com/OFL-1.1.txt
EOF

: > "$EVIDENCE_DIR/build-ldd.txt"
for executable in "$BINARY" "$UNICODE_BINARY"; do
  echo "# $(basename "$executable")" >> "$EVIDENCE_DIR/build-ldd.txt"
  LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64" ldd "$executable" \
    >> "$EVIDENCE_DIR/build-ldd.txt"
done
mapfile -t linked_libraries < <(
  awk '/=> \/[^ ]+/ {print $3} /^\/[[:graph:]]+/ {print $1}' \
    "$EVIDENCE_DIR/build-ldd.txt" | sort -u
)
for library in "${linked_libraries[@]}"; do
  name="$(basename "$library")"
  case "$name" in
    libc.so.*|libm.so.*|libdl.so.*|libpthread.so.*|librt.so.*|libgcc_s.so.*|ld-linux-*.so.*)
      continue
      ;;
  esac
  install -m 0644 -T "$(readlink -f "$library")" "$APPDIR/usr/lib/$name"
done

patchelf --set-rpath '$ORIGIN/../lib' "$APPDIR/usr/bin/pikachu-volleyball-native-spike"
patchelf --set-rpath '$ORIGIN/../lib' \
  "$APPDIR/usr/bin/pikachu-volleyball-native-unicode-probe"

cat > "$APPDIR/AppRun" <<'APP_RUN'
#!/usr/bin/env bash
set -euo pipefail
APPDIR="$(cd "$(dirname "$0")" && pwd)"
export LD_LIBRARY_PATH="$APPDIR/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
if [[ "${1:-}" == "--unicode-self-test" ]]; then
  shift
  exec "$APPDIR/usr/bin/pikachu-volleyball-native-unicode-probe" "$@"
fi
exec "$APPDIR/usr/bin/pikachu-volleyball-native-spike" "$@"
APP_RUN
chmod 0755 "$APPDIR/AppRun"

cat > "$APPDIR/pikachu-volleyball-native-spike.desktop" <<'DESKTOP_ENTRY'
[Desktop Entry]
Type=Application
Name=Pikachu Volleyball Native Spike
Exec=pikachu-volleyball-native-spike
Icon=pikachu-volleyball-native-spike
Categories=Game;
Terminal=false
DESKTOP_ENTRY
install -m 0644 "$ROOT/src/resources/assets/images/IDI_PIKAICON-1_gap_filled_192.png" \
  "$APPDIR/pikachu-volleyball-native-spike.png"

xvfb-run -a env SDL_AUDIODRIVER=dummy \
  "$APPDIR/AppRun" --self-test | tee "$EVIDENCE_DIR/prepackage-self-test.txt"
"$APPDIR/AppRun" --unicode-self-test \
  | tee "$EVIDENCE_DIR/prepackage-unicode-self-test.txt"

ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGETOOL" \
  --runtime-file "$APPIMAGE_RUNTIME" \
  --comp zstd \
  --no-appstream \
  "$APPDIR" "$OUTPUT"
chmod 0755 "$OUTPUT"

bytes="$(stat -c%s "$OUTPUT")"
mib="$(awk -v bytes="$bytes" 'BEGIN { printf "%.2f", bytes / 1048576 }')"
sha256="$(sha256sum "$OUTPUT" | awk '{print $1}')"
printf '%s  %s\n' "$sha256" "$(basename "$OUTPUT")" > "$BUILD_ROOT/SHA256SUMS.txt"

if (( bytes > MAX_APPIMAGE_BYTES )); then
  printf 'size_gate=FAIL\nbytes=%s\nmib=%s\nlimit_bytes=%s\n' \
    "$bytes" "$mib" "$MAX_APPIMAGE_BYTES" | tee "$EVIDENCE_DIR/summary.txt"
  echo "Native spike AppImage exceeds the 30 MiB feasibility gate." >&2
  exit 1
fi

is_known_appimage_host_limit() {
  local log_file="$1"
  grep -Eiq \
    'dlopen\(\): error loading libfuse|AppImages require FUSE|Cannot mount AppImage|failed to open /dev/fuse|fusermount.*failed|FUSE setup failed' \
    "$log_file"
}

run_direct_appimage_test() {
  local label="$1"
  shift
  local log_file="$EVIDENCE_DIR/direct-${label}.txt"
  set +e
  timeout 30 xvfb-run -a env SDL_AUDIODRIVER=dummy \
    "$OUTPUT" "$@" > "$log_file" 2>&1
  local status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    printf 'PASS'
    return 0
  fi
  if is_known_appimage_host_limit "$log_file"; then
    printf 'SKIPPED_HOST_LIMITATION'
    return 0
  fi
  cat "$log_file" >&2
  echo "Direct AppImage test '$label' failed with status $status." >&2
  return 1
}

main_direct_result="$(run_direct_appimage_test app-self-test --self-test)"
unicode_direct_result="$(run_direct_appimage_test unicode-self-test --unicode-self-test)"

APPIMAGE_EXTRACT_AND_RUN=1 timeout 30 xvfb-run -a env SDL_AUDIODRIVER=dummy \
  "$OUTPUT" --self-test | tee "$EVIDENCE_DIR/runtime-extract-run-self-test.txt"
APPIMAGE_EXTRACT_AND_RUN=1 timeout 30 \
  "$OUTPUT" --unicode-self-test \
  | tee "$EVIDENCE_DIR/runtime-extract-run-unicode-self-test.txt"

rm -rf "$BUILD_ROOT/extracted"
mkdir -p "$BUILD_ROOT/extracted"
(
  cd "$BUILD_ROOT/extracted"
  "$OUTPUT" --appimage-extract >/dev/null
)
xvfb-run -a env SDL_AUDIODRIVER=dummy \
  "$BUILD_ROOT/extracted/squashfs-root/AppRun" --self-test \
  | tee "$EVIDENCE_DIR/extracted-apprun-self-test.txt"
"$BUILD_ROOT/extracted/squashfs-root/AppRun" --unicode-self-test \
  | tee "$EVIDENCE_DIR/extracted-apprun-unicode-self-test.txt"

find "$APPDIR" -printf '%P\t%y\t%s\n' | sort \
  > "$EVIDENCE_DIR/appdir-inventory.tsv"
: > "$EVIDENCE_DIR/appimage-ldd.txt"
for executable in \
  "$APPDIR/usr/bin/pikachu-volleyball-native-spike" \
  "$APPDIR/usr/bin/pikachu-volleyball-native-unicode-probe"; do
  echo "# $(basename "$executable")" >> "$EVIDENCE_DIR/appimage-ldd.txt"
  LD_LIBRARY_PATH="$APPDIR/usr/lib" ldd "$executable" \
    >> "$EVIDENCE_DIR/appimage-ldd.txt"
done
if grep -Fq 'not found' "$EVIDENCE_DIR/appimage-ldd.txt"; then
  cat "$EVIDENCE_DIR/appimage-ldd.txt" >&2
  echo "Bundled native runtime has unresolved linked libraries." >&2
  exit 1
fi

{
  echo "size_gate=PASS"
  echo "bytes=$bytes"
  echo "mib=$mib"
  echo "limit_bytes=$MAX_APPIMAGE_BYTES"
  echo "headroom_bytes=$((MAX_APPIMAGE_BYTES - bytes))"
  echo "sha256=$sha256"
  echo "sdl=$SDL_VERSION"
  echo "sdl_ttf=$SDL_TTF_VERSION"
  echo "quickjs=$QUICKJS_VERSION"
  echo "unifont=$UNIFONT_VERSION"
  echo "appimagetool=$APPIMAGETOOL_VERSION"
  echo "appimage_runtime=$APPIMAGE_RUNTIME_VERSION"
  echo "compression=zstd"
  echo "direct_appimage_self_test=$main_direct_result"
  echo "direct_unicode_self_test=$unicode_direct_result"
  echo "runtime_extract_run_self_test=PASS"
  echo "runtime_extract_run_unicode_self_test=PASS"
  echo "extracted_apprun_self_test=PASS"
  echo "extracted_apprun_unicode_self_test=PASS"
  echo "unicode_render=en,es-ar,ca,ko,zh"
  echo "locale_source=integrated_menu_strings.js"
  echo "real_assets=sprite_sheet.png,WAVE140_1.wav,bgm.mp3"
} | tee "$EVIDENCE_DIR/summary.txt"
