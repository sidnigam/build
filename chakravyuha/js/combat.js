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
