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
      const hw = e.boss ? e.r * 0.8 : e.r;
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

  // hp bar for damaged non-boss enemies
  if (!e.boss && e.hp < e.maxhp) {
    const w = e.r * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - w / 2, feetY + 4, w, 4);
    ctx.fillStyle = '#ff5566';
    ctx.fillRect(e.x - w / 2, feetY + 4, w * U.clamp(e.hp / e.maxhp, 0, 1), 4);
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
