// 05.7.1-09 (D-04, COMBAT-16): Vows of Tapas — the opt-in Heat system. Unlock after the first full
// clear, vow ranks and Heat math, frozen per-run effects, Punya scaling, the one-time best-Heat
// bounty per weapon, META/STORE persistence, the vow wording lint (desc functions are skipped by
// the smoke deep-walk), every vow's gameplay hook, and the neutral (no-vow / locked) run.
'use strict';
module.exports = function ({ R, check, section, fs, path, root }) {
  const J = JSON.stringify;

  const has = R(`typeof HEAT === 'object' && !!DATA.HEAT && Array.isArray(DATA.HEAT.vows)`);
  check('HEAT module and DATA.HEAT.vows exist', has);
  if (!has) return;

  // META snapshot so every block can restore the boot state
  R(`globalThis.__hm = {
    snap() { return JSON.stringify({ wins: META.wins, heat: META.heat, bestHeat: META.bestHeat, punya: META.punya }); },
    restore(s) { const o = JSON.parse(s); Object.assign(META, o); GAME.heat = undefined; GAME.heatTotal = 0; GAME.heatSel = {}; },
  }; globalThis.__hm0 = __hm.snap();`);

  // ---------------- data ----------------
  section('heat: data');
  const data = R(`(() => {
    const V = DATA.HEAT.vows;
    const ids = V.map(v => v.id);
    const max = V.reduce((s, v) => s + v.heat.reduce((a, b) => a + b, 0), 0);
    const shapes = V.every(v => typeof v.name === 'string' && v.ranks >= 1 && v.heat.length === v.ranks && typeof v.desc === 'function');
    return { ids, max, shapes, unlockWins: DATA.HEAT.unlockWins, pph: DATA.HEAT.punyaPerHeat, bb: DATA.HEAT.bountyBase, bph: DATA.HEAT.bountyPerHeat };
  })()`);
  const want = ['pain', 'endurance', 'multitude', 'haste', 'champions', 'wardens', 'thirst', 'austerity', 'storms', 'scarcity', 'restraint', 'hourglass'];
  check(`DATA.HEAT has the 12 vows (${data.ids.join(', ')})`, J(data.ids) === J(want));
  check('every vow has a name, ranks, one heat value per rank and a desc function', data.shapes);
  check(`max Heat is 46 (${data.max})`, data.max === 46);
  check('unlockWins 1, punyaPerHeat 0.05, bounty 20 + 5/Heat', data.unlockWins === 1 && data.pph === 0.05 && data.bb === 20 && data.bph === 5);

  // vow wording lint (functions are not covered by the smoke DATA deep-walk)
  const banned = ['Yama', 'Dharmaraja', 'Lord of Death', 'Hanuman', 'Agni', 'Indra', 'Vayu', 'Krishna', 'Durga', 'Shiva', 'Vishnu', 'Brahma', 'Saraswati', 'kill', 'slay', 'slain'];
  const texts = R(`(() => { const out = []; for (const v of DATA.HEAT.vows) { out.push(v.name); for (let r = 1; r <= v.ranks; r++) out.push(v.desc(r)); } return out; })()`);
  const bad = texts.filter(t => typeof t !== 'string' || !t.trim() || banned.some(w => t.toLowerCase().includes(w.toLowerCase())));
  check(`every vow name and desc(1..ranks) is a non-empty string free of deity names and kill words${bad.length ? ' — ' + J(bad) : ''}`, bad.length === 0 && texts.length === 12 + 29);

  // ---------------- unlock + math ----------------
  section('heat: unlock and math');
  const um = R(`(() => {
    const o = {};
    META.wins = 0; o.locked = HEAT.unlocked();
    META.wins = 1; o.unlocked = HEAT.unlocked();
    META.wins = 0; META.heat = { pain: 3 }; HEAT.beginRun();
    o.lockedRun = { dmg: GAME.heat.enemyDmg, total: GAME.heat.total, ht: GAME.heatTotal, sel: JSON.stringify(GAME.heatSel) };
    META.wins = 1; HEAT.beginRun();
    o.openRun = { dmg: GAME.heat.enemyDmg, total: GAME.heat.total, ht: GAME.heatTotal, sel: JSON.stringify(GAME.heatSel), frozen: Object.isFrozen(GAME.heat) };
    o.total = HEAT.total({ pain: 2, haste: 1, restraint: 2 });
    o.totalUnknown = HEAT.total({ pain: 2, bogus: 5 });
    o.totalEmpty = HEAT.total({});
    META.heat = {};
    HEAT.setRank('pain', 9); o.rHi = HEAT.rank('pain');
    HEAT.setRank('pain', -2); o.rLo = HEAT.rank('pain'); o.delLo = !('pain' in META.heat);
    HEAT.setRank('bogus', 2); o.bogus = 'bogus' in META.heat;
    HEAT.setRank('haste', 2); HEAT.setRank('haste', 0); o.del0 = !('haste' in META.heat);
    o.vow = HEAT.vow('storms') && HEAT.vow('storms').ranks; o.noVow = HEAT.vow('bogus');
    o.rankSel = HEAT.rank('thirst', { thirst: 2 }); o.rankClamp = HEAT.rank('thirst', { thirst: 99 });
    return o;
  })()`);
  check('HEAT.unlocked() false at META.wins 0, true at 1', um.locked === false && um.unlocked === true);
  check(`locked run ignores stored vows (${J(um.lockedRun)})`, um.lockedRun.dmg === 1 && um.lockedRun.total === 0 && um.lockedRun.ht === 0 && um.lockedRun.sel === '{}');
  check(`unlocked run uses stored vows and freezes GAME.heat (${J(um.openRun)})`, um.openRun.dmg === 1.6 && um.openRun.total === 3 && um.openRun.ht === 3 && um.openRun.sel === '{"pain":3}' && um.openRun.frozen);
  check(`HEAT.total({pain 2, haste 1, restraint 2}) = 10 (${um.total})`, um.total === 10);
  check(`unknown ids add nothing (${um.totalUnknown}); empty = 0`, um.totalUnknown === 2 && um.totalEmpty === 0);
  check(`setRank clamps to [0, ranks] (hi ${um.rHi}, lo ${um.rLo}) and deletes 0 ranks`, um.rHi === 5 && um.rLo === 0 && um.delLo && um.del0);
  check('setRank ignores unknown vow ids', um.bogus === false);
  check('HEAT.vow(id) finds a vow; unknown -> undefined', um.vow === 2 && um.noVow === undefined);
  check(`HEAT.rank(id, sel) reads a selection and clamps (${um.rankSel}, ${um.rankClamp})`, um.rankSel === 2 && um.rankClamp === 3);

  const neutral = R(`(() => { const e = HEAT.effects({}); return Object.assign({}, e); })()`);
  const NEUTRAL = { total: 0, enemyDmg: 1, enemyHp: 1, budget: 1, haste: 1, eliteShareMul: 1, eliteModBonus: 0, extraMoves: false,
    chainBonus: 0, restMul: 1, phaseAtBonus: 0, healMul: 1, noSarovar: false, projExtra: 0, projSpeed: 1, shopMul: 1,
    boonChoicesMinus: 0, roomTimer: 0, tokens: 0 };
  const neutralBad = Object.keys(NEUTRAL).filter(k => neutral[k] !== NEUTRAL[k]);
  check(`HEAT.effects({}) is neutral${neutralBad.length ? ' — ' + neutralBad.join(', ') : ''}`, neutralBad.length === 0 && Object.keys(neutral).length === Object.keys(NEUTRAL).length);

  const full = R(`(() => { const sel = {}; for (const v of DATA.HEAT.vows) sel[v.id] = v.ranks; return Object.assign({}, HEAT.effects(sel)); })()`);
  const FULL = { total: 46, enemyDmg: 2, enemyHp: 1.3, budget: 1.6, haste: 1.3, eliteShareMul: 1.5, eliteModBonus: 1, extraMoves: true,
    chainBonus: 1, restMul: 0.7, phaseAtBonus: 0.15, healMul: 0.25, noSarovar: true, projExtra: 2, projSpeed: 1.3, shopMul: 1.8,
    boonChoicesMinus: 2, roomTimer: 90, tokens: 4 };
  const fullBad = Object.keys(FULL).filter(k => Math.abs((+full[k]) - (+FULL[k])) > 1e-9);
  check(`HEAT.effects(all max) has every vow at full strength${fullBad.length ? ' — ' + fullBad.map(k => k + '=' + full[k]).join(', ') : ''}`, fullBad.length === 0);
  const hg = R(`[HEAT.effects({ hourglass: 1 }).roomTimer, HEAT.effects({ champions: 1 }).eliteModBonus, HEAT.effects({ wardens: 1 }).chainBonus, HEAT.effects({ wardens: 1 }).extraMoves, HEAT.effects({ wardens: 2 }).phaseAtBonus]`);
  check(`rank steps: hourglass 1 -> 120 s, champions 1 no extra mark, wardens 1 moves only, wardens 2 no early fury (${J(hg)})`, J(hg) === J([120, 0, 0, true, 0]));

  // ---------------- punya ----------------
  section('heat: punya and bounty');
  const pu = R(`(() => {
    const o = {};
    GAME.heatTotal = 10; o.mul = HEAT.punyaMul(); o.p = HEAT.punya(10); o.p7 = HEAT.punya(7);
    GAME.heatTotal = 0; o.mul0 = HEAT.punyaMul(); o.p0 = HEAT.punya(11);
    GAME.heatTotal = undefined; o.mulU = HEAT.punyaMul();
    META.punya = 0; META.bestHeat = {};
    GAME.heatTotal = 12; o.b1 = HEAT.onVictory('khanda'); o.punya1 = META.punya; o.best = META.bestHeat.khanda;
    o.b2 = HEAT.onVictory('khanda'); o.punya2 = META.punya;
    GAME.heatTotal = 13; o.b3 = HEAT.onVictory('khanda');
    GAME.heatTotal = 5; o.bOther = HEAT.onVictory('gada'); o.bestG = META.bestHeat.gada; o.bestK = META.bestHeat.khanda;
    META.bestHeat = {}; GAME.heatTotal = 0; o.b0 = HEAT.onVictory('khanda'); o.best0 = 'khanda' in META.bestHeat;
    META.bestHeat = undefined; GAME.heatTotal = 2; o.bU = HEAT.onVictory('khanda');
    return o;
  })()`);
  check(`punyaMul = 1 + 0.05 × Heat (10 -> ${pu.mul}, 0 -> ${pu.mul0}, unset -> ${pu.mulU})`, pu.mul === 1.5 && pu.mul0 === 1 && pu.mulU === 1);
  check(`HEAT.punya rounds n × punyaMul (10 -> ${pu.p}, 7 -> ${pu.p7}, neutral 11 -> ${pu.p0})`, pu.p === 15 && pu.p7 === 11 && pu.p0 === 11);
  check(`first clear at Heat 12 pays 80 once and records bestHeat (${pu.b1}, punya ${pu.punya1}, best ${pu.best})`, pu.b1 === 80 && pu.punya1 === 80 && pu.best === 12);
  check(`a second clear at the same Heat pays 0 (${pu.b2}); a new best pays again (${pu.b3})`, pu.b2 === 0 && pu.punya2 === 80 && pu.b3 === 85);
  check(`best Heat is per weapon (gada ${pu.bOther}/${pu.bestG}, khanda stays ${pu.bestK})`, pu.bOther === 45 && pu.bestG === 5 && pu.bestK === 13);
  check(`Heat 0 never pays a bounty (${pu.b0}) or records a best`, pu.b0 === 0 && pu.best0 === false);
  check(`onVictory initialises a missing META.bestHeat (${pu.bU})`, pu.bU === 30);

  // ---------------- persistence ----------------
  section('heat: persistence');
  const ps = R(`(() => {
    const o = {};
    META.heat = { pain: 3 }; META.bestHeat = { gada: 7 }; META.save();
    META.heat = { junk: 1 }; META.bestHeat = null; META.load();
    o.heat = JSON.stringify(META.heat); o.best = JSON.stringify(META.bestHeat);
    const s = STORE.get(META.KEY, null); delete s.heat; delete s.bestHeat; STORE.set(META.KEY, s);
    META.heat = { x: 1 }; META.bestHeat = { y: 1 }; META.load();
    o.missH = JSON.stringify(META.heat); o.missB = JSON.stringify(META.bestHeat);
    const s2 = STORE.get(META.KEY, null); s2.heat = [1, 2]; s2.bestHeat = 'bad'; STORE.set(META.KEY, s2);
    META.load(); o.badH = JSON.stringify(META.heat); o.badB = JSON.stringify(META.bestHeat);
    META.heat = { pain: 2 }; META.bestHeat = { khanda: 4 }; META.wipe();
    o.wipeH = JSON.stringify(META.heat); o.wipeB = JSON.stringify(META.bestHeat);
    return o;
  })()`);
  check(`META.heat / bestHeat survive save -> load (${ps.heat}, ${ps.best})`, ps.heat === '{"pain":3}' && ps.best === '{"gada":7}');
  check(`a save without the fields loads {} for both (${ps.missH}, ${ps.missB})`, ps.missH === '{}' && ps.missB === '{}');
  check(`non-object fields load as {} (${ps.badH}, ${ps.badB})`, ps.badH === '{}' && ps.badB === '{}');
  check(`META.wipe() resets both to {} (${ps.wipeH}, ${ps.wipeB})`, ps.wipeH === '{}' && ps.wipeB === '{}');

  // ---------------- load order ----------------
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  check('index.html loads js/heat.js right after js/meta.js', /<script src="js\/meta\.js"><\/script>\s*<script src="js\/heat\.js"><\/script>/.test(html));

  // ================= combatant vows (Task 2) =================
  R(`globalThis.__hv = {
    // start a run with META.wins / META.heat set, then a clean combat room around the player
    run(wins, sel, biome) {
      META.wins = wins; META.heat = Object.assign({}, sel || {});
      U.seed(9100);
      GAME.godMode = false;
      INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false; INPUT.keys = {};
      GAME.startRun();
      if (biome) { GAME.biomeIdx = biome; GAME.biome = DATA.BIOMES[biome]; }
      return GAME.player;
    },
    room() {
      ROOMS.enterRoom('mudra');
      GAME.state = 'combat'; GAME.bossRef = null; GAME.miniRef = null;
      GAME.enemies = []; GAME.waves = []; GAME.spawnQueue = []; GAME.pillars = []; GAME.hazards = [];
      GAME.pprojectiles = []; GAME.eprojectiles = []; GAME.zones = []; GAME.orbits = []; GAME.rings = [];
      GAME.epools = [];
      const P = GAME.player, A = GAME.arena;
      P.x = A.x + A.w / 2; P.y = A.y + A.h / 2;
      P.maxhp = 1e9; P.hp = 1e9; P.iframes = 0;
      ENEMY_AI.reset(); ENEMY_TG.clear();
      return P;
    },
    stats(wins, sel) {
      __hv.run(wins, sel);
      const e = new Enemy('rakshasa', 0, 0, 1);
      const B = new Boss('tataka', 0, 0);
      const M = new MiniBoss('subahu', 0, 0);
      return { eHp: e.hp, eMax: e.maxhp, eDmg: e.dmg, eSpd: e.spd, eCd: e.cdMul,
        bHp: B.hp, bMax: B.maxhp, bDmg: B.dmg, mHp: M.hp, mMax: M.maxhp, mDmg: M.dmg,
        bAt: B.phaseAt(), mAt: M.phaseAt() };
    },
    tables(wins, sel) {
      __hv.run(wins, sel);
      const out = {};
      for (const id of Object.keys(DATA.BOSSES)) { const B = new Boss(id, 0, 0); B.phase = 1; out[id] = { t1: B.moveTable(1), base: BOSS_MOVESETS[id][1], p2: BOSS_MOVESETS[id][2] }; }
      for (const id of Object.keys(DATA.MINIBOSSES)) { const B = new MiniBoss(id, 0, 0); B.phase = 1; out[id] = { t1: B.moveTable(1), base: MINI_MOVESETS[id][1], p2: MINI_MOVESETS[id][2] }; }
      return out;
    },
    // first volley size of a lone shooter of type id
    volley(wins, sel, id) {
      __hv.run(wins, sel); const P = __hv.room();
      const e = new Enemy(id, P.x + 260, P.y, 1); e.spawnT = 0; e.t = 0.01; GAME.enemies.push(e);
      for (let i = 0; i < 600; i++) {
        P.x = GAME.arena.x + GAME.arena.w / 2; P.y = GAME.arena.y + GAME.arena.h / 2; P.iframes = 1;
        GAME.hitstop = 0; GAME.update(1 / 60);
        const n = GAME.eprojectiles.filter(p => p.owner === e).length;
        if (n) return { n, speed: Math.hypot(GAME.eprojectiles[0].vx, GAME.eprojectiles[0].vy) };
      }
      return { n: 0, speed: 0 };
    },
  };`);

  section('heat: enemy, boss and mini-boss scaling');
  const n0 = R(`__hv.stats(1, {})`);
  const h1 = R(`__hv.stats(1, { pain: 5, endurance: 2, haste: 2 })`);
  const l1 = R(`__hv.stats(0, { pain: 5, endurance: 2, haste: 2, wardens: 3 })`);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  check(`pain 5 / endurance 2: Enemy dmg × 2 (${n0.eDmg} -> ${h1.eDmg}), hp × 1.3 (${n0.eHp} -> ${h1.eHp}, max ${h1.eMax})`,
    near(h1.eDmg, n0.eDmg * 2) && near(h1.eHp, n0.eHp * 1.3) && near(h1.eMax, h1.eHp));
  check(`Boss hp × 1.3 (${n0.bHp} -> ${h1.bHp}) and dmg × 2 (${n0.bDmg} -> ${h1.bDmg})`,
    near(h1.bHp, n0.bHp * 1.3) && near(h1.bMax, h1.bHp) && near(h1.bDmg, n0.bDmg * 2));
  check(`MiniBoss hp × 1.3 (${n0.mHp} -> ${h1.mHp}) and dmg × 2 after its own dmg 14 (${n0.mDmg} -> ${h1.mDmg})`,
    near(h1.mHp, n0.mHp * 1.3) && near(h1.mMax, h1.mHp) && n0.mDmg === 14 && near(h1.mDmg, 28));
  check(`haste 2: Enemy spd × 1.3 (${n0.eSpd} -> ${h1.eSpd}) and cdMul ÷ 1.3 (${n0.eCd} -> ${h1.eCd})`,
    near(h1.eSpd, n0.eSpd * 1.3) && near(h1.eCd, n0.eCd / 1.3));
  const lockBad = Object.keys(n0).filter(k => !near(n0[k], l1[k]));
  check(`locked Heat (wins 0) with the same vows stored is neutral${lockBad.length ? ' — ' + lockBad.join(', ') : ''}`, lockBad.length === 0);

  // haste never shortens a tell: 30 s mixed-roster sim, every armed wind >= ENEMY_TG.MIN[kind]
  const hs = R(`(() => {
    __hv.run(1, { haste: 2, pain: 5 }); const P = __hv.room();
    const A = GAME.arena;
    const ids = ['rakshasa', 'archer', 'naga', 'preta', 'kumbhipaka', 'nagaguard'].filter(id => DATA.ENEMIES[id]);
    ids.forEach((id, i) => { const a = i / ids.length * Math.PI * 2; const e = new Enemy(id, P.x + Math.cos(a) * 240, P.y + Math.sin(a) * 200, 1); e.spawnT = 0; GAME.enemies.push(e); });
    for (let i = 0; i < 1800; i++) {
      P.x = A.x + A.w / 2 + Math.cos(i / 90) * 120; P.y = A.y + A.h / 2; P.hp = 1e9;
      GAME.hitstop = 0; GAME.update(1 / 60);
      for (const e of GAME.enemies) if (e.hp < e.maxhp) e.hp = e.maxhp;
    }
    const short = ENEMY_TG.windLog.filter(w => w.wind + 1e-9 < (ENEMY_TG.MIN[w.kind] || 0));
    return { n: ENEMY_TG.windLog.length, short: short.slice(0, 3), viol: ENEMY_TG.violations.slice(0, 3) };
  })()`);
  check(`haste 2: ${hs.n} armed winds in a 30 s sim, none shorter than ENEMY_TG.MIN${hs.short.length ? ' — ' + J(hs.short) : ''}`, hs.n >= 10 && hs.short.length === 0);
  check(`haste 2: no telegraph violations${hs.viol.length ? ' — ' + J(hs.viol) : ''}`, hs.viol.length === 0);

  section('heat: wardens');
  const tw = R(`__hv.tables(1, { wardens: 1 })`);
  const tn = R(`__hv.tables(1, {})`);
  const tl = R(`__hv.tables(0, { wardens: 3 })`);
  for (const id of Object.keys(tw)) {
    const { t1, base, p2 } = tw[id];
    const added = t1.filter(m => !base.some(b => b[0] === m[0]));
    const nonOpener = p2.filter(m => !base.some(b => b[0] === m[0]) && !(m[2] && m[2].opener));
    const okPick = added.length === 1 && added[0][1] === 1 && p2.some(m => m[0] === added[0][0])
      && (nonOpener.length ? added[0][0] === nonOpener[0][0] && !(added[0][2] && added[0][2].opener) : !(added[0][2] && added[0][2].opener));
    check(`wardens 1: ${id} phase 1 gains one phase-2 technique at weight 1 (${added.map(m => m[0]).join(',') || 'none'}${nonOpener.length ? '' : ', opener fallback'})`,
      okPick && t1.length === base.length + 1);
    check(`neutral / locked: ${id} phase 1 table unchanged`, J(tn[id].t1) === J(base) && J(tl[id].t1) === J(base));
  }
  const w2 = R(`(() => {
    __hv.run(1, { wardens: 2 });
    const o = { chainBonus: GAME.heat.chainBonus, restMul: GAME.heat.restMul };
    const B = new Boss('tataka', 0, 0); B.phase = 1;
    const orig = B.startMove; B.startMove = function (id) { B.lastMove = id; };
    const lens = {};
    for (let i = 0; i < 400; i++) { B.chainLeft = 0; B.pickMove(); if (B.lastMove !== 'chase') lens[B.chainLeft + 1] = 1; }
    B.startMove = orig;
    o.lens = Object.keys(lens).map(Number).sort();
    return o;
  })()`);
  check(`wardens 2: chainBonus 1 and restMul 0.7 (${w2.chainBonus}, ${w2.restMul})`, w2.chainBonus === 1 && w2.restMul === 0.7);
  check(`wardens 2: phase-1 chains roll 2-4 links instead of 1-3 (${J(w2.lens)})`, J(w2.lens) === J([2, 3, 4]));
  const w3 = R(`__hv.stats(1, { wardens: 3 })`);
  check(`wardens 3: phaseAt +0.15 (Boss ${w3.bAt}, MiniBoss ${w3.mAt}); neutral ${n0.bAt}/${n0.mAt}; locked ${l1.bAt}/${l1.mAt}`,
    near(w3.bAt, 0.65) && near(w3.mAt, 0.55) && n0.bAt === 0.5 && n0.mAt === 0.4 && l1.bAt === 0.5 && l1.mAt === 0.4);

  section('heat: storms');
  const st = R(`(() => {
    const o = {};
    const plan = () => ({
      player: PROJ.planPattern({ x: 0, y: 0, r: 10 }, { aim: 'player', count: 3, spread: 0.6 }, { x: 100, y: 0 }).shots.length,
      single: PROJ.planPattern({ x: 0, y: 0, r: 10 }, { aim: 'player', count: 1 }, { x: 100, y: 0 }).shots,
      radial: PROJ.planPattern({ x: 0, y: 0, r: 10 }, { aim: 'radial', count: 4 }, { x: 100, y: 0 }).shots.length,
      around: PROJ.planPattern({ x: 0, y: 0, r: 10 }, { aim: 'around', count: 3 }, { x: 100, y: 0 }).shots.length,
    });
    const spawnV = () => { GAME.eprojectiles = []; const p = PROJ.spawn('bolt', { x: 0, y: 0, vx: 100, vy: 50, dmg: 1 }); const q = PROJ.spawn('needle', { x: 0, y: 0, vx: 200, vy: 0, dmg: 1 }); return [p.vx, p.vy, q.vx]; };
    __hv.run(1, { storms: 2 }); __hv.room(); o.h = plan(); o.hv = spawnV();
    __hv.run(1, {}); __hv.room(); o.n = plan(); o.nv = spawnV();
    __hv.run(0, { storms: 2 }); __hv.room(); o.l = plan(); o.lv = spawnV();
    o.hSingleAngles = o.h.single.map(s => +Math.atan2(s.vy, s.vx).toFixed(3));
    o.h.single = o.h.single.length; o.n.single = o.n.single.length; o.l.single = o.l.single.length;
    return o;
  })()`);
  check(`storms 2: planPattern 'player' 3 -> ${st.h.player}, 'radial' 4 -> ${st.h.radial}; 'around' unchanged (${st.h.around})`,
    st.h.player === 5 && st.h.radial === 6 && st.h.around === 3 && st.n.player === 3 && st.n.radial === 4);
  check(`storms 2: a single aimed shot becomes a 3-shot fan (${J(st.hSingleAngles)})`, st.h.single === 3 && new Set(st.hSingleAngles).size === 3 && st.n.single === 1);
  check(`storms 2: enemy projectile speed × 1.3 (${J(st.hv)} vs ${J(st.nv)})`, near(st.hv[0], 130) && near(st.hv[1], 65) && near(st.hv[2], 260) && J(st.nv) === J([100, 50, 200]));
  check(`locked storms change nothing (${J(st.l)}, ${J(st.lv)})`, J(st.l) === J(st.n) && J(st.lv) === J(st.nv));
  const va = R(`__hv.volley(1, { storms: 2 }, 'archer')`), vn = R(`__hv.volley(1, {}, 'archer')`), vl = R(`__hv.volley(0, { storms: 2 }, 'archer')`);
  check(`storms 2: archers loose 1 + 2 shots per volley (${vn.n} -> ${va.n}, locked ${vl.n})`, vn.n === 1 && va.n === 3 && vl.n === 1);
  check(`storms 2: archer shots fly × 1.3 (${vn.speed.toFixed(1)} -> ${va.speed.toFixed(1)})`, near(va.speed, vn.speed * 1.3));
  const sa = R(`__hv.volley(1, { storms: 2 }, 'naga')`), sn = R(`__hv.volley(1, {}, 'naga')`);
  check(`storms 2: spread shooters loose 3 + 2 (${sn.n} -> ${sa.n})`, sn.n === 3 && sa.n === 5);

  // ================= run-level vows (Task 3) =================
  section('heat: waves and elites');
  const wv = R(`(() => {
    const mean = () => { let n = 0; for (let i = 0; i < 50; i++) n += ROOMS.planRoom(DATA.BIOMES[0], 1).reduce((s, w) => s + w.length, 0); return n / 50; };
    const shares = () => { const out = []; const orig = ROOMS.composeWave; ROOMS.composeWave = function (b, bi, o) { out.push(o.eliteShare); return orig.apply(this, arguments); };
      try { ROOMS.planRoom(DATA.BIOMES[2], DATA.BIOMES[2].rooms); ROOMS.planRoom(DATA.BIOMES[0], 1); } finally { ROOMS.composeWave = orig; } return [out[0], out[out.length - 1]]; };
    const mods = () => [0, 1, 2, 3].map(bi => ROOMS.rollEliteMods(bi).length);
    const o = {};
    __hv.run(1, {}); o.nMean = mean(); o.nShare = shares(); o.nMods = mods();
    __hv.run(1, { multitude: 3 }); o.hMean = mean();
    __hv.run(1, { champions: 2 }); o.cShare = shares(); o.cMods = mods();
    __hv.run(1, { champions: 1 }); o.c1Mods = mods();
    __hv.run(0, { multitude: 3, champions: 2 }); o.lMean = mean(); o.lShare = shares(); o.lMods = mods();
    o.raw = [ROOMS.waveParams(DATA.BIOMES[2], DATA.BIOMES[2].rooms).eliteShare, ROOMS.waveParams(DATA.BIOMES[0], 1).eliteShare];
    return o;
  })()`);
  check(`multitude 3: mean units per room ${wv.hMean.toFixed(2)} >= 1.4 × neutral ${wv.nMean.toFixed(2)}`, wv.hMean >= 1.4 * wv.nMean);
  check(`champions 2: eliteShare × 1.5 capped at 0.8 (${J(wv.raw)} -> ${J(wv.cShare)})`,
    near(wv.cShare[0], Math.min(0.8, wv.raw[0] * 1.5)) && near(wv.cShare[1], Math.min(0.8, wv.raw[1] * 1.5)) && J(wv.nShare) === J(wv.raw));
  check(`champions 2: one more elite mark, cap 3 (${J(wv.nMods)} -> ${J(wv.cMods)}); champions 1 unchanged (${J(wv.c1Mods)})`,
    J(wv.nMods) === J([1, 1, 2, 2]) && J(wv.cMods) === J([2, 2, 3, 3]) && J(wv.c1Mods) === J(wv.nMods));
  check(`locked multitude/champions change nothing (${wv.lMean.toFixed(2)}, ${J(wv.lShare)}, ${J(wv.lMods)})`,
    J(wv.lShare) === J(wv.raw) && J(wv.lMods) === J(wv.nMods) && wv.lMean < 1.2 * wv.nMean);

  section('heat: doors, shop and boons');
  const dr = R(`(() => {
    const count = () => { GAME.roomIdx = 1; GAME.shopSeenThisBiome = true; GAME.player.hp = 1; let n = 0;
      for (let i = 0; i < 200; i++) if (ROOMS.doorOptions().some(o => o.id === 'sarovar')) n++; return n; };
    __hv.run(1, { austerity: 1 }); const h = count();
    __hv.run(1, {}); const n = count();
    __hv.run(0, { austerity: 1 }); const l = count();
    return { h, n, l };
  })()`);
  check(`austerity: no Sacred Pool in 200 door rolls at 1 hp (${dr.h}; neutral ${dr.n}, locked ${dr.l})`, dr.h === 0 && dr.n > 0 && dr.l > 0);

  const sh = R(`(() => {
    const shop = () => {
      const P = __hv.room(); P.mudra = 100000;
      UI.openShop();
      const cards = document.getElementById('shop-cards').children.slice();
      const shown = cards.map(c => +((c.innerHTML.match(/¤ (\\d+)/) || [])[1]));
      const m0 = P.mudra; cards[0].onclick(); const paid = m0 - P.mudra;
      UI.hideAll(); GAME.state = 'combat';
      return { shown, paid };
    };
    U.seed(77); __hv.run(1, { scarcity: 2 }); U.seed(55); const h = shop();
    U.seed(77); __hv.run(1, {}); U.seed(55); const n = shop();
    U.seed(77); __hv.run(0, { scarcity: 2 }); U.seed(55); const l = shop();
    return { h, n, l };
  })()`);
  check(`scarcity 2: shop cards show round(cost × 1.8) (${J(sh.n.shown)} -> ${J(sh.h.shown)})`,
    sh.h.shown.length === sh.n.shown.length && sh.h.shown.every((c, i) => c === Math.round(sh.n.shown[i] * 1.8)));
  check(`scarcity 2: buying charges the shown price (${sh.h.paid} = ${sh.h.shown[0]}; neutral ${sh.n.paid})`, sh.h.paid === sh.h.shown[0] && sh.n.paid === sh.n.shown[0]);
  check(`locked scarcity: neutral prices (${J(sh.l.shown)})`, J(sh.l.shown) === J(sh.n.shown));

  const bo = R(`(() => {
    const offer = () => { __hv.room(); UI.offerBoon(); const n = document.getElementById('boon-cards').children.length; UI.hideAll(); GAME.state = 'combat'; return n; };
    __hv.run(1, { restraint: 2 }); const h2 = offer();
    __hv.run(1, { restraint: 1 }); const h1 = offer();
    __hv.run(1, {}); const n = offer();
    __hv.run(0, { restraint: 2 }); const l = offer();
    return { h2, h1, n, l, choices: META.boonChoices() };
  })()`);
  check(`restraint: boon offers show max(1, ${bo.choices} − r) cards (r1 ${bo.h1}, r2 ${bo.h2}; neutral ${bo.n}, locked ${bo.l})`,
    bo.n === bo.choices && bo.h1 === Math.max(1, bo.choices - 1) && bo.h2 === Math.max(1, bo.choices - 2) && bo.l === bo.choices);

  section('heat: healing');
  const hl = R(`(() => {
    const heals = () => {
      const o = {};
      let P = __hv.room(); P.maxhp = 200; P.hp = 1; ROOMS.enterRoom('sarovar'); o.sarovar = P.hp - 1;
      P = __hv.room(); P.maxhp = 200; P.hp = 1; GAME.reward = 'maxhp'; ROOMS.onRoomClear(); o.maxhp = P.hp - 1;
      P = __hv.room(); P.maxhp = 200; P.hp = 1; GAME.biomeIdx = 0; GAME.biome = DATA.BIOMES[0]; ROOMS.onBossDefeated(); o.boss = P.hp - 1;
      P = __hv.room(); P.maxhp = 200; P.hp = 1; UI.applyShopItem('heal'); o.shopHeal = P.hp - 1;
      P = __hv.room(); P.maxhp = 200; P.hp = 1; UI.applyShopItem('maxhp'); o.shopMax = P.hp - 1;
      UI.hideAll();
      return o;
    };
    __hv.run(1, { thirst: 3 }); const h = heals();
    __hv.run(1, {}); const n = heals();
    __hv.run(0, { thirst: 3 }); const l = heals();
    return { h, n, l };
  })()`);
  const q = v => Math.round(v * 0.25);
  check(`thirst 3: Sacred Pool heals round(round(maxhp × 0.35) × 0.25) (${hl.n.sarovar} -> ${hl.h.sarovar})`, hl.n.sarovar === 70 && hl.h.sarovar === q(70));
  check(`thirst 3: max-life reward heal ${hl.n.maxhp} -> ${hl.h.maxhp}, post-boss heal ${hl.n.boss} -> ${hl.h.boss}`,
    hl.n.maxhp === 25 && hl.h.maxhp === q(25) && hl.n.boss === 50 && hl.h.boss === q(50));
  check(`thirst 3: shop heals scale too (heal ${hl.n.shopHeal} -> ${hl.h.shopHeal}, max life ${hl.n.shopMax} -> ${hl.h.shopMax})`,
    hl.n.shopHeal === 70 && hl.h.shopHeal === q(70) && hl.n.shopMax === 25 && hl.h.shopMax === q(25));
  check(`locked thirst heals in full (${J(hl.l)})`, J(hl.l) === J(hl.n));

  section('heat: chamber timer');
  const tm = R(`(() => {
    const o = {};
    __hv.run(1, { hourglass: 1 });
    ROOMS.enterRoom('mudra'); o.combat = [GAME.roomTimer, GAME.roomTimerOn];
    ROOMS.enterRoom('sarovar'); o.sarovar = [GAME.roomTimer, GAME.roomTimerOn];
    ROOMS.enterRoom('kubera'); o.kubera = [GAME.roomTimer, GAME.roomTimerOn]; UI.hideAll();
    ROOMS.enterRoom('miniboss'); o.mini = [GAME.roomTimer, GAME.roomTimerOn];
    ROOMS.enterRoom('boss'); o.boss = [GAME.roomTimer, GAME.roomTimerOn];
    __hv.run(1, { hourglass: 2 }); ROOMS.enterRoom('mudra'); o.combat2 = GAME.roomTimer;
    __hv.run(0, { hourglass: 2 }); ROOMS.enterRoom('mudra'); o.locked = [GAME.roomTimer, GAME.roomTimerOn];
    __hv.run(1, {}); ROOMS.enterRoom('mudra'); o.neutral = [GAME.roomTimer, GAME.roomTimerOn];

    // expiry: 5 damage every 1 s until the room clears
    __hv.run(1, { hourglass: 1 });
    ROOMS.enterRoom('mudra');
    const P = GAME.player; P.maxhp = 1e6; P.hp = 1e6; GAME.godMode = false;
    for (const e of GAME.enemies) { e.x = GAME.arena.x + 20; e.y = GAME.arena.y + 20; e.stun = 1e9; e.spawnT = 0; }
    GAME.spawnQueue = [];
    const freeze = () => { for (const e of GAME.enemies) { e.stun = 1e9; e.x = GAME.arena.x + 20; e.y = GAME.arena.y + 20; } GAME.eprojectiles = []; GAME.epools = []; GAME.hazards = []; P.x = GAME.arena.x + GAME.arena.w - 60; P.y = GAME.arena.y + GAME.arena.h - 60; };
    GAME.roomTimer = 0.5;
    let hp0 = P.hp;
    for (let i = 0; i < 31; i++) { freeze(); GAME.hitstop = 0; GAME.update(1 / 60); }   // ~0.5 s: timer expires, no damage yet
    o.atExpiry = [GAME.roomTimer, hp0 - P.hp];
    hp0 = P.hp;
    for (let i = 0; i < 186; i++) { freeze(); GAME.hitstop = 0; GAME.update(1 / 60); }  // 3.1 s overdue
    o.overdue = hp0 - P.hp;
    return o;
  })()`);
  check(`hourglass 1: combat room starts at 120 s (${J(tm.combat)}); hourglass 2 -> ${tm.combat2} s`, J(tm.combat) === J([120, true]) && tm.combat2 === 90);
  check(`hourglass: no timer in Sacred Pool, shop, mini-boss or boss rooms (${J([tm.sarovar, tm.kubera, tm.mini, tm.boss])})`,
    [tm.sarovar, tm.kubera, tm.mini, tm.boss].every(t => t[0] === 0 && t[1] === false));
  check(`no timer when neutral or locked (${J(tm.neutral)}, ${J(tm.locked)})`, J(tm.neutral) === J([0, false]) && J(tm.locked) === J([0, false]));
  check(`timer runs out without damage (${J(tm.atExpiry)}), then wounds 5 per second (${tm.overdue} in 3.1 s)`, tm.atExpiry[0] === 0 && tm.atExpiry[1] === 0 && tm.overdue === 15);

  const hud = R(`(() => {
    __hv.run(1, { hourglass: 1 }); ROOMS.enterRoom('mudra'); GAME.roomTimer = 75.4;
    const ops = []; const ctx = new Proxy({}, { get(t, p) { if (p === 'measureText') return () => ({ width: 0 }); if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} }); if (p in t) return t[p]; return function () { ops.push({ op: p, a: Array.from(arguments), fill: t.fillStyle, font: t.font }); }; }, set(t, p, v) { t[p] = v; return true; } });
    GAME.renderHUD(ctx);
    const on = ops.filter(o => o.op === 'fillText' && o.a[0] === '1:16').map(o => o.fill + ' ' + o.font);
    GAME.roomTimer = 9.2; ops.length = 0; GAME.renderHUD(ctx);
    const low = ops.filter(o => o.op === 'fillText' && o.a[0] === '0:10').map(o => o.fill);
    GAME.roomTimerOn = false; ops.length = 0; GAME.renderHUD(ctx);
    const off = ops.filter(o => o.op === 'fillText' && /^\\d:\\d\\d$/.test(o.a[0]) && o.font && o.font.includes('16px')).length;
    return { on, low, off };
  })()`);
  check(`HUD draws the chamber timer as m:ss in white (${J(hud.on)})`, hud.on.length === 1 && /#ffffff/i.test(hud.on[0]) && /bold 16px Georgia/.test(hud.on[0]));
  check(`HUD timer turns red under 15 s (${J(hud.low)}) and hides when off (${hud.off})`, hud.low.length === 1 && /#ff5566/i.test(hud.low[0]) && hud.off === 0);

  section('heat: punya');
  const pn = R(`(() => {
    const door = () => { const P = __hv.room(); META.punya = 0; GAME.reward = 'punya'; U.seed(4242); ROOMS.onRoomClear(); return META.punya; };
    const boss = () => { __hv.room(); GAME.biomeIdx = 1; GAME.biome = DATA.BIOMES[1]; META.punya = 0; ROOMS.onBossDefeated(); return META.punya; };
    const win = () => { __hv.room(); META.punya = 0; META.bestHeat = {}; GAME.onVictory(); return META.punya; };
    const sel = { pain: 5, endurance: 2, multitude: 3 };   // Heat 10 -> × 1.5
    const o = {};
    __hv.run(1, sel); o.hTotal = GAME.heatTotal; o.h = [door(), boss(), win()]; o.best = META.bestHeat.khanda;
    o.again = (() => { __hv.room(); META.punya = 0; GAME.onVictory(); return META.punya; })();
    __hv.run(1, {}); o.n = [door(), boss(), win()]; o.nBest = 'khanda' in META.bestHeat;
    __hv.run(0, sel); o.l = [door(), boss(), win()];
    return o;
  })()`);
  check(`Heat ${pn.hTotal}: punya door ${pn.n[0]} -> ${pn.h[0]} and boss trophy ${pn.n[1]} -> ${pn.h[1]} scale × 1.5`,
    pn.hTotal === 10 && pn.h[0] === Math.round(pn.n[0] * 1.5) && pn.n[1] === 40 && pn.h[1] === 60);
  check(`victory pays HEAT.punya(50) + the one-time bounty (${pn.n[2]} -> ${pn.h[2]} = 75 + 70; best ${pn.best})`,
    pn.n[2] === 50 && pn.h[2] === 75 + 70 && pn.best === 10 && pn.nBest === false);
  check(`a repeat victory at the same Heat pays no bounty (${pn.again})`, pn.again === 75);
  check(`locked Heat pays neutral punya (${J(pn.l)})`, J(pn.l) === J(pn.n));

  // the neutral run is untouched: the quick balance sim is still deterministic
  section('heat: neutral balance sim');
  const cp = require('child_process');
  const bal = () => { const r = cp.spawnSync(process.execPath, [path.join(root, 'test', 'balance.js'), '--quick'], { encoding: 'utf8' });
    return { status: r.status, out: (r.stdout || '').split('\n').filter(l => !/^balance: [\d.]+s$/.test(l)).join('\n') }; };
  const b1 = bal(), b2 = bal();
  check(`balance --quick passes twice (exit ${b1.status}/${b2.status})`, b1.status === 0 && b2.status === 0 && /BALANCE OK/.test(b1.out));
  check('balance --quick stdout is identical across two runs (neutral Heat is deterministic)', b1.out === b2.out && b1.out.length > 100);

  R(`META.wipe(); __hm.restore(__hm0)`);
};
