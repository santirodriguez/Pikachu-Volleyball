#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output="${1:-$root/.neutralino-production/bin/neutralino-linux_x64}"
patch_file="$root/desktop/neutralino/patches/neutralino-6.9.0-host-navigation.patch"
metadata_file="$root/.neutralino-production/neutralino-host-navigation-runtime.json"
upstream_sha="2cec764ac5e3ccc5b1b44d046d6e6d6c85c3099e"
workdir="$(mktemp -d)"
current_stage="initialization"
trap 'rm -rf "$workdir"' EXIT
trap 'status=$?; printf "PV_HOST_NAV_BUILD_FAILURE stage=%q exit=%s command=%q\n" "$current_stage" "$status" "$BASH_COMMAND" >&2; exit "$status"' ERR
begin_stage() { current_stage="$1"; printf '\n::group::%s\n' "$current_stage"; }
end_stage() { printf '::endgroup::\n'; }
for tool in git cmake ninja sha256sum; do command -v "$tool" >/dev/null 2>&1 || { echo "Missing build dependency: $tool" >&2; exit 1; }; done
[[ -f "$patch_file" ]] || { echo "Missing Neutralino host-navigation patch: $patch_file" >&2; exit 1; }
begin_stage "Neutralino upstream clone/checkout"
cd "$workdir"
git init -q
git remote add origin https://github.com/neutralinojs/neutralinojs.git
git fetch --depth=1 origin "$upstream_sha"
git checkout -q --detach FETCH_HEAD
[[ "$(git rev-parse HEAD)" == "$upstream_sha" ]] || { echo "Neutralino source commit did not match the pinned v6.9.0 commit." >&2; exit 1; }
end_stage
begin_stage "Patch check/application"
git apply --check "$patch_file"
git apply "$patch_file"
end_stage
begin_stage "CMake configure"
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
end_stage
begin_stage "CMake build"
cmake --build build --parallel
end_stage
begin_stage "Runtime copy"
built_binary="$workdir/bin/neutralino-linux_x64"
[[ -x "$built_binary" ]] || { echo "Patched Neutralino Linux x64 runtime was not produced." >&2; exit 1; }
mkdir -p "$(dirname "$output")" "$(dirname "$metadata_file")"
install -m 755 "$built_binary" "$output"
end_stage
begin_stage "Final artifact verification"
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
printf 'Built patched Neutralino runtime from %s: %s (%s bytes)\n' "$upstream_sha" "$output" "$binary_bytes"
end_stage
