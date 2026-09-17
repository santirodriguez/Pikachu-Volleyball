#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="${PV_PHASE5_A11Y_ROOT:-$ROOT/build/phase5/accessibility}"
DOWNLOAD_DIR="$BUILD_ROOT/downloads"
SOURCE_DIR="$BUILD_ROOT/sources"
PREFIX="$BUILD_ROOT/prefix"
EVIDENCE_DIR="$BUILD_ROOT/evidence"

SDL_VERSION="3.4.16"
SDL_SHA256="7322236cd12090c3eb40b9728be4d49c76f66ad17d04369584d4ecad5cf77c68"
SDL_URL="https://github.com/libsdl-org/SDL/releases/download/release-${SDL_VERSION}/SDL3-${SDL_VERSION}.tar.gz"
ACCESSKIT_VERSION="0.22.3"
ACCESSKIT_COMMIT="826d672661f9453c8b269ab3946dbcbae6300555"
ACCESSKIT_REPOSITORY="https://github.com/AccessKit/accesskit-c.git"

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
fetch_verified "$SDL_URL" "$SDL_SHA256" "$SDL_ARCHIVE"
mkdir -p "$SOURCE_DIR/sdl"
tar -xzf "$SDL_ARCHIVE" --strip-components=1 -C "$SOURCE_DIR/sdl"

cmake -S "$SOURCE_DIR/sdl" -B "$BUILD_ROOT/sdl-build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$PREFIX" \
  -DSDL_SHARED=ON \
  -DSDL_STATIC=OFF \
  -DSDL_TESTS=OFF
cmake --build "$BUILD_ROOT/sdl-build" --parallel 2
cmake --install "$BUILD_ROOT/sdl-build"

ACCESSKIT_SOURCE="$SOURCE_DIR/accesskit-c"
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

cmake -S "$ACCESSKIT_SOURCE" -B "$BUILD_ROOT/accesskit-build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DRust_CARGO_TARGET=x86_64-unknown-linux-gnu \
  -DACCESSKIT_BUILD_HEADERS=OFF \
  -DACCESSKIT_BUILD_LIBRARIES=ON
cmake --build "$BUILD_ROOT/accesskit-build" --parallel 2
cmake --install "$BUILD_ROOT/accesskit-build"

ACCESSKIT_STATIC="$ACCESSKIT_SOURCE/lib/linux/x86_64/static/libaccesskit.a"
if [[ ! -s "$ACCESSKIT_STATIC" ]]; then
  echo "AccessKit static library was not produced at $ACCESSKIT_STATIC" >&2
  exit 1
fi

cmake -S "$ROOT/desktop/native/accessibility-probe" \
  -B "$BUILD_ROOT/probe-build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_PREFIX_PATH="$PREFIX" \
  -DACCESSKIT_ROOT="$ACCESSKIT_SOURCE"
cmake --build "$BUILD_ROOT/probe-build" --parallel 2

BINARY="$BUILD_ROOT/probe-build/pikachu-volleyball-accessibility-probe"
if [[ ! -x "$BINARY" ]]; then
  echo "Accessibility probe binary is missing: $BINARY" >&2
  exit 1
fi

binary_bytes="$(stat -c%s "$BINARY")"
binary_sha256="$(sha256sum "$BINARY" | awk '{print $1}')"
accesskit_bytes="$(stat -c%s "$ACCESSKIT_STATIC")"
accesskit_sha256="$(sha256sum "$ACCESSKIT_STATIC" | awk '{print $1}')"

ldd "$BINARY" | tee "$EVIDENCE_DIR/ldd.txt"
if grep -q 'not found' "$EVIDENCE_DIR/ldd.txt"; then
  echo 'Accessibility probe has unresolved dynamic libraries.' >&2
  exit 1
fi

{
  echo "sdl_version=$SDL_VERSION"
  echo "sdl_archive_sha256=$SDL_SHA256"
  echo "accesskit_version=$ACCESSKIT_VERSION"
  echo "accesskit_commit=$actual_accesskit_commit"
  echo "rustc_version=$(rustc --version)"
  echo "cargo_version=$(cargo --version)"
  echo "accesskit_static_bytes=$accesskit_bytes"
  echo "accesskit_static_sha256=$accesskit_sha256"
  echo "probe_binary_bytes=$binary_bytes"
  echo "probe_binary_sha256=$binary_sha256"
} | tee "$EVIDENCE_DIR/build-summary.txt"
