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

  // screen flash overlay state (VFX-04, D-15)
  flashT: 0, flashDur: 0, flashAlpha: 0, flashColor: 0xffffff,
  fps: 0,   // FPS EMA maintained by tick(), consumed by the debug overlay

  // biome ambient particles (VFX-05, D-16)
  AMBIENT: {},
  _ambAcc: 0,
  _ambBiome: null,

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

  // ---------------- screen flash (VFX-04, D-15) ----------------
  // Full-screen overlay tracked here even headless (flashT/flashColor/flashAlpha), drawn
  // only when a Pixi flash graphic is attached (_tryAttach/_renderFlash).
  flash(color, alpha, dur) {
    if (typeof SETTINGS !== 'undefined' && SETTINGS.get('screenFlash') === false) return;
    const current = this.flashDur > 0 ? this.flashAlpha * (this.flashT / this.flashDur) : 0;
    if (alpha >= current) {
      this.flashColor = color;
      this.flashAlpha = alpha;
      this.flashDur = dur;
      this.flashT = dur;
    }
  },

  // Called every real frame (js/game.js frame()) — fades the flash and maintains the FPS EMA.
  tick(dt) {
    this.flashT = Math.max(0, this.flashT - dt);
    this.fps = this.fps ? this.fps * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05 : 60;
  },

  // ---------------- biome ambient particles (VFX-05, D-16) ----------------
  // Spawn-accumulator pattern: def.rate is particles/sec, scaled by reducedParticles.
  // Ambient is hard-capped at 15% of CAP so it can never starve combat VFX.
  ambient(biomeId, A, dt) {
    const def = this.AMBIENT[biomeId];
    if (!def) return;
    if (this._ambBiome !== biomeId) { this._ambBiome = biomeId; this._ambAcc = 0; }
    const reduced = typeof SETTINGS !== 'undefined' && SETTINGS.get('reducedParticles');
    const rate = def.rate * (reduced ? 0.25 : 1);
    this._ambAcc += rate * dt;
    const capAmb = (this.CAP * 0.15) | 0;
    while (this._ambAcc >= 1) {
      this._ambAcc -= 1;
      if (this.ambientActive < capAmb) def.spawn.call(this, A);
    }
  },

  // ---------------- dev debug overlay (D-19) ----------------
  renderDebug(ctx) {
    if (!this.debug || !ctx) return;
    const x = 1280 - 250, y = 76, w = 236, h = 78;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#9cffb0';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    const enemyCount = (typeof GAME !== 'undefined' && GAME.enemies) ? GAME.enemies.length : 0;
    const lines = [
      `FPS ${Math.round(this.fps || 0)}`,
      `particles ${this.activeCount}/${this.CAP}  peak ${this.peak}`,
      `dropped ${this.dropped}  ambient ${this.ambientActive}`,
      `enemies ${enemyCount}  hitstop ${(typeof GAME !== 'undefined' && GAME.hitstop > 0) ? 'ON' : '-'}  ${this.stress ? 'STRESS' : ''}`,
    ];
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + 8, y + 18 + i * 16);
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
  // CAM-05: pure AABB test — is particle p (expanded by its max radius) inside view rect v?
  inView(p, v) {
    const r = Math.max(p.r0, p.r1);
    return p.x + r >= v.x && p.x - r <= v.x + v.w && p.y + r >= v.y && p.y - r <= v.y + v.h;
  },

  render(ctx) {
    if (!this._px && !this._pxFailed) this._tryAttach();
    if (this._px) { this._renderPixi(); return; }
    if (!ctx) return;
    const v = (typeof CAMERA !== 'undefined' && CAMERA.viewRect) ? CAMERA.viewRect(64) : null;
    for (let i = 0; i < this.CAP; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      if (v && !this.inView(p, v)) continue;   // CAM-05: skip off-screen particles
      const frac = U.clamp(p.t / p.max, 0, 1);
      ctx.globalAlpha = p.tex === 3 ? frac * 0.25 : frac; // mist (D-16): softer overall alpha
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
    const v = (typeof CAMERA !== 'undefined' && CAMERA.viewRect) ? CAMERA.viewRect(64) : null;
    for (let i = 0; i < this.CAP; i++) {
      const p = this.pool[i];
      const spr = sprites[i];
      if (!p.active || (v && !this.inView(p, v))) {   // CAM-05: hide off-screen particles, keep pooled
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

// ---------------- combat presets (VFX-01, D-04) ----------------
// tex ids: 0 dot, 1 spark, 2 ember, 3 mist. All counts run through this.count()
// so reducedParticles scales them down; none of these allocate arrays/closures beyond
// the loop body itself.
VFX.PRESETS.dot = function (x, y, angle, color) {
  this.spawn(x, y, 0, 0, 0.3, 3, 3, color || '#ffffff', 0, false, 0.9, 0, 1, false);
};

VFX.PRESETS.hit = function (x, y, a) {
  const n = this.count(6);
  for (let i = 0; i < n; i++) {
    const ang = a + U.rand(-0.6, 0.6);
    const spd = U.rand(180, 380);
    const life = U.rand(0.12, 0.22);
    this.spawn(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, life, 3, 1, '#ffffff', 1, true, 0.88, 0, 1, false);
  }
  this.spawn(x, y, 0, 0, 0.08, 10, 2, '#ffffff', 0, true, 0.9, 0, 1, false);
};

VFX.PRESETS.crit = function (x, y, a) {
  const n = this.count(10);
  for (let i = 0; i < n; i++) {
    const ang = a + U.rand(-0.6, 0.6);
    const spd = U.rand(180, 380);
    const life = U.rand(0.12, 0.22);
    this.spawn(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, life, 3, 1, '#ffd34d', 1, true, 0.88, 0, 1, false);
  }
  this.spawn(x, y, 0, 0, 0.08, 16, 2, '#ffd34d', 0, true, 0.9, 0, 1, false);
};

VFX.PRESETS.death = function (x, y, a, color) {
  const col = color || '#ffffff';
  const nd = this.count(16);
  for (let i = 0; i < nd; i++) {
    const ang = U.rand(U.TAU);
    const spd = U.rand(120, 260);
    const life = U.rand(0.35, 0.6);
    this.spawn(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, life, 4, 1, col, 0, false, 0.93, 0, 1, false);
  }
  const ne = this.count(8);
  for (let i = 0; i < ne; i++) {
    const ang = U.rand(U.TAU);
    const life = U.rand(0.6, 1.0);
    this.spawn(x, y, Math.cos(ang) * U.rand(10, 40), U.rand(-70, -20), life, 3, 1, '#ff9a3c', 2, true, 0.97, -120, 1, false);
  }
};

VFX.PRESETS.bossDeath = function (x, y, a, color) {
  const col = color || '#ffffff';
  const rings = [{ spd: 180, color: col }, { spd: 320, color: '#ffffff' }, { spd: 460, color: '#ffd34d' }];
  for (const ring of rings) {
    const n = this.count(30);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * U.TAU + U.rand(-0.05, 0.05);
      const life = U.rand(0.8, 1.4);
      this.spawn(x, y, Math.cos(ang) * ring.spd, Math.sin(ang) * ring.spd, life, 5, 1, ring.color, 0, false, 0.94, 0, 1, false);
    }
  }
  const ne = this.count(30);
  for (let i = 0; i < ne; i++) {
    const ang = U.rand(U.TAU);
    const life = U.rand(0.8, 1.4);
    this.spawn(x, y, Math.cos(ang) * U.rand(40, 120), Math.sin(ang) * U.rand(40, 120) - 40, life, 4, 1, '#ff9a3c', 2, true, 0.96, -80, 1, false);
  }
};

VFX.PRESETS.hurt = function (x, y, a) {
  const nd = this.count(12);
  for (let i = 0; i < nd; i++) {
    const ang = U.rand(U.TAU);
    const spd = U.rand(60, 180);
    const life = U.rand(0.25, 0.4);
    this.spawn(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, life, 3, 1, '#ff3344', 0, false, 0.9, 0, 1, false);
  }
  const ns = this.count(4);
  for (let i = 0; i < ns; i++) {
    const ang = U.rand(U.TAU);
    const spd = U.rand(100, 220);
    const life = U.rand(0.15, 0.25);
    this.spawn(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, life, 3, 1, '#ff3344', 1, true, 0.85, 0, 1, false);
  }
};

VFX.PRESETS.dash = function (x, y, a) {
  const n = this.count(2);
  for (let i = 0; i < n; i++) {
    const back = a + Math.PI;
    const spd = U.rand(10, 40);
    this.spawn(x + U.rand(-4, 4), y + U.rand(-4, 4), Math.cos(back) * spd, Math.sin(back) * spd, 0.25, 7, 2, '#7fdcb7', 0, true, 0.9, 0, 0, false);
  }
};

VFX.PRESETS.castGlow = function (x, y, a) {
  this.spawn(x, y, 0, 0, 0.25, 22, 6, '#ffd34d', 0, true, 0.9, 0, 1, false);
  const n = this.count(8);
  for (let i = 0; i < n; i++) {
    const ang = a + U.rand(-0.5, 0.5);
    const spd = U.rand(120, 260);
    const life = U.rand(0.15, 0.25);
    this.spawn(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, life, 3, 1, '#ffd34d', 1, true, 0.88, 0, 1, false);
  }
};

VFX.PRESETS.astraTrail = function (x, y) {
  this.spawn(x, y, U.rand(-15, 15), U.rand(-15, 15), 0.3, 4, 1, '#ffd34d', 2, true, 0.95, 0, 1, false);
};

VFX.PRESETS.phase = function (x, y, a, color) {
  const col = color || '#ffffff';
  const n = this.count(36);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * U.TAU;
    const c = (i % 2 === 0) ? '#ffffff' : '#ffd34d';
    this.spawn(x, y, Math.cos(ang) * 360, Math.sin(ang) * 360, 0.6, 4, 1, c, 0, true, 0.95, 0, 1, false);
  }
  const nc = this.count(20);
  for (let i = 0; i < nc; i++) {
    const ang = U.rand(U.TAU);
    const spd = U.rand(80, 220);
    const life = U.rand(0.4, 0.7);
    this.spawn(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, life, 4, 1, col, 0, false, 0.94, 0, 1, false);
  }
};

// ---------------- biome ambient particles (VFX-05, D-16) ----------------
// Note on tuning: velocities/lives below are deliberately gentler than a literal reading
// of the design doc's per-biome descriptions (e.g. "vy -30..-70") would suggest — sustained
// for a multi-second ambient lifetime those speeds would routinely drift particles well
// outside the arena. Slower ambient drift reads just as well visually and keeps particles
// close to their spawn point for the lifetime of the effect (see 03-03-SUMMARY.md).
VFX.AMBIENT.naraka = {
  rate: 18,
  // rising orange/red embers, additive, spawned in the bottom 60% of the arena
  spawn(A) {
    const x = U.rand(A.x, A.x + A.w);
    const y = U.rand(A.y + A.h * 0.4, A.y + A.h);
    const color = U.choice(['#ff7a2a', '#ffb347', '#ff3b1f']);
    this.spawn(x, y, U.rand(-6, 6), U.rand(-16, -6), U.rand(2, 3.5), 2, 0.5, color, 2, true, 1, 0, 1, true);
  },
};

VFX.AMBIENT.patala = {
  rate: 10,
  // slow rising teal/green bubbles and motes
  spawn(A) {
    const x = U.rand(A.x, A.x + A.w);
    const y = U.rand(A.y, A.y + A.h);
    const color = U.choice(['#58e0c0', '#9ce0c8']);
    this.spawn(x, y, U.rand(-4, 4), U.rand(-8, -3), U.rand(3, 5), 3, 5, color, 0, false, 1, 0, 0, true);
  },
};

VFX.AMBIENT.ranabhoomi = {
  rate: 14,
  // drifting grey-tan dust/ash with a gentle horizontal drift
  spawn(A) {
    const x = U.rand(A.x, A.x + A.w);
    const y = U.rand(A.y, A.y + A.h);
    const color = U.choice(['#b8a88a', '#8c8274']);
    this.spawn(x, y, U.rand(4, 8), U.rand(-3, 3), U.rand(3, 5), 1.5, 2.5, color, 0, false, 1, 0, 0, true);
  },
};

VFX.AMBIENT.vaitarani = {
  rate: 4,
  // large, low-alpha, slow blue-grey mist puffs (mist alpha is further softened in render())
  spawn(A) {
    const x = U.rand(A.x, A.x + A.w);
    const y = U.rand(A.y, A.y + A.h);
    this.spawn(x, y, U.rand(-4, 4), 0, U.rand(5, 8), 40, 70, '#8fa8c8', 3, false, 1, 0, 0, true);
  },
};
