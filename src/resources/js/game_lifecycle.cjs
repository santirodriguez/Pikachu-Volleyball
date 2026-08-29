'use strict';

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

const GAME_STATE_HANDLER_NAMES = Object.freeze({
  [GAME_STATE_IDS.INTRO]: 'intro',
  [GAME_STATE_IDS.MENU]: 'menu',
  [GAME_STATE_IDS.AFTER_MENU_SELECTION]: 'afterMenuSelection',
  [GAME_STATE_IDS.BEFORE_START_OF_NEW_GAME]: 'beforeStartOfNewGame',
  [GAME_STATE_IDS.START_OF_NEW_GAME]: 'startOfNewGame',
  [GAME_STATE_IDS.ROUND]: 'round',
  [GAME_STATE_IDS.AFTER_END_OF_ROUND]: 'afterEndOfRound',
  [GAME_STATE_IDS.BEFORE_START_OF_NEXT_ROUND]: 'beforeStartOfNextRound',
});

const MATCH_IN_PROGRESS_STATE_IDS = Object.freeze([
  GAME_STATE_IDS.START_OF_NEW_GAME,
  GAME_STATE_IDS.ROUND,
  GAME_STATE_IDS.AFTER_END_OF_ROUND,
  GAME_STATE_IDS.BEFORE_START_OF_NEXT_ROUND,
]);

function getGameStateHandlerName(stateId) {
  return GAME_STATE_HANDLER_NAMES[stateId] || null;
}

function isMatchInProgress(stateId) {
  return MATCH_IN_PROGRESS_STATE_IDS.includes(stateId);
}

module.exports = {
  GAME_STATE_IDS,
  GAME_STATE_HANDLER_NAMES,
  MATCH_IN_PROGRESS_STATE_IDS,
  getGameStateHandlerName,
  isMatchInProgress,
};
