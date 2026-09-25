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
  },

  /**
   * uploadBridge()
   * Re-upload the bridge canvas contents to the Pixi texture after all primitives are drawn.
   */
  uploadBridge() {
    if (this.bridgeTexture) this.bridgeTexture.source.update();
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
    spr.anchor.set(0.5);
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
  spriteLayout({ r, frameH, trimY, trimH, heightPerR }) {
    const hpr = heightPerR || this.CFG.HEIGHT_PER_R;
    let contentH, anchorY;
    if (trimH > 0) {
      contentH = trimH;
      anchorY = ((trimY || 0) + trimH) / frameH;
    } else {
      contentH = frameH;
      anchorY = this.CFG.FEET_ANCHOR_Y;
    }
    return { scale: (r * hpr) / contentH, anchorY, dy: r * this.CFG.FEET_OFFSET_R };
  },

  /**
   * heightPerRFor(key, e) — pure.
   */
  heightPerRFor(key, e) {
    const o = this.CFG.HEIGHT_PER_R_OVERRIDE[key];
    if (o) return o;
    return e && e.boss ? this.CFG.BOSS_HEIGHT_PER_R : this.CFG.HEIGHT_PER_R;
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

    const PIXI = window.PIXI;
    const animName = this.animForEntity(e, this.movedSince(e));

    if (!e._pixiSprite || e._pixiAnim !== animName) {
      // Remove old sprite if animation changed
      if (e._pixiSprite && e._pixiSprite.parent) {
        e._pixiSprite.parent.removeChild(e._pixiSprite);
        e._pixiSprite.destroy();
      }
      const spr = this.createAnimatedSprite(key, animName);
      if (!spr) return;
      e._pixiSprite = spr;
      e._pixiAnim   = animName;
      this.entityContainer.addChild(spr);
    }

    // Update position each frame
    e._pixiSprite.x = e.x;
    e._pixiSprite.y = e.y;
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
