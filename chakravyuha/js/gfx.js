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

    // ---- Phase 05.6-02: light layer (D-13..D-17) ----
    TRANSIENT_CAP: 32,        // tunable: max simultaneous pulses; oldest evicted
    GROUND_SQUASH: 0.72,      // tunable: ground-light vertical squash for the 3/4 top-down view
    LIGHT_STRENGTH: 0.85,     // tunable: rtSprite alpha compositing the light-map RenderTexture (rt mode)
    PROP_LIGHT_GAIN: 1.6,     // tunable: alpha multiplier for 05.4 per-prop lights GFX takes over, inside the arena
    FIRE_FLICKER: 0.5,        // tunable: flicker depth (D-14's warn/active fireVent formula, reused for fire-type props)
    RING_LIFE_REF: 0.3,       // tunable: GAME.rings has no stored "max life" — rings decay over <=0.3s in practice
                              // (entities.js/game.js push values 0.18-0.3), so this reference constant stands in for
                              // "remaining fraction" without needing a schema change to the rings array.
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

  // tunable: D-14 light presets. Colors are plain 0xRRGGBB numbers (already-parsed — GAME's own
  // css-string colors, e.g. projectile/zone/boss colors, are run through _colorNum() at collect time).
  LIGHT_PRESETS: {
    // h.phase is 'dormant'|'warn'|'erupt' in the real fireVent FSM (js/game.js updateHazards) —
    // NOT 'active'; 'erupt' is the eruption/damaging phase and maps to this preset's "active" tier.
    fireVent: {
      color: 0xff7a2a,
      dormant: { r: 60, a: 0.18 },
      warn: { r: 80, a: 0.35 },
      active: { r: 150, a: 0.75 },
      flicker: 0.5, // tunable: warn/active flicker depth (overrides CFG.FIRE_FLICKER for this preset)
    },
    venomPool: { color: 0x7dff5a, rMul: 1.4, a: 0.22 }, // color falls back to DATA.HAZARDS.venomPool's css color when present
    playerGlow: { color: 0xffd34d, r: 70, a: 0.22 },
    pprojectile: { color: 0xffd34d, r: 46, a: 0.45 }, // color falls back to the projectile's own css color when present
    eprojectile: { color: 0xff5a3c, r: 38, a: 0.35 },
    orbit: { color: 0xffd34d, r: 50, a: 0.4 },
    ring: { color: 0xffffff, a: 0.35 }, // r = the ring's own radius; a scales by GFX.CFG.RING_LIFE_REF-relative remaining fraction
    bolt: { color: 0xbfe3ff, r: 90, a: 0.6 },
    zoneFire: { color: 0xff5a28 },     // matches game.js renderEffects' rgba(255,90,40,...) fire-zone fill
    zoneCyclone: { color: 0x7fdcb7 },  // matches game.js renderEffects' rgba(127,220,183,...) cyclone stroke
    pickupCoin: { color: 0xffcf5c, r: 18, a: 0.2 },      // GAME.pickups' only real item today (type:'mudra') — High tier only
    pickupBoon: { color: 0xffd34d, r: 70, a: 0.5 },      // future-proofing: any pickup whose type isn't 'mudra'
    door: { color: 0xffe2a0, r: 110, a: 0.35 },          // only lit once the room is cleared (G.state === 'cleared')
    bossAura: { rMul: 3.2, a: 0.35 },                     // color comes from the boss's own e.color; phase 2 only
  },

  // tunable: D-15 per-prop flicker/pulse classification for ENV's manifest `frame.light`-bearing
  // props (envPropLights() reads item.frame, a manifest frame key like 'brazier'/'glow_fungus').
  // Keys with no match (e.g. naraka's 'iron_cauldron') default to a flicker, since every 05.4
  // light-emitting prop seen so far is a fire/ember vessel of some kind.
  _FIRE_PROP_RE: /brazier|fire|flame|lamp|diya|torch|pillar/i,
  _PULSE_PROP_RE: /fungus|pool|crystal/i,

  /**
   * _colorNum(c) — pure. Duplicate of SPRITES.parseColor's (also-pure) logic, kept local so the
   * light model has zero cross-file coupling and collectLights/addLight/pulse stay callable with
   * nothing but plain data loaded (D-01's "pure helpers have no Pixi dependency", extended here to
   * "no other-global dependency either"). Converts '#rrggbb'/'#rgb' CSS strings to 0xRRGGBB;
   * passes numbers through; falls back to white.
   */
  _colorNum(c) {
    if (typeof c === 'number') return c;
    if (typeof c === 'string' && c.charCodeAt(0) === 35 /* '#' */) {
      const hex = c.slice(1);
      let full = hex;
      if (hex.length === 3) full = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      const n = parseInt(full, 16);
      if (Number.isFinite(n)) return n;
    }
    return 0xffffff;
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

  /**
   * collectLights(G, view, tier, envLights, nowSec) — pure (D-14). Reads a plain GAME-shaped
   * object (never mutates it) and returns {x, y, r, color, a, ground, prio}[], culled to `view`
   * (expanded per-light by its own radius), sorted by prio descending (ties on projectiles break
   * nearest-to-player-first), and capped at TIER_CFG[tier].maxLights.
   *
   * Sources never lit, for readability (D-14): G.dangerZones, hazards of type 'arrowVolley' /
   * 'riverCurrent' — simply never matched below.
   *
   * envLights entries are flat {x, y, r, color, a, flickerKind?} — color may be a '#rrggbb' string
   * or an already-parsed number (both normalized by _colorNum via add()); flickerKind is
   * 'fire'|'pulse'|undefined. Only consulted at tier !== 'low' (enforced here too, defensively,
   * even though the real caller — frame() — already passes [] at Low).
   */
  collectLights(G, view, tier, envLights, nowSec) {
    const out = [];
    if (!G) return out;
    const now = typeof nowSec === 'number' ? nowSec : 0;
    const cfg = this.TIER_CFG[tier] || this.TIER_CFG.medium;
    const P = this.LIGHT_PRESETS;
    const V = view || { x: 0, y: 0, w: 1280, h: 720 };
    const list = [];

    const add = (x, y, r, color, a, prio, tb, ground) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !(r > 0) || !(a > 0)) return;
      if (x + r < V.x || x - r > V.x + V.w || y + r < V.y || y - r > V.y + V.h) return;
      list.push({ x, y, r, color: this._colorNum(color), a, ground: ground !== false, prio, _tb: tb || 0 });
    };

    // 0. transient pulses — highest priority (D-16)
    for (const t of this._transients) {
      const frac = t.max > 0 ? Math.max(0, Math.min(1, t.t / t.max)) : 0;
      const eased = 1 - (1 - frac) * (1 - frac); // ease-out
      add(t.x, t.y, t.r, t.color, t.a * eased, 100, 0, true);
    }

    // 1. boss phase-2 aura
    for (const e of (G.enemies || [])) {
      if (!e || e.dead || !e.boss || e.phase !== 2) continue;
      const pulse = 0.85 + 0.15 * Math.sin(now * 3 + (e.x || 0) * 0.01);
      add(e.x, e.y, (e.r || 0) * P.bossAura.rMul, e.color, P.bossAura.a * pulse, 90, 0, true);
    }

    // 2. hazards — fireVent (dormant/warn/erupt — NOT a literal 'active' phase string, see the
    // preset's own comment) and venomPool only.
    for (const h of (G.hazards || [])) {
      if (h.type === 'fireVent') {
        const fv = P.fireVent;
        let spec = fv.dormant;
        if (h.phase === 'erupt') spec = fv.active;
        else if (h.phase === 'warn') spec = fv.warn;
        let a = spec.a;
        if (h.phase === 'warn' || h.phase === 'erupt') {
          a *= 1 - fv.flicker * (0.5 + 0.5 * Math.sin(now * 11 + h.x * 0.07) * Math.sin(now * 7.3 + h.y * 0.05));
        }
        add(h.x, h.y, spec.r, fv.color, a, 80, 0, true);
      } else if (h.type === 'venomPool') {
        add(h.x, h.y, (h.r || 0) * P.venomPool.rMul, h.color || P.venomPool.color, P.venomPool.a, 80, 0, true);
      }
      // arrowVolley / riverCurrent: never lit — intentionally unmatched.
    }

    // 3. player ground glow
    if (G.player) add(G.player.x, G.player.y, P.playerGlow.r, P.playerGlow.color, P.playerGlow.a, 55, 0, true);

    // 4. projectiles / astra effects — tiebreak nearest-to-player-first within the shared prio band
    const px = G.player ? G.player.x : 0, py = G.player ? G.player.y : 0;
    const dist = (x, y) => Math.hypot((x || 0) - px, (y || 0) - py);
    for (const p of (G.pprojectiles || [])) add(p.x, p.y, P.pprojectile.r, p.color || P.pprojectile.color, P.pprojectile.a, 70, dist(p.x, p.y), true);
    for (const p of (G.eprojectiles || [])) add(p.x, p.y, P.eprojectile.r, p.color || P.eprojectile.color, P.eprojectile.a, 70, dist(p.x, p.y), true);
    for (const o of (G.orbits || [])) add(o.x, o.y, P.orbit.r, P.orbit.color, P.orbit.a, 70, dist(o.x, o.y), true);
    for (const r of (G.rings || [])) {
      const frac = Math.max(0, Math.min(1, (r.t || 0) / this.CFG.RING_LIFE_REF));
      add(r.x, r.y, r.r, r.color || P.ring.color, P.ring.a * frac, 70, dist(r.x, r.y), true);
    }
    for (const b of (G.bolts || [])) {
      const mx = ((b.x1 || 0) + (b.x2 || 0)) / 2, my = ((b.y1 || 0) + (b.y2 || 0)) / 2;
      add(mx, my, P.bolt.r, P.bolt.color, P.bolt.a, 70, dist(mx, my), true);
    }
    for (const z of (G.zones || [])) {
      const color = z.type === 'fire' ? P.zoneFire.color : P.zoneCyclone.color;
      add(z.x, z.y, (z.r || 0) * 1.1, color, 0.35, 70, dist(z.x, z.y), true);
    }

    // 5. pickups (only real type today is 'mudra'/coin — High only) / doors (once cleared)
    for (const pk of (G.pickups || [])) {
      if (pk.type === 'mudra') {
        if (tier === 'high') add(pk.x, pk.y, P.pickupCoin.r, P.pickupCoin.color, P.pickupCoin.a, 40, 0, true);
      } else {
        const pulse = 0.85 + 0.15 * Math.sin(now * 3 + (pk.x || 0) * 0.02);
        add(pk.x, pk.y, P.pickupBoon.r, P.pickupBoon.color, P.pickupBoon.a * pulse, 60, 0, true);
      }
    }
    if (G.state === 'cleared') {
      for (const d of (G.doors || [])) add(d.x, d.y, P.door.r, P.door.color, P.door.a, 60, 0, true);
    }

    // 6. ENV per-prop lights GFX has taken over (D-15) — medium/high only, enforced here too.
    if (tier !== 'low') {
      for (const el of (envLights || [])) {
        let a = el.a;
        if (el.flickerKind === 'fire') a *= 1 - this.CFG.FIRE_FLICKER * (0.5 + 0.5 * Math.sin(now * 11 + el.x * 0.07) * Math.sin(now * 7.3 + el.y * 0.05));
        else if (el.flickerKind === 'pulse') a *= 0.85 + 0.15 * Math.sin(now * 2 + el.x * 0.03);
        add(el.x, el.y, el.r, el.color, a, 50, 0, true);
      }
    }

    // 7. registry lights (GFX.addLight) — props/misc, lowest non-coin priority by default.
    for (const l of this._registry.values()) {
      let a = l.a;
      if (l.flicker === 'fire') a *= 1 - this.CFG.FIRE_FLICKER * (0.5 + 0.5 * Math.sin(now * 11 + l.x * 0.07) * Math.sin(now * 7.3 + l.y * 0.05));
      add(l.x, l.y, l.r, l.color, a, l.prio, 0, l.ground);
    }

    list.sort((a, b) => (b.prio - a.prio) || (a._tb - b._tb));
    return list.slice(0, cfg.maxLights).map(l => ({ x: l.x, y: l.y, r: l.r, color: l.color, a: l.a, ground: l.ground, prio: l.prio }));
  },

  /**
   * addLight(opts) — D-13/D-15 registry. opts: {x, y, r, color, a, flicker, ground=true,
   * scope='run', prio=50}. Returns an opaque handle string, or null for malformed opts.
   * removeLight(h) deletes it. scope:'room' entries are auto-dropped by _roomTick() on room
   * change; scope:'run' (the default) persists until explicitly removed.
   */
  addLight(opts) {
    if (!opts || !Number.isFinite(opts.x) || !Number.isFinite(opts.y)) return null;
    const h = 'L' + (++this._regSeq);
    this._registry.set(h, {
      x: opts.x, y: opts.y, r: opts.r != null ? opts.r : 60,
      color: this._colorNum(opts.color != null ? opts.color : 0xffffff),
      a: opts.a != null ? opts.a : 0.4,
      flicker: opts.flicker || null,
      ground: opts.ground !== false,
      scope: opts.scope || 'run',
      prio: opts.prio != null ? opts.prio : 50,
    });
    return h;
  },
  removeLight(h) {
    return this._registry.delete(h);
  },

  /**
   * _roomTick(G) — D-15. Drops every scope:'room' registry entry when the room key changes.
   * Pure-ish: only mutates GFX's own registry/_roomKey, never G.
   */
  _roomTick(G) {
    if (!G) return;
    const key = (G.biomeIdx != null ? G.biomeIdx : '') + ':' + (G.roomIdx != null ? G.roomIdx : '') + ':' + (G.state === 'hub');
    if (key === this._roomKey) return;
    this._roomKey = key;
    for (const [h, l] of this._registry) {
      if (l.scope === 'room') this._registry.delete(h);
    }
  },

  // tunable: D-16 transient pulse kinds.
  TRANSIENT_KINDS: {
    hit: { color: 0xfff1d0, r: 60, a: 0.6, life: 0.10 },
    crit: { color: 0xffd34d, r: 90, a: 0.8, life: 0.14 },
    death: { color: 0xffffff, r: 90, a: 0.5, life: 0.25 },
    bossDeath: { color: 0xffffff, r: 400, a: 0.9, life: 0.8 },
    castGlow: { color: 0xffd34d, r: 110, a: 0.6, life: 0.25 },
    phase: { color: 0xffffff, r: 300, a: 0.7, life: 0.5 },
  },

  /**
   * pulse(x, y, kind, color) — D-16. Pushes a transient light that collectLights() decays with an
   * ease-out curve over its life. Capped at CFG.TRANSIENT_CAP (oldest evicted first). A no-op
   * (returns null) when SETTINGS.screenFlash is explicitly false, for photosensitivity, or for an
   * unknown kind / non-finite position.
   */
  pulse(x, y, kind, color) {
    if (typeof SETTINGS !== 'undefined' && SETTINGS.get('screenFlash') === false) return null;
    const spec = this.TRANSIENT_KINDS[kind];
    if (!spec || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const t = {
      x, y, r: spec.r, color: this._colorNum(color != null ? color : spec.color), a: spec.a,
      max: spec.life, t: spec.life,
    };
    if (this._transients.length >= this.CFG.TRANSIENT_CAP) this._transients.shift();
    this._transients.push(t);
    return t;
  },

  /**
   * tickTransients(dt) — ages every pulse by dt seconds and drops any that reached 0.
   */
  tickTransients(dt) {
    if (!dt) return;
    for (let i = this._transients.length - 1; i >= 0; i--) {
      const t = this._transients[i];
      t.t -= dt;
      if (t.t <= 0) this._transients.splice(i, 1);
    }
  },

  /**
   * envPropLights() — D-15 ENV takeover adapter. Reads ENV._entityItems (an array of
   * {item, obj} pairs built by ENV.build() — see js/environment.js's `kind === 'prop'` /
   * `kind === 'pillar-skin'|'wall-skin'` branches) for items carrying a manifest `frameLight`
   * (set in `_placeProps` from `frame.light`), and returns flat {x, y, r, color, a, flickerKind}
   * entries — never touching js/environment.js itself (runtime read only, per the file-ownership
   * "Do NOT touch environment.js" rule).
   *
   * Finding recorded for the SUMMARY: as of 05.4-04, ENV does NOT build a separate pool sprite
   * for per-prop manifest lights (only its biome-ambient `lights.pools` get a `kind:'pool'`
   * sprite in ENV.lightLayer) — `item.frameLight` is carried on the prop's own entity item with
   * no companion light sprite to hide. So the "hide ENV's matching per-prop pool sprite" half of
   * D-15 has nothing to do today; GFX adds the light and there is nothing to double-light.
   * _restoreEnvPropLights() stays wired (reads this._envHidden) so the contract still holds the
   * instant a future ENV revision adds one.
   */
  envPropLights() {
    const out = [];
    if (typeof ENV === 'undefined' || !ENV.isActive || !ENV.isActive() || !Array.isArray(ENV._entityItems)) return out;
    try {
      const A = (typeof GAME !== 'undefined' && GAME.arena) || null;
      for (let i = 0; i < ENV._entityItems.length; i++) {
        const pair = ENV._entityItems[i];
        const item = pair && pair.item, obj = pair && pair.obj;
        if (!item || !item.frameLight) continue;
        if (obj && obj.visible === false) continue; // respect ENV's own view culling
        const x = item.x, y = item.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const fl = item.frameLight;
        const inArena = A ? (x >= A.x && x <= A.x + A.w && y >= A.y && y <= A.y + A.h) : true;
        let a = fl.alpha != null ? fl.alpha : 0.3;
        a = inArena ? a * this.CFG.PROP_LIGHT_GAIN : Math.min(a, 0.6);
        const key = item.frame || '';
        const flickerKind = this._FIRE_PROP_RE.test(key) ? 'fire' : (this._PULSE_PROP_RE.test(key) ? 'pulse' : 'fire');
        out.push({ x, y, r: fl.r, color: fl.color, a, flickerKind });
      }
    } catch (e) { return []; }
    return out;
  },

  /**
   * _restoreEnvPropLights() — the other half of the D-15 contract: re-shows any ENV per-prop pool
   * sprite GFX had hidden at Medium/High, called from _teardownLights() on every tier switch
   * (including down to Low). A no-op today (see envPropLights()'s doc comment — nothing is ever
   * added to _envHidden because ENV builds no per-prop pool sprite to hide), kept so the contract
   * is honored automatically if a future ENV revision adds one.
   */
  _restoreEnvPropLights() {
    if (!this._envHidden.length) return;
    for (const obj of this._envHidden) {
      try { if (obj) obj.visible = true; } catch (e) { /* best-effort */ }
    }
    this._envHidden = [];
  },

  // ---------------- state ----------------
  _registry: new Map(),   // addLight()/removeLight() — handle -> {x,y,r,color,a,flicker,ground,scope,prio}
  _regSeq: 0,
  _roomKey: '',
  _transients: [],         // pulse()/tickTransients() — {x,y,r,color,a,max,t}
  _light: null,            // Task 2: {mode:'direct'|'rt', stage, sprites, tex, rt, rtSprite, lightRes}
  _envHidden: [],          // Task 2: ENV per-prop pool sprites GFX has hidden at medium/high (see envPropLights)
  _lightTex: null,
  _lastEnvTakeoverCount: 0,
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
  _lightWarned: false,

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

      // 3.5. Light layer (D-13) — rebuilt at every tier switch (direct at Low; rt at Medium/High),
      // independent of cfg.filters since lights apply at every tier, including Low.
      this._teardownLights();
      this._buildLights(cfg);

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
      try { this._teardownLights(); } catch (eLightTeardown) { /* ignore */ }
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
   * _buildLightTexture() — D-13. A 128px canvas radial gradient (soft, painterly falloff: stops
   * at 0:1, 0.2:0.75, 0.45:0.32, 0.75:0.08, 1:0), built once and reused by every pooled light
   * sprite (tint supplies the color). Radius is 64, so a light's sprite scale = r / 64.
   */
  _buildLightTexture() {
    if (this._lightTex) return this._lightTex;
    try {
      const PIXI = window.PIXI;
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const c = size / 2;
      const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.2, 'rgba(255,255,255,0.75)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.32)');
      grad.addColorStop(0.75, 'rgba(255,255,255,0.08)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      this._lightTex = PIXI.Texture.from(canvas);
    } catch (e) {
      this._lightTex = null;
    }
    return this._lightTex;
  },

  /**
   * _buildLights(cfg) — D-13. Builds the pooled light layer for the given tier config: a
   * Container holding cfg.maxLights invisible, anchor-0.5, blendMode 'add' pooled Sprites.
   * - 'direct' (Low): the stage is parented straight into worldContainer, at world coordinates.
   * - 'rt' (Medium/High): the stage stays unparented; a RenderTexture + compositing rtSprite (also
   *   additive) are created instead, inserted at the same z-slot. Any failure (RenderTexture API
   *   drift, etc.) warns once and falls back to 'direct' so the game never loses its light layer.
   * Z-slot: inserted immediately before entityContainer (D-13's documented world order), via
   * getChildIndex — never a hard-coded index.
   */
  _buildLights(cfg) {
    if (typeof window === 'undefined' || !window.PIXI || typeof SPRITES === 'undefined'
      || !SPRITES.worldContainer || !SPRITES.entityContainer) return;
    try {
      const PIXI = window.PIXI;
      const tex = this._buildLightTexture();
      if (!tex) return;

      const stage = new PIXI.Container();
      const sprites = [];
      const maxLights = Math.max(0, cfg.maxLights || 0);
      for (let i = 0; i < maxLights; i++) {
        const s = new PIXI.Sprite(tex);
        s.anchor.set(0.5);
        s.blendMode = 'add';
        s.visible = false;
        stage.addChild(s);
        sprites.push(s);
      }

      let mode = cfg.lightMode;
      let rt = null, rtSprite = null;
      if (mode === 'rt') {
        try {
          const lr = cfg.lightRes || 0.5;
          const w = Math.max(1, Math.round(1280 * lr));
          const h = Math.max(1, Math.round(720 * lr));
          rt = PIXI.RenderTexture.create({ width: w, height: h });
          rtSprite = new PIXI.Sprite(rt);
          rtSprite.blendMode = 'add';
          rtSprite.alpha = this.CFG.LIGHT_STRENGTH;
          const idx = SPRITES.worldContainer.getChildIndex(SPRITES.entityContainer);
          SPRITES.worldContainer.addChildAt(rtSprite, idx);
        } catch (eRt) {
          console.warn('[GFX] rt light mode unavailable — falling back to direct additive sprites', eRt);
          mode = 'direct';
          if (rtSprite) { try { if (rtSprite.parent) rtSprite.parent.removeChild(rtSprite); rtSprite.destroy(); } catch (eCleanup) { /* ignore */ } }
          if (rt) { try { rt.destroy(true); } catch (eCleanup2) { /* ignore */ } }
          rt = null; rtSprite = null;
        }
      }
      if (mode === 'direct') {
        const idx = SPRITES.worldContainer.getChildIndex(SPRITES.entityContainer);
        SPRITES.worldContainer.addChildAt(stage, idx);
      }

      this._light = { mode, stage, sprites, tex, rt, rtSprite, lightRes: cfg.lightRes || null };
    } catch (e) {
      if (!this._lightWarned) { console.warn('[GFX] _buildLights failed — no light layer this tier', e); this._lightWarned = true; }
      this._teardownLights();
    }
  },

  /**
   * _teardownLights() — destroys everything _buildLights created (sprites, stage, rt, rtSprite)
   * and restores any ENV per-prop pool sprites GFX had hidden (see envPropLights/D-15), so
   * dropping to Low (or any tier switch) never leaves ENV's own lights permanently hidden.
   */
  _teardownLights() {
    this._restoreEnvPropLights();
    const L = this._light;
    if (!L) { this._light = null; return; }
    try {
      for (const s of (L.sprites || [])) {
        try { if (s.parent) s.parent.removeChild(s); s.destroy(); } catch (eS) { /* best-effort */ }
      }
      if (L.stage) { try { if (L.stage.parent) L.stage.parent.removeChild(L.stage); L.stage.destroy(); } catch (eStage) { /* ignore */ } }
      if (L.rtSprite) { try { if (L.rtSprite.parent) L.rtSprite.parent.removeChild(L.rtSprite); L.rtSprite.destroy(); } catch (eRtSpr) { /* ignore */ } }
      if (L.rt) { try { L.rt.destroy(true); } catch (eRtTex) { /* ignore */ } }
    } catch (e) { /* best-effort teardown */ }
    this._light = null;
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

    // 05.6-02: light layer update (D-13..D-15)
    try {
      this._roomTick(G);
      this.tickTransients(dt / 1000);
      if (this._light) {
        const view = (typeof CAMERA !== 'undefined' && CAMERA.viewRect) ? CAMERA.viewRect(0) : { x: 0, y: 0, w: 1280, h: 720 };
        const envLights = (this.tier === 'low') ? [] : this.envPropLights();
        this._lastEnvTakeoverCount = envLights.length;
        const nowSec = now / 1000;
        const lights = G ? this.collectLights(G, view, this.tier, envLights, nowSec) : [];

        const sprites = this._light.sprites;
        for (let i = 0; i < sprites.length; i++) {
          const s = sprites[i];
          const l = lights[i];
          if (!l) { if (s.visible) s.visible = false; continue; }
          s.visible = true;
          s.position.set(l.x, l.y);
          const scale = l.r / 64;
          s.scale.set(scale, scale * (l.ground ? this.CFG.GROUND_SQUASH : 1));
          try { s.tint = l.color; } catch (eTint) { /* ignore */ }
          s.alpha = l.a;
        }

        if (this._light.mode === 'rt' && this._light.rt) {
          const lr = this._light.lightRes || 0.5;
          const tx = (typeof CAMERA !== 'undefined' && Number.isFinite(CAMERA.tx)) ? CAMERA.tx : 0;
          const ty = (typeof CAMERA !== 'undefined' && Number.isFinite(CAMERA.ty)) ? CAMERA.ty : 0;
          const tz = (typeof CAMERA !== 'undefined' && CAMERA.tz) ? CAMERA.tz : 1;
          this._light.stage.position.set(tx * lr, ty * lr);
          this._light.stage.scale.set(tz * lr);
          try {
            SPRITES.app.renderer.render({ container: this._light.stage, target: this._light.rt, clear: true, clearColor: [0, 0, 0, 0] });
          } catch (eRender) { /* best-effort — leave the RT's previous contents on screen */ }
          if (this._light.rtSprite) {
            this._light.rtSprite.position.set(-tx / tz, -ty / tz);
            this._light.rtSprite.scale.set(1 / (tz * lr));
          }
        }
      }
    } catch (eLight) { /* the light layer is cosmetic — never throw out of frame() */ }
  },

  /**
   * stats() — read-only snapshot for the browser-check gate and in-page debugging.
   */
  stats() {
    const hasPixi = typeof window !== 'undefined' && window.PIXI && typeof SPRITES !== 'undefined' && SPRITES.app;
    const wf = (hasPixi && SPRITES.worldContainer && SPRITES.worldContainer.filters) ? SPRITES.worldContainer.filters.length : 0;
    const fx = (hasPixi && SPRITES.fxContainer && SPRITES.fxContainer.filters) ? SPRITES.fxContainer.filters.length : 0;
    const sf = (hasPixi && SPRITES.app.stage && SPRITES.app.stage.filters) ? SPRITES.app.stage.filters.length : 0;
    const hf = (hasPixi && SPRITES.hudContainer && SPRITES.hudContainer.filters) ? SPRITES.hudContainer.filters.length : 0;
    const visibleLights = (this._light && this._light.sprites) ? this._light.sprites.filter(s => s.visible).length : 0;
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
      lightMode: this._light ? this._light.mode : null,          // 05.6-02 D-13
      lights: visibleLights,
      transients: this._transients.length,
      rt: (this._light && this._light.rt) ? { w: this._light.rt.width, h: this._light.rt.height } : null,
      envTakeover: this._lastEnvTakeoverCount || 0,
    };
  },
};
