// 05.7.1-03 (D-14, COMBAT-11): the Hades cast model. The astra lodges where it lands, the
// player walks over it to recover the charge, and safety returns (8 s, room clear, room change,
// defiance revive) avoid soft-locks. All six cast boons still deal damage under the new model.
'use strict';
module.exports = function ({ R, check }) {
  const DT = 1 / 60;
  R(`globalThis.__cast = {
    boot(boons) {
      GAME.godMode = false;
      INPUT.ax = 0; INPUT.ay = 0; INPUT.lmb = false; INPUT.keys = {};
      META.lastWeapon = 'khanda';
      GAME.startRun(); ROOMS.enterRoom('mudra');
      GAME.state = 'combat';
      GAME.enemies = []; GAME.waves = []; GAME.spawnQueue = []; GAME.pillars = []; GAME.hazards = [];
      GAME.pprojectiles = []; GAME.eprojectiles = []; GAME.zones = []; GAME.orbits = []; GAME.rings = [];
      GAME.hitstop = 0; GAME.hitstopCd = 0;
      SETTINGS.set('hitstop', false);
      const P = GAME.player;
      const A = GAME.arena;
      P.x = A.x + A.w / 2; P.y = A.y + A.h / 2;
      P.maxhp = 1e6; P.hp = 1e6; P.iframes = 0; P.dashT = 0;
      for (const id of boons || []) P.addBoon(DATA.findBoon(id), 0);
      return P;
    },
    // immortal, stationary enemy that keeps the room in combat
    dummy(x, y, hp) {
      const e = new Enemy('bhuta', x, y, 1);
      e.spawnT = 0; e.hp = e.maxhp = hp || 1e6; e.spd = 0; e.update = function () {};
      GAME.enemies.push(e);
      return e;
    },
    // a keeper far behind the player so the room never clears by itself
    keeper(P) { const A = GAME.arena; return __cast.dummy(A.x + 40, A.y + 40); },
    aim(x, y) { INPUT.wx = x; INPUT.wy = y; GAME.player.aim = Math.atan2(y - GAME.player.y, x - GAME.player.x); },
    // mirrors GAME.frame(): GAME.time advances with the sim (the orbit hit cooldown reads it)
    tick() { GAME.time += ${DT}; GAME.update(${DT}); },
    run(sec, each) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { __cast.tick(); if (each) each(i); } },
    inflight() {
      return GAME.pprojectiles.filter(p => p.lodge && p.t > 0 && !p._lodged).length
        + GAME.orbits.filter(o => o.castAmmo && o.t > 0).length
        + GAME.zones.filter(z => z.castAmmo && z.t > 0).length;
    },
  };`);

  const has = R(`Array.isArray(GAME.lodged) && typeof GAME.lodgeAt === 'function' && typeof Player.prototype.returnCast === 'function'`);
  check('GAME.lodged, GAME.lodgeAt and Player.returnCast exist', has);
  if (!has) return;

  // ---- no timed regen; lodged astras stay put ----
  const nr = R(`(() => {
    const P = __cast.boot();
    __cast.keeper(P);
    __cast.aim(P.x + 1000, P.y);
    P.tryCast(); __cast.run(0.1); P.tryCast();
    const out = { after: P.castCharges };
    let min = 9, max = -1;
    __cast.run(5, () => { min = Math.min(min, P.castCharges); max = Math.max(max, P.castCharges); });
    out.min = min; out.max = max; out.lodged = GAME.lodged.length;
    const A = GAME.arena;
    out.inside = GAME.lodged.every(l => l.x >= A.x && l.x <= A.x + A.w && l.y >= A.y && l.y <= A.y + A.h);
    return out;
  })()`);
  check('two casts empty the charges (' + nr.after + ')', nr.after === 0);
  check('no timed regen: charges stay 0 for 5 s while the astras lie untouched', nr.min === 0 && nr.max === 0);
  check('each cast that ends lodges one astra inside the arena (' + nr.lodged + ')', nr.lodged === 2 && nr.inside);

  // ---- lodge on hit (non-pierce) and dur_cast at end of range ----
  const lh = R(`(() => {
    const out = {};
    let P = __cast.boot();
    __cast.keeper(P);
    const e = __cast.dummy(P.x + 150, P.y);
    __cast.aim(e.x, e.y);
    P.tryCast();
    __cast.run(0.5);
    out.hitLodged = GAME.lodged.length === 1 && Math.abs(GAME.lodged[0].x - e.x) < e.r + 20;
    out.hit = e.hp < e.maxhp;
    P = __cast.boot(['dur_cast']);
    __cast.keeper(P);
    const e2 = __cast.dummy(P.x + 150, P.y);
    __cast.aim(P.x + 300, P.y);
    const x0 = P.x;
    P.tryCast();
    __cast.run(2);
    out.pierceLodged = GAME.lodged.length === 1 && GAME.lodged[0].x - x0 > 400;
    out.pierceHit = e2.hp < e2.maxhp;
    return out;
  })()`);
  check('a non-pierce cast lodges where it hits', lh.hit && lh.hitLodged);
  check('dur_cast pierces and lodges at the end of its range', lh.pierceHit && lh.pierceLodged);

  // ---- pickup + magnet ----
  const pk = R(`(() => {
    const P = __cast.boot();
    __cast.keeper(P);
    P.castCharges = 1;
    GAME.lodgeAt(P.x + 80, P.y);
    const l = GAME.lodged[0], x0 = l.x;
    GAME.update(${DT});
    const out = { slid: GAME.lodged.length === 1 && GAME.lodged[0].x < x0 };
    __cast.run(0.5);
    out.picked = GAME.lodged.length === 0 && P.castCharges === 2;
    // outside the magnet radius it stays put
    P.castCharges = 1;
    GAME.lodgeAt(P.x + 200, P.y);
    const x1 = GAME.lodged[0].x;
    __cast.run(0.5);
    out.still = GAME.lodged.length === 1 && GAME.lodged[0].x === x1 && P.castCharges === 1;
    return out;
  })()`);
  check('a lodged astra within 90 px slides toward the player', pk.slid);
  check('walking over a lodged astra restores 1 charge and removes it', pk.picked);
  check('a lodged astra beyond the magnet radius stays put', pk.still);

  // ---- safety returns ----
  const sr = R(`(() => {
    const out = {};
    let P = __cast.boot();
    __cast.keeper(P);
    P.castCharges = 0;
    GAME.lodgeAt(P.x + 400, P.y);
    __cast.run(7.9); out.before8 = P.castCharges === 0 && GAME.lodged.length === 1;
    __cast.run(0.2); out.after8 = P.castCharges === 1 && GAME.lodged.length === 0;
    // room clear returns all
    P = __cast.boot();
    P.castCharges = 0;
    GAME.lodgeAt(P.x + 400, P.y); GAME.lodgeAt(P.x + 420, P.y + 60);
    const k = __cast.dummy(P.x - 300, P.y, 1);
    hitEnemy(k, 10, 'zone');
    GAME.update(${DT});
    out.clearState = GAME.state;
    out.clear = P.castCharges === 2 && GAME.lodged.length === 0;
    // room change returns all (and in-flight ammo)
    P = __cast.boot();
    __cast.keeper(P);
    P.castCharges = 0;
    GAME.lodgeAt(P.x + 400, P.y);
    GAME.pprojectiles.push({ x: P.x, y: P.y, vx: 560, vy: 0, dmg: 42, r: 9, t: 1, pierce: false, src: 'cast', chakra: true, lodge: true, color: '#ffd34d', hitSet: new Set() });
    ROOMS.enterRoom('mudra');
    out.room = P.castCharges === 2 && GAME.lodged.length === 0;
    // defiance revive returns all
    P = __cast.boot();
    __cast.keeper(P);
    P.castCharges = 0; P.defiance = 1;
    GAME.lodgeAt(P.x + 400, P.y);
    P.hp = 0; GAME.onPlayerDeath();
    out.revive = P.castCharges === 1 && GAME.lodged.length === 0 && P.hp > 0;
    return out;
  })()`);
  check('a lodged astra returns its charge after 8 s', sr.before8 && sr.after8);
  check('room clear returns every lodged astra (state ' + sr.clearState + ')', sr.clearState === 'cleared' && sr.clear);
  check('ROOMS.enterRoom returns lodged and in-flight astras before resetting', sr.room);
  check('a defiance revive returns every lodged astra', sr.revive);

  // ---- invariant over a 60 s sim ----
  const inv = R(`(() => {
    const P = __cast.boot(['kri_cast']);
    __cast.keeper(P);
    let bad = 0, maxSum = 0, frames = 0, casts = 0;
    const A = GAME.arena;
    for (let i = 0; i < 3600; i++) {
      // swap the cast boon mid-run to exercise every shape (orbit, cyclone, projectile)
      if (i === 1200) { delete P.boonRanks.kri_cast; P.addBoon(DATA.findBoon('vayu_cast'), 0); }
      if (i === 2400) { delete P.boonRanks.vayu_cast; delete P.slots.cast; }
      if (i % 20 === 0) { const c0 = P.castCharges; P.tryCast(); if (P.castCharges < c0) casts++; }
      // wander so some astras are picked up and some time out
      const t = i / 60;
      INPUT.ax = Math.cos(t * 0.7); INPUT.ay = Math.sin(t * 1.1);
      __cast.aim(P.x + Math.cos(t) * 300, P.y + Math.sin(t) * 300);
      __cast.tick();
      const sum = P.castCharges + GAME.lodged.length + __cast.inflight();
      maxSum = Math.max(maxSum, sum);
      if (sum > P.castMax) bad++;
      frames++;
    }
    INPUT.ax = 0; INPUT.ay = 0;
    return { bad, maxSum, frames, casts, max: P.castMax };
  })()`);
  check('invariant castCharges + lodged + in-flight <= castMax at every frame of 60 s (' + inv.bad + ' bad, max ' + inv.maxSum + ', ' + inv.casts + ' casts)', inv.bad === 0 && inv.frames === 3600 && inv.casts >= 6);

  // ---- six cast boons ----
  const boonIds = ['han_cast', 'dur_cast', 'agni_cast', 'indra_cast', 'kri_cast', 'vayu_cast'];
  for (const id of boonIds) {
    const b = R(`(() => {
      const P = __cast.boot(['${id}']);
      __cast.keeper(P);
      // the Sudarshana orbit circles at 70 px, so its dummy stands on the orbit path
      const e = __cast.dummy(P.x + ('${id}' === 'kri_cast' ? 70 : 150), P.y);
      __cast.aim(e.x, e.y);
      const out = { stun: 0, fire: false, lodgedAfter: false };
      P.tryCast();
      let sawEffect = false;
      for (let i = 0; i < 480; i++) {
        __cast.tick();
        out.stun = Math.max(out.stun, e.stun);
        if (GAME.zones.some(z => z.type === 'fire')) out.fire = true;
        const live = GAME.orbits.length + GAME.zones.filter(z => z.type === 'cyclone').length;
        if (live) sawEffect = true;
        if (sawEffect && !live && (GAME.lodged.length || P.castCharges === P.castMax)) out.lodgedAfter = true;
      }
      out.dmg = e.maxhp - e.hp;
      out.sawEffect = sawEffect;
      return out;
    })()`);
    check(id + ' still deals damage under the lodged model (' + Math.round(b.dmg) + ')', b.dmg > 0);
    if (id === 'han_cast') check('han_cast still stuns 1 s on hit (' + b.stun + ')', b.stun >= 0.99);
    if (id === 'agni_cast') check('agni_cast still drops a fire pool on hit', b.fire);
    if (id === 'kri_cast' || id === 'vayu_cast') check(id + ': the ammo lodges (or is recovered) after the effect ends', b.sawEffect && b.lodgedAfter);
  }

  // kri/vayu: lodged entry appears exactly when the effect ends
  const kv = R(`(() => {
    const out = {};
    let P = __cast.boot(['kri_cast']);
    __cast.keeper(P);
    P.tryCast();
    const o = GAME.orbits[0]; o.t = 0.01;
    const lodge = GAME.lodgeAt; let at = null;
    GAME.lodgeAt = function (x, y) { at = { x, y }; return lodge.apply(this, arguments); };
    try { GAME.update(${DT}); } finally { GAME.lodgeAt = lodge; }
    out.kri = !!at && Math.abs(at.x - P.x) < 20 && Math.abs(at.y - P.y) < 20;
    P = __cast.boot(['vayu_cast']);
    __cast.keeper(P);
    P.tryCast();
    const z = GAME.zones.find(q => q.type === 'cyclone'); z.t = 0.01;
    at = null;
    GAME.lodgeAt = function (x, y) { at = { x, y }; return lodge.apply(this, arguments); };
    try { GAME.update(${DT}); } finally { GAME.lodgeAt = lodge; }
    out.vayu = !!at && Math.abs(at.x - z.x) < 1 && Math.abs(at.y - z.y) < 1;
    return out;
  })()`);
  check('kri_cast orbit lodges an astra at the player when it expires', kv.kri);
  check('vayu_cast cyclone lodges an astra where it dies', kv.vayu);

  // agni_cast drops a pool where the astra lodges if it hit nothing
  const ag = R(`(() => {
    const P = __cast.boot(['agni_cast']);
    __cast.keeper(P);
    __cast.aim(P.x + 1000, P.y);
    P.tryCast();
    let lodgedAt = null;
    for (let i = 0; i < 120 && !lodgedAt; i++) { GAME.update(${DT}); if (GAME.lodged.length) lodgedAt = GAME.lodged[0]; }
    const pool = lodgedAt && GAME.zones.find(z => z.type === 'fire' && U.dist(z.x, z.y, lodgedAt.x, lodgedAt.y) < 30);
    return { lodged: !!lodgedAt, pool: !!pool };
  })()`);
  check('agni_cast drops a fire pool where a missed astra lodges', ag.lodged && ag.pool);

  // ---- HUD + indicators ----
  const hud = R(`(() => {
    const P = __cast.boot();
    __cast.keeper(P);
    P.castCharges = 1;
    GAME.lodgeAt(P.x + 3000, P.y);
    GAME.lodgeAt(P.x + 30, P.y + 400);
    const items = GAME.indicatorItems().filter(i => i.kind === 'astra');
    let threw = null;
    try { GAME.renderHUD(document.getElementById('game').getContext('2d')); } catch (e) { threw = String(e); }
    return { n: items.length, color: items.every(i => i.color === '#ffd34d'), threw };
  })()`);
  check('indicatorItems() lists every lodged astra with kind astra (' + hud.n + ')', hud.n === 2 && hud.color);
  check('renderHUD draws lodged pips without throwing' + (hud.threw ? ' — ' + hud.threw : ''), hud.threw === null);
  R(`SETTINGS.set('hitstop', true)`);
};
