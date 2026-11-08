// 05.7.1-03 (D-02, D-12..D-16, COMBAT-01/09/10/11/12/13): the player kit.
// Tempo values, dash-strike per weapon, dash-cancel, finishers, weavable specials, the new
// hit-feel presets, the press/hold state machine with charged variants, Gandiva perfect release
// and quick-shot finisher, and keyboard/mouse <-> pad parity.
'use strict';
module.exports = function ({ R, check }) {
  const DT = 1 / 60;
  R(`globalThis.__kit = {
    boot(weaponId) {
      GAME.godMode = false;
      INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false; INPUT.keys = {};
      META.lastWeapon = weaponId || 'khanda';
      GAME.startRun(); ROOMS.enterRoom('mudra');
      GAME.state = 'combat';
      GAME.enemies = []; GAME.waves = []; GAME.spawnQueue = []; GAME.pillars = []; GAME.hazards = [];
      GAME.pprojectiles = []; GAME.eprojectiles = []; GAME.zones = []; GAME.orbits = []; GAME.rings = [];
      GAME.hitstop = 0; GAME.hitstopCd = 0;
      const P = GAME.player;
      P.weapon = DATA.WEAPONS[weaponId || 'khanda'];
      const A = GAME.arena;
      P.x = A.x + A.w / 2; P.y = A.y + A.h / 2;
      P.maxhp = 1e6; P.hp = 1e6; P.iframes = 0; P.dashT = 0; P.atkCd = 0; P.comboIdx = 0; P.comboT = 0;
      P._lmbPrev = false;
      return P;
    },
    // dummy enemy at (dx, dy) from the player, huge hp so it survives; aim at it
    dummy(P, dx, dy, aim) {
      const e = new Enemy('bhuta', P.x + dx, P.y + dy, 1);
      e.spawnT = 0; e.hp = e.maxhp = 1e6; e.spd = 0; e.update = function () {};
      GAME.enemies.push(e);
      if (aim !== false) { INPUT.wx = e.x; INPUT.wy = e.y; }
      return e;
    },
    step(P, sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) P.update(${DT}); },
    press(P) { INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false; P.update(${DT}); },
    dashThrough(P) {
      P.dashCharges = Math.max(1, P.dashCharges);
      P.tryDash();
      let n = 0; while (P.dashT > 0 && n++ < 60) P.update(${DT});
    },
    // record hitEnemy calls (base damage, src, opts) without changing behaviour
    record() {
      const log = [], orig = hitEnemy;
      globalThis.hitEnemy = function (e, base, src, opts) { log.push({ e, base, src, opts: opts || {} }); return orig.apply(this, arguments); };
      return { log, restore() { globalThis.hitEnemy = orig; } };
    },
    recordVfx() {
      const names = [], orig = VFX.emit;
      VFX.emit = function (name) { names.push(name); return orig.apply(this, arguments); };
      return { names, restore() { VFX.emit = orig; } };
    },
  };`);

  const hasKit = R(`typeof DATA.KIT === 'object' && DATA.KIT !== null`);
  check('DATA.KIT exists', hasKit);
  if (!hasKit) return;

  // ---- tempo values ----
  const t = R(`(() => {
    const P = __kit.boot('khanda');
    const W = DATA.WEAPONS;
    return {
      speed: P.speed, want: 305 * META.bonusSpeed(), dashCd: P.dashCooldown(),
      rates: [W.khanda.rate, W.gada.rate, W.gandiva.rate],
      cds: [W.khanda.special.cd, W.gada.special.cd, W.gandiva.special.cd],
      win: DATA.KIT.dashStrikeWindow, delay: DATA.KIT.chargeDelay,
    };
  })()`);
  check('Player speed = 305 * META.bonusSpeed() (' + t.speed + ')', Math.abs(t.speed - t.want) < 1e-9);
  check('dashCooldown() with no boons = 1.5 (' + t.dashCd + ')', t.dashCd === 1.5);
  check('weapon rates khanda/gada/gandiva = 0.23/0.47/0.16', JSON.stringify(t.rates) === '[0.23,0.47,0.16]');
  check('special cds khanda/gada/gandiva = 3/4.5/3.5', JSON.stringify(t.cds) === '[3,4.5,3.5]');
  check('DATA.KIT.dashStrikeWindow 0.2 and chargeDelay 0.28', t.win === 0.2 && t.delay === 0.28);

  // ---- sinceDash ----
  const sd = R(`(() => {
    const P = __kit.boot('khanda');
    P.tryDash(); const out = { during: P.dashT > 0 };
    let n = 0; while (P.dashT > 0 && n++ < 60) P.update(${DT});
    out.atEnd = P.sinceDash;
    __kit.step(P, 0.1); out.after = P.sinceDash;
    return out;
  })()`);
  check('sinceDash is 0 on the frame the dash ends', sd.during && sd.atEnd === 0);
  check('sinceDash grows with sim time after the dash (' + sd.after + ')', Math.abs(sd.after - 0.1) < 1e-6);

  // ---- khanda lunge ----
  const kl = R(`(() => {
    const P = __kit.boot('khanda');
    P.addBoon(DATA.findBoon('agni_attack'), 0);
    const e = __kit.dummy(P, 260, 0);
    const rec = __kit.record();
    try {
      __kit.dashThrough(P);
      INPUT.wx = e.x; INPUT.wy = e.y;
      __kit.step(P, 0.1);
      const x0 = P.x, d0 = U.dist(P.x, P.y, e.x, e.y);
      const out = { inWin: P.inDashStrikeWindow() };
      INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false;
      out.moved = P.x - x0; out.d0 = d0;
      const ds = rec.log.filter(c => c.opts.dashStrike);
      out.hits = ds.length; out.base = ds.length ? ds[0].base : null; out.src = ds.length ? ds[0].src : null;
      out.want = DATA.WEAPONS.khanda.combo[0] * 1.5;
      out.burn = e.burns.length > 0;
      out.used = P.dashStrikeUsed;
      // a second press in the same window is a normal swing
      P.atkCd = 0; rec.log.length = 0;
      INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false; P.update(${DT});
      out.second = rec.log.filter(c => c.opts.dashStrike).length;
      return out;
    } finally { rec.restore(); }
  })()`);
  check('khanda: inside the window after a dash', kl.inWin === true);
  check('khanda dash-strike lunges up to 90 px along aim (moved ' + kl.moved.toFixed(1) + ')', kl.moved > 85 && kl.moved <= 90.001);
  check('khanda dash-strike hits the enemy once for combo[0] * 1.5 via src attack {dashStrike}', kl.hits === 1 && kl.base === kl.want && kl.src === 'attack');
  check('khanda dash-strike: agni_attack burn applies (attack boons ride along)', kl.burn === true);
  check('the dash-strike window is consumed by one dash-strike', kl.used === true && kl.second === 0);

  // ---- late press = normal swing ----
  const late = R(`(() => {
    const P = __kit.boot('khanda');
    const e = __kit.dummy(P, 60, 0);
    const rec = __kit.record();
    try {
      __kit.dashThrough(P);
      INPUT.wx = e.x; INPUT.wy = e.y;
      __kit.step(P, 0.25);
      const ci = P.comboIdx;
      INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false;
      return { ds: rec.log.filter(c => c.opts.dashStrike).length, swung: P.comboIdx === ci + 1, hits: rec.log.length };
    } finally { rec.restore(); }
  })()`);
  check('an attack press at sinceDash 0.25 is a normal swing, not a dash-strike', late.ds === 0 && late.swung && late.hits >= 1);

  // ---- gandiva volley ----
  const gv = R(`(() => {
    const P = __kit.boot('gandiva');
    const e = __kit.dummy(P, 300, 0);
    __kit.dashThrough(P);
    INPUT.wx = e.x; INPUT.wy = e.y;
    __kit.step(P, 0.05);
    const before = GAME.pprojectiles.length;
    INPUT.lmb = true; P.update(${DT});
    const shots = GAME.pprojectiles.slice(before);
    const w = DATA.WEAPONS.gandiva, want = U.lerp(w.dmgMin, w.dmgMax, 0.6) * 1.2;
    const angs = shots.map(s => Math.atan2(s.vy, s.vx)).sort((a, b) => a - b);
    // holding on after a volley does not start a draw
    P.update(${DT}); P.update(${DT});
    const drawing = P.charging;
    INPUT.lmb = false; P.update(${DT});
    return {
      n: shots.length, dmgOk: shots.every(s => Math.abs(s.dmg - want) < 1e-9),
      lifeOk: shots.every(s => s.t === 0.45 || Math.abs(s.t - 0.45) < 1e-9),
      optsOk: shots.every(s => s.opts && s.opts.dashStrike === true),
      spread: angs.length === 3 ? [angs[0] - P.aim, angs[1] - P.aim, angs[2] - P.aim] : null,
      drawing, after: GAME.pprojectiles.length - before,
    };
  })()`);
  check('gandiva dash-strike fires 3 arrows (' + gv.n + ')', gv.n === 3);
  check('gandiva volley arrows deal lerp(dmgMin, dmgMax, 0.6) * 1.2 with life 0.45', gv.dmgOk && gv.lifeOk);
  check('gandiva volley arrows carry opts {dashStrike: true}', gv.optsOk);
  check('gandiva volley spread is aim and +/-0.18 rad', !!gv.spread && Math.abs(gv.spread[0] + 0.18) < 1e-6 && Math.abs(gv.spread[1]) < 1e-6 && Math.abs(gv.spread[2] - 0.18) < 1e-6);
  check('holding after a volley does not draw a bow shot', gv.drawing === false && gv.after === 3);

  // ---- gada leap ----
  const gl = R(`(() => {
    const P = __kit.boot('gada');
    const e = __kit.dummy(P, 330, 0);
    const rec = __kit.record();
    try {
      __kit.dashThrough(P);
      INPUT.wx = e.x; INPUT.wy = e.y;
      const x0 = P.x;
      INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false;
      const out = { leaping: P.leapT > 0 };
      __kit.step(P, 0.25);
      out.moved = P.x - x0;
      const ds = rec.log.filter(c => c.opts.dashStrike);
      out.hits = ds.length; out.base = ds.length ? ds[0].base : null;
      out.want = DATA.WEAPONS.gada.combo[0] * 1.6;
      out.stun = e.stun;
      return out;
    } finally { rec.restore(); }
  })()`);
  check('gada dash-strike starts a hop (leapT > 0)', gl.leaping);
  check('gada hop travels at most 110 px toward the aim point (' + gl.moved.toFixed(1) + ')', gl.moved > 100 && gl.moved <= 110.001);
  check('gada slam AoE hits for combo[0] * 1.6 {dashStrike}', gl.hits === 1 && gl.base === gl.want);
  check('gada slam stuns the enemy >= 0.3 (' + gl.stun + ')', gl.stun >= 0.29);

  // ---- dash cancel ----
  const cn = R(`(() => {
    const P = __kit.boot('khanda');
    __kit.dummy(P, 60, 0);
    INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false; P.update(${DT});
    const out = { cd0: P.atkCd > 0, ci: P.comboIdx, ct: P.comboT };
    P.charging = true; P.charge = 0.5;
    P.dashCharges = 2; P.tryDash();
    out.cd = P.atkCd; out.charging = P.charging; out.charge = P.charge;
    out.ciAfter = P.comboIdx; out.ctAfter = P.comboT;
    return out;
  })()`);
  check('dash cancels attack recovery and any charge (atkCd 0, charging false, charge 0)', cn.cd0 && cn.cd === 0 && cn.charging === false && cn.charge === 0);
  check('dash cancel keeps comboIdx/comboT', cn.ciAfter === cn.ci && cn.ctAfter === cn.ct);

  // ---- khanda finisher ----
  const kf = R(`(() => {
    const P = __kit.boot('khanda');
    // enemy 1.2 rad off aim: outside the 1.9 rad cone, inside the 2.6 rad cross-cut
    const aimE = __kit.dummy(P, 200, 0);
    const side = __kit.dummy(P, Math.cos(1.2) * 50, Math.sin(1.2) * 50, false);
    INPUT.wx = aimE.x; INPUT.wy = aimE.y;
    const rec = __kit.record(), vfx = __kit.recordVfx();
    try {
      const out = { arcs: [], sideHits: [] };
      for (let i = 0; i < 3; i++) {
        P.atkCd = 0;
        rec.log.length = 0;
        INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false; P.update(${DT});
        out.arcs.push(P.swing && P.swing.arc);
        out.sideHits.push(rec.log.filter(c => c.e === side).map(c => !!c.opts.finisher));
      }
      out.ring = vfx.names.includes('finisherRing');
      return out;
    } finally { rec.restore(); vfx.restore(); }
  })()`);
  check('khanda 3rd hit uses arc 2.6 (arcs ' + JSON.stringify(kf.arcs) + ')', kf.arcs[2] === 2.6 && kf.arcs[0] === 1.9);
  check('khanda cross-cut hits the side enemy only on the finisher, with {finisher:true}', kf.sideHits[0].length === 0 && kf.sideHits[1].length === 0 && kf.sideHits[2].length === 1 && kf.sideHits[2][0] === true);
  check('khanda finisher emits the finisherRing preset', kf.ring);

  // ---- gada finisher shockwave ----
  const gf = R(`(() => {
    const P = __kit.boot('gada');
    const w = DATA.WEAPONS.gada;
    const near = __kit.dummy(P, 50, 0);
    const far = __kit.dummy(P, w.range + 40, 0, false);
    INPUT.wx = near.x; INPUT.wy = near.y;
    const rec = __kit.record();
    try {
      const out = {};
      P.atkCd = 0; INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false; P.update(${DT});
      out.farFirst = rec.log.filter(c => c.e === far).length;
      rec.log.length = 0;
      P.atkCd = 0; INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false; P.update(${DT});
      const fh = rec.log.filter(c => c.e === far), nh = rec.log.filter(c => c.e === near && c.src === 'attack');
      out.farN = fh.length; out.farBase = fh.length ? fh[0].base : null; out.farFin = fh.length ? !!fh[0].opts.finisher : false;
      out.nearN = nh.length; out.want = w.combo[1] * 0.5;
      return out;
    } finally { rec.restore(); }
  })()`);
  check('gada first hit does not reach the shockwave-only enemy', gf.farFirst === 0);
  check('gada 2nd hit shockwave hits out to range+60 for 0.5x damage {finisher}', gf.farN === 1 && gf.farBase === gf.want && gf.farFin);
  check('gada shockwave: each enemy hit at most once per swing', gf.nearN === 1);

  // ---- specials weave ----
  const sp = R(`(() => {
    const P = __kit.boot('khanda');
    __kit.dummy(P, 60, 0);
    INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false; P.update(${DT});
    P.comboT = 0.1;
    const ci = P.comboIdx;
    P.specialCd = 0; P.trySpecial();
    return { ci, after: P.comboIdx, ct: P.comboT };
  })()`);
  check('trySpecial keeps comboIdx and extends comboT to >= 0.6', sp.after === sp.ci && sp.ci === 1 && sp.ct >= 0.6);

  // ---- presets ----
  const pr = R(`(() => {
    const names = ['dashStrike', 'finisherRing', 'chargeFlash', 'chargeReady'];
    const out = {};
    const prev = SETTINGS.get('reducedParticles');
    for (const n of names) {
      const has = typeof VFX.PRESETS[n] === 'function';
      let full = 0, red = 0;
      if (has) {
        VFX.clear && VFX.clear();
        SETTINGS.set('reducedParticles', false);
        let a = VFX.activeCount; VFX.emit(n, 100, 100, 0, '#ffd34d'); full = VFX.activeCount - a;
        SETTINGS.set('reducedParticles', true);
        a = VFX.activeCount; VFX.emit(n, 100, 100, 0, '#ffd34d'); red = VFX.activeCount - a;
      }
      out[n] = { has, full, red };
    }
    SETTINGS.set('reducedParticles', prev);
    return out;
  })()`);
  for (const n of ['dashStrike', 'finisherRing', 'chargeFlash', 'chargeReady']) {
    const p = pr[n];
    check('VFX preset ' + n + ' exists and spawns particles (' + p.full + ')', p.has && p.full > 0);
    check('VFX preset ' + n + ' spawns no more under reducedParticles (' + p.red + ' <= ' + p.full + ')', p.has && p.red <= p.full);
  }
};
