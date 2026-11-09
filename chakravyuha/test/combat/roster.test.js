// 05.7.1-05 (D-05, COMBAT-03/04/19): 8 new regular enemies, 2 per biome, on the plan-04
// ENEMY_AI / ENEMY_TG helpers. Data, per-enemy behaviour, the telegraph invariant, the
// long-shot rule and the non-deity naming rule.
'use strict';
module.exports = function ({ R, sandbox, check, harness }) {
  const DT = 1 / 60;
  R(`globalThis.__ro = {
    boot(biome) {
      GAME.godMode = false;
      INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false; INPUT.keys = {};
      GAME.startRun();
      GAME.biomeIdx = biome || 0; GAME.biome = DATA.BIOMES[biome || 0];
      ROOMS.enterRoom('mudra');
      GAME.state = 'combat'; GAME.bossRef = null;
      GAME.enemies = []; GAME.waves = []; GAME.spawnQueue = []; GAME.pillars = []; GAME.hazards = [];
      GAME.pprojectiles = []; GAME.eprojectiles = []; GAME.zones = []; GAME.orbits = []; GAME.rings = [];
      GAME.epools = [];
      const P = GAME.player;
      const A = GAME.arena;
      P.x = A.x + A.w / 2; P.y = A.y + A.h / 2;
      P.maxhp = 1e9; P.hp = 1e9; P.iframes = 0;
      ENEMY_AI.reset(); ENEMY_TG.clear();
      return P;
    },
    spawn(type, dx, dy, mods) {
      const P = GAME.player; const e = new Enemy(type, P.x + dx, P.y + dy, GAME.biome.scale, mods);
      e.spawnT = 0; clampToArena(e); GAME.enemies.push(e); return e;
    },
    hold(P, x, y) { P.x = x; P.y = y; P.kx = 0; P.ky = 0; if (P.st) { P.st.kx = 0; P.st.ky = 0; } },
    // one enemy alone vs a stationary high-hp player for secs; returns sim stats
    solo(type, biome, secs, dx, dy) {
      const P = __ro.boot(biome);
      const hx = P.x, hy = P.y;
      const e = __ro.spawn(type, dx == null ? 320 : dx, dy || 0);
      let hits = 0, threw = null, lastHp = P.hp, frames = 0;
      try {
        for (let f = 0; f < secs * 60; f++) {
          __ro.hold(P, hx, hy);
          GAME.hitstop = 0;
          GAME.update(${DT});
          if (P.hp < lastHp) hits++;
          if (P.hp < 1e8) P.hp = 1e9;
          lastHp = P.hp; frames++;
          if (e.dead) break;
        }
      } catch (err) { threw = String(err && err.stack || err).split('\\n').slice(0, 2).join(' | '); }
      const winds = ENEMY_TG.windLog.filter(w => w.type === type);
      return { hits, threw, frames, viol: ENEMY_TG.violations.slice(0, 6), nViol: ENEMY_TG.violations.length,
        winds: winds.length, kinds: [...new Set(winds.map(w => w.kind))], minWind: winds.reduce((m, w) => Math.min(m, w.wind), 99) };
    },
  };`);

  const NEW = {
    naraka: ['pishacha', 'kumbhipaka'],
    patala: ['nagaguard', 'mayavi'],
    ranabhoomi: ['javelineer', 'bannerman'],
    vaitarani: ['brahmarakshasa', 'jalarakshasa'],
  };
  const BIOME_IDX = { naraka: 0, patala: 1, ranabhoomi: 2, vaitarani: 3 };
  const ROLES = ['melee', 'heavy', 'ranged', 'support'];
  const HANDLED = ['chase', 'lunge', 'shoot', 'spread', 'teleport', 'tank', 'charge', 'summon',
    'swarm', 'mortar', 'shield', 'trapper', 'sniper', 'buffer', 'healer', 'burrow'];
  const DEITY = /\b(Yama|Dharmaraja|Hanuman|Agni|Indra|Vayu|Krishna|Durga|Shiva|Vishnu|Brahma|Saraswati|Rama|Lakshmana|Ganesha|Kali|Lakshmi|Parvati|Surya|Varuna)\b/i;
  const REVERED_NAGA = /(Shesha|Vasuki|Takshaka|Kaliya)/i;
  const ORIGINAL = ['preta', 'rakshasa', 'archer', 'naga', 'vetala', 'bhuta', 'daitya', 'yatudhana'];

  const present = R(`Object.keys(DATA.ENEMIES)`);
  const biomes = Object.keys(NEW);

  // ---- data ----
  for (const b of biomes) {
    for (const id of NEW[b]) {
      const d = R(`(() => { const d = DATA.ENEMIES['${id}']; if (!d) return null;
        return { d, inRoster: DATA.BIOMES[${BIOME_IDX[b]}].enemies.includes('${id}') }; })()`);
      check(`${id}: exists in DATA.ENEMIES and the ${b} roster`, !!d && d.inRoster);
      if (!d) continue;
      const x = d.d;
      check(`${id}: numeric hp/spd/r/dmg/cost, #rrggbb colour, valid role (${x.role}), handled ai (${x.ai})`,
        ['hp', 'spd', 'r', 'dmg', 'cost'].every(k => typeof x[k] === 'number' && isFinite(x[k])) &&
        /^#[0-9a-f]{6}$/.test(x.color) && ROLES.includes(x.role) && HANDLED.includes(x.ai) && x.id === id);
      check(`${id}: name "${x.name}" has no deity name (whole word) and no revered naga`,
        typeof x.name === 'string' && !DEITY.test(x.name) && !REVERED_NAGA.test(x.name));
    }
  }
  check('naraka fodder includes pishacha', R(`DATA.BIOMES[0].waves.fodder.includes('pishacha')`));
  check('Enemy.update handles every DATA.ENEMIES ai', R(`(() => {
    const src = Enemy.prototype.update.toString();
    return Object.values(DATA.ENEMIES).every(d => src.includes("case '" + d.ai + "'"));
  })()`));

  // ---- pishacha: pack + orbit + dart ----
  const pk = R(`(() => {
    const b = { id: 'test', enemies: ['pishacha'], waves: { fodder: [] } };
    const u = ROOMS.composeWave(DATA.ENEMIES.pishacha.cost * DATA.ENEMIES.pishacha.pack, b, {});
    return { n: u.length, all: u.every(x => x.id === 'pishacha' && !x.weak), pack: DATA.ENEMIES.pishacha.pack };
  })()`);
  check(`pishacha: pack ${pk.pack}; one regular pick yields ${pk.n} units`, pk.pack === 5 && pk.n === 5 && pk.all);

  const orb = R(`(() => {
    const P = __ro.boot(0); U.seed(31);
    const hx = P.x, hy = P.y;
    const e = __ro.spawn('pishacha', 200, 0); e.t = 3;
    let inR = 0, n = 0, darts = 0, wasDart = false, sawWind = false, minDart = 1e9, idleFor = 0;
    for (let f = 0; f < 8 * 60; f++) {
      __ro.hold(P, hx, hy); P.hp = 1e9; GAME.hitstop = 0;
      GAME.update(${DT});
      idleFor = e.state === 'idle' ? idleFor + ${DT} : 0;
      // settled orbit frames: idle for > 0.7 s (the return trip after a dart is excluded)
      if (idleFor > 0.7) { n++; const d = U.dist(e.x, e.y, hx, hy); if (d >= 80 && d <= 140) inR++; }
      if (e.state === 'dartWind') { sawWind = true; if (e.telegraph && e.telegraph.type === 'circle') sawWind = true; }
      if (e.state === 'dart') { if (!wasDart) darts++; minDart = Math.min(minDart, U.dist(e.x, e.y, hx, hy)); }
      wasDart = e.state === 'dart';
    }
    const w = ENEMY_TG.windLog.filter(x => x.type === 'pishacha');
    return { frac: n ? inR / n : 0, darts, sawWind, minDart, minWind: w.reduce((m, x) => Math.min(m, x.wind), 99), nw: w.length,
      kinds: [...new Set(w.map(x => x.kind))], viol: ENEMY_TG.violations.length };
  })()`);
  check(`pishacha: orbits at 90-130 px (${(orb.frac * 100).toFixed(0)}% of orbit frames in [80, 140])`, orb.frac >= 0.7);
  check(`pishacha: darts in (${orb.darts} darts, closest ${orb.minDart.toFixed(0)} px) after a >= 0.25 s bite tell (min ${orb.minWind.toFixed(3)} s)`,
    orb.darts > 0 && orb.sawWind && orb.minWind >= 0.25 - 1e-6 && orb.kinds.join() === 'bite' && orb.minDart < 40);

  // ---- kumbhipaka: 3 mortars around the player with burn pools; long-shot rule ----
  const km = R(`(() => {
    const res = {};
    for (const [tag, dx, dy] of [['in', 340, 0], ['long', 0, -420]]) {
      const P = __ro.boot(0); U.seed(32);
      const hx = P.x, hy = P.y;
      const e = __ro.spawn('kumbhipaka', dx, dy); e.t = 0;
      let wind = null, marks = 0, longDuring = false, fired = null;
      for (let f = 0; f < 120 && !fired; f++) {
        __ro.hold(P, hx, hy); GAME.hitstop = 0; GAME.update(${DT});
        if (e.windKind && !e.armedAtk) {
          if (!wind) wind = { kind: e.windKind, total: e.windTotal, inView: ENEMY_AI.inViewBand(e.x, e.y, P) };
          marks = Math.max(marks, (e.marks || []).filter(m => m.type === 'circle').length);
          if (e.longShot) longDuring = true;
        }
        const ms = GAME.eprojectiles.filter(p => p.fam === 'mortar' && p.owner === e);
        if (ms.length) fired = ms;
      }
      res[tag] = { wind, marks, longDuring, longAfter: e.longShot,
        n: fired ? fired.length : 0,
        pools: !!fired && fired.every(p => p.pool && p.pool.status && p.pool.status.type === 'burn'),
        around: !!fired && fired.every(p => U.dist(p.tx, p.ty, hx, hy) <= 110 + 1e-6) };
    }
    return res;
  })()`);
  check(`kumbhipaka: winds 'status' >= 0.45 s (${km.in.wind ? km.in.wind.total.toFixed(3) : '-'}) with 3 circle marks, then lobs 3 mortars within 110 px that leave burn pools`,
    !!km.in.wind && km.in.wind.kind === 'status' && km.in.wind.total >= 0.45 - 1e-6 && km.in.marks === 3 &&
    km.in.n === 3 && km.in.pools && km.in.around && !km.in.longDuring);
  check(`kumbhipaka: from outside the view band the tell is +0.3 s (${km.long.wind ? km.long.wind.total.toFixed(3) : '-'} >= 0.75) and longShot is set during the wind only`,
    !!km.long.wind && !km.long.wind.inView && km.long.wind.total >= 0.45 + 0.3 - 1e-6 && km.long.longDuring && !km.long.longAfter && km.long.n === 3);

  // ---- naga shield-guard: frontal guard + thrust with knockback ----
  const ng = R(`(() => {
    const P = __ro.boot(1);
    const crit = META.critChance; META.critChance = () => 0;
    const bonus = META.bonusDamage; META.bonusDamage = () => 1;
    const e = __ro.spawn('nagaguard', 100, 0);
    const upd = e.update; e.update = function () {};
    e.face = U.angle(e.x, e.y, P.x, P.y);
    const g0 = e.guardHp;
    const scaleOk = Math.abs(g0 - DATA.ENEMIES.nagaguard.guard * GAME.biome.scale) < 1e-9;
    const h0 = e.hp; hitEnemy(e, 20, 'attack');
    const front = Math.abs((h0 - e.hp) - 20 * (1 - DATA.ENEMIES.nagaguard.guardReduce)) < 1e-6 && Math.abs((g0 - e.guardHp) - 20) < 1e-6;
    e.face += Math.PI;                       // player now behind it
    const h1 = e.hp; hitEnemy(e, 20, 'attack');
    const back = Math.abs((h1 - e.hp) - 20) < 1e-6;
    e.face -= Math.PI; e.guardHp = 5; hitEnemy(e, 20, 'attack');
    const broke = e.guardHp <= 0;
    const h2 = e.hp; hitEnemy(e, 20, 'attack');
    const after = Math.abs((h2 - e.hp) - 20) < 1e-6;
    META.critChance = crit; META.bonusDamage = bonus;
    // thrust
    __ro.boot(1); U.seed(33);
    const P2 = GAME.player, hx = P2.x, hy = P2.y;
    const g = __ro.spawn('nagaguard', 90, 0); g.t = 0;
    let sawLine = false, knocked = false, hit = false; const hp0 = P2.hp;
    for (let f = 0; f < 180 && !hit; f++) {
      P2.x = hx; P2.y = hy; P2.iframes = 0; GAME.hitstop = 0;
      GAME.update(${DT});
      if (g.windKind === 'melee' && g.telegraph && g.telegraph.type === 'line' && g.telegraph.len === 120) sawLine = true;
      if (P2.hp < hp0) { hit = true; knocked = Math.hypot(P2.st.kx || 0, P2.st.ky || 0) > 0; }
    }
    const w = ENEMY_TG.windLog.filter(x => x.type === 'nagaguard');
    return { scaleOk, front, back, broke, after, sawLine, hit, knocked, wind: w.length ? w[0].wind : 0, kind: w.length ? w[0].kind : '' };
  })()`);
  check('nagaguard: guard = 80 × biome scale', ng.scaleOk);
  check('nagaguard: hits within ±60° of its facing deal 15% and drain the guard by the raw amount', ng.front);
  check('nagaguard: hits from behind deal full damage', ng.back);
  check('nagaguard: once the guard breaks, frontal hits deal full damage', ng.broke && ng.after);
  check(`nagaguard: thrust after a >= 0.45 s 'melee' line tell (${ng.wind.toFixed(3)} s) hits and knocks the player back`,
    ng.sawLine && ng.hit && ng.knocked && ng.kind === 'melee' && ng.wind >= 0.45 - 1e-6);

  // ---- mayavi weaver: root snares + slowing wisps, every tell 'status' >= 0.40 ----
  const mv = R(`(() => {
    const P = __ro.boot(1); U.seed(34);
    const hx = P.x, hy = P.y;
    const e = __ro.spawn('mayavi', 320, 0); e.t = 0;
    let snares = 0, wisps = 0, snareOk = true, rooted = false, slowed = false;
    const seen = new Set();
    for (let f = 0; f < 20 * 60; f++) {
      __ro.hold(P, hx, hy); P.hp = 1e9; GAME.hitstop = 0;
      GAME.update(${DT});
      for (const p of GAME.eprojectiles) {
        if (p.owner !== e || seen.has(p)) continue;
        seen.add(p);
        if (p.fam === 'mortar') { snares++; if (!(p.r === 46 && p.flight === 0.9 && p.status && p.status.type === 'root' && p.status.dur === 1.0)) snareOk = false; }
        if (p.fam === 'wisp') wisps++;
      }
      if (P.st.rootT > 0) rooted = true;
      if (P.st.slowT > 0) slowed = true;
    }
    const w = ENEMY_TG.windLog.filter(x => x.type === 'mayavi');
    return { snares, wisps, snareOk, rooted, slowed, n: w.length, allStatus: w.every(x => x.kind === 'status' && x.wind >= 0.40 - 1e-6),
      minWind: w.reduce((m, x) => Math.min(m, x.wind), 99) };
  })()`);
  check(`mayavi: lays root snares (${mv.snares}: mortar r 46, flight 0.9, root 1.0 s) and fires slowing wisps (${mv.wisps})`,
    mv.snares > 0 && mv.snareOk && mv.wisps > 0);
  check(`mayavi: the stationary player gets rooted and slowed`, mv.rooted && mv.slowed);
  check(`mayavi: every attack has a 'status' tell >= 0.40 s (${mv.n} tells, min ${mv.minWind.toFixed(3)})`, mv.n > 0 && mv.allStatus);

  {
    // ---- danava javelineer: long band, locked line tell, beam; elite stun; long-shot rule ----
    const jv = R(`(() => {
      const P = __ro.boot(2); U.seed(51);
      const A = GAME.arena; const hx = A.x + A.w / 2, hy = A.y + A.h / 2;
      __ro.hold(P, hx, hy);
      const js = [0, 2.2, -2.2].map(a => __ro.spawn('javelineer', Math.cos(a) * 500, Math.sin(a) * 500));
      let inB = 0, n = 0;
      for (let f = 0; f < 10 * 60; f++) {
        __ro.hold(P, hx, hy); P.hp = 1e9; GAME.hitstop = 0; GAME.update(${DT});
        if (f >= 3 * 60) for (const j of js) if (j.state === 'idle') { n++; const d = U.dist(j.x, j.y, hx, hy); if (d >= 380 && d <= 640) inB++; }
      }
      const res = { frac: n ? inB / n : 0 };
      for (const [tag, dx, dy, mods] of [['in', 430, 0, null], ['long', 0, -520, null], ['elite', 430, 0, { elite: ['hasty'] }]]) {
        const P2 = __ro.boot(2); U.seed(52);
        const x0 = P2.x, y0 = P2.y;
        const e = __ro.spawn('javelineer', dx, dy, mods); e.t = 0;
        let wind = null, tg = null, longDuring = false, beam = null, aimMoved = false;
        for (let f = 0; f < 150 && !beam; f++) {
          __ro.hold(P2, x0, y0); GAME.hitstop = 0;
          if (wind) { P2.x = x0 + 40; }               // player sidesteps during the tell: aim stays locked
          GAME.update(${DT});
          if (e.windKind && !e.armedAtk) {
            if (!wind) wind = { kind: e.windKind, total: e.windTotal, a: e.telegraph ? e.telegraph.a : null };
            tg = e.telegraph ? { type: e.telegraph.type, len: e.telegraph.len, w: e.telegraph.w, a: e.telegraph.a } : tg;
            if (e.telegraph && wind.a != null && Math.abs(e.telegraph.a - wind.a) > 1e-9) aimMoved = true;
            if (e.longShot) longDuring = true;
          }
          beam = GAME.eprojectiles.find(p => p.fam === 'beam' && p.owner === e) || null;
        }
        res[tag] = { wind, tg, longDuring, aimMoved, longAfter: !!e.longShot,
          beam: beam ? { tell: beam.tell, a: beam.a, status: beam.status ? beam.status.type : null, dur: beam.status ? beam.status.dur : 0 } : null };
      }
      return res;
    })()`);
    check(`javelineer: keeps 420-600 px (${(jv.frac * 100).toFixed(0)}% of idle frames in [380, 640])`, jv.frac >= 0.7);
    check(`javelineer: winds 'beam' >= 0.70 s (${jv.in.wind ? jv.in.wind.total.toFixed(3) : '-'}) with a locked line telegraph (len 900, w 14), then fires a beam (tell 0.1)`,
      !!jv.in.wind && jv.in.wind.kind === 'beam' && jv.in.wind.total >= 0.7 - 1e-6 && jv.in.tg && jv.in.tg.type === 'line' &&
      jv.in.tg.len === 900 && jv.in.tg.w === 14 && !jv.in.aimMoved && !!jv.in.beam && Math.abs(jv.in.beam.tell - 0.1) < 1e-9 &&
      Math.abs(jv.in.beam.a - jv.in.wind.a) < 1e-9 && !jv.in.beam.status && !jv.in.longDuring);
    check(`javelineer: elite winds 'stun' (still >= 0.7 s: ${jv.elite.wind ? jv.elite.wind.total.toFixed(3) : '-'}) and its beam stuns 0.4 s`,
      !!jv.elite.wind && jv.elite.wind.kind === 'stun' && jv.elite.wind.total >= 0.7 - 1e-6 && !!jv.elite.beam &&
      jv.elite.beam.status === 'stun' && jv.elite.beam.dur === 0.4);
    check(`javelineer: from outside the view band +0.3 s tell (${jv.long.wind ? jv.long.wind.total.toFixed(3) : '-'} >= 1.0) and longShot during the wind only`,
      !!jv.long.wind && jv.long.wind.total >= 0.7 + 0.3 - 1e-6 && jv.long.longDuring && !jv.long.longAfter && !!jv.long.beam);

    // ---- asura standard-bearer: aura, no damage, hangs back ----
    const bn = R(`(() => {
      const P = __ro.boot(2);
      const b = __ro.spawn('bannerman', 400, 0);
      const near = __ro.spawn('rakshasa', 250, 100), far = __ro.spawn('rakshasa', -300, 0);
      ENEMY_AI.tick(${DT});
      const out = { near: near.dmgMul(), nearSpd: near.curSpeed() / near.spd, far: far.dmgMul(), farSpd: far.curSpeed() / far.spd,
        self: b.dmgMul() };
      killEnemy(b); ENEMY_AI.tick(${DT});
      out.after = near.dmgMul(); out.afterSpd = near.curSpeed() / near.spd;
      // band
      const P2 = __ro.boot(2); U.seed(53);
      const A = GAME.arena; const hx = A.x + A.w / 2, hy = A.y + A.h / 2;
      __ro.hold(P2, hx, hy);
      const bm = __ro.spawn('bannerman', 450, 0);
      __ro.spawn('rakshasa', 150, 0); __ro.spawn('preta', 120, 60);
      let inB = 0, n = 0;
      for (let f = 0; f < 8 * 60; f++) {
        __ro.hold(P2, hx, hy); P2.hp = 1e9; GAME.hitstop = 0; GAME.update(${DT});
        if (f >= 2 * 60) { n++; const d = U.dist(bm.x, bm.y, hx, hy); if (d >= 260 && d <= 540) inB++; }
      }
      out.frac = n ? inB / n : 0;
      return out;
    })()`);
    check(`bannerman: allies within 240 px are rallied (dmgMul ${bn.near}) and ×1.15 speed (${bn.nearSpd.toFixed(3)}); far ones not (${bn.far}, ${bn.farSpd})`,
      bn.near === 1.2 && Math.abs(bn.nearSpd - 1.15) < 1e-9 && bn.far === 1 && bn.farSpd === 1);
    check('bannerman: the aura ends when it dies', bn.after === 1 && bn.afterSpd === 1);
    check(`bannerman: keeps 300-500 px from the player (${(bn.frac * 100).toFixed(0)}% of frames in [260, 540])`, bn.frac >= 0.7);

    // ---- brahmarakshasa: heals allies, slow orb after a ranged tell ----
    const br = R(`(() => {
      const P = __ro.boot(3); U.seed(54);
      const hx = P.x, hy = P.y;
      const h = __ro.spawn('brahmarakshasa', 330, 0); h.t = 99;
      const hurt = __ro.spawn('rakshasa', 330, 120), ok = __ro.spawn('rakshasa', 330, -120);
      hurt.update = function () {}; ok.update = function () {};
      hurt.hp = hurt.maxhp * 0.4; ok.hp = ok.maxhp * 0.9;
      h.hp = h.maxhp * 0.1;
      const h0 = h.hp, pHp = P.hp; let bolts = 0, rings = 0, at = -1;
      for (let f = 0; f < 5 * 60 && at < 0; f++) {
        __ro.hold(P, hx, hy); GAME.hitstop = 0;
        const nb = GAME.bolts.length, nr = GAME.rings.length;
        GAME.update(${DT});
        if (hurt.hp > hurt.maxhp * 0.4 + 1e-9) { at = (f + 1) * ${DT}; bolts = GAME.bolts.length - nb; rings = GAME.rings.length - nr; }
        h.t = 99;
      }
      const heal = Math.abs(hurt.hp - hurt.maxhp * 0.6) < 1e-6 && Math.abs(ok.hp - ok.maxhp * 0.9) < 1e-9 && h.hp === h0 && P.hp === pHp;
      // orb
      __ro.boot(3); U.seed(55);
      const P2 = GAME.player, x2 = P2.x, y2 = P2.y;
      const o = __ro.spawn('brahmarakshasa', 330, 0); o.t = 0;
      let orb = null, sawCircle = false;
      for (let f = 0; f < 120 && !orb; f++) {
        __ro.hold(P2, x2, y2); GAME.hitstop = 0; GAME.update(${DT});
        if (o.windKind === 'ranged' && o.telegraph && o.telegraph.type === 'circle') sawCircle = true;
        orb = GAME.eprojectiles.find(p => p.fam === 'orb' && p.owner === o) || null;
      }
      const w = ENEMY_TG.windLog.filter(x => x.type === 'brahmarakshasa');
      return { heal, at, bolts, rings, orb: !!orb, spd: orb ? Math.hypot(orb.vx, orb.vy) : 0, knock: orb && orb.status ? orb.status.type : null,
        sawCircle, wind: w.length ? w[0].wind : 0, kind: w.length ? w[0].kind : '' };
    })()`);
    check(`brahmarakshasa: heals the lowest-percent ally within 260 px by 20% max hp (at ${br.at.toFixed(2)} s <= 4.2), never itself or the player`,
      br.heal && br.at > 0 && br.at <= 4.2);
    check(`brahmarakshasa: the heal is visible (beam ${br.bolts}, ring ${br.rings})`, br.bolts > 0 && br.rings > 0);
    check(`brahmarakshasa: a slow knockback orb (${br.spd.toFixed(0)} px/s) after a >= 0.45 s 'ranged' circle tell (${br.wind.toFixed(3)})`,
      br.orb && Math.abs(br.spd - 140) < 1e-6 && br.knock === 'knock' && br.sawCircle && br.kind === 'ranged' && br.wind >= 0.45 - 1e-6);

    // ---- jala-rakshasa: submerge, untargetable, emerge tell, ring ----
    const jr = R(`(() => {
      const P = __ro.boot(3); U.seed(56);
      const hx = P.x, hy = P.y;
      const e = __ro.spawn('jalarakshasa', 260, 0); e.t = 0;
      let subAt = -1, windAt = -1, emergedAt = -1, immune = true, pass = true, meleeSkip = true, circle = false, ring = null;
      let hp0 = P.hp, hit = false, knocked = false, f = 0;
      const crit = META.critChance; META.critChance = () => 0;
      for (; f < 6 * 60 && emergedAt < 0; f++) {
        __ro.hold(P, hx, hy); P.iframes = 0; GAME.hitstop = 0;
        GAME.update(${DT});
        const t = (f + 1) * ${DT};
        if (e.submerged && subAt < 0) subAt = t;
        if (e.submerged) {
          const h = e.hp;
          if (hitEnemy(e, 50, 'attack') !== 0 || e.hp !== h) immune = false;
          const shot = { x: e.x - 3, y: e.y, vx: 300, vy: 0, dmg: 10, r: 5, t: 1, pierce: false, src: 'attack', color: '#ffffff', hitSet: new Set() };
          GAME.pprojectiles.push(shot);
          const before = e.hp;
          GAME.update(0.001);
          if (shot.hitSet.has(e) || e.hp !== before) pass = false;
          GAME.pprojectiles = GAME.pprojectiles.filter(p => p !== shot);
          // a melee swing at it does nothing
          INPUT.wx = e.x; INPUT.wy = e.y; P.aim = U.angle(P.x, P.y, e.x, e.y);
          const sx = P.x, sy = P.y; P.x = e.x - 40; P.y = e.y;
          const bh = e.hp; e.kx = 0; e.ky = 0; P.atkCd = 0; P.meleeAttack();
          if (e.hp !== bh || e.kx !== 0) meleeSkip = false;
          P.x = sx; P.y = sy;
        }
        if (e.state === 'emergeWind') {
          if (windAt < 0) windAt = t;
          if (e.telegraph && e.telegraph.type === 'circle' && e.telegraph.r === 70) circle = true;
        }
        if (subAt > 0 && !e.submerged && emergedAt < 0) emergedAt = t;
      }
      META.critChance = crit;
      // let the emerge resolve
      for (let k = 0; k < 10; k++) { __ro.hold(P, hx, hy); GAME.hitstop = 0; GAME.update(${DT}); }
      ring = GAME.eprojectiles.find(p => p.fam === 'ring' && p.owner === e) || null;
      const w = ENEMY_TG.windLog.filter(x => x.type === 'jalarakshasa');
      return { subAt, windAt, emergedAt, immune, pass, meleeSkip, circle, ring: !!ring,
        hit: P.hp < hp0, wind: w.length ? w[0].wind : 0, kind: w.length ? w[0].kind : '' };
    })()`);
    check(`jalarakshasa: submerges and dives <= 2.5 s before its emerge tell (dive ${(jr.windAt - jr.subAt).toFixed(2)} s)`,
      jr.subAt > 0 && jr.windAt > 0 && jr.windAt - jr.subAt <= 2.5 + 2 / 60);
    check('jalarakshasa: while submerged hitEnemy returns 0, player projectiles pass through and melee skips it',
      jr.immune && jr.pass && jr.meleeSkip);
    check(`jalarakshasa: emerges after a >= 0.6 s 'melee' tell with a 70 px circle (${jr.wind.toFixed(3)} s), damages the player and spawns a ring`,
      jr.circle && jr.kind === 'melee' && jr.wind >= 0.6 - 1e-6 && jr.emergedAt > jr.windAt && jr.hit && jr.ring);

    // a submerged enemy draws only a ripple (no body, no hp bar) on both paths
    R(`__ro.boot(3); globalThis.__sub = __ro.spawn('jalarakshasa', 200, 0); __sub.submerged = true; __sub.hp = __sub.maxhp * 0.5;`);
    const rec = harness.recordingCtx();
    sandbox.__rec = rec.ctx;
    R(`__sub.draw(__rec)`);
    const body = rec.ops.some(o => o.op === 'fill' && String(o.fill).toLowerCase() === R(`DATA.ENEMIES.jalarakshasa.color`));
    const bar = rec.ops.some(o => o.op === 'fillRect' && o.fill === '#ff5566');
    const ripple = rec.ops.some(o => o.op === 'ellipse');
    check('jalarakshasa: submerged it draws only a ripple (no body, no hp bar)', ripple && !body && !bar);
  }

  // ---- 30 s solo sims ----
  const ATTACKERS = ['pishacha', 'kumbhipaka', 'nagaguard', 'mayavi', 'javelineer', 'brahmarakshasa', 'jalarakshasa'];
  for (const b of biomes) {
    for (const id of NEW[b]) {
      const s = R(`(() => { U.seed(${40 + BIOME_IDX[b] * 2 + NEW[b].indexOf(id)}); return __ro.solo('${id}', ${BIOME_IDX[b]}, 30); })()`);
      const dmgOk = ATTACKERS.includes(id) ? s.hits > 0 : s.hits === 0;
      check(`${id}: 30 s alone vs a stationary player — no throw, ${s.hits} damaging hits, ${s.winds} tells (${s.kinds.join('/')}), ${s.nViol} ENEMY_TG violations`
        + (s.threw ? ' — threw ' + s.threw : '') + (s.nViol ? ' — ' + s.viol.join(', ') : ''),
        !s.threw && dmgOk && s.nViol === 0);
    }
  }

  // ---- roster shape (all four biomes once Task 3 lands) ----
  {
    const rs = R(`DATA.BIOMES.map(b => b.enemies.filter(id => ${JSON.stringify(ORIGINAL)}.indexOf(id) < 0))`);
    check(`every biome has exactly 2 ids not in the original 8 (${rs.map(x => x.join('+')).join(', ')})`,
      rs.length === 4 && rs.every(x => x.length === 2) &&
      Object.keys(NEW).every((b, i) => NEW[b].every(id => rs[i].includes(id))));
    const allNew = [].concat(...Object.values(NEW));
    check('the 8 new enemies are distinct', new Set(allNew).size === 8);
  }

  R(`INPUT.ax = 0; INPUT.ay = 0; U.unseed()`);
};
