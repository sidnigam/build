// ============================================================
// CHAKRAVYUHA — dialogue.js : god dialogue engine
// Data-driven, condition-gated, weighted line selection for the
// boon-pick screen. Pure and headless-testable; no DOM access.
// ============================================================
'use strict';

const DIALOGUE = {
  // ---------- condition + priority tables (D-14, D-15) ----------
  KNOWN_WHEN: ['first', 'minMeetings', 'firstThisRun', 'lowHp', 'biome', 'justDefeated', 'holds',
    'lastDeathBiome', 'lastDeathBoss', 'lastRunWon', 'minDeaths', 'minWins', 'weapon'],

  PRI: {
    first: 100, duo: 90, justDefeated: 70,
    lastDeathBiome: 60, lastDeathBoss: 60, lastRunWon: 60,
    lowHp: 50, holds: 40, weapon: 35, biome: 30,
    minWins: 20, minDeaths: 20, minMeetings: 20, firstThisRun: 10,
  },

  CHANCE: { 100: 1, 90: 1, 70: 1, 60: 0.8, 50: 0.8, 40: 0.5, 35: 0.5, 30: 0.4, 20: 0.35, 10: 0.35, 0: 1 },

  LOW_HP: 0.35,

  // Content: filled in by _greetLines() below (placeholder) and replaced
  // wholesale with the full authored set in Phase 05.5 Plan 02 Task 2.
  LINES: [],

  // Codex lore paragraphs: DIALOGUE.LORE[godId] = { s: source, d: paragraph }
  LORE: {},

  // ---------- small pure helpers ----------
  duoGods(id) {
    const d = DATA.DUO_BOONS.find(x => x.id === id);
    return d ? d.gods : [];
  },

  portraitPath(id) {
    return 'assets/sprites/gods/' + id + '-portrait.png';
  },

  speakerName(s) {
    return s === 'abhimanyu' ? 'Abhimanyu' : DATA.GODS[s].name;
  },

  beats(line) {
    if (line.beats) return line.beats.map(b => ({ s: b.s, t: b.t }));
    const out = [{ s: line.god, t: line.text }];
    if (line.reply) out.push({ s: 'abhimanyu', t: line.reply });
    return out;
  },

  priOf(line) {
    if (line.pri !== undefined) return line.pri;
    if (line.duo) return 90;
    const when = line.when || {};
    let best = 0;
    for (const k of Object.keys(when)) {
      const p = DIALOGUE.PRI[k];
      if (p !== undefined && p > best) best = p;
    }
    return best;
  },

  // ---------- condition matching (D-14) ----------
  matches(when, ctx) {
    for (const k of Object.keys(when || {})) {
      const v = when[k];
      switch (k) {
        case 'first': if (ctx.first !== v) return false; break;
        case 'minMeetings': if (!((ctx.meetings | 0) >= v)) return false; break;
        case 'firstThisRun': if (ctx.firstThisRun !== v) return false; break;
        case 'lowHp': if ((ctx.hpFrac <= DIALOGUE.LOW_HP) !== v) return false; break;
        case 'biome': if (ctx.biome !== v) return false; break;
        case 'justDefeated':
          if (v === '*') { if (!ctx.justDefeated) return false; }
          else if (ctx.justDefeated !== v) return false;
          break;
        case 'holds': if (!((ctx.holds[v] | 0) > 0)) return false; break;
        case 'lastDeathBiome':
          if (v === '*') { if (!ctx.lastDeathBiome) return false; }
          else if (ctx.lastDeathBiome !== v) return false;
          break;
        case 'lastDeathBoss':
          if (v === '*') { if (!ctx.lastDeathBoss) return false; }
          else if (ctx.lastDeathBoss !== v) return false;
          break;
        case 'lastRunWon': if (ctx.lastRunWon !== v) return false; break;
        case 'minDeaths': if (!((ctx.deaths | 0) >= v)) return false; break;
        case 'minWins': if (!((ctx.wins | 0) >= v)) return false; break;
        case 'weapon': if (ctx.weapon !== v) return false; break;
        default: return false;
      }
    }
    return true;
  },

  // ---------- memory (D-16) ----------
  mem(meta = META) {
    let d = meta.dialogue;
    if (!d || typeof d !== 'object' || Array.isArray(d)) { d = {}; meta.dialogue = d; }
    if (!d.met || typeof d.met !== 'object') d.met = {};
    if (!d.seen || typeof d.seen !== 'object') d.seen = {};
    if (!d.last || typeof d.last !== 'object') d.last = {};
    if (d.lastId === undefined) d.lastId = null;
    if (!d.runMet || typeof d.runMet !== 'object') d.runMet = { run: -1, gods: [] };
    if (!Array.isArray(d.runMet.gods)) d.runMet.gods = [];
    if (typeof d.runMet.run !== 'number') d.runMet.run = -1;
    if (d.lastRun === undefined) d.lastRun = null;
    return d;
  },

  buildContext(godId, opts = {}) {
    const game = opts.game || GAME;
    const meta = opts.meta || META;
    const m = DIALOGUE.mem(meta);
    const P = game.player;

    const runMetGods = (m.runMet.run === meta.runs) ? m.runMet.gods : [];
    const firstThisRun = !runMetGods.includes(godId);
    const fresh = !!(m.lastRun && m.lastRun.run === meta.runs - 1 && firstThisRun);

    const holds = {};
    if (P && P.allBoons) {
      for (const b of P.allBoons()) {
        const def = b.def;
        if (def.gods) { for (const g of def.gods) holds[g] = (holds[g] | 0) + 1; }
        else if (def.god) holds[def.god] = (holds[def.god] | 0) + 1;
      }
    }

    return {
      god: godId,
      meetings: m.met[godId] | 0,
      first: (m.met[godId] | 0) === 0,
      firstThisRun,
      hpFrac: P ? P.hp / Math.max(1, P.maxhp) : 1,
      biome: game.biome ? game.biome.id : null,
      justDefeated: (game.biomeIdx > 0 && game.roomIdx <= 1) ? DATA.BIOMES[game.biomeIdx - 1].boss : null,
      holds,
      duo: opts.duo ? (opts.duo.id || opts.duo) : null,
      lastDeathBiome: (fresh && m.lastRun.result === 'death') ? m.lastRun.biome : null,
      lastDeathBoss: (fresh && m.lastRun.result === 'death') ? m.lastRun.boss : null,
      lastRunWon: !!(fresh && m.lastRun.result === 'victory'),
      deaths: meta.deaths | 0,
      wins: meta.wins | 0,
      weapon: (P && P.weapon) ? P.weapon.id : meta.lastWeapon,
    };
  },

  // ---------- selection (D-15) ----------
  _weightedPick(cands, mem, rand) {
    const weights = cands.map(l => (l.w !== undefined ? l.w : 1) / (1 + (mem.seen[l.id] | 0)));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r <= 0) return cands[i];
    }
    return cands[cands.length - 1];
  },

  select(godId, ctx, mem, rand = Math.random, lines = DIALOGUE.LINES) {
    const elig = lines.filter(l => (
      (l.god === godId && !l.duo && DIALOGUE.matches(l.when || {}, ctx)) ||
      (l.duo && l.duo === ctx.duo && DIALOGUE.duoGods(l.duo).includes(godId))
    )).filter(l => !(l.once && mem.seen[l.id]));

    if (!elig.length) return null;

    const fresh = elig.filter(l => l.id !== mem.last[godId] && l.id !== mem.lastId);
    const pool = fresh.length ? fresh : elig;

    const pris = Array.from(new Set(pool.map(DIALOGUE.priOf))).sort((a, b) => b - a);
    for (const pri of pris) {
      const cands = pool.filter(l => DIALOGUE.priOf(l) === pri && rand() < (
        l.chance !== undefined ? l.chance : (DIALOGUE.CHANCE[pri] !== undefined ? DIALOGUE.CHANCE[pri] : 1)
      ));
      if (cands.length) return DIALOGUE._weightedPick(cands, mem, rand);
    }
    return pool[0];
  },

  record(line, godId, m = DIALOGUE.mem(), meta = META) {
    m.met[godId] = (m.met[godId] | 0) + 1;
    m.seen[line.id] = (m.seen[line.id] | 0) + 1;
    m.last[godId] = line.id;
    m.lastId = line.id;
    if (m.runMet.run !== meta.runs) m.runMet = { run: meta.runs, gods: [] };
    if (!m.runMet.gods.includes(godId)) m.runMet.gods.push(godId);
    if (line.duo) {
      for (const g of DIALOGUE.duoGods(line.duo)) {
        if (g === godId) continue;
        m.met[g] = (m.met[g] | 0) + 1;
        m.last[g] = line.id;
        if (!m.runMet.gods.includes(g)) m.runMet.gods.push(g);
      }
    }
    if (meta.save) meta.save();
    return m;
  },

  noteRunEnd(info, meta = META) {
    const m = DIALOGUE.mem(meta);
    m.lastRun = { result: info.result, biome: info.biome || null, boss: info.boss || null, run: info.run };
    if (meta.save) meta.save();
    return m;
  },

  metGods(meta = META) {
    const m = DIALOGUE.mem(meta);
    return Object.keys(DATA.GODS).filter(id => (m.met[id] | 0) > 0);
  },

  // ---------- validation (D-17) ----------
  validate(lines = DIALOGUE.LINES) {
    const errs = [];
    const seenIds = new Set();
    const godIds = Object.keys(DATA.GODS);
    const biomeIds = DATA.BIOMES.map(b => b.id);
    const bossIds = Object.keys(DATA.BOSSES);
    const weaponIds = Object.keys(DATA.WEAPONS);
    const idRe = /^[a-z0-9_]+$/;
    const badChars = (s) => typeof s === 'string' && (/[<>]/.test(s) || /^"|"$/.test(s));

    for (const l of lines) {
      const id = l.id;
      if (!id || !idRe.test(id)) errs.push(`${id || '(missing id)'}: invalid id`);
      if (seenIds.has(id)) errs.push(`${id}: duplicate id`);
      seenIds.add(id);

      if (l.duo) {
        if (!DATA.DUO_BOONS.find(d => d.id === l.duo)) errs.push(`${id}: unknown duo ${l.duo}`);
        const dgods = DIALOGUE.duoGods(l.duo).concat(['abhimanyu']);
        if (!l.beats || l.beats.length < 2) {
          errs.push(`${id}: duo line needs >= 2 beats`);
        } else {
          for (const b of l.beats) {
            if (!dgods.includes(b.s)) errs.push(`${id}: beat speaker ${b.s} not in duo`);
            if (typeof b.t !== 'string' || b.t.length < 1 || b.t.length > 240) errs.push(`${id}: beat text length`);
            if (badChars(b.t)) errs.push(`${id}: beat text has bad characters`);
          }
        }
      } else {
        if (!godIds.includes(l.god)) errs.push(`${id}: unknown god ${l.god}`);
        if (typeof l.text !== 'string' || l.text.length < 1 || l.text.length > 240) errs.push(`${id}: text length`);
        if (badChars(l.text)) errs.push(`${id}: text has bad characters`);
        if (l.reply !== undefined) {
          if (typeof l.reply !== 'string' || l.reply.length > 120) errs.push(`${id}: reply too long`);
          if (badChars(l.reply)) errs.push(`${id}: reply has bad characters`);
        }
      }

      const when = l.when || {};
      for (const k of Object.keys(when)) {
        if (!DIALOGUE.KNOWN_WHEN.includes(k)) { errs.push(`${id}: unknown when key ${k}`); continue; }
        const v = when[k];
        if ((k === 'biome' || k === 'lastDeathBiome') && !(biomeIds.includes(v) || v === '*')) errs.push(`${id}: unknown biome ${v}`);
        if ((k === 'justDefeated' || k === 'lastDeathBoss') && !(bossIds.includes(v) || v === '*')) errs.push(`${id}: unknown boss ${v}`);
        if (k === 'holds') {
          if (!godIds.includes(v)) errs.push(`${id}: unknown god in holds ${v}`);
          else if (v === l.god) errs.push(`${id}: holds references own god`);
        }
        if (k === 'weapon' && !weaponIds.includes(v)) errs.push(`${id}: unknown weapon ${v}`);
      }
      if (l.once && !when.first) errs.push(`${id}: once only allowed with when.first`);
    }
    return errs;
  },

  // ---------- coverage (GOD-04); filled in fully by Task 2 content ----------
  coverage(lines = DIALOGUE.LINES) {
    const errs = [];
    const godIds = Object.keys(DATA.GODS);
    for (const god of godIds) {
      const own = lines.filter(l => l.god === god && !l.duo);
      if (own.length < 10) errs.push(`${god}: fewer than 10 lines (${own.length})`);
      if (!own.some(l => l.once && l.when && l.when.first)) errs.push(`${god}: missing a once/first line`);
      if (own.filter(l => !l.when || Object.keys(l.when).length === 0).length < 2) errs.push(`${god}: fewer than 2 generic lines`);
      if (!own.some(l => l.when && l.when.lowHp)) errs.push(`${god}: missing a lowHp line`);
      if (!own.some(l => l.when && l.when.justDefeated !== undefined)) errs.push(`${god}: missing a justDefeated line`);
      if (!own.some(l => l.when && l.when.holds)) errs.push(`${god}: missing a holds line`);
      if (!own.some(l => l.when && (l.when.lastDeathBiome !== undefined || l.when.lastDeathBoss !== undefined || l.when.lastRunWon !== undefined)))
        errs.push(`${god}: missing a lastDeath/lastRunWon line`);
      if (!own.some(l => l.when && (l.when.biome !== undefined || l.when.weapon !== undefined))) errs.push(`${god}: missing a biome/weapon line`);
      const replyCount = lines.filter(l => (
        (l.god === god && !l.duo && l.reply) ||
        (l.duo && DIALOGUE.duoGods(l.duo).includes(god) && l.beats && l.beats.some(b => b.s === 'abhimanyu'))
      )).length;
      if (replyCount < 2) errs.push(`${god}: fewer than 2 reply/abhimanyu-beat lines`);
      const lore = DIALOGUE.LORE[god];
      if (!lore || !lore.s || !lore.d) errs.push(`${god}: missing or incomplete LORE entry`);
    }
    for (const duo of DATA.DUO_BOONS) {
      const cnt = lines.filter(l => l.duo === duo.id).length;
      if (cnt < 2) errs.push(`${duo.id}: fewer than 2 duo lines`);
    }
    return errs;
  },
};

// Placeholder content (Task 1): each god's existing greet line, quote marks stripped.
// Task 2 replaces DIALOGUE.LINES wholesale with the full authored set.
DIALOGUE._greetLines = function () {
  return Object.keys(DATA.GODS).map(id => {
    const raw = DATA.GODS[id].greet;
    const text = raw.replace(/^"|"$/g, '');
    return { id: id + '_greet', god: id, text };
  });
};
DIALOGUE.LINES = DIALOGUE._greetLines();
