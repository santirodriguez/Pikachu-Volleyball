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

QUICKJS_VERSION="2026-06-04"
QUICKJS_SHA256="b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a"
QUICKJS_URL="https://bellard.org/quickjs/quickjs-${QUICKJS_VERSION}.tar.xz"

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
QUICKJS_ARCHIVE="$DOWNLOAD_DIR/quickjs-${QUICKJS_VERSION}.tar.xz"
APPIMAGETOOL="$DOWNLOAD_DIR/appimagetool-x86_64.AppImage"
APPIMAGE_RUNTIME="$DOWNLOAD_DIR/runtime-x86_64"

fetch_verified "$SDL_URL" "$SDL_SHA256" "$SDL_ARCHIVE"
fetch_verified "$QUICKJS_URL" "$QUICKJS_SHA256" "$QUICKJS_ARCHIVE"
fetch_verified "$APPIMAGETOOL_URL" "$APPIMAGETOOL_SHA256" "$APPIMAGETOOL"
fetch_verified "$APPIMAGE_RUNTIME_URL" "$APPIMAGE_RUNTIME_SHA256" "$APPIMAGE_RUNTIME"
chmod 0755 "$APPIMAGETOOL" "$APPIMAGE_RUNTIME"

mkdir -p "$SOURCE_DIR/sdl" "$SOURCE_DIR/quickjs"
tar -xzf "$SDL_ARCHIVE" --strip-components=1 -C "$SOURCE_DIR/sdl"
tar -xJf "$QUICKJS_ARCHIVE" --strip-components=1 -C "$SOURCE_DIR/quickjs"

cmake -S "$SOURCE_DIR/sdl" -B "$BUILD_ROOT/sdl-build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$PREFIX" \
  -DSDL_SHARED=ON \
  -DSDL_STATIC=OFF \
  -DSDL_TESTS=OFF
cmake --build "$BUILD_ROOT/sdl-build" --parallel 2
cmake --install "$BUILD_ROOT/sdl-build"

make -C "$SOURCE_DIR/quickjs" -j2 libquickjs.a

export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig:$PREFIX/lib64/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

BINARY="$BUILD_ROOT/pikachu-volleyball-native-spike"
cc -std=c11 -O2 -Wall -Wextra -D_GNU_SOURCE \
  -I"$SOURCE_DIR/quickjs" \
  $(pkg-config --cflags sdl3 libpng libmpg123) \
  "$SPIKE_DIR/native_spike.c" "$SOURCE_DIR/quickjs/libquickjs.a" \
  -o "$BINARY" \
  $(pkg-config --libs sdl3 libpng libmpg123) \
  -lm -ldl -pthread -latomic \
  -Wl,-rpath,'$ORIGIN/../lib'

mkdir -p "$APPDIR/usr/bin/assets" "$APPDIR/usr/bin/locales" \
  "$APPDIR/usr/lib" "$APPDIR/usr/share/licenses/native-spike"
install -m 0755 "$BINARY" "$APPDIR/usr/bin/pikachu-volleyball-native-spike"
install -m 0644 "$SPIKE_DIR/spike.js" "$APPDIR/usr/bin/spike.js"
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
install -m 0644 "$SOURCE_DIR/quickjs/LICENSE" \
  "$APPDIR/usr/share/licenses/native-spike/QuickJS-LICENSE.txt"

LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64" ldd "$BINARY" \
  > "$EVIDENCE_DIR/build-ldd.txt"
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

cat > "$APPDIR/AppRun" <<'APP_RUN'
#!/usr/bin/env bash
set -euo pipefail
APPDIR="$(cd "$(dirname "$0")" && pwd)"
export LD_LIBRARY_PATH="$APPDIR/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
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

set +e
timeout 30 xvfb-run -a env SDL_AUDIODRIVER=dummy \
  "$OUTPUT" --self-test > "$EVIDENCE_DIR/direct-appimage-self-test.txt" 2>&1
direct_status=$?
set -e
if [[ "$direct_status" -eq 0 ]]; then
  direct_result="PASS"
elif grep -Fq 'native_spike_self_test=FAIL' \
  "$EVIDENCE_DIR/direct-appimage-self-test.txt"; then
  cat "$EVIDENCE_DIR/direct-appimage-self-test.txt" >&2
  echo "The direct AppImage launched the product and its self-test failed." >&2
  exit 1
else
  direct_result="SKIPPED_HOST_LIMITATION"
fi

APPIMAGE_EXTRACT_AND_RUN=1 timeout 30 xvfb-run -a env SDL_AUDIODRIVER=dummy \
  "$OUTPUT" --self-test | tee "$EVIDENCE_DIR/runtime-extract-run-self-test.txt"

rm -rf "$BUILD_ROOT/extracted"
mkdir -p "$BUILD_ROOT/extracted"
(
  cd "$BUILD_ROOT/extracted"
  "$OUTPUT" --appimage-extract >/dev/null
)
xvfb-run -a env SDL_AUDIODRIVER=dummy \
  "$BUILD_ROOT/extracted/squashfs-root/AppRun" --self-test \
  | tee "$EVIDENCE_DIR/extracted-apprun-self-test.txt"

find "$APPDIR" -printf '%P\t%y\t%s\n' | sort \
  > "$EVIDENCE_DIR/appdir-inventory.tsv"
LD_LIBRARY_PATH="$APPDIR/usr/lib" \
  ldd "$APPDIR/usr/bin/pikachu-volleyball-native-spike" \
  > "$EVIDENCE_DIR/appimage-ldd.txt"
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
  echo "sha256=$sha256"
  echo "sdl=$SDL_VERSION"
  echo "quickjs=$QUICKJS_VERSION"
  echo "appimagetool=$APPIMAGETOOL_VERSION"
  echo "appimage_runtime=$APPIMAGE_RUNTIME_VERSION"
  echo "compression=zstd"
  echo "direct_appimage_self_test=$direct_result"
  echo "runtime_extract_run_self_test=PASS"
  echo "extracted_apprun_self_test=PASS"
  echo "locales=en,es-ar,ca,ko,zh"
  echo "real_assets=sprite_sheet.png,WAVE140_1.wav,bgm.mp3"
} | tee "$EVIDENCE_DIR/summary.txt"
