// ============================================================
// CHAKRAVYUHA — utils.js : math helpers, RNG, small shared bits
// ============================================================
'use strict';

const U = {
  TAU: Math.PI * 2,

  // ---- seedable RNG (05.7.1-01) ----
  // Every random draw in U goes through U._r. Default is Math.random (behaviour unchanged);
  // U.seed(n) swaps in a deterministic generator for the headless balance sim.
  _r: Math.random,
  seeded: false,
  // mulberry32 — same algorithm as ENV.rng (js/environment.js:57). Never patch Math.random:
  // the smoke sandbox shares the host Math object.
  seed(s) {
    let a = (s >>> 0) || 1;
    U._r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    U.seeded = true;
  },
  unseed() { U._r = Math.random; U.seeded = false; },

  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },

  rand(a = 1, b) { const r = U._r(); return b === undefined ? r * a : a + r * (b - a); },
  randInt(a, b) { return Math.floor(U.rand(a, b + 1)); },
  chance(p) { return U._r() < p; },
  choice(arr) { return arr[Math.floor(U._r() * arr.length)]; },

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(U._r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // items: [{w: weight, ...}] -> one item
  weightedChoice(items) {
    let total = 0;
    for (const it of items) total += it.w;
    let r = U._r() * total;
    for (const it of items) { r -= it.w; if (r <= 0) return it; }
    return items[items.length - 1];
  },

  dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
  angle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },

  // shortest signed angle difference a->b
  angDiff(a, b) {
    let d = (b - a) % U.TAU;
    if (d > Math.PI) d -= U.TAU;
    if (d < -Math.PI) d += U.TAU;
    return d;
  },

  fmt(n) { return Math.round(n).toLocaleString('en-IN'); },

  // ---- tiny event-ish helpers for timers ----
  // a cooldown that counts down toward 0
  cool(obj, key, dt) { if (obj[key] > 0) obj[key] = Math.max(0, obj[key] - dt); },
};

// Roman/Devanagari flourish used across UI
const OM = 'ॐ'; // ॐ
