#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="${PV_PHASE5_A11Y_ROOT:-$ROOT/build/phase5/accessibility}"
EVIDENCE_DIR="$BUILD_ROOT/evidence"
PREFIX="$BUILD_ROOT/prefix"
BINARY="$BUILD_ROOT/probe-build/pikachu-volleyball-accessibility-probe"
STATE_FILE="$EVIDENCE_DIR/runtime-state.txt"
VALIDATION_FILE="$EVIDENCE_DIR/atspi-validation.json.txt"
PROBE_LOG="$EVIDENCE_DIR/probe-runtime.log"

mkdir -p "$EVIDENCE_DIR"
rm -f "$STATE_FILE" "$VALIDATION_FILE" "$PROBE_LOG"

if [[ ! -x "$BINARY" ]]; then
  echo "Accessibility probe binary is missing: $BINARY" >&2
  exit 1
fi

if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
  echo 'A D-Bus session is required. Run this script under dbus-run-session.' >&2
  exit 1
fi

XVFB_DISPLAY="${PV_A11Y_DISPLAY:-:99}"
Xvfb "$XVFB_DISPLAY" -screen 0 1024x768x24 -nolisten tcp \
  > "$EVIDENCE_DIR/xvfb.log" 2>&1 &
xvfb_pid=$!
probe_pid=''
bus_pid=''

cleanup() {
  set +e
  if [[ -n "$probe_pid" ]]; then
    kill "$probe_pid" 2>/dev/null || true
    wait "$probe_pid" 2>/dev/null || true
  fi
  if [[ -n "$bus_pid" ]]; then
    kill "$bus_pid" 2>/dev/null || true
    wait "$bus_pid" 2>/dev/null || true
  fi
  kill "$xvfb_pid" 2>/dev/null || true
  wait "$xvfb_pid" 2>/dev/null || true
}
trap cleanup EXIT

export DISPLAY="$XVFB_DISPLAY"
export NO_AT_BRIDGE=0
export PV_A11Y_PROBE_STATE_FILE="$STATE_FILE"
export LD_LIBRARY_PATH="$PREFIX/lib:$PREFIX/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

for attempt in $(seq 1 50); do
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
    break
  fi
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

"$launcher" --launch-immediately > "$EVIDENCE_DIR/at-spi-bus.log" 2>&1 &
bus_pid=$!
sleep 1

"$BINARY" > "$PROBE_LOG" 2>&1 &
probe_pid=$!

for attempt in $(seq 1 100); do
  if [[ -s "$STATE_FILE" ]]; then
    break
  fi
  if ! kill -0 "$probe_pid" 2>/dev/null; then
    cat "$PROBE_LOG" >&2
    echo 'Accessibility probe exited before publishing startup state.' >&2
    exit 1
  fi
  if [[ "$attempt" -eq 100 ]]; then
    cat "$PROBE_LOG" >&2
    echo 'Accessibility probe did not publish startup state.' >&2
    exit 1
  fi
  sleep 0.1
done

/usr/bin/python3 "$ROOT/scripts/validate-phase5-accessibility.py" \
  | tee "$VALIDATION_FILE"

grep -q '^accesskit_atspi_probe=PASS$' "$VALIDATION_FILE"
grep -q '^last_action=cancel$' "$STATE_FILE"
grep -q '^modal_open=0$' "$STATE_FILE"

{
  echo 'atspi_gate=PASS'
  echo "display=$DISPLAY"
  echo "atspi_bus_launcher=$launcher"
  echo "python=$(/usr/bin/python3 --version 2>&1)"
  echo "state_sha256=$(sha256sum "$STATE_FILE" | awk '{print $1}')"
  echo "validation_sha256=$(sha256sum "$VALIDATION_FILE" | awk '{print $1}')"
} | tee "$EVIDENCE_DIR/runtime-summary.txt"
