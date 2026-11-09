// ============================================================
// CHAKRAVYUHA — combat.js : shared combat rendering, statuses, projectile families
// 05.7.1-01: one telegraph/overlay renderer used by BOTH draw paths — the primitive fallback
// (Enemy.draw / Boss.draw in entities.js) and the sprite path (GAME.renderSpriteExtras in
// game.js). Before this, the sprite path (the shipped game once atlases load) drew only line and
// circle telegraphs and never drew boss marks (D-11 fairness gap, RESEARCH Pitfall 1).
// Top-level `function` declarations on purpose: tests spy by reassigning the global.
// ============================================================
'use strict';

/**
 * drawTelegraph(ctx, e) — draws e.telegraph, e.marks and Yama's active noose rope.
 * Returns the number of telegraph shapes drawn (telegraph + marks; the rope is not counted).
 */
function drawTelegraph(ctx, e) {
  if (!e || e.spawnT > 0) return 0;
  let n = 0;
  const pulse = 0.5 + 0.3 * Math.sin(GAME.time * 18);

  // ---- attack telegraph anchored on the attacker ----
  const tg = e.telegraph;
  if (tg) {
    // bosses grow the shape from 0 to full over the wind-up (fill-progress cue); regular
    // enemies keep the full size, as before
    const frac = (e.boss && e.windTotal) ? U.clamp(1 - e.t / e.windTotal, 0.08, 1) : 1;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#ff4444'; ctx.fillStyle = 'rgba(255,68,68,0.12)'; ctx.lineWidth = 2;
    if (tg.type === 'line') {
      const hw = tg.w ? tg.w / 2 : (e.boss ? e.r * 0.8 : e.r);   // tg.w: explicit width (javelineer)
      const len = tg.len * frac;
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(tg.a);
      ctx.fillRect(0, -hw, len, hw * 2);
      ctx.strokeRect(0, -hw, len, hw * 2);
      ctx.restore();
      n++;
    } else if (tg.type === 'circle') {
      ctx.beginPath(); ctx.arc(e.x, e.y, tg.r * frac, 0, U.TAU); ctx.fill(); ctx.stroke();
      n++;
    } else if (tg.type === 'cone') {
      ctx.beginPath(); ctx.moveTo(e.x, e.y);
      ctx.arc(e.x, e.y, tg.r * frac, tg.a - tg.arc / 2, tg.a + tg.arc / 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      n++;
    } else if (tg.type === 'ring') {
      ctx.lineWidth = Math.max(1, (tg.r1 - tg.r0) * frac);
      ctx.strokeStyle = 'rgba(255,68,68,0.35)';
      ctx.beginPath(); ctx.arc(e.x, e.y, (tg.r0 + tg.r1) / 2, 0, U.TAU); ctx.stroke();
      n++;
    }
    ctx.globalAlpha = 1;
  }

  // ---- world-anchored marks (summon points, noose path, teleport dest, lamps, beams, ledger) ----
  if (e.marks && e.marks.length) {
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#ff4444'; ctx.fillStyle = 'rgba(255,68,68,0.12)'; ctx.lineWidth = 2;
    for (const m of e.marks) {
      if (m.type === 'line') {
        ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.a);
        ctx.fillRect(0, -m.w / 2, m.len, m.w);
        ctx.strokeRect(0, -m.w / 2, m.len, m.w);
        ctx.restore();
        n++;
      } else if (m.type === 'circle') {
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, U.TAU); ctx.fill(); ctx.stroke();
        n++;
      } else if (m.type === 'band') {
        ctx.fillRect(m.x, m.y, m.w, m.h);
        ctx.strokeRect(m.x, m.y, m.w, m.h);
        n++;
      } else if (m.type === 'ringMark') {
        // expanding shockwave ring (kumbhakarna quake) — stroke only, no fill
        ctx.save();
        ctx.lineWidth = m.width;
        ctx.strokeStyle = 'rgba(255,68,68,0.55)';
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, U.TAU); ctx.stroke();
        ctx.restore();
        n++;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- Yama's noose rope (active pull only) ----
  if (e.boss && e.state === 'noose' && GAME.player) {
    const P = GAME.player;
    ctx.strokeStyle = '#9fb8ff'; ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(P.x, P.y); ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  return n;
}

/**
 * drawOverlays(ctx, e, headY, feetY) — status overlays shared by both paths.
 * headY: y of the top of the figure (primitive: e.y - e.r; sprite: SPRITES.headY).
 * feetY: y of the feet (primitive: e.y + e.r; sprite: e.y + e.r * FEET_OFFSET_R).
 * One block per overlay — later plans add elite auras/tags and status pips here.
 */
function drawOverlays(ctx, e, headY, feetY) {
  // 05.7.1-05: a submerged (diving) enemy is only a ripple on the surface — nothing else
  if (e.submerged) {
    const ph = (GAME.time * 2) % 1;
    ctx.strokeStyle = e.color; ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.ellipse(e.x, feetY, e.r * (0.8 + ph * 0.8), e.r * (0.3 + ph * 0.3), 0, 0, U.TAU); ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.ellipse(e.x, feetY, e.r * 1.6, e.r * 0.55, 0, 0, U.TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  // 05.7.1-05: asura standard-bearer — aura circle + a gold banner pole
  if (e.def && e.def.ai === 'buffer' && e.def.aura && !(e.spawnT > 0)) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(e.x, feetY, e.def.aura.r, 0, U.TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const top = headY - 26, px = e.x + e.r * 0.6;
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, feetY); ctx.lineTo(px, top); ctx.stroke();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px + 16, top + 6); ctx.lineTo(px, top + 12); ctx.closePath(); ctx.fill();
  }

  // burn pips
  if (e.burns && e.burns.length) {
    ctx.fillStyle = '#ff7040';
    const spacing = e.boss ? 10 : 8, rad = e.boss ? 4 : 3, ox = e.boss ? -10 : -8;
    const py = headY - (e.boss ? 12 : 8);
    for (let i = 0; i < e.burns.length; i++) {
      ctx.beginPath(); ctx.arc(e.x + ox + i * spacing, py, rad, 0, U.TAU); ctx.fill();
    }
  }

  // maya (Krishna) ring — at the feet so it reads under a tall sprite
  if (e.maya > 0) {
    ctx.strokeStyle = '#5c7cff'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(e.x, feetY, e.r + 4, (e.r + 4) * 0.4, 0, 0, U.TAU);
    ctx.stroke();
  }

  // stun glyph
  if (e.stun > 0) {
    ctx.fillStyle = '#ffd34d'; ctx.font = '12px Georgia';
    ctx.fillText('✦', e.x - 4, headY - 12);
  }

  // asleep zzz (bosses before the fight starts)
  if (e.asleep) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Georgia';
    ctx.fillText('z z z', e.x + e.r * 0.5, headY - 8);
  }

  // 05.7.1-05 (D-05): naga shield-guard's frontal guard arc while it holds
  if (e.guardHp > 0 && e.def && e.def.guardArc) {
    const midY = (headY + feetY) / 2, f = e.face || 0;
    ctx.strokeStyle = '#d8fff0'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(e.x, midY, e.r + 5, f - e.def.guardArc, f + e.def.guardArc); ctx.stroke();
    ctx.strokeStyle = e.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, midY, e.r + 5, f - e.def.guardArc, f + e.def.guardArc); ctx.stroke();
  }

  // 05.7.1-05 (D-07): elite aura ring in the first modifier's colour (slow pulse unless
  // screenFlash is off), warded hex ring while the ward is up
  const elite = e.elite && e.elite.length ? e.elite : null;
  const M = typeof DATA !== 'undefined' ? DATA.ELITE_MODS : null;
  if (elite && M) {
    const c0 = (M[elite[0]] && M[elite[0]].color) || '#ffffff';
    const calm = typeof SETTINGS !== 'undefined' && SETTINGS.get('screenFlash') === false;
    const midY = (headY + feetY) / 2;
    ctx.globalAlpha = calm ? 0.8 : 0.65 + 0.3 * Math.sin(GAME.time * 3);
    ctx.strokeStyle = c0 + '99'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, midY, e.r + 6, 0, U.TAU); ctx.stroke();
    if (elite.length > 1 && M[elite[1]]) {
      ctx.strokeStyle = M[elite[1]].color + '99'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, midY, e.r + 10, 0, U.TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (e.wardT > 0) {
      ctx.strokeStyle = M.warded.color; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * U.TAU + GAME.time * 0.8, rr = e.r + 14;
        const x = e.x + Math.cos(a) * rr, y = midY + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // hp bar for damaged non-boss enemies (elites always show theirs)
  const showBar = !e.boss && (e.hp < e.maxhp || elite);
  if (showBar) {
    const w = e.r * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - w / 2, feetY + 4, w, 4);
    ctx.fillStyle = '#ff5566';
    ctx.fillRect(e.x - w / 2, feetY + 4, w * U.clamp(e.hp / e.maxhp, 0, 1), 4);
  }
  if (elite && M) {
    const w = e.r * 2;
    // armor bar (grey, above the hp bar) while the armor holds
    if (e.armor > 0 && e.maxhp > 0) {
      const full = e.maxhp * M.armored.armorFrac;
      ctx.fillStyle = M.armored.color;
      ctx.fillRect(e.x - w / 2, feetY + 1, w * U.clamp(e.armor / full, 0, 1), 3);
    }
    // shield pips
    if (e.shieldHits > 0) {
      ctx.fillStyle = M.shielded.color;
      for (let i = 0; i < e.shieldHits; i++) {
        ctx.beginPath(); ctx.arc(e.x - (e.shieldHits - 1) * 4 + i * 8, headY - 4, 3, 0, U.TAU); ctx.fill();
      }
    }
    // name tag under the bar
    ctx.fillStyle = (M[elite[0]] && M[elite[0]].color) || '#ffffff';
    ctx.font = '10px Georgia';
    const tag = elite.map(m => (M[m] ? M[m].name : m)).join(' · ');
    const tw = ctx.measureText ? (ctx.measureText(tag).width || tag.length * 5) : tag.length * 5;
    ctx.fillText(tag, e.x - tw / 2, feetY + 18);
  }

  ctx.globalAlpha = 1;
}

// ============================================================
// 05.7.1-02 (D-10, D-11): PLAYER STATUSES
// All state lives on P.st. Statuses are applied ONLY by Player.takeDamage after a hit lands
// (dash / post-hit i-frames / god mode / dodge avoid them for free), by ground pools, or directly
// by tests. DoT ticks go through P.tickDamage — never takeDamage — so poison cannot grant free
// i-frames (RESEARCH Pitfall 2). Stun is capped, diminishing and followed by immunity
// (Pitfall 11). Reads GAME/DATA/SETTINGS/VFX/AUDIO at call time.
// ============================================================
const STATUS = {
  init(P) {
    P.st = {
      stunT: 0, stunMax: 0, stunImmT: 0, stunHist: [],
      slowT: 0, slowF: 1, slowMax: 0,
      rootT: 0, rootMax: 0,
      burns: [], poison: [],
      dotAcc: 0, burnAcc: 0, poisonAcc: 0,
      kx: 0, ky: 0, fxT: 0,
      clock: 0,                       // status-local sim clock (advanced in update) for the stun DR window
    };
  },

  // spec: one {type, ...} or an array of them. A stun in the same array drops knock/pull so a
  // stun can never shove the player into a hazard while they cannot react.
  apply(P, spec, fromX, fromY) {
    if (!spec || !P) return;
    if (!P.st) STATUS.init(P);
    const list = Array.isArray(spec) ? spec : [spec];
    const hasStun = list.some(s => s && s.type === 'stun');
    for (const s of list) {
      if (!s) continue;
      if (hasStun && (s.type === 'knock' || s.type === 'pull')) continue;
      STATUS._one(P, s, fromX, fromY);
    }
  },

  _one(P, s, fromX, fromY) {
    const st = P.st, D = DATA.STATUS;
    switch (s.type) {
      case 'stun': {
        const d = D.stun;
        if (st.stunImmT > 0) { STATUS._one(P, { type: 'slow', f: d.immuneSlowF, dur: s.dur }); return; }
        const cut = st.clock - d.drWindow;
        st.stunHist = st.stunHist.filter(t => t > cut);
        const dur = Math.min(d.max, s.dur || 0) * Math.pow(d.drFactor, st.stunHist.length);
        if (!(dur > 0)) return;
        st.stunHist.push(st.clock);
        if (dur > st.stunT) { st.stunT = dur; st.stunMax = dur; }
        GAME.shake = Math.max(GAME.shake, 4);
        AUDIO.sfx('stun');
        return;
      }
      case 'slow': {
        const f = s.f != null ? s.f : 0.6, dur = s.dur || 0;
        if (!(dur > 0)) return;
        st.slowF = Math.min(st.slowT > 0 ? st.slowF : 1, f);
        if (dur > st.slowT) { st.slowT = dur; st.slowMax = dur; }
        return;
      }
      case 'root': {
        const dur = Math.min(D.root.max, s.dur || 0);
        if (!(dur > 0)) return;
        if (dur > st.rootT) { st.rootT = dur; st.rootMax = dur; }
        AUDIO.sfx('root');
        return;
      }
      case 'burn':
      case 'poison': {
        const arr = s.type === 'burn' ? st.burns : st.poison;
        const dur = s.dur || 0;
        if (!(dur > 0)) return;
        arr.push({ dps: s.dps || 0, t: dur, max: dur });
        while (arr.length > D[s.type].maxStacks) arr.shift();
        return;
      }
      case 'knock':
      case 'pull': {
        let a;
        if (fromX === undefined || fromY === undefined || (fromX === P.x && fromY === P.y)) a = P.aim + Math.PI;
        else a = Math.atan2(P.y - fromY, P.x - fromX);
        if (s.type === 'pull') a += Math.PI;
        const f = s.force || 0;
        st.kx += Math.cos(a) * f; st.ky += Math.sin(a) * f;
        return;
      }
    }
  },

  update(P, dt) {
    const st = P.st;
    if (!st) return;
    const D = DATA.STATUS;
    st.clock += dt;
    if (st.stunT > 0) {
      st.stunT -= dt;
      if (st.stunT <= 0) { st.stunT = 0; st.stunMax = 0; st.stunImmT = D.stun.immunity; }
    } else if (st.stunImmT > 0) {
      st.stunImmT = Math.max(0, st.stunImmT - dt);
    }
    if (st.slowT > 0) { st.slowT -= dt; if (st.slowT <= 0) { st.slowT = 0; st.slowF = 1; st.slowMax = 0; } }
    if (st.rootT > 0) { st.rootT -= dt; if (st.rootT <= 0) { st.rootT = 0; st.rootMax = 0; } }

    // knock / pull velocity (exponential decay)
    if (st.kx || st.ky) {
      P.x += st.kx * dt; P.y += st.ky * dt;
      const f = Math.pow(D.knock.decay, dt);
      st.kx *= f; st.ky *= f;
      if (Math.hypot(st.kx, st.ky) < 1) { st.kx = 0; st.ky = 0; }
    }

    // DoT: damage accrues per frame (dps * time actually active), paid every `tick` and on expiry,
    // so a stack always deals dps * dur in total regardless of frame-boundary rounding.
    const burning = st.burns.length > 0, poisoned = st.poison.length > 0;
    if (!burning && !poisoned) { st.dotAcc = 0; return; }
    const accrue = (arr) => {
      let sum = 0;
      for (const s of arr) { sum += s.dps * Math.min(dt, Math.max(0, s.t)); s.t -= dt; }
      return sum;
    };
    if (burning) { st.burnAcc += accrue(st.burns); st.burns = st.burns.filter(s => s.t > 1e-9); }
    if (poisoned) { st.poisonAcc += accrue(st.poison); st.poison = st.poison.filter(s => s.t > 1e-9); }

    // status particles — only while a DoT is active (no U consumption otherwise)
    st.fxT -= dt;
    if (st.fxT <= 0) {
      const reduced = VFX.count(10) < 10;
      st.fxT = reduced ? 0.4 : 0.2;
      if (burning) VFX.emit('dot', P.x + U.rand(-8, 8), P.y - 10, 0, D.burn.color);
      if (poisoned) VFX.emit('dot', P.x + U.rand(-8, 8), P.y - 10, 0, D.poison.color);
    }

    st.dotAcc += dt;
    const due = st.dotAcc >= D.burn.tick - 1e-9;
    if (due) st.dotAcc -= D.burn.tick;
    const pay = (key, type, final) => {
      const n = Math.round(st[key]);
      if ((due || final) && n >= 1) { st[key] -= n; P.tickDamage(n, type); }
      if (final) st[key] = 0;
    };
    pay('burnAcc', 'burn', burning && st.burns.length === 0);
    if (P.st !== st) return;            // a lethal tick revived the player (defiance) and cleared statuses
    pay('poisonAcc', 'poison', poisoned && st.poison.length === 0);
  },

  stunned(P) { return !!P.st && P.st.stunT > 0; },
  rooted(P) { return !!P.st && P.st.rootT > 0; },
  slowFactor(P) { return P.st && P.st.slowT > 0 ? P.st.slowF : 1; },

  // [{type, t, max, stacks}] in display order: stun, root, slow, burn, poison
  active(P) {
    const st = P && P.st, out = [];
    if (!st) return out;
    if (st.stunT > 0) out.push({ type: 'stun', t: st.stunT, max: st.stunMax || st.stunT, stacks: 1 });
    if (st.rootT > 0) out.push({ type: 'root', t: st.rootT, max: st.rootMax || st.rootT, stacks: 1 });
    if (st.slowT > 0) out.push({ type: 'slow', t: st.slowT, max: st.slowMax || st.slowT, stacks: 1 });
    for (const type of ['burn', 'poison']) {
      const arr = type === 'burn' ? st.burns : st.poison;
      if (!arr.length) continue;
      let best = arr[0];
      for (const s of arr) if (s.t > best.t) best = s;
      out.push({ type, t: best.t, max: best.max, stacks: arr.length });
    }
    return out;
  },

  clear(P) { STATUS.init(P); },
};

/**
 * drawPlayerStatus(ctx, P, headY, feetY) — on-player status reads, shared by Player.draw
 * (primitive path) and GAME.renderPlayerSpriteExtras (sprite path).
 * No pulsing when SETTINGS.screenFlash is off (constant 0.6 alpha instead).
 */
function drawPlayerStatus(ctx, P, headY, feetY) {
  const st = P && P.st;
  if (!st) return;
  const D = DATA.STATUS;
  const flashOk = (typeof SETTINGS === 'undefined') || SETTINGS.get('screenFlash') !== false;
  const pulse = (k) => flashOk ? 0.45 + 0.25 * Math.sin(GAME.time * k) : 0.6;
  ctx.save();
  if (st.rootT > 0) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = D.root.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(P.x, feetY, P.r + 6, (P.r + 6) * 0.4, 0, 0, U.TAU); ctx.stroke();
  }
  if (st.slowT > 0) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = D.slow.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(P.x, feetY, P.r + 2, (P.r + 2) * 0.4, 0, 0, U.TAU); ctx.stroke();
  }
  if (st.burns.length) {
    ctx.globalAlpha = pulse(10);
    ctx.strokeStyle = D.burn.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(P.x, P.y, P.r + 5, 0, U.TAU); ctx.stroke();
  }
  if (st.poison.length) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = D.poison.color;
    const n = st.poison.length, sp = 6, x0 = P.x - (n - 1) * sp / 2;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x0 + i * sp, feetY + 8, 2.5, 0, U.TAU); ctx.fill(); }
  }
  if (st.stunT > 0) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = D.stun.color; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const a = GAME.time * 6 + i * U.TAU / 3;
      ctx.fillText(D.stun.icon, P.x + Math.cos(a) * 12, headY - 10 + Math.sin(a) * 4);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ============================================================
// 05.7.1-02 (D-09): DATA-DRIVEN ENEMY PROJECTILE FAMILIES
// DATA.PROJECTILES[fam] is pure data; PROJ.BEHAVIORS[def.behavior] = { update, hits, ... } and
// PROJ.DRAW[def.draw] are code. 'bolt' is today's generic enemy bullet and stays bit-identical:
// same fields, same movement/collision order, takeDamage(dmg) without a source point, no trail,
// no hit VFX, no sfx and no U draws. GAME.eprojectiles holds every family; GAME.epools holds
// lingering ground pools left by mortars/bombs that carry a `pool` extra.
// ============================================================
const PROJ = {
  CAP: 260,                 // soft cap: oldest destroyable projectiles are dropped first (Pitfall 7)
  HARD_CAP: 300,            // never exceeded, even when nothing is destroyable
  POOL_GRACE: 0.5,          // seconds before a fresh pool starts applying its status
  POOL_TICK: 0.5,
  _clock: 0,
  _sfxAt: {},
  _busy: false,             // true while updateAll iterates (no in-place splices then)

  def(p) { return DATA.PROJECTILES[p.fam] || DATA.PROJECTILES.bolt; },
  destroyable(p) { return (DATA.PROJECTILES[p.fam] || {}).destroyable !== false; },

  // '#rrggbb' + alpha hex, falling back to the family colour when a caller passed a non-hex colour
  _hexA(c, aa, fallback) {
    const base = /^#[0-9a-fA-F]{6}$/.test(c) ? c : (/^#[0-9a-fA-F]{6}$/.test(fallback) ? fallback : '#ffffff');
    return base + aa;
  },

  _sfx(name) {
    if (!name) return;
    if (PROJ._clock - (PROJ._sfxAt[name] != null ? PROJ._sfxAt[name] : -1) > 0.07) {
      AUDIO.sfx(name); PROJ._sfxAt[name] = PROJ._clock;
    }
  },

  // make room under the cap; returns false when HARD_CAP is full of non-destroyables
  _makeRoom() {
    const list = GAME.eprojectiles;
    if (PROJ._busy) {
      // mid-update: kill in place (t = 0); the end-of-update filter compacts the array
      let live = 0;
      for (const q of list) if (q.t > 0) live++;
      for (let i = 0; i < list.length && live >= PROJ.CAP; i++) {
        const q = list[i];
        if (q.t > 0 && PROJ.destroyable(q)) { q.t = 0; live--; }
      }
      return live < PROJ.HARD_CAP;
    }
    if (list.length >= PROJ.CAP) {
      for (let i = list.length - 1; i >= 0; i--) if (!(list[i].t > 0)) list.splice(i, 1);
    }
    while (list.length >= PROJ.CAP) {
      const i = list.findIndex(q => PROJ.destroyable(q));
      if (i < 0) break;
      list.splice(i, 1);
    }
    return list.length < PROJ.HARD_CAP;
  },

  /**
   * spawn(fam, o) -> projectile or null.
   * o: { x, y, vx, vy, dmg, color?, r?, life?, status?, owner?, extra? } — extra is spread onto the
   * projectile last (tx/ty, a, tell, ox/oy, gapA/gapArc, pool, speed, owner, status ...).
   */
  spawn(fam, o) {
    let def = DATA.PROJECTILES[fam];
    if (!def) { fam = 'bolt'; def = DATA.PROJECTILES.bolt; }
    const list = GAME.eprojectiles;
    const owner = o.owner || (o.extra && o.extra.owner) || null;
    if (def.perShooterCap && owner) {
      let n = 0;
      for (const q of list) if (q.fam === fam && q.owner === owner && q.t > 0) n++;
      if (n >= def.perShooterCap) return null;
    }
    if (!PROJ._makeRoom()) return null;
    let p;
    if (fam === 'bolt' && !o.extra) {
      // legacy shape: exactly today's {x, y, vx, vy, dmg, color, r, t: 4} + bookkeeping fields
      p = { x: o.x, y: o.y, vx: o.vx, vy: o.vy, dmg: o.dmg, color: o.color, r: o.r != null ? o.r : def.r,
        t: o.life != null ? o.life : def.life, fam, age: 0, status: o.status || null, owner, _tr: 0 };
    } else {
      p = { fam, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, dmg: o.dmg, color: o.color || def.color,
        r: o.r != null ? o.r : def.r, t: o.life != null ? o.life : def.life, age: 0,
        status: o.status !== undefined ? o.status : (def.status || null), owner, _tr: 0, ...o.extra };
    }
    list.push(p);
    PROJ._sfx(def.sfx);
    return p;
  },

  addPool(x, y, spec) {
    if (!spec || !spec.status) return null;
    if (!GAME.epools) GAME.epools = [];
    const sd = DATA.STATUS[spec.status.type] || {};
    const z = { x, y, r: spec.r || 60, t: spec.dur || 3, max: spec.dur || 3, status: spec.status,
      tick: 0, age: 0, color: spec.color || sd.color || '#ffffff' };
    GAME.epools.push(z);
    return z;
  },

  // shared movement for point projectiles; returns false when the projectile died
  _move(p, dt) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    const A = GAME.arena;
    if (p.x < A.x || p.x > A.x + A.w || p.y < A.y || p.y > A.y + A.h) p.t = 0;
    if (ROOMS.blocksProjectile(p)) p.t = 0;
    return p.t > 0;
  },
  _circleHit(p, P) { return U.dist(p.x, p.y, P.x, P.y) < P.r + p.r; },

  _explode(p, def) {
    const sf = def.splitFam || 'needle', sd = DATA.PROJECTILES[sf] || DATA.PROJECTILES.needle;
    const n = def.splits || 0, a0 = p.splitA || 0;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * U.TAU;
      PROJ.spawn(sf, { x: p.x, y: p.y, vx: Math.cos(a) * sd.speed, vy: Math.sin(a) * sd.speed,
        dmg: p.dmg * (def.splitDmg != null ? def.splitDmg : 1), owner: p.owner });
    }
    if (def.hitFx) VFX.emit(def.hitFx, p.x, p.y, 0, p.color);
    PROJ._sfx('bomb');
    if (p.pool) PROJ.addPool(p.x, p.y, p.pool);
    GAME.shake = Math.max(GAME.shake, 3);
    p.t = 0;
  },

  BEHAVIORS: {
    straight: {
      point: true,
      update(p, dt) { PROJ._move(p, dt); },
      hits(p, P) { return PROJ._circleHit(p, P); },
    },
    homing: {
      point: true,
      update(p, dt, def) {
        const P = GAME.player;
        if (P) {
          const cur = Math.atan2(p.vy, p.vx), want = U.angle(p.x, p.y, P.x, P.y);
          const turn = (def.turn || 2) * dt;
          const a = cur + U.clamp(U.angDiff(cur, want), -turn, turn);
          const spd = Math.hypot(p.vx, p.vy) || def.speed;
          p.vx = Math.cos(a) * spd; p.vy = Math.sin(a) * spd;
        }
        PROJ._move(p, dt);
      },
      hits(p, P) { return PROJ._circleHit(p, P); },
    },
    bomb: {
      point: true, ownFx: true,
      update(p, dt, def) {
        if (p.fuseT == null) {
          const near = p.tx != null && U.dist(p.x, p.y, p.tx, p.ty) <= 30;
          if (p.age < def.travel && !near) {
            const ox = p.x, oy = p.y;
            p.x += p.vx * dt; p.y += p.vy * dt;
            const A = GAME.arena;
            if (p.x < A.x || p.x > A.x + A.w || p.y < A.y || p.y > A.y + A.h || ROOMS.blocksProjectile(p)) {
              p.x = ox; p.y = oy; p.vx = 0; p.vy = 0; p.fuseT = def.fuse;
            }
          } else { p.vx = 0; p.vy = 0; p.fuseT = def.fuse; }
          if (p.fuseT != null && p.t < def.fuse + 0.05) p.t = def.fuse + 0.05;
        } else {
          p.fuseT -= dt;
          if (p.fuseT <= 0) PROJ._explode(p, def);
        }
      },
      hits(p, P) { return p.fuseT == null && PROJ._circleHit(p, P); },
      onContact(p, def) { PROJ._explode(p, def); },
    },
    beam: {
      update(p, dt, def) {
        if (p.len == null) p.len = def.len;
        if (p.w == null) p.w = def.width;
        if (p.tell == null) p.tell = def.tell;
        if (p.a == null) {
          const P = GAME.player;
          p.a = (p.vx || p.vy) ? Math.atan2(p.vy, p.vx) : (P ? U.angle(p.x, p.y, P.x, P.y) : 0);
        }
        p.vx = 0; p.vy = 0;
        const end = p.tell + def.active;
        if (!p._lifeSet) { p._lifeSet = true; p.t = Math.max(p.t, end - p.age + 0.05); }
        if (!p._fired && p.age >= p.tell) { p._fired = true; PROJ._sfx('beam'); GAME.shake = Math.max(GAME.shake, 3); }
        if (p.age >= end) p.t = 0;
      },
      hits(p, P, def) {
        if (p.hitP || p.age < p.tell || p.age >= p.tell + def.active) return false;
        return PROJ._segDist(P.x, P.y, p.x, p.y, p.x + Math.cos(p.a) * p.len, p.y + Math.sin(p.a) * p.len) < p.w / 2 + P.r;
      },
    },
    mortar: {
      ownFx: true,
      update(p, dt, def) {
        if (p.flight == null) p.flight = def.flight;
        if (p.tx == null) { const P = GAME.player; p.tx = P ? P.x : p.x; p.ty = P ? P.y : p.y; }
        p.vx = 0; p.vy = 0;
        if (!p._lifeSet) { p._lifeSet = true; p.t = Math.max(p.t, p.flight - p.age + 0.05); }
        if (p.age >= p.flight - 1e-9) p._resolve = true;
      },
      hits(p, P) { return !!p._resolve && !p.hitP && U.dist(P.x, P.y, p.tx, p.ty) < p.r + P.r; },
      from(p) { return [p.tx, p.ty]; },
      resolve(p, def) {
        if (def.hitFx) VFX.emit(def.hitFx, p.tx, p.ty, 0, p.color);
        PROJ._sfx(def.sfx);
        GAME.shake = Math.max(GAME.shake, 4);
        if (p.pool) PROJ.addPool(p.tx, p.ty, p.pool);
        p.t = 0;
      },
    },
    chakram: {
      update(p, dt, def) {
        if (!p.back && p.age >= def.out) { p.back = true; p.hitP = false; }
        const o = p.owner;
        if (p.back && o && !o.dead) {
          if (U.dist(p.x, p.y, o.x, o.y) < 20) { p.t = 0; return; }
          const a = U.angle(p.x, p.y, o.x, o.y);
          p.vx = Math.cos(a) * def.back; p.vy = Math.sin(a) * def.back;
        }
        if (!PROJ._move(p, dt)) return;
        if (p.back && o && !o.dead && U.dist(p.x, p.y, o.x, o.y) < 20) p.t = 0;
      },
      hits(p, P) { return !p.hitP && PROJ._circleHit(p, P); },
    },
    ring: {
      update(p, dt, def) {
        if (p.ox == null) { p.ox = p.x; p.oy = p.y; }
        p.vx = 0; p.vy = 0;
        p.rad = p.age < def.prePulse ? def.r
          : Math.min(def.maxR, def.r + (p.age - def.prePulse) * (p.speed || def.speed));
        if (p.rad >= def.maxR) p.t = 0;
      },
      hits(p, P, def) {
        if (p.hitP || p.age < def.prePulse) return false;
        const d = U.dist(P.x, P.y, p.ox, p.oy);
        if (Math.abs(d - p.rad) >= def.width / 2 + P.r) return false;
        if (p.gapArc > 0 && Math.abs(U.angDiff(U.angle(p.ox, p.oy, P.x, P.y), p.gapA)) < p.gapArc / 2) return false;
        return true;
      },
      from(p) { return [p.ox, p.oy]; },
    },
  },

  _segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    const k = L2 > 0 ? U.clamp(((px - x1) * dx + (py - y1) * dy) / L2, 0, 1) : 0;
    return U.dist(px, py, x1 + dx * k, y1 + dy * k);
  },

  updateAll(dt) {
    PROJ._clock += dt;
    const list = GAME.eprojectiles, P = GAME.player;
    const n = list.length;              // projectiles spawned this frame (bomb splits) start next frame
    PROJ._busy = true;
    try {
      for (let i = 0; i < n; i++) {
        const p = list[i];
        if (!(p.t > 0)) continue;
        const def = PROJ.def(p), B = PROJ.BEHAVIORS[def.behavior] || PROJ.BEHAVIORS.straight;
        p.age += dt; p.t -= dt;
        B.update(p, dt, def);
        if (def.trail && (p.vx || p.vy) && ++p._tr % 2 === 0) VFX.emit(def.trail, p.x, p.y, Math.atan2(p.vy, p.vx), p.color);
        if (P && (p.t > 0 || p._resolve) && B.hits(p, P, def)) {
          let landed;
          if (p.fam === 'bolt' && !p.status) landed = P.takeDamage(p.dmg);        // legacy call, unchanged
          else {
            const f = B.from ? B.from(p) : [p.x, p.y];
            landed = P.takeDamage(p.dmg, f[0], f[1], p.status ? { status: p.status } : undefined);
          }
          p.hitP = true;
          // 05.7.1-05 (D-07): a vampiric elite heals from its landed projectiles too
          if (landed && p.owner && p.owner.elite && p.owner.elite.includes('vampiric') && !p.owner.dead)
            p.owner.lifesteal(p.dmg);
          if (landed && def.hitFx && !B.ownFx) VFX.emit(def.hitFx, P.x, P.y, Math.atan2(p.vy, p.vx), p.color);
          if (B.onContact) B.onContact(p, def);
          else if (B.point) p.t = 0;   // point families die on contact whether or not it landed
        }
        if (p._resolve && p.t > 0 && B.resolve) B.resolve(p, def);
      }
    } finally { PROJ._busy = false; }
    GAME.eprojectiles = GAME.eprojectiles.filter(p => p.t > 0);
    PROJ.updatePools(dt);
  },

  updatePools(dt) {
    const pools = GAME.epools;
    if (!pools || !pools.length) return;
    const P = GAME.player;
    for (const z of pools) {
      z.t -= dt; z.age += dt; if (z.tick > 0) z.tick -= dt;
      if (!P || GAME.godMode || P.dashT > 0 || z.age < PROJ.POOL_GRACE || z.t <= 0) continue;
      if (U.dist(P.x, P.y, z.x, z.y) < z.r + P.r * 0.5 && z.tick <= 0) {
        STATUS.apply(P, z.status, z.x, z.y);
        z.tick = PROJ.POOL_TICK;
      }
    }
    GAME.epools = pools.filter(z => z.t > 0);
  },

  // ground layer (under actors): mortar landing circles, ring pre-pulses, lingering pools
  drawGround(ctx) {
    for (const z of GAME.epools || []) {
      if (!CAMERA.visible(z.x, z.y, z.r)) continue;
      const fade = U.clamp(z.t / 0.4, 0, 1);
      ctx.globalAlpha = fade;
      ctx.fillStyle = PROJ._hexA(z.color, '33', '#ffffff');
      ctx.strokeStyle = PROJ._hexA(z.color, '99', '#ffffff');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, U.TAU); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of GAME.eprojectiles) {
      const def = PROJ.def(p);
      if (def.behavior === 'mortar' && p.tx != null) {
        if (!CAMERA.visible(p.tx, p.ty, p.r)) continue;
        const k = U.clamp(p.age / (p.flight || def.flight), 0, 1);
        ctx.fillStyle = PROJ._hexA(p.color, '22', def.color);
        ctx.strokeStyle = PROJ._hexA(p.color, 'ff', def.color);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.tx, p.ty, p.r, 0, U.TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = PROJ._hexA(p.color, '44', def.color);
        ctx.beginPath(); ctx.arc(p.tx, p.ty, p.r * k, 0, U.TAU); ctx.fill();
      } else if (def.behavior === 'ring' && p.age < def.prePulse) {
        const ox = p.ox != null ? p.ox : p.x, oy = p.oy != null ? p.oy : p.y;
        if (!CAMERA.visible(ox, oy, def.r + 30)) continue;
        const k = U.clamp(p.age / def.prePulse, 0, 1);
        ctx.globalAlpha = 0.35 + 0.5 * k;
        ctx.strokeStyle = PROJ._hexA(p.color, 'ff', def.color);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(ox, oy, def.r + 24 * (1 - k), 0, U.TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
  },

  drawAll(ctx) {
    for (const p of GAME.eprojectiles) {
      const def = PROJ.def(p);
      const kind = def.draw;
      if (kind === 'beam') {
        const len = p.len || def.len, a = p.a || 0;
        const x2 = p.x + Math.cos(a) * len, y2 = p.y + Math.sin(a) * len;
        if (!CAMERA.visibleRect(Math.min(p.x, x2), Math.min(p.y, y2), Math.abs(x2 - p.x), Math.abs(y2 - p.y), (p.w || def.width) + 8)) continue;
      } else if (kind === 'ring') {
        if (!CAMERA.visible(p.ox != null ? p.ox : p.x, p.oy != null ? p.oy : p.y, (p.rad || def.r) + def.width)) continue;
      } else if (kind === 'mortar') {
        // shell flies from spawn to target; cull on the mid-point with the full span
        const tx = p.tx != null ? p.tx : p.x, ty = p.ty != null ? p.ty : p.y;
        if (!CAMERA.visibleRect(Math.min(p.x, tx), Math.min(p.y, ty) - 140, Math.abs(tx - p.x), Math.abs(ty - p.y) + 140, 16)) continue;
      } else if (!CAMERA.visible(p.x, p.y, p.r + 16)) continue;
      (PROJ.DRAW[kind] || PROJ.DRAW.bolt)(ctx, p, def);
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  },

  DRAW: {
    bolt(ctx, p) {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.stroke();
    },
    needle(ctx, p) {
      const a = Math.atan2(p.vy, p.vx);
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(a) * 14, p.y - Math.sin(a) * 14);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.8, 0, U.TAU); ctx.fill();
    },
    orb(ctx, p, def) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.4);
      g.addColorStop(0, PROJ._hexA(p.color, 'ff', def.color));
      g.addColorStop(1, PROJ._hexA(p.color, '00', def.color));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.4, 0, U.TAU); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.6, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.6, 0, U.TAU); ctx.stroke();
    },
    wisp(ctx, p) {
      const a = Math.atan2(p.vy, p.vx);
      ctx.fillStyle = p.color;
      for (let i = 3; i >= 1; i--) {
        ctx.globalAlpha = 0.18 * (4 - i);
        ctx.beginPath(); ctx.arc(p.x - Math.cos(a) * i * 6, p.y - Math.sin(a) * i * 6, p.r * (1 - i * 0.2), 0, U.TAU); ctx.fill();
      }
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(GAME.time * 30 + p.age * 7);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.4, 0, U.TAU); ctx.fill();
    },
    bomb(ctx, p, def) {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.stroke();
      if (p.fuseT != null) {
        const k = U.clamp(1 - p.fuseT / def.fuse, 0, 1);
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(p.age * 30);
        ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6 + 10 * k, 0, U.TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
    beam(ctx, p, def) {
      const len = p.len || def.len, a = p.a || 0, w = p.w || def.width, tell = p.tell != null ? p.tell : def.tell;
      const x2 = p.x + Math.cos(a) * len, y2 = p.y + Math.sin(a) * len;
      if (p.age < tell) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        ctx.setLineDash([10, 6]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = p.color; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, w * 0.35);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    mortar(ctx, p, def) {
      const tx = p.tx != null ? p.tx : p.x, ty = p.ty != null ? p.ty : p.y;
      const k = U.clamp(p.age / (p.flight || def.flight), 0, 1);
      const sx = p.x + (tx - p.x) * k, sy = p.y + (ty - p.y) * k;
      const h = Math.sin(k * Math.PI) * 120;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx, sy, 7, 3, 0, 0, U.TAU); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(sx, sy - h, 7, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy - h, 7, 0, U.TAU); ctx.stroke();
    },
    chakram(ctx, p) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.age * 20);
      ctx.fillStyle = PROJ._hexA(p.color, '55', '#d0d8e8');
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, U.TAU); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (p.r + 3), Math.sin(a) * (p.r + 3));
      }
      ctx.stroke();
      ctx.restore();
    },
    ring(ctx, p, def) {
      if (p.age < def.prePulse || p.rad == null) return;   // pre-pulse drawn by drawGround
      const ox = p.ox != null ? p.ox : p.x, oy = p.oy != null ? p.oy : p.y;
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = p.color; ctx.lineWidth = def.width;
      ctx.beginPath();
      if (p.gapArc > 0) ctx.arc(ox, oy, p.rad, p.gapA + p.gapArc / 2, p.gapA - p.gapArc / 2 + U.TAU);
      else ctx.arc(ox, oy, p.rad, 0, U.TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (p.gapArc > 0) ctx.arc(ox, oy, p.rad, p.gapA + p.gapArc / 2, p.gapA - p.gapArc / 2 + U.TAU);
      else ctx.arc(ox, oy, p.rad, 0, U.TAU);
      ctx.stroke();
    },
    venom(ctx, p) {
      const a = Math.atan2(p.vy, p.vx);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, a - Math.PI / 2, a + Math.PI / 2);
      ctx.lineTo(p.x - Math.cos(a) * p.r * 2.2, p.y - Math.sin(a) * p.r * 2.2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    },
    ember(ctx, p) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(GAME.time * 24 + p.age * 11);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.3, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffe0a0';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.55, 0, U.TAU); ctx.fill();
    },
    coil(ctx, p) {
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const a = k * 0.7 + p.age * 10, rr = p.r * k / 16;
        const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
    thunder(ctx, p) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + p.age * 8, rr = k % 2 === 0 ? p.r * 1.6 : p.r * 0.45;
        const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
    },
  },

  /**
   * planPattern(src, pattern, target) -> { marks, shots } (pure planner; consumers fire shots through
   * their own guarded shoot so telegraph invariants hold). pattern: { fam, count=1, spread=0,
   * aim='player'|'radial'|'around'|'line'|'self', dmgMul=1, radius=120, offset, tell, gapArc, speed,
   * status }. Each shot: { fam, x, y, vx?, vy?, extra?, dmgMul, status? }. Marks use drawTelegraph types.
   */
  planPattern(src, pattern, target) {
    const pt = Object.assign({ count: 1, spread: 0, aim: 'player', dmgMul: 1, radius: 120 }, pattern || {});
    const tgt = target || GAME.player;
    let fam = pt.fam || (pt.aim === 'line' ? 'beam' : pt.aim === 'self' ? 'ring' : 'bolt');
    if (pt.aim === 'line') fam = 'beam';
    const def = DATA.PROJECTILES[fam] || DATA.PROJECTILES.bolt;
    const famR = def.r, speed = pt.speed || def.speed;
    const marks = [], shots = [];
    const deco = (s) => { s.dmgMul = pt.dmgMul; if (pt.status) s.status = pt.status; shots.push(s); };
    const base = U.angle(src.x, src.y, tgt.x, tgt.y);
    const n = Math.max(1, pt.count | 0);
    if (pt.aim === 'radial') {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * U.TAU + (pt.offset || 0);
        deco({ fam, x: src.x, y: src.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
      }
      marks.push({ type: 'ringMark', x: src.x, y: src.y, r: (src.r || 0) + 40, width: 10 });
    } else if (pt.aim === 'around') {
      const A = GAME.arena, inset = 40;
      const clampPt = (x, y) => [U.clamp(x, A.x + inset, A.x + A.w - inset), U.clamp(y, A.y + inset, A.y + A.h - inset)];
      const pts = [clampPt(tgt.x, tgt.y)];
      for (let i = 1; i < n; i++) {
        const d = U.rand(40, pt.radius), a = U.rand(U.TAU);
        pts.push(clampPt(tgt.x + Math.cos(a) * d, tgt.y + Math.sin(a) * d));
      }
      for (const [tx, ty] of pts) {
        deco({ fam, x: src.x, y: src.y, extra: { tx, ty } });
        marks.push({ type: 'circle', x: tx, y: ty, r: famR });
      }
    } else if (pt.aim === 'line') {
      // count/spread fan like 'player' (05.7.1-06): one beam and one line mark per angle
      for (let i = 0; i < n; i++) {
        const a = base + (n > 1 ? (i / (n - 1) - 0.5) * pt.spread : 0);
        deco({ fam: 'beam', x: src.x, y: src.y, extra: { a, tell: pt.tell != null ? pt.tell : 0.1 } });
        marks.push({ type: 'line', x: src.x, y: src.y, a, len: def.len, w: def.width });
      }
    } else if (pt.aim === 'self') {
      deco({ fam, x: src.x, y: src.y, extra: { ox: src.x, oy: src.y, gapA: base + U.rand(-0.6, 0.6), gapArc: pt.gapArc || 0 } });
      marks.push({ type: 'ringMark', x: src.x, y: src.y, r: (src.r || 0) + 40, width: 10 });
    } else {
      for (let i = 0; i < n; i++) {
        const a = base + (n > 1 ? (i / (n - 1) - 0.5) * pt.spread : 0);
        deco({ fam, x: src.x, y: src.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
        if (marks.length < 5) marks.push({ type: 'line', x: src.x, y: src.y, a, len: 220, w: 2 * famR + 4 });
      }
    }
    return { marks, shots };
  },
};
