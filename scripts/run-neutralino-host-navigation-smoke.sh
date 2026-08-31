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

cat > "$output_dir/fake-bin/xdg-open" <<'FAKE_XDG'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" >> "$PV_XDG_OPEN_LOG"
FAKE_XDG
chmod 755 "$output_dir/fake-bin/xdg-open"
export PATH="$PWD/$output_dir/fake-bin:$PATH"

export DISPLAY=:99
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/pv-neutralino-host-navigation-runtime}"
export LIBGL_ALWAYS_SOFTWARE=1
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

Xvfb "$DISPLAY" -screen 0 1280x1024x24 >"$output_dir/xvfb.log" 2>&1 &
xvfb_pid=$!
openbox --sm-disable >"$output_dir/openbox.log" 2>&1 &
wm_pid=$!
app_pid=""
attacker_pid=""

cleanup_app() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
    kill -KILL -- "-$app_pid" 2>/dev/null || true
  fi
  if [[ -n "$app_pid" ]]; then
    wait "$app_pid" 2>/dev/null || true
  fi
  app_pid=""
}

cleanup_attacker() {
  if [[ -n "$attacker_pid" ]]; then
    kill "$attacker_pid" 2>/dev/null || true
    wait "$attacker_pid" 2>/dev/null || true
  fi
  attacker_pid=""
}

cleanup() {
  cleanup_app
  cleanup_attacker
  kill "$wm_pid" "$xvfb_pid" 2>/dev/null || true
}
trap cleanup EXIT
sleep 1

navigation_cases=(assign href replace anchor data file approved)
summary="$output_dir/host-navigation-summary.txt"
: > "$summary"

for navigation_case in "${navigation_cases[@]}"; do
  case_log="$output_dir/host-navigation-$navigation_case.log"
  attacker_log="$output_dir/attacker-server-$navigation_case.log"
  xdg_log="$PWD/$output_dir/xdg-open-$navigation_case.log"
  expected_title="PV_HOST_NAVIGATION_$navigation_case"
  rm -f "$case_log" "$attacker_log" "$xdg_log"
  export PV_XDG_OPEN_LOG="$xdg_log"

  python3 -u -m http.server "$attack_port" \
    --bind 127.0.0.1 \
    --directory "$output_dir/attacker-root" \
    >"$attacker_log" 2>&1 &
  attacker_pid=$!
  sleep 0.3

  start_ms="$(date +%s%3N)"
  setsid "$binary" \
    --res-mode=directory \
    --path=. \
    --url=/en/index.html?desktop=1 \
    --window-inject-client-library=true \
    --window-inject-script=/resources/neutralino-smoke-preload.js \
    --dev-pv-smoke-phase=host-navigation \
    --dev-pv-host-navigation-case="$navigation_case" \
    --dev-pv-untrusted-origin="http://127.0.0.1:$attack_port" \
    --dev-pv-smoke-hold-ms=0 \
    --dev-pv-smoke-start-epoch-ms="$start_ms" \
    >"$case_log" 2>&1 &
  app_pid=$!

  ready_marker="PV_NEUTRALINO_HOST_NAVIGATION_READY {\"phase\":\"host-navigation\",\"case\":\"$navigation_case\",\"ok\":true"
  for _ in $(seq 1 250); do
    if grep -Fq "$ready_marker" "$case_log" 2>/dev/null; then
      break
    fi
    if ! kill -0 "$app_pid" 2>/dev/null; then
      cat "$case_log" >&2
      cat "$attacker_log" >&2
      echo "Neutralino host-navigation case $navigation_case exited before becoming ready." >&2
      exit 1
    fi
    sleep 0.1
  done

  if ! grep -Fq "$ready_marker" "$case_log"; then
    cat "$case_log" >&2
    echo "Neutralino host-navigation case $navigation_case did not report readiness." >&2
    exit 1
  fi

  window_id=""
  for _ in $(seq 1 100); do
    window_id="$(xdotool search --name "^${expected_title}$" 2>/dev/null | head -n 1 || true)"
    [[ -n "$window_id" ]] && break
    if ! kill -0 "$app_pid" 2>/dev/null; then break; fi
    sleep 0.05
  done
  if [[ -z "$window_id" ]]; then
    cat "$case_log" >&2
    echo "Unable to locate trusted host-navigation window for case $navigation_case." >&2
    exit 1
  fi

  sleep 1
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat "$case_log" >&2
    echo "Neutralino host-navigation case $navigation_case exited after the navigation attempt." >&2
    exit 1
  fi

  current_title="$(xdotool getwindowname "$window_id" 2>/dev/null || true)"
  if [[ "$current_title" != "$expected_title" ]]; then
    cat "$case_log" >&2
    printf 'Expected trusted title %s after case %s, observed %s.\n' \
      "$expected_title" "$navigation_case" "$current_title" >&2
    exit 1
  fi

  if grep -Fq '"GET ' "$attacker_log"; then
    cat "$attacker_log" >&2
    echo "Untrusted same-window navigation reached the attacker origin in case $navigation_case." >&2
    exit 1
  fi

  if grep -Eqi 'websocketpp::exception|dumped core|terminate called after throwing|Aborted' "$case_log"; then
    cat "$case_log" >&2
    echo "Neutralino host-navigation case $navigation_case crashed." >&2
    exit 1
  fi

  if [[ "$navigation_case" = approved ]]; then
    for _ in $(seq 1 50); do
      [[ -s "$xdg_log" ]] && break
      sleep 0.1
    done
    if [[ ! -s "$xdg_log" ]]; then
      cat "$case_log" >&2
      echo "Approved same-window external navigation was not mediated externally." >&2
      exit 1
    fi
    mapfile -t opened_urls < "$xdg_log"
    if [[ "${#opened_urls[@]}" -ne 1 || "${opened_urls[0]}" != "https://santiagorodriguez.com/" ]]; then
      cat "$xdg_log" >&2
      echo "Approved host navigation did not produce exactly the expected xdg-open URL." >&2
      exit 1
    fi
    if ! grep -Fq 'PV_EXTERNAL_LINK opened https://santiagorodriguez.com/' "$case_log"; then
      cat "$case_log" >&2
      echo "Approved host navigation did not reach the validated native external-link path." >&2
      exit 1
    fi
  else
    if [[ -s "$xdg_log" ]]; then
      cat "$xdg_log" >&2
      echo "Rejected host-navigation case $navigation_case unexpectedly reached xdg-open." >&2
      exit 1
    fi
    if ! grep -Fq 'PV_EXTERNAL_LINK rejected' "$case_log"; then
      cat "$case_log" >&2
      echo "Rejected host-navigation case $navigation_case was not observed at the native validator." >&2
      exit 1
    fi
  fi

  printf 'case=%s result=PASS trusted_title=%s\n' "$navigation_case" "$current_title" >> "$summary"
  cleanup_app
  cleanup_attacker
  sleep 0.3
done

cat "$summary"
for navigation_case in "${navigation_cases[@]}"; do
  cat "$output_dir/host-navigation-$navigation_case.log"
done
printf 'Approved same-window xdg-open URL: https://santiagorodriguez.com/\n'
