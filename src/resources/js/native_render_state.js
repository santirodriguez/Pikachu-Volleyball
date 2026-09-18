'use strict';

import atlasData from '../assets/images/sprite_sheet.json';
import { ASSETS_PATH } from './assets_path.js';
import { Cloud, Wave, cloudAndWaveEngine } from './cloud_and_wave.js';
import presentationMathModule from './presentation_math.cjs';

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

const WIDTH = 432;
const HEIGHT = 304;
const NUM_OF_CLOUDS = 10;
const TEXTURES = ASSETS_PATH.TEXTURES;

function getFrame(texture) {
  const entry = atlasData.frames[texture];
  if (!entry || !entry.frame) {
    throw new Error(`Missing native atlas frame: ${texture}`);
  }
  return entry.frame;
}

function spriteCommand(texture, x, y, options = {}) {
  const frame = getFrame(texture);
  return {
    texture,
    sx: frame.x,
    sy: frame.y,
    sw: frame.w,
    sh: frame.h,
    x,
    y,
    width: options.width === undefined ? frame.w : options.width,
    height: options.height === undefined ? frame.h : options.height,
    anchorX: options.anchorX || 0,
    anchorY: options.anchorY || 0,
    flipX: Boolean(options.flipX),
    alpha: options.alpha === undefined ? 1 : options.alpha,
  };
}

function buildPlayerTextureNames() {
  const names = [];
  for (let state = 0; state < 7; state += 1) {
    if (state === 3) {
      names.push(TEXTURES.PIKACHU(state, 0), TEXTURES.PIKACHU(state, 1));
    } else if (state === 4) {
      names.push(TEXTURES.PIKACHU(state, 0));
    } else {
      for (let frame = 0; frame < 5; frame += 1) {
        names.push(TEXTURES.PIKACHU(state, frame));
      }
    }
  }
  return names;
}

const PLAYER_TEXTURE_NAMES = Object.freeze(buildPlayerTextureNames());

function createMenuState() {
  return {
    visible: false,
    selectedWithWho: -1,
    selectedWithWhoMessageSizeIncrement: 2,
    sittingTiles: {
      visible: true,
      displacement: 0,
      alpha: 1,
      x: 0,
      y: 0,
    },
    pokemonVisible: false,
    pikachuVolleyball: {
      visible: false,
      x: 140,
      width: getFrame(TEXTURES.PIKACHU_VOLLEYBALL).w,
    },
    withWho: [{ visible: false }, { visible: false }],
    sachisoft: { visible: false, alpha: 1 },
    fight: { visible: false },
  };
}

function createGameState() {
  return {
    visible: false,
    playersAndBall: null,
    scores: [0, 0],
    scoreboardsVisible: true,
    start: { visible: false },
    readyVisible: false,
    end: { visible: false },
  };
}

export class NativeRenderState {
  constructor(graphicMode = 'sharp') {
    this.graphicMode = graphicMode === 'soft' ? 'soft' : 'sharp';
    this.introVisible = false;
    this.introMarkAlpha = 1;
    this.menu = createMenuState();
    this.game = createGameState();
    this.fadeAlpha = 1;
    this.fadeVisible = false;
    this.quickRematchVisible = false;

    // Browser GameView constructs the cloud models before createGameCore().
    // Keep that exact shared-rand consumption order in the QuickJS host.
    this.cloudArray = [];
    for (let index = 0; index < NUM_OF_CLOUDS; index += 1) {
      this.cloudArray.push(new Cloud());
    }
    this.wave = new Wave();
  }

  setGraphicMode(graphicMode) {
    this.graphicMode = graphicMode === 'soft' ? 'soft' : 'sharp';
  }

  resetMenuMessages() {
    this.menu.pokemonVisible = false;
    this.menu.pikachuVolleyball.visible = false;
    this.menu.withWho[0].visible = false;
    this.menu.withWho[1].visible = false;
    this.menu.sachisoft.visible = false;
    this.menu.fight.visible = false;
  }

  resetGameMessages() {
    this.game.start.visible = false;
    this.game.readyVisible = false;
    this.game.end.visible = false;
  }

  applyEffects(effects) {
    for (const effect of effects) {
      this.applyEffect(effect);
    }
  }

  applyEffect(effect) {
    const [type, ...args] = effect;
    switch (type) {
      case 'intro.visible':
        this.introVisible = Boolean(args[0]);
        return;
      case 'menu.visible':
        this.menu.visible = Boolean(args[0]);
        if (!this.menu.visible) this.resetMenuMessages();
        return;
      case 'game.visible':
        this.game.visible = Boolean(args[0]);
        if (!this.game.visible) this.resetGameMessages();
        return;
      case 'fade.set':
        this.fadeAlpha = args[0];
        this.fadeVisible = this.fadeAlpha !== 0;
        return;
      case 'fade.change':
        this.fadeAlpha = changeFadeAlpha(this.fadeAlpha, args[0]);
        this.fadeVisible = this.fadeAlpha !== 0;
        return;
      case 'intro.drawMark':
        this.introMarkAlpha = stepIntroMarkAlpha(
          args[0],
          this.introMarkAlpha
        );
        return;
      case 'menu.selectWithWho':
        this.menu.selectedWithWho = args[0];
        this.menu.selectedWithWhoMessageSizeIncrement = 2;
        return;
      case 'menu.drawFightMessage': {
        const frame = getFrame(TEXTURES.FIGHT);
        this.menu.fight = getFightLayout(args[0], frame.w, frame.h);
        return;
      }
      case 'menu.drawSachisoft':
        this.menu.sachisoft = stepSachisoft(
          args[0],
          this.menu.sachisoft.alpha
        );
        return;
      case 'menu.drawSittingPikachuTiles': {
        const tile = getFrame(TEXTURES.SITTING_PIKACHU);
        this.menu.sittingTiles = stepSittingTiles(
          args[0],
          this.menu.sittingTiles.displacement,
          this.menu.sittingTiles.alpha,
          tile.h
        );
        return;
      }
      case 'menu.drawPikachuVolleyballMessage': {
        const frame = getFrame(TEXTURES.PIKACHU_VOLLEYBALL);
        this.menu.pikachuVolleyball = getPikachuVolleyballLayout(
          args[0],
          frame.w
        );
        return;
      }
      case 'menu.drawPokemonMessage':
        if (args[0] === 0) this.menu.pokemonVisible = false;
        if (args[0] > 71) this.menu.pokemonVisible = true;
        return;
      case 'menu.drawWithWhoMessages': {
        const frame = getFrame(TEXTURES.WITH_COMPUTER);
        const state = getWithWhoLayouts(
          args[0],
          this.menu.selectedWithWho,
          this.menu.selectedWithWhoMessageSizeIncrement,
          frame.w,
          frame.h
        );
        this.menu.selectedWithWhoMessageSizeIncrement = state.sizeIncrement;
        this.menu.withWho = state.layouts;
        return;
      }
      case 'game.drawScores':
        this.game.scores = [args[0], args[1]];
        return;
      case 'game.drawStart': {
        const frame = getFrame(TEXTURES.GAME_START);
        this.game.start = getGameStartLayout(
          args[0],
          args[1],
          frame.w,
          frame.h
        );
        return;
      }
      case 'game.drawCloudsAndWave':
        cloudAndWaveEngine(this.cloudArray, this.wave);
        return;
      case 'game.drawEnd': {
        const frame = getFrame(TEXTURES.GAME_END);
        this.game.end = getGameEndLayout(args[0], frame.w, frame.h);
        return;
      }
      case 'game.drawReady':
        this.game.readyVisible = Boolean(args[0]);
        return;
      case 'game.toggleReady':
        this.game.readyVisible = !this.game.readyVisible;
        return;
      case 'game.drawPlayersAndBall':
        this.game.playersAndBall = args[0];
        return;
      case 'quickRematch.visible':
        this.quickRematchVisible = Boolean(args[0]);
        return;
      case 'game.scoreboards.visible':
        this.game.scoreboardsVisible = Boolean(args[0]);
        return;
      case 'audio.play':
      case 'audio.stop':
        return;
      default:
        throw new Error(`Unknown native presentation effect: ${type}`);
    }
  }

  addIntroCommands(commands) {
    if (!this.introVisible) return;
    commands.push(
      spriteCommand(TEXTURES.MARK, WIDTH / 2, HEIGHT / 2, {
        anchorX: 0.5,
        anchorY: 0.5,
        alpha: this.introMarkAlpha,
      })
    );
  }

  addMenuCommands(commands) {
    if (!this.menu.visible) return;

    const sitting = getFrame(TEXTURES.SITTING_PIKACHU);
    const tiles = this.menu.sittingTiles;
    if (tiles.visible) {
      for (let row = 0; row < Math.floor(HEIGHT / sitting.h) + 2; row += 1) {
        for (
          let column = 0;
          column < Math.floor(WIDTH / sitting.w) + 2;
          column += 1
        ) {
          commands.push(
            spriteCommand(
              TEXTURES.SITTING_PIKACHU,
              tiles.x + sitting.w * column,
              tiles.y + sitting.h * row,
              { alpha: tiles.alpha }
            )
          );
        }
      }
    }

    if (this.menu.pokemonVisible) {
      commands.push(spriteCommand(TEXTURES.POKEMON, 170, 40));
    }

    if (this.menu.pikachuVolleyball.visible) {
      commands.push(
        spriteCommand(
          TEXTURES.PIKACHU_VOLLEYBALL,
          this.menu.pikachuVolleyball.x,
          80,
          { width: this.menu.pikachuVolleyball.width }
        )
      );
    }

    const withWhoTextures = [TEXTURES.WITH_COMPUTER, TEXTURES.WITH_FRIEND];
    for (let index = 0; index < 2; index += 1) {
      const layout = this.menu.withWho[index];
      if (!layout.visible) continue;
      commands.push(
        spriteCommand(withWhoTextures[index], layout.x, layout.y, {
          width: layout.width,
          height: layout.height,
        })
      );
    }

    if (this.menu.sachisoft.visible) {
      const frame = getFrame(TEXTURES.SACHISOFT);
      commands.push(
        spriteCommand(
          TEXTURES.SACHISOFT,
          WIDTH / 2 - frame.w / 2,
          264,
          { alpha: this.menu.sachisoft.alpha }
        )
      );
    }

    if (this.menu.fight.visible) {
      const layout = this.menu.fight;
      commands.push(
        spriteCommand(TEXTURES.FIGHT, layout.x, layout.y, {
          width: layout.width,
          height: layout.height,
        })
      );
    }
  }

  addGameBackground(commands) {
    for (let row = 0; row < 12; row += 1) {
      for (let column = 0; column < WIDTH / 16; column += 1) {
        commands.push(
          spriteCommand(TEXTURES.SKY_BLUE, 16 * column, 16 * row)
        );
      }
    }

    commands.push(spriteCommand(TEXTURES.MOUNTAIN, 0, 188));

    for (let column = 0; column < WIDTH / 16; column += 1) {
      commands.push(spriteCommand(TEXTURES.GROUND_RED, 16 * column, 248));
    }

    commands.push(spriteCommand(TEXTURES.GROUND_LINE_LEFT_MOST, 0, 264));
    for (let column = 1; column < WIDTH / 16 - 1; column += 1) {
      commands.push(spriteCommand(TEXTURES.GROUND_LINE, 16 * column, 264));
    }
    commands.push(
      spriteCommand(TEXTURES.GROUND_LINE_RIGHT_MOST, WIDTH - 16, 264)
    );

    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < WIDTH / 16; column += 1) {
        commands.push(
          spriteCommand(
            TEXTURES.GROUND_YELLOW,
            16 * column,
            280 + 16 * row
          )
        );
      }
    }

    commands.push(spriteCommand(TEXTURES.NET_PILLAR_TOP, 213, 176));
    for (let row = 0; row < 12; row += 1) {
      commands.push(
        spriteCommand(TEXTURES.NET_PILLAR, 213, 184 + 8 * row)
      );
    }
  }

  addCloudAndWaveCommands(commands) {
    for (const cloud of this.cloudArray) {
      commands.push(
        spriteCommand(
          TEXTURES.CLOUD,
          cloud.spriteTopLeftPointX,
          cloud.spriteTopLeftPointY,
          {
            width: cloud.spriteWidth,
            height: cloud.spriteHeight,
          }
        )
      );
    }

    for (let index = 0; index < WIDTH / 16; index += 1) {
      commands.push(spriteCommand(TEXTURES.WAVE, 16 * index, this.wave.yCoords[index]));
    }
  }

  addPlayersAndBallCommands(commands) {
    const state = this.game.playersAndBall;
    if (!state) return;

    const { player1, player2, ball } = state;
    commands.push(
      spriteCommand(TEXTURES.SHADOW, player1.x, 273, {
        anchorX: 0.5,
        anchorY: 0.5,
      }),
      spriteCommand(TEXTURES.SHADOW, player2.x, 273, {
        anchorX: 0.5,
        anchorY: 0.5,
      }),
      spriteCommand(TEXTURES.SHADOW, ball.x, 273, {
        anchorX: 0.5,
        anchorY: 0.5,
      })
    );

    const player1Frame = getPlayerFrameIndex(player1.state, player1.frameNumber);
    const player2Frame = getPlayerFrameIndex(player2.state, player2.frameNumber);
    commands.push(
      spriteCommand(
        PLAYER_TEXTURE_NAMES[player1Frame],
        player1.x,
        player1.y,
        {
          anchorX: 0.5,
          anchorY: 0.5,
          flipX:
            getPlayerScaleX(
              1,
              player1.state,
              player1.divingDirection
            ) < 0,
        }
      ),
      spriteCommand(
        PLAYER_TEXTURE_NAMES[player2Frame],
        player2.x,
        player2.y,
        {
          anchorX: 0.5,
          anchorY: 0.5,
          flipX:
            getPlayerScaleX(
              2,
              player2.state,
              player2.divingDirection
            ) < 0,
        }
      )
    );

    if (ball.isPowerHit) {
      commands.push(
        spriteCommand(TEXTURES.BALL_TRAIL, ball.previousPreviousX, ball.previousPreviousY, {
          anchorX: 0.5,
          anchorY: 0.5,
        }),
        spriteCommand(TEXTURES.BALL_HYPER, ball.previousX, ball.previousY, {
          anchorX: 0.5,
          anchorY: 0.5,
        })
      );
    }

    const ballTexture =
      ball.rotation === 5
        ? TEXTURES.BALL('hyper')
        : TEXTURES.BALL(ball.rotation);
    commands.push(
      spriteCommand(ballTexture, ball.x, ball.y, {
        anchorX: 0.5,
        anchorY: 0.5,
      })
    );

    const punch = getPunchLayout(ball);
    if (punch.visible) {
      commands.push(
        spriteCommand(TEXTURES.BALL_PUNCH, punch.x, punch.y, {
          anchorX: 0.5,
          anchorY: 0.5,
          width: punch.width,
          height: punch.height,
        })
      );
    }
  }

  addScoreCommands(commands) {
    if (!this.game.scoreboardsVisible) return;
    const scoreBoardX = [14, WIDTH - 32 - 32 - 14];

    for (let index = 0; index < 2; index += 1) {
      const digits = getScoreDigits(this.game.scores[index]);
      commands.push(
        spriteCommand(TEXTURES.NUMBER(digits.units), scoreBoardX[index] + 32, 10)
      );
      if (digits.tensVisible) {
        commands.push(
          spriteCommand(TEXTURES.NUMBER(digits.tens), scoreBoardX[index], 10)
        );
      }
    }
  }

  addGameMessageCommands(commands) {
    if (this.game.start.visible) {
      const layout = this.game.start;
      commands.push(
        spriteCommand(TEXTURES.GAME_START, layout.x, layout.y, {
          width: layout.width,
          height: layout.height,
        })
      );
    }

    if (this.game.readyVisible) {
      commands.push(spriteCommand(TEXTURES.READY, 176, 38));
    }

    if (this.game.end.visible) {
      const layout = this.game.end;
      commands.push(
        spriteCommand(TEXTURES.GAME_END, layout.x, layout.y, {
          width: layout.width,
          height: layout.height,
        })
      );
    }
  }

  addGameCommands(commands) {
    if (!this.game.visible) return;
    this.addGameBackground(commands);
    this.addCloudAndWaveCommands(commands);
    this.addPlayersAndBallCommands(commands);
    this.addScoreCommands(commands);
    this.addGameMessageCommands(commands);
  }

  getRenderFrame() {
    const commands = [];
    this.addIntroCommands(commands);
    this.addMenuCommands(commands);
    this.addGameCommands(commands);

    if (this.fadeVisible) {
      commands.push(
        spriteCommand(TEXTURES.BLACK, 0, 0, {
          width: WIDTH,
          height: HEIGHT,
          alpha: this.fadeAlpha,
        })
      );
    }

    return {
      logicalWidth: WIDTH,
      logicalHeight: HEIGHT,
      scaleMode: this.graphicMode === 'soft' ? 'linear' : 'nearest',
      quickRematchVisible: this.quickRematchVisible,
      commands,
    };
  }
}

export function createNativeRenderState(graphicMode) {
  return new NativeRenderState(graphicMode);
}
