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

function main() {
  const executable = findExecutable();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.rmSync(OUTPUT_PATH, { force: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-startup-'));
  const child = spawn(executable, [`--user-data-dir=${userDataDir}`], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PV_STARTUP_METRICS_FILE: OUTPUT_PATH,
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
    const firstFrame = report.rendererMarks?.['pv-first-game-frame'];
    const menuUsable = report.rendererMarks?.['pv-menu-usable'];
    const processToFrame = report.endToEndMs?.processStartToFirstGameFrame;
    const processToMenu = report.endToEndMs?.processStartToMenuUsable;

    const lines = [
      '## Packaged startup report',
      '',
      `- Electron process start -> first game frame: \`${processToFrame ?? 'n/a'}\` ms`,
      `- Renderer bootstrap -> first game frame: \`${firstFrame ?? 'n/a'}\` ms`,
      `- Electron process start -> first menu usable: \`${processToMenu ?? 'n/a'}\` ms`,
      `- Renderer bootstrap -> first menu usable: \`${menuUsable ?? 'n/a'}\` ms`,
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
