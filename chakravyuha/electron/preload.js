// ============================================================
// CHAKRAVYUHA — electron/preload.js : contextBridge preload
// Exposes window.chakraNative to the sandboxed renderer.
// ============================================================
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chakraNative', {
  isDesktop: true,
  saveRead: (name) => ipcRenderer.sendSync('store:read', name),
  saveWrite: (name, json) => ipcRenderer.send('store:write', name, json),
  setFullscreen: (bool) => ipcRenderer.send('fullscreen:set', bool),
  getFullscreen: () => ipcRenderer.sendSync('fullscreen:get'),
  quit: () => ipcRenderer.send('app:quit'),
});
