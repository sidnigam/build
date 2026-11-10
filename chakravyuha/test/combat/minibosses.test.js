// 05.7.1-06 (D-08, COMBAT-06): mini-bosses. Four asura/rakshasa champions, one per biome, built
// as `MiniBoss extends Boss` so they inherit the BOSS_TG telegraph invariant. Covers the class and
// Boss hooks, data-driven pattern moves, 40% enrage, the sprite-path telegraph and (Task 2) the
// mid-biome room flow, door, Rare+ reward and HUD bar.
'use strict';
module.exports = function ({ R, sandbox, check, section, harness, fs, path, root }) {
  const J = JSON.stringify;
  const RED = /ff4444|255,\s*68,\s*68/i;
  const DRAW_OPS = new Set(['fill', 'stroke', 'fillRect', 'strokeRect']);
  const redOps = ops => ops.filter(o => DRAW_OPS.has(o.op) && (RED.test(String(o.fill)) || RED.test(String(o.stroke))));

  const has = R(`typeof MiniBoss === 'function' && typeof MINI_MOVE_DEFS === 'object' && typeof MINI_MOVESETS === 'object' && !!DATA.MINIBOSSES`);
  check('MiniBoss, MINI_MOVE_DEFS, MINI_MOVESETS and DATA.MINIBOSSES exist', has);
  if (!has) return;

  // Sandbox helpers: build a mini-boss room directly (no door flow), step the sim, log shots.
  R(`globalThis.__mb = {
    room(id) {
      GAME.startRun();
      const P = GAME.player; P.maxhp = 1e9; P.hp = 1e9;
      const bi = DATA.BIOMES.findIndex(b => b.id === DATA.MINIBOSSES[id].biome);
      GAME.biomeIdx = bi; GAME.biome = DATA.BIOMES[bi];
      ROOMS.setArena('boss'); ROOMS.buildArena(true);
      GAME.enemies = []; GAME.eprojectiles = []; GAME.epools = []; GAME.waves = []; GAME.spawnQueue = [];
      GAME.hazards = []; GAME.dangerZones = [];
      const A = GAME.arena;
      const B = new MiniBoss(id, A.x + A.w * 0.7, A.y + A.h / 2);
      GAME.enemies.push(B); GAME.miniRef = B; GAME.bossRef = null; GAME.state = 'combat';
      P.x = B.x - 220; P.y = B.y;
      B.state = 'rest'; B.t = 99;
      B.shotLog = [];
      const orig = B.shoot;
      B.shoot = function () { this.shotLog.push(arguments[6] || 'bolt'); return orig.apply(this, arguments); };
      return B;
    },
    step(n) { for (let i = 0; i < n; i++) { GAME.hitstop = 0; GAME.player.iframes = 0; GAME.update(1 / 60); } },
    // run one forced move to completion; returns what it fired
    run(id, phase, moveId) {
      const B = __mb.room(id);
      if (phase === 2) { B.phase = 2; B.hp = B.maxhp * 0.3; }
      B.startMove(moveId);
      const wind = { marks: (B.marks || []).map(m => m.type) };
      let f = 0;
      while (f++ < 600 && B.state !== 'rest') __mb.step(1);
      return { wind, shots: B.shotLog.slice(), state: B.state, projs: GAME.eprojectiles.filter(p => p.owner === B).map(p => ({ fam: p.fam, pool: !!p.pool })) };
    },
  };`);

  // ---------------- class + hooks ----------------
  section('minibosses: class and Boss hooks');
  const info = R(`(() => {
    GAME.startRun();
    const m = new MiniBoss('subahu', 400, 300);
    return { mini: m.mini === true, boss: m.boss === true, type: m.type, defOk: m.bossDef === DATA.MINIBOSSES.subahu,
      hp: m.hp, maxhp: m.maxhp, defHp: DATA.MINIBOSSES.subahu.hp, r: m.r, asleep: m.asleep, isBoss: m instanceof Boss,
      t1: m.moveTable(1) === MINI_MOVESETS.subahu[1], t2: m.moveTable(2) === MINI_MOVESETS.subahu[2],
      mortar: m.moveDef('emberMortar'), charge: m.moveDef('charge'), chargeBase: BOSS_MOVE_DEFS.charge,
      phaseAt: m.phaseAt(), title: m.phaseTitle(), bossPhaseAt: new Boss('tataka', 400, 300).phaseAt() };
  })()`);
  check('new MiniBoss: mini === true, boss === true, instanceof Boss', info.mini && info.boss && info.isBoss);
  check(`new MiniBoss: type 'subahu' and bossDef === DATA.MINIBOSSES.subahu`, info.type === 'subahu' && info.defOk);
  check(`new MiniBoss: hp = maxhp = def.hp (${info.hp})`, info.hp === info.defHp && info.maxhp === info.defHp);
  check('new MiniBoss: never asleep', info.asleep === false);
  check('moveTable(1|2) returns MINI_MOVESETS[id][phase]', info.t1 && info.t2);
  check('moveDef(emberMortar) merges MINI_MOVE_DEFS (wind 0.9, pattern mortar)', info.mortar.wind === 0.9 && info.mortar.pattern && info.mortar.pattern.fam === 'mortar');
  check('moveDef(charge) falls back to BOSS_MOVE_DEFS', info.charge.wind === info.chargeBase.wind && info.charge.activeState === 'charging');
  check(`phaseAt: mini 0.4, boss default 0.5 (${info.phaseAt}, ${info.bossPhaseAt})`, info.phaseAt === 0.4 && info.bossPhaseAt === 0.5);
  check(`phaseTitle is bossDef.enrageTitle (${info.title})`, info.title === 'THE EMBERS RISE');

  const data = R(`Object.keys(DATA.MINIBOSSES).map(k => { const d = DATA.MINIBOSSES[k]; return { k, id: d.id, biome: d.biome, color: d.color, name: d.name, sub: d.sub, label: d.label, enrage: d.enrageTitle, intro: d.intro, lore: d.lore, hp: d.hp, r: d.r }; })`);
  check(`DATA.MINIBOSSES has 4 entries (${data.map(d => d.k).join(', ')})`, data.length === 4
    && J(data.map(d => d.k).sort()) === J(['alambusha', 'mahiravana', 'maricha', 'subahu']));
  for (const d of data) {
    check(`${d.k}: id matches, #rrggbb colour, name/sub/label/enrageTitle/intro/lore, hp/r set`,
      d.id === d.k && /^#[0-9a-f]{6}$/i.test(d.color) && [d.name, d.sub, d.label, d.enrage, d.intro, d.lore].every(s => typeof s === 'string' && s.length)
      && d.hp > 0 && d.r > 0);
  }
  check('one mini-boss per biome (naraka, patala, ranabhoomi, vaitarani)',
    J(data.map(d => d.biome).sort()) === J(['naraka', 'patala', 'ranabhoomi', 'vaitarani']));

  // ---------------- static data + source scan ----------------
  section('minibosses: static data and source scan');
  const stat = R(`(() => {
    const E = [];
    for (const id of Object.keys(DATA.MINIBOSSES)) {
      for (const ph of [1, 2]) {
        const t = MINI_MOVESETS[id] && MINI_MOVESETS[id][ph];
        if (!t || !t.length) { E.push(id + ' p' + ph + ' empty'); continue; }
        for (const e of t) {
          const base = MINI_MOVE_DEFS[e[0]] || BOSS_MOVE_DEFS[e[0]];
          if (!base) { E.push(id + ' p' + ph + ' unknown ' + e[0]); continue; }
          const d = Object.assign({}, base, e[2] || {});
          const stun = d.pattern && (d.pattern.fam === 'thunder' || (d.pattern.status && d.pattern.status.type === 'stun'));
          if (d.dmg && d.wind < 0.4) E.push(id + ' ' + e[0] + ' wind ' + d.wind);
          if (stun && d.wind < 0.5) E.push(id + ' ' + e[0] + ' stun wind ' + d.wind);
        }
      }
      const t2 = MINI_MOVESETS[id] && MINI_MOVESETS[id][2] || [];
      if (!t2.some(e => e[2] && e[2].opener)) E.push(id + ' has no phase-2 opener');
    }
    return E;
  })()`);
  check('MINI_MOVESETS: known moves, damaging wind >= 0.4 s, thunder/stun >= 0.5 s, phase-2 opener' + (stat.length ? ' — ' + stat.join('; ') : ''), stat.length === 0);
  const msrc = fs.readFileSync(path.join(root, 'js', 'minibosses.js'), 'utf8');
  check('js/minibosses.js: no takeDamage( / enemyShot( / touchAttack( (damage only via inherited helpers)',
    !/takeDamage\(|enemyShot\(|touchAttack\(/.test(msrc));
  check("js/minibosses.js: class MiniBoss extends Boss", /class MiniBoss extends Boss/.test(msrc));

  // ---------------- enrage at 40% ----------------
  section('minibosses: enrage at 40% HP');
  for (const id of data.map(d => d.k)) {
    const en = R(`(() => {
      const B = __mb.room(${J(id)});
      const banners = []; const ob = UI.banner; UI.banner = function (t) { banners.push(t); };
      try {
        B.hp = B.maxhp * 0.45; __mb.step(1);
        const notYet = B.phase === 1;
        B.hp = B.maxhp * 0.39; __mb.step(1);
        const shift = B.state === 'phaseShift' && B.phase === 2;
        let f = 0; while (f++ < 200 && B.state === 'phaseShift') __mb.step(1);
        const opener = (MINI_MOVESETS[${J(id)}][2].find(m => m[2] && m[2].opener) || [])[0];
        return { notYet, shift, banners, title: B.bossDef.enrageTitle, cur: B.curMove, opener, viol: BOSS_TG.violations.length };
      } finally { UI.banner = ob; }
    })()`);
    check(`${id}: 45% HP does not enrage; 39% enters phaseShift with phase 2`, en.notYet && en.shift);
    check(`${id}: enrage banner is '${en.title}'`, en.banners.includes(en.title));
    check(`${id}: first phase-2 move is the opener (${en.opener}; got ${en.cur})`, en.cur === en.opener);
  }

  // ---------------- pattern moves ----------------
  section('minibosses: data-driven pattern moves');
  {
    const m1 = R(`__mb.run('subahu', 1, 'emberMortar')`);
    const circles = m1.wind.marks.filter(t => t === 'circle').length;
    check(`emberMortar wind shows >= 3 circle marks (${circles})`, circles >= 3);
    const mortars = m1.projs.filter(p => p.fam === 'mortar');
    check(`emberMortar fires mortar projectiles carrying a pool (${mortars.length}, pool ${mortars.every(p => p.pool)})`, mortars.length >= 3 && mortars.every(p => p.pool));
    check(`emberMortar returns to rest`, m1.state === 'rest');
    const m2 = R(`__mb.run('subahu', 2, 'emberMortar')`);
    check(`phase 2 'around': emberMortar fires one extra mortar (${m1.shots.length} -> ${m2.shots.length})`, m2.shots.length === m1.shots.length + 1);

    const w1 = R(`__mb.run('mahiravana', 1, 'wispCoven')`), w2 = R(`__mb.run('mahiravana', 2, 'wispCoven')`);
    check(`phase 2 'radial': wispCoven fires one extra wisp (${w1.shots.length} -> ${w2.shots.length})`, w1.shots.length === 4 && w2.shots.length === 5);

    const f1 = R(`__mb.run('subahu', 1, 'emberFan')`), f2 = R(`__mb.run('subahu', 2, 'emberFan')`);
    check(`'player' fan with 2 volleys: emberFan fires 2 x 5 embers in phase 1 (${f1.shots.length})`, f1.shots.length === 10 && f1.shots.every(f => f === 'ember'));
    check(`phase 2 'player': one extra ember per volley (${f2.shots.length})`, f2.shots.length === 12);

    const t3 = R(`__mb.run('alambusha', 2, 'thunderNeedles')`);
    check(`thunderNeedles: 3 volleys of 4 thunder needles in phase 2 (${t3.shots.length})`, t3.shots.length === 12 && t3.shots.every(f => f === 'thunder'));

    const s1 = R(`__mb.run('alambusha', 1, 'spearBeam')`), b2 = R(`__mb.run('alambusha', 2, 'twinBeam')`);
    check(`'line' count 1: spearBeam fires one beam (${s1.shots.length})`, s1.shots.length === 1 && s1.shots[0] === 'beam');
    check(`'line' count 2: twinBeam fires two beams and shows two line marks (${b2.shots.length}, ${b2.wind.marks.filter(t => t === 'line').length})`,
      b2.shots.length === 2 && b2.shots.every(f => f === 'beam') && b2.wind.marks.filter(t => t === 'line').length === 2);

    const r1 = R(`__mb.run('subahu', 2, 'emberRing')`);
    check(`'self' ring is not scaled in phase 2 (emberRing fires ${r1.shots.length})`, r1.shots.length === 1 && r1.shots[0] === 'ring');
    const ringStatus = R(`(() => { const B = __mb.room('mahiravana'); B.startMove('venomRing'); __mb.step(80); const p = GAME.eprojectiles.find(q => q.fam === 'ring' && q.owner === B); return p ? p.status : null; })()`);
    check(`venomRing ring carries the poison status (${J(ringStatus)})`, ringStatus && ringStatus.type === 'poison');

    // bombs aimed 'around' travel to their marked circles instead of fusing on the caster
    const bomb = R(`(() => {
      const B = __mb.room('maricha'); B.startMove('goldBombs');
      const targets = B.marks.map(m => [m.x, m.y]);
      // step the player out of the way so no bomb bursts on contact before it reaches its mark
      const A = GAME.arena; GAME.player.x = A.x + 30; GAME.player.y = A.y + 30;
      let f = 0; while (f++ < 200 && !(GAME.eprojectiles.some(p => p.fam === 'bomb' && p.fuseT != null))) __mb.step(1);
      __mb.step(40);
      const bs = GAME.eprojectiles.filter(p => p.fam === 'bomb' && p.owner === B);
      const near = bs.filter(p => targets.some(([x, y]) => Math.hypot(p.x - x, p.y - y) < 60)).length;
      return { n: bs.length, near, targets: targets.length };
    })()`);
    check(`goldBombs: bombs travel to their marked circles (${bomb.near}/${bomb.n} within 60 px of a mark, ${bomb.targets} marks)`, bomb.n >= 3 && bomb.near === bomb.n);
  }

  // ---------------- per-move invariant (fast copy of the smoke harness) ----------------
  section('minibosses: per-move telegraph invariant');
  for (const id of data.map(d => d.k)) {
    for (const phase of [1, 2]) {
      const res = R(`(() => {
        const ids = MINI_MOVESETS[${J(id)}][${phase}].map(m => m[0]);
        if (ids.includes('chase') && !ids.includes('swipe')) ids.push('swipe');
        const fails = [];
        for (const moveId of ids) {
          const B = __mb.room(${J(id)});
          if (${phase} === 2) { B.phase = 2; B.hp = B.maxhp * 0.3; }
          B.x = GAME.player.x + B.r + 60;
          const v0 = BOSS_TG.violations.length;
          B.startMove(moveId);
          const serial = B.moveSerial; let wind = 0, f = 0;
          while (f++ < 360) {
            if (/Wind$/.test(B.state)) wind += 1 / 60;
            __mb.step(1);
            if (B.moveSerial !== serial || B.phase !== ${phase}) break;
          }
          const def = B.moveDef(moveId);
          if (BOSS_TG.violations.length > v0) fails.push(moveId + ': violations ' + BOSS_TG.violations.slice(v0).join(','));
          if (def.dmg && wind < def.wind - 0.05) fails.push(moveId + ': wind ' + wind.toFixed(2));
          if (def.dmg && !(B.dmgCalls > 0)) fails.push(moveId + ': dmgCalls 0');
        }
        return { ids, fails };
      })()`);
      check(`${id} phase ${phase}: telegraph invariant holds (${res.ids.join(',')})` + (res.fails.length ? ' — ' + res.fails.join('; ') : ''), res.fails.length === 0);
    }
  }

  // ---------------- sprite-path telegraph ----------------
  section('minibosses: sprite-path telegraphs');
  for (const id of data.map(d => d.k)) {
    for (const phase of [1, 2]) {
      const moves = R(`MINI_MOVESETS[${J(id)}][${phase}].map(m => m[0])`);
      for (const mv of moves) {
        const shown = R(`(() => {
          const B = __mb.room(${J(id)});
          if (${phase} === 2) { B.phase = 2; B.hp = B.maxhp * 0.3; }
          if (!(B.moveDef(${J(mv)}).wind > 0)) return null;
          B.startMove(${J(mv)});
          const vis = () => /Wind$/.test(B.state) && (B.telegraph || (B.marks && B.marks.length) || GAME.dangerZones.length);
          for (let i = 0; i < 30 && !vis(); i++) __mb.step(1);
          globalThis.__MB = B;
          return { vis: !!vis(), tg: !!B.telegraph, marks: (B.marks || []).length, dz: GAME.dangerZones.length };
        })()`);
        if (shown === null) continue;   // no wind (chase) -> nothing to telegraph
        const label = `${id} p${phase} ${mv}`;
        if (!shown.vis) { check(`${label}: reaches a wind state that shows a telegraph`, false); continue; }
        if (!shown.tg && !shown.marks) { check(`${label}: wind telegraph is a danger zone`, shown.dz > 0); continue; }
        const rec = harness.recordingCtx();
        sandbox.__rec = rec.ctx;
        R(`(() => { const h = SPRITES.has, hy = SPRITES.headY; try { SPRITES.has = () => true; SPRITES.headY = e => e.y - e.r * 2; GAME.renderSpriteExtras(__rec, __MB); } finally { SPRITES.has = h; SPRITES.headY = hy; } })()`);
        const red = redOps(rec.ops).length;
        check(`${label}: sprite path draws the wind telegraph (${red} red op(s))`, red >= 1);
      }
    }
  }

  // ================= Task 2: room flow, door, reward, HUD, room counts =================
  section('minibosses: biome room counts and mini-boss slots');
  const bio = R(`DATA.BIOMES.map(b => ({ id: b.id, rooms: b.rooms, miniRoom: b.miniRoom, mini: b.mini }))`);
  check(`room counts are [4, 5, 5, 3] (${J(bio.map(b => b.rooms))})`, J(bio.map(b => b.rooms)) === J([4, 5, 5, 3]));
  check(`miniRoom slots are [3, 3, 3, 2] (${J(bio.map(b => b.miniRoom))})`, J(bio.map(b => b.miniRoom)) === J([3, 3, 3, 2]));
  check(`biome minis are subahu/mahiravana/alambusha/maricha (${J(bio.map(b => b.mini))})`,
    J(bio.map(b => b.mini)) === J(['subahu', 'mahiravana', 'alambusha', 'maricha']));
  check('every miniRoom < rooms and every biome.mini is a DATA.MINIBOSSES entry of that biome',
    bio.every(b => b.miniRoom < b.rooms) && R(`DATA.BIOMES.every(b => DATA.MINIBOSSES[b.mini] && DATA.MINIBOSSES[b.mini].biome === b.id)`));
  const rw = R(`DATA.REWARDS.miniboss`);
  check(`DATA.REWARDS.miniboss: sym '⚔', #ff9a3c, w 0 (${J(rw)})`, rw && rw.id === 'miniboss' && rw.sym === '⚔' && rw.color === '#ff9a3c' && rw.w === 0
    && /^#[0-9a-f]{6}$/i.test(rw.color));

  section('minibosses: door, room entry and reward');
  R(`globalThis.__flow = {
    toMiniDoor(bi) {
      GAME.startRun();
      GAME.biomeIdx = bi; GAME.biome = DATA.BIOMES[bi];
      GAME.roomIdx = GAME.biome.miniRoom - 1;
      GAME.enemies = []; GAME.waves = []; GAME.spawnQueue = [];
      return ROOMS.doorOptions();
    },
  };`);
  for (let bi = 0; bi < bio.length; bi++) {
    const b = bio[bi];
    const door = R(`(() => { const o = __flow.toMiniDoor(${bi}); return { n: o.length, isMini: o[0] === DATA.REWARDS.miniboss }; })()`);
    check(`${b.id}: after room ${b.miniRoom - 1} the only door is the mini-boss door`, door.n === 1 && door.isMini);
    const after = R(`(() => { GAME.roomIdx = GAME.biome.miniRoom; const o = ROOMS.doorOptions(); return o.map(x => x.id); })()`);
    check(`${b.id}: after the mini-boss room the doors are ordinary (${after.join(',')})`, after.length >= 1 && !after.includes('miniboss'));

    const ent = R(`(() => {
      const intros = []; const oi = UI.bossIntro; UI.bossIntro = function (d) { intros.push(d); return oi.apply(this, arguments); };
      const rIdx = GAME.roomIdx = GAME.biome.miniRoom - 1;
      try { ROOMS.enterRoom('miniboss'); } finally { UI.bossIntro = oi; }
      const M = GAME.miniRef;
      return { kind: GAME.arenaKind, pillars: GAME.pillars.length, hazards: GAME.hazards.length, isMini: M instanceof MiniBoss,
        type: M && M.type, boss: GAME.bossRef === null, roomIdx: GAME.roomIdx, was: rIdx, intro: intros.length === 1 && intros[0] === M.bossDef,
        state: GAME.state, waves: GAME.waves.length, label: GAME.roomLabel(), enemies: GAME.enemies.length };
    })()`);
    check(`${b.id}: enterRoom('miniboss') builds an open boss-size arena with no hazards (${ent.kind}, ${ent.pillars} pillars, ${ent.hazards} hazards)`,
      ent.kind === 'boss' && ent.pillars === 0 && ent.hazards === 0);
    check(`${b.id}: GAME.miniRef is a MiniBoss '${b.mini}' and GAME.bossRef stays null (${ent.type})`, ent.isMini && ent.type === b.mini && ent.boss);
    check(`${b.id}: roomIdx incremented (${ent.was} -> ${ent.roomIdx}), combat state, no waves, one enemy`, ent.roomIdx === ent.was + 1 && ent.state === 'combat' && ent.waves === 0 && ent.enemies === 1);
    check(`${b.id}: UI.bossIntro shown with the mini-boss def`, ent.intro);
    check(`${b.id}: roomLabel() is 'THE CHAMPION' while the mini-boss lives (${ent.label})`, ent.label === 'THE CHAMPION');

    const clr = R(`(() => {
      const banners = []; const ob = UI.banner; UI.banner = function (t) { banners.push(t); return ob.apply(this, arguments); };
      try {
        const M = GAME.miniRef, P = GAME.player;
        const bi0 = GAME.biomeIdx, mud0 = P.mudra;
        hitEnemy(M, 1e7, 'attack');
        const coins = GAME.pickups.length;
        GAME.pickups = [];
        let f = 0;
        while (f++ < 30 && GAME.state === 'combat') { GAME.hitstop = 0; GAME.update(1 / 60); }
        const cards = document.getElementById('boon-cards').children.map(c => c.className);
        return { dead: M.dead, state: GAME.state, bi: GAME.biomeIdx === bi0, mudra: P.mudra - mud0, cards, banners, coins,
          boss: GAME.bossRef === null, doors: GAME.doors.length, label: GAME.roomLabel() };
      } finally { UI.banner = ob; }
    })()`);
    check(`${b.id}: killing the mini-boss clears the room (state ${clr.state}) without advancing the biome`,
      clr.dead && (clr.state === 'choosing' || clr.state === 'cleared') && clr.bi && clr.boss);
    check(`${b.id}: reward grants exactly 60 mudra (${clr.mudra})`, clr.mudra === 60);
    check(`${b.id}: reward banner shown`, clr.banners.some(t => /CHAMPION FALLS/.test(t)));
    const rare = clr.cards.length > 0 && clr.cards.every(c => /rarity-[12]\b/.test(c));
    check(`${b.id}: boon offer has only Rare+ cards (${clr.cards.map(c => (c.match(/rarity-\d/) || ['?'])[0]).join(',')})`, rare);
    check(`${b.id}: mini-boss drops 4-6 coins (${clr.coins})`, clr.coins >= 4 && clr.coins <= 6);
    check(`${b.id}: doors open after the mini-boss reward (${clr.doors})`, clr.doors >= 1);
    check(`${b.id}: roomLabel() falls back to the chamber label once the champion falls`, /^Chamber /.test(clr.label));
  }

  section('minibosses: HUD bar and resets');
  {
    const hudSetup = R(`(() => {
      GAME.startRun(); GAME.biomeIdx = 0; GAME.biome = DATA.BIOMES[0]; GAME.roomIdx = 2;
      ROOMS.enterRoom('miniboss'); GAME.miniRef.hp = GAME.miniRef.maxhp * 0.5;
      return { name: GAME.miniRef.bossDef.name + ' — ' + GAME.miniRef.bossDef.sub, W: GAME.W };
    })()`);
    const rec = harness.recordingCtx();
    sandbox.__rec = rec.ctx;
    R('GAME.renderHUD(__rec)');
    const label = rec.ops.find(o => o.op === 'fillText' && o.args[0] === hudSetup.name);
    check(`renderHUD draws the mini-boss name line '${hudSetup.name}'`, !!label);
    const bars = rec.ops.filter(o => o.op === 'fillRect' && o.fill === R('GAME.miniRef.color'));
    check(`renderHUD draws the mini-boss hp bar in its colour, <= 360 px wide (${bars.map(b => b.args[2]).join(',')})`,
      bars.length >= 1 && bars.every(b => b.args[2] <= 360) && bars.some(b => Math.abs(b.args[2] - 180) < 1e-6));
    const wide = rec.ops.filter(o => o.op === 'fillRect' && o.args[2] >= 520);
    check('renderHUD does not draw the 520 px boss bar during a mini-boss fight', wide.length === 0);
    const k = R(`(() => { const e = new Boss('tataka', 300, 300); GAME.pickups = []; killEnemy(e); return GAME.pickups.length; })()`);
    check(`killEnemy on a biome boss still drops 8-12 coins (${k})`, k >= 8 && k <= 12);
    const reset = R(`(() => { ROOMS.enterRoom('mudra'); return GAME.miniRef; })()`);
    check('entering any other room resets GAME.miniRef to null', reset === null);
    const boss = R(`(() => { GAME.startRun(); GAME.roomIdx = GAME.biome.rooms; ROOMS.enterRoom('boss'); return { b: !!GAME.bossRef, m: GAME.miniRef }; })()`);
    check('the biome boss room uses bossRef and leaves miniRef null', boss.b && boss.m === null);
  }
};
