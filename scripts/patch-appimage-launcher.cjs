'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EXPECTED_APP_BUILDER_LIB_VERSION = '26.15.7';
const EXPECTED_SOURCE_SHA256 =
  '4d3b63afc9939ace718e0b3537e2b1508c15fde7fd030206cbe207bcb6a8f030';
const TARGET_RELATIVE_PATH = path.join(
  'out',
  'targets',
  'appimage',
  'appImageUtil.js'
);

function fail(message) {
  throw new Error(`AppImage sandbox patch refused: ${message}`);
}

function countOccurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

function removeQuotedExpansion(line, marker) {
  const markerIndex = line.indexOf(marker);
  if (markerIndex === -1) {
    fail(`could not locate ${marker} in AppRun exec line`);
  }

  const openingQuote = line.lastIndexOf('"', markerIndex);
  const closingQuote = line.indexOf('"', markerIndex);
  if (openingQuote === -1 || closingQuote === -1 || closingQuote <= openingQuote) {
    fail(`could not isolate quoted ${marker} expansion in AppRun exec line`);
  }

  let endIndex = closingQuote + 1;
  if (line[endIndex] === ' ') {
    endIndex += 1;
  }

  return line.slice(0, openingQuote) + line.slice(endIndex);
}

const packageJsonPath = require.resolve('app-builder-lib/package.json');
const packageDir = path.dirname(packageJsonPath);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (packageJson.version !== EXPECTED_APP_BUILDER_LIB_VERSION) {
  fail(
    `expected app-builder-lib ${EXPECTED_APP_BUILDER_LIB_VERSION}, found ${packageJson.version}`
  );
}

const targetPath = path.join(packageDir, TARGET_RELATIVE_PATH);
const originalBuffer = fs.readFileSync(targetPath);
const sourceSha256 = crypto
  .createHash('sha256')
  .update(originalBuffer)
  .digest('hex');

if (sourceSha256 !== EXPECTED_SOURCE_SHA256) {
  fail(
    `unexpected ${TARGET_RELATIVE_PATH} SHA-256 ${sourceSha256}; expected ${EXPECTED_SOURCE_SHA256}`
  );
}

let source = originalBuffer.toString('utf8');

const sandboxBlockStart = 'HAVE_NO_SANDBOX=0\n';
const sandboxBlockEnd = '\n\natexit()\n{';
const startIndex = source.indexOf(sandboxBlockStart);
const endIndex = source.indexOf(sandboxBlockEnd, startIndex);

if (startIndex === -1 || endIndex === -1) {
  fail('could not locate the upstream sandbox fallback block');
}
if (countOccurrences(source, sandboxBlockStart) !== 1) {
  fail('upstream sandbox fallback start marker is not unique');
}
if (countOccurrences(source, sandboxBlockEnd) !== 1) {
  fail('AppRun atexit boundary is not unique');
}

const upstreamSandboxBlock = source.slice(startIndex, endIndex);
for (const requiredFragment of [
  'for arg in "\\${args[@]}" ; do',
  'if [ "$arg" = --no-sandbox ] ; then',
  "# Use 'unshare -Ur true' as a heuristic",
  'if [ $HAVE_NO_SANDBOX -eq 0 ] && ! unshare -Ur true 2>/dev/null ; then',
  'NO_SANDBOX=(--no-sandbox)',
]) {
  if (!upstreamSandboxBlock.includes(requiredFragment)) {
    fail(`expected upstream fragment not found: ${requiredFragment}`);
  }
}

const failClosedSandboxBlock = [
  '# Pikachu Volleyball security policy: sandboxing is mandatory.',
  'for arg in "\\${args[@]}" ; do',
  '  case "$arg" in',
  '    --no-sandbox|-no-sandbox|--no-sandbox=*|-no-sandbox=*|\\',
  '    --disable-gpu-sandbox|-disable-gpu-sandbox|--disable-gpu-sandbox=*|-disable-gpu-sandbox=*|\\',
  '    --disable-namespace-sandbox|-disable-namespace-sandbox|--disable-namespace-sandbox=*|-disable-namespace-sandbox=*|\\',
  '    --disable-seccomp-filter-sandbox|-disable-seccomp-filter-sandbox|--disable-seccomp-filter-sandbox=*|-disable-seccomp-filter-sandbox=*|\\',
  '    --disable-setuid-sandbox|-disable-setuid-sandbox|--disable-setuid-sandbox=*|-disable-setuid-sandbox=*|\\',
  '    --no-zygote-sandbox|-no-zygote-sandbox|--no-zygote-sandbox=*|-no-zygote-sandbox=*|\\',
  '    --gpu-sandbox-allow-sysv-shm|-gpu-sandbox-allow-sysv-shm|--gpu-sandbox-allow-sysv-shm=*|-gpu-sandbox-allow-sysv-shm=*|\\',
  '    --allow-sandbox-debugging|-allow-sandbox-debugging|--allow-sandbox-debugging=*|-allow-sandbox-debugging=*)',
  '      echo "ERROR: sandbox-disabling Chromium switch is disabled by this AppImage security policy: $arg" >&2',
  '      trap - EXIT',
  '      exit 1',
  '      ;;',
  '  esac',
  'done',
  '',
  '# Fail closed when the user-namespace sandbox prerequisite is unavailable.',
  '# Never downgrade to --no-sandbox.',
  'if ! command -v unshare >/dev/null 2>&1 || ! unshare -Ur true 2>/dev/null ; then',
  '  echo "ERROR: Chromium sandbox prerequisites are unavailable; refusing to launch unsandboxed." >&2',
  '  trap - EXIT',
  '  exit 1',
  'fi',
].join('\n');

source =
  source.slice(0, startIndex) +
  failClosedSandboxBlock +
  source.slice(endIndex);

const lines = source.split('\n');
const noSandboxMarker = 'NO_SANDBOX[@]';
const execLineIndexes = [];
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (line.includes('exec "$BIN"') && line.includes(noSandboxMarker)) {
    execLineIndexes.push(index);
  }
}

if (execLineIndexes.length !== 2) {
  fail(
    `expected exactly two AppRun exec lines containing ${noSandboxMarker}, found ${execLineIndexes.length}`
  );
}

const zeroArgExecIndexes = execLineIndexes.filter(
  (index) => !lines[index].includes('args[@]')
);
const forwardingExecIndexes = execLineIndexes.filter((index) =>
  lines[index].includes('args[@]')
);

if (zeroArgExecIndexes.length !== 1 || forwardingExecIndexes.length !== 1) {
  fail('could not uniquely identify zero-argument and forwarding AppRun exec lines');
}

for (const index of execLineIndexes) {
  lines[index] = removeQuotedExpansion(lines[index], noSandboxMarker);
}
source = lines.join('\n');

if (countOccurrences(source, noSandboxMarker) !== 0) {
  fail(`forbidden ${noSandboxMarker} expansion remains after patch`);
}
for (const forbiddenFragment of [
  'NO_SANDBOX=(--no-sandbox)',
  'HAVE_NO_SANDBOX=0',
]) {
  if (source.includes(forbiddenFragment)) {
    fail(`forbidden fallback fragment remains after patch: ${forbiddenFragment}`);
  }
}

for (const requiredFragment of [
  'export LD_LIBRARY_PATH="\\${APPDIR}/usr/lib\\${LD_LIBRARY_PATH:+:\\${LD_LIBRARY_PATH}}"',
  'ERROR: sandbox-disabling Chromium switch is disabled by this AppImage security policy:',
  '--disable-seccomp-filter-sandbox',
  '--no-zygote-sandbox',
  '--gpu-sandbox-allow-sysv-shm',
  '--allow-sandbox-debugging',
  'ERROR: Chromium sandbox prerequisites are unavailable; refusing to launch unsandboxed.',
  'trap - EXIT',
  'exec "$BIN"',
  'args[@]',
]) {
  if (!source.includes(requiredFragment)) {
    fail(`required patched fragment is missing: ${requiredFragment}`);
  }
}

fs.writeFileSync(targetPath, source, 'utf8');

console.log(
  `Patched app-builder-lib ${EXPECTED_APP_BUILDER_LIB_VERSION} AppImage launcher to fail closed on sandbox errors.`
);
