// ============================================================
// CHAKRAVYUHA — game.js : core loop, input, world update, render
// ============================================================
'use strict';

const INPUT = {
  keys: {}, mx: 640, my: 360, lmb: false, rmb: false,
  ax: 0, ay: 0, device: 'kbm',
  bindings: {
    moveUp: ['w', 'arrowup'], moveDown: ['s', 'arrowdown'],
    moveLeft: ['a', 'arrowleft'], moveRight: ['d', 'arrowright'],
    dash: [' '], cast: ['q'], special: ['e'], pause: ['escape'],
  },
};

const GAME = {
  canvas: null, ctx: null,
  W: 1280, H: 720,
  arena: { x: 50, y: 84, w: 1180, h: 580 },
  state: 'hub',           // hub | combat | cleared | choosing | paused | dead | victory
  time: 0, dt: 0, runTime: 0,
  shake: 0,
  hitstop: 0, hitstopCd: 0,   // VFX-03: freeze-frame gating (D-09/D-10)

  // run state
  player: null, biome: DATA.BIOMES[0], biomeIdx: 0, roomIdx: 0, totalRooms: 0,
  reward: null, waves: [], waveDelay: 0,
  kills: 0, bossRef: null, bossRewarded: false, bossHurtT: 0,
  shopSeenThisBiome: false, nooseT: 0, prePause: null,

  // world arrays
  enemies: [], eprojectiles: [], pprojectiles: [], pickups: [],
  particles: [], texts: [], zones: [], orbits: [], rings: [],
  bolts: [], dangerZones: [], doors: [], pillars: [],

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = null; // visible canvas is Pixi-owned (WebGL); a prior 2D context would block WebGL
    // Fire PixiJS bootstrap (async; frames before it resolves use D-11 primitive fallback)
    SPRITES.init(this.canvas).then(() => {
      // Build manifest from all expected atlas paths — missing files caught per-entry (non-fatal)
      const manifest = [
        { key: 'player', path: 'assets/sprites/player/player-atlas.json' },
        ...Object.keys(DATA.ENEMIES).map(k => ({ key: k, path: `assets/sprites/enemies/${k}-atlas.json` })),
        ...Object.keys(DATA.BOSSES).map(k => ({ key: k, path: `assets/sprites/bosses/${k}-atlas.json` })),
      ];
      SPRITES.load(manifest);
    });
    this.bindInput();
    this.bindButtons();
    requestAnimationFrame(t => this.frame(t));
  },

  // ---------------- input ----------------
  bindInput() {
    const cv = this.canvas;
    const firstTouch = () => { AUDIO.init(); AUDIO.resume(); };
    window.addEventListener('pointerdown', firstTouch, { once: true });
    window.addEventListener('keydown', firstTouch, { once: true });

    window.addEventListener('keydown', e => {
      INPUT.device = 'kbm';
      const k = e.key.toLowerCase();
      INPUT.keys[k] = true;
      if (INPUT.bindings.dash.includes(k)) { e.preventDefault(); if (this.playing()) this.player.tryDash(); }
      if (INPUT.bindings.cast.includes(k) && this.playing()) this.player.tryCast();
      if (INPUT.bindings.special.includes(k) && this.playing()) this.player.trySpecial();
      if (k === 'm') {
        const m = AUDIO.toggleMute();
        UI.banner(m ? 'SOUND OFF' : 'SOUND ON', '#cfcfcf');
      }
      if (INPUT.bindings.pause.includes(k)) {
        if (this.state === 'paused') UI.resume();
        else UI.pause();
      }
      if (k === 'f3') {
        e.preventDefault();
        if (e.shiftKey) VFX.stress = !VFX.stress;
        else VFX.debug = !VFX.debug;
      }
    });
    window.addEventListener('keyup', e => { INPUT.keys[e.key.toLowerCase()] = false; });

    cv.addEventListener('mousemove', e => {
      INPUT.device = 'kbm';
      const r = cv.getBoundingClientRect();
      INPUT.mx = (e.clientX - r.left) * (this.W / r.width);
      INPUT.my = (e.clientY - r.top) * (this.H / r.height);
    });
    cv.addEventListener('mousedown', e => {
      INPUT.device = 'kbm';
      if (e.button === 0) INPUT.lmb = true;
      if (e.button === 2) { INPUT.rmb = true; if (this.playing()) this.player.trySpecial(); }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) INPUT.lmb = false;
      if (e.button === 2) INPUT.rmb = false;
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => { INPUT.keys = {}; INPUT.lmb = false; });
  },

  bindButtons() {
    const on = (id, fn) => UI.el(id).addEventListener('click', () => { AUDIO.sfx('click'); fn(); });
    on('btn-begin', () => this.startRun());
    on('btn-shrine', () => UI.shrine());
    on('btn-armory', () => UI.armory());
    on('btn-codex', () => UI.codex());
    on('btn-shrine-back', () => UI.hub());
    on('btn-armory-back', () => UI.hub());
    on('btn-codex-back', () => UI.hub());
    on('btn-shop-close', () => UI.closeShop());
    on('btn-death-continue', () => UI.hub());
    on('btn-victory-continue', () => UI.hub());
    on('btn-resume', () => UI.resume());
    on('btn-quitrun', () => { UI.hide('pause'); AUDIO.stopDrone(); UI.hub(); });
    on('btn-wipe', () => {
      if (confirm('Erase all progress? Chitragupta will be thrilled.')) { META.wipe(); UI.hub(); }
    });
  },

  playing() { return this.state === 'combat' || this.state === 'cleared'; },

  // ---------------- run lifecycle ----------------
  startRun() {
    UI.hideAll();
    this.player = new Player(META.lastWeapon);
    this.player.x = this.arena.x + 90;
    this.player.y = this.arena.y + this.arena.h / 2;
    this.runTime = 0; this.kills = 0; this.totalRooms = 0;
    this.bossRewarded = false;
    this.hitstop = 0; this.hitstopCd = 0;
    CAMERA.resetFx();
    META.runs++; META.save();
    ROOMS.enterBiome(0);
  },

  onPlayerDeath() {
    const P = this.player;
    if (P.defiance > 0) {
      P.defiance--;
      P.hp = Math.round(P.maxhp * 0.5);
      P.iframes = 2;
      this.eprojectiles = [];
      burst(P.x, P.y, '#7fdcb7', 30, 320, 0.9, 5);
      this.shake = 14;
      VFX.flash(0x7fdcb7, 0.45, 0.35);
      AUDIO.sfx('defiance');
      UI.banner('THE SANJEEVANI CALLS YOU BACK', '#7fdcb7');
      return;
    }
    P.hp = 0;
    this.state = 'dead';
    VFX.flash(0xff2030, 0.45, 0.35);
    VFX.hitstop(8);
    META.deaths++; META.save();
    AUDIO.stopDrone();
    AUDIO.sfx('death');
    setTimeout(() => UI.death(), 900);
  },

  onVictory() {
    this.state = 'victory';
    const bonus = 50;
    this.player.punyaRun += bonus;
    META.punya += bonus;
    META.wins++;
    if (!META.bestTime || this.runTime < META.bestTime) META.bestTime = this.runTime;
    META.save();
    AUDIO.stopDrone();
    AUDIO.sfx('victory');
    setTimeout(() => UI.victory(), 1200);
  },

  // ---------------- frame ----------------
  frame(tms) {
    PAD.poll();
    const t = tms / 1000;
    this.dt = Math.min(0.033, t - (this._last || t));
    this._last = t;
    this.time += this.dt;

    if (this.playing()) this.update(this.dt);
    CAMERA.update(this.dt);       // real dt: keeps animating through hitstop/paused/choosing states
    VFX.tick(this.dt);            // real dt: flash fade + FPS EMA keep running through hitstop
    this.render();
    requestAnimationFrame(tt => this.frame(tt));
  },

  update(dt) {
    // VFX-03: hitstop freezes simulation but not render/UI/camera. Never blocks forward
    // progress indefinitely — hitstopCd gates re-triggering for a short grace window.
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.shake = Math.max(0, this.shake - dt * 60);
      if (this.hitstop <= 0) { this.hitstop = 0; this.hitstopCd = 0.06; }
      return;
    }
    U.cool(this, 'hitstopCd', dt);

    this.runTime += dt;
    U.cool(this, 'bossHurtT', dt);
    this.shake = Math.max(0, this.shake - dt * 60);

    const P = this.player;
    P.update(dt);
    if (P.dashT > 0) VFX.emit('dash', P.x, P.y, P.dashDir);

    // enemies
    for (const e of this.enemies) if (!e.dead) e.update(dt);

    // boss defeat → reward path
    if (this.bossRef && this.bossRef.dead && !this.bossRewarded) {
      this.bossRewarded = true;
      this.state = 'cleared';
      const wasLast = this.biomeIdx >= DATA.BIOMES.length - 1;
      ROOMS.onBossDefeated();
      if (!wasLast) this.bossRef = null;
    }

    // wave / room-clear logic
    if (this.state === 'combat' && !this.bossRef) {
      const alive = this.enemies.some(e => !e.dead);
      if (!alive) {
        if (this.waves.length > 0) {
          this.waveDelay += dt;
          if (this.waveDelay > 0.7) {
            this.waveDelay = 0;
            ROOMS.spawnWave(this.waves.shift());
          }
        } else {
          this.state = 'cleared';
          ROOMS.onRoomClear();
        }
      }
    }

    // player projectiles
    for (const p of this.pprojectiles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt;
      const A = this.arena;
      if (p.x < A.x || p.x > A.x + A.w || p.y < A.y || p.y > A.y + A.h) p.t = 0;
      if (ROOMS.blocksProjectile(p)) p.t = 0;
      if (p.chakra) {
        if (!p._vfx) { p._vfx = true; VFX.emit('castGlow', p.x, p.y, Math.atan2(p.vy, p.vx)); }
        VFX.emit('astraTrail', p.x, p.y);
      }
      for (const e of this.enemies) {
        if (e.dead || p.hitSet.has(e) || e.spawnT > 0) continue;
        if (U.dist(p.x, p.y, e.x, e.y) < e.r + p.r) {
          p.hitSet.add(e);
          hitEnemy(e, p.dmg, p.src);
          if (p.chakra && this.player.has('agni_cast')) {
            this.zones.push({ x: p.x, y: p.y, r: 48, dps: this.player.val('agni_cast'),
              t: 4, type: 'fire', vx: 0, vy: 0, tick: 0 });
          }
          if (p.chakra && this.player.has('indra_cast')) {
            for (let i = 0; i < 5; i++) {
              const tx = p.x + U.rand(-90, 90), ty = p.y + U.rand(-70, 70);
              this.bolts.push({ x1: tx, y1: ty - 200, x2: tx, y2: ty, t: 0.18 });
              for (const e2 of this.enemies)
                if (!e2.dead && U.dist(tx, ty, e2.x, e2.y) < 42)
                  hitEnemy(e2, this.player.val('indra_cast'), 'cast');
            }
            AUDIO.sfx('shock');
          }
          if (!p.pierce) p.t = 0;
          break;
        }
      }
    }
    this.pprojectiles = this.pprojectiles.filter(p => p.t > 0);

    // enemy projectiles
    for (const p of this.eprojectiles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt;
      const A = this.arena;
      if (p.x < A.x || p.x > A.x + A.w || p.y < A.y || p.y > A.y + A.h) p.t = 0;
      if (ROOMS.blocksProjectile(p)) p.t = 0;
      if (p.t > 0 && U.dist(p.x, p.y, P.x, P.y) < P.r + p.r) {
        P.takeDamage(p.dmg);
        p.t = 0;
      }
    }
    this.eprojectiles = this.eprojectiles.filter(p => p.t > 0);

    // zones (fire pools, cyclones)
    for (const z of this.zones) {
      z.t -= dt; z.tick += dt;
      if (z.type === 'cyclone') {
        // drift toward nearest living enemy
        let best = null, bd = 1e9;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = U.dist(z.x, z.y, e.x, e.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const a = U.angle(z.x, z.y, best.x, best.y);
          z.vx = U.lerp(z.vx, Math.cos(a) * 110, dt * 2);
          z.vy = U.lerp(z.vy, Math.sin(a) * 110, dt * 2);
        }
        z.x += z.vx * dt; z.y += z.vy * dt;
        const A = this.arena;
        z.x = U.clamp(z.x, A.x + z.r, A.x + A.w - z.r);
        z.y = U.clamp(z.y, A.y + z.r, A.y + A.h - z.r);
      }
      if (z.tick >= 0.5) {
        z.tick -= 0.5;
        for (const e of this.enemies)
          if (!e.dead && U.dist(z.x, z.y, e.x, e.y) < z.r + e.r)
            hitEnemy(e, z.dps * 0.5, 'zone');
      }
    }
    this.zones = this.zones.filter(z => z.t > 0);

    // sudarshana orbits
    for (const o of this.orbits) {
      o.t -= dt;
      o.angle += dt * 4.5;
      o.x = P.x + Math.cos(o.angle) * o.dist;
      o.y = P.y + Math.sin(o.angle) * o.dist;
      VFX.emit('astraTrail', o.x, o.y);
      for (const e of this.enemies) {
        if (e.dead) continue;
        const cd = o.hitCd[e.type + this.enemies.indexOf(e)] || 0;
        if (this.time > cd && U.dist(o.x, o.y, e.x, e.y) < e.r + 12) {
          o.hitCd[e.type + this.enemies.indexOf(e)] = this.time + 0.5;
          hitEnemy(e, o.dmg, 'cast');
        }
      }
    }
    this.orbits = this.orbits.filter(o => o.t > 0);

    // pickups
    for (const pk of this.pickups) {
      pk.t -= dt;
      pk.x += (pk.vx || 0) * dt; pk.y += (pk.vy || 0) * dt;
      pk.vx = (pk.vx || 0) * 0.9; pk.vy = (pk.vy || 0) * 0.9;
      const d = U.dist(pk.x, pk.y, P.x, P.y);
      if (d < 90) { // magnet
        const a = U.angle(pk.x, pk.y, P.x, P.y);
        pk.x += Math.cos(a) * 380 * dt; pk.y += Math.sin(a) * 380 * dt;
      }
      if (d < P.r + 10) {
        pk.t = 0;
        let v = pk.val;
        if (P.has('indra_tribute')) v = Math.round(v * (1 + P.val('indra_tribute') / 100));
        P.mudra += v;
        AUDIO.sfx('coin');
      }
    }
    this.pickups = this.pickups.filter(p => p.t > 0);

    // doors
    if (this.state === 'cleared') {
      for (const d of this.doors) {
        if (U.dist(P.x, P.y, d.x, d.y) < d.r + P.r) {
          this.doors = [];
          if (d.reward.id === 'nextbiome') ROOMS.enterBiome(this.biomeIdx + 1);
          else ROOMS.enterRoom(d.reward.id);
          break;
        }
      }
    }

    // cosmetic arrays
    VFX.update(dt);
    VFX.ambient(this.biome.id, this.arena, dt);
    for (const t of this.texts) { t.t -= dt; t.y -= 36 * dt; }
    this.texts = this.texts.filter(t => t.t > 0);
    for (const r of this.rings) r.t -= dt;
    this.rings = this.rings.filter(r => r.t > 0);
    for (const b of this.bolts) b.t -= dt;
    this.bolts = this.bolts.filter(b => b.t > 0);
  },

  // ---------------- render ----------------
  render() {
    // Headless guard: SPRITES.bridgeCtx is undefined when init early-returned — no-op safely.
    if (typeof SPRITES === 'undefined' || !SPRITES.bridgeCtx) return;
    const ctx = SPRITES.bridgeCtx;               // primitives draw onto the hidden bridge canvas
    const inRun = this.state !== 'hub';

    SPRITES.clearBridge();
    CAMERA.begin();                              // drives worldContainer; no ctx argument (D-03)
    this.renderBackground(ctx);
    SPRITES.beginEntities();
    if (inRun) {
      this.renderEntities(ctx);
      this.renderEffects(ctx);
    } else VFX.render(ctx);
    // Sweep sprites whose entities were not drawn this frame (G.enemies = [] on room change, hub state).
    SPRITES.endEntities();
    CAMERA.end();
    // UI pass — separate HUD bridge in hudContainer: unaffected by shake, above sprites (D-10/D-11)
    this.renderHUD(SPRITES.hudBridgeCtx || ctx);
    VFX.renderDebug(SPRITES.hudBridgeCtx || ctx);
    SPRITES.uploadBridge();                      // re-upload bridge canvas to Pixi texture
  },

  renderBackground(ctx) {
    const A = this.arena;
    const inRun = this.state !== 'hub';
    const biome = this.biome;

    // background
    ctx.fillStyle = inRun ? biome.bg : '#0b0710';
    ctx.fillRect(-30, -30, this.W + 60, this.H + 60);

    if (!inRun) { this.renderHubBg(ctx); return; }

    // arena floor
    ctx.fillStyle = biome.floor;
    ctx.fillRect(A.x, A.y, A.w, A.h);

    // chakravyuha mandala floor pattern
    const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
    ctx.strokeStyle = biome.accent + '14';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 6; i++) {
      ctx.beginPath(); ctx.arc(cx, cy, i * 64, 0, U.TAU); ctx.stroke();
    }
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * U.TAU + this.time * 0.02;
      ctx.moveTo(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64);
      ctx.lineTo(cx + Math.cos(a) * 384, cy + Math.sin(a) * 384);
    }
    ctx.stroke();

    // walls
    ctx.strokeStyle = biome.wall;
    ctx.lineWidth = 10;
    ctx.strokeRect(A.x - 5, A.y - 5, A.w + 10, A.h + 10);
    ctx.strokeStyle = biome.accent + '44';
    ctx.lineWidth = 2;
    ctx.strokeRect(A.x - 10, A.y - 10, A.w + 20, A.h + 20);

    // boss slam danger zones
    for (const dz of this.dangerZones || []) {
      ctx.fillStyle = 'rgba(255,68,68,0.12)';
      ctx.strokeStyle = 'rgba(255,68,68,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(dz.x, dz.y, dz.r, 0, U.TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(dz.x, dz.y, dz.r * U.clamp(dz.frac, 0, 1), 0, U.TAU); ctx.stroke();
    }

    // zones
    for (const z of this.zones) {
      if (z.type === 'fire') {
        ctx.fillStyle = `rgba(255,90,40,${0.18 + 0.08 * Math.sin(this.time * 10)})`;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = '#ff7040'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, U.TAU); ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(127,220,183,${0.5 + 0.2 * Math.sin(this.time * 12)})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.r * (0.4 + i * 0.3), this.time * (4 + i), this.time * (4 + i) + 4.5);
          ctx.stroke();
        }
      }
    }

    this.renderObstacles(ctx);

    // doors
    for (const d of this.doors) {
      const pulse = 0.7 + 0.3 * Math.sin(this.time * 4);
      const grad = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, d.r + 16);
      grad.addColorStop(0, d.reward.color + 'cc');
      grad.addColorStop(1, d.reward.color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r + 16, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = d.reward.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, U.TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = '22px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(d.reward.sym, d.x, d.y + 8);
      ctx.font = '12px Georgia';
      ctx.fillStyle = d.reward.color;
      ctx.fillText(d.reward.name, d.x - 8, d.y + d.r + 18);
      ctx.textAlign = 'left';
    }

    // pickups
    for (const pk of this.pickups) {
      ctx.fillStyle = '#ffcf5c';
      ctx.beginPath(); ctx.arc(pk.x, pk.y, 5, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = '#a87b1d'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(pk.x, pk.y, 5, 0, U.TAU); ctx.stroke();
    }
  },

  renderEntities(ctx) {
    // Sprite-or-fallback: use PixiJS AnimatedSprite when atlas loaded (RENDER-03),
    // otherwise fall back to entity.draw(ctx) primitives on the bridge canvas (RENDER-02 / D-11).
    for (const e of this.enemies) {
      if (e.dead) { if (e._pixiSprite) SPRITES.removeEntity(e); continue; }
      const key = e.type;
      if (SPRITES.has(key)) SPRITES.drawEntity(e);
      else e.draw(ctx);                            // D-11: silent fallback to primitive
    }
    if (this.player) {
      if (SPRITES.has('player')) { this.player.spriteKey = 'player'; SPRITES.drawEntity(this.player); }
      else this.player.draw(ctx);
    }
  },

  renderEffects(ctx) {
    // orbits
    for (const o of this.orbits) {
      ctx.fillStyle = '#ffd34d';
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(this.time * 12);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * U.TAU;
        ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
        ctx.lineTo(Math.cos(a + 0.4) * 6, Math.sin(a + 0.4) * 6);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // projectiles
    for (const p of this.pprojectiles) {
      ctx.fillStyle = p.color;
      if (p.chakra) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(this.time * 14);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * U.TAU;
          ctx.lineTo(Math.cos(a) * p.r, Math.sin(a) * p.r);
          ctx.lineTo(Math.cos(a + 0.4) * p.r * 0.5, Math.sin(a + 0.4) * p.r * 0.5);
        }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.fill();
        // arrow tail
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        const a = Math.atan2(p.vy, p.vx);
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(a) * 14, p.y - Math.sin(a) * 14);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
    for (const p of this.eprojectiles) {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.stroke();
    }

    // lightning bolts
    for (const b of this.bolts) {
      ctx.strokeStyle = `rgba(255,224,120,${b.t / 0.18})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      const segs = 4;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        ctx.lineTo(U.lerp(b.x1, b.x2, t) + (i < segs ? U.rand(-9, 9) : 0),
                   U.lerp(b.y1, b.y2, t) + (i < segs ? U.rand(-9, 9) : 0));
      }
      ctx.stroke();
    }

    // expanding rings
    for (const r of this.rings) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.t / 0.25 * 0.8;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1.3 - r.t / 0.25 * 0.3), 0, U.TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // particles
    VFX.render(ctx);

    // damage texts
    for (const t of this.texts) {
      ctx.globalAlpha = U.clamp(t.t / 0.4, 0, 1);
      ctx.fillStyle = t.color;
      ctx.font = `bold ${t.size}px Georgia`;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },

  // ---- Phase 4: obstacles (pillar/wall/pit) — renderObstacles ----
  renderObstacles(ctx) {
    const biome = this.biome;
    for (const o of this.pillars) {
      const kind = o.kind || 'pillar';
      if (kind === 'pit') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        if (o.shape === 'rect') ctx.fillRect(o.x, o.y, o.w, o.h);
        else { ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, U.TAU); ctx.fill(); }
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        if (o.shape === 'rect') ctx.fillRect(o.x + 6, o.y + 6, Math.max(0, o.w - 12), Math.max(0, o.h - 12));
        else { ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(0, o.r - 6), 0, U.TAU); ctx.fill(); }
        ctx.strokeStyle = biome.accent + '66';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        if (o.shape === 'rect') ctx.strokeRect(o.x, o.y, o.w, o.h);
        else { ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, U.TAU); ctx.stroke(); }
        ctx.setLineDash([]);
      } else if (o.shape === 'rect') {
        ctx.fillStyle = biome.wall;
        ctx.fillRect(o.x, o.y + 4, o.w, o.h);
        ctx.fillStyle = this.shadeMix(biome.wall, biome.accent, 0.25);
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = biome.accent + '55';
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x + 4, o.y + 4, Math.max(0, o.w - 8), Math.max(0, o.h - 8));
      } else {
        // pillar (circle) — existing look
        ctx.fillStyle = biome.wall;
        ctx.beginPath(); ctx.arc(o.x, o.y + 4, o.r, 0, U.TAU); ctx.fill();
        ctx.fillStyle = this.shadeMix(biome.wall, biome.accent, 0.25);
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = biome.accent + '55'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.6, 0, U.TAU); ctx.stroke();
      }
    }
  },
  // ---- end Phase 4 obstacles ----

  renderHubBg(ctx) {
    // slowly turning mandala behind the hub menu
    const cx = this.W / 2, cy = this.H / 2;
    for (let ring = 1; ring <= 8; ring++) {
      ctx.strokeStyle = `rgba(199,125,255,${0.05 + 0.015 * ring})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, ring * 55, 0, U.TAU); ctx.stroke();
      const n = ring * 6;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * U.TAU + this.time * 0.05 * (ring % 2 ? 1 : -1);
        const r1 = ring * 55 - 8, r2 = ring * 55 + 8;
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      }
      ctx.stroke();
    }
  },

  shadeMix(hex1, hex2, t) {
    const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const a = p(hex1), b = p(hex2);
    const m = a.map((v, i) => Math.round(U.lerp(v, b[i], t)));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  },

  renderHUD(ctx) {
    const P = this.player;
    if (!P) return;
    ctx.textAlign = 'left';

    // HP bar
    const bx = 50, by = 26, bw = 240, bh = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    const frac = U.clamp(P.hp / P.maxhp, 0, 1);
    ctx.fillStyle = frac > 0.35 ? '#c0392b' : '#ff2222';
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.strokeStyle = '#ffe9b3'; ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Georgia';
    ctx.fillText(`${Math.max(0, Math.ceil(P.hp))} / ${P.maxhp}`, bx + 8, by + 14);

    // defiance lotuses
    for (let i = 0; i < P.defiance; i++) {
      ctx.fillStyle = '#7fdcb7';
      ctx.font = '14px Georgia';
      ctx.fillText('✿', bx + bw + 12 + i * 18, by + 15);
    }

    // dash pips
    for (let i = 0; i < P.dashMax; i++) {
      ctx.fillStyle = i < P.dashCharges ? '#7fdcb7' : 'rgba(127,220,183,0.2)';
      ctx.save();
      ctx.translate(bx + 8 + i * 22, by + 36);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
    }
    // cast pips
    for (let i = 0; i < P.castMax; i++) {
      ctx.fillStyle = i < P.castCharges ? '#ffd34d' : 'rgba(255,211,77,0.2)';
      ctx.beginPath();
      ctx.arc(bx + 8 + P.dashMax * 22 + 20 + i * 22, by + 36, 7, 0, U.TAU);
      ctx.fill();
    }
    // special cooldown
    const sw = 70;
    const sx = bx + 8 + P.dashMax * 22 + 20 + P.castMax * 22 + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(sx, by + 30, sw, 10);
    const sFrac = 1 - U.clamp(P.specialCd / P.weapon.special.cd, 0, 1);
    ctx.fillStyle = sFrac >= 1 ? '#fff' : 'rgba(255,255,255,0.45)';
    ctx.fillRect(sx, by + 30, sw * sFrac, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px Georgia';
    ctx.fillText('SPECIAL [E / RMB]', sx, by + 26);

    // currencies
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px Georgia';
    ctx.fillStyle = '#ffcf5c';
    ctx.fillText(`¤ ${U.fmt(P.mudra)}`, this.W - 56, 36);
    ctx.fillStyle = '#c77dff';
    ctx.fillText(`ॐ ${U.fmt(META.punya)}`, this.W - 56, 60);

    // biome / room
    ctx.textAlign = 'center';
    ctx.fillStyle = this.biome.accent;
    ctx.font = 'bold 15px Georgia';
    const roomLabel = this.bossRef ? 'THE WARDEN' : `Chamber ${this.roomIdx} / ${this.biome.rooms}`;
    ctx.fillText(`${this.biome.name} — ${roomLabel}`, this.W / 2, 32);
    // run clock
    const t = Math.floor(this.runTime);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px Georgia';
    ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, this.W / 2, 52);
    ctx.textAlign = 'left';

    // boon icons (left column)
    const boons = P.allBoons();
    for (let i = 0; i < boons.length; i++) {
      const b = boons[i];
      const g = DATA.GODS[b.def.god];
      const y = 120 + i * 30;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(10, y, 24, 24);
      ctx.strokeStyle = DATA.RARITIES[b.rarity].color;
      ctx.lineWidth = 2;
      ctx.strokeRect(10, y, 24, 24);
      ctx.fillStyle = g ? g.color : '#fff';
      ctx.font = 'bold 13px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(b.def.name[0], 22, y + 17);
      ctx.textAlign = 'left';
    }

    // boss bar
    if (this.bossRef && !this.bossRef.dead) {
      const B = this.bossRef;
      const w = 520, x = (this.W - w) / 2, y = this.H - 40;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 3, y - 3, w + 6, 22);
      ctx.fillStyle = B.color;
      const hb = U.clamp(B.hp / B.maxhp, 0, 1);
      ctx.fillRect(x, y, w * hb, 16);
      if (this.bossHurtT > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x, y, w * hb, 16);
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 3, y - 3, w + 6, 22);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(`${B.bossDef.name} — ${B.bossDef.sub}`, this.W / 2, y - 10);
      ctx.textAlign = 'left';
    }

    // door hint
    if (this.state === 'cleared' && this.doors.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = 'italic 14px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('Walk into a gate to choose your path →', this.W / 2, this.H - 14);
      ctx.textAlign = 'left';
    }

    // crosshair (D-11: screen-space, outside camera transform)
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(INPUT.mx, INPUT.my, 8, 0, U.TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(INPUT.mx - 12, INPUT.my); ctx.lineTo(INPUT.mx - 4, INPUT.my);
    ctx.moveTo(INPUT.mx + 4, INPUT.my); ctx.lineTo(INPUT.mx + 12, INPUT.my);
    ctx.moveTo(INPUT.mx, INPUT.my - 12); ctx.lineTo(INPUT.mx, INPUT.my - 4);
    ctx.moveTo(INPUT.mx, INPUT.my + 4); ctx.lineTo(INPUT.mx, INPUT.my + 12);
    ctx.stroke();
  },
};

// ---------------- boot ----------------
window.addEventListener('DOMContentLoaded', () => {
  META.load();
  GAME.init();
  UI.hub();
});
