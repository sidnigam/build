// ============================================================
// CHAKRAVYUHA — game.js : core loop, input, world update, render
// ============================================================
'use strict';

const INPUT = {
  keys: {}, mx: 640, my: 360, lmb: false, rmb: false,
  wx: 640, wy: 360,          // world-space aim target (Phase 05.1) — mx/my stay screen-space
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
  arenaPad: { l: 50, r: 50, t: 84, b: 56 },   // current room's world-rect padding (ROOMS.setArena) — 05.4 art contract
  state: 'hub',           // hub | combat | cleared | choosing | paused | dead | victory
  time: 0, dt: 0, runTime: 0,
  shake: 0,
  hitstop: 0, hitstopCd: 0,   // VFX-03: freeze-frame gating (D-09/D-10)

  // run state
  player: null, biome: DATA.BIOMES[0], biomeIdx: 0, roomIdx: 0, totalRooms: 0,
  reward: null, waves: [], waveDelay: 0,
  spawnQueue: [], lastWaveSize: 0, dripT: 0,   // Phase 05.1 (WAVE-02/03): overlapping waves + alive-cap drip queue
  kills: 0, bossRef: null, bossRewarded: false, bossHurtT: 0,
  miniRef: null,          // 05.7.1-06: live mini-boss (never also bossRef); hook for the 05.7.2 score
  shopSeenThisBiome: false, nooseT: 0, prePause: null,

  // world arrays
  enemies: [], eprojectiles: [], epools: [], pprojectiles: [], pickups: [],
  particles: [], texts: [], zones: [], orbits: [], rings: [],
  bolts: [], dangerZones: [], doors: [], pillars: [], hazards: [],
  lodged: [],                    // 05.7.1-03 (D-14): astras lying where they landed {x, y, t, age}

  // Lodge one astra at (x, y), pushed inside the arena and out of obstacles; returns the entry.
  lodgeAt(x, y) {
    const o = { x, y, r: 20 };
    if (this.arena) clampToArena(o);
    const l = { x: o.x, y: o.y, t: DATA.KIT.lodgeLife, age: 0 };
    this.lodged.push(l);
    return l;
  },

  // Cast ammo still out of the player's hands: lodged astras plus in-flight casts.
  castAmmoOut() {
    let n = this.lodged ? this.lodged.length : 0;
    for (const p of this.pprojectiles) if (p.lodge && !p._lodged && p.t > 0) n++;
    for (const o of this.orbits) if (o.castAmmo && !o._lodged && o.t > 0) n++;
    for (const z of this.zones) if (z.castAmmo && !z._lodged && z.t > 0) n++;
    return n;
  },

  // Safety return (room clear, boss defeat, defiance): every lodged astra comes back at once.
  returnAllLodged() {
    if (this.lodged.length && this.player) this.player.returnCast(this.lodged.length);
    this.lodged = [];
  },

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
        ...Object.keys(DATA.MINIBOSSES).map(k => ({ key: k, path: `assets/sprites/bosses/${k}-atlas.json` })),   // 05.7.1-06
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
      if (k === 'f4') { // dev playtest: god mode (no damage)
        e.preventDefault();
        this.godMode = !this.godMode;
        UI.banner(this.godMode ? 'GOD MODE ON' : 'GOD MODE OFF', '#ffd76a');
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

  // World-space mouse aim (Phase 05.1, D-13): converts last frame's on-screen mouse position through
  // the camera's inverse transform. Only from frame() — smoke sims driving update() directly must not
  // depend on it. Gamepad owns INPUT.wx/wy itself while INPUT.device === 'pad' (js/gamepad.js).
  syncAim() {
    if (INPUT.device !== 'pad') {
      const w = CAMERA.screenToWorld(INPUT.mx, INPUT.my);
      INPUT.wx = w.x; INPUT.wy = w.y;
    }
  },

  // ---------------- run lifecycle ----------------
  startRun() {
    UI.hideAll();
    this.player = new Player(META.lastWeapon);
    this.player.x = this.arena.x + 90;
    this.player.y = this.arena.y + this.arena.h / 2;
    this.runTime = 0; this.kills = 0; this.totalRooms = 0;
    this.bossRewarded = false;
    this.hitstop = 0; this.hitstopCd = 0;
    this.lodged = [];
    CAMERA.resetFx();
    META.runs++; META.save();
    HEAT.beginRun();             // 05.7.1-09 (D-04): freeze this run's vows into GAME.heat before any room spawns
    ROOMS.enterBiome(0);
  },

  onPlayerDeath() {
    const P = this.player;
    if (P.defiance > 0) {
      P.defiance--;
      P.hp = Math.round(P.maxhp * 0.5);
      P.iframes = 2;
      this.eprojectiles = [];
      this.epools = [];
      STATUS.clear(P);
      this.returnAllLodged();      // 05.7.1-03: a revive hands every lodged astra back
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
    const bonus = HEAT.punya(50);   // 05.7.1-09: Heat scales every Punya gain
    this.player.punyaRun += bonus;
    META.punya += bonus;
    META.wins++;
    // 05.7.1-09: first clear at a new highest Heat for this weapon pays a one-time bounty
    const bounty = HEAT.onVictory(this.player.weapon.id);
    if (bounty) UI.banner(`+${bounty} PUNYA — VOW HONOURED`, '#c77dff');
    if (!META.bestTime || this.runTime < META.bestTime) META.bestTime = this.runTime;
    META.save();
    AUDIO.stopDrone();
    AUDIO.sfx('victory');
    setTimeout(() => UI.victory(), 1200);
  },

  // 05.7-01 (D-01): per-boss HUD room label, so Yama's trial reads as 'THE TRIAL' while the
  // other three (rakshasa/asura) bosses keep 'THE WARDEN'. Falls back to 'THE WARDEN' if a
  // boss entry has no label.
  roomLabel() {
    if (this.miniRef && !this.miniRef.dead) return this.miniRef.bossDef.label || 'THE CHAMPION';
    if (this.bossRef) {
      const d = DATA.BOSSES[this.bossRef.type];
      return (d && d.label) || 'THE WARDEN';
    }
    return `Chamber ${this.roomIdx} / ${this.biome.rooms}`;
  },

  // ---------------- frame ----------------
  frame(tms) {
    PAD.poll();
    this.syncAim();               // uses last frame's on-screen transform — the one the player saw
    const t = tms / 1000;
    this.dt = Math.min(0.033, t - (this._last || t));
    this._last = t;
    this.time += this.dt;

    if (this.playing()) this.update(this.dt);
    CAMERA.follow(this.dt);       // real dt: smooth-follow the player every frame, even through hitstop
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
    ENEMY_AI.tick(dt);   // 05.7.1-04: slots, tokens, separation before the enemies move
    for (const e of this.enemies) if (!e.dead) e.update(dt);
    this.updateHazards(dt);

    // boss defeat → reward path
    if (this.bossRef && this.bossRef.dead && !this.bossRewarded) {
      this.bossRewarded = true;
      this.returnAllLodged();
      this.state = 'cleared';
      const wasLast = this.biomeIdx >= DATA.BIOMES.length - 1;
      ROOMS.onBossDefeated();
      if (!wasLast) this.bossRef = null;
    }

    // wave / room-clear logic (Phase 05.1, D-21): waves overlap (next wave triggers once the
    // previous one is mostly cleared), overflow spawns drip in from a queue under the alive cap,
    // and the room only clears once there is nothing alive, queued, or left to spawn.
    if (this.state === 'combat' && !this.bossRef) {
      // 05.7.1-09 (Vow of the Hourglass): the chamber timer counts down, then wounds 5 per second
      if (this.roomTimerOn) {
        if (this.roomTimer > 0) this.roomTimer = Math.max(0, this.roomTimer - dt);
        else {
          this.timerTick = (this.timerTick || 0) + dt;
          if (this.timerTick >= 1) { this.timerTick -= 1; this.player.tickDamage(5, 'burn'); }
        }
      }
      ROOMS.drainQueue(dt);
      const alive = ROOMS.aliveCount();
      const queued = this.spawnQueue.length;
      if (this.waves.length > 0 && queued === 0 && alive <= ROOMS.nextWaveThreshold()) {
        this.waveDelay += dt;
        if (this.waveDelay > DATA.WAVES.waveDelay) { this.waveDelay = 0; ROOMS.spawnWave(this.waves.shift()); }
      } else if (this.waves.length === 0 && queued === 0 && alive === 0) {
        this.returnAllLodged();    // 05.7.1-03 (D-14): safety return on room clear
        this.roomTimerOn = false;  // 05.7.1-09: the chamber timer stops on clear
        this.state = 'cleared';
        ROOMS.onRoomClear();
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
        if (e.dead || p.hitSet.has(e) || e.spawnT > 0 || e.submerged) continue;   // submerged: passes through
        if (U.dist(p.x, p.y, e.x, e.y) < e.r + p.r) {
          p.hitSet.add(e);
          // 05.7.1-05 (D-07): a warded elite inside its ward window turns player attack shots
          // back at the player as a needle (cast astras and specials pass through the ward)
          if (e.wardT > 0 && p.src === 'attack') {
            p.t = 0;
            const ra = U.angle(e.x, e.y, this.player.x, this.player.y), Wd = DATA.ELITE_MODS.warded;
            enemyShot(e.x, e.y, Math.cos(ra) * 520, Math.sin(ra) * 520, p.dmg * Wd.reflect, Wd.color, 6, 'needle', { owner: e });
            VFX.emit('phit', p.x, p.y, ra, Wd.color);
            break;
          }
          hitEnemy(e, p.dmg, p.src, p.opts);
          if (p.kb && canKnock(e) && !e.dead) {         // 05.7.1-03: gandiva perfect-release knockback
            const ka = Math.atan2(p.vy, p.vx);
            e.kx += Math.cos(ka) * p.kb; e.ky += Math.sin(ka) * p.kb;
          }
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
    // 05.7.1-03 (D-14): a cast astra that ends (range, wall or non-pierce hit) lodges where it stops
    for (const p of this.pprojectiles) {
      if (!p.lodge || p.t > 0 || p._lodged) continue;
      p._lodged = true;
      const l = this.lodgeAt(p.x, p.y);
      if (this.player.has('agni_cast') && p.hitSet.size === 0) {
        this.zones.push({ x: l.x, y: l.y, r: 48, dps: this.player.val('agni_cast'),
          t: 4, type: 'fire', vx: 0, vy: 0, tick: 0 });
      }
    }
    this.pprojectiles = this.pprojectiles.filter(p => p.t > 0);

    // enemy projectiles (05.7.1-02: data-driven families, js/combat.js) + ground pools
    PROJ.updateAll(dt);

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
      if (z.castAmmo && z.t <= 0 && !z._lodged) { z._lodged = true; this.lodgeAt(z.x, z.y); }
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
      if (o.castAmmo && o.t <= 0 && !o._lodged) { o._lodged = true; this.lodgeAt(P.x, P.y); }
    }
    this.orbits = this.orbits.filter(o => o.t > 0);

    // pickups (Phase 05.1, WAVE-04: once the room is cleared, vacuum coins to the player from
    // anywhere so the post-clear walk to the doors doesn't leave loot behind in the larger arenas)
    const magR = this.state === 'cleared' ? 1e9 : 90;
    const pull = this.state === 'cleared' ? 900 : 380;
    for (const pk of this.pickups) {
      pk.t -= dt;
      pk.x += (pk.vx || 0) * dt; pk.y += (pk.vy || 0) * dt;
      pk.vx = (pk.vx || 0) * 0.9; pk.vy = (pk.vy || 0) * 0.9;
      const d = U.dist(pk.x, pk.y, P.x, P.y);
      if (d < magR) { // magnet
        const a = U.angle(pk.x, pk.y, P.x, P.y);
        pk.x += Math.cos(a) * pull * dt; pk.y += Math.sin(a) * pull * dt;
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

    // 05.7.1-03 (D-14): lodged astras — magnet, walk-over pickup, 8 s safety return. A cast that
    // lodges after the room is already cleared comes straight back (same as the clear return).
    if (this.state === 'cleared' && this.lodged.length) this.returnAllLodged();
    for (const l of this.lodged) {
      l.age += dt;
      if (l.age >= l.t) { P.returnCast(1); l.done = true; continue; }
      const d = U.dist(l.x, l.y, P.x, P.y);
      if (d < DATA.KIT.magnetR && d > 0.001) {
        const a = U.angle(l.x, l.y, P.x, P.y), step = Math.min(d, DATA.KIT.magnetPull * dt);
        l.x += Math.cos(a) * step; l.y += Math.sin(a) * step;
      }
      if (U.dist(l.x, l.y, P.x, P.y) < P.r + DATA.KIT.pickupR) { P.returnCast(1, l.x, l.y); l.done = true; }
    }
    if (this.lodged.length) this.lodged = this.lodged.filter(l => !l.done);

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
    VFX.ambient(this.biome.id, this.ambientRect(), dt);   // CAM-05: ambient spawns only near the visible part of the arena
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
      if (h.type === 'fireVent' || h.type === 'venomPool') {
        if (!CAMERA.visible(h.x, h.y, h.r * 1.5)) continue;
      } else if (h.type === 'riverCurrent') {
        if (!CAMERA.visibleRect(h.x, h.y, h.w, h.h)) continue;
      }
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
          if (!CAMERA.visible(m.x, m.y, m.r)) continue;
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
    CAMERA.begin();                              // computes+stores tx/ty/tz, drives worldContainer/bridge sprite
    CAMERA.applyCtx(ctx);                         // bridge primitives now draw in world space (CAM-03)
    this.renderBackground(ctx);
    SPRITES.beginEntities();
    if (inRun) {
      this.renderEntities(ctx);
      this.renderEffects(ctx);
      this.renderAimIndicator(ctx);
    } else VFX.render(ctx);
    // Sweep sprites whose entities were not drawn this frame (G.enemies = [] on room change, hub state).
    SPRITES.endEntities();
    CAMERA.resetCtx(ctx);
    CAMERA.end();
    // UI pass — separate HUD bridge in hudContainer: unaffected by shake, above sprites (D-10/D-11)
    this.renderHUD(SPRITES.hudBridgeCtx || ctx);
    VFX.renderDebug(SPRITES.hudBridgeCtx || ctx);
    SPRITES.uploadBridge();                      // re-upload bridge canvas to Pixi texture
  },

  // World rect (current room, shake-padded) the illustrated biome background cover-fits against.
  _bgRect() {
    const R = ROOMS.worldRect();
    return { x: R.x - 30, y: R.y - 30, w: R.w + 60, h: R.h + 60 };
  },

  // CAM-05: intersection of the arena with the current view (+margin) — biome ambient particles
  // spawn only near what's actually on screen instead of anywhere in a 2240x1300 arena. Falls back
  // to the full arena when the view doesn't overlap it (never returns an empty rect).
  ambientRect() {
    const A = this.arena;
    const V = CAMERA.viewRect(120);
    const x1 = Math.max(A.x, V.x), y1 = Math.max(A.y, V.y);
    const x2 = Math.min(A.x + A.w, V.x + V.w), y2 = Math.min(A.y + A.h, V.y + V.h);
    if (x2 <= x1 || y2 <= y1) return A;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  },

  renderBackground(ctx) {
    const A = this.arena;
    const inRun = this.state !== 'hub';
    const biome = this.biome;

    // Phase 05.4: ENV owns the environment (floor/walls/props/skins/lights) when it can build one
    // for the current biome (real manifest or the legacy-bg fallback kit) — see D-13a. Falls back
    // to false (the full legacy primitive path below, byte-for-byte) headless or with nothing to show.
    const envOn = inRun && typeof ENV !== 'undefined' && ENV.sync(this);

    // background — illustrated biome image when loaded (02-10), else the primitive fill (D-11).
    // Cover-fit against the current room's world rect (Phase 05.1) — not the fixed viewport size.
    // envOn: ENV's own floor/walls replace the illustrated bg + outer dim entirely.
    const hasBg = envOn
      ? SPRITES.setBackground(null)
      : SPRITES.setBackground(inRun ? SPRITES.bgKeyFor(biome) : null, inRun ? this._bgRect() : undefined);   // hub shows no biome bg
    const V = CAMERA.viewRect(40);                // world-space outer fill covers whatever is on screen, incl. shake margin
    if (!envOn) {
      if (hasBg) {
        ctx.fillStyle = 'rgba(0,0,0,' + SPRITES.CFG.BG_DIM_OUTER + ')';               // dim everything outside the arena
        ctx.fillRect(V.x, V.y, V.w, V.h);
      } else {
        ctx.fillStyle = inRun ? biome.bg : '#0b0710';
        ctx.fillRect(V.x, V.y, V.w, V.h);
      }
    }

    if (!inRun) { this.renderHubBg(ctx); return; }

    // arena floor
    if (hasBg || envOn) {
      if (!envOn) ctx.clearRect(A.x, A.y, A.w, A.h);                                   // undo the outer dim inside the arena
      const floorTint = envOn ? ENV.grade('floorTint', SPRITES.CFG.BG_FLOOR_TINT) : SPRITES.CFG.BG_FLOOR_TINT;
      // biome-tinted readability wash; with ENV active the manifest may supply a calmer wash colour
      // (grade.floorWash, 05.4-05) — the DATA biome.floor colours are ~0.55-0.66 HSV-saturated and
      // were the main source of floor saturation above the D-08b screen limit.
      ctx.globalAlpha = floorTint; ctx.fillStyle = envOn ? ENV.grade('floorWash', biome.floor) : biome.floor;
      ctx.fillRect(A.x, A.y, A.w, A.h); ctx.globalAlpha = 1;
      const floorDarken = envOn ? ENV.grade('floorDarken', SPRITES.CFG.BG_FLOOR_DARKEN) : SPRITES.CFG.BG_FLOOR_DARKEN;
      ctx.fillStyle = `rgba(0,0,0,${floorDarken})`;                                    // flat-black darken so sprites/telegraphs pop off busy illustrated floors
      ctx.fillRect(A.x, A.y, A.w, A.h);
      if (!envOn) {
        const vcx = A.x + A.w / 2, vcy = A.y + A.h / 2;                                // soft radial vignette: calm the floor center-out, guarded for the smoke ctx stub
        const vr = Math.max(A.w, A.h) * 0.62;
        const vgrad = ctx.createRadialGradient && ctx.createRadialGradient(vcx, vcy, vr * 0.35, vcx, vcy, vr);
        if (vgrad && vgrad.addColorStop) {
          vgrad.addColorStop(0, 'rgba(0,0,0,0)');
          vgrad.addColorStop(1, 'rgba(0,0,0,0.35)');
          ctx.fillStyle = vgrad;
          ctx.fillRect(A.x, A.y, A.w, A.h);
        }
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

    // walls — ENV draws its own architecture outside the arena when active (D-04); the legacy
    // stroked frame would otherwise double up with it.
    if (!envOn) {
      ctx.strokeStyle = biome.wall;
      ctx.lineWidth = 10;
      ctx.strokeRect(A.x - 5, A.y - 5, A.w + 10, A.h + 10);
      ctx.strokeStyle = biome.accent + '44';
      ctx.lineWidth = 2;
      ctx.strokeRect(A.x - 10, A.y - 10, A.w + 20, A.h + 20);
    }

    // boss slam danger zones
    for (const dz of this.dangerZones || []) {
      if (!CAMERA.visible(dz.x, dz.y, dz.r)) continue;
      ctx.fillStyle = 'rgba(255,68,68,0.12)';
      ctx.strokeStyle = 'rgba(255,68,68,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(dz.x, dz.y, dz.r, 0, U.TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(dz.x, dz.y, dz.r * U.clamp(dz.frac, 0, 1), 0, U.TAU); ctx.stroke();
    }
    // 05.7.1-02: mortar landing circles, ring pre-pulses, lingering pools (ground layer)
    PROJ.drawGround(ctx);

    // zones
    for (const z of this.zones) {
      if (!CAMERA.visible(z.x, z.y, z.r)) continue;
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
      if (!CAMERA.visible(d.x, d.y, d.r + 60)) continue;   // margin covers the reward-name label
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
      if (!CAMERA.visible(pk.x, pk.y, 6)) continue;
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
      if (!CAMERA.visible(e.x, e.y, e.r * 3, 96)) { SPRITES.cullEntity(e); continue; }   // CAM-05: off-screen — hide sprite, keep tracked
      // 05.7.1-05: a submerged enemy hides its sprite and shows only its tell + ripple
      e._hidden = !!e.submerged;
      if (e._hidden) { SPRITES.cullEntity(e); drawTelegraph(ctx, e); drawOverlays(ctx, e, e.y - e.r, e.y + e.r); continue; }
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
   * uses SPRITES.headY so it is not hidden behind the sprite). 05.7.1-01: telegraphs, marks and
   * status overlays now go through the shared drawTelegraph/drawOverlays in js/combat.js, which
   * Enemy.draw/Boss.draw also call — one renderer, no drifting copies.
   */
  renderSpriteExtras(ctx, e) {
    if (e.spawnT > 0) {
      // spawn-in mandala (mirrors Enemy.draw)
      const p = 1 - e.spawnT / DATA.WAVES.spawnGrace;
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

    // telegraph + boss marks + noose rope — the SAME renderer as the primitive path
    // (js/combat.js, 05.7.1-01). This used to be a partial copy that drew only line/circle and
    // never drew marks, so the shipped sprite path hid summon/teleport/lamp/beam/ledger/noose cues.
    drawTelegraph(ctx, e);

    // burn pips, maya ring, stun glyph, asleep zzz, hp bar — anchored to the sprite's head/feet
    drawOverlays(ctx, e, SPRITES.headY(e, e.type), e.y + e.r * SPRITES.CFG.FEET_OFFSET_R);

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

    // 05.7.1-03: melee charge ring (mirrors Player.draw)
    if (P.chargeKind) {
      ctx.strokeStyle = P.charge >= 1 ? '#ffd34d' : 'rgba(255,211,77,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(P.x, P.y, P.r + 10, -Math.PI / 2, -Math.PI / 2 + U.TAU * P.charge); ctx.stroke();
    }

    // bow charge line (mirrors Player.draw)
    if (P.charging && !P.chargeKind) {
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

    // 05.7.1-02: status reads, same renderer as Player.draw
    drawPlayerStatus(ctx, P, SPRITES.headY(P, 'player'), P.y + P.r * SPRITES.CFG.FEET_OFFSET_R);

    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
  },

  renderEffects(ctx) {
    // 05.7.1-03: lodged astras — a slowly spinning gold chakra, fading over its last 2 s
    for (const l of this.lodged) {
      if (!CAMERA.visible(l.x, l.y, 16)) continue;
      const left = l.t - l.age;
      ctx.globalAlpha = left < 2 ? Math.max(0.15, left / 2) * (0.7 + 0.3 * Math.sin(this.time * 10)) : 1;
      ctx.fillStyle = '#ffd34d';
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(this.time * 2);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * U.TAU;
        ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.lineTo(Math.cos(a + 0.4) * 5, Math.sin(a + 0.4) * 5);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,211,77,0.45)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(l.x, l.y, 14, 0, U.TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // orbits
    for (const o of this.orbits) {
      if (!CAMERA.visible(o.x, o.y, 14)) continue;
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
      if (!CAMERA.visible(p.x, p.y, p.r + 16)) continue;
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
    PROJ.drawAll(ctx);

    // lightning bolts
    for (const b of this.bolts) {
      if (!CAMERA.visibleRect(Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1), 16)) continue;
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
      if (!CAMERA.visible(r.x, r.y, r.r * 1.3 + 4)) continue;
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
      if (!CAMERA.visible(t.x, t.y, 60)) continue;
      ctx.globalAlpha = U.clamp(t.t / 0.4, 0, 1);
      ctx.fillStyle = t.color;
      ctx.font = `bold ${t.size}px Georgia`;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },

  // Pure geometry for the pad world-space aim indicator (D-11): a gold arc + chevron centered on
  // the player, pointing along `aim`. P(d) walks distance d along the aim ray from (px, py).
  aimIndicatorGeom(px, py, aim, r) {
    const P = (d, ang) => ({ x: px + Math.cos(ang) * d, y: py + Math.sin(ang) * d });
    return {
      arcR: r + 30,
      arcStart: aim - 0.35,
      arcEnd: aim + 0.35,
      tip: P(r + 44 + 8, aim),
      left: P(r + 44 - 4, aim - 0.22),
      right: P(r + 44 - 4, aim + 0.22),
    };
  },

  // World-space pad aim indicator (D-11): replaces the mouse crosshair while INPUT.device === 'pad'.
  // Drawn in the world pass (after renderEffects, before CAMERA.resetCtx) so the camera transform
  // applies automatically — no manual world<->screen conversion here.
  renderAimIndicator(ctx) {
    if (INPUT.device !== 'pad') return;
    const P = this.player;
    if (!P || P.hp <= 0) return;
    if (!(this.playing() || this.state === 'paused')) return;
    const g = this.aimIndicatorGeom(P.x, P.y, P.aim, P.r);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,211,77,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(P.x, P.y, g.arcR, g.arcStart, g.arcEnd);
    ctx.stroke();

    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(g.left.x, g.left.y);
    ctx.lineTo(g.tip.x, g.tip.y);
    ctx.lineTo(g.right.x, g.right.y);
    ctx.stroke();

    const t = (typeof PAD !== 'undefined' && PAD.state) ? PAD.state.assistTarget : null;
    if (t && !t.dead) {
      const hs = 7, tx = t.x, ty = t.y - (t.r || 0) - 12;
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty - hs);
      ctx.lineTo(tx + hs, ty);
      ctx.lineTo(tx, ty + hs);
      ctx.lineTo(tx - hs, ty);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  },

  // ---- Phase 4: obstacles (pillar/wall/pit) — renderObstacles ----
  renderObstacles(ctx) {
    const biome = this.biome;
    for (const o of this.pillars) {
      if (o.shape === 'rect' ? !CAMERA.visibleRect(o.x, o.y - 8, o.w, o.h + 16) : !CAMERA.visible(o.x, o.y + 6, o.r + 8)) continue;
      if (typeof ENV !== 'undefined' && ENV.hasSkin(o)) continue;   // Phase 05.4: ENV drew a biome-art skin on this obstacle's exact footprint
      const kind = o.kind || 'pillar';
      if (kind === 'pit') {
        const isRect = o.shape === 'rect';
        const pcx = isRect ? o.x + o.w / 2 : o.x, pcy = isRect ? o.y + o.h / 2 : o.y;
        const pr = isRect ? Math.max(o.w, o.h) / 2 : o.r;
        const pgrad = ctx.createRadialGradient && ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, pr);
        if (pgrad && pgrad.addColorStop) {
          pgrad.addColorStop(0, '#000000'); pgrad.addColorStop(1, biome.bg);
          ctx.fillStyle = pgrad;
        } else ctx.fillStyle = 'rgba(0,0,0,0.6)';
        if (isRect) ctx.fillRect(o.x, o.y, o.w, o.h);
        else { ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, U.TAU); ctx.fill(); }
        // thin inner shadow ring
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
        if (isRect) ctx.strokeRect(o.x + 3, o.y + 3, Math.max(0, o.w - 6), Math.max(0, o.h - 6));
        else { ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(0, o.r - 3), 0, U.TAU); ctx.stroke(); }
        // subtler dashed accent rim
        ctx.strokeStyle = biome.accent + '40';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 6]);
        if (isRect) ctx.strokeRect(o.x, o.y, o.w, o.h);
        else { ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, U.TAU); ctx.stroke(); }
        ctx.setLineDash([]);
      } else if (o.shape === 'rect') {
        // carved-stone wall: drop shadow, body, beveled edges, deterministic mortar lines
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(o.x, o.y + 6, o.w, o.h);
        ctx.fillStyle = biome.wall;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = this.shadeMix(biome.wall, '#ffffff', 0.35);
        ctx.fillRect(o.x, o.y, o.w, 3);
        ctx.fillRect(o.x, o.y, 3, o.h);
        ctx.fillStyle = this.shadeMix(biome.wall, '#000000', 0.35);
        ctx.fillRect(o.x, o.y + o.h - 3, o.w, 3);
        ctx.fillRect(o.x + o.w - 3, o.y, 3, o.h);
        // deterministic mortar lines, seeded from position (not per-frame random)
        const seed = Math.floor(o.x) * 13 + Math.floor(o.y) * 7;
        const lines = 2 + (Math.abs(seed) % 2);
        ctx.strokeStyle = biome.accent + '30';
        ctx.lineWidth = 1;
        for (let i = 1; i <= lines; i++) {
          const ly = o.y + (o.h * i) / (lines + 1);
          ctx.beginPath(); ctx.moveTo(o.x + 2, ly); ctx.lineTo(o.x + o.w - 2, ly); ctx.stroke();
        }
        ctx.strokeStyle = biome.accent + '40';
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x + 4, o.y + 4, Math.max(0, o.w - 8), Math.max(0, o.h - 8));
      } else {
        // carved-stone pillar: drop shadow, radial inner shading, capital ring + accent hairline
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath(); ctx.arc(o.x, o.y + 6, o.r, 0, U.TAU); ctx.fill();
        ctx.fillStyle = biome.wall;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, U.TAU); ctx.fill();
        const pillGrad = ctx.createRadialGradient && ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.1, o.x, o.y, o.r);
        if (pillGrad && pillGrad.addColorStop) {
          pillGrad.addColorStop(0, this.shadeMix(biome.wall, '#ffffff', 0.35));
          pillGrad.addColorStop(1, this.shadeMix(biome.wall, '#000000', 0.3));
          ctx.fillStyle = pillGrad;
        } else ctx.fillStyle = this.shadeMix(biome.wall, biome.accent, 0.25);
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = biome.accent + '30'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.82, 0, U.TAU); ctx.stroke();
        ctx.strokeStyle = biome.accent + '40'; ctx.lineWidth = 1.5;
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

    // 05.7.1-02: status row — on the HP-bar line, right of the lotuses (below the bar is taken by
    // the dash/cast pips, the special bar and the glyph legend). Icon + remaining-time bar + stacks.
    if (typeof STATUS !== 'undefined' && P.st) {
      let sx0 = bx + bw + 16 + P.defiance * 18;
      for (const a of STATUS.active(P)) {
        const D = DATA.STATUS[a.type] || {};
        this._hudPanel(ctx, sx0, by - 4, 22, 22, 4);
        ctx.fillStyle = D.color || '#ffffff';
        ctx.font = 'bold 14px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(D.icon || '?', sx0 + 11, by + 11);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(sx0 + 3, by + 14, 16, 2);
        ctx.fillStyle = D.color || '#ffffff';
        ctx.fillRect(sx0 + 3, by + 14, 16 * U.clamp(a.max > 0 ? a.t / a.max : 0, 0, 1), 2);
        if (a.stacks >= 2) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px Georgia';
          ctx.textAlign = 'right';
          ctx.fillText(String(a.stacks), sx0 + 21, by + 17);
        }
        ctx.textAlign = 'left';
        sx0 += 26;
      }
    }

    // dash pips — gold-outlined diamonds, teal fill when charged
    for (let i = 0; i < P.dashMax; i++) {
      const on = i < P.dashCharges;
      this._hudDiamond(ctx, bx + 8 + i * 22, by + 36, 6, on, '#7fdcb7', 'rgba(255,211,77,0.65)');
    }
    // cast pips — 8-petal lotus rosette, filled when charged, outline-only when empty.
    // 05.7.1-03: a lodged astra's pip is a bright gold outline with a centre dot (walk over it).
    const nLodged = this.lodged.length;
    for (let i = 0; i < P.castMax; i++) {
      const on = i < P.castCharges;
      const lodged = !on && i < P.castCharges + nLodged;
      const px = bx + 8 + P.dashMax * 22 + 20 + i * 22;
      this._hudLotus(ctx, px, by + 36, 8, on, on || lodged ? '#ffd34d' : 'rgba(255,211,77,0.35)');
      if (lodged) {
        ctx.fillStyle = '#ffd34d';
        ctx.beginPath(); ctx.arc(px, by + 36, 2, 0, U.TAU); ctx.fill();
      }
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
    if (typeof GLYPHS !== 'undefined') {
      // Lay out [badge(s)] LABEL left-to-right per item, measuring widths first so
      // badges never overlap their own label, and items never overlap each other.
      const badgeSize = 12;
      const measure = (text) => (ctx.measureText ? ctx.measureText(text).width : (text || '').length * 6.5);
      const estimateTokensWidth = (tokens) => {
        let w = 0;
        for (const t of tokens) w += (t.shape ? badgeSize : (measure(t.label || '') + 8)) + 4;
        return w > 0 ? w - 4 : 0;
      };
      const legendItems = [
        { label: 'DASH', action: 'dash' },
        { label: 'ASTRA', action: 'cast' },
        { label: 'SPECIAL', action: 'special' },
      ].map(it => {
        const tokens = GLYPHS.tokensFor(it.action);
        ctx.font = `bold ${badgeSize - 3}px Georgia`;
        const badgeW = estimateTokensWidth(tokens);
        ctx.font = '10px Georgia';
        const labelGap = badgeW > 0 ? 8 : 0;
        const labelW = measure(it.label);
        return { ...it, tokens, badgeW, labelGap, totalW: badgeW + labelGap + labelW };
      });
      const rowStartX = bx + 8;
      const rowMaxRight = rowStartX + 300;
      const itemGap = 12;
      const row1Y = by + 52;
      const row2Y = row1Y + 16;
      const positions = [];
      let cx = rowStartX;
      for (const it of legendItems) {
        if (it.action === 'special' && cx + it.totalW > rowMaxRight) {
          positions.push({ ...it, x: rowStartX, y: row2Y });
        } else {
          positions.push({ ...it, x: cx, y: row1Y });
          cx += it.totalW + itemGap;
        }
      }
      for (const p of positions) {
        ctx.font = `bold ${badgeSize - 3}px Georgia`;
        const bw = GLYPHS.drawTokens(ctx, p.x, p.y, p.tokens, badgeSize);
        ctx.font = '10px Georgia';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(p.label, p.x + bw + (bw > 0 ? 8 : 0), p.y + badgeSize - 1);
      }
    } else {
      ctx.fillText(INPUT.device === 'pad' ? 'SPECIAL [LT / X]' : 'SPECIAL [E / RMB]', sx, by + 58);
    }

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
    const roomLabel = this.roomLabel();
    ctx.fillText(`${this.biome.name} — ${roomLabel}`, this.W / 2, 32);
    this._hudOrnament(ctx, this.W / 2, 40, 160, 'rgba(255,211,77,0.65)');
    const devBiome = (typeof UI !== 'undefined' && UI.DEVANAGARI && UI.DEVANAGARI.biomes) ? UI.DEVANAGARI.biomes[this.biome.id] : '';
    if (devBiome) {
      ctx.fillStyle = 'rgba(255,211,77,0.75)';
      ctx.font = '11px Georgia';
      ctx.fillText(devBiome, this.W / 2, 58);
    }
    // run clock
    const t = Math.floor(this.runTime);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px Georgia';
    ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, this.W / 2, devBiome ? 72 : 52);
    // 05.7.1-09 (Vow of the Hourglass): chamber countdown under the run clock (the biome title
    // owns the y 20-32 band), red in the last 15 s
    if (this.roomTimerOn) {
      const rt = Math.ceil(this.roomTimer || 0);
      ctx.fillStyle = (this.roomTimer || 0) < 15 ? '#ff5566' : '#ffffff';
      ctx.font = 'bold 16px Georgia';
      ctx.fillText(`${Math.floor(rt / 60)}:${String(rt % 60).padStart(2, '0')}`, this.W / 2, devBiome ? 92 : 72);
    }
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

    // mini-boss bar (05.7.1-06): smaller than the boss bar, same slot; never drawn with a boss
    if (this.miniRef && !this.miniRef.dead && !this.bossRef) {
      const B = this.miniRef;
      const w = 360, x = (this.W - w) / 2, y = this.H - 40;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 3, y - 3, w + 6, 18);
      ctx.fillStyle = B.color;
      const hb = U.clamp(B.hp / B.maxhp, 0, 1);
      ctx.fillRect(x, y, w * hb, 12);
      if (this.bossHurtT > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x, y, w * hb, 12);
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 3, y - 3, w + 6, 18);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(`${B.bossDef.name} — ${B.bossDef.sub}`, this.W / 2, y - 9);
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

    // off-screen indicators (CAM-06): alive enemies (clustered) + doors after clear.
    if (this.state !== 'hub') this.renderIndicators(ctx);

    // crosshair (D-11/D-15: screen-space, outside camera transform)
    // kbm aims at the literal cursor position; pad has no cursor at all (D-11/D-06: it gets the
    // world-space aim arc/chevron drawn by renderAimIndicator in the world pass instead).
    if (INPUT.device !== 'pad') {
      const cross = { x: INPUT.mx, y: INPUT.my };
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cross.x, cross.y, 8, 0, U.TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cross.x - 12, cross.y); ctx.lineTo(cross.x - 4, cross.y);
      ctx.moveTo(cross.x + 4, cross.y); ctx.lineTo(cross.x + 12, cross.y);
      ctx.moveTo(cross.x, cross.y - 12); ctx.lineTo(cross.x, cross.y - 4);
      ctx.moveTo(cross.x, cross.y + 4); ctx.lineTo(cross.x, cross.y + 12);
      ctx.stroke();
    }
  },

  // ---- CAM-06: off-screen indicators (edge arrows for alive enemies + cleared-room doors) ----

  // World-space items eligible for an edge indicator: every alive enemy (including still-spawning
  // ones — telegraphed threats deserve a heads-up too) plus, once the room is cleared, its doors.
  indicatorItems() {
    const items = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      // 05.7.1-08 (D-18): an attack is coming (wind-up / long shot) -> its own pulsing threat arrow
      if (CAMERA.isThreat(e)) { items.push({ x: e.x, y: e.y, kind: 'threat', color: '#ff4430', boss: !!e.boss }); continue; }
      items.push({ x: e.x, y: e.y, kind: e.boss ? 'boss' : 'enemy', color: e.boss ? e.color : '#ff5566' });
    }
    if (this.state === 'cleared') {
      for (const d of this.doors) items.push({ x: d.x, y: d.y, kind: 'door', color: d.reward.color, sym: d.reward.sym });
    }
    // 05.7.1-03: off-view lodged astras (05.7.1-08: own ring + glyph, never clustered or dropped)
    for (const l of this.lodged) items.push({ x: l.x, y: l.y, kind: 'astra', color: '#ffd34d', sym: '◎' });
    return items;
  },

  // Filled triangle (local +x = "forward"/tip) rotated to point along `angle`, with a thin dark
  // outline for contrast against any background. Screen-space only (HUD bridge).
  _drawIndicatorTriangle(ctx, x, y, angle, size, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, size * 0.7);
    ctx.lineTo(-size * 0.6, -size * 0.7);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  },

  // renderIndicators(ctx) — CAM-06: draws CAMERA.clusterIndicators(indicatorItems()) on the HUD
  // bridge (screen space, inset clear of the HP panel/title/boss bar). Enemy arrows pulse gently and
  // show a count badge when clustered; door arrows show the reward glyph inside a colored ring.
  // 05.7.1-08 (D-18): threat arrows are red, larger, carry a '!' and pulse fast (constant when
  // screenFlash is off); lodged astras get a gold ring with the '◎' glyph, like a door marker.
  renderIndicators(ctx) {
    const arrows = CAMERA.clusterIndicators(this.indicatorItems());
    const alpha = 0.75 + 0.25 * Math.sin(this.time * 6);
    const calm = typeof SETTINGS !== 'undefined' && SETTINGS.get('screenFlash') === false;
    const threatAlpha = calm ? 1 : 0.6 + 0.4 * Math.sin(this.time * 10);
    for (const ar of arrows) {
      if (ar.kind === 'threat') {
        ctx.globalAlpha = threatAlpha;
        this._drawIndicatorTriangle(ctx, ar.x, ar.y, ar.angle, 12, '#ff4430');
        const ix = ar.x - Math.cos(ar.angle) * 16, iy = ar.y - Math.sin(ar.angle) * 16;
        ctx.fillStyle = '#ff4430';
        ctx.font = 'bold 16px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('!', ix, iy + 6);
        continue;
      }
      if (ar.kind === 'astra') {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ar.x, ar.y, 11, 0, U.TAU); ctx.stroke();
        ctx.fillStyle = '#ffd34d';
        ctx.font = 'bold 12px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('◎', ar.x, ar.y + 4);
        const tx = ar.x + Math.cos(ar.angle) * 15, ty = ar.y + Math.sin(ar.angle) * 15;
        this._drawIndicatorTriangle(ctx, tx, ty, ar.angle, 7, '#ffd34d');
        continue;
      }
      if (ar.kind === 'door') {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ar.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ar.x, ar.y, 13, 0, U.TAU); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(ar.sym || '', ar.x, ar.y + 4);
        const tx = ar.x + Math.cos(ar.angle) * 17, ty = ar.y + Math.sin(ar.angle) * 17;
        this._drawIndicatorTriangle(ctx, tx, ty, ar.angle, 9, ar.color);
        continue;
      }
      const isBoss = ar.kind === 'boss';
      const size = isBoss ? 14 : 9;
      ctx.globalAlpha = alpha;
      this._drawIndicatorTriangle(ctx, ar.x, ar.y, ar.angle, size, ar.color);
      if (ar.count > 1) {
        ctx.globalAlpha = 1;
        const ix = ar.x - Math.cos(ar.angle) * 16, iy = ar.y - Math.sin(ar.angle) * 16;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(String(ar.count), ix, iy + 4);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
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
