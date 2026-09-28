'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const menuLogicModule = require('../src/resources/js/menu_logic.cjs');
const controlBindingsModule = require('../src/resources/js/control_bindings.cjs');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function loadMenuStrings() {
  const source = read('src/resources/js/integrated_menu_strings.js')
    .replace(/\bexport\s+const\s+/g, 'const ')
    .replace(/\bexport\s+function\s+/g, 'function ');
  return new Function(
    `${source}; return { PRODUCT_NAME, getIntegratedMenuStrings };`
  )();
}

function loadNativeMenuState() {
  const strings = loadMenuStrings();
  const source = read('src/resources/js/native_menu_state.js')
    .replace(/^import .*$/gm, '')
    .replace(/\bexport\s+const\s+/g, 'const ')
    .replace(/\bexport\s+function\s+/g, 'function ');
  return new Function(
    'menuLogicModule',
    'controlBindingsModule',
    'PRODUCT_NAME',
    'getIntegratedMenuStrings',
    `${source}; return { createNativeMenuState };`
  )(
    menuLogicModule,
    controlBindingsModule,
    strings.PRODUCT_NAME,
    strings.getIntegratedMenuStrings
  );
}

function createCommands() {
  let settings = {
    winningScore: '15',
    speed: 'medium',
    practiceMode: false,
    graphic: 'sharp',
    colorScheme: 'light',
    bgm: 'on',
    sfx: 'stereo',
    controlBindings: { ...controlBindingsModule.DEFAULT_CONTROL_BINDINGS },
    controlDefinitions: controlBindingsModule.CONTROL_BINDING_DEFINITIONS.map(
      (definition) => ({ ...definition })
    ),
  };
  const events = {
    restarted: 0,
    quit: 0,
    persistedLocales: [],
  };

  return {
    events,
    api: {
      setPaused() {},
      resetInputs() {},
      restartMatch() {
        events.restarted += 1;
      },
      restartForLocale() {
        events.restarted += 1;
      },
      getSettings() {
        return {
          ...settings,
          controlBindings: { ...settings.controlBindings },
        };
      },
      setSetting(name, value) {
        settings[name] = value;
        return true;
      },
      setWinningScore(value) {
        settings.winningScore = value;
        return { ok: true };
      },
      setPracticeMode(value) {
        settings.practiceMode = value;
        return true;
      },
      previewControlBinding() {
        return { ok: true };
      },
      setControlBinding() {
        return { ok: true };
      },
      resetControlBindingScope() {
        return { ok: true };
      },
      resetDefaults() {
        return true;
      },
      isMatchInProgress() {
        return false;
      },
      requestPlatformCommand(command) {
        if (command.type === 'quit') events.quit += 1;
        return true;
      },
      persistLocale(locale) {
        events.persistedLocales.push(locale);
        return true;
      },
    },
  };
}

test('native menu Phase 2 keeps pointer selection, hover and destructive confirmation safe', () => {
  const { createNativeMenuState } = loadNativeMenuState();
  const commands = createCommands();
  const menu = createNativeMenuState(commands.api, 'en');

  let frame = menu.getFrame();
  assert.equal(frame.visible, false);
  assert.equal(frame.trigger.kind, 'trigger');

  menu.handlePointer(frame.trigger.x + 1, frame.trigger.y + 1, false);
  assert.equal(menu.isVisible(), false);
  assert.equal(menu.getFrame().trigger.hovered, true);

  menu.handlePointer(frame.trigger.x + 1, frame.trigger.y + 1, true);
  assert.equal(menu.isVisible(), true);

  frame = menu.getFrame();
  const restartNav = frame.navItems.find((item) => item.navId === 'restart');
  menu.handlePointer(restartNav.x + 2, restartNav.y + 2, true);
  frame = menu.getFrame();
  assert.equal(frame.modal, null);
  assert.equal(
    frame.navItems.find((item) => item.navId === 'restart').selected,
    true
  );

  const restartAction = frame.panelItems.find(
    (item) => item.id === 'action:restart'
  );
  assert.ok(restartAction);
  menu.handlePointer(restartAction.x + 2, restartAction.y + 2, true);
  frame = menu.getFrame();
  assert.equal(
    frame.modal.items.find((item) => item.id === 'modal:cancel').focused,
    true
  );

  menu.handleKey('Enter', true, true);
  assert.ok(menu.getFrame().modal);
  assert.equal(commands.events.restarted, 0);

  menu.handleKey('Tab', true, false, true);
  assert.equal(
    menu.getFrame().modal.items.find((item) => item.id === 'modal:accept')
      .focused,
    true
  );

  menu.handleKey('Escape', true, false);
  assert.equal(menu.getFrame().mode, 'panel');
  assert.equal(menu.getFrame().panelItems[0].focused, true);

  menu.handleKey('Escape', true, false);
  assert.equal(menu.getFrame().mode, 'nav');

  menu.handleKey('Enter', true, false);
  assert.ok(menu.getFrame().modal);
  menu.handleKey('Enter', true, true);
  assert.ok(menu.getFrame().modal);
  assert.equal(commands.events.restarted, 0);
  menu.handleKey('Escape', true, false);
  assert.equal(menu.getFrame().mode, 'nav');
});

test('native menu Phase 2 persists locale, localizes About and shares modal bounds', () => {
  const { createNativeMenuState } = loadNativeMenuState();
  const commands = createCommands();
  const menu = createNativeMenuState(commands.api, 'en');

  assert.equal(menu.setLocale('ca'), true);
  assert.equal(menu.getLocale(), 'ca');
  assert.equal(commands.events.persistedLocales.at(-1), 'ca');

  menu.open();
  for (let index = 0; index < 6; index += 1) {
    menu.handleKey('ArrowDown', true, false);
  }
  const about = menu.getFrame();
  assert.ok(
    about.panelItems.some(
      (item) =>
        item.id === 'link:reverse' &&
        item.label.includes('Reimplementació')
    )
  );

  menu.close();
  const trigger = menu.getFrame().trigger;
  assert.equal(
    menu.handleAccessibilityAction(trigger.nodeId, 'click'),
    true
  );

  const restart = menu
    .getFrame()
    .navItems.find((item) => item.navId === 'restart');
  menu.handleAccessibilityAction(restart.nodeId, 'click');
  assert.equal(menu.getFrame().modal, null);

  const restartAction = menu
    .getFrame()
    .panelItems.find((item) => item.id === 'action:restart');
  menu.handleAccessibilityAction(restartAction.nodeId, 'click');
  const modal = menu.getFrame().modal;
  assert.deepEqual(
    { x: modal.x, y: modal.y, width: modal.width, height: modal.height },
    { x: 80, y: 89, width: 272, height: 132 }
  );
});

test('Web Phase 2 contracts expose contained focus, live status and visible lazy-load recovery', () => {
  const menu = read('src/resources/js/integrated_menu.js');
  const launcher = read('src/resources/js/integrated_menu_launcher.js');
  const main = read('src/resources/js/main.js');
  const accessibility = read('desktop/native/native_accessibility.c');
  const host = read('desktop/native/native_main.c');
  const validator = read('scripts/validate-phase5-production-accessibility.py');

  assert.match(menu, /shouldActivateMenuConfirm\(event\.code, event\.repeat\)/);
  assert.match(menu, /menuTabDirection\(event\.shiftKey\)/);
  assert.match(menu, /data-command="back"/);
  assert.match(menu, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(menu, /aria-labelledby="pv-menu-modal-title"/);
  assert.match(menu, /aria-describedby="pv-menu-modal-message"/);
  assert.match(menu, /setBackgroundInert\(true\)/);
  assert.match(menu, /interactionBlocked\(\)/);
  assert.match(menu, /scrollIntoView/);

  assert.match(launcher, /pv-menu-launcher-status/);
  assert.match(launcher, /strings\.launcherError/);
  assert.match(launcher, /trigger\.focus\(\)/);

  assert.doesNotMatch(main, /phase3-menu\.css/);
  assert.match(accessibility, /snapshot->modal_bounds/);
  assert.match(accessibility, /build_item_node\(&snapshot->items\[index\]\)/);
  assert.match(host, /SDL_EVENT_MOUSE_MOTION/);
  assert.match(validator, /require_single\("P · MENU"\)/);
  assert.match(validator, /require_single\("Restart now"\)/);
});

test('Phase 2 resolves the targeted locale shell gaps', () => {
  const strings = read('src/resources/js/integrated_menu_strings.js');
  const spanish = read('src/es-ar/index.html');
  const catalan = read('src/ca/index.html');
  const chinese = read('src/zh/index.html');

  assert.match(strings, /Presioná Golpe fuerte para una revancha rápida/);
  assert.match(strings, /Retomá exactamente el partido/);
  assert.match(strings, /Cerrá el AppImage y volvé/);
  assert.match(strings, /Prem Cop potent per jugar una revenja ràpida/);
  assert.match(strings, /按下强力击球键可快速再来一局/);

  assert.match(spanish, /Jugá a Pikachu Volleyball en la web o en Linux/);
  assert.match(spanish, /Si visitás directamente/);
  assert.match(spanish, /¿Querés actualizar ahora\?/);

  assert.match(catalan, /Sembla que estàs jugant aquesta versió web/);
  assert.match(catalan, /Prem Cop potent per jugar una revenja ràpida/);
  assert.doesNotMatch(catalan, /It seems that you are playing this web version/);

  assert.match(chinese, /在线玩皮卡丘排球/);
  assert.match(chinese, /看起来你正在其他网站上游玩/);
  assert.match(chinese, /正在加载游戏资源/);
  assert.doesNotMatch(chinese, /按下強力擊球鍵/);
});
