// ============================================================
// CHAKRAVYUHA — electron/main.js : Electron main process
// Creates the game window and bridges save/fullscreen/quit IPC
// to a JSON-file-backed store under app.getPath('userData').
// ============================================================
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;

function savesDir() {
  return path.join(app.getPath('userData'), 'saves');
}

function ensureSavesDir() {
  try {
    fs.mkdirSync(savesDir(), { recursive: true });
  } catch (e) { /* non-fatal: writes will fail gracefully below */ }
}

// Only allow simple identifiers — the name arrives from renderer input.
function sanitizeName(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) return null;
  return name;
}

function saveFilePath(name) {
  const safe = sanitizeName(name);
  if (!safe) return null;
  return path.join(savesDir(), `${safe}.json`);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    resizable: true,
    show: false,
    backgroundColor: '#050308',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Phase 05.2 Plan 04 (D-16): a pad-only player needs the game window focused (Chromium only
      // delivers gamepad data to the focused, visible page), never throttled in the background, and
      // audio unlocked without requiring a prior click gesture.
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  win.once('ready-to-show', () => { win.show(); win.focus(); });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  ensureSavesDir();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('store:write', (event, name, json) => {
  try {
    const filePath = saveFilePath(name);
    if (!filePath) return;
    ensureSavesDir();
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, json, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (e) { /* swallow: a bad write must never crash the main process */ }
});

ipcMain.on('store:read', (event, name) => {
  try {
    const filePath = saveFilePath(name);
    if (!filePath || !fs.existsSync(filePath)) {
      event.returnValue = null;
      return;
    }
    event.returnValue = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    event.returnValue = null;
  }
});

ipcMain.on('fullscreen:set', (event, bool) => {
  try {
    if (win) win.setFullScreen(!!bool);
  } catch (e) { /* ignore */ }
});

ipcMain.on('fullscreen:get', (event) => {
  try {
    event.returnValue = win ? win.isFullScreen() : false;
  } catch (e) {
    event.returnValue = false;
  }
});

ipcMain.on('app:quit', () => {
  try { app.quit(); } catch (e) { /* ignore */ }
});
