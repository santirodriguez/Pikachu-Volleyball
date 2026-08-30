'use strict';

(() => {
  const neutralino = window.Neutralino;
  const allowedExternalUrls = new Set([
    'https://github.com/santirodriguez/pikachu-volleyball',
    'https://github.com/gorisanson/pikachu-volleyball',
  ]);
  const allowedWebsiteOrigins = new Set([
    'https://santiagorodriguez.com',
    'https://www.santiagorodriguez.com',
  ]);

  if (
    !neutralino?.init ||
    !neutralino?.events?.on ||
    !neutralino?.app?.exit ||
    !neutralino?.os?.open
  ) {
    console.error('Neutralino desktop bridge is unavailable.');
    return;
  }

  function isAllowedExternalUrl(urlString) {
    try {
      const url = new URL(urlString);
      if (allowedWebsiteOrigins.has(url.origin)) return true;
      return allowedExternalUrls.has(`${url.origin}${url.pathname}`);
    } catch {
      return false;
    }
  }

  async function openAllowedExternalUrl(urlString) {
    if (!isAllowedExternalUrl(urlString)) return false;
    await neutralino.os.open(urlString);
    return true;
  }

  function getRequestedUrl(event) {
    const detail = event?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail.url === 'string') return detail.url;
    return null;
  }

  neutralino.init();
  neutralino.events.on('newWindowRequest', (event) => {
    const url = getRequestedUrl(event);
    if (!url) return;
    openAllowedExternalUrl(url).catch((error) => {
      console.error('Unable to open approved external URL.', error);
    });
  });

  Object.defineProperty(window, 'pvDesktop', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: Object.freeze({
      isDesktop: true,
      quit: async () => {
        await neutralino.app.exit();
        return true;
      },
    }),
  });
})();
