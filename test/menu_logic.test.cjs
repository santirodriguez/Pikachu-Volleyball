'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SUPPORTED_LOCALES,
  MENU_CONFIRM_KEYS,
  wrapIndex,
  isMenuConfirmKey,
  shouldActivateMenuConfirm,
  menuTabDirection,
  normalizeLocale,
  buildLocaleUrl,
} = require('../src/resources/js/menu_logic.cjs');

test('wraps menu indexes in both directions', () => {
  assert.equal(wrapIndex(0, 4), 0);
  assert.equal(wrapIndex(4, 4), 0);
  assert.equal(wrapIndex(-1, 4), 3);
  assert.equal(wrapIndex(3, 0), 0);
});

test('accepts every approved menu confirmation key', () => {
  for (const code of ['Enter', 'KeyZ', 'ShiftLeft', 'ControlLeft']) {
    assert.equal(isMenuConfirmKey(code), true);
  }
  assert.deepEqual(MENU_CONFIRM_KEYS, [
    'Enter',
    'KeyZ',
    'ShiftLeft',
    'ControlLeft',
  ]);
  assert.equal(isMenuConfirmKey('Space'), false);
});

test('requires a fresh confirmation press and keeps Tab direction explicit', () => {
  assert.equal(shouldActivateMenuConfirm('Enter', false), true);
  assert.equal(shouldActivateMenuConfirm('KeyZ', true), false);
  assert.equal(shouldActivateMenuConfirm('Space', false), false);
  assert.equal(menuTabDirection(false), 1);
  assert.equal(menuTabDirection(true), -1);
});

test('normalizes document language codes to built locales', () => {
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('es-AR'), 'es-ar');
  assert.equal(normalizeLocale('ca-ES'), 'ca');
  assert.equal(normalizeLocale('ko'), 'ko');
  assert.equal(normalizeLocale('zh-Hans'), 'zh');
  assert.deepEqual(SUPPORTED_LOCALES, ['en', 'es-ar', 'ca', 'ko', 'zh']);
});

test('builds browser locale URLs without carrying stale query state', () => {
  assert.equal(
    buildLocaleUrl(
      'https://example.test/en/index.html?desktop=1#old',
      'ca',
      false
    ),
    'https://example.test/ca/index.html'
  );
});

test('builds packaged locale URLs and preserves desktop mode explicitly', () => {
  assert.equal(
    buildLocaleUrl(
      'file:///opt/pikachu/dist/en/index.html?desktop=1',
      'ca',
      true
    ),
    'file:///opt/pikachu/dist/ca/index.html?desktop=1'
  );
});

test('rejects locales without production output', () => {
  assert.throws(
    () => buildLocaleUrl('https://example.test/en/', 'fr'),
    /Unsupported locale/
  );
});
