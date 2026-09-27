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
