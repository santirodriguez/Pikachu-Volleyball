'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const GAME_COMMANDS = path.join(ROOT, 'src', 'resources', 'js', 'game_commands.js');

test('application-facing desktop usage remains narrow and runtime-neutral', () => {
  const source = fs.readFileSync(GAME_COMMANDS, 'utf8');
  assert.match(source, /window\.pvDesktop\?\.isDesktop/);
  assert.match(source, /window\.pvDesktop\?\.quit/);
  assert.doesNotMatch(source, /pvDesktop.*(?:shell|filesystem|process|network|openExternal|os\.)/s);
  assert.doesNotMatch(source, /electron|neutralino/i);
});
