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

  /**
   * _animFor(e)
   * Map entity state to animation name.
   */
  _animFor(e) {
    // Player animation mapping
    if (e.spriteKey === 'player' || e.type === undefined) {
      if (e.dashT > 0) return 'dash';
      if (e.swing && e.swing.t > 0) return 'attack';
      if (e.vx !== undefined && (Math.abs(e.vx) > 1 || Math.abs(e.vy) > 1)) return 'run';
      return 'idle';
    }
    // Enemy / boss animation mapping
    const s = e.state || '';
    if (s === 'wind' || s === 'lunge' || s === 'strike' || s === 'charge' ||
        s === 'slam' || s === 'cast' || s === 'spin' || s === 'sweep') return 'attack';
    if (s === 'chase' || s === 'approach' || s === 'retreat') return 'run';
    return 'idle';
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
    const animName = this._animFor(e);

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
   * Remove a dead entity's sprite from the scene graph.
   */
  removeEntity(e) {
    if (e._pixiSprite) {
      if (e._pixiSprite.parent) {
        e._pixiSprite.parent.removeChild(e._pixiSprite);
        e._pixiSprite.destroy();
      }
      e._pixiSprite = null;
      e._pixiAnim   = null;
    }
  },
};
