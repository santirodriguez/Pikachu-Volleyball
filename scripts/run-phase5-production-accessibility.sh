#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="${PV_PHASE5_NATIVE_ROOT:-$ROOT/build/phase5/native-host}"
EVIDENCE_DIR="$BUILD_ROOT/evidence"
APP_RUN="$BUILD_ROOT/PikachuVolleyballNative.AppDir/AppRun"
STATE_FILE="$EVIDENCE_DIR/production-atspi-state.txt"
VALIDATION_FILE="$EVIDENCE_DIR/production-atspi-validation.txt"
RUNTIME_LOG="$EVIDENCE_DIR/production-atspi-runtime.log"
STATUS_LOG="$EVIDENCE_DIR/production-atspi-status.txt"

mkdir -p "$EVIDENCE_DIR"
rm -f "$STATE_FILE" "$VALIDATION_FILE" "$RUNTIME_LOG" "$STATUS_LOG"

if [[ ! -x "$APP_RUN" ]]; then
  echo "Production AppRun is missing: $APP_RUN" >&2
  exit 1
fi
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
  echo 'A D-Bus session is required.' >&2
  exit 1
fi

display="${PV_A11Y_DISPLAY:-:98}"
Xvfb "$display" -screen 0 1024x768x24 -nolisten tcp   > "$EVIDENCE_DIR/production-xvfb.log" 2>&1 &
xvfb_pid=$!
app_pid=''
bus_pid=''

cleanup() {
  set +e
  if [[ -n "$app_pid" ]]; then
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  if [[ -n "$bus_pid" ]]; then
    kill "$bus_pid" 2>/dev/null || true
    wait "$bus_pid" 2>/dev/null || true
  fi
  kill "$xvfb_pid" 2>/dev/null || true
  wait "$xvfb_pid" 2>/dev/null || true
}
trap cleanup EXIT

export DISPLAY="$display"
export NO_AT_BRIDGE=0
export SDL_AUDIODRIVER=dummy
export SDL_RENDER_DRIVER=software
export LANG=en_US.UTF-8
export PV_NATIVE_A11Y_STATE_FILE="$STATE_FILE"
export PV_NATIVE_PREFS_DIR="$BUILD_ROOT/production-a11y-preferences"
rm -rf "$PV_NATIVE_PREFS_DIR"
mkdir -p "$PV_NATIVE_PREFS_DIR"

for attempt in $(seq 1 50); do
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then break; fi
  if [[ "$attempt" -eq 50 ]]; then
    echo 'Xvfb did not become ready.' >&2
    exit 1
  fi
  sleep 0.1
done

launcher=''
if command -v at-spi-bus-launcher >/dev/null 2>&1; then
  launcher="$(command -v at-spi-bus-launcher)"
elif [[ -x /usr/libexec/at-spi-bus-launcher ]]; then
  launcher='/usr/libexec/at-spi-bus-launcher'
elif [[ -x /usr/lib/at-spi2-core/at-spi-bus-launcher ]]; then
  launcher='/usr/lib/at-spi2-core/at-spi-bus-launcher'
fi
if [[ -z "$launcher" ]]; then
  echo 'Unable to locate at-spi-bus-launcher.' >&2
  exit 1
fi

"$launcher" --launch-immediately > "$EVIDENCE_DIR/production-atspi-bus.log" 2>&1 &
bus_pid=$!

for attempt in $(seq 1 50); do
  if dbus-send --session --print-reply --dest=org.a11y.Bus     /org/a11y/bus org.a11y.Bus.GetAddress     > "$EVIDENCE_DIR/production-atspi-address.txt" 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 50 ]]; then
    echo 'AT-SPI bus launcher did not become ready.' >&2
    exit 1
  fi
  sleep 0.1
done

set_a11y_enabled() {
  dbus-send --session --print-reply --dest=org.a11y.Bus     /org/a11y/bus org.freedesktop.DBus.Properties.Set     string:org.a11y.Status string:IsEnabled variant:boolean:"$1"
}

set_a11y_enabled false > "$STATUS_LOG"

"$APP_RUN" --a11y-test > "$RUNTIME_LOG" 2>&1 &
app_pid=$!

for attempt in $(seq 1 100); do
  if [[ -s "$STATE_FILE" ]]; then break; fi
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat "$RUNTIME_LOG" >&2
    echo 'Production native host exited before publishing accessibility state.' >&2
    exit 1
  fi
  if [[ "$attempt" -eq 100 ]]; then
    cat "$RUNTIME_LOG" >&2
    echo 'Production native host did not publish accessibility state.' >&2
    exit 1
  fi
  sleep 0.1
done

sleep 1
set_a11y_enabled true >> "$STATUS_LOG"

/usr/bin/python3 "$ROOT/scripts/validate-phase5-production-accessibility.py"   | tee "$VALIDATION_FILE"

grep -q '^production_accesskit_atspi=PASS$' "$VALIDATION_FILE"

for attempt in $(seq 1 100); do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    wait "$app_pid"
    app_pid=''
    break
  fi
  if [[ "$attempt" -eq 100 ]]; then
    cat "$RUNTIME_LOG" >&2
    echo 'Native Quit did not terminate the production host.' >&2
    exit 1
  fi
  sleep 0.1
done

{
  echo 'production_atspi_gate=PASS'
  echo "state_sha256=$(sha256sum "$STATE_FILE" | awk '{print $1}')"
  echo "validation_sha256=$(sha256sum "$VALIDATION_FILE" | awk '{print $1}')"
  echo "status_sha256=$(sha256sum "$STATUS_LOG" | awk '{print $1}')"
  echo 'native_quit_process_exit=PASS'
} | tee "$EVIDENCE_DIR/production-atspi-summary.txt"
