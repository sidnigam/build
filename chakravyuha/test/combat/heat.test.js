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

  R(`META.wipe(); __hm.restore(__hm0)`);
};
