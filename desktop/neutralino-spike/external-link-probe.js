'use strict';

(() => {
  const neutralino = window.Neutralino;
  const args = Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [];
  const phaseArg = args.find((arg) =>
    arg.startsWith('--dev-pv-smoke-phase=')
  );
  const phase = phaseArg ? phaseArg.slice('--dev-pv-smoke-phase='.length) : null;
  if (!neutralino || phase !== 'external-links') return;

  const EXTENSION_ID = 'com.santirodriguez.pikachuvolleyball.externallinks';
  const allowedUrl = 'https://santiagorodriguez.com';
  const forbiddenUrls = [
    'file:///tmp/pikachu-volleyball',
    'javascript:alert(1)',
    'data:text/html,pikachu',
    'not a url',
    'https://example.com',
    'https://github.com.evil.example/santirodriguez/pikachu-volleyball',
    'https://sub.santiagorodriguez.com/',
    'https://github.com/santirodriguez/pikachu-volleyball/issues',
  ];
  const observedNewWindowUrls = [];

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
      .writeProcessOutput(`PV_NEUTRALINO_EXTERNAL_LINK ${JSON.stringify(report)}\n`)
      .catch(() => {});
    await Promise.race([write, delay(500)]);
  }

  async function run() {
    neutralino.events.on('newWindowRequest', (event) => {
      const url = requestedUrl(event);
      if (url) observedNewWindowUrls.push(url);
    });

    const firstFrameReady = await waitFor(
      () => performance.getEntriesByName('pv-first-game-frame').length > 0
    );

    let directOsOpenBlocked = false;
    try {
      await neutralino.os.open('https://example.com');
    } catch {
      directOsOpenBlocked = true;
    }

    const anchor = document.createElement('a');
    anchor.href = allowedUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.textContent = 'external-link-smoke';
    document.body.appendChild(anchor);
    anchor.click();

    const newWindowRequestSeen = await waitFor(() =>
      observedNewWindowUrls.includes(allowedUrl)
    );
    anchor.remove();

    for (const url of forbiddenUrls) {
      await neutralino.extensions.dispatch(EXTENSION_ID, 'openExternal', { url });
    }
    await delay(500);

    await writeReport({
      phase: 'external-links',
      ok:
        firstFrameReady &&
        newWindowRequestSeen &&
        directOsOpenBlocked &&
        window.pvDesktop?.isDesktop === true &&
        window.pvDesktop?.runtime === 'neutralino' &&
        typeof window.pvDesktop?.quit === 'function',
      firstFrameReady,
      newWindowRequestSeen,
      observedNewWindowUrls,
      directOsOpenBlocked,
      forbiddenDispatchCount: forbiddenUrls.length,
      desktopRuntime: window.pvDesktop?.runtime || null,
    });
  }

  window.addEventListener(
    'load',
    () => {
      run().catch((error) => {
        writeReport({
          phase: 'external-links',
          ok: false,
          error: String(error?.stack || error),
        }).catch(() => {});
      });
    },
    { once: true }
  );
})();
