'use strict';

const lifecycleModule = require('./game_lifecycle.cjs');
const presentationModule = require('./game_presentation.cjs');

const {
  GAME_STATE_IDS,
  getGameStateHandlerName,
  isMatchInProgress,
} = lifecycleModule;
const { createGamePresentationState, advancePunchEffect } = presentationModule;

const FRAME_TOTALS = Object.freeze({
  intro: 165,
  afterMenuSelection: 15,
  beforeStartOfNewGame: 15,
  startOfNewGame: 71,
  afterEndOfRound: 5,
  beforeStartOfNextRound: 30,
  gameEnd: 211,
});
const NO_INPUT_FRAME_TOTALS = Object.freeze({ menu: 225 });
const NORMAL_FPS = 25;
const SLOW_MOTION_FPS = 5;
const SLOW_MOTION_FRAMES_NUM = 6;

function cloneInput(input = {}) {
  return {
    xDirection: input.xDirection === -1 ? -1 : input.xDirection === 1 ? 1 : 0,
    yDirection: input.yDirection === -1 ? -1 : input.yDirection === 1 ? 1 : 0,
    powerHit: input.powerHit === 1 ? 1 : 0,
  };
}

function normalizeFrameInput(frameInput = {}) {
  const players = Array.isArray(frameInput.players)
    ? frameInput.players
    : [frameInput.player1, frameInput.player2];
  return [cloneInput(players[0]), cloneInput(players[1])];
}

function snapshotPlayer(player) {
  return {
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
  };
}

function snapshotPhysics(physics) {
  return {
    player1: snapshotPlayer(physics.player1),
    player2: snapshotPlayer(physics.player2),
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

class GameCore {
  constructor({ physics, groundHalfWidth }) {
    if (!physics) throw new Error('GameCore requires a physics model');
    if (!Number.isFinite(groundHalfWidth)) {
      throw new Error('GameCore requires groundHalfWidth');
    }

    this.physics = physics;
    this.groundHalfWidth = groundHalfWidth;
    this.normalFPS = NORMAL_FPS;
    this.slowMotionFPS = SLOW_MOTION_FPS;
    this.SLOW_MOTION_FRAMES_NUM = SLOW_MOTION_FRAMES_NUM;
    this.slowMotionFramesLeft = 0;
    this.slowMotionNumOfSkippedFrames = 0;
    this.selectedWithWho = 0;
    this.scores = [0, 0];
    this.winningScore = 15;
    this.gameEnded = false;
    this.roundEnded = false;
    this.isPlayer2Serve = false;
    this.frameCounter = 0;
    this.frameTotal = { ...FRAME_TOTALS };
    this.noInputFrameCounter = 0;
    this.noInputFrameTotal = { ...NO_INPUT_FRAME_TOTALS };
    this.paused = false;
    this.isStereoSound = true;
    this.isPracticeMode = false;
    this.practiceResetRequested = false;
    this.currentStateId = GAME_STATE_IDS.INTRO;
    this.lastFrameInputs = [cloneInput(), cloneInput()];
    this.effects = [];
  }

  transitionTo(stateId) {
    if (getGameStateHandlerName(stateId) === null) {
      throw new Error(`Unknown game state: ${stateId}`);
    }
    this.currentStateId = stateId;
  }

  getCurrentStateId() {
    return this.currentStateId;
  }

  isMatchInProgress() {
    return isMatchInProgress(this.currentStateId);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    return this.paused;
  }

  isPaused() {
    return this.paused;
  }

  setPracticeMode(enabled) {
    this.isPracticeMode = Boolean(enabled);
    this.emit('game.scoreboards.visible', !this.isPracticeMode);
    return this.finish();
  }

  requestPracticeReset() {
    this.practiceResetRequested = true;
  }

  consumePracticeResetRequest() {
    const requested = this.practiceResetRequested;
    this.practiceResetRequested = false;
    return requested;
  }

  beginFrame() {
    if (this.paused) return false;
    if (this.currentStateId !== GAME_STATE_IDS.ROUND) {
      this.practiceResetRequested = false;
    }
    if (this.slowMotionFramesLeft > 0) {
      this.slowMotionNumOfSkippedFrames += 1;
      if (
        this.slowMotionNumOfSkippedFrames %
          Math.round(this.normalFPS / this.slowMotionFPS) !==
        0
      ) {
        return false;
      }
      this.slowMotionFramesLeft -= 1;
      this.slowMotionNumOfSkippedFrames = 0;
    }
    return true;
  }

  step(frameInput = {}) {
    this.effects.length = 0;
    if (!this.beginFrame()) return this.finish();
    return this.runState(this.currentStateId, frameInput);
  }

  runState(stateId, frameInput = {}) {
    this.effects.length = 0;
    const inputs = normalizeFrameInput(frameInput);
    this.lastFrameInputs = inputs;

    switch (stateId) {
      case GAME_STATE_IDS.INTRO:
        this.runIntro(inputs);
        break;
      case GAME_STATE_IDS.MENU:
        this.runMenu(inputs);
        break;
      case GAME_STATE_IDS.AFTER_MENU_SELECTION:
        this.runAfterMenuSelection();
        break;
      case GAME_STATE_IDS.BEFORE_START_OF_NEW_GAME:
        this.runBeforeStartOfNewGame();
        break;
      case GAME_STATE_IDS.START_OF_NEW_GAME:
        this.runStartOfNewGame();
        break;
      case GAME_STATE_IDS.ROUND:
        this.runRound(inputs);
        break;
      case GAME_STATE_IDS.AFTER_END_OF_ROUND:
        this.runAfterEndOfRound();
        break;
      case GAME_STATE_IDS.BEFORE_START_OF_NEXT_ROUND:
        this.runBeforeStartOfNextRound();
        break;
      default:
        throw new Error(`Unknown game state: ${stateId}`);
    }

    this.lastFrameInputs = inputs.map(cloneInput);
    return this.finish();
  }

  runIntro(inputs) {
    if (this.frameCounter === 0) {
      this.emit('intro.visible', true);
      this.emit('fade.set', 0);
      this.emit('audio.stop', 'bgm');
    }
    this.emit('intro.drawMark', this.frameCounter);
    this.frameCounter += 1;

    if (inputs[0].powerHit === 1 || inputs[1].powerHit === 1) {
      this.frameCounter = 0;
      this.emit('intro.visible', false);
      this.transitionTo(GAME_STATE_IDS.MENU);
    }

    if (this.frameCounter >= this.frameTotal.intro) {
      this.frameCounter = 0;
      this.emit('intro.visible', false);
      this.transitionTo(GAME_STATE_IDS.MENU);
    }
  }

  runMenu(inputs) {
    if (this.frameCounter === 0) {
      this.emit('menu.visible', true);
      this.emit('fade.set', 0);
      this.selectedWithWho = 0;
      this.emit('menu.selectWithWho', this.selectedWithWho);
      this.emit('quickRematch.visible', false);
    }
    this.emit('menu.drawFightMessage', this.frameCounter);
    this.emit('menu.drawSachisoft', this.frameCounter);
    this.emit('menu.drawSittingPikachuTiles', this.frameCounter);
    this.emit('menu.drawPikachuVolleyballMessage', this.frameCounter);
    this.emit('menu.drawPokemonMessage', this.frameCounter);
    this.emit('menu.drawWithWhoMessages', this.frameCounter);
    this.frameCounter += 1;

    const pressedPowerHit =
      inputs[0].powerHit === 1 || inputs[1].powerHit === 1;
    if (this.frameCounter < 71 && pressedPowerHit) {
      this.frameCounter = 71;
      return;
    }
    if (this.frameCounter <= 71) return;

    if (
      (inputs[0].yDirection === -1 || inputs[1].yDirection === -1) &&
      this.selectedWithWho === 1
    ) {
      this.noInputFrameCounter = 0;
      this.selectedWithWho = 0;
      this.emit('menu.selectWithWho', this.selectedWithWho);
      this.emit('audio.play', 'pi', 0);
    } else if (
      (inputs[0].yDirection === 1 || inputs[1].yDirection === 1) &&
      this.selectedWithWho === 0
    ) {
      this.noInputFrameCounter = 0;
      this.selectedWithWho = 1;
      this.emit('menu.selectWithWho', this.selectedWithWho);
      this.emit('audio.play', 'pi', 0);
    } else {
      this.noInputFrameCounter += 1;
    }

    if (pressedPowerHit) {
      if (this.selectedWithWho === 1) {
        this.physics.player1.isComputer = false;
        this.physics.player2.isComputer = false;
      } else if (inputs[0].powerHit === 1) {
        this.physics.player1.isComputer = false;
        this.physics.player2.isComputer = true;
      } else if (inputs[1].powerHit === 1) {
        this.physics.player1.isComputer = true;
        this.physics.player2.isComputer = false;
      }
      this.emit('audio.play', 'pikachu', 0);
      this.frameCounter = 0;
      this.noInputFrameCounter = 0;
      this.transitionTo(GAME_STATE_IDS.AFTER_MENU_SELECTION);
      return;
    }

    if (this.noInputFrameCounter >= this.noInputFrameTotal.menu) {
      this.physics.player1.isComputer = true;
      this.physics.player2.isComputer = true;
      this.frameCounter = 0;
      this.noInputFrameCounter = 0;
      this.transitionTo(GAME_STATE_IDS.AFTER_MENU_SELECTION);
    }
  }

  runAfterMenuSelection() {
    this.emit('fade.change', 1 / 16);
    this.frameCounter += 1;
    if (this.frameCounter >= this.frameTotal.afterMenuSelection) {
      this.frameCounter = 0;
      this.transitionTo(GAME_STATE_IDS.BEFORE_START_OF_NEW_GAME);
    }
  }

  runBeforeStartOfNewGame() {
    this.frameCounter += 1;
    if (this.frameCounter >= this.frameTotal.beforeStartOfNewGame) {
      this.frameCounter = 0;
      this.emit('menu.visible', false);
      this.transitionTo(GAME_STATE_IDS.START_OF_NEW_GAME);
    }
  }

  runStartOfNewGame() {
    if (this.frameCounter === 0) {
      this.emit('game.visible', true);
      this.gameEnded = false;
      this.roundEnded = false;
      this.isPlayer2Serve = false;
      this.physics.player1.gameEnded = false;
      this.physics.player1.isWinner = false;
      this.physics.player2.gameEnded = false;
      this.physics.player2.isWinner = false;
      this.scores[0] = 0;
      this.scores[1] = 0;
      this.emit('game.drawScores', ...this.scores);
      this.physics.player1.initializeForNewRound();
      this.physics.player2.initializeForNewRound();
      this.physics.ball.initializeForNewRound(this.isPlayer2Serve);
      this.emitPlayersAndBall();
      this.emit('fade.set', 1);
      this.emit('audio.play', 'bgm', 0);
      this.emit('quickRematch.visible', false);
    }

    this.emit('game.drawStart', this.frameCounter, this.frameTotal.startOfNewGame);
    this.emit('game.drawCloudsAndWave');
    this.emit('fade.change', -(1 / 17));
    this.frameCounter += 1;

    if (this.frameCounter >= this.frameTotal.startOfNewGame) {
      this.frameCounter = 0;
      this.emit('fade.set', 0);
      this.transitionTo(GAME_STATE_IDS.ROUND);
    }
  }

  runRound(inputs) {
    const practiceResetRequested = this.consumePracticeResetRequest();
    if (this.isPracticeMode && practiceResetRequested) {
      this.resetBallForPracticeInternal();
      return;
    }

    const pressedPowerHit =
      inputs[0].powerHit === 1 || inputs[1].powerHit === 1;
    if (
      this.physics.player1.isComputer === true &&
      this.physics.player2.isComputer === true &&
      pressedPowerHit
    ) {
      this.frameCounter = 0;
      this.emit('game.visible', false);
      this.transitionTo(GAME_STATE_IDS.INTRO);
      return;
    }

    const isBallTouchingGround = this.physics.runEngineForNextFrame(inputs);
    this.emitPhysicsSoundEffects();
    this.emitPlayersAndBall();
    this.emit('game.drawCloudsAndWave');

    if (this.gameEnded === true) {
      this.emit('game.drawEnd', this.frameCounter);
      this.frameCounter += 1;
      this.emit('quickRematch.visible', this.frameCounter >= 70);
      if (this.frameCounter >= 70 && pressedPowerHit) {
        this.startQuickRematchInternal();
        return;
      }
      if (this.frameCounter >= this.frameTotal.gameEnd) {
        this.frameCounter = 0;
        this.emit('game.visible', false);
        this.emit('quickRematch.visible', false);
        this.transitionTo(GAME_STATE_IDS.INTRO);
      }
      return;
    }

    if (
      isBallTouchingGround &&
      this.isPracticeMode === false &&
      this.roundEnded === false &&
      this.gameEnded === false
    ) {
      if (this.physics.ball.punchEffectX < this.groundHalfWidth) {
        this.isPlayer2Serve = true;
        this.scores[1] += 1;
        if (this.scores[1] >= this.winningScore) {
          this.gameEnded = true;
          this.physics.player1.isWinner = false;
          this.physics.player2.isWinner = true;
          this.physics.player1.gameEnded = true;
          this.physics.player2.gameEnded = true;
        }
      } else {
        this.isPlayer2Serve = false;
        this.scores[0] += 1;
        if (this.scores[0] >= this.winningScore) {
          this.gameEnded = true;
          this.physics.player1.isWinner = true;
          this.physics.player2.isWinner = false;
          this.physics.player1.gameEnded = true;
          this.physics.player2.gameEnded = true;
        }
      }
      this.emit('game.drawScores', ...this.scores);
      if (this.roundEnded === false && this.gameEnded === false) {
        this.slowMotionFramesLeft = this.SLOW_MOTION_FRAMES_NUM;
      }
      this.roundEnded = true;
    }

    if (this.roundEnded === true && this.gameEnded === false) {
      if (this.slowMotionFramesLeft === 0) {
        this.emit('fade.change', 1 / 16);
        this.transitionTo(GAME_STATE_IDS.AFTER_END_OF_ROUND);
      }
    }
  }

  runAfterEndOfRound() {
    this.emit('fade.change', 1 / 16);
    this.frameCounter += 1;
    if (this.frameCounter >= this.frameTotal.afterEndOfRound) {
      this.frameCounter = 0;
      this.transitionTo(GAME_STATE_IDS.BEFORE_START_OF_NEXT_ROUND);
    }
  }

  runBeforeStartOfNextRound() {
    if (this.frameCounter === 0) {
      this.emit('fade.set', 1);
      this.emit('game.drawReady', false);
      this.physics.player1.initializeForNewRound();
      this.physics.player2.initializeForNewRound();
      this.physics.ball.initializeForNewRound(this.isPlayer2Serve);
      this.emitPlayersAndBall();
    }

    this.emit('game.drawCloudsAndWave');
    this.emit('fade.change', -(1 / 16));
    this.frameCounter += 1;
    if (this.frameCounter % 5 === 0) this.emit('game.toggleReady');

    if (this.frameCounter >= this.frameTotal.beforeStartOfNextRound) {
      this.frameCounter = 0;
      this.emit('game.drawReady', false);
      this.emit('fade.set', 0);
      this.roundEnded = false;
      this.transitionTo(GAME_STATE_IDS.ROUND);
    }
  }

  startQuickRematch() {
    this.effects.length = 0;
    this.startQuickRematchInternal();
    return this.finish();
  }

  startQuickRematchInternal() {
    this.frameCounter = 0;
    this.roundEnded = false;
    this.gameEnded = false;
    this.isPlayer2Serve = false;
    this.slowMotionFramesLeft = 0;
    this.slowMotionNumOfSkippedFrames = 0;
    this.emit('game.visible', false);
    this.emit('quickRematch.visible', false);
    this.transitionTo(GAME_STATE_IDS.START_OF_NEW_GAME);
  }

  resetBallForPractice() {
    this.effects.length = 0;
    this.resetBallForPracticeInternal();
    return this.finish();
  }

  resetBallForPracticeInternal() {
    this.physics.ball.initializeForNewRound(this.isPlayer2Serve);
    this.emitPlayersAndBall();
    this.emit('game.drawCloudsAndWave');
  }

  restart() {
    this.effects.length = 0;
    this.frameCounter = 0;
    this.noInputFrameCounter = 0;
    this.slowMotionFramesLeft = 0;
    this.slowMotionNumOfSkippedFrames = 0;
    this.emit('menu.visible', false);
    this.emit('game.visible', false);
    this.transitionTo(GAME_STATE_IDS.INTRO);
    return this.finish();
  }

  emitPlayersAndBall() {
    const punchEffectRadius = advancePunchEffect(this.physics.ball);
    const snapshot = createGamePresentationState(this.physics, {
      punchEffectRadius,
    });
    this.emit('game.drawPlayersAndBall', snapshot);
  }

  emitPhysicsSoundEffects() {
    for (let index = 0; index < 2; index += 1) {
      const player = this.physics[`player${index + 1}`];
      const sound = player.sound;
      const pan = this.isStereoSound ? (index === 0 ? -1 : 1) : 0;
      for (const soundName of ['pipikachu', 'pika', 'chu']) {
        if (sound[soundName] === true) {
          this.emit('audio.play', soundName, pan);
          sound[soundName] = false;
        }
      }
    }

    const ball = this.physics.ball;
    const sound = ball.sound;
    let pan = 0;
    if (this.isStereoSound) {
      if (ball.punchEffectX < this.groundHalfWidth) pan = -1;
      else if (ball.punchEffectX > this.groundHalfWidth) pan = 1;
    }
    for (const soundName of ['powerHit', 'ballTouchesGround']) {
      if (sound[soundName] === true) {
        this.emit('audio.play', soundName, pan);
        sound[soundName] = false;
      }
    }
  }

  emit(type, ...args) {
    this.effects.push([type, ...args]);
  }

  finish() {
    const result = {
      snapshot: this.getSnapshot(),
      effects: this.effects.map((effect) => [...effect]),
    };
    this.effects.length = 0;
    return result;
  }

  getSnapshot() {
    return {
      state: this.currentStateId,
      frameCounter: this.frameCounter,
      noInputFrameCounter: this.noInputFrameCounter,
      scores: [...this.scores],
      winningScore: this.winningScore,
      isPlayer2Serve: this.isPlayer2Serve,
      roundEnded: this.roundEnded,
      gameEnded: this.gameEnded,
      paused: this.paused,
      slowMotionFramesLeft: this.slowMotionFramesLeft,
      slowMotionNumOfSkippedFrames: this.slowMotionNumOfSkippedFrames,
      isPracticeMode: this.isPracticeMode,
      normalFPS: this.normalFPS,
      slowMotionFPS: this.slowMotionFPS,
      physics: snapshotPhysics(this.physics),
      lastFrameInputs: this.lastFrameInputs.map(cloneInput),
    };
  }
}

module.exports = {
  FRAME_TOTALS,
  NO_INPUT_FRAME_TOTALS,
  NORMAL_FPS,
  SLOW_MOTION_FPS,
  SLOW_MOTION_FRAMES_NUM,
  GameCore,
  normalizeFrameInput,
  snapshotPhysics,
};
