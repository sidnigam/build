// js/sprites.js — SPRITES global (Phase 2: asset pipeline foundation)
// Mirror of CAMERA pattern in renderer.js — no module system, no Pixi at module scope.
// D-05 headless guard: checks typeof navigator before touching any Pixi API.
'use strict';

const SPRITES = {
  ready: false,
  app: null,
  sheets: {},         // key → loaded spritesheet (populated by load() in Plan 02)
  _missing: new Set(),

  /**
   * async init(canvasEl)
   * D-05 headless guard: bail immediately if navigator is not defined
   * (smoke sandbox has document but NOT navigator — guard on navigator per RESEARCH Pitfall 3).
   * All PixiJS work is wrapped in try/catch so a Pixi failure degrades to fallback primitives.
   */
  async init(canvasEl) {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
    try {
      // Plan 02: Application.init() goes here
    } catch (e) {
      console.warn('SPRITES disabled — fallback to primitives', e);
      this.ready = false;
    }
  },

  /**
   * async load(manifest)
   * Same navigator/document guard. On real env, calls Assets.load per atlas and populates
   * this.sheets, then sets this.ready = true. Plan 02 fills in the Pixi calls.
   */
  async load(manifest) {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
    try {
      // Plan 02: Assets.load + sheet population goes here
      // this.ready = true;
    } catch (e) {
      console.warn('SPRITES.load failed — fallback to primitives', e);
      this.ready = false;
    }
  },

  /**
   * has(key)
   * D-11: Returns false in headless/zero-asset state → fallback draw() fires.
   */
  has(key) {
    return this.ready && !!this.sheets[key];
  },

  /**
   * get(key)
   */
  get(key) {
    return this.sheets[key];
  },

  /**
   * groupFramesByAnimation(frameNames)
   * Pure function — no Pixi, runs headless.
   * Groups frame names by {actor}_{state} prefix, orders each group ascending by trailing index.
   * Convention: {actor}_{state}_{n}.png  e.g. player_idle_0.png, tataka_phase2_idle_00.png
   *
   * Algorithm:
   *   name.replace(/\.png$/,'').split('_') → [actor, ...mid, idx]
   *   animName = mid.join('_')
   *   index    = Number(idx)
   */
  groupFramesByAnimation(frameNames) {
    const groups = {};
    const indices = {};

    for (const name of frameNames) {
      const noExt = name.replace(/\.png$/, '');
      const parts = noExt.split('_');
      if (parts.length < 3) continue;  // need at least actor + state + index

      const idx = parts[parts.length - 1];
      const mid = parts.slice(1, parts.length - 1);
      const animName = mid.join('_');
      const numIdx = Number(idx);

      if (!groups[animName]) {
        groups[animName] = [];
        indices[animName] = [];
      }
      groups[animName].push(name);
      indices[animName].push(numIdx);
    }

    // Sort each group ascending by numeric index
    const result = {};
    for (const anim of Object.keys(groups).sort()) {
      const paired = groups[anim].map((f, i) => [indices[anim][i], f]);
      paired.sort((a, b) => a[0] - b[0]);
      result[anim] = paired.map(p => p[1]);
    }
    return result;
  },

  /**
   * createAnimatedSprite(key, anim)
   * Returns the frame-name array for sheets[key].animations[anim], or null if has(key) is false.
   * Plan 02 replaces this stub with actual PixiJS AnimatedSprite construction.
   */
  createAnimatedSprite(key, anim) {
    if (!this.has(key)) return null;
    const sheet = this.sheets[key];
    if (!sheet || !sheet.animations || !sheet.animations[anim]) return null;
    return sheet.animations[anim];
  },
};
