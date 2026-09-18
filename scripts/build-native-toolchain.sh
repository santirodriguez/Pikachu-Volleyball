#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="${PV_NATIVE_TOOLCHAIN_ROOT:-$ROOT/build/native-toolchain}"
DOWNLOAD_DIR="$BUILD_ROOT/downloads"
SOURCE_DIR="$BUILD_ROOT/sources"
PREFIX="$BUILD_ROOT/prefix"
EVIDENCE_DIR="$BUILD_ROOT/evidence"
SOURCE_HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"
SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git -C "$ROOT" show -s --format=%ct "$SOURCE_HEAD_SHA")}"
export SOURCE_DATE_EPOCH

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

rm -rf "$BUILD_ROOT"
mkdir -p "$DOWNLOAD_DIR" "$SOURCE_DIR" "$PREFIX" "$EVIDENCE_DIR"

fetch_verified() {
  local url="$1"
  local sha256="$2"
  local output="$3"
  curl --fail --location --retry 3 --retry-all-errors --silent --show-error     "$url" --output "$output"
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

cmake -S "$SOURCE_DIR/sdl" -B "$BUILD_ROOT/sdl-build" -G Ninja   -DCMAKE_BUILD_TYPE=Release   -DCMAKE_INSTALL_PREFIX="$PREFIX"   -DSDL_SHARED=ON   -DSDL_STATIC=OFF   -DSDL_TESTS=OFF
cmake --build "$BUILD_ROOT/sdl-build" --parallel 2
cmake --install "$BUILD_ROOT/sdl-build"

export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig:$PREFIX/lib64/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

cmake -S "$SOURCE_DIR/sdl-ttf" -B "$BUILD_ROOT/sdl-ttf-build" -G Ninja   -DCMAKE_BUILD_TYPE=Release   -DCMAKE_INSTALL_PREFIX="$PREFIX"   -DCMAKE_PREFIX_PATH="$PREFIX"   -DBUILD_SHARED_LIBS=ON   -DSDLTTF_INSTALL=ON   -DSDLTTF_SAMPLES=OFF   -DSDLTTF_VENDORED=OFF   -DSDLTTF_HARFBUZZ=ON   -DSDLTTF_PLUTOSVG=OFF   -DSDLTTF_STRICT=ON
cmake --build "$BUILD_ROOT/sdl-ttf-build" --parallel 2
cmake --install "$BUILD_ROOT/sdl-ttf-build"

make -C "$SOURCE_DIR/quickjs" -j2 libquickjs.a

{
  echo 'native_toolchain=PASS'
  echo "source_head_sha=$SOURCE_HEAD_SHA"
  echo "source_date_epoch=$SOURCE_DATE_EPOCH"
  echo "sdl=$SDL_VERSION"
  echo "sdl_sha256=$SDL_SHA256"
  echo "sdl_ttf=$SDL_TTF_VERSION"
  echo "sdl_ttf_sha256=$SDL_TTF_SHA256"
  echo "quickjs=$QUICKJS_VERSION"
  echo "quickjs_sha256=$QUICKJS_SHA256"
  echo "unifont=$UNIFONT_VERSION"
  echo "unifont_sha256=$UNIFONT_SHA256"
  echo "appimagetool=$APPIMAGETOOL_VERSION"
  echo "appimagetool_sha256=$APPIMAGETOOL_SHA256"
  echo "appimage_runtime=$APPIMAGE_RUNTIME_VERSION"
  echo "appimage_runtime_sha256=$APPIMAGE_RUNTIME_SHA256"
} | tee "$EVIDENCE_DIR/summary.txt"
