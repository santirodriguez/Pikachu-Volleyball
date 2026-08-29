#!/usr/bin/env bash
set -euo pipefail

appimage="${1:-}"
output_dir="${2:-performance-diagnostics}"

if [[ -z "$appimage" || ! -f "$appimage" ]]; then
  echo "Usage: bash scripts/run-appimage-performance-diagnostics.sh <AppImage> [output-dir]" >&2
  exit 1
fi

mkdir -p "$output_dir"
profile_a="$(mktemp -d)"
profile_b="$(mktemp -d)"
trap 'rm -rf "$profile_a" "$profile_b"' EXIT

run_once() {
  local label="$1"
  local profile="$2"
  local metrics_file="$output_dir/$label.json"
  local timing_file="$output_dir/$label-wrapper-ms.txt"
  local started_ns
  local finished_ns

  rm -f "$metrics_file" "$timing_file"
  started_ns="$(date +%s%N)"
  PV_PERFORMANCE_METRICS_FILE="$metrics_file" \
    PV_STARTUP_USER_DATA_DIR="$profile" \
    "$appimage"
  finished_ns="$(date +%s%N)"

  echo "$(( (finished_ns - started_ns) / 1000000 ))" > "$timing_file"
}

run_once first-fresh-profile "$profile_a"
run_once second-same-profile "$profile_a"
run_once third-fresh-profile "$profile_b"

cat > "$output_dir/README.txt" <<'EOF'
Pikachu Volleyball AppImage performance diagnostics

Files:
- first-fresh-profile.json
- second-same-profile.json
- third-fresh-profile.json
- *-wrapper-ms.txt: wall-clock milliseconds for the complete AppImage diagnostic run

The app opens, drives itself into a match, records frame pacing, and exits automatically for each run.
The first run is not guaranteed to be a true cold filesystem-cache run unless the operating system cache was cleared separately.
EOF

echo "Diagnostics written to: $output_dir"
