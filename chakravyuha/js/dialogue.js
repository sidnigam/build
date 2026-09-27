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

  // Content: authored below (Phase 05.5 Plan 02 Task 2). See the Lore Check
  // in 05.5-02-SUMMARY.md for the source of every factual reference.
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

// Also expose as a `window`/`globalThis` property (in addition to the lexical
// `const` above) so that code compiled *before* this file loads (e.g. ui.js,
// Phase 05.5-03) can detect it dynamically via `window.DIALOGUE` without
// relying on re-resolving the bare `DIALOGUE` free variable, which some JS
// engines can keep permanently unresolved once a function has already been
// invoked enough times while it was genuinely absent (index.html loads this
// file before ui.js, so real play is unaffected either way).
if (typeof window !== 'undefined') window.DIALOGUE = DIALOGUE;

// ============================================================
// Content: 6 gods x 10-13 lines, 6 duos x 2 co-voiced lines, codex lore.
// Reverent, epic-accurate. Every factual reference is in the Lore Check
// table in 05.5-02-SUMMARY.md. Deliberately avoided: the agni-pariksha,
// Kali/severed-head imagery, and any version where Krishna causes
// Abhimanyu's death. The gods never threaten Abhimanyu or speak of Yama
// with contempt; the Yama fight is framed as a trial of dharma.
// ============================================================
(function () {
  // Reuse each god's pre-phase greet line (data.js) as its generic fallback,
  // quote marks stripped, so the original text keeps being used (D-12).
  const g = id => DATA.GODS[id].greet.replace(/^"|"$/g, '');

  DIALOGUE.LINES = [
    // ---------------- HANUMAN ----------------
    { id: 'han_first', god: 'hanuman', when: { first: true }, once: true,
      text: "So you are Arjuna's boy. I rode on your father's banner through all of Kurukshetra. I will not watch his son fall alone again. Take my strength, little prince.",
      reply: 'Jai Shri Ram, Hanuman-ji.' },
    { id: 'han_greet', god: 'hanuman', text: g('hanuman') },
    { id: 'han_gen_rama', god: 'hanuman', text: "Whatever strength I have is Rama's. I only carry it. Today I carry it to you." },
    { id: 'han_gen_mountain', god: 'hanuman', when: { minMeetings: 2 },
      text: 'When I could not tell which herb would save Lakshmana, I brought the whole mountain. Never fear doing too much, child.' },
    { id: 'han_lowhp', god: 'hanuman', when: { lowHp: true },
      text: 'You are hurt. Breathe. I once leapt an ocean with a heavier heart than yours. Rise, and we go on together.',
      reply: 'I am standing, Hanuman-ji.' },
    { id: 'han_def_tataka', god: 'hanuman', when: { justDefeated: 'tataka' },
      text: 'Tataka has fallen again. Young Rama was hardly older than you when he first faced her. He hesitated too, and then he did his duty.' },
    { id: 'han_def_ahiravana', god: 'hanuman', when: { justDefeated: 'ahiravana' },
      text: 'Ahiravana! I needed five faces and one breath to put out his five lamps. You managed with one face. I am proud of you.' },
    { id: 'han_def_kumbhakarna', god: 'hanuman', when: { justDefeated: 'kumbhakarna' },
      text: 'Kumbhakarna told his brother the war was wrong, then fought for him anyway. Honor him, child, even as you walk past him.' },
    { id: 'han_holds_vayu', god: 'hanuman', when: { holds: 'vayu' },
      text: "My father's wind already lives in your step. Good. Now let his son's strength live in your arms." },
    { id: 'han_holds_krishna', god: 'hanuman', when: { holds: 'krishna' },
      text: 'Keshava has blessed you already? Then he holds the reins and I ride the banner, just as it was at Kurukshetra.' },
    { id: 'han_patala', god: 'hanuman', when: { biome: 'patala' },
      text: 'Patala. I came down here once to bring Rama and Lakshmana home. The serpents remember me. Let them learn to remember you.' },
    { id: 'han_lastdeath', god: 'hanuman', when: { lastDeathBiome: '*' },
      text: 'Chitragupta says you fell again. As a child I leapt for the sun and was struck from the sky. I got up. So will you.' },
    { id: 'han_won', god: 'hanuman', when: { minWins: 1 },
      text: 'They say you walked out of this place once. I never doubted it. Walk out again.' },

    // ---------------- AGNI ----------------
    { id: 'agni_first', god: 'agni', when: { first: true }, once: true,
      text: 'I am the mouth of the gods, Abhimanyu. Every offering reaches heaven through me. Today, the offering is the asura host before you.',
      reply: 'Then let them burn, Agnideva.' },
    { id: 'agni_greet', god: 'agni', text: g('agni') },
    { id: 'agni_gen_rigveda', god: 'agni',
      text: 'The very first hymn of the Rig Veda is sung to me. I have heard every prayer since. Yours are loud. I like that.' },
    { id: 'agni_gen_oath', god: 'agni', when: { minMeetings: 2 },
      text: 'I stood witness when you and Uttara walked the seven steps. I keep every vow I witness, and I mean to keep you.' },
    { id: 'agni_lowhp', god: 'agni', when: { lowHp: true },
      text: 'Your flame is guttering. Feed it. A small fire, well tended, outlasts any forest blaze.' },
    { id: 'agni_weapon_gandiva', god: 'agni', when: { weapon: 'gandiva' },
      text: "You carry the Gandiva. At Khandava I asked Varuna for that bow and put it in your father's hands. Draw it well." },
    { id: 'agni_holds_krishna', god: 'agni', when: { holds: 'krishna' },
      text: 'Your uncle favors you already? At Khandava I gave him the Sudarshana. It seems I have been arming your family for a long time.' },
    { id: 'agni_holds_indra', god: 'agni', when: { holds: 'indra' },
      text: "Indra's lightning is on you. At Khandava he poured rain on my fire for days. Now we share a champion." },
    { id: 'agni_def_tataka', god: 'agni', when: { justDefeated: 'tataka' },
      text: 'Tataka devoured whole forests without leave. I have consumed a forest too, but only one that was offered. She is ash now.' },
    { id: 'agni_naraka', god: 'agni', when: { biome: 'naraka' },
      text: 'The fires of Naraka are not mine. They correct; they do not consecrate. Mine burn for you.',
      reply: 'Then I will walk through theirs.' },
    { id: 'agni_lastdeath', god: 'agni', when: { lastDeathBoss: '*' },
      text: 'Every pyre is mine, child. I have carried many warriors across. Not you. Not yet.' },

    // ---------------- INDRA ----------------
    { id: 'indra_first', god: 'indra', when: { first: true }, once: true,
      text: 'Grandson! Your father came to me in Amaravati to learn the astras. You have his jaw, and his recklessness.',
      reply: 'Grandfather. Devaraja.' },
    { id: 'indra_greet', god: 'indra', text: g('indra') },
    { id: 'indra_gen_dadhichi', god: 'indra',
      text: "My Vajra was shaped from the bones of the sage Dadhichi, freely given. Remember, grandson: all strength is someone's sacrifice." },
    { id: 'indra_gen_vritra', god: 'indra', when: { minMeetings: 2 },
      text: 'I slew Vritra and set the seven rivers free. A few rings of asuras hardly compare, but go on. Impress me.' },
    { id: 'indra_lowhp', god: 'indra', when: { lowHp: true },
      text: 'Up, grandson. The king of the devas does not bless kneeling men. Very well, I do. But get up anyway.' },
    { id: 'indra_holds_krishna', god: 'indra', when: { holds: 'krishna' },
      text: "Your uncle's blessing already? He once lifted a mountain to shelter Gokul from my rains. I learned humility that day. Mostly." },
    { id: 'indra_holds_vayu', god: 'indra', when: { holds: 'vayu' },
      text: "Vayu rides with you. We have an old matter between us concerning his son's jaw. Let the storm and the wind share you in peace." },
    { id: 'indra_def_kumbhakarna', god: 'indra', when: { justDefeated: 'kumbhakarna' },
      text: 'Kumbhakarna meant to ask for my throne and asked for sleep instead. I have blessed Saraswati for that slip of the tongue ever since.' },
    { id: 'indra_ranabhoomi', god: 'indra', when: { biome: 'ranabhoomi' },
      text: 'A field of the fallen. I watched Kurukshetra from above, grandson. When you stood alone in the formation, every deva in heaven rose to his feet.' },
    { id: 'indra_lastdeath_yama', god: 'indra', when: { lastDeathBoss: 'yama' },
      text: "Yama bested you. Do not sulk. He is Dharma's own judge, not your enemy. Earn his verdict.",
      reply: 'I will, Grandfather.' },
    { id: 'indra_won', god: 'indra', when: { lastRunWon: true },
      text: 'You broke the wheel and came back to break it again. Your father would call that foolish. I call it royal.' },

    // ---------------- VAYU ----------------
    { id: 'vayu_first', god: 'vayu', when: { first: true }, once: true,
      text: 'Hush. Feel that? That is me, the breath in your chest. I have been with you since your first cry. Let me run with you now.',
      reply: 'Vayudeva. I feel it.' },
    { id: 'vayu_greet', god: 'vayu', text: g('vayu') },
    { id: 'vayu_gen_bhima', god: 'vayu',
      text: 'Your uncle Bhima is my son. He would tell you to hit harder. I will tell you to be somewhere else when they swing.' },
    { id: 'vayu_gen_breath', god: 'vayu', when: { minMeetings: 2 },
      text: 'When my son Hanuman was struck from the sky, I withdrew my breath and the three worlds gasped. I do not let my favorites fall lightly.' },
    { id: 'vayu_lowhp', god: 'vayu', when: { lowHp: true },
      text: 'Slow your breath. In, and out. Now move, before they do.' },
    { id: 'vayu_holds_hanuman', god: 'vayu', when: { holds: 'hanuman' },
      text: "My son's strength is already in your arms. Good. Now take his father's lightness for your feet." },
    { id: 'vayu_holds_indra', god: 'vayu', when: { holds: 'indra' },
      text: 'The storm-king\'s lightning, and now my wind. Even the Maruts would envy you.' },
    { id: 'vayu_def_ahiravana', god: 'vayu', when: { justDefeated: 'ahiravana' },
      text: 'Ahiravana hid his life in five flames, and my son put them out in a single breath. Breath is a weapon, child. Use yours.' },
    { id: 'vayu_vaitarani', god: 'vayu', when: { biome: 'vaitarani' },
      text: 'The Vaitarani lies so still. I dislike stillness. Let us stir it.' },
    { id: 'vayu_lastdeath', god: 'vayu', when: { lastDeathBiome: '*' },
      text: 'Your last breath was not your last after all. I keep giving them back. Spend this one well.',
      reply: 'I will not waste it.' },

    // ---------------- KRISHNA ----------------
    { id: 'kri_first', god: 'krishna', when: { first: true }, once: true,
      text: "Abhimanyu. My sister's son. I promised Subhadra I would watch over you. I never promised to make it easy.",
      reply: "Uncle. You knew all along, didn't you?" },
    { id: 'kri_greet', god: 'krishna', text: g('krishna') },
    { id: 'kri_gen_soul', god: 'krishna',
      text: 'The soul is not born and does not die. Weapons do not cut it, fire does not burn it. I told your father as much. You seem determined to prove it.' },
    { id: 'kri_gen_womb', god: 'krishna',
      text: 'They say your mother fell asleep before your father could describe the way out of the Chakravyuha. Stories are like that. This time, find the way out yourself.' },
    { id: 'kri_gen_parikshit', god: 'krishna', when: { minMeetings: 3 },
      text: "Uttara's child will live, Abhimanyu. I have promised it. Your line will rule after all of us.",
      reply: 'Thank you, Uncle.' },
    { id: 'kri_lowhp', god: 'krishna', when: { lowHp: true },
      text: 'Tired? Your father once sat down in his chariot and let his bow fall. I spoke for eighteen chapters. Do not make me speak for eighteen chapters.' },
    { id: 'kri_holds_durga', god: 'krishna', when: { holds: 'durga' },
      text: 'The Mother already shelters you. She lay in a cradle in my place the night I was born. Our family owes her more than we can say.' },
    { id: 'kri_holds_indra', god: 'krishna', when: { holds: 'indra' },
      text: "Your grandfather's lightning. Be gracious to him. He and I once disagreed about a mountain, and he has been most gracious since." },
    { id: 'kri_holds_hanuman', god: 'krishna', when: { holds: 'hanuman' },
      text: "Hanuman rode on your father's banner. Now he rides with you. Some loyalties are older than any war." },
    { id: 'kri_def_kumbhakarna', god: 'krishna', when: { justDefeated: 'kumbhakarna' },
      text: 'I knew Kumbhakarna in another age, when I wore another name. A good heart, asleep in the wrong army. Remember the difference between loyalty and dharma.' },
    { id: 'kri_ranabhoomi', god: 'krishna', when: { biome: 'ranabhoomi' },
      text: 'I know this field. I drove a chariot across it. Every warrior here fell for something he believed. Walk gently, and strike hard.' },
    { id: 'kri_lastdeath', god: 'krishna', when: { lastDeathBoss: '*' },
      text: 'You fell again. I saw you fall once before, fighting on with nothing but a chariot wheel. The world still sings of it.' },
    { id: 'kri_won', god: 'krishna', when: { lastRunWon: true },
      text: 'You escaped, and then you came back. That is dharma, nephew. Not the leaving; the returning.' },

    // ---------------- DURGA ----------------
    { id: 'dur_first', god: 'durga', when: { first: true }, once: true,
      text: "Come here, child. Every god who blesses you first placed a weapon in my hands: Indra his thunderbolt, Agni his spear, Vayu his bow. I carry them all for you.",
      reply: 'Ma. I am not afraid.' },
    { id: 'dur_greet', god: 'durga', text: g('durga') },
    { id: 'dur_gen_arjuna', god: 'durga',
      text: "Before the great war, your father sang my praises on Krishna's counsel, and I blessed him with victory. I keep my blessings for his children too." },
    { id: 'dur_gen_mahisha', god: 'durga', when: { minMeetings: 2 },
      text: 'Mahishasura changed his shape again and again: buffalo, lion, elephant, man. It did not matter. Neither will theirs.' },
    { id: 'dur_lowhp', god: 'durga', when: { lowHp: true },
      text: "Who dares wound my child? Stand in my lion's shadow a moment. Now, again." },
    { id: 'dur_holds_krishna', god: 'durga', when: { holds: 'krishna' },
      text: "Krishna's favor is on you. I shielded him in his cradle. I will shield his nephew in this wheel." },
    { id: 'dur_holds_agni', god: 'durga', when: { holds: 'agni' },
      text: 'Agni gave me his spear long ago. See how his fire guards you now.' },
    { id: 'dur_def_tataka', god: 'durga', when: { justDefeated: 'tataka' },
      text: "Tataka was a yaksha's daughter, cursed into hunger. Pity her, then step past her. Pity must never slow your feet." },
    { id: 'dur_naraka', god: 'durga', when: { biome: 'naraka' },
      text: 'The Iron City. Yama keeps order here, and I honor his order. But I am your mother in this place too.' },
    { id: 'dur_lastdeath_yama', god: 'durga', when: { lastDeathBoss: 'yama' },
      text: 'Dharmaraja weighed you and sent you back. That is no disgrace. Savitri won a soul back from him with patience and wit. Bring both.' },
    { id: 'dur_lastdeath', god: 'durga', when: { lastDeathBiome: '*' },
      text: "They struck at your back, didn't they? Cowards always do. This time, I stand behind you.",
      reply: 'Then I will not look back, Ma.' },

    // ---------------- DUOS (co-voiced) ----------------
    { id: 'duo_pavanaputra_a', duo: 'duo_pavanaputra', beats: [
      { s: 'hanuman', t: 'Father! You are here too?' },
      { s: 'vayu', t: 'Where else would the wind be, son? Let us lift this one together.' } ] },
    { id: 'duo_pavanaputra_b', duo: 'duo_pavanaputra', beats: [
      { s: 'vayu', t: 'My son strikes, and I carry him. It has always been our way.' },
      { s: 'hanuman', t: 'Jai Shri Ram. Hold on tight, Abhimanyu.' } ] },
    { id: 'duo_khandava_a', duo: 'duo_khandava', beats: [
      { s: 'agni', t: 'At Khandava you rained on my fire for days, Devaraja.' },
      { s: 'indra', t: 'And your fire won. Let us see what we do on the same side.' } ] },
    { id: 'duo_khandava_b', duo: 'duo_khandava', beats: [
      { s: 'indra', t: 'Fire and storm, then.' },
      { s: 'agni', t: 'The forest never stood a chance. Neither will they.' },
      { s: 'abhimanyu', t: 'I am glad you are both on my side.' } ] },
    { id: 'duo_yogamaya_a', duo: 'duo_yogamaya', beats: [
      { s: 'durga', t: 'He was a newborn in a basket when I first took his place.' },
      { s: 'krishna', t: 'And she has never let me forget it. Take her veil, nephew. It has saved me before.' } ] },
    { id: 'duo_yogamaya_b', duo: 'duo_yogamaya', beats: [
      { s: 'krishna', t: 'Maya, sister. Show them nothing.' },
      { s: 'durga', t: 'Let them strike at a shadow, child.' } ] },
    { id: 'duo_marut_a', duo: 'duo_marut', beats: [
      { s: 'indra', t: 'The Maruts ride at my side, Vayu, and they run on your wind.' },
      { s: 'vayu', t: 'Then let the whole storm-host run for him.' } ] },
    { id: 'duo_marut_b', duo: 'duo_marut', beats: [
      { s: 'vayu', t: "I have not forgotten the matter of my son's jaw." },
      { s: 'indra', t: 'Nor have I. Consider this a further apology.' } ] },
    { id: 'duo_jwalamukhi_a', duo: 'duo_jwalamukhi', beats: [
      { s: 'durga', t: 'Agni, lend me your flame.' },
      { s: 'agni', t: 'Mother, it has always been yours.' } ] },
    { id: 'duo_jwalamukhi_b', duo: 'duo_jwalamukhi', beats: [
      { s: 'agni', t: 'Strike her child and learn what burns.' },
      { s: 'durga', t: 'Let them learn it quickly.' } ] },
    { id: 'duo_kapidhvaja_a', duo: 'duo_kapidhvaja', beats: [
      { s: 'krishna', t: 'Up on the banner again, Hanuman?' },
      { s: 'hanuman', t: "Always, Keshava. You drive and I roar. For Arjuna's son, I roar twice." } ] },
    { id: 'duo_kapidhvaja_b', duo: 'duo_kapidhvaja', beats: [
      { s: 'hanuman', t: "I held your father's chariot together at Kurukshetra." },
      { s: 'krishna', t: 'He did. When he left it at the end, the chariot burned to ash. Take the banner, Abhimanyu.' } ] },
  ];

  DIALOGUE.LORE = {
    hanuman: { s: 'Ramayana; Mahabharata, Vana Parva',
      d: "Son of Vayu and Anjana, devotee of Rama. He leapt the ocean to find Sita and carried the mountain of healing herbs for Lakshmana. In the Mahabharata he met his brother Bhima and promised to sit on Arjuna's banner. He is one of the Chiranjivi, the deathless ones." },
    agni: { s: 'Rig Veda; Mahabharata, Adi Parva',
      d: 'The sacrificial fire and messenger between mortals and gods, invoked in the very first hymn of the Rig Veda. He is witness to every sacred vow. At the burning of the Khandava forest he gave Arjuna the Gandiva and Krishna the Sudarshana.' },
    indra: { s: 'Rig Veda; Mahabharata',
      d: "King of the devas, wielder of the Vajra shaped from the sage Dadhichi's bones, slayer of the serpent Vritra. He rides the white elephant Airavata. He is the father of Arjuna, who studied the astras in his city of Amaravati — which makes him Abhimanyu's grandfather." },
    vayu: { s: 'Rig Veda; Ramayana; Mahabharata',
      d: 'The wind and the vital breath (prana) of all beings. Father of Hanuman, and — through Kunti — father of Bhima. When Hanuman was struck down as a child, Vayu withdrew his breath from the worlds until the gods restored and blessed his son.' },
    krishna: { s: 'Mahabharata; Bhagavad Gita; Bhagavata Purana',
      d: "The eighth avatar of Vishnu, and brother of Subhadra — Abhimanyu's uncle. He was Arjuna's charioteer at Kurukshetra, where he spoke the Bhagavad Gita. After the war he restored Abhimanyu's unborn son Parikshit to life." },
    durga: { s: 'Devi Mahatmya; Mahabharata, Bhishma Parva',
      d: 'The invincible Mother, born from the combined radiance of the gods, each of whom gave her a weapon. Riding her lion, she slew the shape-shifting buffalo-asura Mahishasura. On Krishna\'s counsel, Arjuna hymned her before the war, and she blessed him with victory.' },
  };
})();
