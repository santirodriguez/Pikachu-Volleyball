/**
 * The View part in the MVC pattern
 *
 * Some codes in this module were gained by reverse engineering the original machine code.
 * The codes gained by reverse engineering are commented by the address of the function referred to in the machine code.
 * ex) FUN_00405d50 means the function at the address 00405d50 in the machine code.
 */
'use strict';
import { AnimatedSprite } from '@pixi/sprite-animated';
import { Sprite } from '@pixi/sprite';
import { Container } from '@pixi/display';
import { Cloud, Wave, cloudAndWaveEngine } from './cloud_and_wave.js';
import { ASSETS_PATH } from './assets_path.js';
import presentationMathModule from './presentation_math.cjs';

/** @typedef {import('@pixi/loaders').LoaderResource} LoaderResource */
/** @typedef {import('@pixi/core').Texture} Texture */

const TEXTURES = ASSETS_PATH.TEXTURES;
const {
  getPlayerFrameIndex,
  getPlayerScaleX,
  getPunchLayout,
  stepIntroMarkAlpha,
  getFightLayout,
  stepSachisoft,
  stepSittingTiles,
  getPikachuVolleyballLayout,
  getWithWhoLayouts,
  getScoreDigits,
  getGameStartLayout,
  getGameEndLayout,
  changeFadeAlpha,
} = presentationMathModule;

/** @constant @type {number} number of clouds to be rendered */
const NUM_OF_CLOUDS = 10;

/**
 * Class representing intro view where the man with a briefcase mark appears
 */
export class IntroView {
  /**
   * Create an IntroView object
   * @param {Object.<string,LoaderResource>} resources loader.resources
   */
  constructor(resources) {
    const textures = resources[ASSETS_PATH.SPRITE_SHEET].textures;

    this.mark = makeSpriteWithAnchorXY(textures, TEXTURES.MARK, 0.5, 0.5);
    this.mark.x = 432 / 2;
    this.mark.y = 304 / 2;

    this.container = new Container();
    this.container.addChild(this.mark);
  }

  /** @return {boolean} Is visible? */
  get visible() {
    return this.container.visible;
  }

  /** @param {boolean} bool Is visible? */
  set visible(bool) {
    this.container.visible = bool;
  }

  /**
   * draw "a man with a briefcase" mark
   * @param {number} frameCounter
   */
  drawMark(frameCounter) {
    this.mark.alpha = stepIntroMarkAlpha(frameCounter, this.mark.alpha);
  }
}

/**
 * Class representing menu view where you can select "play with computer" or "play with friend"
 */
export class MenuView {
  /**
   * Create a MenuView object
   * @param {Object.<string,LoaderResource>} resources loader.resources
   */
  constructor(resources) {
    const textures = resources[ASSETS_PATH.SPRITE_SHEET].textures;

    this.messages = {
      pokemon: makeSpriteWithAnchorXY(textures, TEXTURES.POKEMON, 0, 0),
      pikachuVolleyball: makeSpriteWithAnchorXY(
        textures,
        TEXTURES.PIKACHU_VOLLEYBALL,
        0,
        0
      ),
      withWho: [
        makeSpriteWithAnchorXY(textures, TEXTURES.WITH_COMPUTER, 0, 0),
        makeSpriteWithAnchorXY(textures, TEXTURES.WITH_FRIEND, 0, 0),
      ],
      sachisoft: makeSpriteWithAnchorXY(textures, TEXTURES.SACHISOFT, 0, 0),
      fight: makeSpriteWithAnchorXY(textures, TEXTURES.FIGHT, 0, 0),
    };
    this.sittingPikachuTilesContainer =
      makeSittingPikachuTilesContainer(textures);

    // referred to FUN_004059f0
    this.messages.sachisoft.x = 216 - this.messages.sachisoft.texture.width / 2;
    this.messages.sachisoft.y = 264;

    // referred to FUN_00405b70
    this.messages.pikachuVolleyball.x = 140;
    this.messages.pikachuVolleyball.y = 80;
    this.messages.pokemon.x = 170;
    this.messages.pokemon.y = 40;

    this.container = new Container();
    this.container.addChild(this.sittingPikachuTilesContainer);
    this.container.addChild(this.messages.pokemon);
    this.container.addChild(this.messages.pikachuVolleyball);
    this.container.addChild(this.messages.withWho[0]);
    this.container.addChild(this.messages.withWho[1]);
    this.container.addChild(this.messages.sachisoft);
    this.container.addChild(this.messages.fight);
    this.initializeVisibles();

    this.sittingPikachuTilesDisplacement = 0;
    this.selectedWithWho = -1; // 0: with computer, 1: with friend, -1: not selected
    this.selectedWithWhoMessageSizeIncrement = 2;
  }

  /** @return {boolean} Is visible? */
  get visible() {
    return this.container.visible;
  }

  /** @param {boolean} bool Is visible? */
  set visible(bool) {
    this.container.visible = bool;

    // when turn off view, initialize visibilities of sprites in this view
    if (bool === false) {
      this.initializeVisibles();
    }
  }

  initializeVisibles() {
    for (const prop in this.messages) {
      this.messages[prop].visible = false;
    }
  }

  /**
   * referred to FUN_00405d50
   * Draw "fight!" message which get bigger and smaller as frame goes
   * @param {number} frameCounter
   */
  drawFightMessage(frameCounter) {
    const fightMessage = this.messages.fight;
    const layout = getFightLayout(
      frameCounter,
      fightMessage.texture.width,
      fightMessage.texture.height
    );
    fightMessage.visible = layout.visible;
    fightMessage.x = layout.x;
    fightMessage.y = layout.y;
    fightMessage.width = layout.width;
    fightMessage.height = layout.height;
  }

  /**
   * Draw sachisoft message as frame goes
   * @param {number} frameCounter
   */
  drawSachisoft(frameCounter) {
    const state = stepSachisoft(
      frameCounter,
      this.messages.sachisoft.alpha
    );
    this.messages.sachisoft.visible = state.visible;
    this.messages.sachisoft.alpha = state.alpha;
  }

  /**
   * referred to FUN_00405ca0
   * Draw sitting pikachu tiles as frame goes
   * @param {number} frameCounter
   */
  drawSittingPikachuTiles(frameCounter) {
    const tileHeight =
      // @ts-ignore
      this.sittingPikachuTilesContainer.getChildAt(0).texture.height;
    const state = stepSittingTiles(
      frameCounter,
      this.sittingPikachuTilesDisplacement,
      this.sittingPikachuTilesContainer.alpha,
      tileHeight
    );
    this.sittingPikachuTilesDisplacement = state.displacement;
    this.sittingPikachuTilesContainer.visible = state.visible;
    this.sittingPikachuTilesContainer.x = state.x;
    this.sittingPikachuTilesContainer.y = state.y;
    this.sittingPikachuTilesContainer.alpha = state.alpha;
  }

  /**
   * referred to FUN_00405b70
   * Draw pikachu volleyball message as frame goes
   * @param {number} frameCounter
   */
  drawPikachuVolleyballMessage(frameCounter) {
    const message = this.messages.pikachuVolleyball;
    const layout = getPikachuVolleyballLayout(
      frameCounter,
      message.texture.width
    );
    message.visible = layout.visible;
    message.x = layout.x;
    message.width = layout.width;
  }

  /**
   * referred to FUN_00405b70
   * Draw pokemon message as frame goes
   * @param {number} frameCounter
   */
  drawPokemonMessage(frameCounter) {
    if (frameCounter === 0) {
      this.messages.pokemon.visible = false;
      return;
    }

    if (frameCounter > 71) {
      this.messages.pokemon.visible = true;
    }
  }

  /**
   * referred to FUN_00405ec0
   * Draw with who messages (with computer or with friend) as frame goes
   * @param {number} frameCounter
   */
  drawWithWhoMessages(frameCounter) {
    const withWho = this.messages.withWho;
    const state = getWithWhoLayouts(
      frameCounter,
      this.selectedWithWho,
      this.selectedWithWhoMessageSizeIncrement,
      withWho[0].texture.width,
      withWho[0].texture.height
    );
    this.selectedWithWhoMessageSizeIncrement = state.sizeIncrement;

    for (let index = 0; index < 2; index += 1) {
      const layout = state.layouts[index];
      withWho[index].visible = layout.visible;
      if (!layout.visible) continue;
      withWho[index].x = layout.x;
      withWho[index].y = layout.y;
      withWho[index].width = layout.width;
      withWho[index].height = layout.height;
    }
  }

  /**
   * Select with who for the effect that selected option gets bigger
   * @param {number} i 0: with computer, 1: with friend
   */
  selectWithWho(i) {
    this.selectedWithWho = i;
    this.selectedWithWhoMessageSizeIncrement = 2;
  }
}

/**
 * Class represent a game view where pikachus, ball, clouds, waves, and backgrounds are
 */
export class GameView {
  /**
   * Create a GameView object
   * @param {Object.<string,LoaderResource>} resources
   */
  constructor(resources) {
    const textures = resources[ASSETS_PATH.SPRITE_SHEET].textures;

    // Display objects below
    this.bgContainer = makeBGContainer(textures);
    const playerSprites = makePlayerAnimatedSprites(textures);
    this.player1 = playerSprites[0];
    this.player2 = playerSprites[1];
    this.ball = makeBallAnimatedSprites(textures);
    this.ballHyper = makeSpriteWithAnchorXY(
      textures,
      TEXTURES.BALL_HYPER,
      0.5,
      0.5
    );
    this.ballTrail = makeSpriteWithAnchorXY(
      textures,
      TEXTURES.BALL_TRAIL,
      0.5,
      0.5
    );
    this.punch = makeSpriteWithAnchorXY(
      textures,
      TEXTURES.BALL_PUNCH,
      0.5,
      0.5
    );

    // this.scoreBoards[0] for player1, this.scoreBoards[1] for player2
    this.scoreBoards = [
      makeScoreBoardSprite(textures),
      makeScoreBoardSprite(textures),
    ];

    this.shadows = {
      forPlayer1: makeSpriteWithAnchorXY(textures, TEXTURES.SHADOW, 0.5, 0.5),
      forPlayer2: makeSpriteWithAnchorXY(textures, TEXTURES.SHADOW, 0.5, 0.5),
      forBall: makeSpriteWithAnchorXY(textures, TEXTURES.SHADOW, 0.5, 0.5),
    };

    this.messages = {
      gameStart: makeSpriteWithAnchorXY(textures, TEXTURES.GAME_START, 0, 0),
      ready: makeSpriteWithAnchorXY(textures, TEXTURES.READY, 0, 0),
      gameEnd: makeSpriteWithAnchorXY(textures, TEXTURES.GAME_END, 0, 0),
    };

    this.cloudContainer = makeCloudContainer(textures);
    this.waveContainer = makeWaveContainer(textures);

    // container which include whole display objects
    // Should be careful on addChild order
    // The later added, the more front(z-index) on screen
    this.container = new Container();
    this.container.addChild(this.bgContainer);
    this.container.addChild(this.cloudContainer);
    this.container.addChild(this.waveContainer);
    this.container.addChild(this.shadows.forPlayer1);
    this.container.addChild(this.shadows.forPlayer2);
    this.container.addChild(this.shadows.forBall);
    this.container.addChild(this.player1);
    this.container.addChild(this.player2);
    this.container.addChild(this.ballTrail);
    this.container.addChild(this.ballHyper);
    this.container.addChild(this.ball);
    this.container.addChild(this.punch);
    this.container.addChild(this.scoreBoards[0]);
    this.container.addChild(this.scoreBoards[1]);
    this.container.addChild(this.messages.gameStart);
    this.container.addChild(this.messages.ready);
    this.container.addChild(this.messages.gameEnd);

    // location and visibility setting
    this.bgContainer.x = 0;
    this.bgContainer.y = 0;
    this.cloudContainer.x = 0;
    this.cloudContainer.y = 0;
    this.waveContainer.x = 0;
    this.waveContainer.y = 0;

    this.messages.ready.x = 176;
    this.messages.ready.y = 38;
    this.scoreBoards[0].x = 14; // score board is 14 pixel distant from boundary
    this.scoreBoards[0].y = 10;
    this.scoreBoards[1].x = 432 - 32 - 32 - 14; // 32 pixel is for number (32x32px) width; one score board has two numbers
    this.scoreBoards[1].y = 10;

    this.shadows.forPlayer1.y = 273;
    this.shadows.forPlayer2.y = 273;
    this.shadows.forBall.y = 273;

    this.initializeVisibles();

    // clouds and wave model.
    // This model is included in this view object, not on controller object
    // since it is not dependent on user input, and only used for rendering.
    this.cloudArray = [];
    for (let i = 0; i < NUM_OF_CLOUDS; i++) {
      this.cloudArray.push(new Cloud());
    }
    this.wave = new Wave();
  }

  /** @return {boolean} Is visible? */
  get visible() {
    return this.container.visible;
  }

  /** @param {boolean} bool Is visible? */
  set visible(bool) {
    this.container.visible = bool;

    // when turn off view
    if (bool === false) {
      this.initializeVisibles();
    }
  }

  initializeVisibles() {
    for (const prop in this.messages) {
      this.messages[prop].visible = false;
    }
  }

  /** @typedef {import("./physics").PikaPhysics} PikaPhysics */
  /**
   * Draw players and ball in the given physics object
   * @param {PikaPhysics} physics PikaPhysics object to draw
   */
  drawPlayersAndBall(physics) {
    const player1 = physics.player1;
    const player2 = physics.player2;
    const ball = physics.ball;

    this.player1.x = player1.x;
    this.player1.y = player1.y;
    this.player1.scale.x = getPlayerScaleX(
      1,
      player1.state,
      player1.divingDirection
    );
    this.shadows.forPlayer1.x = player1.x;

    this.player2.x = player2.x;
    this.player2.y = player2.y;
    this.player2.scale.x = getPlayerScaleX(
      2,
      player2.state,
      player2.divingDirection
    );
    this.shadows.forPlayer2.x = player2.x;

    this.player1.gotoAndStop(
      getFrameNumberForPlayerAnimatedSprite(player1.state, player1.frameNumber)
    );
    this.player2.gotoAndStop(
      getFrameNumberForPlayerAnimatedSprite(player2.state, player2.frameNumber)
    );

    this.ball.x = ball.x;
    this.ball.y = ball.y;
    this.shadows.forBall.x = ball.x;
    this.ball.gotoAndStop(ball.rotation);

    const punch = getPunchLayout(ball);
    this.punch.visible = punch.visible;
    if (punch.visible) {
      this.punch.width = punch.width;
      this.punch.height = punch.height;
      this.punch.x = punch.x;
      this.punch.y = punch.y;
    }

    if (ball.isPowerHit === true) {
      this.ballHyper.x = ball.previousX;
      this.ballHyper.y = ball.previousY;
      this.ballTrail.x = ball.previousPreviousX;
      this.ballTrail.y = ball.previousPreviousY;
      this.ballHyper.visible = true;
      this.ballTrail.visible = true;
    } else {
      this.ballHyper.visible = false;
      this.ballTrail.visible = false;
    }
  }

  /**
   * Draw scores to each score board
   * @param {number[]} scores [0] for player1 score, [1] for player2 score
   */
  drawScoresToScoreBoards(scores) {
    for (let index = 0; index < 2; index += 1) {
      const scoreBoard = this.scoreBoards[index];
      const digits = getScoreDigits(scores[index]);
      const unitsAnimatedSprite = scoreBoard.getChildAt(0);
      const tensAnimatedSprite = scoreBoard.getChildAt(1);
      // @ts-ignore
      unitsAnimatedSprite.gotoAndStop(digits.units);
      // @ts-ignore
      tensAnimatedSprite.gotoAndStop(digits.tens);
      tensAnimatedSprite.visible = digits.tensVisible;
    }
  }

  /**
   * Draw clouds and wave
   */
  drawCloudsAndWave() {
    const cloudArray = this.cloudArray;
    const wave = this.wave;

    cloudAndWaveEngine(cloudArray, wave);

    for (let i = 0; i < NUM_OF_CLOUDS; i++) {
      const cloud = cloudArray[i];
      const cloudSprite = this.cloudContainer.getChildAt(i);
      cloudSprite.x = cloud.spriteTopLeftPointX;
      cloudSprite.y = cloud.spriteTopLeftPointY;
      // @ts-ignore
      cloudSprite.width = cloud.spriteWidth;
      // @ts-ignore
      cloudSprite.height = cloud.spriteHeight;
    }

    for (let i = 0; i < 432 / 16; i++) {
      const waveSprite = this.waveContainer.getChildAt(i);
      waveSprite.y = wave.yCoords[i];
    }
  }

  /**
   * refered FUN_00403f20
   * Draw game start message as frame goes
   * @param {number} frameCounter current frame number
   * @param {number} frameTotal total frame number for game start message
   */
  drawGameStartMessage(frameCounter, frameTotal) {
    const message = this.messages.gameStart;
    const layout = getGameStartLayout(
      frameCounter,
      frameTotal,
      message.texture.width,
      message.texture.height
    );
    message.visible = layout.visible;
    if (!layout.visible) return;
    message.x = layout.x;
    message.y = layout.y;
    message.width = layout.width;
    message.height = layout.height;
  }

  /**
   * Draw ready message
   * @param {boolean} bool turn on?
   */
  drawReadyMessage(bool) {
    this.messages.ready.visible = bool;
  }

  /**
   * Togle ready message.
   * Turn off if it's on, turn on if it's off.
   */
  toggleReadyMessage() {
    this.messages.ready.visible = !this.messages.ready.visible;
  }

  /**
   * refered FUN_00404070
   * Draw game end message as frame goes
   * @param {number} frameCounter
   */
  drawGameEndMessage(frameCounter) {
    const message = this.messages.gameEnd;
    const layout = getGameEndLayout(
      frameCounter,
      message.texture.width,
      message.texture.height
    );
    message.visible = layout.visible;
    message.x = layout.x;
    message.y = layout.y;
    message.width = layout.width;
    message.height = layout.height;
  }
}

/**
 * Class representing fade in out effect
 */
export class FadeInOut {
  constructor(resources) {
    const textures = resources[ASSETS_PATH.SPRITE_SHEET].textures;
    this.black = makeSpriteWithAnchorXY(textures, TEXTURES.BLACK, 0, 0);
    this.black.width = 432;
    this.black.height = 304;
    this.black.x = 0;
    this.black.y = 0;
    this.black.alpha = 1;
  }

  /** @return {boolean} Is visible? */
  get visible() {
    return this.black.visible;
  }

  /** @param {boolean} bool Is visible? */
  set visible(bool) {
    this.black.visible = bool;
  }

  /**
   * Set black alpha for fade in out
   * @param {number} alpha number in [0, 1]
   */
  setBlackAlphaTo(alpha) {
    this.black.alpha = alpha;
    if (this.black.alpha === 0) {
      this.black.visible = false;
    } else {
      this.black.visible = true;
    }
  }

  /**
   * Increase black alpha for fade in out
   * @param {number} alphaIncrement if alphaIncrement > 0: fade out, else fade in
   */
  changeBlackAlphaBy(alphaIncrement) {
    this.black.alpha = changeFadeAlpha(this.black.alpha, alphaIncrement);
    this.black.visible = this.black.alpha !== 0;
  }
}

/**
 * Make sitting pikachu tiles
 * @param {Object.<string,Texture>} textures
 * @return {Container}
 */
function makeSittingPikachuTilesContainer(textures) {
  const container = new Container();
  const texture = textures[TEXTURES.SITTING_PIKACHU];
  const w = texture.width;
  const h = texture.height;

  let tile;
  for (let j = 0; j < Math.floor(304 / h) + 2; j++) {
    for (let i = 0; i < Math.floor(432 / w) + 2; i++) {
      tile = new Sprite(texture);
      addChildToParentAndSetLocalPosition(container, tile, w * i, h * j);
    }
  }

  return container;
}

/**
 * Make background
 * @param {Object.<string,Texture>} textures
 * @return {Container}
 */
function makeBGContainer(textures) {
  const bgContainer = new Container();

  // sky
  let tile;
  let texture = textures[TEXTURES.SKY_BLUE];
  for (let j = 0; j < 12; j++) {
    for (let i = 0; i < 432 / 16; i++) {
      tile = new Sprite(texture);
      addChildToParentAndSetLocalPosition(bgContainer, tile, 16 * i, 16 * j);
    }
  }

  // mountain
  texture = textures[TEXTURES.MOUNTAIN];
  tile = new Sprite(texture);
  addChildToParentAndSetLocalPosition(bgContainer, tile, 0, 188);

  // ground_red
  texture = textures[TEXTURES.GROUND_RED];
  for (let i = 0; i < 432 / 16; i++) {
    tile = new Sprite(texture);
    addChildToParentAndSetLocalPosition(bgContainer, tile, 16 * i, 248);
  }

  // ground_line
  texture = textures[TEXTURES.GROUND_LINE];
  for (let i = 1; i < 432 / 16 - 1; i++) {
    tile = new Sprite(texture);
    addChildToParentAndSetLocalPosition(bgContainer, tile, 16 * i, 264);
  }
  texture = textures[TEXTURES.GROUND_LINE_LEFT_MOST];
  tile = new Sprite(texture);
  addChildToParentAndSetLocalPosition(bgContainer, tile, 0, 264);
  texture = textures[TEXTURES.GROUND_LINE_RIGHT_MOST];
  tile = new Sprite(texture);
  addChildToParentAndSetLocalPosition(bgContainer, tile, 432 - 16, 264);

  // ground_yellow
  texture = textures[TEXTURES.GROUND_YELLOW];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 432 / 16; i++) {
      tile = new Sprite(texture);
      addChildToParentAndSetLocalPosition(
        bgContainer,
        tile,
        16 * i,
        280 + 16 * j
      );
    }
  }

  // net pillar
  texture = textures[TEXTURES.NET_PILLAR_TOP];
  tile = new Sprite(texture);
  addChildToParentAndSetLocalPosition(bgContainer, tile, 213, 176);
  texture = textures[TEXTURES.NET_PILLAR];
  for (let j = 0; j < 12; j++) {
    tile = new Sprite(texture);
    addChildToParentAndSetLocalPosition(bgContainer, tile, 213, 184 + 8 * j);
  }

  return bgContainer;
}

/**
 * Make animated sprites for both players
 * @param {Object.<string,Texture>} textures
 * @return {AnimatedSprite[]} [0] for player 1, [1] for player2
 */
function makePlayerAnimatedSprites(textures) {
  const getPlayerTexture = (i, j) => textures[TEXTURES.PIKACHU(i, j)];
  const playerTextureArray = [];
  for (let i = 0; i < 7; i++) {
    if (i === 3) {
      playerTextureArray.push(getPlayerTexture(i, 0));
      playerTextureArray.push(getPlayerTexture(i, 1));
    } else if (i === 4) {
      playerTextureArray.push(getPlayerTexture(i, 0));
    } else {
      for (let j = 0; j < 5; j++) {
        playerTextureArray.push(getPlayerTexture(i, j));
      }
    }
  }
  const player1AnimatedSprite = new AnimatedSprite(playerTextureArray, false);
  const player2AnimatedSprite = new AnimatedSprite(playerTextureArray, false);

  player1AnimatedSprite.anchor.x = 0.5;
  player1AnimatedSprite.anchor.y = 0.5;
  player2AnimatedSprite.anchor.x = 0.5;
  player2AnimatedSprite.anchor.y = 0.5;

  return [player1AnimatedSprite, player2AnimatedSprite];
}

/**
 * Make animated sprite of ball
 * @param {Object.<string,Texture>} textures
 * @return {AnimatedSprite}
 */
function makeBallAnimatedSprites(textures) {
  const getBallTexture = (s) => textures[TEXTURES.BALL(s)];
  const ballTextureArray = [
    getBallTexture(0),
    getBallTexture(1),
    getBallTexture(2),
    getBallTexture(3),
    getBallTexture(4),
    getBallTexture('hyper'),
  ];
  const ballAnimatedSprite = new AnimatedSprite(ballTextureArray, false);

  ballAnimatedSprite.anchor.x = 0.5;
  ballAnimatedSprite.anchor.y = 0.5;

  return ballAnimatedSprite;
}

/**
 * Make sprite with the texture on the path and with the given anchor x, y
 * @param {Object.<string,Texture>} textures
 * @param {string} path
 * @param {number} anchorX anchor.x, number in [0, 1]
 * @param {number} anchorY anchor.y, number in [0, 1]
 * @return {Sprite}
 */
function makeSpriteWithAnchorXY(textures, path, anchorX, anchorY) {
  const sprite = new Sprite(textures[path]);
  sprite.anchor.x = anchorX;
  sprite.anchor.y = anchorY;
  return sprite;
}

/**
 * Make score boards
 * @param {Object.<string,Texture>} textures
 * @return {Container} child with index 0 for player 1 score board, child with index 1 for player2 score board
 */
function makeScoreBoardSprite(textures) {
  const getNumberTexture = (n) => textures[TEXTURES.NUMBER(n)];
  const numberTextureArray = [];
  for (let i = 0; i < 10; i++) {
    numberTextureArray.push(getNumberTexture(i));
  }
  const numberAnimatedSprites = [null, null];
  numberAnimatedSprites[0] = new AnimatedSprite(numberTextureArray, false);
  numberAnimatedSprites[1] = new AnimatedSprite(numberTextureArray, false);

  const scoreBoard = new Container();
  addChildToParentAndSetLocalPosition(
    scoreBoard,
    numberAnimatedSprites[0],
    32,
    0
  ); // for units
  addChildToParentAndSetLocalPosition(
    scoreBoard,
    numberAnimatedSprites[1],
    0,
    0
  ); // for tens

  scoreBoard.setChildIndex(numberAnimatedSprites[0], 0); // for units
  scoreBoard.setChildIndex(numberAnimatedSprites[1], 1); // for tens

  return scoreBoard;
}

/**
 * Make a container with cloud sprites
 * @param {Object.<string,Texture>} textures
 * @return {Container}
 */
function makeCloudContainer(textures) {
  const cloudContainer = new Container();
  const texture = textures[TEXTURES.CLOUD];
  for (let i = 0; i < NUM_OF_CLOUDS; i++) {
    const cloud = new Sprite(texture);
    cloud.anchor.x = 0;
    cloud.anchor.y = 0;
    cloudContainer.addChild(cloud);
  }

  return cloudContainer;
}

/**
 * Make a container with wave sprites
 * @param {Object.<string,Texture>} textures
 * @return {Container}
 */
function makeWaveContainer(textures) {
  const waveContainer = new Container();
  const texture = textures[TEXTURES.WAVE];
  for (let i = 0; i < 432 / 16; i++) {
    const tile = new Sprite(texture);
    addChildToParentAndSetLocalPosition(waveContainer, tile, 16 * i, 0);
  }

  return waveContainer;
}

/**
 * Add child to parent and set local position
 * @param {Container} parent
 * @param {Sprite} child
 * @param {number} x local x
 * @param {number} y local y
 */
function addChildToParentAndSetLocalPosition(parent, child, x, y) {
  parent.addChild(child);
  child.anchor.x = 0;
  child.anchor.y = 0;
  child.x = x;
  child.y = y;
}

/**
 * Get frame number for player animated sprite corresponds to the player state
 *
 * number of frames for state 0, state 1 and state 2 is 5 for each.
 * number of frames for state 3 is 2.
 * number of frames for state 4 is 1.
 * number of frames for state 5, state 6 is 5 for each.
 * @param {number} state player state
 * @param {number} frameNumber
 */
function getFrameNumberForPlayerAnimatedSprite(state, frameNumber) {
  return getPlayerFrameIndex(state, frameNumber);
}
