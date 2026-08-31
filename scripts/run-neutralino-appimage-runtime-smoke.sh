#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stage="${1:?usage: run-neutralino-appimage-runtime-smoke.sh <validation-stage> <candidate.AppImage> <result-dir> [extract|direct]}"
candidate="${2:?missing AppImage candidate}"
result_dir="${3:?missing result directory}"
launch_mode="${4:-extract}"
stage="$(readlink -f "$stage")"
candidate="$(readlink -f "$candidate")"
mkdir -p "$result_dir"
result_dir="$(readlink -f "$result_dir")"

case "$launch_mode" in
  extract)
    identity_mode="appimage-extract-and-run"
    ;;
  direct)
    identity_mode="appimage-direct-fuse"
    ;;
  *)
    echo "Unsupported AppImage launch mode: $launch_mode" >&2
    exit 2
    ;;
esac

[[ -d "$stage" ]] || { echo "Missing validation stage: $stage" >&2; exit 1; }
[[ -f "$stage/bin/neutralino-linux_x64" ]] || { echo "Missing validation Neutralino binary" >&2; exit 1; }
[[ -x "$stage/extensions/pv-external-link-linux_x64" ]] || { echo "Missing validation external-link helper" >&2; exit 1; }
[[ -f "$candidate" ]] || { echo "Missing AppImage candidate: $candidate" >&2; exit 1; }
if [[ ! -x "$candidate" ]]; then
  chmod 0755 "$candidate"
fi
[[ -x "$candidate" ]] || { echo "AppImage candidate is not executable: $candidate" >&2; exit 1; }

original="$stage/bin/neutralino-linux_x64.production"
if [[ ! -f "$original" ]]; then
  cp "$stage/bin/neutralino-linux_x64" "$original"
fi
candidate_sha="$(sha256sum "$candidate" | awk '{print $1}')"

case "$launch_mode" in
  extract)
    cat > "$stage/bin/neutralino-linux_x64" <<EOF
#!/bin/sh
exec "$candidate" --appimage-extract-and-run "\$@"
EOF
    ;;
  direct)
    cat > "$stage/bin/neutralino-linux_x64" <<EOF
#!/bin/sh
exec "$candidate" "\$@"
EOF
    ;;
esac
chmod 0755 "$stage/bin/neutralino-linux_x64"

{
  printf 'candidate=%s\n' "$(basename "$candidate")"
  printf 'candidate_sha256=%s\n' "$candidate_sha"
  printf 'mode=%s\n' "$identity_mode"
} > "$result_dir/identity.txt"

run_stage() {
  local name="$1"
  shift
  printf 'PV_APPIMAGE_RUNTIME_STAGE_START stage=%s\n' "$name" | tee -a "$result_dir/stages.txt"
  if "$@" >"$result_dir/$name.log" 2>&1; then
    printf 'PV_APPIMAGE_RUNTIME_STAGE_PASS stage=%s\n' "$name" | tee -a "$result_dir/stages.txt"
    return 0
  fi
  local status=$?
  printf 'PV_APPIMAGE_RUNTIME_STAGE_FAIL stage=%s exit_code=%s\n' "$name" "$status" | tee -a "$result_dir/stages.txt" >&2
  cat "$result_dir/$name.log" >&2
  return "$status"
}

: > "$result_dir/stages.txt"
run_stage production-window "$root/scripts/run-neutralino-production-smoke.sh" "$stage"
run_stage gameplay-input-audio-quit "$root/scripts/run-neutralino-fedora-smoke.sh" "$stage"
run_stage external-link "$root/scripts/run-neutralino-external-link-smoke.sh" "$stage"
run_stage host-navigation "$root/scripts/run-neutralino-host-navigation-smoke.sh" "$stage"
printf 'PV_APPIMAGE_RUNTIME_RESULT=PASS\n' | tee "$result_dir/result.txt"
