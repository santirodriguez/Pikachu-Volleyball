/**
 * Owns the heavy game runtime after the lightweight application shell has painted.
 */
'use strict';

import { settings } from '@pixi/settings';
import { SCALE_MODES } from '@pixi/constants';
import { Renderer, BatchRenderer, autoDetectRenderer } from '@pixi/core';
import { Prepare } from '@pixi/prepare';
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
import { setUpUI } from './ui.js';
import { createGameCommands } from './game_commands.js';
import { setUpIntegratedMenu } from './integrated_menu.js';
import { setUpIntegratedMenuTheme } from './integrated_menu_theme.js';

let runtimeStarted = false;

/**
 * Initialize Pixi, load the sprite sheet and start the game.
 */
export function startGameRuntime() {
  if (runtimeStarted) return;
  runtimeStarted = true;

  Renderer.registerPlugin('prepare', Prepare);
  Renderer.registerPlugin('batch', BatchRenderer);
  CanvasRenderer.registerPlugin('prepare', CanvasPrepare);
  CanvasRenderer.registerPlugin('sprite', CanvasSpriteRenderer);
  Loader.registerPlugin(SpritesheetLoader);

  settings.RESOLUTION = 2;
  settings.SCALE_MODE = SCALE_MODES.NEAREST;
  settings.ROUND_PIXELS = true;

  const renderer = autoDetectRenderer({
    width: 432,
    height: 304,
    antialias: false,
    backgroundColor: 0x000000,
    backgroundAlpha: 1,
    forceCanvas: true,
  });
  const stage = new Container();
  const ticker = new Ticker();
  const loader = new Loader();

  renderer.view.setAttribute('id', 'game-canvas');
  document.getElementById('game-canvas-container').appendChild(renderer.view);
  renderer.render(stage);

  loader.add(ASSETS_PATH.SPRITE_SHEET);
  setUpLoaderUI(loader);
  loader.load(() => setupGame(renderer, stage, ticker, loader));
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
 * Set up the game, persisted settings and integrated menu.
 * @param {import('@pixi/core').Renderer} renderer
 * @param {Container} stage
 * @param {Ticker} ticker
 * @param {Loader} loader
 */
function setupGame(renderer, stage, ticker, loader) {
  const pikaVolley = new PikachuVolleyball(stage, loader.resources);
  setUpUI(pikaVolley, ticker);
  const commands = createGameCommands(pikaVolley, ticker);
  setUpIntegratedMenu(commands);
  setUpIntegratedMenuTheme(commands);
  warmUpAudioAssets();
  markPerformance('pv-runtime-ready');
  startGameLoop(renderer, stage, ticker, pikaVolley);
}

/**
 * Start non-critical audio loading after the game becomes interactive.
 */
function warmUpAudioAssets() {
  const idleCallback =
    window.requestIdleCallback ||
    ((callback) => {
      window.setTimeout(callback, 300);
    });
  idleCallback(() => {
    for (const prop in ASSETS_PATH.SOUNDS) {
      const audio = new Audio(ASSETS_PATH.SOUNDS[prop]);
      audio.preload = 'auto';
      audio.load();
    }
  });
}

/**
 * Start the game loop.
 * @param {import('@pixi/core').Renderer} renderer
 * @param {Container} stage
 * @param {Ticker} ticker
 * @param {PikachuVolleyball} pikaVolley
 */
function startGameLoop(renderer, stage, ticker, pikaVolley) {
  let firstFrame = true;
  ticker.maxFPS = pikaVolley.normalFPS;
  ticker.add(() => {
    if (firstFrame) {
      firstFrame = false;
      markPerformance('pv-first-game-frame');
    }
    pikaVolley.gameLoop();
    renderer.render(stage);
  });
  ticker.start();
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
