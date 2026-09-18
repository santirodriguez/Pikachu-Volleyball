'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BGM_VOLUME,
  SFX_VOLUME,
  createNativeAudioState,
} = require('../src/resources/js/native_audio_state.cjs');

test('native audio preserves accepted volumes and stereo pans', () => {
  const audio = createNativeAudioState({ bgm: 'on', sfx: 'stereo' });
  audio.applyEffects([
    ['audio.play', 'bgm', 0],
    ['audio.play', 'pika', -1],
    ['audio.play', 'powerHit', 1],
    ['audio.play', 'pi', 0],
  ]);

  assert.deepEqual(audio.drain(), [
    {
      type: 'play',
      sound: 'bgm',
      volume: BGM_VOLUME,
      pan: 0,
      loop: true,
    },
    {
      type: 'play',
      sound: 'pika',
      volume: SFX_VOLUME,
      pan: -0.75,
      loop: false,
    },
    {
      type: 'play',
      sound: 'powerHit',
      volume: SFX_VOLUME,
      pan: 0.75,
      loop: false,
    },
    {
      type: 'play',
      sound: 'pi',
      volume: SFX_VOLUME,
      pan: 0,
      loop: false,
    },
  ]);
});

test('native audio enforces mono and off settings without changing core effects', () => {
  const audio = createNativeAudioState({ bgm: 'off', sfx: 'mono' });
  audio.applyEffects([
    ['audio.play', 'bgm', 0],
    ['audio.play', 'pika', -1],
  ]);
  assert.deepEqual(audio.drain(), [
    {
      type: 'play',
      sound: 'pika',
      volume: SFX_VOLUME,
      pan: 0,
      loop: false,
    },
  ]);

  audio.updateSettings({ bgm: 'on', sfx: 'off' });
  assert.deepEqual(audio.drain(), [
    {
      type: 'play',
      sound: 'bgm',
      volume: BGM_VOLUME,
      pan: 0,
      loop: true,
    },
  ]);

  audio.applyEffects([['audio.play', 'chu', 1]]);
  assert.deepEqual(audio.drain(), []);
});

test('native audio stops and resumes desired BGM when its setting changes', () => {
  const audio = createNativeAudioState({ bgm: 'on', sfx: 'stereo' });
  audio.applyEffect(['audio.play', 'bgm', 0]);
  audio.drain();

  audio.updateSettings({ bgm: 'off', sfx: 'stereo' });
  assert.deepEqual(audio.drain(), [{ type: 'stop', sound: 'bgm' }]);

  audio.updateSettings({ bgm: 'on', sfx: 'stereo' });
  assert.deepEqual(audio.drain(), [
    {
      type: 'play',
      sound: 'bgm',
      volume: BGM_VOLUME,
      pan: 0,
      loop: true,
    },
  ]);

  audio.applyEffect(['audio.stop', 'bgm']);
  assert.deepEqual(audio.drain(), [{ type: 'stop', sound: 'bgm' }]);
});
