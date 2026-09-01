#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

builder_image="ubuntu:focal-20250404@sha256:c664f8f86ed5a386b0a340d981b8f81714e21a8b9c73f658c4bea56aa179d54a"
builder_platform="linux/amd64"
apt_snapshot="20250404T000000Z"
host_ca_bundle="/etc/ssl/certs/ca-certificates.crt"
node_version="22.12.0"
node_archive="node-v${node_version}-linux-x64.tar.xz"
node_url="https://nodejs.org/dist/v${node_version}/${node_archive}"
node_sha256="22982235e1b71fa8850f82edd09cdae7e3f32df1764a9ec298c72d25ef2c164f"
neu_version="11.7.2"
neu_source_commit="387dca0aa4a100b3b69ef17774185fd6cb2c3da4"
source_sha="${PV_SOURCE_SHA:-${GITHUB_SHA:-$(git rev-parse HEAD)}}"
head_sha="$(git rev-parse HEAD)"
source_date_epoch="${SOURCE_DATE_EPOCH:-$(git show -s --format=%ct "$source_sha")}"
artifact="pikachu-volleyball-neutralino-production-parity-linux-x64.tar.gz"

if [[ "$source_sha" != "$head_sha" ]]; then
  echo "Refusing Neutralino production build: source SHA $source_sha does not match checked-out HEAD $head_sha." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "Refusing Neutralino production build from a dirty working tree." >&2
  git status --short --untracked-files=normal >&2
  exit 1
fi
if [[ ! "$source_date_epoch" =~ ^[0-9]+$ ]]; then
  echo "Invalid SOURCE_DATE_EPOCH: $source_date_epoch" >&2
  exit 1
fi
if [[ ! -s "$host_ca_bundle" ]]; then
  echo "Missing host CA bundle required to bootstrap pinned HTTPS inputs: $host_ca_bundle" >&2
  exit 1
fi

export PV_SOURCE_SHA="$source_sha"
export SOURCE_DATE_EPOCH="$source_date_epoch"

rm -rf .neutralino-production neutralino-production-artifact dist
rm -f "$artifact" "$artifact.sha256"
diagnostic_dir=".neutralino-production/diagnostics"
diagnostic_log="$diagnostic_dir/production-build.log"
mkdir -p "$diagnostic_dir"
: > "$diagnostic_log"
exec > >(tee -a "$diagnostic_log") 2>&1

printf 'PV_NEUTRALINO_PRODUCTION_BUILD_HEAD=%s\n' "$PV_SOURCE_SHA"
printf 'PV_NEUTRALINO_SOURCE_DATE_EPOCH=%s\n' "$SOURCE_DATE_EPOCH"
printf 'PV_NEUTRALINO_BUILDER_IMAGE=%s\n' "$builder_image"
printf 'PV_NEUTRALINO_BUILDER_PLATFORM=%s\n' "$builder_platform"
printf 'PV_NEUTRALINO_APT_SNAPSHOT=%s\n' "$apt_snapshot"
printf 'PV_NEUTRALINO_NODE_VERSION=%s\n' "$node_version"
printf 'PV_NEUTRALINO_NODE_SHA256=%s\n' "$node_sha256"
printf 'PV_NEUTRALINO_CLI_VERSION=%s\n' "$neu_version"
printf 'PV_NEUTRALINO_CLI_SOURCE_COMMIT=%s\n' "$neu_source_commit"
printf 'PV_NEUTRALINO_TLS_BOOTSTRAP_CA=%s\n' "$host_ca_bundle"

set +e
docker run --rm --platform "$builder_platform" \
  -e PV_SOURCE_SHA="$PV_SOURCE_SHA" \
  -e SOURCE_DATE_EPOCH="$SOURCE_DATE_EPOCH" \
  -e PV_NEUTRALINO_BUILDER_IMAGE="$builder_image" \
  -e PV_NEUTRALINO_BUILDER_PLATFORM="$builder_platform" \
  -e PV_NEUTRALINO_APT_SNAPSHOT="$apt_snapshot" \
  -e PV_NODE_VERSION="$node_version" \
  -e PV_NODE_ARCHIVE="$node_archive" \
  -e PV_NODE_URL="$node_url" \
  -e PV_NODE_SHA256="$node_sha256" \
  -e PV_NEU_VERSION="$neu_version" \
  -e PV_NEU_SOURCE_COMMIT="$neu_source_commit" \
  -e PV_ARTIFACT="$artifact" \
  --mount "type=bind,src=$host_ca_bundle,dst=/tmp/pv-host-ca.crt,readonly" \
  -v "$PWD:/workspace" -w /workspace "$builder_image" bash -lc '
    set -euxo pipefail
    export DEBIAN_FRONTEND=noninteractive

    sed -i "s/^deb /deb [snapshot=$PV_NEUTRALINO_APT_SNAPSHOT] /" /etc/apt/sources.list
    printf "Acquire::https::CaInfo \"/tmp/pv-host-ca.crt\";\n" > /etc/apt/apt.conf.d/49pv-bootstrap-ca
    apt_snapshot_ready=0
    for attempt in 1 2 3 4 5 6 7 8; do
      rm -rf /var/lib/apt/lists/*
      if apt-get update 2>&1 | tee /tmp/pv-apt-update.log &&
        grep -F "snapshot.ubuntu.com/ubuntu/$PV_NEUTRALINO_APT_SNAPSHOT" /tmp/pv-apt-update.log >/dev/null &&
        ! grep -Eq "^(W: Failed to fetch|W: Some index files failed to download)" /tmp/pv-apt-update.log; then
        apt_snapshot_ready=1
        break
      fi
      printf "PV_NEUTRALINO_APT_RETRY attempt=%s snapshot=%s\n" "$attempt" "$PV_NEUTRALINO_APT_SNAPSHOT" >&2
      retry_delay=$((attempt * 5))
      if (( retry_delay > 30 )); then
        retry_delay=30
      fi
      sleep "$retry_delay"
    done
    if (( apt_snapshot_ready != 1 )); then
      cat /tmp/pv-apt-update.log >&2
      echo "Pinned Ubuntu snapshot indexes did not download completely." >&2
      exit 1
    fi

    apt_install_ready=0
    for attempt in 1 2 3 4; do
      if apt-get install -y -f ca-certificates git gcc g++ binutils pkg-config cmake ninja-build libgtk-3-dev libwebkit2gtk-4.0-dev curl xz-utils; then
        apt_install_ready=1
        break
      fi
      printf "PV_NEUTRALINO_APT_INSTALL_RETRY attempt=%s snapshot=%s\n" "$attempt" "$PV_NEUTRALINO_APT_SNAPSHOT" >&2
      sleep "$((attempt * 5))"
    done
    if (( apt_install_ready != 1 )); then
      echo "Pinned Ubuntu snapshot packages did not download completely." >&2
      exit 1
    fi
    rm -f /etc/apt/apt.conf.d/49pv-bootstrap-ca

    curl --fail --location --silent --show-error "$PV_NODE_URL" -o "/tmp/$PV_NODE_ARCHIVE"
    printf "%s  %s\n" "$PV_NODE_SHA256" "/tmp/$PV_NODE_ARCHIVE" | sha256sum -c -
    mkdir -p /opt/pv-node
    tar -xJf "/tmp/$PV_NODE_ARCHIVE" --strip-components=1 -C /opt/pv-node
    export PATH="/opt/pv-node/bin:$PATH"
    test "$(node --version)" = "v$PV_NODE_VERSION"

    build_root=/tmp/pv-production-source
    neu_root=/tmp/pv-neu-cli
    mkdir -p "$build_root"
    tar -C /workspace \
      --exclude=.git \
      --exclude=node_modules \
      --exclude=dist \
      --exclude=.neutralino-production \
      --exclude=neutralino-production-artifact \
      --exclude="$PV_ARTIFACT" \
      --exclude="$PV_ARTIFACT.sha256" \
      -cf - . | tar -C "$build_root" -xf -

    git init -q "$neu_root"
    git -C "$neu_root" remote add origin https://github.com/neutralinojs/neutralinojs-cli.git
    git -C "$neu_root" fetch --depth=1 origin "$PV_NEU_SOURCE_COMMIT"
    git -C "$neu_root" checkout -q --detach FETCH_HEAD
    test "$(git -C "$neu_root" rev-parse HEAD)" = "$PV_NEU_SOURCE_COMMIT"
    test "$(node -p "require(\"$neu_root/package.json\").version")" = "$PV_NEU_VERSION"
    (cd "$neu_root" && npm ci --omit=dev)

    cd "$build_root"
    npm ci
    npm run build:web
    node scripts/prepare-neutralino-production.cjs
    (cd .neutralino-production && node "$neu_root/bin/neu.js" update)
    node scripts/prepare-neutralino-production.cjs --normalize-only

    export CC=gcc
    export CXX=g++
    ./scripts/build-neutralino-external-link-extension.sh
    ./scripts/build-neutralino-host-navigation-runtime.sh "$build_root/.neutralino-production/bin/neutralino-linux_x64"

    metadata="$build_root/.neutralino-production/build-toolchain.txt"
    {
      printf "builder_image=%s\n" "$PV_NEUTRALINO_BUILDER_IMAGE"
      printf "builder_platform=%s\n" "$PV_NEUTRALINO_BUILDER_PLATFORM"
      printf "apt_snapshot=%s\n" "$PV_NEUTRALINO_APT_SNAPSHOT"
      printf "source_date_epoch=%s\n" "$SOURCE_DATE_EPOCH"
      printf "node_distribution_url=%s\n" "$PV_NODE_URL"
      printf "node_distribution_sha256=%s\n" "$PV_NODE_SHA256"
      printf "node_path=%s\n" "$(readlink -f "$(command -v node)")"
      printf "node_version=%s\n" "$(node --version)"
      printf "npm_path=%s\n" "$(readlink -f "$(command -v npm)")"
      printf "npm_version=%s\n" "$(npm --version)"
      printf "project_package_lock_sha256=%s\n" "$(sha256sum package-lock.json | awk "{print \$1}")"
      printf "neu_version=%s\n" "$PV_NEU_VERSION"
      printf "neu_source_commit=%s\n" "$PV_NEU_SOURCE_COMMIT"
      printf "neu_package_lock_sha256=%s\n" "$(sha256sum "$neu_root/package-lock.json" | awk "{print \$1}")"
      printf "cc_path=%s\n" "$(readlink -f "$(command -v "$CC")")"
      printf "cc_version=%s\n" "$("$CC" -dumpfullversion -dumpversion)"
      printf "cxx_path=%s\n" "$(readlink -f "$(command -v "$CXX")")"
      printf "cxx_version=%s\n" "$("$CXX" -dumpfullversion -dumpversion)"
      for package in ca-certificates git gcc g++ binutils pkg-config cmake ninja-build libgtk-3-dev libwebkit2gtk-4.0-dev curl xz-utils; do
        printf "package.%s=%s\n" "$package" "$(dpkg-query -W -f="\${Version}" "$package")"
      done
    } > "$metadata"

    cat "$metadata"
    node scripts/validate-neutralino-external-link-extension.cjs
    (cd .neutralino-production && node "$neu_root/bin/neu.js" build --embed-resources)
    node scripts/report-neutralino-production.cjs

    rm -f "$PV_ARTIFACT" "$PV_ARTIFACT.sha256"
    tar --sort=name --mtime="UTC 1970-01-01" --owner=0 --group=0 --numeric-owner \
      -C neutralino-production-artifact -cf - pikachu-volleyball-neutralino-production-parity-linux-x64 | gzip -n > "$PV_ARTIFACT"
    sha256sum "$PV_ARTIFACT" > "$PV_ARTIFACT.sha256"
    printf "PV_NEUTRALINO_ARTIFACT file=%s bytes=%s sha256=%s\n" \
      "$PV_ARTIFACT" "$(stat -c%s "$PV_ARTIFACT")" "$(awk "{print \$1}" "$PV_ARTIFACT.sha256")"

    rm -rf /workspace/dist /workspace/neutralino-production-artifact
    find /workspace/.neutralino-production -mindepth 1 -maxdepth 1 ! -name diagnostics -exec rm -rf {} +
    cp -a dist /workspace/dist
    cp -a .neutralino-production/. /workspace/.neutralino-production/
    cp -a neutralino-production-artifact /workspace/neutralino-production-artifact
    cp "$PV_ARTIFACT" "/workspace/$PV_ARTIFACT"
    cp "$PV_ARTIFACT.sha256" "/workspace/$PV_ARTIFACT.sha256"
  '
build_status=$?
set -e

printf 'PV_NEUTRALINO_PRODUCTION_BUILD_EXIT_CODE=%s\n' "$build_status"
[[ "$build_status" -eq 0 ]] || exit "$build_status"

sudo chown -R "$(id -u):$(id -g)" .neutralino-production neutralino-production-artifact dist
sudo chown "$(id -u):$(id -g)" "$artifact" "$artifact.sha256"
