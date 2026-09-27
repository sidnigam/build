// js/sprites.js — SPRITES global (Phase 2: asset pipeline foundation)
// Mirror of CAMERA pattern in renderer.js — no module system, no Pixi at module scope.
// D-05 headless guard: checks typeof navigator before touching any Pixi API.
'use strict';

const SPRITES = {
  ready: false,
  app: null,
  sheets: {},         // key → loaded spritesheet (populated by load())
  _missing: new Set(),

  // Pixi scene-graph containers (null until init runs in browser)
  worldContainer: null,
  bgContainer: null,
  entityContainer: null,
  fxContainer: null,
  hudContainer: null,

  // Hidden 2D canvas bridge for legacy primitive rendering
  bridgeCanvas: null,
  bridgeCtx: null,
  bridgeTexture: null,
  bridgeSprite: null,

  // Second 2D canvas bridge for the HUD — lives in hudContainer (outside worldContainer),
  // so camera shake never moves it and it always draws above entity sprites.
  hudBridgeCanvas: null,
  hudBridgeCtx: null,
  hudBridgeTexture: null,
  hudBridgeSprite: null,

  /**
   * async init(canvasEl)
   * D-05 headless guard: bail immediately if navigator is not defined
   * (smoke sandbox has document but NOT navigator — guard on navigator per RESEARCH Pitfall 3).
   * All PixiJS work is wrapped in try/catch so a Pixi failure degrades to fallback primitives.
   */
  async init(canvasEl) {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
    try {
      const PIXI = (typeof window !== 'undefined' && window.PIXI);
      if (!PIXI) { this.ready = false; return; }

      // Build the PixiJS Application (v8 async init)
      this.app = new PIXI.Application();
      await this.app.init({
        canvas: canvasEl,
        width: 1280,
        height: 720,
        backgroundColor: 0x0b0710,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      // Build scene graph containers
      this.worldContainer  = new PIXI.Container();
      this.bgContainer     = new PIXI.Container();
      this.entityContainer = new PIXI.Container();
      this.fxContainer     = new PIXI.Container();
      this.hudContainer    = new PIXI.Container();

      this.entityContainer.sortableChildren = true;   // y-sort via zIndex = e.y (drawEntity)
      this.worldContainer.addChild(this.bgContainer, this.entityContainer, this.fxContainer);
      this.app.stage.addChild(this.worldContainer, this.hudContainer);

      // Hidden 2D canvas bridge — carries legacy primitive draws as a Pixi texture each frame
      this.bridgeCanvas = document.createElement('canvas');
      this.bridgeCanvas.width  = 1280;
      this.bridgeCanvas.height = 720;
      this.bridgeCtx = this.bridgeCanvas.getContext('2d');

      this.bridgeTexture = PIXI.Texture.from(this.bridgeCanvas);
      this.bridgeSprite  = new PIXI.Sprite(this.bridgeTexture);
      // Insert bridge sprite into worldContainer at z-index 0 (below entity/fx containers)
      this.worldContainer.addChildAt(this.bridgeSprite, 0);
      // KNOWN LIMITATION: renderEffects primitives (projectiles, orbits, rings, damage text) draw on
      // this world bridge and therefore render UNDER Pixi entity sprites. Accepted for now — the fx
      // layer moves to Pixi (fxContainer) in a later plan.
      // Phase 05.1 (D-10): CAMERA.begin() re-positions/re-scales this sprite every frame as the
      // exact inverse of the worldContainer transform (position = -tx/tz, scale = 1/tz), so the
      // 1280x720 bridge canvas — always drawn in world space via CAMERA.applyCtx(ctx) — still maps
      // 1:1 to screen pixels once worldContainer's own position/scale are applied on top.

      // HUD bridge — separate canvas in hudContainer: unaffected by camera shake, above entities.
      this.hudBridgeCanvas = document.createElement('canvas');
      this.hudBridgeCanvas.width  = 1280;
      this.hudBridgeCanvas.height = 720;
      this.hudBridgeCtx = this.hudBridgeCanvas.getContext('2d');
      this.hudBridgeTexture = PIXI.Texture.from(this.hudBridgeCanvas);
      this.hudBridgeSprite  = new PIXI.Sprite(this.hudBridgeTexture);
      this.hudContainer.addChild(this.hudBridgeSprite);

    } catch (e) {
      console.warn('SPRITES disabled — fallback to primitives', e);
      this.ready = false;
    }
  },

  /**
   * clearBridge()
   * Clear the hidden bridge canvas at the start of each frame.
   */
  clearBridge() {
    // Reset any transform left by a thrown frame before clearing, so the clear always covers the
    // full backing canvas regardless of the previous frame's camera scroll/zoom (Phase 05.1).
    if (this.bridgeCtx) {
      if (this.bridgeCtx.setTransform) this.bridgeCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.bridgeCtx.clearRect(0, 0, 1280, 720);
    }
    if (this.hudBridgeCtx) {
      if (this.hudBridgeCtx.setTransform) this.hudBridgeCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.hudBridgeCtx.clearRect(0, 0, 1280, 720);
    }
  },

  /**
   * coverFit(texW, texH, rect) — pure. Uniform scale + position so a texW x texH texture covers
   * (overflows, never letterboxes) the given rect, centered.
   */
  coverFit(texW, texH, rect) {
    const scale = Math.max(rect.w / texW, rect.h / texH);
    return {
      scale,
      x: rect.x + rect.w / 2 - (texW * scale) / 2,
      y: rect.y + rect.h / 2 - (texH * scale) / 2,
    };
  },

  /**
   * uploadBridge()
   * Re-upload the bridge canvas contents to the Pixi texture after all primitives are drawn.
   */
  uploadBridge() {
    if (this.bridgeTexture) this.bridgeTexture.source.update();
    if (this.hudBridgeTexture) this.hudBridgeTexture.source.update();
  },

  /**
   * async load(manifest)
   * Same navigator/document guard. On real env, calls Assets.load per atlas and populates
   * this.sheets, then sets this.ready = true.
   * manifest: Array of { key, path } — e.g. { key: 'player', path: 'assets/sprites/player/player-atlas.json' }
   * Non-fatal: missing atlas stays absent; that entity falls back to draw(ctx) via has(key)=false.
   */
  async load(manifest) {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
    try {
      const PIXI = (typeof window !== 'undefined' && window.PIXI);
      if (!PIXI) { this.ready = false; return; }

      for (const entry of manifest) {
        try {
          const sheet = await PIXI.Assets.load(entry.path);
          this.sheets[entry.key] = sheet;
        } catch (e) {
          console.warn('SPRITES atlas missing — fallback to primitives:', entry.key, e);
          this._missing.add(entry.key);
        }
      }

      if (Object.keys(this.sheets).length > 0) this.ready = true;
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
   * Creates a real PixiJS AnimatedSprite from the loaded spritesheet.
   * Returns null if the atlas is not loaded (D-11 — caller falls back to draw(ctx)).
   */
  createAnimatedSprite(key, anim) {
    if (!this.has(key)) return null;
    const PIXI = window.PIXI;
    const sheet = this.sheets[key];
    if (!sheet || !sheet.animations) return null;
    const frames = sheet.animations[anim];
    if (!frames || !frames.length) return null;

    const spr = new PIXI.AnimatedSprite(frames);
    spr.animationSpeed = 0.15;
    spr.loop = (anim === 'idle' || anim === 'run' || anim === 'phase2');
    spr.anchor.set(0.5);   // overridden by drawEntity with the feet anchor from spriteLayout
    if (!spr.loop) {
      spr.onComplete = () => { spr.gotoAndStop(spr.totalFrames - 1); };
    }
    spr.play();
    return spr;
  },

  // ---------------- Tunables (quick-260924-tka) ----------------
  CFG: {
    HEIGHT_PER_R: 4,            // tunable: on-screen sprite height = r * HEIGHT_PER_R (player r13 -> ~52px)
    BOSS_HEIGHT_PER_R: 4,       // tunable: same, for bosses (e.boss truthy)
    HEIGHT_PER_R_OVERRIDE: {},  // tunable: per-atlas-key override, e.g. { bhuta: 3.2 }
    FEET_ANCHOR_Y: 0.9,         // tunable: anchor Y (0..1 of frame) used when a texture carries no trim data
    FEET_OFFSET_R: 1,           // tunable: feet sit this many r below entity centre (bottom of hitbox circle)
    DEFAULT_FACING: 1,          // tunable: +1 = source art faces right/front; set -1 if a sheet faces left
    FACING_DEADZONE: 0.08,      // tunable: |cos(angle)| below this keeps the previous facing (no flicker at vertical aim)
    MOVE_EPS: 0.4,              // tunable: |dx|+|dy| per frame above which an entity counts as moving

    // ---------------- Tunables (02-07 procedural animation) ----------------
    IDLE_BREATH: 0.035,         // tunable: idle breathing squash/stretch amplitude
    IDLE_HZ: 1.1,                // tunable: idle breathing frequency
    ASLEEP_SLOW: 0.35,           // tunable: breathing frequency multiplier while e.asleep
    RUN_HZ: 3.2,                 // tunable: run footfall frequency
    RUN_BOB_R: 0.22,             // tunable: run vertical bob, in units of r
    RUN_LEAN: 0.09,              // tunable: run lean rotation (radians) at |lean|=1
    DASH_STRETCH: 0.28,          // tunable: dash horizontal stretch fraction
    ATTACK_STRETCH: 0.14,        // tunable: attack lunge stretch fraction
    WINDUP_SQUASH: 0.08,         // tunable: enemy wind-up crouch squash fraction
    WINDUP_TREMBLE: 0.03,        // tunable: enemy wind-up tremble rotation (radians)
    HIT_SQUASH: 0.12,            // tunable: hit-flash squash fraction
    FLASH_MAX: 0.85,             // tunable: max white-flash blend amount (0..1)
    PLAYER_HURT_DUR: 0.25,       // tunable: player hurtT duration used to ramp flash down
    SPAWN_DUR: 0.6,              // tunable: spawn fade/scale-in duration, mirrors legacy spawnT
    SPAWN_MIN_SCALE: 0.6,        // tunable: sprite scale at the start of spawn-in
    DEATH_DUR: 0.3,              // tunable: death shrink/fade duration
    PHASE_FLASH_DUR: 0.3,        // tunable: boss phase-transition white flash duration
    SWING_DUR: 0.12,             // tunable: melee swing duration, mirrors Player.meleeAttack swing.t
    MAX_WIDTH_PER_R: 5,          // tunable: clamp on-screen sprite width to r * MAX_WIDTH_PER_R (wide single-pose art)
    GHOST_ALPHA: 0.45,           // tunable: dash afterimage peak alpha
    GHOST_TINT: 0x7fdcb7,        // tunable: dash afterimage tint color
    GHOST_MAX: 6,                // tunable: max simultaneous dash afterimages
    TRAIL_LIFE: 0.25,            // tunable: dash trail point lifetime (mirrors Player trail push at t:0.25)
    SHADOW_ALPHA: 0.35,          // tunable: ground shadow alpha under sprite-rendered actors

    // ---------------- Tunables (02-10 weapon overlay + biome bg) ----------------
    WEAPON_HAND_R: 0.55,         // tunable: hand distance from body center along aim, x r
    WEAPON_HAND_DY: -0.9,        // tunable: hand height, x r (negative = up toward the chest)
    WEAPON_SCALE_PER_R: 1 / 13,  // tunable: weapon art is authored for r=13
    WEAPON_REACH_BULGE: 0.15,    // tunable: mid-swing reach bulge fraction
    BG_DIM_OUTER: 0.6,           // tunable: darken-overlay alpha outside the arena when a biome bg shows
    BG_FLOOR_TINT: 0.55,         // tunable: biome-floor color wash alpha over the illustrated bg inside the arena
    BG_FLOOR_DARKEN: 0.25,       // tunable: extra flat-black wash over the arena floor (quick-260926-dcz readability)

    // ---------------- Tunables (quick-260926-djs: character readability ground markers) ----------------
    RING_PLAYER_COLOR: 0xffd34d, // tunable: gold ground ring/glow color under the player
    RING_PLAYER_ALPHA: 0.55,     // tunable: peak alpha of the player's gold ring/glow (also drives the pulse range)
    RING_W_PER_R: 1.9,           // tunable: marker ellipse full-width = r * RING_W_PER_R (half-width = /2, i.e. rx)
    RING_H_RATIO: 0.38,          // tunable: marker ellipse height (ry) = r * RING_H_RATIO
    MARKER_SHADOW_ALPHA: 0.45,   // tunable: dark contact-shadow alpha baked into every ground marker (distinct
                                 // from CFG.SHADOW_ALPHA, which is the separate ctx-drawn shadow in game.js —
                                 // kept as its own key so this quick task never alters that already-tuned path)
    RIM_ALPHA: 0.35,             // tunable: faint DATA-color rim alpha for enemy/boss ground markers
    PLAYER_LIFT: 1.12,           // tunable: steady-state brightness multiplier applied only to the player sprite
    BOSS_MARKER_SCALE: 1.15,     // tunable: extra ground-marker size multiplier for bosses (beyond their larger r)
  },

  ATTACK_STATES: new Set(['wind', 'lunge', 'strike', 'charge', 'charging', 'noose', 'spiral', 'summon', 'slam', 'cast', 'sweep']),

  /**
   * pickAnim(available, requested) — pure.
   * requested if present, else 'idle', else first available, else null.
   */
  pickAnim(available, requested) {
    if (!available || !available.length) return null;
    if (available.indexOf(requested) !== -1) return requested;
    if (available.indexOf('idle') !== -1) return 'idle';
    return available[0];
  },

  /**
   * animForEntity(e, moved) — pure.
   * Entities have no vx/vy, so movement is detected from position change (movedSince).
   */
  animForEntity(e, moved) {
    if (e.spriteKey === 'player' || e.type === undefined) {
      if (e.dashT > 0) return 'dash';
      if (e.swing && e.swing.t > 0) return 'attack';
      if (moved) return 'run';
      return 'idle';
    }
    const s = e.state || '';
    if (this.ATTACK_STATES.has(s) || /Wind$/.test(s)) return 'attack';
    if (moved) return 'run';
    return 'idle';
  },

  /**
   * movedSince(e) — compares against the position stored on the previous call.
   * Returns false on the first call.
   */
  movedSince(e) {
    const px = e._sprLastX, py = e._sprLastY;
    e._sprVX = (px === undefined) ? 0 : (e.x - px);   // 02-07: signed x-velocity for run lean
    e._sprLastX = e.x;
    e._sprLastY = e.y;
    if (px === undefined || py === undefined) return false;
    return Math.abs(e.x - px) + Math.abs(e.y - py) > this.CFG.MOVE_EPS;
  },

  /**
   * facingSign(angle, prev) — pure. +/-DEFAULT_FACING; inside the vertical deadzone keeps prev.
   */
  facingSign(angle, prev) {
    const c = Math.cos(angle);
    if (Math.abs(c) < this.CFG.FACING_DEADZONE && prev) return prev;
    return c < 0 ? -this.CFG.DEFAULT_FACING : this.CFG.DEFAULT_FACING;
  },

  /**
   * spriteLayout({ r, frameH, trimY, trimH, heightPerR }) — pure.
   * Scales visible content to r * heightPerR; with trim, anchors exactly at the bottom of visible pixels.
   */
  spriteLayout({ r, frameH, trimY, trimH, trimW, heightPerR }) {
    const hpr = heightPerR || this.CFG.HEIGHT_PER_R;
    let contentH, anchorY;
    if (trimH > 0) {
      contentH = trimH;
      anchorY = ((trimY || 0) + trimH) / frameH;
    } else {
      contentH = frameH;
      anchorY = this.CFG.FEET_ANCHOR_Y;
    }
    let scale = (r * hpr) / contentH;
    // 02-07 D-08a: clamp width for wide single-pose art (coiled naga, hulking bhuta) so it doesn't balloon.
    if (trimW > 0) scale = Math.min(scale, (r * this.CFG.MAX_WIDTH_PER_R) / trimW);
    return { scale, anchorY, dy: r * this.CFG.FEET_OFFSET_R };
  },

  /**
   * heightPerRFor(key, e) — pure.
   */
  heightPerRFor(key, e) {
    const o = this.CFG.HEIGHT_PER_R_OVERRIDE[key];
    if (o) return o;
    return e && e.boss ? this.CFG.BOSS_HEIGHT_PER_R : this.CFG.HEIGHT_PER_R;
  },

  // ---------------- Procedural animation (02-07, pure — no Pixi) ----------------

  /** Non-player states that read as a wind-up crouch (explicit set + any state ending in "Wind"). */
  WINDUP_STATES: new Set(['wind', 'charging']),

  /**
   * procStateFor(e, moved) — pure.
   * Maps enemy/boss wind-up states to 'windup'; otherwise defers to animForEntity (unchanged).
   */
  procStateFor(e, moved) {
    const isPlayer = e.spriteKey === 'player' || e.type === undefined;
    if (!isPlayer) {
      const s = e.state || '';
      if (this.WINDUP_STATES.has(s) || /Wind$/.test(s)) return 'windup';
    }
    return this.animForEntity(e, moved);
  },

  /**
   * procAnim(state, t, o) — pure. Returns { sx, sy, dyR, rot } for the given procedural state.
   * dyR is in units of r; the caller multiplies by e.r. Always breathes underneath (idle base),
   * except 'dash'/'windup' which fully override sx/sy, and 'stunned' which locks the transform.
   */
  procAnim(state, t, o = {}) {
    const { phase = 0, lean = 0, hit = 0, attackT = 0, asleep = false, stunned = false } = o;
    const C = this.CFG;
    const TAU = Math.PI * 2;
    const clamp1 = (v) => Math.max(-1, Math.min(1, v));

    const b = Math.sin(TAU * C.IDLE_HZ * (asleep ? C.ASLEEP_SLOW : 1) * t + phase);
    let sx = 1 - C.IDLE_BREATH * 0.5 * b;
    let sy = 1 + C.IDLE_BREATH * b;
    let dyR = 0;
    let rot = 0;

    if (state === 'run') {
      const s = Math.abs(Math.sin(TAU * C.RUN_HZ * t * 0.5 + phase));
      dyR = -C.RUN_BOB_R * s;
      sy *= 1 - 0.04 * (1 - s);
      rot = C.RUN_LEAN * clamp1(lean);
    } else if (state === 'dash') {
      sx = 1 + C.DASH_STRETCH;
      sy = 1 - C.DASH_STRETCH * 0.6;
      rot = C.RUN_LEAN * 1.5 * clamp1(lean);
      dyR = 0;
    } else if (state === 'attack') {
      const k = Math.max(0, Math.min(1, attackT));
      sx *= 1 + C.ATTACK_STRETCH * k;
      sy *= 1 - C.ATTACK_STRETCH * 0.6 * k;
    } else if (state === 'windup') {
      sy = 1 - C.WINDUP_SQUASH;
      sx = 1 + C.WINDUP_SQUASH * 0.6;
      rot = C.WINDUP_TREMBLE * Math.sin(t * TAU * 20 + phase);
    }

    if (stunned) { sx = 1; sy = 1; dyR = 0; rot = 0; }

    sx *= 1 + C.HIT_SQUASH * hit;
    sy *= 1 - C.HIT_SQUASH * hit;

    return { sx, sy, dyR, rot };
  },

  /**
   * flashAmount(e) — pure. Returns 0..1 white-flash blend: player ramps down over hurtT,
   * others are a flat hit flash while e.flash>0; boss phase-transition flash takes the max.
   */
  flashAmount(e) {
    const C = this.CFG;
    const isPlayer = e.spriteKey === 'player' || e.type === undefined;
    const v = isPlayer
      ? (e.hurtT > 0 ? C.FLASH_MAX * Math.min(1, e.hurtT / C.PLAYER_HURT_DUR) : 0)
      : (e.flash > 0 ? C.FLASH_MAX : 0);
    const phaseFlash = e._sprPhaseFlashT > 0 ? C.FLASH_MAX * Math.min(1, e._sprPhaseFlashT / C.PHASE_FLASH_DUR) : 0;
    return Math.max(v, phaseFlash);
  },

  /**
   * blinkAlpha(e, t) — pure. Mirrors the legacy semi-transparent iframes blink; 1 when not invincible.
   */
  blinkAlpha(e, t) {
    if (e.iframes > 0) {
      const v = 0.675 + 0.325 * Math.sin(t * 40);
      return Math.max(0.35, Math.min(0.999, v));
    }
    return 1;
  },

  /**
   * spawnPose(e) — pure. Fade + scale in over CFG.SPAWN_DUR while e.spawnT>0; passthrough otherwise.
   */
  spawnPose(e) {
    const C = this.CFG;
    if (!(e.spawnT > 0)) return { alpha: 1, scale: 1 };
    const p = Math.max(0, Math.min(1, 1 - e.spawnT / C.SPAWN_DUR));
    return { alpha: p, scale: C.SPAWN_MIN_SCALE + (1 - C.SPAWN_MIN_SCALE) * p };
  },

  /**
   * deathPose(t) — pure. Shrink + fade over CFG.DEATH_DUR; done=true once complete.
   */
  deathPose(t) {
    const C = this.CFG;
    const p = Math.max(0, Math.min(1, t / C.DEATH_DUR));
    return { alpha: 1 - p, scale: 1 - 0.6 * p, rot: 0.35 * p, done: p >= 1 };
  },

  /**
   * textureAnimFor(e, available, procState) — pure. Picks the boss 'phase2' texture at 50% hp
   * when the atlas has one; otherwise falls back through pickAnim (idle when procState is missing).
   */
  textureAnimFor(e, available, procState) {
    if (e.boss && e.phase === 2 && available.indexOf('phase2') !== -1) return 'phase2';
    return this.pickAnim(available, procState);
  },

  /**
   * headY(e, key) — pure. Screen y of the sprite's head, used by game.js overlays to place
   * pips/text above a sprite-rendered actor without touching entities.js.
   */
  headY(e, key) {
    return e.y + e.r * this.CFG.FEET_OFFSET_R - e.r * this.heightPerRFor(key, e);
  },

  /**
   * ghostAlpha(t) — pure. Dash afterimage alpha, ramping to CFG.GHOST_ALPHA over CFG.TRAIL_LIFE.
   */
  ghostAlpha(t) {
    const C = this.CFG;
    const p = Math.max(0, Math.min(1, t / C.TRAIL_LIFE));
    return p * C.GHOST_ALPHA;
  },

  // ---------------- Ground markers (quick-260926-djs, pure — no Pixi) ----------------

  /**
   * parseColor(c) — pure. Converts a '#rrggbb' CSS hex string (the format DATA.color / e.color
   * already use for ctx.fillStyle) into a 0xRRGGBB number for Pixi Graphics fill/stroke. Passes
   * numbers through unchanged; falls back to white for anything else (missing/malformed color).
   */
  parseColor(c) {
    if (typeof c === 'number') return c;
    if (typeof c === 'string' && c.charCodeAt(0) === 35 /* '#' */) {
      const n = parseInt(c.slice(1), 16);
      if (Number.isFinite(n)) return n;
    }
    return 0xffffff;
  },

  /**
   * groundMarkerSpec(e, phase) — pure. Sizing/color spec for the ground-plane readability marker
   * (drawMarker): a soft gold pulsing ring under the player, a dark contact shadow + faint
   * DATA-color rim under sprite-rendered enemies/bosses. `phase` is a plain number (GAME.time
   * when available) driving only the player's pulse — safe to omit (defaults to 0, no pulse).
   */
  groundMarkerSpec(e, phase = 0) {
    const C = this.CFG;
    const isPlayer = e.spriteKey === 'player' || e.type === undefined;
    const kind = isPlayer ? 'player' : (e.boss ? 'boss' : 'enemy');
    const sizeMul = kind === 'boss' ? C.BOSS_MARKER_SCALE : 1;
    const rx = e.r * (C.RING_W_PER_R / 2) * sizeMul;
    const ry = e.r * C.RING_H_RATIO * sizeMul;
    const color = isPlayer ? C.RING_PLAYER_COLOR : this.parseColor(e.color);
    const alpha = isPlayer ? C.RING_PLAYER_ALPHA : C.RIM_ALPHA;
    const shadowAlpha = C.MARKER_SHADOW_ALPHA;
    const pulse = isPlayer ? 1 + 0.15 * Math.sin(phase * Math.PI * 2 * 0.9) : 1;
    return { kind, rx, ry, color, alpha, shadowAlpha, pulse };
  },

  // ---------------- Weapon overlay + biome bg (02-10, pure — no Pixi) ----------------

  WEAPON_KINDS: { khanda: 'sword', gandiva: 'bow', gada: 'mace' },

  /**
   * weaponKindFor(w) — pure. Named weapons map explicitly; otherwise bow/melee type decides.
   * Safe for undefined (no weapon equipped yet) — defaults to 'sword'.
   */
  weaponKindFor(w) {
    if (w && this.WEAPON_KINDS[w.id]) return this.WEAPON_KINDS[w.id];
    return (w && w.type === 'bow') ? 'bow' : 'sword';
  },

  /**
   * weaponPose(e) — pure. Hand position (foreshortened along aim), rotation (aim, or swept during
   * a melee swing with alternating combo direction), reach bulge mid-swing, bow draw-back pull,
   * and a z key for front/behind-body draw order.
   */
  weaponPose(e) {
    const C = this.CFG;
    const kind = this.weaponKindFor(e.weapon);
    const x = e.x + Math.cos(e.aim) * e.r * C.WEAPON_HAND_R;
    const y = e.y + e.r * C.WEAPON_HAND_DY + Math.sin(e.aim) * e.r * C.WEAPON_HAND_R * 0.5;

    let rot, swingP, reach;
    const swing = e.swing;
    if (kind !== 'bow' && swing && swing.t > 0) {
      const p = 1 - Math.max(0, Math.min(1, swing.t / C.SWING_DUR));
      const ease = 1 - Math.pow(1 - p, 3);
      const dir = (e.comboIdx % 2 === 1) ? 1 : -1;
      rot = swing.a + dir * (-swing.arc / 2 + swing.arc * ease);
      swingP = p;
      reach = 1 + C.WEAPON_REACH_BULGE * Math.sin(p * Math.PI);
    } else {
      rot = e.aim;
      swingP = -1;
      reach = 1;
    }

    const pull = (kind === 'bow' && e.charging) ? Math.max(0, Math.min(1, e.charge)) : 0;
    const z = e.y + (Math.sin(rot) > -0.2 ? 1 : -1);

    return { kind, x, y, rot, z, swingP, reach, pull };
  },

  /**
   * bgKeyFor(b) / bgPathFor(b) — pure. Biome id -> texture key / asset path.
   */
  bgKeyFor(b) {
    return 'bg:' + b.id;
  },
  bgPathFor(b) {
    return 'assets/sprites/biomes/' + b.id + '-bg.png';
  },

  /**
   * hasTexture(key) — pure (once loaded). false in headless/zero-asset state.
   */
  textures: {},
  hasTexture(key) {
    return !!this.textures[key];
  },

  /**
   * loadTextures(list) — async, non-fatal (D-11). Same navigator/document/PIXI guard as load().
   * list: Array of { key, path } — e.g. { key: 'bg:naraka', path: 'assets/sprites/biomes/naraka-bg.png' }.
   */
  async loadTextures(list) {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
    const PIXI = (typeof window !== 'undefined' && window.PIXI);
    if (!PIXI) return;
    for (const entry of list) {
      try {
        this.textures[entry.key] = await PIXI.Assets.load(entry.path);
      } catch (e) {
        console.warn('[SPRITES] texture missing for "' + entry.key + '" — using primitive fallback', e);
        this._missing.add(entry.key);
      }
    }
  },

  // ---------------- Mark-and-sweep bookkeeping (no Pixi dependency) ----------------
  _frameId: 0,
  _tracked: new Set(),

  beginEntities() {
    this._frameId++;
  },

  _markSeen(e) {
    e._sprSeen = this._frameId;
    this._tracked.add(e);
  },

  /**
   * cullEntity(e) — CAM-05: an entity is off-screen this frame. Mark it seen (so endEntities()'
   * mark-and-sweep doesn't destroy/recreate its sprite next time it scrolls into view) and hide its
   * sprite/marker/weapon. drawEntity/drawWeapon re-show them the next time the entity is drawn.
   */
  cullEntity(e) {
    if (!e._pixiSprite) return;
    this._markSeen(e);
    e._pixiSprite.visible = false;
    if (e._pixiMarker) e._pixiMarker.visible = false;
    if (e._pixiWeapon) e._pixiWeapon.visible = false;
  },

  /**
   * endEntities() — destroy sprites of entities not drawn this frame
   * (replaced via G.enemies = [], or not rendered because we are in the hub).
   * Dead entities are retired (fade out via tickDying) instead of destroyed outright (02-07).
   */
  endEntities() {
    for (const e of Array.from(this._tracked)) {
      if (e._sprSeen !== this._frameId) {
        if (e.dead === true) this.retireEntity(e);
        else this.removeEntity(e);
      }
    }
    // If tickDying was not called this frame (e.g. hub / no render pass), don't let dying sprites leak.
    if (this._dying.length && this._dyingTick !== this._frameId) {
      for (const item of this._dying) {
        if (item.spr.parent) item.spr.parent.removeChild(item.spr);
        if (typeof item.spr.destroy === 'function') item.spr.destroy();
        if (item.marker) {   // quick-260926-djs: marker rides along with its dying sprite
          if (item.marker.parent) item.marker.parent.removeChild(item.marker);
          if (typeof item.marker.destroy === 'function') item.marker.destroy();
        }
      }
      this._dying.length = 0;
    }
    // Hide ghosts that were not refreshed this frame (e.g. player not sprite-rendered, or in the hub).
    if (this._ghosts && this._ghosts.length && this._ghostFrame !== this._frameId) {
      for (const g of this._ghosts) g.visible = false;
    }
  },

  clearEntities() {
    for (const e of Array.from(this._tracked)) this.removeEntity(e);
    for (const item of this._dying) {
      if (item.spr.parent) item.spr.parent.removeChild(item.spr);
      if (typeof item.spr.destroy === 'function') item.spr.destroy();
      if (item.marker) {   // quick-260926-djs: marker rides along with its dying sprite
        if (item.marker.parent) item.marker.parent.removeChild(item.marker);
        if (typeof item.marker.destroy === 'function') item.marker.destroy();
      }
    }
    this._dying.length = 0;
    for (const g of this._ghosts || []) {
      if (g.parent) g.parent.removeChild(g);
      if (typeof g.destroy === 'function') g.destroy();
    }
    this._ghosts = [];
  },

  /**
   * drawEntity(e)
   * Maintains a per-entity PixiJS sprite cache (e._pixiSprite).
   * Positions the sprite, swaps texture-anim when entity state changes, and composes the 02-07
   * procedural transform (breathing/run/dash/attack/windup/hit-squash/spawn-fade/blink) on top.
   */
  drawEntity(e) {
    const key = e.spriteKey || e.type;
    if (!key || !this.has(key) || !this.entityContainer) return;
    const sheet = this.sheets[key];
    if (!sheet) return;

    const moved = this.movedSince(e);
    const procState = this.procStateFor(e, moved);
    // Partial atlases (e.g. idle-only, or single-pose 'idle'+'phase2') fall back to idle;
    // 'windup' has no texture of its own, so it borrows the 'attack' texture (procAnim still poses it).
    const texAnim = this.textureAnimFor(e, Object.keys(sheet.animations || {}), procState === 'windup' ? 'attack' : procState);
    if (!texAnim) {
      if (e._pixiSprite) this._markSeen(e);   // keep whatever sprite exists; don't let the sweep kill it
      return;
    }

    if (!e._pixiSprite || e._pixiAnim !== texAnim) {
      const oldAnim = e._pixiAnim;
      // Create the replacement FIRST; only swap if it succeeds (never leave the entity without a sprite).
      const spr = this.createAnimatedSprite(key, texAnim);
      if (spr) {
        const old = e._pixiSprite;
        if (old) {
          if (old.parent) old.parent.removeChild(old);
          if (typeof old.destroy === 'function') old.destroy();
        }
        const tex = spr.textures[0];
        const layout = this.spriteLayout({
          r: e.r,
          frameH: tex.orig.height,
          trimY: tex.trim ? tex.trim.y : 0,
          trimH: tex.trim ? tex.trim.height : 0,
          trimW: tex.trim ? tex.trim.width : 0,
          heightPerR: this.heightPerRFor(key, e),
        });
        spr.anchor.set(0.5, layout.anchorY);
        e._pixiSprite = spr;
        e._pixiAnim   = texAnim;
        e._pixiLayout = layout;
        this.entityContainer.addChild(spr);
        // 02-07: boss phase transition (idle -> phase2) gets a one-shot white flash.
        if (e.boss && oldAnim === 'idle' && texAnim === 'phase2') {
          e._sprPhaseFlashT = this.CFG.PHASE_FLASH_DUR;
        }
      } else if (!e._pixiSprite) {
        return;
      }
    }

    const spr = e._pixiSprite;
    spr.visible = true;   // CAM-05: re-show after a possible cullEntity() while off-screen
    const layout = e._pixiLayout;
    const isPlayerEntity = e.spriteKey === 'player' || e.type === undefined;
    // Facing: player faces aim; enemies/bosses face the player.
    let angle = 0;
    if (isPlayerEntity) {
      angle = e.aim || 0;
    } else if (typeof GAME !== 'undefined' && GAME.player) {
      angle = Math.atan2(GAME.player.y - e.y, GAME.player.x - e.x);
    }
    e._sprFacing = this.facingSign(angle, e._sprFacing);

    // 02-07: procedural transform composition.
    const G = (typeof GAME !== 'undefined') ? GAME : null;
    const t = G ? G.time : 0;
    const dt = G ? G.dt : 0;
    if (e._sprPhase === undefined) e._sprPhase = (e.spriteKey === 'player') ? 0 : Math.random() * Math.PI * 2;
    if (e._sprPhaseFlashT > 0) e._sprPhaseFlashT = Math.max(0, e._sprPhaseFlashT - dt);
    const lean = Math.max(-1, Math.min(1, (e._sprVX || 0) / 6));
    let attackT;
    if (e.spriteKey === 'player') {
      attackT = (e.swing && e.swing.t > 0) ? e.swing.t / this.CFG.SWING_DUR : 0;
    } else {
      attackT = procState === 'attack' ? 1 : 0;
    }
    const flash = this.flashAmount(e);
    const pa = this.procAnim(procState, t, { phase: e._sprPhase, lean, hit: flash > 0 ? 1 : 0, attackT, asleep: !!e.asleep, stunned: e.stun > 0 });
    const sp = this.spawnPose(e);

    spr.scale.set(layout.scale * e._sprFacing * pa.sx * sp.scale, layout.scale * pa.sy * sp.scale);
    spr.x = e.x;
    spr.y = e.y + layout.dy + pa.dyR * e.r;
    spr.rotation = pa.rot;
    spr.alpha = sp.alpha * this.blinkAlpha(e, t);
    spr.zIndex = e.y;          // lower on screen draws in front
    this._applyFlash(spr, flash, isPlayerEntity);
    this.drawMarker(e, t);     // quick-260926-djs: ground-plane readability ring/shadow, under the sprite
    this._markSeen(e);

    if (e.spriteKey === 'player') this.drawGhosts(e);
  },

  /**
   * _applyFlash(spr, k, isPlayer) — lazily attaches/detaches a ColorMatrixFilter that lerps the
   * sprite's color toward white by k (0..1); filters are only attached while flashing (near-zero
   * per-frame cost otherwise). OFF=1: the vendored Pixi v8 GL fragment shader (color-matrix-filter)
   * does `result.r = uColorMatrix[0]*color.r + ... + uColorMatrix[4]` against color already
   * normalized to 0..1 (texture sample, alpha-unpremultiplied) — so the offset column adds
   * directly, no /255.
   *
   * quick-260926-djs: when isPlayer, a second lazily-built ColorMatrixFilter applies a flat
   * CFG.PLAYER_LIFT brightness (via the real `.brightness()` method, confirmed present on the
   * vendored ColorMatrixFilter) and is composed with the flash filter as a two-entry filters
   * array — Pixi runs filters in sequence, so this needs no manual matrix-multiplication. Built
   * once and left untouched afterward (steady-state cost is just the extra filter pass).
   */
  _applyFlash(spr, k, isPlayer) {
    if (!spr) return;
    let liftF = spr._liftF;
    if (isPlayer && !liftF) {
      try {
        const PIXI = window.PIXI;
        liftF = new PIXI.ColorMatrixFilter();
        liftF.brightness(this.CFG.PLAYER_LIFT, false);
        spr._liftF = liftF;
      } catch (err) {
        // Composing the lift is best-effort (D-11-style): skip it and rely on the ground ring.
        liftF = null;
      }
    }
    if (k > 0) {
      try {
        const PIXI = window.PIXI;
        if (!spr._flashF) spr._flashF = new PIXI.ColorMatrixFilter();
        const OFF = 1;
        spr._flashF.matrix = [
          1 - k, 0, 0, 0, k * OFF,
          0, 1 - k, 0, 0, k * OFF,
          0, 0, 1 - k, 0, k * OFF,
          0, 0, 0, 1, 0,
        ];
        spr.filters = (isPlayer && liftF) ? [liftF, spr._flashF] : [spr._flashF];
      } catch (err) {
        if (!this._flashWarned) { console.warn('[SPRITES] ColorMatrixFilter unavailable — flash disabled', err); this._flashWarned = true; }
        spr.filters = null;
        spr.tint = 0xffffff;
      }
    } else {
      spr.filters = (isPlayer && liftF) ? [liftF] : null;
    }
  },

  // ---------------- Death fade-out pool (02-07) ----------------
  _dying: [],
  _dyingTick: -1,

  /**
   * retireEntity(e) — instead of destroying a dead entity's sprite immediately, hand it to the
   * dying pool so tickDying can shrink/fade it over CFG.DEATH_DUR. The entity stops being tracked.
   */
  retireEntity(e) {
    const spr = e._pixiSprite;
    const marker = e._pixiMarker;   // quick-260926-djs: fades alongside the sprite in tickDying below
    if (spr) {
      this._dying.push({ spr, marker, t: 0, bx: spr.scale.x, by: spr.scale.y });
    } else if (marker) {
      this._destroyMarker(e);       // edge case: marker without a sprite (texAnim missing) — no fade to run
    }
    e._pixiSprite = null;
    e._pixiAnim   = null;
    e._pixiLayout = null;
    e._pixiMarker = null;
    e._markerKey  = null;
    this._destroyWeapon(e);   // 02-10: a dead player's weapon disappears with it
    this._tracked.delete(e);
  },

  /**
   * tickDying(dt) — advances every retired sprite's death fade; destroys + removes on completion.
   * The ground marker (if any) fades alongside the sprite (quick-260926-djs) and is destroyed
   * together with it. Headless-safe: a no-op when _dying is empty (smoke tests never populate it).
   */
  tickDying(dt) {
    this._dyingTick = this._frameId;
    for (let i = this._dying.length - 1; i >= 0; i--) {
      const item = this._dying[i];
      item.t += dt;
      const pose = this.deathPose(item.t);
      const spr = item.spr;
      spr.alpha = pose.alpha;
      spr.scale.set(item.bx * pose.scale, item.by * pose.scale);
      spr.rotation = pose.rot * Math.sign(item.bx || 1);
      this._applyFlash(spr, item.t < 0.08 ? this.CFG.FLASH_MAX : 0);
      if (item.marker) item.marker.alpha = pose.alpha;
      if (pose.done) {
        if (spr.parent) spr.parent.removeChild(spr);
        if (typeof spr.destroy === 'function') spr.destroy();
        if (item.marker) {
          if (item.marker.parent) item.marker.parent.removeChild(item.marker);
          if (typeof item.marker.destroy === 'function') item.marker.destroy();
        }
        this._dying.splice(i, 1);
      }
    }
  },

  // ---------------- Dash afterimages (02-07) ----------------
  _ghosts: [],
  _ghostFrame: -1,

  /**
   * drawGhosts(e) — pools tinted afterimage sprites along e.trail (player dash only). Ghosts are
   * lazily created up to CFG.GHOST_MAX and hidden (not destroyed) once their trail point expires.
   */
  drawGhosts(e) {
    if (!this.entityContainer || !e._pixiSprite) return;
    const trail = e.trail || [];
    const layout = e._pixiLayout;
    const pts = trail.slice(Math.max(0, trail.length - this.CFG.GHOST_MAX));
    if (!this._ghosts) this._ghosts = [];
    try {
      const PIXI = window.PIXI;
      for (let i = 0; i < pts.length; i++) {
        let g = this._ghosts[i];
        if (!g) {
          g = new PIXI.Sprite(e._pixiSprite.texture);
          this.entityContainer.addChild(g);
          this._ghosts[i] = g;
        }
        const pt = pts[i];
        g.texture = e._pixiSprite.texture;
        g.anchor.set(e._pixiSprite.anchor.x, e._pixiSprite.anchor.y);
        g.scale.set(layout.scale * e._sprFacing, layout.scale);
        g.x = pt.x;
        g.y = pt.y + layout.dy;
        g.alpha = this.ghostAlpha(pt.t);
        g.tint = this.CFG.GHOST_TINT;
        g.zIndex = pt.y - 0.5;
        g.visible = true;
      }
      for (let i = pts.length; i < this._ghosts.length; i++) {
        if (this._ghosts[i]) this._ghosts[i].visible = false;
      }
      this._ghostFrame = this._frameId;
    } catch (err) {
      if (!this._ghostWarned) { console.warn('[SPRITES] dash ghosts unavailable', err); this._ghostWarned = true; }
    }
  },

  // ---------------- Ground marker Pixi runtime (quick-260926-djs) ----------------

  /**
   * drawMarker(e, t) — lazily creates ONE PIXI.Graphics marker per entity (`e._pixiMarker`),
   * added to entityContainer (chosen over bgContainer/a dedicated layer: entityContainer already
   * sorts by zIndex=e.y every frame, so `zIndex = spriteZ - 0.5` sits the marker directly under
   * that entity's sprite for free, with no extra layer or draw-order bookkeeping) — sits above the
   * bridge-canvas floor wash (bgContainer) and below all entity sprites. The Graphics content
   * (ellipse sizes/colors from groundMarkerSpec) is only rebuilt when the cached spec key changes;
   * every other frame this just repositions/re-alphas the existing object (no new Pixi objects).
   */
  drawMarker(e, t) {
    if (!this.entityContainer) return;
    try {
      const spec = this.groundMarkerSpec(e, t);
      if (!e._pixiMarker) {
        const PIXI = window.PIXI;
        e._pixiMarker = new PIXI.Graphics();
        this.entityContainer.addChild(e._pixiMarker);
        e._markerKey = null;
      }
      const marker = e._pixiMarker;
      const key = spec.kind + ':' + spec.rx.toFixed(2) + ':' + spec.ry.toFixed(2) + ':' + spec.color;
      if (e._markerKey !== key) {
        marker.clear();
        // Dark contact shadow — common to every kind, grounds the sprite against any floor art.
        marker.ellipse(0, 0, spec.rx, spec.ry).fill({ color: 0x000000, alpha: spec.shadowAlpha });
        if (spec.kind === 'player') {
          // Soft outer glow (2 concentric ellipses, decreasing alpha outward) + a thin gold ring.
          marker.ellipse(0, 0, spec.rx * 1.6, spec.ry * 1.6).fill({ color: spec.color, alpha: spec.alpha * 0.18 });
          marker.ellipse(0, 0, spec.rx * 1.25, spec.ry * 1.25).fill({ color: spec.color, alpha: spec.alpha * 0.3 });
          marker.ellipse(0, 0, spec.rx, spec.ry).stroke({ width: 1.5, color: spec.color, alpha: spec.alpha });
        } else {
          // Faint rim in the entity's DATA color, slightly outside the shadow ellipse.
          marker.ellipse(0, 0, spec.rx * 1.15, spec.ry * 1.15).stroke({ width: 1.5, color: spec.color, alpha: spec.alpha });
        }
        e._markerKey = key;
      }
      const layout = e._pixiLayout;
      marker.x = e.x;
      marker.y = e.y + (layout ? layout.dy : e.r * this.CFG.FEET_OFFSET_R);   // same feet anchor as the sprite
      marker.zIndex = e.y - 0.5;
      const spr = e._pixiSprite;
      marker.alpha = spec.pulse * (spr ? spr.alpha : 1);   // player pulse ±15%; fades with spawn/iframes/death
      marker.visible = true;
    } catch (err) {
      if (!this._markerWarned) { console.warn('[SPRITES] ground marker unavailable', err); this._markerWarned = true; }
    }
  },

  /**
   * _destroyMarker(e) — detaches + destroys an entity's ground marker (if any) and clears its
   * fields. Called from removeEntity (immediate despawn) and from retireEntity's no-sprite edge
   * case; the normal death path instead hands the marker into the _dying pool (see retireEntity)
   * so it fades alongside the sprite instead of vanishing outright.
   */
  _destroyMarker(e) {
    const m = e._pixiMarker;
    if (m) {
      if (m.parent) m.parent.removeChild(m);
      if (typeof m.destroy === 'function') m.destroy();
    }
    e._pixiMarker = null;
    e._markerKey = null;
  },

  // ---------------- Weapon overlay Pixi runtime (02-10) ----------------

  /**
   * _buildWeapon(kind) — builds a code-drawn khanda/gandiva/gada in a gold+steel palette.
   * Art is authored for r=13 along the +x axis, grip/limb-center at the local origin.
   * Returns { root, string } — string is a redrawn-per-frame Graphics child, bow only.
   */
  _buildWeapon(kind) {
    const PIXI = window.PIXI;
    const root = new PIXI.Container();
    const GOLD = 0xffd34d, DEEP_GOLD = 0xa87b1d, STEEL = 0xd9dde6, LEATHER = 0x3a2412, OUTLINE = 0x1a0f08;
    let string = null;

    if (kind === 'mace') {
      const g = new PIXI.Graphics();
      g.rect(0, -1.8, 26, 3.6).fill({ color: DEEP_GOLD });                 // shaft
      for (const bx of [6, 13, 20]) g.rect(bx, -1.8, 2, 3.6).fill({ color: GOLD }); // bands
      g.circle(31, 0, 8).fill({ color: 0xc9a13a }).stroke({ width: 1, color: OUTLINE }); // head
      for (let i = 0; i < 8; i++) {                                        // flanges
        const a = (i / 8) * Math.PI * 2;
        const bx = 31 + Math.cos(a) * 8, by = Math.sin(a) * 8;
        const tx = 31 + Math.cos(a) * 12, ty = Math.sin(a) * 12;
        const px = -Math.sin(a) * 2, py = Math.cos(a) * 2;
        g.poly([bx - px, by - py, bx + px, by + py, tx, ty]).fill({ color: STEEL });
      }
      g.circle(40, 0, 2.2).fill({ color: GOLD });                          // top knob
      g.moveTo(24, -1.6).lineTo(2, -1.6).stroke({ width: 1, color: 0xffffff, alpha: 0.4 }); // highlight
      root.addChild(g);
    } else if (kind === 'bow') {
      const g = new PIXI.Graphics();
      g.moveTo(4, -20).quadraticCurveTo(14, -12, 12, 0).quadraticCurveTo(14, 12, 4, 20)
        .stroke({ width: 5, color: OUTLINE });
      g.moveTo(4, -20).quadraticCurveTo(14, -12, 12, 0).quadraticCurveTo(14, 12, 4, 20)
        .stroke({ width: 3, color: GOLD });
      g.rect(10, -3, 4, 6).fill({ color: LEATHER });                       // grip
      g.circle(4, -20, 1.6).fill({ color: GOLD });
      g.circle(4, 20, 1.6).fill({ color: GOLD });                          // tip caps
      root.addChild(g);
      string = new PIXI.Graphics();                                       // redrawn per-frame (drawWeapon)
      root.addChild(string);
    } else {
      // sword (khanda) — default: straight double-edged blade with a broadened tip.
      const g = new PIXI.Graphics();
      g.rect(0, -1.6, 8, 3.2).fill({ color: LEATHER });                    // grip
      g.circle(-1, 0, 2.6).fill({ color: GOLD });                          // pommel
      g.rect(8, -5, 3, 10).fill({ color: GOLD });                          // crossguard
      g.circle(9.5, -5, 1.2).fill({ color: GOLD });
      g.circle(9.5, 5, 1.2).fill({ color: GOLD });                         // finials
      g.poly([11, -2.2, 34, -2.6, 38, -3.4, 42, 0, 38, 3.4, 34, 2.6, 11, 2.2])
        .fill({ color: STEEL }).stroke({ width: 1, color: OUTLINE });      // blade
      g.moveTo(12, -0.6).lineTo(36, -0.6).stroke({ width: 1, color: 0xffffff, alpha: 0.55 }); // fuller highlight
      root.addChild(g);
    }

    return { root, string };
  },

  /**
   * drawWeapon(e) — draws/updates the player's equipped weapon each frame. No weapon art without
   * a live player sprite. Never throws: a failure here must not break the frame.
   */
  drawWeapon(e) {
    if (!this.entityContainer || !e._pixiSprite) return;
    try {
      const pose = this.weaponPose(e);
      if (e._pixiWeaponKind !== pose.kind) {
        if (e._pixiWeapon) {
          if (e._pixiWeapon.parent) e._pixiWeapon.parent.removeChild(e._pixiWeapon);
          e._pixiWeapon.destroy({ children: true });
        }
        const built = this._buildWeapon(pose.kind);
        e._pixiWeapon = built.root;
        e._pixiWeaponString = built.string;
        e._pixiWeaponKind = pose.kind;
        this.entityContainer.addChild(e._pixiWeapon);
      }

      const root = e._pixiWeapon;
      root.visible = true;   // CAM-05: re-show after a possible cullEntity() while off-screen
      root.position.set(pose.x, pose.y);
      root.rotation = pose.rot;
      const s = e.r * this.CFG.WEAPON_SCALE_PER_R;
      root.scale.set(s * pose.reach, s * (Math.cos(pose.rot) < 0 ? -1 : 1));   // flip Y so art stays right-side up
      root.zIndex = pose.z;
      root.alpha = e._pixiSprite.alpha;   // inherits the iframes blink

      if (pose.kind === 'bow' && e._pixiWeaponString) {
        const str = e._pixiWeaponString;
        str.clear();
        str.moveTo(4, -20).lineTo(4 - 14 * pose.pull, 0).lineTo(4, 20).stroke({ width: 1, color: 0xf2e6c8 });
        if (pose.pull > 0) {
          str.moveTo(4 - 14 * pose.pull, 0).lineTo(34, 0).stroke({ width: 1.5, color: 0xd9dde6 });
          str.poly([34, -2, 40, 0, 34, 2]).fill({ color: 0xd9dde6 });   // nocked arrow tip
        }
      }
    } catch (err) {
      if (!this._weaponWarned) { console.warn('[SPRITES] weapon overlay unavailable', err); this._weaponWarned = true; }
    }
  },

  /**
   * _destroyWeapon(e) — detaches + destroys an entity's weapon (if any) and clears its fields.
   * Called from both removeEntity and retireEntity so a dead/despawned player's weapon never leaks.
   */
  _destroyWeapon(e) {
    const w = e._pixiWeapon;
    if (w) {
      if (w.parent) w.parent.removeChild(w);
      w.destroy({ children: true });
    }
    e._pixiWeapon = null;
    e._pixiWeaponKind = null;
    e._pixiWeaponString = null;
  },

  // ---------------- Biome background sprite (02-10) ----------------

  /**
   * setBackground(key, rect) — shows the cover-fit illustrated biome background below the bridge
   * canvas (worldContainer index 0), or hides it when key is falsy / the texture hasn't loaded
   * (D-11). `rect` defaults to the legacy shake-padded viewport rect (-30,-30,1340,780); Phase 05.1
   * passes the current room's world rect (expanded by the shake margin) so the background covers
   * larger arenas; Phase 05.4 art up to 2400x1440 is placed against ROOMS.worldRect().
   */
  setBackground(key, rect = { x: -30, y: -30, w: 1340, h: 780 }) {
    if (!this.worldContainer) return false;
    const tex = key && this.textures[key];
    if (tex) {
      if (!this.bgSprite) {
        const PIXI = window.PIXI;
        this.bgSprite = new PIXI.Sprite(tex);
        this.worldContainer.addChildAt(this.bgSprite, 0);   // below bridgeSprite (D-11 fallback stays underneath)
      } else if (this.bgSprite.texture !== tex) {
        this.bgSprite.texture = tex;
      }
      const fit = this.coverFit(tex.width, tex.height, rect);
      this.bgSprite.scale.set(fit.scale);
      this.bgSprite.x = fit.x;
      this.bgSprite.y = fit.y;
      this.bgSprite.visible = true;
      return true;
    }
    if (this.bgSprite) this.bgSprite.visible = false;
    return false;
  },

  /**
   * removeEntity(e)
   * Detach + destroy an entity's sprite (always destroys, even when unparented) and stop tracking it.
   */
  removeEntity(e) {
    const spr = e._pixiSprite;
    if (spr) {
      if (spr.parent) spr.parent.removeChild(spr);
      if (typeof spr.destroy === 'function') spr.destroy();
    }
    e._pixiSprite = null;
    e._pixiAnim   = null;
    e._pixiLayout = null;
    this._destroyMarker(e);   // quick-260926-djs: ground marker lifecycle mirrors the sprite lifecycle
    this._destroyWeapon(e);   // 02-10: weapon lifecycle mirrors the sprite lifecycle
    this._tracked.delete(e);
  },
};
