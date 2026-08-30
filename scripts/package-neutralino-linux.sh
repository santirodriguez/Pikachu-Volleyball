#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
source packaging/linux/metadata.env

format=all
input_bundle="${PV_PRODUCTION_BUNDLE:-$root/neutralino-production-artifact/$PV_INTERNAL_BUNDLE_NAME}"
output_dir="${PV_DISTRIBUTION_OUTPUT:-$root/linux-distribution}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format) format="${2:?missing value for --format}"; shift 2 ;;
    --input) input_bundle="${2:?missing value for --input}"; shift 2 ;;
    --output) output_dir="${2:?missing value for --output}"; shift 2 ;;
    -h|--help)
      echo 'usage: package-neutralino-linux.sh [--format all|portable|deb|rpm] [--input PATH] [--output PATH]'
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$format" in all|portable|deb|rpm) ;; *) echo "Unsupported distribution format: $format" >&2; exit 2 ;; esac

input_bundle="$(readlink -f "$input_bundle")"
mkdir -p "$output_dir"
output_dir="$(readlink -f "$output_dir")"
for relative in "$PV_BINARY_NAME" "extensions/$PV_EXTENSION_NAME" provenance.json SHA256SUMS; do
  [[ -f "$input_bundle/$relative" ]] || { echo "Missing Neutralino production input: $relative" >&2; exit 1; }
done
[[ -x "$input_bundle/$PV_BINARY_NAME" ]]
[[ -x "$input_bundle/extensions/$PV_EXTENSION_NAME" ]]
(cd "$input_bundle" && sha256sum -c SHA256SUMS)

provenance_epoch="$(sed -n 's/^[[:space:]]*"sourceDateEpoch":[[:space:]]*\([0-9][0-9]*\),\{0,1\}[[:space:]]*$/\1/p' "$input_bundle/provenance.json" | head -n 1)"
[[ "$provenance_epoch" =~ ^[0-9]+$ ]] || { echo 'Invalid sourceDateEpoch in provenance.' >&2; exit 1; }
SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$provenance_epoch}"
[[ "$SOURCE_DATE_EPOCH" = "$provenance_epoch" ]] || { echo 'SOURCE_DATE_EPOCH does not match production provenance.' >&2; exit 1; }
export SOURCE_DATE_EPOCH TZ=UTC LC_ALL=C

portable_name="${PV_PORTABLE_BUNDLE_NAME}.tar.gz"
deb_name="${PV_PACKAGE_NAME}_${PV_PACKAGE_VERSION}_${PV_DEB_ARCH}.deb"
rpm_name="${PV_PACKAGE_NAME}-${PV_PACKAGE_VERSION}-${PV_PACKAGE_RELEASE}.${PV_RPM_ARCH}.rpm"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/pv-linux-distribution.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

copy_payload() {
  local destination="$1"
  install -Dm755 "$input_bundle/$PV_BINARY_NAME" "$destination/$PV_BINARY_NAME"
  install -Dm755 "$input_bundle/extensions/$PV_EXTENSION_NAME" "$destination/extensions/$PV_EXTENSION_NAME"
  install -Dm644 "$input_bundle/provenance.json" "$destination/provenance.json"
  install -Dm644 "$input_bundle/SHA256SUMS" "$destination/SHA256SUMS"
}

write_readme() {
  local destination="$1"
  mkdir -p "$(dirname "$destination")"
  cat > "$destination" <<EOF_README
$PV_DISPLAY_NAME — Linux x86_64

This distribution uses system GTK 3 and WebKitGTK instead of bundling a browser runtime.
WebKitGTK 4.1 is preferred; the accepted Neutralino runtime can also use the 4.0 ABI.
GStreamer Good plugins are required for the validated MP3/WAV path. xdg-utils provides
xdg-open for approved external links after native URL validation.

Recommended installation:
- Debian/Ubuntu: install the supplied .deb.
- Fedora: install the supplied .rpm.
- Portable: extract the .tar.gz after installing the required desktop libraries.

No Node.js, Python, Electron, Chromium, compiler, or development package is bundled.
EOF_README
}

write_launcher() {
  local destination="$1"
  mkdir -p "$(dirname "$destination")"
  printf '#!/bin/sh\nexec %s/%s "$@"\n' "$PV_INSTALL_DIR" "$PV_BINARY_NAME" > "$destination"
  chmod 0755 "$destination"
}

write_desktop() {
  local destination="$1"
  mkdir -p "$(dirname "$destination")"
  cat > "$destination" <<EOF_DESKTOP
[Desktop Entry]
Type=Application
Name=$PV_DISPLAY_NAME
Exec=$PV_LAUNCHER_NAME
Icon=$PV_APPLICATION_ID
Terminal=false
Categories=Game;ArcadeGame;
StartupNotify=true
EOF_DESKTOP
}

normalize_tree() { find "$1" -print0 | xargs -0 touch -h -d "@$SOURCE_DATE_EPOCH"; }

build_portable() {
  local stage="$work_dir/portable/$PV_PORTABLE_BUNDLE_NAME"
  mkdir -p "$stage"
  copy_payload "$stage"
  write_readme "$stage/README-LINUX.txt"
  (cd "$stage" && sha256sum "$PV_BINARY_NAME" "extensions/$PV_EXTENSION_NAME" provenance.json README-LINUX.txt > SHA256SUMS)
  normalize_tree "$work_dir/portable"
  tar --sort=name --mtime="@$SOURCE_DATE_EPOCH" --owner=0 --group=0 --numeric-owner -C "$work_dir/portable" -cf - "$PV_PORTABLE_BUNDLE_NAME" | gzip -n > "$output_dir/$portable_name"
}

build_deb() {
  command -v dpkg-deb >/dev/null
  local stage="$work_dir/deb-root"
  copy_payload "$stage$PV_INSTALL_DIR"
  write_launcher "$stage/usr/bin/$PV_LAUNCHER_NAME"
  write_desktop "$stage/usr/share/applications/$PV_APPLICATION_ID.desktop"
  install -Dm644 "$PV_ICON_SOURCE" "$stage/usr/share/icons/hicolor/512x512/apps/$PV_APPLICATION_ID.png"
  write_readme "$stage/usr/share/doc/$PV_PACKAGE_NAME/README-LINUX.txt"
  mkdir -p "$stage/DEBIAN"
  cat > "$stage/DEBIAN/control" <<EOF_CONTROL
Package: $PV_PACKAGE_NAME
Version: $PV_PACKAGE_VERSION
Section: games
Priority: optional
Architecture: $PV_DEB_ARCH
Maintainer: $PV_MAINTAINER
Depends: $PV_DEB_DEPENDS
Homepage: $PV_HOMEPAGE
Description: $PV_SUMMARY
 Lightweight Linux desktop package using the system GTK/WebKitGTK runtime.
EOF_CONTROL
  normalize_tree "$stage"
  dpkg-deb --root-owner-group -Zgzip -z9 --build "$stage" "$output_dir/$deb_name"
}

build_rpm() {
  command -v rpmbuild >/dev/null
  local top="$work_dir/rpmbuild" sources spec requirement requires=''
  sources="$top/SOURCES"
  spec="$top/SPECS/$PV_PACKAGE_NAME.spec"
  mkdir -p "$sources" "$top/SPECS" "$top/BUILD" "$top/BUILDROOT" "$top/RPMS" "$top/SRPMS"
  install -m755 "$input_bundle/$PV_BINARY_NAME" "$sources/$PV_BINARY_NAME"
  install -m755 "$input_bundle/extensions/$PV_EXTENSION_NAME" "$sources/$PV_EXTENSION_NAME"
  install -m644 "$input_bundle/provenance.json" "$sources/provenance.json"
  install -m644 "$input_bundle/SHA256SUMS" "$sources/SHA256SUMS"
  write_launcher "$sources/$PV_LAUNCHER_NAME"
  write_desktop "$sources/$PV_APPLICATION_ID.desktop"
  install -m644 "$PV_ICON_SOURCE" "$sources/$PV_APPLICATION_ID.png"
  write_readme "$sources/README-LINUX.txt"
  for requirement in $PV_RPM_REQUIRES; do requires+="Requires:       $requirement"$'\n'; done
  cat > "$spec" <<EOF_SPEC
Name:           $PV_PACKAGE_NAME
Version:        $PV_PACKAGE_VERSION
Release:        $PV_PACKAGE_RELEASE
Summary:        $PV_SUMMARY
License:        LicenseRef-Proprietary
URL:            $PV_HOMEPAGE
ExclusiveArch:  $PV_RPM_ARCH
${requires%$'\n'}

%global pv_install_dir $PV_INSTALL_DIR
%global pv_source_date_epoch $SOURCE_DATE_EPOCH

%description
Lightweight Linux desktop package using the system GTK/WebKitGTK runtime.

%prep
%build
%install
rm -rf %{buildroot}
install -Dm755 %{_sourcedir}/$PV_BINARY_NAME %{buildroot}%{pv_install_dir}/$PV_BINARY_NAME
install -Dm755 %{_sourcedir}/$PV_EXTENSION_NAME %{buildroot}%{pv_install_dir}/extensions/$PV_EXTENSION_NAME
install -Dm644 %{_sourcedir}/provenance.json %{buildroot}%{pv_install_dir}/provenance.json
install -Dm644 %{_sourcedir}/SHA256SUMS %{buildroot}%{pv_install_dir}/SHA256SUMS
install -Dm755 %{_sourcedir}/$PV_LAUNCHER_NAME %{buildroot}%{_bindir}/$PV_LAUNCHER_NAME
install -Dm644 %{_sourcedir}/$PV_APPLICATION_ID.desktop %{buildroot}%{_datadir}/applications/$PV_APPLICATION_ID.desktop
install -Dm644 %{_sourcedir}/$PV_APPLICATION_ID.png %{buildroot}%{_datadir}/icons/hicolor/512x512/apps/$PV_APPLICATION_ID.png
install -Dm644 %{_sourcedir}/README-LINUX.txt %{buildroot}%{_docdir}/$PV_PACKAGE_NAME/README-LINUX.txt
find %{buildroot} -print0 | xargs -0 touch -h -d "@%{pv_source_date_epoch}"

%files
%{pv_install_dir}/$PV_BINARY_NAME
%{pv_install_dir}/extensions/$PV_EXTENSION_NAME
%{pv_install_dir}/provenance.json
%{pv_install_dir}/SHA256SUMS
%{_bindir}/$PV_LAUNCHER_NAME
%{_datadir}/applications/$PV_APPLICATION_ID.desktop
%{_datadir}/icons/hicolor/512x512/apps/$PV_APPLICATION_ID.png
%{_docdir}/$PV_PACKAGE_NAME/README-LINUX.txt
EOF_SPEC
  normalize_tree "$sources"
  touch -h -d "@$SOURCE_DATE_EPOCH" "$spec"
  SOURCE_DATE_EPOCH="$SOURCE_DATE_EPOCH" rpmbuild -bb --define "_topdir $top" --define "_buildhost reproducible" --define "use_source_date_epoch_as_buildtime 1" --define "clamp_mtime_to_source_date_epoch 1" "$spec"
  local built_rpm
  built_rpm="$(find "$top/RPMS" -type f -name '*.rpm' -print -quit)"
  [[ -n "$built_rpm" ]]
  cp "$built_rpm" "$output_dir/$rpm_name"
}

case "$format" in
  all) build_portable; build_deb; build_rpm ;;
  portable) build_portable ;;
  deb) build_deb ;;
  rpm) build_rpm ;;
esac

if [[ -n "${PV_HOST_UID:-}" ]]; then chown -R "$PV_HOST_UID:${PV_HOST_GID:-$PV_HOST_UID}" "$output_dir"; fi
printf 'PV_LINUX_DISTRIBUTION_FORMAT=%s\n' "$format"
printf 'PV_LINUX_DISTRIBUTION_SOURCE_DATE_EPOCH=%s\n' "$SOURCE_DATE_EPOCH"
for artifact in "$portable_name" "$deb_name" "$rpm_name"; do
  [[ -f "$output_dir/$artifact" ]] || continue
  printf 'PV_LINUX_DISTRIBUTION_ARTIFACT file=%s bytes=%s sha256=%s\n' "$artifact" "$(stat -c%s "$output_dir/$artifact")" "$(sha256sum "$output_dir/$artifact" | awk '{print $1}')"
done
