// ============================================================
// CHAKRAVYUHA — electron/preload.js : contextBridge preload
// Exposes window.chakraNative to the sandboxed renderer.
// ============================================================
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chakraNative', {
  isDesktop: true,
  isDev: ipcRenderer.sendSync('app:isDev') === true,   // unpackaged app -> F4 god mode allowed (05.7.1-10)
  saveRead: (name) => ipcRenderer.sendSync('store:read', name),
  saveWrite: (name, json) => ipcRenderer.send('store:write', name, json),
  setFullscreen: (bool) => ipcRenderer.send('fullscreen:set', bool),
  getFullscreen: () => ipcRenderer.sendSync('fullscreen:get'),
  quit: () => ipcRenderer.send('app:quit'),
});
