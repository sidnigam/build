// ============================================================
// CHAKRAVYUHA — heat.js : Vows of Tapas, the opt-in Heat system (05.7.1-09, D-04, COMBAT-16)
// Vow selections live on META.heat ({ id: rank }), best Heat per weapon on META.bestHeat.
// HEAT.beginRun() freezes the run's effects into GAME.heat at run start; gameplay reads those
// fields at spawn / compose / door / shop / offer time and treats an absent GAME.heat as neutral.
// Locked (META.wins < DATA.HEAT.unlockWins) or empty selections give exactly-neutral effects.
// Loads right after meta.js.
// ============================================================
'use strict';

const HEAT = {
  vow(id) { return DATA.HEAT.vows.find(v => v.id === id); },
  unlocked() { return (META.wins | 0) >= DATA.HEAT.unlockWins; },

  // rank of a vow in a selection, clamped to [0, ranks]; unknown ids -> 0
  rank(id, sel = META.heat) {
    const v = this.vow(id);
    if (!v || !sel) return 0;
    return Math.max(0, Math.min(v.ranks, sel[id] | 0));
  },

  // set a stored vow rank (clamped, 0 deletes); unknown ids are ignored. Returns the stored rank.
  setRank(id, r) {
    const v = this.vow(id);
    if (!v) return 0;
    if (!META.heat || typeof META.heat !== 'object') META.heat = {};
    const n = Math.max(0, Math.min(v.ranks, r | 0));
    if (n === 0) delete META.heat[id]; else META.heat[id] = n;
    META.save();
    return n;
  },

  // total Heat of a selection: sum of heat[0 .. rank - 1] per vow
  total(sel = META.heat) {
    let t = 0;
    for (const v of DATA.HEAT.vows) {
      const r = this.rank(v.id, sel);
      for (let i = 0; i < r; i++) t += v.heat[i];
    }
    return t;
  },

  // frozen per-run effect fields; {} -> every multiplier 1, every bonus 0, flags false
  effects(sel = {}) {
    const r = id => this.rank(id, sel);
    const total = this.total(sel);
    const hg = r('hourglass');
    return Object.freeze({
      total,
      enemyDmg: 1 + 0.2 * r('pain'),
      enemyHp: 1 + 0.15 * r('endurance'),
      budget: 1 + 0.2 * r('multitude'),
      haste: 1 + 0.15 * r('haste'),
      eliteShareMul: r('champions') ? 1.5 : 1,
      eliteModBonus: r('champions') >= 2 ? 1 : 0,
      extraMoves: r('wardens') >= 1,
      chainBonus: r('wardens') >= 2 ? 1 : 0,
      restMul: r('wardens') >= 2 ? 0.7 : 1,
      phaseAtBonus: r('wardens') >= 3 ? 0.15 : 0,
      healMul: 1 - 0.25 * r('thirst'),
      noSarovar: r('austerity') >= 1,
      projExtra: r('storms'),
      projSpeed: 1 + 0.15 * r('storms'),
      shopMul: 1 + 0.4 * r('scarcity'),
      boonChoicesMinus: r('restraint'),
      roomTimer: hg === 1 ? 120 : hg === 2 ? 90 : 0,
      tokens: Math.floor(total / 10),
    });
  },

  // called by GAME.startRun before the first room spawns
  beginRun() {
    const sel = this.unlocked() ? (META.heat || {}) : {};
    GAME.heat = this.effects(sel);
    GAME.heatTotal = GAME.heat.total;
    GAME.heatSel = Object.assign({}, sel);
    return GAME.heat;
  },

  punyaMul() { return 1 + DATA.HEAT.punyaPerHeat * (GAME.heatTotal || 0); },
  punya(n) { return Math.round(n * this.punyaMul()); },
  heal(n) { return Math.round(n * ((GAME.heat && GAME.heat.healMul) ?? 1)); },

  // first clear at a new highest Heat for this weapon: one-time bounty, recorded per weapon
  onVictory(weaponId) {
    const t = GAME.heatTotal || 0;
    if (!META.bestHeat || typeof META.bestHeat !== 'object') META.bestHeat = {};
    if (t <= 0 || t <= (META.bestHeat[weaponId] | 0)) return 0;
    const bounty = DATA.HEAT.bountyBase + DATA.HEAT.bountyPerHeat * t;
    META.bestHeat[weaponId] = t;
    META.punya += bounty;
    if (GAME.player) GAME.player.punyaRun = (GAME.player.punyaRun || 0) + bounty;
    META.save();
    return bounty;
  },
};
