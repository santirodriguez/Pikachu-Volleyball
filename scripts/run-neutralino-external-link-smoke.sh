#!/usr/bin/env bash
set -euo pipefail

stage="${1:-.neutralino-spike}"
cd "$stage"

binary="./bin/neutralino-linux_x64"
extension="./extensions/pv-external-link-linux_x64"
output_dir="fedora-external-link-smoke"
mkdir -p "$output_dir/fake-bin"

if [[ ! -x "$binary" ]]; then
  echo "Missing Neutralino Linux runtime: $binary" >&2
  exit 1
fi
if [[ ! -x "$extension" ]]; then
  echo "Missing Neutralino external-link extension: $extension" >&2
  exit 1
fi

xdg_log="$PWD/$output_dir/xdg-open.log"
cat >"$output_dir/fake-bin/xdg-open" <<'FAKE_XDG'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" >> "$PV_XDG_OPEN_LOG"
FAKE_XDG
chmod 755 "$output_dir/fake-bin/xdg-open"
export PV_XDG_OPEN_LOG="$xdg_log"
export PATH="$PWD/$output_dir/fake-bin:$PATH"

export DISPLAY=:98
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/pv-neutralino-external-link-runtime}"
export LIBGL_ALWAYS_SOFTWARE=1
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

Xvfb "$DISPLAY" -screen 0 1280x1024x24 >"$output_dir/xvfb.log" 2>&1 &
xvfb_pid=$!
openbox --sm-disable >"$output_dir/openbox.log" 2>&1 &
wm_pid=$!
app_pid=""

cleanup() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
    kill -KILL -- "-$app_pid" 2>/dev/null || true
  fi
  kill "$wm_pid" "$xvfb_pid" 2>/dev/null || true
}
trap cleanup EXIT
sleep 1

start_ms="$(date +%s%3N)"
setsid "$binary" \
  --res-mode=directory \
  --path=. \
  --url=/en/index.html?desktop=1 \
  --window-inject-client-library=true \
  --window-inject-script=/resources/neutralino-smoke-preload.js \
  --dev-pv-smoke-phase=external-links \
  --dev-pv-smoke-hold-ms=0 \
  --dev-pv-smoke-start-epoch-ms="$start_ms" \
  >"$output_dir/external-links.log" 2>&1 &
app_pid=$!

report_marker='PV_NEUTRALINO_EXTERNAL_LINK {"phase":"external-links"'
success_marker='PV_NEUTRALINO_EXTERNAL_LINK {"phase":"external-links","ok":true'
for _ in $(seq 1 300); do
  if grep -Fq "$report_marker" "$output_dir/external-links.log" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat "$output_dir/external-links.log" >&2
    echo "Neutralino external-link smoke process exited before reporting." >&2
    exit 1
  fi
  sleep 0.1
done

if ! grep -Fq "$success_marker" "$output_dir/external-links.log"; then
  cat "$output_dir/external-links.log" >&2
  echo "Neutralino external-link probe did not report success." >&2
  exit 1
fi

for _ in $(seq 1 50); do
  [[ -s "$xdg_log" ]] && break
  sleep 0.1
done

if [[ ! -f "$xdg_log" ]]; then
  cat "$output_dir/external-links.log" >&2
  echo "Trusted external-link mediator did not invoke xdg-open." >&2
  exit 1
fi

mapfile -t opened_urls < "$xdg_log"
if [[ "${#opened_urls[@]}" -ne 1 ]]; then
  cat "$xdg_log" >&2
  echo "Expected exactly one trusted external open, found ${#opened_urls[@]}." >&2
  exit 1
fi
if [[ "${opened_urls[0]}" != "https://santiagorodriguez.com/" ]]; then
  cat "$xdg_log" >&2
  echo "Trusted mediator opened an unexpected URL." >&2
  exit 1
fi
if ! grep -Fq '"directOsOpenBlocked":true' "$output_dir/external-links.log"; then
  cat "$output_dir/external-links.log" >&2
  echo "Renderer direct Neutralino.os.open call was not rejected." >&2
  exit 1
fi
if grep -Eqi 'websocketpp::exception|dumped core|terminate called after throwing|Aborted' \
  "$output_dir/external-links.log"; then
  cat "$output_dir/external-links.log" >&2
  echo "Neutralino external-link smoke crashed." >&2
  exit 1
fi

cat "$output_dir/external-links.log"
printf 'Trusted xdg-open URL: %s\n' "${opened_urls[0]}"
