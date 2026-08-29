/**
 * Owns the heavy game runtime after the lightweight application shell has painted.
 *
 ********************************************************************************************************************
 * This web version of the Pikachu Volleyball is made by
 * reverse engineering the core part of the original Pikachu Volleyball game
 * which is developed by "1997 (C) SACHI SOFT / SAWAYAKAN Programmers" & "1997 (C) Satoshi Takenouchi".
 *
 * "physics.js", "cloud_and_wave.js", and some codes in "view.js" are the results of this reverse engineering.
 * Refer to the comments in each file for the machine code addresses of the original functions.
 ********************************************************************************************************************
 *
 * This web version game is mainly composed of three parts which follows MVC pattern.
 *  1) "physics.js" (Model): The physics engine which takes charge of the dynamics of the ball and the players (Pikachus).
 *                           It is gained by reverse engineering the machine code of the original game.
 *  2) "view.js" (View): The rendering part of the game which depends on pixi.js (https://www.pixijs.com/, https://github.com/pixijs/pixi.js) library.
 *                       Some codes in this part is gained by reverse engineering the original machine code.
 *  3) "pikavolley.js" (Controller): Make the game work by controlling the Model and the View according to the user input.
 *
 * And explanations for other source files are below.
 *  - "cloud_and_wave.js": This is also a Model part which takes charge of the clouds and wave motion in the game. Of course, it is also rendered by "view.js".
 *                         It is also gained by reverse engineering the original machine code.
 *  - "keyboard.js": Support the Controller("pikavolley.js") to get a user input via keyboard.
 *  - "audio.js": The game audio or sounds. It depends on pixi-sound (https://github.com/pixijs/sound) library.
 *  - "rand.js": For the random function used in the Models ("physics.js", "cloud_and_wave.js").
 *  - "assets_path.js": For the assets (image files, sound files) locations.
 *  - "settings_store.js": Application settings persistence and sanitization.
 *  - "game_settings.cjs": Application of persisted settings to the live game runtime.
 *  - "game_commands.js": Operational commands shared by the integrated menu.
 *  - "integrated_menu_launcher.js": Lightweight pause shortcut and lazy menu loader.
 *  - "integrated_menu.js": Production pause menu for web and desktop.
 */
'use strict';

import { settings } from '@pixi/settings';
import { SCALE_MODES } from '@pixi/constants';
import { Container } from '@pixi/display';
import { Loader } from '@pixi/loaders';
import { SpritesheetLoader } from '@pixi/spritesheet';
import { Ticker } from '@pixi/ticker';
import { CanvasRenderer } from '@pixi/canvas-renderer';
import { CanvasSpriteRenderer } from '@pixi/canvas-sprite';
import { CanvasPrepare } from '@pixi/canvas-prepare';
import '@pixi/canvas-display';
import { PikachuVolleyball } from './pikavolley.js';
import { ASSETS_PATH } from './assets_path.js';
import { createGameCommands } from './game_commands.js';
import { setUpIntegratedMenuLauncher } from './integrated_menu_launcher.js';
import { settingsStore } from './settings_store.js';
import gameSettingsModule from './game_settings.cjs';

const { hydrateGameSettings } = gameSettingsModule;
const MAX_DIAGNOSTIC_FRAME_SAMPLES = 600;
const MAX_DIAGNOSTIC_LONG_TASKS = 100;
let runtimeStarted = false;

/**
 * Initialize Pixi, load the sprite sheet and start the game.
 */
export function startGameRuntime() {
  if (runtimeStarted) return;
  runtimeStarted = true;
  markPerformance('pv-runtime-start');

  CanvasRenderer.registerPlugin('prepare', CanvasPrepare);
  CanvasRenderer.registerPlugin('sprite', CanvasSpriteRenderer);
  Loader.registerPlugin(SpritesheetLoader);

  settings.RESOLUTION = 2;
  settings.SCALE_MODE = SCALE_MODES.NEAREST;
  settings.ROUND_PIXELS = true;
  markPerformance('pv-pixi-ready');

  const renderer = new CanvasRenderer({
    width: 432,
    height: 304,
    antialias: false,
    backgroundColor: 0x000000,
    backgroundAlpha: 1,
  });
  const stage = new Container();
  const ticker = new Ticker();
  const loader = new Loader();

  renderer.view.setAttribute('id', 'game-canvas');
  document.getElementById('game-canvas-container').appendChild(renderer.view);
  renderer.render(stage);
  markPerformance('pv-renderer-ready');

  loader.add(ASSETS_PATH.SPRITE_SHEET);
  setUpLoaderUI(loader);
  markPerformance('pv-sprite-load-start');
  loader.load(() => {
    markPerformance('pv-sprite-load-ready');
    setupGame(renderer, stage, ticker, loader);
  });
}

/**
 * Connect loader progress to the existing loading shell.
 * @param {Loader} loader
 */
function setUpLoaderUI(loader) {
  const loadingBox = document.getElementById('loading-box');
  const progressBar = document.getElementById('progress-bar');

  loader.onProgress.add(() => {
    if (progressBar !== null) {
      progressBar.style.width = `${loader.progress}%`;
    }
  });
  loader.onComplete.add(() => {
    loadingBox?.classList.add('hidden');
  });
}

/**
 * Set up the game, persisted settings and the lightweight menu launcher.
 * @param {CanvasRenderer} renderer
 * @param {Container} stage
 * @param {Ticker} ticker
 * @param {Loader} loader
 */
function setupGame(renderer, stage, ticker, loader) {
  const pikaVolley = new PikachuVolleyball(stage, loader.resources);
  markPerformance('pv-game-controller-ready');
  hydrateGameSettings(
    settingsStore.getSettings(),
    pikaVolley,
    ticker,
    document
  );
  markPerformance('pv-settings-ready');
  setUpVisibilityAudio(pikaVolley);
  const commands = createGameCommands(pikaVolley, ticker);
  setUpIntegratedMenuLauncher(commands);
  markPerformance('pv-menu-launcher-ready');
  const performanceDiagnostics = createPerformanceDiagnostics(pikaVolley);
  warmUpAudioAssets(performanceDiagnostics);
  markPerformance('pv-runtime-ready');
  startGameLoop(
    renderer,
    stage,
    ticker,
    pikaVolley,
    performanceDiagnostics
  );
}

/**
 * Preserve the legacy visibility mute semantics without depending on legacy UI.
 * @param {PikachuVolleyball} pikaVolley
 */
function setUpVisibilityAudio(pikaVolley) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      pikaVolley.audio.unmuteAll();
    } else {
      pikaVolley.audio.muteAll();
    }
  });
}

/**
 * Start non-critical audio loading after the game becomes interactive.
 * @param {ReturnType<typeof createPerformanceDiagnostics>} performanceDiagnostics
 */
function warmUpAudioAssets(performanceDiagnostics) {
  const idleCallback =
    window.requestIdleCallback ||
    ((callback) => {
      window.setTimeout(callback, 300);
    });
  idleCallback(() => {
    markPerformance('pv-audio-warmup-start');
    performanceDiagnostics?.markAudioWarmupStart();
    for (const prop in ASSETS_PATH.SOUNDS) {
      const audio = new Audio(ASSETS_PATH.SOUNDS[prop]);
      audio.preload = 'auto';
      audio.load();
    }
    markPerformance('pv-audio-warmup-dispatched');
    performanceDiagnostics?.markAudioWarmupDispatched();
  });
}

/**
 * Start the game loop.
 * @param {CanvasRenderer} renderer
 * @param {Container} stage
 * @param {Ticker} ticker
 * @param {PikachuVolleyball} pikaVolley
 * @param {ReturnType<typeof createPerformanceDiagnostics>} performanceDiagnostics
 */
function startGameLoop(
  renderer,
  stage,
  ticker,
  pikaVolley,
  performanceDiagnostics
) {
  let firstFrame = true;
  ticker.maxFPS = pikaVolley.normalFPS;
  ticker.add(() => {
    const frameStartedAt = performanceDiagnostics ? performance.now() : 0;
    const stateBefore = performanceDiagnostics
      ? getGameStateName(pikaVolley)
      : null;
    if (firstFrame) {
      firstFrame = false;
      markPerformance('pv-first-game-frame');
    }

    const gameLoopStartedAt = performanceDiagnostics ? performance.now() : 0;
    pikaVolley.gameLoop();
    const gameLoopFinishedAt = performanceDiagnostics ? performance.now() : 0;
    renderer.render(stage);
    const frameFinishedAt = performanceDiagnostics ? performance.now() : 0;

    performanceDiagnostics?.recordFrame({
      frameStartedAt,
      stateBefore,
      gameLoopMs: gameLoopFinishedAt - gameLoopStartedAt,
      renderMs: frameFinishedAt - gameLoopFinishedAt,
      totalWorkMs: frameFinishedAt - frameStartedAt,
    });
  });
  ticker.start();
}

/**
 * Create an opt-in frame pacing recorder for packaged diagnostics.
 * Normal web and desktop runs do not allocate frame samples or observers.
 * @param {PikachuVolleyball} pikaVolley
 */
function createPerformanceDiagnostics(pikaVolley) {
  const enabled =
    new URLSearchParams(window.location.search).get('performanceDiagnostics') ===
    '1';
  if (!enabled) return null;

  const samples = [];
  const longTasks = [];
  let previousFrameAt = null;
  let audioWarmupStartAtMs = null;
  let audioWarmupDispatchedAtMs = null;

  const diagnostics = {
    ready: true,
    currentState: getGameStateName(pikaVolley),
    currentFrameCounter: pikaVolley.frameCounter,
    roundSampleCount: 0,
    recordFrame(sample) {
      const intervalMs =
        previousFrameAt === null ? null : sample.frameStartedAt - previousFrameAt;
      previousFrameAt = sample.frameStartedAt;

      if (samples.length < MAX_DIAGNOSTIC_FRAME_SAMPLES) {
        samples.push({
          atMs: roundNumber(sample.frameStartedAt),
          intervalMs: roundNumber(intervalMs),
          state: sample.stateBefore,
          gameLoopMs: roundNumber(sample.gameLoopMs),
          renderMs: roundNumber(sample.renderMs),
          totalWorkMs: roundNumber(sample.totalWorkMs),
        });
      }

      if (sample.stateBefore === 'round') {
        diagnostics.roundSampleCount += 1;
      }
      diagnostics.currentState = getGameStateName(pikaVolley);
      diagnostics.currentFrameCounter = pikaVolley.frameCounter;
    },
    markAudioWarmupStart() {
      audioWarmupStartAtMs = roundNumber(performance.now());
    },
    markAudioWarmupDispatched() {
      audioWarmupDispatchedAtMs = roundNumber(performance.now());
    },
    snapshot() {
      return {
        targetFps: pikaVolley.normalFPS,
        targetFrameIntervalMs: roundNumber(1000 / pikaVolley.normalFPS),
        currentState: diagnostics.currentState,
        currentFrameCounter: diagnostics.currentFrameCounter,
        sampleCount: samples.length,
        roundSampleCount: diagnostics.roundSampleCount,
        audioWarmupStartAtMs,
        audioWarmupDispatchedAtMs,
        samples: samples.slice(),
        longTasks: longTasks.slice(),
      };
    },
  };

  window.__pvPerformanceDiagnostics = diagnostics;

  try {
    if (
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (longTasks.length >= MAX_DIAGNOSTIC_LONG_TASKS) break;
          longTasks.push({
            startTimeMs: roundNumber(entry.startTime),
            durationMs: roundNumber(entry.duration),
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    }
  } catch {
    // Long Task timing is optional diagnostic evidence.
  }

  return diagnostics;
}

/**
 * @param {PikachuVolleyball} pikaVolley
 */
function getGameStateName(pikaVolley) {
  const stateNames = [
    'intro',
    'menu',
    'afterMenuSelection',
    'beforeStartOfNewGame',
    'startOfNewGame',
    'round',
    'afterEndOfRound',
    'beforeStartOfNextRound',
  ];
  for (const stateName of stateNames) {
    if (pikaVolley.state === pikaVolley[stateName]) return stateName;
  }
  return 'unknown';
}

function roundNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(2));
}

/**
 * Add a performance mark when supported by the current runtime.
 * @param {string} name
 */
function markPerformance(name) {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(name);
  }
}
