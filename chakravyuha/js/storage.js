// ============================================================
// CHAKRAVYUHA — storage.js : STORE persistence abstraction
// Resolves to desktop (Electron chakraNative), browser
// (localStorage), or headless (in-memory) storage. Desktop mode
// lazily migrates legacy localStorage saves on first read.
// ============================================================
'use strict';

const STORE = {
  _mode: null,        // 'desktop' | 'browser' | 'headless' — set by init()
  _cache: {},          // per-key cache, all modes
  _memory: {},          // headless-only backing store

  resolveMode(hasChakraNative, hasLocalStorage) {
    if (hasChakraNative) return 'desktop';
    if (hasLocalStorage) return 'browser';
    return 'headless';
  },

  init() {
    const hasChakraNative = typeof window !== 'undefined' && !!window.chakraNative;
    const hasLocalStorage = typeof localStorage !== 'undefined';
    this._mode = this.resolveMode(hasChakraNative, hasLocalStorage);
  },

  get(name, fallback) {
    if (name in this._cache) return this._cache[name];

    if (this._mode === 'desktop') {
      try {
        const raw = window.chakraNative.saveRead(name);
        if (raw !== null && raw !== undefined) {
          const parsed = JSON.parse(raw);
          this._cache[name] = parsed;
          return parsed;
        }
      } catch (e) { /* fall through to legacy migration */ }
      // legacy migration: one-time read from localStorage, write through
      try {
        if (typeof localStorage !== 'undefined') {
          const legacy = localStorage.getItem(name);
          if (legacy !== null && legacy !== undefined) {
            const parsed = JSON.parse(legacy);
            this._cache[name] = parsed;
            this.set(name, parsed);
            return parsed;
          }
        }
      } catch (e) { /* ignore, fall through to fallback */ }
      return fallback;
    }

    if (this._mode === 'browser') {
      try {
        const raw = localStorage.getItem(name);
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    }

    // headless
    return name in this._memory ? this._memory[name] : fallback;
  },

  set(name, value) {
    this._cache[name] = value;

    if (this._mode === 'desktop') {
      try { window.chakraNative.saveWrite(name, JSON.stringify(value)); } catch (e) { /* ignore */ }
      return;
    }

    if (this._mode === 'browser') {
      try { localStorage.setItem(name, JSON.stringify(value)); } catch (e) { /* ignore */ }
      return;
    }

    this._memory[name] = value;
  },

  remove(name) {
    delete this._cache[name];

    if (this._mode === 'desktop') {
      // Save-wipe is a rare, non-critical path — simplified to a cache-only
      // removal plus writing `null` through so a later read doesn't resurrect
      // the old file via chakraNative.saveRead (main process treats a stored
      // null gracefully, same as a missing file).
      try { window.chakraNative.saveWrite(name, JSON.stringify(null)); } catch (e) { /* ignore */ }
      return;
    }

    if (this._mode === 'browser') {
      try { localStorage.removeItem(name); } catch (e) { /* ignore */ }
      return;
    }

    delete this._memory[name];
  },
};

STORE.init();
