#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output="${1:-$root/.neutralino-spike/bin/neutralino-linux_x64}"
patch_file="$root/desktop/neutralino-spike/patches/neutralino-6.9.0-host-navigation.patch"
metadata_file="$root/.neutralino-spike/neutralino-host-navigation-runtime.json"
upstream_sha="2cec764ac5e3ccc5b1b44d046d6e6d6c85c3099e"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

for tool in git cmake ninja sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing build dependency: $tool" >&2
    exit 1
  fi
done
if [[ ! -f "$patch_file" ]]; then
  echo "Missing Neutralino host-navigation patch: $patch_file" >&2
  exit 1
fi

cd "$workdir"
git init -q
git remote add origin https://github.com/neutralinojs/neutralinojs.git
git fetch --depth=1 origin "$upstream_sha"
git checkout -q --detach FETCH_HEAD

if [[ "$(git rev-parse HEAD)" != "$upstream_sha" ]]; then
  echo "Neutralino source commit did not match the pinned v6.9.0 commit." >&2
  exit 1
fi

git apply --check "$patch_file"
git apply "$patch_file"

cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel

built_binary="$workdir/bin/neutralino-linux_x64"
if [[ ! -x "$built_binary" ]]; then
  echo "Patched Neutralino Linux x64 runtime was not produced." >&2
  exit 1
fi

mkdir -p "$(dirname "$output")" "$(dirname "$metadata_file")"
install -m 755 "$built_binary" "$output"

patch_sha="$(sha256sum "$patch_file" | awk '{print $1}')"
binary_sha="$(sha256sum "$output" | awk '{print $1}')"
binary_bytes="$(stat -c%s "$output")"
cat > "$metadata_file" <<EOF
{
  "frameworkVersion": "6.9.0",
  "upstreamCommit": "$upstream_sha",
  "patchSha256": "$patch_sha",
  "binarySha256": "$binary_sha",
  "binaryBytes": $binary_bytes,
  "scope": "linux-webkitgtk-host-navigation"
}
EOF

printf 'Built patched Neutralino runtime from %s: %s (%s bytes)\n' \
  "$upstream_sha" "$output" "$binary_bytes"
