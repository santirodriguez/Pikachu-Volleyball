#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE_BUNDLE="${PV_CORE_BUNDLE:-$ROOT/build/phase4/core-parity.bundle.js}"
PHASE4_ROOT="${PV_PHASE4_NATIVE_ROOT:-$ROOT/build/phase4/native-core}"
BASE_BUILD="$ROOT/build/native-spike"
BASE_APPIMAGE="$BASE_BUILD/Pikachu-Volleyball-Native-Spike-x86_64.AppImage"
APPIMAGETOOL="$BASE_BUILD/downloads/appimagetool-x86_64.AppImage"
APPIMAGE_RUNTIME="$BASE_BUILD/downloads/runtime-x86_64"
OUTPUT="$PHASE4_ROOT/Pikachu-Volleyball-Native-Core-x86_64.AppImage"
EVIDENCE_DIR="$PHASE4_ROOT/evidence"
MAX_APPIMAGE_BYTES=$((30 * 1024 * 1024))

if [[ ! -s "$CORE_BUNDLE" ]]; then
  echo "Shared-core bundle is missing or empty: $CORE_BUNDLE" >&2
  exit 1
fi

bash "$ROOT/desktop/native-spike/build-appimage.sh"

for required in "$BASE_APPIMAGE" "$APPIMAGETOOL" "$APPIMAGE_RUNTIME"; do
  if [[ ! -s "$required" ]]; then
    echo "Phase 3 builder did not produce required input: $required" >&2
    exit 1
  fi
done

rm -rf "$PHASE4_ROOT"
mkdir -p "$PHASE4_ROOT/extract" "$EVIDENCE_DIR"

core_bundle_bytes="$(stat -c%s "$CORE_BUNDLE")"
core_bundle_sha256="$(sha256sum "$CORE_BUNDLE" | awk '{print $1}')"
base_bytes="$(stat -c%s "$BASE_APPIMAGE")"
base_sha256="$(sha256sum "$BASE_APPIMAGE" | awk '{print $1}')"

(
  cd "$PHASE4_ROOT/extract"
  "$BASE_APPIMAGE" --appimage-extract >/dev/null
)
APPDIR="$PHASE4_ROOT/extract/squashfs-root"
install -m 0644 "$CORE_BUNDLE" "$APPDIR/usr/bin/core-parity.bundle.js"

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

if (( bytes > MAX_APPIMAGE_BYTES )); then
  {
    echo 'size_gate=FAIL'
    echo "bytes=$bytes"
    echo "mib=$mib"
    echo "limit_bytes=$MAX_APPIMAGE_BYTES"
    echo "core_bundle_bytes=$core_bundle_bytes"
    echo "core_bundle_sha256=$core_bundle_sha256"
  } | tee "$EVIDENCE_DIR/summary.txt"
  echo "Shared-core AppImage exceeds the 30 MiB architecture budget." >&2
  exit 1
fi

rm -rf "$PHASE4_ROOT/verify"
mkdir -p "$PHASE4_ROOT/verify"
(
  cd "$PHASE4_ROOT/verify"
  "$OUTPUT" --appimage-extract >/dev/null
)
packaged_bundle="$PHASE4_ROOT/verify/squashfs-root/usr/bin/core-parity.bundle.js"
if [[ ! -s "$packaged_bundle" ]]; then
  echo 'Shared-core bundle is missing from the repacked AppImage.' >&2
  exit 1
fi
packaged_bundle_sha256="$(sha256sum "$packaged_bundle" | awk '{print $1}')"
if [[ "$packaged_bundle_sha256" != "$core_bundle_sha256" ]]; then
  echo 'Shared-core bundle changed while packaging.' >&2
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
  "$OUTPUT" --self-test \
  | tee "$EVIDENCE_DIR/runtime-extract-run-self-test.txt"
APPIMAGE_EXTRACT_AND_RUN=1 timeout 30 \
  "$OUTPUT" --unicode-self-test \
  | tee "$EVIDENCE_DIR/runtime-extract-run-unicode-self-test.txt"

"$PHASE4_ROOT/verify/squashfs-root/AppRun" --unicode-self-test \
  | tee "$EVIDENCE_DIR/extracted-apprun-unicode-self-test.txt"
xvfb-run -a env SDL_AUDIODRIVER=dummy \
  "$PHASE4_ROOT/verify/squashfs-root/AppRun" --self-test \
  | tee "$EVIDENCE_DIR/extracted-apprun-self-test.txt"

printf '%s  %s\n' "$sha256" "$(basename "$OUTPUT")" \
  > "$PHASE4_ROOT/SHA256SUMS.txt"

{
  echo 'size_gate=PASS'
  echo "bytes=$bytes"
  echo "mib=$mib"
  echo "limit_bytes=$MAX_APPIMAGE_BYTES"
  echo "headroom_bytes=$headroom_bytes"
  echo "sha256=$sha256"
  echo "base_appimage_bytes=$base_bytes"
  echo "base_appimage_sha256=$base_sha256"
  echo "core_bundle_bytes=$core_bundle_bytes"
  echo "core_bundle_sha256=$core_bundle_sha256"
  echo "packaged_core_bundle_sha256=$packaged_bundle_sha256"
  echo "direct_appimage_self_test=$main_direct_result"
  echo "direct_unicode_self_test=$unicode_direct_result"
  echo 'runtime_extract_run_self_test=PASS'
  echo 'runtime_extract_run_unicode_self_test=PASS'
  echo 'extracted_apprun_self_test=PASS'
  echo 'extracted_apprun_unicode_self_test=PASS'
} | tee "$EVIDENCE_DIR/summary.txt"
