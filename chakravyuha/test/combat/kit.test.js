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

  // =================== Task 2: press/hold machine, charged variants, bow, pad parity ===================
  const hasMachine = R(`typeof Player.prototype.releaseCharged === 'function'`);
  check('Player.releaseCharged exists', hasMachine);
  if (!hasMachine) return;

  // ---- tap string ----
  const tap = R(`(() => {
    const P = __kit.boot('khanda');
    __kit.dummy(P, 60, 0);
    const idx = [];
    for (let i = 0; i < 3; i++) {
      INPUT.lmb = true; P.update(${DT}); idx.push(P.comboIdx); INPUT.lmb = false;
      __kit.step(P, DATA.WEAPONS.khanda.rate + 0.02);
    }
    return { idx, kind: P.chargeKind, charge: P.charge };
  })()`);
  check('melee tap presses spaced by rate produce the full string (comboIdx ' + JSON.stringify(tap.idx) + ')', JSON.stringify(tap.idx) === '[1,2,3]');
  check('melee taps never start a charge', tap.kind === null && tap.charge === 0);

  // ---- hold: no auto-repeat, charge after delay, release fires once ----
  const hold = R(`(() => {
    const P = __kit.boot('khanda');
    const e = __kit.dummy(P, 60, 0);
    const rec = __kit.record();
    try {
      const out = {};
      INPUT.lmb = true; P.update(${DT});
      out.firstSwing = P.comboIdx === 1;
      let k = 0; while (P.holdT < DATA.KIT.chargeDelay - 1e-9 && k++ < 120) { out.preKind = P.chargeKind; P.update(${DT}); }
      out.kindAtDelay = P.chargeKind;
      out.noRepeat = P.comboIdx === 1;
      __kit.step(P, 0.2);
      out.noRepeatLater = P.comboIdx === 1;
      out.charge = P.charge;
      out.wantCharge = Math.min(1, (P.holdT - DATA.KIT.chargeDelay) / DATA.WEAPONS.khanda.charged.time);
      rec.log.length = 0;
      INPUT.lmb = false; P.update(${DT});
      out.chargedHits = rec.log.filter(c => c.opts.charged).length;
      out.kindAfter = P.chargeKind; out.chargeAfter = P.charge;
      P.update(${DT}); P.update(${DT});
      out.extra = rec.log.filter(c => c.opts.charged).length;
      // short hold: below 0.35 charge fires nothing extra
      P.atkCd = 0; P.comboT = 0; P.comboIdx = 0;
      __kit.step(P, 0.3);
      INPUT.lmb = true; P.update(${DT});
      while (P.holdT < DATA.KIT.chargeDelay + 0.05) P.update(${DT});
      out.shortCharge = P.charge;
      rec.log.length = 0;
      INPUT.lmb = false; P.update(${DT});
      out.shortHits = rec.log.filter(c => c.opts.charged).length;
      return out;
    } finally { rec.restore(); }
  })()`);
  check('melee hold: swing #1 fires on the press edge', hold.firstSwing);
  check('melee hold: no auto-repeat while held', hold.noRepeat && hold.noRepeatLater);
  check('melee hold: chargeKind is set once holdT reaches chargeDelay 0.28 (' + hold.kindAtDelay + ')', hold.kindAtDelay === 'thrust' && (hold.preKind === null || hold.preKind === undefined));
  check('melee hold: charge fills over charged.time (' + hold.charge.toFixed(3) + ' ~ ' + hold.wantCharge.toFixed(3) + ')', Math.abs(hold.charge - hold.wantCharge) < 0.04);
  check('melee release with charge >= 0.35 fires the charged variant once', hold.chargedHits === 1 && hold.extra === 1 && hold.kindAfter === null && hold.chargeAfter === 0);
  check('melee release below 0.35 charge fires nothing extra (charge ' + hold.shortCharge.toFixed(3) + ')', hold.shortCharge < 0.35 && hold.shortHits === 0);

  // ---- khanda thrust geometry ----
  const th = R(`(() => {
    const P = __kit.boot('khanda');
    const w = DATA.WEAPONS.khanda, ch = w.charged;
    const inA = __kit.dummy(P, 60, 0);
    const inB = __kit.dummy(P, 200, 0, false);
    const offAcross = __kit.dummy(P, 120, ch.width / 2 + 21 + 8, false);
    const beyond = __kit.dummy(P, ch.len + 40, 0, false);
    const behind = __kit.dummy(P, -50, 0, false);
    INPUT.wx = P.x + 300; INPUT.wy = P.y;
    P.update(${DT});
    const rec = __kit.record();
    try {
      P.releaseCharged(0.8);
      const by = e => rec.log.filter(c => c.e === e);
      const a = by(inA), b = by(inB);
      return {
        a: a.length, b: b.length, off: by(offAcross).length, beyond: by(beyond).length, behind: by(behind).length,
        base: a.length ? a[0].base : null, want: w.combo[2] * ch.mult * 0.8,
        opts: a.length ? (a[0].opts.finisher === true && a[0].opts.charged === true) : false,
        low: (() => { rec.log.length = 0; P.releaseCharged(0.36); const l = by(inA); return l.length ? l[0].base : null; })(),
        wantLow: w.combo[2] * ch.mult * 0.5,
      };
    } finally { rec.restore(); }
  })()`);
  check('khanda thrust pierces every enemy inside the 220 x 34 rectangle', th.a === 1 && th.b === 1);
  check('khanda thrust misses enemies outside the rectangle (across/beyond/behind)', th.off === 0 && th.beyond === 0 && th.behind === 0);
  check('khanda thrust damage = combo[2] * 2.2 * max(0.5, charge) {finisher, charged}', th.base === th.want && th.opts && th.low === th.wantLow);

  // ---- gada smash ----
  const sm = R(`(() => {
    const P = __kit.boot('gada');
    const w = DATA.WEAPONS.gada, ch = w.charged;
    const e = __kit.dummy(P, 150, 0);
    const far = __kit.dummy(P, 0, ch.radius + 40, false);
    P.update(${DT});
    const rec = __kit.record(), vfx = __kit.recordVfx();
    const punch = CAMERA.punch; let punched = 0;
    CAMERA.punch = function () { punched++; return punch.apply(this, arguments); };
    try {
      P.releaseCharged(1);
      const h = rec.log.filter(c => c.e === e);
      return {
        n: h.length, base: h.length ? h[0].base : null, want: w.combo[0] * ch.mult,
        opts: h.length ? (h[0].opts.finisher === true && h[0].opts.charged === true) : false,
        stun: e.stun, far: rec.log.filter(c => c.e === far).length, punched, flash: vfx.names.includes('chargeFlash'),
      };
    } finally { rec.restore(); vfx.restore(); CAMERA.punch = punch; }
  })()`);
  check('gada smash hits inside 170 px for combo[0] * 2.5 * max(0.5, charge) {finisher, charged}', sm.n === 1 && sm.base === sm.want && sm.opts);
  check('gada smash misses enemies beyond its radius', sm.far === 0);
  check('gada smash stuns non-boss enemies 0.6 (' + sm.stun + ')', Math.abs(sm.stun - 0.6) < 1e-9);
  check('gada smash calls CAMERA.punch and emits chargeFlash', sm.punched >= 1 && sm.flash);

  // ---- buffered press ----
  const buf = R(`(() => {
    const P = __kit.boot('khanda');
    __kit.dummy(P, 60, 0);
    const out = {};
    INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false; P.update(${DT});
    // recovery left ~0.1 s: press now, it should swing when atkCd reaches 0
    while (P.atkCd > 0.1) P.update(${DT});
    INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false;
    out.buffered = P.bufT > 0 && P.comboIdx === 1;
    let n = 0; while (P.comboIdx === 1 && n++ < 30) P.update(${DT});
    out.swungAfter = P.comboIdx === 2; out.frames = n;
    // a press with more than 0.15 s of recovery left expires before atkCd reaches 0
    P.atkCd = 0.3;
    INPUT.lmb = true; P.update(${DT}); INPUT.lmb = false;
    __kit.step(P, 0.35);
    out.expired = P.comboIdx === 2;
    return out;
  })()`);
  check('a press during recovery is buffered', buf.buffered);
  check('the buffered press swings when atkCd reaches 0 (' + buf.frames + ' frames)', buf.swungAfter && buf.frames <= 7);
  check('a buffered press expires after 0.15 s', buf.expired);

  // ---- gandiva perfect release ----
  const pf = R(`(() => {
    const out = {};
    const run = (lateFrames, flashOn) => {
      const P = __kit.boot('gandiva');
      __kit.dummy(P, 300, 0);
      SETTINGS.set('screenFlash', flashOn);
      const vfx = __kit.recordVfx();
      const fl = VFX.flash; let flashes = 0;
      VFX.flash = function () { flashes++; return fl.apply(this, arguments); };
      try {
        INPUT.lmb = true;
        let n = 0; while (P.charge < 1 && n++ < 120) P.update(${DT});
        for (let i = 0; i < lateFrames; i++) P.update(${DT});
        const before = GAME.pprojectiles.length;
        flashes = 0; vfx.names.length = 0;
        INPUT.lmb = false; P.update(${DT});
        const s = GAME.pprojectiles.slice(before);
        return { n: s.length, s: s[0], flashes, cf: vfx.names.includes('chargeFlash'), fullAt: P.fullAt };
      } finally { vfx.restore(); VFX.flash = fl; }
    };
    const prev = SETTINGS.get('screenFlash');
    try {
      const w = DATA.WEAPONS.gandiva;
      const p = run(2, true), late = run(12, true), noFl = run(2, false);
      out.perfect = p.n === 1 && Math.abs(p.s.dmg - w.dmgMax * w.charged.mult) < 1e-9 && p.s.pierce === true
        && p.s.kb === w.charged.kb && p.s.color === '#fff4b0' && !!p.s.opts && p.s.opts.finisher === true;
      out.cf = p.cf; out.flashOn = p.flashes; out.flashOff = noFl.flashes; out.noFlCf = noFl.cf;
      out.late = late.n === 1 && Math.abs(late.s.dmg - w.dmgMax) < 1e-9 && !late.s.kb && late.s.pierce === true;
      out.reset = p.fullAt === -1 && late.fullAt === -1;
    } finally { SETTINGS.set('screenFlash', prev); }
    return out;
  })()`);
  check('gandiva release within 0.12 s of full draw is a perfect shot (x1.5, pierce, kb 300, #fff4b0, {finisher})', pf.perfect);
  check('gandiva perfect shot emits chargeFlash', pf.cf && pf.noFlCf);
  check('gandiva perfect shot flashes only when screenFlash is on (' + pf.flashOn + '/' + pf.flashOff + ')', pf.flashOn >= 1 && pf.flashOff === 0);
  check('gandiva late release is a normal full shot', pf.late);
  check('gandiva fullAt resets after each release', pf.reset);

  // ---- gandiva quick-shot finisher ----
  const qs = R(`(() => {
    const P = __kit.boot('gandiva');
    __kit.dummy(P, 300, 0);
    const counts = [], fin = [];
    for (let i = 0; i < 4; i++) {
      INPUT.lmb = true; __kit.step(P, 0.15);
      const before = GAME.pprojectiles.length;
      INPUT.lmb = false; P.update(${DT});
      const s = GAME.pprojectiles.slice(before);
      counts.push(s.length); fin.push(s.every(a => a.opts && a.opts.finisher === true));
      if (i === 2) {
        const angs = s.map(a => Math.atan2(a.vy, a.vx) - P.aim).sort((a, b) => a - b);
        globalThis.__qsAngs = angs;
      }
      __kit.step(P, DATA.WEAPONS.gandiva.rate + 0.02);
    }
    const out = { counts, fin, angs: globalThis.__qsAngs, q: P.quickShots };
    // slow cadence: a gap longer than the window restarts the count
    P.quickShots = 0;
    for (let i = 0; i < 3; i++) {
      INPUT.lmb = true; __kit.step(P, 0.15);
      const before = GAME.pprojectiles.length;
      INPUT.lmb = false; P.update(${DT});
      out.slowLast = GAME.pprojectiles.length - before;
      __kit.step(P, 1.0);
    }
    return out;
  })()`);
  check('gandiva: the third quick shot fires 3 arrows (' + JSON.stringify(qs.counts) + ')', JSON.stringify(qs.counts) === '[1,1,3,1]');
  check('gandiva quick-shot finisher arrows carry {finisher:true} at aim +/-0.12', qs.fin[2] && !qs.fin[0] && !!qs.angs && Math.abs(qs.angs[0] + 0.12) < 1e-6 && Math.abs(qs.angs[1]) < 1e-6 && Math.abs(qs.angs[2] - 0.12) < 1e-6);
  check('gandiva quick-shot counter resets after the finisher', qs.q === 1);
  check('gandiva quick shots slower than 0.9 s apart never finish', qs.slowLast === 1);

  // ---- pad parity ----
  const pad = R(`(() => {
    const out = {};
    const saved = { device: INPUT.device, lmb: INPUT.lmb, ax: INPUT.ax, ay: INPUT.ay, wx: INPUT.wx, wy: INPUT.wy,
      prev: PAD._prevPressed, idx: PAD.state.index, aim: PAD._aimAng, nav: globalThis.navigator };
    if (!PAD.bindings) PAD.loadBindings();      // lazily loaded on the first poll
    const padB = JSON.stringify(PAD.bindings), kbB = JSON.stringify(INPUT.bindings);
    const gp = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) };
    const btn = (b, on) => { gp.buttons[PAD.CFG.BTN[b]] = { pressed: on, value: on ? 1 : 0 }; };
    const frames = Math.round((DATA.KIT.chargeDelay + DATA.WEAPONS.gada.charged.time * 0.6) * 60);
    const kbm = () => {
      const P = __kit.boot('gada'); __kit.dummy(P, 120, 0);
      const rec = __kit.record();
      try {
        INPUT.lmb = true; for (let i = 0; i < frames; i++) P.update(${DT});
        const charge = P.charge; INPUT.lmb = false; P.update(${DT});
        const c = rec.log.filter(x => x.opts.charged);
        return { charge, base: c.length ? c[0].base : null };
      } finally { rec.restore(); }
    };
    try {
      const k = kbm();
      globalThis.navigator = { getGamepads: () => [gp] };
      PAD._prevPressed = {}; PAD.state.index = -1; PAD._aimAng = null;
      const P = __kit.boot('gada'); const e = __kit.dummy(P, 120, 0);
      INPUT.device = 'pad'; PAD.poll();
      const rec = __kit.record();
      let pc = 0, pbase = null;
      try {
        btn('A', true);
        for (let i = 0; i < frames; i++) { PAD.poll(); P.update(${DT}); }
        pc = P.charge;
        btn('A', false); PAD.poll(); P.update(${DT});
        const c = rec.log.filter(x => x.opts.charged); pbase = c.length ? c[0].base : null;
      } finally { rec.restore(); }
      out.kbm = k; out.pad = { charge: pc, base: pbase };
      // pad dash (B) then a pad attack press inside the window -> dashStrike
      const P2 = __kit.boot('khanda'); __kit.dummy(P2, 200, 0);
      INPUT.device = 'pad'; PAD._prevPressed = {}; PAD.poll();
      let ds = 0; const orig = P2.dashStrike;
      P2.dashStrike = function () { ds++; return orig.apply(this, arguments); };
      btn('B', true); PAD.poll(); out.dashed = P2.dashT > 0; btn('B', false);
      let n = 0; while (P2.dashT > 0 && n++ < 60) { PAD.poll(); P2.update(${DT}); }
      PAD.poll(); P2.update(${DT}); P2.update(${DT});
      btn('A', true); PAD.poll(); P2.update(${DT});
      btn('A', false); PAD.poll(); P2.update(${DT});
      out.padDashStrike = ds;
      out.bindingsSame = JSON.stringify(PAD.bindings) === padB && JSON.stringify(INPUT.bindings) === kbB;
    } finally {
      if (saved.nav === undefined) delete globalThis.navigator; else globalThis.navigator = saved.nav;
      INPUT.device = saved.device; INPUT.lmb = saved.lmb; INPUT.ax = saved.ax; INPUT.ay = saved.ay;
      INPUT.wx = saved.wx; INPUT.wy = saved.wy;
      PAD._prevPressed = saved.prev; PAD.state.index = saved.idx; PAD._aimAng = saved.aim;
    }
    return out;
  })()`);
  check('pad hold charges like kbm (charge ' + pad.pad.charge.toFixed(3) + ' vs ' + pad.kbm.charge.toFixed(3) + ')', Math.abs(pad.pad.charge - pad.kbm.charge) < 1e-9 && pad.kbm.charge > 0.35);
  check('pad release fires the same charged variant as kbm (' + pad.pad.base + ' vs ' + pad.kbm.base + ')', pad.kbm.base !== null && pad.pad.base === pad.kbm.base);
  check('pad dash (B) then pad attack inside 0.2 s triggers dashStrike()', pad.dashed && pad.padDashStrike === 1);
  check('PAD.bindings / INPUT.bindings unchanged by the kit', pad.bindingsSame);

  const rm = R(`JSON.stringify([PAD.VFX_RUMBLE.dashStrike, PAD.VFX_RUMBLE.chargeFlash, PAD.VFX_RUMBLE.finisherRing])`);
  check('PAD.VFX_RUMBLE maps dashStrike->hit, chargeFlash->crit, finisherRing->crit', rm === '["hit","crit","crit"]');
};
