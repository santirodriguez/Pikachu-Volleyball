#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_file="$root/desktop/neutralino-spike/extensions/external-link-linux.c"
output_dir="$root/.neutralino-spike/extensions"
output_file="$output_dir/pv-external-link-linux_x64"

if [[ ! -f "$source_file" ]]; then
  echo "Missing Neutralino external-link extension source: $source_file" >&2
  exit 1
fi

mkdir -p "$output_dir"
cc -std=c11 -O2 -Wall -Wextra -Werror "$source_file" -o "$output_file"
strip --strip-all "$output_file"
chmod 755 "$output_file"

printf 'Built Neutralino external-link extension: %s (%s bytes)\n' \
  "$output_file" "$(stat -c%s "$output_file")"
