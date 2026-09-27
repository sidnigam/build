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
