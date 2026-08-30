'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(
  ROOT,
  'desktop',
  'neutralino-spike',
  'neutralino.config.json'
);
const PRELOAD_PATH = path.join(
  ROOT,
  'desktop',
  'neutralino-spike',
  'preload.js'
);
const EXTERNAL_LINK_EXTENSION_ID =
  'com.santirodriguez.pikachuvolleyball.externallinks';

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function createPreloadHarness() {
  const errors = [];
  const registeredEvents = [];
  const dispatchedExtensionEvents = [];
  let initCalls = 0;
  let exitCalls = 0;
  let windowCloseHandler = null;
  let newWindowRequestHandler = null;
  const neutralino = {
    init() {
      initCalls += 1;
    },
    events: {
      on(name, handler) {
        registeredEvents.push(name);
        if (name === 'windowClose') windowCloseHandler = handler;
        if (name === 'newWindowRequest') newWindowRequestHandler = handler;
        return Promise.resolve();
      },
    },
    app: {
      exit() {
        exitCalls += 1;
        return Promise.resolve();
      },
    },
    extensions: {
      dispatch(extensionId, eventName, data) {
        dispatchedExtensionEvents.push({ extensionId, eventName, data });
        return Promise.resolve();
      },
    },
  };
  const windowObject = { Neutralino: neutralino };
  const context = vm.createContext({
    window: windowObject,
    console: {
      error(...args) {
        errors.push(args);
      },
    },
  });
  vm.runInContext(fs.readFileSync(PRELOAD_PATH, 'utf8'), context);
  return {
    windowObject,
    errors,
    registeredEvents,
    dispatchedExtensionEvents,
    getInitCalls: () => initCalls,
    getExitCalls: () => exitCalls,
    getWindowCloseHandler: () => windowCloseHandler,
    getNewWindowRequestHandler: () => newWindowRequestHandler,
  };
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('Neutralino spike pins a minimal stable runtime configuration', () => {
  const config = readConfig();
  assert.equal(config.cli.binaryVersion, '6.9.0');
  assert.equal(config.cli.clientVersion, '6.9.0');
  assert.equal(config.cli.clientLibrary, '/resources/neutralino.js');
  assert.equal(config.cli.extensionsPath, '/extensions/');
  assert.equal(config.port, 48471);
  assert.equal(config.enableServer, true);
  assert.equal(config.enableNativeAPI, true);
  assert.equal(config.tokenSecurity, 'one-time');
  assert.equal(config.exportAuthInfo, false);
  assert.equal(config.enableExtensions, true);
  assert.deepEqual(config.nativeAllowList, ['app.exit', 'extensions.dispatch']);
  assert.equal(config.extensions.length, 1);
  assert.deepEqual(config.extensions[0], {
    id: EXTERNAL_LINK_EXTENSION_ID,
    commandLinux: '${NL_PATH}/extensions/pv-external-link-linux_x64',
  });
  assert.equal(config.documentRoot, '/resources/');
  assert.equal(config.url, '/en/index.html?desktop=1');
  assert.equal(config.singlePageServe, false);
});

test('Neutralino spike preserves the Electron window contract', () => {
  const windowConfig = readConfig().modes.window;
  assert.equal(windowConfig.title, 'Pikachu Volleyball');
  assert.equal(windowConfig.width, 1024);
  assert.equal(windowConfig.height, 768);
  assert.equal(windowConfig.minWidth, 800);
  assert.equal(windowConfig.minHeight, 600);
  assert.equal(windowConfig.resizable, true);
  assert.equal(windowConfig.fullScreen, false);
  assert.equal(windowConfig.exitProcessOnClose, false);
  assert.equal(windowConfig.useSavedState, false);
  assert.equal(windowConfig.injectGlobals, false);
  assert.equal(windowConfig.injectClientLibrary, true);
  assert.equal(windowConfig.injectScript, '/resources/neutralino-preload.js');
  assert.equal(windowConfig.newWindowPolicy, 'custom');
});

test('Neutralino preload exposes only the common desktop application contract', async () => {
  const harness = createPreloadHarness();
  assert.equal(harness.getInitCalls(), 1);
  assert.deepEqual(harness.registeredEvents, ['windowClose', 'newWindowRequest']);
  assert.equal(typeof harness.getWindowCloseHandler(), 'function');
  assert.equal(typeof harness.getNewWindowRequestHandler(), 'function');
  assert.deepEqual(Object.keys(harness.windowObject.pvDesktop).sort(), [
    'isDesktop',
    'quit',
    'runtime',
  ]);
  assert.equal(harness.windowObject.pvDesktop.isDesktop, true);
  assert.equal(harness.windowObject.pvDesktop.runtime, 'neutralino');
  assert.equal(typeof harness.windowObject.pvDesktop.quit, 'function');
  assert.equal(Object.isFrozen(harness.windowObject.pvDesktop), true);

  const firstQuit = harness.windowObject.pvDesktop.quit();
  const secondQuit = harness.windowObject.pvDesktop.quit();
  assert.equal(firstQuit, secondQuit);
  assert.equal(await firstQuit, true);
  harness.getWindowCloseHandler()();
  await flushPromises();
  assert.equal(harness.getExitCalls(), 1);
  assert.deepEqual(harness.errors, []);
});

test('Neutralino custom new-window requests are mediated by the trusted extension', async () => {
  const harness = createPreloadHarness();
  harness.getNewWindowRequestHandler()({
    detail: { url: 'https://santiagorodriguez.com' },
  });
  await flushPromises();

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.dispatchedExtensionEvents)),
    [
      {
        extensionId: EXTERNAL_LINK_EXTENSION_ID,
        eventName: 'openExternal',
        data: { url: 'https://santiagorodriguez.com' },
      },
    ]
  );
  assert.deepEqual(harness.errors, []);
});

test('Neutralino production keeps unrestricted external opening unavailable to renderer native API', () => {
  const config = readConfig();
  const preloadSource = fs.readFileSync(PRELOAD_PATH, 'utf8');

  assert.equal(config.nativeAllowList.includes('os.open'), false);
  assert.equal(preloadSource.includes('neutralino.os.open'), false);
  assert.equal(config.nativeAllowList.includes('os.*'), false);
  assert.equal(config.modes.window.newWindowPolicy, 'custom');
});
