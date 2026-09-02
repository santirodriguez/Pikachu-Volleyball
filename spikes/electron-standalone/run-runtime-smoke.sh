#!/usr/bin/env bash
set -euo pipefail

candidate="${1:?usage: run-runtime-smoke.sh <candidate.AppImage> <result-dir> [extract|direct]}"
result_dir="${2:?missing result directory}"
launch_mode="${3:-extract}"

candidate="$(readlink -f "$candidate")"
mkdir -p "$result_dir"
result_dir="$(readlink -f "$result_dir")"

[[ -f "$candidate" ]] || { echo "Missing Electron AppImage candidate: $candidate" >&2; exit 1; }
chmod 0755 "$candidate"

case "$launch_mode" in
  extract)
    launch_args=(--appimage-extract-and-run)
    identity_mode="appimage-extract-and-run"
    ;;
  direct)
    launch_args=()
    identity_mode="appimage-direct-fuse"
    ;;
  *)
    echo "Unsupported AppImage launch mode: $launch_mode" >&2
    exit 2
    ;;
esac

export HOME="$result_dir/home"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_CACHE_HOME="$HOME/.cache"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_RUNTIME_DIR="$HOME/.runtime"
export LIBGL_ALWAYS_SOFTWARE=1
mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

open_log="$result_dir/external-open.log"
smoke_bin="$result_dir/smoke-bin"
mkdir -p "$smoke_bin"
cat > "$smoke_bin/xdg-open" <<'OPEN_EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >> "${PV_ELECTRON_OPEN_LOG:?}"
exit 0
OPEN_EOF
chmod 0755 "$smoke_bin/xdg-open"
export PATH="$smoke_bin:$PATH"
export PV_ELECTRON_OPEN_LOG="$open_log"
: > "$open_log"

printf 'candidate=%s\n' "$(basename "$candidate")" > "$result_dir/identity.txt"
printf 'candidate_sha256=%s\n' "$(sha256sum "$candidate" | awk '{print $1}')" >> "$result_dir/identity.txt"
printf 'mode=%s\n' "$identity_mode" >> "$result_dir/identity.txt"

active_pid=""
xvfb_pid=""
wm_pid=""
display_file="$(mktemp)"

cleanup() {
  if [[ -n "$active_pid" ]] && kill -0 "$active_pid" 2>/dev/null; then
    kill "$active_pid" 2>/dev/null || true
  fi
  if [[ -n "$wm_pid" ]]; then kill "$wm_pid" 2>/dev/null || true; fi
  if [[ -n "$xvfb_pid" ]]; then kill "$xvfb_pid" 2>/dev/null || true; fi
  rm -f "$display_file"
}
trap cleanup EXIT

Xvfb -displayfd 3 -screen 0 1280x1024x24 3>"$display_file" >"$result_dir/xvfb.log" 2>&1 &
xvfb_pid=$!
for _ in $(seq 1 50); do
  if [[ -s "$display_file" ]]; then
    export DISPLAY=":$(cat "$display_file")"
    break
  fi
  if ! kill -0 "$xvfb_pid" 2>/dev/null; then
    cat "$result_dir/xvfb.log" >&2
    echo "Unable to start Xvfb for Electron smoke." >&2
    exit 1
  fi
  sleep 0.1
done
[[ -n "${DISPLAY:-}" ]] || { echo "Xvfb did not publish a display." >&2; exit 1; }
rm -f "$display_file"

openbox --sm-disable >"$result_dir/openbox.log" 2>&1 &
wm_pid=$!
sleep 1

run_phase() {
  local phase="$1"
  local log="$result_dir/${phase}.log"
  local status=0
  set +e
  timeout 45s "$candidate" "${launch_args[@]}" "--pv-electron-smoke=$phase" >"$log" 2>&1
  status=$?
  set -e
  if (( status != 0 )); then
    cat "$log" >&2
    echo "Electron smoke phase $phase failed with status $status." >&2
    return "$status"
  fi
  if [[ "$phase" != "quit" ]] && ! grep -Fq "PV_ELECTRON_SMOKE {\"phase\":\"$phase\",\"ok\":true" "$log"; then
    cat "$log" >&2
    echo "Electron smoke phase $phase did not report success." >&2
    return 1
  fi
  if [[ "$phase" == "quit" ]] && ! grep -Fq 'PV_ELECTRON_QUIT_READY firstFrameReady=true bridgeReady=true' "$log"; then
    cat "$log" >&2
    echo "Electron quit phase did not confirm the real pvDesktop bridge." >&2
    return 1
  fi
}

run_phase write
run_phase read

window_log="$result_dir/window-minimum.txt"
set +e
"$candidate" "${launch_args[@]}" --pv-electron-smoke=window >"$result_dir/window-probe.log" 2>&1 &
active_pid=$!
set -e
window_id=""
for _ in $(seq 1 100); do
  window_id="$(xdotool search --name '^Pikachu Volleyball$' 2>/dev/null | head -n 1 || true)"
  [[ -n "$window_id" ]] && break
  kill -0 "$active_pid" 2>/dev/null || break
  sleep 0.1
done
if [[ -z "$window_id" ]]; then
  cat "$result_dir/window-probe.log" >&2
  echo "Unable to locate Electron window for minimum-size validation." >&2
  exit 1
fi
if ! grep -Fq 'PV_ELECTRON_WINDOW_READY firstFrameReady=true' "$result_dir/window-probe.log"; then
  for _ in $(seq 1 80); do
    grep -Fq 'PV_ELECTRON_WINDOW_READY firstFrameReady=true' "$result_dir/window-probe.log" && break
    kill -0 "$active_pid" 2>/dev/null || break
    sleep 0.1
  done
fi
grep -Fq 'PV_ELECTRON_WINDOW_READY firstFrameReady=true' "$result_dir/window-probe.log" || { cat "$result_dir/window-probe.log" >&2; exit 1; }
xdotool windowsize "$window_id" 600 400
sleep 0.4
xdotool getwindowgeometry --shell "$window_id" > "$window_log"
wait "$active_pid"
active_pid=""
# shellcheck disable=SC1090
source "$window_log"
if (( WIDTH < 800 || HEIGHT < 600 )); then
  cat "$window_log" >&2
  echo "Electron minimum window size was not enforced." >&2
  exit 1
fi

keyboard_log="$result_dir/keyboard.log"
set +e
"$candidate" "${launch_args[@]}" --pv-electron-smoke=keyboard >"$keyboard_log" 2>&1 &
active_pid=$!
set -e
keyboard_window_id=""
for _ in $(seq 1 100); do
  keyboard_window_id="$(xdotool search --name '^Pikachu Volleyball$' 2>/dev/null | head -n 1 || true)"
  [[ -n "$keyboard_window_id" ]] && grep -Fq 'PV_ELECTRON_KEYBOARD_READY firstFrameReady=true' "$keyboard_log" && break
  kill -0 "$active_pid" 2>/dev/null || break
  sleep 0.1
done
if [[ -z "$keyboard_window_id" ]] || ! grep -Fq 'PV_ELECTRON_KEYBOARD_READY firstFrameReady=true' "$keyboard_log"; then
  cat "$keyboard_log" >&2
  echo "Unable to prepare Electron keyboard probe window." >&2
  exit 1
fi
xdotool windowfocus --sync "$keyboard_window_id"
sleep 0.5
xdotool keydown d keydown r keydown Right keydown Up
sleep 0.35
xdotool keyup Up keyup Right keyup r keyup d
wait "$active_pid"
active_pid=""
grep -Fq 'PV_ELECTRON_SMOKE {"phase":"keyboard","ok":true' "$keyboard_log" || {
  cat "$keyboard_log" >&2
  echo "Electron real keyboard probe did not report success." >&2
  exit 1
}
run_phase locales
run_phase navigation
run_phase external-links
run_phase quit

if ! grep -Fxq 'https://santiagorodriguez.com/' "$open_log"; then
  cat "$open_log" >&2
  echo "Approved external URL did not reach the native opener boundary." >&2
  exit 1
fi
if grep -E 'example\.com|javascript:|data:|file:' "$open_log"; then
  cat "$open_log" >&2
  echo "Rejected external URL reached the native opener boundary." >&2
  exit 1
fi

printf 'PV_ELECTRON_RUNTIME_RESULT=PASS\n' | tee "$result_dir/result.txt"
