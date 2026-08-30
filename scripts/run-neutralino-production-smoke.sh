#!/usr/bin/env bash
set -euo pipefail

bundle="${1:?usage: run-neutralino-production-smoke.sh <extracted-bundle>}"
cd "$bundle"
binary="./pikachu-volleyball-neutralino-linux_x64"
[[ -x "$binary" ]] || { echo "Missing production Neutralino binary." >&2; exit 1; }
[[ -x ./extensions/pv-external-link-linux_x64 ]] || { echo "Missing production external-link helper." >&2; exit 1; }
export DISPLAY=:98
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/pv-neutralino-production-runtime}"
export LIBGL_ALWAYS_SOFTWARE=1
mkdir -p "$XDG_RUNTIME_DIR"; chmod 700 "$XDG_RUNTIME_DIR"
Xvfb "$DISPLAY" -screen 0 1280x1024x24 >production-xvfb.log 2>&1 & xvfb_pid=$!
openbox --sm-disable >production-openbox.log 2>&1 & wm_pid=$!
cleanup() { kill "$wm_pid" "$xvfb_pid" 2>/dev/null || true; [[ -n "${app_pid:-}" ]] && kill "$app_pid" 2>/dev/null || true; }
trap cleanup EXIT
sleep 1
setsid "$binary" >production-runtime.log 2>&1 & app_pid=$!
window_id=""
for _ in $(seq 1 120); do
  window_id="$(xdotool search --name '^Pikachu Volleyball$' 2>/dev/null | head -n 1 || true)"
  [[ -n "$window_id" ]] && break
  kill -0 "$app_pid" 2>/dev/null || { cat production-runtime.log >&2; exit 1; }
  sleep 0.1
done
[[ -n "$window_id" ]] || { cat production-runtime.log >&2; echo "Production window did not appear." >&2; exit 1; }
xdotool getwindowgeometry --shell "$window_id" >production-window-initial.txt
source production-window-initial.txt
(( WIDTH == 1024 && HEIGHT == 768 )) || { cat production-window-initial.txt >&2; echo "Unexpected initial production window size." >&2; exit 1; }
xdotool windowsize "$window_id" 600 400
sleep 0.4
xdotool getwindowgeometry --shell "$window_id" >production-window-minimum.txt
source production-window-minimum.txt
(( WIDTH >= 800 && HEIGHT >= 600 )) || { cat production-window-minimum.txt >&2; echo "Production minimum window size was not enforced." >&2; exit 1; }
xdotool windowclose "$window_id"
for _ in $(seq 1 80); do kill -0 "$app_pid" 2>/dev/null || exit 0; sleep 0.1; done
echo "Production window close did not terminate cleanly." >&2
exit 1
