'use strict';

(() => {
  const neutralino = window.Neutralino;
  const EXTERNAL_LINK_EXTENSION_ID =
    'com.santirodriguez.pikachuvolleyball.externallinks';

  if (
    !neutralino?.init ||
    !neutralino?.events?.on ||
    !neutralino?.app?.exit ||
    !neutralino?.extensions?.dispatch
  ) {
    console.error('Neutralino desktop bridge is unavailable.');
    return;
  }

  let quitPromise = null;
  function quit() {
    if (quitPromise) return quitPromise;
    quitPromise = neutralino.app.exit(0).then(() => true);
    return quitPromise;
  }

  async function mediateExternalLink(url) {
    if (typeof url !== 'string') return false;
    await neutralino.extensions.dispatch(
      EXTERNAL_LINK_EXTENSION_ID,
      'openExternal',
      { url }
    );
    return true;
  }

  function getExternalAnchor(event) {
    const anchor = event?.target?.closest?.('a[target="_blank"][href]');
    return anchor instanceof HTMLAnchorElement ? anchor : null;
  }

  function mediateAnchorEvent(event) {
    const anchor = getExternalAnchor(event);
    if (!anchor) return;
    event.preventDefault();
    mediateExternalLink(anchor.href).catch((error) => {
      console.error('Unable to mediate external link.', error);
    });
  }

  function getRequestedUrl(event) {
    if (typeof event?.detail === 'string') return event.detail;
    if (typeof event?.detail?.url === 'string') return event.detail.url;
    if (typeof event?.url === 'string') return event.url;
    return null;
  }

  neutralino.init();
  document.addEventListener('click', mediateAnchorEvent, true);
  document.addEventListener('auxclick', mediateAnchorEvent, true);
  neutralino.events.on('windowClose', () => {
    quit().catch((error) => {
      console.error('Unable to exit Neutralino cleanly.', error);
    });
  });
  neutralino.events.on('newWindowRequest', (event) => {
    const url = getRequestedUrl(event);
    if (!url) return;
    mediateExternalLink(url).catch((error) => {
      console.error('Unable to mediate external link.', error);
    });
  });

  Object.defineProperty(window, 'pvDesktop', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: Object.freeze({
      isDesktop: true,
      runtime: 'neutralino',
      quit,
    }),
  });
})();
