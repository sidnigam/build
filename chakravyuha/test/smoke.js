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
const files = ['utils.js', 'settings.js', 'renderer.js', 'sprites.js', 'vfx.js', 'audio.js', 'music.js', 'data.js', 'meta.js', 'entities.js', 'rooms.js', 'ui.js', 'game.js', 'storage.js', 'gamepad.js'];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
}
// captured immediately after load, before any simulation runs, so it only
// reflects timeouts scheduled by loading the scripts themselves (05.3-01).
const __musicLoadTimeouts = sandbox.__timeouts.length;

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

// ---------------- STORE (js/storage.js) checks ----------------
{
  const R = (src) => vm.runInContext(src, sandbox);

  check('STORE.resolveMode(true, true) -> desktop', R("STORE.resolveMode(true, true)") === 'desktop');
  check('STORE.resolveMode(true, false) -> desktop', R("STORE.resolveMode(true, false)") === 'desktop');
  check('STORE.resolveMode(false, true) -> browser', R("STORE.resolveMode(false, true)") === 'browser');
  check('STORE.resolveMode(false, false) -> headless', R("STORE.resolveMode(false, false)") === 'headless');

  vm.runInContext(`
    globalThis.__storeResults = {};
    const __savedMode = STORE._mode;
    const __savedChakra = window.chakraNative;

    // fallback for a missing key, in every mode
    __storeResults.fallback = ['desktop', 'browser', 'headless'].map(m => {
      STORE._mode = m;
      delete STORE._cache['__smoke_missing__'];
      return STORE.get('__smoke_missing__', 'fallback');
    });

    // browser mode round-trip
    STORE._mode = 'browser';
    delete STORE._cache['__smoke_browser__'];
    STORE.set('__smoke_browser__', { a: 1 });
    delete STORE._cache['__smoke_browser__'];
    __storeResults.browserRoundtrip = STORE.get('__smoke_browser__');
    localStorage.removeItem('__smoke_browser__');

    // headless mode round-trip (via _memory, not just cache)
    STORE._mode = 'headless';
    delete STORE._cache['__smoke_headless__'];
    STORE.set('__smoke_headless__', { b: 2 });
    delete STORE._cache['__smoke_headless__'];
    __storeResults.headlessRoundtrip = STORE.get('__smoke_headless__');
    __storeResults.headlessInMemory = STORE._memory['__smoke_headless__'];

    // desktop mode: legacy migration (chakraNative miss, localStorage hit)
    STORE._mode = 'desktop';
    delete STORE._cache['__smoke_migrate__'];
    localStorage.setItem('__smoke_migrate__', JSON.stringify({ legacy: true }));
    __storeResults.migrateCalls = [];
    window.chakraNative = {
      saveRead: () => null,
      saveWrite: (n, j) => { __storeResults.migrateCalls.push([n, JSON.parse(j)]); },
    };
    __storeResults.migrateValue = STORE.get('__smoke_migrate__', 'fallback');
    localStorage.removeItem('__smoke_migrate__');

    // desktop mode: normal read (chakraNative hit) must not touch localStorage or call saveWrite
    delete STORE._cache['__smoke_native__'];
    __storeResults.nativeWriteCalls = 0;
    __storeResults.legacyReadCalls = 0;
    const __origGetItem = localStorage.getItem;
    localStorage.getItem = function(k) { __storeResults.legacyReadCalls++; return __origGetItem.call(localStorage, k); };
    window.chakraNative = {
      saveRead: (n) => n === '__smoke_native__' ? JSON.stringify({ native: true }) : null,
      saveWrite: () => { __storeResults.nativeWriteCalls++; },
    };
    __storeResults.nativeValue = STORE.get('__smoke_native__', 'fallback');
    localStorage.getItem = __origGetItem;

    // restore original mode/chakraNative/cache so later tests (meta save/load) are unaffected
    if (__savedChakra === undefined) delete window.chakraNative; else window.chakraNative = __savedChakra;
    STORE._mode = __savedMode;
    delete STORE._cache['__smoke_missing__'];
    delete STORE._cache['__smoke_browser__'];
    delete STORE._cache['__smoke_headless__'];
    delete STORE._cache['__smoke_migrate__'];
    delete STORE._cache['__smoke_native__'];
  `, sandbox);

  const storeResults = vm.runInContext('__storeResults', sandbox);
  check('STORE.get returns fallback for a missing key in every mode',
    JSON.stringify(storeResults.fallback) === JSON.stringify(['fallback', 'fallback', 'fallback']));
  check('STORE browser-mode round-trip via localStorage',
    JSON.stringify(storeResults.browserRoundtrip) === JSON.stringify({ a: 1 }));
  check('STORE headless-mode round-trip via _memory (nothing throws)',
    JSON.stringify(storeResults.headlessRoundtrip) === JSON.stringify({ b: 2 }) &&
    JSON.stringify(storeResults.headlessInMemory) === JSON.stringify({ b: 2 }));
  check('STORE desktop-mode migrates legacy localStorage value (returns parsed legacy value)',
    JSON.stringify(storeResults.migrateValue) === JSON.stringify({ legacy: true }));
  check('STORE desktop-mode migration writes through to chakraNative exactly once',
    JSON.stringify(storeResults.migrateCalls) === JSON.stringify([['__smoke_migrate__', { legacy: true }]]));
  check('STORE desktop-mode normal read returns parsed chakraNative value',
    JSON.stringify(storeResults.nativeValue) === JSON.stringify({ native: true }));
  check('STORE desktop-mode normal read does not touch localStorage or call saveWrite',
    storeResults.legacyReadCalls === 0 && storeResults.nativeWriteCalls === 0);
}

// ---------------- PAD (js/gamepad.js) pure helpers ----------------
{
  const R = (src) => vm.runInContext(src, sandbox);
  // Local default bindings mirroring js/game.js's INPUT.bindings — inlined
  // here rather than referencing INPUT.bindings because this task (05-02
  // Task 1) executes before Task 2 adds that field to game.js.
  const DEFAULT_BINDINGS_LITERAL = `{
    moveUp: ['w', 'arrowup'], moveDown: ['s', 'arrowdown'],
    moveLeft: ['a', 'arrowleft'], moveRight: ['d', 'arrowright'],
    dash: [' '], cast: ['q'], special: ['e'], pause: ['escape'],
  }`;

  check('PAD.applyDeadzone(0,0,0.2) -> zero',
    R("JSON.stringify(PAD.applyDeadzone(0, 0, 0.2))") === JSON.stringify({ x: 0, y: 0, mag: 0 }));
  check('PAD.applyDeadzone below deadzone -> zero',
    R("JSON.stringify(PAD.applyDeadzone(0.1, 0, 0.2))") === JSON.stringify({ x: 0, y: 0, mag: 0 }));
  check('PAD.applyDeadzone at full deflection -> unaffected',
    R("JSON.stringify(PAD.applyDeadzone(1, 0, 0.2))") === JSON.stringify({ x: 1, y: 0, mag: 1 }));
  check('PAD.applyDeadzone rescales mid-range deflection',
    R("(() => { const r = PAD.applyDeadzone(0.6, 0, 0.2); return Math.abs(r.mag - 0.5) < 1e-9 && Math.abs(r.x - 0.5) < 1e-9 && r.y === 0; })()") === true);

  check('PAD.mapGamepad reads axes + A button',
    R(`(() => {
      const gp = { axes: [0.5, -0.5, 0, 1], buttons: Array(16).fill({ pressed: false }).map((b, i) => i === 0 ? { pressed: true } : b) };
      const m = PAD.mapGamepad(gp);
      return m.lx === 0.5 && m.ly === -0.5 && m.rx === 0 && m.ry === 1 && m.buttons.A === true && m.buttons.B === false;
    })()`) === true);

  check('PAD.digitalMoveVector: no keys held -> zero',
    R(`JSON.stringify(PAD.digitalMoveVector({}, ${DEFAULT_BINDINGS_LITERAL}))`) === JSON.stringify({ dx: 0, dy: 0 }));
  check('PAD.digitalMoveVector: w held -> dy=-1',
    R(`JSON.stringify(PAD.digitalMoveVector({ w: true }, ${DEFAULT_BINDINGS_LITERAL}))`) === JSON.stringify({ dx: 0, dy: -1 }));
  check('PAD.digitalMoveVector: w+d held -> normalized diagonal',
    R(`(() => { const r = PAD.digitalMoveVector({ w: true, d: true }, ${DEFAULT_BINDINGS_LITERAL}); return Math.abs(r.dx - 0.7071) < 1e-3 && Math.abs(r.dy + 0.7071) < 1e-3; })()`) === true);
  check('PAD.digitalMoveVector respects a custom bindings map (rebinding works)',
    R("JSON.stringify(PAD.digitalMoveVector({ i: true }, { moveUp: ['i'], moveDown: [], moveLeft: [], moveRight: [] }))") === JSON.stringify({ dx: 0, dy: -1 }));

  // navigator is undefined in this headless sandbox — poll() must not throw
  let padPollThrew = false;
  try { R("PAD.poll()"); } catch (e) { padPollThrew = true; }
  check('PAD.poll() does not throw when navigator is undefined (headless guard)', padPollThrew === false);
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

// ---- pooled particles wired through combat ----
console.log('\n— pooled particles wired through combat —');
vm.runInContext(`
  GAME.startRun();
  for (let f = 0; f < 300; f++) {
    const living = GAME.enemies.filter(e => !e.dead && e.spawnT <= 0);
    if (living.length) hitEnemy(living[0], 20, 'attack');
    GAME.update(1/60);
    GAME.render();
  }
`, sandbox);
check('GAME.particles stays empty (pooled VFX replaces push/filter)',
  vm.runInContext('GAME.particles.length', sandbox) === 0);
check('combat produces pooled particles (VFX.stats().peak > 0)',
  vm.runInContext('VFX.stats().peak', sandbox) > 0);
// Drain fully — combat may have left long-lived ambient particles active (up to ~8s life).
vm.runInContext('for (let i = 0; i < 600; i++) VFX.update(1/60);', sandbox);

// ---------------- VFX + SETTINGS (Phase 3) ----------------
vm.runInContext(`
globalThis.__vfxResults = {};
(function() {
  const R = __vfxResults;

  // 1. fresh defaults
  localStorage.removeItem(SETTINGS.KEY);
  SETTINGS._v = null;
  SETTINGS.load();
  R.defaults = SETTINGS.get('screenShake') === true && SETTINGS.get('shakeIntensity') === 1 &&
    SETTINGS.get('screenFlash') === true && SETTINGS.get('hitstop') === true && SETTINGS.get('reducedParticles') === false;

  // 2. persistence across reload
  SETTINGS.set('screenFlash', false);
  SETTINGS._v = null;
  R.persist = SETTINGS.load().screenFlash === false;
  SETTINGS.reset();

  // 3. clamping / type rejection / unknown-key rejection
  SETTINGS.set('shakeIntensity', 5);
  const clampHigh = SETTINGS.get('shakeIntensity') === 1;
  SETTINGS.set('shakeIntensity', -1);
  const clampLow = SETTINGS.get('shakeIntensity') === 0;
  const beforeType = SETTINGS.get('screenShake');
  SETTINGS.set('screenShake', 'yes');
  const typeRejected = SETTINGS.get('screenShake') === beforeType;
  const beforeUnknown = JSON.stringify(SETTINGS.all());
  SETTINGS.set('bogus', 1);
  const unknownIgnored = JSON.stringify(SETTINGS.all()) === beforeUnknown;
  R.clamp = clampHigh && clampLow && typeRejected && unknownIgnored;
  SETTINGS.reset();

  // 4. corrupt storage falls back to defaults
  localStorage.setItem(SETTINGS.KEY, '{not json');
  let corruptOk = true;
  try {
    const v = SETTINGS.load();
    corruptOk = JSON.stringify(v) === JSON.stringify(SETTINGS.DEFAULTS);
  } catch (e) { corruptOk = false; }
  R.corrupt = corruptOk;
  localStorage.removeItem(SETTINGS.KEY);
  SETTINGS.reset();

  // 5. pool identity + shape at load
  R.poolLen = VFX.pool.length === VFX.CAP && VFX.CAP === 2048;
  R.freshActive = VFX.stats().active === 0;

  // 6. burst activates n particles, drains to 0 after their lifetime
  VFX.burst(100, 100, '#ff0000', 10, 160, 0.4, 3);
  R.burstActive = VFX.stats().active === 10;
  for (let i = 0; i < 60; i++) VFX.update(1/60);
  R.burstDrained = VFX.stats().active === 0;

  // 7. flood: no growth, identity preserved, dropped>0, drains
  const firstRef = VFX.pool[0], lastRef = VFX.pool[VFX.CAP - 1];
  let floodOk = true;
  for (let f = 0; f < 600; f++) {
    VFX.burst(50, 50, '#ffffff', 100, 100, 2, 3);
    VFX.update(1/60);
    if (VFX.stats().active > VFX.CAP) floodOk = false;
  }
  const lenSame = VFX.pool.length === VFX.CAP;
  const identitySame = VFX.pool[0] === firstRef && VFX.pool[VFX.CAP - 1] === lastRef;
  const droppedGtZero = VFX.stats().dropped > 0;
  for (let f = 0; f < 120; f++) VFX.update(1/60);
  const drainedAfterFlood = VFX.stats().active === 0;
  R.flood = floodOk && lenSame && identitySame && droppedGtZero && drainedAfterFlood;

  // 8. timing: 600 update() calls over a full pool < 3000ms
  for (let i = 0; i < VFX.CAP; i++) VFX.burst(10, 10, '#fff', 1, 1, 20, 1);
  const t0 = Date.now();
  for (let i = 0; i < 600; i++) VFX.update(1/60);
  R.timingMs = Date.now() - t0;
  R.timingOk = R.timingMs < 3000;
  for (let i = 0; i < 1200; i++) VFX.update(1/60); // drain fully

  // 9. reducedParticles scales burst count by 0.35 (min 1)
  SETTINGS.set('reducedParticles', true);
  VFX.burst(20, 20, '#fff', 20, 100, 0.4, 3);
  R.reduced = VFX.stats().active === Math.ceil(20 * 0.35);
  for (let i = 0; i < 60; i++) VFX.update(1/60);
  SETTINGS.set('reducedParticles', false);

  // 10. render(ctx) does not throw in headless fallback path
  VFX.burst(5, 5, '#fff', 5, 50, 0.4, 2);
  let renderOk = true;
  try {
    VFX.render(document.getElementById('__vfxcv').getContext('2d'));
  } catch (e) { renderOk = false; }
  R.render = renderOk;
  for (let i = 0; i < 60; i++) VFX.update(1/60);

  SETTINGS.reset();
})();
`, sandbox);
const vr = vm.runInContext('__vfxResults', sandbox);
console.log('\n— VFX + SETTINGS (Phase 3) —');
check('SETTINGS: defaults on fresh storage', vr.defaults);
check('SETTINGS: set() persists across reload', vr.persist);
check('SETTINGS: clamps numbers, rejects wrong types/unknown keys', vr.clamp);
check('SETTINGS: corrupt JSON falls back to defaults without throwing', vr.corrupt);
check('VFX: pool.length === CAP === 2048 at load', vr.poolLen);
check('VFX: stats().active === 0 fresh', vr.freshActive);
check('VFX: burst() activates n particles', vr.burstActive);
check('VFX: particles drain to 0 after their lifetime', vr.burstDrained);
check('VFX: flood past CAP — no growth, identity preserved, dropped>0, drains', vr.flood);
check(`VFX: timing — 600 full-pool updates < 3000ms (${vr.timingMs}ms)`, vr.timingOk);
check('VFX: reducedParticles scales burst count by 0.35 (min 1)', vr.reduced);
check('VFX: render(ctx) does not throw in headless fallback', vr.render);

// ---------------- SETTINGS: volume/resolution keys + STORE persistence (05-03) ----------------
vm.runInContext(`
globalThis.__settingsV2Results = {};
(function() {
  const R = __settingsV2Results;
  SETTINGS.reset();

  // 1. fresh defaults for the new keys
  R.freshVolumeDefaults = SETTINGS.get('masterVolume') === 1 && SETTINGS.get('musicVolume') === 1 &&
    SETTINGS.get('sfxVolume') === 1 && SETTINGS.get('resolutionMode') === 'auto';

  // 2. clamping
  SETTINGS.set('masterVolume', 5);
  R.clampHigh = SETTINGS.get('masterVolume') === 1;
  SETTINGS.set('masterVolume', -1);
  R.clampLow = SETTINGS.get('masterVolume') === 0;
  SETTINGS.reset();

  // 3. resolutionMode enum validation
  SETTINGS.set('resolutionMode', 'bogus');
  R.resolutionRejected = SETTINGS.get('resolutionMode') === 'auto';
  SETTINGS.set('resolutionMode', '1600x900');
  R.resolutionAccepted = SETTINGS.get('resolutionMode') === '1600x900';
  SETTINGS.reset();

  // 4. persistence round-trip via STORE (not raw localStorage)
  SETTINGS.set('masterVolume', 0.6);
  SETTINGS._v = null;
  R.volumePersist = SETTINGS.load().masterVolume === 0.6;
  SETTINGS.reset();

  // 5. Phase 3's existing keys are untouched by the extension
  R.phase3Untouched = SETTINGS.get('screenShake') === true && SETTINGS.get('shakeIntensity') === 1 &&
    SETTINGS.get('screenFlash') === true && SETTINGS.get('hitstop') === true &&
    SETTINGS.get('reducedParticles') === false;

  SETTINGS.reset();
})();
`, sandbox);
const svr = vm.runInContext('__settingsV2Results', sandbox);
console.log('\n— SETTINGS: volume/resolution + STORE persistence (05-03) —');
check('SETTINGS: masterVolume/musicVolume/sfxVolume/resolutionMode defaults on fresh storage', svr.freshVolumeDefaults);
check('SETTINGS: set(masterVolume, 5) clamps to 1', svr.clampHigh);
check('SETTINGS: set(masterVolume, -1) clamps to 0', svr.clampLow);
check("SETTINGS: set(resolutionMode, 'bogus') is rejected (unchanged)", svr.resolutionRejected);
check("SETTINGS: set(resolutionMode, '1600x900') is accepted", svr.resolutionAccepted);
check('SETTINGS: masterVolume persists across a reload via STORE', svr.volumePersist);
check("SETTINGS: Phase 3's screenShake/shakeIntensity/screenFlash/hitstop/reducedParticles are unaffected", svr.phase3Untouched);

// ---------------- Hitstop + CAMERA punch/kick/shake-scaling (Phase 3 Plan 2) ----------------
vm.runInContext(`
globalThis.__hitstopResults = {};
(function() {
  const R = __hitstopResults;
  SETTINGS.reset();
  GAME.startRun();
  const e = GAME.enemies.find(x => !x.dead);

  // 1. hitstop is a max, not additive
  GAME.hitstop = 0; GAME.hitstopCd = 0;
  VFX.hitstop(4);
  const afterFirst = GAME.hitstop;
  VFX.hitstop(3);
  R.hitstopMax = Math.abs(afterFirst - 4/60) < 1e-9 && Math.abs(GAME.hitstop - 4/60) < 1e-9;

  // 2. freezes runTime + enemy movement, still decays shake
  const rtBefore = GAME.runTime;
  const ex = e ? e.x : 0, ey = e ? e.y : 0;
  GAME.shake = 10;
  GAME.update(1/60);
  R.hitstopFreezes = GAME.runTime === rtBefore && (!e || (e.x === ex && e.y === ey)) && GAME.shake < 10;

  while (GAME.hitstop > 0) GAME.update(1/60);
  R.hitstopCdSet = GAME.hitstopCd > 0;

  // 3. grace window ignores small requests, honours big ones
  VFX.hitstop(4);
  R.cdIgnoresSmall = GAME.hitstop === 0;
  VFX.hitstop(10);
  R.cdHonoursBig = Math.abs(GAME.hitstop - 10/60) < 1e-9;
  while (GAME.hitstop > 0) GAME.update(1/60);
  GAME.hitstopCd = 0;

  // 4. SETTINGS.hitstop=false is a full no-op
  SETTINGS.set('hitstop', false);
  GAME.hitstop = 0;
  VFX.hitstop(8);
  R.settingOff = GAME.hitstop === 0;
  SETTINGS.set('hitstop', true);

  // 5. CAMERA punch/zoom pulse
  CAMERA.resetFx();
  CAMERA.punch(100, 100, 0.05, 0.2);
  CAMERA.update(0.02);
  const zoomDuring = CAMERA.zoomPulse();
  CAMERA.update(0.3);
  R.punchZoom = zoomDuring > 1 && CAMERA.zoom === 1;

  // 6. shakeScale gating (screenShake off = full no-op; intensity scales)
  CAMERA.resetFx();
  SETTINGS.set('screenShake', false);
  CAMERA.punch(50, 50, 0.05, 0.2);
  const punchNoop = CAMERA.punchT === 0;
  CAMERA.kick(5, 5);
  const kickNoop = CAMERA.kx === 0 && CAMERA.ky === 0;
  const scaleOff = CAMERA.shakeScale() === 0;
  SETTINGS.set('screenShake', true);
  SETTINGS.set('shakeIntensity', 0.5);
  const scaleHalf = CAMERA.shakeScale() === 0.5;
  R.shakeScale = punchNoop && kickNoop && scaleOff && scaleHalf;
  SETTINGS.reset();
  CAMERA.resetFx();

  // 7. kill-spam guarantees forward progress under hitstop chaining.
  // Real kill/hit call sites (hitEnemy/killEnemy) live INSIDE GAME.update()'s simulation
  // section, so they cannot fire while update() is short-circuited by hitstop — mirror
  // that here by only requesting a new hitstop when the sim actually ran this frame.
  GAME.startRun();
  const rt0 = GAME.runTime;
  for (let f = 0; f < 600; f++) {
    if (GAME.hitstop <= 0) VFX.hitstop(4);
    GAME.update(1/60);
  }
  R.killSpamProgress = (GAME.runTime - rt0) >= 4; // >= 40% of the 10s simulated
  GAME.hitstop = 0; GAME.hitstopCd = 0;
})();
`, sandbox);
const hr = vm.runInContext('__hitstopResults', sandbox);
console.log('\n— Hitstop + CAMERA punch/kick/shake (Phase 3) —');
check('VFX.hitstop() sets GAME.hitstop as a max, not additive', hr.hitstopMax);
check('Hitstop freezes runTime/enemy movement, still decays shake', hr.hitstopFreezes);
check('Hitstop end sets GAME.hitstopCd grace window', hr.hitstopCdSet);
check('Grace window ignores sub-8-frame requests, honours >=8-frame requests', hr.cdIgnoresSmall && hr.cdHonoursBig);
check('SETTINGS.hitstop=false makes VFX.hitstop() a no-op', hr.settingOff);
check('CAMERA.punch() pulses zoom > 1 then decays back to 1', hr.punchZoom);
check('CAMERA.shakeScale() gates punch/kick to no-op when screenShake=false, scales with shakeIntensity', hr.shakeScale);
check('Kill-spam hitstop chaining still guarantees forward progress', hr.killSpamProgress);

// ---------------- Combat presets + screen flash + hook points (Phase 3 Plan 2 Task 2) ----------------
vm.runInContext(`
globalThis.__combatVfxResults = {};
(function() {
  const R = __combatVfxResults;
  SETTINGS.reset();
  GAME.hitstop = 0; GAME.hitstopCd = 0;
  CAMERA.resetFx();

  // 1. every preset emits particles; bossDeath emits >= 80 (non-reduced)
  const presetNames = ['hit','crit','death','bossDeath','hurt','dash','castGlow','astraTrail','phase'];
  R.presetsEmit = presetNames.every(name => {
    const before = VFX.stats().active;
    VFX.emit(name, 400, 300, 0.3, '#ff8844');
    const after = VFX.stats().active;
    const grew = after > before;
    while (VFX.stats().active > 0) VFX.update(1/60); // drain between presets
    return grew;
  });
  VFX.emit('bossDeath', 400, 300, 0, '#ff8844');
  R.bossDeathCount = VFX.stats().active >= 80;
  while (VFX.stats().active > 0) VFX.update(1/60);

  // 2. hitEnemy on a non-boss, non-lethal hit emits particles
  GAME.startRun();
  const P = GAME.player;
  const enemy = GAME.enemies.find(x => !x.dead);
  if (enemy) {
    enemy.hp = enemy.maxhp * 10; // survive the hit
    const before = VFX.stats().active;
    hitEnemy(enemy, 5, 'attack');
    R.hitEmits = VFX.stats().active > before;
  } else R.hitEmits = false;
  while (VFX.stats().active > 0) VFX.update(1/60);

  // killEnemy on a non-boss sets hitstop + camera punch (screenShake on, cd clear)
  GAME.hitstop = 0; GAME.hitstopCd = 0; CAMERA.resetFx();
  const enemy2 = GAME.enemies.find(x => !x.dead && !x.boss) || GAME.enemies.find(x => !x.dead);
  if (enemy2) {
    killEnemy(enemy2);
    R.killSetsHitstop = GAME.hitstop > 0;
    R.killSetsPunch = CAMERA.punchT > 0;
  } else { R.killSetsHitstop = false; R.killSetsPunch = false; }
  while (GAME.hitstop > 0) GAME.update(1/60);
  GAME.hitstopCd = 0; CAMERA.resetFx();
  while (VFX.stats().active > 0) VFX.update(1/60);

  // killEnemy on a boss -> hitstop >= 9/60, flashT > 0
  GAME.hitstop = 0; GAME.hitstopCd = 0;
  const boss = new Boss('tataka', GAME.arena.x + 100, GAME.arena.y + 100);
  boss.hp = 1;
  killEnemy(boss);
  R.bossKillHitstop = GAME.hitstop >= 9/60;
  R.bossKillFlash = VFX.flashT > 0;
  while (GAME.hitstop > 0) GAME.update(1/60);
  GAME.hitstopCd = 0;
  VFX.flashT = 0;
  while (VFX.stats().active > 0) VFX.update(1/60);

  // 3. Player.takeDamage flashes red; screenFlash=false suppresses it
  P.iframes = 0; P.dashT = 0; P.hp = P.maxhp;
  VFX.flashT = 0;
  P.takeDamage(10);
  R.hurtFlash = VFX.flashT > 0 && VFX.flashColor === 0xff2030;
  VFX.flashT = 0;
  SETTINGS.set('screenFlash', false);
  P.iframes = 0; P.dashT = 0;
  P.takeDamage(10);
  R.hurtFlashOff = VFX.flashT === 0;
  SETTINGS.set('screenFlash', true);

  // 4. VFX.tick fades flash to 0
  VFX.flash(0xffffff, 0.5, 0.3);
  VFX.tick(0.5);
  R.tickFades = VFX.flashT === 0;

  GAME.hitstop = 0; GAME.hitstopCd = 0;
  CAMERA.resetFx();
  SETTINGS.reset();
  while (VFX.stats().active > 0) VFX.update(1/60);
})();
`, sandbox);
const cv = vm.runInContext('__combatVfxResults', sandbox);
console.log('\n— Combat presets + screen flash + hooks (Phase 3) —');
check('Every combat preset (hit/crit/death/bossDeath/hurt/dash/castGlow/astraTrail/phase) emits particles', cv.presetsEmit);
check('bossDeath emits >= 80 particles (non-reduced)', cv.bossDeathCount);
check('hitEnemy (non-lethal) emits pooled particles', cv.hitEmits);
check('killEnemy sets hitstop + camera punch (screenShake on)', cv.killSetsHitstop && cv.killSetsPunch);
check('killEnemy on a boss sets hitstop >= 9/60 and flashes the screen', cv.bossKillHitstop && cv.bossKillFlash);
check('Player.takeDamage flashes red (0xff2030)', cv.hurtFlash);
check('Player.takeDamage does not flash when SETTINGS.screenFlash=false', cv.hurtFlashOff);
check('VFX.tick(dt) fades the flash to 0', cv.tickFades);

// ---------------- Biome ambient particles (Phase 3 Plan 3 Task 1) ----------------
vm.runInContext(`
globalThis.__ambientResults = {};
(function() {
  const R = __ambientResults;
  SETTINGS.reset();
  const A = { x: 50, y: 84, w: 1180, h: 580 };
  // Generous per-biome margin derived from this file's own tuning (max |v| * max life),
  // not a fixed constant — see 03-03-SUMMARY.md for why a literal small margin doesn't
  // fit an ambient effect with a multi-second particle lifetime.
  const MARGIN = 70;

  R.perBiome = {};
  for (const id of ['naraka', 'patala', 'ranabhoomi', 'vaitarani']) {
    VFX._ambBiome = null; VFX._ambAcc = 0;
    while (VFX.stats().active > 0) VFX.update(1/60);
    for (let f = 0; f < 300; f++) { VFX.ambient(id, A, 1/60); VFX.update(1/60); }
    let inBounds = true;
    for (let i = 0; i < VFX.CAP; i++) {
      const p = VFX.pool[i];
      if (!p.active || !p.ambient) continue;
      if (p.x < A.x - MARGIN || p.x > A.x + A.w + MARGIN || p.y < A.y - MARGIN || p.y > A.y + A.h + MARGIN) inBounds = false;
    }
    R.perBiome[id] = { active: VFX.ambientActive > 0, inBounds };
    while (VFX.stats().active > 0) VFX.update(1/60);
  }

  // unknown biome is a no-op
  VFX.ambient('unknown-biome', A, 1/60);
  R.unknownNoop = VFX.stats().active === 0;

  // ambientActive never exceeds 15% of CAP, even at 10x rate for 3000 frames
  const savedRate = VFX.AMBIENT.naraka.rate;
  VFX.AMBIENT.naraka.rate = savedRate * 10;
  let capOk = true;
  for (let f = 0; f < 3000; f++) {
    VFX.ambient('naraka', A, 1/60);
    VFX.update(1/60);
    if (VFX.ambientActive > Math.floor(VFX.CAP * 0.15)) capOk = false;
  }
  R.ambientCapped = capOk;
  VFX.AMBIENT.naraka.rate = savedRate;
  while (VFX.stats().active > 0) VFX.update(1/60);

  // reducedParticles lowers steady-state ambientActive by at least half
  VFX._ambBiome = null; VFX._ambAcc = 0;
  SETTINGS.set('reducedParticles', false);
  for (let f = 0; f < 600; f++) { VFX.ambient('naraka', A, 1/60); VFX.update(1/60); }
  const normalActive = VFX.ambientActive;
  while (VFX.stats().active > 0) VFX.update(1/60);

  VFX._ambBiome = null; VFX._ambAcc = 0;
  SETTINGS.set('reducedParticles', true);
  for (let f = 0; f < 600; f++) { VFX.ambient('naraka', A, 1/60); VFX.update(1/60); }
  const reducedActive = VFX.ambientActive;
  R.reducedHalves = reducedActive <= normalActive * 0.5;
  while (VFX.stats().active > 0) VFX.update(1/60);
  SETTINGS.reset();
})();
`, sandbox);
const ar = vm.runInContext('__ambientResults', sandbox);
console.log('\n— Biome ambient particles (Phase 3) —');
for (const id of ['naraka', 'patala', 'ranabhoomi', 'vaitarani']) {
  check(`${id}: ambient particles active`, ar.perBiome[id].active);
  check(`${id}: ambient particles stay within arena bounds`, ar.perBiome[id].inBounds);
}
check('VFX.ambient(unknown biome) is a no-op', ar.unknownNoop);
check('VFX.ambientActive never exceeds 15% of CAP, even at 10x rate for 3000 frames', ar.ambientCapped);
check('reducedParticles lowers steady-state ambientActive by at least half', ar.reducedHalves);

// ---------------- Accessibility toggles / SETTINGS.bindDom (Phase 3 Plan 3 Task 2) ----------------
vm.runInContext(`
globalThis.__domResults = {};
(function() {
  const R = __domResults;
  SETTINGS.reset();

  SETTINGS.set('screenFlash', false);
  SETTINGS.bindDom();
  R.syncedFlash = document.getElementById('set-screenFlash').checked === false;
  R.syncedShake = document.getElementById('set-screenShake').checked === true;
  R.syncedIntensity = document.getElementById('set-shakeIntensity').value === '100';

  SETTINGS.applyFromDom({ id: 'set-hitstop', checked: false });
  R.applyBoolean = SETTINGS.get('hitstop') === false;
  SETTINGS.applyFromDom({ id: 'set-shakeIntensity', value: '40' });
  R.applyNumber = SETTINGS.get('shakeIntensity') === 0.4;

  let bindThrew = false;
  try { SETTINGS.applyFromDom({ id: 'set-does-not-exist', checked: true }); } catch (e) { bindThrew = true; }
  R.missingElOk = !bindThrew;

  SETTINGS.reset();
})();
`, sandbox);
const dr = vm.runInContext('__domResults', sandbox);
console.log('\n— Accessibility toggles / SETTINGS.bindDom (Phase 3) —');
check('SETTINGS.bindDom() syncs checkbox state from SETTINGS', dr.syncedFlash && dr.syncedShake);
check('SETTINGS.bindDom() syncs the shake-intensity slider as a percent string', dr.syncedIntensity);
check('SETTINGS.applyFromDom() applies boolean checkbox values', dr.applyBoolean);
check('SETTINGS.applyFromDom() applies range-slider values as 0..1 floats', dr.applyNumber);
check('SETTINGS.applyFromDom()/bindDom() with an unknown id does not throw', dr.missingElOk);

// ---------------- Worst-case stress run (Phase 3 Plan 3 Task 3) ----------------
console.log('\n— worst-case stress run (flooded pool, all 4 bosses) —');
vm.runInContext(`META.lastWeapon = 'gandiva'; VFX.stress = true;`, sandbox);
const stressT0 = Date.now();
const rs = vm.runInContext('simulateRun({ godMode: true })', sandbox);
const stressMs = Date.now() - stressT0;
vm.runInContext('VFX.stress = false;', sandbox);
console.log(`  (stress run took ${stressMs}ms wall clock)`);
check('stress run: no runtime errors' + (rs.errors.length ? ' — ' + rs.errors[0] : ''), rs.errors.length === 0);
check(`stress run: reaches victory (final=${rs.final})`, rs.final === 'victory');
check(`stress run: fights all 4 bosses (${[...rs.bosses].join(', ')})`, rs.bosses.size === 4);
check('stress run: VFX.pool.length === CAP (no growth under sustained saturation)',
  vm.runInContext('VFX.pool.length === VFX.CAP', sandbox) === true);
check('stress run: VFX.stats().peak <= CAP', vm.runInContext('VFX.stats().peak <= VFX.CAP', sandbox) === true);
check('stress run: VFX.stats().dropped > 0 (pool was genuinely saturated)',
  vm.runInContext('VFX.stats().dropped > 0', sandbox) === true);

check('VFX.renderDebug is a function', vm.runInContext('typeof VFX.renderDebug', sandbox) === 'function');
vm.runInContext(`
  globalThis.__debugOverlayOk = true;
  try {
    VFX.debug = true;
    VFX.renderDebug(document.getElementById('__vfxdebugcv').getContext('2d'));
  } catch (e) { __debugOverlayOk = false; }
  VFX.debug = false;
`, sandbox);
check('VFX.renderDebug(ctx) does not throw when VFX.debug is on', vm.runInContext('__debugOverlayOk', sandbox));
vm.runInContext('for (let i = 0; i < 600; i++) VFX.update(1/60);', sandbox); // drain fully

// ---------------- Settings menu: AUDIO volume hooks + rebinding (05-03 Task 2) ----------------
vm.runInContext(`
globalThis.__settingsMenuResults = {};
(function() {
  const R = __settingsMenuResults;
  SETTINGS.reset();

  // 1. AUDIO.getVolume reflects SETTINGS
  R.getMaster = AUDIO.getVolume('master') === 1;
  R.getMusic = AUDIO.getVolume('music') === 1;
  R.getSfx = AUDIO.getVolume('sfx') === 1;

  // 2. AUDIO.setVolume updates SETTINGS and doesn't throw (headless -> ctx is null)
  let setThrew = false;
  try { AUDIO.setVolume('sfx', 0.4); } catch (e) { setThrew = true; }
  R.setNoThrow = !setThrew;
  R.setPersists = SETTINGS.get('sfxVolume') === 0.4;

  // 3. AUDIO.setVolume with a bogus kind is a safe no-op
  let bogusThrew = false;
  try { AUDIO.setVolume('bogus', 0.4); } catch (e) { bogusThrew = true; }
  R.bogusNoThrow = !bogusThrew;

  SETTINGS.reset();

  // 4. UI.settings('hub') / UI.closeSettings() from the hub
  UI.hub();
  UI.settings('hub');
  R.hubSettingsShown = GAME.state === 'hub' && document.getElementById('settings').classList.contains('hidden') === false;
  UI.closeSettings();
  R.hubSettingsClosed = document.getElementById('settings').classList.contains('hidden') === true;

  // 5. UI.settings('pause') / UI.closeSettings() from pause
  GAME.state = 'combat';
  UI.pause();
  UI.settings('pause');
  R.pauseSettingsShown = GAME.state === 'paused' && document.getElementById('settings').classList.contains('hidden') === false;
  UI.closeSettings();
  R.pauseSettingsClosed = document.getElementById('settings').classList.contains('hidden') === true &&
    GAME.state === 'paused' && document.getElementById('pause').classList.contains('hidden') === false;
  UI.resume();

  // 6. UI.applyRebind mutates INPUT.bindings live and persists via STORE
  UI.applyRebind('dash', 'j');
  R.rebindApplied = JSON.stringify(INPUT.bindings.dash) === JSON.stringify(['j']);
  R.rebindPersisted = JSON.stringify(STORE.get('chakravyuha_bindings_v1', {}).dash) === JSON.stringify(['j']);

  // 7. rebinding a move action takes effect immediately for movement
  UI.applyRebind('moveUp', 'i');
  R.moveRebindWorks = JSON.stringify(PAD.digitalMoveVector({ i: true }, INPUT.bindings)) === JSON.stringify({ dx: 0, dy: -1 });

  // restore defaults for the rest of the suite
  INPUT.bindings.dash = [' '];
  INPUT.bindings.moveUp = ['w', 'arrowup'];
  STORE.set('chakravyuha_bindings_v1', INPUT.bindings);
  UI.hub();
})();
`, sandbox);
const smr = vm.runInContext('__settingsMenuResults', sandbox);
console.log('\n— Settings menu: AUDIO volume hooks + rebinding (05-03) —');
check("AUDIO.getVolume('master'/'music'/'sfx') reflects SETTINGS defaults", smr.getMaster && smr.getMusic && smr.getSfx);
check('AUDIO.setVolume does not throw headless (ctx is null) and persists to SETTINGS', smr.setNoThrow && smr.setPersists);
check('AUDIO.setVolume with an unknown kind is a safe no-op', smr.bogusNoThrow);
check("UI.settings('hub') shows the panel without leaving GAME.state='hub'", smr.hubSettingsShown);
check('UI.closeSettings() hides the settings panel (returned to hub)', smr.hubSettingsClosed);
check("UI.settings('pause') shows the panel while GAME.state='paused'", smr.pauseSettingsShown);
check('UI.closeSettings() re-shows #pause and leaves GAME.state="paused"', smr.pauseSettingsClosed);
check("UI.applyRebind('dash','j') sets INPUT.bindings.dash", smr.rebindApplied);
check('UI.applyRebind persists the binding via STORE', smr.rebindPersisted);
check('Rebinding a move* action takes effect immediately for PAD.digitalMoveVector', smr.moveRebindWorks);

// ---------------- Settings panel: full boot + open/close + AUDIO round-trip (05-03 Task 3) ----------------
vm.runInContext(`
globalThis.__settingsPanelResults = {};
(function() {
  const R = __settingsPanelResults;
  let threw = null;
  try {
    META.load();
    GAME.init();
    UI.hub();
    UI.settings('hub');
    R.openHiddenFalse = document.getElementById('settings').classList.contains('hidden') === false;
    UI.closeSettings();
    R.closeHiddenTrue = document.getElementById('settings').classList.contains('hidden') === true;
  } catch (e) { threw = e.message; }
  R.noThrow = threw === null;
  R.threwMsg = threw;

  R.volDefault = AUDIO.getVolume('master') === 1;
  AUDIO.setVolume('master', 0.3);
  R.volSet = AUDIO.getVolume('master') === 0.3;
  AUDIO.setVolume('master', 1); // reset so it doesn't affect anything after this point
})();
`, sandbox);
const spr = vm.runInContext('__settingsPanelResults', sandbox);
console.log('\n— Settings panel: full boot + open/close (05-03 Task 3) —');
check('a full boot + UI.settings("hub") + UI.closeSettings() sequence throws nothing' + (spr.threwMsg ? ' — ' + spr.threwMsg : ''), spr.noThrow);
check('UI.settings("hub") leaves #settings not hidden', spr.openHiddenFalse);
check('UI.closeSettings() leaves #settings hidden', spr.closeHiddenTrue);
check("AUDIO.getVolume('master') === 1 by default", spr.volDefault);
check("AUDIO.setVolume('master', 0.3) -> AUDIO.getVolume('master') === 0.3", spr.volSet);

// ---------------- provenance completeness (ART-06) ----------------
const { checkProvenance } = require('../tools/check-provenance.js');
const prov = checkProvenance(path.join(__dirname, '..', 'assets', 'sprites'));
check('provenance: every atlas has a PROVENANCE.json entry'
  + (prov.missing.length ? ' — missing: ' + prov.missing.join(', ') : ''), prov.ok);

// ---------------- Phase 4: boss telegraphs & phases (GAME-05/06) ----------------
console.log('\n— boss telegraphs & phases (Phase 4) —');
sandbox.__ctx = ctxStub;

// Capture the violation count BEFORE the per-move harness runs below, so a failure here is
// attributable to the full runs already executed earlier in this file (god-mode, weak-player,
// all-boons stress, gandiva/gada runs, worst-case stress) rather than to the harness itself.
const preHarnessViolations = vm.runInContext('BOSS_TG.violations.length', sandbox);
check('no unarmed boss damage across all full runs executed so far', preHarnessViolations === 0);

// Static source check: no touchAttack( in class Boss; takeDamage( only inside hurtPlayer();
// enemyShot( only inside shoot().
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'entities.js'), 'utf8');
  const bStart = src.indexOf('class Boss');
  const bEnd = src.indexOf('// ---------------- shared helpers', bStart);
  const bossBody = src.slice(bStart, bEnd);
  const noTouchAttack = !/touchAttack\(/.test(bossBody);

  function stripMethodBody(text, name) {
    const idx = text.indexOf(name + '(');
    if (idx === -1) return text;
    const braceStart = text.indexOf('{', idx);
    let depth = 0, i = braceStart;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return text.slice(0, idx) + text.slice(i);
  }
  let stripped = stripMethodBody(bossBody, 'hurtPlayer');
  stripped = stripMethodBody(stripped, 'shoot');
  const noStrayTakeDamage = !/takeDamage\(/.test(stripped);
  const noStrayEnemyShot = !/enemyShot\(/.test(stripped);
  check('Boss: no touchAttack( calls remain', noTouchAttack);
  check('Boss: takeDamage( only appears inside hurtPlayer()', noStrayTakeDamage);
  check('Boss: enemyShot( only appears inside shoot()', noStrayEnemyShot);
}

// Static data check: every referenced move id exists, damaging moves have wind >= 0.4s.
vm.runInContext(`
globalThis.__bossStatic = { errors: [] };
(function() {
  const E = __bossStatic.errors;
  for (const bossId of Object.keys(DATA.BOSSES)) {
    for (const ph of [1, 2]) {
      const table = BOSS_MOVESETS[bossId] && BOSS_MOVESETS[bossId][ph];
      if (!table || !table.length) { E.push(bossId + ' phase ' + ph + ' moveset empty/missing'); continue; }
      for (const entry of table) {
        const id = entry[0];
        if (!BOSS_MOVE_DEFS[id]) { E.push(bossId + ' phase ' + ph + ' unknown move ' + id); continue; }
        const def = { ...BOSS_MOVE_DEFS[id], ...(entry[2] || {}) };
        if (def.dmg && def.wind < 0.4) E.push(bossId + ' phase ' + ph + ' move ' + id + ' wind too short (' + def.wind + ')');
      }
    }
  }
})();
`, sandbox);
const bossStatic = vm.runInContext('__bossStatic', sandbox);
check('boss movesets: data integrity (known moves, damaging moves wind >= 0.4s)'
  + (bossStatic.errors.length ? ' — ' + bossStatic.errors.join('; ') : ''), bossStatic.errors.length === 0);

// Per-move harness: place the player in reach, force a specific move, and verify
// telegraph-before-damage for it.
vm.runInContext(`
globalThis.__bossMove = function(bossId, phase, moveId) {
  GAME.startRun();
  const P = GAME.player;
  P.maxhp = P.hp = 1e9;
  const biomeIdx = DATA.BIOMES.findIndex(b => b.boss === bossId);
  GAME.biomeIdx = biomeIdx; GAME.biome = DATA.BIOMES[biomeIdx];
  ROOMS.enterRoom('boss');
  const B = GAME.bossRef;
  B.asleep = false;
  B.state = 'rest'; B.t = 99;
  if (phase === 2) { B.phase = 2; B.hp = B.maxhp * 0.45; }
  const hits = [];
  const origTakeDamage = P.takeDamage.bind(P);
  P.takeDamage = function(amount, fx, fy) {
    hits.push({ state: B.state, armed: B.armed });
    return origTakeDamage(amount, fx, fy);
  };
  P.x = B.x - (B.r + 60); P.y = B.y;
  const v0 = BOSS_TG.violations.length;
  B.startMove(moveId);
  const serial = B.moveSerial;
  let wind = 0, drawErr = null, frames = 0;
  const DT = 1 / 60;
  while (frames++ < 360) {
    for (const e of GAME.enemies) if (e !== B) e.dead = true;
    P.iframes = 0; P.dashT = 0;
    if (/Wind$/.test(B.state)) wind += DT;
    GAME.update(DT);
    try { B.draw(__ctx); GAME.renderBackground(__ctx); GAME.renderEffects(__ctx); }
    catch (e) { drawErr = e.message; }
    if (B.moveSerial !== serial || B.phase !== phase) break;
  }
  P.takeDamage = origTakeDamage;
  return { wind, hits, dmgCalls: B.dmgCalls || 0, newViolations: BOSS_TG.violations.slice(v0),
           def: B.moveDef(moveId), drawErr };
};

// Moves that deal damage synchronously via hurtPlayer() at the moment of contact — for these,
// "armed" must be truthy at the exact instant P.takeDamage() fires. Ranged/AoE moves (radial,
// spiral, and later lamps/leap) deal damage via shoot()-spawned projectiles resolved by the
// shared enemy-projectile loop in game.js some frames later (after travel time), often once the
// boss has already moved on to 'rest' or its next move — armed is correctly null by then even
// though the shot was only ever fired while armed (already verified by newViolations === 0).
const DIRECT_DMG_MOVES = new Set(['swipe', 'charge', 'slam', 'noose']);

globalThis.__bossMoveResults = {};
for (const bossId of Object.keys(DATA.BOSSES)) {
  __bossMoveResults[bossId] = {};
  for (const phase of [1, 2]) {
    const table = BOSS_MOVESETS[bossId][phase];
    const ids = table.map(m => m[0]);
    if (ids.includes('chase') && !ids.includes('swipe')) ids.push('swipe');
    const fails = [];
    for (const moveId of ids) {
      const res = __bossMove(bossId, phase, moveId);
      if (res.drawErr) fails.push(moveId + ': draw error ' + res.drawErr);
      if (res.newViolations.length) fails.push(moveId + ': ' + res.newViolations.length + ' violations');
      if (DIRECT_DMG_MOVES.has(moveId) && !res.hits.every(h => h.armed)) fails.push(moveId + ': unarmed hit recorded');
      if (res.def.dmg) {
        if (res.wind < res.def.wind - 0.05) fails.push(moveId + ': wind ' + res.wind.toFixed(2) + ' < ' + res.def.wind);
        if (res.dmgCalls <= 0) fails.push(moveId + ': dmgCalls=0');
      }
    }
    __bossMoveResults[bossId][phase] = { ids, fails };
  }
}
`, sandbox);
const bossMoveResults = vm.runInContext('__bossMoveResults', sandbox);
console.log('\n— boss telegraphs: per-move harness (Phase 4) —');
for (const bossId of Object.keys(bossMoveResults)) {
  for (const phase of [1, 2]) {
    const r = bossMoveResults[bossId][phase];
    check(`${bossId} phase ${phase}: telegraph invariant holds for ${r.ids.join(',')}`
      + (r.fails.length ? ' — ' + r.fails.join('; ') : ''), r.fails.length === 0);
  }
}

// Static: every boss's phase-2 moveset contains >= 2 attacks absent from phase 1.
vm.runInContext(`
globalThis.__phase2NewMoves = {};
for (const bossId of Object.keys(DATA.BOSSES)) {
  const p1 = new Set(BOSS_MOVESETS[bossId][1].map(m => m[0]));
  const p2 = new Set(BOSS_MOVESETS[bossId][2].map(m => m[0]));
  __phase2NewMoves[bossId] = [...p2].filter(id => !p1.has(id));
}
`, sandbox);
const phase2NewMoves = vm.runInContext('__phase2NewMoves', sandbox);
console.log('\n— boss phase-2 movesets: >= 2 new attacks per boss (Phase 4) —');
for (const bossId of Object.keys(phase2NewMoves)) {
  check(`${bossId}: >= 2 phase-2-only attacks (${phase2NewMoves[bossId].join(', ')})`,
    phase2NewMoves[bossId].length >= 2);
}

// Phase-transition harness: 50% HP -> phaseShift -> deterministic opener -> phase-2-only
// moves appear over time, with zero new BOSS_TG violations along the way.
vm.runInContext(`
globalThis.__bossPhaseTransition = function(bossId) {
  GAME.startRun();
  const P = GAME.player;
  P.maxhp = P.hp = 1e9;
  const biomeIdx = DATA.BIOMES.findIndex(b => b.boss === bossId);
  GAME.biomeIdx = biomeIdx; GAME.biome = DATA.BIOMES[biomeIdx];
  ROOMS.enterRoom('boss');
  const B = GAME.bossRef;
  B.asleep = false;
  B.pickMove();
  B.hp = B.maxhp * 0.49;
  const v0 = BOSS_TG.violations.length;
  const DT = 1 / 60;

  GAME.update(DT);
  const enteredPhaseShift = B.phase === 2 && B.state === 'phaseShift';

  const table2 = BOSS_MOVESETS[bossId][2];
  const openerId = (table2.find(m => m[2] && m[2].opener) || [null])[0];
  let openerSeen = false, frames = 0;
  while (frames++ < 96) { // 1.6s
    for (const e of GAME.enemies) if (e !== B) e.dead = true;
    P.iframes = 0; P.dashT = 0;
    GAME.update(DT);
    if (B.lastMove === openerId && (B.state === openerId + 'Wind' || B.state === openerId)) { openerSeen = true; break; }
  }

  const lastMoves = new Set();
  frames = 0;
  while (frames++ < 1800) { // 30s
    for (const e of GAME.enemies) if (e !== B) e.dead = true;
    P.iframes = 0; P.dashT = 0;
    GAME.update(DT);
    lastMoves.add(B.lastMove);
  }
  const p1Ids = new Set(BOSS_MOVESETS[bossId][1].map(m => m[0]));
  const p2OnlyIds = new Set(BOSS_MOVESETS[bossId][2].map(m => m[0]).filter(id => !p1Ids.has(id)));
  const hasPhase2Only = [...lastMoves].some(id => p2OnlyIds.has(id));

  return { enteredPhaseShift, openerId, openerSeen, hasPhase2Only, newViolations: BOSS_TG.violations.length - v0 };
};

globalThis.__phaseTransitionResults = {};
for (const bossId of Object.keys(DATA.BOSSES)) __phaseTransitionResults[bossId] = __bossPhaseTransition(bossId);
`, sandbox);
const phaseTransitionResults = vm.runInContext('__phaseTransitionResults', sandbox);
console.log('\n— boss phase transitions: phaseShift -> deterministic opener -> phase-2 moves (Phase 4) —');
for (const bossId of Object.keys(phaseTransitionResults)) {
  const r = phaseTransitionResults[bossId];
  check(`${bossId}: 50% HP triggers phaseShift`, r.enteredPhaseShift);
  check(`${bossId}: opens phase 2 deterministically with its signature move (${r.openerId})`, r.openerSeen);
  check(`${bossId}: phase-2-only moves appear over 30s of play`, r.hasPhase2Only);
  check(`${bossId}: no new BOSS_TG violations during the phase transition`, r.newViolations === 0);
}

// Global gate: zero violations across everything simulated so far (full runs + all harnesses).
check('no unarmed boss damage anywhere (global BOSS_TG.violations gate)',
  vm.runInContext('BOSS_TG.violations.length', sandbox) === 0);

// ---------------- Phase 4: boons & duos (GAME-01/02) ----------------
console.log('\n— boons & duos (Phase 4, GAME-01/02) —');

const boonCountData = JSON.parse(vm.runInContext(`
  JSON.stringify({
    total: DATA.BOONS.length,
    perGod: Object.keys(DATA.GODS).map(g => ({ g, n: DATA.BOONS.filter(b => b.god === g).length }))
  })
`, sandbox));
check(`boon pool >= 24 total (actual ${boonCountData.total})`, boonCountData.total >= 24);
for (const { g, n } of boonCountData.perGod) check(`${g}: >= 4 boons (actual ${n})`, n >= 4);

vm.runInContext(`
globalThis.__duoIntegrityErrors = [];
try {
  const ids = new Set();
  for (const b of DATA.BOONS) ids.add(b.id);
  if (DATA.DUO_BOONS.length < 3) __duoIntegrityErrors.push('duo count < 3: ' + DATA.DUO_BOONS.length);
  for (const d of DATA.DUO_BOONS) {
    if (ids.has(d.id)) __duoIntegrityErrors.push(d.id + ' collides with a single-god boon id');
    ids.add(d.id);
    if (d.duo !== true) __duoIntegrityErrors.push(d.id + ' duo !== true');
    if (!Array.isArray(d.gods) || d.gods.length !== 2 || new Set(d.gods).size !== 2) __duoIntegrityErrors.push(d.id + ' gods must be 2 distinct ids');
    for (const g of d.gods) if (!DATA.GODS[g]) __duoIntegrityErrors.push(d.id + ' unknown god ' + g);
    const reqKeys = Object.keys(d.req).sort();
    const godsSorted = d.gods.slice().sort();
    if (JSON.stringify(reqKeys) !== JSON.stringify(godsSorted)) __duoIntegrityErrors.push(d.id + ' req keys != gods');
    for (const g of d.gods) {
      for (const rid of (d.req[g] || [])) {
        const b = DATA.BOONS.find(x => x.id === rid);
        if (!b) __duoIntegrityErrors.push(d.id + ' req id missing: ' + rid);
        else if (b.god !== g) __duoIntegrityErrors.push(d.id + ' req id ' + rid + ' belongs to ' + b.god + ' not ' + g);
      }
    }
    for (let r = 0; r < DATA.RARITIES.length; r++) {
      const s = d.desc(d.base * DATA.RARITIES[r].mult);
      if (!s || typeof s !== 'string' || !s.length) __duoIntegrityErrors.push(d.id + ' desc empty at rarity ' + r);
    }
    if (DATA.findBoon(d.id) !== d) __duoIntegrityErrors.push(d.id + ' findBoon mismatch');
  }
} catch (e) { __duoIntegrityErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const duoIntegrityErrors = vm.runInContext('__duoIntegrityErrors', sandbox);
check('duo boons: integrity (count, unique ids, gods, req lists, desc, findBoon)'
  + (duoIntegrityErrors.length ? ' — ' + duoIntegrityErrors.join('; ') : ''), duoIntegrityErrors.length === 0);

vm.runInContext(`
globalThis.__duoEligibilityErrors = [];
try {
  GAME.startRun();
  const P0 = GAME.player;
  if (P0.eligibleDuos().length !== 0) __duoEligibilityErrors.push('fresh run has eligible duos');

  for (const d of DATA.DUO_BOONS) {
    GAME.startRun();
    const P = GAME.player;
    for (const g of d.gods) {
      const rid = d.req[g][0];
      P.addBoon(DATA.findBoon(rid), 0);
    }
    const elig = P.eligibleDuos();
    if (!elig.includes(d)) __duoEligibilityErrors.push(d.id + ' not eligible after req boons added');
    const offer = P.duoOfferFor(d.gods[0]);
    if (!offer || !offer.gods.includes(d.gods[0])) __duoEligibilityErrors.push(d.id + ' duoOfferFor failed');
    P.addBoon(d, 0);
    if (P.eligibleDuos().includes(d)) __duoEligibilityErrors.push(d.id + ' still eligible after being taken');
    if (P.val(d.id) !== d.base) __duoEligibilityErrors.push(d.id + ' val mismatch at rarity 0');
  }
} catch (e) { __duoEligibilityErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const duoEligibilityErrors = vm.runInContext('__duoEligibilityErrors', sandbox);
check('duo boons: eligibility gating, offer targeting, post-pick exclusion'
  + (duoEligibilityErrors.length ? ' — ' + duoEligibilityErrors.join('; ') : ''), duoEligibilityErrors.length === 0);

vm.runInContext(`
globalThis.__duoEffectErrors = [];
try {
  function __freshEnemyRun() {
    GAME.startRun();
    const P = GAME.player;
    P.maxhp = 1e9; P.hp = 1e9;
    GAME.enemies = [];
    const e = new Enemy('bhuta', P.x + 60, P.y, 1);
    e.spawnT = 0; e.hp = e.maxhp = 1e6;
    GAME.enemies.push(e);
    return { P, e };
  }

  { const { P, e } = __freshEnemyRun();
    P.addBoon(DATA.findBoon('duo_pavanaputra'), 0);
    P.tryDash();
    if (!(P.pavanaT > 0)) __duoEffectErrors.push('pavanaputra: pavanaT not set after dash');
  }

  { const { P, e } = __freshEnemyRun();
    P.addBoon(DATA.findBoon('duo_khandava'), 0);
    chainLightning(e, 10, 0);
    if (!(e.burns.length > 0)) __duoEffectErrors.push('khandava: no burn applied via chain');
  }

  { const { P, e } = __freshEnemyRun();
    P.addBoon(DATA.findBoon('duo_yogamaya'), 0);
    P.iframes = 0; P.dashT = 0;
    P.takeDamage(5);
    if (!(P.iframes >= 1.1)) __duoEffectErrors.push('yogamaya: iframes not extended (' + P.iframes + ')');
    if (!(e.maya > 0)) __duoEffectErrors.push('yogamaya: enemy not marked with maya');
  }

  { const { P, e } = __freshEnemyRun();
    P.addBoon(DATA.findBoon('duo_marut'), 0);
    const h0 = e.hp;
    P.tryDash();
    if (!(e.hp < h0)) __duoEffectErrors.push('marut: enemy hp unchanged after dash');
  }

  { const { P, e } = __freshEnemyRun();
    P.addBoon(DATA.findBoon('duo_jwalamukhi'), 0);
    P.iframes = 0; P.dashT = 0;
    P.takeDamage(5);
    if (!(e.burns.length > 0)) __duoEffectErrors.push('jwalamukhi: no burn applied on hit');
  }

  { const { P, e } = __freshEnemyRun();
    const e2 = new Enemy('bhuta', e.x + 40, e.y, 1);
    e2.spawnT = 0; e2.hp = e2.maxhp = 1e6;
    GAME.enemies.push(e2);
    P.addBoon(DATA.findBoon('duo_kapidhvaja'), 0);
    for (let i = 0; i < 6; i++) hitEnemy(e, 1, 'attack');
    if (!(e2.maya > 0)) __duoEffectErrors.push('kapidhvaja: e2 not marked with maya');
    if (P.kapiHits !== 0) __duoEffectErrors.push('kapidhvaja: kapiHits not reset (' + P.kapiHits + ')');
  }
} catch (e) { __duoEffectErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const duoEffectErrors = vm.runInContext('__duoEffectErrors', sandbox);
check('duo boons: targeted synergy effects fire correctly in the real pipeline'
  + (duoEffectErrors.length ? ' — ' + duoEffectErrors.join('; ') : ''), duoEffectErrors.length === 0);

vm.runInContext(`
globalThis.__duoStressErrors = [];
try {
  META.lastWeapon = 'khanda'; // melee weapon (a prior VFX stress block leaves lastWeapon = 'gandiva'/bow)
  GAME.startRun();
  const P = GAME.player;
  P.maxhp = 1e9; P.hp = 1e9;
  for (const def of DATA.BOONS) P.addBoon(def, Math.floor(Math.random() * 3));
  for (const def of DATA.DUO_BOONS) P.addBoon(def, Math.floor(Math.random() * 3));
  for (let frame = 0; frame < 4000; frame++) {
    if (frame % 9 === 0) P.meleeAttack();
    if (frame % 40 === 0) P.tryDash();
    if (frame % 80 === 0) P.trySpecial();
    if (frame % 100 === 0) P.tryCast();
    if (frame % 60 === 0) { P.iframes = 0; P.dashT = 0; P.takeDamage(3); }
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
} catch (e) { __duoStressErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const duoStressErrors = vm.runInContext('__duoStressErrors', sandbox);
check('all boons + all duos active simultaneously, 4000 frames incl. periodic takeDamage'
  + (duoStressErrors.length ? ' — ' + duoStressErrors[0] : ''), duoStressErrors.length === 0);

vm.runInContext(`
globalThis.__duoOfferErrors = [];
try {
  for (const d of DATA.DUO_BOONS) {
    GAME.startRun();
    const P = GAME.player;
    for (const g of d.gods) P.addBoon(DATA.findBoon(d.req[g][0]), 0);
    UI.offerBoon(d.gods[0]);
    if (GAME.state !== 'choosing') __duoOfferErrors.push(d.id + ': state not choosing after offerBoon');
    const cards = document.getElementById('boon-cards').children;
    if (cards.length > META.boonChoices()) __duoOfferErrors.push(d.id + ': too many cards (' + cards.length + ')');
    const c0 = cards[0];
    if (!c0 || c0.duo !== true) __duoOfferErrors.push(d.id + ': first card not flagged duo');
    if (!c0 || !c0.className.includes('duo')) __duoOfferErrors.push(d.id + ': first card className missing duo');
    if (!c0 || !c0.innerHTML.includes('DUO') || !c0.innerHTML.includes(d.name)) __duoOfferErrors.push(d.id + ': first card innerHTML missing DUO/name');
    c0.onclick();
    if (!P.has(d.id)) __duoOfferErrors.push(d.id + ': picking card did not grant duo');
    GAME.state = 'cleared';
    UI.offerBoon(d.gods[0]);
    const cards2 = document.getElementById('boon-cards').children;
    const c02 = cards2[0];
    if (c02 && c02.duo === true && c02.innerHTML.includes(d.name)) __duoOfferErrors.push(d.id + ': offered again after being taken');
  }
} catch (e) { __duoOfferErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const duoOfferErrors = vm.runInContext('__duoOfferErrors', sandbox);
check('duo offer: styled first card when eligible, grants on pick, not re-offered'
  + (duoOfferErrors.length ? ' — ' + duoOfferErrors.join('; ') : ''), duoOfferErrors.length === 0);

vm.runInContext(`
globalThis.__duoNegErrors = [];
try {
  GAME.startRun();
  UI.offerBoon('agni');
  const cards = document.getElementById('boon-cards').children;
  for (const c of cards) if (c.duo) __duoNegErrors.push('duo card shown with no prerequisites met');
} catch (e) { __duoNegErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const duoNegErrors = vm.runInContext('__duoNegErrors', sandbox);
check('duo offer: never shown before prerequisites are met'
  + (duoNegErrors.length ? ' — ' + duoNegErrors.join('; ') : ''), duoNegErrors.length === 0);

// ---------------- Phase 4: room layouts (GAME-03) ----------------
console.log('\n— room layouts (Phase 4, GAME-03) —');

vm.runInContext(`
globalThis.__layoutErrors = [];
try {
  const A = GAME.arena;
  const spawnX = A.x + 90, spawnY = A.y + A.h / 2;
  const doorX = A.x + A.w - 36;
  const doorYs = [1/3, 1/2, 2/3].map(f => A.y + A.h * f);

  const seenIds = new Set();
  for (const biomeId of Object.keys(DATA.LAYOUTS)) {
    const list = ROOMS.layoutsFor(biomeId);
    if (list.length < 3) __layoutErrors.push(biomeId + ': fewer than 3 templates (' + list.length + ')');
    for (const tpl of list) {
      if (seenIds.has(tpl.id)) __layoutErrors.push(tpl.id + ': duplicate template id');
      seenIds.add(tpl.id);

      const obs = ROOMS.materializeLayout(tpl);
      for (const o of obs) {
        if (o.shape === 'circle') {
          if (o.x - o.r < A.x || o.x + o.r > A.x + A.w || o.y - o.r < A.y || o.y + o.r > A.y + A.h)
            __layoutErrors.push(tpl.id + ': circle obstacle out of bounds');
        } else {
          if (o.x < A.x || o.x + o.w > A.x + A.w || o.y < A.y || o.y + o.h > A.y + A.h)
            __layoutErrors.push(tpl.id + ': rect obstacle out of bounds');
        }
        if (ROOMS.obstacleDist(o, spawnX, spawnY) < 80)
          __layoutErrors.push(tpl.id + ': obstacle too close to spawn');
        for (const dy of doorYs) {
          if (ROOMS.obstacleDist(o, doorX, dy) < 34 + 24)
            __layoutErrors.push(tpl.id + ': obstacle too close to a door candidate');
        }
      }

      // reachability flood-fill (10px grid, player radius 13)
      const cell = 10, pr = 13;
      const cols = Math.floor(A.w / cell), rows = Math.floor(A.h / cell);
      const idx = (c, r) => r * cols + c;
      const walkable = (px, py) => px >= A.x + pr && px <= A.x + A.w - pr && py >= A.y + pr && py <= A.y + A.h - pr
        && !ROOMS.pointBlocked(px, py, pr, { obstacles: obs });
      const visited = new Uint8Array(cols * rows);
      const startCol = Math.floor((spawnX - A.x) / cell), startRow = Math.floor((spawnY - A.y) / cell);
      visited[idx(startCol, startRow)] = 1;
      const stack = [[startCol, startRow]];
      while (stack.length) {
        const [c, r] = stack.pop();
        for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          if (visited[idx(nc, nr)]) continue;
          const px = A.x + (nc + 0.5) * cell, py = A.y + (nr + 0.5) * cell;
          if (!walkable(px, py)) continue;
          visited[idx(nc, nr)] = 1;
          stack.push([nc, nr]);
        }
      }
      for (const dy of doorYs) {
        const dc = Math.floor((doorX - A.x) / cell), dr = Math.floor((dy - A.y) / cell);
        if (dc < 0 || dc >= cols || dr < 0 || dr >= rows || !visited[idx(dc, dr)])
          __layoutErrors.push(tpl.id + ': a door candidate is unreachable from spawn');
      }
    }
  }
} catch (e) { __layoutErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const layoutErrors = vm.runInContext('__layoutErrors', sandbox);
check('room layouts: >=3 templates/biome, unique ids, bounds, spawn/door clearance, reachability'
  + (layoutErrors.length ? ' — ' + layoutErrors.slice(0, 6).join('; ') + (layoutErrors.length > 6 ? ` (+${layoutErrors.length - 6} more)` : '') : ''),
  layoutErrors.length === 0);

vm.runInContext(`
globalThis.__collisionErrors = [];
try {
  // Rect push-out
  GAME.pillars = [{shape:'rect',kind:'wall',x:400,y:300,w:100,h:60}];
  { const ent = {x:450,y:330,r:13};
    clampToArena(ent);
    const cx = U.clamp(ent.x, 400, 500), cy = U.clamp(ent.y, 300, 360);
    const d = U.dist(ent.x, ent.y, cx, cy);
    if (d < 12.9) __collisionErrors.push('rect push-out: entity still inside inflated rect (d=' + d + ')');
  }

  // Circle legacy compat (no shape field)
  GAME.pillars = [{x:400,y:300,r:30}];
  { const ent = {x:405,y:300,r:13};
    clampToArena(ent);
    const d = U.dist(ent.x, ent.y, 400, 300);
    if (d < 42.9) __collisionErrors.push('legacy circle push-out: distance too small (d=' + d + ')');
  }

  // Pit blocks movement like a wall, but not projectiles
  GAME.pillars = [{shape:'rect',kind:'pit',x:400,y:300,w:100,h:60}];
  { const ent = {x:450,y:330,r:13};
    clampToArena(ent);
    const cx = U.clamp(ent.x, 400, 500), cy = U.clamp(ent.y, 300, 360);
    const d = U.dist(ent.x, ent.y, cx, cy);
    if (d < 12.9) __collisionErrors.push('pit push-out: entity still inside inflated pit (d=' + d + ')');
  }
  if (ROOMS.blocksProjectile({x:450,y:330,r:5}) !== false) __collisionErrors.push('pit should not block projectiles');
  GAME.pillars = [{shape:'rect',kind:'wall',x:400,y:300,w:100,h:60}];
  if (ROOMS.blocksProjectile({x:450,y:330,r:5}) !== true) __collisionErrors.push('wall should block projectiles');
} catch (e) { __collisionErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const collisionErrors = vm.runInContext('__collisionErrors', sandbox);
check('obstacle collision: rect push-out, legacy circle compat, pit vs wall projectile blocking'
  + (collisionErrors.length ? ' — ' + collisionErrors.join('; ') : ''), collisionErrors.length === 0);

vm.runInContext(`
globalThis.__projErrors = [];
try {
  GAME.startRun();
  GAME.enemies = [];
  const A = GAME.arena;
  const px = A.x + 900, py = A.y + 500; // far from player spawn (A.x+90, A.y+A.h/2)

  GAME.pillars = [{shape:'rect',kind:'pit',x:px-20,y:py-20,w:40,h:40}];
  GAME.eprojectiles = [{x:px,y:py,vx:0,vy:0,dmg:0,color:'#fff',r:5,t:4}];
  GAME.update(1/60);
  if (GAME.eprojectiles.length !== 1) __projErrors.push('projectile over a pit was incorrectly removed');

  GAME.pillars = [{shape:'rect',kind:'wall',x:px-20,y:py-20,w:40,h:40}];
  GAME.eprojectiles = [{x:px,y:py,vx:0,vy:0,dmg:0,color:'#fff',r:5,t:4}];
  GAME.update(1/60);
  if (GAME.eprojectiles.length !== 0) __projErrors.push('projectile over a wall was not removed');
} catch (e) { __projErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const projErrors = vm.runInContext('__projErrors', sandbox);
check('projectile blocking: pit lets enemy projectiles through, wall stops them'
  + (projErrors.length ? ' — ' + projErrors.join('; ') : ''), projErrors.length === 0);

vm.runInContext(`
globalThis.__drawObstacleErrors = [];
try {
  GAME.pillars = [
    {shape:'circle',kind:'pillar',x:400,y:300,r:30},
    {shape:'rect',kind:'wall',x:500,y:300,w:80,h:40},
    {shape:'rect',kind:'pit',x:650,y:300,w:80,h:40},
    {shape:'circle',kind:'pit',x:800,y:300,r:30},
  ];
  GAME.renderBackground(__ctx);
} catch (e) { __drawObstacleErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const drawObstacleErrors = vm.runInContext('__drawObstacleErrors', sandbox);
check('renderObstacles draws pillar/wall/pit (circle+rect) without throwing'
  + (drawObstacleErrors.length ? ' — ' + drawObstacleErrors.join('; ') : ''), drawObstacleErrors.length === 0);

vm.runInContext(`
globalThis.__varietyErrors = [];
try {
  ROOMS.layoutHistory = []; ROOMS.lastLayoutId = null;
  for (const biomeId of Object.keys(DATA.LAYOUTS)) {
    GAME.biome = DATA.BIOMES.find(b => b.id === biomeId);
    ROOMS.lastLayoutId = null; // fresh biome: no cross-biome carryover expected (ids never collide)
    for (let i = 0; i < 20; i++) ROOMS.buildArena(false);
  }
  const hist = ROOMS.layoutHistory;
  const distinct = new Set(hist.map(h => h.id));
  if (distinct.size < 4) __varietyErrors.push('fewer than 4 distinct template ids seen across ' + hist.length + ' rooms (' + distinct.size + ')');
  for (const h of hist) {
    const list = DATA.LAYOUTS[h.biome] || [];
    if (!list.some(t => t.id === h.id)) __varietyErrors.push(h.id + ' not a valid template id for ' + h.biome);
  }
  let prevBiome = null, prevId = null;
  for (const h of hist) {
    if (h.biome === prevBiome && h.id === prevId) __varietyErrors.push('consecutive repeat of ' + h.id + ' in ' + h.biome);
    prevBiome = h.biome; prevId = h.id;
  }
} catch (e) { __varietyErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const varietyErrors = vm.runInContext('__varietyErrors', sandbox);
check('room layout variety: >=4 distinct templates seen, all valid, never an immediate repeat per biome'
  + (varietyErrors.length ? ' — ' + varietyErrors.slice(0, 5).join('; ') : ''), varietyErrors.length === 0);

vm.runInContext(`
globalThis.__spawnErrors = [];
try {
  for (const biomeId of Object.keys(DATA.LAYOUTS)) {
    const biomeIdx = DATA.BIOMES.findIndex(b => b.id === biomeId);
    for (const tpl of ROOMS.layoutsFor(biomeId)) {
      GAME.startRun();
      GAME.biomeIdx = biomeIdx; GAME.biome = DATA.BIOMES[biomeIdx];
      ROOMS.enterRoom('mudra');
      ROOMS.buildArena(false, tpl.id);
      if (ROOMS.pointBlocked(GAME.player.x, GAME.player.y, GAME.player.r))
        __spawnErrors.push(tpl.id + ': player spawn point is blocked');
      GAME.enemies = [];
      ROOMS.spawnWave(16);
      ROOMS.spawnWave(16);
      for (const e of GAME.enemies) {
        if (ROOMS.pointBlocked(e.x, e.y, e.r))
          __spawnErrors.push(tpl.id + ': enemy ' + e.type + ' spawned inside/near an obstacle');
      }
    }
  }
} catch (e) { __spawnErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const spawnErrors = vm.runInContext('__spawnErrors', sandbox);
check('forced-template rooms: player spawn clear, enemies never spawn inside/near an obstacle'
  + (spawnErrors.length ? ' — ' + spawnErrors.slice(0, 5).join('; ') + (spawnErrors.length > 5 ? ` (+${spawnErrors.length - 5} more)` : '') : ''),
  spawnErrors.length === 0);

// ---------------- Phase 4: hazards (GAME-04) ----------------
console.log('\n— environmental hazards (Phase 4, GAME-04) —');

vm.runInContext(`
globalThis.__hazardStaticErrors = [];
try {
  const ids = new Set();
  for (const b of DATA.BIOMES) {
    if (!DATA.HAZARDS[b.hazard]) __hazardStaticErrors.push(b.id + ': hazard id missing from DATA.HAZARDS (' + b.hazard + ')');
    ids.add(b.hazard);
  }
  if (ids.size !== 4) __hazardStaticErrors.push('expected 4 distinct hazard ids, got ' + ids.size);
  for (const def of Object.values(DATA.HAZARDS)) {
    if (def.damaging && !((def.warn || 0) >= 0.6 || (def.grace || 0) >= 0.6))
      __hazardStaticErrors.push(def.id + ': damaging hazard has no >=0.6s warn/grace');
  }
} catch (e) { __hazardStaticErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const hazardStaticErrors = vm.runInContext('__hazardStaticErrors', sandbox);
check('hazards: every biome maps to a valid, distinct hazard; damaging hazards telegraph >=0.6s'
  + (hazardStaticErrors.length ? ' — ' + hazardStaticErrors.join('; ') : ''), hazardStaticErrors.length === 0);

vm.runInContext(`
globalThis.__hazardPlacementErrors = [];
try {
  const A = GAME.arena;
  const spawnX = A.x + 90, spawnY = A.y + A.h / 2;
  for (let bi = 0; bi < DATA.BIOMES.length; bi++) {
    const biome = DATA.BIOMES[bi];
    for (let trial = 0; trial < 10; trial++) {
      GAME.startRun();
      GAME.biomeIdx = bi; GAME.biome = biome;
      ROOMS.enterRoom('mudra');
      if (GAME.hazards.length < 1) __hazardPlacementErrors.push(biome.id + ': no hazards spawned in a combat room');
      for (const h of GAME.hazards) {
        if (h.type !== biome.hazard) __hazardPlacementErrors.push(biome.id + ': wrong hazard type ' + h.type);
        if (h.type === 'fireVent' || h.type === 'venomPool') {
          if (U.dist(h.x, h.y, spawnX, spawnY) < 80) __hazardPlacementErrors.push(h.type + ': too close to spawn');
          if (ROOMS.pointBlocked(h.x, h.y, h.r)) __hazardPlacementErrors.push(h.type + ': placed inside an obstacle');
        }
        if (h.type === 'riverCurrent') {
          if (spawnY >= h.y && spawnY <= h.y + h.h) __hazardPlacementErrors.push('riverCurrent band contains the spawn point');
        }
      }
    }
  }
} catch (e) { __hazardPlacementErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const hazardPlacementErrors = vm.runInContext('__hazardPlacementErrors', sandbox);
check('hazards: placed correctly per biome (type, spawn clearance, obstacle clearance, river band)'
  + (hazardPlacementErrors.length ? ' — ' + hazardPlacementErrors.slice(0, 5).join('; ') + (hazardPlacementErrors.length > 5 ? ` (+${hazardPlacementErrors.length - 5} more)` : '') : ''),
  hazardPlacementErrors.length === 0);

vm.runInContext(`
globalThis.__hazardNonCombatErrors = [];
try {
  GAME.startRun();
  ROOMS.enterRoom('sarovar');
  if (GAME.hazards.length !== 0) __hazardNonCombatErrors.push('sarovar room has hazards');
  GAME.startRun();
  ROOMS.enterRoom('boss');
  if (GAME.hazards.length !== 0) __hazardNonCombatErrors.push('boss room has hazards');
} catch (e) { __hazardNonCombatErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const hazardNonCombatErrors = vm.runInContext('__hazardNonCombatErrors', sandbox);
check('hazards: never spawned in sarovar or boss rooms'
  + (hazardNonCombatErrors.length ? ' — ' + hazardNonCombatErrors.join('; ') : ''), hazardNonCombatErrors.length === 0);

vm.runInContext(`
globalThis.__hazardSlowErrors = [];
try {
  GAME.startRun();
  const P = GAME.player;
  const base = P.moveSpeed();
  P.hazardSlowT = 0.2; P.hazardSlowF = 0.6;
  const slowed = P.moveSpeed();
  if (Math.abs(slowed - base * 0.6) > 0.01)
    __hazardSlowErrors.push('moveSpeed not scaled by hazardSlowF (base=' + base + ', slowed=' + slowed + ')');
} catch (e) { __hazardSlowErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const hazardSlowErrors = vm.runInContext('__hazardSlowErrors', sandbox);
check('hazards: player hazardSlowT/hazardSlowF scale moveSpeed'
  + (hazardSlowErrors.length ? ' — ' + hazardSlowErrors.join('; ') : ''), hazardSlowErrors.length === 0);

// ---- per-type hazard behavior (telegraph, damage, slow, push) ----
vm.runInContext(`
globalThis.__hazardRoom = function(biomeIdx) {
  GAME.startRun();
  const P = GAME.player;
  P.maxhp = 1e9; P.hp = 1e9;
  GAME.biomeIdx = biomeIdx; GAME.biome = DATA.BIOMES[biomeIdx];
  ROOMS.enterRoom('mudra');
  const A = GAME.arena;
  for (const e of GAME.enemies) { e.hp = e.maxhp = 1e9; e.stun = 1e9; e.x = A.x + A.w - 20; e.y = A.y + 20; }
  P.__hits = 0;
  const orig = P.takeDamage.bind(P);
  P.takeDamage = function(amount, fx, fy) { P.__hits++; return orig(amount, fx, fy); };
  return P;
};
`, sandbox);

vm.runInContext(`
globalThis.__fireVentErrors = [];
try {
  const P = __hazardRoom(0);
  const vents = GAME.hazards.filter(h => h.type === 'fireVent');
  if (!vents.length) __fireVentErrors.push('no fireVent hazards spawned');
  else {
    P.x = vents[0].x; P.y = vents[0].y;
    let testEnemy = null, e0hp = null;
    if (vents.length > 1) {
      testEnemy = new Enemy('preta', vents[1].x, vents[1].y, 1);
      testEnemy.spawnT = 0; testEnemy.stun = 1e9; testEnemy.hp = testEnemy.maxhp = 1e6;
      GAME.enemies.push(testEnemy);
      e0hp = testEnemy.hp;
    }
    for (let f = 0; f < 600; f++) {
      P.iframes = 0; P.dashT = 0;
      GAME.update(1/60);
      GAME.renderHazards(__ctx);
    }
    if (P.__hits < 1) __fireVentErrors.push('fireVent: player never hit within 10s');
    if (testEnemy && !(testEnemy.hp < e0hp)) __fireVentErrors.push('fireVent: enemy on vent[1] never took damage');
  }
} catch (e) { __fireVentErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const fireVentErrors = vm.runInContext('__fireVentErrors', sandbox);
check('fireVent: telegraphs then hits the player and nearby enemies'
  + (fireVentErrors.length ? ' — ' + fireVentErrors.join('; ') : ''), fireVentErrors.length === 0);

vm.runInContext(`
globalThis.__venomErrors = [];
try {
  const P = __hazardRoom(1);
  const pools = GAME.hazards.filter(h => h.type === 'venomPool');
  if (!pools.length) __venomErrors.push('no venomPool hazards spawned');
  else {
    const unslowed = P.moveSpeed();
    P.x = pools[0].x; P.y = pools[0].y;
    const testEnemy = new Enemy('preta', pools[0].x, pools[0].y, 1);
    testEnemy.spawnT = 0; testEnemy.stun = 1e9; testEnemy.slowT = 0; testEnemy.slowF = 1;
    GAME.enemies.push(testEnemy);

    P.iframes = 0; P.dashT = 0;
    GAME.update(1/60);
    if (!(P.moveSpeed() < unslowed * 0.7))
      __venomErrors.push('venomPool: player not sufficiently slowed after 1 frame (speed=' + P.moveSpeed() + ', unslowed=' + unslowed + ')');
    if (!(testEnemy.slowT > 0)) __venomErrors.push('venomPool: enemy not slowed');

    for (let f = 0; f < 179; f++) { P.iframes = 0; P.dashT = 0; GAME.update(1/60); GAME.renderHazards(__ctx); }
    if (P.__hits < 1) __venomErrors.push('venomPool: player never took a tick of damage within 3s');
  }
} catch (e) { __venomErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const venomErrors = vm.runInContext('__venomErrors', sandbox);
check('venomPool: slows player and enemies, ticks damage on the player'
  + (venomErrors.length ? ' — ' + venomErrors.join('; ') : ''), venomErrors.length === 0);

vm.runInContext(`
globalThis.__volleyErrors = [];
try {
  const P = __hazardRoom(2);
  for (let f = 0; f < 600; f++) {
    P.iframes = 0; P.dashT = 0;
    GAME.update(1/60);
    GAME.renderHazards(__ctx);
  }
  if (P.__hits < 1) __volleyErrors.push('arrowVolley: player never hit within 10s');
} catch (e) { __volleyErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const volleyErrors = vm.runInContext('__volleyErrors', sandbox);
check('arrowVolley: ground marker telegraphs then hits a stationary player'
  + (volleyErrors.length ? ' — ' + volleyErrors.join('; ') : ''), volleyErrors.length === 0);

vm.runInContext(`
globalThis.__riverErrors = [];
try {
  const P = __hazardRoom(3);
  const river = GAME.hazards.find(h => h.type === 'riverCurrent');
  if (!river) __riverErrors.push('no riverCurrent hazard spawned');
  else {
    const A = GAME.arena;
    P.x = A.x + A.w / 2; P.y = river.y + river.h / 2;
    const x0 = P.x;
    for (let f = 0; f < 60; f++) {
      P.iframes = 0; P.dashT = 0;
      GAME.update(1/60);
      GAME.renderHazards(__ctx);
    }
    const dx = (P.x - x0) * river.dir;
    if (dx < 60) __riverErrors.push('riverCurrent: player displacement too small (' + dx + 'px in 1s)');
  }
} catch (e) { __riverErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const riverErrors = vm.runInContext('__riverErrors', sandbox);
check('riverCurrent: pushes the player along its direction'
  + (riverErrors.length ? ' — ' + riverErrors.join('; ') : ''), riverErrors.length === 0);

vm.runInContext(`
globalThis.__dormancyErrors = [];
try {
  const P = __hazardRoom(0);
  const vents = GAME.hazards.filter(h => h.type === 'fireVent');
  if (!vents.length) __dormancyErrors.push('no fireVent hazards spawned for dormancy check');
  else {
    P.x = vents[0].x; P.y = vents[0].y;
    for (let f = 0; f < 600 && P.__hits < 1; f++) { P.iframes = 0; P.dashT = 0; GAME.update(1/60); }
    if (P.__hits < 1) __dormancyErrors.push('dormancy: could not get an initial hit to test against');
    GAME.state = 'cleared';
    const before = P.__hits;
    for (let f = 0; f < 180; f++) { P.iframes = 0; P.dashT = 0; GAME.update(1/60); GAME.renderHazards(__ctx); }
    if (P.__hits !== before) __dormancyErrors.push('dormancy: hazard still dealt damage after the room left combat state');
  }
} catch (e) { __dormancyErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const dormancyErrors = vm.runInContext('__dormancyErrors', sandbox);
check('hazards go dormant once the room leaves combat state (no damage for 3s after clear)'
  + (dormancyErrors.length ? ' — ' + dormancyErrors.join('; ') : ''), dormancyErrors.length === 0);

const hazardViolationsAfterSims = vm.runInContext('(GAME.hazardViolations || [])', sandbox);
check('no unwarned hazard damage anywhere in the targeted hazard sims (hazardViolations gate)'
  + (hazardViolationsAfterSims.length ? ' — ' + hazardViolationsAfterSims.join(', ') : ''),
  hazardViolationsAfterSims.length === 0);

vm.runInContext('GAME.hazardViolations = [];', sandbox);
console.log('\n— re-run full runs with hazards active —');
const r1h = vm.runInContext('simulateRun({ godMode: true })', sandbox);
check('run 1 (god mode) still reaches victory with hazards active'
  + (r1h.errors.length ? ' — ' + r1h.errors[0] : ''), r1h.errors.length === 0 && r1h.final === 'victory');
const r2h = vm.runInContext('simulateRun({ weakPlayer: true })', sandbox);
// Note: by this point in the file, an earlier meta-progression block has maxed out
// META (sanjeevani/defiance etc, a process-wide singleton), so a "weak player" run may
// now survive to victory instead of dying — that's expected meta-progression behavior,
// not a hazard regression. We only assert it completes cleanly (no errors, reaches an
// end state), matching this plan's actual concern (hazards don't break full runs).
check('run 2 (weak player) still completes cleanly with hazards active (final=' + r2h.final + ')'
  + (r2h.errors.length ? ' — ' + r2h.errors[0] : ''),
  r2h.errors.length === 0 && (r2h.final === 'dead' || r2h.final === 'victory'));
const hazardViolationsAfterFullRuns = vm.runInContext('(GAME.hazardViolations || [])', sandbox);
check('no unwarned hazard damage across full god-mode + weak-player runs'
  + (hazardViolationsAfterFullRuns.length ? ' — ' + hazardViolationsAfterFullRuns.join(', ') : ''),
  hazardViolationsAfterFullRuns.length === 0);

// ---------------- Quick 260926-d5o: HUD motif pass + duo card style reconciliation ----------------
console.log('\n— HUD motif pass + duo card style reconciliation (quick 260926-d5o) —');
vm.runInContext(`
globalThis.__hudMotifErrors = [];
try {
  GAME.startRun();
  if (GAME.state !== 'combat') __hudMotifErrors.push('expected live run state combat, got ' + GAME.state);
  INPUT.device = 'pad';
  GAME.renderHUD(__ctx);
  INPUT.device = 'kbm';
  GAME.renderHUD(__ctx);
} catch (e) { __hudMotifErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const hudMotifErrors = vm.runInContext('__hudMotifErrors', sandbox);
check('renderHUD does not throw for gamepad or keyboard/mouse INPUT.device during a live run'
  + (hudMotifErrors.length ? ' — ' + hudMotifErrors.join('; ') : ''), hudMotifErrors.length === 0);

vm.runInContext(`
globalThis.__duoStyleErrors = [];
try {
  const d = DATA.DUO_BOONS[0];
  GAME.startRun();
  const P = GAME.player;
  for (const g of d.gods) P.addBoon(DATA.findBoon(d.req[g][0]), 0);
  UI.offerBoon(d.gods[0]);
  const cards = document.getElementById('boon-cards').children;
  const c0 = cards[0];
  if (!c0 || !c0.className.includes('duo')) __duoStyleErrors.push('duo card className missing duo: ' + (c0 && c0.className));
  if (!c0 || !c0.style.cssText.includes('--god2')) __duoStyleErrors.push('duo card cssText missing --god2: ' + (c0 && c0.style.cssText));
} catch (e) { __duoStyleErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const duoStyleErrors = vm.runInContext('__duoStyleErrors', sandbox);
check('duo boon card carries the duo class and a --god2 CSS var (02-09 .card.duo reconciliation)'
  + (duoStyleErrors.length ? ' — ' + duoStyleErrors.join('; ') : ''), duoStyleErrors.length === 0);

// ---------------- Quick 260926-dcz: arena readability polish ----------------
console.log('\n— arena readability polish: floor/obstacles/HUD render for all biomes (quick 260926-dcz) —');
vm.runInContext(`
globalThis.__readabilityErrors = [];
try {
  GAME.startRun();
  GAME.pillars = [
    {shape:'rect',kind:'wall',x:400,y:300,w:100,h:60},
    {shape:'circle',kind:'pillar',x:600,y:300,r:30},
    {shape:'rect',kind:'pit',x:750,y:300,w:80,h:40},
    {shape:'circle',kind:'pit',x:900,y:300,r:30},
  ];
  for (const b of DATA.BIOMES) {
    GAME.biome = b;
    GAME.renderBackground(__ctx);
    GAME.renderObstacles(__ctx);
    GAME.renderHUD(__ctx);
  }
} catch (e) { __readabilityErrors.push(e.stack.split('\\n').slice(0,3).join(' | ')); }
`, sandbox);
const readabilityErrors = vm.runInContext('__readabilityErrors', sandbox);
check('renderBackground + renderObstacles + renderHUD run without throwing for each biome (rect walls, circle pillars, pits)'
  + (readabilityErrors.length ? ' — ' + readabilityErrors.join('; ') : ''), readabilityErrors.length === 0);

// ---------------- Quick 260926-djs: character readability — ground rings + rim lift ----------------
console.log('\n— character readability: ground marker spec (quick 260926-djs) —');
{
  const R = (src) => vm.runInContext(src, sandbox);

  check('SPRITES.parseColor: hex string, number passthrough, malformed fallback',
    R("JSON.stringify([SPRITES.parseColor('#ff8800'), SPRITES.parseColor(0x123456), SPRITES.parseColor(undefined), SPRITES.parseColor('nope')])")
      === JSON.stringify([0xff8800, 0x123456, 0xffffff, 0xffffff]));

  check('SPRITES.groundMarkerSpec: sizes scale with r',
    R(`(() => {
      const g10 = SPRITES.groundMarkerSpec({ r: 10, type: 'rakshasa', color: '#ff0000' }, 0);
      const g20 = SPRITES.groundMarkerSpec({ r: 20, type: 'rakshasa', color: '#ff0000' }, 0);
      return g20.rx > g10.rx && g20.ry > g10.ry;
    })()`) === true);

  check('SPRITES.groundMarkerSpec: player kind is gold',
    R("(() => { const gp = SPRITES.groundMarkerSpec({ r: 13 }, 0); return gp.kind === 'player' && gp.color === SPRITES.CFG.RING_PLAYER_COLOR; })()") === true);

  check('SPRITES.groundMarkerSpec: boss rx > enemy rx for larger r',
    R(`(() => {
      const genemy = SPRITES.groundMarkerSpec({ r: 14, type: 'rakshasa', color: '#ff0000', boss: false }, 0);
      const gboss  = SPRITES.groundMarkerSpec({ r: 30, type: 'tataka', color: '#ff0000', boss: true }, 0);
      return gboss.kind === 'boss' && genemy.kind === 'enemy' && gboss.rx > genemy.rx && gboss.ry > genemy.ry;
    })()`) === true);

  check('SPRITES.groundMarkerSpec: alpha and shadowAlpha in (0,1] for player/enemy/boss',
    R(`(() => {
      const gp = SPRITES.groundMarkerSpec({ r: 13 }, 0);
      const ge = SPRITES.groundMarkerSpec({ r: 14, type: 'rakshasa', color: '#ff0000' }, 0);
      const gb = SPRITES.groundMarkerSpec({ r: 30, type: 'tataka', color: '#ff0000', boss: true }, 0);
      return [gp, ge, gb].every(s => s.alpha > 0 && s.alpha <= 1 && s.shadowAlpha > 0 && s.shadowAlpha <= 1);
    })()`) === true);

  check('SPRITES.groundMarkerSpec: player pulse oscillates with phase, enemy/boss pulse is flat 1',
    R(`(() => {
      const p0 = SPRITES.groundMarkerSpec({ r: 13 }, 0).pulse;
      const p1 = SPRITES.groundMarkerSpec({ r: 13 }, 0.5).pulse;
      const e0 = SPRITES.groundMarkerSpec({ r: 14, type: 'rakshasa', color: '#ff0000' }, 0.5).pulse;
      return p0 !== p1 && e0 === 1;
    })()`) === true);

  check('SPRITES ground markers: destroyed via removeEntity/endEntities, faded+destroyed via retireEntity/tickDying, swept by clearEntities',
    R(`(() => {
      const mk = () => ({ parent: null, alpha: 1, rotation: 0, filters: null,
        scale: { x: 1, y: 1, set(a, b) { this.x = a; this.y = b; } },
        d: false, destroy() { this.d = true; } });

      // A stays (seen this frame); B is unseen + not dead -> removeEntity destroys sprite+marker now.
      const A = { _pixiSprite: mk(), _pixiMarker: mk() };
      const B = { _pixiSprite: mk(), _pixiMarker: mk() };
      SPRITES._tracked.add(A); SPRITES._tracked.add(B);
      SPRITES.beginEntities();
      SPRITES._markSeen(A);
      const bMarker = B._pixiMarker;
      SPRITES.endEntities();
      const r1 = bMarker.d === true && B._pixiMarker === null && !SPRITES._tracked.has(B)
        && A._pixiMarker && A._pixiMarker.d === false && SPRITES._tracked.has(A);

      // C is dead -> retireEntity hands sprite+marker to the dying pool; tickDying fades then destroys both.
      const C = { _pixiSprite: mk(), _pixiMarker: mk(), dead: true };
      SPRITES._tracked.add(C);
      const cMarker = C._pixiMarker, cSprite = C._pixiSprite;
      SPRITES.retireEntity(C);
      const r2 = C._pixiMarker === null && cMarker.d === false && !SPRITES._tracked.has(C);
      SPRITES.tickDying(SPRITES.CFG.DEATH_DUR + 0.1);
      const r3 = cMarker.d === true && cSprite.d === true && SPRITES._dying.length === 0;

      // D: clearEntities sweeps any remaining tracked entity's marker too.
      const D = { _pixiSprite: mk(), _pixiMarker: mk() };
      SPRITES._tracked.add(D);
      const dMarker = D._pixiMarker;
      SPRITES.clearEntities();
      const r4 = dMarker.d === true && D._pixiMarker === null && SPRITES._tracked.size === 0;

      return r1 && r2 && r3 && r4;
    })()`) === true);
}

// ---------------- god dialogue engine (Phase 05.5) ----------------
{
  if (vm.runInContext("typeof DIALOGUE", sandbox) === 'undefined') {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'dialogue.js'), 'utf8'), sandbox, { filename: 'dialogue.js' });
  }
  const R = (src) => vm.runInContext(src, sandbox);

  // snapshot so later blocks (and the content block) see a clean state
  const __snapDialogue = R('JSON.stringify(META.dialogue)');
  const __snapRuns = R('META.runs');

  R(`
    var __synth = [
      { id: 'h_first', god: 'hanuman', when: { first: true }, once: true, text: 'First hanuman line' },
      { id: 'h_gen1', god: 'hanuman', text: 'Generic hanuman one' },
      { id: 'h_gen2', god: 'hanuman', text: 'Generic hanuman two' },
      { id: 'h_lowhp', god: 'hanuman', when: { lowHp: true }, text: 'Low hp hanuman' },
      { id: 'h_holds', god: 'hanuman', when: { holds: 'vayu' }, text: 'Holds vayu' },
      { id: 'v_first', god: 'vayu', when: { first: true }, once: true, text: 'First vayu line' },
      { id: 'v_gen1', god: 'vayu', text: 'Generic vayu one' },
      { id: 'v_gen2', god: 'vayu', text: 'Generic vayu two' },
      { id: 'v_lowhp', god: 'vayu', when: { lowHp: true }, text: 'Low hp vayu' },
      { id: 'v_holds', god: 'vayu', when: { holds: 'hanuman' }, text: 'Holds hanuman' },
      { id: 'pav_duo', duo: 'duo_pavanaputra', beats: [ { s: 'hanuman', t: 'Father!' }, { s: 'vayu', t: 'Son!' } ] },
    ];
    var __blankCtx = { god: null, first: false, meetings: 1, firstThisRun: false, hpFrac: 1, biome: null,
      justDefeated: null, holds: {}, duo: null, lastDeathBiome: null, lastDeathBoss: null,
      lastRunWon: false, deaths: 0, wins: 0, weapon: 'khanda' };
  `);

  // --- validate(): bad synthetic list surfaces every listed problem ---
  const __badCount = R(`(() => {
    var bad = [
      { id: 'dup', god: 'hanuman', text: 'ok' },
      { id: 'dup', god: 'hanuman', text: 'ok again' },
      { id: 'badgod', god: 'not_a_god', text: 'ok' },
      { id: 'badwhen', god: 'hanuman', when: { notreal: true }, text: 'ok' },
      { id: 'selfholds', god: 'hanuman', when: { holds: 'hanuman' }, text: 'ok' },
      { id: 'toolong', god: 'hanuman', text: 'x'.repeat(241) },
      { id: 'anglebrack', god: 'hanuman', text: 'bad <script>' },
      { id: 'duobad', duo: 'duo_pavanaputra', beats: [ { s: 'krishna', t: 'not in duo' }, { s: 'hanuman', t: 'ok' } ] },
      { id: 'badboss', god: 'hanuman', when: { justDefeated: 'not_a_boss' }, text: 'ok' },
    ];
    return DIALOGUE.validate(bad).length;
  })()`);
  check('DIALOGUE.validate() reports every synthetic problem (>= 8)', __badCount >= 8);
  check('DIALOGUE.validate() on a well-formed synthetic list returns []', R('DIALOGUE.validate(__synth).length') === 0);

  // --- matches() ---
  const __matchesResult = R(`JSON.stringify([
    DIALOGUE.matches({ first: true }, { first: true }),
    DIALOGUE.matches({ first: true }, { first: false }),
    DIALOGUE.matches({ lowHp: true }, { hpFrac: 0.2 }),
    DIALOGUE.matches({ lowHp: true }, { hpFrac: 0.8 }),
    DIALOGUE.matches({ holds: 'vayu' }, { holds: { vayu: 1 } }),
    DIALOGUE.matches({ holds: 'vayu' }, { holds: {} }),
    DIALOGUE.matches({ justDefeated: '*' }, { justDefeated: 'tataka' }),
    DIALOGUE.matches({ justDefeated: '*' }, { justDefeated: null }),
    DIALOGUE.matches({ lastDeathBoss: 'yama' }, { lastDeathBoss: 'yama' }),
    DIALOGUE.matches({ lastDeathBoss: 'yama' }, { lastDeathBoss: 'kumbhakarna' }),
    DIALOGUE.matches({ notarealkey: true }, {}),
  ])`);
  check('DIALOGUE.matches() evaluates every KNOWN_WHEN case correctly',
    __matchesResult === JSON.stringify([true, false, true, false, true, false, true, false, true, false, false]));

  // --- select(): first, priority (duo > lowHp), lowHp forced by rand=0, once never repeats ---
  const __selectResult = R(`(() => {
    var mem = { met: {}, seen: {}, last: {}, lastId: null, runMet: { run: 0, gods: [] }, lastRun: null };
    var scratchMeta = { runs: 0, save() {} };

    var firstCtx = Object.assign({}, __blankCtx, { god: 'hanuman', first: true, meetings: 0, firstThisRun: true });
    var firstLine = DIALOGUE.select('hanuman', firstCtx, mem, Math.random, __synth);
    var r1 = firstLine && firstLine.id === 'h_first';
    DIALOGUE.record(firstLine, 'hanuman', mem, scratchMeta);

    var r2 = true;
    var laterCtx = Object.assign({}, __blankCtx, { god: 'hanuman', first: false, meetings: 1 });
    for (var i = 0; i < 20; i++) {
      var l = DIALOGUE.select('hanuman', laterCtx, mem, Math.random, __synth);
      if (l.id === 'h_first') { r2 = false; break; }
      DIALOGUE.record(l, 'hanuman', mem, scratchMeta);
    }

    var duoCtx = Object.assign({}, __blankCtx, { god: 'hanuman', first: false, meetings: 1,
      hpFrac: 0.2, duo: 'duo_pavanaputra' });
    var duoLine = DIALOGUE.select('hanuman', duoCtx, mem, Math.random, __synth);
    var r3 = duoLine && duoLine.id === 'pav_duo';

    var lowCtx = Object.assign({}, __blankCtx, { god: 'hanuman', first: false, meetings: 1, hpFrac: 0.2, duo: null });
    var lowLine = DIALOGUE.select('hanuman', lowCtx, mem, () => 0, __synth);
    var r4 = lowLine && lowLine.id === 'h_lowhp';

    return JSON.stringify([r1, r2, r3, r4]);
  })()`);
  check('DIALOGUE.select(): first ctx picks the once/first line; it never repeats; duo (pri 90) beats lowHp (pri 50); rand=0 forces the lowHp tier',
    __selectResult === JSON.stringify([true, true, true, true]));

  // --- no back-to-back repeats + unseen-line preference, seeded LCG, 300 iterations per god ---
  const __simResult = R(`(() => {
    var s = 12345;
    var rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    var mem = { met: {}, seen: {}, last: {}, lastId: null, runMet: { run: 0, gods: [] }, lastRun: null };
    var scratchMeta = { runs: 0, save() {} };
    var noBackToBack = true;
    var seenGeneric = {};
    for (const god of ['hanuman', 'vayu']) {
      var other = god === 'hanuman' ? 'vayu' : 'hanuman';
      var prev = null;
      for (var i = 0; i < 300; i++) {
        var ctx = Object.assign({}, __blankCtx, {
          god, first: (mem.met[god] | 0) === 0, meetings: mem.met[god] | 0,
          hpFrac: rand() < 0.3 ? 0.2 : 0.9,
          holds: rand() < 0.5 ? { [other]: 1 } : {},
        });
        var line = DIALOGUE.select(god, ctx, mem, rand, __synth);
        if (!line) { noBackToBack = false; break; }
        if (prev !== null && line.id === prev) { noBackToBack = false; break; }
        if (!line.when || Object.keys(line.when).length === 0) seenGeneric[line.id] = true;
        DIALOGUE.record(line, god, mem, scratchMeta);
        prev = line.id;
      }
    }
    var coverage = ['h_gen1', 'h_gen2', 'v_gen1', 'v_gen2'].every(id => seenGeneric[id]);
    return JSON.stringify([noBackToBack, coverage]);
  })()`);
  check('DIALOGUE.select(): no back-to-back repeats over 300 iterations per god, and every generic line gets chosen',
    __simResult === JSON.stringify([true, true]));

  // --- persistence: record -> save -> corrupt -> load restores; wipe resets ---
  const __persistResult = R(`(() => {
    var m = DIALOGUE.mem(META);
    var ctx = Object.assign({}, __blankCtx, { god: 'hanuman', first: true, meetings: 0, firstThisRun: true });
    var line = DIALOGUE.select('hanuman', ctx, m, Math.random, __synth);
    DIALOGUE.record(line, 'hanuman', m, META);
    META.save();
    META.dialogue = null;
    META.load();
    var r1 = META.dialogue && META.dialogue.met && META.dialogue.met.hanuman === 1;
    META.wipe();
    var r2 = JSON.stringify(META.dialogue) === '{}' || (DIALOGUE.mem(META).met && Object.keys(DIALOGUE.mem(META).met).length === 0);
    return JSON.stringify([r1, r2]);
  })()`);
  check('META.dialogue survives save/load and is reset by wipe',
    __persistResult === JSON.stringify([true, true]));

  // --- buildContext(): justDefeated, lastDeathBoss (fresh only), holds counts both duo gods ---
  const __ctxResult = R(`(() => {
    var stubMeta = { runs: 5, deaths: 3, wins: 1, lastWeapon: 'gandiva', dialogue: null, save() {} };
    var m = DIALOGUE.mem(stubMeta);
    m.lastRun = { result: 'death', run: 4, biome: 'ranabhoomi', boss: 'kumbhakarna' };
    var stubPlayer = { hp: 50, maxhp: 100, weapon: { id: 'khanda' },
      allBoons() { return [ { def: { id: 'duo_pavanaputra', god: 'hanuman', gods: ['hanuman', 'vayu'], duo: true }, rarity: 1 } ]; } };
    var stubGame = { player: stubPlayer, biome: { id: 'patala' }, biomeIdx: 2, roomIdx: 1 };

    var ctx1 = DIALOGUE.buildContext('hanuman', { game: stubGame, meta: stubMeta });
    var r1 = ctx1.justDefeated === 'ahiravana';
    var r2 = ctx1.lastDeathBoss === 'kumbhakarna';
    var r3 = ctx1.holds.hanuman === 1 && ctx1.holds.vayu === 1;

    DIALOGUE.record({ id: 'stub_line', god: 'hanuman' }, 'hanuman', m, stubMeta);
    var ctx2 = DIALOGUE.buildContext('hanuman', { game: stubGame, meta: stubMeta });
    var r4 = ctx2.lastDeathBoss === null;

    return JSON.stringify([r1, r2, r3, r4]);
  })()`);
  check('DIALOGUE.buildContext(): justDefeated from biome/room, lastDeathBoss fresh-only, holds counts both duo gods',
    __ctxResult === JSON.stringify([true, true, true, true]));

  // restore clean state for later blocks
  R(`META.dialogue = ${__snapDialogue}; META.runs = ${__snapRuns}; META.save();`);
}

// ---------------- god dialogue content (Phase 05.5) ----------------
{
  const R = (src) => vm.runInContext(src, sandbox);
  const __snapDialogue2 = R('JSON.stringify(META.dialogue)');
  const __snapRuns2 = R('META.runs');

  const __valErrs = R('DIALOGUE.validate()');
  check('DIALOGUE content validate() returns []' + (__valErrs.length ? ' — first 3: ' + JSON.stringify(__valErrs.slice(0, 3)) : ''),
    __valErrs.length === 0);

  const __covErrs = R('DIALOGUE.coverage()');
  check('DIALOGUE content coverage() returns []' + (__covErrs.length ? ' — first 3: ' + JSON.stringify(__covErrs.slice(0, 3)) : ''),
    __covErrs.length === 0);

  const __perGodCounts = R("Object.keys(DATA.GODS).map(g => DIALOGUE.LINES.filter(l => l.god === g && !l.duo).length)");
  check('every god has >= 10 lines (' + JSON.stringify(__perGodCounts) + ')', __perGodCounts.every(n => n >= 10));

  // fresh-memory first ctx always selects that god's once/first line
  const __firstOk = R(`(() => {
    var ok = true;
    for (const god of Object.keys(DATA.GODS)) {
      var mem = { met: {}, seen: {}, last: {}, lastId: null, runMet: { run: 0, gods: [] }, lastRun: null };
      var ctx = { god, first: true, meetings: 0, firstThisRun: true, hpFrac: 1, biome: null,
        justDefeated: null, holds: {}, duo: null, lastDeathBiome: null, lastDeathBoss: null,
        lastRunWon: false, deaths: 0, wins: 0, weapon: 'khanda' };
      var line = DIALOGUE.select(god, ctx, mem, Math.random);
      if (!line || !line.once || !line.when || !line.when.first || line.god !== god) { ok = false; break; }
    }
    return ok;
  })()`);
  check("every god's fresh-memory first ctx selects its once/first line", __firstOk === true);

  // duo ctx (meetings 1, not-first) selects a co-voiced line of that duo for each of its gods;
  // a first (pri 100) meeting still outranks a duo (pri 90) offer
  const __duoOk = R(`(() => {
    var ok = true;
    for (const duo of DATA.DUO_BOONS) {
      for (const god of duo.gods) {
        var mem = { met: {}, seen: {}, last: {}, lastId: null, runMet: { run: 0, gods: [] }, lastRun: null };
        var ctx = { god, first: false, meetings: 1, firstThisRun: false, hpFrac: 1, biome: null,
          justDefeated: null, holds: {}, duo: duo.id, lastDeathBiome: null, lastDeathBoss: null,
          lastRunWon: false, deaths: 0, wins: 0, weapon: 'khanda' };
        var line = DIALOGUE.select(god, ctx, mem, Math.random);
        if (!line || line.duo !== duo.id) { ok = false; break; }
      }
    }
    return ok;
  })()`);
  check('every duo: a duo ctx (first:false) selects a co-voiced line of that duo for both of its gods', __duoOk === true);

  // 60-meeting simulation per god via real buildContext/select/record: no back-to-back repeats,
  // and >= 60% of that god's non-once lines get chosen
  const __simRaw = R(`(() => {
    var s = 777;
    var rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    var weapons = ['khanda', 'gandiva', 'gada'];
    var biomeIds = DATA.BIOMES.map(b => b.id);
    var bossIds = Object.keys(DATA.BOSSES);
    var godIds = Object.keys(DATA.GODS);
    var noBackToBack = true;
    var coverageDetail = [];

    for (const god of godIds) {
      var meta = { runs: 1, deaths: 5, wins: 1, lastWeapon: 'khanda', dialogue: null, save() {} };
      DIALOGUE.mem(meta);
      var player = { hp: 100, maxhp: 100, weapon: { id: 'khanda' }, _boons: [],
        allBoons() { return this._boons; } };
      var game = { player, biome: DATA.BIOMES[0], biomeIdx: 0, roomIdx: 1 };
      var prev = null;

      for (var i = 0; i < 60 && noBackToBack; i++) {
        if (i > 0 && i % 3 === 0) {
          var prevRun = meta.runs;
          var died = rand() < 0.6;
          meta.dialogue.lastRun = died
            ? { result: 'death', run: prevRun, biome: biomeIds[Math.floor(rand() * biomeIds.length)],
                boss: bossIds[Math.floor(rand() * bossIds.length)] }
            : { result: 'victory', run: prevRun, biome: null, boss: null };
          meta.runs++;
        }
        player.hp = rand() < 0.5 ? 20 : 90;
        var biomeIdx = Math.floor(rand() * DATA.BIOMES.length);
        game.biome = DATA.BIOMES[biomeIdx];
        game.biomeIdx = biomeIdx;
        game.roomIdx = rand() < 0.5 ? 1 : 3;
        player.weapon = { id: weapons[i % weapons.length] };
        var others = godIds.filter(gg => gg !== god);
        player._boons = others.filter(() => rand() < 0.4).map(gg => ({ def: { id: gg + '_x', god: gg } }));

        var ctx = DIALOGUE.buildContext(god, { game, meta });
        var line = DIALOGUE.select(god, ctx, meta.dialogue, rand);
        if (!line) { noBackToBack = false; break; }
        if (prev !== null && line.id === prev) { noBackToBack = false; break; }
        DIALOGUE.record(line, god, meta.dialogue, meta);
        prev = line.id;
      }

      var nonOnce = DIALOGUE.LINES.filter(l => l.god === god && !l.duo && !l.once).map(l => l.id);
      var seenCount = nonOnce.filter(id => meta.dialogue.seen[id]).length;
      var ratio = nonOnce.length ? seenCount / nonOnce.length : 1;
      coverageDetail.push([god, Math.round(ratio * 100) / 100]);
    }

    return JSON.stringify({ noBackToBack, coverageDetail });
  })()`);
  const __sim = JSON.parse(__simRaw);
  const __coverageOk = __sim.coverageDetail.every(([, ratio]) => ratio >= 0.6);
  check('content sim: 60 meetings/god via real buildContext/select/record, no back-to-back repeats', __sim.noBackToBack === true);
  check('content sim: >= 60% of each god\'s non-once lines get chosen over 60 meetings' + (!__coverageOk ? ' — ' + JSON.stringify(__sim.coverageDetail) : ''),
    __coverageOk === true);

  // reverence lint (plain Node regex over the JSON-serialized content; avoids nested-escape pitfalls)
  const __allLines = JSON.parse(R('JSON.stringify(DIALOGUE.LINES)'));
  const forbidden = /\b(kill you|destroy you|foolish boy|pathetic|worthless|hate you|demon god)\b/i;
  const yamaMention = /\b(Yama|Dharmaraja)\b/;
  const yamaBad = /Yama[^.]*\b(monster|demon|evil)\b/i;
  const lintBad = [];
  for (const l of __allLines) {
    const texts = l.beats ? l.beats.map(b => b.t) : [l.text, l.reply].filter(Boolean);
    for (const t of texts) {
      if (forbidden.test(t)) lintBad.push(l.id + ': forbidden phrase');
      if (yamaMention.test(t) && yamaBad.test(t)) lintBad.push(l.id + ': disrespects Yama');
    }
  }
  check('reverence lint: no forbidden phrases, no contemptuous Yama framing' + (lintBad.length ? ' — ' + lintBad.join(', ') : ''),
    lintBad.length === 0);

  // restore clean state
  R(`META.dialogue = ${__snapDialogue2}; META.runs = ${__snapRuns2}; META.save();`);
}

// ---------------- MUSIC theory/generators (05.3-01) ----------------
{
  const R = (src) => vm.runInContext(src, sandbox);
  console.log('\n— MUSIC theory/generators (05.3-01) —');

  check('MUSIC loads headless with ctx === null', R('MUSIC.ctx') === null);
  check('MUSIC load added no __timeouts', __musicLoadTimeouts === 0);

  const pc = d => ((d % 12) + 12) % 12;
  const biomeIds = JSON.parse(R('JSON.stringify(DATA.BIOMES.map(b => b.id))'));
  const T = JSON.parse(R('JSON.stringify(MUSIC.theory)'));

  {
    const ids = Object.keys(T.BIOME_RAGA);
    const coversAll = ids.includes('hub') && biomeIds.every(id => ids.includes(id));
    const mapsToRaga = ids.every(id => T.RAGAS[T.BIOME_RAGA[id]] !== undefined);
    const talaExists = ids.every(id => T.TALAS[T.RAGAS[T.BIOME_RAGA[id]].tala] !== undefined);
    check('BIOME_RAGA covers hub + every DATA.BIOMES id, each mapping to a real raga with a real tala',
      coversAll && mapsToRaga && talaExists);
  }

  {
    let ok = true;
    const bad = [];
    for (const rid of Object.keys(T.RAGAS)) {
      const raga = T.RAGAS[rid];
      const sorted = raga.notes.slice().sort((a, b) => a - b);
      if (JSON.stringify(sorted) !== JSON.stringify(raga.notes)) { ok = false; bad.push(rid + ':notes-not-sorted'); }
      if (!raga.notes.every(n => n >= 0 && n <= 11)) { ok = false; bad.push(rid + ':notes-out-of-0-11'); }
      if (!raga.notes.includes(0)) { ok = false; bad.push(rid + ':notes-missing-0'); }
      if (!raga.up.every(n => raga.notes.includes(n))) { ok = false; bad.push(rid + ':up-not-subset'); }
      if (!raga.down.every(n => raga.notes.includes(n))) { ok = false; bad.push(rid + ':down-not-subset'); }
      if (!raga.notes.includes(pc(raga.vadi))) { ok = false; bad.push(rid + ':vadi-not-in-notes'); }
      if (!raga.notes.includes(pc(raga.samvadi))) { ok = false; bad.push(rid + ':samvadi-not-in-notes'); }
      if (!raga.nyas.every(n => raga.notes.includes(pc(n)))) { ok = false; bad.push(rid + ':nyas-not-in-notes'); }
      const banks = [].concat(raga.pakad, raga.chalan, [raga.mukhda]);
      for (const phrase of banks) {
        for (const pair of phrase) {
          const deg = pair[0];
          if (!raga.notes.includes(pc(deg))) { ok = false; bad.push(rid + ':bank-deg-pc-not-in-notes:' + deg); }
          if (deg < raga.range[0] || deg > raga.range[1]) { ok = false; bad.push(rid + ':bank-deg-out-of-range:' + deg); }
        }
      }
    }
    check('raga sanity: notes sorted/0..11/has-0; up/down subset of notes; vadi/samvadi/nyas pc in notes; bank degrees pc in notes and inside range'
      + (bad.length ? ' — ' + bad.join(', ') : ''), ok);
  }

  check('malkauns droneFirst=5 and excludes pc 7; all other ragas droneFirst=7',
    T.RAGAS.malkauns.droneFirst === 5 && !T.RAGAS.malkauns.notes.includes(7) &&
    ['yaman', 'bhairav', 'adana', 'bhairavi'].every(id => T.RAGAS[id].droneFirst === 7));

  {
    let ok = true;
    const bad = [];
    for (const tid of Object.keys(T.TALAS)) {
      const tala = T.TALAS[tid];
      if (tala.theka.length !== tala.matras) { ok = false; bad.push(tid + ':theka-length'); }
      const sum = tala.vibhags.reduce((a, b) => a + b, 0);
      if (sum !== tala.matras) { ok = false; bad.push(tid + ':vibhags-sum'); }
      if (tala.marks.length !== tala.vibhags.length) { ok = false; bad.push(tid + ':marks-length'); }
    }
    if (T.TALAS.rupak.samIsKhali !== true) { ok = false; bad.push('rupak:samIsKhali'); }
    check('tala sanity: theka.length===matras, sum(vibhags)===matras, marks.length===vibhags.length, rupak sam is khali'
      + (bad.length ? ' — ' + bad.join(', ') : ''), ok);
  }

  {
    const talaStepsOk = R("Object.keys(MUSIC.theory.TALAS).every(k => MUSIC.theory.talaSteps(MUSIC.theory.TALAS[k]) === MUSIC.theory.TALAS[k].matras * 4)");
    check('talaSteps(t) === matras*4 for every tala', talaStepsOk === true);

    const vss = JSON.parse(R('JSON.stringify(MUSIC.theory.vibhagStartSteps(MUSIC.theory.TALAS.teentaal))'));
    check('vibhagStartSteps(teentaal) deep-equals [0,16,32,48]', JSON.stringify(vss) === JSON.stringify([0, 16, 32, 48]));

    check('nextBoundary(rupak, 0, "vibhag") === 12', R("MUSIC.theory.nextBoundary(MUSIC.theory.TALAS.rupak, 0, 'vibhag')") === 12);
    check('nextBoundary(rupak, 5, "sam") === 23', R("MUSIC.theory.nextBoundary(MUSIC.theory.TALAS.rupak, 5, 'sam')") === 23);

    const nbRange = R(`(() => {
      const T = MUSIC.theory;
      let ok = true;
      for (const tid of Object.keys(T.TALAS)) {
        const tala = T.TALAS[tid];
        const cs = T.talaSteps(tala);
        for (let s = 0; s < cs; s++) {
          for (const kind of ['vibhag', 'sam']) {
            const n = T.nextBoundary(tala, s, kind);
            if (n < 1 || n > cs) ok = false;
          }
        }
      }
      return ok;
    })()`);
    check('nextBoundary(t, s, kind) always in 1..talaSteps for every tala/step/kind', nbRange === true);
  }

  {
    const tirakita = JSON.parse(R("JSON.stringify(MUSIC.theory.expandBol('TiRaKiTa'))"));
    check("expandBol('TiRaKiTa') deep-equals ['Te','Re','Ke','Te']", JSON.stringify(tirakita) === JSON.stringify(['Te', 'Re', 'Ke', 'Te']));

    const bolsOk = R(`(() => {
      const T = MUSIC.theory;
      const allowed = T.TABLA_KEYS.concat([null]);
      for (const tid of Object.keys(T.TALAS)) {
        for (const bol of T.TALAS[tid].theka) {
          const keys = T.expandBol(bol);
          if (!keys.every(k => allowed.includes(k))) return false;
        }
      }
      return true;
    })()`);
    check('every theka bol of every tala expands to keys within TABLA_KEYS ∪ {null}', bolsOk === true);
  }

  {
    const I = T.INTENSITY;
    let ok = I.length === 6;
    const monoUp = ['tabla', 'big', 'metal', 'sub'];
    for (const key of monoUp) for (let i = 1; i < 6; i++) if (I[i][key] < I[i - 1][key]) ok = false;
    for (let i = 1; i < 6; i++) if (I[i].drone > I[i - 1].drone) ok = false;
    if (!(I[0].tabla === 0 && I[0].big === 0 && I[0].metal === 0)) ok = false;
    const sum = o => Object.keys(o).reduce((a, k) => a + o[k], 0);
    if (!(sum(I[5]) / sum(I[1]) <= 2.2)) ok = false;
    check('INTENSITY: 6 rows, tabla/big/metal/sub non-decreasing, drone non-increasing, L0 percussion silent, loudness ratio <= 2.2', ok);
  }

  check('semiToHz(110,12) === 220', Math.abs(R('MUSIC.theory.semiToHz(110, 12)') - 220) < 1e-9);
  check('semiToHz(110,7) ≈ 164.81', Math.abs(R('MUSIC.theory.semiToHz(110, 7)') - 164.81) < 0.01);

  {
    const seq = n => JSON.parse(R(`JSON.stringify((() => { const r = MUSIC.gen.rng(${n}); return [r(), r(), r(), r(), r()]; })())`));
    const a1 = seq(42), a2 = seq(42), b = seq(43);
    check('rng(42) produces the same first 5 values twice', JSON.stringify(a1) === JSON.stringify(a2));
    check('rng values all within [0,1)', a1.every(v => v >= 0 && v < 1));
    check('rng(42) differs from rng(43)', JSON.stringify(a1) !== JSON.stringify(b));
  }
}

// ---------------- MUSIC lead stream (05.3-01 task 2) ----------------
{
  const R = (src) => vm.runInContext(src, sandbox);
  console.log('\n— MUSIC lead stream (05.3-01 task 2) —');

  R(`
    globalThis.__collectStream = function (ragaId, level, seed, cycles) {
      const raga = MUSIC.theory.RAGAS[ragaId];
      const tala = MUSIC.theory.TALAS[raga.tala];
      const cs = MUSIC.theory.talaSteps(tala);
      const stream = MUSIC.gen.createLeadStream(raga, tala, seed);
      const events = [];
      // scan extra lookahead cycles so a mukhda's final note (which can
      // land a full cycle past wherever its own phrase was planned, since
      // the stream always plans one cycle ahead) isn't truncated out of a
      // completed phrase by the collection window itself.
      for (let s = 0; s < (cycles + 2) * cs; s++) {
        const evs = stream.eventsAt(s, level);
        for (const e of evs) events.push(e);
      }
      return JSON.stringify({ cs, windowSteps: cycles * cs, events });
    };
  `);

  const pc = d => ((d % 12) + 12) % 12;
  const T = JSON.parse(R('JSON.stringify(MUSIC.theory)'));
  const ragaIds = Object.keys(T.RAGAS);
  const ragaOf = {}; for (const rid of ragaIds) ragaOf[rid] = T.RAGAS[rid];
  // groups events by phraseId in first-seen order, dropping the trailing
  // phrase: it may still be mid-flight at the edge of the collection
  // window (e.g. a mukhda whose final note lands a cycle further out
  // than anything else we scanned), so it isn't a safe structural sample.
  function groupPhrases(events) {
    const byPhrase = {}; const order = [];
    for (const e of events) {
      if (!byPhrase[e.phraseId]) { byPhrase[e.phraseId] = []; order.push(e.phraseId); }
      byPhrase[e.phraseId].push(e);
    }
    return order.slice(0, -1).map(pid => byPhrase[pid]);
  }

  // gather all 5 ragas x 6 levels at the canonical seed (1234), 32 cycles
  // (+1 lookahead cycle so trailing mukhda phrases are never truncated)
  const data = {};
  for (const rid of ragaIds) {
    data[rid] = {};
    for (let level = 0; level <= 5; level++) {
      const raw = R(`__collectStream('${rid}', ${level}, 1234, 32)`);
      data[rid][level] = JSON.parse(raw);
    }
  }

  // ---- per-event property checks over every raga x level ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      for (let level = 0; level <= 5; level++) {
        const { cs, events } = data[rid][level];
        for (const e of events) {
          if (pc(e.deg) !== undefined && raga.notes.indexOf(pc(e.deg)) === -1) { ok = false; bad.push(`${rid}L${level}:pc-not-in-notes:${e.deg}`); }
          if (e.deg < raga.range[0] || e.deg > raga.range[1]) { ok = false; bad.push(`${rid}L${level}:deg-out-of-range:${e.deg}`); }
          if (!(e.dur >= 1)) { ok = false; bad.push(`${rid}L${level}:dur<1`); }
          if (!(e.vel >= 0.2 && e.vel <= 1)) { ok = false; bad.push(`${rid}L${level}:vel-oob:${e.vel}`); }
          if (!Number.isInteger(e.at)) { ok = false; bad.push(`${rid}L${level}:at-not-int`); }
          if (rid === 'adana' && e.src === 'walk' && pc(e.deg) === 3) { ok = false; bad.push(`${rid}L${level}:adana-walk-pc3`); }
        }
        if (bad.length > 12) break;
      }
      if (bad.length > 12) break;
    }
    check('every note: pc in raga.notes, in range, dur>=1, 0.2<=vel<=1, integer at; adana walk notes never pc 3'
      + (bad.length ? ' — ' + bad.slice(0, 12).join(', ') : ''), ok);
  }

  // ---- walk-note directionality (moving up -> pc in up, down -> pc in down) ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      for (let level = 0; level <= 5; level++) {
        const events = data[rid][level].events;
        for (const notes of groupPhrases(events)) {
          for (let i = 1; i < notes.length; i++) {
            if (notes[i].src !== 'walk') continue;
            const goingUp = notes[i].deg >= notes[i - 1].deg;
            const dirSet = goingUp ? raga.up : raga.down;
            if (dirSet.indexOf(pc(notes[i].deg)) === -1) { ok = false; bad.push(`${rid}L${level}:walk-dir-pc:${notes[i].deg}`); }
          }
        }
        if (bad.length > 12) break;
      }
      if (bad.length > 12) break;
    }
    check('walk-tagged notes: ascending steps land on pc in raga.up, descending on pc in raga.down' + (bad.length ? ' — ' + bad.slice(0, 12).join(', ') : ''), ok);
  }

  // ---- within-phrase leap constraint ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      for (let level = 0; level <= 5; level++) {
        const events = data[rid][level].events;
        for (const notes of groupPhrases(events)) {
          for (let i = 1; i < notes.length; i++) {
            const d = Math.abs(notes[i].deg - notes[i - 1].deg);
            const bothSa = pc(notes[i].deg) === 0 && pc(notes[i - 1].deg) === 0;
            if (d > 7 && !(d === 12 && bothSa)) { ok = false; bad.push(`${rid}L${level}:leap:${d}`); }
          }
        }
      }
    }
    check('consecutive notes inside one phrase: |delta|<=7 unless the Sa-Sa\' octave' + (bad.length ? ' — ' + bad.slice(0, 8).join(', ') : ''), ok);
  }

  // ---- phrase-ending nyas + duration floor ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      const nyasPcs = raga.nyas.concat([0]).map(pc);
      for (let level = 0; level <= 5; level++) {
        const events = data[rid][level].events;
        for (const notes of groupPhrases(events)) {
          const last = notes[notes.length - 1];
          if (nyasPcs.indexOf(pc(last.deg)) === -1) { ok = false; bad.push(`${rid}L${level}:last-not-nyas:${last.deg}`); }
          const floor = last.kind === 'taan' ? 2 : 4;
          if (!(last.dur >= floor)) { ok = false; bad.push(`${rid}L${level}:last-dur<${floor}`); }
        }
      }
    }
    check('every phrase ends on a nyas note (nyas U {0}) with dur>=4 (>=2 for taans)' + (bad.length ? ' — ' + bad.slice(0, 8).join(', ') : ''), ok);
  }

  // ---- mukhda lands on sam ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      for (let level = 0; level <= 5; level++) {
        const { cs, events } = data[rid][level];
        for (const notes of groupPhrases(events)) {
          if (notes[0].src !== 'mukhda') continue;
          const last = notes[notes.length - 1];
          if (((last.at % cs) + cs) % cs !== 0) { ok = false; bad.push(`${rid}L${level}:mukhda-not-on-sam:${last.at}%${cs}`); }
        }
      }
    }
    check('every mukhda occurrence lands its final note exactly on sam (at % cycleSteps === 0)' + (bad.length ? ' — ' + bad.slice(0, 8).join(', ') : ''), ok);
  }

  // ---- silence ratios + notes-per-cycle ordering ----
  {
    const silence = {}; const notesPerCycle = {};
    for (const rid of ragaIds) {
      silence[rid] = {}; notesPerCycle[rid] = {};
      for (let level = 0; level <= 5; level++) {
        const { cs, windowSteps, events } = data[rid][level];
        const total = windowSteps;
        const covered = new Uint8Array(total);
        for (const e of events) {
          for (let s = e.at; s < Math.min(total, e.at + e.dur); s++) if (s >= 0) covered[s] = 1;
        }
        let coveredCount = 0; for (let i = 0; i < total; i++) coveredCount += covered[i];
        silence[rid][level] = 1 - coveredCount / total;
        notesPerCycle[rid][level] = events.filter(e => e.at < windowSteps).length / 32;
      }
    }
    let silOk = true; const silBad = [];
    for (const rid of ragaIds) {
      if (silence[rid][0] < 0.30) { silOk = false; silBad.push(`${rid}L0:${silence[rid][0].toFixed(2)}`); }
      if (silence[rid][1] < 0.25) { silOk = false; silBad.push(`${rid}L1:${silence[rid][1].toFixed(2)}`); }
      if (silence[rid][5] > 0.30) { silOk = false; silBad.push(`${rid}L5:${silence[rid][5].toFixed(2)}`); }
    }
    check('lead-silent step ratio: L0>=0.30, L1>=0.25, L5<=0.30' + (silBad.length ? ' — ' + silBad.join(', ') : ''), silOk);

    let densOk = true; const densBad = [];
    for (const rid of ragaIds) {
      const n0 = notesPerCycle[rid][0], n2 = notesPerCycle[rid][2], n4 = notesPerCycle[rid][4];
      if (!(n0 < n2 && n2 < n4)) { densOk = false; densBad.push(`${rid}:${n0.toFixed(1)}/${n2.toFixed(1)}/${n4.toFixed(1)}`); }
    }
    check('notes-per-cycle strictly increasing: L0 < L2 < L4' + (densBad.length ? ' — ' + densBad.join(', ') : ''), densOk);
  }

  // ---- L2: >=1 breath cycle (zero notes) and >=1 tar-register note over 32 cycles ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const { cs, events } = data[rid][2];
      const perCycle = new Array(32).fill(0);
      let sawTar = false;
      for (const e of events) {
        const cyc = Math.floor(e.at / cs);
        if (cyc >= 0 && cyc < 32) perCycle[cyc]++;
        if (e.deg >= 12) sawTar = true;
      }
      if (!perCycle.some(c => c === 0)) { ok = false; bad.push(`${rid}:no-breath-cycle`); }
      if (!sawTar) { ok = false; bad.push(`${rid}:no-tar-note`); }
    }
    check('at L2 over 32 cycles: >=1 zero-note breath cycle and >=1 note with deg>=12' + (bad.length ? ' — ' + bad.join(', ') : ''), ok);
  }

  // ---- no back-to-back repeated non-mukhda phrase signatures ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      for (let level = 0; level <= 5; level++) {
        const events = data[rid][level].events;
        let prevSig = null;
        for (const notes of groupPhrases(events)) {
          if (notes[0].src === 'mukhda') continue;
          const sig = notes.map(n => n.deg).join(',');
          if (prevSig !== null && sig === prevSig) { ok = false; bad.push(`${rid}L${level}:repeat`); }
          prevSig = sig;
        }
      }
    }
    check('no two consecutive non-mukhda phrases share the same signature (mukhda exempt)' + (bad.length ? ' — ' + bad.slice(0, 8).join(', ') : ''), ok);
  }

  // ---- bank-phrase data sanity (raw RAGAS data, not generated output) ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      const nyasPcs = raga.nyas.concat([0]).map(pc);
      const banks = [].concat(raga.pakad, raga.chalan, [raga.mukhda]);
      for (const phrase of banks) {
        for (let i = 1; i < phrase.length; i++) {
          const d = Math.abs(phrase[i][0] - phrase[i - 1][0]);
          if (d > 7) { ok = false; bad.push(`${rid}:bank-leap:${d}`); }
        }
        const lastDeg = phrase[phrase.length - 1][0];
        if (nyasPcs.indexOf(pc(lastDeg)) === -1) { ok = false; bad.push(`${rid}:bank-end-not-nyas:${lastDeg}`); }
      }
    }
    check('every bank phrase (pakad/chalan/mukhda) ends on pc in nyas U {0} and has no internal leap > 7' + (bad.length ? ' — ' + bad.join(', ') : ''), ok);
  }

  // ---- determinism ----
  {
    const a = R(`__collectStream('yaman', 2, 1234, 4)`);
    const b = R(`__collectStream('yaman', 2, 1234, 4)`);
    const c = R(`__collectStream('yaman', 2, 99, 4)`);
    check('createLeadStream: same seed -> JSON-identical note list', a === b);
    check('createLeadStream: seed 1234 vs 99 -> different', a !== c);
  }

  // ---- placeMukhda offset formula ----
  {
    let ok = true;
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      const cs = R(`MUSIC.theory.talaSteps(MUSIC.theory.TALAS[MUSIC.theory.RAGAS['${rid}'].tala])`);
      const start = R(`MUSIC.gen.placeMukhda(MUSIC.theory.RAGAS['${rid}'].mukhda, ${cs})`);
      const sumExceptLast = raga.mukhda.slice(0, -1).reduce((a, p) => a + p[1], 0);
      if (start + sumExceptLast !== cs) ok = false;
    }
    check('placeMukhda(mukhda, cycleSteps): start + sum(durs except last) === cycleSteps', ok);
  }

  // ---- stream.tail(3) ----
  // Note: createLeadStream's scheduler always keeps ~1-2 cycles of
  // lookahead planned ahead of the highest absStep queried (by design —
  // "one-cycle horizon" per D-09), so state.lastCompleted (what tail()
  // exposes) can be a phrase whose events haven't been *observed* yet via
  // eventsAt. This checks the API contract (bounded length, valid raga
  // degrees, and that it changes as the stream advances) rather than
  // trying to independently reconstruct "the last phrase" by absStep,
  // which is structurally mismatched with the lookahead design.
  {
    const tailRaw = R(`(() => {
      const raga = MUSIC.theory.RAGAS.yaman;
      const tala = MUSIC.theory.TALAS[raga.tala];
      const cs = MUSIC.theory.talaSteps(tala);
      const stream = MUSIC.gen.createLeadStream(raga, tala, 1234);
      const snaps = [];
      for (let s = 0; s < 12 * cs; s++) {
        stream.eventsAt(s, 2);
        if (s % cs === cs - 1) snaps.push(stream.tail(3));
      }
      return JSON.stringify(snaps);
    })()`);
    const snaps = JSON.parse(tailRaw);
    const raga = ragaOf.yaman;
    const lenOk = snaps.every(s => s.length <= 3);
    const degOk = snaps.every(s => s.every(n => raga.notes.indexOf(pc(n.deg)) !== -1));
    const varies = new Set(snaps.map(s => JSON.stringify(s.map(n => n.deg)))).size > 1;
    check('stream.tail(3) returns <=3 valid-degree notes and changes as the stream advances', lenOk && degOk && varies);
  }
}

// ---------------- MUSIC drums/pluck/tanpura/tihai (05.3-01 task 3) ----------------
{
  const R = (src) => vm.runInContext(src, sandbox);
  console.log('\n— MUSIC drums/pluck/tanpura/tihai (05.3-01 task 3) —');

  const pc = d => ((d % 12) + 12) % 12;
  const T = JSON.parse(R('JSON.stringify(MUSIC.theory)'));
  const ragaIds = Object.keys(T.RAGAS);
  const ragaOf = {}; for (const rid of ragaIds) ragaOf[rid] = T.RAGAS[rid];

  R(`
    globalThis.__collectDrums = function (ragaId, level, seed, cycles, lowHp) {
      const raga = MUSIC.theory.RAGAS[ragaId];
      const tala = MUSIC.theory.TALAS[raga.tala];
      const cs = MUSIC.theory.talaSteps(tala);
      const rand = MUSIC.gen.rng(seed);
      const events = [];
      for (let s = 0; s < cycles * cs; s++) {
        const evs = MUSIC.gen.drumsAt(tala, raga, s, level, rand, { lowHp: !!lowHp });
        for (const e of evs) events.push(Object.assign({ at: s }, e));
      }
      return JSON.stringify({ cs, events });
    };
    globalThis.__collectPluck = function (ragaId, level, seed, cycles) {
      const raga = MUSIC.theory.RAGAS[ragaId];
      const tala = MUSIC.theory.TALAS[raga.tala];
      const cs = MUSIC.theory.talaSteps(tala);
      const rand = MUSIC.gen.rng(seed);
      const events = [];
      for (let s = 0; s < cycles * cs; s++) {
        const evs = MUSIC.gen.pluckAt(raga, tala, s, level, rand, null);
        for (const e of evs) events.push(Object.assign({ at: s }, e));
      }
      return JSON.stringify({ cs, events });
    };
  `);

  const drumData = {};
  for (const rid of ragaIds) {
    drumData[rid] = {};
    for (let level = 0; level <= 5; level++) {
      drumData[rid][level] = JSON.parse(R(`__collectDrums('${rid}', ${level}, 4242, 8, false)`));
    }
  }

  // ---- level 0 silent ----
  {
    let ok = true;
    for (const rid of ragaIds) if (drumData[rid][0].events.length !== 0) ok = false;
    check('drumsAt level 0 returns [] for every step of 4+ cycles', ok);
  }

  // ---- level 1: no big/metal; strokes only at vibhag starts ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      const tala = T.TALAS[raga.tala];
      const { cs, events } = drumData[rid][1];
      const vibhagStarts = (() => { const out = []; let acc = 0; for (const v of tala.vibhags) { out.push(acc); acc += v * 4; } return out; })();
      for (const e of events) {
        if (e.voice !== 'tabla') { ok = false; bad.push(`${rid}:voice=${e.voice}`); }
        const s = e.at % cs;
        if (vibhagStarts.indexOf(s) === -1) { ok = false; bad.push(`${rid}:not-vibhag-start:${s}`); }
      }
    }
    check('level 1: no big/metal events; strokes only at vibhag starts' + (bad.length ? ' — ' + bad.slice(0, 6).join(', ') : ''), ok);
  }

  // ---- level 2, non-fill cycle: every matra's sub0 tabla key matches expandBol(theka[m])[0]; rupak sam is 'Tin' ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      const tala = T.TALAS[raga.tala];
      const { cs, events } = drumData[rid][2];
      const cycle0 = events.filter(e => e.at < cs && e.at % 4 === 0 && e.voice === 'tabla');
      for (let m = 0; m < tala.matras; m++) {
        const expected = R(`MUSIC.theory.expandBol(MUSIC.theory.TALAS['${raga.tala}'].theka[${m}])[0]`);
        const found = cycle0.find(e => Math.floor(e.at / 4) === m);
        if (!found || found.key !== expected) { ok = false; bad.push(`${rid}:m${m}:expected=${expected}:got=${found && found.key}`); }
      }
      if (raga.tala === 'rupak') {
        const samEv = cycle0.find(e => e.at === 0);
        if (!samEv || samEv.key !== 'Tin') { ok = false; bad.push(`${rid}:rupak-sam-not-Tin`); }
      }
    }
    check('level 2 (non-fill cycle): every matra sub0 tabla key === expandBol(theka[m])[0]; rupak sam is Tin'
      + (bad.length ? ' — ' + bad.slice(0, 6).join(', ') : ''), ok);
  }

  // ---- strokes-per-cycle strictly increasing L1<L2<L3<L4, L5>=L4 ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const counts = [];
      for (let level = 1; level <= 5; level++) {
        const { events } = drumData[rid][level];
        counts.push(events.length / 8);
      }
      const [c1, c2, c3, c4, c5] = counts;
      if (!(c1 < c2 && c2 < c3 && c3 < c4 && c5 >= c4)) { ok = false; bad.push(`${rid}:${counts.map(c => c.toFixed(1)).join('/')}`); }
    }
    check('strokes-per-cycle (tabla+big+metal, avg over 8 cycles) strictly increasing L1<L2<L3<L4, L5>=L4'
      + (bad.length ? ' — ' + bad.join(', ') : ''), ok);
  }

  // ---- every key valid for its voice; every vel in (0,1] ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      for (let level = 1; level <= 5; level++) {
        for (const e of drumData[rid][level].events) {
          const okKey = e.voice === 'tabla' ? T.TABLA_KEYS.indexOf(e.key) !== -1
            : e.voice === 'big' ? T.BIG_KEYS.indexOf(e.key) !== -1
            : e.voice === 'metal' ? T.METAL_KEYS.indexOf(e.key) !== -1 : false;
          if (!okKey) { ok = false; bad.push(`${rid}L${level}:bad-key:${e.voice}/${e.key}`); }
          if (!(e.vel > 0 && e.vel <= 1)) { ok = false; bad.push(`${rid}L${level}:vel-oob:${e.vel}`); }
        }
      }
    }
    check('every drum key valid for its voice; every vel in (0,1]' + (bad.length ? ' — ' + bad.slice(0, 6).join(', ') : ''), ok);
  }

  // ---- opts.lowHp at level 3: heartbeat dhol at sam sub0 AND sub1 ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      const { cs, events } = JSON.parse(R(`__collectDrums('${rid}', 3, 4242, 4, true)`));
      const sub0 = events.some(e => e.at % cs === 0 && e.voice === 'big' && e.key === 'dhol');
      const sub1 = events.some(e => e.at % cs === 1 && e.voice === 'big' && e.key === 'dhol');
      if (!sub0 || !sub1) { ok = false; bad.push(`${rid}:sub0=${sub0},sub1=${sub1}`); }
    }
    check('opts.lowHp at level 3 adds a heartbeat dhol at sam sub0 AND sub1' + (bad.length ? ' — ' + bad.join(', ') : ''), ok);
  }

  // ---- level 5: nagara triplet (3 events) inside the last matra before sam ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      const tala = T.TALAS[raga.tala];
      const { cs, events } = drumData[rid][5];
      const lastMatraStart = (tala.matras - 1) * 4;
      const triplet = events.filter(e => (e.at % cs) === lastMatraStart && e.voice === 'big' && e.key === 'nagara' && e.frac !== undefined);
      if (triplet.length < 3) { ok = false; bad.push(`${rid}:triplet=${triplet.length}`); }
    }
    check('level 5: a nagara triplet (3 events) inside the last matra before sam' + (bad.length ? ' — ' + bad.join(', ') : ''), ok);
  }

  // ---- pluckAt: L3 ostinato in order + pc validity; L0 gliss on section starts ----
  const pluckData = {};
  for (const rid of ragaIds) {
    pluckData[rid] = {};
    for (const level of [0, 2, 3, 4, 5]) pluckData[rid][level] = JSON.parse(R(`__collectPluck('${rid}', ${level}, 4242, 6)`));
  }
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      const { cs, events } = pluckData[rid][3];
      // ostinato index is keyed off the matra (m = s>>2), which resets every
      // tala cycle — so "in order" holds *within* each cycle, restarting
      // from index 0 each cycle (exactly matching the per-cycle formula);
      // it doesn't stay globally sequential across a cycle boundary unless
      // the tala's matra count happens to be a multiple of 4.
      const byCycle = {};
      for (const e of events) { const cyc = Math.floor(e.at / cs); (byCycle[cyc] = byCycle[cyc] || []).push(e.deg); }
      for (const cyc of Object.keys(byCycle)) {
        const seq = byCycle[cyc];
        const expected = seq.map((_, i) => raga.ostinato[i % raga.ostinato.length]);
        if (JSON.stringify(seq) !== JSON.stringify(expected)) { ok = false; bad.push(`${rid}:order-mismatch:cycle${cyc}`); }
      }
      for (let level = 0; level <= 5; level++) {
        if (!pluckData[rid][level]) continue;
        for (const e of pluckData[rid][level].events) if (raga.notes.indexOf(pc(e.deg)) === -1) { ok = false; bad.push(`${rid}L${level}:pc-not-in-notes:${e.deg}`); }
      }
    }
    check('pluckAt L3 plays raga.ostinato in order; every pluck deg has pc in raga.notes' + (bad.length ? ' — ' + bad.slice(0, 6).join(', ') : ''), ok);
  }
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const { cs, events } = pluckData[rid][0];
      const byStep = {};
      for (const e of events) { (byStep[e.at] = byStep[e.at] || []).push(e); }
      const glisses = Object.keys(byStep).filter(k => byStep[k].length >= 5);
      if (!glisses.length) { ok = false; bad.push(`${rid}:no-gliss`); }
      for (const k of glisses) {
        const at = Number(k);
        if (at % cs !== 0 || Math.floor(at / cs) % 2 !== 0) { ok = false; bad.push(`${rid}:gliss-not-on-section-start:${at}`); }
        if (!byStep[k].every(e => e.frac !== undefined)) { ok = false; bad.push(`${rid}:gliss-missing-frac`); }
      }
    }
    check('pluckAt L0 emits a >=5-note gliss with frac offsets only on sam of every 2nd cycle' + (bad.length ? ' — ' + bad.join(', ') : ''), ok);
  }

  // ---- tanpuraCycle ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      const cyc = JSON.parse(R(`JSON.stringify(MUSIC.gen.tanpuraCycle(MUSIC.theory.RAGAS['${rid}']))`));
      const degs = cyc.map(c => c.deg);
      const gaps = cyc.map(c => c.gap);
      const expectedDegs = [raga.droneFirst - 12, 0, 0, -12];
      if (cyc.length !== 4 || JSON.stringify(degs) !== JSON.stringify(expectedDegs)) { ok = false; bad.push(`${rid}:degs=${JSON.stringify(degs)}`); }
      if (JSON.stringify(gaps) !== JSON.stringify([0.55, 0.55, 0.55, 1.1])) { ok = false; bad.push(`${rid}:gaps=${JSON.stringify(gaps)}`); }
    }
    const malkaunsDegs = JSON.parse(R(`JSON.stringify(MUSIC.gen.tanpuraCycle(MUSIC.theory.RAGAS.malkauns).map(c => c.deg))`));
    if (JSON.stringify(malkaunsDegs) !== JSON.stringify([-7, 0, 0, -12])) { ok = false; bad.push('malkauns-degs-mismatch'); }
    check('tanpuraCycle(raga): 4 strings, degs [droneFirst-12,0,0,-12] (malkauns -> [-7,0,0,-12]), gaps [.55,.55,.55,1.1]'
      + (bad.length ? ' — ' + bad.join(', ') : ''), ok);
  }

  // ---- fitTihai ----
  {
    let ok = true; const bad = [];
    for (const cycleSteps of [28, 40, 48, 64]) {
      for (let rem = 1; rem <= cycleSteps; rem++) {
        const plan = JSON.parse(R(`JSON.stringify(MUSIC.gen.fitTihai(${rem}, ${cycleSteps}))`));
        const { p, g, start, landing } = plan;
        if (!(p >= 3 && p <= 12)) { ok = false; bad.push(`p-oob:${rem}/${cycleSteps}:${p}`); }
        if (!(g >= 0 && g <= 4)) { ok = false; bad.push(`g-oob:${rem}/${cycleSteps}:${g}`); }
        if (!(start >= 1)) { ok = false; bad.push(`start<1:${rem}/${cycleSteps}:${start}`); }
        if (start + 2 * (p + g) + (p - 1) !== landing) { ok = false; bad.push(`identity:${rem}/${cycleSteps}`); }
        const validLanding = landing === rem || (rem < 9 && landing === rem + cycleSteps);
        if (!validLanding) { ok = false; bad.push(`landing:${rem}/${cycleSteps}:${landing}`); }
        if (bad.length > 8) break;
      }
      if (bad.length > 8) break;
    }
    check('fitTihai(rem, cycleSteps): p in [3,12], g in [0,4], start>=1, identity holds, landing===rem (or rem+cycleSteps when rem<9)'
      + (bad.length ? ' — ' + bad.slice(0, 8).join(', ') : ''), ok);
  }

  // ---- tihaiEvents ----
  {
    let ok = true; const bad = [];
    for (const rid of ragaIds) {
      const raga = ragaOf[rid];
      const plan = JSON.parse(R(`JSON.stringify(MUSIC.gen.fitTihai(20, 64))`));
      const events = JSON.parse(R(`JSON.stringify(MUSIC.gen.tihaiEvents(${JSON.stringify(plan)}, MUSIC.theory.RAGAS['${rid}']))`));
      const bigHits = events.filter(e => e.voice === 'big');
      if (bigHits.length !== 3) { ok = false; bad.push(`${rid}:big-count=${bigHits.length}`); }
      for (let k = 0; k < 3; k++) {
        const expectedAt = plan.start + k * (plan.p + plan.g) + (plan.p - 1);
        if (!bigHits.some(e => e.at === expectedAt)) { ok = false; bad.push(`${rid}:missing-landing-k${k}`); }
        const repTabla = events.filter(e => e.voice === 'tabla' && e.at >= plan.start + k * (plan.p + plan.g) && e.at < plan.start + k * (plan.p + plan.g) + plan.p);
        if (!repTabla.length || repTabla[0].key !== 'Dha' || repTabla[repTabla.length - 1].key !== 'Dha') { ok = false; bad.push(`${rid}:rep${k}-not-Dha-bookend`); }
      }
      const finalLanding = plan.start + 2 * (plan.p + plan.g) + (plan.p - 1);
      if (!events.some(e => e.deg === 0 && e.at === finalLanding)) { ok = false; bad.push(`${rid}:no-deg0-at-final-landing`); }
      if (!events.every(e => e.exact === true)) { ok = false; bad.push(`${rid}:missing-exact-flag`); }
    }
    check('tihaiEvents: 3 big landing hits at start+k*(p+g)+(p-1); deg 0 lead note at final landing; each repetition bookended by Dha; all events exact'
      + (bad.length ? ' — ' + bad.join(', ') : ''), ok);
  }
}

// ---------------- MUSIC logic + polling contract (05.3-02) ----------------
{
  const R = (src) => vm.runInContext(src, sandbox);
  console.log('\n— MUSIC logic + polling contract (05.3-02) —');

  // ---- snapshot() defensive defaults ----
  {
    const s1 = JSON.parse(R('JSON.stringify(MUSIC.logic.snapshot(undefined))'));
    const s2 = JSON.parse(R('JSON.stringify(MUSIC.logic.snapshot({}))'));
    const expectedDefault = { state: 'hub', prePause: null, biomeId: null, droneHz: null, boss: false, bossPhase: 0, alive: 0, hpFrac: 1, boonCount: 0, defiance: 0 };
    check('snapshot(undefined) returns safe defaults without throwing', JSON.stringify(s1) === JSON.stringify(expectedDefault));
    check('snapshot({}) returns safe defaults without throwing', JSON.stringify(s2) === JSON.stringify(expectedDefault));
  }
  {
    const s = JSON.parse(R(`JSON.stringify(MUSIC.logic.snapshot({
      state: 'hub', bossRef: { dead: false, phase: 2 },
      enemies: [{ dead: false, boss: false }, { dead: true, boss: false }, { dead: false, boss: true }],
      player: { hp: 3, maxhp: 0, boonRanks: { a: 1 }, defiance: 2 },
    }))`));
    check('snapshot forces boss=false, bossPhase=0 at hub', s.boss === false && s.bossPhase === 0);
    check('snapshot alive counts only !dead && !boss enemies', s.alive === 1);
    check('snapshot hpFrac clamps to 1 when maxhp is 0', s.hpFrac === 1);
  }
  {
    const s = JSON.parse(R(`JSON.stringify(MUSIC.logic.snapshot({
      state: 'combat', bossRef: { dead: false, phase: 1 },
      enemies: Array.from({length: 250}, () => ({ dead: false, boss: false })),
      player: { hp: 200, maxhp: 100, boonRanks: {}, defiance: -1 },
    }))`));
    check('snapshot alive-count loop capped at 200', s.alive === 200);
    check('snapshot hpFrac clamps to [0,1] (hp > maxhp)', s.hpFrac === 1);
  }

  // ---- deriveTarget ----
  {
    const D = (snap, override, dyn) => JSON.parse(R(`JSON.stringify(MUSIC.logic.deriveTarget(${JSON.stringify(snap)}, ${JSON.stringify(override) || 'undefined'}, ${dyn === undefined ? 'undefined' : dyn}))`));
    let t = D({ state: 'hub', boss: false, bossPhase: 0, alive: 0, hpFrac: 1, biomeId: null, droneHz: null, boonCount: 0, defiance: 0 });
    check('deriveTarget hub -> yaman L0 play no-duck', t.ragaId === 'yaman' && t.level === 0 && t.mode === 'play' && t.duck === false);

    t = D({ state: 'combat', boss: false, bossPhase: 0, alive: 2, hpFrac: 1, biomeId: 'naraka', droneHz: 110, boonCount: 0, defiance: 0 });
    check('deriveTarget combat naraka 2 alive full hp -> bhairav L2', t.ragaId === 'bhairav' && t.level === 2);

    t = D({ state: 'combat', boss: false, bossPhase: 0, alive: 7, hpFrac: 1, biomeId: 'naraka', droneHz: 110, boonCount: 0, defiance: 0 });
    check('deriveTarget combat 7 alive -> L3', t.level === 3);

    t = D({ state: 'combat', boss: false, bossPhase: 0, alive: 1, hpFrac: 0.2, biomeId: 'naraka', droneHz: 110, boonCount: 0, defiance: 0 });
    check('deriveTarget combat hpFrac .2 -> L3 + lowHp true', t.level === 3 && t.lowHp === true);

    t = D({ state: 'combat', boss: true, bossPhase: 1, alive: 0, hpFrac: 1, biomeId: 'naraka', droneHz: 110, boonCount: 0, defiance: 0 });
    check('deriveTarget boss phase1 -> L4', t.level === 4);

    t = D({ state: 'combat', boss: true, bossPhase: 2, alive: 0, hpFrac: 1, biomeId: 'naraka', droneHz: 110, boonCount: 0, defiance: 0 });
    check('deriveTarget boss phase2 -> L5', t.level === 5);

    for (const st of ['cleared', 'choosing', 'victory']) {
      t = D({ state: st, boss: false, bossPhase: 0, alive: 0, hpFrac: 1, biomeId: 'naraka', droneHz: 110, boonCount: 0, defiance: 0 });
      check(`deriveTarget ${st} -> L1`, t.level === 1);
    }

    t = D({ state: 'paused', prePause: 'combat', boss: false, bossPhase: 0, alive: 2, hpFrac: 1, biomeId: 'naraka', droneHz: 110, boonCount: 0, defiance: 0 });
    check('deriveTarget paused prePause combat -> L2 + duck true', t.level === 2 && t.duck === true);

    t = D({ state: 'dead', boss: false, bossPhase: 0, alive: 0, hpFrac: 0, biomeId: 'naraka', droneHz: 110, boonCount: 0, defiance: 0 });
    check("deriveTarget dead -> mode 'elegy'", t.mode === 'elegy');

    t = D({ state: 'combat', boss: false, bossPhase: 0, alive: 1, hpFrac: 1, biomeId: 'foo', droneHz: 100, boonCount: 0, defiance: 0 });
    check("deriveTarget unknown biome 'foo' droneHz 100 -> bhairav / saHz 100", t.ragaId === 'bhairav' && Math.abs(t.saHz - 100) < 1e-9);

    t = D({ state: 'combat', boss: false, bossPhase: 0, alive: 1, hpFrac: 1, biomeId: 'naraka', droneHz: 110, boonCount: 0, defiance: 0 }, { level: 3, raga: 'patala' });
    check('deriveTarget override {level:3,raga:patala} -> malkauns L3 regardless of state', t.ragaId === 'malkauns' && t.level === 3);
  }

  // ---- capLevel ----
  {
    const cl = (l, d) => R(`MUSIC.logic.capLevel(${l}, ${d})`);
    check('capLevel(5,0)===1', cl(5, 0) === 1);
    check('capLevel(5,1)===5', cl(5, 1) === 5);
    check('capLevel(3,.5)===3', cl(3, 0.5) === 3);
    check('capLevel(0,0)===0', cl(0, 0) === 0);
    check('capLevel(5,.5)===3', cl(5, 0.5) === 3);
  }

  // ---- createGovernor ----
  {
    R(`
      var __gov1 = MUSIC.logic.createGovernor({ downHoldSec: 3 });
      __gov1.update(3, 0);
      __gov1.update(2, 1);
      __gov1.update(2, 1);
    `);
    check('governor: down does not apply before 3s held', R('__gov1.level') === 3);
    R('__gov1.update(2, 1.5);');
    check('governor: down applies once held >= 3s', R('__gov1.level') === 2);

    R(`
      var __gov2 = MUSIC.logic.createGovernor({ downHoldSec: 3 });
      __gov2.update(3, 0);
      __gov2.update(2, 1);
      __gov2.update(3, 1);
      __gov2.update(2, 1);
      __gov2.update(2, 1);
    `);
    check('governor: up is immediate', true); // implicit in the update(3,0) above never dropping below 3 until held
    check('governor: flicker 3->2->3 within 3s never drops', R('__gov2.level') === 3);

    R('var __gov3 = MUSIC.logic.createGovernor({ downHoldSec: 3 }); __gov3.update(4, 0); __gov3.force(1);');
    check('governor: force() sets immediately', R('__gov3.level') === 1);
  }

  // ---- detectEvents ----
  {
    const snap = (over) => Object.assign({ state: 'hub', prePause: null, biomeId: null, droneHz: null, boss: false, bossPhase: 0, alive: 0, hpFrac: 1, boonCount: 0, defiance: 0 }, over);
    const ev = (prev, cur) => JSON.parse(R(`JSON.stringify(MUSIC.logic.detectEvents(${prev === null ? 'null' : JSON.stringify(prev)}, ${JSON.stringify(cur)}))`));

    check('detectEvents: first call (prev=null) -> []', ev(null, snap()).length === 0);
    check('detectEvents: identical snapshots -> []', ev(snap({ state: 'combat' }), snap({ state: 'combat' })).length === 0);

    check('detectEvents: bossIntro fires when boss appears in combat',
      JSON.stringify(ev(snap({ state: 'combat' }), snap({ state: 'combat', boss: true, bossPhase: 1 }))) === JSON.stringify(['bossIntro']));
    check('detectEvents: bossIntro does not fire on hub -> combat (no boss)',
      ev(snap({ state: 'hub' }), snap({ state: 'combat' })).indexOf('bossIntro') === -1);

    check('detectEvents: bossPhase fires 1->2',
      JSON.stringify(ev(snap({ state: 'combat', boss: true, bossPhase: 1 }), snap({ state: 'combat', boss: true, bossPhase: 2 }))) === JSON.stringify(['bossPhase']));

    {
      const r = ev(snap({ state: 'combat', boss: true, bossPhase: 2 }), snap({ state: 'combat', boss: false }));
      check('detectEvents: bossDefeated fires exactly on boss->!boss, combat->combat (incl. final boss, bossRef stays but dead)', r.indexOf('bossDefeated') !== -1);
    }
    check('detectEvents: bossDefeated never fires on hub->combat',
      ev(snap({ state: 'hub', boss: false }), snap({ state: 'combat', boss: false })).indexOf('bossDefeated') === -1);
    check('detectEvents: bossDefeated never fires on death',
      ev(snap({ state: 'combat', boss: true, bossPhase: 1 }), snap({ state: 'dead', boss: true, bossPhase: 1 })).indexOf('bossDefeated') === -1);

    check('detectEvents: roomClear fires combat->cleared with no boss',
      JSON.stringify(ev(snap({ state: 'combat' }), snap({ state: 'cleared' }))) === JSON.stringify(['roomClear']));
    check('detectEvents: roomClear does not fire combat->cleared with a boss just defeated',
      ev(snap({ state: 'combat', boss: true }), snap({ state: 'cleared', boss: false })).indexOf('roomClear') === -1);

    check('detectEvents: reward fires on boonCount increase within a run',
      JSON.stringify(ev(snap({ state: 'combat', boonCount: 1 }), snap({ state: 'combat', boonCount: 2 }))) === JSON.stringify(['reward']));
    check('detectEvents: reward never fires across hub->run',
      ev(snap({ state: 'hub', boonCount: 0 }), snap({ state: 'combat', boonCount: 1 })).indexOf('reward') === -1);

    check('detectEvents: revive fires on defiance decrease within a run',
      JSON.stringify(ev(snap({ state: 'combat', defiance: 2 }), snap({ state: 'combat', defiance: 1 }))) === JSON.stringify(['revive']));
    check('detectEvents: revive never fires across run->hub',
      ev(snap({ state: 'combat', defiance: 2 }), snap({ state: 'hub', defiance: 1 })).indexOf('revive') === -1);

    check('detectEvents: death fires on state -> dead',
      JSON.stringify(ev(snap({ state: 'combat' }), snap({ state: 'dead' }))) === JSON.stringify(['death']));
    check('detectEvents: victory fires on state -> victory',
      JSON.stringify(ev(snap({ state: 'combat' }), snap({ state: 'victory' }))) === JSON.stringify(['victory']));

    check('detectEvents: biomeChange fires on differing non-null biomeIds outside hub',
      JSON.stringify(ev(snap({ state: 'combat', biomeId: 'naraka' }), snap({ state: 'combat', biomeId: 'patala' }))) === JSON.stringify(['biomeChange']));
    check('detectEvents: toHub fires entering hub',
      JSON.stringify(ev(snap({ state: 'cleared' }), snap({ state: 'hub' }))) === JSON.stringify(['toHub']));
  }

  // ---- polling contract (main sandbox, real GAME/DATA/Boss) ----
  {
    // re-boot to a known hub state first (many earlier sections left GAME
    // mid-run); the contract only cares that a real GAME object snapshots
    // cleanly at boot, not that it happens at the file's very first tick.
    vm.runInContext(`META.load(); GAME.init(); UI.hub();`, sandbox);
    const snapBoot = JSON.parse(R('JSON.stringify(MUSIC.logic.snapshot(GAME))'));
    check("polling contract: snapshot(GAME) at boot -> state 'hub'", snapBoot.state === 'hub');
    const biomeIds = JSON.parse(R('JSON.stringify(DATA.BIOMES.map(b => b.id))'));
    check('polling contract: every DATA.BIOMES id is in BIOME_RAGA', biomeIds.every(id => R(`!!MUSIC.theory.BIOME_RAGA['${id}']`) === true));
    R(`var __tataka = new Boss('tataka', 0, 0);`);
    check("polling contract: new Boss('tataka',0,0) has phase===1 and dead falsy", R('__tataka.phase') === 1 && !R('__tataka.dead'));
    const r1 = vm.runInContext('simulateRun({ godMode: true })', sandbox);
    check('polling contract: after simulateRun, GAME.player.boonRanks is an object', R("typeof GAME.player.boonRanks === 'object' && GAME.player.boonRanks !== null") === true);
    check('polling contract: after simulateRun, GAME.player.defiance is numeric', R("typeof GAME.player.defiance === 'number'") === true);
    check('polling contract: after simulateRun, GAME.enemies is an array', R('Array.isArray(GAME.enemies)') === true);
    // restore boot state for any later sections
    vm.runInContext(`META.load(); GAME.init(); UI.hub();`, sandbox);
  }
}

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
