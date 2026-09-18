'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { GameCore } = require('../src/resources/js/game_core.cjs');

function loadPhysicsHarness() {
  const filename = path.join(process.cwd(), 'src/resources/js/physics.js');
  let source = fs.readFileSync(filename, 'utf8');
  const randomValues = [];
  const rand = () => (randomValues.length > 0 ? randomValues.shift() : 0);

  source = source
    .replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '')
    .replace(/export const /g, 'const ')
    .replace(/export class /g, 'class ');
  source += `\nglobalThis.__physicsExports = {
    GROUND_HALF_WIDTH,
    PikaPhysics,
    PikaUserInput,
    processCollisionBetweenBallAndPlayer,
    letComputerDecideUserInput,
  };\n`;

  const context = vm.createContext({
    __deps: { rand },
    console,
  });
  const wrapped = `const { rand } = globalThis.__deps;\n${source}`;
  new vm.Script(wrapped, { filename }).runInContext(context);

  return {
    ...context.__physicsExports,
    setRandomValues(values) {
      randomValues.splice(0, randomValues.length, ...values);
    },
  };
}

function createNoopSound() {
  return {
    play() {},
    stop() {},
  };
}

function loadControllerHarness() {
  const filename = path.join(process.cwd(), 'src/resources/js/pikavolley.js');
  let source = fs.readFileSync(filename, 'utf8');

  const GAME_STATE_IDS = Object.freeze({
    INTRO: 'intro',
    MENU: 'menu',
    AFTER_MENU_SELECTION: 'after-menu-selection',
    BEFORE_START_OF_NEW_GAME: 'before-start-of-new-game',
    START_OF_NEW_GAME: 'start-of-new-game',
    ROUND: 'round',
    AFTER_END_OF_ROUND: 'after-end-of-round',
    BEFORE_START_OF_NEXT_ROUND: 'before-start-of-next-round',
  });
  const handlers = {
    [GAME_STATE_IDS.INTRO]: 'intro',
    [GAME_STATE_IDS.MENU]: 'menu',
    [GAME_STATE_IDS.AFTER_MENU_SELECTION]: 'afterMenuSelection',
    [GAME_STATE_IDS.BEFORE_START_OF_NEW_GAME]: 'beforeStartOfNewGame',
    [GAME_STATE_IDS.START_OF_NEW_GAME]: 'startOfNewGame',
    [GAME_STATE_IDS.ROUND]: 'round',
    [GAME_STATE_IDS.AFTER_END_OF_ROUND]: 'afterEndOfRound',
    [GAME_STATE_IDS.BEFORE_START_OF_NEXT_ROUND]: 'beforeStartOfNextRound',
  };

  class BasicView {
    constructor() {
      this.container = {};
      this.visible = false;
    }
  }

  class IntroView extends BasicView {
    drawMark() {}
  }

  class MenuView extends BasicView {
    selectWithWho() {}
    drawFightMessage() {}
    drawSachisoft() {}
    drawSittingPikachuTiles() {}
    drawPikachuVolleyballMessage() {}
    drawPokemonMessage() {}
    drawWithWhoMessages() {}
  }

  class GameView extends BasicView {
    constructor() {
      super();
      this.scoreBoards = [{ visible: true }, { visible: true }];
    }

    drawScoresToScoreBoards() {}
    drawGameStartMessage() {}
    drawCloudsAndWave() {}
    drawGameEndMessage() {}
    drawReadyMessage() {}
    toggleReadyMessage() {}
    drawPlayersAndBall() {}
  }

  class FadeInOut extends BasicView {
    constructor() {
      super();
      this.black = {};
    }

    setBlackAlphaTo() {}
    changeBlackAlphaBy() {}
  }

  class PikaKeyboard {
    constructor() {
      this.xDirection = 0;
      this.yDirection = 0;
      this.powerHit = 0;
    }

    getInput() {}
  }

  class PikaAudio {
    constructor() {
      this.sounds = {
        bgm: createNoopSound(),
        pi: createNoopSound(),
        pikachu: createNoopSound(),
        pipikachu: createNoopSound(),
        pika: createNoopSound(),
        chu: createNoopSound(),
        powerHit: createNoopSound(),
        ballTouchesGround: createNoopSound(),
      };
    }
  }

  function createPlayer(isPlayer2) {
    return {
      isPlayer2,
      isComputer: true,
      isWinner: false,
      gameEnded: false,
      x: isPlayer2 ? 396 : 36,
      y: 244,
      yVelocity: 0,
      state: 0,
      frameNumber: 0,
      delayBeforeNextFrame: 0,
      divingDirection: 0,
      lyingDownDurationLeft: -1,
      computerBoldness: 0,
      computerWhereToStandBy: 0,
      isCollisionWithBallHappened: false,
      sound: { pipikachu: false, pika: false, chu: false },
      initializeForNewRound() {
        this.x = this.isPlayer2 ? 396 : 36;
        this.y = 244;
        this.yVelocity = 0;
        this.state = 0;
        this.frameNumber = 0;
        this.delayBeforeNextFrame = 0;
        this.isCollisionWithBallHappened = false;
      },
    };
  }

  class PikaPhysics {
    constructor() {
      this.player1 = createPlayer(false);
      this.player2 = createPlayer(true);
      this.ball = {
        x: 56,
        y: 0,
        xVelocity: 0,
        yVelocity: 1,
        expectedLandingPointX: 0,
        rotation: 0,
        fineRotation: 0,
        punchEffectRadius: 0,
        punchEffectX: 300,
        punchEffectY: 0,
        isPowerHit: false,
        previousX: 0,
        previousY: 0,
        previousPreviousX: 0,
        previousPreviousY: 0,
        sound: { powerHit: false, ballTouchesGround: false },
        initializeForNewRound(isPlayer2Serve) {
          this.x = isPlayer2Serve ? 376 : 56;
          this.y = 0;
          this.xVelocity = 0;
          this.yVelocity = 1;
          this.punchEffectRadius = 0;
          this.isPowerHit = false;
        },
      };
      this.nextGround = false;
    }

    runEngineForNextFrame() {
      if (this.nextGround) {
        this.ball.punchEffectRadius = 20;
        this.ball.sound.ballTouchesGround = true;
      }
      return this.nextGround;
    }
  }

  const gameLifecycleModule = {
    GAME_STATE_IDS,
    getGameStateHandlerName: (stateId) => handlers[stateId] || null,
    isMatchInProgress: (stateId) =>
      [
        GAME_STATE_IDS.START_OF_NEW_GAME,
        GAME_STATE_IDS.ROUND,
        GAME_STATE_IDS.AFTER_END_OF_ROUND,
        GAME_STATE_IDS.BEFORE_START_OF_NEXT_ROUND,
      ].includes(stateId),
  };
  const deps = {
    PikaPhysics,
    MenuView,
    GameView,
    FadeInOut,
    IntroView,
    PikaKeyboard,
    PikaAudio,
    GameCore,
    gameLifecycleModule,
  };

  source = source
    .replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '')
    .replace('export class PikachuVolleyball', 'class PikachuVolleyball');
  source += '\nglobalThis.__controllerExport = PikachuVolleyball;\n';

  const context = vm.createContext({
    __deps: deps,
    console,
    window: { addEventListener() {} },
    document: { getElementById: () => null },
  });
  const wrapped = `const {
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
    physics: new PikaPhysics(),
    groundHalfWidth: 216,
  });
  ${source}`;
  new vm.Script(wrapped, { filename }).runInContext(context);

  const game = new context.__controllerExport({ addChild() {} }, {});
  return { game, GAME_STATE_IDS };
}

test('physics preserves initial ball gravity and ground collision behavior', () => {
  const { PikaPhysics, PikaUserInput } = loadPhysicsHarness();
  const physics = new PikaPhysics(false, false);
  const inputs = [new PikaUserInput(), new PikaUserInput()];

  assert.equal(physics.ball.x, 56);
  assert.equal(physics.ball.y, 0);
  assert.equal(physics.ball.yVelocity, 1);
  assert.equal(physics.runEngineForNextFrame(inputs), false);
  assert.equal(physics.ball.y, 1);
  assert.equal(physics.ball.yVelocity, 2);

  physics.ball.y = 252;
  physics.ball.yVelocity = 1;
  physics.ball.x = 120;
  assert.equal(physics.runEngineForNextFrame(inputs), true);
  assert.equal(physics.ball.y, 252);
  assert.equal(physics.ball.yVelocity, -1);
  assert.equal(physics.ball.punchEffectX, 120);
  assert.equal(physics.ball.punchEffectY, 272);
  assert.equal(physics.ball.punchEffectRadius, 20);
  assert.equal(physics.ball.sound.ballTouchesGround, true);
});

test('physics preserves power-hit collision velocity and effect semantics', () => {
  const {
    PikaPhysics,
    PikaUserInput,
    processCollisionBetweenBallAndPlayer,
  } = loadPhysicsHarness();
  const physics = new PikaPhysics(false, false);
  const input = new PikaUserInput();
  input.xDirection = 0;
  input.yDirection = -1;
  physics.ball.x = 100;
  physics.ball.y = 100;
  physics.ball.xVelocity = 0;
  physics.ball.yVelocity = 5;

  processCollisionBetweenBallAndPlayer(physics.ball, 100, input, 2);

  assert.equal(physics.ball.xVelocity, 10);
  assert.equal(physics.ball.yVelocity, -30);
  assert.equal(physics.ball.punchEffectX, 100);
  assert.equal(physics.ball.punchEffectY, 100);
  assert.equal(physics.ball.punchEffectRadius, 20);
  assert.equal(physics.ball.isPowerHit, true);
  assert.equal(physics.ball.sound.powerHit, true);
});

test('AI preserves deterministic dive decision for a reachable landing point', () => {
  const {
    PikaPhysics,
    PikaUserInput,
    letComputerDecideUserInput,
  } = loadPhysicsHarness();
  const physics = new PikaPhysics(true, false);
  const player = physics.player1;
  const otherPlayer = physics.player2;
  const input = new PikaUserInput();

  player.x = 100;
  player.state = 0;
  player.computerBoldness = 0;
  physics.ball.x = 180;
  physics.ball.y = 200;
  physics.ball.xVelocity = 10;
  physics.ball.yVelocity = 1;
  physics.ball.expectedLandingPointX = 180;

  letComputerDecideUserInput(player, physics.ball, otherPlayer, input);

  assert.equal(input.xDirection, 1);
  assert.equal(input.powerHit, 1);
  assert.equal(input.yDirection, 0);
});

test('controller preserves historical frame totals', () => {
  const { game } = loadControllerHarness();
  assert.deepEqual(
    { ...game.frameTotal },
    {
      intro: 165,
      afterMenuSelection: 15,
      beforeStartOfNewGame: 15,
      startOfNewGame: 71,
      afterEndOfRound: 5,
      beforeStartOfNextRound: 30,
      gameEnd: 211,
    }
  );
  assert.equal(game.normalFPS, 25);
  assert.equal(game.slowMotionFPS, 5);
  assert.equal(game.SLOW_MOTION_FRAMES_NUM, 6);
  assert.equal(game.noInputFrameTotal.menu, 225);
});

test('intro and menu inactivity preserve their transition boundaries', () => {
  const { game, GAME_STATE_IDS } = loadControllerHarness();

  for (let frame = 0; frame < 165; frame++) {
    game.intro();
  }
  assert.equal(game.getCurrentStateId(), GAME_STATE_IDS.MENU);

  game.frameCounter = 72;
  game.noInputFrameCounter = 224;
  game.keyboardArray[0].powerHit = 0;
  game.keyboardArray[1].powerHit = 0;
  game.menu();
  assert.equal(game.noInputFrameCounter, 0);
  assert.equal(game.physics.player1.isComputer, true);
  assert.equal(game.physics.player2.isComputer, true);
  assert.equal(
    game.getCurrentStateId(),
    GAME_STATE_IDS.AFTER_MENU_SELECTION
  );
});

test('pre-match states preserve 15, 15 and 71 frame boundaries', () => {
  const { game, GAME_STATE_IDS } = loadControllerHarness();

  game.transitionTo(GAME_STATE_IDS.AFTER_MENU_SELECTION);
  game.frameCounter = 14;
  game.afterMenuSelection();
  assert.equal(
    game.getCurrentStateId(),
    GAME_STATE_IDS.BEFORE_START_OF_NEW_GAME
  );

  game.frameCounter = 14;
  game.beforeStartOfNewGame();
  assert.equal(game.getCurrentStateId(), GAME_STATE_IDS.START_OF_NEW_GAME);

  game.frameCounter = 70;
  game.startOfNewGame();
  assert.equal(game.getCurrentStateId(), GAME_STATE_IDS.ROUND);
});

test('pause freezes the game loop and slow motion advances every fifth tick', () => {
  const { game, GAME_STATE_IDS } = loadControllerHarness();
  let stateCalls = 0;
  game.currentStateId = GAME_STATE_IDS.ROUND;
  game.state = () => {
    stateCalls++;
  };

  game.setPaused(true);
  game.gameLoop();
  assert.equal(stateCalls, 0);

  game.setPaused(false);
  game.slowMotionFramesLeft = 6;
  for (let tick = 0; tick < 4; tick++) {
    game.gameLoop();
  }
  assert.equal(stateCalls, 0);
  game.gameLoop();
  assert.equal(stateCalls, 1);
  assert.equal(game.slowMotionFramesLeft, 5);
});

test('scoring preserves slow motion and winning-score behavior', () => {
  const { game, GAME_STATE_IDS } = loadControllerHarness();
  game.transitionTo(GAME_STATE_IDS.ROUND);
  game.physics.nextGround = true;
  game.physics.ball.punchEffectX = 100;
  game.winningScore = 15;

  game.round();
  assert.deepEqual([...game.scores], [0, 1]);
  assert.equal(game.roundEnded, true);
  assert.equal(game.gameEnded, false);
  assert.equal(game.slowMotionFramesLeft, 6);

  game.roundEnded = false;
  game.slowMotionFramesLeft = 0;
  game.scores = [0, 0];
  game.winningScore = 1;
  game.round();
  assert.deepEqual([...game.scores], [0, 1]);
  assert.equal(game.gameEnded, true);
  assert.equal(game.physics.player2.isWinner, true);
  assert.equal(game.slowMotionFramesLeft, 0);
});

test('quick rematch becomes active at frame 70 and game end returns at 211', () => {
  const { game, GAME_STATE_IDS } = loadControllerHarness();
  game.transitionTo(GAME_STATE_IDS.ROUND);
  game.physics.player1.isComputer = false;
  game.gameEnded = true;
  game.frameCounter = 68;
  game.keyboardArray[0].powerHit = 1;

  game.round();
  assert.equal(game.frameCounter, 69);
  assert.equal(game.getCurrentStateId(), GAME_STATE_IDS.ROUND);

  game.round();
  assert.equal(game.frameCounter, 0);
  assert.equal(game.gameEnded, false);
  assert.equal(game.getCurrentStateId(), GAME_STATE_IDS.START_OF_NEW_GAME);

  game.transitionTo(GAME_STATE_IDS.ROUND);
  game.gameEnded = true;
  game.frameCounter = 210;
  game.keyboardArray[0].powerHit = 0;
  game.round();
  assert.equal(game.frameCounter, 0);
  assert.equal(game.getCurrentStateId(), GAME_STATE_IDS.INTRO);
});

test('practice reset is consumed only from an active practice round', () => {
  const { game, GAME_STATE_IDS } = loadControllerHarness();
  let resetCalls = 0;
  game.physics.ball.initializeForNewRound = () => {
    resetCalls++;
  };
  game.transitionTo(GAME_STATE_IDS.ROUND);
  game._isPracticeMode = true;
  game.ballResetRequested = true;

  game.round();
  assert.equal(resetCalls, 1);
  assert.equal(game.ballResetRequested, false);
  assert.deepEqual([...game.scores], [0, 0]);
});
