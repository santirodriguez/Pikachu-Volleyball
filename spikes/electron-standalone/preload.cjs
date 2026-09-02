'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const desktopBridge = Object.freeze({
  isDesktop: true,
  runtime: 'electron',
  quit: () => ipcRenderer.invoke('pv:quit'),
});

contextBridge.exposeInMainWorld('pvDesktop', desktopBridge);
