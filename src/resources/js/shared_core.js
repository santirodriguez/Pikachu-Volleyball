'use strict';

import { GROUND_HALF_WIDTH, PikaPhysics } from './physics.js';
import gameCoreModule from './game_core.cjs';

const { GameCore } = gameCoreModule;

/**
 * Create the host-neutral gameplay core around the existing reverse-engineered
 * physics implementation.
 * @param {{physics?:Object,isPlayer1Computer?:boolean,isPlayer2Computer?:boolean}} [options]
 * @return {GameCore}
 */
export function createGameCore(options = {}) {
  const physics =
    options.physics ||
    new PikaPhysics(
      options.isPlayer1Computer ?? true,
      options.isPlayer2Computer ?? true
    );
  return new GameCore({ physics, groundHalfWidth: GROUND_HALF_WIDTH });
}
