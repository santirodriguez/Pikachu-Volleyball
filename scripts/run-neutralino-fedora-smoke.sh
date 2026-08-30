#!/usr/bin/env bash
set -euo pipefail

stage="${1:-.neutralino-production}"
cd "$stage"

binary="./bin/neutralino-linux_x64"
output_dir="fedora-smoke"
mkdir -p "$output_dir"

if [[ ! -x "$binary" ]]; then
  echo "Missing Neutralino Linux runtime: $binary" >&2
  exit 1
fi
if [[ ! -f neutralino.config.json ]]; then
  echo "Missing Neutralino smoke configuration: neutralino.config.json" >&2
  exit 1
fi

export DISPLAY=:99
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/pv-neutralino-runtime}"
export LIBGL_ALWAYS_SOFTWARE=1
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

active_job=""
active_app_pid=""

Xvfb "$DISPLAY" -screen 0 1280x1024x24 >"$output_dir/xvfb.log" 2>&1 &
xvfb_pid=$!
openbox --sm-disable >"$output_dir/openbox.log" 2>&1 &
wm_pid=$!

cleanup() {
  if [[ -n "$active_app_pid" ]] && kill -0 "$active_app_pid" 2>/dev/null; then
    kill -KILL -- "-$active_app_pid" 2>/dev/null || true
  fi
  kill "$wm_pid" "$xvfb_pid" 2>/dev/null || true
}
trap cleanup EXIT
sleep 1

run_smoke() {
  local phase="$1"
  local hold_ms="$2"
  local log_file="$output_dir/$phase.log"
  local start_ms
  local elapsed_ms
  local rss_kib=""
  local peak_rss_kib=""
  local window_id=""
  local title=""
  local marker=""
  local waited=0

  active_job="$phase"
  start_ms="$(date +%s%3N)"
  setsid "$binary" \
    --res-mode=directory \
    --path=. \
    --url=/en/index.html?desktop=1 \
    --window-inject-client-library=true \
    --window-inject-script=/resources/neutralino-smoke-preload.js \
    --dev-pv-smoke-phase="$phase" \
    --dev-pv-smoke-hold-ms="$hold_ms" \
    --dev-pv-smoke-start-epoch-ms="$start_ms" \
    >"$log_file" 2>&1 &
  active_app_pid=$!

  while (( waited < 300 )); do
    if grep -Fq "PV_NEUTRALINO_SMOKE" "$log_file" 2>/dev/null; then
      marker="$(grep -F "PV_NEUTRALINO_SMOKE" "$log_file" | tail -n 1)"
      break
    fi
    if ! kill -0 "$active_app_pid" 2>/dev/null; then
      cat "$log_file" >&2
      echo "Neutralino smoke process exited before reporting: $phase" >&2
      exit 1
    fi
    sleep 0.1
    waited=$((waited + 1))
  done

  if [[ -z "$marker" ]]; then
    cat "$log_file" >&2
    echo "Neutralino smoke did not report phase: $phase" >&2
    exit 1
  fi

  window_id="$(xdotool search --name 'Pikachu Volleyball' 2>/dev/null | head -n 1 || true)"
  if [[ -n "$window_id" ]]; then
    title="$(xdotool getwindowname "$window_id" 2>/dev/null || true)"
  fi
  if [[ -r "/proc/$active_app_pid/status" ]]; then
    rss_kib="$(awk '/^VmRSS:/ { print $2 }' "/proc/$active_app_pid/status")"
    peak_rss_kib="$(awk '/^VmHWM:/ { print $2 }' "/proc/$active_app_pid/status")"
  fi
  elapsed_ms=$(( $(date +%s%3N) - start_ms ))

  printf '%s\n' "$marker"
  printf 'PV_NEUTRALINO_RUNTIME_OBSERVATION phase=%s elapsed_ms=%s rss_kib=%s peak_rss_kib=%s title=%q\n' \
    "$phase" "$elapsed_ms" "${rss_kib:-unknown}" "${peak_rss_kib:-unknown}" "$title"

  if [[ "$hold_ms" -gt 0 ]]; then
    kill -KILL -- "-$active_app_pid" 2>/dev/null || true
  else
    for _ in $(seq 1 100); do
      if ! kill -0 "$active_app_pid" 2>/dev/null; then
        break
      fi
      sleep 0.05
    done
    if kill -0 "$active_app_pid" 2>/dev/null; then
      kill -KILL -- "-$active_app_pid" 2>/dev/null || true
    fi
  fi
  wait "$active_app_pid" 2>/dev/null || true
  active_app_pid=""
}

run_smoke write 1000
run_smoke read 1000
run_smoke controls 1000
run_smoke audio 1000
run_smoke pause-restart 1000
run_smoke simultaneous-input 1000
run_smoke practice 1000
run_smoke locales 1000
run_smoke quit 0

printf 'Neutralino Fedora production-parity smoke completed.\n'
