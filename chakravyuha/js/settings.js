// js/settings.js — SETTINGS global (Phase 3: accessibility + comfort toggles)
// Mirror of CAMERA/SPRITES pattern — no module system. Headless-safe: guards
// on `typeof localStorage`/`typeof document` so it loads fine in test/smoke.js.
'use strict';

const SETTINGS = {
  KEY: 'chakravyuha.settings',
  DEFAULTS: {
    screenShake: true,
    shakeIntensity: 1,
    screenFlash: true,
    hitstop: true,
    reducedParticles: false,
  },
  _v: null,

  // DOM_MAP: input id -> settings key (Plan 03 fills the pause-panel wiring)
  DOM_MAP: {
    'set-screenShake': 'screenShake',
    'set-shakeIntensity': 'shakeIntensity',
    'set-screenFlash': 'screenFlash',
    'set-hitstop': 'hitstop',
    'set-reducedParticles': 'reducedParticles',
  },

  load() {
    this._v = Object.assign({}, this.DEFAULTS);
    if (typeof localStorage === 'undefined') return this._v;
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return this._v;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return this._v;
      for (const k of Object.keys(this.DEFAULTS)) {
        if (!(k in parsed)) continue;
        const def = this.DEFAULTS[k];
        const val = parsed[k];
        if (typeof val !== typeof def) continue;
        this._v[k] = typeof val === 'number' ? Math.min(1, Math.max(0, val)) : val;
      }
    } catch (e) { /* corrupt storage -> defaults already set */ }
    return this._v;
  },

  save() {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(this.KEY, JSON.stringify(this._v)); } catch (e) { /* ignore */ }
  },

  get(k) {
    if (!this._v) this.load();
    return k in this._v ? this._v[k] : this.DEFAULTS[k];
  },

  set(k, v) {
    if (!this._v) this.load();
    if (!(k in this.DEFAULTS)) return this.get(k);
    const def = this.DEFAULTS[k];
    if (typeof v !== typeof def) return this._v[k];
    const stored = typeof v === 'number' ? Math.min(1, Math.max(0, v)) : v;
    this._v[k] = stored;
    this.save();
    return stored;
  },

  all() {
    if (!this._v) this.load();
    return Object.assign({}, this._v);
  },

  reset() {
    this._v = Object.assign({}, this.DEFAULTS);
    this.save();
    return this._v;
  },

  // ---------------- DOM wiring (Plan 03) ----------------
  syncDom() {
    if (typeof document === 'undefined') return;
    for (const id of Object.keys(this.DOM_MAP)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const key = this.DOM_MAP[id];
      const def = this.DEFAULTS[key];
      if (typeof def === 'boolean') el.checked = !!this.get(key);
      else el.value = String(Math.round(this.get(key) * 100));
    }
    const intensityEl = document.getElementById('set-shakeIntensity');
    if (intensityEl) intensityEl.disabled = !this.get('screenShake');
  },

  applyFromDom(el) {
    if (!el) return;
    const key = this.DOM_MAP[el.id];
    if (!key) return;
    const def = this.DEFAULTS[key];
    if (typeof def === 'boolean') this.set(key, !!el.checked);
    else this.set(key, Number(el.value) / 100);
    this.syncDom();
  },

  bindDom() {
    if (typeof document === 'undefined') return;
    for (const id of Object.keys(this.DOM_MAP)) {
      const el = document.getElementById(id);
      if (el && !el._settingsBound) {
        el._settingsBound = true;
        el.addEventListener('change', () => this.applyFromDom(el));
        el.addEventListener('input', () => this.applyFromDom(el));
        if (id === 'set-shakeIntensity') el.addEventListener('keydown', e => e.stopPropagation());
      }
    }
    this.syncDom();
  },
};

if (typeof localStorage !== 'undefined') SETTINGS.load();
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('DOMContentLoaded', () => SETTINGS.bindDom());
}
