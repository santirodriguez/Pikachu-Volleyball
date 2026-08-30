#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
npm run build:web
node scripts/prepare-neutralino-production.cjs

diagnostic_dir=".neutralino-production/diagnostics"
diagnostic_log="$diagnostic_dir/production-build.log"
mkdir -p "$diagnostic_dir"
: > "$diagnostic_log"
exec > >(tee -a "$diagnostic_log") 2>&1
printf 'PV_NEUTRALINO_PRODUCTION_BUILD_HEAD=%s\n' "${GITHUB_SHA:-unknown}"

./scripts/build-neutralino-external-link-extension.sh
node scripts/validate-neutralino-external-link-extension.cjs
(
  cd .neutralino-production
  npx -y @neutralinojs/neu@11.7.2 update
)
set +e
{
  printf 'PV_HOST_NAV_BUILD_HEAD=%s\n' "${GITHUB_SHA:-unknown}"
  docker run --rm -v "$PWD:/workspace" -w /workspace ubuntu:20.04 bash -lc '
    set -euxo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y -f ca-certificates git g++ pkg-config cmake ninja-build libgtk-3-dev libwebkit2gtk-4.0-dev
    /workspace/scripts/build-neutralino-host-navigation-runtime.sh /workspace/.neutralino-production/bin/neutralino-linux_x64
  '
  docker_status=$?
  if [[ "$docker_status" -ne 0 ]]; then exit "$docker_status"; fi
  sudo chown "$(id -u):$(id -g)" .neutralino-production/bin/neutralino-linux_x64 .neutralino-production/neutralino-host-navigation-runtime.json
} 2>&1
build_status=$?
set -e
printf 'PV_HOST_NAV_BUILD_EXIT_CODE=%s\n' "$build_status"
[[ "$build_status" -eq 0 ]] || exit "$build_status"
(
  cd .neutralino-production
  npx -y @neutralinojs/neu@11.7.2 build --embed-resources
)
node scripts/report-neutralino-production.cjs
artifact="pikachu-volleyball-neutralino-production-parity-linux-x64.tar.gz"
rm -f "$artifact" "$artifact.sha256"
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner -C neutralino-production-artifact -cf - pikachu-volleyball-neutralino-production-parity-linux-x64 | gzip -n > "$artifact"
sha256sum "$artifact" > "$artifact.sha256"
printf 'Built Neutralino production-parity artifact: %s\n' "$artifact"
