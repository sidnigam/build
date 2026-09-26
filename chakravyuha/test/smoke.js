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

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
