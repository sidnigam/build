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
const files = ['utils.js', 'settings.js', 'renderer.js', 'sprites.js', 'vfx.js', 'audio.js', 'data.js', 'meta.js', 'entities.js', 'rooms.js', 'ui.js', 'game.js', 'storage.js', 'gamepad.js'];
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

// ---------------- provenance completeness (ART-06) ----------------
const { checkProvenance } = require('../tools/check-provenance.js');
const prov = checkProvenance(path.join(__dirname, '..', 'assets', 'sprites'));
check('provenance: every atlas has a PROVENANCE.json entry'
  + (prov.missing.length ? ' — missing: ' + prov.missing.join(', ') : ''), prov.ok);

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
