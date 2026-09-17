'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { GameCore } = require('../src/resources/js/game_core.cjs');
const lifecycleModule = require('../src/resources/js/game_lifecycle.cjs');
const { createReferenceTraces } = require('./capture-v3-reference-traces.cjs');

function loadPhysicsHarness(randomValues = []) {
  const filename = path.join(process.cwd(), 'src/resources/js/physics.js');
  let source = fs.readFileSync(filename, 'utf8');
  const rngTrace = [];
  let rngIndex = 0;
  const rand = () => {
    const value = randomValues[rngIndex] ?? 0;
    rngIndex += 1;
    rngTrace.push(value);
    return value;
  };

  source = source
    .replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '')
    .replace(/export const /g, 'const ')
    .replace(/export class /g, 'class ');
  source += `\nglobalThis.__physicsExports = {
    GROUND_HALF_WIDTH,
    PikaPhysics,
  };\n`;

  const context = vm.createContext({ __deps: { rand }, console });
  const wrapped = `const { rand } = globalThis.__deps;\n${source}`;
  new vm.Script(wrapped, { filename }).runInContext(context);

  return {
    ...context.__physicsExports,
    rngTrace,
  };
}

function createEventRecorder() {
  const events = [];
  return {
    events,
    push(type, ...args) {
      events.push([type, ...args]);
    },
    drain() {
      const drained = events.map((event) => [...event]);
      events.length = 0;
      return drained;
    },
    clear() {
      events.length = 0;
    },
  };
}

function createControllerHarness(randomValues = []) {
  const physicsHarness = loadPhysicsHarness(randomValues);
  const recorder = createEventRecorder();
  const filename = path.join(
    process.cwd(),
    'src/resources/js/pikavolley_core_adapter.js'
  );
  let source = fs.readFileSync(filename, 'utf8');

  class BasicView {
    constructor(name) {
      this.name = name;
      this.container = {};
      this._visible = false;
    }

    set visible(value) {
      this._visible = Boolean(value);
      recorder.push(`${this.name}.visible`, this._visible);
    }

    get visible() {
      return this._visible;
    }
  }

  class IntroView extends BasicView {
    constructor() {
      super('intro');
    }
    drawMark(frame) {
      recorder.push('intro.drawMark', frame);
    }
  }

  class MenuView extends BasicView {
    constructor() {
      super('menu');
    }
    selectWithWho(value) {
      recorder.push('menu.selectWithWho', value);
    }
    drawFightMessage(frame) {
      recorder.push('menu.drawFightMessage', frame);
    }
    drawSachisoft(frame) {
      recorder.push('menu.drawSachisoft', frame);
    }
    drawSittingPikachuTiles(frame) {
      recorder.push('menu.drawSittingPikachuTiles', frame);
    }
    drawPikachuVolleyballMessage(frame) {
      recorder.push('menu.drawPikachuVolleyballMessage', frame);
    }
    drawPokemonMessage(frame) {
      recorder.push('menu.drawPokemonMessage', frame);
    }
    drawWithWhoMessages(frame) {
      recorder.push('menu.drawWithWhoMessages', frame);
    }
  }

  class GameView extends BasicView {
    constructor() {
      super('game');
      this.scoreBoards = [{ visible: true }, { visible: true }];
    }
    drawScoresToScoreBoards(scores) {
      recorder.push('game.drawScores', ...scores);
    }
    drawGameStartMessage(frame, total) {
      recorder.push('game.drawStart', frame, total);
    }
    drawCloudsAndWave() {
      recorder.push('game.drawCloudsAndWave');
    }
    drawGameEndMessage(frame) {
      recorder.push('game.drawEnd', frame);
    }
    drawReadyMessage(visible) {
      recorder.push('game.drawReady', Boolean(visible));
    }
    toggleReadyMessage() {
      recorder.push('game.toggleReady');
    }
    drawPlayersAndBall(snapshot) {
      recorder.push(
        'game.drawPlayersAndBall',
        snapshot.player1.x,
        snapshot.player1.y,
        snapshot.player2.x,
        snapshot.player2.y,
        snapshot.ball.x,
        snapshot.ball.y,
        snapshot.ball.punchEffectRadius
      );
    }
  }

  class FadeInOut extends BasicView {
    constructor() {
      super('fade');
      this.black = {};
    }
    setBlackAlphaTo(value) {
      recorder.push('fade.set', value);
    }
    changeBlackAlphaBy(value) {
      recorder.push('fade.change', value);
    }
  }

  class PikaKeyboard {
    constructor() {
      this.xDirection = 0;
      this.yDirection = 0;
      this.powerHit = 0;
    }
    getInput() {}
    reset() {
      this.xDirection = 0;
      this.yDirection = 0;
      this.powerHit = 0;
    }
  }

  function createSound(name) {
    return {
      play(pan = 0) {
        recorder.push('audio.play', name, pan);
      },
      stop() {
        recorder.push('audio.stop', name);
      },
    };
  }

  class PikaAudio {
    constructor() {
      this.sounds = Object.fromEntries(
        [
          'bgm',
          'pi',
          'pikachu',
          'pipikachu',
          'pika',
          'chu',
          'powerHit',
          'ballTouchesGround',
        ].map((name) => [name, createSound(name)])
      );
    }
  }

  const quickRematchHint = {
    classList: {
      add(name) {
        recorder.push('quickRematch.class.add', name);
      },
      remove(name) {
        recorder.push('quickRematch.class.remove', name);
      },
    },
  };

  const deps = {
    GROUND_HALF_WIDTH: physicsHarness.GROUND_HALF_WIDTH,
    PikaPhysics: physicsHarness.PikaPhysics,
    MenuView,
    GameView,
    FadeInOut,
    IntroView,
    PikaKeyboard,
    PikaAudio,
    GameCore,
    gameLifecycleModule: lifecycleModule,
  };

  source = source
    .replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '')
    .replace('export class PikachuVolleyball', 'class PikachuVolleyball');
  source += '\nglobalThis.__controllerExport = PikachuVolleyball;\n';

  const context = vm.createContext({
    __deps: deps,
    console,
    window: { addEventListener() {} },
    document: {
      getElementById(id) {
        return id === 'quick-rematch-hint' ? quickRematchHint : null;
      },
    },
  });
  const wrapped = `const {
    GROUND_HALF_WIDTH,
    PikaPhysics,
    MenuView,
    GameView,
    FadeInOut,
    IntroView,
    PikaKeyboard,
    PikaAudio,
    GameCore,
    gameLifecycleModule,
  } = globalThis.__deps;
  const createGameCore = () => new GameCore({
    physics: new PikaPhysics(true, true),
    groundHalfWidth: GROUND_HALF_WIDTH,
  });
  ${source}`;
  new vm.Script(wrapped, { filename }).runInContext(context);

  const game = new context.__controllerExport({ addChild() {} }, {});
  recorder.clear();
  return {
    game,
    recorder,
    rngTrace: physicsHarness.rngTrace,
    GAME_STATE_IDS: lifecycleModule.GAME_STATE_IDS,
  };
}

function setInput(game, player, values = {}) {
  const keyboard = game.keyboardArray[player - 1];
  keyboard.xDirection = values.xDirection || 0;
  keyboard.yDirection = values.yDirection || 0;
  keyboard.powerHit = values.powerHit || 0;
}

function snapshotPhysics(physics) {
  const playerSnapshot = (player) => ({
    x: player.x,
    y: player.y,
    yVelocity: player.yVelocity,
    state: player.state,
    frameNumber: player.frameNumber,
    delayBeforeNextFrame: player.delayBeforeNextFrame,
    divingDirection: player.divingDirection,
    lyingDownDurationLeft: player.lyingDownDurationLeft,
    isComputer: player.isComputer,
    isWinner: player.isWinner,
    gameEnded: player.gameEnded,
    computerBoldness: player.computerBoldness,
    computerWhereToStandBy: player.computerWhereToStandBy,
    isCollisionWithBallHappened: player.isCollisionWithBallHappened,
  });

  return {
    player1: playerSnapshot(physics.player1),
    player2: playerSnapshot(physics.player2),
    ball: {
      x: physics.ball.x,
      y: physics.ball.y,
      xVelocity: physics.ball.xVelocity,
      yVelocity: physics.ball.yVelocity,
      expectedLandingPointX: physics.ball.expectedLandingPointX,
      rotation: physics.ball.rotation,
      fineRotation: physics.ball.fineRotation,
      punchEffectRadius: physics.ball.punchEffectRadius,
      punchEffectX: physics.ball.punchEffectX,
      punchEffectY: physics.ball.punchEffectY,
      isPowerHit: physics.ball.isPowerHit,
      previousX: physics.ball.previousX,
      previousY: physics.ball.previousY,
      previousPreviousX: physics.ball.previousPreviousX,
      previousPreviousY: physics.ball.previousPreviousY,
    },
  };
}

function snapshotGame(game, rngTrace, recorder) {
  return {
    state: game.getCurrentStateId(),
    frameCounter: game.frameCounter,
    noInputFrameCounter: game.noInputFrameCounter,
    scores: [...game.scores],
    winningScore: game.winningScore,
    isPlayer2Serve: game.isPlayer2Serve,
    roundEnded: game.roundEnded,
    gameEnded: game.gameEnded,
    paused: game.paused,
    slowMotionFramesLeft: game.slowMotionFramesLeft,
    slowMotionNumOfSkippedFrames: game.slowMotionNumOfSkippedFrames,
    isPracticeMode: game.isPracticeMode,
    normalFPS: game.normalFPS,
    slowMotionFPS: game.slowMotionFPS,
    physics: snapshotPhysics(game.physics),
    rngTrace: [...rngTrace],
    effects: recorder.drain(),
  };
}

function captureLifecycleScenario() {
  const harness = createControllerHarness([0, 1, 2, 3, 4, 5, 6, 7]);
  const { game, recorder, rngTrace, GAME_STATE_IDS } = harness;
  const checkpoints = [];

  game.intro();
  checkpoints.push({
    name: 'intro-first-frame',
    ...snapshotGame(game, rngTrace, recorder),
  });

  for (let frame = 1; frame < 164; frame += 1) {
    game.intro();
    recorder.clear();
  }
  game.intro();
  checkpoints.push({
    name: 'intro-timeout',
    ...snapshotGame(game, rngTrace, recorder),
  });

  game.frameCounter = 72;
  game.noInputFrameCounter = 224;
  setInput(game, 1);
  setInput(game, 2);
  game.menu();
  checkpoints.push({
    name: 'menu-inactivity',
    ...snapshotGame(game, rngTrace, recorder),
  });

  game.transitionTo(GAME_STATE_IDS.AFTER_MENU_SELECTION);
  game.frameCounter = 14;
  game.afterMenuSelection();
  checkpoints.push({
    name: 'after-menu-boundary',
    ...snapshotGame(game, rngTrace, recorder),
  });

  game.frameCounter = 14;
  game.beforeStartOfNewGame();
  checkpoints.push({
    name: 'before-game-boundary',
    ...snapshotGame(game, rngTrace, recorder),
  });

  game.frameCounter = 70;
  game.startOfNewGame();
  checkpoints.push({
    name: 'start-game-boundary',
    ...snapshotGame(game, rngTrace, recorder),
  });

  return { checkpoints };
}

function prepareGroundContact(game, x, winningScore = 15) {
  game.physics.player1.isComputer = false;
  game.physics.player2.isComputer = false;
  game.physics.ball.x = x;
  game.physics.ball.y = 252;
  game.physics.ball.xVelocity = 0;
  game.physics.ball.yVelocity = 1;
  game.physics.ball.punchEffectRadius = 0;
  game.physics.ball.punchEffectX = x;
  game.physics.ball.punchEffectY = 272;
  game.winningScore = winningScore;
  game.roundEnded = false;
  game.gameEnded = false;
  setInput(game, 1);
  setInput(game, 2);
}

function captureScoringScenario() {
  const harness = createControllerHarness([0, 1, 2, 3, 4, 5, 6, 7]);
  const { game, recorder, rngTrace, GAME_STATE_IDS } = harness;
  const checkpoints = [];

  game.transitionTo(GAME_STATE_IDS.ROUND);
  prepareGroundContact(game, 100, 15);
  game.round();
  checkpoints.push({
    name: 'score-right',
    ...snapshotGame(game, rngTrace, recorder),
  });

  for (let tick = 0; tick < 4; tick += 1) {
    game.gameLoop();
    recorder.clear();
  }
  game.gameLoop();
  checkpoints.push({
    name: 'slow-motion-fifth-tick',
    ...snapshotGame(game, rngTrace, recorder),
  });

  const winningHarness = createControllerHarness([0, 1, 2, 3, 4, 5, 6, 7]);
  winningHarness.game.transitionTo(winningHarness.GAME_STATE_IDS.ROUND);
  prepareGroundContact(winningHarness.game, 100, 1);
  winningHarness.game.round();
  checkpoints.push({
    name: 'winning-score',
    ...snapshotGame(
      winningHarness.game,
      winningHarness.rngTrace,
      winningHarness.recorder
    ),
  });

  return { checkpoints };
}

function captureEndAndCommandsScenario() {
  const harness = createControllerHarness([0, 1, 2, 3, 4, 5, 6, 7]);
  const { game, recorder, rngTrace, GAME_STATE_IDS } = harness;
  const checkpoints = [];

  game.transitionTo(GAME_STATE_IDS.ROUND);
  game.physics.player1.isComputer = false;
  game.physics.player2.isComputer = false;
  game.gameEnded = true;
  game.frameCounter = 68;
  setInput(game, 1, { powerHit: 1 });
  game.round();
  checkpoints.push({
    name: 'quick-rematch-before',
    ...snapshotGame(game, rngTrace, recorder),
  });
  game.round();
  checkpoints.push({
    name: 'quick-rematch-trigger',
    ...snapshotGame(game, rngTrace, recorder),
  });

  game.transitionTo(GAME_STATE_IDS.ROUND);
  game._isPracticeMode = true;
  game.ballResetRequested = true;
  game.physics.ball.x = 200;
  game.physics.ball.y = 200;
  game.round();
  checkpoints.push({
    name: 'practice-reset',
    ...snapshotGame(game, rngTrace, recorder),
  });

  game.setPaused(true);
  const pausedBefore = snapshotGame(game, rngTrace, recorder);
  game.gameLoop();
  checkpoints.push({
    name: 'paused-loop',
    before: pausedBefore,
    after: snapshotGame(game, rngTrace, recorder),
  });

  game.setPaused(false);
  game.restart();
  checkpoints.push({
    name: 'restart',
    ...snapshotGame(game, rngTrace, recorder),
  });

  return { checkpoints };
}

function createCoreAdapterTraces() {
  const reference = createReferenceTraces();
  return {
    schemaVersion: reference.schemaVersion,
    source: reference.source,
    physics: reference.physics,
    ai: reference.ai,
    lifecycle: captureLifecycleScenario(),
    scoring: captureScoringScenario(),
    commands: captureEndAndCommandsScenario(),
  };
}

module.exports = { createCoreAdapterTraces };

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(createCoreAdapterTraces(), null, 2)}\n`);
}
