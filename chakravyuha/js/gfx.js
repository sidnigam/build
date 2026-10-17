// js/gfx.js — GFX global (Phase 05.6 Plan 01: graphics quality tiers, per-biome color
// grading, bloom, vignette fallback, display-matched render resolution).
// Mirror of SETTINGS/SPRITES object-literal style — no module system, no Pixi at module
// scope. Loads right after js/vfx.js (index.html) and right before js/audio.js.
//
// Everything here reads SPRITES/GAME/CAMERA/SETTINGS/VFX and window.PIXI AT CALL TIME, with
// typeof guards, so this file is safe to load into the headless smoke sandbox (no PIXI, no
// navigator) and safe to load before any of those globals exist.
//
// All pixi-filters option names below (AdjustmentFilter / AdvancedBloomFilter constructor
// options) are verified against the vendored pixi-filters 6.1.5 package's lib/*/*.d.ts files
// (05.6-CONTEXT.md research_corrections #2) — not assumed from memory.
'use strict';

const GFX = {
  // ---------------- tunables ----------------
  CFG: {
    GRADE_LERP: 0.5,         // tunable: seconds to lerp AdjustmentFilter properties on biome change
    VIGNETTE_ALPHA: 0.34,    // tunable: fallback vignette's outer alpha (only used when ENV.vignette is absent)
    RESIZE_DEBOUNCE_MS: 200, // tunable: window-resize -> applyResolution() debounce
    PROBE_SKIP_FRAMES: 90,   // tunable: frames skipped after a tier/room change before the FPS probe resumes sampling
    PROBE_WINDOW: 180,       // tunable: frames sampled before probeDecision() runs
    PROBE_MS_THRESHOLD: 20,  // tunable: median frame ms above which auto-quality downgrades one tier (below 50 FPS)
    // tunable: AdvancedBloomFilter options — Medium tier, applied to fxContainer (D-11)
    BLOOM_MEDIUM: { threshold: 0.62, bloomScale: 0.8, brightness: 1, blur: 6, quality: 4 },
    // tunable: AdvancedBloomFilter options — High tier, applied to worldContainer after the grade,
    // at reduced filter resolution (D-11)
    BLOOM_HIGH: { threshold: 0.7, bloomScale: 0.7, brightness: 1, blur: 8, quality: 5 },
    BLOOM_HIGH_RESOLUTION: 0.5, // tunable: Filter.resolution for the High-tier world bloom pass
  },

  TIERS: ['low', 'medium', 'high'],

  // tunable: D-04 tier table. Every value here is deliberately tunable during the review loop.
  TIER_CFG: {
    low: {
      filters: false,        // no pixi-filters object is ever constructed at this tier
      grade: false,
      bloom: false,
      lightMode: 'direct',   // plain additive sprites in the world (05.6-02)
      lightRes: null,
      maxLights: 24,
      resCap: 1,
      reducedParticles: true,  // forces VFX's reduced-particle path (05.6-02), independent of the user's own setting
      playerLift: false,       // no steady-state player-lift ColorMatrixFilter at Low
    },
    medium: {
      filters: true,
      grade: true,
      bloom: 'fx',            // AdvancedBloomFilter on SPRITES.fxContainer
      lightMode: 'rt',
      lightRes: 0.5,
      maxLights: 48,
      resCap: 2,
      reducedParticles: false,
      playerLift: true,
    },
    high: {
      filters: true,
      grade: true,
      bloom: 'world',          // AdvancedBloomFilter on SPRITES.worldContainer, after the grade
      lightMode: 'rt',
      lightRes: 0.75,
      maxLights: 96,
      resCap: 3,
      reducedParticles: false,
      playerLift: true,
    },
  },

  // tunable: D-06 Auto-resolution GPU-string regexes.
  _LOW_GPU_RE: /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i,
  _HIGH_GPU_RE: /nvidia|geforce|rtx|gtx|radeon (rx|pro)|apple m\d+ (pro|max|ultra)/i,

  // tunable: D-10 per-biome AdjustmentFilter starting values. Unknown biome ids fall back to hub.
  GRADES: {
    naraka:     { gamma: 1, contrast: 1.10, saturation: 1.08, brightness: 0.98, red: 1.04, green: 1.00, blue: 0.94, alpha: 1 },
    patala:     { gamma: 1, contrast: 1.08, saturation: 1.05, brightness: 0.97, red: 0.95, green: 1.02, blue: 1.04, alpha: 1 },
    ranabhoomi: { gamma: 1, contrast: 1.10, saturation: 0.95, brightness: 1.00, red: 1.05, green: 1.01, blue: 0.92, alpha: 1 },
    vaitarani:  { gamma: 1, contrast: 1.06, saturation: 0.88, brightness: 0.98, red: 0.94, green: 1.00, blue: 1.06, alpha: 1 },
    hub:        { gamma: 1, contrast: 1.04, saturation: 1.02, brightness: 1.00, red: 1.00, green: 1.00, blue: 1.00, alpha: 1 },
  },

  // ---------------- pure section (no Pixi, no DOM — runs headless) ----------------

  /**
   * resolveTier(setting, gpu) — pure.
   * An explicit tier ('low'|'medium'|'high') always wins. 'auto' (or any other value) is
   * resolved from the GPU renderer string: low on software renderers, high on known-fast
   * discrete/Apple-Pro-class GPUs, medium otherwise (including base Apple M-series/Intel iGPUs
   * and an empty/unavailable GPU string).
   */
  resolveTier(setting, gpu) {
    if (this.TIERS.indexOf(setting) !== -1) return setting;
    const g = String(gpu || '');
    if (this._LOW_GPU_RE.test(g)) return 'low';
    if (this._HIGH_GPU_RE.test(g)) return 'high';
    return 'medium';
  },

  /**
   * sessionOverride(search) — pure. Parses `?gfx=<tier>` out of a location.search-shaped
   * string. Returns a valid tier string or null. Never persisted (D-06).
   */
  sessionOverride(search) {
    if (!search) return null;
    const m = /[?&]gfx=([a-zA-Z]+)/.exec(String(search));
    if (!m) return null;
    const v = m[1].toLowerCase();
    return this.TIERS.indexOf(v) !== -1 ? v : null;
  },

  /**
   * probeDecision(frameMs, tier) — pure. D-07: needs >= CFG.PROBE_WINDOW samples; takes the
   * median; downgrades exactly one tier when the median exceeds CFG.PROBE_MS_THRESHOLD ms
   * (below ~50 FPS). Returns the next-lower tier, or null (no samples / Low is already the
   * floor / frame time is fine). Never upgrades.
   */
  probeDecision(frameMs, tier) {
    if (!Array.isArray(frameMs) || frameMs.length < this.CFG.PROBE_WINDOW) return null;
    const sorted = frameMs.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median <= this.CFG.PROBE_MS_THRESHOLD) return null;
    const idx = this.TIERS.indexOf(tier);
    if (idx <= 0) return null; // already Low, or an unrecognized tier
    return this.TIERS[idx - 1];
  },

  /**
   * displayResolution(dpr, cssW, cap) — pure. D-08:
   * clamp(round(dpr * cssW / 1280, 2 decimals), 1, cap). Never returns below 1, even if cap<1.
   */
  displayResolution(dpr, cssW, cap) {
    const raw = (Number(dpr) || 1) * (Number(cssW) || 1280) / 1280;
    const rounded = Math.round(raw * 100) / 100;
    return Math.min(Math.max(rounded, 1), Math.max(Number(cap) || 1, 1));
  },

  /**
   * gradeFor(id) — pure. Returns a fresh copy (never a shared reference) of GRADES[id], or
   * GRADES.hub for an unknown id.
   */
  gradeFor(id) {
    const g = this.GRADES[id] || this.GRADES.hub;
    return Object.assign({}, g);
  },

  /**
   * lerpGrade(a, b, t) — pure. Linearly interpolates every numeric key present on either grade
   * object. Used to lerp the live AdjustmentFilter's properties over CFG.GRADE_LERP seconds on
   * biome change, without ever constructing a new filter (D-10).
   */
  lerpGrade(a, b, t) {
    const out = {};
    const keys = {};
    if (a) for (const k in a) keys[k] = true;
    if (b) for (const k in b) keys[k] = true;
    for (const k in keys) {
      const av = (a && typeof a[k] === 'number') ? a[k] : 1;
      const bv = (b && typeof b[k] === 'number') ? b[k] : 1;
      out[k] = av + (bv - av) * t;
    }
    return out;
  },

  /**
   * biomeKey(G) — pure. 'hub' while in the hub (per D-10's explicit rule), else GAME.biome.id,
   * defaulting to 'hub' when no biome is set.
   */
  biomeKey(G) {
    if (!G) return 'hub';
    if (G.state === 'hub') return 'hub';
    return (G.biome && G.biome.id) || 'hub';
  },

  // ---------------- state ----------------
  tier: 'medium',          // resolved tier; not persisted — recomputed by applySetting()
  _setting: 'auto',
  _override: null,
  _gpu: '',
  _filters: [],            // every pixi-filters object GFX has constructed at the current tier
  _grade: null,             // the live AdjustmentFilter instance, or null (Low / no Pixi)
  _bloom: null,             // the live AdvancedBloomFilter instance, or null
  _vignette: null,          // the GFX fallback vignette sprite, or null (ENV owns its own)
  _gradeCur: null,
  _gradeTarget: null,
  _gradeT: 1,
  _biome: null,
  _probe: { skip: 0, samples: [] },
  _probeRoomKey: '',
  _resizeTimer: null,
  _lastFrameT: 0,
  _tierWarned: false,

  // ---------------- Pixi-dependent section ----------------

  /**
   * applySetting() — re-reads SETTINGS.graphicsQuality + the session override, resolves the
   * tier, and applies it. Called on boot (via onPixiReady) and whenever the settings row
   * changes.
   */
  applySetting() {
    const setting = (typeof SETTINGS !== 'undefined') ? SETTINGS.get('graphicsQuality') : 'auto';
    this._setting = setting;
    const effective = this._override || setting;
    const resolved = this.resolveTier(effective, this._gpu || '');
    this.applyTier(resolved);
  },

  /**
   * applyTier(tier) — D-04/D-09/D-11/D-12. Always sets this.tier and resets the FPS-probe skip
   * window, even headless/no-Pixi (so pure state stays consistent for callers/tests). Only
   * touches Pixi when SPRITES is actually ready; everything Pixi-side is wrapped in try/catch
   * and degrades to the Low behavior (no filters) on any failure.
   * NEVER sets .filters on SPRITES.app.stage or SPRITES.hudContainer.
   */
  applyTier(tier) {
    this.tier = tier;
    this._probe.skip = this.CFG.PROBE_SKIP_FRAMES;
    this._probe.samples = [];

    if (typeof window === 'undefined' || !window.PIXI || typeof SPRITES === 'undefined' || !SPRITES.worldContainer) {
      return false;
    }

    const PIXI = window.PIXI;
    try {
      const cfg = this.TIER_CFG[tier] || this.TIER_CFG.medium;

      // 1. Teardown — destroy every GFX-created filter, clear both containers' filter lists.
      for (let i = 0; i < this._filters.length; i++) {
        try { if (this._filters[i] && this._filters[i].destroy) this._filters[i].destroy(); } catch (eDestroy) { /* best-effort */ }
      }
      this._filters = [];
      this._grade = null;
      this._bloom = null;
      SPRITES.worldContainer.filters = null;
      if (SPRITES.fxContainer) SPRITES.fxContainer.filters = null;

      // 2. Build per TIER_CFG, only when this tier wants filters AND pixi-filters is present.
      if (cfg.filters && PIXI.filters) {
        const biomeId = this.biomeKey(typeof GAME !== 'undefined' ? GAME : null);
        this._biome = biomeId;
        const gradeOpts = this.gradeFor(biomeId);
        this._gradeCur = gradeOpts;
        this._gradeTarget = gradeOpts;
        this._gradeT = 1; // already "arrived" — no lerp needed on a fresh tier apply

        this._grade = new PIXI.filters.AdjustmentFilter(gradeOpts);
        this._filters.push(this._grade);
        SPRITES.worldContainer.filters = [this._grade];

        if (cfg.bloom === 'fx' && SPRITES.fxContainer) {
          this._bloom = new PIXI.filters.AdvancedBloomFilter(this.CFG.BLOOM_MEDIUM);
          this._filters.push(this._bloom);
          SPRITES.fxContainer.filters = [this._bloom];
        } else if (cfg.bloom === 'world') {
          this._bloom = new PIXI.filters.AdvancedBloomFilter(this.CFG.BLOOM_HIGH);
          try { this._bloom.resolution = this.CFG.BLOOM_HIGH_RESOLUTION; } catch (eRes) { /* Filter.resolution not settable — skip, noted in SUMMARY */ }
          this._filters.push(this._bloom);
          SPRITES.worldContainer.filters = [this._grade, this._bloom];
        }
      }

      // 3. Vignette (D-12) — 05.4's ENV.vignette wins if present; GFX builds its own only as a
      // fallback, and only once (never recreated on tier switches).
      if (!(typeof ENV !== 'undefined' && ENV.vignette)) {
        this._ensureFallbackVignette();
      }

      // 4. Render resolution follows the tier's resCap.
      this.applyResolution();
    } catch (e) {
      if (!this._tierWarned) { console.warn('[GFX] applyTier failed — degrading to Low (no filters)', e); this._tierWarned = true; }
      try {
        for (let i = 0; i < this._filters.length; i++) {
          try { if (this._filters[i] && this._filters[i].destroy) this._filters[i].destroy(); } catch (eDestroy2) { /* ignore */ }
        }
      } catch (eOuter) { /* ignore */ }
      this._filters = [];
      this._grade = null;
      this._bloom = null;
      if (SPRITES.worldContainer) SPRITES.worldContainer.filters = null;
      if (SPRITES.fxContainer) SPRITES.fxContainer.filters = null;
      return false;
    }
    return true;
  },

  /**
   * _ensureFallbackVignette() — D-12 fallback, built once. A 256x144 elliptical radial-gradient
   * canvas (transparent to 55% radius, black at CFG.VIGNETTE_ALPHA at the edge), stretched to
   * 1280x720, inserted into app.stage directly above worldContainer (below hudContainer).
   */
  _ensureFallbackVignette() {
    if (this._vignette) return;
    try {
      const PIXI = window.PIXI;
      const w = 256, h = 144;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const cx = w / 2, cy = h / 2;
      const r = Math.max(w, h) * 0.5;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,' + this.CFG.VIGNETTE_ALPHA + ')');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const tex = PIXI.Texture.from(canvas);
      const spr = new PIXI.Sprite(tex);
      spr.width = 1280;
      spr.height = 720;
      const stage = SPRITES.app.stage;
      const idx = Math.min(stage.getChildIndex(SPRITES.worldContainer) + 1, stage.children.length);
      stage.addChildAt(spr, idx);
      this._vignette = spr;
    } catch (e) {
      this._vignette = null;
    }
  },

  /**
   * applyResolution() — D-08. Reads the canvas's ACTUAL displayed CSS width, computes the
   * display-matched resolution capped per tier, and applies it via SPRITES.setResolution() only
   * when it actually changed.
   */
  applyResolution() {
    try {
      if (typeof window === 'undefined' || !window.PIXI || typeof SPRITES === 'undefined' || !SPRITES.app || !SPRITES.app.renderer) return;
      const canvas = SPRITES.app.canvas || SPRITES.app.view;
      if (!canvas || !canvas.getBoundingClientRect) return;
      const rect = canvas.getBoundingClientRect();
      const cssW = rect.width || 1280;
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const cap = (this.TIER_CFG[this.tier] || this.TIER_CFG.medium).resCap;
      const res = this.displayResolution(dpr, cssW, cap);
      const current = SPRITES.app.renderer.resolution || 1;
      if (Math.abs(current - res) > 0.001 && typeof SPRITES.setResolution === 'function') {
        SPRITES.setResolution(res);
      }
    } catch (e) { /* best-effort — keep whatever resolution is already set */ }
  },

  /**
   * onPixiReady() — called as the last statement inside SPRITES.init()'s try block (D-02).
   * Reads the GPU renderer string, resolves the ?gfx= session override, applies the initial
   * tier, and wires a debounced resize listener.
   */
  onPixiReady() {
    let gpu = '';
    try {
      const gl = SPRITES.app && SPRITES.app.renderer && SPRITES.app.renderer.gl;
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
      }
    } catch (e) { gpu = ''; }
    this._gpu = gpu;

    try {
      this._override = this.sessionOverride(typeof location !== 'undefined' ? location.search : '');
    } catch (e) { this._override = null; }

    this.applySetting();

    try {
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', () => {
          if (this._resizeTimer) clearTimeout(this._resizeTimer);
          this._resizeTimer = setTimeout(() => this.applyResolution(), this.CFG.RESIZE_DEBOUNCE_MS);
        });
      }
    } catch (e) { /* best-effort */ }
  },

  /**
   * frame() — called once per rendered frame from SPRITES.uploadBridge() (D-02), after
   * CAMERA.begin() has set tx/ty/tz. Headless-safe: returns early with no Pixi. Drives the
   * per-biome grade lerp and the Auto-quality FPS probe.
   */
  frame() {
    if (typeof window === 'undefined' || !window.PIXI || typeof SPRITES === 'undefined' || !SPRITES.worldContainer) return;

    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const dt = this._lastFrameT ? (now - this._lastFrameT) : (1000 / 60);
    this._lastFrameT = now;

    const G = (typeof GAME !== 'undefined') ? GAME : null;

    // ---- biome grade sync + lerp (D-10) ----
    try {
      if (G) {
        const key = this.biomeKey(G);
        if (key !== this._biome) {
          this._biome = key;
          this._gradeCur = (this._grade) ? Object.assign({}, this._gradeTarget || this.gradeFor(key)) : this.gradeFor(key);
          this._gradeTarget = this.gradeFor(key);
          this._gradeT = 0;
        }
        if (this._grade && this._gradeTarget && this._gradeT < 1) {
          this._gradeT = Math.min(1, this._gradeT + (dt / 1000) / this.CFG.GRADE_LERP);
          const cur = this.lerpGrade(this._gradeCur, this._gradeTarget, this._gradeT);
          for (const k in cur) {
            try { this._grade[k] = cur[k]; } catch (eSet) { /* unknown filter property — skip */ }
          }
        }
      }
    } catch (e) { /* grade lerp is cosmetic — never throw out of frame() */ }

    // ---- Auto-quality FPS probe (D-07) ----
    try {
      const roomKey = G ? (G.biomeIdx + ':' + G.roomIdx + ':' + (G.state === 'hub')) : '';
      if (roomKey !== this._probeRoomKey) {
        this._probeRoomKey = roomKey;
        this._probe.skip = this.CFG.PROBE_SKIP_FRAMES;
        this._probe.samples = [];
      }

      const visible = (typeof document === 'undefined') || document.visibilityState !== 'hidden';
      const inProbeState = G && (G.state === 'combat' || G.state === 'cleared');
      if (this._setting === 'auto' && !this._override && inProbeState && visible) {
        if (this._probe.skip > 0) {
          this._probe.skip--;
        } else {
          this._probe.samples.push(dt);
          if (this._probe.samples.length >= this.CFG.PROBE_WINDOW) {
            const sorted = this._probe.samples.slice().sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const next = this.probeDecision(this._probe.samples, this.tier);
            this._probe.samples = [];
            if (next) {
              console.info('[GFX] auto quality -> ' + next + ' (median ' + median.toFixed(2) + 'ms)');
              this.applyTier(next);
            }
          }
        }
      } else {
        // Not eligible to probe right now — keep the window from accumulating stale samples.
        this._probe.samples = [];
      }
    } catch (e) { /* probe is best-effort — never throw out of frame() */ }

    // 05.6-02: light layer update
  },

  /**
   * stats() — read-only snapshot for the browser-check gate and in-page debugging.
   * Plan 02 fills in lightMode and adds light/RT counts.
   */
  stats() {
    const hasPixi = typeof window !== 'undefined' && window.PIXI && typeof SPRITES !== 'undefined' && SPRITES.app;
    const wf = (hasPixi && SPRITES.worldContainer && SPRITES.worldContainer.filters) ? SPRITES.worldContainer.filters.length : 0;
    const fx = (hasPixi && SPRITES.fxContainer && SPRITES.fxContainer.filters) ? SPRITES.fxContainer.filters.length : 0;
    const sf = (hasPixi && SPRITES.app.stage && SPRITES.app.stage.filters) ? SPRITES.app.stage.filters.length : 0;
    const hf = (hasPixi && SPRITES.hudContainer && SPRITES.hudContainer.filters) ? SPRITES.hudContainer.filters.length : 0;
    return {
      tier: this.tier,
      setting: this._setting,
      override: this._override,
      gpu: this._gpu || '',
      liveFilters: this._filters.length,
      worldFilters: wf,
      fxFilters: fx,
      stageFilters: sf,
      hudFilters: hf,
      resolution: (hasPixi && SPRITES.app.renderer) ? SPRITES.app.renderer.resolution : 1,
      lightMode: null, // filled in by 05.6-02
    };
  },
};
