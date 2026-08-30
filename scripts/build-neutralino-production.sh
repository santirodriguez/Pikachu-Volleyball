#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

builder_image="ubuntu:focal-20250404@sha256:c664f8f86ed5a386b0a340d981b8f81714e21a8b9c73f658c4bea56aa179d54a"
builder_platform="linux/amd64"
apt_snapshot="20250404T000000Z"

npm run build:web
node scripts/prepare-neutralino-production.cjs

diagnostic_dir=".neutralino-production/diagnostics"
diagnostic_log="$diagnostic_dir/production-build.log"
mkdir -p "$diagnostic_dir"
: > "$diagnostic_log"
exec > >(tee -a "$diagnostic_log") 2>&1
printf 'PV_NEUTRALINO_PRODUCTION_BUILD_HEAD=%s\n' "${PV_SOURCE_SHA:-${GITHUB_SHA:-unknown}}"
printf 'PV_NEUTRALINO_BUILDER_IMAGE=%s\n' "$builder_image"
printf 'PV_NEUTRALINO_BUILDER_PLATFORM=%s\n' "$builder_platform"
printf 'PV_NEUTRALINO_APT_SNAPSHOT=%s\n' "$apt_snapshot"

(
  cd .neutralino-production
  npx -y @neutralinojs/neu@11.7.2 update
)
set +e
{
  printf 'PV_HOST_NAV_BUILD_HEAD=%s\n' "${PV_SOURCE_SHA:-${GITHUB_SHA:-unknown}}"
  docker run --rm --platform "$builder_platform" \
    -e PV_NEUTRALINO_BUILDER_IMAGE="$builder_image" \
    -e PV_NEUTRALINO_BUILDER_PLATFORM="$builder_platform" \
    -e PV_NEUTRALINO_APT_SNAPSHOT="$apt_snapshot" \
    -v "$PWD:/workspace" -w /workspace "$builder_image" bash -lc '
      set -euxo pipefail
      export DEBIAN_FRONTEND=noninteractive
      sed -i "s/^deb /deb [snapshot=yes] /" /etc/apt/sources.list
      printf "APT::Snapshot \"%s\";\n" "$PV_NEUTRALINO_APT_SNAPSHOT" > /etc/apt/apt.conf.d/50snapshot
      apt-get update
      apt-get install -y -f ca-certificates git gcc g++ binutils pkg-config cmake ninja-build libgtk-3-dev libwebkit2gtk-4.0-dev

      export CC=gcc
      export CXX=g++
      /workspace/scripts/build-neutralino-external-link-extension.sh
      /workspace/scripts/build-neutralino-host-navigation-runtime.sh /workspace/.neutralino-production/bin/neutralino-linux_x64

      metadata=/workspace/.neutralino-production/build-toolchain.txt
      {
        printf "builder_image=%s\n" "$PV_NEUTRALINO_BUILDER_IMAGE"
        printf "builder_platform=%s\n" "$PV_NEUTRALINO_BUILDER_PLATFORM"
        printf "apt_snapshot=%s\n" "$PV_NEUTRALINO_APT_SNAPSHOT"
        printf "cc_path=%s\n" "$(readlink -f "$(command -v "$CC")")"
        printf "cc_version=%s\n" "$("$CC" -dumpfullversion -dumpversion)"
        printf "cxx_path=%s\n" "$(readlink -f "$(command -v "$CXX")")"
        printf "cxx_version=%s\n" "$("$CXX" -dumpfullversion -dumpversion)"
        for package in ca-certificates git gcc g++ binutils pkg-config cmake ninja-build libgtk-3-dev libwebkit2gtk-4.0-dev; do
          printf "package.%s=%s\n" "$package" "$(dpkg-query -W -f="\${Version}" "$package")"
        done
      } > "$metadata"
    '
  docker_status=$?
  if [[ "$docker_status" -ne 0 ]]; then exit "$docker_status"; fi
  sudo chown "$(id -u):$(id -g)" \
    .neutralino-production/bin/neutralino-linux_x64 \
    .neutralino-production/neutralino-host-navigation-runtime.json \
    .neutralino-production/extensions/pv-external-link-linux_x64 \
    .neutralino-production/build-toolchain.txt
} 2>&1
build_status=$?
set -e
printf 'PV_HOST_NAV_BUILD_EXIT_CODE=%s\n' "$build_status"
[[ "$build_status" -eq 0 ]] || exit "$build_status"
cat .neutralino-production/build-toolchain.txt
node scripts/validate-neutralino-external-link-extension.cjs
(
  cd .neutralino-production
  npx -y @neutralinojs/neu@11.7.2 build --embed-resources
)
node scripts/report-neutralino-production.cjs
artifact="pikachu-volleyball-neutralino-production-parity-linux-x64.tar.gz"
rm -f "$artifact" "$artifact.sha256"
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner -C neutralino-production-artifact -cf - pikachu-volleyball-neutralino-production-parity-linux-x64 | gzip -n > "$artifact"
sha256sum "$artifact" > "$artifact.sha256"
artifact_bytes="$(stat -c%s "$artifact")"
artifact_sha="$(awk '{print $1}' "$artifact.sha256")"
printf 'PV_NEUTRALINO_ARTIFACT file=%s bytes=%s sha256=%s\n' "$artifact" "$artifact_bytes" "$artifact_sha"
