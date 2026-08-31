'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const envText = fs.readFileSync(path.join(root, 'packaging/linux/appimage-spike.env'), 'utf8');
const scriptText = fs.readFileSync(path.join(root, 'scripts/build-neutralino-appimage-spike.sh'), 'utf8');
const runtimeSmokeText = fs.readFileSync(
  path.join(root, 'scripts/run-neutralino-appimage-runtime-smoke.sh'),
  'utf8',
);
const smokeProbeText = fs.readFileSync(
  path.join(root, 'test/neutralino/smoke-probe.js'),
  'utf8',
);
const hostNavigationProbeText = fs.readFileSync(
  path.join(root, 'test/neutralino/host-navigation-probe.js'),
  'utf8',
);
const hostNavigationSmokeText = fs.readFileSync(
  path.join(root, 'scripts/run-neutralino-host-navigation-smoke.sh'),
  'utf8',
);

function envValue(name) {
  const match = envText.match(new RegExp(`^${name}=(.+)$`, 'm'));
  assert.ok(match, `missing ${name}`);
  return match[1].trim();
}

test('AppImage spike pins immutable tool identities and hashes', () => {
  for (const name of [
    'PV_APPIMAGE_TOOL_COMMIT',
    'PV_APPIMAGE_RUNTIME_COMMIT',
    'PV_LINUXDEPLOY_COMMIT',
    'PV_LINUXDEPLOY_GTK_COMMIT',
  ]) {
    assert.match(envValue(name), /^[0-9a-f]{40}$/);
  }
  for (const name of [
    'PV_APPIMAGE_TOOL_SHA256',
    'PV_APPIMAGE_RUNTIME_SHA256',
    'PV_LINUXDEPLOY_SHA256',
  ]) {
    assert.match(envValue(name), /^[0-9a-f]{64}$/);
  }
  assert.match(envValue('PV_LINUXDEPLOY_GTK_GIT_BLOB'), /^[0-9a-f]{40}$/);
  assert.match(envValue('PV_APPIMAGE_BUILDER_IMAGE'), /@sha256:[0-9a-f]{64}$/);
  assert.match(envValue('PV_APPIMAGE_DEBIAN12_IMAGE'), /@sha256:[0-9a-f]{64}$/);
  assert.match(envValue('PV_APPIMAGE_UBUNTU2204_IMAGE'), /@sha256:[0-9a-f]{64}$/);
  assert.match(envValue('PV_APPIMAGE_UBUNTU2404_IMAGE'), /@sha256:[0-9a-f]{64}$/);
  assert.match(envValue('PV_APPIMAGE_FEDORA44_IMAGE'), /@sha256:[0-9a-f]{64}$/);
  assert.match(envValue('PV_APPIMAGE_OPENSUSE160_IMAGE'), /@sha256:[0-9a-f]{64}$/);
});

test('thin and bundled candidates remain distinct one-file AppImage experiments', () => {
  const thin = envValue('PV_APPIMAGE_THIN_NAME');
  const bundled = envValue('PV_APPIMAGE_BUNDLED_NAME');
  assert.notEqual(thin, bundled);
  assert.match(thin, /\.AppImage$/);
  assert.match(bundled, /\.AppImage$/);
  assert.match(scriptText, /--runtime-file/);
  assert.match(scriptText, /APPIMAGE_EXTRACT_AND_RUN=1/);
});

test('AppImage spike preserves accepted relative native-extension layout', () => {
  assert.match(
    scriptText,
    /usr\/bin\/extensions\/\$PV_EXTENSION_NAME/,
    'external-link helper must remain next to the Neutralino executable under extensions/',
  );
  assert.match(scriptText, /NO_STRIP=1/);
  assert.match(scriptText, /copy_core "\$appdir"/);
});

test('bundled candidate does not intentionally ship glibc or the ELF loader', () => {
  assert.match(scriptText, /libc\.so/);
  assert.match(scriptText, /ld-linux/);
  assert.match(scriptText, /rm -f .*libc\.so/s);
  assert.match(scriptText, /GST_PLUGIN_SYSTEM_PATH_1_0=/);
});

test('thin preflight finds WebKitGTK in standard loader paths', () => {
  const thinFunction = scriptText.match(
    /write_thin_apprun\(\) \{[\s\S]*?\n\}\n\nwrite_bundled_apprun\(\)/,
  );
  assert.ok(thinFunction);
  assert.match(thinFunction[0], /ldd_output=/);
  assert.match(thinFunction[0], /\/usr\/lib\*\/\*\/libwebkit2gtk-4\.1\.so\.0/);
  assert.match(thinFunction[0], /\/usr\/lib\*\/libwebkit2gtk-4\.0\.so\.37/);
  assert.match(thinFunction[0], /if \[ -r "\\\$candidate" \]/);
  assert.doesNotMatch(thinFunction[0], /ldconfig\s+-p/);
});

test('AppImage runtime smoke propagates stage failures', () => {
  assert.match(
    runtimeSmokeText,
    /if "\$@" >"\$result_dir\/\$name\.log" 2>&1; then[\s\S]*?else\s+local status=\$\?[\s\S]*?return "\$status"[\s\S]*?fi/,
  );
  assert.doesNotMatch(runtimeSmokeText, /fi\s+local status=\$\?/);
});

test('AppImage runtime smoke adapts the validation stage to the production bundle contract', () => {
  assert.match(
    runtimeSmokeText,
    /production_launcher="\$stage\/pikachu-volleyball-neutralino-linux_x64"/,
  );
  assert.match(runtimeSmokeText, /ln -s bin\/neutralino-linux_x64 "\$production_launcher"/);
  assert.match(
    runtimeSmokeText,
    /run_stage production-window[\s\S]*?"\$stage"\s+rm -f "\$production_launcher"[\s\S]*?run_stage gameplay-input-audio-quit/,
  );
});

test('Neutralino settings smoke waits for rerendered persisted state', () => {
  assert.match(smokeProbeText, /function readSettingState/);
  assert.match(smokeProbeText, /async function cycleSettingAndWait/);
  assert.match(smokeProbeText, /current\.stored === current\.value/);
  const settingsProbe = smokeProbeText.match(
    /async function probePauseAndAudioSettings\(\) \{[\s\S]*?\n {2}\}\n\n {2}async function probeRestart/,
  );
  assert.ok(settingsProbe);
  assert.match(settingsProbe[0], /audioPanelReady = await waitFor/);
  assert.match(settingsProbe[0], /cycleSettingAndWait\('bgm'/);
  assert.match(settingsProbe[0], /cycleSettingAndWait\('sfx'/);
  assert.doesNotMatch(settingsProbe[0], /await delay\((25|50)\)/);
});

test('host-navigation smoke isolates rejected top-level navigations by process', () => {
  assert.match(hostNavigationProbeText, /--dev-pv-host-navigation-case=/);
  assert.match(hostNavigationProbeText, /PV_NEUTRALINO_HOST_NAVIGATION_READY/);
  assert.doesNotMatch(hostNavigationProbeText, /attempts\.push|attemptNavigation/);
  assert.match(runtimeSmokeText, /run_stage host-navigation bash/);
  assert.match(
    hostNavigationSmokeText,
    /navigation_cases=\(assign href replace anchor data file approved\)/,
  );
  assert.match(hostNavigationSmokeText, /xdotool getwindowname/);
  assert.match(hostNavigationSmokeText, /PV_EXTERNAL_LINK rejected/);
  assert.match(
    hostNavigationSmokeText,
    /PV_EXTERNAL_LINK opened https:\/\/santiagorodriguez\.com\//,
  );
  assert.match(hostNavigationSmokeText, /Untrusted same-window navigation reached the attacker origin/);
});

test('spike does not reintroduce retired Electron packaging', () => {
  assert.doesNotMatch(envText, /electron/i);
  assert.doesNotMatch(scriptText, /electron-builder|app\.asar|chrome-sandbox/i);
});
