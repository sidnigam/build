// js/vfx.js — VFX global (Phase 3: pooled particle simulation + Pixi render)
// Mirror of CAMERA/SPRITES pattern — no module system, no Pixi reference at
// module scope. The simulation core is pure data and runs headless in
// test/smoke.js; Pixi is attached lazily on first render() in the browser.
'use strict';

const VFX = {
  CAP: 2048,
  pool: [],
  free: null,
  freeTop: 0,
  activeCount: 0,
  peak: 0,
  dropped: 0,
  ambientActive: 0,
  debug: false,
  stress: false,
  _tintCache: new Map(),
  _px: null,          // null headless; { sprites, tex, under, over, flash } once attached
  _pxFailed: false,
  PRESETS: {},

  // ---------------- pool bookkeeping ----------------
  _initPool() {
    this.pool = new Array(this.CAP);
    for (let i = 0; i < this.CAP; i++) {
      this.pool[i] = {
        active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, max: 1,
        r0: 3, r1: 3, color: '#fff', tint: 0xffffff, tex: 0, add: false,
        drag: 1, grav: 0, layer: 1, ambient: false, rot: 0,
      };
    }
    this.free = new Int32Array(this.CAP);
    for (let i = 0; i < this.CAP; i++) this.free[i] = i;
    this.freeTop = this.CAP;
  },

  _alloc() {
    if (this.freeTop === 0) { this.dropped++; return -1; }
    return this.free[--this.freeTop];
  },

  _release(i) {
    this.free[this.freeTop++] = i;
  },

  tintOf(css) {
    if (typeof css !== 'string') return 0xffffff;
    if (this._tintCache.has(css)) return this._tintCache.get(css);
    let tint = 0xffffff;
    if (css[0] === '#') {
      const hex = css.slice(1);
      if (hex.length === 3) {
        tint = parseInt(hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        tint = parseInt(hex, 16);
      }
      if (Number.isNaN(tint)) tint = 0xffffff;
    }
    this._tintCache.set(css, tint);
    return tint;
  },

  count(n) {
    if (typeof SETTINGS !== 'undefined' && SETTINGS.get('reducedParticles')) {
      return Math.max(1, Math.ceil(n * 0.35));
    }
    return n;
  },

  // ---------------- low-level spawner ----------------
  spawn(x, y, vx, vy, life, r0, r1, color, tex, add, drag, grav, layer, ambient) {
    const idx = this._alloc();
    if (idx < 0) return -1;
    const p = this.pool[idx];
    p.active = true;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.t = life; p.max = life;
    p.r0 = r0; p.r1 = r1;
    p.color = color;
    p.tint = this.tintOf(color);
    p.tex = tex || 0;
    p.add = !!add;
    p.drag = drag === undefined ? 1 : drag;
    p.grav = grav || 0;
    p.layer = layer === undefined ? 1 : layer;
    p.ambient = !!ambient;
    p.rot = Math.atan2(vy, vx);
    this.activeCount++;
    if (this.activeCount > this.peak) this.peak = this.activeCount;
    if (p.ambient) this.ambientActive++;
    return idx;
  },

  // legacy compatibility wrapper — see js/entities.js burst()
  burst(x, y, color, n = 8, spd = 160, life = 0.4, r = 3) {
    const cnt = this.count(n);
    for (let i = 0; i < cnt; i++) {
      const a = U.rand(U.TAU), s = U.rand(spd * 0.3, spd);
      const r0 = U.rand(r * 0.5, r);
      const idx = this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life, r0, r0, color, 0, false, 0.96, 0, 1, false);
      if (idx < 0) continue;
      const p = this.pool[idx];
      p.t = U.rand(life * 0.5, life);
      p.max = life;
    }
  },

  emit(name, x, y, angle, color) {
    const fn = this.PRESETS[name];
    if (!fn) return;
    fn.call(this, x, y, angle, color);
  },

  // ---------------- hitstop (VFX-03, D-09..D-11) ----------------
  // Converts frames (@60fps) to a duration in GAME.hitstop. Never stacks additively (max, not add).
  // Honours the SETTINGS.hitstop opt-out and the anti-chain grace window (GAME.hitstopCd).
  hitstop(frames) {
    if (typeof SETTINGS !== 'undefined' && SETTINGS.get('hitstop') === false) return;
    if (typeof GAME === 'undefined') return;
    if (GAME.hitstopCd > 0 && frames < 8) return;
    GAME.hitstop = Math.max(GAME.hitstop || 0, frames / 60);
  },

  // ---------------- simulation ----------------
  update(dt) {
    if (this.stress) {
      const A = (typeof GAME !== 'undefined' && GAME.arena) ? GAME.arena : { x: 0, y: 0, w: 1280, h: 720 };
      while (this.freeTop > 0) {
        this.spawn(
          U.rand(A.x, A.x + A.w), U.rand(A.y, A.y + A.h),
          U.rand(-40, 40), U.rand(-40, 40),
          0.5, 3, 1, '#ffffff', 0, false, 0.95, 0, 1, false
        );
      }
    }
    for (let i = 0; i < this.CAP; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.t -= dt;
      if (p.t <= 0) {
        p.active = false;
        if (p.ambient) this.ambientActive--;
        this._release(i);
        this.activeCount--;
        continue;
      }
      p.vy += p.grav * dt;
      if (p.drag !== 1) {
        const k = Math.pow(p.drag, dt * 60);
        p.vx *= k; p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  },

  stats() {
    return {
      active: this.activeCount,
      cap: this.CAP,
      peak: this.peak,
      dropped: this.dropped,
      ambientActive: this.ambientActive,
    };
  },

  // ---------------- rendering ----------------
  render(ctx) {
    if (!this._px && !this._pxFailed) this._tryAttach();
    if (this._px) { this._renderPixi(); return; }
    if (!ctx) return;
    for (let i = 0; i < this.CAP; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      const frac = U.clamp(p.t / p.max, 0, 1);
      ctx.globalAlpha = frac;
      ctx.fillStyle = p.color;
      const rad = U.lerp(p.r1, p.r0, frac);
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, U.TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  _tryAttach() {
    if (this._pxFailed) return;
    if (typeof window === 'undefined' || !window.PIXI ||
        typeof SPRITES === 'undefined' || !SPRITES.fxContainer || !SPRITES.bgContainer) return;
    try {
      const PIXI = window.PIXI;

      const mkCanvas = (size, draw) => {
        const cv = document.createElement('canvas');
        cv.width = size; cv.height = size;
        const c = cv.getContext('2d');
        draw(c, size);
        return cv;
      };
      const dotCv = mkCanvas(32, (c, s) => {
        const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, s, s);
      });
      const sparkCv = mkCanvas(48, (c, s) => {
        const g = c.createLinearGradient(0, 0, s, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, s / 2 - 6, s, 12);
      });
      const emberCv = mkCanvas(16, (c, s) => {
        const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, s, s);
      });
      const mistCv = mkCanvas(64, (c, s) => {
        const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.6)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, s, s);
      });

      const tex = [
        PIXI.Texture.from(dotCv),
        PIXI.Texture.from(sparkCv),
        PIXI.Texture.from(emberCv),
        PIXI.Texture.from(mistCv),
      ];

      const under = new PIXI.Container();
      SPRITES.bgContainer.addChild(under);
      const over = new PIXI.Container();
      SPRITES.fxContainer.addChild(over);

      const sprites = new Array(this.CAP);
      for (let i = 0; i < this.CAP; i++) {
        const spr = new PIXI.Sprite(tex[0]);
        spr.anchor.set(0.5);
        spr.visible = false;
        over.addChild(spr);
        sprites[i] = spr;
      }

      this._px = { sprites, tex, under, over, flash: null };

      const flash = new PIXI.Graphics().rect(0, 0, 1280, 720).fill(0xffffff);
      flash.alpha = 0;
      flash.visible = false;
      if (typeof SPRITES !== 'undefined' && SPRITES.hudContainer) {
        SPRITES.hudContainer.addChildAt(flash, 0);
      }
      this._px.flash = flash;
    } catch (e) {
      this._px = null;
      this._pxFailed = true;
    }
  },

  _renderPixi() {
    const { sprites, tex, under, over } = this._px;
    for (let i = 0; i < this.CAP; i++) {
      const p = this.pool[i];
      const spr = sprites[i];
      if (!p.active) {
        if (spr.visible) spr.visible = false;
        continue;
      }
      const target = p.layer === 0 ? under : over;
      if (spr.parent !== target) target.addChild(spr);
      const t = tex[p.tex] || tex[0];
      if (spr.texture !== t) spr.texture = t;
      const bm = p.add ? 'add' : 'normal';
      if (spr.blendMode !== bm) spr.blendMode = bm;
      if (spr.tint !== p.tint) spr.tint = p.tint;
      const frac = U.clamp(p.t / p.max, 0, 1);
      let alpha = frac;
      if (p.tex === 3) alpha *= 0.25; // mist: softer per D-16
      spr.alpha = alpha;
      spr.rotation = p.rot;
      spr.x = p.x; spr.y = p.y;
      const rad = U.lerp(p.r1, p.r0, frac);
      const baseRadius = p.tex === 1 ? 24 : (p.tex === 0 ? 16 : (p.tex === 2 ? 8 : 32));
      const scale = rad / baseRadius;
      if (p.tex === 1) spr.scale.set(scale * 2, scale);
      else spr.scale.set(scale, scale);
      spr.visible = true;
    }
    this._renderFlash();
  },

  _renderFlash() {
    if (!this._px || !this._px.flash) return;
    const f = this._px.flash;
    f.visible = this.flashT > 0;
    f.tint = this.flashColor;
    f.alpha = this.flashDur > 0 ? this.flashAlpha * (this.flashT / this.flashDur) : 0;
  },
};

VFX._initPool();

// trivial preset — Plan 02 fills in the full combat set (hit/crit/death/etc.)
VFX.PRESETS.dot = function (x, y, angle, color) {
  this.spawn(x, y, 0, 0, 0.3, 3, 3, color || '#ffffff', 0, false, 0.9, 0, 1, false);
};
