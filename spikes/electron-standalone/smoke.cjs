'use strict';

const path = require('node:path');

const PERSISTENCE_KEY = 'pv-electron-spike-persistence';
const PERSISTENCE_VALUE = 'phase5-v1';
const SUPPORTED_LOCALES = Object.freeze(['en', 'es-ar', 'ca', 'ko', 'zh']);
const NAVIGATION_CASES = Object.freeze([
  { name: 'assign', url: 'https://example.com/assign', kind: 'assign' },
  { name: 'href', url: 'https://example.com/href', kind: 'href' },
  { name: 'replace', url: 'https://example.com/replace', kind: 'replace' },
  { name: 'anchor', url: 'https://example.com/anchor', kind: 'anchor' },
  { name: 'iframe', url: 'https://example.com/frame', kind: 'iframe' },
  { name: 'data', url: 'data:text/html,<title>PV_UNTRUSTED_DATA_NAVIGATION</title>', kind: 'assign' },
  { name: 'file', url: 'file:///tmp/pv-untrusted-navigation', kind: 'assign' },
  { name: 'approved', url: 'https://santiagorodriguez.com', kind: 'assign' },
]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeFunction(webContents, fn, ...args) {
  const invocation = `(${fn.toString()})(${args
    .map((value) => JSON.stringify(value))
    .join(',')})`;
  return webContents.executeJavaScript(invocation, true);
}

async function waitForFirstFrame(webContents, timeoutMs = 15000) {
  return executeFunction(
    webContents,
    async (timeout) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeout) {
        if (performance.getEntriesByName('pv-first-game-frame').length > 0) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return false;
    },
    timeoutMs
  );
}

function finish(app, report) {
  const normalized = { ...report, ok: Boolean(report.ok) };
  console.error(`PV_ELECTRON_SMOKE ${JSON.stringify(normalized)}`);
  if (!normalized.ok) {
    app.exit(1);
    return;
  }
  setImmediate(() => app.quit());
}

async function runWrite(mainWindow, app) {
  const firstFrameReady = await waitForFirstFrame(mainWindow.webContents);
  const stored = await executeFunction(
    mainWindow.webContents,
    (key, value) => {
      localStorage.setItem(key, value);
      return localStorage.getItem(key);
    },
    PERSISTENCE_KEY,
    PERSISTENCE_VALUE
  );
  finish(app, {
    phase: 'write',
    ok: firstFrameReady && stored === PERSISTENCE_VALUE,
    firstFrameReady,
    stored,
  });
}

async function runRead(mainWindow, app) {
  const report = await executeFunction(
    mainWindow.webContents,
    async (persistenceKey, persistenceValue) => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (predicate, timeoutMs = 10000) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
          if (predicate()) return true;
          await delay(25);
        }
        return false;
      };
      const dispatchKey = (code, type) => {
        window.dispatchEvent(
          new KeyboardEvent(type, { code, bubbles: true, cancelable: true })
        );
      };
      const openPauseMenu = async () => {
        dispatchKey('KeyP', 'keydown');
        dispatchKey('KeyP', 'keyup');
        return waitFor(() => {
          const overlay = document.getElementById('pv-menu-overlay');
          return Boolean(overlay && !overlay.hidden);
        });
      };
      const readSettingState = (name, storageKey) => {
        const control = document.querySelector(`[data-setting="${name}"]`);
        return {
          control,
          value: control?.dataset.value || null,
          stored: localStorage.getItem(storageKey),
        };
      };
      const cycleSettingAndWait = async (name, storageKey) => {
        const before = readSettingState(name, storageKey);
        if (!before.control || !before.value) return { ok: false };
        before.control.click();
        const changed = await waitFor(() => {
          const current = readSettingState(name, storageKey);
          return Boolean(
            current.control &&
              current.value &&
              current.value !== before.value &&
              current.stored === current.value
          );
        }, 2000);
        const after = readSettingState(name, storageKey);
        return {
          ok: changed,
          before: before.value,
          value: after.value,
          stored: after.stored,
        };
      };
      const probePauseAndSettings = async () => {
        const pauseStates = [];
        const onPause = (event) => pauseStates.push(Boolean(event.detail?.paused));
        window.addEventListener('pv-pause-changed', onPause);
        const opened = await openPauseMenu();
        if (!opened) {
          window.removeEventListener('pv-pause-changed', onPause);
          return { ok: false, reason: 'pause-menu-did-not-open', pauseStates };
        }
        document.querySelector('[data-nav-id="audio"]')?.click();
        const panelReady = await waitFor(
          () =>
            Boolean(document.querySelector('[data-setting="bgm"]')) &&
            Boolean(document.querySelector('[data-setting="sfx"]'))
        );
        const originalBgm = readSettingState('bgm', 'pv-offline-bgm').value;
        const bgmOne = await cycleSettingAndWait('bgm', 'pv-offline-bgm');
        const bgmTwo = await cycleSettingAndWait('bgm', 'pv-offline-bgm');
        const originalSfx = readSettingState('sfx', 'pv-offline-sfx').value;
        let sfxCyclesOk = true;
        for (let index = 0; index < 3; index += 1) {
          const result = await cycleSettingAndWait('sfx', 'pv-offline-sfx');
          sfxCyclesOk = sfxCyclesOk && result.ok;
        }
        const restoredSfx = readSettingState('sfx', 'pv-offline-sfx').value;
        document.querySelector('[data-nav-id="continue"]')?.click();
        const closed = await waitFor(() => {
          const overlay = document.getElementById('pv-menu-overlay');
          return Boolean(overlay?.hidden);
        });
        window.removeEventListener('pv-pause-changed', onPause);
        return {
          ok:
            panelReady &&
            closed &&
            pauseStates.includes(true) &&
            pauseStates.includes(false) &&
            bgmOne.ok &&
            bgmTwo.ok &&
            bgmOne.value !== originalBgm &&
            bgmTwo.value === originalBgm &&
            sfxCyclesOk &&
            restoredSfx === originalSfx,
          pauseStates,
        };
      };
      const probeRestart = async () => {
        const pauseStates = [];
        const onPause = (event) => pauseStates.push(Boolean(event.detail?.paused));
        window.addEventListener('pv-pause-changed', onPause);
        const opened = await openPauseMenu();
        document.querySelector('[data-nav-id="restart"]')?.click();
        document.querySelector('[data-command="restart"]')?.click();
        const confirmationVisible = await waitFor(() => {
          const modal = document.getElementById('pv-menu-modal');
          return Boolean(modal && !modal.hidden);
        });
        document.querySelector('[data-modal-action="accept"]')?.click();
        const closed = await waitFor(() => {
          const overlay = document.getElementById('pv-menu-overlay');
          return !overlay || overlay.hidden;
        });
        window.removeEventListener('pv-pause-changed', onPause);
        return {
          ok:
            opened &&
            confirmationVisible &&
            closed &&
            pauseStates.includes(true) &&
            pauseStates.includes(false),
          pauseStates,
        };
      };
      const probeMedia = async (relativeUrl, mimeType) => {
        const audio = new Audio();
        const canPlayType = audio.canPlayType(mimeType);
        const src = new URL(relativeUrl, window.location.href).toString();
        const loaded = await new Promise((resolve) => {
          const timeout = window.setTimeout(() => resolve(false), 8000);
          const complete = (result) => {
            window.clearTimeout(timeout);
            resolve(result);
          };
          audio.preload = 'metadata';
          audio.muted = true;
          audio.addEventListener('loadedmetadata', () => complete(true), {
            once: true,
          });
          audio.addEventListener('error', () => complete(false), { once: true });
          audio.src = src;
          audio.load();
        });
        const result = { loaded, canPlayType, readyState: audio.readyState };
        audio.removeAttribute('src');
        audio.load();
        return result;
      };

      const firstFrameReady = await waitFor(
        () => performance.getEntriesByName('pv-first-game-frame').length > 0,
        15000
      );
      const canvas = document.getElementById('game-canvas');
      const canvasOk = Boolean(
        canvas &&
          canvas.tagName === 'CANVAS' &&
          canvas.width === 864 &&
          canvas.height === 608
      );
      const bridgeKeys = Object.keys(window.pvDesktop || {}).sort();
      const bridgeOk = Boolean(
        window.pvDesktop?.isDesktop === true &&
          window.pvDesktop?.runtime === 'electron' &&
          typeof window.pvDesktop?.quit === 'function' &&
          JSON.stringify(bridgeKeys) ===
            JSON.stringify(['isDesktop', 'quit', 'runtime'])
      );
      const rendererAuthorityOk =
        typeof window.require === 'undefined' &&
        typeof window.process === 'undefined';
      const persistenceOk = localStorage.getItem(persistenceKey) === persistenceValue;
      const pauseAndSettings = await probePauseAndSettings();
      const restart = await probeRestart();
      const bgm = await probeMedia(
        '../resources/assets/sounds/bgm.mp3',
        'audio/mpeg'
      );
      const wav = await probeMedia(
        '../resources/assets/sounds/WAVE145_1.wav',
        'audio/wav'
      );

      return {
        phase: 'read',
        ok:
          firstFrameReady &&
          canvasOk &&
          bridgeOk &&
          rendererAuthorityOk &&
          persistenceOk &&
          pauseAndSettings.ok &&
          restart.ok &&
          bgm.loaded &&
          wav.loaded,
        firstFrameReady,
        canvas: {
          ok: canvasOk,
          width: canvas?.width || null,
          height: canvas?.height || null,
        },
        bridgeOk,
        bridgeKeys,
        rendererAuthorityOk,
        persistenceOk,
        pauseAndSettings,
        restart,
        media: { bgm, wav },
      };
    },
    PERSISTENCE_KEY,
    PERSISTENCE_VALUE
  );
  finish(app, report);
}

async function runKeyboard(mainWindow, app) {
  const firstFrameReady = await waitForFirstFrame(mainWindow.webContents);
  await executeFunction(mainWindow.webContents, () => {
    window.__pvElectronKeyboardProbe = {
      down: [],
      seen: [],
      trustedEvents: 0,
      maxSimultaneous: 0,
    };
    const down = new Set();
    const seen = new Set();
    const update = (event, isDown) => {
      if (isDown) down.add(event.code);
      else down.delete(event.code);
      seen.add(event.code);
      if (event.isTrusted) window.__pvElectronKeyboardProbe.trustedEvents += 1;
      window.__pvElectronKeyboardProbe.maxSimultaneous = Math.max(
        window.__pvElectronKeyboardProbe.maxSimultaneous,
        down.size
      );
      window.__pvElectronKeyboardProbe.down = [...down];
      window.__pvElectronKeyboardProbe.seen = [...seen];
    };
    window.addEventListener('keydown', (event) => update(event, true), true);
    window.addEventListener('keyup', (event) => update(event, false), true);
  });

  console.error(`PV_ELECTRON_KEYBOARD_READY firstFrameReady=${firstFrameReady}`);
  if (!firstFrameReady) {
    finish(app, { phase: 'keyboard', ok: false, firstFrameReady });
    return;
  }

  await delay(4500);
  const expectedCodes = ['KeyD', 'KeyR', 'ArrowRight', 'ArrowUp'];
  const probe = await executeFunction(mainWindow.webContents, () => ({
    ...window.__pvElectronKeyboardProbe,
    bridgeRuntime: window.pvDesktop?.runtime || null,
  }));
  const seen = new Set(probe.seen || []);
  finish(app, {
    phase: 'keyboard',
    ok:
      expectedCodes.every((code) => seen.has(code)) &&
      probe.trustedEvents >= expectedCodes.length * 2 &&
      probe.maxSimultaneous >= expectedCodes.length &&
      (probe.down || []).length === 0 &&
      probe.bridgeRuntime === 'electron',
    firstFrameReady,
    expectedCodes,
    ...probe,
  });
}

async function runWindow(mainWindow, app) {
  const firstFrameReady = await waitForFirstFrame(mainWindow.webContents);
  console.error(`PV_ELECTRON_WINDOW_READY firstFrameReady=${firstFrameReady}`);
  if (!firstFrameReady) {
    finish(app, { phase: 'window', ok: false, firstFrameReady });
    return;
  }
  await delay(10000);
  finish(app, { phase: 'window', ok: true, firstFrameReady });
}

async function runLocales(mainWindow, app, distRoot) {
  const results = [];
  for (const locale of SUPPORTED_LOCALES) {
    await mainWindow.loadFile(path.join(distRoot, locale, 'index.html'), {
      query: { desktop: '1' },
    });
    const firstFrameReady = await waitForFirstFrame(mainWindow.webContents);
    const renderer = await executeFunction(mainWindow.webContents, () => ({
      runtime: window.pvDesktop?.runtime || null,
      isDesktop: window.pvDesktop?.isDesktop === true,
      lang: document.documentElement.lang,
      canvas: Boolean(document.getElementById('game-canvas')),
    }));
    results.push({ locale, firstFrameReady, ...renderer });
  }
  finish(app, {
    phase: 'locales',
    ok: results.every(
      (entry) =>
        entry.firstFrameReady &&
        entry.runtime === 'electron' &&
        entry.isDesktop &&
        entry.canvas
    ),
    locales: results,
  });
}

async function runNavigation(mainWindow, app, getSecurityStats) {
  const firstFrameReady = await waitForFirstFrame(mainWindow.webContents);
  const trustedUrl = mainWindow.webContents.getURL();
  const results = [];

  for (const navigationCase of NAVIGATION_CASES) {
    try {
      await executeFunction(
        mainWindow.webContents,
        ({ kind, url }) => {
          if (kind === 'assign') window.location.assign(url);
          else if (kind === 'href') window.location.href = url;
          else if (kind === 'replace') window.location.replace(url);
          else if (kind === 'anchor') {
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.textContent = 'navigation-smoke';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
          } else if (kind === 'iframe') {
            const frame = document.createElement('iframe');
            frame.src = url;
            document.body.appendChild(frame);
            window.setTimeout(() => frame.remove(), 200);
          }
        },
        navigationCase
      );
    } catch {
      // If navigation unexpectedly wins, the URL comparison below records failure.
    }
    await delay(350);
    results.push({
      name: navigationCase.name,
      survived: mainWindow.webContents.getURL() === trustedUrl,
    });
    if (mainWindow.webContents.getURL() !== trustedUrl) break;
  }

  const stats = getSecurityStats();
  finish(app, {
    phase: 'navigation',
    ok:
      firstFrameReady &&
      results.length === NAVIGATION_CASES.length &&
      results.every((entry) => entry.survived) &&
      stats.externalAllowed >= 1 &&
      stats.navigationBlocked >= NAVIGATION_CASES.length &&
      stats.frameNavigationBlocked >= 1,
    firstFrameReady,
    results,
    security: stats,
  });
}

async function runExternalLinks(mainWindow, app, getSecurityStats) {
  const firstFrameReady = await waitForFirstFrame(mainWindow.webContents);
  const trustedUrl = mainWindow.webContents.getURL();
  await executeFunction(mainWindow.webContents, () => {
    const click = (url) => {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    };
    click('https://santiagorodriguez.com');
    click('https://example.com');
    click('file:///tmp/pikachu-volleyball');
    click('https://github.com/santirodriguez/pikachu-volleyball/issues');
  });
  await delay(750);
  const stats = getSecurityStats();
  finish(app, {
    phase: 'external-links',
    ok:
      firstFrameReady &&
      mainWindow.webContents.getURL() === trustedUrl &&
      stats.windowOpenDenied >= 4 &&
      stats.externalAllowed >= 1 &&
      stats.externalRejected >= 3 &&
      stats.externalLaunchSucceeded >= 1,
    firstFrameReady,
    security: stats,
  });
}

async function runQuit(mainWindow) {
  const firstFrameReady = await waitForFirstFrame(mainWindow.webContents);
  const bridgeReady = await executeFunction(mainWindow.webContents, () =>
    Boolean(
      window.pvDesktop?.isDesktop === true &&
        window.pvDesktop?.runtime === 'electron' &&
        typeof window.pvDesktop?.quit === 'function'
    )
  );
  console.error(
    `PV_ELECTRON_QUIT_READY firstFrameReady=${firstFrameReady} bridgeReady=${bridgeReady}`
  );
  if (!firstFrameReady || !bridgeReady) return;
  await executeFunction(mainWindow.webContents, () => window.pvDesktop.quit());
}

async function runSmoke({ mode, mainWindow, app, distRoot, getSecurityStats }) {
  try {
    if (mode === 'write') return await runWrite(mainWindow, app);
    if (mode === 'read') return await runRead(mainWindow, app);
    if (mode === 'keyboard') return await runKeyboard(mainWindow, app);
    if (mode === 'window') return await runWindow(mainWindow, app);
    if (mode === 'locales') return await runLocales(mainWindow, app, distRoot);
    if (mode === 'navigation') {
      return await runNavigation(mainWindow, app, getSecurityStats);
    }
    if (mode === 'external-links') {
      return await runExternalLinks(mainWindow, app, getSecurityStats);
    }
    if (mode === 'quit') return await runQuit(mainWindow);
    throw new Error(`Unsupported Electron smoke mode: ${mode}`);
  } catch (error) {
    finish(app, {
      phase: mode,
      ok: false,
      error: String(error?.stack || error),
    });
  }
}

module.exports = Object.freeze({ runSmoke });
