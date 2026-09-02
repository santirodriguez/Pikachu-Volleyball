'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

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
  if (markerIndex === -1) fail(`could not locate ${marker} in AppRun exec line`);
  const openingQuote = line.lastIndexOf('"', markerIndex);
  const closingQuote = line.indexOf('"', markerIndex);
  if (openingQuote === -1 || closingQuote === -1 || closingQuote <= openingQuote) {
    fail(`could not isolate quoted ${marker} expansion in AppRun exec line`);
  }
  let endIndex = closingQuote + 1;
  if (line[endIndex] === ' ') endIndex += 1;
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
const sourceSha256 = crypto.createHash('sha256').update(originalBuffer).digest('hex');
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
for (const fragment of [
  'for arg in "\\${args[@]}" ; do',
  'if [ "$arg" = --no-sandbox ] ; then',
  "# Use 'unshare -Ur true' as a heuristic",
  'if [ $HAVE_NO_SANDBOX -eq 0 ] && ! unshare -Ur true 2>/dev/null ; then',
  'NO_SANDBOX=(--no-sandbox)',
]) {
  if (!upstreamSandboxBlock.includes(fragment)) {
    fail(`expected upstream fragment not found: ${fragment}`);
  }
}

const failClosedSandboxBlock = [
  '# Pikachu Volleyball security policy: sandboxing and packaged renderer boundaries are mandatory.',
  'for arg in "\\${args[@]}" ; do',
  '  case "$arg" in',
  '    --no-sandbox|-no-sandbox|--no-sandbox=*|-no-sandbox=*|\\',
  '    --disable-gpu-sandbox|-disable-gpu-sandbox|--disable-gpu-sandbox=*|-disable-gpu-sandbox=*|\\',
  '    --disable-namespace-sandbox|-disable-namespace-sandbox|--disable-namespace-sandbox=*|-disable-namespace-sandbox=*|\\',
  '    --disable-seccomp-filter-sandbox|-disable-seccomp-filter-sandbox|--disable-seccomp-filter-sandbox=*|-disable-seccomp-filter-sandbox=*|\\',
  '    --disable-setuid-sandbox|-disable-setuid-sandbox|--disable-setuid-sandbox=*|-disable-setuid-sandbox=*|\\',
  '    --no-zygote-sandbox|-no-zygote-sandbox|--no-zygote-sandbox=*|-no-zygote-sandbox=*|\\',
  '    --gpu-sandbox-allow-sysv-shm|-gpu-sandbox-allow-sysv-shm|--gpu-sandbox-allow-sysv-shm=*|-gpu-sandbox-allow-sysv-shm=*|\\',
  '    --allow-sandbox-debugging|-allow-sandbox-debugging|--allow-sandbox-debugging=*|-allow-sandbox-debugging=*|\\',
  '    --disable-web-security|-disable-web-security|--disable-web-security=*|-disable-web-security=*|\\',
  '    --allow-file-access-from-files|-allow-file-access-from-files|--allow-file-access-from-files=*|-allow-file-access-from-files=*|\\',
  '    --allow-running-insecure-content|-allow-running-insecure-content|--allow-running-insecure-content=*|-allow-running-insecure-content=*|\\',
  '    --remote-debugging-port|-remote-debugging-port|--remote-debugging-port=*|-remote-debugging-port=*|\\',
  '    --remote-debugging-pipe|-remote-debugging-pipe|--remote-debugging-pipe=*|-remote-debugging-pipe=*|\\',
  '    --inspect|-inspect|--inspect=*|-inspect=*|--inspect-brk|-inspect-brk|--inspect-brk=*|-inspect-brk=*|\\',
  '    --js-flags|-js-flags|--js-flags=*|-js-flags=*|\\',
  '    --disable-site-isolation-trials|-disable-site-isolation-trials|--disable-site-isolation-trials=*|-disable-site-isolation-trials=*|\\',
  '    --disable-features|-disable-features|--disable-features=*|-disable-features=*)',
  '      echo "ERROR: security-relaxing Chromium/Electron switch is disabled by this AppImage security policy: $arg" >&2',
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
source = source.slice(0, startIndex) + failClosedSandboxBlock + source.slice(endIndex);

const lines = source.split('\n');
const noSandboxMarker = 'NO_SANDBOX[@]';
const execLineIndexes = [];
for (let index = 0; index < lines.length; index += 1) {
  if (lines[index].includes('exec "$BIN"') && lines[index].includes(noSandboxMarker)) {
    execLineIndexes.push(index);
  }
}
if (execLineIndexes.length !== 2) {
  fail(
    `expected exactly two AppRun exec lines containing ${noSandboxMarker}, found ${execLineIndexes.length}`
  );
}
for (const index of execLineIndexes) {
  lines[index] = removeQuotedExpansion(lines[index], noSandboxMarker);
}
source = lines.join('\n');

for (const forbidden of [
  'NO_SANDBOX[@]',
  'NO_SANDBOX=(--no-sandbox)',
  'HAVE_NO_SANDBOX=0',
]) {
  if (source.includes(forbidden)) {
    fail(`forbidden fallback fragment remains after patch: ${forbidden}`);
  }
}
for (const required of [
  'ERROR: security-relaxing Chromium/Electron switch is disabled by this AppImage security policy:',
  '--disable-seccomp-filter-sandbox',
  '--no-zygote-sandbox',
  '--gpu-sandbox-allow-sysv-shm',
  '--allow-sandbox-debugging',
  '--disable-web-security',
  '--remote-debugging-port',
  '--inspect-brk',
  '--disable-features',
  'ERROR: Chromium sandbox prerequisites are unavailable; refusing to launch unsandboxed.',
  'exec "$BIN"',
  'args[@]',
]) {
  if (!source.includes(required)) {
    fail(`required patched fragment is missing: ${required}`);
  }
}

fs.writeFileSync(targetPath, source, 'utf8');
console.log(
  `Patched app-builder-lib ${EXPECTED_APP_BUILDER_LIB_VERSION} AppImage launcher to fail closed on security-relaxing runtime arguments and sandbox errors.`
);
