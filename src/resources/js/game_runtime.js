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
 *                         It is also gained by reverse engineering the machine code of the original game.
 *  - "keyboard.js": Support the Controller("pikavolley.js") to get a user input via keyboard.
 *  - "audio.js": The game audio or sounds. It depends on pixi-sound (https://github.com/pixijs/sound) library.
 *  - "rand.js": For the random function used in the Models ("physics.js", "cloud_and_wave.js").
 *  - "assets_path.js": For the assets (image files, sound files) locations.
 *  - "settings_store.js": Application settings persistence and sanitization.
 *  - "game_settings.cjs": Application of persisted settings to the live game runtime.
 *  - "game_commands.js": Operational commands shared by the integrated menu.
 *  - "integrated_menu.js": Production pause menu for web and desktop.
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
import { createGameCommands } from './game_commands.js';
import { setUpIntegratedMenu } from './integrated_menu.js';
import { settingsStore } from './settings_store.js';
import gameSettingsModule from './game_settings.cjs';

const { hydrateGameSettings } = gameSettingsModule;
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
  hydrateGameSettings(settingsStore.getSettings(), pikaVolley, ticker, document);
  setUpVisibilityAudio(pikaVolley);
  const commands = createGameCommands(pikaVolley, ticker);
  setUpIntegratedMenu(commands);
  warmUpAudioAssets();
  markPerformance('pv-runtime-ready');
  startGameLoop(renderer, stage, ticker, pikaVolley);
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
