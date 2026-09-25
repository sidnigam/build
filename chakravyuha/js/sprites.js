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
    if (this.bridgeCtx) this.bridgeCtx.clearRect(0, 0, 1280, 720);
    if (this.hudBridgeCtx) this.hudBridgeCtx.clearRect(0, 0, 1280, 720);
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
    spr.loop = (anim === 'idle' || anim === 'run');
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
   * endEntities() — destroy sprites of entities not drawn this frame
   * (replaced via G.enemies = [], or not rendered because we are in the hub).
   */
  endEntities() {
    for (const e of Array.from(this._tracked)) {
      if (e._sprSeen !== this._frameId) this.removeEntity(e);
    }
  },

  clearEntities() {
    for (const e of Array.from(this._tracked)) this.removeEntity(e);
  },

  /**
   * drawEntity(e)
   * Maintains a per-entity PixiJS sprite cache (e._pixiSprite).
   * Positions the sprite and swaps animation when entity state changes.
   */
  drawEntity(e) {
    const key = e.spriteKey || e.type;
    if (!key || !this.has(key) || !this.entityContainer) return;
    const sheet = this.sheets[key];
    if (!sheet) return;

    const moved = this.movedSince(e);
    const want = this.animForEntity(e, moved);
    // Partial atlases (e.g. idle-only) fall back to idle instead of blinking out.
    const animName = this.pickAnim(Object.keys(sheet.animations || {}), want);
    if (!animName) {
      if (e._pixiSprite) this._markSeen(e);   // keep whatever sprite exists; don't let the sweep kill it
      return;
    }

    if (!e._pixiSprite || e._pixiAnim !== animName) {
      // Create the replacement FIRST; only swap if it succeeds (never leave the entity without a sprite).
      const spr = this.createAnimatedSprite(key, animName);
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
          heightPerR: this.heightPerRFor(key, e),
        });
        spr.anchor.set(0.5, layout.anchorY);
        e._pixiSprite = spr;
        e._pixiAnim   = animName;
        e._pixiLayout = layout;
        this.entityContainer.addChild(spr);
      } else if (!e._pixiSprite) {
        return;
      }
    }

    const spr = e._pixiSprite;
    const layout = e._pixiLayout;
    // Facing: player faces aim; enemies/bosses face the player.
    let angle = 0;
    if (e.spriteKey === 'player' || e.type === undefined) {
      angle = e.aim || 0;
    } else if (typeof GAME !== 'undefined' && GAME.player) {
      angle = Math.atan2(GAME.player.y - e.y, GAME.player.x - e.x);
    }
    e._sprFacing = this.facingSign(angle, e._sprFacing);
    spr.scale.set(layout.scale * e._sprFacing, layout.scale);
    spr.x = e.x;
    spr.y = e.y + layout.dy;   // feet at the bottom of the hitbox circle
    spr.zIndex = e.y;          // lower on screen draws in front
    this._markSeen(e);
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
    this._tracked.delete(e);
  },
};
