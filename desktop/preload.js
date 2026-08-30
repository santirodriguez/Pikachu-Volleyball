'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'pvDesktop',
  Object.freeze({
    isDesktop: true,
    runtime: 'electron',
    quit: () => ipcRenderer.invoke('pv:quit'),
  })
);
