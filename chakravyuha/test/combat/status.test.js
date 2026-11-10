// 05.7.1-02 (D-10, D-11, COMBAT-08): player status contract.
// takeDamage returns true only when the hit lands; statuses ride only on landed hits; stun is
// capped, diminishing and followed by immunity; DoT never grants i-frames; dash breaks root;
// stun blocks every action (guards live inside the Player methods, RESEARCH Pitfall 12).
'use strict';
module.exports = function ({ R, sandbox, check, harness }) {
  const DT = 1 / 60;
  R(`globalThis.__st = {
    boot() {
      GAME.godMode = false;
      INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false; INPUT.keys = {};
      GAME.startRun(); ROOMS.enterRoom('mudra');
      GAME.enemies = []; GAME.waves = []; GAME.spawnQueue = [];
      const P = GAME.player;
      P.weapon = DATA.WEAPONS.khanda;
      P.maxhp = 1e6; P.hp = 1e6; P.iframes = 0; P.dashT = 0;
      return P;
    },
    step(P, sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) P.update(${DT}); },
  };`);

  const has = R(`typeof STATUS !== 'undefined' && typeof STATUS.apply === 'function'`);
  check('STATUS global exists with apply()', has);
  if (!has) return;

  // ---- hit-landed contract ----
  const c = R(`(() => {
    const P = __st.boot(); const out = {};
    const h0 = P.hp; out.landed = P.takeDamage(10, P.x + 40, P.y); out.dropped = P.hp < h0;
    P.iframes = 0.3; let h = P.hp; out.ifr = P.takeDamage(10, P.x + 40, P.y); out.ifrHp = P.hp === h;
    P.iframes = 0; P.dashT = 0.1; h = P.hp; out.dash = P.takeDamage(10, P.x + 40, P.y); out.dashHp = P.hp === h;
    P.dashT = 0; GAME.godMode = true; h = P.hp; out.god = P.takeDamage(10, P.x + 40, P.y); out.godHp = P.hp === h;
    GAME.godMode = false;
    const ch = U.chance; P.boonRanks.kri_lila = 2;
    try { U.chance = () => true; h = P.hp; out.lila = P.takeDamage(10, P.x + 40, P.y); out.lilaHp = P.hp === h; }
    finally { U.chance = ch; delete P.boonRanks.kri_lila; }
    P.iframes = 0; P.dashT = 0.1;
    out.dashStatus = P.takeDamage(10, P.x + 40, P.y, { status: { type: 'stun', dur: 0.5 } });
    out.dashStunT = P.st.stunT;
    P.dashT = 0; P.iframes = 0;
    out.okStatus = P.takeDamage(10, P.x + 40, P.y, { status: { type: 'stun', dur: 0.5 } });
    out.okStunT = P.st.stunT;
    return out;
  })()`);
  check('takeDamage returns true when damage applies (hp drops)', c.landed === true && c.dropped);
  check('takeDamage returns false with hp unchanged while iframes > 0', c.ifr === false && c.ifrHp);
  check('takeDamage returns false with hp unchanged while dashing', c.dash === false && c.dashHp);
  check('takeDamage returns false with hp unchanged in god mode', c.god === false && c.godHp);
  check('takeDamage returns false with hp unchanged on a kri_lila dodge', c.lila === false && c.lilaHp);
  check('a dashing player avoids both the damage and the stun (returns false, stunT 0)', c.dashStatus === false && c.dashStunT === 0);
  check('a landed hit applies its status (stunT 0.5)', c.okStatus === true && Math.abs(c.okStunT - 0.5) < 1e-9);

  // ---- stun cap, immunity, DR ----
  const s = R(`(() => {
    const P = __st.boot(); const out = {};
    STATUS.apply(P, { type: 'stun', dur: 2 }, P.x + 40, P.y);
    out.capped = P.st.stunT;
    __st.step(P, 0.65);
    out.endedStun = P.st.stunT; out.imm = P.st.stunImmT;
    STATUS.apply(P, { type: 'stun', dur: 0.6 }, P.x + 40, P.y);
    out.immStun = P.st.stunT; out.immSlowT = P.st.slowT; out.immSlowF = P.st.slowF;
    __st.step(P, 1.3);
    out.immAfter = P.st.stunImmT;
    STATUS.apply(P, { type: 'stun', dur: 0.6 }, P.x + 40, P.y);
    out.dr = P.st.stunT;
    return out;
  })()`);
  check('stun duration is capped at 0.6 s (dur 2 -> ' + s.capped + ')', Math.abs(s.capped - 0.6) < 1e-9);
  check('a 1.2 s stun immunity starts when the stun ends', s.endedStun === 0 && s.imm > 1.0 && s.imm <= 1.2);
  check('a stun during immunity becomes a slow (f 0.7) instead', s.immStun === 0 && s.immSlowT > 0 && Math.abs(s.immSlowF - 0.7) < 1e-9);
  check('stun immunity expires', s.immAfter === 0);
  check('diminishing returns: a second stun within 4 s lasts half (' + s.dr + ')', Math.abs(s.dr - 0.3) < 1e-9);

  // ---- barrage: stunned <= 25% of the time ----
  const frac = R(`(() => {
    const P = __st.boot(); let stunned = 0, frames = 0, every = 15;
    for (let i = 0; i < 30 * 60; i++) {
      if (i % every === 0) { P.iframes = 0; P.takeDamage(1, P.x + 50, P.y, { status: { type: 'stun', dur: 0.6 } }); }
      P.update(${DT});
      frames++; if (STATUS.stunned(P)) stunned++;
    }
    return stunned / frames;
  })()`);
  console.log('    barrage stunned fraction: ' + frac.toFixed(4));
  check('30 s stun barrage (every 0.25 s): stunned fraction ' + frac.toFixed(3) + ' <= 0.25', frac > 0 && frac <= 0.25);

  // ---- stun blocks every action ----
  const g = R(`(() => {
    const P = __st.boot(); const out = {};
    STATUS.apply(P, { type: 'stun', dur: 0.6 }, P.x + 40, P.y);
    const dc = P.dashCharges, cc = P.castCharges;
    P.tryDash(1, 0); out.dash = P.dashCharges === dc && P.dashT === 0;
    P.tryCast(); out.cast = P.castCharges === cc;
    P.trySpecial(); out.special = P.specialCd === 0;
    P.meleeAttack(); out.meleeDirect = P.atkCd === 0;
    INPUT.lmb = true; INPUT.ax = 1; const x0 = P.x, y0 = P.y;
    __st.step(P, 0.2);
    out.melee = P.atkCd === 0; out.moved = P.x !== x0 || P.y !== y0;
    INPUT.lmb = false; INPUT.ax = 0;
    // control: once the stun ends, the same calls work
    __st.step(P, 0.5);
    P.tryDash(1, 0); out.dashAfter = P.dashCharges === dc - 1;
    return out;
  })()`);
  check('stunned: tryDash leaves dashCharges unchanged', g.dash);
  check('stunned: tryCast leaves castCharges unchanged', g.cast);
  check('stunned: trySpecial leaves specialCd at 0', g.special);
  check('stunned: meleeAttack() is a no-op', g.meleeDirect);
  check('stunned: holding attack in update() does not attack (atkCd stays 0)', g.melee);
  check('stunned: movement input does not move the player', !g.moved);
  check('control: after the stun ends tryDash spends a charge', g.dashAfter);

  const gb = R(`(() => {
    const P = __st.boot(); P.weapon = DATA.WEAPONS.gandiva;
    INPUT.lmb = true; __st.step(P, 0.2); const chargingBefore = P.charging;
    STATUS.apply(P, { type: 'stun', dur: 0.6 }, P.x + 40, P.y);
    const n0 = GAME.pprojectiles.length;
    __st.step(P, 0.1); INPUT.lmb = false; __st.step(P, 0.1);
    return { chargingBefore, charging: P.charging, charge: P.charge, shots: GAME.pprojectiles.length - n0 };
  })()`);
  check('stunned bow: charge is reset and no arrow is released', gb.chargingBefore && !gb.charging && gb.charge === 0 && gb.shots === 0);

  // ---- root ----
  const r = R(`(() => {
    const P = __st.boot(); const out = {};
    STATUS.apply(P, { type: 'root', dur: 1.0 }, P.x + 40, P.y);
    out.rooted = STATUS.rooted(P);
    INPUT.ax = 1; const x0 = P.x; __st.step(P, 0.5); out.still = P.x === x0;
    INPUT.ax = 0;
    const atk0 = P.atkCd; INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false; out.canAttack = P.atkCd > atk0;
    P.tryDash(1, 0); out.broken = P.st.rootT === 0 && !STATUS.rooted(P);
    STATUS.apply(P, { type: 'root', dur: 5 }, P.x + 40, P.y); out.rootCap = P.st.rootT;
    return out;
  })()`);
  check('root: STATUS.rooted() is true after a root', r.rooted);
  check('root: holding move right for 0.5 s does not move the player', r.still);
  check('root: the player can still attack while rooted', r.canAttack);
  check('root: tryDash() breaks the root (rootT 0)', r.broken);
  check('root: duration capped at 1.5 s', Math.abs(r.rootCap - 1.5) < 1e-9);

  // ---- slow ----
  const sl = R(`(() => {
    const P = __st.boot(); const base = P.moveSpeed();
    STATUS.apply(P, { type: 'slow', f: 0.6, dur: 2 }, P.x, P.y);
    const slowed = P.moveSpeed();
    P.hazardSlowT = 1; P.hazardSlowF = 0.6; const both = P.moveSpeed();
    P.hazardSlowF = 0.4; const pool = P.moveSpeed();
    return { base, slowed, both, pool };
  })()`);
  check('slow f 0.6: moveSpeed is 0.6x the unslowed value', Math.abs(sl.slowed - sl.base * 0.6) < 1e-6);
  check('slow + venom pool (both 0.6): no double multiply (0.6x, not 0.36x)', Math.abs(sl.both - sl.base * 0.6) < 1e-6);
  check('slow + stronger pool (0.4): the smaller factor wins', Math.abs(sl.pool - sl.base * 0.4) < 1e-6);

  // ---- poison / burn ----
  const p = R(`(() => {
    const P = __st.boot(); P.maxhp = 100; P.hp = 100;
    STATUS.apply(P, { type: 'poison', dps: 4, dur: 2 }, P.x, P.y);
    let ifr0 = true;
    for (let i = 0; i < 126; i++) { P.update(${DT}); if (P.iframes !== 0) ifr0 = false; }
    const drop = 100 - P.hp;
    const landed = P.takeDamage(5, P.x + 40, P.y);
    STATUS.clear(P);
    for (let i = 0; i < 6; i++) STATUS.apply(P, { type: 'burn', dps: 2, dur: 3 }, P.x, P.y);
    for (let i = 0; i < 8; i++) STATUS.apply(P, { type: 'poison', dps: 2, dur: 3 }, P.x, P.y);
    return { drop, ifr0, landed, burns: P.st.burns.length, poison: P.st.poison.length };
  })()`);
  check('poison dps 4 for 2 s: hp dropped by 8 +/- 1 (got ' + p.drop + ')', Math.abs(p.drop - 8) <= 1);
  check('poison ticks never grant i-frames (iframes 0 every frame)', p.ifr0);
  check('a poisoned player can still be hit (takeDamage returns true)', p.landed === true);
  check('burn caps at 3 stacks', p.burns === 3);
  check('poison caps at 5 stacks', p.poison === 5);

  // ---- knock / pull ----
  const k = R(`(() => {
    const P = __st.boot(); const out = {};
    const x0 = P.x; STATUS.apply(P, { type: 'knock', force: 400 }, P.x - 50, P.y);
    __st.step(P, 0.3); out.pushed = P.x > x0 + 5;
    STATUS.clear(P);
    const x1 = P.x; STATUS.apply(P, { type: 'pull', force: 300 }, P.x + 300, P.y);
    __st.step(P, 0.3); out.pulled = P.x > x1 + 5;
    STATUS.clear(P);
    STATUS.apply(P, [{ type: 'stun', dur: 0.4 }, { type: 'knock', force: 400 }], P.x - 50, P.y);
    out.comboStun = P.st.stunT > 0; out.comboKnock = P.st.kx === 0 && P.st.ky === 0;
    return out;
  })()`);
  check('knock from the left pushes the player right within 0.3 s', k.pushed);
  check('pull toward a point on the right moves the player right', k.pulled);
  check('[stun, knock] in one apply: only the stun lands (no stun-into-knock)', k.comboStun && k.comboKnock);

  // ---- god mode / clear ----
  const gm = R(`(() => {
    const P = __st.boot(); const out = {};
    GAME.godMode = true;
    try {
      const h = P.hp; P.tickDamage(10, 'burn'); out.tick = P.hp === h;
      STATUS.apply(P, { type: 'poison', dps: 10, dur: 2 }, P.x, P.y); __st.step(P, 1.1); out.dot = P.hp === h;
    } finally { GAME.godMode = false; }
    STATUS.apply(P, { type: 'stun', dur: 0.5 }, P.x, P.y); STATUS.apply(P, { type: 'burn', dps: 2, dur: 3 }, P.x, P.y);
    STATUS.clear(P); out.cleared = STATUS.active(P).length === 0 && P.st.stunT === 0;
    STATUS.apply(P, { type: 'root', dur: 1 }, P.x, P.y); STATUS.apply(P, { type: 'poison', dps: 2, dur: 3 }, P.x, P.y);
    P.defiance = 1; P.hp = 0; GAME.onPlayerDeath(); out.revive = P.hp > 0 && STATUS.active(P).length === 0;
    STATUS.apply(P, { type: 'slow', f: 0.5, dur: 3 }, P.x, P.y); ROOMS.enterRoom('mudra');
    out.room = STATUS.active(P).length === 0;
    return out;
  })()`);
  check('god mode: tickDamage does nothing', gm.tick);
  check('god mode: poison ticks do nothing', gm.dot);
  check('STATUS.clear(P) empties every status', gm.cleared);
  check('defiance revive clears statuses', gm.revive);
  check('room entry clears statuses', gm.room);

  // ---- active() ordering ----
  const act = R(`(() => {
    const P = __st.boot();
    STATUS.apply(P, { type: 'poison', dps: 2, dur: 3 }, P.x, P.y);
    STATUS.apply(P, { type: 'poison', dps: 2, dur: 2 }, P.x, P.y);
    STATUS.apply(P, { type: 'slow', f: 0.5, dur: 3 }, P.x, P.y);
    STATUS.apply(P, { type: 'stun', dur: 0.5 }, P.x, P.y);
    return STATUS.active(P).map(a => a.type + ':' + (a.stacks || 1));
  })()`);
  check('STATUS.active lists stun, slow, poison (with stacks) in order — ' + act.join(','), act.join(',') === 'stun:1,slow:1,poison:2');

  // ---- HUD + on-player reads ----
  const rec = harness.recordingCtx();
  sandbox.__rec = rec.ctx;
  R(`(() => { const P = __st.boot(); GAME.state = 'combat'; GAME.renderHUD(__rec); })()`);
  const texts0 = rec.ops.filter(o => o.op === 'fillText').map(o => String(o.args[0]));
  check('HUD control: no stun/poison icon without statuses', !texts0.some(t => t.includes('✦') || t.includes('❖')));
  rec.ops.length = 0;
  R(`(() => { const P = GAME.player;
    STATUS.apply(P, { type: 'stun', dur: 0.5 }, P.x, P.y);
    STATUS.apply(P, { type: 'poison', dps: 2, dur: 3 }, P.x, P.y);
    STATUS.apply(P, { type: 'poison', dps: 2, dur: 3 }, P.x, P.y);
    GAME.renderHUD(__rec); })()`);
  const texts = rec.ops.filter(o => o.op === 'fillText').map(o => String(o.args[0]));
  check('HUD: stun icon ✦ is drawn', texts.some(t => t.includes('✦')));
  check('HUD: poison icon ❖ is drawn', texts.some(t => t.includes('❖')));
  check('HUD: poison stack count "2" is drawn', texts.some(t => t === '2'));
  const hudRow = rec.ops.filter(o => o.op === 'fillText' && (String(o.args[0]).includes('✦') || String(o.args[0]).includes('❖')));
  check('HUD: status row sits on the HP-bar line (y < 56), right of the bar (x > 290)',
    hudRow.length >= 2 && hudRow.every(o => o.args[2] < 56 && o.args[1] > 290));

  rec.ops.length = 0;
  R(`GAME.player.draw(__rec)`);
  check('Player.draw shows the stun glyph over the player', rec.ops.some(o => o.op === 'fillText' && String(o.args[0]).includes('✦')));
  rec.ops.length = 0;
  R(`(() => { const P = GAME.player; STATUS.clear(P); STATUS.apply(P, { type: 'root', dur: 1 }, P.x, P.y); drawPlayerStatus(__rec, P, P.y - 30, P.y + 10); })()`);
  check('drawPlayerStatus: root draws a brown ellipse at the feet',
    rec.ops.some(o => o.op === 'ellipse' && Math.abs(o.args[1] - R('GAME.player.y + 10')) < 1e-6));
  rec.ops.length = 0;
  R(`(() => { const P = GAME.player; SETTINGS.set('screenFlash', false); try {
       STATUS.clear(P); STATUS.apply(P, { type: 'burn', dps: 2, dur: 3 }, P.x, P.y); drawPlayerStatus(__rec, P, P.y - 30, P.y + 10);
     } finally { SETTINGS.reset(); } })()`);
  check('drawPlayerStatus: with screenFlash off the burn ring uses a constant 0.6 alpha',
    rec.ops.some(o => o.op === 'stroke' && Math.abs(o.alpha - 0.6) < 1e-9));

  // ---- particles honour reducedParticles ----
  const parts = R(`(() => {
    const spawn = VFX.spawn; let n = 0;
    VFX.spawn = function () { n++; return spawn.apply(this, arguments); };
    const run = (reduced) => {
      SETTINGS.set('reducedParticles', reduced);
      const P = __st.boot(); n = 0;
      STATUS.apply(P, { type: 'burn', dps: 1, dur: 3 }, P.x, P.y);
      __st.step(P, 1.0); return n;
    };
    try { return { normal: run(false), reduced: run(true) }; }
    finally { VFX.spawn = spawn; SETTINGS.reset(); }
  })()`);
  check('burn shows particles on the player (' + parts.normal + ')', parts.normal > 0);
  check('reducedParticles: 1 s of burn spawns no more particles (' + parts.reduced + ' <= ' + parts.normal + ')', parts.reduced <= parts.normal);

  // ---- data hygiene ----
  const cols = R(`Object.entries(DATA.STATUS).map(([k, v]) => k + ':' + v.color)`);
  check('every DATA.STATUS colour is #rrggbb', cols.length >= 7 && cols.every(s => /:#[0-9a-f]{6}$/.test(s)));

  R(`GAME.godMode = false; SETTINGS.reset(); INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false;`);
};
