'use strict';

const BGM_VOLUME = 0.2;
const SFX_VOLUME = 0.35;
const PAN_BY_SIDE = Object.freeze({
  '-1': -0.75,
  0: 0,
  1: 0.75,
});

function normalizedSettings(settings = {}) {
  return {
    bgm: settings.bgm === 'off' ? 'off' : 'on',
    sfx: ['stereo', 'mono', 'off'].includes(settings.sfx)
      ? settings.sfx
      : 'stereo',
  };
}

class NativeAudioState {
  constructor(settings) {
    this.settings = normalizedSettings(settings);
    this.pending = [];
    this.bgmDesired = false;
  }

  updateSettings(settings) {
    const previous = this.settings;
    this.settings = normalizedSettings(settings);

    if (previous.bgm !== this.settings.bgm && this.bgmDesired) {
      if (this.settings.bgm === 'off') {
        this.pending.push({ type: 'stop', sound: 'bgm' });
      } else {
        this.pending.push({
          type: 'play',
          sound: 'bgm',
          volume: BGM_VOLUME,
          pan: 0,
          loop: true,
        });
      }
    }
  }

  applyEffects(effects) {
    for (const effect of effects || []) {
      this.applyEffect(effect);
    }
  }

  applyEffect(effect) {
    const [type, sound, side = 0] = effect || [];
    if (type === 'audio.stop') {
      if (sound === 'bgm') this.bgmDesired = false;
      this.pending.push({ type: 'stop', sound });
      return;
    }
    if (type !== 'audio.play') return;

    if (sound === 'bgm') {
      this.bgmDesired = true;
      if (this.settings.bgm === 'off') return;
      this.pending.push({
        type: 'play',
        sound,
        volume: BGM_VOLUME,
        pan: 0,
        loop: true,
      });
      return;
    }

    if (this.settings.sfx === 'off') return;
    const normalizedSide = side === -1 ? -1 : side === 1 ? 1 : 0;
    this.pending.push({
      type: 'play',
      sound,
      volume: SFX_VOLUME,
      pan:
        this.settings.sfx === 'mono'
          ? 0
          : PAN_BY_SIDE[String(normalizedSide)],
      loop: false,
    });
  }

  drain() {
    const commands = this.pending;
    this.pending = [];
    return commands;
  }

  getState() {
    return {
      settings: { ...this.settings },
      bgmDesired: this.bgmDesired,
      pending: this.pending.map((command) => ({ ...command })),
    };
  }
}

function createNativeAudioState(settings) {
  return new NativeAudioState(settings);
}

module.exports = {
  BGM_VOLUME,
  SFX_VOLUME,
  PAN_BY_SIDE,
  NativeAudioState,
  createNativeAudioState,
};
