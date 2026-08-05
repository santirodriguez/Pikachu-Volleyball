/**
 * This module takes charge of the user input via keyboard
 */
'use strict';
import { PikaUserInput } from './physics.js';
import inputActionsModule from './input_actions.cjs';

const {
  INPUT_ACTIONS,
  PLAYER_ONE_PRIMARY_POWER_HIT_KEY,
  PLAYER_ONE_ALTERNATE_POWER_HIT_KEY,
  InputActionState,
  getPowerHitKeyCodes,
} = inputActionsModule;

export {
  INPUT_ACTIONS,
  PLAYER_ONE_PRIMARY_POWER_HIT_KEY,
  PLAYER_ONE_ALTERNATE_POWER_HIT_KEY,
};

/**
 * Class representing a keyboard used to control a player
 */
export class PikaKeyboard extends PikaUserInput {
  /**
   * Create a keyboard used for game controller.
   * Each argument accepts a KeyboardEvent.code string. Power Hit also accepts
   * an array of codes. The existing Player 1 KeyZ binding automatically keeps
   * ControlLeft as an additional binding for backward-compatible construction.
   * @param {string} left KeyboardEvent.code value for moving left
   * @param {string} right KeyboardEvent.code value for moving right
   * @param {string} up KeyboardEvent.code value for moving up
   * @param {string} down KeyboardEvent.code value for moving down
   * @param {string|string[]} powerHit KeyboardEvent.code value or values for Power Hit
   * @param {string|null} downRight optional Player 1 down-right shortcut
   */
  constructor(left, right, up, down, powerHit, downRight = null) {
    super();

    const powerHitKeyCodes = getPowerHitKeyCodes(powerHit);
    const isPlayerOneDefaultBinding = powerHitKeyCodes.includes(
      PLAYER_ONE_PRIMARY_POWER_HIT_KEY
    );

    this.actionState = new InputActionState({
      [INPUT_ACTIONS.MOVE_LEFT]: left,
      [INPUT_ACTIONS.MOVE_RIGHT]: right,
      [INPUT_ACTIONS.MOVE_UP]: up,
      [INPUT_ACTIONS.MOVE_DOWN]: down,
      [INPUT_ACTIONS.MOVE_DOWN_RIGHT]: downRight,
      [INPUT_ACTIONS.POWER_HIT]: powerHitKeyCodes,
      [INPUT_ACTIONS.CONFIRM]: powerHitKeyCodes,
      [INPUT_ACTIONS.BACK]: 'Escape',
      [INPUT_ACTIONS.PAUSE]: 'Escape',
      [INPUT_ACTIONS.PRACTICE_RESET]: isPlayerOneDefaultBinding
        ? 'KeyB'
        : null,
    });

    this.actionSnapshot = { down: {}, pressed: {} };
    this.isSubscribed = false;
    this.downListener = this.downHandler.bind(this);
    this.upListener = this.upHandler.bind(this);
    this.blurListener = this.reset.bind(this);
    this.visibilityChangeListener = this.onVisibilityChange.bind(this);

    this.confirm = 0;
    this.back = 0;
    this.pause = 0;
    this.practiceReset = 0;

    this.subscribe();
  }

  /**
   * Get a frozen input snapshot for one game frame.
   */
  getInput() {
    this.actionSnapshot = this.actionState.createSnapshot();
    const down = this.actionSnapshot.down;
    const pressed = this.actionSnapshot.pressed;
    const downRight = down[INPUT_ACTIONS.MOVE_DOWN_RIGHT];

    if (down[INPUT_ACTIONS.MOVE_LEFT]) {
      this.xDirection = -1;
    } else if (down[INPUT_ACTIONS.MOVE_RIGHT] || downRight) {
      this.xDirection = 1;
    } else {
      this.xDirection = 0;
    }

    if (down[INPUT_ACTIONS.MOVE_UP]) {
      this.yDirection = -1;
    } else if (down[INPUT_ACTIONS.MOVE_DOWN] || downRight) {
      this.yDirection = 1;
    } else {
      this.yDirection = 0;
    }

    this.powerHit = pressed[INPUT_ACTIONS.POWER_HIT] ? 1 : 0;
    this.confirm = pressed[INPUT_ACTIONS.CONFIRM] ? 1 : 0;
    this.back = pressed[INPUT_ACTIONS.BACK] ? 1 : 0;
    this.pause = pressed[INPUT_ACTIONS.PAUSE] ? 1 : 0;
    this.practiceReset = pressed[INPUT_ACTIONS.PRACTICE_RESET] ? 1 : 0;
  }

  /**
   * @param {KeyboardEvent} event
   */
  downHandler(event) {
    if (this.actionState.handleKeyDown(event.code)) {
      event.preventDefault();
    }
  }

  /**
   * @param {KeyboardEvent} event
   */
  upHandler(event) {
    if (this.actionState.handleKeyUp(event.code)) {
      event.preventDefault();
    }
  }

  onVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      this.reset();
    }
  }

  /**
   * Clear all input state after focus loss or listener removal.
   */
  reset() {
    this.actionState.reset();
    this.actionSnapshot = { down: {}, pressed: {} };
    this.xDirection = 0;
    this.yDirection = 0;
    this.powerHit = 0;
    this.confirm = 0;
    this.back = 0;
    this.pause = 0;
    this.practiceReset = 0;
  }

  /**
   * @param {string} action semantic input action
   * @returns {boolean}
   */
  isActionDown(action) {
    return this.actionState.isActionDown(action);
  }

  /**
   * @param {string} action semantic input action
   * @returns {boolean}
   */
  wasActionPressed(action) {
    return Boolean(this.actionSnapshot.pressed[action]);
  }

  /**
   * Subscribe keyboard and focus-loss listeners.
   */
  subscribe() {
    if (this.isSubscribed) {
      return;
    }
    window.addEventListener('keyup', this.upListener);
    window.addEventListener('keydown', this.downListener);
    window.addEventListener('blur', this.blurListener);
    document.addEventListener(
      'visibilitychange',
      this.visibilityChangeListener
    );
    this.isSubscribed = true;
  }

  /**
   * Unsubscribe keyboard and focus-loss listeners.
   */
  unsubscribe() {
    if (!this.isSubscribed) {
      return;
    }
    window.removeEventListener('keydown', this.downListener);
    window.removeEventListener('keyup', this.upListener);
    window.removeEventListener('blur', this.blurListener);
    document.removeEventListener(
      'visibilitychange',
      this.visibilityChangeListener
    );
    this.isSubscribed = false;
    this.reset();
  }
}
