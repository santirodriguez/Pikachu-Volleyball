'use strict';

(() => {
  const neutralino = window.Neutralino;
  const params = new URLSearchParams(window.location.search);
  const args = Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [];
  const getArg = (name) => {
    const prefix = `--${name}=`;
    const entry = args.find((arg) => arg.startsWith(prefix));
    return entry ? entry.slice(prefix.length) : null;
  };
  const phase = getArg('dev-pv-smoke-phase') || params.get('neutralinoSmoke');
  const holdMs = Math.max(
    0,
    Math.min(
      Number(
        getArg('dev-pv-smoke-hold-ms') || params.get('neutralinoSmokeHoldMs')
      ) || 0,
      5000
    )
  );
  const startEpochMs = Number(
    getArg('dev-pv-smoke-start-epoch-ms') || params.get('startEpochMs')
  );
  const persistenceKey = 'pv-neutralino-spike-persistence';
  const persistenceValue = 'phase1-v1';
  const pixiResolution = 2;
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
    const write = neutralino.app
      .writeProcessOutput(`PV_NEUTRALINO_SMOKE ${JSON.stringify(report)}\n`)
      .catch(() => {});
    await Promise.race([write, delay(500)]);
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

  function readSettingState(name, storageKey) {
    const control = document.querySelector(`[data-setting="${name}"]`);
    return {
      control,
      value: control?.dataset.value || null,
      stored: localStorage.getItem(storageKey),
    };
  }

  async function cycleSettingAndWait(name, storageKey) {
    const before = readSettingState(name, storageKey);
    if (!before.control || !before.value) {
      return { ok: false, before: before.value, value: before.value };
    }

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

    const audioNav = document.querySelector('[data-nav-id="audio"]');
    audioNav?.click();
    const audioPanelReady = await waitFor(
      () =>
        Boolean(document.querySelector('[data-setting="bgm"]')) &&
        Boolean(document.querySelector('[data-setting="sfx"]'))
    );
    if (!audioPanelReady) {
      window.removeEventListener('pv-pause-changed', onPause);
      return { ok: false, reason: 'audio-panel-did-not-render', pauseStates };
    }

    const originalBgm = readSettingState('bgm', 'pv-offline-bgm').value;
    const changedBgmResult = await cycleSettingAndWait('bgm', 'pv-offline-bgm');
    const restoredBgmResult = await cycleSettingAndWait('bgm', 'pv-offline-bgm');
    const changedBgm = changedBgmResult.value;
    const restoredBgm = restoredBgmResult.value;

    const originalSfx = readSettingState('sfx', 'pv-offline-sfx').value;
    const sfxSequence = [];
    let sfxCyclesOk = true;
    for (let index = 0; index < 3; index += 1) {
      const result = await cycleSettingAndWait('sfx', 'pv-offline-sfx');
      sfxCyclesOk = sfxCyclesOk && result.ok;
      sfxSequence.push(result.value);
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
        opened &&
        audioPanelReady &&
        closed &&
        pauseStates.includes(true) &&
        pauseStates.includes(false) &&
        changedBgmResult.ok &&
        restoredBgmResult.ok &&
        changedBgm !== originalBgm &&
        restoredBgm === originalBgm &&
        sfxCyclesOk &&
        restoredSfx === originalSfx,
      opened,
      audioPanelReady,
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
    const locales = ['en', 'es-ar', 'ca', 'ko', 'z'WNÂˆ™]\›ˆ›ÛZ\ÙK˜[
ˆØØ[\Ë›X\
\Ş[˜È
ØØ[JHOˆÂˆHÂˆÛÛœİ™\ÜÛœÙHH]ØZ]™]Ú
ÉÛØØ[_KÚ[™^š[Ù\ÚİÜLXÂˆØXÚNˆ	Û›Ë\İÜ™IËˆJNÂˆÛÛœİ^H]ØZ]™\ÜÛœÙK^

NÂˆ™]\›ˆÂˆØØ[KˆÚÎˆ™\ÜÛœÙK›ÚÈ	‰ˆ^›[™İˆLˆİ]\Îˆ™\ÜÛœÙKœİ]\ËˆNÂˆHØ]Ú
\œ›ÜŠHÂˆ™]\›ˆÈØØ[KÚÎˆ˜[ÙK\œ›Üˆİš[™Ê\œ›ÜŠHNÂˆBˆJBˆ
NÂˆB‚ˆ\Ş[˜È[˜İ[Ûˆ[”™XY›Ø™J
HÂˆÛÛœİš\œİœ˜[YT™XYHH]ØZ]ØZ]›ÜŠˆ

HOˆ\™›Ü›X[˜ÙK™Ù][šY\ĞS˜[YJ	Ü‹Yš\œİYØ[YKYœ˜[YIÊK›[™İˆˆ
NÂˆÛÛœİš\œİœ˜[YHH\™›Ü›X[˜ÙK™Ù][šY\ĞS˜[YJ	Ü‹Yš\œİYØ[YKYœ˜[YIÊVÌNÂˆÛÛœİ›ØÙ\ÜÔİ\Ñš\œİœ˜[YP\›Ş\ÈBˆš\œİœ˜[YH	‰ˆ[X™\‹š\Ñš[š]Jİ\\ØÚ\ÊBˆÈ[X™\Šˆ
ˆ\™›Ü›X[˜ÙK[YSÜšYÚ[ˆ
Âˆš\œİœ˜[YKœİ\[YHBˆİ\\ØÚ\Âˆ
KÑš^Y
ŠBˆ
Bˆˆ[Â‚ˆÛÛœİØ[˜\ÈHØİ[Y[™Ù][[Y[RY
	ÙØ[YKXØ[˜\ÉÊNÂˆÛÛœİØ[˜\Ô™XİHØ[˜\ÏË™Ù]›İ[™[™ĞÛY[™Xİ

NÂˆÛÛœİ˜XÚÚ[™ÕÚYHØ[˜\ÏËÚY[ÂˆÛÛœİ˜XÚÚ[™ÒZYÚHØ[˜\ÏËšZYÚ[ÂˆÛÛœİÙÚXØ[ÚYH˜XÚÚ[™ÕÚYÈ˜XÚÚ[™ÕÚYÈ^T™\ÛÛ][Ûˆˆ[ÂˆÛÛœİÙÚXØ[ZYÚH˜XÚÚ[™ÒZYÚÈ˜XÚÚ[™ÒZYÚÈ^T™\ÛÛ][Ûˆˆ[ÂˆÛÛœİÜÜÕÚYHØ[˜\Ô™XİÈ[X™\ŠØ[˜\Ô™XİÚYÑš^Y
ŠJHˆ[ÂˆÛÛœİÜÜÒZYÚHØ[˜\Ô™XİÈ[X™\ŠØ[˜\Ô™XİšZYÚÑš^Y
ŠJHˆ[ÂˆÛÛœİØ[˜\ÓÚÈH›ÛÛX[ŠˆØ[˜\È	‰‚ˆØ[˜\ËYÓ˜[YHOOH	ĞĞS•TÉÈ	‰‚ˆÙÚXØ[ÚYOOHÌˆ	‰‚ˆÙÚXØ[ZYÚOOHÌ	‰‚ˆ˜XÚÚ[™ÕÚYOOH	‰‚ˆ˜XÚÚ[™ÒZYÚOOHŒˆ
NÂˆÛÛœİ\œÚ\İ[˜ÙSÚÈBˆØØ[İÜ˜YÙK™Ù]][J\œÚ\İ[˜ÙRÙ^JHOOH\œÚ\İ[˜ÙU˜[YNÂˆÛÛœİ]\ÙP[™Ù][™ÜÈH]ØZ]›Ø™T]\ÙP[™]Y[ÔÙ][™ÜÊ
NÂˆÛÛœİ™\İ\H]ØZ]›Ø™T™\İ\

NÂˆÛÛœİ™ÛHH]ØZ]›Ø™SYYXJˆ	Ë‹‹Ü™\Ûİ\˜Ù\ËØ\ÜÙ]ËÜÛİ[™ËØ™ÛK›\ÉËˆ	Ø]Y[ËÛ\YÉÂˆ
NÂˆÛÛœİØ]ˆH]ØZ]›Ø™SYYXJˆ	Ë‹‹Ü™\Ûİ\˜Ù\ËØ\ÜÙ]ËÜÛİ[™ËÕĞU‘LMWÌKØ]‰Ëˆ	Ø]Y[ËİØ]‰Âˆ
NÂˆÛÛœİØØ[\ÈH]ØZ]›Ø™SØØ[\Ê
NÂˆÛÛœİØØ[\ÓÚÈHØØ[\Ë™]™\J
[JHOˆ[K›ÚÊNÂ‚ˆÛÛœİ™\ÜHÂˆ\ÙNˆ	Ü™XY	ËˆÚÎ‚ˆš\œİœ˜[YT™XYH	‰‚ˆØ[˜\ÓÚÈ	‰‚ˆ\œÚ\İ[˜ÙSÚÈ	‰‚ˆ]\ÙP[™Ù][™ÜË›ÚÈ	‰‚ˆ™\İ\›ÚÈ	‰‚ˆ™ÛK›ØYY	‰‚ˆØ]‹›ØYY	‰‚ˆØØ[\ÓÚËˆš\œİœ˜[YT™XYKˆš\œİœ˜[YT™[™\™\“\Îˆš\œİœ˜[YBˆÈ[X™\Šš\œİœ˜[YKœİ\[YKÑš^Y
ŠJBˆˆ[ˆ›ØÙ\ÜÔİ\Ñš\œİœ˜[YP\›Ş\ËˆØ[˜\ÎˆÂˆÚÎˆØ[˜\ÓÚËˆÙÚXØ[ÚYˆÙÚXØ[ZYÚˆ˜XÚÚ[™ÕÚYˆ˜XÚÚ[™ÒZYÚˆÜÜÕÚYˆÜÜÒZYÚˆ^T™\ÛÛ][Û‹ˆKˆ\œÚ\İ[˜ÙSÚËˆ]\ÙP[™Ù][™ÜËˆ™\İ\ˆYYXNˆÈ™ÛKØ]ˆKˆØØ[\ËˆNÂ‚ˆ]ØZ]Üš]T™\Ü
™\Ü
NÂˆB‚ˆ\Ş[˜È[˜İ[Ûˆ[’Ù^X›Ø\™›Ø™J
HÂˆÛÛœİš\œİœ˜[YT™XYHH]ØZ]ØZ]›ÜŠˆ

HOˆ\™›Ü›X[˜ÙK™Ù][šY\ĞS˜[YJ	Ü‹Yš\œİYØ[YKYœ˜[YIÊK›[™İˆˆ
NÂˆ]ØZ][^JÍL
NÂˆÛÛœİ^XİYÛÙ\ÈHÉÒÙ^Q	Ë	ÒÙ^T‰Ë	Ğ\œ›İÔšYÚ	Ë	Ğ\œ›İÕ\	×NÂˆÛÛœİÙY[ÛÙ\ÈHË‹‹šÙ^X›Ø\™›Ø™KœÙY[—KœÛÜ

NÂˆÛÛœİ^XİYÙY[ˆH^XİYÛÙ\Ë™]™\J
ÛÙJHO‚ˆÙ^X›Ø\™›Ø™KœÙY[‹š\ÊÛÙJBˆ
NÂˆÛÛœİ™\ÜHÂˆ\ÙNˆ	ÚÙ^X›Ø\™	ËˆÚÎ‚ˆš\œİœ˜[YT™XYH	‰‚ˆ^XİYÙY[ˆ	‰‚ˆÙ^X›Ø\™›Ø™K›X^Ú[][[™[İ\ÈH^XİYÛÙ\Ë›[™İ	‰‚ˆÙ^X›Ø\™›Ø™K\İY]™[ÈH^XİYÛÙ\Ë›[™İ
ˆ‹ˆš\œİœ˜[YT™XYKˆ^XİYÛÙ\ËˆÙY[ÛÙ\Ëˆ\İY]™[ÎˆÙ^X›Ø\™›Ø™K\İY]™[ËˆX^Ú[][[™[İ\ÎˆÙ^X›Ø\™›Ø™K›X^Ú[][[™[İ\ËˆÙ^\Ô™[X\ÙYˆÙ^X›Ø\™›Ø™K™İÛ‹œÚ^™HOOHˆNÂˆ]ØZ]Üš]T™\Ü
™\Ü
NÂˆB‚ˆ\Ş[˜È[˜İ[Ûˆ[”]Z]›Ø™J
HÂˆÛÛœİœšYÙP]˜Z[X›HH›ÛÛX[ŠˆÚ[™İËœ‘\ÚİÜËš\Ñ\ÚİÜ	‰‚ˆÚ[™İËœ‘\ÚİÜËœ[[YHOOH	Û™]]˜[[›ÉÈ	‰‚ˆ\[ÙˆÚ[™İËœ‘\ÚİÜËœ]Z]OOH	Ù[˜İ[Û‰Âˆ
NÂˆÛÛœÛÛK™\œ›ÜŠˆ—Ó‘UUSS“×ÔURUÔ‘PQHœšYÙP]˜Z[X›OIØœšYÙP]˜Z[X›HÈ	İYIÈˆ	Ù˜[ÙIßXˆ
NÂˆYˆ
XœšYÙP]˜Z[X›JH™]\›Â‚ˆ]ØZ][^JX]›X^
Û\ËL
JNÂˆÛÛœÛÛK™\œ›ÜŠ	Ô—Ó‘UUSS“×ÔURUĞĞSœšYÙO\™X[	ÊNÂˆ]ØZ][^JL
NÂˆ]ØZ]Ú[™İËœ‘\ÚİÜœ]Z]

NÂˆB‚ˆ\Ş[˜È[˜İ[Ûˆ™\Ü˜Z[\™J\œ›ÜŠHÂˆÛÛœİ]Z[Hİš[™Ê\œ›ÜËœİXÚÈ\œ›ÜŠNÂˆYˆ
\ÙHOOH	Ü]Z]	ÊHÂˆÛÛœÛÛK™\œ›ÜŠ—Ó‘UUSS“×ÔURUÑT”“Ôˆ	Ù]Z[X
NÂˆ™]\›ÂˆBˆ]ØZ]Üš]T™\Ü
È\ÙKÚÎˆ˜[ÙK\œ›Üˆ]Z[JNÂˆB‚ˆ\Ş[˜È[˜İ[Ûˆ[Š
HÂˆYˆ
\ÙHOOH	İÜš]IÊHÂˆØØ[İÜ˜YÙKœÙ]][J\œÚ\İ[˜ÙRÙ^K\œÚ\İ[˜ÙU˜[YJNÂˆ]ØZ][^JL
NÂˆ]ØZ]Üš]T™\Ü
Âˆ\ÙNˆ	İÜš]IËˆÚÎˆØØ[İÜ˜YÙK™Ù]][J\œÚ\İ[˜ÙRÙ^JHOOH\œÚ\İ[˜ÙU˜[YKˆJNÂˆ™]\›ÂˆB‚ˆYˆ
\ÙHOOH	Ü™XY	ÊHÂˆHÂˆ]ØZ][”™XY›Ø™J
NÂˆHØ]Ú
\œ›ÜŠHÂˆ]ØZ]™\Ü˜Z[\™J\œ›ÜŠNÂˆBˆ™]\›ÂˆB‚ˆYˆ
\ÙHOOH	ÚÙ^X›Ø\™	ÊHÂˆHÂˆ]ØZ][’Ù^X›Ø\™›Ø™J
NÂˆHØ]Ú
\œ›ÜŠHÂˆ]ØZ]™\Ü˜Z[\™J\œ›ÜŠNÂˆBˆ™]\›ÂˆB‚ˆYˆ
\ÙHOOH	Ü]Z]	ÊHÂˆHÂˆ]ØZ][”]Z]›Ø™J
NÂˆHØ]Ú
\œ›ÜŠHÂˆ]ØZ]™\Ü˜Z[\™J\œ›ÜŠNÂˆBˆBˆB‚ˆ[˜İ[Ûˆİ\

HÂˆ[Š
K˜Ø]Ú

\œ›ÜŠHOˆÂˆ™\Ü˜Z[\™J\œ›ÜŠK˜Ø]Ú


HOˆßJNÂˆJNÂˆB‚ˆYˆ
\ÙHOOH	Ü]Z]	ÈØİ[Y[œ™XYTİ]HOOH	ØÛÛ\]IÊHÂˆİ\

NÂˆH[ÙHÂˆÚ[™İË˜Y]™[\İ[™\Š	ÛØY	Ëİ\ÈÛ˜ÙNˆYHJNÂˆBŸJJ
NÂ