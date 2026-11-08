// 05.7.1-01 (D-11, RESEARCH Pitfall 1): every boss telegraph type and every world-anchored mark
// must be drawn on BOTH render paths — the primitive fallback (Enemy.draw/Boss.draw) and the
// sprite path (GAME.renderSpriteExtras, used whenever an atlas is loaded, i.e. the shipped game).
'use strict';
module.exports = function ({ R, sandbox, check, harness }) {
  const RED = /ff4444|255,\s*68,\s*68/i;
  const DRAW_OPS = new Set(['fill', 'stroke', 'fillRect', 'strokeRect']);

  // Sandbox-side helpers. __tg.drive(bossId, phase, moveId) -> boss in its wind state (or null).
  R(`globalThis.__tg = {
    drive(bossId, phase, id) {
      GAME.startRun();
      const bi = DATA.BIOMES.findIndex(b => b.boss === bossId);
      GAME.biomeIdx = bi; GAME.biome = DATA.BIOMES[bi];
      ROOMS.enterRoom('boss');
      const B = GAME.bossRef;
      const P = GAME.player; P.maxhp = 1e9; P.hp = 1e9;
      B.asleep = false; B.state = 'rest'; B.t = 99;
      if (phase === 2) { B.phase = 2; B.hp = B.maxhp * 0.45; }
      B.startMove(id);
      const shown = () => /Wind$/.test(B.state) && (B.telegraph || (B.marks && B.marks.length) || GAME.dangerZones.length);
      for (let i = 0; i < 30 && !shown(); i++) { GAME.hitstop = 0; GAME.update(1 / 60); }
      return shown() ? B : null;
    },
    // draw e via the sprite path with SPRITES.has forced true; returns drawTelegraph's return value
    sprite(ctx, e) {
      const has = SPRITES.has, headY = SPRITES.headY, dt = globalThis.drawTelegraph;
      let ret;
      if (typeof dt === 'function') globalThis.drawTelegraph = function (c, x) { ret = dt.apply(this, arguments); return ret; };
      try {
        SPRITES.has = () => true;
        SPRITES.headY = en => en.y - en.r * 2;
        GAME.renderSpriteExtras(ctx, e);
      } finally { SPRITES.has = has; SPRITES.headY = headY; if (typeof dt === 'function') globalThis.drawTelegraph = dt; }
      return ret;
    },
    primitive(ctx, e) {
      const dt = globalThis.drawTelegraph;
      let ret;
      if (typeof dt === 'function') globalThis.drawTelegraph = function (c, x) { ret = dt.apply(this, arguments); return ret; };
      try { e.draw(ctx); } finally { if (typeof dt === 'function') globalThis.drawTelegraph = dt; }
      return ret;
    },
  };`);

  const redOps = ops => ops.filter(o => DRAW_OPS.has(o.op) && (RED.test(String(o.fill)) || RED.test(String(o.stroke))));
  const badArcs = ops => ops.filter(o => (o.op === 'arc' || o.op === 'ellipse') && !o.args.slice(0, 3).every(v => typeof v === 'number' && isFinite(v)));

  const bosses = R('Object.keys(DATA.BOSSES)');
  for (const bossId of bosses) {
    for (const phase of [1, 2]) {
      const moves = R(`(BOSS_MOVESETS[${JSON.stringify(bossId)}] && BOSS_MOVESETS[${JSON.stringify(bossId)}][${phase}] || []).map(m => m[0])`);
      for (const id of moves) {
        const B = R(`(() => { const B = __tg.drive(${JSON.stringify(bossId)}, ${phase}, ${JSON.stringify(id)}); globalThis.__B = B; return B ? { wind: B.moveDef(${JSON.stringify(id)}).wind } : null; })()`);
        const wind = R(`(() => { const d = { ...(BOSS_MOVE_DEFS[${JSON.stringify(id)}] || {}) }; const e = (BOSS_MOVESETS[${JSON.stringify(bossId)}][${phase}].find(m => m[0] === ${JSON.stringify(id)}) || [])[2] || {}; return Object.assign(d, e).wind || 0; })()`);
        if (!(wind > 0)) continue;   // no wind-up -> nothing to telegraph (e.g. chase)
        const label = `${bossId} p${phase} ${id}`;
        if (!B) { check(`${label}: reaches a wind state that shows a telegraph`, false); continue; }
        const info = R(`({ tg: __B.telegraph ? __B.telegraph.type : null, marks: (__B.marks || []).length, dz: GAME.dangerZones.length })`);
        if (!info.tg && !info.marks) {
          // slam / leap draw through GAME.dangerZones in renderBackground (exempt here)
          check(`${label}: wind telegraph is a danger zone (drawn in renderBackground)`, info.dz > 0);
          continue;
        }
        const rec = harness.recordingCtx();
        sandbox.__rec = rec.ctx;
        const ret = R('__tg.sprite(__rec, __B)');
        const red = redOps(rec.ops), bad = badArcs(rec.ops);
        const what = info.tg ? info.tg + ' telegraph' : info.marks + ' mark(s)';
        let shapeOk = true;
        if (info.tg === 'ring') {
          const tg = R('__B.telegraph');
          shapeOk = rec.ops.some(o => o.op === 'arc' && Math.abs(o.args[2] - (tg.r0 + tg.r1) / 2) < 1e-6);
        } else if (info.tg === 'cone') {
          const tg = R('__B.telegraph');
          shapeOk = rec.ops.some(o => o.op === 'arc' && Math.abs((o.args[4] - o.args[3]) - tg.arc) < 1e-6);
        }
        check(`${label}: sprite path draws the ${what} (${red.length} red op(s), shape ${shapeOk ? 'ok' : 'WRONG'}, ${bad.length} invalid arc(s))`,
          red.length >= 1 && shapeOk && bad.length === 0);
        if (info.marks) {
          check(`${label}: sprite-path drawTelegraph returns >= ${info.marks} shape(s) (got ${ret})`, typeof ret === 'number' && ret >= info.marks);
          const rec2 = harness.recordingCtx();
          sandbox.__rec = rec2.ctx;
          const ret2 = R('__tg.primitive(__rec, __B)');
          check(`${label}: primitive-path drawTelegraph returns >= ${info.marks} shape(s) (got ${ret2})`, typeof ret2 === 'number' && ret2 >= info.marks);
        }
      }
    }
  }

  // ---- regular enemy: one line telegraph on both paths; spawning enemies draw none ----
  R(`globalThis.__mkEnemy = (spawnT) => {
    GAME.startRun();
    const e = new Enemy('rakshasa', GAME.player.x + 200, GAME.player.y, 1);
    e.spawnT = spawnT; e.telegraph = { type: 'line', a: 0, len: 150 };
    return e;
  };`);
  {
    sandbox.__rec = harness.recordingCtx().ctx;
    R('globalThis.__E = __mkEnemy(0)');
    const r1 = harness.recordingCtx(); sandbox.__rec = r1.ctx;
    const a = R('__tg.primitive(__rec, __E)');
    const r2 = harness.recordingCtx(); sandbox.__rec = r2.ctx;
    const b = R('__tg.sprite(__rec, __E)');
    check(`regular enemy line telegraph: primitive path draws one shape (returned ${a}, ${redOps(r1.ops).length} red ops)`, a === 1 && redOps(r1.ops).length >= 1);
    check(`regular enemy line telegraph: sprite path draws one shape (returned ${b}, ${redOps(r2.ops).length} red ops)`, b === 1 && redOps(r2.ops).length >= 1);

    R('globalThis.__E = __mkEnemy(0.3)');
    const r3 = harness.recordingCtx(); sandbox.__rec = r3.ctx; R('__tg.primitive(__rec, __E)');
    const r4 = harness.recordingCtx(); sandbox.__rec = r4.ctx; R('__tg.sprite(__rec, __E)');
    check('spawning enemy (spawnT > 0) draws no telegraph on either path', redOps(r3.ops).length === 0 && redOps(r4.ops).length === 0);
  }

  // ---- both paths call the same global drawTelegraph (spy) ----
  {
    sandbox.__rec = harness.recordingCtx().ctx;
    const calls = R(`(() => {
      if (typeof drawTelegraph !== 'function') return -1;
      const orig = globalThis.drawTelegraph; let n = 0;
      globalThis.drawTelegraph = function () { n++; return orig.apply(this, arguments); };
      const has = SPRITES.has, headY = SPRITES.headY;
      try {
        const e = __mkEnemy(0);
        e.draw(__rec);
        SPRITES.has = () => true; SPRITES.headY = en => en.y - en.r * 2;
        GAME.renderSpriteExtras(__rec, e);
        SPRITES.has = has; SPRITES.headY = headY;
        const B = __tg.drive('tataka', 1, 'radial');
        if (B) B.draw(__rec);
      } finally { globalThis.drawTelegraph = orig; SPRITES.has = has; SPRITES.headY = headY; }
      return n;
    })()`);
    check(`Enemy.draw, renderSpriteExtras and Boss.draw all call the global drawTelegraph (spy saw ${calls} call(s))`, calls === 3);
  }
};
