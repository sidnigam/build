// 05.7.1-08 (D-18/D-19/D-20, COMBAT-02): Hades-close camera. Base zoom Z under the kill-zoom punch
// (z = Z·p), context zoom per room (combat 1.3, boss/mini 1.15, rest 1.4, hub 1), zoom-aware
// scroll clamp, snap-on-room-change, and (Task 2) threat/astra indicators + capped threat bias.
'use strict';
module.exports = function ({ R, sandbox, check, section, harness }) {
  const J = JSON.stringify;
  const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

  const has = R(`typeof CAMERA.zoomTarget === 'function' && !!CAMERA.CFG.ZOOM`);
  check('CAMERA.zoomTarget() and CAMERA.CFG.ZOOM exist', has);
  if (!has) return;

  const cfg = R(`({ zoom: CAMERA.CFG.ZOOM, rate: CAMERA.CFG.ZOOM_RATE, ov: CAMERA.CFG.ZOOM_OVERRIDE,
    tbm: CAMERA.CFG.THREAT_BIAS_MAX, tbr: CAMERA.CFG.THREAT_BIAS_R, tr: CAMERA.CFG.THREAT_RATE,
    la: CAMERA.CFG.LOOK_AIM, lam: CAMERA.CFG.LOOK_AIM_MAX, lm: CAMERA.CFG.LOOK_MOVE })`);
  check(`CFG.ZOOM = {combat 1.3, boss 1.15, large 1.2, rest 1.4}, ZOOM_RATE 3, ZOOM_OVERRIDE null (got ${J(cfg.zoom)}, ${cfg.rate}, ${cfg.ov})`,
    cfg.zoom.combat === 1.3 && cfg.zoom.boss === 1.15 && cfg.zoom.large === 1.2 && cfg.zoom.rest === 1.4
      && cfg.rate === 3 && cfg.ov === null);
  check(`look-ahead tunables unchanged (LOOK_AIM 0.06, MAX 40, MOVE 20; quick 261019-nnu)`,
    cfg.la === 0.06 && cfg.lam === 40 && cfg.lm === 20);

  // ---------------- pure math at Z ∈ {1, 1.15, 1.3, 1.4} ----------------
  section('camera: pure zoom math');
  for (const Z of [1, 1.15, 1.3, 1.4]) {
    const m = R(`(() => {
      CAMERA.resetFx(); CAMERA.Z = ${Z}; CAMERA.sx = 321.5; CAMERA.sy = -77.25;
      CAMERA._store(CAMERA.xform());
      const o = CAMERA.worldToScreen(CAMERA.sx, CAMERA.sy);
      let rt = 0;
      for (let i = 0; i < 25; i++) {
        const wx = Math.random() * 3000 - 500, wy = Math.random() * 2000 - 500;
        const s = CAMERA.worldToScreen(wx, wy), w = CAMERA.screenToWorld(s.x, s.y);
        rt = Math.max(rt, Math.abs(w.x - wx), Math.abs(w.y - wy));
      }
      const v = CAMERA.viewRect(0);
      return { ox: o.x, oy: o.y, rt, vw: v.w, vh: v.h, vx: v.x, vy: v.y, tz: CAMERA.tz };
    })()`);
    check(`Z=${Z}: worldToScreen(S) = (0,0), round-trip <= 1e-9, viewRect = ${(1280 / Z).toFixed(1)} x ${(720 / Z).toFixed(1)} at S (got ${m.vw.toFixed(1)} x ${m.vh.toFixed(1)})`,
      near(m.ox, 0, 1e-9) && near(m.oy, 0, 1e-9) && m.rt <= 1e-9
        && near(m.vw, 1280 / Z, 1e-9) && near(m.vh, 720 / Z, 1e-9)
        && near(m.vx, 321.5, 1e-9) && near(m.vy, -77.25, 1e-9) && m.tz === Z);
  }

  // punch composes on top of the base zoom
  for (const Z of [1, 1.3]) {
    const p = R(`(() => {
      SETTINGS.set('screenShake', true);
      CAMERA.resetFx(); CAMERA.Z = ${Z}; CAMERA.sx = 400; CAMERA.sy = 250;
      CAMERA.punch(900, 600, 0.08, 0.6); CAMERA.update(0.1);
      CAMERA.kx = 3; CAMERA.ky = -2;
      CAMERA._store(CAMERA.xform());
      const F = CAMERA.worldToScreen(CAMERA.fx, CAMERA.fy);
      const s = CAMERA.shakeScale();
      const r = { fx: F.x, fy: F.y, ex: ${Z} * (CAMERA.fx - CAMERA.sx) + CAMERA.kx * s, ey: ${Z} * (CAMERA.fy - CAMERA.sy) + CAMERA.ky * s,
        tz: CAMERA.tz, pulse: CAMERA.zoomPulse(), tx: CAMERA.tx, ty: CAMERA.ty,
        old: { tx: CAMERA.fx - CAMERA.zoom * CAMERA.fx - CAMERA.sx + CAMERA.kx * s, ty: CAMERA.fy - CAMERA.zoom * CAMERA.fy - CAMERA.sy + CAMERA.ky * s } };
      CAMERA.resetFx(); SETTINGS.reset();
      return r;
    })()`);
    const zOk = near(p.tz, Z * p.pulse, 1e-12) && p.pulse > 1;
    const focusOk = near(p.fx, p.ex, 1e-9) && near(p.fy, p.ey, 1e-9);
    const legacyOk = Z !== 1 || (near(p.tx, p.old.tx, 1e-9) && near(p.ty, p.old.ty, 1e-9));
    check(`Z=${Z} + punch: tz = Z·zoomPulse() (${p.tz.toFixed(4)}), focus F maps to Z·(F − S) + k${Z === 1 ? ', equals the 05.1 formula' : ''}`,
      zOk && focusOk && legacyOk);
  }

  // zoom-aware clamp
  const cl = R(`(() => {
    const Rr = { x: -70, y: -116, w: 2480, h: 1610 };
    CAMERA.Z = 1.3;
    const hi = CAMERA.clampScroll(1e6, 1e6, Rr);           // default z = this.Z
    const hi1 = CAMERA.clampScroll(1e6, 1e6, Rr, 1);
    const lo = CAMERA.clampScroll(-1e6, -1e6, Rr, 1.3);
    const narrow = { x: 100, y: 50, w: 400, h: 200 };
    const c = CAMERA.clampScroll(0, 0, narrow, 1.4);
    CAMERA.Z = 1;
    return { hi, hi1, lo, c };
  })()`);
  check(`clampScroll(dx, dy, R, z): hi = R.x + R.w − VW/z (z=1.3 -> ${cl.hi.x.toFixed(2)}, ${cl.hi.y.toFixed(2)}; z=1 -> ${cl.hi1.x}, ${cl.hi1.y}); centred when lo > hi`,
    near(cl.hi.x, -70 + 2480 - 1280 / 1.3) && near(cl.hi.y, -116 + 1610 - 720 / 1.3)
      && cl.hi1.x === 1130 && cl.hi1.y === 774 && cl.lo.x === -70 && cl.lo.y === -116
      && near(cl.c.x, (100 + 100 + 400 - 1280 / 1.4) / 2) && near(cl.c.y, (50 + 50 + 200 - 720 / 1.4) / 2));

  const ds = R(`(() => {
    const P = { x: 1200, y: 760 }, Rr = { x: -70, y: -116, w: 2480, h: 1610 };
    const a = CAMERA.anchor();
    const d = CAMERA.desiredScroll(P, { x: P.x, y: P.y }, { x: 0, y: 0 }, Rr, 1.3);
    CAMERA.Z = 1.3; CAMERA.resetFx(); CAMERA.sx = d.x; CAMERA.sy = d.y; CAMERA._store(CAMERA.xform());
    const s = CAMERA.worldToScreen(P.x, P.y);
    CAMERA.Z = 1;
    return { sx: s.x, sy: s.y, ax: a.x, ay: a.y };
  })()`);
  check(`desiredScroll at Z=1.3 puts the player on the screen anchor (${ds.sx.toFixed(2)}, ${ds.sy.toFixed(2)} vs ${ds.ax}, ${ds.ay})`,
    near(ds.sx, ds.ax, 1e-9) && near(ds.sy, ds.ay, 1e-9));

  // ---------------- context zoom ----------------
  section('camera: context zoom');
  R(`globalThis.__cam = {
    room(id) {
      GAME.startRun();
      if (id === 'miniboss') GAME.roomIdx = GAME.biome.miniRoom - 1;
      ROOMS.enterRoom(id);
      return { Z: CAMERA.Z, ZT: CAMERA.ZT, tz: CAMERA.tz, sx: CAMERA.sx, sy: CAMERA.sy, wr: ROOMS.worldRect(),
        target: CAMERA.zoomTarget(), state: GAME.state, mini: !!GAME.miniRef, boss: !!GAME.bossRef };
    },
  };`);
  const ctxCase = (id, want, label) => {
    const r = R(`(() => { const r = __cam.room('${id}'); CAMERA.snap(); r.Z = CAMERA.Z; r.tz = CAMERA.tz; r.sx = CAMERA.sx; r.sy = CAMERA.sy; return r; })()`);
    const w = R(`CAMERA.CFG.ZOOM.${want}`);
    const inX = r.sx >= r.wr.x - 1e-9 && r.sx <= r.wr.x + r.wr.w - 1280 / r.Z + 1e-9;
    const inY = r.sy >= r.wr.y - 1e-9 && r.sy <= r.wr.y + r.wr.h - 720 / r.Z + 1e-9;
    check(`${label}: zoomTarget() = ZOOM.${want} (${w}); snap() sets Z = ZT = tz = ${r.Z} with the scroll clamped (${r.sx.toFixed(1)}, ${r.sy.toFixed(1)})`,
      near(r.target, w) && near(r.Z, w) && near(r.ZT, w) && near(r.tz, w) && inX && inY);
    return r;
  };
  ctxCase('mudra', 'combat', 'combat room');
  ctxCase('boss', 'boss', 'boss room');
  const mini = ctxCase('miniboss', 'boss', 'mini-boss room');
  check('mini-boss room really is a mini-boss room (GAME.miniRef set, bossRef null)', mini.mini && !mini.boss);
  ctxCase('sarovar', 'rest', 'sarovar (rest) room');
  ctxCase('kubera', 'rest', 'kubera (rest) room');

  // enterRoom alone (no extra snap call) already lands on the new zoom: no swoop on room change
  const entry = R(`(() => { __cam.room('mudra'); const a = CAMERA.Z; ROOMS.enterRoom('sarovar'); const b = CAMERA.Z; ROOMS.enterRoom('boss'); const c = CAMERA.Z; return { a, b, c }; })()`);
  check(`ROOMS.enterRoom snaps the zoom: combat ${entry.a} -> rest ${entry.b} -> boss ${entry.c}`,
    near(entry.a, 1.3) && near(entry.b, 1.4) && near(entry.c, 1.15));

  // hub identity, override, never below 1, large arenas
  const misc = R(`(() => {
    const out = {};
    GAME.startRun(); ROOMS.enterRoom('mudra');
    CAMERA.CFG.ZOOM_OVERRIDE = 1.1; out.ov = CAMERA.zoomTarget();
    CAMERA.CFG.ZOOM_OVERRIDE = 0.5; out.ovLow = CAMERA.zoomTarget();
    CAMERA.CFG.ZOOM_OVERRIDE = null;
    const saved = Object.assign({}, GAME.arena);
    Object.assign(GAME.arena, { w: 3000, h: 1800 }); out.large = CAMERA.zoomTarget();
    Object.assign(GAME.arena, saved);
    const savedState = GAME.state;
    GAME.state = 'hub'; CAMERA.sx = 500; CAMERA.sy = 500; CAMERA.Z = 1.3; CAMERA.follow(1 / 60);
    out.hub = { Z: CAMERA.Z, ZT: CAMERA.ZT, tx: CAMERA.tx, ty: CAMERA.ty, tz: CAMERA.tz, t: CAMERA.zoomTarget() };
    GAME.state = savedState;
    const P = GAME.player; GAME.player = null; out.noPlayer = CAMERA.zoomTarget(); GAME.player = P;
    return out;
  })()`);
  check(`ZOOM_OVERRIDE wins when set (1.1 -> ${misc.ov}) but never below 1 (0.5 -> ${misc.ovLow})`, near(misc.ov, 1.1) && misc.ovLow === 1);
  check(`oversized combat arena (> 1.05 × sizes.combat area) -> ZOOM.large (${misc.large})`, near(misc.large, 1.2));
  check(`hub / no player: zoomTarget() = 1, follow() forces Z = 1 and the identity transform (${J(misc.hub)}, no player ${misc.noPlayer})`,
    misc.hub.Z === 1 && misc.hub.ZT === 1 && misc.hub.tx === 0 && misc.hub.ty === 0 && misc.hub.tz === 1 && misc.hub.t === 1 && misc.noPlayer === 1);

  // eased zoom inside a room: follow(dt) eases Z toward ZT at ZOOM_RATE
  const ease = R(`(() => {
    GAME.startRun(); ROOMS.enterRoom('mudra'); GAME.state = 'combat';
    INPUT.wx = GAME.player.x; INPUT.wy = GAME.player.y; INPUT.ax = 0; INPUT.ay = 0;
    CAMERA.Z = 1;   // as if a context change just happened mid-room
    const zs = [];
    for (let f = 0; f < 120; f++) { CAMERA.follow(1 / 60); zs.push(CAMERA.Z); }
    let mono = true; for (let i = 1; i < zs.length; i++) if (zs[i] < zs[i - 1] - 1e-12) mono = false;
    const R2 = ROOMS.worldRect();
    return { z1: zs[0], z60: zs[59], z120: zs[119], mono, sx: CAMERA.sx, sy: CAMERA.sy, wr: R2, Z: CAMERA.Z };
  })()`);
  const expect1s = 1.3 - 0.3 * Math.exp(-3);
  check(`follow(dt) eases Z monotonically toward ZT (1 s: ${ease.z60.toFixed(4)} ≈ ${expect1s.toFixed(4)}; 2 s: ${ease.z120.toFixed(4)} within 0.01 of 1.3)`,
    ease.mono && ease.z1 > 1 && ease.z1 < 1.02 && Math.abs(ease.z60 - expect1s) < 0.01 && Math.abs(ease.z120 - 1.3) < 0.01);
  check('while easing, the scroll stays clamped inside the world rect at the live zoom',
    ease.sx >= ease.wr.x - 1e-9 && ease.sx <= ease.wr.x + ease.wr.w - 1280 / ease.Z + 1e-9
      && ease.sy >= ease.wr.y - 1e-9 && ease.sy <= ease.wr.y + ease.wr.h - 720 / ease.Z + 1e-9);

  // leaving the hub snaps (no swoop on run start)
  const hubOut = R(`(() => {
    GAME.state = 'hub'; CAMERA.follow(1 / 60);
    GAME.startRun();              // enterRoom's snap runs while the state is still 'hub' on a real run start
    GAME.state = 'combat';
    CAMERA.follow(1 / 60);
    return CAMERA.Z;
  })()`);
  check(`first combat frame after the hub snaps Z to the combat zoom (${hubOut})`, near(hubOut, 1.3));

  // every zoomed context still covers the viewport (no blank margins)
  const cover = R(`(() => {
    const out = [];
    for (const id of ['mudra', 'boss', 'sarovar']) {
      GAME.startRun(); ROOMS.enterRoom(id);
      const wr = ROOMS.worldRect(), v = CAMERA.viewRect(0);
      out.push({ id, ok: CAMERA.Z >= 1 && v.x >= wr.x - 1e-6 && v.y >= wr.y - 1e-6
        && v.x + v.w <= wr.x + wr.w + 1e-6 && v.y + v.h <= wr.y + wr.h + 1e-6 });
    }
    return out;
  })()`);
  check(`the zoomed view stays inside the world rect in combat/boss/rest rooms (${J(cover.map(c => c.id + ':' + c.ok))})`, cover.every(c => c.ok));

  // Pixi worldContainer + bridge counter-transform at the new zoom
  const br = R(`(() => {
    const mk = () => ({ position: { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } }, scale: { x: 1, y: 1, set(s) { this.x = s; this.y = s; } } });
    const wc = mk(), bs = mk(), sW = SPRITES.worldContainer, sB = SPRITES.bridgeSprite;
    SPRITES.worldContainer = wc; SPRITES.bridgeSprite = bs;
    try {
      GAME.startRun(); ROOMS.enterRoom('mudra'); GAME.shake = 0;
      SETTINGS.set('screenShake', true);
      CAMERA.punch(GAME.player.x + 50, GAME.player.y, 0.08, 0.6); CAMERA.update(0.1); CAMERA.kick(4, 3);
      CAMERA.begin();
      let ok = true;
      for (let i = 0; i < 10; i++) {
        const W = { x: Math.random() * 2000, y: Math.random() * 1200 };
        const px = wc.scale.x * W.x + wc.position.x, py = wc.scale.y * W.y + wc.position.y;
        const cx = CAMERA.tz * W.x + CAMERA.tx, cy = CAMERA.tz * W.y + CAMERA.ty;
        const bx = bs.position.x + cx * bs.scale.x, by = bs.position.y + cy * bs.scale.y;
        const bsx = wc.scale.x * bx + wc.position.x, bsy = wc.scale.y * by + wc.position.y;
        const e = CAMERA.worldToScreen(W.x, W.y);
        if (Math.abs(px - e.x) > 1e-6 || Math.abs(py - e.y) > 1e-6 || Math.abs(bsx - e.x) > 1e-6 || Math.abs(bsy - e.y) > 1e-6) ok = false;
      }
      return { ok, tz: CAMERA.tz, Z: CAMERA.Z };
    } finally { SPRITES.worldContainer = sW; SPRITES.bridgeSprite = sB; CAMERA.resetFx(); SETTINGS.reset(); }
  })()`);
  check(`Pixi worldContainer == bridge counter-transform == worldToScreen at Z=${br.Z} with punch+kick (tz ${br.tz.toFixed(4)})`, br.ok && br.tz > br.Z);

  R(`CAMERA.resetFx(); INPUT.ax = 0; INPUT.ay = 0;`);
};
