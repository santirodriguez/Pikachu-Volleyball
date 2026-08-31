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
  const caseArg = args.find((arg) =>
    arg.startsWith('--dev-pv-host-navigation-case=')
  );
  const navigationCase = caseArg
    ? caseArg.slice('--dev-pv-host-navigation-case='.length)
    : null;
  const delayArg = args.find((arg) =>
    arg.startsWith('--dev-pv-host-navigation-delay-ms=')
  );
  const navigationDelayMs = delayArg
    ? Number(delayArg.slice('--dev-pv-host-navigation-delay-ms='.length))
    : 150;
  const approvedExternalUrl = 'https://santiagorodriguez.com';

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

  async function writeReport(marker, report) {
    const write = neutralino.app
      .writeProcessOutput(`${marker} ${JSON.stringify(report)}\n`)
      .catch(() => {});
    await Promise.race([write, delay(500)]);
  }

  function navigate(selectedCase) {
    if (selectedCase === 'assign') {
      window.location.assign(`${untrustedOrigin}/assign`);
      return;
    }
    if (selectedCase === 'href') {
      window.location.href = `${untrustedOrigin}/href`;
      return;
    }
    if (selectedCase === 'replace') {
      window.location.replace(`${untrustedOrigin}/replace`);
      return;
    }
    if (selectedCase === 'anchor') {
      const anchor = document.createElement('a');
      anchor.href = `${untrustedOrigin}/anchor`;
      anchor.textContent = 'host-navigation-smoke';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }
    if (selectedCase === 'data') {
      window.location.assign(
        'data:text/html,<title>PV_UNTRUSTED_DATA_NAVIGATION</title>'
      );
      return;
    }
    if (selectedCase === 'file') {
      window.location.assign('file:///tmp/pv-untrusted-navigation');
      return;
    }
    if (selectedCase === 'approved') {
      window.location.assign(approvedExternalUrl);
      return;
    }
    throw new Error(`Unknown host-navigation case: ${selectedCase}`);
  }

  async function run() {
    if (!untrustedOrigin) {
      throw new Error('Missing --dev-pv-untrusted-origin smoke argument.');
    }
    if (!navigationCase) {
      throw new Error('Missing --dev-pv-host-navigation-case smoke argument.');
    }
    if (
      !Number.isFinite(navigationDelayMs) ||
      navigationDelayMs < 0 ||
      navigationDelayMs > 15000
    ) {
      throw new Error(
        `Invalid --dev-pv-host-navigation-delay-ms smoke argument: ${navigationDelayMs}`
      );
    }

    const firstFrameReady = await waitFor(
      () => performance.getEntriesByName('pv-first-game-frame').length > 0
    );
    const trustedOrigin = window.location.origin;
    const title = `PV_HOST_NAVIGATION_${navigationCase}`;
    document.title = title;

    await writeReport('PV_NEUTRALINO_HOST_NAVIGATION_READY', {
      phase: 'host-navigation',
      case: navigationCase,
      ok:
        firstFrameReady &&
        window.pvDesktop?.isDesktop === true &&
        window.pvDesktop?.runtime === 'neutralino',
      firstFrameReady,
      trustedOrigin,
      href: window.location.href,
      title,
      navigationDelayMs,
      desktopRuntime: window.pvDesktop?.runtime || null,
    });

    if (!firstFrameReady) return;
    await delay(navigationDelayMs);
    navigate(navigationCase);
  }

  function start() {
    run().catch((error) => {
      writeReport('PV_NEUTRALINO_HOST_NAVIGATION_READY', {
        phase: 'host-navigation',
        case: navigationCase,
        ok: false,
        error: String(error?.stack || error),
      }).catch(() => {});
    });
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
