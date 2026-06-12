// ============================================================
// CHAKRAVYUHA — rooms.js : run generation, encounters, doors
// A run = 4 biomes; each biome = N combat rooms then a boss.
// Doors preview their reward, Hades-style: you choose your path.
// ============================================================
'use strict';

const ROOMS = {

  // Build the arena geometry for a new room (pillars vary per room)
  buildArena(isBoss) {
    GAME.pillars = [];
    if (isBoss) return; // boss arenas are open
    const n = U.randInt(0, 3);
    for (let i = 0; i < n; i++) {
      let x, y, tries = 0;
      do {
        x = U.rand(GAME.arena.x + 150, GAME.arena.x + GAME.arena.w - 150);
        y = U.rand(GAME.arena.y + 110, GAME.arena.y + GAME.arena.h - 110);
        tries++;
      } while (tries < 20 && (U.dist(x, y, GAME.player.x, GAME.player.y) < 160 ||
               GAME.pillars.some(p => U.dist(x, y, p.x, p.y) < 170)));
      GAME.pillars.push({ x, y, r: U.rand(28, 46) });
    }
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
      // spawn away from the player
      let x, y, tries = 0;
      do {
        x = U.rand(GAME.arena.x + 60, GAME.arena.x + GAME.arena.w - 60);
        y = U.rand(GAME.arena.y + 60, GAME.arena.y + GAME.arena.h - 60);
        tries++;
      } while (tries < 25 && U.dist(x, y, GAME.player.x, GAME.player.y) < 220);
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
    G.bolts = []; G.dangerZones = []; G.doors = [];
    G.nooseT = 0; G.bossRewarded = false;

    const P = G.player;
    P.x = G.arena.x + 90;
    P.y = G.arena.y + G.arena.h / 2;
    P.iframes = Math.max(P.iframes, 0.8);

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
