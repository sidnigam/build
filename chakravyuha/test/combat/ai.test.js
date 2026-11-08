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

  // ================= Part 2: the retrofitted Enemy AI =================
  const esrc = fs.readFileSync(path.join(root, 'js', 'entities.js'), 'utf8');

  // ---- static scan: damage only through hurtPlayer()/fire() inside class Enemy ----
  function stripMethodBody(text, name) {
    const idx = text.indexOf(name + '(');
    if (idx === -1) return text;
    const braceStart = text.indexOf('{', idx);
    let depth = 0, i = braceStart;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return text.slice(0, idx) + text.slice(i);
  }
  {
    const s = esrc.indexOf('class Enemy');
    const e = esrc.indexOf('// ---------------- BOSS telegraph invariant', s);
    const body = s >= 0 && e > s ? esrc.slice(s, e) : '';
    const hasHelpers = /\n  hurtPlayer\(/.test(body) && /\n  fire\(/.test(body);
    let stripped = stripMethodBody(body, 'hurtPlayer');
    stripped = stripMethodBody(stripped, 'fire');
    check('class Enemy defines hurtPlayer() and fire() helpers', hasHelpers);
    check('class Enemy: takeDamage( only appears inside hurtPlayer()', body.length > 0 && !/takeDamage\(/.test(stripped));
    check('class Enemy: enemyShot( only appears inside fire()', body.length > 0 && !/enemyShot\(/.test(stripped));
    const steers = (esrc.match(/ENEMY_AI\.steer\(this, dt\)/g) || []).length;
    check(`Enemy AI cases move via ENEMY_AI.steer(this, dt) (${steers} >= 6)`, steers >= 6);
    check('no hard-coded 0.6 s enemy spawn grace remains (entities.js / game.js)',
      !/this\.spawnT = 0\.6/.test(esrc) && !/spawnT \/ 0\.6/.test(esrc) &&
      !/spawnT \/ 0\.6/.test(fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8')));
    check('both spawn-mandala draws use DATA.WAVES.spawnGrace',
      /this\.spawnT \/ DATA\.WAVES\.spawnGrace/.test(esrc) &&
      /e\.spawnT \/ DATA\.WAVES\.spawnGrace/.test(fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8')));
  }

  // ---- data: roles, families, spawn tunables ----
  const dt = R(`(() => {
    const want = { preta: 'melee', rakshasa: 'melee', archer: 'ranged', naga: 'ranged', vetala: 'melee',
      bhuta: 'heavy', daitya: 'heavy', yatudhana: 'support' };
    const roles = Object.keys(want).every(k => DATA.ENEMIES[k] && DATA.ENEMIES[k].role === want[k]);
    return { roles, fams: DATA.ENEMIES.archer.fam === 'needle' && DATA.ENEMIES.naga.fam === 'venom',
      grace: DATA.WAVES.spawnGrace === 0.45, delay: JSON.stringify(DATA.WAVES.engageDelay) === '[0.2,0.8]',
      spritesDur: SPRITES.CFG.SPAWN_DUR === DATA.WAVES.spawnGrace };
  })()`);
  check('DATA.ENEMIES roles: preta/rakshasa/vetala melee, archer/naga ranged, bhuta/daitya heavy, yatudhana support', dt.roles);
  check("DATA.ENEMIES: archer fam 'needle', naga fam 'venom'", dt.fams);
  check('DATA.WAVES.spawnGrace 0.45 and engageDelay [0.2, 0.8]', dt.grace && dt.delay);
  check('SPRITES.CFG.SPAWN_DUR mirrors DATA.WAVES.spawnGrace (sprite-path fade matches the grace)', dt.spritesDur);

  const sp = R(`(() => {
    if (!DATA.WAVES.engageDelay) return { grace: false, t: false };
    const P = __ai.boot(0); let grace = true, t = true;
    for (let i = 0; i < 200; i++) {
      const e = new Enemy(U.choice(Object.keys(DATA.ENEMIES)), P.x + 300, P.y, 1);
      if (e.spawnT !== DATA.WAVES.spawnGrace) grace = false;
      if (e.t < DATA.WAVES.engageDelay[0] || e.t > DATA.WAVES.engageDelay[1]) t = false;
    }
    return { grace, t };
  })()`);
  check('new enemies: spawnT === DATA.WAVES.spawnGrace', sp.grace);
  check('new enemies: initial t lies in DATA.WAVES.engageDelay', sp.t);

  // helper for the AI sims
  R(`__ai.spawn = function (type, dx, dy) {
    const P = GAME.player; const e = new Enemy(type, P.x + dx, P.y + dy, 1);
    e.spawnT = 0; GAME.enemies.push(e); return e;
  };
  __ai.hold = function (P, x, y) { P.x = x; P.y = y; P.kx = 0; P.ky = 0; if (P.st) { P.st.kx = 0; P.st.ky = 0; } };`);

  // ---- projectile families ----
  const fam = R(`(() => {
    const P = __ai.boot(0); U.seed(11); ENEMY_TG.clear();
    const hx = P.x, hy = P.y;
    const a = __ai.spawn('archer', 300, 0); a.t = 0;
    let shots = [];
    for (let f = 0; f < 180 && !shots.length; f++) { __ai.hold(P, hx, hy); GAME.update(${DT}); shots = GAME.eprojectiles.slice(); }
    const needle = shots.length === 1 && shots[0].fam === 'needle' &&
      Math.abs(Math.hypot(shots[0].vx, shots[0].vy) - DATA.ENEMIES.archer.projSpeed) < 1e-6;
    __ai.boot(1); U.seed(12); ENEMY_TG.clear();
    const P2 = GAME.player, nx = P2.x, ny = P2.y;
    const n = __ai.spawn('naga', 300, 0); n.t = 0;
    shots = [];
    for (let f = 0; f < 180 && !shots.length; f++) { __ai.hold(P2, nx, ny); GAME.update(${DT}); shots = GAME.eprojectiles.slice(); }
    let venom = shots.length === 3 && shots.every(s => s.fam === 'venom');
    if (venom) {
      const off = shots.map(s => U.angDiff(n.aimA, Math.atan2(s.vy, s.vx))).sort((x, y) => x - y);
      venom = Math.abs(off[0] + 0.3) < 1e-6 && Math.abs(off[1]) < 1e-6 && Math.abs(off[2] - 0.3) < 1e-6;
    }
    // bhuta death ring stays bolt
    __ai.boot(2); GAME.eprojectiles = [];
    const b = __ai.spawn('bhuta', 200, 0);
    killEnemy(b);
    const ring = GAME.eprojectiles.length === 8 && GAME.eprojectiles.every(p => p.fam === 'bolt');
    return { needle, venom, ring, f0: shots.length };
  })()`);
  check('archers fire a needle at def.projSpeed', fam.needle);
  check('nagas spit 3 venom projectiles at ±0.3 rad', fam.venom);
  check('the bhuta death ring stays bolt (8 shots)', fam.ring);

  // ---- telegraph before every shot (aim state) ----
  const aim = R(`(() => {
    const P = __ai.boot(0); U.seed(13); ENEMY_TG.clear();
    const hx = P.x, hy = P.y;
    const a = __ai.spawn('archer', 300, 0); a.t = 0;
    let sawAim = false, sawLine = false, firedAt = -1;
    for (let f = 0; f < 180; f++) {
      __ai.hold(P, hx, hy); GAME.update(${DT});
      if (a.state === 'aim') { sawAim = true; if (a.telegraph && a.telegraph.type === 'line') sawLine = true; }
      if (firedAt < 0 && GAME.eprojectiles.length) firedAt = f;
    }
    const w = ENEMY_TG.windLog.find(x => x.type === 'archer');
    return { sawAim, sawLine, firedAt, wind: w ? w.wind : 0, viol: ENEMY_TG.violations.slice() };
  })()`);
  check(`archer winds up (aim state + line telegraph) before firing (wind ${aim.wind.toFixed(3)} s >= 0.30)`,
    aim.sawAim && aim.sawLine && aim.firedAt > 0 && aim.wind >= 0.30 - 1e-6 && aim.viol.length === 0);

  // ---- contact bite ----
  const bite = R(`(() => {
    const P = __ai.boot(0); U.seed(14); ENEMY_TG.clear();
    const hx = P.x, hy = P.y;
    P.iframes = 0;
    const e = __ai.spawn('preta', 22, 0); e.atkT = 0;
    const hp0 = P.hp;
    let sawBite = false, circleOk = false, hitFrame = -1, biteFrame = -1;
    for (let f = 0; f < 60; f++) {
      __ai.hold(P, hx, hy); P.iframes = 0;
      GAME.update(${DT});
      if (e.state === 'bite') {
        sawBite = true; if (biteFrame < 0) biteFrame = f;
        if (e.telegraph && e.telegraph.type === 'circle' && e.telegraph.r === e.r + 8) circleOk = true;
      }
      if (hitFrame < 0 && P.hp < hp0) hitFrame = f;
    }
    const w = ENEMY_TG.windLog.find(x => x.kind === 'bite');
    // 6 pretas in contact: at most pool('bite') in the bite state at once
    __ai.boot(0); U.seed(15); ENEMY_TG.clear();
    const P2 = GAME.player, x2 = P2.x, y2 = P2.y;
    const ps = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * U.TAU; const q = __ai.spawn('preta', Math.cos(a) * 24, Math.sin(a) * 24); q.atkT = 0; ps.push(q); }
    let maxBite = 0;
    for (let f = 0; f < 300; f++) {
      __ai.hold(P2, x2, y2); P2.iframes = 0; GAME.update(${DT});
      maxBite = Math.max(maxBite, ps.filter(q => q.state === 'bite').length);
    }
    return { sawBite, circleOk, hitFrame, biteFrame, wind: w ? w.wind : 0, maxBite, pool: ENEMY_AI.pool('bite'),
      viol: ENEMY_TG.violations.slice() };
  })()`);
  check('chase contact goes through a bite state with a circle telegraph r + 8', bite.sawBite && bite.circleOk);
  check(`the bite lands only after its >= 0.2 s tell (bite frame ${bite.biteFrame}, hit frame ${bite.hitFrame}, wind ${bite.wind.toFixed(3)})`,
    bite.hitFrame > bite.biteFrame && bite.wind >= 0.2 - 1e-6);
  check(`bites need a bite token: max ${bite.maxBite} biting at once (pool ${bite.pool})`, bite.maxBite > 0 && bite.maxBite <= bite.pool);
  check('bite sims log no ENEMY_TG violations' + (bite.viol.length ? ' — ' + bite.viol.slice(0, 5).join(', ') : ''), bite.viol.length === 0);

  // ---- tokens under load: 10 rakshasas ----
  const load = R(`(() => {
    const P = __ai.boot(0); U.seed(16); ENEMY_TG.clear();
    const hx = P.x, hy = P.y;
    const rs = [];
    for (let i = 0; i < 10; i++) { const a = i / 10 * U.TAU; rs.push(__ai.spawn('rakshasa', Math.cos(a) * 200, Math.sin(a) * 200)); }
    let maxAtk = 0, lunges = 0;
    const pool = ENEMY_AI.pool('melee');
    for (let f = 0; f < 20 * 60; f++) {
      __ai.hold(P, hx, hy); GAME.update(${DT});
      const n = rs.filter(e => e.state === 'wind' || e.state === 'lunge').length;
      maxAtk = Math.max(maxAtk, n);
      lunges += rs.filter(e => e.state === 'lunge').length ? 1 : 0;
    }
    return { maxAtk, pool, lunges, viol: ENEMY_TG.violations.slice() };
  })()`);
  check(`tokens under load: 10 rakshasas, at most ${load.maxAtk} winding/lunging at once (pool ${load.pool}), and they do attack`,
    load.maxAtk <= load.pool && load.lunges > 0);
  check('token load sim logs no ENEMY_TG violations', load.viol.length === 0);

  // ---- ranged band ----
  const band = R(`(() => {
    const P = __ai.boot(0); U.seed(17); ENEMY_TG.clear();
    const A = GAME.arena; const hx = A.x + A.w / 2, hy = A.y + A.h / 2;
    __ai.hold(P, hx, hy);
    const as = [0, 2.4, -2.4].map(a => __ai.spawn('archer', Math.cos(a) * 500, Math.sin(a) * 500));
    const B = ENEMY_AI.CFG.RANGED_BAND;
    let inB = 0, n = 0;
    for (let f = 0; f < 8 * 60; f++) {
      __ai.hold(P, hx, hy); GAME.update(${DT});
      if (f >= 3 * 60) for (const a of as) { const d = U.dist(a.x, a.y, hx, hy); n++; if (d >= B[0] - 40 && d <= B[1] + 60) inB++; }
    }
    const fires = ENEMY_TG.fireLog.filter(x => x.type === 'archer');
    return { frac: inB / n, fires: fires.length, allIn: fires.every(x => x.inView) };
  })()`);
  check(`ranged band: 3 archers spend ${(band.frac * 100).toFixed(1)}% of frames in [band0 - 40, band1 + 60] (>= 80%)`, band.frac >= 0.8);
  check(`ranged band: archers fire (${band.fires}) only from inside the view band`, band.fires > 0 && band.allIn);

  // ---- stun freezes a wind-up; death releases the token ----
  const sf = R(`(() => {
    const P = __ai.boot(0); U.seed(18); ENEMY_TG.clear();
    const hx = P.x, hy = P.y;
    const e = __ai.spawn('rakshasa', 90, 0); e.t = 0;
    let f = 0;
    while (e.state !== 'wind' && f++ < 120) { __ai.hold(P, hx, hy); GAME.update(${DT}); }
    const inWind = e.state === 'wind';
    const w0 = e.windT; e.stun = 0.5;
    for (let i = 0; i < 20; i++) { __ai.hold(P, hx, hy); GAME.update(${DT}); }
    const frozen = e.state === 'wind' && Math.abs(e.windT - w0) < 1e-12;
    const held = e.tokenCat === 'melee';
    killEnemy(e);
    return { inWind, frozen, held, released: ENEMY_AI.holding('melee') === 0 && e.tokenCat === null };
  })()`);
  check('a stun mid-wind freezes the wind timer (state and windT unchanged)', sf.inWind && sf.frozen);
  check('killEnemy releases the attack token', sf.held && sf.released);

  // ---- 60 s room sims per biome: the invariant ----
  for (let b = 0; b < 4; b++) {
    const r = R(`(() => {
      GAME.godMode = false; INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false; INPUT.keys = {};
      U.seed(${100 + b}); ENEMY_TG.clear();
      GAME.startRun(); ROOMS.enterBiome(${b}); GAME.roomIdx = 1; ROOMS.enterRoom('mudra');
      const P = GAME.player; P.maxhp = 1e9; P.hp = 1e9;
      // the biome's full roster is present from the start (one of each, 300-500 px out)
      for (const id of DATA.BIOMES[${b}].enemies) {
        const a = U.rand(U.TAU), d = U.rand(300, 500);
        const e = new Enemy(id, P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, GAME.biome.scale);
        clampToArena(e); GAME.enemies.push(e);
      }
      const types = new Set(); let maxAlive = 0;
      for (let f = 0; f < 60 * 60; f++) {
        // every 3 s one living enemy falls so the room's waves keep cycling
        if (f % 180 === 179) { const live = GAME.enemies.filter(e => !e.dead && !e.boss); if (live.length > 4) killEnemy(U.choice(live)); }
        // the player alternates a 0.8 s run (rotating heading) with a 1.6 s stand, so slots,
        // escape cuts, bands and every attack get exercised
        const t = f / 60, ph = t % 2.4;
        INPUT.ax = ph < 0.8 ? Math.cos(t * 0.9) : 0; INPUT.ay = ph < 0.8 ? Math.sin(t * 0.9) : 0;
        if (P.hp < 1e8) P.hp = 1e9;
        GAME.update(${DT});
        for (const e of GAME.enemies) if (!e.dead) types.add(e.type);
        maxAlive = Math.max(maxAlive, GAME.enemies.filter(e => !e.dead).length);
      }
      INPUT.ax = 0; INPUT.ay = 0;
      const short = ENEMY_TG.windLog.filter(w => !(w.wind >= (ENEMY_TG.MIN[w.kind] || 0) - 1e-6));
      const kinds = [...new Set(ENEMY_TG.windLog.map(w => w.kind))];
      const ranged = ENEMY_TG.fireLog.filter(x => x.type === 'archer' || x.type === 'naga');
      return { viol: ENEMY_TG.violations.slice(0, 8), nViol: ENEMY_TG.violations.length, short: short.length,
        logs: ENEMY_TG.windLog.length, kinds, types: [...types], maxAlive,
        rangedFires: ranged.length, rangedIn: ranged.every(x => x.inView), state: GAME.state };
    })()`);
    check(`biome ${b} 60 s sim: zero ENEMY_TG violations (${r.logs} armed attacks, kinds ${r.kinds.join('/')}, roster ${r.types.join('/')})`
      + (r.nViol ? ' — ' + r.viol.join(', ') : ''), r.nViol === 0 && r.logs > 0);
    check(`biome ${b} 60 s sim: every windLog entry meets ENEMY_TG.MIN (${r.short} short)`, r.short === 0);
    check(`biome ${b} 60 s sim: archer/naga shots (${r.rangedFires}) all fired from inside the view band`, r.rangedIn);
  }

  R(`INPUT.ax = 0; INPUT.ay = 0; U.unseed()`);
};
