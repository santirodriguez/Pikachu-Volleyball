#!/usr/bin/env bash
set -euo pipefail

stage="${1:-.neutralino-spike}"
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

cleanup_active_phase() {
  if [[ -n "$active_app_pid" ]] && kill -0 "$active_app_pid" 2>/dev/null; then
    kill -KILL "$active_app_pid" 2>/dev/null || true
  fi
  if [[ -n "$active_job" ]]; then
    set +e
    wait "$active_job" 2>/dev/null
    set -e
  fi
  active_job=""
  active_app_pid=""
}

cleanup() {
  cleanup_active_phase
  kill "$wm_pid" "$xvfb_pid" 2>/dev/null || true
}
trap cleanup EXIT
sleep 1

runtime_args=(
  --res-mode=directory
  --path=.
  --url=/en/index.html?desktop=1
  --window-inject-client-library=true
  --window-inject-script=/resources/neutralino-smoke-preload.js
)

smoke_args() {
  local phase="$1"
  local hold_ms="$2"
  local start_ms="$3"
  printf '%s\n' \
    "--dev-pv-smoke-phase=${phase}" \
    "--dev-pv-smoke-hold-ms=${hold_ms}" \
    "--dev-pv-smoke-start-epoch-ms=${start_ms}"
}

run_phase() {
  local phase="$1"
  local hold_ms="$2"
  local start_ms
  local status
  local -a phase_args
  start_ms="$(date +%s%3N)"
  mapfile -t phase_args < <(smoke_args "$phase" "$hold_ms" "$start_ms")
  set +e
  /usr/bin/time -v -o "$output_dir/${phase}-time.txt" \
    timeout 35s "$binary" \
      "${runtime_args[@]}" \
      "${phase_args[@]}" \
      >"$output_dir/${phase}.log" 2>&1
  status=$?
  set -e
  if (( status != 0 )); then
    cat "$output_dir/${phase}.log" >&2
    cat "$output_dir/${phase}-time.txt" >&2
    return "$status"
  fi
}

find_child_process() {
  local parent_pid="$1"
  local child_pid=""
  for _ in $(seq 1 50); do
    child_pid="$(pgrep -P "$parent_pid" | head -n 1 || true)"
    if [[ -n "$child_pid" ]]; then
      printf '%s\n' "$child_pid"
      return 0
    fi
    if ! kill -0 "$parent_pid" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
  return 1
}

start_observed_phase() {
  local phase="$1"
  local hold_ms="$2"
  local start_ms
  local -a phase_args
  start_ms="$(date +%s%3N)"
  mapfile -t phase_args < <(smoke_args "$phase" "$hold_ms" "$start_ms")

  /usr/bin/time -v -o "$output_dir/${phase}-time.txt" \
    "$binary" \
      "${runtime_args[@]}" \
      "${phase_args[@]}" \
      >"$output_dir/${phase}.log" 2>&1 &
  active_job=$!
  active_app_pid="$(find_child_process "$active_job" || true)"

  if [[ -z "$active_app_pid" ]]; then
    set +e
    wait "$active_job"
    local status=$?
    set -e
    cat "$output_dir/${phase}.log" >&2
    cat "$output_dir/${phase}-time.txt" >&2
    active_job=""
    echo "Unable to identify the Neutralino ${phase} process (status ${status})." >&2
    return 1
  fi
}

wait_for_report() {
  local phase="$1"
  local marker="PV_NEUTRALINO_SMOKE {\"phase\":\"${phase}\""
  for _ in $(seq 1 350); do
    if grep -Fq "$marker" "$output_dir/${phase}.log" 2>/dev/null; then
      return 0
    fi
    if ! kill -0 "$active_job" 2>/dev/null; then
      return 1
    fi
    sleep 0.1
  done
  return 1
}

stop_observed_phase() {
  local phase="$1"
  local status

  if ! kill -0 "$active_job" 2>/dev/null || ! kill -0 "$active_app_pid" 2>/dev/null; then
    set +e
    wait "$active_job"
    status=$?
    set -e
    active_job=""
    active_app_pid=""
    cat "$output_dir/${phase}.log" >&2
    cat "$output_dir/${phase}-time.txt" >&2
    echo "Neutralino ${phase} process ended before controlled harness termination (status ${status})." >&2
    return 1
  fi

  kill -KILL "$active_app_pid"
  set +e
  wait "$active_job"
  status=$?
  set -e
  active_job=""
  active_app_pid=""

  printf 'termination=external-sigkill status=%s\n' "$status" \
    >"$output_dir/${phase}-termination.txt"

  if grep -Eqi 'websocketpp::exception|dumped core|terminate called after throwing|Aborted' \
    "$output_dir/${phase}.log"; then
    cat "$output_dir/${phase}.log" >&2
    cat "$output_dir/${phase}-time.txt" >&2
    echo "Neutralino ${phase} crashed before harness termination." >&2
    return 1
  fi

  if (( status != 137 )); then
    cat "$output_dir/${phase}.log" >&2
    cat "$output_dir/${phase}-time.txt" >&2
    echo "Unexpected Neutralino ${phase} harness termination status: ${status}." >&2
    return 1
  fi
}

finish_observed_phase() {
  local phase="$1"
  local marker="PV_NEUTRALINO_SMOKE {\"phase\":\"${phase}\""
  local report=""

  if ! wait_for_report "$phase"; then
    cat "$output_dir/${phase}.log" >&2
    if [[ -f "$output_dir/${phase}-time.txt" ]]; then
      cat "$output_dir/${phase}-time.txt" >&2
    fi
    cleanup_active_phase
    echo "Neutralino ${phase} probe did not emit a real smoke report." >&2
    return 1
  fi

  report="$(grep -F "$marker" "$output_dir/${phase}.log" | head -n 1)"
  if [[ "$report" != *'"ok":true'* ]]; then
    cleanup_active_phase
    printf '%s\n' "$report" >&2
    echo "Neutralino ${phase} probe reported failure." >&2
    return 1
  fi

  stop_observed_phase "$phase"
}

find_window() {
  local window_id=""
  for _ in $(seq 1 100); do
    window_id="$(xdotool search --name '^Pikachu Volleyball$' 2>/dev/null | head -n 1 || true)"
    if [[ -n "$window_id" ]]; then
      printf '%s\n' "$window_id"
      return 0
    fi
    sleep 0.1
  done
  return 1
}

run_write_phase() {
  local window_id=""
  start_observed_phase write 0

  for _ in $(seq 1 80); do
    window_id="$(xdotool search --name '^Pikachu Volleyball' 2>/dev/null | head -n 1 || true)"
    if [[ -n "$window_id" ]]; then
      xdotool getwindowname "$window_id" \
        >"$output_dir/write-window-title.txt" 2>/dev/null || true
      break
    fi
    if ! kill -0 "$active_job" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done

  finish_observed_phase write
}

run_write_phase

start_observed_phase read 0
window_id="$(find_window || true)"
if [[ -z "$window_id" ]]; then
  cat "$output_dir/read.log" >&2
  cleanup_active_phase
  echo "Unable to locate the Neutralino window on Fedora." >&2
  exit 1
fi

xdotool getwindowgeometry --shell "$window_id" >"$output_dir/window-initial.txt"
xdotool windowsize "$window_id" 600 400
sleep 0.4
xdotool getwindowgeometry --shell "$window_id" >"$output_dir/window-after-min-resize.txt"

finish_observed_phase read

# shellcheck disable=SC1090
source "$output_dir/window-after-min-resize.txt"
if (( WIDTH < 800 || HEIGHT < 600 )); then
  cat "$output_dir/window-after-min-resize.txt" >&2
  echo "Neutralino minimum window size was not enforced." >&2
  exit 1
fi

start_observed_phase keyboard 0
keyboard_window_id="$(find_window || true)"
if [[ -z "$keyboard_window_id" ]]; then
  cat "$output_dir/keyboard.log" >&2
  cleanup_active_phase
  echo "Unable to locate the Neutralino keyboard probe window." >&2
  exit 1
fi

xdotool windowfocus --sync "$keyboard_window_id"
sleep 0.8
xdotool keydown d keydown r keydown Right keydown Up
sleep 0.35
xdotool keyup Up keyup Right keyup r keyup d

finish_observed_phase keyboard

run_phase quit 300
if ! grep -Fq 'PV_NEUTRALINO_QUIT_READY bridgeAvailable=true' "$output_dir/quit.log"; then
  cat "$output_dir/quit.log" >&2
  echo "Neutralino quit probe did not confirm the desktop bridge." >&2
  exit 1
fi
if ! grep -Fq 'PV_NEUTRALINO_QUIT_CALL bridge=real' "$output_dir/quit.log"; then
  cat "$output_dir/quit.log" >&2
  echo "Neutralino quit probe did not call the real desktop bridge." >&2
  exit 1
fi
if grep -Eqi 'websocketpp::exception|dumped core|terminate called after throwing|Aborted' \
  "$output_dir/quit.log"; then
  cat "$output_dir/quit.log" >&2
  echo "Neutralino quit bridge crashed on Fedora." >&2
  exit 1
fi

cat "$output_dir/write.log"
cat "$output_dir/write-time.txt"
cat "$output_dir/write-termination.txt"
cat "$output_dir/read.log"
cat "$output_dir/read-time.txt"
cat "$output_dir/read-termination.txt"
cat "$output_dir/window-initial.txt"
cat "$output_dir/window-after-min-resize.txt"
cat "$output_dir/keyboard.log"
cat "$output_dir/keyboard-time.txt"
cat "$output_dir/keyboard-termination.txt"
cat "$output_dir/quit.log"
cat "$output_dir/quit-time.txt"
