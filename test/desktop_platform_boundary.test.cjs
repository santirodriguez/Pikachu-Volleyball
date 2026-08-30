'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  getAllowedExternalUrl,
} = require('../desktop/external-link-policy.cjs');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_MAIN = path.join(ROOT, 'desktop', 'main.js');
const ELECTRON_PRELOAD = path.join(ROOT, 'desktop', 'preload.js');
const GAME_COMMANDS = path.join(ROOT, 'src', 'resources', 'js', 'game_commands.js');

const allowedUrls = [
  'https://santiagorodriguez.com',
  'https://santiagorodriguez.com/about?from=desktop#phase2',
  'https://www.santiagorodriguez.com/',
  'https://github.com/santirodriguez/pikachu-volleyball',
  'https://github.com:443/gorisanson/pikachu-volleyball?tab=readme#readme',
];
const rejectedUrls = [
  'file:///tmp/pikachu-volleyball',
  'javascript:alert(1)',
  'data:text/html,pikachu',
  'not a url',
  'http://santiagorodriguez.com',
  'https://example.com',
  'https://github.com.evil.example/santirodriguez/pikachu-volleyball',
  'https://evil.github.com/santirodriguez/pikachu-volleyball',
  'https://sub.santiagorodriguez.com/',
  'https://santiagorodriguez.com.evil.example/',
  'https://github.com/santirodriguez/pikachu-volleyball/issues',
  'https://github.com/santirodriguez/pikachu-volleyball/',
  'https://github.com/gorisanson/pikachu-volleyball/tree/master',
  'https://user@santiagorodriguez.com/',
  'https://santiagorodriguez.com:444/',
  'https://github.com\\@evil.example/santirodriguez/pikachu-volleyball',
];

test('desktop external-link policy accepts only the established Electron destinations', () => {
  for (const url of allowedUrls) {
    assert.notEqual(getAllowedExternalUrl(url), null, `Expected allowed URL: ${url}`);
  }
  for (const url of rejectedUrls) {
    assert.equal(getAllowedExternalUrl(url), null, `Expected rejected URL: ${url}`);
  }
});

test('Electron preload exposes the runtime-neutral desktop application contract', async () => {
  let exposedName = null;
  let exposedBridge = null;
  const invocations = [];
  const context = vm.createContext({
    require(moduleName) {
      assert.equal(moduleName, 'electron');
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            exposedName = name;
            exposedBridge = value;
          },
        },
        ipcRenderer: {
          invoke(channel) {
            invocations.push(channel);
            return Promise.resolve(true);
          },
        },
      };
    },
  });

  vm.runInContext(fs.readFileSync(ELECTRON_PRELOAD, 'utf8'), context);
  assert.equal(exposedName, 'pvDesktop');
  assert.deepEqual(Object.keys(exposedBridge).sort(), ['isDesktop', 'quit', 'runtime']);
  assert.equal(exposedBridge.isDesktop, true);
  assert.equal(exposedBridge.runtime, 'electron');
  assert.equal(Object.isFrozen(exposedBridge), true);
  assert.equal(await exposedBridge.quit(), true);
  assert.deepEqual(invocations, ['pv:quit']);
});

test('Electron keeps navigation and renderer isolation policy in trusted host code', () => {
  const source = fs.readFileSync(ELECTRON_MAIN, 'utf8');
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /setWindowOpenHandler/);
  assert.match(source, /will-navigate/);
  assert.match(source, /getAllowedExternalUrl/);
  assert.match(source, /shell\.openExternal\(allowedUrl\)/);
});

test('application-facing desktop usage remains narrow', () => {
  const source = fs.readFileSync(GAME_COMMANDS, 'utf8');
  assert.match(source, /window\.pvDesktop\?\.isDesktop/);
  assert.match(source, /window\.pvDesktop\?\.quit/);
  assert.doesNotMatch(source, /pvDesktop.*(?:shell|filesystem|process|network|openExternal|os\.)/s);
});
