#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_file="$root/desktop/neutralino/extensions/external-link-linux.c"
output_dir="$root/.neutralino-production/extensions"
output_file="$output_dir/pv-external-link-linux_x64"
compiler="${CC:-cc}"

if [[ ! -f "$source_file" ]]; then
  echo "Missing Neutralino external-link extension source: $source_file" >&2
  exit 1
fi
if ! command -v "$compiler" >/dev/null 2>&1; then
  echo "Missing C compiler for Neutralino external-link extension: $compiler" >&2
  exit 1
fi
mkdir -p "$output_dir"
"$compiler" -std=c11 -O2 -Wall -Wextra -Werror "$source_file" -o "$output_file"
strip --strip-all "$output_file"
chmod 755 "$output_file"
printf 'Built Neutralino external-link extension with %s: %s (%s bytes)\n' "$compiler" "$output_file" "$(stat -c%s "$output_file")"
