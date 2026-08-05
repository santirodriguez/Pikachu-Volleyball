'use strict';

const SUPPORTED_LOCALES = Object.freeze(['en', 'es-ar', 'ca', 'ko', 'zh']);
const MENU_CONFIRM_KEYS = Object.freeze([
  'Enter',
  'KeyZ',
  'ShiftLeft',
  'ControlLeft',
]);

function wrapIndex(index, length) {
  if (!Number.isInteger(length) || length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}

function isMenuConfirmKey(code) {
  return MENU_CONFIRM_KEYS.includes(code);
}

function normalizeLocale(locale) {
  const normalized = String(locale || '').toLowerCase();
  if (normalized.startsWith('es')) return 'es-ar';
  if (normalized.startsWith('ca')) return 'ca';
  if (normalized.startsWith('ko')) return 'ko';
  if (normalized.startsWith('zh')) return 'zh';
  return 'en';
}

function buildLocaleUrl(currentUrl, locale, desktopMode = false) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const url = new URL(currentUrl);
  const segments = url.pathname.split('/');
  const localeIndex = segments.findIndex((segment) =>
    SUPPORTED_LOCALES.includes(segment)
  );

  if (localeIndex >= 0) {
    segments[localeIndex] = locale;
    url.pathname = segments.join('/');
  } else {
    const target = new URL(`../${locale}/index.html`, url);
    url.pathname = target.pathname;
  }

  url.search = '';
  url.hash = '';
  if (desktopMode) {
    url.searchParams.set('desktop', '1');
  }
  return url.toString();
}

module.exports = {
  SUPPORTED_LOCALES,
  MENU_CONFIRM_KEYS,
  wrapIndex,
  isMenuConfirmKey,
  normalizeLocale,
  buildLocaleUrl,
};
