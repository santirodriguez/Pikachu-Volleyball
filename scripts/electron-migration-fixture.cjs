'use strict';

const FIXTURE = Object.freeze({
  'pv-offline-graphic': 'soft',
  'pv-offline-bgm': 'off',
  'pv-offline-sfx': 'mono',
  'pv-offline-speed': 'fast',
  'pv-offline-winningScore': '10',
  colorScheme: 'dark',
  'pv-control-bindings-v1': JSON.stringify({
    version: 1,
    bindings: {
      'p1.left': 'KeyA',
      'p1.right': 'KeyS',
      'p1.up': 'KeyW',
      'p1.down': 'KeyX',
      'p1.downRight': 'KeyC',
      'p1.powerPrimary': 'KeyQ',
      'p1.powerAlternate': 'ShiftRight',
      'p2.left': 'Numpad4',
      'p2.right': 'Numpad6',
      'p2.up': 'Numpad8',
      'p2.down': 'Numpad2',
      'p2.powerPrimary': 'Numpad0',
      'p2.powerAlternate': 'ControlRight'
    }
  })
});

module.exports = { FIXTURE };
