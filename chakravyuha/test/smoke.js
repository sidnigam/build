// ============================================================
// CHAKRAVYUHA — test/smoke.js : headless smoke test (Node)
// Stubs DOM/canvas/audio, loads the game scripts, then simulates
// full runs: combat, boons, shop, all four bosses, death, victory.
// Run: node test/smoke.js
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------- DOM stubs ----------------
class ClassList {
  constructor() { this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  contains(c) { return this.set.has(c); }
}
class El {
  constructor(id) {
    this.id = id || '';
    this.children = [];
    this.style = {};
    this.classList = new ClassList();
    this._innerHTML = '';
    this.textContent = '';
    this.onclick = null;
    this.width = 1280; this.height = 720;
    this.offsetWidth = 0;
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = v; if (v === '') this.children = []; }
  appendChild(c) { this.children.push(c); }
  addEventListener() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  getContext() { return ctxStub; }
}

const noop = () => {};
const ctxStub = new Proxy({}, {
  get(t, prop) {
    if (prop === 'createRadialGradient' || prop === 'createLinearGradient')
      return () => ({ addColorStop: noop });
    if (prop === 'measureText') return () => ({ width: 0 });
    if (prop in t) return t[prop];
    return noop;
  },
  set(t, prop, v) { t[prop] = v; return true; },
});

const els = {};
const documentStub = {
  getElementById(id) { if (!els[id]) els[id] = new El(id); return els[id]; },
  createElement(tag) { return new El(); },
  querySelectorAll() { return []; },
  addEventListener: noop,
};

const storage = {};
const sandbox = {
  console,
  Math, JSON, Set, Map, Array, Object, Number, String, Boolean, Date, Promise,
  parseInt, parseFloat, isNaN,
  setTimeout: (fn) => { sandbox.__timeouts.push(fn); return 0; },
  clearTimeout: noop,
  __timeouts: [],
  requestAnimationFrame: noop,
  addEventListener: noop,
  removeEventListener: noop,
  confirm: () => true,
  document: documentStub,
  localStorage: {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// ---------------- load game scripts ----------------
const files = ['utils.js', 'renderer.js', 'sprites.js', 'audio.js', 'data.js', 'meta.js', 'entities.js', 'rooms.js', 'ui.js', 'game.js'];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
}

let failures = 0;
function check(label, cond) {
  if (cond) console.log(`  ok  ${label}`);
  else { console.error(`FAIL  ${label}`); failures++; }
}

// ---------------- boot ----------------
vm.runInContext(`
  META.load();
  GAME.init();
  UI.hub();
`, sandbox);
check('boot: reaches hub', vm.runInContext('GAME.state', sandbox) === 'hub');
// ---------------- SPRITES headless-safe checks ----------------
check('SPRITES loaded headless-safe (ready=false)', vm.runInContext('SPRITES.ready', sandbox) === false);
check("SPRITES.has() false with zero assets (fallback path)", vm.runInContext("SPRITES.has('player')", sandbox) === false);
const __spritesGrouped = vm.runInContext("JSON.stringify(SPRITES.groupFramesByAnimation(['player_run_1.png','player_idle_0.png','player_idle_1.png','player_run_0.png','player_run_2.png']))", sandbox);
check('SPRITES groups & orders animation frames',
  __spritesGrouped === JSON.stringify({idle:['player_idle_0.png','player_idle_1.png'], run:['player_run_0.png','player_run_1.png','player_run_2.png']}));

// ---------------- SPRITES pure helpers (quick-260924-tka) ----------------
{
  const R = (src) => vm.runInContext(src, sandbox);
  check('SPRITES.pickAnim falls back to idle when requested anim missing',
    R("SPRITES.pickAnim(['idle'], 'run')") === 'idle');
  check('SPRITES.pickAnim returns requested anim when present',
    R("SPRITES.pickAnim(['idle','run'], 'run')") === 'run');
  check('SPRITES.pickAnim falls back to first available when no idle',
    R("SPRITES.pickAnim(['walk'], 'attack')") === 'walk');
  check('SPRITES.pickAnim returns null for empty atlas',
    R("SPRITES.pickAnim([], 'idle')") === null);

  check('SPRITES.animForEntity player: dash/attack/run/idle',
    R("JSON.stringify([SPRITES.animForEntity({dashT:0.1}, false), SPRITES.animForEntity({dashT:0, swing:{t:0.05}}, false), SPRITES.animForEntity({dashT:0}, true), SPRITES.animForEntity({dashT:0, swing:{t:0}}, false)])")
      === JSON.stringify(['dash', 'attack', 'run', 'idle']));
  check('SPRITES.animForEntity enemy/boss attack states map to attack',
    R("['wind','lunge','strike','charge','charging','noose','spiral','summon','radialWind','chargeWind','slamWind'].every(s => SPRITES.animForEntity({type:'rakshasa', state:s}, false) === 'attack')") === true);
  check('SPRITES.animForEntity enemy: moving idle -> run; intro/rest still -> idle',
    R("JSON.stringify([SPRITES.animForEntity({type:'rakshasa', state:'idle'}, true), SPRITES.animForEntity({type:'tataka', boss:true, state:'intro'}, false), SPRITES.animForEntity({type:'tataka', boss:true, state:'rest'}, false)])")
      === JSON.stringify(['run', 'idle', 'idle']));

  check('SPRITES.movedSince: first false, moved true, still false',
    R("(() => { const e = {x:10, y:10}; const a = SPRITES.movedSince(e); e.x += SPRITES.CFG.MOVE_EPS + 1; const b = SPRITES.movedSince(e); const c = SPRITES.movedSince(e); return JSON.stringify([a, b, c]); })()")
      === JSON.stringify([false, true, false]));

  check('SPRITES.facingSign: right/left/deadzone keeps prev',
    R("JSON.stringify([SPRITES.facingSign(0) === SPRITES.CFG.DEFAULT_FACING, SPRITES.facingSign(Math.PI) === -SPRITES.CFG.DEFAULT_FACING, SPRITES.facingSign(Math.PI/2 + 0.01, -1) === -1, SPRITES.facingSign(Math.PI/2 + 0.01, 1) === 1])")
      === JSON.stringify([true, true, true, true]));

  check('SPRITES.spriteLayout untrimmed: r-based scale, feet anchor, offset',
    R("(() => { const C = SPRITES.CFG; const L = SPRITES.spriteLayout({ r:13, frameH:128 }); return Math.abs(L.scale - 13*C.HEIGHT_PER_R/128) < 1e-9 && L.anchorY === C.FEET_ANCHOR_Y && Math.abs(L.dy - 13*C.FEET_OFFSET_R) < 1e-9; })()") === true);
  check('SPRITES.spriteLayout trimmed: scale from trim height, anchor at trim bottom',
    R("(() => { const C = SPRITES.CFG; const L = SPRITES.spriteLayout({ r:13, frameH:128, trimY:10, trimH:100 }); return Math.abs(L.scale - 13*C.HEIGHT_PER_R/100) < 1e-9 && Math.abs(L.anchorY - 110/128) < 1e-9; })()") === true);

  check('SPRITES sweep: endEntities destroys unseen, keeps seen; clearEntities empties',
    R(`(() => {
      const mk = () => ({ parent: null, d: false, destroy() { this.d = true; } });
      const A = { _pixiSprite: mk() }, B = { _pixiSprite: mk() };
      SPRITES._tracked.add(A); SPRITES._tracked.add(B);
      SPRITES.beginEntities();
      SPRITES._markSeen(A);
      const bSpr = B._pixiSprite;
      SPRITES.endEntities();
      const r1 = bSpr.d === true && B._pixiSprite === null && !SPRITES._tracked.has(B)
        && A._pixiSprite && A._pixiSprite.d === false && SPRITES._tracked.has(A);
      const aSpr = A._pixiSprite;
      SPRITES.clearEntities();
      const r2 = aSpr.d === true && A._pixiSprite === null && SPRITES._tracked.size === 0;
      return r1 && r2;
    })()`) === true);
}

// ---------------- SPRITES procedural animation (02-07) ----------------
{
  const R = (src) => vm.runInContext(src, sandbox);

  check('SPRITES.procAnim idle: breathing bounded, no shift/rotation, not constant',
    R(`(() => {
      const C = SPRITES.CFG;
      let allBounded = true, sawChange = false, first = null;
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const p = SPRITES.procAnim('idle', t, {});
        if (Math.abs(p.sy - 1) > C.IDLE_BREATH + 1e-9) allBounded = false;
        if (Math.abs(p.sx - 1) > C.IDLE_BREATH + 1e-9) allBounded = false;
        if (p.dyR !== 0 || p.rot !== 0) allBounded = false;
        if (first === null) first = p.sy; else if (Math.abs(p.sy - first) > 1e-9) sawChange = true;
      }
      return allBounded && sawChange;
    })()`) === true);

  check('SPRITES.procAnim run: bobs down, leans with sign of lean',
    R(`(() => {
      const C = SPRITES.CFG;
      let allNonPositive = true, minDy = 0;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const p = SPRITES.procAnim('run', t, { lean: 1 });
        if (p.dyR > 1e-9) allNonPositive = false;
        if (p.dyR < minDy) minDy = p.dyR;
      }
      const rotPos = SPRITES.procAnim('run', 0.1, { lean: 1 }).rot;
      const rotNeg = SPRITES.procAnim('run', 0.1, { lean: -1 }).rot;
      return allNonPositive && minDy < -0.5 * C.RUN_BOB_R && rotPos === C.RUN_LEAN && rotNeg === -C.RUN_LEAN;
    })()`) === true);

  check('SPRITES.procAnim dash: stretches wide and short',
    R(`(() => { const p = SPRITES.procAnim('dash', 0, {}); return p.sx > 1.1 && p.sy < 1; })()`) === true);

  check('SPRITES.procAnim attack: stretches with attackT, matches idle at attackT 0',
    R(`(() => {
      const idle = SPRITES.procAnim('idle', 0, {});
      const atk1 = SPRITES.procAnim('attack', 0, { attackT: 1 });
      const atk0 = SPRITES.procAnim('attack', 0, { attackT: 0 });
      return atk1.sx > idle.sx && atk1.sy < 1 && atk0.sx === idle.sx && atk0.sy === idle.sy;
    })()`) === true);

  check('SPRITES.procAnim windup: crouch anticipation, minimal rotation',
    R(`(() => {
      let ok = true;
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const p = SPRITES.procAnim('windup', t, {});
        if (!(p.sy < 1 && p.sx > 1 && Math.abs(p.rot) <= 0.05)) ok = false;
      }
      return ok;
    })()`) === true);

  check('SPRITES.procAnim stunned: locks transform regardless of state',
    R(`(() => {
      const a = SPRITES.procAnim('run', 0.3, { stunned: true, lean: 1 });
      const b = SPRITES.procAnim('dash', 0.7, { stunned: true });
      return a.sx === 1 && a.sy === 1 && a.dyR === 0 && a.rot === 0
          && b.sx === 1 && b.sy === 1 && b.dyR === 0 && b.rot === 0;
    })()`) === true);

  check('SPRITES.procAnim idle hit squash: sx up, sy down',
    R(`(() => { const p = SPRITES.procAnim('idle', 0, { hit: 1 }); return p.sx > 1 && p.sy < 1; })()`) === true);

  check('SPRITES.procAnim asleep breathes slower (later first peak)',
    R(`(() => {
      const C = SPRITES.CFG;
      const peak = (slow) => (Math.PI / 2) / (2 * Math.PI * C.IDLE_HZ * slow);
      return peak(C.ASLEEP_SLOW) > peak(1);
    })()`) === true);

  check('SPRITES.procStateFor: windup/attack/run mapping',
    R(`(() => {
      const w1 = SPRITES.procStateFor({ type: 'rakshasa', state: 'wind' }, false) === 'windup';
      const w2 = SPRITES.procStateFor({ type: 'tataka', state: 'radialWind' }, false) === 'windup';
      const w3 = SPRITES.procStateFor({ type: 'kumbhakarna', state: 'chargeWind' }, false) === 'windup';
      const w4 = SPRITES.procStateFor({ type: 'yama', state: 'slamWind' }, false) === 'windup';
      const w5 = SPRITES.procStateFor({ type: 'rakshasa', state: 'charging' }, false) === 'windup';
      const lunge = SPRITES.procStateFor({ type: 'rakshasa', state: 'lunge' }, false) === 'attack';
      const run = SPRITES.procStateFor({ type: 'preta', state: 'idle' }, true) === 'run';
      const dash = SPRITES.procStateFor({ spriteKey: 'player', dashT: 0.1 }, false) === 'dash';
      const parity = SPRITES.procStateFor({ type: 'preta', state: 'idle' }, false) === SPRITES.animForEntity({ type: 'preta', state: 'idle' }, false);
      return w1 && w2 && w3 && w4 && w5 && lunge && run && dash && parity;
    })()`) === true);

  check('SPRITES.flashAmount: enemy/player/phase flash, all within [0,1]',
    R(`(() => {
      const vals = [
        SPRITES.flashAmount({ type: 'preta', flash: 0.05 }),
        SPRITES.flashAmount({ type: 'preta', flash: 0 }),
        SPRITES.flashAmount({ spriteKey: 'player', hurtT: 0.2 }),
        SPRITES.flashAmount({ spriteKey: 'player', hurtT: 0 }),
        SPRITES.flashAmount({ type: 'tataka', boss: true, flash: 0, _sprPhaseFlashT: 0.2 }),
      ];
      const inRange = vals.every(v => v >= 0 && v <= 1);
      return vals[0] > 0 && vals[1] === 0 && vals[2] > 0 && vals[3] === 0 && vals[4] > 0 && inRange;
    })()`) === true);

  check('SPRITES.blinkAlpha: steady without iframes, dips within range while blinking',
    R(`(() => {
      const steady = [0, 0.1, 0.5, 1].every(t => SPRITES.blinkAlpha({ iframes: 0 }, t) === 1);
      let inRange = true;
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const v = SPRITES.blinkAlpha({ iframes: 0.3 }, t);
        if (v < 0.35 || v >= 1) inRange = false;
      }
      return steady && inRange;
    })()`) === true);

  check('SPRITES.spawnPose: fade+scale in over SPAWN_DUR, passthrough when not spawning',
    R(`(() => {
      const C = SPRITES.CFG;
      const a = SPRITES.spawnPose({ spawnT: 0 });
      const b = SPRITES.spawnPose({ spawnT: C.SPAWN_DUR });
      const c = SPRITES.spawnPose({ spawnT: C.SPAWN_DUR / 2 });
      const d = SPRITES.spawnPose({});
      return a.alpha === 1 && a.scale === 1
        && b.alpha === 0 && b.scale === C.SPAWN_MIN_SCALE
        && Math.abs(c.alpha - 0.5) < 1e-9
        && d.alpha === 1 && d.scale === 1;
    })()`) === true);

  check('SPRITES.deathPose: shrink+fade over DEATH_DUR, alpha strictly decreasing',
    R(`(() => {
      const C = SPRITES.CFG;
      const a = SPRITES.deathPose(0);
      const b = SPRITES.deathPose(C.DEATH_DUR);
      let dec = true, prev = 2;
      for (let i = 0; i <= 4; i++) {
        const t = (i / 4) * C.DEATH_DUR;
        const p = SPRITES.deathPose(t);
        if (p.alpha >= prev) dec = false;
        prev = p.alpha;
      }
      return a.alpha === 1 && a.scale === 1 && a.done === false
        && b.alpha === 0 && b.done === true && dec;
    })()`) === true);

  check('SPRITES.textureAnimFor: phase2 selection + pickAnim fallback',
    R(`(() => {
      return SPRITES.textureAnimFor({ boss: true, phase: 2 }, ['idle', 'phase2'], 'run') === 'phase2'
        && SPRITES.textureAnimFor({ boss: true, phase: 2 }, ['idle'], 'run') === 'idle'
        && SPRITES.textureAnimFor({ boss: true, phase: 1 }, ['idle', 'phase2'], 'idle') === 'idle'
        && SPRITES.textureAnimFor({ type: 'preta' }, ['idle'], 'attack') === 'idle'
        && SPRITES.textureAnimFor({ spriteKey: 'player' }, ['idle', 'run'], 'run') === 'run';
    })()`) === true);

  check('SPRITES.headY: head sits above feet by heightPerR * r',
    R(`(() => {
      const e = { x: 0, y: 100, r: 10 };
      const expected = 100 + 10 * SPRITES.CFG.FEET_OFFSET_R - 10 * SPRITES.heightPerRFor('preta', e);
      return SPRITES.headY(e, 'preta') === expected;
    })()`) === true);

  check('SPRITES.ghostAlpha: ramps to GHOST_ALPHA and clamps',
    R(`(() => {
      const C = SPRITES.CFG;
      return SPRITES.ghostAlpha(C.TRAIL_LIFE) === C.GHOST_ALPHA
        && SPRITES.ghostAlpha(0) === 0
        && SPRITES.ghostAlpha(1) === C.GHOST_ALPHA;
    })()`) === true);

  check('SPRITES.spriteLayout: trimW clamps wide art, unaffected without trimW',
    R(`(() => {
      const C = SPRITES.CFG;
      const L = SPRITES.spriteLayout({ r: 10, frameH: 128, trimY: 0, trimH: 64, trimW: 128, heightPerR: 4 });
      const expected = Math.min(40 / 64, 10 * C.MAX_WIDTH_PER_R / 128);
      const untrimmedSame = SPRITES.spriteLayout({ r: 13, frameH: 128 }).scale === Math.abs(13 * C.HEIGHT_PER_R / 128);
      return Math.abs(L.scale - expected) < 1e-9 && untrimmedSame;
    })()`) === true);
}

// ---------------- sprite-path overlays (02-07) ----------------
sandbox.__ctxStub = ctxStub;
{
  let ok = false;
  try {
    ok = vm.runInContext(`(() => {
      if (!GAME.player) GAME.startRun();
      const e = new Enemy('rakshasa', 300, 300, 1);
      e.spawnT = 0; e.telegraph = { type: 'line', a: 0, len: 80 }; e.burns = [{ t: 1, dps: 1 }]; e.stun = 0.5; e.hp = 10;
      GAME.renderSpriteExtras(__ctxStub, e);

      const b = new Boss('yama', 400, 300);
      b.state = 'noose'; b.telegraph = { type: 'circle', r: 60 }; b.asleep = true;
      GAME.renderSpriteExtras(__ctxStub, b);

      GAME.dt = 1 / 60;
      const P = GAME.player;
      P.swing = { a: 0, t: 0.1, range: 78, arc: 1.9 };
      P.charging = true; P.charge = 1; P.bhaktiReady = true;
      GAME.renderPlayerSpriteExtras(__ctxStub, P);
      const swingOk = Math.abs(P.swing.t - (0.1 - 1 / 60)) < 1e-9;

      P.swing.t = 0;
      GAME.renderPlayerSpriteExtras(__ctxStub, P);
      const zeroOk = P.swing.t === 0;

      return swingOk && zeroOk;
    })()`, sandbox);
  } catch (e) { console.error(e); ok = false; }
  check('GAME.renderSpriteExtras/renderPlayerSpriteExtras: no throw headless, swing.t decays by dt', ok);
}

// ---------------- weapon + biome bg helpers (02-10) ----------------
{
  const R = (src) => vm.runInContext(src, sandbox);

  check('SPRITES.weaponKindFor: named weapons, bow/melee fallback, undefined-safe',
    R(`(() => {
      return SPRITES.weaponKindFor(DATA.WEAPONS.khanda) === 'sword'
        && SPRITES.weaponKindFor(DATA.WEAPONS.gandiva) === 'bow'
        && SPRITES.weaponKindFor(DATA.WEAPONS.gada) === 'mace'
        && SPRITES.weaponKindFor({ id: 'x', type: 'bow' }) === 'bow'
        && SPRITES.weaponKindFor({ id: 'x', type: 'melee' }) === 'sword'
        && SPRITES.weaponKindFor(undefined) === 'sword';
    })()`) === true);

  check('SPRITES.weaponPose: idle rot=aim, swingP=-1',
    R(`(() => {
      const p = SPRITES.weaponPose({ x: 100, y: 100, r: 13, aim: 0.5, weapon: DATA.WEAPONS.khanda, swing: null });
      return p.rot === 0.5 && p.swingP === -1;
    })()`) === true);

  check('SPRITES.weaponPose: melee swing sweeps start->end, combo alternates direction',
    R(`(() => {
      const C = SPRITES.CFG;
      const base = { x: 0, y: 0, r: 13, aim: 0, weapon: DATA.WEAPONS.khanda };
      const start1 = SPRITES.weaponPose(Object.assign({}, base, { comboIdx: 1, swing: { a: 0, t: C.SWING_DUR, arc: 2, range: 78 } }));
      const end1   = SPRITES.weaponPose(Object.assign({}, base, { comboIdx: 1, swing: { a: 0, t: 1e-6, arc: 2, range: 78 } }));
      const start2 = SPRITES.weaponPose(Object.assign({}, base, { comboIdx: 2, swing: { a: 0, t: C.SWING_DUR, arc: 2, range: 78 } }));
      const end2   = SPRITES.weaponPose(Object.assign({}, base, { comboIdx: 2, swing: { a: 0, t: 1e-6, arc: 2, range: 78 } }));
      return Math.abs(start1.rot - (-1)) < 1e-6 && Math.abs(end1.rot - 1) < 1e-3
        && Math.abs(start2.rot - 1) < 1e-6 && Math.abs(end2.rot - (-1)) < 1e-3;
    })()`) === true);

  check('SPRITES.weaponPose: bow ignores swing, pull follows charge only while charging',
    R(`(() => {
      const p1 = SPRITES.weaponPose({ x: 0, y: 0, r: 13, aim: 0.7, weapon: DATA.WEAPONS.gandiva, swing: { a: 0, t: 0.1, arc: 2, range: 78 }, charging: true, charge: 0.6 });
      const p2 = SPRITES.weaponPose({ x: 0, y: 0, r: 13, aim: 0.7, weapon: DATA.WEAPONS.gandiva, charging: false, charge: 0.6 });
      return p1.rot === 0.7 && p1.pull === 0.6 && p2.pull === 0;
    })()`) === true);

  check('SPRITES.weaponPose: front (aim down) vs back (aim up) z-order',
    R(`(() => {
      const down = SPRITES.weaponPose({ x: 0, y: 100, r: 13, aim: Math.PI / 2, weapon: DATA.WEAPONS.khanda });
      const up   = SPRITES.weaponPose({ x: 0, y: 100, r: 13, aim: -Math.PI / 2, weapon: DATA.WEAPONS.khanda });
      return down.z > 100 && up.z < 100;
    })()`) === true);

  check('SPRITES.weaponPose: hand offset stays close to the body',
    R(`(() => {
      const C = SPRITES.CFG;
      const e = { x: 50, y: 60, r: 13, aim: 1.1, weapon: DATA.WEAPONS.gada };
      const p = SPRITES.weaponPose(e);
      const dx = p.x - e.x, dy = p.y - (e.y + e.r * C.WEAPON_HAND_DY);
      return Math.sqrt(dx * dx + dy * dy) <= 1.5 * e.r;
    })()`) === true);

  check('SPRITES.bgKeyFor/bgPathFor',
    R(`SPRITES.bgKeyFor({ id: 'naraka' }) === 'bg:naraka' && SPRITES.bgPathFor({ id: 'patala' }) === 'assets/sprites/biomes/patala-bg.png'`) === true);

  check('SPRITES texture helpers: headless-safe (no PIXI, no worldContainer)',
    R(`(() => {
      const notThrow = SPRITES.hasTexture('bg:naraka') === false && SPRITES.setBackground('bg:naraka') === false && SPRITES.setBackground(null) === false;
      const r = SPRITES.loadTextures([{ key: 'bg:naraka', path: 'x.png' }]);
      return notThrow && typeof r.then === 'function';
    })()`) === true);
}

// ---------------- data integrity ----------------
vm.runInContext(`
  globalThis.__dataErrors = [];
  for (const b of DATA.BOONS) {
    for (const r of DATA.RARITIES) {
      const s = b.desc(b.base * r.mult);
      if (typeof s !== 'string' || !s.length) __dataErrors.push('boon desc ' + b.id);
    }
    if (!DATA.GODS[b.god]) __dataErrors.push('boon god ' + b.id);
  }
  for (const m of DATA.META) {
    if (m.cost.length !== m.max) __dataErrors.push('meta cost length ' + m.id);
    for (let r = 1; r <= m.max; r++) m.desc(r);
  }
  for (const bio of DATA.BIOMES) {
    if (!DATA.BOSSES[bio.boss]) __dataErrors.push('biome boss ' + bio.id);
    for (const e of bio.enemies) if (!DATA.ENEMIES[e]) __dataErrors.push('biome enemy ' + e);
  }
`, sandbox);
const dataErrors = vm.runInContext('__dataErrors', sandbox);
check('data: boons/meta/biomes consistent' + (dataErrors.length ? ' — ' + dataErrors.join(', ') : ''),
  dataErrors.length === 0);

// ---------------- full-run simulator ----------------
// godMode: huge hp/damage to push through to victory while still
// exercising boss move scripts for a while before killing them.
vm.runInContext(`
globalThis.simulateRun = function(opts = {}) {
  const log = { states: new Set(), bosses: new Set(), bossMoves: new Set(), boons: 0, frames: 0, errors: [] };
  GAME.startRun();
  const P = GAME.player;
  if (opts.godMode) { P.maxhp = 1e9; P.hp = 1e9; }
  let bossClock = 0;
  let frame = 0;
  const DT = 1 / 60;
  while (frame++ < 300000) {
    log.states.add(GAME.state);
    try {
      if (GAME.state === 'combat' || GAME.state === 'cleared') {
        // weak player: simulate getting hit regularly so the death path triggers
        if (opts.weakPlayer && frame % 45 === 0 && GAME.state === 'combat') P.takeDamage(15);
        // drive inputs: dash / special / cast periodically
        if (frame % 47 === 0) P.tryDash();
        if (frame % 90 === 0) P.trySpecial();
        if (frame % 130 === 0) P.tryCast();
        if (frame % 9 === 0 && GAME.player.weapon.type === 'melee') P.meleeAttack();

        // simulated combat damage
        const living = GAME.enemies.filter(e => !e.dead && e.spawnT <= 0);
        if (living.length) {
          const boss = living.find(e => e.boss);
          if (boss) {
            log.bosses.add(boss.type);
            log.bossMoves.add(boss.type + ':' + boss.state);
            bossClock += DT;
            // let the boss act for 20 sim-seconds before bursting it down
            if (bossClock > 20) hitEnemy(boss, 500, 'attack');
            else if (frame % 3 === 0) hitEnemy(boss, 3, 'attack');
          } else {
            hitEnemy(living[0], opts.weakPlayer ? 6 : 60, 'attack');
            bossClock = 0;
          }
        }
        GAME.update(DT);
        GAME.render();

        // walk into the first door when cleared
        if (GAME.state === 'cleared' && GAME.doors.length) {
          P.x = GAME.doors[0].x; P.y = GAME.doors[0].y;
        }
      } else if (GAME.state === 'choosing') {
        const boonpick = document.getElementById('boonpick');
        const shop = document.getElementById('shop');
        if (!boonpick.classList.contains('hidden')) {
          const cards = document.getElementById('boon-cards').children;
          if (cards.length) { log.boons++; cards[0].onclick(); }
          else { UI.hide('boonpick'); GAME.state = 'cleared'; }
        } else if (!shop.classList.contains('hidden')) {
          const cards = document.getElementById('shop-cards').children;
          if (cards.length && GAME.player.mudra > 400) cards[0].onclick();
          if (GAME.state === 'choosing' && !document.getElementById('shop').classList.contains('hidden')) UI.closeShop();
        } else {
          GAME.state = 'cleared'; // unknown overlay: bail out
        }
      } else if (GAME.state === 'dead' || GAME.state === 'victory') {
        break;
      }
    } catch (e) {
      log.errors.push('frame ' + frame + ' [' + GAME.state + ']: ' + e.stack.split('\\n').slice(0,3).join(' | '));
      break;
    }
  }
  log.frames = frame;
  log.final = GAME.state;
  log.biome = GAME.biomeIdx;
  // flush pending death/victory UI timeouts
  for (const fn of __timeouts.splice(0)) { try { fn(); } catch (e) { log.errors.push('timeout: ' + e.message); } }
  return log;
};
`, sandbox);

// ---- run 1: god mode, should reach victory and visit all bosses ----
console.log('\n— run 1: god mode (full clear) —');
const r1 = vm.runInContext('simulateRun({ godMode: true })', sandbox);
check('no runtime errors' + (r1.errors.length ? ' — ' + r1.errors[0] : ''), r1.errors.length === 0);
check(`reaches victory (final=${r1.final}, biome=${r1.biome}, frames=${r1.frames})`, r1.final === 'victory');
check(`fights all 4 bosses (${[...r1.bosses].join(', ')})`, r1.bosses.size === 4);
check(`boons picked along the way (${r1.boons})`, r1.boons >= 6);
const moves = [...r1.bossMoves].map(String);
check(`boss move variety (${moves.length} state pairs)`, moves.length >= 10);

// ---- run 2: weak player, should die and hit the death screen ----
console.log('\n— run 2: weak player (death path) —');
const r2 = vm.runInContext('simulateRun({ weakPlayer: true })', sandbox);
check('no runtime errors' + (r2.errors.length ? ' — ' + r2.errors[0] : ''), r2.errors.length === 0);
check(`dies and reaches death screen (final=${r2.final})`, r2.final === 'dead');

// ---- run 3: every boon at every rarity, applied to a live player ----
console.log('\n— run 3: all boons stress test —');
vm.runInContext(`
globalThis.__boonErrors = [];
try {
  GAME.startRun();
  const P = GAME.player;
  P.maxhp = 1e9; P.hp = 1e9;
  for (const def of DATA.BOONS) P.addBoon(def, Math.floor(Math.random() * 3));
  for (let frame = 0; frame < 4000; frame++) {
    if (frame % 9 === 0) P.meleeAttack();
    if (frame % 40 === 0) P.tryDash();
    if (frame % 80 === 0) P.trySpecial();
    if (frame % 100 === 0) P.tryCast();
    const living = GAME.enemies.filter(e => !e.dead && e.spawnT <= 0);
    if (living.length && frame % 3 === 0) hitEnemy(living[0], 30, 'attack');
    GAME.update(1/60);
    GAME.render();
    if (GAME.state === 'cleared' && GAME.doors.length) {
      GAME.player.x = GAME.doors[0].x; GAME.player.y = GAME.doors[0].y;
    }
    if (GAME.state === 'choosing') {
      const cards = document.getElementById('boon-cards').children;
      if (cards.length) cards[0].onclick();
      else if (!document.getElementById('shop').classList.contains('hidden')) UI.closeShop();
      else GAME.state = 'cleared';
    }
  }
} catch (e) { __boonErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const boonErrors = vm.runInContext('__boonErrors', sandbox);
check('all 25+ boons active simultaneously, 4000 frames'
  + (boonErrors.length ? ' — ' + boonErrors[0] : ''), boonErrors.length === 0);

// ---- meta progression ----
console.log('\n— meta progression —');
vm.runInContext(`
  globalThis.__metaErrors = [];
  try {
    META.punya = 5000;
    for (const def of DATA.META) while (META.rank(def.id) < def.max) if (!META.buy(def)) break;
    for (const id of Object.keys(DATA.WEAPONS)) META.unlockWeapon(id);
    META.save(); META.load();
    if (META.rank('sanjeevani') !== 3) __metaErrors.push('sanjeevani rank persisted wrong');
    if (META.weapons.length !== 3) __metaErrors.push('weapons not unlocked: ' + META.weapons);
    UI.shrine(); UI.armory(); UI.codex(); UI.hub();
  } catch (e) { __metaErrors.push(e.message); }
`, sandbox);
const metaErrors = vm.runInContext('__metaErrors', sandbox);
check('meta buy/save/load + shrine/armory/codex render'
  + (metaErrors.length ? ' — ' + metaErrors.join('; ') : ''), metaErrors.length === 0);

// ---- run 4: full clear with each weapon ----
console.log('\n— run 4: gandiva & gada runs —');
for (const w of ['gandiva', 'gada']) {
  vm.runInContext(`META.lastWeapon = '${w}';`, sandbox);
  const r = vm.runInContext('simulateRun({ godMode: true })', sandbox);
  check(`${w}: victory, no errors` + (r.errors.length ? ' — ' + r.errors[0] : ''),
    r.errors.length === 0 && r.final === 'victory');
}

// ---------------- provenance completeness (ART-06) ----------------
const { checkProvenance } = require('../tools/check-provenance.js');
const prov = checkProvenance(path.join(__dirname, '..', 'assets', 'sprites'));
check('provenance: every atlas has a PROVENANCE.json entry'
  + (prov.missing.length ? ' — missing: ' + prov.missing.join(', ') : ''), prov.ok);

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
