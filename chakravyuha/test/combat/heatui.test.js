// 05.7.1-10 (D-04, COMBAT-16, COMBAT-13): Vows of Tapas hub panel — hub button gated on the first
// full clear, UI.vows() cards (name, rank text, pips, next-rank Heat), rank cycling through
// HEAT.setRank with immediate save, Heat / Punya / best-Heat header, pad navigation through FOCUS
// with a fake navigator.getGamepads, the back button, the next run picking up the choice, and the
// reverence lint over the new index.html copy.
//
// This suite builds its OWN sandbox (boot deferred) so it can patch the DOM stub before the game
// binds its listeners: element listeners + click(), parentNode on appendChild, per-card layout
// rects, window keydown capture, and document.querySelectorAll('.panel') over the real index.html
// panel list (so hideAll / FOCUS.activePanel behave like a browser).
'use strict';
module.exports = function ({ check, section, harness, fs, path, root }) {
  const J = JSON.stringify;
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const panelIds = [];
  { const re = /<div id="([\w-]+)" class="panel\b/g; let m; while ((m = re.exec(html))) panelIds.push(m[1]); }

  const h = harness.createSandbox({ boot: false });
  const R = h.R;
  h.sandbox.__panelIds = panelIds;
  R(`(() => {
    const P = Object.getPrototypeOf(document.getElementById('__probe'));
    P.addEventListener = function (t, fn) { this.__ls = this.__ls || {}; (this.__ls[t] = this.__ls[t] || []).push(fn); };
    P.click = function () {
      if (typeof this.onclick === 'function') this.onclick({ type: 'click' });
      for (const fn of ((this.__ls || {}).click || [])) fn({ type: 'click' });
    };
    const append = P.appendChild;
    P.appendChild = function (c) { if (c && typeof c === 'object') c.parentNode = this; return append.call(this, c); };
    // vow cards: 3-column grid; the back button sits under the grid; everything else full-screen
    P.getBoundingClientRect = function () {
      if (this.parentNode && this.parentNode.id === 'vows-cards') {
        const i = this.parentNode.children.indexOf(this);
        return { left: 40 + (i % 3) * 300, top: 120 + Math.floor(i / 3) * 200, width: 280, height: 180 };
      }
      if (this.id === 'btn-vows-back') return { left: 340, top: 1000, width: 200, height: 40 };
      return { left: 0, top: 0, width: 1280, height: 720 };
    };
    document.querySelectorAll = sel => sel === '.panel' ? __panelIds.map(id => document.getElementById(id)) : [];
    document.getElementById('vows').querySelectorAll = () =>
      document.getElementById('vows-cards').children.concat([document.getElementById('btn-vows-back')]);
    globalThis.__winLs = {};
    globalThis.addEventListener = function (t, fn) { (__winLs[t] = __winLs[t] || []).push(fn); };
  })()`);
  R('META.load(); GAME.init(); UI.hub();');

  const ok = R(`typeof HEAT === 'object' && typeof UI === 'object'`);
  check('heatui: sandbox booted with HEAT and UI', ok);
  if (!ok) return;

  R(`globalThis.__snap = JSON.stringify({ wins: META.wins, heat: META.heat, bestHeat: META.bestHeat });
     globalThis.__restore = () => { Object.assign(META, JSON.parse(__snap)); META.heat = {}; META.save(); };`);

  // ---------------- markup ----------------
  section('heatui: markup');
  check('index.html has #btn-vows in the hub menu after #btn-shrine',
    /id="btn-shrine"[^\n]*\n\s*<button id="btn-vows">VOWS OF TAPAS<\/button>/.test(html));
  check('index.html has the #vows panel with #vows-heat, #vows-cards and #btn-vows-back',
    /<div id="vows" class="panel solid hidden">/.test(html) && /id="vows-heat"/.test(html) &&
    /id="vows-cards"/.test(html) && /id="btn-vows-back"/.test(html));
  check('#vows is one of the .panel elements', panelIds.includes('vows'));

  // ---------------- hub gating ----------------
  section('heatui: hub button gating');
  const gate = R(`(() => {
    const o = {};
    META.wins = 0; UI.hub(); o.locked = document.getElementById('btn-vows').style.display;
    META.wins = 1; UI.hub(); o.open = document.getElementById('btn-vows').style.display;
    return o;
  })()`);
  check(`#btn-vows hidden before the first clear (${J(gate.locked)})`, gate.locked === 'none');
  check(`#btn-vows shown after the first clear (${J(gate.open)})`, gate.open === '');

  // ---------------- panel render ----------------
  section('heatui: panel render');
  const rend = R(`(() => {
    META.wins = 1; META.heat = {}; META.bestHeat = { gandiva: 7 };
    document.getElementById('btn-vows').click();
    const cards = document.getElementById('vows-cards').children;
    const head = document.getElementById('vows-heat').innerHTML;
    const vis = !document.getElementById('vows').classList.contains('hidden');
    const hubHidden = document.getElementById('hub').classList.contains('hidden');
    const c = cards.map(x => ({ cls: x.className, html: x.innerHTML }));
    return { n: cards.length, head, vis, hubHidden, c, names: DATA.HEAT.vows.map(v => v.name),
      d1: DATA.HEAT.vows.map(v => v.desc(1)), heat0: DATA.HEAT.vows.map(v => v.heat[0]), ranks: DATA.HEAT.vows.map(v => v.ranks) };
  })()`);
  check(`clicking #btn-vows shows the #vows panel and hides the hub (${rend.vis}/${rend.hubHidden})`, rend.vis && rend.hubHidden);
  check(`UI.vows() renders 12 cards in #vows-cards (${rend.n})`, rend.n === 12);
  check('every card carries the card + vow-card classes', rend.c.every(c => /\bcard\b/.test(c.cls) && /\bvow-card\b/.test(c.cls)));
  check('every card shows its vow name', rend.c.every((c, i) => c.html.includes(rend.names[i])));
  check('at rank 0 every card shows "Unsworn — " + desc(1)', rend.c.every((c, i) => c.html.includes('Unsworn — ' + rend.d1[i])));
  check('at rank 0 every card shows one ○ per rank and no ●',
    rend.c.every((c, i) => (c.html.match(/○/g) || []).length === rend.ranks[i] && !c.html.includes('●')));
  check('at rank 0 every card shows +N heat for rank 1', rend.c.every((c, i) => c.html.includes(`+${rend.heat0[i]} heat`)));
  check(`#vows-heat shows "Heat 0 · Punya ×1.00" (${rend.head})`, rend.head.includes('Heat 0 · Punya ×1.00'));
  check('#vows-heat shows best Heat per weapon with — when none',
    rend.head.includes('Best cleared — Khanda — · Gandiva 7 · Gada —'));

  // ---------------- rank cycling ----------------
  section('heatui: rank cycling');
  const cyc = R(`(() => {
    META.heat = {}; UI.vows();
    const idx = DATA.HEAT.vows.findIndex(v => v.id === 'haste');
    const steps = [];
    const save0 = META.save; let saves = 0;
    META.save = function () { saves++; return save0.apply(this, arguments); };
    try {
    for (let k = 0; k < 3; k++) {
      const before = saves;
      document.getElementById('vows-cards').children[idx].click();
      const card = document.getElementById('vows-cards').children[idx];
      const raw = STORE.get(META.KEY, null);
      const saved = raw ? JSON.parse(JSON.stringify(raw)) : null;
      steps.push({ saved1: saves - before === 1, rank: HEAT.rank('haste'), total: HEAT.total(), head: document.getElementById('vows-heat').innerHTML,
        html: card.innerHTML, n: document.getElementById('vows-cards').children.length,
        saved: saved && saved.heat ? (saved.heat.haste || 0) : null });
    }
    } finally { META.save = save0; }
    return { steps, d1: HEAT.vow('haste').desc(1), d2: HEAT.vow('haste').desc(2) };
  })()`);
  const st = cyc.steps;
  check(`three clicks on haste cycle rank 1 → 2 → 0 (${st.map(s => s.rank).join(' → ')})`, J(st.map(s => s.rank)) === J([1, 2, 0]));
  check(`totals go 3 → 6 → 0 (${st.map(s => s.total).join(' → ')})`, J(st.map(s => s.total)) === J([3, 6, 0]));
  check('the header re-renders with the new total and multiplier',
    st[0].head.includes('Heat 3 · Punya ×1.15') && st[1].head.includes('Heat 6 · Punya ×1.30') && st[2].head.includes('Heat 0 · Punya ×1.00'));
  check(`each click saves immediately (stored haste ${st.map(s => s.saved).join(' → ')})`, J(st.map(s => s.saved)) === J([1, 2, 0]) && st.every(s => s.saved1));
  check('rank 1 card: desc(1), ●○ and +3 heat; rank 2 card: desc(2), ●● and max',
    st[0].html.includes(cyc.d1) && !st[0].html.includes('Unsworn') && st[0].html.includes('●○') && st[0].html.includes('+3 heat') &&
    st[1].html.includes(cyc.d2) && st[1].html.includes('●●') && /\bmax\b/.test(st[1].html));
  check('re-render keeps 12 cards', st.every(s => s.n === 12));

  // ---------------- back + pad ----------------
  section('heatui: back button and pad navigation');
  check(`FOCUS.PANEL_BACK.vows === 'btn-vows-back'`, R(`FOCUS.PANEL_BACK.vows`) === 'btn-vows-back');
  check(`UI.PAD_HINTS.vows === 'menu'`, R(`UI.PAD_HINTS.vows`) === 'menu');
  const back = R(`(() => {
    UI.vows(); document.getElementById('btn-vows-back').click();
    return { state: GAME.state, hub: !document.getElementById('hub').classList.contains('hidden'),
      vows: document.getElementById('vows').classList.contains('hidden') };
  })()`);
  check(`clicking #btn-vows-back returns to the hub (${J(back)})`, back.state === 'hub' && back.hub && back.vows);

  const pad = R(`(() => {
    const o = {};
    const saved = { device: INPUT.device, idx: PAD.state.index, prev: PAD._prevPressed, aim: PAD._aimAng };
    try {
      META.wins = 1; META.heat = {};
      UI.hub(); UI.vows();
      FOCUS.clear(); FOCUS.lastIndex = {}; FOCUS.armed = false; FOCUS.rep = { dir: null, t: 0, next: 0 };
      const gp = { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', mapping: 'standard', connected: true,
        axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) };
      globalThis.navigator = { getGamepads: () => [gp] };
      PAD._aimAng = null; PAD._prevPressed = {}; PAD.state.index = -1; INPUT.device = 'pad';
      const press = (b, on) => { gp.buttons[PAD.CFG.BTN[b]] = { pressed: on, value: on ? 1 : 0 }; };
      const cards = () => document.getElementById('vows-cards').children;
      PAD.poll(); PAD.poll();
      o.panel = FOCUS.panel && FOCUS.panel.id;
      o.start = cards().indexOf(FOCUS.current);
      press('DDOWN', true); PAD.poll(); press('DDOWN', false); PAD.poll();
      o.afterDown = cards().indexOf(FOCUS.current);
      press('DDOWN', true); PAD.poll(); press('DDOWN', false); PAD.poll();
      o.afterDown2 = cards().indexOf(FOCUS.current);
      press('A', true); PAD.poll(); press('A', false); PAD.poll();
      o.confirmedId = DATA.HEAT.vows[o.afterDown2].id;
      o.confirmedRank = HEAT.rank(o.confirmedId);
      o.focusKept = cards().indexOf(FOCUS.current);
      o.ringOnNew = cards()[o.focusKept] && cards()[o.focusKept].classList.contains('pad-focus');
      press('B', true); PAD.poll(); press('B', false); PAD.poll();
      o.state = GAME.state;
      o.hub = !document.getElementById('hub').classList.contains('hidden');
      o.vowsHidden = document.getElementById('vows').classList.contains('hidden');
    } finally {
      delete globalThis.navigator;
      INPUT.device = saved.device; PAD.state.index = saved.idx; PAD._prevPressed = saved.prev; PAD._aimAng = saved.aim;
      FOCUS.clear();
      META.heat = {}; META.save();
    }
    return o;
  })()`);
  check(`pad: FOCUS takes the visible #vows panel and starts on the first card (${pad.panel}, ${pad.start})`, pad.panel === 'vows' && pad.start === 0);
  check(`pad: d-pad down moves focus between vow cards (0 → ${pad.afterDown} → ${pad.afterDown2})`, pad.afterDown === 3 && pad.afterDown2 === 6);
  check(`pad: A on a focused card swears its first rank (${pad.confirmedId} → ${pad.confirmedRank})`, pad.confirmedRank === 1);
  check(`pad: focus stays on the same card after the re-render (${pad.focusKept}, ring ${pad.ringOnNew})`, pad.focusKept === 6 && pad.ringOnNew);
  check(`pad: B returns to the hub (${pad.state}, hub ${pad.hub}, vows hidden ${pad.vowsHidden})`, pad.state === 'hub' && pad.hub && pad.vowsHidden);

  // ---------------- next run picks up the choice ----------------
  section('heatui: the panel choice drives the next run');
  const run = R(`(() => {
    META.wins = 1; META.heat = {};
    UI.hub(); document.getElementById('btn-vows').click();
    const idx = DATA.HEAT.vows.findIndex(v => v.id === 'pain');
    document.getElementById('vows-cards').children[idx].click();
    document.getElementById('vows-cards').children[idx].click();
    document.getElementById('btn-vows-back').click();
    document.getElementById('btn-begin').click();
    return { pain: HEAT.rank('pain'), dmg: GAME.heat && GAME.heat.enemyDmg, total: GAME.heatTotal, state: GAME.state };
  })()`);
  check(`pain 2 set in the panel, then BEGIN: GAME.heat.enemyDmg === 1.4 (${run.dmg}, Heat ${run.total})`, run.pain === 2 && run.dmg === 1.4 && run.total === 2);
  R(`__restore(); GAME.state = 'hub'; UI.hub();`);

  // ---------------- reverence lint over the new copy ----------------
  section('heatui: reverence lint');
  const HV = "kill(?:s|ed|ing)?|slay(?:s|ing)?|slew|slain|defeat(?:s|ed|ing)?|destroy(?:s|ed|ing)?|vanquish(?:es|ed|ing)?|conquer(?:s|ed|ing)?|murder(?:s|ed)?|crush(?:es|ed)?|beat(?:s|en)?|best(?:s|ed)?|overthrow(?:s|n)?|hunt(?:s|ed)?";
  const DEITY = "Yama|Dharmaraja|Hanuman|Agni|Indra|Vayu|Krishna|Durga|Shiva|Vishnu|Brahma|Saraswati";
  const lintA1 = new RegExp(`\\b(?:${HV})\\s+(?:the\\s+)?(?:(?:lord|god|great|mighty)\\s+)?(?:${DEITY})\\b`, 'i');
  const lintA2 = new RegExp(`\\b(?:${DEITY})(?:'s)?\\s+(?:is\\s+|was\\s+|lies\\s+|has\\s+been\\s+)?(?:slain|killed|defeated|destroyed|vanquished|dead|falls|fell)\\b`, 'i');
  const deityName = new RegExp(`\\b(?:${DEITY}|Lord of Death)\\b`, 'i');
  const block = (html.match(/<!-- VOWS OF TAPAS[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
  const lines = block.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
  const rendered = R(`(() => {
    META.wins = 1; META.heat = { pain: 2, wardens: 3, hourglass: 1 }; META.bestHeat = { khanda: 4 };
    UI.vows();
    const out = [document.getElementById('vows-heat').innerHTML];
    for (const c of document.getElementById('vows-cards').children) out.push(c.innerHTML);
    __restore(); UI.hub();
    return out.map(s => s.replace(/<[^>]+>/g, ' '));
  })()`);
  const corpus = lines.concat(['VOWS OF TAPAS'], rendered);
  const bad = corpus.filter(t => lintA1.test(t) || lintA2.test(t) || deityName.test(t));
  check(`#vows markup copy found (${lines.length} lines: ${J(lines)})`, lines.length >= 3 && lines.includes('VOWS OF TAPAS') && lines.includes('RETURN'));
  check(`no deity names or hostile framing in the panel copy or rendered cards${bad.length ? ' — ' + J(bad.slice(0, 4)) : ''}`, bad.length === 0);

  // ---------------- F4 god mode gated to dev builds (Task 2) ----------------
  section('heatui: F4 god mode is dev-only');
  const hasDev = R(`typeof GAME.devMode === 'function'`);
  check('GAME.devMode() exists', hasDev);
  if (hasDev) {
    const dm = R(`(() => {
      const had = { loc: 'location' in globalThis, locV: globalThis.location, nat: 'chakraNative' in window, natV: window.chakraNative };
      const o = {};
      try {
        delete globalThis.location; delete window.chakraNative; o.none = GAME.devMode();
        globalThis.location = { search: '' }; o.empty = GAME.devMode();
        globalThis.location = { search: '?dev=1' }; o.dev1 = GAME.devMode();
        globalThis.location = { search: '?x=1&dev=1' }; o.dev1b = GAME.devMode();
        globalThis.location = { search: '?dev=1&x=2' }; o.dev1c = GAME.devMode();
        globalThis.location = { search: '?dev=10' }; o.dev10 = GAME.devMode();
        globalThis.location = { search: '?nodev=1' }; o.nodev = GAME.devMode();
        globalThis.location = { search: '' };
        window.chakraNative = { isDesktop: true, isDev: true }; o.natDev = GAME.devMode();
        window.chakraNative = { isDesktop: true, isDev: false }; o.natRel = GAME.devMode();
        window.chakraNative = { isDesktop: true }; o.natNone = GAME.devMode();
        delete window.chakraNative;

        // F4 through every captured window keydown listener, as a browser would dispatch it
        const kds = (__winLs.keydown || []).slice();
        o.hasListener = kds.length > 0 && kds.every(fn => typeof fn === 'function');
        const f4 = () => { for (const fn of kds) fn({ key: 'F4', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, preventDefault() {}, stopPropagation() {} }); };
        INPUT.keys = {};
        GAME.godMode = false;
        globalThis.location = { search: '' }; f4(); o.relToggled = GAME.godMode;
        window.chakraNative = { isDesktop: true, isDev: false }; f4(); o.relNatToggled = GAME.godMode;
        delete window.chakraNative;
        globalThis.location = { search: '?dev=1' }; f4(); o.devOn = GAME.godMode; f4(); o.devOff = GAME.godMode;
        globalThis.location = { search: '' };
        window.chakraNative = { isDesktop: true, isDev: true }; f4(); o.natOn = GAME.godMode;
        delete window.chakraNative;
        GAME.godMode = true; o.direct = GAME.godMode === true;
      } finally {
        GAME.godMode = false; INPUT.keys = {};
        if (had.loc) globalThis.location = had.locV; else delete globalThis.location;
        if (had.nat) window.chakraNative = had.natV; else delete window.chakraNative;
      }
      return o;
    })()`);
    check(`devMode false with no dev flag (${dm.none}, ${dm.empty})`, dm.none === false && dm.empty === false);
    check(`devMode true for ?dev=1, ?x=1&dev=1 and ?dev=1&x=2 (${dm.dev1}, ${dm.dev1b}, ${dm.dev1c})`, dm.dev1 === true && dm.dev1b === true && dm.dev1c === true);
    check(`devMode false for ?dev=10 and ?nodev=1 (${dm.dev10}, ${dm.nodev})`, dm.dev10 === false && dm.nodev === false);
    check(`devMode follows chakraNative.isDev (true ${dm.natDev}, false ${dm.natRel}, absent ${dm.natNone})`, dm.natDev === true && dm.natRel === false && dm.natNone === false);
    check('the keydown listener was captured', dm.hasListener);
    check(`F4 does nothing in release builds (web ${dm.relToggled}, desktop ${dm.relNatToggled})`, dm.relToggled === false && dm.relNatToggled === false);
    check(`F4 toggles god mode with ?dev=1 (${dm.devOn} then ${dm.devOff})`, dm.devOn === true && dm.devOff === false);
    check(`F4 toggles god mode in an unpackaged desktop build (${dm.natOn})`, dm.natOn === true);
    check('GAME.godMode still works when set directly', dm.direct);
  }

  const gsrc = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8');
  const msrc = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const psrc = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
  check("js/game.js guards the F4 branch with k === 'f4' && this.devMode()", /k === 'f4' && this\.devMode\(\)/.test(gsrc));
  check("electron/main.js registers 'app:isDev' returning !app.isPackaged",
    /ipcMain\.on\('app:isDev',\s*\(event\)\s*=>\s*\{\s*event\.returnValue = !app\.isPackaged;\s*\}\)/.test(msrc));
  check("'app:isDev' is registered at module top level (not inside a window or ready callback)",
    /^ipcMain\.on\('app:isDev'/m.test(msrc));
  check("electron/preload.js exposes isDev from ipcRenderer.sendSync('app:isDev')",
    /isDev:\s*ipcRenderer\.sendSync\('app:isDev'\)\s*===\s*true/.test(psrc));
};
