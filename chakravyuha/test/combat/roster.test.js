// 05.7.1-05 (D-05, COMBAT-03/04/19): 8 new regular enemies, 2 per biome, on the plan-04
// ENEMY_AI / ENEMY_TG helpers. Data, per-enemy behaviour, the telegraph invariant, the
// long-shot rule and the non-deity naming rule.
'use strict';
module.exports = function ({ R, check }) {
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

  // which biomes are implemented so far (Task 2 = naraka + patala, Task 3 = all four)
  const present = R(`Object.keys(DATA.ENEMIES)`);
  const biomes = Object.keys(NEW).filter(b => NEW[b].some(id => present.includes(id)) || b === 'naraka' || b === 'patala');

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

  // ---- 30 s solo sims ----
  const ATTACKERS = ['pishacha', 'kumbhipaka', 'nagaguard', 'mayavi', 'javelineer', 'brahmarakshasa', 'jalarakshasa'];
  for (const b of biomes) {
    for (const id of NEW[b]) {
      if (!present.includes(id)) continue;
      const s = R(`(() => { U.seed(${40 + BIOME_IDX[b] * 2 + NEW[b].indexOf(id)}); return __ro.solo('${id}', ${BIOME_IDX[b]}, 30); })()`);
      const dmgOk = ATTACKERS.includes(id) ? s.hits > 0 : true;
      check(`${id}: 30 s alone vs a stationary player — no throw, ${s.hits} damaging hits, ${s.winds} tells (${s.kinds.join('/')}), ${s.nViol} ENEMY_TG violations`
        + (s.threw ? ' — threw ' + s.threw : '') + (s.nViol ? ' — ' + s.viol.join(', ') : ''),
        !s.threw && dmgOk && s.nViol === 0);
    }
  }

  // ---- roster shape (all four biomes once Task 3 lands) ----
  if (Object.keys(NEW).every(b => NEW[b].every(id => present.includes(id)))) {
    const rs = R(`DATA.BIOMES.map(b => b.enemies.filter(id => ${JSON.stringify(ORIGINAL)}.indexOf(id) < 0))`);
    check(`every biome has exactly 2 ids not in the original 8 (${rs.map(x => x.join('+')).join(', ')})`,
      rs.length === 4 && rs.every(x => x.length === 2) &&
      Object.keys(NEW).every((b, i) => NEW[b].every(id => rs[i].includes(id))));
    const allNew = [].concat(...Object.values(NEW));
    check('the 8 new enemies are distinct', new Set(allNew).size === 8);
  }

  R(`INPUT.ax = 0; INPUT.ay = 0; U.unseed()`);
};
