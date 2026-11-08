// 05.7.1-02 (D-09, COMBAT-07): data-driven enemy projectile families.
// Ten visual families + four status variants spawn, update, collide and draw headless; statuses
// ride only on landed hits; caps hold; the legacy 'bolt' path is unchanged.
'use strict';
module.exports = function ({ R, sandbox, check, harness, fs, path, root }) {
  const DT = 1 / 60;
  const has = R(`typeof PROJ !== 'undefined' && typeof PROJ.spawn === 'function' && !!DATA.PROJECTILES`);
  check('PROJ global and DATA.PROJECTILES exist', has);
  if (!has) return;

  // ---- static data checks ----
  const audioSrc = fs.readFileSync(path.join(root, 'js', 'audio.js'), 'utf8');
  const defs = R(`Object.entries(DATA.PROJECTILES).map(([id, d]) => ({ id, behavior: d.behavior, draw: d.draw, color: d.color,
    trail: d.trail, hitFx: d.hitFx, sfx: d.sfx, hasBeh: !!PROJ.BEHAVIORS[d.behavior], hasDraw: !!PROJ.DRAW[d.draw],
    trailOk: d.trail === null || !!VFX.PRESETS[d.trail], hitOk: d.hitFx === null || !!VFX.PRESETS[d.hitFx] }))`);
  check('DATA.PROJECTILES has 14 entries (bolt + 9 families + 4 status variants), got ' + defs.length, defs.length >= 14);
  for (const d of defs) {
    check(`${d.id}: behavior '${d.behavior}' is in PROJ.BEHAVIORS`, d.hasBeh);
    check(`${d.id}: draw '${d.draw}' is in PROJ.DRAW`, d.hasDraw);
    check(`${d.id}: colour ${d.color} is #rrggbb`, /^#[0-9a-f]{6}$/.test(d.color));
    check(`${d.id}: trail ${d.trail} is null or a VFX preset`, d.trailOk);
    check(`${d.id}: hitFx ${d.hitFx} is null or a VFX preset`, d.hitOk);
    check(`${d.id}: sfx ${d.sfx} is null or a case in js/audio.js`, d.sfx === null || audioSrc.includes(`case '${d.sfx}'`));
  }
  const ids = defs.map(d => d.id);
  for (const id of ['bolt', 'needle', 'orb', 'wisp', 'bomb', 'beam', 'mortar', 'chakram', 'ring', 'venom', 'ember', 'coil', 'thunder'])
    check(`family '${id}' is defined`, ids.includes(id));

  R(`globalThis.__pj = {
    boot() {
      GAME.godMode = false; INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false; INPUT.keys = {};
      GAME.startRun(); ROOMS.enterRoom('mudra');
      GAME.enemies = []; GAME.waves = []; GAME.spawnQueue = []; GAME.pillars = []; GAME.hazards = [];
      GAME.eprojectiles = []; GAME.epools = [];
      const P = GAME.player; P.maxhp = 1e6; P.hp = 1e6; P.iframes = 0; P.dashT = 0;
      P.x = GAME.arena.x + GAME.arena.w / 2; P.y = GAME.arena.y + GAME.arena.h / 2;
      CAMERA.snap && CAMERA.snap();
      return P;
    },
    // spawn fam 120 px left of P aimed at P (beam: angle; mortar/bomb: target; ring: 150 px)
    shoot(fam, P, owner) {
      const d = DATA.PROJECTILES[fam];
      const off = fam === 'ring' ? 150 : 120;
      const x = P.x - off, y = P.y, sp = d.speed || 0;
      const extra = {};
      if (fam === 'beam') extra.a = 0;
      if (fam === 'mortar' || fam === 'bomb') { extra.tx = P.x; extra.ty = P.y; }
      if (fam === 'ring') { extra.ox = x; extra.oy = y; }
      return PROJ.spawn(fam, { x, y, vx: sp, vy: 0, dmg: 10, owner: owner || null, extra });
    },
    run(fam, opts) {
      opts = opts || {};
      const P = __pj.boot();
      const owner = opts.owner ? { x: P.x - 120, y: P.y, r: 14, dead: false } : null;
      __pj.shoot(fam, P, owner);
      const h0 = P.hp; let drops = 0, last = P.hp, firstAge = -1, snap = null, threw = null;
      for (let i = 0; i < 360; i++) {
        P.iframes = 0; P.dashT = opts.dash ? 0.1 : 0;
        const p0 = GAME.eprojectiles[0];
        const age = p0 ? p0.age : -1;
        try { PROJ.updateAll(${DT}); PROJ.drawAll(__rec); PROJ.drawGround(__rec); }
        catch (e) { threw = String(e && e.stack || e).split('\\n').slice(0, 2).join(' | '); break; }
        if (P.hp < last) { drops++; if (firstAge < 0) { firstAge = age; snap = JSON.parse(JSON.stringify({ st: P.st })); } }
        last = P.hp;
        if (!GAME.eprojectiles.length && !GAME.epools.length) break;
      }
      return { drops, dmg: h0 - P.hp, firstAge, snap, threw, st: JSON.parse(JSON.stringify(P.st)) };
    },
  };`);
  const rec = harness.recordingCtx();
  sandbox.__rec = rec.ctx;

  // ---- legacy bolt ----
  const b = R(`(() => { __pj.boot(); const p = enemyShot(100, 200, 50, 0, 10, '#d8b35c');
    const d = DATA.PROJECTILES.bolt;
    return { fam: p && p.fam, r: p && p.r, t: p && p.t, color: p && p.color, dmg: p && p.dmg, vx: p && p.vx,
      inList: GAME.eprojectiles.indexOf(p) >= 0, trail: d.trail, hitFx: d.hitFx, sfx: d.sfx, status: p && p.status }; })()`);
  check('enemyShot returns a bolt (fam bolt, r 6, t 4, colour #d8b35c, dmg 10)',
    b.fam === 'bolt' && b.r === 6 && b.t === 4 && b.color === '#d8b35c' && b.dmg === 10 && b.vx === 50 && b.inList);
  check('bolt has trail null, hitFx null, sfx null, no status (bit-identical legacy path)',
    b.trail === null && b.hitFx === null && b.sfx === null && b.status === null);

  // ---- every family: no throw, damages, status variant lands ----
  const fams = ids;
  const results = {};
  for (const fam of fams) {
    rec.ops.length = 0;
    const res = R(`__pj.run(${JSON.stringify(fam)})`);
    results[fam] = res;
    check(`${fam}: 6 s of update + drawAll + drawGround does not throw` + (res.threw ? ' — ' + res.threw : ''), !res.threw);
    check(`${fam}: lowers player hp at least once (dmg ${res.dmg})`, res.dmg > 0);
    check(`${fam}: draws something`, rec.ops.some(o => /^(fill|stroke|fillRect|strokeRect|fillText)$/.test(o.op)));
  }
  const S = (fam) => (results[fam] && results[fam].snap && results[fam].snap.st) || {};
  check('venom poisons on hit', (S('venom').poison || []).length > 0);
  check('ember burns on hit', (S('ember').burns || []).length > 0);
  check('coil roots on hit', S('coil').rootT > 0);
  check('thunder stuns on hit', S('thunder').stunT > 0);
  check('wisp slows on hit', S('wisp').slowT > 0);
  check('orb knocks back on hit', !!(S('orb').kx || S('orb').ky));
  check('ring knocks back on hit', !!(S('ring').kx || S('ring').ky));

  // ---- dash avoids damage and status for every family ----
  for (const fam of fams) {
    const res = R(`__pj.run(${JSON.stringify(fam)}, { dash: true })`);
    const st = res.st || {};
    const anyStatus = st.stunT > 0 || st.rootT > 0 || st.slowT > 0 || (st.burns || []).length || (st.poison || []).length || st.kx || st.ky;
    check(`${fam}: a dashing player takes no damage and no status`, res.dmg === 0 && !anyStatus && !res.threw);
  }

  // ---- dur_dash destroys only destroyable families ----
  const dd = R(`(() => {
    const P = __pj.boot(); P.boonRanks.dur_dash = 0; P.dashT = 0.1; P.dashDir = 0; P.iframes = 1;
    const mk = (fam, extra) => PROJ.spawn(fam, { x: P.x + 10, y: P.y, vx: 0, vy: 0, dmg: 5, extra: Object.assign({ tx: P.x + 10, ty: P.y, a: 0, ox: P.x + 10, oy: P.y }, extra || {}) });
    const ps = { orb: mk('orb'), beam: mk('beam'), mortar: mk('mortar'), ring: mk('ring'), needle: mk('needle'), bolt: enemyShot(P.x + 10, P.y, 0, 0, 5, '#ffffff') };
    P.update(${DT});
    const out = {}; for (const k in ps) out[k] = ps[k].t;
    out.destroyableFn = typeof PROJ.destroyable === 'function';
    return out;
  })()`);
  check('dur_dash: orb survives', dd.orb > 0);
  check('dur_dash: beam survives', dd.beam > 0);
  check('dur_dash: mortar survives', dd.mortar > 0);
  check('dur_dash: ring survives', dd.ring > 0);
  check('dur_dash: needle is destroyed', dd.needle <= 0);
  check('dur_dash: legacy bolt is destroyed (as before)', dd.bolt <= 0);

  // ---- behaviour specifics ----
  const bomb = R(`(() => {
    const P = __pj.boot(); P.y = GAME.arena.y + 40;               // far from the bomb's path
    const bx = GAME.arena.x + GAME.arena.w / 2, by = GAME.arena.y + GAME.arena.h - 60;
    const p = PROJ.spawn('bomb', { x: bx, y: by, vx: 0, vy: -220, dmg: 10, extra: { tx: bx, ty: by - 100 } });
    let fused = false, needles = 0, stoppedAt = -1;
    for (let i = 0; i < 240; i++) {
      P.iframes = 1;
      PROJ.updateAll(${DT});
      if (p.t > 0 && p.vx === 0 && p.vy === 0 && stoppedAt < 0) stoppedAt = p.age;
      if (p.fuseT != null && p.t > 0) fused = true;
      if (p.t <= 0) { needles = GAME.eprojectiles.filter(q => q.fam === 'needle').length; break; }
    }
    return { fused, needles, stoppedAt, needleDmg: (GAME.eprojectiles[0] || {}).dmg };
  })()`);
  check('bomb: stops and fuses before exploding (stopped at ' + bomb.stoppedAt + ')', bomb.fused && bomb.stoppedAt > 0);
  check('bomb: splits into 6 needles (' + bomb.needles + ')', bomb.needles === 6);
  check('bomb: split needles deal dmg * splitDmg (6)', Math.abs(bomb.needleDmg - 6) < 1e-9);

  const beam = R(`(() => {
    const P = __pj.boot();
    const p = PROJ.spawn('beam', { x: P.x - 120, y: P.y, dmg: 10, extra: { a: 0 } });
    const tell = DATA.PROJECTILES.beam.tell; let tellDmg = false, drops = 0, last = P.hp;
    for (let i = 0; i < 120; i++) {
      P.iframes = 0; const age = p.age;
      PROJ.updateAll(${DT});
      if (P.hp < last) { drops++; if (age < tell - 1e-9) tellDmg = true; }
      last = P.hp;
    }
    return { tellDmg, drops };
  })()`);
  check('beam: no damage during its tell', !beam.tellDmg);
  check('beam: damages exactly once during its active window (' + beam.drops + ')', beam.drops === 1);

  const mortar = R(`(() => {
    const P = __pj.boot();
    const p = PROJ.spawn('mortar', { x: P.x - 200, y: P.y, dmg: 10, extra: { tx: P.x, ty: P.y } });
    const flight = DATA.PROJECTILES.mortar.flight; let early = false, drops = 0, last = P.hp;
    for (let i = 0; i < 120; i++) {
      P.iframes = 0; const age = p.age;
      PROJ.updateAll(${DT});
      if (P.hp < last) { drops++; if (age + ${DT} < flight - 1e-6) early = true; }
      last = P.hp;
    }
    return { early, drops };
  })()`);
  check('mortar: no damage before landing', !mortar.early);
  check('mortar: damages once at landing (' + mortar.drops + ')', mortar.drops === 1);

  const pool = R(`(() => {
    const P = __pj.boot();
    PROJ.spawn('mortar', { x: P.x - 200, y: P.y, dmg: 1, extra: { tx: P.x, ty: P.y, pool: { status: { type: 'poison', dps: 2, dur: 2 }, r: 50, dur: 3 } } });
    for (let i = 0; i < 61; i++) { P.iframes = 1; PROJ.updateAll(${DT}); }
    const pools = GAME.epools.length, early = P.st.poison.length;
    for (let i = 0; i < 40; i++) { P.iframes = 1; PROJ.updateAll(${DT}); }
    const later = P.st.poison.length;
    return { pools, early, later };
  })()`);
  check('mortar pool: landing leaves a ground pool', pool.pools === 1);
  check('mortar pool: 0.5 s grace before it applies', pool.early === 0);
  check('mortar pool: standing in it applies its status', pool.later > 0);

  const ch = R(`(() => {
    const P = __pj.boot();
    const owner = { x: P.x - 120, y: P.y, r: 14, dead: false };
    const p = PROJ.spawn('chakram', { x: owner.x, y: owner.y, vx: 420, vy: 0, dmg: 10, owner });
    const out = DATA.PROJECTILES.chakram.out; let drops = 0, last = P.hp, returning = false, dead = -1;
    for (let i = 0; i < 240; i++) {
      P.iframes = 0;
      PROJ.updateAll(${DT});
      if (p.age > out + 0.05 && p.t > 0 && p.vx < 0) returning = true;
      if (P.hp < last) drops++;
      last = P.hp;
      if (p.t <= 0) { dead = p.age; break; }
    }
    return { drops, returning, dead, nearOwner: U.dist(p.x, p.y, owner.x, owner.y) };
  })()`);
  check('chakram: returns toward its owner after `out` seconds', ch.returning);
  check('chakram: hits once per leg (2 hits on out + back), got ' + ch.drops, ch.drops === 2);
  check('chakram: dies when it reaches its owner (' + ch.nearOwner.toFixed(1) + ' px)', ch.dead > 0 && ch.nearOwner < 30);

  const ringGap = R(`(() => {
    const P = __pj.boot();
    PROJ.spawn('ring', { x: P.x - 150, y: P.y, dmg: 10, extra: { ox: P.x - 150, oy: P.y, gapA: 0, gapArc: 1.0 } });
    let drops = 0, last = P.hp, tellDmg = false;
    for (let i = 0; i < 180; i++) { P.iframes = 0; const p = GAME.eprojectiles[0]; const age = p ? p.age : 9;
      PROJ.updateAll(${DT}); if (P.hp < last) { drops++; if (age < DATA.PROJECTILES.ring.prePulse) tellDmg = true; } last = P.hp; }
    return { drops, tellDmg };
  })()`);
  check('ring: a player inside the gap arc is not hit', ringGap.drops === 0);
  check('ring: hits exactly once without a gap', results.ring && results.ring.drops === 1);

  // ---- caps ----
  const cap = R(`(() => {
    const P = __pj.boot(); P.y = GAME.arena.y + 40;
    for (let i = 0; i < 400; i++) PROJ.spawn('needle', { x: P.x + 300, y: P.y + 300, vx: 1, vy: 0, dmg: 1 });
    const n = GAME.eprojectiles.length;
    GAME.eprojectiles = [];
    const owner = { x: P.x + 300, y: P.y + 300, r: 14, dead: false };
    for (let i = 0; i < 10; i++) PROJ.spawn('wisp', { x: owner.x, y: owner.y, vx: 0, vy: 170, dmg: 1, owner });
    const other = { x: P.x + 300, y: P.y + 300, r: 14, dead: false };
    PROJ.spawn('wisp', { x: other.x, y: other.y, vx: 0, vy: 170, dmg: 1, owner: other });
    return { n, cap: PROJ.CAP, wisps: GAME.eprojectiles.filter(p => p.owner === owner).length, other: GAME.eprojectiles.filter(p => p.owner === other).length };
  })()`);
  check('400 needles leave eprojectiles <= PROJ.CAP (' + cap.n + ' <= ' + cap.cap + ')', cap.cap === 260 && cap.n <= cap.cap);
  check('10 wisps from one owner leave <= 6 alive (' + cap.wisps + ')', cap.wisps <= 6 && cap.wisps > 0);
  check('the wisp cap is per owner (another owner can still fire)', cap.other === 1);

  // ---- pattern planner ----
  const pp = R(`(() => {
    const P = __pj.boot();
    const src = { x: P.x - 200, y: P.y - 100, r: 20 };
    const base = U.angle(src.x, src.y, P.x, P.y);
    const a = PROJ.planPattern(src, { fam: 'needle', count: 3, spread: 0.6, aim: 'player' }, P);
    const ang = a.shots.map(s => Math.atan2(s.vy, s.vx));
    const rad = PROJ.planPattern(src, { fam: 'bolt', aim: 'radial', count: 8 }, P);
    const rang = rad.shots.map(s => Math.atan2(s.vy, s.vx));
    let even = rang.length === 8;
    for (let i = 1; i < rang.length; i++) even = even && Math.abs(Math.abs(U.angDiff(rang[i - 1], rang[i])) - U.TAU / 8) < 1e-6;
    U.seed(11); const m1 = JSON.stringify(PROJ.planPattern(src, { fam: 'mortar', aim: 'around', count: 3, radius: 120 }, P));
    U.seed(11); const m2 = JSON.stringify(PROJ.planPattern(src, { fam: 'mortar', aim: 'around', count: 3, radius: 120 }, P));
    U.unseed();
    const m = JSON.parse(m1);
    const ln = PROJ.planPattern(src, { aim: 'line' }, P);
    const self = PROJ.planPattern(src, { fam: 'ring', aim: 'self', gapArc: 0.8 }, P);
    const dm = PROJ.planPattern(src, { fam: 'needle', count: 1, dmgMul: 1.5, status: { type: 'slow', f: 0.5, dur: 1 } }, P);
    return {
      n: a.shots.length, lines: a.marks.filter(k => k.type === 'line').length,
      sym: Math.abs(U.angDiff(base, ang[0]) + U.angDiff(base, ang[2])) < 1e-9 && Math.abs(U.angDiff(base, ang[1])) < 1e-9 && Math.abs(U.angDiff(ang[0], ang[2])) > 0.5,
      speedOk: a.shots.every(s => Math.abs(Math.hypot(s.vx, s.vy) - DATA.PROJECTILES.needle.speed) < 1e-6),
      even, rmarks: rad.marks.length, rmarkType: rad.marks[0] && rad.marks[0].type,
      mShots: m.shots.length, mTargets: m.shots.every(s => s.extra && isFinite(s.extra.tx) && isFinite(s.extra.ty)),
      mFirst: m.shots[0] && m.shots[0].extra.tx === P.x && m.shots[0].extra.ty === P.y,
      mCircles: m.marks.filter(k => k.type === 'circle').length, same: m1 === m2,
      lineFam: ln.shots[0] && ln.shots[0].fam, lineA: ln.shots[0] && Math.abs(ln.shots[0].extra.a - base) < 1e-9, lineMark: ln.marks[0] && ln.marks[0].type,
      selfOk: self.shots[0] && self.shots[0].extra.ox === src.x && self.shots[0].extra.gapArc === 0.8 && self.marks[0].type === 'ringMark',
      dmgMul: dm.shots[0].dmgMul, status: dm.shots[0].status && dm.shots[0].status.type,
    };
  })()`);
  check('planPattern needle x3 spread 0.6: 3 shots', pp.n === 3);
  check('planPattern needle x3: angles symmetric around the aim', pp.sym);
  check('planPattern needle x3: shots at the family speed', pp.speedOk);
  check('planPattern needle x3: 3 line marks', pp.lines === 3);
  check('planPattern radial x8: 8 evenly spaced shots', pp.even);
  check('planPattern radial: one ringMark', pp.rmarks === 1 && pp.rmarkType === 'ringMark');
  check('planPattern mortar around x3: 3 shots carrying tx/ty', pp.mShots === 3 && pp.mTargets);
  check('planPattern mortar around: the first target is the player', pp.mFirst);
  check('planPattern mortar around: 3 circle marks', pp.mCircles === 3);
  check('planPattern: identical output after re-seeding U', pp.same);
  check('planPattern line: a beam along the aim with a line mark', pp.lineFam === 'beam' && pp.lineA && pp.lineMark === 'line');
  check('planPattern self: a ring at the source with its gap arc and a ringMark', pp.selfOk);
  check('planPattern: dmgMul and status overrides ride on the shot', pp.dmgMul === 1.5 && pp.status === 'slow');

  // ---- wiring ----
  const gsrc = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8');
  check('game.js update uses PROJ.updateAll(dt)', gsrc.includes('PROJ.updateAll(dt)'));
  check('game.js no longer has the inline eprojectile loop', !gsrc.includes('for (const p of this.eprojectiles)'));
  const wired = R(`(() => { const P = __pj.boot(); GAME.state = 'combat';
    PROJ.spawn('needle', { x: P.x - 60, y: P.y, vx: 560, vy: 0, dmg: 7 }); const h = P.hp;
    for (let i = 0; i < 20; i++) { GAME.hitstop = 0; GAME.update(${DT}); }
    return h - P.hp; })()`);
  check('GAME.update drives enemy projectiles (needle hits for 7)', wired === 7);

  R(`GAME.godMode = false; SETTINGS.reset(); GAME.eprojectiles = []; GAME.epools = [];`);
};
