// ============================================================
// CHAKRAVYUHA — ai.js : enemy coordination (slots, attack tokens, range bands) + ENEMY_TG
// 05.7.1-04 (D-06, D-11, D-18). Ticked once per frame from GAME.update before the enemy loop,
// reset per room from ROOMS.enterRoom. Everything reads GAME/CAMERA/DATA at call time.
// Headless-safe: never reads the last rendered camera transform (RESEARCH Pitfall 3).
// ============================================================
'use strict';

// Enemy-side telegraph invariant, mirroring BOSS_TG.
// MIN: minimum wind-up seconds per attack kind. 'bite' (contact damage for chase/tank units)
// is the deliberate short exception: a 0.2 s lunge pose instead of a full wind-up.
// violations: strings logged when damage flows unarmed or a wind-up is shorter than MIN.
// windLog: {type, kind, wind} per armed attack. fireLog: {type, inView} per enemy shot.
const ENEMY_TG = {
  MIN: { melee: 0.30, ranged: 0.30, status: 0.40, stun: 0.50, beam: 0.70, bite: 0.20 },
  violations: [], windLog: [], fireLog: [],
  LOG_MAX: 4000,
  log(list, entry) { list.push(entry); if (list.length > this.LOG_MAX) list.shift(); },
  clear() { this.violations = []; this.windLog = []; this.fireLog = []; },
};

const ENEMY_AI = {
  CFG: {
    MELEE_R: 70, RANGED_BAND: [260, 380], SUPPORT_BAND: [260, 560],
    SLOTS_MELEE: 8, SLOTS_RANGED: 10,
    REPICK: [0.5, 1.0], CUT_BIAS: 0.7,             // rad: melee slot angles rotate toward the player's heading
    CUT_SCORE: 0.8,                                 // slot-choice pull toward the heading (escape cut)
    TOKENS: { melee: 2, ranged: 2, heavy: 1, support: 1, bite: 4 },
    TOKEN_BIOME: [0, 1, 1, 2],                     // added to melee and ranged per biome index
    VIEW_ZOOM: 1.3, VIEW_MARGIN: 40, LONG_TELL_BONUS: 0.3,
    SLOT_EDGE: 12,                                  // ranged slots sit this far inside the view band
    CLOSE_IN: 30,                                   // contact units close in once this near their slot ring
    CONTACT_AI: ['chase', 'tank'],                  // AIs whose damage is a contact bite
    NO_SLOT_AI: ['swarm'],                          // 05.7.1-05: AIs that never take a ring slot
    SEP_PUSH: 220, VAR: [1.0, 1.3],
    PV_RATE: 8,                                     // player-velocity smoothing rate (1/s)
  },
  holders: {}, slots: new Map(), pv: { x: 0, y: 0 }, _last: null,

  reset() {
    this.holders = {};
    this.slots = new Map();
    this.pv = { x: 0, y: 0 };
    this._last = null;
  },

  // ---- roles / rings ----
  role(e) { return (e && e.def && e.def.role) || null; },
  ringOf(e) {
    if (e && e.def && this.CFG.NO_SLOT_AI.includes(e.def.ai)) return null;   // swarms orbit on their own
    const r = this.role(e);
    if (r === 'melee' || r === 'heavy') return 'melee';
    if (r === 'ranged' || r === 'support') return 'ranged';
    return null;
  },
  ringSize(ring) { return ring === 'melee' ? this.CFG.SLOTS_MELEE : this.CFG.SLOTS_RANGED; },
  band(e) {
    if (e && e.def && e.def.band) return e.def.band;   // 05.7.1-05: per-type band (DATA.ENEMIES[*].band)
    return this.role(e) === 'support' ? this.CFG.SUPPORT_BAND : this.CFG.RANGED_BAND;
  },
  heading() { return Math.atan2(this.pv.y, this.pv.x); },
  cutK() { return U.clamp(Math.hypot(this.pv.x, this.pv.y) / 300, 0, 1); },

  // Slot angle for index i of its ring. Melee angles are each rotated toward the player's
  // heading by up to CUT_BIAS × (speed / 300), compressing the ring in front of a moving player.
  slotAngle(ring, i) {
    const n = this.ringSize(ring);
    let a = (i / n) * U.TAU;
    if (ring === 'melee') {
      const k = this.cutK();
      if (k > 0) {
        const d = U.angDiff(a, this.heading());
        const step = Math.min(Math.abs(d), this.CFG.CUT_BIAS * k);
        a += (d >= 0 ? 1 : -1) * step;
      }
    }
    return a;
  },

  // ---- attack tokens ----
  pool(cat) {
    const C = this.CFG;
    const biome = (typeof GAME !== 'undefined' && GAME.biomeIdx) || 0;
    let n = (C.TOKENS[cat] || 0) + ((cat === 'melee' || cat === 'ranged') ? (C.TOKEN_BIOME[biome] || 0) : 0);
    if (typeof GAME !== 'undefined' && GAME.heat && GAME.heat.tokens) n += GAME.heat.tokens;
    return n;
  },
  _set(cat) { return this.holders[cat] || (this.holders[cat] = new Set()); },
  _prune(set) { for (const e of set) if (!e || e.dead) { set.delete(e); if (e) e.tokenCat = null; } },
  requestToken(e, cat) {
    const set = this._set(cat);
    if (set.has(e)) return true;
    this._prune(set);
    if (set.size < this.pool(cat)) { set.add(e); e.tokenCat = cat; return true; }
    return false;
  },
  releaseToken(e) {
    if (!e) return;
    for (const cat in this.holders) this.holders[cat].delete(e);
    e.tokenCat = null;
  },
  holding(cat) { const s = this.holders[cat]; return s ? s.size : 0; },

  // ---- per-frame coordinator ----
  tick(dt) {
    const P = typeof GAME !== 'undefined' ? GAME.player : null;
    if (!P) return;
    const C = this.CFG;
    // player velocity estimate (exponential average)
    if (this._last && dt > 0) {
      const vx = (P.x - this._last.x) / dt, vy = (P.y - this._last.y) / dt;
      const k = 1 - Math.exp(-C.PV_RATE * dt);
      this.pv.x += (vx - this.pv.x) * k; this.pv.y += (vy - this.pv.y) * k;
    }
    this._last = { x: P.x, y: P.y };

    const list = GAME.enemies || [];
    const present = new Set(list);
    // reclaim tokens from dead / removed holders and from enemies no longer in an attack
    for (const cat in this.holders) {
      for (const e of this.holders[cat]) {
        if (!e || e.dead || !present.has(e) || (!e.windKind && !e.armedAtk && !e.holdToken)) { this.holders[cat].delete(e); if (e) e.tokenCat = null; }
      }
    }
    // drop slots of dead / removed enemies
    for (const e of this.slots.keys()) if (e.dead || !present.has(e)) this.slots.delete(e);

    // slot (re)assignment with hysteresis
    for (const e of list) {
      if (e.dead || e.boss) continue;
      const ring = this.ringOf(e);
      if (!ring) continue;
      e.slotT = (e.slotT || 0) - dt;
      const cur = this.slots.get(e);
      if (cur && cur.ring === ring && e.slotT > 0) continue;
      this.slots.set(e, { ring, i: this._pickSlot(e, ring, P) });
      e.slotT = U.rand(C.REPICK[0], C.REPICK[1]);
    }

    this._rally(list);

    // separation: O(n²) over living non-boss enemies
    const live = [];
    for (const e of list) if (!e.dead && !e.boss && !e.submerged) live.push(e);   // submerged units are underground
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const rr = (a.r || 0) + (b.r || 0);
        let dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-6) { const ang = (i * 2.399 + j * 0.7) % U.TAU; dx = Math.cos(ang); dy = Math.sin(ang); }
        else { dx /= d; dy /= d; }
        const push = Math.min(C.SEP_PUSH * dt, rr - d) / 2;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
      }
    }
  },

  // 05.7.1-05 (D-05/D-07): rallying elites and asura standard-bearers buff living allies within
  // their radius: rallied (×1.2 damage via Enemy.dmgMul) and, for banners, bannerSpd. Flags are
  // recomputed from scratch every tick, so a dead source's buff ends at once.
  _rally(list) {
    const M = DATA.ELITE_MODS;
    const src = [];
    for (const e of list) {
      if (e.dead || e.boss) continue;
      e.rallied = false; e.bannerSpd = 1;
      if (e.elite && e.elite.includes('rallying')) src.push({ e, r: M.rallying.r, spd: 1 });
      if (e.def && e.def.ai === 'buffer' && e.def.aura && !(e.spawnT > 0)) src.push({ e, r: e.def.aura.r, spd: e.def.aura.spd });
    }
    if (!src.length) return;
    for (const e of list) {
      if (e.dead || e.boss) continue;
      for (const s of src) {
        if (s.e === e || U.dist(s.e.x, s.e.y, e.x, e.y) > s.r) continue;
        e.rallied = true;
        if (s.spd > e.bannerSpd) e.bannerSpd = s.spd;
      }
    }
  },

  _slotPos(ring, i, e, P) {
    const a = this.slotAngle(ring, i);
    const rad = ring === 'melee' ? this.CFG.MELEE_R + (e.r || 0)
      : this._rangedR(e, a, P) + ((e.def && e.def.slotBack) || 0);
    return { x: P.x + Math.cos(a) * rad, y: P.y + Math.sin(a) * rad, a };
  },
  // ranged slot radius: mid band, pulled inside the view band so slots are firing positions
  _rangedR(e, a, P) {
    const b = this.band(e);
    const mid = (b[0] + b[1]) / 2;
    if (e && e.def && e.def.longRange) return mid;   // 05.7.1-05: snipers sit mid-band (long shots)
    const vb = this.viewBand(P);
    const hw = vb.w / 2, hh = vb.h / 2;
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const edge = Math.min(c > 1e-6 ? hw / c : Infinity, s > 1e-6 ? hh / s : Infinity);
    return Math.max(40, Math.min(mid, edge - this.CFG.SLOT_EDGE));
  },

  _pickSlot(e, ring, P) {
    const n = this.ringSize(ring);
    const taken = new Set();
    for (const [o, s] of this.slots) if (o !== e && s.ring === ring && !o.dead) taken.add(s.i);
    const full = taken.size >= n;
    const bearing = Math.atan2(e.y - P.y, e.x - P.x);
    const k = ring === 'melee' ? this.cutK() : 0;
    const hd = this.heading();
    const A = GAME.arena;
    let best = 0, bestS = Infinity;
    for (let i = 0; i < n; i++) {
      if (!full && taken.has(i)) continue;
      const sp = this._slotPos(ring, i, e, P);
      let score = Math.abs(U.angDiff(bearing, sp.a)) - this.CFG.CUT_SCORE * k * Math.cos(sp.a - hd);
      if (A) {
        const m = (e.r || 0) + 10;
        if (sp.x < A.x + m || sp.x > A.x + A.w - m || sp.y < A.y + m || sp.y > A.y + A.h - m) score += 3;
      }
      if (full && taken.has(i)) score += 0.01;   // beyond capacity: reuse, nearest first
      if (score < bestS) { bestS = score; best = i; }
    }
    return best;
  },

  slotPoint(e) {
    const P = GAME.player;
    const s = this.slots.get(e);
    if (!s || !P) return null;
    return this._slotPos(s.ring, s.i, e, P);
  },

  // Movement toward the assigned slot. No clamp here (Enemy.update clamps).
  steer(e, dt, mul = 1) {
    const P = GAME.player;
    if (!P) return;
    const spd = e.curSpeed() * mul;
    if (!(spd > 0)) return;
    const sp = this.slotPoint(e) || { x: P.x, y: P.y };
    const dP = U.dist(e.x, e.y, P.x, P.y);
    const moveTo = (tx, ty, s) => {
      const d = U.dist(e.x, e.y, tx, ty);
      if (d < 1e-6) return;
      const step = Math.min(d, s * dt);
      e.x += (tx - e.x) / d * step; e.y += (ty - e.y) / d * step;
    };
    const r = this.role(e);
    if (r === 'ranged' || r === 'support') {
      const b = this.band(e);
      const a = Math.atan2(e.y - P.y, e.x - P.x);
      const lo = Math.min(b[0], this._rangedR(e, a, P) - 40);
      if (dP < lo) {
        const ax = dP > 1e-6 ? (e.x - P.x) / dP : 1, ay = dP > 1e-6 ? (e.y - P.y) / dP : 0;
        e.x += ax * spd * dt; e.y += ay * spd * dt;
      } else if (dP > b[1] || (!(e.def && e.def.longRange) && !this.inViewBand(e.x, e.y, P))) moveTo(sp.x, sp.y, spd);
      else moveTo(sp.x, sp.y, spd * 0.6);
      return;
    }
    // melee / heavy: go to the slot; contact units close in once at the ring
    const contact = e.def && this.CFG.CONTACT_AI.includes(e.def.ai);
    if (contact && dP <= this.CFG.MELEE_R + (e.r || 0) + this.CFG.CLOSE_IN) moveTo(P.x, P.y, spd);
    else moveTo(sp.x, sp.y, spd);
  },

  // ---- D-18 view band: pure half-extent box around the player ----
  viewBand(P) {
    const cam = typeof CAMERA !== 'undefined' ? CAMERA : null;
    const Z = (cam && cam.CFG && cam.CFG.ZOOM && cam.CFG.ZOOM.combat) || this.CFG.VIEW_ZOOM;
    const VW = (cam && cam.VW) || 1280, VH = (cam && cam.VH) || 720;
    const hw = VW / (2 * Z) - this.CFG.VIEW_MARGIN, hh = VH / (2 * Z) - this.CFG.VIEW_MARGIN;
    return { x: P.x - hw, y: P.y - hh, w: 2 * hw, h: 2 * hh };
  },
  inViewBand(x, y, P) {
    if (!P) return false;
    const b = this.viewBand(P);
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  },

  // Timing variance only ever lengthens tells: >= max(MIN[kind], base), <= that × VAR[1].
  windTime(kind, base) {
    return Math.max(ENEMY_TG.MIN[kind] || 0.3, base) * U.rand(this.CFG.VAR[0], this.CFG.VAR[1]);
  },
};
