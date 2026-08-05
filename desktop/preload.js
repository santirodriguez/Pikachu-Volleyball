'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'pvDesktop',
  Object.freeze({
    isDesktop: true,
    quit: () => ipcRenderer.invoke('pv:quit'),
  })
);
