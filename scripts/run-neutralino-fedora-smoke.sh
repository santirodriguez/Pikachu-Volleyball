#!/usr/bin/env bash
set -euo pipefail

stage="${1:-.neutralino-spike}"
cd "$stage"

binary="./bin/neutralino-linux_x64"
config="neutralino.smoke.config.json"
output_dir="fedora-smoke"
mkdir -p "$output_dir"

if [[ ! -x "$binary" ]]; then
  echo "Missing Neutralino Linux runtime: $binary" >&2
  exit 1
fi
if [[ ! -f "$config" ]]; then
  echo "Missing Neutralino smoke config: $config" >&2
  exit 1
fi

export DISPLAY=:99
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/pv-neutralino-runtime}"
export LIBGL_ALWAYS_SOFTWARE=1
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

Xvfb "$DISPLAY" -screen 0 1280x1024x24 >"$output_dir/xvfb.log" 2>&1 &
xvfb_pid=$!
openbox --sm-disable >"$output_dir/openbox.log" 2>&1 &
wm_pid=$!
cleanup() {
  kill "$wm_pid" "$xvfb_pid" 2>/dev/null || true
}
trap cleanup EXIT
sleep 1

run_phase() {
  local phase="$1"
  local hold_ms="$2"
  local start_ms
  start_ms="$(date +%s%3N)"
  /usr/bin/time -v -o "$output_dir/${phase}-time.txt" \
    timeout 35s "$binary" \
      --res-mode=directory \
      --path=. \
      --config-file="$config" \
      --url="/en/index.html?desktop=1&neutralinoSmoke=${phase}&neutralinoSmokeHoldMs=${hold_ms}&startEpochMs=${start_ms}" \
      >"$output_dir/${phase}.log" 2>&1
}

run_phase write 0
if ! grep -q 'PV_NEUTRALINO_SMOKE .*"phase":"write".*"ok":true' "$output_dir/write.log"; then
  cat "$output_dir/write.log" >&2
  echo "Neutralino persistence write probe failed." >&2
  exit 1
fi

start_ms="$(date +%s%3N)"
(
  /usr/bin/time -v -o "$output_dir/read-time.txt" \
    timeout 40s "$binary" \
      --res-mode=directory \
      --path=. \
      --config-file="$config" \
      --url="/en/index.html?desktop=1&neutralinoSmoke=read&neutralinoSmokeHoldMs=2500&startEpochMs=${start_ms}" \
      >"$output_dir/read.log" 2>&1
) &
read_job=$!

window_id=""
for _ in $(seq 1 80); do
  window_id="$(xdotool search --name '^Pikachu Volleyball$' 2>/dev/null | head -n 1 || true)"
  if [[ -n "$window_id" ]]; then
    break
  fi
  sleep 0.1
done
if [[ -z "$window_id" ]]; then
  wait "$read_job" || true
  cat "$output_dir/read.log" >&2
  echo "Unable to locate the Neutralino window on Fedora." >&2
  exit 1
fi

xdotool getwindowgeometry --shell "$window_id" >"$output_dir/window-initial.txt"
xdotool windowsize "$window_id" 600 400
sleep 0.4
xdotool getwindowgeometry --shell "$window_id" >"$output_dir/window-after-min-resize.txt"

wait "$read_job"
if ! grep -q 'PV_NEUTRALINO_SMOKE .*"phase":"read".*"ok":true' "$output_dir/read.log"; then
  cat "$output_dir/read.log" >&2
  echo "Neutralino Fedora runtime probe failed." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$output_dir/window-after-min-resize.txt"
if (( WIDTH < 800 || HEIGHT < 600 )); then
  cat "$output_dir/window-after-min-resize.txt" >&2
  echo "Neutralino minimum window size was not enforced." >&2
  exit 1
fi

cat "$output_dir/read.log"
cat "$output_dir/read-time.txt"
cat "$output_dir/window-initial.txt"
cat "$output_dir/window-after-min-resize.txt"
