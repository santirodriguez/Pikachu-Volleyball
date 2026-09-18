'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GameCore } = require('../src/resources/js/game_core.cjs');
const {
  GAME_STATE_IDS,
} = require('../src/resources/js/game_lifecycle.cjs');

function createPlayer(isPlayer2 = false) {
  return {
    isPlayer2,
    x: isPlayer2 ? 396 : 36,
    y: 244,
    yVelocity: 0,
    state: 0,
    frameNumber: 0,
    delayBeforeNextFrame: 0,
    divingDirection: 0,
    lyingDownDurationLeft: -1,
    isComputer: false,
    isWinner: false,
    gameEnded: false,
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

function createPhysics() {
  const physics = {
    player1: createPlayer(false),
    player2: createPlayer(true),
    ball: {
      x: 56,
      y: 0,
      xVelocity: 0,
      yVelocity: 1,
      expectedLandingPointX: 0,
      rotation: 0,
      fineRotation: 0,
      punchEffectRadius: 0,
      punchEffectX: 0,
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
    },
    nextGround: false,
    runEngineForNextFrame() {
      this.player1.delayBeforeNextFrame += 1;
      this.player2.delayBeforeNextFrame += 1;
      if (this.nextGround) {
        this.ball.punchEffectRadius = 20;
        this.ball.sound.ballTouchesGround = true;
      }
      return this.nextGround;
    },
  };
  return physics;
}

function createCore() {
  return new GameCore({ physics: createPhysics(), groundHalfWidth: 216 });
}

test('core initializes without browser or renderer dependencies', () => {
  const core = createCore();
  const snapshot = core.getSnapshot();

  assert.equal(snapshot.state, GAME_STATE_IDS.INTRO);
  assert.equal(snapshot.normalFPS, 25);
  assert.equal(snapshot.slowMotionFPS, 5);
  assert.deepEqual(snapshot.scores, [0, 0]);
  assert.equal(snapshot.physics.ball.x, 56);
  assert.equal(snapshot.physics.player1.x, 36);
  assert.equal(snapshot.physics.player2.x, 396);
});

test('core preserves intro and menu lifecycle boundaries as serializable effects', () => {
  const core = createCore();
  let result = core.runState(GAME_STATE_IDS.INTRO);

  assert.equal(result.snapshot.frameCounter, 1);
  assert.deepEqual(result.effects, [
    ['intro.visible', true],
    ['fade.set', 0],
    ['audio.stop', 'bgm'],
    ['intro.drawMark', 0],
  ]);

  core.frameCounter = 164;
  result = core.runState(GAME_STATE_IDS.INTRO);
  assert.equal(result.snapshot.state, GAME_STATE_IDS.MENU);
  assert.equal(result.snapshot.frameCounter, 0);
  assert.deepEqual(result.effects, [
    ['intro.drawMark', 164],
    ['intro.visible', false],
  ]);

  core.frameCounter = 72;
  core.noInputFrameCounter = 224;
  result = core.runState(GAME_STATE_IDS.MENU);
  assert.equal(result.snapshot.state, GAME_STATE_IDS.AFTER_MENU_SELECTION);
  assert.equal(result.snapshot.noInputFrameCounter, 0);
  assert.equal(core.physics.player1.isComputer, true);
  assert.equal(core.physics.player2.isComputer, true);
});

test('core preserves scoring, slow motion and winning-score semantics', () => {
  const core = createCore();
  core.transitionTo(GAME_STATE_IDS.ROUND);
  core.physics.nextGround = true;
  core.physics.ball.punchEffectX = 100;

  let result = core.runState(GAME_STATE_IDS.ROUND);
  assert.deepEqual(result.snapshot.scores, [0, 1]);
  assert.equal(result.snapshot.isPlayer2Serve, true);
  assert.equal(result.snapshot.roundEnded, true);
  assert.equal(result.snapshot.gameEnded, false);
  assert.equal(result.snapshot.slowMotionFramesLeft, 6);
  assert.deepEqual(result.effects.slice(-2), [
    ['game.drawCloudsAndWave'],
    ['game.drawScores', 0, 1],
  ]);

  core.roundEnded = false;
  core.slowMotionFramesLeft = 0;
  core.scores = [0, 0];
  core.winningScore = 1;
  result = core.runState(GAME_STATE_IDS.ROUND);
  assert.deepEqual(result.snapshot.scores, [0, 1]);
  assert.equal(result.snapshot.gameEnded, true);
  assert.equal(core.physics.player1.gameEnded, true);
  assert.equal(core.physics.player2.gameEnded, true);
  assert.equal(core.physics.player2.isWinner, true);
  assert.equal(result.snapshot.slowMotionFramesLeft, 0);
});

test('core slow motion advances exactly every fifth normal tick', () => {
  const core = createCore();
  core.transitionTo(GAME_STATE_IDS.ROUND);
  core.slowMotionFramesLeft = 6;
  let engineCalls = 0;
  core.physics.runEngineForNextFrame = () => {
    engineCalls += 1;
    return false;
  };

  for (let tick = 0; tick < 4; tick += 1) {
    const result = core.step();
    assert.deepEqual(result.effects, []);
  }
  assert.equal(engineCalls, 0);

  const result = core.step();
  assert.equal(engineCalls, 1);
  assert.equal(result.snapshot.slowMotionFramesLeft, 5);
  assert.equal(result.snapshot.slowMotionNumOfSkippedFrames, 0);
});

test('core preserves quick rematch, practice reset, pause and restart commands', () => {
  const core = createCore();
  core.transitionTo(GAME_STATE_IDS.ROUND);
  core.gameEnded = true;
  core.frameCounter = 69;

  let result = core.runState(GAME_STATE_IDS.ROUND, {
    player1: { powerHit: 1 },
  });
  assert.equal(result.snapshot.state, GAME_STATE_IDS.START_OF_NEW_GAME);
  assert.equal(result.snapshot.frameCounter, 0);
  assert.equal(result.snapshot.gameEnded, false);

  core.transitionTo(GAME_STATE_IDS.ROUND);
  core.isPracticeMode = true;
  core.physics.ball.x = 200;
  core.requestPracticeReset();
  result = core.runState(GAME_STATE_IDS.ROUND);
  assert.equal(result.snapshot.physics.ball.x, 56);
  assert.equal(core.practiceResetRequested, false);

  core.setPaused(true);
  const before = core.getSnapshot();
  result = core.step();
  assert.deepEqual(result.snapshot, before);
  assert.deepEqual(result.effects, []);

  core.setPaused(false);
  result = core.restart();
  assert.equal(result.snapshot.state, GAME_STATE_IDS.INTRO);
  assert.equal(result.snapshot.frameCounter, 0);
  assert.deepEqual(result.effects, [
    ['menu.visible', false],
    ['game.visible', false],
  ]);
});
