// js/settings.js — SETTINGS global (Phase 3: accessibility + comfort toggles;
// Phase 5 Plan 3: volume/resolution + STORE-backed persistence)
// Mirror of CAMERA/SPRITES pattern — no module system. Headless-safe: guards
// on `typeof STORE`/`typeof document` so it loads fine in test/smoke.js.
// NOTE: index.html/test/smoke.js load storage.js AFTER settings.js, so STORE
// is undefined at this file's own module-eval time — load()/save() only ever
// touch STORE lazily, at call time (well after boot, once storage.js has
// loaded), never at the top level of this file.
'use strict';

const SETTINGS = {
  KEY: 'chakravyuha.settings',
  DEFAULTS: {
    screenShake: true,
    shakeIntensity: 1,
    screenFlash: true,
    hitstop: true,
    reducedParticles: false,
    masterVolume: 1,
    musicVolume: 1,
    sfxVolume: 1,
    musicDynamics: 1,
    resolutionMode: 'auto',
    aimAssist: true,
    rumble: true,
    rumbleIntensity: 0.8,
  },
  RESOLUTION_MODES: ['auto', '1280x720', '1600x900', '1920x1080'],
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
    if (typeof STORE === 'undefined') return this._v;
    // Force a fresh read from the underlying store (desktop chakraNative /
    // browser localStorage / headless memory) rather than trusting a
    // possibly-stale STORE._cache entry — matches raw localStorage.getItem's
    // always-fresh-read semantics that this method previously relied on.
    if (STORE._cache && (this.KEY in STORE._cache)) delete STORE._cache[this.KEY];
    try {
      const parsed = STORE.get(this.KEY, null);
      if (!parsed || typeof parsed !== 'object') return this._v;
      for (const k of Object.keys(this.DEFAULTS)) {
        if (!(k in parsed)) continue;
        const def = this.DEFAULTS[k];
        const val = parsed[k];
        if (typeof val !== typeof def) continue;
        if (k === 'resolutionMode') {
          if (this.RESOLUTION_MODES.includes(val)) this._v[k] = val;
          continue;
        }
        this._v[k] = typeof val === 'number' ? Math.min(1, Math.max(0, val)) : val;
      }
    } catch (e) { /* corrupt storage -> defaults already set */ }
    return this._v;
  },

  save() {
    if (typeof STORE === 'undefined') return;
    try { STORE.set(this.KEY, this._v); } catch (e) { /* ignore */ }
  },

  get(k) {
    if (!this._v) this.load();
    return k in this._v ? this._v[k] : this.DEFAULTS[k];
  },

  set(k, v) {
    if (!this._v) this.load();
    if (!(k in this.DEFAULTS)) return this.get(k);
    if (k === 'resolutionMode') {
      if (!this.RESOLUTION_MODES.includes(v)) return this._v[k];
      this._v[k] = v;
      this.save();
      return v;
    }
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

// STORE (js/storage.js) loads AFTER this file in both index.html and
// test/smoke.js, so `typeof STORE` is 'undefined' at this exact point on
// every real page load — this call is a harmless no-op there. It only takes
// effect if some future load order puts storage.js first. Either way,
// get()/set() lazily call load() on first real use (see above), by which
// time STORE is always defined — that's the actual load path in practice.
if (typeof STORE !== 'undefined') SETTINGS.load();
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('DOMContentLoaded', () => SETTINGS.bindDom());
}
