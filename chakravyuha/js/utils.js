// ============================================================
// CHAKRAVYUHA — utils.js : math helpers, RNG, small shared bits
// ============================================================
'use strict';

const U = {
  TAU: Math.PI * 2,

  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },

  rand(a = 1, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(U.rand(a, b + 1)); },
  chance(p) { return Math.random() < p; },
  choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // items: [{w: weight, ...}] -> one item
  weightedChoice(items) {
    let total = 0;
    for (const it of items) total += it.w;
    let r = Math.random() * total;
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
