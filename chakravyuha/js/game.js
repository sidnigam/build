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
  bolts: [], dangerZones: [], doors: [], pillars: [], hazards: [],

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
      SPRITES.loadTextures(DATA.BIOMES.map(b => ({ key: SPRITES.bgKeyFor(b), path: SPRITES.bgPathFor(b) })));   // biome backgrounds (02-10); missing -> primitive bg
    });
    this.bindInput();
    this.bindButtons();
    requestAnimationFrame(t => this.frame(t));
  },

  // ---------------- input ----------------
  bindInput() {
    Object.assign(INPUT.bindings, STORE.get('chakravyuha_bindings_v1', {}));
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
    this.updateHazards(dt);

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

  // ---- Phase 4: biome hazards — updateHazards / renderHazards ----
  updateHazards(dt) {
    const H = this.hazards || [];
    if (!H.length) return;
    this.hazardViolations = this.hazardViolations || [];
    const P = this.player;
    const active = this.state === 'combat' && !this.bossRef;
    const s = Math.sqrt(this.biome.scale);

    const hurtP = (h, amount, shown) => {
      if (shown < 0.6) this.hazardViolations.push(h.type);
      P.takeDamage(Math.round(amount * s));
    };

    if (!active) {
      for (const h of H) {
        if (h.type === 'fireVent') { h.phase = 'dormant'; h.hitSet = null; h.warnShown = 0; }
        else if (h.type === 'arrowVolley') { h.markers = []; }
        else if (h.type === 'riverCurrent') { h.phase = 'calm'; }
      }
      return;
    }

    for (const h of H) {
      const def = DATA.HAZARDS[h.type];
      h.age += dt;

      if (h.type === 'fireVent') {
        h.t -= dt;
        if (h.phase === 'dormant') {
          if (h.t <= 0) { h.phase = 'warn'; h.t = def.warn; h.warnShown = 0; }
        } else if (h.phase === 'warn') {
          h.warnShown += dt;
          if (h.t <= 0) {
            h.phase = 'erupt'; h.t = def.active; h.hitSet = new Set();
            burst(h.x, h.y, def.color, 14, 220, 0.5);
            this.shake = Math.max(this.shake, 3);
            AUDIO.sfx('burn');
          }
        } else if (h.phase === 'erupt') {
          if (!h.hitSet.has(P) && U.dist(h.x, h.y, P.x, P.y) < h.r + P.r) {
            hurtP(h, def.dmgP, h.warnShown);
            h.hitSet.add(P);
          }
          for (const e of this.enemies) {
            if (e.dead || e.boss || e.spawnT > 0 || h.hitSet.has(e)) continue;
            if (U.dist(h.x, h.y, e.x, e.y) < h.r + e.r) {
              hitEnemy(e, def.dmgE * s, 'hazard');
              h.hitSet.add(e);
            }
          }
          if (h.t <= 0) { h.phase = 'dormant'; h.t = U.rand(def.dormant[0], def.dormant[1]); h.warnShown = 0; h.hitSet = null; }
        }
      } else if (h.type === 'venomPool') {
        const dInside = U.dist(P.x, P.y, h.x, h.y) < h.r;
        if (dInside) {
          P.hazardSlowT = 0.2; P.hazardSlowF = 1 - def.slow;
          h.tickT -= dt;
          // grace: the pool is always visible, but the first tick never fires before
          // def.grace seconds of room time have passed (telegraph-before-damage floor)
          if (h.tickT <= 0 && h.age >= def.grace) { hurtP(h, def.dmgP, h.age); h.tickT = def.tick; }
        } else {
          h.tickT = 0.35;
        }
        for (const e of this.enemies) {
          if (e.dead || e.boss || e.spawnT > 0 || def.immune.includes(e.type)) continue;
          if (U.dist(e.x, e.y, h.x, h.y) < h.r) {
            e.slowT = Math.max(e.slowT, 0.2);
            e.slowF = Math.min(e.slowF || 1, def.enemySlow);
          }
        }
      } else if (h.type === 'arrowVolley') {
        h.t -= dt;
        if (h.t <= 0 && h.markers.length < def.max) {
          const A = this.arena;
          const mx = U.clamp(P.x + U.rand(-def.jitter, def.jitter), A.x + def.r, A.x + A.w - def.r);
          const my = U.clamp(P.y + U.rand(-def.jitter, def.jitter), A.y + def.r, A.y + A.h - def.r);
          h.markers.push({ x: mx, y: my, r: def.r, t: def.warn, shown: 0 });
          h.t = U.rand(def.every[0], def.every[1]);
        }
        for (const m of h.markers) { m.shown += dt; m.t -= dt; }
        for (const m of h.markers.slice()) {
          if (m.t > 0) continue;
          if (U.dist(m.x, m.y, P.x, P.y) < m.r + P.r) hurtP(h, def.dmgP, m.shown);
          for (const e of this.enemies) {
            if (e.dead || e.boss || e.spawnT > 0) continue;
            if (U.dist(m.x, m.y, e.x, e.y) < m.r + e.r) hitEnemy(e, def.dmgE * s, 'hazard');
          }
          this.rings.push({ x: m.x, y: m.y, r: m.r, t: 0.25, color: def.color });
          burst(m.x, m.y, def.color, 10, 160, 0.35);
          AUDIO.sfx('bow');
          h.markers.splice(h.markers.indexOf(m), 1);
        }
      } else if (h.type === 'riverCurrent') {
        h.t -= dt;
        if (h.phase === 'calm' && h.t <= 0) { h.phase = 'surgeWarn'; h.t = def.surgeWarn; }
        else if (h.phase === 'surgeWarn' && h.t <= 0) { h.phase = 'surge'; h.t = def.surgeDur; }
        else if (h.phase === 'surge' && h.t <= 0) { h.phase = 'calm'; h.t = U.rand(def.surgeEvery[0], def.surgeEvery[1]); }
        const push = h.phase === 'surge' ? def.surgePush : def.push;
        const inBand = (ent) => ent.x >= h.x && ent.x <= h.x + h.w && ent.y >= h.y && ent.y <= h.y + h.h;
        if (P.dashT <= 0 && inBand(P)) { P.x += h.dir * push * dt; clampToArena(P); }
        for (const e of this.enemies) {
          if (e.dead || e.boss || e.spawnT > 0) continue;
          if (inBand(e)) { e.x += h.dir * push * dt; clampToArena(e); }
        }
      }
    }
  },

  renderHazards(ctx) {
    const H = this.hazards || [];
    for (const h of H) {
      const def = DATA.HAZARDS[h.type];
      if (h.type === 'fireVent') {
        if (h.phase === 'dormant' || !h.phase) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 0.6, 0, U.TAU); ctx.fill();
          ctx.strokeStyle = def.color + '55'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 0.6, 0, U.TAU); ctx.stroke();
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * U.TAU;
            ctx.beginPath();
            ctx.moveTo(h.x + Math.cos(a) * h.r * 0.3, h.y + Math.sin(a) * h.r * 0.3);
            ctx.lineTo(h.x + Math.cos(a) * h.r * 0.55, h.y + Math.sin(a) * h.r * 0.55);
            ctx.stroke();
          }
        } else if (h.phase === 'warn') {
          const frac = 1 - h.t / def.warn;
          ctx.fillStyle = def.color + '55';
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r * Math.max(0.1, frac), 0, U.TAU); ctx.fill();
          ctx.strokeStyle = def.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.stroke();
        } else if (h.phase === 'erupt') {
          ctx.fillStyle = def.color + '99';
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.fill();
          ctx.fillStyle = def.color;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * U.TAU;
            const bx = h.x + Math.cos(a) * h.r, by = h.y + Math.sin(a) * h.r;
            const tx = h.x + Math.cos(a) * h.r * 1.4, ty = h.y + Math.sin(a) * h.r * 1.4;
            const pa = a + Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(bx + Math.cos(pa) * 5, by + Math.sin(pa) * 5);
            ctx.lineTo(bx - Math.cos(pa) * 5, by - Math.sin(pa) * 5);
            ctx.lineTo(tx, ty);
            ctx.closePath(); ctx.fill();
          }
        }
      } else if (h.type === 'venomPool') {
        const alpha = 0.22 + 0.06 * Math.sin(this.time * 3);
        ctx.fillStyle = def.color; ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = def.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = this.time * (0.6 + i * 0.2) + i * 2;
          const bx = h.x + Math.cos(a) * h.r * 0.5, by = h.y + Math.sin(a) * h.r * 0.5;
          ctx.beginPath(); ctx.arc(bx, by, 4, 0, U.TAU); ctx.fill();
        }
      } else if (h.type === 'arrowVolley') {
        for (const m of h.markers) {
          const frac = 1 - m.t / def.warn;
          ctx.strokeStyle = def.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, U.TAU); ctx.stroke();
          ctx.fillStyle = def.color + '55';
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r * Math.max(0.05, frac), 0, U.TAU); ctx.fill();
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * U.TAU + Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(m.x + Math.cos(a) * m.r * 0.9, m.y + Math.sin(a) * m.r * 0.9);
            ctx.lineTo(m.x + Math.cos(a) * m.r * 0.6, m.y + Math.sin(a) * m.r * 0.6);
            ctx.stroke();
          }
        }
      } else if (h.type === 'riverCurrent') {
        const surging = h.phase === 'surge';
        const warning = h.phase === 'surgeWarn';
        ctx.fillStyle = def.color;
        ctx.globalAlpha = surging ? 0.22 : (warning ? 0.18 : 0.10);
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = warning ? '#ffffff' : def.color;
        ctx.lineWidth = 1.5;
        const push = surging ? def.surgePush : def.push;
        const scroll = (this.time * push * h.dir) % 60;
        for (let x = h.x - 60; x < h.x + h.w + 60; x += 60) {
          const cx = x + scroll;
          const cy = h.y + h.h / 2;
          ctx.beginPath();
          if (h.dir > 0) { ctx.moveTo(cx - 8, cy - 10); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx - 8, cy + 10); }
          else { ctx.moveTo(cx + 8, cy - 10); ctx.lineTo(cx - 8, cy); ctx.lineTo(cx + 8, cy + 10); }
          ctx.stroke();
        }
      }
    }
  },
  // ---- end Phase 4 hazards ----

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

    // background — illustrated biome image when loaded (02-10), else the primitive fill (D-11)
    const hasBg = SPRITES.setBackground(inRun ? SPRITES.bgKeyFor(biome) : null);   // hub shows no biome bg
    if (hasBg) {
      ctx.fillStyle = 'rgba(0,0,0,' + SPRITES.CFG.BG_DIM_OUTER + ')';               // dim everything outside the arena
      ctx.fillRect(-30, -30, this.W + 60, this.H + 60);
    } else {
      ctx.fillStyle = inRun ? biome.bg : '#0b0710';
      ctx.fillRect(-30, -30, this.W + 60, this.H + 60);
    }

    if (!inRun) { this.renderHubBg(ctx); return; }

    // arena floor
    if (hasBg) {
      ctx.clearRect(A.x, A.y, A.w, A.h);                                              // undo the outer dim inside the arena
      ctx.globalAlpha = SPRITES.CFG.BG_FLOOR_TINT; ctx.fillStyle = biome.floor;       // biome-tinted readability wash
      ctx.fillRect(A.x, A.y, A.w, A.h); ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(0,0,0,${SPRITES.CFG.BG_FLOOR_DARKEN})`;                    // flat-black darken so sprites/telegraphs pop off busy illustrated floors
      ctx.fillRect(A.x, A.y, A.w, A.h);
      const vcx = A.x + A.w / 2, vcy = A.y + A.h / 2;                                  // soft radial vignette: calm the floor center-out, guarded for the smoke ctx stub
      const vr = Math.max(A.w, A.h) * 0.62;
      const vgrad = ctx.createRadialGradient && ctx.createRadialGradient(vcx, vcy, vr * 0.35, vcx, vcy, vr);
      if (vgrad && vgrad.addColorStop) {
        vgrad.addColorStop(0, 'rgba(0,0,0,0)');
        vgrad.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vgrad;
        ctx.fillRect(A.x, A.y, A.w, A.h);
      }
    } else {
      ctx.fillStyle = biome.floor;
      ctx.fillRect(A.x, A.y, A.w, A.h);
    }

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
    this.renderHazards(ctx);

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
    SPRITES.tickDying(this.dt);                      // death shrink/fade (02-07)
    for (const e of this.enemies) {
      if (e.dead) { if (e._pixiSprite) SPRITES.retireEntity(e); continue; }
      if (SPRITES.has(e.type)) { this.renderSpriteExtras(ctx, e); SPRITES.drawEntity(e); }
      else e.draw(ctx);                              // D-11: silent fallback to primitive
    }
    const P = this.player;
    if (P) {
      if (SPRITES.has('player')) { P.spriteKey = 'player'; this.renderPlayerSpriteExtras(ctx, P); SPRITES.drawEntity(P); SPRITES.drawWeapon(P); }
      else P.draw(ctx);
    }
  },

  /**
   * renderSpriteExtras(ctx, e) — 02-07: gameplay-critical primitives that Enemy.draw/Boss.draw
   * used to paint, restored for the sprite path (drawn UNDER the sprite; anything above the head
   * uses SPRITES.headY so it is not hidden behind the sprite). Mirrors js/entities.js draw() logic
   * exactly where noted; js/entities.js itself is never touched (owned by Phase 3/4).
   */
  renderSpriteExtras(ctx, e) {
    if (e.spawnT > 0) {
      // spawn-in mandala (mirrors Enemy.draw)
      const p = 1 - e.spawnT / 0.6;
      ctx.globalAlpha = p;
      ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (2 - p), 0, U.TAU * p); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    // ground shadow — sprite art has no baked contact shadow
    ctx.fillStyle = 'rgba(0,0,0,' + SPRITES.CFG.SHADOW_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * SPRITES.CFG.FEET_OFFSET_R, e.r * 0.9, e.r * 0.32, 0, 0, U.TAU);
    ctx.fill();

    // telegraph (mirrors Enemy.draw / Boss.draw)
    if (e.telegraph) {
      const hw = e.boss ? e.r * 0.8 : e.r;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 18);
      ctx.strokeStyle = '#ff4444'; ctx.fillStyle = 'rgba(255,68,68,0.12)'; ctx.lineWidth = 2;
      if (e.telegraph.type === 'line') {
        const tg = e.telegraph;
        ctx.save();
        ctx.translate(e.x, e.y); ctx.rotate(tg.a);
        ctx.fillRect(0, -hw, tg.len, hw * 2);
        ctx.strokeRect(0, -hw, tg.len, hw * 2);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(e.x, e.y, e.telegraph.r, 0, U.TAU);
        ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // noose (Yama) — mirrors Boss.draw
    if (e.boss && e.state === 'noose' && this.player) {
      const P = this.player;
      ctx.strokeStyle = '#9fb8ff'; ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(P.x, P.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // maya ring — drawn at the feet so it reads under a tall sprite (legacy drew it around center)
    if (e.maya > 0) {
      ctx.strokeStyle = '#5c7cff'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r, e.r + 4, (e.r + 4) * 0.4, 0, 0, U.TAU);
      ctx.stroke();
    }

    const headY = SPRITES.headY(e, e.type);

    // burn pips — same horizontal layout as Enemy.draw/Boss.draw, moved to headY
    if (e.burns && e.burns.length) {
      ctx.fillStyle = '#ff7040';
      const spacing = e.boss ? 10 : 8, rad = e.boss ? 4 : 3, ox = e.boss ? -10 : -8;
      for (let i = 0; i < e.burns.length; i++) {
        ctx.beginPath(); ctx.arc(e.x + ox + i * spacing, headY - 8, rad, 0, U.TAU); ctx.fill();
      }
    }

    // stun glyph
    if (e.stun > 0) {
      ctx.fillStyle = '#ffd34d'; ctx.font = '12px Georgia';
      ctx.fillText('✦', e.x - 4, headY - 12);
    }

    // asleep zzz (mirrors Boss.draw)
    if (e.asleep) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Georgia';
      ctx.fillText('z z z', e.x + e.r * 0.5, headY - 8);
    }

    // hp bar for damaged non-boss enemies
    if (!e.boss && e.hp < e.maxhp) {
      const w = e.r * 2;
      const y = e.y + e.r * SPRITES.CFG.FEET_OFFSET_R + 4;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - w / 2, y, w, 4);
      ctx.fillStyle = '#ff5566';
      ctx.fillRect(e.x - w / 2, y, w * U.clamp(e.hp / e.maxhp, 0, 1), 4);
    }

    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
  },

  /**
   * renderPlayerSpriteExtras(ctx, P) — 02-07: sprite-path player overlays. Does NOT draw the
   * legacy body circle/aura/facing tick (the sprite + 02-10 weapon overlay replace them).
   */
  renderPlayerSpriteExtras(ctx, P) {
    // Render-parity with Player.draw's `this.swing.t -= GAME.dt`: draw() is never called in the
    // sprite path, so without this the attack state (swing.t>0) would never end. Not new gameplay.
    if (P.swing && P.swing.t > 0) P.swing.t -= this.dt;

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,' + SPRITES.CFG.SHADOW_ALPHA + ')';
    ctx.beginPath();
    ctx.ellipse(P.x, P.y + P.r * SPRITES.CFG.FEET_OFFSET_R, P.r * 0.9, P.r * 0.32, 0, 0, U.TAU);
    ctx.fill();

    // swing wedge — dimmed to 0.6x legacy alpha; the 02-10 weapon sweep carries the main read
    if (P.swing && P.swing.t > 0) {
      ctx.globalAlpha = (P.swing.t / SPRITES.CFG.SWING_DUR) * 0.33;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(P.x, P.y);
      ctx.arc(P.x, P.y, P.swing.range, P.swing.a - P.swing.arc / 2, P.swing.a + P.swing.arc / 2);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // bow charge line (mirrors Player.draw)
    if (P.charging) {
      ctx.strokeStyle = P.charge >= 0.98 ? '#ffd34d' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(P.x + Math.cos(P.aim) * 20, P.y + Math.sin(P.aim) * 20);
      ctx.lineTo(P.x + Math.cos(P.aim) * (20 + 60 * P.charge), P.y + Math.sin(P.aim) * (20 + 60 * P.charge));
      ctx.stroke();
    }

    // bhakti ready glow — as a ground ring so it reads under the tall sprite
    if (P.bhaktiReady) {
      ctx.strokeStyle = '#ff8c42'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 8);
      ctx.beginPath();
      ctx.ellipse(P.x, P.y + P.r, P.r + 6, (P.r + 6) * 0.4, 0, 0, U.TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
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

    // HP bar — plum/black backing panel, gold double-line border, diamond end-caps
    const bx = 50, by = 26, bw = 240, bh = 18;
    this._hudPanel(ctx, bx - 4, by - 4, bw + 8, bh + 8, 5, true);
    const frac = U.clamp(P.hp / P.maxhp, 0, 1);
    const low = frac < 0.35;
    const flashOk = (typeof SETTINGS === 'undefined') || SETTINGS.get('screenFlash') !== false;
    const pulse = (low && flashOk) ? 0.7 + 0.3 * Math.sin(this.runTime * 7) : 1;
    const hpGrad = ctx.createLinearGradient && ctx.createLinearGradient(bx, by, bx, by + bh);
    ctx.fillStyle = (hpGrad && hpGrad.addColorStop)
      ? (hpGrad.addColorStop(0, low ? '#ff5b4a' : '#d1483a'), hpGrad.addColorStop(1, low ? '#7a1710' : '#7a2015'), hpGrad)
      : (low ? '#ff2222' : '#c0392b');
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,211,77,0.85)'; ctx.lineWidth = 1.2;
    ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    this._hudDiamond(ctx, bx - 4, by + bh / 2, 4, true, '#ffd34d');
    this._hudDiamond(ctx, bx + bw + 4, by + bh / 2, 4, true, '#ffd34d');
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Georgia';
    ctx.fillText(`${Math.max(0, Math.ceil(P.hp))} / ${P.maxhp}`, bx + 8, by + 14);

    // defiance lotuses
    for (let i = 0; i < P.defiance; i++) {
      ctx.fillStyle = '#7fdcb7';
      ctx.font = '14px Georgia';
      ctx.fillText('✿', bx + bw + 12 + i * 18, by + 15);
    }

    // dash pips — gold-outlined diamonds, teal fill when charged
    for (let i = 0; i < P.dashMax; i++) {
      const on = i < P.dashCharges;
      this._hudDiamond(ctx, bx + 8 + i * 22, by + 36, 6, on, '#7fdcb7', 'rgba(255,211,77,0.65)');
    }
    // cast pips — 8-petal lotus rosette, filled when charged, outline-only when empty
    for (let i = 0; i < P.castMax; i++) {
      const on = i < P.castCharges;
      this._hudLotus(ctx, bx + 8 + P.dashMax * 22 + 20 + i * 22, by + 36, 8, on, on ? '#ffd34d' : 'rgba(255,211,77,0.35)');
    }
    // special cooldown — gold-bordered, gold fill when ready
    const sw = 70;
    const sx = bx + 8 + P.dashMax * 22 + 20 + P.castMax * 22 + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(sx, by + 30, sw, 10);
    const sFrac = 1 - U.clamp(P.specialCd / P.weapon.special.cd, 0, 1);
    ctx.fillStyle = sFrac >= 1 ? '#ffd34d' : 'rgba(255,211,77,0.45)';
    ctx.fillRect(sx, by + 30, sw * sFrac, 10);
    ctx.strokeStyle = 'rgba(255,211,77,0.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(sx, by + 30, sw, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px Georgia';
    ctx.fillText(INPUT.device === 'pad' ? 'SPECIAL [LT / X]' : 'SPECIAL [E / RMB]', sx, by + 26);

    // currencies — dark backing plate with gold hairline, positions unchanged
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(18,8,22,0.55)';
    ctx.strokeStyle = 'rgba(255,211,77,0.4)'; ctx.lineWidth = 1;
    ctx.fillRect(this.W - 150, 20, 100, 46);
    ctx.strokeRect(this.W - 150, 20, 100, 46);
    ctx.font = 'bold 16px Georgia';
    ctx.fillStyle = '#ffcf5c';
    ctx.fillText(`¤ ${U.fmt(P.mudra)}`, this.W - 56, 36);
    ctx.fillStyle = '#c77dff';
    ctx.fillText(`ॐ ${U.fmt(META.punya)}`, this.W - 56, 60);

    // biome / room — ornament rule + Devanagari biome name
    ctx.textAlign = 'center';
    ctx.fillStyle = this.biome.accent;
    ctx.font = 'bold 15px Georgia';
    const roomLabel = this.bossRef ? 'THE WARDEN' : `Chamber ${this.roomIdx} / ${this.biome.rooms}`;
    ctx.fillText(`${this.biome.name} — ${roomLabel}`, this.W / 2, 32);
    this._hudOrnament(ctx, this.W / 2, 40, 160, 'rgba(255,211,77,0.65)');
    const devBiome = (typeof UI !== 'undefined' && UI.DEVANAGARI && UI.DEVANAGARI.biomes) ? UI.DEVANAGARI.biomes[this.biome.id] : '';
    if (devBiome) {
      ctx.fillStyle = 'rgba(255,211,77,0.75)';
      ctx.font = '11px Georgia';
      ctx.fillText(devBiome, this.W / 2, 52);
    }
    // run clock
    const t = Math.floor(this.runTime);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px Georgia';
    ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, this.W / 2, devBiome ? 66 : 52);
    ctx.textAlign = 'left';

    // boon icons (left column) — gold hairline frame per icon, god color fill kept
    const boons = P.allBoons();
    for (let i = 0; i < boons.length; i++) {
      const b = boons[i];
      const g = DATA.GODS[b.def.god];
      const y = 120 + i * 30;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(10, y, 24, 24);
      ctx.strokeStyle = 'rgba(255,211,77,0.7)'; ctx.lineWidth = 1;
      ctx.strokeRect(9, y - 1, 26, 26);
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

  // -- HUD motif helpers (Indian-motif pass, quick-260926-d5o) --
  _hudPanel(ctx, x, y, w, h, r, double) {
    r = r || 4;
    ctx.fillStyle = 'rgba(18,8,22,0.68)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,211,77,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (double) ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  },

  _hudOrnament(ctx, cx, y, w, color) {
    color = color || 'rgba(255,211,77,0.7)';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y);
    ctx.lineTo(cx - 6, y);
    ctx.moveTo(cx + 6, y);
    ctx.lineTo(cx + w / 2, y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.translate(cx, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  },

  _hudDiamond(ctx, x, y, size, filled, fillColor, outlineColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    if (filled) { ctx.fillStyle = fillColor; ctx.fillRect(-size, -size, size * 2, size * 2); }
    ctx.strokeStyle = outlineColor || 'rgba(255,211,77,0.85)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-size, -size, size * 2, size * 2);
    ctx.restore();
  },

  _hudLotus(ctx, x, y, r, filled, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * U.TAU;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(0, -r * 0.55, r * 0.32, r * 0.55, 0, 0, U.TAU);
      else ctx.arc(0, -r * 0.55, r * 0.32, 0, U.TAU);
      if (filled) ctx.fill(); else ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  },
};

// ---------------- boot ----------------
window.addEventListener('DOMContentLoaded', () => {
  META.load();
  GAME.init();
  UI.hub();
});
