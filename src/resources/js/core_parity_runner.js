'use strict';

import { setCustomRng } from './rand.js';
import { createGameCore } from './shared_core.js';

const GAME_STATE_IDS = Object.freeze({
  INTRO: 'intro',
  MENU: 'menu',
  AFTER_MENU_SELECTION: 'after-menu-selection',
  BEFORE_START_OF_NEW_GAME: 'before-start-of-new-game',
  START_OF_NEW_GAME: 'start-of-new-game',
  ROUND: 'round',
});

function assertEqual(label, actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function installDeterministicRng(values) {
  let index = 0;
  const calls = [];
  setCustomRng(() => {
    const value = values[index] ?? 0;
    index += 1;
    calls.push(value);
    return value / 32768;
  });
  return calls;
}

function snapshotPhysics(physics) {
  const player = (value) => ({
    x: value.x,
    y: value.y,
    yVelocity: value.yVelocity,
    state: value.state,
    frameNumber: value.frameNumber,
    delayBeforeNextFrame: value.delayBeforeNextFrame,
    divingDirection: value.divingDirection,
    lyingDownDurationLeft: value.lyingDownDurationLeft,
    isComputer: value.isComputer,
    isWinner: value.isWinner,
    gameEnded: value.gameEnded,
    computerBoldness: value.computerBoldness,
    computerWhereToStandBy: value.computerWhereToStandBy,
    isCollisionWithBallHappened: value.isCollisionWithBallHappened,
  });

  return {
    player1: player(physics.player1),
    player2: player(physics.player2),
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

function capturePhysics() {
  const rngCalls = installDeterministicRng([1, 2, 3, 4, 5, 6, 7, 8]);
  const core = createGameCore({
    isPlayer1Computer: false,
    isPlayer2Computer: false,
  });
  const inputs = [
    { xDirection: 0, yDirection: 0, powerHit: 0 },
    { xDirection: 0, yDirection: 0, powerHit: 0 },
  ];
  const checkpoints = [{ frame: 0, physics: snapshotPhysics(core.physics) }];

  for (let frame = 1; frame <= 6; frame += 1) {
    core.physics.runEngineForNextFrame(inputs);
    if ([1, 3, 6].includes(frame)) {
      checkpoints.push({ frame, physics: snapshotPhysics(core.physics) });
    }
  }

  assertEqual('physics frame 1 ball', checkpoints[1].physics.ball, {
    x: 56,
    y: 1,
    xVelocity: 0,
    yVelocity: 2,
    expectedLandingPointX: 56,
    rotation: 0,
    fineRotation: 0,
    punchEffectRadius: 0,
    punchEffectX: 0,
    punchEffectY: 0,
    isPowerHit: false,
    previousX: 56,
    previousY: 0,
    previousPreviousX: 0,
    previousPreviousY: 0,
  });
  assertEqual(
    'physics frame 3 ball position',
    [checkpoints[2].physics.ball.x, checkpoints[2].physics.ball.y],
    [56, 6]
  );
  setCustomRng(null);
  return { rngCalls, checkpoints };
}

function captureAi() {
  const values = Array.from({ length: 64 }, (_, index) =>
    (index * 7919) % 32768
  );
  const rngCalls = installDeterministicRng(values);
  const core = createGameCore({
    isPlayer1Computer: true,
    isPlayer2Computer: true,
  });
  const inputs = [
    { xDirection: 0, yDirection: 0, powerHit: 0 },
    { xDirection: 0, yDirection: 0, powerHit: 0 },
  ];

  core.physics.player1.x = 100;
  core.physics.player2.x = 332;
  core.physics.ball.x = 180;
  core.physics.ball.y = 200;
  core.physics.ball.xVelocity = 10;
  core.physics.ball.yVelocity = 1;
  core.physics.ball.expectedLandingPointX = 180;

  const frames = [];
  for (let frame = 1; frame <= 6; frame += 1) {
    core.physics.runEngineForNextFrame(inputs);
    frames.push({
      frame,
      inputs: inputs.map((input) => ({
        xDirection: input.xDirection,
        yDirection: input.yDirection,
        powerHit: input.powerHit,
      })),
      physics: snapshotPhysics(core.physics),
      rngCallCount: rngCalls.length,
    });
  }

  assertEqual('AI RNG order', rngCalls, [0, 7919, 15838, 23757]);
  assertEqual('AI RNG call counts', frames.map(({ rngCallCount }) => rngCallCount), [
    2,
    2,
    2,
    3,
    4,
    4,
  ]);
  assertEqual('AI final input', frames[5].inputs, [
    { xDirection: 1, yDirection: 0, powerHit: 0 },
    { xDirection: 1, yDirection: 0, powerHit: 0 },
  ]);
  assertEqual(
    'AI final state',
    {
      player1X: frames[5].physics.player1.x,
      player1Y: frames[5].physics.player1.y,
      player2X: frames[5].physics.player2.x,
      ballX: frames[5].physics.ball.x,
      ballY: frames[5].physics.ball.y,
      ballXVelocity: frames[5].physics.ball.xVelocity,
      ballYVelocity: frames[5].physics.ball.yVelocity,
      expectedLandingPointX: frames[5].physics.ball.expectedLandingPointX,
    },
    {
      player1X: 146,
      player1Y: 229,
      player2X: 308,
      ballX: 180,
      ballY: 200,
      ballXVelocity: 10,
      ballYVelocity: -14,
      expectedLandingPointX: 360,
    }
  );
  setCustomRng(null);
  return { rngCalls, frames };
}

function createHumanCore() {
  installDeterministicRng([0, 1, 2, 3, 4, 5, 6, 7]);
  const core = createGameCore({
    isPlayer1Computer: false,
    isPlayer2Computer: false,
  });
  setCustomRng(null);
  return core;
}

function captureLifecycle() {
  const core = createHumanCore();
  const checkpoints = [];

  checkpoints.push({ name: 'intro-first', ...core.runState(GAME_STATE_IDS.INTRO) });
  core.frameCounter = 164;
  checkpoints.push({ name: 'intro-timeout', ...core.runState(GAME_STATE_IDS.INTRO) });

  core.frameCounter = 72;
  core.noInputFrameCounter = 224;
  checkpoints.push({ name: 'menu-inactivity', ...core.runState(GAME_STATE_IDS.MENU) });

  core.transitionTo(GAME_STATE_IDS.AFTER_MENU_SELECTION);
  core.frameCounter = 14;
  checkpoints.push({
    name: 'after-menu-boundary',
    ...core.runState(GAME_STATE_IDS.AFTER_MENU_SELECTION),
  });

  core.frameCounter = 14;
  checkpoints.push({
    name: 'before-game-boundary',
    ...core.runState(GAME_STATE_IDS.BEFORE_START_OF_NEW_GAME),
  });

  core.frameCounter = 70;
  checkpoints.push({
    name: 'start-game-boundary',
    ...core.runState(GAME_STATE_IDS.START_OF_NEW_GAME),
  });

  assertEqual(
    'lifecycle boundaries',
    checkpoints.map(({ name, snapshot }) => [
      name,
      snapshot.state,
      snapshot.frameCounter,
    ]),
    [
      ['intro-first', 'intro', 1],
      ['intro-timeout', 'menu', 0],
      ['menu-inactivity', 'after-menu-selection', 0],
      ['after-menu-boundary', 'before-start-of-new-game', 0],
      ['before-game-boundary', 'start-of-new-game', 0],
      ['start-game-boundary', 'round', 0],
    ]
  );
  assertEqual('intro effects', checkpoints[0].effects, [
    ['intro.visible', true],
    ['fade.set', 0],
    ['audio.stop', 'bgm'],
    ['intro.drawMark', 0],
  ]);
  return checkpoints;
}

function prepareGroundContact(core, x, winningScore) {
  core.physics.player1.isComputer = false;
  core.physics.player2.isComputer = false;
  core.physics.ball.x = x;
  core.physics.ball.y = 252;
  core.physics.ball.xVelocity = 0;
  core.physics.ball.yVelocity = 1;
  core.physics.ball.punchEffectRadius = 0;
  core.physics.ball.punchEffectX = x;
  core.physics.ball.punchEffectY = 272;
  core.winningScore = winningScore;
  core.roundEnded = false;
  core.gameEnded = false;
}

function captureScoring() {
  const core = createHumanCore();
  core.transitionTo(GAME_STATE_IDS.ROUND);
  prepareGroundContact(core, 100, 15);
  const score = core.runState(GAME_STATE_IDS.ROUND);

  const slowTicks = [];
  for (let tick = 1; tick <= 5; tick += 1) {
    const result = core.step();
    slowTicks.push({
      tick,
      slowMotionFramesLeft: result.snapshot.slowMotionFramesLeft,
      skipped: result.snapshot.slowMotionNumOfSkippedFrames,
      effects: result.effects,
    });
  }

  const winningCore = createHumanCore();
  winningCore.transitionTo(GAME_STATE_IDS.ROUND);
  prepareGroundContact(winningCore, 100, 1);
  const winning = winningCore.runState(GAME_STATE_IDS.ROUND);

  assertEqual(
    'score state',
    {
      scores: score.snapshot.scores,
      serve: score.snapshot.isPlayer2Serve,
      roundEnded: score.snapshot.roundEnded,
      gameEnded: score.snapshot.gameEnded,
      slowMotionFramesLeft: score.snapshot.slowMotionFramesLeft,
    },
    {
      scores: [0, 1],
      serve: true,
      roundEnded: true,
      gameEnded: false,
      slowMotionFramesLeft: 6,
    }
  );
  assertEqual(
    'slow motion fifth tick',
    [slowTicks[4].slowMotionFramesLeft, slowTicks[4].skipped],
    [5, 0]
  );
  assertEqual(
    'winning state',
    {
      scores: winning.snapshot.scores,
      gameEnded: winning.snapshot.gameEnded,
      player2Winner: winning.snapshot.physics.player2.isWinner,
      slowMotionFramesLeft: winning.snapshot.slowMotionFramesLeft,
    },
    {
      scores: [0, 1],
      gameEnded: true,
      player2Winner: true,
      slowMotionFramesLeft: 0,
    }
  );
  return { score, slowTicks, winning };
}

function captureCommands() {
  const core = createHumanCore();
  core.transitionTo(GAME_STATE_IDS.ROUND);
  core.gameEnded = true;
  core.frameCounter = 68;
  const before = core.runState(GAME_STATE_IDS.ROUND, {
    player1: { powerHit: 1 },
  });
  const rematch = core.runState(GAME_STATE_IDS.ROUND, {
    player1: { powerHit: 1 },
  });

  core.transitionTo(GAME_STATE_IDS.ROUND);
  core.isPracticeMode = true;
  core.physics.ball.x = 200;
  core.physics.ball.y = 200;
  core.requestPracticeReset();
  const practice = core.runState(GAME_STATE_IDS.ROUND);

  core.setPaused(true);
  const pauseBefore = core.getSnapshot();
  const paused = core.step();
  core.setPaused(false);
  const restart = core.restart();

  assertEqual(
    'quick rematch boundary',
    [before.snapshot.state, before.snapshot.frameCounter],
    ['round', 69]
  );
  assertEqual(
    'quick rematch transition',
    [rematch.snapshot.state, rematch.snapshot.frameCounter],
    ['start-of-new-game', 0]
  );
  assertEqual('practice reset ball', [practice.snapshot.physics.ball.x, practice.snapshot.physics.ball.y], [56, 0]);
  assertEqual('pause freeze', paused.snapshot, pauseBefore);
  assertEqual('pause effects', paused.effects, []);
  assertEqual(
    'restart state',
    [restart.snapshot.state, restart.snapshot.frameCounter],
    ['intro', 0]
  );
  return { before, rematch, practice, pauseBefore, paused, restart };
}

export function createPortableCoreParityTrace() {
  return {
    schemaVersion: 1,
    physics: capturePhysics(),
    ai: captureAi(),
    lifecycle: captureLifecycle(),
    scoring: captureScoring(),
    commands: captureCommands(),
  };
}

const output = createPortableCoreParityTrace();
console.log(JSON.stringify(output));
