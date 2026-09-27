// ============================================================
// CHAKRAVYUHA — music.js : procedural adaptive Hindustani score
// Every sound and every note is synthesized/generated in this file —
// no samples, no third-party audio, no AI-audio-model output. 100%
// procedural, licence-clean for commercial release (Phase 05.3, D-17).
//
// Layers (pure -> ctx, built up across Phase 05.3 plans 01/02/03):
//   MUSIC.theory  — pure data: ragas, talas, intensity tables, helpers.
//   MUSIC.gen     — pure generators: RNG, lead-stream, drums/pluck/
//                   tanpura, tihai fitting. No ctx/window/GAME/DATA
//                   references, no Math.random — only the seeded rand.
//   MUSIC.logic   — pure state derivation (05.3-02).
//   MUSIC.dsp     — pure Float32Array synthesis (05.3-02).
//   engine/scheduler — ctx-touching Web Audio layer (05.3-02/03).
// This plan (05.3-01) implements theory + gen only; MUSIC.ctx stays
// null and nothing here ever calls setTimeout or touches AudioContext.
// ============================================================
'use strict';

const MUSIC = {
  ctx: null,

  // ================================================================
  // MUSIC.theory — pure data + pure helpers, no ctx/window/GAME/DATA
  // ================================================================
  theory: {
    STEPS_PER_MATRA: 4,

    RAGAS: {
      yaman: {
        id: 'yaman', name: 'Yaman', sa: 138.59, leadMul: 2, pluckMul: 2, droneFirst: 7, center: 4,
        notes: [0, 2, 4, 6, 7, 9, 11], up: [0, 2, 4, 6, 9, 11], down: [0, 2, 4, 6, 7, 9, 11],
        vadi: 4, samvadi: 11, nyas: [4, 11, 2, 7, 0], range: [-5, 16], andolan: [], meend: 0.35, tension: 6,
        pakad: [[[-1, 2], [2, 2], [4, 4], [2, 2], [0, 8]], [[7, 2], [6, 2], [4, 4], [2, 2], [0, 8]]],
        chalan: [
          [[-1, 2], [2, 2], [4, 2], [6, 2], [9, 4], [7, 6]],
          [[4, 2], [6, 2], [9, 2], [11, 2], [12, 8]],
          [[12, 2], [11, 2], [9, 2], [7, 2], [6, 2], [4, 6]],
          [[6, 2], [4, 2], [2, 2], [4, 2], [2, 2], [-1, 2], [0, 8]],
          [[9, 2], [11, 2], [14, 2], [12, 4], [11, 2], [9, 2], [7, 6]],
        ],
        mukhda: [[-1, 2], [2, 2], [4, 4], [6, 2], [4, 2], [2, 2], [0, 2], [4, 8]],
        ostinato: [0, -5, 0, 4, 0, -5, 0, -1], tala: 'teentaal', bpm: 54, kit: 'tabla', lead: 'bansuri', bigBoost: 1,
      },
      bhairav: {
        id: 'bhairav', name: 'Bhairav', sa: 110, leadMul: 2, pluckMul: 2, droneFirst: 7, center: 4,
        notes: [0, 1, 4, 5, 7, 8, 11], up: [0, 1, 4, 5, 7, 8, 11], down: [0, 1, 4, 5, 7, 8, 11],
        vadi: 8, samvadi: 1, nyas: [8, 1, 5, 7, 0], range: [-5, 17], andolan: [1, 8], meend: 0.4, tension: 1,
        pakad: [[[0, 2], [4, 2], [5, 2], [8, 6], [7, 4], [4, 2], [5, 2], [1, 6], [0, 8]]],
        chalan: [
          [[4, 2], [5, 2], [7, 2], [8, 4], [7, 2], [5, 2], [4, 2], [5, 6]],
          [[7, 2], [8, 2], [11, 2], [12, 8]],
          [[12, 2], [11, 2], [8, 4], [7, 2], [8, 2], [7, 6]],
          [[5, 2], [4, 2], [1, 4], [0, 2], [-1, 2], [0, 8]],
          [[8, 2], [11, 2], [13, 4], [12, 2], [11, 2], [8, 6]],
        ],
        mukhda: [[4, 2], [5, 2], [8, 4], [7, 2], [5, 2], [4, 2], [1, 2], [0, 8]],
        ostinato: [0, 0, 1, 0, -1, 0, -4, -5], tala: 'rupak', bpm: 104, kit: 'tabla', lead: 'bowed', bigBoost: 1,
      },
      malkauns: {
        id: 'malkauns', name: 'Malkauns', sa: 98, leadMul: 2, pluckMul: 2, droneFirst: 5, center: 4,
        notes: [0, 3, 5, 8, 10], up: [0, 3, 5, 8, 10], down: [0, 3, 5, 8, 10],
        vadi: 5, samvadi: 0, nyas: [5, 0, 8, 3], range: [-7, 17], andolan: [8], meend: 0.55, tension: 8,
        pakad: [[[5, 2], [3, 2], [5, 2], [8, 2], [10, 2], [8, 2], [5, 4], [3, 2], [5, 2], [3, 2], [0, 8]]],
        chalan: [
          [[-2, 2], [0, 2], [3, 4], [5, 6]],
          [[5, 2], [8, 2], [10, 2], [12, 8]],
          [[12, 2], [10, 2], [8, 4], [10, 2], [8, 2], [5, 6]],
          [[8, 2], [5, 2], [3, 2], [5, 2], [3, 2], [0, 2], [-2, 2], [0, 8]],
          [[10, 2], [12, 2], [15, 4], [12, 2], [10, 2], [8, 6]],
        ],
        mukhda: [[-4, 2], [-2, 2], [0, 2], [3, 2], [5, 4], [3, 2], [0, 2], [5, 8]],
        ostinato: [0, 0, -2, 0, -4, 0, -7, -4], tala: 'jhaptaal', bpm: 92, kit: 'pakhawaj', lead: 'bansuri', bigBoost: 1,
      },
      adana: {
        id: 'adana', name: 'Adana', sa: 123.47, leadMul: 2, pluckMul: 2, droneFirst: 7, center: 7,
        // komal Ga (pc 3) ONLY via bank phrases (vakra "m g m R S") — never in free walk.
        notes: [0, 2, 3, 5, 7, 8, 10], up: [0, 2, 5, 7, 8, 10], down: [0, 2, 5, 7, 8, 10],
        vadi: 12, samvadi: 7, nyas: [12, 7, 5, 0], range: [-5, 19], andolan: [], meend: 0.25, tension: 3,
        pakad: [[[5, 2], [7, 2], [8, 2], [10, 2], [12, 6], [8, 2], [10, 2], [7, 4], [5, 2], [3, 2], [5, 2], [2, 2], [0, 8]]],
        chalan: [
          [[7, 2], [10, 2], [12, 4], [14, 2], [12, 6]],
          [[12, 2], [8, 2], [10, 2], [7, 6]],
          [[5, 2], [3, 2], [5, 2], [2, 2], [0, 8]],
          [[12, 2], [14, 2], [15, 2], [14, 2], [12, 4], [10, 2], [12, 8]],
          [[0, 2], [2, 2], [5, 2], [7, 2], [10, 2], [8, 2], [10, 2], [12, 8]],
        ],
        mukhda: [[5, 2], [7, 2], [10, 2], [8, 2], [10, 2], [12, 4], [10, 2], [12, 8]],
        ostinato: [0, 0, -5, 0, 0, -2, -5, -4], tala: 'ektaal', bpm: 116, kit: 'tabla', lead: 'reed', bigBoost: 1.15,
      },
      bhairavi: {
        id: 'bhairavi', name: 'Bhairavi', sa: 82.41, leadMul: 4, pluckMul: 2, droneFirst: 7, center: 4,
        notes: [0, 1, 3, 5, 7, 8, 10], up: [0, 1, 3, 5, 7, 8, 10], down: [0, 1, 3, 5, 7, 8, 10],
        vadi: 5, samvadi: 0, nyas: [5, 0, 7, 3], range: [-5, 15], andolan: [1], meend: 0.45, tension: 1,
        pakad: [[[5, 2], [3, 2], [1, 2], [0, 4], [-2, 2], [-4, 2], [-2, 2], [0, 8]]],
        chalan: [
          [[12, 2], [10, 2], [8, 2], [7, 6]],
          [[3, 2], [5, 2], [7, 2], [8, 4], [7, 2], [5, 2], [3, 6]],
          [[7, 2], [8, 2], [10, 2], [12, 6], [13, 2], [12, 6]],
          [[8, 2], [7, 2], [5, 2], [3, 2], [1, 2], [0, 8]],
          [[0, 2], [1, 2], [3, 2], [5, 4], [3, 2], [1, 2], [0, 6]],
        ],
        mukhda: [[7, 2], [8, 2], [7, 2], [5, 2], [3, 2], [1, 2], [3, 4], [0, 8]],
        ostinato: [0, 0, -2, 0, 1, 0, -4, -5], tala: 'teentaal', bpm: 96, kit: 'tabla', lead: 'bowed', bigBoost: 1,
      },
    },

    TALAS: {
      teentaal: {
        matras: 16, vibhags: [4, 4, 4, 4], marks: ['X', '2', '0', '3'], samIsKhali: false,
        theka: ['Dha', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Dhin', 'Dhin', 'Dha', 'Dha', 'Tin', 'Tin', 'Ta', 'Ta', 'Dhin', 'Dhin', 'Dha'],
      },
      rupak: {
        matras: 7, vibhags: [3, 2, 2], marks: ['0', '1', '2'], samIsKhali: true,
        theka: ['Tin', 'Tin', 'Na', 'Dhi', 'Na', 'Dhi', 'Na'],
      },
      jhaptaal: {
        matras: 10, vibhags: [2, 3, 2, 3], marks: ['X', '2', '0', '3'], samIsKhali: false,
        theka: ['Dhi', 'Na', 'Dhi', 'Dhi', 'Na', 'Ti', 'Na', 'Dhi', 'Dhi', 'Na'],
      },
      ektaal: {
        matras: 12, vibhags: [2, 2, 2, 2, 2, 2], marks: ['X', '0', '2', '0', '3', '4'], samIsKhali: false,
        theka: ['Dhin', 'Dhin', 'DhaGe', 'TiRaKiTa', 'Tu', 'Na', 'Kat', 'Ta', 'DhaGe', 'TiRaKiTa', 'Dhi', 'Na'],
      },
    },

    BIOME_RAGA: { hub: 'yaman', naraka: 'bhairav', patala: 'malkauns', ranabhoomi: 'adana', vaitarani: 'bhairavi' },

    STEM_NAMES: ['drone', 'sub', 'lead', 'pluck', 'tabla', 'big', 'metal'],

    // target stem gains 0..1, index = intensity level (D-05). Retuned from
    // the brief's raw table (whose L5/L1 sum ratio was ~2.83) so the
    // loudness rule ("L5's summed stem gain <= ~2x L1's") actually holds;
    // shape/monotonicity (percussion silent at L0, drone tapering as
    // percussion rises) is unchanged, only the dynamic range is compressed.
    INTENSITY: [
      { drone: 0.9, sub: 0, lead: 0.55, pluck: 0.15, tabla: 0, big: 0, metal: 0 },
      { drone: 0.8, sub: 0.15, lead: 0.6, pluck: 0.3, tabla: 0.45, big: 0.15, metal: 0.15 },
      { drone: 0.7, sub: 0.3, lead: 0.7, pluck: 0.5, tabla: 0.7, big: 0.45, metal: 0.4 },
      { drone: 0.65, sub: 0.4, lead: 0.75, pluck: 0.6, tabla: 0.8, big: 0.55, metal: 0.45 },
      { drone: 0.6, sub: 0.5, lead: 0.8, pluck: 0.7, tabla: 0.9, big: 0.65, metal: 0.5 },
      { drone: 0.55, sub: 0.55, lead: 0.85, pluck: 0.75, tabla: 1, big: 0.75, metal: 0.55 },
    ],

    TEMPO_MUL: [1, 1, 1, 1, 1.15, 1.25],

    TABLA_KEYS: ['Dha', 'Dhin', 'Tin', 'Tun', 'Na', 'Ta', 'Ge', 'Ke', 'Te', 'Re'],
    BIG_KEYS: ['nagara', 'dhol', 'dholHi', 'sub'],
    METAL_KEYS: ['ching', 'chak'],
    FX_KEYS: ['riser', 'swell', 'stab', 'bell'],

    // single-bol -> tabla bank key (occupies sub 0 of the matra)
    BOL_SINGLE: {
      Dha: 'Dha', Dhin: 'Dhin', Dhi: 'Dhin', Tin: 'Tin', Ti: 'Tin',
      Na: 'Na', Ta: 'Ta', Tu: 'Tun', Kat: 'Ke', Ge: 'Ge',
    },
    // composite bol -> 4-slot (one per 16th-note sub-division of the matra)
    BOL_COMPOSITE: {
      DhaGe: ['Dha', null, 'Ge', null],
      TiRaKiTa: ['Te', 'Re', 'Ke', 'Te'],
    },

    // ---------------- pure helpers ----------------
    pc(d) { return ((d % 12) + 12) % 12; },

    semiToHz(saHz, semi) { return saHz * Math.pow(2, semi / 12); },

    ragaFor(idOrBiome) {
      const T = MUSIC.theory;
      if (T.RAGAS[idOrBiome]) return T.RAGAS[idOrBiome];
      const rid = T.BIOME_RAGA[idOrBiome];
      if (rid && T.RAGAS[rid]) return T.RAGAS[rid];
      return T.RAGAS.bhairav;
    },

    scaleDegrees(raga, set, lo, hi) {
      const allowed = raga[set];
      const out = [];
      for (let d = lo; d <= hi; d++) if (allowed.indexOf(MUSIC.theory.pc(d)) !== -1) out.push(d);
      return out;
    },

    talaSteps(tala) { return tala.matras * MUSIC.theory.STEPS_PER_MATRA; },

    vibhagStartSteps(tala) {
      const out = [];
      let acc = 0;
      for (let i = 0; i < tala.vibhags.length; i++) {
        out.push(acc);
        acc += tala.vibhags[i] * MUSIC.theory.STEPS_PER_MATRA;
      }
      return out;
    },

    isSam(tala, step) {
      const cs = MUSIC.theory.talaSteps(tala);
      return (((step % cs) + cs) % cs) === 0;
    },

    matraOf(step) { return Math.floor(step / MUSIC.theory.STEPS_PER_MATRA); },

    vibhagIndexAt(tala, step) {
      const cs = MUSIC.theory.talaSteps(tala);
      const s = ((step % cs) + cs) % cs;
      const starts = MUSIC.theory.vibhagStartSteps(tala);
      let vi = 0;
      for (let i = 0; i < starts.length; i++) if (starts[i] <= s) vi = i;
      return vi;
    },

    isKhaliVibhag(tala, vi) { return tala.marks[vi] === '0'; },

    nextBoundary(tala, step, kind) {
      const T = MUSIC.theory;
      const cs = T.talaSteps(tala);
      const s = ((step % cs) + cs) % cs;
      if (kind === 'sam') return s === 0 ? cs : cs - s;
      const starts = T.vibhagStartSteps(tala);
      for (let i = 0; i < starts.length; i++) if (starts[i] > s) return starts[i] - s;
      return cs - s;
    },

    expandBol(bol) {
      const T = MUSIC.theory;
      if (T.BOL_COMPOSITE[bol]) return T.BOL_COMPOSITE[bol].slice();
      const k = T.BOL_SINGLE[bol];
      return [k !== undefined ? k : null, null, null, null];
    },

    // tune the dayan (tabla treble drum) to Sa, folded into the audible
    // membrane range [200,400) Hz.
    dayanHz(sa) {
      let v = sa;
      let guard = 0;
      while (v < 200 && guard++ < 32) v *= 2;
      guard = 0;
      while (v >= 400 && guard++ < 32) v /= 2;
      return v;
    },
  },

  // ================================================================
  // MUSIC.gen — pure generators (seeded rand only, never Math.random)
  // ================================================================
  gen: {
    // mulberry32 seeded PRNG -> function returning [0,1)
    rng(seed) {
      let a = seed >>> 0;
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; },

    weightedPick(rand, items, weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      let r = rand() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },

    jitter(rand, amt) { return (rand() * 2 - 1) * amt; },

    // ---- lead stream (05.3-01 task 2) ----

    // ---- percussion / pluck / tanpura / tihai (05.3-01 task 3) ----
  },

  // ---- logic (05.3-02) ----

  // ---- dsp (05.3-02) ----

  // ---- engine / scheduler (05.3-02 / 05.3-03) ----
};

// ================================================================
// MUSIC.gen.placeMukhda / createLeadStream — raga-constrained lead
// stream (alap / bandish form). Private helpers kept in this IIFE's
// closure (mirrors the DIALOGUE.LINES content IIFE in dialogue.js) so
// they don't leak onto window/globalThis; only the two public
// functions are attached to MUSIC.gen. Pure: seeded rand only.
// ================================================================
(function () {
  const T = MUSIC.theory;
  const G = MUSIC.gen;

  // rhythm palettes (durations in steps), keyed by intensity level
  const RHYTHM = {
    0: [8, 12, 16, 24],
    1: [4, 6, 8, 12],
    2: [2, 4, 4, 6, 8],
    3: [2, 2, 4, 4, 6],
    4: [2, 4],
    5: [1, 1, 2, 2, 4],
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function nearestInSet(fromDeg, pcSet, lo, hi) {
    let best = null, bestDist = Infinity;
    for (let d = lo; d <= hi; d++) {
      if (pcSet.indexOf(T.pc(d)) !== -1) {
        const dist = Math.abs(d - fromDeg);
        if (dist < bestDist) { bestDist = dist; best = d; }
      }
    }
    return best === null ? clamp(fromDeg, lo, hi) : best;
  }

  // Force a phrase-ending degree onto a nyas note that is valid for the
  // direction it was approached from (e.g. Yaman never ascends to a final
  // Pa) — D-08. Sa (pc 0) is always a member of every raga's up/down sets
  // here, so the direction-filtered pool is never empty.
  function forceNyasEnding(raga, prevDeg, curDeg) {
    const nyasPcs = raga.nyas.concat([0]).map(v => T.pc(v));
    // A candidate above prevDeg needs pc in up, below needs pc in down; a
    // candidate exactly AT prevDeg (a same-note landing) is direction-
    // ambiguous, so require it valid in *both* — this matches (and is
    // strictly safe under) the ">= counts as up" tie-break used to judge
    // walk-note directionality, so a same-note landing is never flagged.
    function validAt(d) {
      if (d > prevDeg) return raga.up.indexOf(T.pc(d)) !== -1;
      if (d < prevDeg) return raga.down.indexOf(T.pc(d)) !== -1;
      return raga.up.indexOf(T.pc(d)) !== -1 && raga.down.indexOf(T.pc(d)) !== -1;
    }
    const cands = [];
    for (let d = raga.range[0]; d <= raga.range[1]; d++) {
      if (nyasPcs.indexOf(T.pc(d)) !== -1 && validAt(d)) cands.push(d);
    }
    if (!cands.length) return nearestInSet(curDeg, nyasPcs, raga.range[0], raga.range[1]);
    cands.sort((a, b) => Math.abs(a - curDeg) - Math.abs(b - curDeg));
    return cands[0];
  }

  // Raga-constrained stepwise walk: each individual step's pc must belong
  // to raga.up (ascending) or raga.down (descending) — D-08.
  function freeWalk(raga, fromDeg, centre, n, rand) {
    const degs = [];
    let cur = clamp(fromDeg, raga.range[0], raga.range[1]);
    for (let i = 0; i < n; i++) {
      let goingUp;
      if (cur < centre - 1) goingUp = rand() < 0.75;
      else if (cur > centre + 1) goingUp = rand() < 0.25;
      else goingUp = rand() < 0.5;
      const dirSet = goingUp ? raga.up : raga.down;
      const lo = goingUp ? cur : Math.max(raga.range[0], cur - 7);
      const hi = goingUp ? Math.min(raga.range[1], cur + 7) : cur;
      let cands = T.scaleDegrees(raga, goingUp ? 'up' : 'down', lo, hi).filter(d => d !== cur);
      let next;
      if (!cands.length) {
        next = cur;
      } else {
        cands.sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
        const idx = (rand() < 0.2 && cands.length > 1) ? 1 : 0;
        next = cands[Math.min(idx, cands.length - 1)];
        // occasional leap to Sa/Pa/vadi (8%), only within reach or the
        // Sa-Sa' octave, and only if its pc belongs to this direction's set
        if (rand() < 0.08) {
          const leapPcs = [0, 7, T.pc(raga.vadi)].filter(p => dirSet.indexOf(p) !== -1);
          const opts = [];
          for (let d = cur - 12; d <= cur + 12; d++) {
            if (d < raga.range[0] || d > raga.range[1]) continue;
            const delta = d - cur;
            if (goingUp ? delta <= 0 : delta >= 0) continue;
            if (leapPcs.indexOf(T.pc(d)) === -1) continue;
            if (Math.abs(delta) <= 7 || (Math.abs(delta) === 12 && T.pc(d) === 0)) opts.push(d);
          }
          if (opts.length) next = opts[Math.floor(rand() * opts.length)];
        }
      }
      degs.push(next);
      cur = next;
    }
    // defensive: never more than 3 identical notes in a row. The
    // replacement must still be direction-valid (pc in up if it ends up
    // above the previous note, pc in down if below).
    for (let i = 3; i < degs.length; i++) {
      if (degs[i] === degs[i - 1] && degs[i - 1] === degs[i - 2] && degs[i - 2] === degs[i - 3]) {
        const from = degs[i - 1];
        const upCands = T.scaleDegrees(raga, 'up', from + 1, Math.min(raga.range[1], from + 7));
        const downCands = T.scaleDegrees(raga, 'down', Math.max(raga.range[0], from - 7), from - 1);
        const pool = upCands.concat(downCands);
        if (pool.length) degs[i] = pool[Math.floor(rand() * pool.length)];
      }
    }
    return degs;
  }

  function velFor(level, rand, peak) {
    const v = (level >= 4 ? 0.7 : 0.55) + (peak ? 0.1 : 0) + G.jitter(rand, 0.05);
    return clamp(v, 0.2, 1);
  }

  // Builds one phrase's notes (bank-derived or free-walk), forces the
  // final note onto a direction-valid nyas, assigns durations/vel/orn.
  function genPhraseNotes(raga, level, fromDeg, centre, opts, rand) {
    const kind = opts.kind || 'gat';
    const minN = opts.minNotes || 3, maxN = opts.maxNotes || 5;
    const bankProb = level <= 2 ? 0.45 : 0.3;
    const palette = RHYTHM[level] || RHYTHM[2];
    let notes;
    if (rand() < bankProb && (raga.pakad.length || raga.chalan.length)) {
      const pool = raga.pakad.concat(raga.chalan);
      const bank = pool[Math.floor(rand() * pool.length)];
      let degs = bank.map(p => p[0]);
      let durs = bank.map(p => p[1]);
      if (kind === 'taan') durs = durs.map(d => Math.max(1, Math.round(d * 0.5)));
      if (rand() < 0.3) {
        const shift = rand() < 0.5 ? 12 : -12;
        const shifted = degs.map(d => d + shift);
        if (shifted.every(d => d >= raga.range[0] && d <= raga.range[1])) degs = shifted;
      }
      notes = degs.map((d, i) => ({ deg: d, dur: durs[i], src: 'bank' }));
    } else {
      const n = minN + Math.floor(rand() * (maxN - minN + 1));
      const degs = freeWalk(raga, fromDeg, opts.reachDeg !== undefined ? opts.reachDeg : centre, n, rand);
      notes = degs.map(d => ({ deg: d, dur: palette[Math.floor(rand() * palette.length)], src: 'walk' }));
    }
    const n = notes.length;
    const prevDeg = n >= 2 ? notes[n - 2].deg : fromDeg;
    notes[n - 1].deg = forceNyasEnding(raga, prevDeg, notes[n - 1].deg);
    const floorDur = kind === 'taan' ? 2 : 4;
    notes[n - 1].dur = Math.max(floorDur, notes[n - 1].dur);
    let peakIdx = 0, peakVal = -Infinity;
    notes.forEach((nn, i) => { if (nn.deg > peakVal) { peakVal = nn.deg; peakIdx = i; } });
    notes.forEach((nn, i) => {
      nn.vel = velFor(level, rand, i === peakIdx);
      nn.glide = rand() < raga.meend && nn.dur >= 2;
      if (raga.andolan.indexOf(T.pc(nn.deg)) !== -1 && nn.dur >= 4) nn.orn = 'andolan';
      else if (rand() < 0.15 && nn.dur >= 2) nn.orn = 'kan';
      else if (level >= 2 && rand() < 0.1 && nn.dur >= 4) nn.orn = 'murki';
      else nn.orn = 'none';
    });
    return { notes, signature: notes.map(nn => nn.deg).join(',') };
  }

  function computeStart(pairs, cycleSteps) {
    let sum = 0;
    for (let i = 0; i < pairs.length - 1; i++) sum += pairs[i][1];
    return cycleSteps - sum;
  }

  G.placeMukhda = function (mukhda, cycleSteps) {
    return computeStart(mukhda, cycleSteps);
  };

  G.createLeadStream = function (raga, tala, seed) {
    const rand = G.rng(seed);
    const cs = T.talaSteps(tala);
    const state = {
      queue: [], planned: 0, cycle: 0, prevDeg: 0, history: [],
      lastNonMukhdaSig: null, lastCompleted: [], spill: 0, section: 'alap',
      phraseCount: 0, aCount: 0,
    };

    function planCycle(level) {
      const startAt = state.planned;
      let cursor = state.spill;
      state.spill = 0;
      const centre = raga.center;

      // Bookkeeping only — never mutates notes here. Mutating an
      // already-validated phrase after the fact risks breaking its own
      // internal leap/direction/nyas invariants; the no-back-to-back
      // guarantee instead lives at each generator call site, which
      // regenerates (rather than patches) on a collision.
      function emit(notes, kind) {
        if (kind !== 'mukhda' && notes.length) {
          const sig = notes.map(n => n.deg).join(',');
          state.lastNonMukhdaSig = sig;
          state.history.push(sig);
          if (state.history.length > 3) state.history.shift();
        }
        for (let i = 0; i < notes.length; i++) {
          const n = notes[i];
          state.queue.push({
            at: startAt + cursor, deg: n.deg, dur: n.dur, vel: n.vel,
            glide: !!n.glide, orn: n.orn || 'none', src: n.src, phraseId: state.phraseCount, kind,
          });
          cursor += n.dur;
        }
        state.phraseCount++;
        state.lastCompleted = notes.slice();
      }

      // novelty (D-09): regenerate up to 3x if the fresh phrase's signature
      // matches one of the last 3 emitted signatures. The hard guarantee
      // against an exact back-to-back repeat lives centrally in emit().
      function genPhrase(centreArg, minN, maxN, kind, reachDeg) {
        let result, tries = 0;
        do {
          result = genPhraseNotes(raga, level, state.prevDeg, centreArg, { minNotes: minN, maxNotes: maxN, kind, reachDeg }, rand);
          tries++;
        } while (state.history.indexOf(result.signature) !== -1 && tries < 3);
        // D-09's "up to 3 tries" is a soft novelty heuristic, not a hard
        // guarantee — with a small bank-phrase pool it can still collide
        // with the immediately preceding phrase. As a last-resort safety
        // net (never a correctness risk): an octave shift preserves every
        // pc exactly, so it can't break leap/direction/nyas invariants,
        // only the signature (degs) itself.
        if (result.signature === state.lastNonMukhdaSig) {
          for (const shift of [12, -12]) {
            const shifted = result.notes.map(n => n.deg + shift);
            if (shifted.every(d => d >= raga.range[0] && d <= raga.range[1])) {
              result.notes.forEach((n, i) => { n.deg = shifted[i]; });
              result.signature = shifted.join(',');
              break;
            }
          }
        }
        state.prevDeg = result.notes[result.notes.length - 1].deg;
        return result.notes;
      }

      function fillPhrases(limit, centreArg, minN, maxN, kind, opts) {
        opts = opts || {};
        const maxPhrases = opts.maxPhrases != null ? opts.maxPhrases : 3;
        const restMin = opts.restMin != null ? opts.restMin : 2;
        const restMax = opts.restMax != null ? opts.restMax : 8;
        const minGap = opts.minGap != null ? opts.minGap : 6;
        let count = 0;
        while (count < maxPhrases && limit - cursor >= minGap) {
          const notes = genPhrase(centreArg, minN, maxN, kind, opts.reachDeg);
          const len = notes.reduce((a, b) => a + b.dur, 0);
          if (cursor + len > limit) break;
          emit(notes, kind);
          count++;
          const rest = restMin + Math.floor(rand() * (restMax - restMin + 1));
          cursor = Math.min(limit, cursor + rest);
        }
      }

      // guarantees >= 1 tar-register (deg >= 12) note per antara/B section —
      // candidates are pre-filtered to nyas-valid tar-register degrees, so
      // any one of them is a safe single-note "phrase" on its own; picking
      // an alternate (rather than patching) keeps the no-back-to-back
      // guarantee from ever producing an invalid note.
      function emitTarTouch(limit) {
        if (limit - cursor < 4) return;
        const nyasPcs = raga.nyas.concat([0]).map(v => T.pc(v));
        const cands = T.scaleDegrees(raga, 'notes', 12, raga.range[1]).filter(d => nyasPcs.indexOf(T.pc(d)) !== -1);
        const pool = cands.length ? cands : [12];
        const alts = pool.filter(d => String(d) !== state.lastNonMukhdaSig);
        const finalPool = alts.length ? alts : pool;
        const deg = finalPool[Math.floor(rand() * finalPool.length)];
        const dur = Math.min(6, limit - cursor);
        emit([{ deg, dur, vel: velFor(level, rand, true), glide: true, orn: 'none', src: 'walk' }], 'gat');
        state.prevDeg = deg;
      }

      // Candidate choice at each taan step has a small chance of skipping
      // to the next-nearest scale degree (mirrors freeWalk) so a retried
      // taan can actually land on a different degree path — a purely
      // deterministic "always nearest" walk would regenerate identically
      // every time and could never resolve a signature collision.
      function buildTaanNotes(limit, srcTag, startDeg) {
        let cur = startDeg;
        let goingUp = true;
        const top = Math.min(raga.range[1], centre + 12);
        const bottom = Math.max(raga.range[0], centre - 5);
        const notes = [];
        let c = cursor;
        while (c < limit - 1) {
          const lo = goingUp ? cur : Math.max(raga.range[0], cur - 3);
          const hi = goingUp ? Math.min(raga.range[1], cur + 3) : cur;
          const cands = T.scaleDegrees(raga, goingUp ? 'up' : 'down', lo, hi).filter(d => d !== cur);
          const idx = (rand() < 0.25 && cands.length > 1) ? 1 : 0;
          const next = cands.length ? cands[Math.min(idx, cands.length - 1)] : cur;
          if (goingUp && next >= top) goingUp = false;
          if (!goingUp && next <= bottom) goingUp = true;
          const dur = (rand() < 0.5) ? 1 : 2;
          if (c + dur > limit) break;
          notes.push({ deg: next, dur, vel: velFor(level, rand, false), glide: false, orn: 'none', src: srcTag || 'taan' });
          cur = next;
          c += dur;
        }
        if (notes.length) {
          const prevForDir = notes.length > 1 ? notes[notes.length - 2].deg : startDeg;
          notes[notes.length - 1].deg = forceNyasEnding(raga, prevForDir, notes[notes.length - 1].deg);
          notes[notes.length - 1].dur = Math.max(2, notes[notes.length - 1].dur);
        }
        return notes;
      }

      function emitTaan(limit, srcTag) {
        let notes = [];
        for (let t = 0; t < 3; t++) {
          notes = buildTaanNotes(limit, srcTag, state.prevDeg);
          if (!notes.length) break;
          if (notes.map(n => n.deg).join(',') !== state.lastNonMukhdaSig) break;
        }
        if (notes.length) {
          emit(notes, 'taan');
          state.prevDeg = notes[notes.length - 1].deg;
        }
      }

      function placeMukhdaPhrase(prefillMode) {
        let durs = raga.mukhda.map(p => p[1]);
        if (level === 5) durs = durs.map(d => Math.max(1, Math.floor(d / 2)));
        const degs = raga.mukhda.map(p => p[0]);
        const pairs = degs.map((d, i) => [d, durs[i]]);
        const start = computeStart(pairs, cs);
        if (start > cursor) {
          if (prefillMode === 'taan') emitTaan(start, 'taan');
          else fillPhrases(start, centre, 3, 5, level === 0 ? 'alap' : 'gat', { maxPhrases: 2, restMin: 3, restMax: 10 });
        }
        cursor = Math.max(cursor, start);
        const notes = degs.map((d, i) => ({
          deg: d, dur: durs[i], src: 'mukhda',
          vel: Math.min(1, velFor(level, rand, false) + (i === degs.length - 1 ? 0.2 : 0.05)),
          glide: false, orn: 'none',
        }));
        emit(notes, 'mukhda');
        state.prevDeg = notes[notes.length - 1].deg;
      }

      // ---- level-specific cycle content ----
      if (level === 0) {
        const stage = state.phraseCount % 16;
        const rc = stage <= 3 ? centre - 7 : stage <= 9 ? centre : stage <= 13 ? centre + 8 : centre;
        state.section = 'alap';
        fillPhrases(cs, rc, 2, 3, 'alap', { maxPhrases: 1, restMin: 4, restMax: 12, minGap: 8 });
      } else if (level >= 1 && level <= 3) {
        const formIdx = state.cycle % 4;
        const isBreath = (state.cycle % 8) === 7;
        const form = formIdx === 2 ? 'B' : 'A';
        if (form === 'A') state.aCount++;
        state.section = isBreath ? 'breath' : form;
        if (isBreath) {
          // tacet — rhythm continues elsewhere, lead stays silent this cycle
        } else if (form === 'B') {
          fillPhrases(cs, centre + 8, 3, 5, 'gat', { maxPhrases: level === 3 ? 3 : 2, restMin: 3, restMax: 10, reachDeg: centre + 12 });
          emitTarTouch(cs);
        } else {
          const wantsMukhda = level >= 2 || (state.aCount % 2 === 0);
          if (wantsMukhda) placeMukhdaPhrase();
          else fillPhrases(cs, centre, 3, level === 3 ? 5 : 4, 'gat', { maxPhrases: level === 3 ? 3 : 2, restMin: 3, restMax: 10 });
        }
      } else if (level === 4) {
        const isTaan = (state.cycle % 2) === 0;
        state.section = 'A';
        if (isTaan) emitTaan(cs, 'taan');
        else placeMukhdaPhrase();
      } else {
        const isMukhda = (state.cycle % 2) === 0;
        state.section = 'A';
        if (isMukhda) {
          placeMukhdaPhrase('taan');
        } else if (Math.floor(state.cycle / 2) % 2 === 0) {
          // tar-register wail: candidates pre-filtered to nyas-valid
          // tar-register degrees, same alternate-on-collision approach
          // as emitTarTouch (never patches an already-valid note).
          const availableDur = cs - cursor;
          const dur = Math.max(4, Math.min(8 + Math.floor(rand() * 9), availableDur));
          const nyasPcs = raga.nyas.concat([0]).map(v => T.pc(v));
          const wailLo = Math.max(raga.range[0], centre + 4);
          const cands = T.scaleDegrees(raga, 'notes', wailLo, raga.range[1]).filter(d => nyasPcs.indexOf(T.pc(d)) !== -1);
          const pool = cands.length ? cands : [forceNyasEnding(raga, state.prevDeg, Math.min(raga.range[1], centre + 12))];
          const alts = pool.filter(d => String(d) !== state.lastNonMukhdaSig);
          const deg = (alts.length ? alts : pool)[Math.floor(rand() * (alts.length ? alts.length : pool.length))];
          emit([{ deg, dur, vel: velFor(level, rand, true), glide: true, orn: 'none', src: 'walk' }], 'gat');
          state.prevDeg = deg;
        } else {
          emitTaan(cs, 'taan');
        }
      }

      state.planned = startAt + cs;
      state.cycle++;
      if (state.queue.length) {
        const lastEv = state.queue[state.queue.length - 1];
        if (lastEv.at === startAt + cs) state.spill = lastEv.dur;
      }
    }

    return {
      eventsAt(absStep, level) {
        while (state.planned < absStep + cs) planCycle(level);
        const out = [];
        for (let i = 0; i < state.queue.length;) {
          if (state.queue[i].at === absStep) { out.push(state.queue[i]); state.queue.splice(i, 1); }
          else i++;
        }
        return out;
      },
      resync(absStep) { state.queue = []; state.planned = absStep; state.spill = 0; },
      tail(n) { return state.lastCompleted.slice(-n); },
      section() { return state.section; },
    };
  };
})();

// ================================================================
// MUSIC.gen.drumsAt / pluckAt / tanpuraCycle / fitTihai / tihaiEvents
// Tala-driven percussion/pluck/tanpura pattern generators per intensity
// level, and tihai (3x cadence) fitting. Pure: seeded rand only. D-05/D-07.
// ================================================================
(function () {
  const T = MUSIC.theory;
  const G = MUSIC.gen;
  const KAYDA = ['Dha', 'Te', 'Re', 'Ke', 'Te', 'Dha', 'Te', 'Re', 'Ke', 'Te', 'Dha', 'Ge', 'Tin', 'Na', 'Ke', 'Na'];
  const TIHAI_MID = ['Te', 'Re', 'Ke', 'Te', 'Dha', 'Ge', 'Na'];

  G.drumsAt = function (tala, raga, absStep, level, rand, opts) {
    opts = opts || {};
    if (level === 0) return [];
    const cs = T.talaSteps(tala);
    const s = ((absStep % cs) + cs) % cs;
    const cycle = Math.floor(absStep / cs);
    const m = s >> 2;
    const sub = s & 3;
    const vi = T.vibhagIndexAt(tala, s);
    const khali = T.isKhaliVibhag(tala, vi);
    const isSam = s === 0;
    const vibhagStarts = T.vibhagStartSteps(tala);
    const isVibhagStart = sub === 0 && vibhagStarts.indexOf(s) !== -1;
    const bolKeys = T.expandBol(tala.theka[m]);
    const bigBoost = raga.bigBoost || 1;
    const out = [];

    function pushBig(key, vel, frac) {
      const v = Math.min(1, vel * (level >= 5 ? bigBoost : 1));
      const ev = { voice: 'big', key, vel: v };
      if (frac !== undefined) ev.frac = frac;
      out.push(ev);
    }

    if (level === 1) {
      if (isVibhagStart) out.push({ voice: 'tabla', key: bolKeys[0], vel: khali ? 0.3 : 0.45 });
      return out;
    }

    if (level === 2 || level === 3) {
      const isFillCycle = level === 2 ? (cycle % 4 === 3) : (cycle % 2 === 1);
      const lastVibhagStart = vibhagStarts[vibhagStarts.length - 1];
      const lastVibhagLen = cs - lastVibhagStart;

      if (isFillCycle && s >= lastVibhagStart) {
        const idx = s - lastVibhagStart;
        if (idx < lastVibhagLen - 1) out.push({ voice: 'tabla', key: KAYDA[idx % KAYDA.length], vel: 0.6 });
      } else if (bolKeys[sub]) {
        let vel = 0.7;
        if (isSam) vel = 0.9;
        else if (khali) vel *= 0.8;
        else vel *= 1.15;
        out.push({ voice: 'tabla', key: bolKeys[sub], vel: Math.min(1, vel) });
      } else if (level === 3 && sub === 2) {
        out.push({ voice: 'tabla', key: 'Na', vel: 0.35 });
      }

      if (isSam) pushBig('nagara', 0.7);
      if (level === 2) {
        if (isVibhagStart && !khali) pushBig('dhol', 0.45);
      } else {
        if (sub === 0) pushBig('dhol', 0.5);
      }
      if (opts.lowHp && level === 3 && isSam && sub === 0) pushBig('dhol', 0.7);
      if (opts.lowHp && level === 3 && s === 1) pushBig('dhol', 0.45);

      if (sub === 0) out.push({ voice: 'metal', key: 'ching', vel: 0.35 });
      if (sub === 2) out.push({ voice: 'metal', key: 'chak', vel: 0.25 });
      return out;
    }

    // ---- L4 / L5: rela ----
    if (sub === 0) {
      out.push({ voice: 'tabla', key: bolKeys[0], vel: 0.85 });
    } else {
      const pattern = (m % 2 === 0) ? ['Te', 'Re', 'Ke'] : ['Ge', 'Te', 'Re'];
      out.push({ voice: 'tabla', key: pattern[sub - 1], vel: 0.35 + rand() * 0.15 });
    }

    if (isSam) pushBig('nagara', 0.85);
    else if (isVibhagStart && !khali) pushBig('nagara', 0.85);
    if (sub === 0) pushBig('dhol', 0.6);
    if (sub === 2) pushBig('dholHi', 0.4);
    if (level === 5 && sub === 3) pushBig('dhol', 0.5);
    if (level === 5 && m === tala.matras - 1 && sub === 0) {
      [0, 1.33, 2.67].forEach(frac => pushBig('nagara', 0.85, frac));
    }

    if (sub === 0) out.push({ voice: 'metal', key: 'ching', vel: 0.35 });
    if (sub === 2) out.push({ voice: 'metal', key: 'chak', vel: 0.4 });
    if (level === 5 && sub !== 2) out.push({ voice: 'metal', key: 'chak', vel: 0.15 });

    return out;
  };

  G.pluckAt = function (raga, tala, absStep, level, rand, echo) {
    const cs = T.talaSteps(tala);
    const s = ((absStep % cs) + cs) % cs;
    const cycle = Math.floor(absStep / cs);
    const m = s >> 2;
    const sub = s & 3;
    const vi = T.vibhagIndexAt(tala, s);
    const khali = T.isKhaliVibhag(tala, vi);
    const isSam = s === 0;
    const vibhagStarts = T.vibhagStartSteps(tala);
    const isVibhagStart = sub === 0 && vibhagStarts.indexOf(s) !== -1;

    if (level === 0) {
      if (isSam && cycle % 2 === 0) {
        const degs = T.scaleDegrees(raga, 'notes', 0, 19).slice(0, 8);
        return degs.map((d, i) => ({ deg: d, vel: 0.3 + (i / Math.max(1, degs.length - 1)) * 0.15, frac: i * 0.25 }));
      }
      return [];
    }

    if (level === 1) {
      const out = [];
      if (isVibhagStart) {
        out.push({ deg: 0, vel: 0.35 });
        if (khali) out.push({ deg: raga.droneFirst - 12, vel: 0.3 });
      }
      return out;
    }

    if (level === 2) {
      const out = [];
      if (sub === 2) out.push({ deg: 12, vel: 0.22 });
      if (sub === 0 && echo && echo.length) {
        const idx = m % echo.length;
        const d = Math.max(raga.range[0], Math.min(raga.range[1], echo[idx].deg - 12));
        out.push({ deg: d, vel: 0.3 });
      }
      return out;
    }

    if (level === 3 || level === 4) {
      const out = [];
      if (sub === 0 || sub === 2) {
        const idx = (m * 2 + (sub >> 1)) % raga.ostinato.length;
        let vel = sub === 0 ? 0.45 : 0.3;
        if (isVibhagStart) vel += 0.15;
        vel = Math.min(1, vel);
        out.push({ deg: raga.ostinato[idx], vel });
        if (level === 4 && isSam && sub === 0) out.push({ deg: raga.ostinato[idx] + 12, vel });
      }
      return out;
    }

    // level 5: jhala 16ths
    if (sub === 0) {
      const idx = m % raga.ostinato.length;
      return [{ deg: raga.ostinato[idx], vel: 0.6 }];
    }
    return [{ deg: 12, vel: 0.28 + rand() * 0.07 }];
  };

  G.tanpuraCycle = function (raga, hub) {
    const degs = [raga.droneFirst - 12, 0, 0, -12];
    const gaps = hub ? [0.7, 0.7, 0.7, 1.4] : [0.55, 0.55, 0.55, 1.1];
    return degs.map((d, i) => ({ deg: d, gap: gaps[i] }));
  };

  function searchTihai(target) {
    let best = null;
    for (let p = 12; p >= 3; p--) {
      for (let g = 0; g <= 4; g++) {
        const total = 3 * p + 2 * g - 1;
        if (total <= target - 1) {
          if (!best || total > best.total || (total === best.total && p > best.p)) best = { p, g, total };
        }
      }
    }
    return best;
  }

  G.fitTihai = function (rem, cycleSteps) {
    let landing = rem;
    let best = searchTihai(landing);
    if (!best && rem < 9) {
      landing = rem + cycleSteps;
      best = searchTihai(landing);
    }
    if (!best) {
      best = { p: 3, g: 0, total: 3 * 3 + 0 - 1 };
      landing = Math.max(landing, best.total + 1);
    }
    return { p: best.p, g: best.g, start: landing - best.total, landing };
  };

  G.tihaiEvents = function (plan, raga) {
    const p = plan.p, g = plan.g, start = plan.start;
    const events = [];
    for (let k = 0; k < 3; k++) {
      const repStart = start + k * (p + g);
      for (let i = 0; i < p; i++) {
        const key = (i === 0 || i === p - 1) ? 'Dha' : TIHAI_MID[(i - 1) % TIHAI_MID.length];
        events.push({ at: repStart + i, voice: 'tabla', key, vel: 0.8, exact: true });
      }
      const landing = repStart + (p - 1);
      events.push({ at: landing, voice: 'big', key: k === 2 ? 'nagara' : 'dhol', vel: k === 2 ? 1 : 0.85, exact: true });
      // lead cell: nearest descending raga notes, ending on Sa (deg 0) exactly at the landing
      const above = T.scaleDegrees(raga, 'down', 1, 12).slice(0, 2);
      const leadDegs = above.concat([0]);
      for (let i = 0; i < leadDegs.length; i++) {
        events.push({ at: landing - (leadDegs.length - 1 - i), voice: 'lead', deg: leadDegs[i], vel: 0.8, exact: true });
      }
    }
    return events;
  };
})();

// ================================================================
// MUSIC.logic — pure game-state -> target derivation (05.3-02 task 1).
// Reads only its own arguments (a snapshot object, or a real GAME passed
// into snapshot()); never touches ctx/window/GAME/DATA directly, so it
// stays testable with plain object fixtures. D-02/D-05/D-06/D-07.
// ================================================================
(function () {
  const T = MUSIC.theory;
  const IN_RUN = { combat: 1, cleared: 1, choosing: 1, paused: 1 };

  function resolveRagaAndSa(snap) {
    const biomeId = snap.biomeId;
    if (biomeId && !T.RAGAS[biomeId] && !T.BIOME_RAGA[biomeId]) {
      // unknown biome id: fall back to a default raga (ragaFor's own
      // fallback), but prefer the caller-supplied droneHz for saHz since
      // the raga's own tuning has no relationship to an unknown biome.
      const raga = T.ragaFor(biomeId);
      const saHz = (snap.droneHz !== null && snap.droneHz !== undefined && isFinite(snap.droneHz)) ? snap.droneHz : raga.sa;
      return { raga, saHz };
    }
    const raga = T.ragaFor(biomeId || 'hub');
    return { raga, saHz: raga.sa };
  }

  function deriveForState(state, snap, dyn) {
    const L = MUSIC.logic;
    if (state === 'hub') {
      return { ragaId: 'yaman', saHz: T.RAGAS.yaman.sa, level: 0, mode: 'play', duck: false, lowHp: false };
    }
    const { raga, saHz } = resolveRagaAndSa(snap);
    let level, lowHp = false;
    if (snap.boss) {
      level = snap.bossPhase >= 2 ? 5 : 4;
    } else if (state === 'combat') {
      const heavy = snap.alive >= L.HEAVY_ENEMIES;
      lowHp = snap.hpFrac < L.LOW_HP;
      level = (heavy || lowHp) ? 3 : 2;
    } else {
      level = 1; // cleared / choosing / victory / anything else -> calm
    }
    level = L.capLevel(level, dyn);
    return { ragaId: raga.id, saHz, level, mode: 'play', duck: false, lowHp };
  }

  MUSIC.logic = {
    HEAVY_ENEMIES: 7,
    LOW_HP: 0.30,

    // defensive read-only snapshot of GAME (or any G-shaped object).
    snapshot(G) {
      const state = (G && typeof G.state === 'string') ? G.state : 'hub';
      const prePause = (G && G.prePause) ? G.prePause : null;
      const biome = G && G.biome;
      const biomeId = (biome && biome.id) ? biome.id : null;
      const droneHz = (biome && typeof biome.droneHz === 'number' && isFinite(biome.droneHz)) ? biome.droneHz : null;
      const bossRef = G && G.bossRef;
      const boss = !!(bossRef && !bossRef.dead) && state !== 'hub';
      const bossPhase = boss ? (Number(bossRef.phase) || 1) : 0;
      let alive = 0;
      if (G && Array.isArray(G.enemies)) {
        const list = G.enemies;
        const n = Math.min(list.length, 200);
        for (let i = 0; i < n; i++) {
          const e = list[i];
          if (e && !e.dead && !e.boss) alive++;
        }
      }
      const player = G && G.player;
      let hpFrac = 1;
      if (player) {
        const maxhp = Number(player.maxhp) || 0;
        const hp = Number(player.hp) || 0;
        hpFrac = maxhp > 0 ? hp / maxhp : 1;
        hpFrac = Math.max(0, Math.min(1, hpFrac));
      }
      const boonCount = (player && player.boonRanks) ? Object.keys(player.boonRanks).length : 0;
      const defiance = player ? (Number(player.defiance) || 0) : 0;
      return { state, prePause, biomeId, droneHz, boss, bossPhase, alive, hpFrac, boonCount, defiance };
    },

    capLevel(level, dyn) {
      if (level === 0) return 0;
      const d = Math.max(0, Math.min(1, dyn === undefined ? 1 : dyn));
      const cap = 1 + Math.round(4 * d);
      return Math.min(level, cap);
    },

    deriveTarget(snap, override, dyn) {
      const L = MUSIC.logic;
      dyn = dyn === undefined ? 1 : dyn;
      snap = snap || L.snapshot(null);
      if (override && (override.level !== undefined || override.raga)) {
        const raga = override.raga ? T.ragaFor(override.raga) : (snap.biomeId ? T.ragaFor(snap.biomeId) : T.RAGAS.yaman);
        const level = override.level !== undefined ? override.level : 0;
        return { ragaId: raga.id, saHz: raga.sa, level, mode: 'play', duck: false, lowHp: false };
      }
      if (snap.state === 'paused') {
        const inner = deriveForState(snap.prePause || 'combat', snap, dyn);
        return Object.assign({}, inner, { duck: true });
      }
      if (snap.state === 'dead') {
        const { raga, saHz } = resolveRagaAndSa(snap);
        return { ragaId: raga.id, saHz, level: 0, mode: 'elegy', duck: false, lowHp: false };
      }
      return deriveForState(snap.state, snap, dyn);
    },

    createGovernor(opts) {
      const downHoldSec = (opts && opts.downHoldSec) || 3;
      return {
        level: 0,
        _pendingLevel: null,
        _pendingHeld: 0,
        update(target, dt) {
          dt = dt || 0;
          if (target > this.level) {
            this.level = target;
            this._pendingLevel = null;
            this._pendingHeld = 0;
          } else if (target < this.level) {
            if (this._pendingLevel === target) this._pendingHeld += dt;
            else { this._pendingLevel = target; this._pendingHeld = dt; }
            if (this._pendingHeld >= downHoldSec) {
              this.level = target;
              this._pendingLevel = null;
              this._pendingHeld = 0;
            }
          } else {
            this._pendingLevel = null;
            this._pendingHeld = 0;
          }
          return this.level;
        },
        force(l) {
          this.level = l;
          this._pendingLevel = null;
          this._pendingHeld = 0;
        },
      };
    },

    // ordered transition-event detection between two snapshot()-shaped
    // objects. First call (prev===null) always returns [] so run start /
    // hub return never fires a false stinger.
    detectEvents(prev, cur) {
      if (!prev) return [];
      const out = [];
      if (prev.state !== 'dead' && cur.state === 'dead') out.push('death');
      if (prev.state !== 'victory' && cur.state === 'victory') out.push('victory');
      if (!prev.boss && cur.boss) out.push('bossIntro');
      if (prev.boss && cur.boss && prev.bossPhase < 2 && cur.bossPhase >= 2) out.push('bossPhase');
      if (prev.boss && !cur.boss && IN_RUN[prev.state] && IN_RUN[cur.state]) out.push('bossDefeated');
      if (prev.state === 'combat' && cur.state === 'cleared' && !prev.boss) out.push('roomClear');
      if (IN_RUN[prev.state] && IN_RUN[cur.state] && cur.boonCount > prev.boonCount) out.push('reward');
      if (IN_RUN[prev.state] && IN_RUN[cur.state] && cur.defiance < prev.defiance) out.push('revive');
      if (prev.biomeId && cur.biomeId && prev.biomeId !== cur.biomeId && cur.state !== 'hub') out.push('biomeChange');
      if (prev.state !== 'hub' && cur.state === 'hub') out.push('toHub');
      return out;
    },
  };
})();

// persistent-lead instrument presets (pure data, D-01/D-11).
MUSIC.theory.LEAD_PRESETS = {
  bansuri: { attack: 0.09, release: 0.18, vibRate: 5.2, vibCents: 12, vibDelay: 0.25, breath: 0.10, lpMul: 5, lpCap: 6000, formants: [], gain: 0.9, send: 0.35 },
  bowed: { attack: 0.15, release: 0.25, vibRate: 5.8, vibCents: 18, vibDelay: 0.2, breath: 0.02, lpMul: 8, lpCap: 5000, formants: [[750, 2, 6], [2200, 3, 4]], gain: 0.6, send: 0.3 },
  reed: { attack: 0.04, release: 0.12, vibRate: 6.2, vibCents: 22, vibDelay: 0.15, breath: 0.03, lpMul: 6, lpCap: 4500, formants: [[1200, 1.5, 5]], gain: 0.55, send: 0.25 },
};

// ================================================================
// MUSIC.dsp — pure Float32Array synthesis (05.3-02 task 2). Seeded via
// MUSIC.gen.rng only (no Math.random), no ctx. Every renderer returns a
// finite, click-free (fade-in/out), decaying buffer normalized to a
// consistent peak. D-01/D-04/D-11.
// ================================================================
(function () {
  const T = MUSIC.theory;

  // ---------------- shared utilities ----------------

  function normalize(buf, peak) {
    peak = peak === undefined ? 0.9 : peak;
    let max = 0;
    for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > max) max = a; }
    if (max < 1e-9) return buf;
    const g = peak / max;
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
    return buf;
  }

  function fade(buf, sr, inMs, outMs) {
    inMs = inMs === undefined ? 2 : inMs;
    outMs = outMs === undefined ? 40 : outMs;
    const n = buf.length;
    const ni = Math.max(1, Math.min(n, Math.round(sr * inMs / 1000)));
    const no = Math.max(1, Math.min(n, Math.round(sr * outMs / 1000)));
    for (let i = 0; i < ni; i++) buf[i] *= i / ni;
    // cubic (not linear) fade-out: attenuates far more steeply right at the
    // boundary so even a rising envelope (riser/swell) lands near-silent by
    // the very last samples without needing an unmusically long tail.
    for (let i = 0; i < no; i++) {
      const idx = n - 1 - i;
      if (idx < 0) break;
      const f = i / no;
      buf[idx] *= f * f * f;
    }
    return buf;
  }

  function dcBlock(buf, sr) {
    const R = 0.995;
    let xPrev = 0, yPrev = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i];
      const y = x - xPrev + R * yPrev;
      buf[i] = y;
      xPrev = x; yPrev = y;
    }
    return buf;
  }

  // rotating-phasor (coupled-form) sine generator: cheap replacement for
  // per-sample Math.sin(2*pi*hz*t) at a fixed frequency.
  function osc2(hz, sr) {
    const w = 2 * Math.PI * hz / sr;
    return {
      cosW: Math.cos(w), sinW: Math.sin(w), a: 1, b: 0,
      next() {
        const out = this.b;
        const na = this.a * this.cosW - this.b * this.sinW;
        const nb = this.a * this.sinW + this.b * this.cosW;
        this.a = na; this.b = nb;
        return out;
      },
    };
  }

  function finishBuf(buf, sr, inMs, outMs, peak) {
    dcBlock(buf, sr);
    fade(buf, sr, inMs, outMs);
    return normalize(buf, peak);
  }

  function hashKey(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // fold v into the octave range [lo, hi)
  function foldOctave(v, lo, hi) {
    let guard = 0;
    while (v < lo && guard++ < 32) v *= 2;
    guard = 0;
    while (v >= hi && guard++ < 32) v /= 2;
    return v;
  }

  // band-limit noise via a cascade of two one-pole filters (lowpass at hi,
  // then subtract a further lowpass at lo to carve out the low end). Unlike
  // a naive Chamberlin state-variable filter, this stays unconditionally
  // stable even when hi approaches Nyquist (needed for the bright 5-12kHz
  // metal/ta transients at a 32kHz render rate).
  function addNoiseTransient(out, sr, spec, rand) {
    const amp = spec.amp || 0, decay = Math.max(0.003, spec.decay || 0.01);
    const lo = Math.max(1, spec.lo || 200), hi = Math.max(lo + 1, Math.min(sr * 0.49, spec.hi || 4000));
    const n = out.length;
    const coefHi = 1 - Math.exp(-2 * Math.PI * hi / sr);
    const coefLo = 1 - Math.exp(-2 * Math.PI * lo / sr);
    let lpHi = 0, lpLo = 0;
    const span = Math.min(n, Math.ceil(sr * decay * 8));
    const r = Math.exp(-1 / (sr * decay));
    let env = amp;
    for (let i = 0; i < span; i++) {
      const x = rand() * 2 - 1;
      lpHi = lpHi + coefHi * (x - lpHi);
      lpLo = lpLo + coefLo * (lpHi - lpLo);
      const bp = lpHi - lpLo;
      out[i] += env * bp;
      env *= r;
    }
  }

  // ---------------- Karplus-Strong plucked/bowed-drone strings ----------------

  function ks(opts) {
    const hz = Math.max(20, opts.hz);
    const sr = opts.sr;
    const dur = opts.dur;
    const t60 = opts.t60 !== undefined ? opts.t60 : 1.4;
    const bright = opts.bright !== undefined ? opts.bright : 0.6;
    const jawari = opts.jawari || 0;
    const pickPos = opts.pickPos !== undefined ? opts.pickPos : 0.13;
    const rand = MUSIC.gen.rng(((opts.seed >>> 0) || 1));

    // classic Karplus-Strong tuning: the 2-point averaging loop filter below
    // contributes ~0.5 sample of its own delay, so round the *remaining*
    // delay-line length to the nearest integer rather than truncating —
    // keeps every note within a few cents even without a fractional-delay
    // allpass (which, empirically, actually hurt precision here for large
    // fractional remainders near 1.0).
    const D = sr / hz;
    // the +1 corrects for this implementation's read-then-write ordering
    // (output taps the delay line before the averaging filter's feedback
    // is written back into that same slot, effectively shortening the
    // measured loop period by one sample vs. the naive N+0.5 estimate).
    const N = Math.max(2, Math.round(D - 0.5) + 1);

    // seeded noise excitation -> one-pole lowpass (bright controls cutoff)
    const lpCoef = Math.max(0.02, Math.min(0.98, 1 - bright));
    let lpPrev = 0;
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const n = rand() * 2 - 1;
      lpPrev = lpPrev + lpCoef * (n - lpPrev);
      raw[i] = lpPrev;
    }
    // pick-position comb
    const pickDelay = Math.max(1, Math.round(N * pickPos));
    const line = new Float32Array(N);
    for (let i = 0; i < N; i++) line[i] = raw[i] - raw[(i - pickDelay + N) % N] * 0.5;

    const len = Math.max(1, Math.round(sr * dur));
    const out = new Float32Array(len);
    const g = Math.pow(10, -3 / (hz * Math.max(0.05, t60)));

    let readIdx = 0;
    for (let n = 0; n < len; n++) {
      const s0 = line[readIdx];
      const s1 = line[(readIdx + 1) % N];
      const avg = 0.5 * (s0 + s1) * g;
      line[readIdx] = avg;
      out[n] = s0;
      readIdx = (readIdx + 1) % N;
    }

    if (jawari) {
      for (let n = 0; n < len; n++) { const y = out[n]; out[n] = y + jawari * 0.6 * y * Math.abs(y); }
    }
    return finishBuf(out, sr, 2, 40, 0.9);
  }

  function tanpura(hz, sr, seed) { return ks({ hz, sr, dur: 4.5, t60: 6, bright: 0.5, jawari: 0.55, seed }); }
  function swarm(hz, sr, seed) { return ks({ hz, sr, dur: 1.2, t60: 1.0, bright: 0.9, jawari: 0, seed }); }

  // ---------------- damped-partial membrane percussion ----------------

  // partials: [[ratio, amp, decay], ...]; bend: {from, to, time} | null (in Hz, applies to ratio 1 fundamental relationship)
  function membraneTonal(sr, dur, f0, partials, bend) {
    const len = Math.max(1, Math.round(sr * dur));
    const out = new Float32Array(len);
    for (let p = 0; p < partials.length; p++) {
      const ratio = partials[p][0], amp = partials[p][1], decay = Math.max(0.01, partials[p][2]);
      // recursive exponential decay (env *= r each sample) instead of a
      // per-sample Math.exp(-t/decay) call — a large hot-loop cost win.
      const r = Math.exp(-1 / (sr * decay));
      let env = amp;
      if (bend) {
        // frequency varies continuously only during bend.time -> Math.sin
        // per sample is unavoidable there, but once the bend settles the
        // frequency is exactly bend.to*ratio, so switch to the cheap
        // fixed-frequency phasor recurrence for the (usually much longer)
        // remainder of the note.
        const bendSamples = Math.min(len, Math.ceil(sr * bend.time));
        let phase = 0, n = 0;
        for (; n < bendSamples; n++) {
          const t = n / sr;
          const bt = Math.min(1, t / Math.max(0.001, bend.time));
          const freq = (bend.from * Math.pow(bend.to / bend.from, bt)) * ratio;
          phase += 2 * Math.PI * freq / sr;
          out[n] += env * Math.sin(phase);
          env *= r;
        }
        if (n < len) {
          const freq = bend.to * ratio;
          const w = 2 * Math.PI * freq / sr;
          const cosW = Math.cos(w), sinW = Math.sin(w);
          let a = Math.cos(phase), b = Math.sin(phase);
          for (; n < len; n++) {
            out[n] += env * b;
            const na = a * cosW - b * sinW, nb = a * sinW + b * cosW;
            a = na; b = nb;
            env *= r;
          }
        }
      } else {
        // fixed frequency -> rotating-phasor recurrence, no Math.sin at all.
        const freq = f0 * ratio;
        const w = 2 * Math.PI * freq / sr;
        const cosW = Math.cos(w), sinW = Math.sin(w);
        let a = 1, b = 0;
        for (let n = 0; n < len; n++) {
          out[n] += env * b;
          const na = a * cosW - b * sinW, nb = a * sinW + b * cosW;
          a = na; b = nb;
          env *= r;
        }
      }
    }
    return out;
  }

  function dayanHz(sa) { return T.dayanHz(sa); }
  function bayanHz(sa) { return foldOctave(sa, 70, 110); }

  const BOL_GAIN = { Dha: 1, Dhin: 1, Na: 0.8, Ta: 0.85, Tin: 0.75, Tun: 0.8, Ge: 0.9, Ke: 0.6, Te: 0.5, Re: 0.45 };

  function mixDown(buffers, weights) {
    let len = 0;
    for (const b of buffers) len = Math.max(len, b.length);
    const out = new Float32Array(len);
    for (let i = 0; i < buffers.length; i++) {
      const b = buffers[i], w = weights ? weights[i] : 1;
      for (let n = 0; n < b.length; n++) out[n] += b[n] * w;
    }
    return out;
  }

  function bol(key, kit, saHz, sr, seed) {
    const rand = MUSIC.gen.rng(((seed >>> 0) || 1));
    const fd = dayanHz(saHz);
    const fb = bayanHz(saHz);
    const isPakhawaj = kit === 'pakhawaj';

    if (key === 'Dha') return finishBuf(mixDown([bol('Na', kit, saHz, sr, seed), bol('Ge', kit, saHz, sr, seed + 1)], [0.65, 0.65]), sr, 2, 40, 0.9);
    if (key === 'Dhin') return finishBuf(mixDown([bol('Tin', kit, saHz, sr, seed), bol('Ge', kit, saHz, sr, seed + 1)], [0.65, 0.65]), sr, 2, 40, 0.9);

    let out, noiseSpec = null;
    switch (key) {
      case 'Na':
        out = membraneTonal(sr, 0.5, fd, [[1, 1, 0.12], [2, 0.6, 0.09], [3, 0.45, 0.07], [4, 0.3, 0.05], [5, 0.15, 0.04]], null);
        noiseSpec = { amp: 0.25, decay: 0.012, lo: 3000, hi: 6000 };
        break;
      case 'Ta':
        out = membraneTonal(sr, 0.45, fd, [[1, 1, 0.10], [2, 0.84, 0.075], [3, 0.63, 0.06], [4, 0.42, 0.045], [5, 0.21, 0.035]], null);
        noiseSpec = { amp: 0.25, decay: 0.012, lo: 3000, hi: 6000 };
        break;
      case 'Tin':
        out = membraneTonal(sr, 0.6, fd, [[1, 1, 0.15], [2, 0.35, 0.10], [3, 0.2, 0.07]], null);
        noiseSpec = { amp: 0.12, decay: 0.01, lo: 2500, hi: 5500 };
        break;
      case 'Tun':
        out = membraneTonal(sr, 0.9, fd, [[1, 1, 0.22], [2, 0.2, 0.14]], null);
        noiseSpec = { amp: 0.08, decay: 0.008, lo: 2000, hi: 5000 };
        break;
      case 'Te':
        out = membraneTonal(sr, 0.15, fd * 1.15, [[1, 0.4, 0.035], [2.3, 0.3, 0.025]], null);
        noiseSpec = { amp: 0.5, decay: 0.02, lo: 1500, hi: 4000 };
        break;
      case 'Re':
        out = membraneTonal(sr, 0.12, fd * 1.05, [[1, 0.25, 0.028], [2.3, 0.18, 0.02]], null);
        noiseSpec = { amp: 0.3, decay: 0.015, lo: 1200, hi: 3200 };
        break;
      case 'Ge':
        if (isPakhawaj) {
          out = membraneTonal(sr, 0.9, fb * 0.9, [[1, 1, 0.22]], null);
          noiseSpec = { amp: 0.15, decay: 0.05, lo: 60, hi: 220 };
        } else {
          out = membraneTonal(sr, 0.55, fb, [[1, 1, 0.13]], { from: fb, to: fb * 1.25, time: 0.15 });
          noiseSpec = { amp: 0.06, decay: 0.02, lo: 80, hi: 260 };
        }
        break;
      case 'Ke':
        out = membraneTonal(sr, 0.2, fb * 1.2, [[1, 0.5, 0.05]], null);
        noiseSpec = { amp: 1, decay: 0.04, lo: 400, hi: 800 };
        break;
      default:
        out = membraneTonal(sr, 0.3, fd, [[1, 0.5, 0.1]], null);
    }
    if (noiseSpec) addNoiseTransient(out, sr, noiseSpec, rand);
    return finishBuf(out, sr, 2, 40, 0.9);
  }

  function bigDrum(kind, saHz, sr, seed) {
    const rand = MUSIC.gen.rng(((seed >>> 0) || 1));
    const fn = foldOctave(saHz / 2, 40, 65);
    let out;
    switch (kind) {
      case 'nagara':
        out = membraneTonal(sr, 2.0, fn, [[1, 1, 0.5], [2, 0.3, 0.32]], { from: fn * 2.2, to: fn, time: 0.18 });
        addNoiseTransient(out, sr, { amp: 0.5, decay: 0.2, lo: 80, hi: 400 }, rand);
        addNoiseTransient(out, sr, { amp: 0.3, decay: 0.004, lo: 2000, hi: 8000 }, rand);
        break;
      case 'dhol':
        out = membraneTonal(sr, 0.9, fn * 2, [[1, 1, 0.2]], { from: fn * 2 * 1.6, to: fn * 2, time: 0.08 });
        addNoiseTransient(out, sr, { amp: 0.4, decay: 0.06, lo: 100, hi: 500 }, rand);
        break;
      case 'dholHi':
        out = membraneTonal(sr, 0.25, 700, [[1, 0.4, 0.05]], null);
        addNoiseTransient(out, sr, { amp: 0.6, decay: 0.035, lo: 1500, hi: 5000 }, rand);
        break;
      case 'sub': {
        const dur = 2.2, len = Math.max(1, Math.round(sr * dur));
        out = new Float32Array(len);
        const attackN = Math.max(1, Math.round(sr * 0.005));
        const r = Math.exp(-1 / (sr * 0.45));
        let env = 1;
        const w1 = 2 * Math.PI * fn / sr, w2 = 2 * Math.PI * fn * 2 / sr;
        const c1 = Math.cos(w1), s1 = Math.sin(w1), c2 = Math.cos(w2), s2 = Math.sin(w2);
        let a1 = 1, b1 = 0, a2 = 1, b2 = 0;
        for (let n = 0; n < len; n++) {
          const a = n < attackN ? n / attackN : env;
          out[n] = a * (b1 + 0.35 * b2);
          const na1 = a1 * c1 - b1 * s1, nb1 = a1 * s1 + b1 * c1; a1 = na1; b1 = nb1;
          const na2 = a2 * c2 - b2 * s2, nb2 = a2 * s2 + b2 * c2; a2 = na2; b2 = nb2;
          if (n >= attackN) env *= r;
        }
        break;
      }
      default:
        out = new Float32Array(Math.round(sr * 0.2));
    }
    return finishBuf(out, sr, 2, 60, 0.9);
  }

  function metal(kind, sr, seed) {
    const rand = MUSIC.gen.rng(((seed >>> 0) || 1));
    const ratios = [1, 1.47, 2.09, 2.56, 3.21, 4.13];
    const base = 2400;
    const isChing = kind === 'ching';
    const dur = isChing ? 1.2 : 0.15;
    const decayHi = isChing ? 0.35 : 0.045;
    const decayLo = isChing ? 0.12 : 0.015;
    const partials = ratios.map((r, i) => [r, 1 / (i + 1), decayHi - (decayHi - decayLo) * (i / (ratios.length - 1))]);
    const out = membraneTonal(sr, dur, base, partials, null);
    addNoiseTransient(out, sr, { amp: isChing ? 0.2 : 0.5, decay: isChing ? 0.01 : 0.02, lo: 5000, hi: 12000 }, rand);
    return finishBuf(out, sr, 1, isChing ? 60 : 20, 0.9);
  }

  function bell(saHz, sr) {
    const base = foldOctave(saHz * 8, 600, 1200);
    const ratios = [0.5, 1, 2, 3, 4.2, 5.4];
    const amps = [0.5, 1, 0.35, 0.2, 0.12, 0.08];
    const decays = [1.2, 1.0, 0.8, 0.6, 0.45, 0.35];
    const dur = 4;
    const len = Math.max(1, Math.round(sr * dur));
    const out = new Float32Array(len);
    for (let i = 0; i < ratios.length; i++) {
      const f1 = base * ratios[i], f2 = f1 + 0.8, amp = amps[i], decay = decays[i];
      const w1 = 2 * Math.PI * f1 / sr, w2 = 2 * Math.PI * f2 / sr;
      const c1 = Math.cos(w1), s1 = Math.sin(w1), c2 = Math.cos(w2), s2 = Math.sin(w2);
      let a1 = 1, b1 = 0, a2 = 1, b2 = 0;
      const r = Math.exp(-1 / (sr * decay));
      let env = amp * 0.5;
      for (let n = 0; n < len; n++) {
        out[n] += env * (b1 + b2);
        const na1 = a1 * c1 - b1 * s1, nb1 = a1 * s1 + b1 * c1; a1 = na1; b1 = nb1;
        const na2 = a2 * c2 - b2 * s2, nb2 = a2 * s2 + b2 * c2; a2 = na2; b2 = nb2;
        env *= r;
      }
    }
    return finishBuf(out, sr, 3, 80, 0.9);
  }

  function formantWeight(freq) {
    function gauss(f, c, w) { const d = (f - c) / w; return Math.exp(-0.5 * d * d); }
    return 0.15 + gauss(freq, 800, 120) + gauss(freq, 1150, 150) + gauss(freq, 2900, 300);
  }

  function stab(raga, saHz, sr) {
    const leadMul = raga.leadMul || 2;
    const rootHz = saHz * leadMul;
    const degs = [0, raga.droneFirst || 7, 12];
    const dur = 1.6;
    const len = Math.max(1, Math.round(sr * dur));
    const out = new Float32Array(len);
    const detunesCents = [-6, 0, 6];
    const envArr = new Float32Array(len);
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      const attack = Math.min(1, t / 0.015);
      const decayEnv = t < 0.3 ? 1 - 0.5 * (t / 0.3) : 0.5 * Math.exp(-(t - 0.3) / 0.22);
      envArr[n] = attack * decayEnv;
    }
    for (const deg of degs) {
      const f0 = rootHz * Math.pow(2, deg / 12);
      for (const cents of detunesCents) {
        const freq = f0 * Math.pow(2, cents / 1200);
        for (let h = 1; h <= 20; h++) {
          const hf = freq * h;
          if (hf > sr * 0.45) break;
          const amp = (1 / h) * formantWeight(hf) / (detunesCents.length * degs.length);
          if (amp < 0.0025) continue;
          const w = 2 * Math.PI * hf / sr;
          const cosW = Math.cos(w), sinW = Math.sin(w);
          let a = 1, b = 0;
          for (let n = 0; n < len; n++) {
            out[n] += amp * envArr[n] * b;
            const na = a * cosW - b * sinW, nb = a * sinW + b * cosW;
            a = na; b = nb;
          }
        }
      }
    }
    return finishBuf(out, sr, 2, 60, 0.9);
  }

  function riser(saHz, sr, dur) {
    dur = dur === undefined ? 2.6 : dur;
    const len = Math.max(1, Math.round(sr * dur));
    const out = new Float32Array(len);
    const rand = MUSIC.gen.rng(777);
    // both sweeps update their frequency-derived coefficients only once per
    // BLOCK samples (a slow multi-second sweep is inaudibly different from
    // a piecewise-constant approximation at this block size) instead of
    // paying a Math.pow+Math.sin/cos per sample.
    const BLOCK = 128;
    let low = 0, band = 0;
    for (let start = 0; start < len; start += BLOCK) {
      const end = Math.min(len, start + BLOCK);
      const fracMid = ((start + end) / 2 / sr) / dur;
      const freq = 300 * Math.pow(6000 / 300, fracMid);
      const f = 2 * Math.sin(Math.PI * Math.min(0.49, freq / sr));
      const q = 1 / 3;
      for (let n = start; n < end; n++) {
        const frac = (n / sr) / dur;
        const x = rand() * 2 - 1;
        const high = x - low - q * band;
        band += f * high;
        low += f * band;
        out[n] += 0.6 * frac * frac * band;
      }
    }
    let phase = 0;
    for (let start = 0; start < len; start += BLOCK) {
      const end = Math.min(len, start + BLOCK);
      const fracMid = ((start + end) / 2 / sr) / dur;
      const freq = saHz * 2 * Math.pow(4, fracMid);
      const w = 2 * Math.PI * freq / sr;
      const cosW = Math.cos(w), sinW = Math.sin(w);
      let a = Math.cos(phase), b = Math.sin(phase);
      for (let n = start; n < end; n++) {
        const frac = (n / sr) / dur;
        out[n] += 0.5 * frac * frac * b;
        const na = a * cosW - b * sinW, nb = a * sinW + b * cosW;
        a = na; b = nb;
        phase += w;
      }
    }
    dcBlock(out, sr);
    fade(out, sr, 5, 60);
    return normalize(out, 0.9);
  }

  function swell(sr, dur) {
    dur = dur === undefined ? 1.6 : dur;
    const len = Math.max(1, Math.round(sr * dur));
    const out = new Float32Array(len);
    const rand = MUSIC.gen.rng(555);
    let xPrev = 0, yPrev = 0;
    const R = 0.995;
    for (let n = 0; n < len; n++) {
      const x = rand() * 2 - 1;
      const y = x - xPrev + R * yPrev;
      xPrev = x; yPrev = y;
      const t = n / sr, frac = t / dur;
      const env = Math.exp(3 * (frac - 1));
      out[n] = 0.8 * env * y;
    }
    fade(out, sr, 3, 45);
    return normalize(out, 0.9);
  }

  function impulse(sr, seconds, seed) {
    seconds = seconds === undefined ? 2.4 : seconds;
    const len = Math.max(1, Math.round(sr * seconds));
    const baseSeed = (seed >>> 0) || 9999;
    function buildChannel(chSeed) {
      const r = MUSIC.gen.rng(chSeed);
      const out = new Float32Array(len);
      const predelaySamples = Math.round(sr * 0.02);
      const reflectTimes = [0.02, 0.03, 0.045, 0.055, 0.07, 0.08];
      for (const rt of reflectTimes) {
        const idx = Math.round(sr * rt);
        if (idx < len) out[idx] += (r() * 2 - 1) * 0.4;
      }
      let lp = 0;
      for (let n = predelaySamples; n < len; n++) {
        const t = n / sr;
        const noise = r() * 2 - 1;
        const coef = 0.1 + 0.75 * Math.min(1, t / seconds);
        lp = lp + coef * (noise - lp);
        const env = Math.exp(-6.9 * t / seconds);
        out[n] += lp * env;
      }
      return out;
    }
    const L = buildChannel(baseSeed + 1);
    const R = buildChannel(baseSeed + 2);
    finishBuf(L, sr, 5, 20, 0.9);
    finishBuf(R, sr, 5, 20, 0.9);
    return [L, R];
  }

  function leadWave(id) {
    const tables = {
      bansuri: [0, 1, 0.18, 0.06, 0.02, 0.01],
      sub: [0, 1, 0.35],
    };
    let imagArr;
    if (id === 'bowed') {
      imagArr = [0];
      for (let k = 1; k <= 24; k++) imagArr.push(1 / Math.pow(k, 1.1));
    } else if (id === 'reed') {
      imagArr = [0, 1, 0.9, 0.75, 0.6, 0.45, 0.3, 0.2, 0.12, 0.08, 0.05];
    } else {
      imagArr = tables[id] || tables.bansuri;
    }
    const n = imagArr.length;
    const real = new Float32Array(n);
    const imag = new Float32Array(imagArr);
    return { real, imag };
  }

  // ---------------- bank spec / job dispatch ----------------

  function bankSpec(raga) {
    const jobs = [];
    for (const k of T.TABLA_KEYS) jobs.push({ key: 't:' + k, kind: 'bol', args: { bolKey: k, kit: raga.kit, saHz: raga.sa } });
    for (const k of T.BIG_KEYS) jobs.push({ key: 'b:' + k, kind: 'bigDrum', args: { kind: k, saHz: raga.sa } });
    for (const k of T.METAL_KEYS) jobs.push({ key: 'm:' + k, kind: 'metal', args: { kind: k } });
    jobs.push({ key: 'f:riser', kind: 'fx', args: { kind: 'riser', saHz: raga.sa } });
    jobs.push({ key: 'f:swell', kind: 'fx', args: { kind: 'swell' } });
    jobs.push({ key: 'f:stab', kind: 'fx', args: { kind: 'stab', raga, saHz: raga.sa } });
    jobs.push({ key: 'f:bell', kind: 'fx', args: { kind: 'bell', saHz: raga.sa } });
    const tanDegs = {};
    for (const c of MUSIC.gen.tanpuraCycle(raga, false)) tanDegs[c.deg] = true;
    for (const c of MUSIC.gen.tanpuraCycle(raga, true)) tanDegs[c.deg] = true;
    for (const d of Object.keys(tanDegs)) jobs.push({ key: 'd:' + d, kind: 'tanpura', args: { hz: T.semiToHz(raga.sa, Number(d)) } });
    for (let d = -12; d <= 24; d++) {
      if (raga.notes.indexOf(T.pc(d)) !== -1) jobs.push({ key: 'p:' + d, kind: 'pluck', args: { hz: T.semiToHz(raga.sa * raga.pluckMul, d) } });
    }
    return jobs;
  }

  function renderJob(job, sr) {
    const seed = hashKey(job.key);
    switch (job.kind) {
      case 'bol': return bol(job.args.bolKey, job.args.kit, job.args.saHz, sr, seed);
      case 'bigDrum': return bigDrum(job.args.kind, job.args.saHz, sr, seed);
      case 'metal': return metal(job.args.kind, sr, seed);
      case 'tanpura': return tanpura(job.args.hz, sr, seed);
      case 'pluck': return ks({ hz: job.args.hz, sr, dur: 1.6, t60: 1.4, bright: 0.7, jawari: 0.25, seed });
      case 'fx':
        if (job.args.kind === 'riser') return riser(job.args.saHz, sr);
        if (job.args.kind === 'swell') return swell(sr);
        if (job.args.kind === 'stab') return stab(job.args.raga, job.args.saHz, sr);
        if (job.args.kind === 'bell') return bell(job.args.saHz, sr);
        break;
    }
    return new Float32Array(1);
  }

  MUSIC.dsp = {
    normalize, fade, dcBlock, osc2,
    ks, tanpura, swarm,
    membraneTonal, bol, bigDrum, metal, bell, stab, riser, swell, impulse, leadWave,
    bankSpec, renderJob,
    BOL_GAIN,
  };
})();

// ================================================================
// Web Audio engine (05.3-02 task 3): bus graph, sample banks, voice-
// capped one-shots, and the persistent monophonic lead. Every method
// here is a no-op (returns early) when MUSIC.ctx is null, so this stays
// fully inert until AUDIO.init() calls MUSIC.attach() with a real ctx
// (not wired up until 05.3-03 — the shipped game is unchanged so far).
// D-01/D-11/D-15/D-16.
// ================================================================
(function () {
  MUSIC.RENDER_SR_MAX = 32000;
  MUSIC.MIX = { drone: 0.55, sub: 0.5, lead: 0.5, pluck: 0.4, tabla: 0.6, big: 0.7, metal: 0.18, fx: 0.6 };
  MUSIC.SENDS = { drone: 0.25, sub: 0, lead: 0.35, pluck: 0.3, tabla: 0.15, big: 0.12, metal: 0.3, fx: 0.4 };
  MUSIC.CAPS = { total: 28, tabla: 6, big: 4, metal: 4, pluck: 8, drone: 6, fx: 4 };
  MUSIC.OUTPUT_TRIM = 1.0;
  MUSIC.stats = {
    ticks: 0, avgTickMs: 0, maxTickMs: 0, renderMs: 0, pendingJobs: 0,
    active: 0, peakActive: 0, dropped: 0, syncRenders: 0, late: 0,
  };

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function foldRange(v, lo, hi) {
    let guard = 0;
    while (v < lo && guard++ < 32) v *= 2;
    guard = 0;
    while (v >= hi && guard++ < 32) v /= 2;
    return v;
  }

  MUSIC.attach = function (audio) {
    if (!audio || !audio.ctx || this.ctx) return false;
    this.audio = audio;
    this.ctx = audio.ctx;
    this.sr = Math.min(audio.ctx.sampleRate, MUSIC.RENDER_SR_MAX);
    this.running = false;
    this._activeCounts = {};
    this._banks = {};
    this._bankOrder = [];
    this._droneAlt = false;
    this._buildGraph();
    this._initLead();
    this._initPads();
    this.setRaga('yaman');
    return true;
  };

  MUSIC.detach = function () {
    if (!this.ctx) return;
    try {
      for (const s of Object.keys(this.nodes.stems)) this.nodes.stems[s].disconnect();
      this.nodes.trim.disconnect();
    } catch (e) { /* mock/real nodes may not all support disconnect args, ignore */ }
    this.ctx = null; this.audio = null; this.nodes = null; this.lead = null; this.pads = null;
    this._banks = {}; this._bankOrder = [];
    this.running = false;
  };

  // ---------------- bus graph ----------------

  MUSIC._buildGraph = function () {
    const ctx = this.ctx;
    const T = MUSIC.theory;
    const nodes = { stems: {}, sends: {}, panners: {}, stemInputs: {} };

    const mix = ctx.createGain(); mix.gain.value = 1;
    const reverbIn = ctx.createGain(); reverbIn.gain.value = 1;
    const convolver = ctx.createConvolver();
    const irArr = MUSIC.dsp.impulse(this.sr, 2.4, 1);
    const irBuf = ctx.createBuffer(2, irArr[0].length, this.sr);
    irBuf.getChannelData(0).set(irArr[0]);
    irBuf.getChannelData(1).set(irArr[1]);
    convolver.buffer = irBuf;
    convolver.normalize = true;
    const reverbReturn = ctx.createGain(); reverbReturn.gain.value = 0.8;
    reverbIn.connect(convolver); convolver.connect(reverbReturn); reverbReturn.connect(mix);

    const stemNames = T.STEM_NAMES.concat(['fx']);
    for (const s of stemNames) {
      const g = ctx.createGain();
      g.gain.value = s === 'fx' ? MUSIC.MIX.fx : 0;
      let input = g;
      if (s === 'pluck' || s === 'tabla' || s === 'metal') {
        const pan = ctx.createStereoPanner();
        pan.pan.value = s === 'pluck' ? -0.2 : s === 'tabla' ? 0.15 : 0.3;
        pan.connect(g);
        input = pan;
        nodes.panners[s] = pan;
      }
      g.connect(mix);
      const send = ctx.createGain(); send.gain.value = MUSIC.SENDS[s] || 0;
      g.connect(send); send.connect(reverbIn);
      nodes.stems[s] = g;
      nodes.sends[s] = send;
      nodes.stemInputs[s] = input;
      if (s === 'drone') {
        const panL = ctx.createStereoPanner(); panL.pan.value = -0.35; panL.connect(g);
        const panR = ctx.createStereoPanner(); panR.pan.value = 0.35; panR.connect(g);
        nodes.panners.droneL = panL; nodes.panners.droneR = panR;
      }
    }

    const duckLP = ctx.createBiquadFilter(); duckLP.type = 'lowpass'; duckLP.frequency.value = 18000; duckLP.Q.value = 0.7;
    const duckGain = ctx.createGain(); duckGain.gain.value = 1;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18; glue.knee.value = 12; glue.ratio.value = 2.5; glue.attack.value = 0.012; glue.release.value = 0.25;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
    const trim = ctx.createGain(); trim.gain.value = MUSIC.OUTPUT_TRIM;

    mix.connect(duckLP); duckLP.connect(duckGain); duckGain.connect(glue); glue.connect(limiter); limiter.connect(trim);
    trim.connect(this.audio.musicGain);

    nodes.mix = mix; nodes.reverbIn = reverbIn; nodes.convolver = convolver; nodes.reverbReturn = reverbReturn;
    nodes.duckLP = duckLP; nodes.duckGain = duckGain; nodes.glue = glue; nodes.limiter = limiter; nodes.trim = trim;
    this.nodes = nodes;
  };

  // ---------------- sample banks ----------------

  MUSIC._toAudioBuffer = function (arr) {
    if (Array.isArray(arr)) {
      const buf = this.ctx.createBuffer(arr.length, arr[0].length, this.sr);
      for (let i = 0; i < arr.length; i++) buf.getChannelData(i).set(arr[i]);
      return buf;
    }
    const buf = this.ctx.createBuffer(1, arr.length, this.sr);
    buf.getChannelData(0).set(arr);
    return buf;
  };

  MUSIC._ensureBank = function (ragaId) {
    if (this._banks[ragaId]) return this._banks[ragaId];
    const raga = MUSIC.theory.RAGAS[ragaId];
    const jobs = MUSIC.dsp.bankSpec(raga);
    const bank = { jobs, buffers: new Map(), idx: 0, done: false };
    this._banks[ragaId] = bank;
    this._bankOrder.push(ragaId);
    while (this._bankOrder.length > 2) {
      let evictIdx = -1;
      for (let i = 0; i < this._bankOrder.length; i++) {
        const id = this._bankOrder[i];
        if (id !== ragaId && id !== 'yaman') { evictIdx = i; break; }
      }
      if (evictIdx === -1) break;
      delete this._banks[this._bankOrder[evictIdx]];
      this._bankOrder.splice(evictIdx, 1);
    }
    return bank;
  };

  MUSIC._renderSlice = function (budgetMs) {
    if (!this.ctx) return;
    budgetMs = budgetMs === undefined ? 4 : budgetMs;
    const bank = this._banks[this.raga];
    if (!bank || bank.done) return;
    const t0 = now();
    while (bank.idx < bank.jobs.length) {
      if (now() - t0 >= budgetMs) { MUSIC.stats.pendingJobs = bank.jobs.length - bank.idx; return; }
      const job = bank.jobs[bank.idx++];
      if (!bank.buffers.has(job.key)) {
        const arr = MUSIC.dsp.renderJob(job, this.sr);
        bank.buffers.set(job.key, this._toAudioBuffer(arr));
      }
    }
    bank.done = true;
    MUSIC.stats.pendingJobs = 0;
  };

  MUSIC._buffer = function (key) {
    const bank = this._banks[this.raga];
    if (!bank) return null;
    if (bank.buffers.has(key)) return bank.buffers.get(key);
    let job = null;
    for (let i = 0; i < bank.jobs.length; i++) if (bank.jobs[i].key === key) { job = bank.jobs[i]; break; }
    if (!job) return null;
    MUSIC.stats.syncRenders++;
    const arr = MUSIC.dsp.renderJob(job, this.sr);
    const buf = this._toAudioBuffer(arr);
    bank.buffers.set(key, buf);
    return buf;
  };

  // ---------------- voice-capped one-shots ----------------

  MUSIC.playOneShot = function (stem, key, t, vel, opts) {
    if (!this.ctx) return false;
    opts = opts || {};
    const capStem = MUSIC.CAPS[stem] !== undefined ? MUSIC.CAPS[stem] : 4;
    this._activeCounts[stem] = this._activeCounts[stem] || 0;
    if (this._activeCounts[stem] >= capStem || MUSIC.stats.active >= MUSIC.CAPS.total) {
      MUSIC.stats.dropped++;
      return false;
    }
    const buf = this._buffer(key);
    if (!buf) { MUSIC.stats.dropped++; return false; }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const g = this.ctx.createGain();
    const bolKey = key.indexOf('t:') === 0 ? key.slice(2) : null;
    const bolGain = (bolKey && MUSIC.dsp.BOL_GAIN[bolKey] !== undefined) ? MUSIC.dsp.BOL_GAIN[bolKey] : 1;
    g.gain.value = Math.max(0.0001, vel * bolGain);

    let target = this.nodes.stemInputs[stem];
    if (stem === 'drone' && key.indexOf('d:') === 0) {
      this._droneAlt = !this._droneAlt;
      target = this._droneAlt ? this.nodes.panners.droneL : this.nodes.panners.droneR;
    }
    src.connect(g); g.connect(target);

    const startAt = Math.max(t, this.ctx.currentTime);
    src.start(startAt);
    this._activeCounts[stem]++;
    MUSIC.stats.active++;
    MUSIC.stats.peakActive = Math.max(MUSIC.stats.peakActive, MUSIC.stats.active);
    const self = this;
    src.onended = function () {
      self._activeCounts[stem] = Math.max(0, self._activeCounts[stem] - 1);
      MUSIC.stats.active = Math.max(0, MUSIC.stats.active - 1);
      try { src.disconnect(); g.disconnect(); } catch (e) { /* ignore */ }
    };
    return true;
  };

  // ---------------- persistent monophonic lead ----------------

  MUSIC._initLead = function () {
    const ctx = this.ctx;
    const wave = MUSIC.dsp.leadWave('bansuri');
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(ctx.createPeriodicWave(wave.real, wave.imag));
    osc.start(0);

    const filt1 = ctx.createBiquadFilter(); filt1.type = 'peaking'; filt1.frequency.value = 750; filt1.Q.value = 2; filt1.gain.value = 0;
    const filt2 = ctx.createBiquadFilter(); filt2.type = 'peaking'; filt2.frequency.value = 2200; filt2.Q.value = 2; filt2.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000; lp.Q.value = 0.5;
    const amp = ctx.createGain(); amp.gain.value = 0;
    osc.connect(filt1); filt1.connect(filt2); filt2.connect(lp); lp.connect(amp); amp.connect(this.nodes.stemInputs.lead);

    const breathLen = Math.max(1, Math.round(this.sr * 1));
    const breathBuf = ctx.createBuffer(1, breathLen, this.sr);
    { const d = breathBuf.getChannelData(0); const rand = MUSIC.gen.rng(4242); for (let i = 0; i < breathLen; i++) d[i] = rand() * 2 - 1; }
    const breathSrc = ctx.createBufferSource(); breathSrc.buffer = breathBuf; breathSrc.loop = true; breathSrc.start(0);
    const breathBp = ctx.createBiquadFilter(); breathBp.type = 'bandpass'; breathBp.frequency.value = 2000; breathBp.Q.value = 1.5;
    const breathAmp = ctx.createGain(); breathAmp.gain.value = 0;
    breathSrc.connect(breathBp); breathBp.connect(breathAmp); breathAmp.connect(this.nodes.stemInputs.lead);

    const vibLfo = ctx.createOscillator(); vibLfo.frequency.value = 5.2; vibLfo.start(0);
    const vibGain = ctx.createGain(); vibGain.gain.value = 0;
    vibLfo.connect(vibGain); vibGain.connect(osc.detune);

    this.lead = {
      osc, filt1, filt2, lp, amp, breathSrc, breathBp, breathAmp, vibLfo, vibGain,
      preset: MUSIC.theory.LEAD_PRESETS.bansuri, presetId: 'bansuri', prevHz: null,
    };
  };

  MUSIC._applyLeadPreset = function (id) {
    const preset = MUSIC.theory.LEAD_PRESETS[id] || MUSIC.theory.LEAD_PRESETS.bansuri;
    const wave = MUSIC.dsp.leadWave(id);
    this.lead.osc.setPeriodicWave(this.ctx.createPeriodicWave(wave.real, wave.imag));
    this.lead.preset = preset;
    this.lead.presetId = id;
    this.lead.vibLfo.frequency.value = preset.vibRate;
    const f = preset.formants || [];
    if (f[0]) { this.lead.filt1.frequency.value = f[0][0]; this.lead.filt1.gain.value = 0; }
    if (f[1]) { this.lead.filt2.frequency.value = f[1][0]; this.lead.filt2.gain.value = 0; }
  };

  MUSIC.ANDOLAN_MIN_SEC = 0.3;

  MUSIC.leadNote = function (t, deg, durSec, vel, opts) {
    if (!this.ctx || !this.lead) return;
    opts = opts || {};
    const T = MUSIC.theory;
    const raga = T.RAGAS[this.raga];
    const preset = this.lead.preset;
    const leadMul = raga.leadMul || 2;
    const hz = T.semiToHz(this.sa * leadMul, deg);
    const prevHz = this.lead.prevHz;

    if (opts.kan) {
      const graceHz = T.semiToHz(this.sa * leadMul, deg + 1);
      this.lead.osc.frequency.setValueAtTime(graceHz, t);
      this.lead.osc.frequency.setValueAtTime(hz, t + 0.035);
    } else if (opts.glide && prevHz) {
      this.lead.osc.frequency.setValueAtTime(prevHz, t);
      const glideTime = Math.max(0.001, Math.min(0.18, 0.5 * durSec));
      this.lead.osc.frequency.exponentialRampToValueAtTime(hz, t + glideTime);
    } else {
      this.lead.osc.frequency.setValueAtTime(hz, t);
      this.lead.amp.gain.setTargetAtTime(Math.max(0.0001, vel * 0.6), t, 0.005);
      this.lead.amp.gain.setTargetAtTime(Math.max(0.0001, vel), t + 0.02, 0.005);
    }
    if (opts.murki) {
      const upperHz = T.semiToHz(this.sa * leadMul, deg + 1);
      const lowerHz = T.semiToHz(this.sa * leadMul, deg - 1);
      this.lead.osc.frequency.setValueAtTime(upperHz, t);
      this.lead.osc.frequency.setValueAtTime(hz, t + 0.045);
      this.lead.osc.frequency.setValueAtTime(lowerHz, t + 0.09);
      this.lead.osc.frequency.setValueAtTime(hz, t + 0.135);
    }
    this.lead.prevHz = hz;

    this.lead.lp.frequency.setTargetAtTime(Math.min(preset.lpCap, hz * preset.lpMul), t, 0.05);
    const attackTc = Math.max(0.001, preset.attack / 3);
    this.lead.amp.gain.setTargetAtTime(Math.max(0.0001, vel * preset.gain), t, attackTc);
    this.lead.breathAmp.gain.setTargetAtTime(Math.max(0.0001, vel * preset.gain * preset.breath), t, attackTc);

    const isAndolan = raga.andolan && raga.andolan.indexOf(T.pc(deg)) !== -1 && durSec >= MUSIC.ANDOLAN_MIN_SEC;
    if (isAndolan) {
      this.lead.vibLfo.frequency.setValueAtTime(1.6, t);
      this.lead.vibGain.gain.setValueAtTime(0.0001, t);
      this.lead.vibGain.gain.linearRampToValueAtTime(25, t + 0.3);
    } else {
      this.lead.vibLfo.frequency.setValueAtTime(preset.vibRate, t);
      this.lead.vibGain.gain.setValueAtTime(0.0001, t);
      this.lead.vibGain.gain.linearRampToValueAtTime(Math.max(0.0001, preset.vibCents), t + preset.vibDelay + 0.3);
    }
  };

  MUSIC.leadRelease = function (t) {
    if (!this.ctx || !this.lead) return;
    const preset = this.lead.preset;
    const tc = Math.max(0.001, preset.release / 3);
    this.lead.amp.gain.setTargetAtTime(0.0001, t, tc);
    this.lead.breathAmp.gain.setTargetAtTime(0.0001, t, tc);
  };

  MUSIC.leadCancel = function (t) {
    if (!this.ctx || !this.lead) return;
    this.lead.osc.frequency.cancelScheduledValues(t);
    this.lead.amp.gain.cancelScheduledValues(t);
    this.leadRelease(t);
  };

  // ---------------- pads (sine Sa pad / sub / tension) ----------------

  MUSIC._initPads = function () {
    const ctx = this.ctx;
    const padOsc = ctx.createOscillator(); padOsc.frequency.value = 220; padOsc.start(0);
    const padGain = ctx.createGain(); padGain.gain.value = 0.25;
    padOsc.connect(padGain); padGain.connect(this.nodes.stemInputs.drone);

    const subWave = MUSIC.dsp.leadWave('sub');
    const subOsc = ctx.createOscillator();
    subOsc.setPeriodicWave(ctx.createPeriodicWave(subWave.real, subWave.imag));
    subOsc.frequency.value = 55; subOsc.start(0);
    const subGain = ctx.createGain(); subGain.gain.value = 1;
    subOsc.connect(subGain); subGain.connect(this.nodes.stemInputs.sub);

    const tensionOsc = ctx.createOscillator(); tensionOsc.frequency.value = 440; tensionOsc.start(0);
    const tensionGain = ctx.createGain(); tensionGain.gain.value = 0;
    tensionOsc.connect(tensionGain); tensionGain.connect(this.nodes.stemInputs.drone);

    this.pads = { padOsc, padGain, subOsc, subGain, tensionOsc, tensionGain };
  };

  // ---------------- raga / intensity / duck / tension control ----------------

  MUSIC.setRaga = function (id, saHz) {
    if (!this.ctx) return;
    const T = MUSIC.theory;
    const raga = T.RAGAS[id] || T.ragaFor(id);
    this.raga = raga.id;
    this.tala = T.TALAS[raga.tala];
    this.sa = (saHz !== undefined && saHz !== null && isFinite(saHz)) ? saHz : raga.sa;
    const t = this.ctx.currentTime;

    this.pads.padOsc.frequency.setTargetAtTime(this.sa, t, 0.2);
    this.pads.subOsc.frequency.setTargetAtTime(foldRange(this.sa / 2, 40, 65), t, 0.2);
    this.pads.tensionOsc.frequency.setTargetAtTime(T.semiToHz(this.sa * 2, raga.tension || 0), t, 0.2);
    this._applyLeadPreset(raga.lead);

    const bank = this._ensureBank(raga.id);
    for (let i = 0; i < bank.jobs.length; i++) {
      const job = bank.jobs[i];
      if (job.kind === 'tanpura' || (job.kind === 'fx' && job.args.kind === 'bell')) {
        if (!bank.buffers.has(job.key)) {
          const arr = MUSIC.dsp.renderJob(job, this.sr);
          bank.buffers.set(job.key, this._toAudioBuffer(arr));
        }
      }
    }
  };

  MUSIC.setStemLevels = function (level, t, rampSec, override) {
    if (!this.ctx) return;
    rampSec = rampSec === undefined ? 0.3 : rampSec;
    const T = MUSIC.theory;
    const raga = T.RAGAS[this.raga];
    const lvl = Math.max(0, Math.min(5, level));
    const row = T.INTENSITY[lvl];
    const tc = Math.max(0.001, rampSec / 3);
    for (const s of T.STEM_NAMES) {
      const base = (override && override[s] !== undefined) ? override[s] : row[s];
      const target = base * MUSIC.MIX[s] * (s === 'big' ? (raga.bigBoost || 1) : 1);
      this.nodes.stems[s].gain.setTargetAtTime(target, t, tc);
    }
  };

  MUSIC.setDuck = function (on, t) {
    if (!this.ctx) return;
    if (on) {
      this.nodes.duckLP.frequency.setTargetAtTime(1100, t, 0.15);
      this.nodes.duckGain.gain.setTargetAtTime(0.6, t, 0.15);
    } else {
      this.nodes.duckLP.frequency.setTargetAtTime(18000, t, 0.15);
      this.nodes.duckGain.gain.setTargetAtTime(1, t, 0.15);
    }
  };

  MUSIC.setTension = function (on, t) {
    if (!this.ctx) return;
    this.pads.tensionGain.gain.setTargetAtTime(on ? 0.12 : 0.0001, t, 0.3);
  };

  MUSIC.isAudible = function () {
    if (!this.ctx || !this.audio) return false;
    const vol = (typeof SETTINGS !== 'undefined') ? SETTINGS.get('musicVolume') : 1;
    return !!(this.running && !this.audio.muted && vol > 0.02);
  };
})();
