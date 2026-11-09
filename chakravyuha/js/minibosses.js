// ============================================================
// CHAKRAVYUHA — minibosses.js : mid-biome champions (05.7.1-06, D-08, COMBAT-06)
// MiniBoss extends Boss, so every move inherits the BOSS_TG telegraph invariant (damage only
// through the inherited strike/hurtPlayer/shoot while armed). Signature attacks are data-driven
// `pattern` moves fired by Boss._runPattern through PROJ.planPattern; base Boss states (chase,
// swipe, charge, radial, teleport) are reused as-is. Enrage at 40% HP via the phaseAt() hook.
// Loads right after entities.js.
// ============================================================
'use strict';

// wind: telegraph seconds; active: seconds the pattern fires over; pattern: PROJ.planPattern spec
// plus volleys/volleyGap/extra/status (see Boss._runPattern). Phase 2 adds one projectile to
// 'around' / 'radial' / 'player' patterns.
const MINI_MOVE_DEFS = {
  emberMortar:    { wind: 0.9, active: 0.3, dmg: true, pattern: { fam: 'mortar', aim: 'around', count: 3, radius: 140, extra: { pool: { status: { type: 'burn', dps: 4, dur: 2 }, r: 55, dur: 3 } } } },
  emberRing:      { wind: 0.6, active: 0.3, dmg: true, pattern: { fam: 'ring', aim: 'self', gapArc: 0.9, status: { type: 'burn', dps: 3, dur: 2 } } },
  emberFan:       { wind: 0.5, active: 0.5, dmg: true, pattern: { fam: 'ember', aim: 'player', count: 5, spread: 0.9, volleys: 2, volleyGap: 0.25 } },
  wispCoven:      { wind: 0.6, active: 0.4, dmg: true, pattern: { fam: 'wisp', aim: 'radial', count: 4 } },
  venomRing:      { wind: 0.6, active: 0.3, dmg: true, pattern: { fam: 'ring', aim: 'self', gapArc: 0.8, status: { type: 'poison', dps: 3, dur: 4 } } },
  coilLines:      { wind: 0.5, active: 0.4, dmg: true, pattern: { fam: 'coil', aim: 'player', count: 3, spread: 0.5 } },
  spearBeam:      { wind: 0.8, active: 0.5, dmg: true, pattern: { fam: 'beam', aim: 'line', count: 1, tell: 0.1 } },
  twinBeam:       { wind: 0.8, active: 0.5, dmg: true, pattern: { fam: 'beam', aim: 'line', count: 2, spread: 0.5, tell: 0.1 } },
  thunderNeedles: { wind: 0.5, active: 0.6, dmg: true, pattern: { fam: 'thunder', aim: 'player', count: 3, spread: 0.4, volleys: 3, volleyGap: 0.2 } },
  drumRing:       { wind: 0.6, active: 0.3, dmg: true, pattern: { fam: 'ring', aim: 'self', gapArc: 0 } },
  goldBombs:      { wind: 0.6, active: 0.4, dmg: true, pattern: { fam: 'bomb', aim: 'around', count: 3, radius: 160 } },
  chakramToss:    { wind: 0.5, active: 1.4, dmg: true, pattern: { fam: 'chakram', aim: 'player', count: 2, spread: 0.7 } },
  mirageRing:     { wind: 0.6, active: 0.3, dmg: true, pattern: { fam: 'ring', aim: 'self', gapArc: 1.0 } },
};

// [id, weight, overrides?] per phase; the {opener:true} entry opens the enrage deterministically.
const MINI_MOVESETS = {
  subahu:     { 1: [['chase', 2], ['emberMortar', 3], ['charge', 2], ['emberFan', 2]],
                2: [['emberRing', 2, { opener: true }], ['emberMortar', 3], ['charge', 2], ['emberFan', 2], ['chase', 1]] },
  mahiravana: { 1: [['teleport', 2], ['wispCoven', 3], ['coilLines', 2], ['radial', 1]],
                2: [['venomRing', 2, { opener: true }], ['wispCoven', 3], ['coilLines', 2], ['teleport', 2]] },
  alambusha:  { 1: [['chase', 2], ['spearBeam', 3], ['teleport', 2], ['swipe', 2]],
                2: [['drumRing', 2, { opener: true }], ['twinBeam', 3], ['thunderNeedles', 2], ['teleport', 2]] },
  maricha:    { 1: [['charge', 2], ['goldBombs', 3], ['chakramToss', 2], ['chase', 1]],
                2: [['mirageRing', 2, { opener: true }], ['goldBombs', 3], ['chakramToss', 3], ['charge', 2]] },
};

class MiniBoss extends Boss {
  constructor(id, x, y) {
    super(id, x, y, DATA.MINIBOSSES[id]);
    this.mini = true; this.asleep = false; this.dmg = 14; this.state = 'intro'; this.t = 0.8;
  }
  moveTable(phase = this.phase) { return (MINI_MOVESETS[this.type] || {})[phase] || []; }
  moveDefBase(id) { return MINI_MOVE_DEFS[id] || BOSS_MOVE_DEFS[id]; }
  phaseAt() { return 0.4; }
  phaseTitle() { return this.bossDef.enrageTitle; }
}
