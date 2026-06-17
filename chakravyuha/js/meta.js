// ============================================================
// CHAKRAVYUHA — meta.js : persistent progression (localStorage)
// Punya (merit), Path of Dharma upgrades, weapon unlocks, stats.
// ============================================================
'use strict';

const META = {
  KEY: 'chakravyuha_save_v1',

  punya: 0,
  upgrades: {},           // id -> rank
  weapons: ['khanda'],    // unlocked weapon ids
  lastWeapon: 'khanda',
  deaths: 0,
  wins: 0,
  runs: 0,
  bestBiome: 0,           // furthest biome index reached (0-based, +1 displayed)
  bestTime: 0,            // fastest winning run, seconds
  codexSeen: false,

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const s = JSON.parse(raw);
        Object.assign(this, {
          punya: s.punya | 0,
          upgrades: s.upgrades || {},
          weapons: s.weapons || ['khanda'],
          lastWeapon: s.lastWeapon || 'khanda',
          deaths: s.deaths | 0,
          wins: s.wins | 0,
          runs: s.runs | 0,
          bestBiome: s.bestBiome | 0,
          bestTime: s.bestTime || 0,
          codexSeen: !!s.codexSeen,
        });
      }
    } catch (e) { /* corrupted save: start fresh */ }
    if (!this.weapons.includes(this.lastWeapon)) this.lastWeapon = 'khanda';
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        punya: this.punya, upgrades: this.upgrades, weapons: this.weapons,
        lastWeapon: this.lastWeapon, deaths: this.deaths, wins: this.wins,
        runs: this.runs, bestBiome: this.bestBiome, bestTime: this.bestTime,
        codexSeen: this.codexSeen,
      }));
    } catch (e) { /* storage unavailable; play session-only */ }
  },

  rank(id) { return this.upgrades[id] | 0; },

  canBuy(def) {
    const r = this.rank(def.id);
    return r < def.max && this.punya >= def.cost[r];
  },

  buy(def) {
    if (!this.canBuy(def)) return false;
    this.punya -= def.cost[this.rank(def.id)];
    this.upgrades[def.id] = this.rank(def.id) + 1;
    this.save();
    return true;
  },

  unlockWeapon(id) {
    const w = DATA.WEAPONS[id];
    if (!w || this.weapons.includes(id) || this.punya < w.unlock) return false;
    this.punya -= w.unlock;
    this.weapons.push(id);
    this.save();
    return true;
  },

  // --- derived bonuses used by the run ---
  bonusDamage()    { return 1 + this.rank('bala') * 0.05; },
  bonusHp()        { return this.rank('kavacha') * 10; },
  bonusSpeed()     { return 1 + this.rank('laghima') * 0.04; },
  critChance()     { return this.rank('drishti') * 0.05; },
  rarityBonus()    { return this.rank('bhagya') * 0.12; },
  startMudra()     { return this.rank('dhana') * 60; },
  bonusDash()      { return this.rank('vega'); },
  boonChoices()    { return 3 + this.rank('amsha'); },
  defianceCount()  { return this.rank('sanjeevani'); },

  wipe() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
    Object.assign(this, {
      punya: 0, upgrades: {}, weapons: ['khanda'], lastWeapon: 'khanda',
      deaths: 0, wins: 0, runs: 0, bestBiome: 0, bestTime: 0, codexSeen: false,
    });
  },
};
