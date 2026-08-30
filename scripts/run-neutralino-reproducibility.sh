#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
source_sha="${PV_SOURCE_SHA:-${GITHUB_SHA:-$(git rev-parse HEAD)}}"
evidence="$root/.neutralino-reproducibility"
artifact="pikachu-volleyball-neutralino-production-parity-linux-x64.tar.gz"
runner_temp="${RUNNER_TEMP:-/tmp}"
work_parent="$(mktemp -d "$runner_temp/pv-neutralino-repro.XXXXXX")"
work1="$work_parent/build-1"
work2="$work_parent/build-2"
stages="$evidence/stages.txt"

rm -rf "$evidence" "$root/.neutralino-production" "$root/neutralino-production-artifact" "$root/dist"
rm -f "$root/$artifact" "$root/$artifact.sha256"
mkdir -p "$evidence"
: > "$stages"

cleanup() {
  set +e
  git -C "$root" worktree remove --force "$work1" >/dev/null 2>&1
  git -C "$root" worktree remove --force "$work2" >/dev/null 2>&1
  rm -rf "$work_parent"
}
trap cleanup EXIT

stage_start() {
  printf 'PV_REPRO_STAGE_START stage=%s\n' "$1" | tee -a "$stages"
}

stage_pass() {
  printf 'PV_REPRO_STAGE_PASS stage=%s exit_code=0\n' "$1" | tee -a "$stages"
}

stage_fail() {
  local stage="$1"
  local status="$2"
  printf 'PV_REPRO_STAGE_FAIL stage=%s exit_code=%s\n' "$stage" "$status" | tee -a "$stages" >&2
  printf '%s\n' "$status" > "$evidence/exit-code.txt"
}

preserve_partial_diagnostics() {
  local workspace="$1"
  local label="$2"
  local destination="$evidence/$label/partial-diagnostics"
  if [[ -d "$workspace/.neutralino-production/diagnostics" ]]; then
    mkdir -p "$destination"
    cp -a "$workspace/.neutralino-production/diagnostics/." "$destination/"
  fi
}

preserve_candidate_in_root() {
  local workspace="$1"
  if [[ -f "$workspace/$artifact" ]]; then
    cp "$workspace/$artifact" "$root/$artifact"
  fi
  if [[ -f "$workspace/$artifact.sha256" ]]; then
    cp "$workspace/$artifact.sha256" "$root/$artifact.sha256"
  fi
}

promote_build_for_validation() {
  local workspace="$1"
  rm -rf "$root/.neutralino-production" "$root/neutralino-production-artifact" "$root/dist"
  cp -a "$workspace/.neutralino-production" "$root/.neutralino-production"
  cp -a "$workspace/neutralino-production-artifact" "$root/neutralino-production-artifact"
  cp -a "$workspace/dist" "$root/dist"
  preserve_candidate_in_root "$workspace"
}

run_build() {
  local label="$1"
  local workspace="$2"
  local stage="${label}-clean-build"
  local log="$evidence/${label}-build-command.log"

  stage_start "$stage"
  set +e
  {
    git -C "$root" worktree add --detach "$workspace" "$source_sha"
    test "$(git -C "$workspace" rev-parse HEAD)" = "$source_sha"
    cd "$workspace"
    npm ci
    PV_SOURCE_SHA="$source_sha" npm run build:desktop:neutralino
  } 2>&1 | tee "$log"
  local status=${PIPESTATUS[0]}
  set -e
  if [[ "$status" -ne 0 ]]; then
    preserve_partial_diagnostics "$workspace" "$label"
    stage_fail "$stage" "$status"
    return "$status"
  fi
  stage_pass "$stage"

  stage="${label}-capture"
  stage_start "$stage"
  set +e
  PV_SOURCE_SHA="$source_sha" node "$workspace/scripts/capture-neutralino-reproducibility.cjs" "$workspace" "$evidence/$label" 2>&1 | tee "$evidence/${label}-capture.log"
  status=${PIPESTATUS[0]}
  set -e
  if [[ "$status" -ne 0 ]]; then
    stage_fail "$stage" "$status"
    return "$status"
  fi
  stage_pass "$stage"
}

printf 'PV_REPRO_SOURCE_SHA=%s\n' "$source_sha" | tee -a "$stages"

run_build build-1 "$work1" || exit $?
preserve_candidate_in_root "$work1"
run_build build-2 "$work2" || exit $?
promote_build_for_validation "$work2"

stage_start component-comparison
set +e
node "$root/scripts/compare-neutralino-reproducibility.cjs" "$evidence" 2>&1 | tee "$evidence/comparison-command.log"
comparison_status=${PIPESTATUS[0]}
set -e
if [[ "$comparison_status" -ne 0 ]]; then
  stage_fail component-comparison "$comparison_status"
  exit "$comparison_status"
fi
stage_pass component-comparison
printf '0\n' > "$evidence/exit-code.txt"
