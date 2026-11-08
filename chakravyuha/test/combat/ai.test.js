// 05.7.1-04 (D-06, D-11, D-18, COMBAT-04/07): enemy coordination (ENEMY_AI) and the
// enemy-side telegraph invariant (ENEMY_TG).
// Part 1: the coordinator in isolation (stub enemies): view band, wind-time variance, tokens,
// slots, escape-route cutting, separation, reset.
'use strict';
module.exports = function ({ R, check, fs, path, root }) {
  const DT = 1 / 60;
  R(`globalThis.__ai = {
    boot(biome) {
      GAME.godMode = false;
      INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false; INPUT.keys = {};
      GAME.startRun();
      if (biome) { GAME.biomeIdx = biome; GAME.biome = DATA.BIOMES[biome]; }
      ROOMS.enterRoom('mudra');
      GAME.state = 'combat'; GAME.bossRef = null;
      GAME.enemies = []; GAME.waves = []; GAME.spawnQueue = []; GAME.pillars = []; GAME.hazards = [];
      GAME.pprojectiles = []; GAME.eprojectiles = []; GAME.zones = []; GAME.orbits = []; GAME.rings = [];
      const P = GAME.player;
      const A = GAME.arena;
      P.x = A.x + A.w / 2; P.y = A.y + A.h / 2;
      P.maxhp = 1e9; P.hp = 1e9;
      ENEMY_AI.reset();
      return P;
    },
    stub(role, x, y, r) {
      return { def: { role, ai: role === 'ranged' ? 'shoot' : 'lunge' }, r: r || 12, x, y, dead: false,
        curSpeed: () => 100, windKind: null, armedAtk: false };
    },
  };`);

  const hasAI = R(`typeof ENEMY_AI === 'object' && typeof ENEMY_TG === 'object'`);
  check('ENEMY_AI and ENEMY_TG globals exist', hasAI);
  if (!hasAI) return;

  // ---- static: pure view band, no stale camera reads ----
  const src = fs.readFileSync(path.join(root, 'js', 'ai.js'), 'utf8');
  check('js/ai.js never reads CAMERA.visible / CAMERA.tx / CAMERA.ty / CAMERA.tz',
    !/CAMERA\.(visible|tx|ty|tz)\b/.test(src));
  check('ENEMY_TG.MIN has melee .30, ranged .30, status .40, stun .50, beam .70, bite .20',
    R(`JSON.stringify(ENEMY_TG.MIN) === JSON.stringify({ melee: 0.30, ranged: 0.30, status: 0.40, stun: 0.50, beam: 0.70, bite: 0.20 })`));

  // ---- viewBand ----
  const vb = R(`(() => {
    const P = { x: 1000, y: 800 };
    CAMERA.tx = 12345; CAMERA.ty = -999; CAMERA.tz = 3;     // stale garbage must not matter
    const Z = (CAMERA.CFG.ZOOM && CAMERA.CFG.ZOOM.combat) || ENEMY_AI.CFG.VIEW_ZOOM;
    const hw = CAMERA.VW / (2 * Z) - 40, hh = CAMERA.VH / (2 * Z) - 40;
    const b = ENEMY_AI.viewBand(P);
    const ok = Math.abs(b.x - (P.x - hw)) < 1e-9 && Math.abs(b.y - (P.y - hh)) < 1e-9 &&
      Math.abs(b.w - 2 * hw) < 1e-9 && Math.abs(b.h - 2 * hh) < 1e-9;
    CAMERA.tx = 0; CAMERA.ty = 0; CAMERA.tz = 1;
    const b2 = ENEMY_AI.viewBand(P);
    const inC = ENEMY_AI.inViewBand(P.x + hw - 1, P.y, P), outC = ENEMY_AI.inViewBand(P.x + hw + 1, P.y, P);
    return { ok, pure: JSON.stringify(b) === JSON.stringify(b2), inC, outC, hw, hh };
  })()`);
  check(`viewBand(P) = P ± (VW/(2Z) - 40, VH/(2Z) - 40) [hw ${vb.hw.toFixed(1)}, hh ${vb.hh.toFixed(1)}]`, vb.ok);
  check('viewBand is pure (identical under different CAMERA transforms)', vb.pure);
  check('inViewBand: inside the edge true, outside false', vb.inC && !vb.outC);

  // ---- windTime ----
  const wt = R(`(() => {
    const kinds = Object.keys(ENEMY_TG.MIN); let ok = true, maxR = 0;
    for (const k of kinds) for (const base of [0, 0.1, 0.45, 0.9]) {
      const lo = Math.max(ENEMY_TG.MIN[k], base);
      for (let i = 0; i < 500; i++) {
        const w = ENEMY_AI.windTime(k, base);
        if (w < lo - 1e-12 || w > lo * 1.3 + 1e-12) ok = false;
        maxR = Math.max(maxR, w / lo);
      }
    }
    return { ok, maxR };
  })()`);
  check(`windTime(kind, base) in [max(MIN, base), × 1.3] for 500 samples per kind/base (max ratio ${wt.maxR.toFixed(3)})`, wt.ok);

  // ---- tokens ----
  const tk = R(`(() => {
    __ai.boot(0);
    ENEMY_AI.CFG.TOKENS.melee = 3; ENEMY_AI.CFG.TOKEN_BIOME = [0, 0, 0, 0];
    const es = [0, 1, 2, 3].map(i => __ai.stub('melee', 0, 0));
    GAME.enemies = es.slice();
    const r = es.map(e => ENEMY_AI.requestToken(e, 'melee'));
    const again = ENEMY_AI.requestToken(es[0], 'melee');
    const heldAfterAgain = ENEMY_AI.holding('melee');
    ENEMY_AI.releaseToken(es[1]);
    const fourthAfterRelease = ENEMY_AI.requestToken(es[3], 'melee');
    // dead holder reclaimed by tick
    es[0].windKind = 'melee'; es[2].windKind = 'melee'; es[3].windKind = 'melee';
    es[2].dead = true;
    ENEMY_AI.tick(${DT});
    const afterTick = ENEMY_AI.holding('melee');
    const fifth = __ai.stub('melee', 0, 0); GAME.enemies.push(fifth);
    const fifthOk = ENEMY_AI.requestToken(fifth, 'melee');
    ENEMY_AI.CFG.TOKENS.melee = 2; ENEMY_AI.CFG.TOKEN_BIOME = [0, 1, 1, 2];
    return { first3: r[0] && r[1] && r[2], fourth: r[3], again, heldAfterAgain, fourthAfterRelease, afterTick, fifthOk,
      cat: es[0].tokenCat };
  })()`);
  check('tokens: three requests succeed with a melee pool of 3', tk.first3);
  check('tokens: the 4th request from a different enemy returns false', tk.fourth === false);
  check('tokens: re-requesting while holding keeps the token (true, pool unchanged)', tk.again === true && tk.heldAfterAgain === 3);
  check('tokens: releaseToken frees a token for the next requester', tk.fourthAfterRelease === true);
  check('tokens: a dead holder is reclaimed by tick()', tk.afterTick === 2 && tk.fifthOk === true);
  check('tokens: requestToken sets e.tokenCat', tk.cat === 'melee');

  const pl = R(`(() => {
    __ai.boot(0); GAME.heat = null;
    const a = [0, 1, 2, 3].map(b => { GAME.biomeIdx = b; return [ENEMY_AI.pool('melee'), ENEMY_AI.pool('ranged'), ENEMY_AI.pool('heavy')]; });
    GAME.heat = { tokens: 1 }; GAME.biomeIdx = 0; const h = ENEMY_AI.pool('heavy'); GAME.heat = null;
    return { a, h };
  })()`);
  check('pool(): melee/ranged grow by TOKEN_BIOME per biome, heavy does not ' + JSON.stringify(pl.a),
    JSON.stringify(pl.a) === JSON.stringify([[2, 2, 1], [3, 3, 1], [3, 3, 1], [4, 4, 1]]));
  check('pool(): the GAME.heat.tokens hook adds to every pool', pl.h === 2);

  // ---- slots ----
  const sl = R(`(() => {
    const P = __ai.boot(0);
    const m = [], g = [];
    for (let i = 0; i < 8; i++) { const a = i * 0.3; m.push(__ai.stub('melee', P.x + Math.cos(a) * 140, P.y + Math.sin(a) * 140)); }
    for (let i = 0; i < 10; i++) { const a = i * 0.25; g.push(__ai.stub('ranged', P.x + Math.cos(a) * 320, P.y + Math.sin(a) * 320)); }
    GAME.enemies = m.concat(g);
    ENEMY_AI.tick(${DT});
    const mi = m.map(e => ENEMY_AI.slots.get(e)).filter(Boolean).map(s => s.ring + s.i);
    const gi = g.map(e => ENEMY_AI.slots.get(e)).filter(Boolean).map(s => s.ring + s.i);
    // beyond capacity: a 9th melee reuses a slot
    const extra = __ai.stub('melee', P.x - 140, P.y); GAME.enemies.push(extra);
    ENEMY_AI.tick(${DT});
    const xs = ENEMY_AI.slots.get(extra);
    // slotT hysteresis: within the repick window the slot does not change
    const before = m.map(e => ENEMY_AI.slots.get(e).i).join(',');
    ENEMY_AI.tick(${DT});
    const after = m.map(e => ENEMY_AI.slots.get(e).i).join(',');
    return { m: mi.length, mDistinct: new Set(mi).size, g: gi.length, gDistinct: new Set(gi).size,
      allMelee: mi.every(s => s.startsWith('melee')), allRanged: gi.every(s => s.startsWith('ranged')),
      extraReuse: !!xs && xs.ring === 'melee', stable: before === after,
      slotT: m.every(e => e.slotT > 0 && e.slotT <= 1.0) };
  })()`);
  check(`slots: 8 melee enemies hold 8 distinct melee slots (${sl.mDistinct}/${sl.m})`, sl.m === 8 && sl.mDistinct === 8 && sl.allMelee);
  check(`slots: 10 ranged enemies hold 10 distinct ranged slots (${sl.gDistinct}/${sl.g})`, sl.g === 10 && sl.gDistinct === 10 && sl.allRanged);
  check('slots: beyond capacity a slot is reused (9th melee still gets one)', sl.extraReuse);
  check('slots: hysteresis keeps slots stable within the 0.5-1.0 s repick window', sl.stable && sl.slotT);

  // ---- escape-route cutting ----
  const cut = R(`(() => {
    const P = __ai.boot(0);
    P.x -= 400;
    const m = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * U.TAU + 0.2; m.push(__ai.stub('melee', P.x + Math.cos(a) * 150, P.y + Math.sin(a) * 150)); }
    GAME.enemies = m;
    for (let f = 0; f < 60; f++) { P.x += 300 * ${DT}; ENEMY_AI.tick(${DT}); }
    for (const e of m) e.slotT = 0;
    ENEMY_AI.tick(${DT});
    let sum = 0, n = 0;
    for (const e of m) { const s = ENEMY_AI.slots.get(e); if (s) { sum += Math.cos(ENEMY_AI.slotAngle('melee', s.i)); n++; } }
    // flankers beside a moving player step into its path (slots ahead of their bearing)
    const few = [80, 100, -80, -100].map(d => { const a = d * Math.PI / 180; return __ai.stub('melee', P.x + Math.cos(a) * 150, P.y + Math.sin(a) * 150); });
    GAME.enemies = few; ENEMY_AI.slots = new Map();
    P.x += 300 * ${DT}; ENEMY_AI.tick(${DT});
    let s2 = 0; for (const e of few) s2 += Math.cos(ENEMY_AI.slotAngle('melee', ENEMY_AI.slots.get(e).i));
    return { mean: sum / n, n, pv: ENEMY_AI.pv.x, mean4: s2 / 4 };
  })()`);
  check(`escape cut: player moving +x at 300 px/s → mean cos(slotAngle) ${cut.mean.toFixed(3)} > 0.2 (pv.x ${cut.pv.toFixed(0)})`, cut.n === 8 && cut.mean > 0.2);
  check(`escape cut: 4 flankers at ±80-100° pick slots ahead of the player (mean cos ${cut.mean4.toFixed(3)} > 0.1)`, cut.mean4 > 0.1);

  const still = R(`(() => {
    const P = __ai.boot(0);
    GAME.enemies = [__ai.stub('melee', P.x + 100, P.y)];
    for (let f = 0; f < 30; f++) ENEMY_AI.tick(${DT});
    return { k: ENEMY_AI.cutK(), a: ENEMY_AI.slotAngle('melee', 2) };
  })()`);
  check('a stationary player gives no heading bias (cutK 0, slot angles uniform)', still.k === 0 && Math.abs(still.a - Math.PI / 2) < 1e-9);

  // ---- separation ----
  const sep = R(`(() => {
    const P = __ai.boot(0);
    const a = __ai.stub('melee', P.x + 200, P.y + 100, 13), b = __ai.stub('melee', P.x + 200, P.y + 100, 15);
    a.curSpeed = b.curSpeed = () => 0;
    GAME.enemies = [a, b];
    for (let f = 0; f < 60; f++) { ENEMY_AI.tick(${DT}); clampToArena(a); clampToArena(b); }
    return { d: U.dist(a.x, a.y, b.x, b.y), need: 0.8 * (13 + 15) };
  })()`);
  check(`separation: two enemies on one point end ${sep.d.toFixed(1)} px apart (>= ${sep.need.toFixed(1)})`, sep.d >= sep.need);

  // ---- reset ----
  const rs = R(`(() => {
    const P = __ai.boot(0);
    const e = __ai.stub('melee', P.x + 100, P.y); e.windKind = 'melee';
    GAME.enemies = [e];
    ENEMY_AI.requestToken(e, 'melee'); ENEMY_AI.tick(${DT});
    const had = ENEMY_AI.holding('melee') === 1 && ENEMY_AI.slots.size === 1;
    ROOMS.enterRoom('mudra');
    return { had, cleared: ENEMY_AI.holding('melee') === 0 && ENEMY_AI.slots.size === 0 && ENEMY_AI._last === null };
  })()`);
  check('ROOMS.enterRoom → ENEMY_AI.reset() clears tokens and slots', rs.had && rs.cleared);

  // ---- integration: ticked every frame from GAME.update ----
  const gsrc = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8');
  check('GAME.update calls ENEMY_AI.tick(dt) right before the enemy update loop',
    /ENEMY_AI\.tick\(dt\);[^\n]*\n\s*for \(const e of this\.enemies\) if \(!e\.dead\) e\.update\(dt\);/.test(gsrc));

  R(`U.unseed()`);
};
