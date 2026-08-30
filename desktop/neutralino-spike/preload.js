'use strict';

(() => {
  const neutralino = window.Neutralino;

  if (!neutralino?.init || !neutralino?.events?.on || !neutralino?.app?.exit) {
    console.error('Neutralino desktop bridge is unavailable.');
    return;
  }

  let quitPromise = null;
  function quit() {
    if (quitPromise) return quitPromise;
    quitPromise = neutralino.app.exit(0).then(() => true);
    return quitPromise;
  }

  neutralino.init();
  neutralino.events.on('windowClose', () => {
    quit().catch((error) => {
      console.error('Unable to exit Neutralino cleanly.', error);
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
