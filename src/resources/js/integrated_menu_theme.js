'use strict';

const COPY = Object.freeze({
  en: { label: 'Interface Theme', light: 'LIGHT', dark: 'DARK' },
  'es-ar': { label: 'Tema de interfaz', light: 'CLARO', dark: 'OSCURO' },
  ca: { label: 'Tema de la interfície', light: 'CLAR', dark: 'FOSC' },
  ko: { label: '인터페이스 테마', light: '라이트', dark: '다크' },
  zh: { label: '界面主题', light: '浅色', dark: '深色' },
});

export function getIntegratedMenuThemeCopy(locale) {
  return COPY[locale] || COPY.en;
}
