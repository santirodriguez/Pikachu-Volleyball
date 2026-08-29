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
  '  if [ "$arg" = --no-sandbox ] ; then',
  '    echo "ERROR: --no-sandbox is disabled by this AppImage security policy." >&2',
  '    exit 1',
  '  fi',
  'done',
  '',
  '# Fail closed when the user-namespace sandbox prerequisite is unavailable.',
  '# Never downgrade to --no-sandbox.',
  'if ! command -v unshare >/dev/null 2>&1 || ! unshare -Ur true 2>/dev/null ; then',
  '  echo "ERROR: Chromium sandbox prerequisites are unavailable; refusing to launch unsandboxed." >&2',
  '  exit 1',
  'fi',
].join('\n');

source =
  source.slice(0, startIndex) +
  failClosedSandboxBlock +
  source.slice(endIndex);

const execWithoutArgs = 'exec "$BIN" "\\${NO_SANDBOX[@]}"';
const execWithArgs = 'exec "$BIN" "\\${NO_SANDBOX[@]}" "\\${args[@]}"';

if (countOccurrences(source, execWithoutArgs) !== 1) {
  fail('expected zero-argument AppRun exec form was not found exactly once');
}
if (countOccurrences(source, execWithArgs) !== 1) {
  fail('expected argument-forwarding AppRun exec form was not found exactly once');
}

source = source.replace(execWithoutArgs, 'exec "$BIN"');
source = source.replace(execWithArgs, 'exec "$BIN" "\\${args[@]}"');

for (const forbiddenFragment of [
  'NO_SANDBOX=(--no-sandbox)',
  '\\${NO_SANDBOX[@]}',
  'HAVE_NO_SANDBOX=0',
]) {
  if (source.includes(forbiddenFragment)) {
    fail(`forbidden fallback fragment remains after patch: ${forbiddenFragment}`);
  }
}

for (const requiredFragment of [
  'export LD_LIBRARY_PATH="\\${APPDIR}/usr/lib\\${LD_LIBRARY_PATH:+:\\${LD_LIBRARY_PATH}}"',
  'ERROR: --no-sandbox is disabled by this AppImage security policy.',
  'ERROR: Chromium sandbox prerequisites are unavailable; refusing to launch unsandboxed.',
]) {
  if (!source.includes(requiredFragment)) {
    fail(`required patched fragment is missing: ${requiredFragment}`);
  }
}

fs.writeFileSync(targetPath, source, 'utf8');

console.log(
  `Patched app-builder-lib ${EXPECTED_APP_BUILDER_LIB_VERSION} AppImage launcher to fail closed on sandbox errors.`
);
