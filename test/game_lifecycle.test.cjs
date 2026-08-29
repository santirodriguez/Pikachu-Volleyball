'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GAME_STATE_IDS,
  getGameStateHandlerName,
  isMatchInProgress,
} = require('../src/resources/js/game_lifecycle.cjs');

const expectedStateIds = Object.freeze({
  INTRO: 'intro',
  MENU: 'menu',
  AFTER_MENU_SELECTION: 'after-menu-selection',
  BEFORE_START_OF_NEW_GAME: 'before-start-of-new-game',
  START_OF_NEW_GAME: 'start-of-new-game',
  ROUND: 'round',
  AFTER_END_OF_ROUND: 'after-end-of-round',
  BEFORE_START_OF_NEXT_ROUND: 'before-start-of-next-round',
});

test('game lifecycle exposes stable explicit state ids', () => {
  assert.deepEqual(GAME_STATE_IDS, expectedStateIds);
  assert.equal(GAME_STATE_IDS.GAME_END, undefined);
});

test('game lifecycle maps every state id to the existing state handler', () => {
  const expectedHandlerNames = {
    intro: 'intro',
    menu: 'menu',
    'after-menu-selection': 'afterMenuSelection',
    'before-start-of-new-game': 'beforeStartOfNewGame',
    'start-of-new-game': 'startOfNewGame',
    round: 'round',
    'after-end-of-round': 'afterEndOfRound',
    'before-start-of-next-round': 'beforeStartOfNextRound',
  };

  for (const [stateId, handlerName] of Object.entries(expectedHandlerNames)) {
    assert.equal(getGameStateHandlerName(stateId), handlerName);
  }
  assert.equal(getGameStateHandlerName('unknown'), null);
});

test('match-in-progress boundary preserves the current command semantics', () => {
  const inactiveStateIds = [
    GAME_STATE_IDS.INTRO,
    GAME_STATE_IDS.MENU,
    GAME_STATE_IDS.AFTER_MENU_SELECTION,
    GAME_STATE_IDS.BEFORE_START_OF_NEW_GAME,
  ];
  const activeStateIds = [
    GAME_STATE_IDS.START_OF_NEW_GAME,
    GAME_STATE_IDS.ROUND,
    GAME_STATE_IDS.AFTER_END_OF_ROUND,
    GAME_STATE_IDS.BEFORE_START_OF_NEXT_ROUND,
  ];

  for (const stateId of inactiveStateIds) {
    assert.equal(isMatchInProgress(stateId), false);
  }
  for (const stateId of activeStateIds) {
    assert.equal(isMatchInProgress(stateId), true);
  }
  assert.equal(isMatchInProgress('unknown'), false);
});
