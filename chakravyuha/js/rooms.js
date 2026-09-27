// ============================================================
// CHAKRAVYUHA — rooms.js : run generation, encounters, doors
// A run = 4 biomes; each biome = N combat rooms then a boss.
// Doors preview their reward, Hades-style: you choose your path.
// ============================================================
'use strict';

const ROOMS = {

  // ---- Phase 05.1: arena sizing (CAM-01/CAM-07, D-01/D-02/D-03) ----
  setArena(kind) {
    const s = DATA.ARENA.sizes[kind] || DATA.ARENA.sizes.rest;
    // D-02: mutate GAME.arena in place — any code/test holding `const A = GAME.arena` keeps a live reference.
    Object.assign(GAME.arena, { x: DATA.ARENA.origin.x, y: DATA.ARENA.origin.y, w: s.w, h: s.h });
    GAME.arenaKind = kind;
    // Cross-phase contract (05.4): expose the current room's world-rect padding on GAME so both
    // ROOMS.worldRect() and CAMERA's scroll clamp (CAMERA.pad()) agree on how far past the arena
    // edge the camera/art may extend.
    GAME.arenaPad = DATA.ARENA.padBySize[kind] || DATA.ARENA.padBySize.rest;
  },

  worldRect() { return CAMERA.worldRectFor(GAME.arena, GAME.arenaPad || DATA.ARENA.padBySize.rest); },

  obstacleScale() {
    const A = GAME.arena;
    return U.clamp(Math.sqrt(Math.min(A.w / 1180, A.h / 580)), 1, DATA.ARENA.maxObstacleScale);
  },

  isLargeArena() {
    const A = GAME.arena;
    return A.w * A.h >= DATA.ARENA.largeArea;
  },

  hazardCountScale() {
    const A = GAME.arena;
    return U.clamp(Math.sqrt((A.w * A.h) / DATA.ARENA.legacyArea), 1, 2.2);
  },

  // ---- Phase 4: room layout geometry helpers (GAME-03) ----
  layoutsFor(biomeId) { return DATA.LAYOUTS[biomeId] || []; },

  materializeLayout(tpl) {
    const A = GAME.arena;
    const scale = this.obstacleScale();
    const list = tpl.obstacles.concat(this.isLargeArena() && tpl.large ? tpl.large : []);
    return list.map(o => {
      if (o.kind === 'wall' || (o.w !== undefined && o.h !== undefined)) {
        return { shape: 'rect', kind: o.kind, x: A.x + o.x * A.w, y: A.y + o.y * A.h,
          w: o.w * A.w, h: o.h * A.h, tpl: tpl.id };
      }
      return { shape: 'circle', kind: o.kind || 'pillar', x: A.x + o.x * A.w, y: A.y + o.y * A.h,
        r: o.r * scale, tpl: tpl.id };
    });
  },

  // Distance from (x,y) to an obstacle's surface (0 or negative-equivalent when inside).
  obstacleDist(o, x, y) {
    const shape = o.shape || 'circle';
    if (shape === 'rect') {
      const cx = U.clamp(x, o.x, o.x + o.w);
      const cy = U.clamp(y, o.y, o.y + o.h);
      return U.dist(x, y, cx, cy);
    }
    return U.dist(x, y, o.x, o.y) - o.r;
  },

  pointBlocked(x, y, r, opts = {}) {
    const obstacles = opts.obstacles || GAME.pillars;
    for (const o of obstacles) {
      if (opts.projectile && o.kind === 'pit') continue;
      if (this.obstacleDist(o, x, y) < r) return true;
    }
    return false;
  },

  blocksProjectile(p) { return this.pointBlocked(p.x, p.y, p.r, { projectile: true }); },

  // Guaranteed-free fallback spawn point: coarse grid scan of the right 70% of the arena.
  findClearSpawnPoint(r) {
    const A = GAME.arena, P = GAME.player, step = 40;
    const xStart = A.x + A.w * 0.3;
    for (const minDist of [220, 120]) {
      for (let y = A.y + 60; y <= A.y + A.h - 60; y += step) {
        for (let x = xStart; x <= A.x + A.w - 60; x += step) {
          if (U.dist(x, y, P.x, P.y) < minDist) continue;
          if (this.pointBlocked(x, y, r)) continue;
          return { x, y };
        }
      }
    }
    return null;
  },

  // ---- Phase 4: hazard placement (GAME-04) ----
  // A random point clear of obstacles, player spawn, doors and (optionally) other placed points.
  freePoint(r, opts = {}) {
    const A = GAME.arena;
    const spawnX = A.x + 90, spawnY = A.y + A.h / 2;
    const doorX = A.x + A.w - 36;
    const doorYs = [1 / 3, 1 / 2, 2 / 3].map(f => A.y + A.h * f);
    const spawnClear = opts.spawnClear ?? 140;
    const avoid = opts.avoid || [];
    const minSep = opts.minSep ?? 0;
    for (let tries = 0; tries < 60; tries++) {
      const x = U.rand(A.x + r + 20, A.x + A.w - r - 20);
      const y = U.rand(A.y + r + 20, A.y + A.h - r - 20);
      if (this.pointBlocked(x, y, r + 8)) continue;
      if (U.dist(x, y, spawnX, spawnY) < spawnClear) continue;
      if (doorYs.some(dy => U.dist(x, y, doorX, dy) < r + 70)) continue;
      if (avoid.some(o => U.dist(x, y, o.x, o.y) < minSep + r + (o.r || 0))) continue;
      return { x, y };
    }
    return null;
  },

  spawnHazards() {
    GAME.hazards = [];
    const def = DATA.HAZARDS[GAME.biome.hazard];
    if (!def) return;
    const A = GAME.arena;
    const hcs = this.hazardCountScale();
    if (def.id === 'fireVent') {
      const n = Math.round(U.randInt(def.count[0], def.count[1]) * hcs);
      const placed = [];
      for (let i = 0; i < n; i++) {
        const p = this.freePoint(def.r, { avoid: placed, minSep: 30 });
        if (!p) continue;
        placed.push({ x: p.x, y: p.y, r: def.r });
        GAME.hazards.push({ type: 'fireVent', x: p.x, y: p.y, r: def.r, phase: 'dormant',
          t: def.firstDelay + U.rand(def.dormant[0], def.dormant[1]) * U.rand(0.3, 1),
          warnShown: 0, hitSet: null, age: 0 });
      }
    } else if (def.id === 'venomPool') {
      const n = Math.round(U.randInt(def.count[0], def.count[1]) * hcs);
      const placed = [];
      for (let i = 0; i < n; i++) {
        const r = U.rand(def.r[0], def.r[1]);
        const p = this.freePoint(r, { avoid: placed, minSep: 30 });
        if (!p) continue;
        placed.push({ x: p.x, y: p.y, r });
        GAME.hazards.push({ type: 'venomPool', x: p.x, y: p.y, r, age: 0, tickT: 0 });
      }
    } else if (def.id === 'arrowVolley') {
      GAME.hazards.push({ type: 'arrowVolley', t: def.firstDelay, markers: [] });
    } else if (def.id === 'riverCurrent') {
      // D-CAM-07: tall (combat-sized) arenas get a second river band; both formulas already
      // exclude the spawn row (A.y + A.h/2 +/- 40).
      const makeBand = (upper) => {
        const h = U.rand(def.h[0], def.h[1]);
        const y = upper
          ? U.rand(A.y + 30, A.y + A.h * 0.5 - h - 40)
          : U.rand(A.y + A.h * 0.5 + 40, A.y + A.h - h - 30);
        return { type: 'riverCurrent', x: A.x, y, w: A.w, h,
          dir: U.chance(0.5) ? 1 : -1, phase: 'calm', t: U.rand(def.surgeEvery[0], def.surgeEvery[1]), age: 0 };
      };
      if (A.h >= 1000) {
        GAME.hazards.push(makeBand(true));
        GAME.hazards.push(makeBand(false));
      } else {
        GAME.hazards.push(makeBand(U.chance(0.5)));
      }
    }
  },

  // Build the arena geometry for a new room (a per-biome layout template, or open for boss rooms)
  buildArena(isBoss, forceId) {
    GAME.pillars = [];
    if (isBoss) return; // boss arenas are open
    const list = this.layoutsFor(GAME.biome.id);
    if (!list.length) {
      // fallback: legacy random pillars (kept for biomes with no templates yet)
      const n = U.randInt(0, 3);
      for (let i = 0; i < n; i++) {
        let x, y, tries = 0;
        do {
          x = U.rand(GAME.arena.x + 150, GAME.arena.x + GAME.arena.w - 150);
          y = U.rand(GAME.arena.y + 110, GAME.arena.y + GAME.arena.h - 110);
          tries++;
        } while (tries < 20 && (U.dist(x, y, GAME.player.x, GAME.player.y) < 160 ||
                 GAME.pillars.some(p => U.dist(x, y, p.x, p.y) < 170)));
        GAME.pillars.push({ shape: 'circle', kind: 'pillar', x, y, r: U.rand(28, 46) });
      }
      return;
    }
    let tpl;
    if (forceId) tpl = list.find(t => t.id === forceId) || U.choice(list);
    else {
      const candidates = list.filter(t => t.id !== this.lastLayoutId);
      tpl = U.choice(candidates.length ? candidates : list);
    }
    GAME.pillars = this.materializeLayout(tpl);
    this.lastLayoutId = tpl.id;
    (this.layoutHistory = this.layoutHistory || []).push({ biome: GAME.biome.id, id: tpl.id });
    if (this.layoutHistory.length > 200) this.layoutHistory.shift();
  },

  // Encounter plan: total budget split into waves
  planWaves() {
    const b = GAME.biome;
    // roomIdx is 1-based by the time waves are planned
    const roomFrac = U.clamp((GAME.roomIdx - 1) / Math.max(1, b.rooms - 1), 0, 1);
    const budget = Math.round(U.lerp(b.budget[0], b.budget[1], roomFrac));
    const nWaves = budget <= 6 ? 1 : (budget <= 11 ? 2 : 3);
    const waves = [];
    let left = budget;
    for (let i = 0; i < nWaves; i++) {
      const share = i === nWaves - 1 ? left : Math.ceil(budget / nWaves);
      waves.push(Math.max(2, share));
      left -= share;
    }
    return waves;
  },

  spawnWave(budget) {
    const b = GAME.biome;
    let left = budget, guard = 0;
    while (left > 0 && guard++ < 30) {
      const pool = b.enemies.map(id => DATA.ENEMIES[id]).filter(e => e.cost <= Math.max(left, 1));
      const def = U.choice(pool.length ? pool : b.enemies.map(id => DATA.ENEMIES[id]));
      left -= def.cost;
      // spawn away from the player and clear of obstacles
      let x, y, tries = 0, ok = false;
      do {
        x = U.rand(GAME.arena.x + 60, GAME.arena.x + GAME.arena.w - 60);
        y = U.rand(GAME.arena.y + 60, GAME.arena.y + GAME.arena.h - 60);
        tries++;
        ok = U.dist(x, y, GAME.player.x, GAME.player.y) >= 220 && !this.pointBlocked(x, y, def.r + 12);
      } while (tries < 40 && !ok);
      if (!ok) {
        const spot = this.findClearSpawnPoint(def.r + 12);
        if (spot) { x = spot.x; y = spot.y; }
      }
      GAME.enemies.push(new Enemy(def.id, x, y, b.scale));
    }
  },

  // What two doors offer after this room clears
  doorOptions() {
    // roomIdx is 1-based; after the biome's final combat room, only the boss gate remains
    if (GAME.roomIdx >= GAME.biome.rooms) return [DATA.REWARDS.boss];

    const P = GAME.player;
    const opts = [];
    const pool = [];
    const R = DATA.REWARDS;
    pool.push({ ...R.boon, w: R.boon.w });
    pool.push({ ...R.mudra, w: R.mudra.w });
    pool.push({ ...R.punya, w: R.punya.w });
    pool.push({ ...R.maxhp, w: R.maxhp.w });
    if (P.allBoons().some(b => b.rarity < 2)) pool.push({ ...R.amrit, w: R.amrit.w });
    if (P.hp < P.maxhp * 0.8) pool.push({ ...R.sarovar, w: R.sarovar.w + 6 });
    if (!GAME.shopSeenThisBiome && GAME.roomIdx >= 1) pool.push({ ...R.kubera, w: R.kubera.w });

    while (opts.length < 2 && pool.length) {
      const pick = U.weightedChoice(pool);
      pool.splice(pool.indexOf(pick), 1);
      opts.push(pick);
    }
    return opts;
  },

  // Move to the next room with a chosen reward
  enterRoom(rewardId) {
    const G = GAME;
    G.reward = rewardId;
    G.enemies = []; G.eprojectiles = []; G.pprojectiles = [];
    G.pickups = []; G.zones = []; G.orbits = []; G.rings = [];
    G.bolts = []; G.dangerZones = []; G.doors = []; G.hazards = [];
    G.nooseT = 0; G.bossRewarded = false;

    // D-02: size the arena for this room kind BEFORE the player is placed.
    const kind = rewardId === 'boss' ? 'boss' : (rewardId === 'sarovar' || rewardId === 'kubera') ? 'rest' : 'combat';
    this.setArena(kind);

    const P = G.player;
    P.x = G.arena.x + 90;
    P.y = G.arena.y + G.arena.h / 2;
    P.iframes = Math.max(P.iframes, 0.8);
    if (typeof CAMERA !== 'undefined') CAMERA.snap();   // D-08: room changes never swoop

    if (rewardId === 'boss') {
      G.roomIdx++; // boss room
      this.buildArena(true);
      const boss = new Boss(G.biome.boss, G.arena.x + G.arena.w * 0.72, G.arena.y + G.arena.h / 2);
      G.enemies.push(boss);
      G.bossRef = boss;
      G.waves = [];
      UI.bossIntro(boss.bossDef);
      G.state = 'combat';
      return;
    }

    G.bossRef = null;
    G.roomIdx++;
    G.totalRooms++;

    if (rewardId === 'sarovar') {
      this.buildArena(false);
      G.waves = [];
      const heal = Math.round(P.maxhp * 0.35);
      P.hp = Math.min(P.maxhp, P.hp + heal);
      dmgText(P.x, P.y - 30, '+' + heal, '#7fdcb7', 20);
      AUDIO.sfx('heal');
      UI.banner('THE SACRED POOL RESTORES YOU', '#7fdcb7');
      G.state = 'cleared';
      this.openDoors();
      return;
    }
    if (rewardId === 'kubera') {
      this.buildArena(false);
      G.waves = [];
      G.shopSeenThisBiome = true;
      G.state = 'cleared';
      UI.openShop();
      this.openDoors();
      return;
    }

    // combat room
    this.buildArena(false);
    this.spawnHazards();
    G.waves = this.planWaves();
    this.spawnWave(G.waves.shift());
    G.state = 'combat';
  },

  // Room cleared: grant the room's reward, then reveal doors
  onRoomClear() {
    const G = GAME, P = G.player;
    AUDIO.sfx('roomclear');
    switch (G.reward) {
      case 'boon': UI.offerBoon(); break;
      case 'mudra': {
        let amt = U.randInt(45, 80);
        if (P.has('indra_tribute')) amt = Math.round(amt * (1 + P.val('indra_tribute') / 100));
        P.mudra += amt; AUDIO.sfx('coin');
        UI.banner(`+${amt} MUDRA`, '#ffcf5c');
        break;
      }
      case 'punya': {
        const amt = U.randInt(6, 12);
        P.punyaRun += amt; META.punya += amt; META.save();
        AUDIO.sfx('punya');
        UI.banner(`+${amt} PUNYA`, '#c77dff');
        break;
      }
      case 'maxhp':
        P.maxhp += 10; P.hp = Math.min(P.maxhp, P.hp + 25);
        AUDIO.sfx('heal');
        UI.banner('+10 MAX LIFE', '#ff6b81');
        break;
      case 'amrit': UI.offerAmrit(); break;
      case 'first': UI.offerBoon(); break; // guaranteed first-room boon
    }
    this.openDoors();
  },

  openDoors() {
    const G = GAME;
    const opts = this.doorOptions();
    const n = opts.length;
    G.doors = opts.map((o, i) => ({
      x: G.arena.x + G.arena.w - 36,
      y: G.arena.y + G.arena.h * ((i + 1) / (n + 1)),
      r: 30, reward: o,
    }));
    AUDIO.sfx('door');
  },

  // After a boss dies: reward, then pass to next biome (or victory)
  onBossDefeated() {
    const G = GAME, P = G.player;
    const isLast = G.biomeIdx >= DATA.BIOMES.length - 1;
    // punya trophy
    const amt = 25 + G.biomeIdx * 15;
    P.punyaRun += amt; META.punya += amt; META.save();
    AUDIO.sfx('punya');

    if (isLast) { G.onVictory(); return; }

    UI.banner(`+${amt} PUNYA — THE WAY OPENS`, '#c77dff');
    // heal between biomes, like the well between Hades regions
    const heal = Math.round(P.maxhp * 0.25);
    P.hp = Math.min(P.maxhp, P.hp + heal);

    G.doors = [{
      x: G.arena.x + G.arena.w - 36,
      y: G.arena.y + G.arena.h / 2,
      r: 34, reward: { id: 'nextbiome', name: DATA.BIOMES[G.biomeIdx + 1].name, sym: '⛩', color: '#fff' },
    }];
    AUDIO.sfx('door');
  },

  enterBiome(idx) {
    const G = GAME;
    G.biomeIdx = idx;
    G.biome = DATA.BIOMES[idx];
    G.roomIdx = 0;
    G.shopSeenThisBiome = false;
    META.bestBiome = Math.max(META.bestBiome, idx);
    META.save();
    AUDIO.startDrone(G.biome.droneHz);
    UI.biomeTitle(G.biome);
    // first room of the entire run guarantees a boon
    const reward = (idx === 0) ? 'first' : 'boon';
    this.enterRoom(reward);
  },
};
