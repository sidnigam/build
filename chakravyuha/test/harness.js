// ============================================================
// CHAKRAVYUHA — test/harness.js : shared headless sandbox (05.7.1-01)
// DOM/canvas stubs copied verbatim from test/smoke.js (L12-110) so the
// fast combat suite (test/combat.js) and the balance sim (test/balance.js)
// boot the real game scripts without a browser. The copy is deliberate:
// smoke.js is ~8000 lines and is NOT refactored onto this file.
// Every createSandbox() call builds fresh, instance-local stubs.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// Same list and order as test/smoke.js `files` (guarded by test/combat/harness.test.js).
// Later plans append new files in index.html order.
const GAME_FILES = ['utils.js', 'settings.js', 'renderer.js', 'sprites.js', 'vfx.js', 'gfx.js', 'audio.js', 'music.js', 'data.js', 'meta.js', 'combat.js', 'ai.js', 'entities.js', 'minibosses.js', 'rooms.js', 'ui.js', 'game.js', 'storage.js', 'gamepad.js', 'glyphs.js', 'focus.js'];

// ---------------- DOM stubs (verbatim from smoke.js) ----------------
class ClassList {
  constructor() { this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  contains(c) { return this.set.has(c); }
}

const noop = () => {};
// Browser-faithful CanvasGradient.addColorStop: a real canvas THROWS for unparseable colors and
// out-of-range offsets (see smoke.js for the freeze-after-first-boss history).
function isCanvasColor(c) {
  if (typeof c !== 'string') return false;
  const s = c.trim().toLowerCase();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) return true;
  if (/^(?:rgba?|hsla?)\([^()]*\)$/.test(s)) return !/nan|undefined|infinity/.test(s);
  return /^[a-z]+$/.test(s) && ['undefined', 'null', 'nan', 'infinity'].indexOf(s) === -1;   // named colors
}
function strictAddColorStop(offset, color) {
  if (!(typeof offset === 'number' && isFinite(offset) && offset >= 0 && offset <= 1)) {
    const e = new Error(`Failed to execute 'addColorStop' on 'CanvasGradient': The provided value (${offset}) is outside the range (0.0, 1.0).`);
    e.name = 'IndexSizeError'; throw e;
  }
  if (!isCanvasColor(color)) {
    const e = new Error(`Failed to execute 'addColorStop' on 'CanvasGradient': The value provided ('${color}') could not be parsed as a color.`);
    e.name = 'SyntaxError'; throw e;
  }
}
function makeCtxStub() {
  return new Proxy({}, {
    get(t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient')
        return () => ({ addColorStop: strictAddColorStop });
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop in t) return t[prop];
      return noop;
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

// A ctx that records every draw call with the style state at call time.
// ops: [{ op, args, fill, stroke, alpha, font }]
function recordingCtx() {
  const ops = [];
  const ctx = new Proxy({}, {
    get(t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient')
        return () => ({ addColorStop: strictAddColorStop });
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      return function () {
        ops.push({ op: prop, args: Array.from(arguments), fill: t.fillStyle, stroke: t.strokeStyle, alpha: t.globalAlpha, font: t.font });
      };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
  return { ctx, ops };
}

function createSandbox({ files = GAME_FILES, boot = true } = {}) {
  const ctxStub = makeCtxStub();
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

  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    vm.runInContext(src, sandbox, { filename: f });
  }
  const R = src => vm.runInContext(src, sandbox);
  if (boot) R('META.load(); GAME.init(); UI.hub();');

  function flushTimeouts() {
    const fns = sandbox.__timeouts.splice(0);
    for (const fn of fns) { try { fn(); } catch (e) { /* timeouts are best-effort headless */ } }
    return fns.length;
  }
  return { sandbox, R, ctx: ctxStub, els, storage, flushTimeouts };
}

function makeChecker() {
  let failures = 0;
  return {
    check(label, cond) {
      if (cond) console.log(`  ok  ${label}`);
      else { console.error(`FAIL  ${label}`); failures++; }
      return !!cond;
    },
    section(title) { console.log(`\n— ${title} —`); },
    failures() { return failures; },
  };
}

module.exports = { GAME_FILES, createSandbox, recordingCtx, makeChecker, ROOT };
