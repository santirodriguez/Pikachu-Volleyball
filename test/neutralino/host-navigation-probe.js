'use strict';

(() => {
  const neutralino = window.Neutralino;
  const args = Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [];
  const phaseArg = args.find((arg) => arg.startsWith('--dev-pv-smoke-phase='));
  const phase = phaseArg ? phaseArg.slice('--dev-pv-smoke-phase='.length) : null;
  if (!neutralino || phase !== 'host-navigation') return;

  const untrustedArg = args.find((arg) =>
    arg.startsWith('--dev-pv-untrusted-origin=')
  );
  const untrustedOrigin = untrustedArg
    ? untrustedArg.slice('--dev-pv-untrusted-origin='.length)
    : null;
  const approvedExternalUrl = 'https://santiagorodriguez.com';
  const observedNewWindowRequests = [];

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function waitFor(predicate, timeoutMs = 10000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (predicate()) return true;
      await delay(25);
    }
    return false;
  }

  function requestedUrl(event) {
    if (typeof event?.detail === 'string') return event.detail;
    if (typeof event?.detail?.url === 'string') return event.detail.url;
    if (typeof event?.url === 'string') return event.url;
    return null;
  }

  async function writeReport(report) {
    const write = neutralino.app
      .writeProcessOutput(
        `PV_NEUTRALINO_HOST_NAVIGATION ${JSON.stringify(report)}\n`
      )
      .catch(() => {});
    await Promise.race([write, delay(500)]);
  }

  async function attemptNavigation(name, action, trustedOrigin) {
    let error = null;
    try {
      action();
    } catch (caught) {
      error = String(caught?.message || caught);
    }
    await delay(350);
    return {
      name,
      error,
      href: window.location.href,
      stayedOnTrustedOrigin:
        window.location.origin === trustedOrigin &&
        Boolean(document.documentElement?.isConnected),
    };
  }

  async function run() {
    if (!untrustedOrigin) {
      throw new Error('Missing --dev-pv-untrusted-origin smoke argument.');
    }

    neutralino.events.on('newWindowRequest', (event) => {
      const url = requestedUrl(event);
      if (url) observedNewWindowRequests.push(url);
    });

    const firstFrameReady = await waitFor(
      () => performance.getEntriesByName('pv-first-game-frame').length > 0
    );
    const trustedOrigin = window.location.origin;
    const attempts = [];

    attempts.push(
      await attemptNavigation(
        'location.assign',
        () => window.location.assign(`${untrustedOrigin}/assign`),
        trustedOrigin
      )
    );
    attempts.push(
      await attemptNavigation(
        'window.location.href',
        () => {
          window.location.href = `${untrustedOrigin}/href`;
        },
        trustedOrigin
      )
    );
    attempts.push(
      await attemptNavigation(
        'location.replace',
        () => window.location.replace(`${untrustedOrigin}/replace`),
        trustedOrigin
      )
    );
    attempts.push(
      await attemptNavigation(
        'same-window-anchor',
        () => {
          const anchor = document.createElement('a');
          anchor.href = `${untrustedOrigin}/anchor`;
          anchor.textContent = 'host-navigation-smoke';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        },
        trustedOrigin
      )
    );
    attempts.push(
      await attemptNavigation(
        'data-url',
        () =>
          window.location.assign(
            'data:text/html,<title>PV_UNTRUSTED_DATA_NAVIGATION</title>'
          ),
        trustedOrigin
      )
    );
    attempts.push(
      await attemptNavigation(
        'file-url',
        () => window.location.assign('file:///tmp/pv-untrusted-navigation'),
        trustedOrigin
      )
    );
    attempts.push(
      await attemptNavigation(
        'approved-external-same-window',
        () => window.location.assign(approvedExternalUrl),
        trustedOrigin
      )
    );

    const stayedOnTrustedOrigin = attempts.every(
      (attempt) => attempt.stayedOnTrustedOrigin
    );

    await writeReport({
      phase: 'host-navigation',
      ok:
        firstFrameReady &&
        stayedOnTrustedOrigin &&
        window.pvDesktop?.isDesktop === true &&
        window.pvDesktop?.runtime === 'neutralino',
      firstFrameReady,
      trustedOrigin,
      stayedOnTrustedOrigin,
      attempts,
      observedNewWindowRequests,
      desktopRuntime: window.pvDesktop?.runtime || null,
    });
  }

  function start() {
    run().catch((error) => {
      writeReport({
        phase: 'host-navigation',
        ok: false,
        error: String(error?.stack || error),
      }).catch(() => {});
    });
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
