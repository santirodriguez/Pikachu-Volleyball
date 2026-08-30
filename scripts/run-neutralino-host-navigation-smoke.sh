#!/usr/bin/env bash
set -euo pipefail

stage="${1:-.neutralino-production}"
cd "$stage"

binary="./bin/neutralino-linux_x64"
extension="./extensions/pv-external-link-linux_x64"
output_dir="fedora-host-navigation-smoke"
attack_port=48572
mkdir -p "$output_dir/fake-bin" "$output_dir/attacker-root"

if [[ ! -x "$binary" ]]; then
  echo "Missing Neutralino Linux runtime: $binary" >&2
  exit 1
fi
if [[ ! -x "$extension" ]]; then
  echo "Missing Neutralino external-link extension: $extension" >&2
  exit 1
fi

cat > "$output_dir/attacker-root/index.html" <<'ATTACKER_HTML'
<!doctype html><html><head><title>PV_UNTRUSTED_NAVIGATION_REACHED</title></head><body>blocked</body></html>
ATTACKER_HTML

xdg_log="$PWD/$output_dir/xdg-open.log"
cat > "$output_dir/fake-bin/xdg-open" <<'FAKE_XDG'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" >> "$PV_XDG_OPEN_LOG"
FAKE_XDG
chmod 755 "$output_dir/fake-bin/xdg-open"
export PV_XDG_OPEN_LOG="$xdg_log"
export PATH="$PWD/$output_dir/fake-bin:$PATH"

export DISPLAY=:99
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/pv-neutralino-host-navigation-runtime}"
export LIBGL_ALWAYS_SOFTWARE=1
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

python3 -m http.server "$attack_port" \
  --bind 127.0.0.1 \
  --directory "$output_dir/attacker-root" \
  >"$output_dir/attacker-server.log" 2>&1 &
attacker_pid=$!
Xvfb "$DISPLAY" -screen 0 1280x1024x24 >"$output_dir/xvfb.log" 2>&1 &
xvfb_pid=$!
openbox --sm-disable >"$output_dir/openbox.log" 2>&1 &
wm_pid=$!
app_pid=""

cleanup() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
    kill -KILL -- "-$app_pid" 2>/dev/null || true
  fi
  kill "$wm_pid" "$xvfb_pid" "$attacker_pid" 2>/dev/null || true
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
  --dev-pv-smoke-phase=host-navigation \
  --dev-pv-untrusted-origin="http://127.0.0.1:$attack_port" \
  --dev-pv-smoke-hold-ms=0 \
  --dev-pv-smoke-start-epoch-ms="$start_ms" \
  >"$output_dir/host-navigation.log" 2>&1 &
app_pid=$!

report_marker='PV_NEUTRALINO_HOST_NAVIGATION {"phase":"host-navigation"'
success_marker='PV_NEUTRALINO_HOST_NAVIGATION {"phase":"host-navigation","ok":true'
for _ in $(seq 1 400); do
  if grep -Fq "$report_marker" "$output_dir/host-navigation.log" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat "$output_dir/host-navigation.log" >&2
    cat "$output_dir/attacker-server.log" >&2
    echo "Neutralino host-navigation smoke process exited before reporting." >&2
    exit 1
  fi
  sleep 0.1
done

if ! grep -Fq "$success_marker" "$output_dir/host-navigation.log"; then
  cat "$output_dir/host-navigation.log" >&2
  cat "$output_dir/attacker-server.log" >&2
  echo "Neutralino host-navigation probe did not report success." >&2
  exit 1
fi

if grep -Fq '"GET ' "$output_dir/attacker-server.log"; then
  cat "$output_dir/attacker-server.log" >&2
  echo "Untrusted same-window navigation reached the attacker origin." >&2
  exit 1
fi

for _ in $(seq 1 50); do
  [[ -s "$xdg_log" ]] && break
  sleep 0.1
done
if [[ ! -f "$xdg_log" ]]; then
  cat "$output_dir/host-navigation.log" >&2
  echo "Approved same-window external navigation was not mediated externally." >&2
  exit 1
fi

mapfile -t opened_urls < "$xdg_log"
if [[ "${#opened_urls[@]}" -ne 1 ]]; then
  cat "$xdg_log" >&2
  echo "Expected exactly one approved same-window external open, found ${#opened_urls[@]}." >&2
  exit 1
fi
if [[ "${opened_urls[0]}" != "https://santiagorodriguez.com/" ]]; then
  cat "$xdg_log" >&2
  echo "Host navigation mediation opened an unexpected URL." >&2
  exit 1
fi
if ! grep -Fq '"stayedOnTrustedOrigin":true' "$output_dir/host-navigation.log"; then
  cat "$output_dir/host-navigation.log" >&2
  echo "Host navigation probe did not remain on the trusted application origin." >&2
  exit 1
fi
if grep -Eqi 'websocketpp::exception|dumped core|terminate called after throwing|Aborted' \
  "$output_dir/host-navigation.log"; then
  cat "$output_dir/host-navigation.log" >&2
  echo "Neutralino host-navigation smoke crashed." >&2
  exit 1
fi

cat "$output_dir/host-navigation.log"
printf 'Approved same-window xdg-open URL: %s\n' "${opened_urls[0]}"
