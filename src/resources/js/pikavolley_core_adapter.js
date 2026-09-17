/**
 * Browser/Pixi adapter for the host-neutral gameplay core.
 *
 * This file intentionally preserves the existing PikachuVolleyball public
 * surface while moving deterministic gameplay ownership into GameCore.
 */
'use strict';

import { MenuView, GameView, FadeInOut, IntroView } from './view.js';
import { PikaKeyboard } from './keyboard.js';
import { PikaAudio } from './audio.js';
import gameLifecycleModule from './game_lifecycle.cjs';
import { createGameCore } from './shared_core.js';

const { GAME_STATE_IDS, getGameStateHandlerName } = gameLifecycleModule;

/**
 * Class representing Pikachu Volleyball in browser/Electron hosts.
 */
export class PikachuVolleyball {
  /**
   * @param {import('@pixi/display').Container} stage
   * @param {Object} resources
   */
  constructor(stage, resources) {
    this.view = {
      intro: new IntroView(resources),
      menu: new MenuView(resources),
      game: new GameView(resources),
      fadeInOut: new FadeInOut(resources),
    };
    stage.addChild(this.view.intro.container);
    stage.addChild(this.view.menu.container);
    stage.addChild(this.view.game.container);
    stage.addChild(this.view.fadeInOut.black);
    this.view.intro.visible = false;
    this.view.menu.visible = false;
    this.view.game.visible = false;
    this.view.fadeInOut.visible = false;

    this.audio = new PikaAudio();
    this.core = createGameCore();
    this.physics = this.core.physics;
    this.keyboardArray = [
      new PikaKeyboard('KeyD', 'KeyG', 'KeyR', 'KeyV', 'KeyZ', 'KeyF'),
      new PikaKeyboard(
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter'
      ),
    ];

    this.ballResetKeyCode = 'KeyB';
    this.ballResetKeyDownListener = this.onBallResetKeyDown.bind(this);
    window.addEventListener('keydown', this.ballResetKeyDownListener);

    this.transitionTo(GAME_STATE_IDS.INTRO);
    this.setQuickRematchHintVisibility(false);
  }

  gameLoop() {
    if (!this.core.beginFrame()) return;
    this.keyboardArray[0].getInput();
    this.keyboardArray[1].getInput();
    this.state();
  }

  transitionTo(stateId) {
    const handlerName = getGameStateHandlerName(stateId);
    if (handlerName === null || typeof this[handlerName] !== 'function') {
      throw new Error(`Unknown game state: ${stateId}`);
    }
    this.core.transitionTo(stateId);
    this.state = this[handlerName];
  }

  getCurrentStateId() {
    return this.core.getCurrentStateId();
  }

  setPaused(paused) {
    return this.core.setPaused(paused);
  }

  isPaused() {
    return this.core.isPaused();
  }

  isMatchInProgress() {
    return this.core.isMatchInProgress();
  }

  intro() {
    this.runCoreState(GAME_STATE_IDS.INTRO);
  }

  menu() {
    this.runCoreState(GAME_STATE_IDS.MENU);
  }

  afterMenuSelection() {
    this.runCoreState(GAME_STATE_IDS.AFTER_MENU_SELECTION);
  }

  beforeStartOfNewGame() {
    this.runCoreState(GAME_STATE_IDS.BEFORE_START_OF_NEW_GAME);
  }

  startOfNewGame() {
    this.runCoreState(GAME_STATE_IDS.START_OF_NEW_GAME);
  }

  round() {
    this.runCoreState(GAME_STATE_IDS.ROUND);
  }

  afterEndOfRound() {
    this.runCoreState(GAME_STATE_IDS.AFTER_END_OF_ROUND);
  }

  beforeStartOfNextRound() {
    this.runCoreState(GAME_STATE_IDS.BEFORE_START_OF_NEXT_ROUND);
  }

  startQuickRematch() {
    this.applyCoreResult(this.core.startQuickRematch());
  }

  onBallResetKeyDown(event) {
    if (event.code !== this.ballResetKeyCode || event.repeat) return;
    this.core.requestPracticeReset();
    event.preventDefault();
  }

  consumeBallResetRequest() {
    return this.core.consumePracticeResetRequest();
  }

  resetBallForPractice() {
    this.applyCoreResult(this.core.resetBallForPractice());
  }

  setQuickRematchHintVisibility(visible) {
    const quickRematchHint = document.getElementById('quick-rematch-hint');
    if (quickRematchHint === null) return;
    if (visible) {
      quickRematchHint.classList.remove('hidden');
    } else {
      quickRematchHint.classList.add('hidden');
    }
  }

  restart() {
    this.applyCoreResult(this.core.restart());
  }

  runCoreState(stateId) {
    const result = this.core.runState(stateId, this.createFrameInput());
    this.applyCoreResult(result);
  }

  createFrameInput() {
    return {
      players: this.keyboardArray.map((keyboard) => ({
        xDirection: keyboard.xDirection,
        yDirection: keyboard.yDirection,
        powerHit: keyboard.powerHit,
      })),
    };
  }

  applyCoreResult(result) {
    this.syncFrameInputs(result.snapshot.lastFrameInputs);
    for (const effect of result.effects) this.applyCoreEffect(effect);
    this.syncStateHandler();
    return result;
  }

  syncFrameInputs(frameInputs) {
    if (!Array.isArray(frameInputs)) return;
    for (let index = 0; index < 2; index += 1) {
      const input = frameInputs[index];
      if (!input) continue;
      this.keyboardArray[index].xDirection = input.xDirection;
      this.keyboardArray[index].yDirection = input.yDirection;
      this.keyboardArray[index].powerHit = input.powerHit;
    }
  }

  syncStateHandler() {
    const handlerName = getGameStateHandlerName(this.core.getCurrentStateId());
    if (handlerName === null || typeof this[handlerName] !== 'function') {
      throw new Error(`Unknown game state: ${this.core.getCurrentStateId()}`);
    }
    this.state = this[handlerName];
  }

  applyCoreEffect(effect) {
    const [type, ...args] = effect;
    switch (type) {
      case 'intro.visible':
        this.view.intro.visible = args[0];
        return;
      case 'menu.visible':
        this.view.menu.visible = args[0];
        return;
      case 'game.visible':
        this.view.game.visible = args[0];
        return;
      case 'fade.set':
        this.view.fadeInOut.setBlackAlphaTo(args[0]);
        return;
      case 'fade.change':
        this.view.fadeInOut.changeBlackAlphaBy(args[0]);
        return;
      case 'intro.drawMark':
        this.view.intro.drawMark(args[0]);
        return;
      case 'menu.selectWithWho':
        this.view.menu.selectWithWho(args[0]);
        return;
      case 'menu.drawFightMessage':
        this.view.menu.drawFightMessage(args[0]);
        return;
      case 'menu.drawSachisoft':
        this.view.menu.drawSachisoft(args[0]);
        return;
      case 'menu.drawSittingPikachuTiles':
        this.view.menu.drawSittingPikachuTiles(args[0]);
        return;
      case 'menu.drawPikachuVolleyballMessage':
        this.view.menu.drawPikachuVolleyballMessage(args[0]);
        return;
      case 'menu.drawPokemonMessage':
        this.view.menu.drawPokemonMessage(args[0]);
        return;
      case 'menu.drawWithWhoMessages':
        this.view.menu.drawWithWhoMessages(args[0]);
        return;
      case 'audio.play':
        this.audio.sounds[args[0]].play(args[1]);
        return;
      case 'audio.stop':
        this.audio.sounds[args[0]].stop();
        return;
      case 'game.drawScores':
        this.view.game.drawScoresToScoreBoards(args);
        return;
      case 'game.drawStart':
        this.view.game.drawGameStartMessage(args[0], args[1]);
        return;
      case 'game.drawCloudsAndWave':
        this.view.game.drawCloudsAndWave();
        return;
      case 'game.drawEnd':
        this.view.game.drawGameEndMessage(args[0]);
        return;
      case 'game.drawReady':
        this.view.game.drawReadyMessage(args[0]);
        return;
      case 'game.toggleReady':
        this.view.game.toggleReadyMessage();
        return;
      case 'game.drawPlayersAndBall':
        this.view.game.drawPlayersAndBall(args[0]);
        return;
      case 'quickRematch.visible':
        this.setQuickRematchHintVisibility(args[0]);
        return;
      case 'game.scoreboards.visible':
        this.view.game.scoreBoards[0].visible = args[0];
        this.view.game.scoreBoards[1].visible = args[0];
        return;
      default:
        throw new Error(`Unknown gameplay effect: ${type}`);
    }
  }

  get currentStateId() {
    return this.core.currentStateId;
  }

  set currentStateId(value) {
    this.core.currentStateId = value;
  }

  get normalFPS() {
    return this.core.normalFPS;
  }

  set normalFPS(value) {
    this.core.normalFPS = value;
  }

  get slowMotionFPS() {
    return this.core.slowMotionFPS;
  }

  set slowMotionFPS(value) {
    this.core.slowMotionFPS = value;
  }

  get SLOW_MOTION_FRAMES_NUM() {
    return this.core.SLOW_MOTION_FRAMES_NUM;
  }

  get slowMotionFramesLeft() {
    return this.core.slowMotionFramesLeft;
  }

  set slowMotionFramesLeft(value) {
    this.core.slowMotionFramesLeft = value;
  }

  get slowMotionNumOfSkippedFrames() {
    return this.core.slowMotionNumOfSkippedFrames;
  }

  set slowMotionNumOfSkippedFrames(value) {
    this.core.slowMotionNumOfSkippedFrames = value;
  }

  get selectedWithWho() {
    return this.core.selectedWithWho;
  }

  set selectedWithWho(value) {
    this.core.selectedWithWho = value;
  }

  get scores() {
    return this.core.scores;
  }

  set scores(value) {
    this.core.scores = value;
  }

  get winningScore() {
    return this.core.winningScore;
  }

  set winningScore(value) {
    this.core.winningScore = value;
  }

  get gameEnded() {
    return this.core.gameEnded;
  }

  set gameEnded(value) {
    this.core.gameEnded = value;
  }

  get roundEnded() {
    return this.core.roundEnded;
  }

  set roundEnded(value) {
    this.core.roundEnded = value;
  }

  get isPlayer2Serve() {
    return this.core.isPlayer2Serve;
  }

  set isPlayer2Serve(value) {
    this.core.isPlayer2Serve = value;
  }

  get frameCounter() {
    return this.core.frameCounter;
  }

  set frameCounter(value) {
    this.core.frameCounter = value;
  }

  get frameTotal() {
    return this.core.frameTotal;
  }

  get noInputFrameCounter() {
    return this.core.noInputFrameCounter;
  }

  set noInputFrameCounter(value) {
    this.core.noInputFrameCounter = value;
  }

  get noInputFrameTotal() {
    return this.core.noInputFrameTotal;
  }

  get paused() {
    return this.core.paused;
  }

  set paused(value) {
    this.core.paused = Boolean(value);
  }

  get isStereoSound() {
    return this.core.isStereoSound;
  }

  set isStereoSound(value) {
    this.core.isStereoSound = Boolean(value);
  }

  get ballResetRequested() {
    return this.core.practiceResetRequested;
  }

  set ballResetRequested(value) {
    this.core.practiceResetRequested = Boolean(value);
  }

  get _isPracticeMode() {
    return this.core.isPracticeMode;
  }

  set _isPracticeMode(value) {
    this.core.isPracticeMode = Boolean(value);
  }

  get isPracticeMode() {
    return this.core.isPracticeMode;
  }

  set isPracticeMode(value) {
    this.applyCoreResult(this.core.setPracticeMode(value));
  }
}
