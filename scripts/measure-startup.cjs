'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'release', 'linux-unpacked');
const OUTPUT_PATH = path.resolve(
  process.argv[2] || path.join(ROOT, 'release', 'startup-metrics.json')
);
const TIMEOUT_MS = 20000;

function findExecutable() {
  const explicit = process.env.PV_LINUX_UNPACKED_EXECUTABLE;
  if (explicit) return path.resolve(explicit);

  const preferred = ['pikachu-volleyball', 'Pikachu Volleyball'];
  for (const name of preferred) {
    const candidate = path.join(APP_DIR, name);
    if (fs.existsSync(candidate)) return candidate;
  }

  if (!fs.existsSync(APP_DIR)) {
    throw new Error(`Missing packaged application directory: ${APP_DIR}`);
  }

  const ignored = new Set(['chrome-sandbox', 'chrome_crashpad_handler']);
  const candidates = fs
    .readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !ignored.has(entry.name))
    .map((entry) => path.join(APP_DIR, entry.name))
    .filter((filePath) => (fs.statSync(filePath).mode & 0o111) !== 0);

  if (candidates.length !== 1) {
    throw new Error(
      `Unable to identify packaged executable. Candidates: ${candidates.join(', ')}`
    );
  }
  return candidates[0];
}

function elapsed(marks, start, end) {
  if (marks[start] === undefined || marks[end] === undefined) return null;
  return Number((marks[end] - marks[start]).toFixed(2));
}

function main() {
  const executable = findExecutable();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.rmSync(OUTPUT_PATH, { force: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-startup-'));
  const child = spawn(executable, [], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PV_STARTUP_METRICS_FILE: OUTPUT_PATH,
      PV_STARTUP_USER_DATA_DIR: userDataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, TIMEOUT_MS);

  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    fs.rmSync(userDataDir, { recursive: true, force: true });

    if (!fs.existsSync(OUTPUT_PATH)) {
      process.stderr.write(stdout);
      process.stderr.write(stderr);
      throw new Error(
        `Startup measurement did not produce ${OUTPUT_PATH}; exit=${code}, signal=${signal}`
      );
    }

    const report = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    const marks = report.rendererMarks || {};
    const firstFrame = marks['pv-first-game-frame'];
    const menuUsable = marks['pv-menu-usable'];
    const processToFrame = report.endToEndMs?.processStartToFirstGameFrame;
    const processToMenu = report.endToEndMs?.processStartToMenuUsable;
    const componentDurations = {
      runtimeImport: elapsed(marks, 'pv-runtime-import-start', 'pv-runtime-start'),
      pixiSetup: elapsed(marks, 'pv-runtime-start', 'pv-pixi-ready'),
      rendererSetup: elapsed(marks, 'pv-pixi-ready', 'pv-renderer-ready'),
      spriteLoad: elapsed(marks, 'pv-sprite-load-start', 'pv-sprite-load-ready'),
      controllerConstruction: elapsed(
        marks,
        'pv-sprite-load-ready',
        'pv-game-controller-ready'
      ),
      settingsHydration: elapsed(
        marks,
        'pv-game-controller-ready',
        'pv-settings-ready'
      ),
      menuLauncherSetup: elapsed(
        marks,
        'pv-settings-ready',
        'pv-menu-launcher-ready'
      ),
      runtimeReadyToFirstFrame: elapsed(
        marks,
        'pv-runtime-ready',
        'pv-first-game-frame'
      ),
      menuPauseResponse: elapsed(
        marks,
        'pv-menu-open-request',
        'pv-menu-paused'
      ),
      menuImport: elapsed(
        marks,
        'pv-menu-import-start',
        'pv-menu-import-ready'
      ),
      menuMount: elapsed(marks, 'pv-menu-import-ready', 'pv-menu-mounted'),
      menuOpenToUsable: elapsed(
        marks,
        'pv-menu-open-request',
        'pv-menu-usable'
      ),
    };
    report.componentDurationsMs = componentDurations;
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);

    const lines = [
      '## Packaged startup report',
      '',
      `- Electron process start -> first game frame: \`${processToFrame ?? 'n/a'}\` ms`,
      `- Renderer bootstrap -> first game frame: \`${firstFrame ?? 'n/a'}\` ms`,
      `- Electron process start -> first menu usable: \`${processToMenu ?? 'n/a'}\` ms`,
      `- Renderer bootstrap -> first menu usable: \`${menuUsable ?? 'n/a'}\` ms`,
      `- Runtime import/evaluation: \`${componentDurations.runtimeImport ?? 'n/a'}\` ms`,
      `- Canvas registration/settings: \`${componentDurations.pixiSetup ?? 'n/a'}\` ms`,
      `- Renderer/stage/ticker setup: \`${componentDurations.rendererSetup ?? 'n/a'}\` ms`,
      `- Sprite load: \`${componentDurations.spriteLoad ?? 'n/a'}\` ms`,
      `- Game controller construction: \`${componentDurations.controllerConstruction ?? 'n/a'}\` ms`,
      `- Settings hydration: \`${componentDurations.settingsHydration ?? 'n/a'}\` ms`,
      `- Menu launcher setup: \`${componentDurations.menuLauncherSetup ?? 'n/a'}\` ms`,
      `- Runtime ready -> first frame: \`${componentDurations.runtimeReadyToFirstFrame ?? 'n/a'}\` ms`,
      `- P request -> paused: \`${componentDurations.menuPauseResponse ?? 'n/a'}\` ms`,
      `- Lazy menu import/evaluation: \`${componentDurations.menuImport ?? 'n/a'}\` ms`,
      `- Lazy menu mount: \`${componentDurations.menuMount ?? 'n/a'}\` ms`,
      `- P request -> menu usable: \`${componentDurations.menuOpenToUsable ?? 'n/a'}\` ms`,
      '- Method: fresh packaged Electron process with a temporary user-data directory; OS filesystem cache is not forcibly cleared.',
      '',
    ];
    const summary = `${lines.join('\n')}\n`;
    process.stdout.write(summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    }
  });
}

main();
