// 05.7.1-07 (D-21, D-22, COMBAT-17/18): boss move selection. Weighted random picks with a strict
// no-repeat, distance bands (close / mid / far), anti-camping (area moves when the player stands
// still or hugs a wall), 2-3 move combo chains with short gaps (longer + faster in phase 2), and
// +2 new moves per boss built on the 05.7.1-02 projectile families and statuses. The telegraph
// invariant (BOSS_TG) and the deterministic phase-2 opener must survive all of it.
'use strict';
module.exports = function ({ R, check, section }) {
  const J = JSON.stringify;

  const has = R(`typeof BOSS_AI === 'object' && typeof Boss === 'function' && typeof Boss.prototype.camping === 'function'`);
  check('BOSS_AI constants and Boss.camping() exist', has);
  if (!has) return;

  // Sandbox helpers: build a boss / mini-boss room directly, run pick distributions with a
  // stubbed startMove, and run real-update sims with telemetry.
  // Every room() reseeds U deterministically (base + call counter) so the distribution and sim
  // checks never flake; the margins were verified across several seed bases.
  R(`globalThis.__ba = {
    seedBase: 7100, n: 0,
    room(id) {
      U.seed(__ba.seedBase + (++__ba.n));
      GAME.startRun();
      GAME.heat = undefined;
      const P = GAME.player; P.maxhp = 1e9; P.hp = 1e9;
      let B;
      if (DATA.MINIBOSSES[id]) {
        const bi = DATA.BIOMES.findIndex(b => b.id === DATA.MINIBOSSES[id].biome);
        GAME.biomeIdx = bi; GAME.biome = DATA.BIOMES[bi];
        ROOMS.setArena('boss'); ROOMS.buildArena(true);
        GAME.enemies = []; GAME.eprojectiles = []; GAME.epools = []; GAME.waves = []; GAME.spawnQueue = [];
        GAME.hazards = []; GAME.dangerZones = [];
        const A = GAME.arena;
        B = new MiniBoss(id, A.x + A.w * 0.7, A.y + A.h / 2);
        GAME.enemies.push(B); GAME.miniRef = B; GAME.bossRef = null; GAME.state = 'combat';
      } else {
        const bi = DATA.BIOMES.findIndex(b => b.boss === id);
        GAME.biomeIdx = bi; GAME.biome = DATA.BIOMES[bi];
        ROOMS.enterRoom('boss');
        B = GAME.bossRef;
      }
      B.asleep = false; B.state = 'rest'; B.t = 99; B.pendingOpener = undefined;
      P.x = B.x - 220; P.y = B.y;
      return B;
    },
    // n picks with startMove stubbed (records the id, sets lastMove)
    picks(B, phase, n, prep) {
      B.phase = phase; B.pendingOpener = undefined; B.lastMove = undefined; B.chainLeft = 0;
      const rec = [];
      rec.prev = [];
      const orig = B.startMove;
      B.startMove = function (id) { rec.prev.push(B.lastMove); rec.push(id); B.lastMove = id; };
      try { for (let i = 0; i < n; i++) { if (prep) prep(B, i); B.pickMove(); } }
      finally { B.startMove = orig; }
      return rec;
    },
    weights(B, phase) {
      const out = {};
      for (const m of B.moveTable(phase)) out[m[0]] = m[1];
      return out;
    },
    tags(B, phase) {
      const out = {};
      const save = B.phase; B.phase = phase;
      for (const m of B.moveTable(phase)) { const d = B.moveDef(m[0]); out[m[0]] = { band: d.band, area: d.area, dmg: !!d.dmg }; }
      B.phase = save;
      return out;
    },
    // real-update sim: returns damaging-move gaps, chain lengths and violation delta
    sim(id, phase, seconds) {
      const B = __ba.room(id);
      const P = GAME.player;
      const A = GAME.arena;
      if (phase === 2) { B.phase = 2; B.hp = B.maxhp * 0.45; }
      B.state = 'rest'; B.t = 0.5; B.chainLeft = 0; B.chainLog = [];
      const v0 = BOSS_TG.violations.length;
      const DT = 1 / 60;
      let now = 0, prevDmg = false, endT = null, prevState = B.state;
      const gaps = [];
      const origStart = B.startMove;
      B.startMove = function (mid) {
        const d = this.moveDef(mid);
        if (d.dmg && prevDmg) gaps.push(now - (endT == null ? now : endT));
        prevDmg = !!d.dmg; endT = null;
        return origStart.call(this, mid);
      };
      const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
      const frames = Math.round(seconds / DT);
      for (let f = 0; f < frames; f++) {
        now += DT;
        for (const e of GAME.enemies) if (e !== B) e.dead = true;
        // the player circles the arena centre at 300 px/s (no camping), never dies
        const a = now * 1.5;
        P.x = cx + Math.cos(a) * 200; P.y = cy + Math.sin(a) * 200;
        P.iframes = 0; P.dashT = 0; P.hp = P.maxhp;
        if (P.st) { P.st.stunT = 0; P.st.rootT = 0; }
        GAME.hitstop = 0;
        GAME.update(DT);
        if (B.state === 'rest' && prevState !== 'rest' && endT == null) endT = now;
        prevState = B.state;
        if (B.phase !== phase) break;
      }
      B.startMove = origStart;
      return { gaps, chains: (B.chainLog || []).slice(), viol: BOSS_TG.violations.slice(v0), phase: B.phase };
    },
  };`);

  const BOSSES = R(`Object.keys(DATA.BOSSES)`);
  const MINIS = R(`Object.keys(DATA.MINIBOSSES)`);
  const UNITS = BOSSES.concat(MINIS);

  // ---------------- static tags ----------------
  section('bossai: band / area tags');
  const untagged = R(`(() => {
    const E = [];
    const BANDS = ['close', 'mid', 'far', 'any'];
    for (const [src, defs] of [['BOSS', BOSS_MOVE_DEFS], ['MINI', MINI_MOVE_DEFS]]) {
      for (const k of Object.keys(defs)) {
        const d = defs[k];
        if (!BANDS.includes(d.band)) E.push(src + ':' + k + ' band ' + d.band);
        if (typeof d.area !== 'boolean') E.push(src + ':' + k + ' area ' + d.area);
      }
    }
    return E;
  })()`);
  check('every BOSS_MOVE_DEFS / MINI_MOVE_DEFS entry has band (close|mid|far|any) and boolean area'
    + (untagged.length ? ' — ' + untagged.join('; ') : ''), untagged.length === 0);

  // ---------------- strict no-repeat ----------------
  section('bossai: strict no-repeat');
  {
    const fails = [];
    for (const id of UNITS) for (const ph of [1, 2]) {
      const r = R(`(() => { const B = __ba.room(${J(id)}); const rec = __ba.picks(B, ${ph}, 500);
        let rep = 0; for (let i = 1; i < rec.length; i++) if (rec[i] === rec[i - 1]) rep++;
        return { rep, n: B.moveTable(${ph}).length, uniq: new Set(rec).size }; })()`);
      if (r.n >= 2 && r.rep > 0) fails.push(`${id} p${ph}: ${r.rep} repeats`);
      if (r.uniq < Math.min(r.n, 2)) fails.push(`${id} p${ph}: only ${r.uniq} distinct moves`);
    }
    check(`500 picks x ${UNITS.length} units x 2 phases: zero immediate repeats` + (fails.length ? ' — ' + fails.join('; ') : ''), fails.length === 0);
  }

  // ---------------- distance bands ----------------
  // Strict no-repeat caps any single move at 50% of picks, so shares are measured only over
  // picks whose previous move was outside the target set (every target move is a candidate),
  // against the base-weight share over the same candidate sets. Share ratio >= 1.5x is only
  // reachable when the base share is <= 0.4 (0.6 caps at 1.67x); above that the odds ratio is used.
  section('bossai: distance bands');
  for (const [band, dist] of [['close', 120], ['far', 700]]) {
    const fails = [], seen = [];
    for (const id of UNITS) for (const ph of [1, 2]) {
      const r = R(`(() => {
        const B = __ba.room(${J(id)}); const P = GAME.player;
        const W = __ba.weights(B, ${ph}), T = __ba.tags(B, ${ph});
        B.camping = () => false;
        const rec = __ba.picks(B, ${ph}, 3000, () => { P.x = B.x - ${dist}; P.y = B.y; });
        delete B.camping;
        const inB = k => k && T[k].band === ${J(band)};
        let n = 0, hit = 0, base = 0;
        rec.forEach((k, i) => {
          const prev = rec.prev[i];
          if (inB(prev)) return;
          let tw = 0, bw = 0; for (const c in W) if (c !== prev) { tw += W[c]; if (inB(c)) bw += W[c]; }
          n++; base += bw / tw; if (inB(k)) hit++;
        });
        return { base: n ? base / n : 0, share: n ? hit / n : 0 };
      })()`);
      if (r.base <= 0 || r.base >= 1) continue;
      seen.push(`${id}p${ph}`);
      const ok = r.base <= 0.4 ? r.share >= 1.5 * r.base
        : (r.share / (1 - r.share)) >= 1.5 * (r.base / (1 - r.base));
      if (!ok) fails.push(`${id} p${ph}: share ${r.share.toFixed(3)} vs base ${r.base.toFixed(3)}`);
    }
    check(`player at ${dist} px: '${band}' moves picked >= 1.5x their base share (${seen.length} tables)`
      + (fails.length ? ' — ' + fails.join('; ') : ''), fails.length === 0 && seen.length >= 4);
  }

  // ---------------- anti-camping ----------------
  section('bossai: anti-camping');
  {
    const cmp = R(`(() => {
      const B = __ba.room('tataka'); const P = GAME.player; const A = GAME.arena;
      const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
      const res = {};
      B.campHist = []; P.x = cx; P.y = cy;
      res.empty = B.camping();
      B.campHist = Array.from({ length: 12 }, (_, i) => ({ x: cx + (i % 3) * 8, y: cy - (i % 2) * 8 }));
      res.still = B.camping();
      B.campHist = Array.from({ length: 12 }, (_, i) => ({ x: cx + Math.cos(i * 0.5) * 150, y: cy + Math.sin(i * 0.5) * 150 }));
      res.circle = B.camping();
      P.x = A.x + 50; P.y = cy;
      res.edge = B.camping();
      P.x = cx; P.y = A.y + A.h - 40;
      res.edgeS = B.camping();
      return res;
    })()`);
    check(`camping(): false with < 12 samples away from walls (${cmp.empty})`, cmp.empty === false);
    check(`camping(): true when 12 samples (3 s) sit within 60 px of their mean (${cmp.still})`, cmp.still === true);
    check(`camping(): false while circling at 150 px radius (${cmp.circle})`, cmp.circle === false);
    check(`camping(): true within 90 px of an arena wall (W ${cmp.edge}, S ${cmp.edgeS})`, cmp.edge === true && cmp.edgeS === true);

    // real update: the tracker samples every 0.25 s
    const live = R(`(() => {
      const B = __ba.room('ahiravana'); const P = GAME.player; const A = GAME.arena;
      const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
      B.x = cx + 300; B.y = cy; B.state = 'rest'; B.t = 99;
      B.campHist = [];
      let t = 0;
      for (let f = 0; f < 200; f++) { t += 1 / 60; P.x = cx; P.y = cy; P.iframes = 0; GAME.update(1 / 60); B.t = 99; }
      const still = B.camping(), n = B.campHist.length;
      for (let f = 0; f < 200; f++) { t += 1 / 60; P.x = cx + Math.cos(t * 2) * 150; P.y = cy + Math.sin(t * 2) * 150; P.iframes = 0; GAME.update(1 / 60); B.t = 99; }
      return { still, n, moving: B.camping(), n2: B.campHist.length };
    })()`);
    check(`live tracker: standing still 3.3 s -> camping (samples ${live.n})`, live.still === true && live.n === 12);
    check(`live tracker: circling at 300 px/s -> not camping, history capped at 12 (${live.n2})`, live.moving === false && live.n2 === 12);

    const fails = [], seen = [];
    for (const id of UNITS) for (const ph of [1, 2]) {
      const r = R(`(() => {
        const B = __ba.room(${J(id)}); const P = GAME.player; const A = GAME.arena;
        const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
        const T = __ba.tags(B, ${ph});
        const place = () => { B.x = cx + 300; B.y = cy; P.x = cx; P.y = cy; };
        const still = Array.from({ length: 12 }, () => ({ x: cx, y: cy }));
        const circ = Array.from({ length: 12 }, (_, i) => ({ x: cx + Math.cos(i * 0.5) * 150, y: cy + Math.sin(i * 0.5) * 150 }));
        // conditional on the previous move not being an area move (see the bands note)
        const share = rec => { let n = 0, hit = 0; rec.forEach((k, i) => { const p = rec.prev[i]; if (p && T[p].area) return; n++; if (T[k].area) hit++; }); return n ? hit / n : 0; };
        const a = share(__ba.picks(B, ${ph}, 6000, () => { place(); B.campHist = still.slice(); }));
        const b = share(__ba.picks(B, ${ph}, 6000, () => { place(); B.campHist = circ.slice(); }));
        const anyArea = Object.values(T).some(t => t.area), anyNon = Object.values(T).some(t => !t.area);
        return { camp: a, move: b, both: anyArea && anyNon };
      })()`);
      if (!r.both) continue;
      seen.push(`${id}p${ph}`);
      const ok = r.move <= 0.4 ? r.camp >= 1.5 * r.move
        : (r.camp / Math.max(1e-6, 1 - r.camp)) >= 1.5 * (r.move / (1 - r.move));
      if (!ok) fails.push(`${id} p${ph}: camping ${r.camp.toFixed(3)} vs moving ${r.move.toFixed(3)}`);
    }
    check(`camping player: area moves picked >= 1.5x as often as vs a moving player (${seen.length} tables)`
      + (fails.length ? ' — ' + fails.join('; ') : ''), fails.length === 0 && seen.length >= 8);
  }

  // ---------------- chains ----------------
  section('bossai: combo chains');
  {
    const roll = R(`(() => {
      const B = __ba.room('yama');
      const out = { p1: {}, p2: {}, heat: {} };
      const orig = B.startMove;
      B.startMove = function (id) { B.lastMove = id; };
      for (const [key, ph] of [['p1', 1], ['p2', 2]]) {
        B.phase = ph;
        for (let i = 0; i < 2000; i++) { B.chainLeft = 0; B.pickMove(); if (B.lastMove !== 'chase') out[key][B.chainLeft] = (out[key][B.chainLeft] || 0) + 1; }
      }
      GAME.heat = { chainBonus: 1, restMul: 0.5 };
      B.phase = 2;
      for (let i = 0; i < 500; i++) { B.chainLeft = 0; B.pickMove(); if (B.lastMove !== 'chase') out.heat[B.chainLeft] = (out.heat[B.chainLeft] || 0) + 1; }
      GAME.heat = undefined;
      B.startMove = orig;
      return out;
    })()`);
    const keys = o => Object.keys(o).map(Number).sort();
    check(`phase-1 chain roll: chainLeft in {0,1,2} (${J(roll.p1)})`, J(keys(roll.p1)) === J([0, 1, 2]));
    check(`phase-2 chain roll: chainLeft in {1,2} (${J(roll.p2)})`, J(keys(roll.p2)) === J([1, 2]));
    check(`GAME.heat.chainBonus 1 adds one link (${J(roll.heat)})`, J(keys(roll.heat)) === J([2, 3]));

    // chain rest: shortened only while a chain continues; Heat restMul scales it; inert without heat
    const rest = R(`(() => {
      const out = {};
      for (const [key, heat, ph, cl] of [['p1', undefined, 1, 1], ['p2', undefined, 2, 1], ['heat', { restMul: 0.5 }, 2, 1], ['end', undefined, 2, 0]]) {
        const B = __ba.room('kumbhakarna');
        B.phase = ph; GAME.heat = heat;
        if (ph === 2) B.hp = B.maxhp * 0.45;
        const ts = [];
        for (let i = 0; i < 40; i++) {
          B.startMove('radial'); B.chainLeft = cl;
          let f = 0; while (f++ < 200 && B.state !== 'rest') { GAME.player.iframes = 0; GAME.update(1 / 60); }
          ts.push(B.t);
          B.state = 'rest'; B.t = 99;
        }
        GAME.heat = undefined;
        out[key] = [Math.min(...ts), Math.max(...ts)];
      }
      return out;
    })()`);
    const inR = (r, lo, hi) => r[0] >= lo - 0.02 && r[1] <= hi + 0.001;
    check(`phase-1 chain rest in [0.28, 0.38] s (${J(rest.p1.map(v => +v.toFixed(3)))})`, inR(rest.p1, 0.28, 0.38));
    check(`phase-2 chain rest in [0.20, 0.28] s (${J(rest.p2.map(v => +v.toFixed(3)))})`, inR(rest.p2, 0.20, 0.28));
    check(`GAME.heat.restMul 0.5 halves the chain rest (${J(rest.heat.map(v => +v.toFixed(3)))})`, inR(rest.heat, 0.10, 0.14));
    check(`no chain link left -> the move's own rest (radial 0.8 s; got ${J(rest.end.map(v => +v.toFixed(3)))})`, rest.end[0] > 0.7);

    const fails = [], viol = [];
    for (const id of BOSSES) {
      const s2 = R(`__ba.sim(${J(id)}, 2, 90)`);
      const short = s2.gaps.filter(g => g <= 0.35).length;
      const frac = s2.gaps.length ? short / s2.gaps.length : 0;
      const lens = [...new Set(s2.chains.filter(c => c.phase === 2).map(c => c.len))].sort();
      check(`${id} phase 2 (90 s sim): >= 50% of damaging-move gaps <= 0.35 s (${short}/${s2.gaps.length} = ${(frac * 100).toFixed(0)}%)`,
        s2.gaps.length >= 10 && frac >= 0.5);
      check(`${id} phase 2: chain lengths are 2 or 3 (${J(lens)}, ${s2.chains.length} chains)`,
        s2.chains.length >= 5 && lens.every(n => n === 2 || n === 3));
      const s1 = R(`__ba.sim(${J(id)}, 1, 90)`);
      const c1 = s1.chains.filter(c => c.phase === 1);
      const mean = c1.length ? c1.reduce((a, c) => a + c.len, 0) / c1.length : 0;
      check(`${id} phase 1: mean chain length in [1.6, 2.4] (${mean.toFixed(2)} over ${c1.length} chains)`,
        c1.length >= 5 && mean >= 1.6 && mean <= 2.4);
      viol.push(...s2.viol, ...s1.viol);
      if (s2.phase !== 2 || s1.phase !== 1) fails.push(id + ' changed phase mid-sim');
    }
    check('chain sims stay in their phase' + (fails.length ? ' — ' + fails.join('; ') : ''), fails.length === 0);
    check(`chain sims: zero BOSS_TG violations (${viol.length})` + (viol.length ? ' — ' + viol.slice(0, 5).join(', ') : ''), viol.length === 0);
  }

  // ---------------- opener + heat inert ----------------
  section('bossai: phase-2 opener and Heat hook');
  for (const id of UNITS) {
    const r = R(`(() => {
      const B = __ba.room(${J(id)});
      B.state = 'rest'; B.t = 0.01; B.chainLeft = 2;
      GAME.player.iframes = 0; GAME.update(1 / 60);
      B.hp = B.maxhp * 0.3;
      let f = 0; while (f++ < 600 && B.phase === 1) { GAME.player.iframes = 0; GAME.update(1 / 60); }
      f = 0; while (f++ < 600 && B.state === 'phaseShift') { GAME.player.iframes = 0; GAME.update(1 / 60); }
      const opener = (B.moveTable(2).find(m => m[2] && m[2].opener) || [])[0];
      return { opener, cur: B.curMove, chainLeft: B.chainLeft };
    })()`);
    check(`${id}: first phase-2 move is the opener even mid-chain (${r.opener}; got ${r.cur}, chainLeft ${r.chainLeft})`,
      r.cur === r.opener && r.chainLeft === 0);
  }
  check('GAME.heat is undefined in a fresh run (Heat hook inert until plan 09)', R(`(GAME.startRun(), GAME.heat === undefined)`));
};
