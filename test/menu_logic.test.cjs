'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MENU_CONFIRM_KEYS,
  wrapIndex,
  isMenuConfirmKey,
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

test('normalizes document language codes to built locales', () => {
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('es-AR'), 'es-ar');
  assert.equal(normalizeLocale('ko'), 'ko');
  assert.equal(normalizeLocale('zh-Hans'), 'zh');
  assert.equal(normalizeLocale('ca'), 'en');
});

test('builds browser locale URLs without carrying stale query state', () => {
  assert.equal(
    buildLocaleUrl(
      'https://example.test/en/index.html?desktop=1#old',
      'es-ar',
      false
    ),
    'https://example.test/es-ar/index.html'
  );
});

test('builds packaged locale URLs and preserves desktop mode explicitly', () => {
  assert.equal(
    buildLocaleUrl(
      'file:///opt/pikachu/dist/en/index.html?desktop=1',
      'ko',
      true
    ),
    'file:///opt/pikachu/dist/ko/index.html?desktop=1'
  );
});

test('rejects locales that do not have production output yet', () => {
  assert.throws(
    () => buildLocaleUrl('https://example.test/en/', 'ca'),
    /Unsupported locale/
  );
});
