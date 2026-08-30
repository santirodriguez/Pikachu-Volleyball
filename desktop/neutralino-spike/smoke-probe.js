'use strict';

(() => {
  const neutralino = window.Neutralino;
  const params = new URLSearchParams(window.location.search);
  const phase = params.get('neutralinoSmoke');
  const persistenceKey = 'pv-neutralino-spike-persistence';
  const persistenceValue = 'phase1-v1';
  const keyboardProbe = {
    down: new Set(),
    seen: new Set(),
    trustedEvents: 0,
    maxSimultaneous: 0,
  };

  if (!neutralino || !phase) return;

  if (phase === 'keyboard') {
    window.addEventListener(
      'keydown',
      (event) => {
        keyboardProbe.down.add(event.code);
        keyboardProbe.seen.add(event.code);
        if (event.isTrusted) keyboardProbe.trustedEvents += 1;
        keyboardProbe.maxSimultaneous = Math.max(
          keyboardProbe.maxSimultaneous,
          keyboardProbe.down.size
        );
      },
      true
    );
    window.addEventListener(
      'keyup',
      (event) => {
        keyboardProbe.seen.add(event.code);
        if (event.isTrusted) keyboardProbe.trustedEvents += 1;
        keyboardProbe.down.delete(event.code);
      },
      true
    );
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function waitFor(predicate, timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (predicate()) return true;
      await delay(25);
    }
    return false;
  }

  async function writeReport(report) {
    await neutralino.app.writeProcessOutput(
      `PV_NEUTRALINO_SMOKE ${JSON.stringify(report)}\n`
    );
  }

  async function finish(report, exitCode = 0) {
    await writeReport(report);
    const holdMs = Math.max(
      0,
      Math.min(Number(params.get('neutralinoSmokeHoldMs')) || 0, 5000)
    );
    if (holdMs > 0) await delay(holdMs);
    await neutralino.app.exit(exitCode);
  }

  function dispatchKey(code, type) {
    window.dispatchEvent(
      new KeyboardEvent(type, {
        code,
        bubbles: true,
        cancelable: true,
      })
    );
  }

  async function openPauseMenu() {
    dispatchKey('KeyP', 'keydown');
    dispatchKey('KeyP', 'keyup');
    return waitFor(() => {
      const overlay = document.getElementById('pv-menu-overlay');
      return Boolean(overlay && !overlay.hidden);
    });
  }

  async function probeMedia(relativeUrl, mimeType) {
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
    const result = {
      loaded,
      canPlayType,
      readyState: audio.readyState,
      duration: Number.isFinite(audio.duration)
        ? Number(audio.duration.toFixed(3))
        : null,
    };
    audio.removeAttribute('src');
    audio.load();
    return result;
  }

  async function probePauseAndAudioSettings() {
    const pauseStates = [];
    const onPause = (event) => pauseStates.push(Boolean(event.detail?.paused));
    window.addEventListener('pv-pause-changed', onPause);

    const opened = await openPauseMenu();
    if (!opened) {
      window.removeEventListener('pv-pause-changed', onPause);
      return { ok: false, reason: 'pause-menu-did-not-open', pauseStates };
    }

    document.querySelector('[data-nav-id="audio"]')?.click();
    await delay(50);

    const originalBgm = localStorage.getItem('pv-offline-bgm') || 'on';
    document.querySelector('[data-setting="bgm"]')?.click();
    await delay(25);
    const changedBgm = localStorage.getItem('pv-offline-bgm') || 'on';
    document.querySelector('[data-setting="bgm"]')?.click();
    await delay(25);
    const restoredBgm = localStorage.getItem('pv-offline-bgm') || 'on';

    const originalSfx = localStorage.getItem('pv-offline-sfx') || 'stereo';
    const sfxSequence = [];
    for (let index = 0; index < 3; index += 1) {
      document.querySelector('[data-setting="sfx"]')?.click();
      await delay(25);
      sfxSequence.push(localStorage.getItem('pv-offline-sfx') || 'stereo');
    }
    const restoredSfx = localStorage.getItem('pv-offline-sfx') || 'stereo';

    document.querySelector('[data-nav-id="continue"]')?.click();
    const closed = await waitFor(() => {
      const overlay = document.getElementById('pv-menu-overlay');
      return Boolean(overlay?.hidden);
    });
    window.removeEventListener('pv-pause-changed', onPause);

    return {
      ok:
        opened &&
        closed &&
        pauseStates.includes(true) &&
        pauseStates.includes(false) &&
        changedBgm !== originalBgm &&
        restoredBgm === originalBgm &&
        restoredSfx === originalSfx,
      opened,
      closed,
      pauseStates,
      bgm: { original: originalBgm, changed: changedBgm, restored: restoredBgm },
      sfx: { original: originalSfx, sequence: sfxSequence, restored: restoredSfx },
    };
  }

  async function probeRestart() {
    const pauseStates = [];
    const onPause = (event) => pauseStates.push(Boolean(event.detail?.paused));
    window.addEventListener('pv-pause-changed', onPause);

    const opened = await openPauseMenu();
    if (!opened) {
      window.removeEventListener('pv-pause-changed', onPause);
      return { ok: false, reason: 'restart-menu-did-not-open', pauseStates };
    }

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
      opened,
      confirmationVisible,
      closed,
      pauseStates,
    };
  }

  async function probeLocales() {
    const locales = ['en', 'es-ar', 'ca', 'ko', 'zh'];
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const response = await fetch(`/${locale}/index.html?desktop=1`, {
            cache: 'no-store',
          });
          const text = await response.text();
          return {
            locale,
            ok: response.ok && text.length > 1000,
            status: response.status,
          };
        } catch (error) {
          return { locale, ok: false, error: String(error) };
        }
      })
    );
  }

  async function runReadProbe() {
    const firstFrameReady = await waitFor(
      () => performance.getEntriesByName('pv-first-game-frame').length > 0
    );
    const firstFrame = performance.getEntriesByName('pv-first-game-frame')[0];
    const startEpochMs = Number(params.get('startEpochMs'));
    const processStartToFirstFrameApproxMs =
      firstFrame && Number.isFinite(startEpochMs)
        ? Number(
            (
              performance.timeOrigin +
              firstFrame.startTime -
              startEpochMs
            ).toFixed(2)
          )
        : null;

    const canvas = document.getElementById('game-canvas');
    const canvasOk = Boolean(
      canvas &&
        canvas.tagName === 'CANVAS' &&
        canvas.width === 432 &&
        canvas.height === 304
    );
    const persistenceOk =
      localStorage.getItem(persistenceKey) === persistenceValue;
    const pauseAndSettings = await probePauseAndAudioSettings();
    const restart = await probeRestart();
    const bgm = await probeMedia(
      '../resources/assets/sounds/bgm.mp3',
      'audio/mpeg'
    );
    const wav = await probeMedia(
      '../resources/assets/sounds/WAVE145_1.wav',
      'audio/wav'
    );
    const locales = await probeLocales();
    const localesOk = locales.every((entry) => entry.ok);

    const report = {
      phase: 'read',
      ok:
        firstFrameReady &&
        canvasOk &&
        persistenceOk &&
        pauseAndSettings.ok &&
        restart.ok &&
        bgm.loaded &&
        wav.loaded &&
        localesOk,
      firstFrameReady,
      firstFrameRendererMs: firstFrame
        ? Number(firstFrame.startTime.toFixed(2))
        : null,
      processStartToFirstFrameApproxMs,
      canvas: {
        ok: canvasOk,
        width: canvas?.width || null,
        height: canvas?.height || null,
      },
      persistenceOk,
      pauseAndSettings,
      restart,
      media: { bgm, wav },
      locales,
    };

    await finish(report, report.ok ? 0 : 1);
  }

  async function runKeyboardProbe() {
    const firstFrameReady = await waitFor(
      () => performance.getEntriesByName('pv-first-game-frame').length > 0
    );
    await delay(3500);
    const expectedCodes = ['KeyD', 'KeyR', 'ArrowRight', 'ArrowUp'];
    const seenCodes = [...keyboardProbe.seen].sort();
    const expectedSeen = expectedCodes.every((code) =>
      keyboardProbe.seen.has(code)
    );
    const report = {
      phase: 'keyboard',
      ok:
        firstFrameReady &&
        expectedSeen &&
        keyboardProbe.maxSimultaneous >= expectedCodes.length &&
        keyboardProbe.trustedEvents >= expectedCodes.length * 2,
      firstFrameReady,
      expectedCodes,
      seenCodes,
      trustedEvents: keyboardProbe.trustedEvents,
      maxSimultaneous: keyboardProbe.maxSimultaneous,
      keysReleased: keyboardProbe.down.size === 0,
    };
    await finish(report, report.ok ? 0 : 1);
  }

  async function runQuitProbe() {
    const bridgeAvailable = Boolean(
      window.pvDesktop?.isDesktop && typeof window.pvDesktop?.quit === 'function'
    );
    await writeReport({ phase: 'quit', ok: bridgeAvailable, bridgeAvailable });
    if (!bridgeAvailable) {
      await neutralino.app.exit(1);
      return;
    }
    await window.pvDesktop.quit();
  }

  async function run() {
    if (phase === 'write') {
      localStorage.setItem(persistenceKey, persistenceValue);
      await finish({
        phase: 'write',
        ok: localStorage.getItem(persistenceKey) === persistenceValue,
      });
      return;
    }

    if (phase === 'read') {
      try {
        await runReadProbe();
      } catch (error) {
        await finish(
          { phase: 'read', ok: false, error: String(error?.stack || error) },
          1
        );
      }
      return;
    }

    if (phase === 'keyboard') {
      try {
        await runKeyboardProbe();
      } catch (error) {
        await finish(
          { phase: 'keyboard', ok: false, error: String(error?.stack || error) },
          1
        );
      }
      return;
    }

    if (phase === 'quit') {
      try {
        await runQuitProbe();
      } catch (error) {
        await finish(
          { phase: 'quit', ok: false, error: String(error?.stack || error) },
          1
        );
      }
    }
  }

  function start() {
    run().catch((error) => {
      finish({ phase, ok: false, error: String(error?.stack || error) }, 1);
    });
  }

  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start, { once: true });
  }
})();
