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
  'neutralino',
  'neutralino.config.json'
);
const PRELOAD_PATH = path.join(ROOT, 'desktop', 'neutralino', 'preload.js');
const EXTERNAL_LINK_EXTENSION_ID =
  'com.santirodriguez.pikachuvolleyball.externallinks';

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function createPreloadHarness() {
  const errors = [];
  const registeredEvents = [];
  const documentListeners = new Map();
  const dispatchedExtensionEvents = [];
  let initCalls = 0;
  let exitCalls = 0;
  let windowCloseHandler = null;
  let newWindowRequestHandler = null;

  class HTMLAnchorElement {}

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
  const documentObject = {
    addEventListener(name, handler) {
      documentListeners.set(name, handler);
    },
  };
  const context = vm.createContext({
    window: windowObject,
    document: documentObject,
    HTMLAnchorElement,
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
    documentListeners,
    dispatchedExtensionEvents,
    HTMLAnchorElement,
    getInitCalls: () => initCalls,
    getExitCalls: () => exitCalls,
    getWindowCloseHandler: () => windowCloseHandler,
    getNewWindowRequestHandler: () => newWindowRequestHandler,
  };
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('Neutralino production pins the accepted runtime and identity', () => {
  const config = readConfig();
  assert.equal(
    config.applicationId,
    'com.santirodriguez.pikachuvolleyball.neutralino-spike'
  );
  assert.equal(config.cli.binaryName, 'pikachu-volleyball-neutralino');
  assert.equal(config.cli.binaryVersion, '6.9.0');
  assert.equal(config.cli.clientVersion, '6.9.0');
  assert.equal(config.port, 48471);
  assert.equal(config.dataLocation, 'system');
  assert.deepEqual(config.nativeAllowList, [
    'app.exit',
    'extensions.dispatch',
    'extensions.getStats',
  ]);
  assert.equal(config.logging.enabled, false);
  assert.equal(config.modes.window.enableInspector, false);
  assert.equal(
    config.modes.window.injectScript,
    '/resources/neutralino-preload.js'
  );
});

test('Neutralino production preserves the desktop window contract', () => {
  const windowConfig = readConfig().modes.window;
  assert.equal(windowConfig.title, 'Pikachu Volleyball');
  assert.equal(windowConfig.width, 1024);
  assert.equal(windowConfig.height, 768);
  assert.equal(windowConfig.minWidth, 800);
  assert.equal(windowConfig.minHeight, 600);
  assert.equal(windowConfig.resizable, true);
  assert.equal(windowConfig.fullScreen, false);
  assert.equal(windowConfig.newWindowPolicy, 'custom');
});

test('Neutralino preload exposes only the common desktop contract', async () => {
  const harness = createPreloadHarness();
  assert.equal(harness.getInitCalls(), 1);
  assert.deepEqual(Object.keys(harness.windowObject.pvDesktop).sort(), [
    'isDesktop',
    'quit',
    'runtime',
  ]);
  assert.equal(harness.windowObject.pvDesktop.runtime, 'neutralino');
  assert.equal(Object.isFrozen(harness.windowObject.pvDesktop), true);
  const firstQuit = harness.windowObject.pvDesktop.quit();
  assert.equal(firstQuit, harness.windowObject.pvDesktop.quit());
  assert.equal(await firstQuit, true);
  harness.getWindowCloseHandler()();
  await flushPromises();
  assert.equal(harness.getExitCalls(), 1);
  assert.deepEqual(harness.errors, []);
});

test('Neutralino external requests remain mediated', async () => {
  const harness = createPreloadHarness();
  const anchor = new harness.HTMLAnchorElement();
  anchor.href = 'https://santiagorodriguez.com/';
  let prevented = false;
  harness.documentListeners.get('click')({
    target: { closest: () => anchor },
    preventDefault() {
      prevented = true;
    },
  });
  await flushPromises();
  assert.equal(prevented, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.dispatchedExtensionEvents)),
    [
      {
        extensionId: EXTERNAL_LINK_EXTENSION_ID,
        eventName: 'openExternal',
        data: { url: 'https://santiagorodriguez.com/' },
      },
    ]
  );
  harness.getNewWindowRequestHandler()({
    detail: { url: 'https://santiagorodriguez.com' },
  });
  await flushPromises();
  assert.equal(harness.dispatchedExtensionEvents.length, 2);
});

test('Neutralino production excludes validation privileges and probes', () => {
  const config = readConfig();
  const preload = fs.readFileSync(PRELOAD_PATH, 'utf8');
  assert.equal(config.nativeAllowList.includes('os.open'), false);
  assert.equal(config.nativeAllowList.includes('app.writeProcessOutput'), false);
  assert.equal(preload.includes('neutralino.os.open'), false);
  assert.equal(preload.includes('PV_NEUTRALINO_SMOKE'), false);
  assert.equal(
    fs.existsSync(path.join(ROOT, 'desktop', 'neutralino', 'smoke-probe.js')),
    false
  );
});
