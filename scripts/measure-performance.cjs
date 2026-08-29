'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');
const OUTPUT_PATH = path.resolve(
  process.argv[2] || path.join(RELEASE_DIR, 'performance-diagnostics.json')
);
const RUN_TIMEOUT_MS = 45000;
const FILE_POLL_MS = 10;

function findAppImage() {
  const explicit = process.env.PV_APPIMAGE_PATH;
  if (explicit) return path.resolve(explicit);

  if (!fs.existsSync(RELEASE_DIR)) {
    throw new Error(`Missing release directory: ${RELEASE_DIR}`);
  }

  const candidates = fs
    .readdirSync(RELEASE_DIR)
    .filter((name) => name.endsWith('.AppImage'))
    .map((name) => path.join(RELEASE_DIR, name));

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one AppImage in ${RELEASE_DIR}; found: ${candidates.join(', ')}`
    );
  }
  return candidates[0];
}

function roundNumber(value) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  );
  return roundNumber(sorted[index]);
}

function summarizeRenderer(report) {
  const diagnostics = report.rendererDiagnostics || {};
  const target = diagnostics.targetFrameIntervalMs || 40;
  const roundSamples = (diagnostics.samples || []).filter(
    (sample) => sample.state === 'round' && Number.isFinite(sample.intervalMs)
  );
  const intervals = roundSamples.map((sample) => sample.intervalMs);
  const gameLoop = roundSamples
    .map((sample) => sample.gameLoopMs)
    .filter(Number.isFinite);
  const render = roundSamples
    .map((sample) => sample.renderMs)
    .filter(Number.isFinite);
  const totalWork = roundSamples
    .map((sample) => sample.totalWorkMs)
    .filter(Number.isFinite);
  const warmupAt = diagnostics.audioWarmupStartAtMs;
  const warmupSamples = Number.isFinite(warmupAt)
    ? (diagnostics.samples || []).filter(
        (sample) =>
          Number.isFinite(sample.intervalMs) &&
          sample.atMs >= warmupAt - 100 &&
          sample.atMs <= warmupAt + 1500
      )
    : [];
  const warmupIntervals = warmupSamples.map((sample) => sample.intervalMs);

  return {
    targetFps: diagnostics.targetFps || null,
    targetFrameIntervalMs: target,
    roundSampleCount: roundSamples.length,
    intervalMs: {
      p50: percentile(intervals, 0.5),
      p95: percentile(intervals, 0.95),
      p99: percentile(intervals, 0.99),
      max: intervals.length ? roundNumber(Math.max(...intervals)) : null,
    },
    lateFrames: {
      over1_25xTarget: intervals.filter((value) => value > target * 1.25).length,
      over1_5xTarget: intervals.filter((value) => value > target * 1.5).length,
      over2xTarget: intervals.filter((value) => value > target * 2).length,
    },
    workMs: {
      gameLoopP95: percentile(gameLoop, 0.95),
      gameLoopMax: gameLoop.length ? roundNumber(Math.max(...gameLoop)) : null,
      renderP95: percentile(render, 0.95),
      renderMax: render.length ? roundNumber(Math.max(...render)) : null,
      totalP95: percentile(totalWork, 0.95),
      totalMax: totalWork.length ? roundNumber(Math.max(...totalWork)) : null,
    },
    audioWarmupWindow: {
      startAtMs: Number.isFinite(warmupAt) ? warmupAt : null,
      sampleCount: warmupSamples.length,
      intervalP95: percentile(warmupIntervals, 0.95),
      intervalMax: warmupIntervals.length
        ? roundNumber(Math.max(...warmupIntervals))
        : null,
      over1_5xTarget: warmupIntervals.filter((value) => value > target * 1.5)
        .length,
    },
    longTasks: {
      count: (diagnostics.longTasks || []).length,
      maxDurationMs: diagnostics.longTasks?.length
        ? roundNumber(
            Math.max(...diagnostics.longTasks.map((task) => task.durationMs))
          )
        : null,
    },
  };
}

function runAppImage(appImage, label, userDataDir, outputDir) {
  return new Promise((resolve, reject) => {
    const metricsPath = path.join(outputDir, `${label}.json`);
    fs.rmSync(metricsPath, { force: true });
    const startedAt = performance.now();
    let metricsObservedAt = null;
    let stdout = '';
    let stderr = '';

    const child = spawn(appImage, [], {
      cwd: path.dirname(appImage),
      env: {
        ...process.env,
        PV_PERFORMANCE_METRICS_FILE: metricsPath,
        PV_STARTUP_USER_DATA_DIR: userDataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const filePoll = setInterval(() => {
      if (metricsObservedAt === null && fs.existsSync(metricsPath)) {
        metricsObservedAt = performance.now();
      }
    }, FILE_POLL_MS);

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, RUN_TIMEOUT_MS);

    child.once('error', (error) => {
      clearInterval(filePoll);
      clearTimeout(timeout);
      reject(error);
    });

    child.once('exit', (code, signal) => {
      clearInterval(filePoll);
      clearTimeout(timeout);
      const exitedAt = performance.now();
      if (metricsObservedAt === null && fs.existsSync(metricsPath)) {
        metricsObservedAt = exitedAt;
      }

      if (code !== 0 || !fs.existsSync(metricsPath)) {
        process.stderr.write(stdout);
        process.stderr.write(stderr);
        reject(
          new Error(
            `${label} failed; exit=${code}, signal=${signal}, metrics=${metricsPath}`
          )
        );
        return;
      }

      const report = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
      const wrapperToMetricsMs = roundNumber(metricsObservedAt - startedAt);
      const processToReportWriteMs =
        report.endToEndMs?.processStartToReportWrite ?? null;
      const approximatePreElectronMs =
        Number.isFinite(wrapperToMetricsMs) && Number.isFinite(processToReportWriteMs)
          ? roundNumber(Math.max(0, wrapperToMetricsMs - processToReportWriteMs))
          : null;

      report.wrapperMeasurement = {
        appImageSpawnToMetricsObservedMs: wrapperToMetricsMs,
        appImageSpawnToExitMs: roundNumber(exitedAt - startedAt),
        metricsObservedToExitMs: roundNumber(exitedAt - metricsObservedAt),
        approximatePreElectronOrLauncherMs: approximatePreElectronMs,
        filePollingResolutionMs: FILE_POLL_MS,
      };
      report.framePacingSummary = summarizeRenderer(report);
      fs.writeFileSync(metricsPath, `${JSON.stringify(report, null, 2)}\n`);
      resolve(report);
    });
  });
}

function renderSummary(report) {
  const lines = [
    '## AppImage performance diagnostics',
    '',
    '| Run | Spawn -> report | Approx. pre-Electron | Process -> first frame | Round p95 | Round max | >60 ms frames | Work p95 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const run of report.runs) {
    lines.push(
      `| ${run.label} | ${run.wrapperMeasurement.appImageSpawnToMetricsObservedMs ?? 'n/a'} ms | ${run.wrapperMeasurement.approximatePreElectronOrLauncherMs ?? 'n/a'} ms | ${run.endToEndMs?.processStartToFirstGameFrame ?? 'n/a'} ms | ${run.framePacingSummary.intervalMs.p95 ?? 'n/a'} ms | ${run.framePacingSummary.intervalMs.max ?? 'n/a'} ms | ${run.framePacingSummary.lateFrames.over1_5xTarget} | ${run.framePacingSummary.workMs.totalP95 ?? 'n/a'} ms |`
    );
  }
  lines.push(
    '',
    `- First -> second launch, same profile: \`${report.comparisons.secondSameProfileMinusFirstMs ?? 'n/a'}\` ms`,
    `- First -> third launch, fresh profile: \`${report.comparisons.thirdFreshProfileMinusFirstMs ?? 'n/a'}\` ms`,
    '- Approx. pre-Electron time is wrapper spawn-to-report minus Electron process-to-report and includes AppImage/runtime work plus polling noise; it is diagnostic, not a precise mount benchmark.',
    '- The first run is only a true cold-cache approximation if the surrounding environment explicitly cleared filesystem caches before this script.',
    ''
  );
  return `${lines.join('\n')}\n`;
}

async function main() {
  const appImage = findAppImage();
  const outputDir = path.join(path.dirname(OUTPUT_PATH), 'performance-runs');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(OUTPUT_PATH, { force: true });

  const profileA = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-perf-a-'));
  const profileB = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-perf-b-'));

  try {
    const runDefinitions = [
      ['first-fresh-profile', profileA],
      ['second-same-profile', profileA],
      ['third-fresh-profile', profileB],
    ];
    const runs = [];
    for (const [label, profile] of runDefinitions) {
      const result = await runAppImage(appImage, label, profile, outputDir);
      runs.push({ label, ...result });
    }

    const first = runs[0].wrapperMeasurement.appImageSpawnToMetricsObservedMs;
    const second = runs[1].wrapperMeasurement.appImageSpawnToMetricsObservedMs;
    const third = runs[2].wrapperMeasurement.appImageSpawnToMetricsObservedMs;
    const report = {
      generatedAt: new Date().toISOString(),
      appImage: path.basename(appImage),
      environmentNote: process.env.PV_PERFORMANCE_ENV_NOTE || null,
      runs,
      comparisons: {
        secondSameProfileMinusFirstMs:
          Number.isFinite(first) && Number.isFinite(second)
            ? roundNumber(second - first)
            : null,
        thirdFreshProfileMinusFirstMs:
          Number.isFinite(first) && Number.isFinite(third)
            ? roundNumber(third - first)
            : null,
      },
    };

    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    const summary = renderSummary(report);
    process.stdout.write(summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    }
  } finally {
    fs.rmSync(profileA, { recursive: true, force: true });
    fs.rmSync(profileB, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
