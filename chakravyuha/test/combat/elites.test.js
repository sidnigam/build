// 05.7.1-05 (D-07, COMBAT-05): elite modifiers and a working elite budget.
// Elites are any biome type bought at cost × DATA.WAVES.eliteMult and carry 1-2 visible
// DATA.ELITE_MODS. Each modifier's effect, the composeWave distribution and the shared overlay.
'use strict';
module.exports = function ({ R, sandbox, check, harness }) {
  const DT = 1 / 60;
  R(`globalThis.__el = {
    boot(biome) {
      GAME.godMode = false;
      INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false; INPUT.keys = {};
      GAME.startRun();
      if (biome) { GAME.biomeIdx = biome; GAME.biome = DATA.BIOMES[biome]; }
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
      const P = GAME.player; const e = new Enemy(type, P.x + dx, P.y + dy, 1, mods);
      e.spawnT = 0; GAME.enemies.push(e); return e;
    },
    hold(P, x, y) { P.x = x; P.y = y; P.kx = 0; P.ky = 0; if (P.st) { P.st.kx = 0; P.st.ky = 0; } },
  };`);

  const has = R(`typeof DATA.ELITE_MODS === 'object' && !!DATA.WAVES.elite && typeof ROOMS.rollEliteMods === 'function'`);
  check('DATA.ELITE_MODS, DATA.WAVES.elite and ROOMS.rollEliteMods exist', has);
  if (!has) return;

  // ---- data ----
  const data = R(`(() => {
    const keys = Object.keys(DATA.ELITE_MODS);
    const want = ['armored', 'hasty', 'vampiric', 'splitting', 'shielded', 'explosive', 'warded', 'rallying'];
    return { keys, all: want.every(k => keys.includes(k)) && keys.length === 8,
      colours: keys.every(k => /^#[0-9a-f]{6}$/.test(DATA.ELITE_MODS[k].color)),
      names: keys.every(k => typeof DATA.ELITE_MODS[k].name === 'string' && DATA.ELITE_MODS[k].name.length > 2),
      mult: DATA.WAVES.eliteMult, mods: DATA.WAVES.eliteMods };
  })()`);
  check(`DATA.ELITE_MODS has the 8 modifiers (${data.keys.join(', ')})`, data.all);
  check('every DATA.ELITE_MODS colour matches ^#[0-9a-f]{6}$', data.colours);
  check('every DATA.ELITE_MODS entry has a display name', data.names);
  check(`DATA.WAVES.eliteMult (${data.mult}) > 1 and eliteMods = [1, 1, 2, 2]`,
    data.mult > 1 && JSON.stringify(data.mods) === JSON.stringify([1, 1, 2, 2]));

  // ---- composeWave distribution ----
  const dist = R(`(() => {
    const out = {};
    DATA.BIOMES.forEach((b, bi) => {
      const p1 = ROOMS.waveParams(b, 1), pl = ROOMS.waveParams(b, b.rooms);
      let e1 = 0, el = 0, modsOk = true, idsOk = true, distinct = true;
      for (let i = 0; i < 50; i++) {
        for (const [p, isLast] of [[p1, false], [pl, true]]) {
          const units = ROOMS.composeWave(p.perWave, b, p);
          for (const u of units) {
            if (!(u.elite && u.elite.length)) continue;
            if (isLast) el++; else e1++;
            if (u.elite.length !== DATA.WAVES.eliteMods[bi]) modsOk = false;
            if (new Set(u.elite).size !== u.elite.length) distinct = false;
            if (!u.elite.every(m => DATA.ELITE_MODS[m])) modsOk = false;
            if (!b.enemies.includes(u.id) || u.weak) idsOk = false;
          }
        }
      }
      out[b.id] = { room1: e1 / 50, last: el / 50, modsOk, idsOk, distinct };
    });
    return out;
  })()`);
  for (const id of Object.keys(dist)) {
    const d = dist[id];
    check(`${id}: last room mean elites per wave ${d.last.toFixed(2)} >= 1`, d.last >= 1);
    check(`${id}: elites carry ${id === 'naraka' || id === 'patala' ? 1 : 2} distinct valid mod(s), ids from biome.enemies, never weak`,
      d.modsOk && d.idsOk && d.distinct);
  }
  check(`naraka room 1: mean elites per wave ${dist.naraka.room1.toFixed(2)} < 1`, dist.naraka.room1 < 1);

  // ---- ctor ----
  const ct = R(`(() => {
    const d = DATA.ENEMIES.rakshasa, W = DATA.WAVES;
    const e = new Enemy('rakshasa', 0, 0, 1, { elite: ['armored'] });
    const w = new Enemy('preta', 0, 0, 1, W.weak);
    const plain = new Enemy('rakshasa', 0, 0, 1);
    return {
      hp: Math.abs(e.hp - d.hp * W.elite.hp) < 1e-9 && Math.abs(e.maxhp - e.hp) < 1e-9,
      armor: Math.abs(e.armor - DATA.ELITE_MODS.armored.armorFrac * e.maxhp) < 1e-9,
      elite: JSON.stringify(e.elite) === JSON.stringify(['armored']) && !e.weak,
      dmg: Math.abs(e.dmg - d.dmg * W.elite.dmg) < 1e-9,
      r: e.r === Math.round(d.r * W.elite.rMul),
      weak: w.weak === true && Math.abs(w.hp - DATA.ENEMIES.preta.hp * W.weak.hp) < 1e-9 && !w.elite,
      plain: !plain.elite && !plain.weak && plain.cdMul === 1 && plain.dmgMul() === 1,
    };
  })()`);
  check('elite ctor: hp = def.hp × DATA.WAVES.elite.hp, maxhp = hp', ct.hp);
  check('elite ctor: armored → armor = 0.6 × maxhp; elite deep-equals [armored]', ct.armor && ct.elite);
  check('elite ctor: dmg × DATA.WAVES.elite.dmg, r × rMul (rounded)', ct.dmg && ct.r);
  check('weak ctor (DATA.WAVES.weak) unchanged: weak === true, hp × 0.5, no elite', ct.weak);
  check('plain enemy: no elite, cdMul 1, dmgMul() 1', ct.plain);

  // ---- armored ----
  const ar = R(`(() => {
    const P = __el.boot(0);
    const e = __el.spawn('rakshasa', 60, 0, { elite: ['armored'] });
    e.update = function () {};
    const crit = META.critChance; META.critChance = () => 0;
    const bonus = META.bonusDamage; META.bonusDamage = () => 1;
    INPUT.wx = e.x; INPUT.wy = e.y; P.aim = 0;
    const a0 = e.armor, h0 = e.hp;
    const dealt = hitEnemy(e, 10, 'attack');
    const halved = Math.abs((h0 - e.hp) - 5) < 1e-9 && Math.abs((a0 - e.armor) - 10) < 1e-9 && Math.abs(dealt - 5) < 1e-9;
    e.kx = 0; e.ky = 0;
    P.atkCd = 0; P.meleeAttack();
    const noKb = e.kx === 0 && e.ky === 0;
    // break the armor
    e.armor = 1; hitEnemy(e, 10, 'attack');
    const broke = e.armor === 0;
    const h1 = e.hp; hitEnemy(e, 10, 'attack');
    const full = Math.abs((h1 - e.hp) - 10) < 1e-9;
    e.kx = 0; e.ky = 0; P.atkCd = 0; P.comboIdx = 0; P.meleeAttack();
    const kb = Math.hypot(e.kx, e.ky) > 0;
    META.critChance = crit; META.bonusDamage = bonus;
    return { halved, noKb, broke, full, kb, canKnock: typeof canKnock === 'function' };
  })()`);
  check('armored: hits deal 50% to hp and drain armor by the raw amount', ar.halved);
  check('armored: melee knockback is not applied while armor > 0 (canKnock exists)', ar.noKb && ar.canKnock);
  check('armored: after the armor breaks, damage and knockback are normal', ar.broke && ar.full && ar.kb);

  // ---- shielded ----
  const sh = R(`(() => {
    const P = __el.boot(0);
    const e = __el.spawn('rakshasa', 60, 0, { elite: ['shielded'] });
    const crit = META.critChance; META.critChance = () => 0;
    const h0 = e.hp;
    GAME.texts = [];
    const r1 = hitEnemy(e, 10, 'attack'), r2 = hitEnemy(e, 10, 'attack');
    const blocked = r1 === 0 && r2 === 0 && e.hp === h0 && GAME.texts.some(t => t.str === 'BLOCK');
    const r3 = hitEnemy(e, 10, 'attack');
    META.critChance = crit;
    // burn ticks don't consume the shield
    const e2 = __el.spawn('rakshasa', 80, 0, { elite: ['shielded'] });
    const hb = e2.hp; hitEnemy(e2, 4, 'burn');
    return { blocked, third: r3 > 0 && e.hp < h0, burn: e2.hp < hb && e2.shieldHits === 2 };
  })()`);
  check('shielded: the first 2 non-burn hits deal 0 (dmgText BLOCK)', sh.blocked);
  check('shielded: the third hit deals damage', sh.third);
  check('shielded: burn ticks bypass and do not consume the shield', sh.burn);

  // ---- hasty ----
  const ha = R(`(() => {
    const out = {};
    const rand = U.rand;
    for (const [tag, mods] of [['hasty', { elite: ['hasty'] }], ['plain', null]]) {
      const P = __el.boot(0);
      U.rand = (a = 1, b) => b === undefined ? a * 0.5 : (a + b) / 2;
      const hx = P.x, hy = P.y;
      const e = __el.spawn('rakshasa', 90, 0, mods); e.t = 0;
      let wind = -1, cd = -1, prev = e.state;
      for (let f = 0; f < 240 && cd < 0; f++) {
        __el.hold(P, hx, hy); P.hp = 1e9; GAME.update(${DT});
        if (prev === 'lunge' && e.state === 'idle') cd = e.t;
        prev = e.state;
      }
      const w = ENEMY_TG.windLog.find(x => x.type === 'rakshasa');
      U.rand = rand;
      out[tag] = { spd: e.curSpeed() / DATA.ENEMIES.rakshasa.spd, cd, wind: w ? w.wind : -1 };
    }
    return out;
  })()`);
  check(`hasty: move speed × 1.3 (${ha.hasty.spd.toFixed(3)} vs ${ha.plain.spd.toFixed(3)})`,
    Math.abs(ha.hasty.spd - 1.3) < 1e-9 && Math.abs(ha.plain.spd - 1) < 1e-9);
  check(`hasty: post-attack cooldown × 0.75 (${ha.hasty.cd.toFixed(3)} vs ${ha.plain.cd.toFixed(3)})`,
    ha.plain.cd > 0 && Math.abs(ha.hasty.cd / ha.plain.cd - 0.75) < 0.02);
  check(`hasty: wind-up length unchanged (${ha.hasty.wind.toFixed(3)} vs ${ha.plain.wind.toFixed(3)})`,
    ha.plain.wind > 0 && Math.abs(ha.hasty.wind - ha.plain.wind) < 1.5 * DT);

  // ---- vampiric ----
  const va = R(`(() => {
    const P = __el.boot(0);
    const e = __el.spawn('rakshasa', 60, 0, { elite: ['vampiric'] });
    e.hp = e.maxhp * 0.5; const h0 = e.hp;
    e.armedAtk = true; P.iframes = 0; P.dashT = 0;
    const landed = e.hurtPlayer(10);
    e.armedAtk = false;
    const melee = landed && Math.abs((e.hp - h0) - 3) < 1e-6;
    // a projectile hit heals the owner too
    P.iframes = 0;
    const h1 = e.hp;
    e.armedAtk = true; const p = e.fire('needle', 0, 0, 10); e.armedAtk = false;
    p.x = P.x; p.y = P.y;
    PROJ.updateAll(${DT});
    const proj = Math.abs((e.hp - h1) - 3) < 1e-6;
    // death heals allies within 180 px by 25% max hp; not beyond
    const near = __el.spawn('preta', 160, 0), far = __el.spawn('preta', 400, 0);
    near.hp = near.maxhp * 0.5; far.hp = far.maxhp * 0.5;
    killEnemy(e);
    return { melee, proj, near: Math.abs(near.hp - near.maxhp * 0.75) < 1e-6, far: Math.abs(far.hp - far.maxhp * 0.5) < 1e-9,
      viol: ENEMY_TG.violations.length };
  })()`);
  check('vampiric: a landed hit heals it 30% of the damage dealt', va.melee);
  check('vampiric: a landed projectile heals its owner 30% of the damage', va.proj);
  check('vampiric: on death allies within 180 px heal 25% of max hp (not farther ones)', va.near && va.far);

  // ---- splitting ----
  const sp = R(`(() => {
    const P = __el.boot(0);
    const e = __el.spawn('rakshasa', 200, 0, { elite: ['splitting'] });
    killEnemy(e);
    const kids = GAME.enemies.filter(x => x !== e);
    const ok = kids.length === 2 && kids.every(k => k.type === 'rakshasa' && k.weak === true && !k.elite && !k.dead);
    // at the cap: none
    __el.boot(0);
    const e2 = __el.spawn('rakshasa', 200, 0, { elite: ['splitting'] });
    for (let i = 0; i < DATA.WAVES.maxAlive; i++) __el.spawn('preta', 300 + i, 100);
    const n0 = GAME.enemies.length;
    killEnemy(e2);
    const capped = GAME.enemies.length === n0;
    // one below the cap after it dies: exactly one copy
    __el.boot(0);
    const e3 = __el.spawn('rakshasa', 200, 0, { elite: ['splitting'] });
    for (let i = 0; i < DATA.WAVES.maxAlive - 1; i++) __el.spawn('preta', 300 + i, 100);
    const n1 = GAME.enemies.length;
    killEnemy(e3);
    return { ok, capped, one: GAME.enemies.length === n1 + 1 && ROOMS.aliveCount() <= DATA.WAVES.maxAlive };
  })()`);
  check('splitting: on death spawns 2 weak non-elite copies of its type', sp.ok);
  check('splitting: at the alive cap it spawns none; one below the cap only one', sp.capped && sp.one);

  // ---- explosive ----
  const ex = R(`(() => {
    const P = __el.boot(0);
    const hx = P.x, hy = P.y;
    const e = __el.spawn('rakshasa', 30, 0, { elite: ['explosive'] });
    const hp0 = P.hp;
    killEnemy(e);
    const m = GAME.eprojectiles.find(p => p.fam === 'mortar');
    const spawned = !!m && m.flight === DATA.ELITE_MODS.explosive.fuse && m.r === DATA.ELITE_MODS.explosive.r
      && Math.abs(m.tx - e.x) < 1e-9 && Math.abs(m.ty - e.y) < 1e-9;
    let hitAt = -1, early = false;
    for (let f = 0; f < 90; f++) {
      __el.hold(P, hx, hy); P.iframes = 0; GAME.hitstop = 0;
      GAME.update(${DT});
      if (hitAt < 0 && P.hp < hp0) hitAt = (f + 1) * ${DT};
    }
    return { spawned, hitAt };
  })()`);
  check('explosive: on death spawns a mortar at its position (flight 0.6, r 90)', ex.spawned);
  check(`explosive: the player inside is hit only when it resolves (${ex.hitAt.toFixed(3)} s >= 0.6)`, ex.hitAt >= 0.6 - 1e-6);

  // ---- warded ----
  const wa = R(`(() => {
    const P = __el.boot(0);
    const hx = P.x, hy = P.y;
    const e = __el.spawn('rakshasa', 200, 0, { elite: ['warded'] });
    e.wardCycle = 0.5; e.t = 99;
    const h0 = e.hp;
    const shot = { x: e.x - 2, y: e.y, vx: 600, vy: 0, dmg: 20, r: 5, t: 2, pierce: false, src: 'attack', color: '#ffffff', hitSet: new Set() };
    GAME.pprojectiles.push(shot);
    __el.hold(P, hx, hy); GAME.update(${DT});
    const n = GAME.eprojectiles.find(p => p.fam === 'needle' && p.owner === e);
    const reflected = e.wardT > 0 && e.hp === h0 && shot.t <= 0 && !!n && Math.abs(n.dmg - 10) < 1e-9
      && Math.cos(Math.atan2(n.vy, n.vx) - Math.atan2(P.y - e.y, P.x - e.x)) > 0.99;
    // outside the window the shot damages it
    e.wardCycle = 4; GAME.eprojectiles = [];
    const shot2 = Object.assign({}, shot, { x: e.x - 2, y: e.y, t: 2, hitSet: new Set() });
    GAME.pprojectiles.push(shot2);
    __el.hold(P, hx, hy); GAME.update(${DT});
    const hurt = e.wardT === 0 && e.hp < h0;
    // a cast astra is never reflected
    e.wardCycle = 0.5; const h2 = e.hp;
    const cast = Object.assign({}, shot, { x: e.x - 2, y: e.y, t: 2, src: 'cast', hitSet: new Set() });
    GAME.pprojectiles.push(cast);
    __el.hold(P, hx, hy); GAME.update(${DT});
    return { reflected, hurt, cast: e.hp < h2 };
  })()`);
  check('warded: during its ward window a player attack projectile is destroyed and a 0.5× needle fires back at the player', wa.reflected);
  check('warded: outside the window projectiles damage it normally', wa.hurt);
  check('warded: non-attack (cast) projectiles are not reflected', wa.cast);

  // ---- rallying ----
  const ra = R(`(() => {
    const P = __el.boot(0);
    const r = __el.spawn('rakshasa', 300, 0, { elite: ['rallying'] });
    const near = __el.spawn('preta', 300, 150), far = __el.spawn('preta', -300, 0);
    ENEMY_AI.tick(${DT});
    const out = { near: near.dmgMul(), far: far.dmgMul(), self: r.dmgMul() };
    // fire() multiplies by it
    near.armedAtk = true; const p = near.fire('needle', 1, 0, 10); near.armedAtk = false;
    out.fire = p ? p.dmg : -1;
    // dead rallier: no buff
    killEnemy(r); ENEMY_AI.tick(${DT});
    out.after = near.dmgMul();
    return out;
  })()`);
  check(`rallying: allies within 220 px have dmgMul() === 1.2 (near ${ra.near}, far ${ra.far})`, ra.near === 1.2 && ra.far === 1);
  check(`rallying: fire() damage is multiplied (${ra.fire})`, Math.abs(ra.fire - 12) < 1e-9);
  check('rallying: the buff ends when the rallier dies', ra.after === 1);

  // ---- overlay (shared renderer, both paths) ----
  R(`__el.boot(2); globalThis.__elE = __el.spawn('rakshasa', 100, 0, { elite: ['armored', 'warded'] }); __elE.wardCycle = 0.5; __elE.update(${DT});`);
  for (const path of ['primitive', 'sprite']) {
    const rec = harness.recordingCtx();
    sandbox.__rec = rec.ctx;
    if (path === 'primitive') R(`__elE.draw(__rec)`);
    else R(`(() => { const has = SPRITES.has, hy = SPRITES.headY; SPRITES.has = () => true; SPRITES.headY = e => e.y - e.r * 2;
      try { GAME.renderSpriteExtras(__rec, __elE); } finally { SPRITES.has = has; SPRITES.headY = hy; } })()`);
    const tag = rec.ops.find(o => o.op === 'fillText' && /Armored/.test(String(o.args[0])) && /Warded/.test(String(o.args[0])));
    const col = R(`DATA.ELITE_MODS.armored.color`).toLowerCase();
    const aura = rec.ops.some(o => o.op === 'stroke' && String(o.stroke).toLowerCase().startsWith(col));
    const hpBar = rec.ops.some(o => o.op === 'fillRect' && o.fill === '#ff5566');
    check(`elite overlay (${path}): name tag "${tag ? tag.args[0] : '-'}" in the first mod colour, aura stroke, hp bar at full hp`,
      !!tag && String(tag.fill).toLowerCase().startsWith(col) && aura && hpBar);
  }

  R(`INPUT.ax = 0; INPUT.ay = 0; U.unseed()`);
};
