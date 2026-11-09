// js/renderer.js — CAMERA global (Phase 2: drives PixiJS worldContainer; ctx transform removed)
// Phase 3: adds shake-intensity scaling + opt-out (VFX-02), kill-zoom punch and
// directional kick (VFX-02), all reading SETTINGS at call time (no top-level ref).
// Phase 05.7.1-08 (D-18/D-19): base + context zoom Z under the punch pulse p (z = Z·p):
//   screen = z·(world − F) + Z·(F − S) + k     tz = Z·p
//   tx = Z·(F.x − S.x) − z·F.x + k.x            (with Z = 1 this is exactly the 05.1 D-06 formula)
// S is the world top-left of the unpunched view; the clamp/desired scroll use the VW/Z × VH/Z view.
'use strict';

const CAMERA = {
  x: 0, y: 0, zoom: 1, shake: 0,   // D-05: neutral init (legacy fields — unused, left at 0)

  // kill-zoom punch state (D-14)
  punchAmt: 0, punchT: 0, punchDur: 0, fx: 0, fy: 0,
  // directional kick state (D-13)
  kx: 0, ky: 0,

  // ---- Phase 05.1: scroll/transform state (D-05) ----
  sx: 0, sy: 0,               // world coord of the view's top-left, pre-shake, unpunched (base zoom Z)
  tx: 0, ty: 0, tz: 1,        // last full transform: screen = world * tz + (tx, ty)
  VW: 1280, VH: 720,          // viewport size
  // ---- 05.7.1-08 (D-18/D-19): base zoom (Z, eased) and its context target (ZT) ----
  Z: 1, ZT: 1,
  _tb: { x: 0, y: 0 },        // eased threat bias (world px) added to the look-ahead

  CFG: {
    FOLLOW_RATE: 6,       // tunable: exponential follow damping rate (1/s)
    LOOK_AIM: 0.06,         // tunable: look-ahead fraction toward aim
    LOOK_AIM_MAX: 40,     // tunable: max look-ahead-toward-aim magnitude (px)
    LOOK_MOVE: 20,         // tunable: look-ahead-toward-movement magnitude (px)
    SNAP_DIST: 900,        // tunable: distance beyond which the camera snaps instead of easing
    CULL_MARGIN: 48,       // tunable: default AABB cull margin (px)
    IND_INSET: { l: 28, r: 28, t: 96, b: 64 },  // tunable: off-screen indicator inset rect
    IND_SECTORS: 16,       // tunable: angular buckets for indicator clustering
    IND_MAX: 8,            // tunable: max indicator arrows shown at once
    // 05.7.1-08: Hades-close base zoom per room context (D-18/D-19). Never below 1 (no blank margins).
    ZOOM: { combat: 1.3, boss: 1.15, large: 1.2, rest: 1.4 },  // tunable
    ZOOM_RATE: 3,          // tunable: exponential ease rate of Z toward ZT (1/s)
    ZOOM_OVERRIDE: null,   // number pins the base zoom (tests / tooling); null = context zoom
    THREAT_BIAS_MAX: 60,   // tunable: max lean toward winding/long-shot threats (px)
    THREAT_BIAS_R: 900,    // tunable: threats farther than this from the player are ignored (px)
    THREAT_RATE: 2,        // tunable: ease rate of the applied threat bias (1/s)
  },

  // D-13: 0..1 multiplier applied to GAME.shake and to the kick/punch systems.
  // typeof SETTINGS undefined (should not happen post-Plan-01, but stay defensive) -> full intensity.
  shakeScale() {
    if (typeof SETTINGS === 'undefined') return 1;
    return SETTINGS.get('screenShake') ? SETTINGS.get('shakeIntensity') : 0;
  },

  // D-14: kill-zoom camera punch, focused on a world point. Overlapping punches take the max.
  punch(wx, wy, amount, dur) {
    if (this.shakeScale() === 0) return;
    // Small (non-boss) kill punches are rate-limited: dense waves were re-triggering the zoom
    // pulse several times a second, which read as the whole world constantly pumping.
    if (amount < 0.05) {
      const now = (typeof GAME !== 'undefined' && GAME.time) || 0;
      if (this._lastSmallPunch !== undefined && now - this._lastSmallPunch < 0.6) return;
      this._lastSmallPunch = now;
    }
    if (amount >= this.punchAmt) {
      this.fx = wx; this.fy = wy;
      this.punchAmt = amount;
      this.punchDur = dur;
      this.punchT = dur;
    }
  },

  // D-13: directional impulse (player hurt knock, finisher). Camera motion — off with shakeScale 0.
  kick(dx, dy) {
    if (this.shakeScale() === 0) return;
    this.kx += dx; this.ky += dy;
    const mag = Math.hypot(this.kx, this.ky);
    if (mag > 12) { const k = 12 / mag; this.kx *= k; this.ky *= k; }
  },

  // Quick attack over the first 20% of the pulse, then an ease-out cubic back to 0.
  zoomPulse() {
    if (this.punchT <= 0) return 1;
    const u = 1 - this.punchT / this.punchDur;
    const env = u < 0.2 ? u / 0.2 : Math.pow(1 - (u - 0.2) / 0.8, 3);
    return 1 + this.punchAmt * env;
  },

  // Called every real frame (js/game.js frame()) so punch/kick keep animating during hitstop.
  update(dt) {
    this.punchT = Math.max(0, this.punchT - dt);
    const k = Math.exp(-dt * 18);
    this.kx *= k; this.ky *= k;
    this.zoom = this.zoomPulse();
  },

  resetFx() {
    this.punchAmt = 0; this.punchT = 0; this.punchDur = 0; this.fx = 0; this.fy = 0;
    this.kx = 0; this.ky = 0; this.zoom = 1;
    this._lastSmallPunch = undefined;   // clear the small-punch rate limit too
  },

  // ============================================================
  // Phase 05.1: pure world<->screen camera math (D-05..D-21).
  // Every method below reads GAME/DATA/INPUT/PAD at call time (typeof-guarded)
  // so load order (renderer.js loads before data.js/game.js) is irrelevant.
  // ============================================================

  // Cross-phase contract (05.4): the current room's padding (GAME.arenaPad, set by ROOMS.setArena)
  // drives the scroll clamp so the camera can reveal art placed outside the arena edge; falls back
  // to the legacy rest-size pad when no room has been entered yet (hub, pre-run, headless).
  pad() {
    if (typeof GAME !== 'undefined' && GAME.arenaPad) return GAME.arenaPad;
    const rest = typeof DATA !== 'undefined' && DATA.ARENA && DATA.ARENA.padBySize && DATA.ARENA.padBySize.rest;
    return rest || { l: 50, r: 50, t: 84, b: 56 };
  },

  // D-03: {x,y} = arena top-left minus padding; {w,h} = arena size plus padding on both axes.
  worldRectFor(A, pad) {
    return { x: A.x - pad.l, y: A.y - pad.t, w: A.w + pad.l + pad.r, h: A.h + pad.t + pad.b };
  },

  // Playfield center on screen — where the followed point (player + look-ahead) is aimed.
  anchor() {
    const pad = this.pad();
    return { x: this.VW / 2, y: (pad.t + this.VH - pad.b) / 2 };
  },

  // 05.7.1-08 (D-19): the base zoom this room context wants. Hub / no player -> 1 (identity);
  // boss or mini-boss room -> ZOOM.boss; rest rooms (sarovar/kubera) -> ZOOM.rest; combat ->
  // ZOOM.combat (ZOOM.large for oversized arenas — inert until 05.7.3 per-room sizes). Never below
  // the zoom at which the world rect still covers the viewport, and never below 1.
  zoomTarget() {
    const G = (typeof GAME !== 'undefined') ? GAME : null;
    if (!G || !G.player || G.state === 'hub') return 1;
    const C = this.CFG, Zc = C.ZOOM;
    const D = (typeof DATA !== 'undefined' && DATA.ARENA) ? DATA.ARENA : null;
    const A = G.arena || { w: this.VW, h: this.VH };
    const R = this.worldRectFor(A, this.pad());
    let t;
    if (typeof C.ZOOM_OVERRIDE === 'number') t = C.ZOOM_OVERRIDE;
    else {
      const alive = b => !!b && !b.dead;
      const restW = D && D.sizes && D.sizes.rest ? D.sizes.rest.w : 1180;
      const combat = D && D.sizes && D.sizes.combat ? D.sizes.combat : { w: 2240, h: 1300 };
      if (alive(G.bossRef) || alive(G.miniRef) || G.arenaKind === 'boss') t = Zc.boss;
      else if (G.reward === 'sarovar' || G.reward === 'kubera' || G.arenaKind === 'rest' || A.w <= restW) t = Zc.rest;
      else if (A.w * A.h > combat.w * combat.h * 1.05) t = Zc.large;
      else t = Zc.combat;
    }
    return Math.max(1, this.VW / R.w, this.VH / R.h, t);
  },

  // D-07: clamp a desired scroll (dx,dy) to the world rect R, one axis at a time, for a view of
  // VW/z × VH/z world px (05.7.1-08). If the world rect is narrower than the view on an axis,
  // center it instead of clamping.
  clampScroll(dx, dy, R, z = this.Z) {
    const loX = R.x, hiX = R.x + R.w - this.VW / z;
    const loY = R.y, hiY = R.y + R.h - this.VH / z;
    const x = loX > hiX ? (loX + hiX) / 2 : U.clamp(dx, loX, hiX);
    const y = loY > hiY ? (loY + hiY) / 2 : U.clamp(dy, loY, hiY);
    return { x, y };
  },

  // D-08: look-ahead toward the aim point (clamped) plus a small nudge toward movement direction.
  lookAhead(P, aimW, move) {
    const C = this.CFG;
    let vx = (aimW.x - P.x) * C.LOOK_AIM;
    let vy = (aimW.y - P.y) * C.LOOK_AIM;
    const len = Math.hypot(vx, vy);
    if (len > C.LOOK_AIM_MAX) { const k = C.LOOK_AIM_MAX / len; vx *= k; vy *= k; }
    const mx = (move && move.x) || 0, my = (move && move.y) || 0;
    return { x: vx + mx * C.LOOK_MOVE, y: vy + my * C.LOOK_MOVE };
  },

  // D-08: desired (unclamped-then-clamped) scroll so that P + look-ahead sits at the screen anchor.
  // The anchor is in screen px, so at base zoom z it sits anchor/z world px from the view's top-left.
  desiredScroll(P, aimW, move, R, z = this.Z, bias = null) {
    const la = this.lookAhead(P, aimW, move);
    if (bias) { la.x += bias.x; la.y += bias.y; }
    const a = this.anchor();
    return this.clampScroll(P.x + la.x - a.x / z, P.y + la.y - a.y / z, R, z);
  },

  // D-06 + 05.7.1-08: pure transform derivation. screen = z*(world - F) + Z*(F - S) + k, z = Z*p.
  // Does not store — call _store(this.xform()) to commit. shx/shy are extra jitter (e.g. bridge shake).
  xform(shx = 0, shy = 0) {
    const s = this.shakeScale();
    const Z = this.Z, p = this.zoom, z = Z * p;
    const fx = this.fx, fy = this.fy;
    const kx = this.kx * s + shx, ky = this.ky * s + shy;
    const tz = z;
    const tx = Z * (fx - this.sx) - z * fx + kx;
    const ty = Z * (fy - this.sy) - z * fy + ky;
    return { tx, ty, tz };
  },

  // Impure: commit a computed transform to CAMERA.tx/ty/tz.
  _store(x) { this.tx = x.tx; this.ty = x.ty; this.tz = x.tz; },

  worldToScreen(wx, wy) { return { x: wx * this.tz + this.tx, y: wy * this.tz + this.ty }; },
  screenToWorld(x, y) { return { x: (x - this.tx) / this.tz, y: (y - this.ty) / this.tz }; },

  // World-space rect currently visible on screen, expanded by margin on all sides.
  viewRect(margin = 0) {
    const tl = this.screenToWorld(0, 0);
    const w = this.VW / this.tz, h = this.VH / this.tz;
    return { x: tl.x - margin, y: tl.y - margin, w: w + margin * 2, h: h + margin * 2 };
  },

  // D-16: cheap AABB visibility tests used for culling.
  visible(x, y, r = 0, margin = this.CFG.CULL_MARGIN) {
    const R = this.viewRect(margin);
    return x + r >= R.x && x - r <= R.x + R.w && y + r >= R.y && y - r <= R.y + R.h;
  },
  visibleRect(x, y, w, h, margin = this.CFG.CULL_MARGIN) {
    const R = this.viewRect(margin);
    return x + w >= R.x && x <= R.x + R.w && y + h >= R.y && y <= R.y + R.h;
  },

  // D-16: null if (wx,wy) projects inside the inset rectangle; else the point where the ray from
  // the screen anchor to the projected point crosses the inset rectangle border, plus its angle.
  edgePoint(wx, wy, inset = this.CFG.IND_INSET) {
    const s = this.worldToScreen(wx, wy);
    const left = inset.l, right = this.VW - inset.r, top = inset.t, bottom = this.VH - inset.b;
    if (s.x >= left && s.x <= right && s.y >= top && s.y <= bottom) return null;
    const a = this.anchor();
    const dx = s.x - a.x, dy = s.y - a.y;
    let tMin = Infinity;
    if (dx !== 0) {
      for (const bx of [left, right]) {
        const t = (bx - a.x) / dx;
        if (t > 0 && t <= 1) {
          const y = a.y + dy * t;
          if (y >= top - 0.01 && y <= bottom + 0.01) tMin = Math.min(tMin, t);
        }
      }
    }
    if (dy !== 0) {
      for (const by of [top, bottom]) {
        const t = (by - a.y) / dy;
        if (t > 0 && t <= 1) {
          const x = a.x + dx * t;
          if (x >= left - 0.01 && x <= right + 0.01) tMin = Math.min(tMin, t);
        }
      }
    }
    if (!isFinite(tMin)) tMin = 1;
    return { x: a.x + dx * tMin, y: a.y + dy * tMin, angle: Math.atan2(dy, dx) };
  },

  // D-16/D-17: bucket off-screen items into <= opts.max indicator arrows.
  // items: [{x, y, kind: 'enemy'|'boss'|'door', color, sym}] (world coords).
  clusterIndicators(items, opts = {}) {
    const sectors = opts.sectors ?? this.CFG.IND_SECTORS;
    const max = opts.max ?? this.CFG.IND_MAX;
    const doors = [];
    const buckets = new Map();
    const vr = this.viewRect(0);
    const cx = vr.x + vr.w / 2, cy = vr.y + vr.h / 2;
    for (const it of items) {
      const ep = this.edgePoint(it.x, it.y);
      if (!ep) continue;
      if (it.kind === 'door') {
        doors.push({ x: ep.x, y: ep.y, angle: ep.angle, count: 1, kind: 'door', color: it.color, sym: it.sym });
        continue;
      }
      let sec = Math.floor(((ep.angle + Math.PI) / U.TAU) * sectors) % sectors;
      if (sec < 0) sec += sectors;
      if (!buckets.has(sec)) buckets.set(sec, { items: [], hasBoss: false });
      const b = buckets.get(sec);
      b.items.push({ it, ep, dist: U.dist(it.x, it.y, cx, cy) });
      if (it.kind === 'boss') b.hasBoss = true;
    }
    const bucketArr = [];
    for (const b of buckets.values()) {
      b.items.sort((p, q) => p.dist - q.dist);
      const rep = b.items[0];
      bucketArr.push({
        x: rep.ep.x, y: rep.ep.y, angle: rep.ep.angle, count: b.items.length,
        kind: b.hasBoss ? 'boss' : rep.it.kind, color: rep.it.color, sym: rep.it.sym,
        _dist: rep.dist, _hasBoss: b.hasBoss,
      });
    }
    bucketArr.sort((p, q) => {
      if (p._hasBoss !== q._hasBoss) return p._hasBoss ? -1 : 1;
      return p._dist - q._dist;
    });
    const truncated = bucketArr.slice(0, Math.max(0, max));
    const clean = arr => arr.map(o => { const { _dist, _hasBoss, ...rest } = o; return rest; });
    return [...clean(doors), ...clean(truncated)];
  },

  // Shared desired-scroll computation for follow()/snap(): identity (0,0) in the hub or with no player.
  // 05.7.1-08: hub / no player also forces the base zoom back to 1 (identity transform).
  _followTarget() {
    const G = (typeof GAME !== 'undefined') ? GAME : null;
    if (!G || !G.player || G.state === 'hub') { this.Z = this.ZT = 1; return null; }
    const P = G.player;
    const R = this.worldRectFor(G.arena, this.pad());
    const I = (typeof INPUT !== 'undefined') ? INPUT : { mx: P.x, my: P.y, ax: 0, ay: 0, keys: {}, bindings: null };
    const aimW = (typeof I.wx === 'number' && typeof I.wy === 'number') ? { x: I.wx, y: I.wy } : { x: I.mx, y: I.my };
    let move = { x: 0, y: 0 };
    if (I.ax || I.ay) {
      const m = Math.hypot(I.ax, I.ay);
      move = { x: I.ax / m, y: I.ay / m };
    } else if (typeof PAD !== 'undefined' && I.keys && I.bindings) {
      const mv = PAD.digitalMoveVector(I.keys, I.bindings);
      move = { x: mv.dx, y: mv.dy };
    }
    return this.desiredScroll(P, aimW, move, R);
  },

  // D-08: runs every real frame (GAME.frame()) with real dt — keeps animating during hitstop.
  // 05.7.1-08: Z eases toward the context target first, so the desired scroll uses the current Z.
  // Coming out of the hub (no follow target last frame) the zoom snaps instead of swooping.
  follow(dt) {
    this.ZT = this.zoomTarget();
    if (this._noTarget) this.Z = this.ZT;
    else this.Z += (this.ZT - this.Z) * (1 - Math.exp(-this.CFG.ZOOM_RATE * dt));
    const D = this._followTarget();
    this._noTarget = !D;
    if (!D) { this.sx = 0; this.sy = 0; this._store(this.xform()); return; }
    const dist = Math.hypot(D.x - this.sx, D.y - this.sy);
    if (dist > this.CFG.SNAP_DIST) {
      this.sx = D.x; this.sy = D.y;
    } else {
      const k = 1 - Math.exp(-this.CFG.FOLLOW_RATE * dt);
      this.sx += (D.x - this.sx) * k;
      this.sy += (D.y - this.sy) * k;
    }
    this._store(this.xform());
  },

  // Called by ROOMS.enterRoom after the player is placed — room changes never swoop.
  snap() {
    this.Z = this.ZT = this.zoomTarget();   // 05.7.1-08: room changes snap the zoom too (no swoop)
    const D = this._followTarget();
    this._noTarget = !D;
    if (!D) { this.sx = 0; this.sy = 0; this._store(this.xform()); return; }
    this.sx = D.x; this.sy = D.y;
    this._store(this.xform());
  },

  // D-06/D-10: compute+store the one shared transform (always — headless too, since tests/culling
  // read tx/ty/tz), then drive Pixi's worldContainer and counter-transform the bridge sprite so
  // bridge-canvas primitives (drawn in world space via applyCtx) land on the same screen pixels as
  // Pixi children.
  begin() {
    const scale = this.shakeScale();
    const s = (typeof GAME !== 'undefined' ? GAME.shake : 0) * scale;
    let shx = 0, shy = 0;
    if (s > 0.5) { shx = U.rand(-s, s) * 0.5; shy = U.rand(-s, s) * 0.5; }
    this._store(this.xform(shx, shy));            // always — headless too (tests + culling read tx/ty/tz)
    const wc = (typeof SPRITES !== 'undefined') && SPRITES.worldContainer;
    if (!wc) return;                              // headless / pre-init: skip Pixi/bridge wiring
    wc.position.set(this.tx, this.ty); wc.scale.set(this.tz);
    const bs = SPRITES.bridgeSprite;               // counter-transform: bridge pixels map 1:1 to screen pixels
    if (bs) { bs.position.set(-this.tx / this.tz, -this.ty / this.tz); bs.scale.set(1 / this.tz); }
  },

  // Set the bridge ctx's transform to the same tx/ty/tz driving worldContainer, so primitives drawn
  // in world coordinates land on the same screen pixels as Pixi children (CAM-03).
  applyCtx(ctx) { if (ctx && ctx.setTransform) ctx.setTransform(this.tz, 0, 0, this.tz, this.tx, this.ty); },
  resetCtx(ctx) { if (ctx && ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0); },

  // No ctx.restore needed — container transform persists until next begin().
  end() { /* no-op — worldContainer transform stays set */ },
};
