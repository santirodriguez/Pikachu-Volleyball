#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
source packaging/linux/metadata.env
source packaging/linux/appimage-spike.env

mode="${1:-all}"
input_bundle="${PV_PRODUCTION_BUNDLE:-$root/neutralino-production-artifact/$PV_INTERNAL_BUNDLE_NAME}"
output_dir="${PV_APPIMAGE_OUTPUT:-$root/appimage-spike-output}"
evidence_dir="${PV_APPIMAGE_EVIDENCE:-$root/.appimage-spike-evidence}"
case "$mode" in all|thin|bundled) ;; *) echo "usage: $0 [all|thin|bundled]" >&2; exit 2 ;; esac

input_bundle="$(readlink -f "$input_bundle")"
mkdir -p "$output_dir" "$evidence_dir"
output_dir="$(readlink -f "$output_dir")"
evidence_dir="$(readlink -f "$evidence_dir")"
for relative in "$PV_BINARY_NAME" "extensions/$PV_EXTENSION_NAME" provenance.json SHA256SUMS; do
  [[ -f "$input_bundle/$relative" ]] || { echo "Missing production input: $relative" >&2; exit 1; }
done
(cd "$input_bundle" && sha256sum -c SHA256SUMS)

source_date_epoch="$(sed -n 's/^[[:space:]]*"sourceDateEpoch":[[:space:]]*\([0-9][0-9]*\),\{0,1\}[[:space:]]*$/\1/p' "$input_bundle/provenance.json" | head -n1)"
[[ "$source_date_epoch" =~ ^[0-9]+$ ]] || { echo "Invalid production sourceDateEpoch" >&2; exit 1; }
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$source_date_epoch}" TZ=UTC LC_ALL=C
[[ "$SOURCE_DATE_EPOCH" = "$source_date_epoch" ]] || { echo "SOURCE_DATE_EPOCH does not match production provenance" >&2; exit 1; }

tools="${PV_APPIMAGE_TOOLS_DIR:-$root/.appimage-spike-tools}"
mkdir -p "$tools"
download_verified() {
  local url="$1" sha="$2" destination="$3"
  local actual size type
  if [[ ! -f "$destination" ]] || [[ "$(sha256sum "$destination" | awk '{print $1}')" != "$sha" ]]; then
    rm -f "$destination"
    if [[ "$url" == https://api.github.com/repos/*/releases/assets/* ]]; then
      curl --fail --location --retry 3 --silent --show-error \
        --header 'Accept: application/octet-stream' \
        --header 'X-GitHub-Api-Version: 2022-11-28' \
        "$url" -o "$destination"
    else
      curl --fail --location --retry 3 --silent --show-error "$url" -o "$destination"
    fi
  fi
  actual="$(sha256sum "$destination" | awk '{print $1}')"
  if [[ "$actual" != "$sha" ]]; then
    size="$(stat -c%s "$destination" 2>/dev/null || echo unknown)"
    type="$(file -b "$destination" 2>/dev/null || echo unknown)"
    printf 'Tool asset integrity failure: url=%s expected_sha256=%s actual_sha256=%s bytes=%s type=%s\n' \
      "$url" "$sha" "$actual" "$size" "$type" >&2
    exit 1
  fi
  chmod 0755 "$destination"
}

appimagetool="$tools/appimagetool-x86_64.AppImage"
runtime_file="$tools/runtime-x86_64"
linuxdeploy="$tools/linuxdeploy-x86_64.AppImage"
linuxdeploy_wrapper="$tools/linuxdeploy-wrapper"
gtk_plugin="$tools/linuxdeploy-plugin-gtk.sh"
download_verified "$PV_APPIMAGE_TOOL_URL" "$PV_APPIMAGE_TOOL_SHA256" "$appimagetool"
download_verified "$PV_APPIMAGE_RUNTIME_URL" "$PV_APPIMAGE_RUNTIME_SHA256" "$runtime_file"
download_verified "$PV_LINUXDEPLOY_URL" "$PV_LINUXDEPLOY_SHA256" "$linuxdeploy"
cat > "$linuxdeploy_wrapper" <<EOF
#!/bin/sh
APPIMAGE_EXTRACT_AND_RUN=1 exec "$linuxdeploy" "\$@"
EOF
chmod 0755 "$linuxdeploy_wrapper"
if [[ ! -f "$gtk_plugin" ]]; then
  curl --fail --location --retry 3 --silent --show-error "$PV_LINUXDEPLOY_GTK_URL" -o "$gtk_plugin"
fi
chmod 0755 "$gtk_plugin"

gtk_sha256="$(sha256sum "$gtk_plugin" | awk '{print $1}')"
cat > "$evidence_dir/tooling.txt" <<EOF
appimagetool_commit=$PV_APPIMAGE_TOOL_COMMIT
appimagetool_asset_id=$PV_APPIMAGE_TOOL_ASSET_ID
appimagetool_sha256=$PV_APPIMAGE_TOOL_SHA256
type2_runtime_commit=$PV_APPIMAGE_RUNTIME_COMMIT
type2_runtime_asset_id=$PV_APPIMAGE_RUNTIME_ASSET_ID
type2_runtime_sha256=$PV_APPIMAGE_RUNTIME_SHA256
linuxdeploy_version=$PV_LINUXDEPLOY_VERSION
linuxdeploy_commit=$PV_LINUXDEPLOY_COMMIT
linuxdeploy_asset_id=$PV_LINUXDEPLOY_ASSET_ID
linuxdeploy_sha256=$PV_LINUXDEPLOY_SHA256
linuxdeploy_gtk_commit=$PV_LINUXDEPLOY_GTK_COMMIT
linuxdeploy_gtk_git_blob=$PV_LINUXDEPLOY_GTK_GIT_BLOB
linuxdeploy_gtk_sha256=$gtk_sha256
builder_image=$PV_APPIMAGE_BUILDER_IMAGE
apt_snapshot=$PV_APPIMAGE_APT_SNAPSHOT
source_date_epoch=$SOURCE_DATE_EPOCH
EOF

work="$(mktemp -d "${TMPDIR:-/tmp}/pv-appimage-spike.XXXXXX")"
trap 'rm -rf "$work"' EXIT

copy_core() {
  local appdir="$1"
  install -Dm755 "$input_bundle/$PV_BINARY_NAME" "$appdir/usr/bin/$PV_BINARY_NAME"
  install -Dm755 "$input_bundle/extensions/$PV_EXTENSION_NAME" "$appdir/usr/bin/extensions/$PV_EXTENSION_NAME"
  install -Dm644 "$input_bundle/provenance.json" "$appdir/usr/bin/provenance.json"
  install -Dm644 "$input_bundle/SHA256SUMS" "$appdir/usr/bin/SHA256SUMS"
  install -Dm644 "$PV_ICON_SOURCE" "$appdir/$PV_APPLICATION_ID.png"
  ln -sfn "$PV_APPLICATION_ID.png" "$appdir/.DirIcon"
  cat > "$appdir/$PV_APPLICATION_ID.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$PV_DISPLAY_NAME
Exec=$PV_BINARY_NAME
Icon=$PV_APPLICATION_ID
Terminal=false
Categories=Game;ArcadeGame;
EOF
}

write_thin_apprun() {
  local appdir="$1"
  cat > "$appdir/AppRun" <<EOF
#!/bin/sh
set -eu
APPDIR="\${APPDIR:-\$(CDPATH= cd -- "\$(dirname -- "\$0")" && pwd)}"
binary="\$APPDIR/usr/bin/$PV_BINARY_NAME"
ldd_output="\$(ldd "\$binary" 2>/dev/null || true)"
missing="\$(printf '%s\n' "\$ldd_output" | awk '/not found/ {print \$1}' | tr '\n' ' ')"
if [ -n "\$missing" ]; then
  echo "Pikachu Volleyball cannot start: missing host libraries: \$missing" >&2
  echo "This thin AppImage requires host GTK 3 and its normal desktop libraries." >&2
  exit 127
fi
webkit=""
for candidate in \
  /usr/lib*/libwebkit2gtk-4.1.so.0 \
  /usr/lib*/*/libwebkit2gtk-4.1.so.0 \
  /lib*/libwebkit2gtk-4.1.so.0 \
  /lib*/*/libwebkit2gtk-4.1.so.0 \
  /usr/lib*/libwebkit2gtk-4.0.so.37 \
  /usr/lib*/*/libwebkit2gtk-4.0.so.37 \
  /lib*/libwebkit2gtk-4.0.so.37 \
  /lib*/*/libwebkit2gtk-4.0.so.37; do
  if [ -r "\$candidate" ]; then
    webkit="\$candidate"
    break
  fi
done
if [ -z "\$webkit" ]; then
  echo "Pikachu Volleyball cannot start: host WebKitGTK 4.1 (preferred) or 4.0 is missing." >&2
  echo "This is a thin system-webview AppImage, not a fully self-contained desktop runtime." >&2
  exit 127
fi
if ! command -v gst-inspect-1.0 >/dev/null 2>&1 || ! gst-inspect-1.0 wavparse >/dev/null 2>&1 || ! gst-inspect-1.0 mpg123audiodec >/dev/null 2>&1; then
  echo "Pikachu Volleyball cannot start with the validated audio path: host GStreamer MP3/WAV plugins are missing." >&2
  exit 127
fi
if ! command -v xdg-open >/dev/null 2>&1; then
  echo "Pikachu Volleyball warning: xdg-open is unavailable; approved external links will not open." >&2
fi
exec "\$binary" "\$@"
EOF
  chmod 0755 "$appdir/AppRun"
}

write_bundled_apprun() {
  local appdir="$1"
  cat > "$appdir/AppRun" <<EOF
#!/bin/bash
set -euo pipefail
APPDIR="\${APPDIR:-\$(cd "\$(dirname "\$0")" && pwd)}"
export PATH="\$APPDIR/usr/bin:\$PATH"
export LD_LIBRARY_PATH="\$APPDIR/usr/lib\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export XDG_DATA_DIRS="\$APPDIR/usr/share:/usr/share\${XDG_DATA_DIRS:+:\$XDG_DATA_DIRS}"
export WEBKIT_INJECTED_BUNDLE_PATH="\$APPDIR/usr/lib/webkit2gtk-4.1/injected-bundle"
export GST_PLUGIN_SYSTEM_PATH_1_0=
export GST_PLUGIN_PATH_1_0="\$APPDIR/usr/lib/gstreamer-1.0"
if [ -x "\$APPDIR/usr/libexec/gstreamer-1.0/gst-plugin-scanner" ]; then
  export GST_PLUGIN_SCANNER="\$APPDIR/usr/libexec/gstreamer-1.0/gst-plugin-scanner"
fi
if [ -d "\$APPDIR/apprun-hooks" ]; then
  for hook in "\$APPDIR"/apprun-hooks/*.sh; do
    [ -f "\$hook" ] && . "\$hook"
  done
fi
if ! command -v xdg-open >/dev/null 2>&1; then
  echo "Pikachu Volleyball warning: xdg-open is unavailable; approved external links will not open." >&2
fi
exec "\$APPDIR/usr/bin/$PV_BINARY_NAME" "\$@"
EOF
  chmod 0755 "$appdir/AppRun"
}

normalize_appdir() {
  find "$1" -print0 | xargs -0 touch -h -d "@$SOURCE_DATE_EPOCH"
}

pack_appimage() {
  local appdir="$1" output="$2"
  rm -f "$output"
  normalize_appdir "$appdir"
  ARCH=x86_64 VERSION="$PV_PACKAGE_VERSION" SOURCE_DATE_EPOCH="$SOURCE_DATE_EPOCH" \
    APPIMAGE_EXTRACT_AND_RUN=1 "$appimagetool" --no-appstream --runtime-file "$runtime_file" "$appdir" "$output"
  chmod 0755 "$output"
}

build_thin() {
  local appdir="$work/thin.AppDir"
  mkdir -p "$appdir"
  copy_core "$appdir"
  write_thin_apprun "$appdir"
  pack_appimage "$appdir" "$output_dir/$PV_APPIMAGE_THIN_NAME"
  find "$appdir" -printf '%P\t%y\t%s\n' | sort > "$evidence_dir/thin-appdir-inventory.txt"
}

build_bundled() {
  command -v dpkg-query >/dev/null
  command -v pkg-config >/dev/null
  local appdir="$work/bundled.AppDir" webkit_lib webkit_process_dir scanner plugin
  mkdir -p "$appdir/usr/bin" "$appdir/usr/lib/gstreamer-1.0" "$appdir/usr/libexec/gstreamer-1.0"
  webkit_lib="$(ldconfig -p | awk '/libwebkit2gtk-4.1.so.0/ {print $NF; exit}')"
  [[ -f "$webkit_lib" ]] || { echo "Bundled candidate builder is missing WebKitGTK 4.1" >&2; exit 1; }
  webkit_process_dir="$(dirname "$(dpkg-query -L libwebkit2gtk-4.1-0 | grep '/WebKitWebProcess$' | head -n1)")"
  [[ -d "$webkit_process_dir" ]] || { echo "Unable to locate WebKitGTK helper processes" >&2; exit 1; }

  local -a deploy_args=(--appdir "$appdir" --library "$webkit_lib")
  for process in WebKitWebProcess WebKitNetworkProcess WebKitGPUProcess; do
    [[ -x "$webkit_process_dir/$process" ]] && deploy_args+=(--executable "$webkit_process_dir/$process")
  done
  [[ -x /usr/bin/bwrap ]] && deploy_args+=(--executable /usr/bin/bwrap)
  [[ -x /usr/bin/xdg-dbus-proxy ]] && deploy_args+=(--executable /usr/bin/xdg-dbus-proxy)

  local gst_dir
  gst_dir="$(pkg-config --variable=pluginsdir gstreamer-1.0)"
  local -a gst_plugins=(
    libgstcoreelements.so libgstplayback.so libgsttypefindfunctions.so
    libgstaudioconvert.so libgstaudioresample.so libgstvolume.so
    libgstaudioparsers.so libgstmpg123.so libgstwavparse.so libgstautodetect.so
    libgstpulse.so
  )
  for plugin in "${gst_plugins[@]}"; do
    [[ -f "$gst_dir/$plugin" ]] && deploy_args+=(--library "$gst_dir/$plugin")
  done
  scanner="$(dpkg-query -L libgstreamer1.0-0 | grep '/gst-plugin-scanner$' | head -n1 || true)"
  [[ -x "$scanner" ]] && deploy_args+=(--executable "$scanner")

  export NO_STRIP=1 DEPLOY_GTK_VERSION=3 PATH="$tools:$PATH"
  export LINUXDEPLOY="$linuxdeploy_wrapper"
  "$linuxdeploy_wrapper" "${deploy_args[@]}"
  "$gtk_plugin" --appdir "$appdir"

  mkdir -p "$appdir/usr/lib/webkit2gtk-4.1"
  cp -a "$webkit_process_dir/." "$appdir/usr/lib/webkit2gtk-4.1/"
  for plugin in "${gst_plugins[@]}"; do
    if [[ -f "$gst_dir/$plugin" ]]; then
      cp -a "$gst_dir/$plugin" "$appdir/usr/lib/gstreamer-1.0/$plugin"
      rm -f "$appdir/usr/lib/$plugin"
    fi
  done
  if [[ -x "$scanner" ]]; then
    cp -a "$scanner" "$appdir/usr/libexec/gstreamer-1.0/gst-plugin-scanner"
    rm -f "$appdir/usr/bin/$(basename "$scanner")"
  fi
  for process in WebKitWebProcess WebKitNetworkProcess WebKitGPUProcess; do
    rm -f "$appdir/usr/bin/$process"
  done

  # AppImage guidance deliberately relies on the host for glibc/the ELF loader.
  rm -f "$appdir/usr/lib/libc.so."* "$appdir/usr/lib/ld-linux"* "$appdir/usr/lib/libpthread.so."* \
    "$appdir/usr/lib/libdl.so."* "$appdir/usr/lib/librt.so."* "$appdir/usr/lib/libm.so."*

  copy_core "$appdir"
  write_bundled_apprun "$appdir"
  pack_appimage "$appdir" "$output_dir/$PV_APPIMAGE_BUNDLED_NAME"
  find "$appdir" -printf '%P\t%y\t%s\n' | sort > "$evidence_dir/bundled-appdir-inventory.txt"
  du -sb "$appdir/usr/bin" "$appdir/usr/lib" "$appdir/usr/share" "$appdir/apprun-hooks" 2>/dev/null \
    | sort -n > "$evidence_dir/bundled-appdir-category-bytes.txt" || true
  dpkg-query -W -f='${Package}\t${Version}\t${Architecture}\n' \
    libwebkit2gtk-4.1-0 libjavascriptcoregtk-4.1-0 libgtk-3-0 libglib2.0-0 \
    libgstreamer1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-pulseaudio \
    > "$evidence_dir/bundled-package-versions.txt"
}

case "$mode" in
  thin) build_thin ;;
  bundled) build_bundled ;;
  all) build_thin; build_bundled ;;
esac

for candidate in "$PV_APPIMAGE_THIN_NAME" "$PV_APPIMAGE_BUNDLED_NAME"; do
  [[ -f "$output_dir/$candidate" ]] || continue
  printf '%s\t%s\t%s\n' "$candidate" "$(stat -c%s "$output_dir/$candidate")" \
    "$(sha256sum "$output_dir/$candidate" | awk '{print $1}')"
done | tee "$evidence_dir/appimage-artifacts.txt"
