// ============================================================
// CHAKRAVYUHA — ui.js : DOM overlays — hub, boon choices, shop,
// Path of Dharma (meta), armory, codex, death & victory screens.
// ============================================================
'use strict';

const UI = {
  DEVANAGARI: {
    gods:   { hanuman: 'हनुमान', agni: 'अग्नि', indra: 'इन्द्र', vayu: 'वायु', krishna: 'कृष्ण', durga: 'दुर्गा' },
    biomes: { naraka: 'नरक', patala: 'पाताल', ranabhoomi: 'रणभूमि', vaitarani: 'वैतरणी' },
    bosses: { tataka: 'ताटका', ahiravana: 'अहिरावण', kumbhakarna: 'कुम्भकर्ण', yama: 'यम धर्मराज' },
    amrit: 'अमृत',
  },

  el(id) { return document.getElementById(id); },
  show(id) { this.el(id).classList.remove('hidden'); },
  hide(id) { this.el(id).classList.add('hidden'); },
  hideAll() {
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  },

  // ---------- controller pad-hint footers (Phase 05.2 Plan 02, D-09) ----------
  PAD_HINTS: {
    hub: null, boonpick: 'boon', shop: 'shop', shrine: 'menu', armory: 'menu',
    codex: 'codex', death: 'continue', victory: 'continue', pause: 'pause', settings: 'settings',
    ctest: 'ctest',
  },
  ensurePadHints() {
    if (this._padHintsDone) return;
    this._padHintsDone = true;
    if (typeof document === 'undefined') return;
    for (const panelId of Object.keys(this.PAD_HINTS)) {
      const key = this.PAD_HINTS[panelId];
      if (!key) continue;
      const panel = this.el(panelId);
      if (!panel) continue;
      const div = document.createElement('div');
      div.className = 'pad-hint';
      if (typeof div.setAttribute === 'function') div.setAttribute('data-glyph-hint', key);
      else { div.dataset = div.dataset || {}; div.dataset.glyphHint = key; }
      panel.appendChild(div);
    }
    if (typeof GLYPHS !== 'undefined') GLYPHS.refresh(true);
  },

  // ---------- transient banners ----------
  banner(text, color = '#ffd34d') {
    const b = this.el('banner');
    b.textContent = text;
    b.style.color = color;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; // restart animation
    b.style.animation = '';
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.add('hidden'), 2200);
  },

  biomeTitle(biome) {
    const t = this.el('biome-title');
    t.innerHTML = `<div class="bt-name">${biome.name}</div><div class="bt-dev">${this.DEVANAGARI.biomes[biome.id] || ''}</div><div class="bt-sub">${biome.sub}</div>`;
    t.style.color = biome.accent;
    t.classList.remove('hidden');
    clearTimeout(this._biomeT);
    this._biomeT = setTimeout(() => t.classList.add('hidden'), 2800);
  },

  bossIntro(def) {
    const t = this.el('boss-intro');
    t.innerHTML = `<div class="bt-name" style="color:${def.color}">${def.name}</div>
      <div class="bt-dev" style="color:${def.color}">${this.DEVANAGARI.bosses[def.id] || ''}</div>
      <div class="bt-sub">${def.sub}</div><div class="bt-quote">${def.intro}</div>`;
    t.classList.remove('hidden');
    clearTimeout(this._bossT);
    this._bossT = setTimeout(() => t.classList.add('hidden'), 4200);
  },

  // ---------- hub (the Banyan at the Edge of Worlds) ----------
  hub() {
    this.bindSettingsEntryPoints();
    this.ensurePadHints();
    this.hideAll();
    GAME.state = 'hub';
    AUDIO.stopDrone();
    this.el('hub-punya').textContent = `ॐ ${U.fmt(META.punya)} punya`;
    this.el('hub-narada').textContent = U.choice(DATA.NARADA_LINES);
    const s = [];
    if (META.runs > 0) s.push(`${META.runs} ascent${META.runs > 1 ? 's' : ''}`);
    if (META.wins > 0) s.push(`${META.wins} escape${META.wins > 1 ? 's' : ''}`);
    if (META.bestTime > 0) s.push(`best ${Math.floor(META.bestTime / 60)}:${String(Math.floor(META.bestTime % 60)).padStart(2, '0')}`);
    this.el('hub-stats').textContent = s.join('  ·  ');
    if (typeof GLYPHS !== 'undefined') GLYPHS.refresh(true);
    this.show('hub');
  },

  // ---------- boon offering ----------
  pickGod() {
    const P = GAME.player;
    const gods = U.shuffle(Object.keys(DATA.GODS));
    for (const g of gods) {
      if (this.offerableBoons(g).length > 0) return g;
    }
    return null;
  },

  offerableBoons(godId) {
    const P = GAME.player;
    return DATA.BOONS.filter(b => b.god === godId && !P.has(b.id) &&
      (b.slot === 'passive' || !P.slots[b.slot]));
  },

  rollRarity() {
    const bonus = META.rarityBonus();
    if (U.chance(0.06 + bonus / 2)) return 2;
    if (U.chance(0.22 + bonus)) return 1;
    return 0;
  },

  offerBoon(forceGod) {
    const god = forceGod || this.pickGod();
    if (!god) { // everything owned: amrit fallback
      if (GAME.player.allBoons().some(b => b.rarity < 2)) return this.offerAmrit();
      this.clearGodPresence();
      GAME.player.mudra += 60; this.banner('+60 MUDRA (the gods have given all they can)', '#ffcf5c');
      return;
    }
    const g = DATA.GODS[god];
    const pool = U.shuffle(this.offerableBoons(god)).slice(0, META.boonChoices());
    const duo = GAME.player.duoOfferFor(god);
    if (duo) { if (pool.length >= META.boonChoices()) pool.pop(); pool.unshift(duo); }
    GAME.state = 'choosing';
    this.el('boon-god').style.cssText = '--god:' + g.color;
    this.el('boon-god').innerHTML =
      `<span class="god-sym">${g.sym}</span><div><div class="god-name" style="color:${g.color}">${g.name}</div>
       <div class="god-dev">${this.DEVANAGARI.gods[g.id] || ''}</div>
       <div class="god-title">${g.title}</div>${this._dlg() ? '' : `<div class="god-greet">${g.greet}</div>`}</div>`;
    const cards = this.el('boon-cards');
    cards.innerHTML = '';
    for (const def of pool) {
      const rarity = this.rollRarity();
      const R = DATA.RARITIES[rarity];
      const v = def.base * R.mult;
      const card = document.createElement('div');
      card.className = ['card', 'boon-card', 'god-' + def.god, 'rarity-' + rarity].join(' ');
      card.style.cssText = '--god:' + g.color + ';--rarity:' + R.color;
      card.style.borderColor = R.color;
      if (def.duo) {
        const gA = DATA.GODS[def.gods[0]], gB = DATA.GODS[def.gods[1]];
        card.className = ['card', 'boon-card', 'duo', 'god-' + def.gods[0], 'rarity-' + rarity].join(' ');
        card.style.cssText = '--god:' + gA.color + ';--god2:' + gB.color + ';--rarity:' + R.color;
        card.duo = true;
        card.innerHTML = `<div class="card-rarity" style="color:${R.color}">DUO · ${gA.sym} ${gA.name} + ${gB.sym} ${gB.name} · ${R.name}</div>
          <div class="card-name" style="color:${gA.color}">${def.name}</div>
          <div class="card-desc">${def.desc(v)}</div>`;
      } else {
        card.innerHTML = `<div class="card-rarity" style="color:${R.color}">${R.name} · ${def.slot.toUpperCase()}</div>
          <div class="card-name" style="color:${g.color}">${def.name}</div>
          <div class="card-desc">${def.desc(v)}</div>`;
      }
      card.onclick = () => {
        GAME.player.addBoon(def, rarity);
        this.hide('boonpick');
        GAME.state = 'cleared';
      };
      cards.appendChild(card);
    }
    this.presentGod(god, duo);
    this.show('boonpick');
  },

  offerAmrit() {
    const P = GAME.player;
    this.clearGodPresence();
    const upgradable = P.allBoons().filter(b => b.rarity < 2);
    if (!upgradable.length) {
      P.mudra += 50; this.banner('+50 MUDRA (nothing left to refine)', '#ffcf5c');
      return;
    }
    GAME.state = 'choosing';
    this.el('boon-god').style.cssText = '--god:#5cb8ff';
    this.el('boon-god').innerHTML =
      `<span class="god-sym">◈</span><div><div class="god-name" style="color:#5cb8ff">Amrit</div>
       <div class="god-dev">${this.DEVANAGARI.amrit}</div>
       <div class="god-title">Nectar of the Churning Ocean</div>
       <div class="god-greet">"One drop, and the divine grows more divine still."</div></div>`;
    const cards = this.el('boon-cards');
    cards.innerHTML = '';
    for (const entry of U.shuffle(upgradable).slice(0, 3)) {
      const g = DATA.GODS[entry.def.god];
      const next = DATA.RARITIES[entry.rarity + 1];
      const v = entry.def.base * next.mult;
      const card = document.createElement('div');
      card.className = ['card', 'boon-card', 'god-' + entry.def.god, 'rarity-' + (entry.rarity + 1)].join(' ');
      card.style.cssText = '--god:' + g.color + ';--rarity:' + next.color;
      card.style.borderColor = next.color;
      card.innerHTML = `<div class="card-rarity" style="color:${next.color}">→ ${next.name}</div>
        <div class="card-name" style="color:${g.color}">${entry.def.name}</div>
        <div class="card-desc">${entry.def.desc(v)}</div>`;
      card.onclick = () => {
        GAME.player.upgradeBoon(entry);
        AUDIO.sfx('boon');
        this.hide('boonpick');
        GAME.state = 'cleared';
      };
      cards.appendChild(card);
    }
    this.show('boonpick');
  },

  // ---------- god presence (Phase 05.5) ----------
  _portraitOk: {},
  _portraitImgs: {},
  _talk: null,
  _talkToken: 0,

  // Resolved via the shared `window` object (present from boot) rather than a
  // bare `typeof DIALOGUE` check: once these methods are compiled and called a
  // number of times before dialogue.js has loaded (as happens in test/smoke.js,
  // which — per D-12 — deliberately exercises the earlier full-run sims without
  // it), V8's free-variable resolution for a *later*-declared top-level `const`
  // can stay permanently stale even after that `const` exists. A plain property
  // read on the always-present `window` object does not have this problem.
  // dialogue.js exports `window.DIALOGUE` for exactly this reason (see D-12).
  _dlg() {
    return (typeof window !== 'undefined' && window.DIALOGUE) ? window.DIALOGUE : undefined;
  },

  preloadGodPortraits() {
    const D = this._dlg();
    if (!D || this._portraitsPreloaded) return;
    this._portraitsPreloaded = true;
    for (const id of Object.keys(DATA.GODS)) {
      const img = document.createElement('img');
      img.onload = () => { this._portraitOk[id] = true; };
      img.onerror = () => { this._portraitOk[id] = false; };
      img.src = D.portraitPath(id);
      this._portraitImgs[id] = img;
    }
  },

  presentGod(godId, duo) {
    this.preloadGodPortraits();
    this.bindGodDialogueKeys();
    const D = this._dlg();
    const g = DATA.GODS[godId];
    const pick = this.el('boonpick');
    const wrap = this.el('god-portrait-wrap');
    const partnerId = duo ? duo.gods.find(x => x !== godId) : null;
    wrap.style.cssText = '--god:' + g.color + (duo ? ';--god2:' + DATA.GODS[partnerId].color : '');

    if (this._portraitOk[godId] === true) {
      pick.classList.add('has-portrait');
      this.el('god-portrait').src = D.portraitPath(godId);
      this.el('god-portrait').alt = g.name;
      wrap.classList.remove('hidden');
      wrap.classList.remove('enter'); void wrap.offsetWidth; wrap.classList.add('enter');
    } else {
      pick.classList.remove('has-portrait');
      wrap.classList.add('hidden');
    }

    if (duo && this._portraitOk[partnerId] === true) {
      this.el('god-portrait-2').src = D.portraitPath(partnerId);
      this.el('god-portrait-2').classList.remove('hidden');
    } else {
      this.el('god-portrait-2').classList.add('hidden');
    }

    let line = null;
    if (D) {
      const ctx = D.buildContext(godId, { duo });
      line = D.select(godId, ctx, D.mem());
      if (line) D.record(line, godId);
    }
    const beats = line
      ? D.beats(line)
      : [{ s: godId, t: String(g.greet || '').replace(/^"|"$/g, '') }];
    this._lastGodLine = line;
    this.typeGodDialogue(beats);
  },

  clearGodPresence() {
    this._talkToken++;
    this._talk = null;
    this.el('god-portrait-wrap').classList.add('hidden');
    this.el('god-dialogue').classList.add('hidden');
    this.el('god-portrait-2').classList.add('hidden');
    this.el('boonpick').classList.remove('has-portrait');
    this.el('boon-cards').classList.remove('awaiting');
    this.el('god-dialogue-hint').classList.add('hidden');
  },

  typeGodDialogue(beats) {
    const token = ++this._talkToken;
    this.show('god-dialogue');
    const lines = this.el('god-dialogue-lines');
    lines.innerHTML = '';
    this.el('boon-cards').classList.add('awaiting');
    const spans = [];
    for (const b of beats) {
      const div = document.createElement('div');
      div.className = 'dlg-beat ' + b.s;
      if (b.s !== 'abhimanyu' && DATA.GODS[b.s]) div.style.cssText = '--god:' + DATA.GODS[b.s].color;
      const D = this._dlg();
      const speaker = document.createElement('span');
      speaker.className = 'dlg-speaker';
      speaker.textContent = D
        ? D.speakerName(b.s)
        : (b.s === 'abhimanyu' ? 'Abhimanyu' : (DATA.GODS[b.s] ? DATA.GODS[b.s].name : b.s));
      const text = document.createElement('span');
      text.className = 'dlg-text';
      text.textContent = '';
      div.appendChild(speaker);
      div.appendChild(text);
      lines.appendChild(div);
      spans.push(text);
    }
    this._talk = { token, beats, spans, bi: 0, ci: 0, done: false };

    const hintEl = this.el('god-dialogue-hint');
    if (typeof GLYPHS !== 'undefined') {
      hintEl.innerHTML = GLYPHS.html('confirm') + ' to continue';
      hintEl.classList.remove('hidden');
    } else {
      hintEl.classList.add('hidden');
    }

    this.el('boonpick').onclick = () => { if (this.godDialogueBusy()) this.skipGodDialogue(); };
    this.el('god-dialogue-skip').onclick = () => this.skipGodDialogue();

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return this.skipGodDialogue();
    }

    const tick = () => {
      const t = this._talk;
      if (!t || t.token !== token || t.done) return;
      t.ci += 3;
      const beat = t.beats[t.bi];
      t.spans[t.bi].textContent = beat.t.slice(0, t.ci);
      let delay = 33;
      if (t.ci >= beat.t.length) {
        t.bi++;
        t.ci = 0;
        delay = 350;
        if (t.bi >= t.beats.length) { this._finishTalk(); return; }
      }
      setTimeout(tick, delay);
    };
    setTimeout(tick, 200);
  },

  skipGodDialogue() {
    if (!this._talk || this._talk.done) return;
    const t = this._talk;
    for (let i = 0; i < t.beats.length; i++) t.spans[i].textContent = t.beats[i].t;
    this._finishTalk();
  },

  _finishTalk() {
    this._talk.done = true;
    this.el('boon-cards').classList.remove('awaiting');
    this.el('god-dialogue-hint').classList.add('hidden');
  },

  godDialogueBusy() {
    return !!(this._talk && !this._talk.done);
  },

  bindGodDialogueKeys() {
    if (this._godKeysBound) return;
    this._godKeysBound = true;
    window.addEventListener('keydown', e => {
      const k = (e.key || '').toLowerCase();
      if ((k === 'enter' || k === ' ' || k === 'escape') && this.godDialogueBusy() &&
          !this.el('boonpick').classList.contains('hidden')) {
        if (e.preventDefault) e.preventDefault();
        this.skipGodDialogue();
      }
    });
  },

  noteGodRunEnd(result) {
    const D = this._dlg();
    if (!D) return;
    D.noteRunEnd({
      result,
      biome: GAME.biome ? GAME.biome.id : null,
      boss: (GAME.bossRef && !GAME.bossRef.dead) ? GAME.bossRef.type : (result === 'victory' ? 'yama' : null),
      run: META.runs,
    });
  },

  renderCodexGods(list) {
    const D = this._dlg();
    if (!D) return;
    this.preloadGodPortraits();
    const met = D.metGods();
    const section = document.createElement('div');
    section.className = 'codex-gods';
    const heading = document.createElement('div');
    heading.className = 'codex-t';
    heading.textContent = 'The Devas Who Answer';
    const headingSub = document.createElement('span');
    headingSub.className = 'codex-s';
    headingSub.textContent = '— your patrons in the wheel';
    heading.appendChild(headingSub);
    section.appendChild(heading);

    for (const id of Object.keys(DATA.GODS)) {
      const g = DATA.GODS[id];
      const isMet = met.includes(id);
      const row = document.createElement('div');
      row.className = 'codex-god';
      if (!isMet) row.classList.add('unmet');
      row.style.cssText = '--god:' + g.color;

      if (isMet) {
        let icon;
        if (this._portraitOk[id] === true) {
          icon = document.createElement('img');
          icon.className = 'codex-god-thumb';
          icon.src = D.portraitPath(id);
          icon.alt = g.name;
          icon.onerror = () => icon.classList.add('hidden');
        } else {
          icon = document.createElement('div');
          icon.className = 'codex-god-sym';
          icon.textContent = g.sym;
        }
        row.appendChild(icon);

        const col = document.createElement('div');
        const t = document.createElement('div');
        t.className = 'codex-t';
        t.textContent = g.name;
        const dev = document.createElement('div');
        dev.className = 'codex-god-dev';
        dev.textContent = this.DEVANAGARI.gods[id] || '';
        const title = document.createElement('div');
        title.className = 'codex-s';
        title.textContent = g.title;
        const lore = D.LORE[id];
        const d = document.createElement('div');
        d.className = 'codex-d';
        d.textContent = lore ? (lore.d + ' (' + lore.s + ')') : '';
        const metCount = document.createElement('div');
        metCount.className = 'codex-s';
        const n = D.mem().met[id] | 0;
        metCount.textContent = 'Met ' + n + ' time' + (n === 1 ? '' : 's');
        col.appendChild(t);
        col.appendChild(dev);
        col.appendChild(title);
        col.appendChild(d);
        col.appendChild(metCount);
        row.appendChild(col);
      } else {
        const icon = document.createElement('div');
        icon.className = 'codex-god-sym';
        icon.textContent = '?';
        row.appendChild(icon);

        const col = document.createElement('div');
        const t = document.createElement('div');
        t.className = 'codex-t';
        t.textContent = 'Not yet met';
        const d = document.createElement('div');
        d.className = 'codex-d';
        d.textContent = 'A god who has not yet answered you in the wheel.';
        col.appendChild(t);
        col.appendChild(d);
        row.appendChild(col);
      }
      section.appendChild(row);
    }
    list.appendChild(section);
  },

  // ---------- Kubera's shop ----------
  openShop() {
    GAME.state = 'choosing';
    const stock = U.shuffle(DATA.SHOP_ITEMS).slice(0, 3);
    this.renderShop(stock);
    this.show('shop');
  },

  renderShop(stock) {
    const P = GAME.player;
    this.el('shop-mudra').textContent = `¤ ${U.fmt(P.mudra)} mudra`;
    const cards = this.el('shop-cards');
    cards.innerHTML = '';
    for (const item of stock) {
      const afford = P.mudra >= item.cost;
      const card = document.createElement('div');
      card.className = 'card shop-card' + (afford ? '' : ' disabled');
      card.style.cssText = '--god:#ffcf5c';
      card.innerHTML = `<div class="card-name">${item.name}</div>
        <div class="card-desc">${item.desc}</div>
        <div class="card-cost">¤ ${item.cost}</div>`;
      card.onclick = () => {
        if (P.mudra < item.cost) { AUDIO.sfx('deny'); return; }
        P.mudra -= item.cost;
        AUDIO.sfx('buy');
        this.applyShopItem(item.id);
        stock.splice(stock.indexOf(item), 1);
        if (item.id === 'boon' || item.id === 'amrit') return; // those open their own panel
        this.renderShop(stock);
      };
      cards.appendChild(card);
    }
  },

  applyShopItem(id) {
    const P = GAME.player;
    switch (id) {
      case 'heal': {
        const heal = Math.round(P.maxhp * 0.35);
        P.hp = Math.min(P.maxhp, P.hp + heal);
        dmgText(P.x, P.y - 30, '+' + heal, '#7fdcb7', 20);
        AUDIO.sfx('heal'); break;
      }
      case 'maxhp':
        P.maxhp += 25; P.hp = Math.min(P.maxhp, P.hp + 25);
        AUDIO.sfx('heal'); break;
      case 'boon':
        this.hide('shop');
        this.offerBoon(); break;
      case 'amrit':
        this.hide('shop');
        this.offerAmrit(); break;
      case 'revive':
        P.defiance = Math.min(META.defianceCount(), P.defiance + 1);
        AUDIO.sfx('defiance'); break;
    }
  },

  closeShop() {
    this.hide('shop');
    GAME.state = 'cleared';
  },

  // ---------- Path of Dharma (meta shrine) ----------
  shrine() {
    this.hideAll();
    this.el('shrine-punya').textContent = `ॐ ${U.fmt(META.punya)} punya`;
    const cards = this.el('shrine-cards');
    cards.innerHTML = '';
    for (const def of DATA.META) {
      const r = META.rank(def.id);
      const maxed = r >= def.max;
      const cost = maxed ? null : def.cost[r];
      const afford = !maxed && META.punya >= cost;
      const card = document.createElement('div');
      card.className = 'card meta-card' + (maxed ? ' maxed' : (afford ? '' : ' disabled'));
      card.style.cssText = '--god:#c77dff';
      const pips = Array.from({ length: def.max }, (_, i) =>
        `<span class="pip ${i < r ? 'full' : ''}"></span>`).join('');
      card.innerHTML = `<div class="card-name">${def.name} <span class="pips">${pips}</span></div>
        <div class="card-desc">${def.desc(Math.min(r + 1, def.max))}</div>
        <div class="card-lore">${def.lore}</div>
        <div class="card-cost">${maxed ? 'PERFECTED' : 'ॐ ' + cost}</div>`;
      card.onclick = () => {
        if (META.buy(def)) { AUDIO.sfx('buy'); this.shrine(); }
        else AUDIO.sfx('deny');
      };
      cards.appendChild(card);
    }
    this.show('shrine');
  },

  // ---------- armory ----------
  armory() {
    this.hideAll();
    this.el('armory-punya').textContent = `ॐ ${U.fmt(META.punya)} punya`;
    const cards = this.el('armory-cards');
    cards.innerHTML = '';
    for (const id of Object.keys(DATA.WEAPONS)) {
      const w = DATA.WEAPONS[id];
      const owned = META.weapons.includes(id);
      const selected = META.lastWeapon === id;
      const card = document.createElement('div');
      card.className = 'card weapon-card' + (selected ? ' selected' : '') + (owned ? '' : ' locked');
      card.style.cssText = '--god:#ffd34d';
      card.innerHTML = `<div class="card-name">${w.sym} ${w.name}</div>
        <div class="card-desc">${w.blurb}</div>
        <div class="card-cost">${owned ? (selected ? 'WIELDED' : 'Select') : 'Unlock — ॐ ' + w.unlock}</div>`;
      card.onclick = () => {
        if (owned) {
          META.lastWeapon = id; META.save(); AUDIO.sfx('click'); this.armory();
        } else if (META.unlockWeapon(id)) {
          AUDIO.sfx('buy'); this.armory();
        } else AUDIO.sfx('deny');
      };
      cards.appendChild(card);
    }
    this.show('armory');
  },

  // ---------- codex (the Pothi) ----------
  codex() {
    this.hideAll();
    META.codexSeen = true; META.save();
    const list = this.el('codex-list');
    list.innerHTML = '';
    this.renderCodexGods(list);
    for (const e of DATA.CODEX) {
      const div = document.createElement('div');
      div.className = 'codex-entry';
      div.innerHTML = `<div class="codex-t">${e.t} <span class="codex-s">— ${e.s}</span></div>
        <div class="codex-d">${e.d}</div>`;
      list.appendChild(div);
    }
    this.show('codex');
  },

  // ---------- death & victory ----------
  death() {
    this.noteGodRunEnd('death');
    this.hideAll();
    const line = U.choice(DATA.DEATH_LINES).replace('%n', META.deaths);
    this.el('death-line').textContent = line;
    this.el('death-stats').innerHTML = this.runStatsHtml(
      DATA.EPITAPHS[GAME.biomeIdx] || DATA.EPITAPHS[0]);
    this.show('death');
  },

  victory() {
    this.noteGodRunEnd('victory');
    this.hideAll();
    this.el('victory-line').textContent = U.choice(DATA.VICTORY_LINES);
    this.el('victory-stats').innerHTML = this.runStatsHtml('BROKE THE CHAKRAVYUHA');
    this.show('victory');
  },

  runStatsHtml(title) {
    const G = GAME, P = G.player;
    const t = Math.floor(G.runTime);
    return `<div class="rs-title">${title}</div>
      <div class="rs-row"><span>Chambers cleared</span><b>${G.totalRooms}</b></div>
      <div class="rs-row"><span>Foes slain</span><b>${G.kills}</b></div>
      <div class="rs-row"><span>Time</span><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b></div>
      <div class="rs-row"><span>Punya earned</span><b style="color:#c77dff">ॐ ${P.punyaRun}</b></div>
      <div class="rs-row"><span>Boons gathered</span><b>${P.allBoons().length}</b></div>`;
  },

  // ---------- pause ----------
  pause() {
    if (GAME.state !== 'combat' && GAME.state !== 'cleared') return;
    GAME.prePause = GAME.state;
    GAME.state = 'paused';
    this.show('pause');
  },
  resume() {
    this.hide('pause');
    GAME.state = GAME.prePause || 'combat';
  },

  // ---------- settings (Phase 5 Plan 3) ----------
  settings(returnTo) {
    GAME._settingsReturn = returnTo; // 'hub' | 'pause'
    this.renderSettings();
    this.show('settings');
  },

  closeSettings() {
    this.hide('settings');
    if (GAME._settingsReturn === 'pause') this.show('pause');
    else this.hub();
  },

  renderSettings() {
    const master = this.el('settings-master');
    master.value = Math.round(AUDIO.getVolume('master') * 100);
    master.oninput = e => AUDIO.setVolume('master', e.target.value / 100);

    const music = this.el('settings-music');
    music.value = Math.round(AUDIO.getVolume('music') * 100);
    music.oninput = e => AUDIO.setVolume('music', e.target.value / 100);

    const sfx = this.el('settings-sfx');
    sfx.value = Math.round(AUDIO.getVolume('sfx') * 100);
    sfx.oninput = e => AUDIO.setVolume('sfx', e.target.value / 100);

    const fs = this.el('settings-fullscreen');
    fs.onclick = () => this.toggleFullscreen();

    const res = this.el('settings-resolution');
    res.value = SETTINGS.get('resolutionMode');
    res.onchange = e => SETTINGS.set('resolutionMode', e.target.value);

    const shake = this.el('settings-shake');
    shake.checked = !!SETTINGS.get('screenShake');
    shake.onchange = e => SETTINGS.set('screenShake', !!e.target.checked);

    const flash = this.el('settings-flash');
    flash.checked = !!SETTINGS.get('screenFlash');
    flash.onchange = e => SETTINGS.set('screenFlash', !!e.target.checked);

    const list = this.el('settings-rebind-list');
    list.innerHTML = '';
    const actions = ['moveUp', 'moveDown', 'moveLeft', 'moveRight', 'dash', 'cast', 'special', 'pause'];
    for (const action of actions) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      const label = document.createElement('label');
      label.textContent = action;
      const btn = document.createElement('button');
      btn.textContent = (INPUT.bindings[action] || []).join('/').toUpperCase() || '—';
      btn.onclick = () => this.startRebind(action);
      row.appendChild(label);
      row.appendChild(btn);
      list.appendChild(row);
    }

    this.renderControllerSettings();
  },

  // ---------- controller settings: rumble/intensity/aim-assist/pad rebinding (Phase 05.2 Plan 04, D-14) ----------
  PAD_ACTION_LABELS: { attack: 'Attack', special: 'Special', dash: 'Dash', cast: 'Astra (cast)', pause: 'Pause' },

  renderControllerSettings() {
    const rumble = this.el('settings-rumble');
    rumble.checked = !!SETTINGS.get('rumble');
    rumble.onchange = e => SETTINGS.set('rumble', !!e.target.checked);

    const intensity = this.el('settings-rumble-intensity');
    intensity.value = Math.round(SETTINGS.get('rumbleIntensity') * 100);
    intensity.oninput = e => SETTINGS.set('rumbleIntensity', e.target.value / 100);

    const aimAssist = this.el('settings-aimassist');
    aimAssist.checked = !!SETTINGS.get('aimAssist');
    aimAssist.onchange = e => SETTINGS.set('aimAssist', !!e.target.checked);

    if (typeof PAD !== 'undefined') {
      if (!PAD.bindings) PAD.loadBindings();
      const padList = this.el('settings-pad-rebind-list');
      padList.innerHTML = '';
      const fam = PAD.family;
      for (const action of PAD.ACTIONS) {
        const row = document.createElement('div');
        row.className = 'settings-row';
        const label = document.createElement('label');
        label.textContent = this.PAD_ACTION_LABELS[action] || action;
        const btn = document.createElement('button');
        if (this._padRebindAction === action) {
          btn.textContent = 'Press a button…';
        } else if (typeof GLYPHS !== 'undefined') {
          btn.innerHTML = (PAD.bindings[action] || []).map(b => GLYPHS.tokenHtml(GLYPHS.padToken(b, fam))).join('');
        }
        btn.onclick = () => this.startPadRebind(action);
        row.appendChild(label);
        row.appendChild(btn);
        padList.appendChild(row);
      }
    }

    const reset = this.el('settings-pad-reset');
    reset.onclick = () => this.resetPadBindings();

    const ctestBtn = this.el('btn-settings-ctest');
    ctestBtn.onclick = () => { AUDIO.sfx('click'); this.controllerTest(); };
  },

  startPadRebind(action) {
    this._padRebindAction = action;
    this.renderControllerSettings();
    PAD.captureNext(btn => {
      PAD.bindings = PAD.applyPadRebind(PAD.bindings, action, btn);
      PAD.saveBindings();
      this._padRebindAction = null;
      this.renderControllerSettings();
      if (typeof GLYPHS !== 'undefined') GLYPHS.refresh(true);
    }, 5);
    setTimeout(() => {
      if (this._padRebindAction === action) {
        this._padRebindAction = null;
        this.renderControllerSettings();
      }
    }, 5200);
  },

  resetPadBindings() {
    PAD.resetBindings();
    this.renderControllerSettings();
    if (typeof GLYPHS !== 'undefined') GLYPHS.refresh(true);
  },

  // ---------- controller test screen (Phase 05.2 Plan 04, D-15/PAD-09) ----------
  // Pure: view-model of a PAD.state-shaped snapshot. Never touches the DOM.
  ctestModel(s) {
    const state = s || {};
    const family = state.family || 'generic';
    const buttons = state.buttons || {};
    const btns = PAD.BUTTON_NAMES.map(n => {
      const tok = GLYPHS.padToken(n, family);
      return { name: n, label: tok.label, shape: tok.shape, kind: tok.kind, pressed: !!buttons[n] };
    });
    const axes = state.axes || [];
    const pct = (i) => Math.round((50 + (axes[i] || 0) * 50) * 10) / 10;
    const triggers = state.triggers || {};
    const connected = !!state.connected;
    const pads = state.pads || [];
    const idx = typeof state.index === 'number' ? state.index : -1;
    const status = connected
      ? `${state.label || 'Controller'} · ${family.toUpperCase()} · mapping: ${state.mapping || 'none'} · pad ${idx + 1} of ${pads.length || 1}`
      : 'No controller detected — press any button on it';
    const warning = connected && state.mapping !== 'standard'
      ? 'Non-standard mapping: buttons may be mislabeled. Try USB, or update the browser/OS.'
      : '';
    return {
      connected, showHelp: !connected, status, id: state.id || '', warning,
      buttons: btns,
      left: { x: pct(0), y: pct(1) }, right: { x: pct(2), y: pct(3) },
      lt: (triggers.LT || 0).toFixed(2), rt: (triggers.RT || 0).toFixed(2),
      rumble: state.rumble || 'unknown',
    };
  },

  // Pure: hold-to-act timers for B/Start (-> 'back') and Y (-> 'rumble'). `hold` is the previous
  // { B, Start, Y } timer map (-1 = already fired this hold, reset to 0 on release).
  ctestHold(hold, buttons, dt, need = 1) {
    const h = { B: (hold && hold.B) || 0, Start: (hold && hold.Start) || 0, Y: (hold && hold.Y) || 0 };
    let action = null;
    const track = (name, act) => {
      if (!(buttons && buttons[name])) { h[name] = 0; return; }
      if (h[name] === -1) return; // already fired, still held
      h[name] = (h[name] || 0) + (dt || 0);
      if (h[name] >= need) { h[name] = -1; if (action === null) action = act; }
    };
    track('B', 'back');
    track('Start', 'back');
    track('Y', 'rumble');
    const val = v => (v === -1 ? need : Math.max(0, v));
    const progress = Math.min(1, Math.max(val(h.B), val(h.Start), val(h.Y)) / need);
    return { hold: h, action, progress };
  },

  _buildCtestButtons() {
    const family = PAD.family;
    if (this._ctestBtnEls && this._ctestFamily === family) return;
    this._ctestFamily = family;
    const wrap = this.el('ctest-buttons');
    wrap.innerHTML = '';
    this._ctestBtnEls = {};
    for (const name of PAD.BUTTON_NAMES) {
      const tok = GLYPHS.padToken(name, family);
      const div = document.createElement('div');
      div.className = 'ctest-btn';
      div.innerHTML = GLYPHS.tokenHtml(tok) + `<span>${name}</span>`;
      wrap.appendChild(div);
      this._ctestBtnEls[name] = div;
    }
  },

  controllerTest() {
    this.show('ctest');
    this._buildCtestButtons();
    this.el('btn-ctest-back').onclick = () => this.closeControllerTest();
    this.el('btn-ctest-rumble').onclick = () => this.ctestRumble();
    this._ctestHoldState = { B: 0, Start: 0, Y: 0 };
    this._ctestRumbleMsgUntil = 0;
    if (typeof GLYPHS !== 'undefined') GLYPHS.refresh(true);
    this._ctestLoop();
  },

  closeControllerTest() {
    this.hide('ctest');
    this._ctestHoldState = null;
  },

  ctestRumble() {
    const ok = PAD.rumble('test', { force: true });
    const status = this.el('ctest-rumble-status');
    if (PAD.state.rumble === 'unsupported') {
      status.textContent = 'Rumble: not supported for this controller in this browser/OS';
    } else if (ok) {
      status.textContent = 'Rumble: sent — feel it? If not, DualSense rumble is not supported on this OS/browser version';
    } else {
      status.textContent = 'Rumble: blocked (rumble off in settings or intensity 0)';
    }
    this._ctestRumbleMsgUntil = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) + 2000;
  },

  _ctestLoop() {
    const panel = this.el('ctest');
    if (panel.classList.contains('hidden')) return;
    const m = this.ctestModel(PAD.state);
    this.el('ctest-status').textContent = m.status;
    this.el('ctest-id').textContent = m.id;
    this.el('ctest-warn').textContent = m.warning;
    const ldot = this.el('ctest-ldot'); ldot.style.left = m.left.x + '%'; ldot.style.top = m.left.y + '%';
    const rdot = this.el('ctest-rdot'); rdot.style.left = m.right.x + '%'; rdot.style.top = m.right.y + '%';
    this.el('ctest-lt-fill').style.width = (Number(m.lt) * 100) + '%';
    this.el('ctest-rt-fill').style.width = (Number(m.rt) * 100) + '%';
    this.el('ctest-lt-val').textContent = m.lt;
    this.el('ctest-rt-val').textContent = m.rt;
    this.el('ctest-help').style.display = m.showHelp ? '' : 'none';
    if (this._ctestFamily !== PAD.family) this._buildCtestButtons();
    for (const b of m.buttons) {
      const el = this._ctestBtnEls && this._ctestBtnEls[b.name];
      if (el && el.classList) { if (b.pressed) el.classList.add('on'); else el.classList.remove('on'); }
    }
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now > (this._ctestRumbleMsgUntil || 0)) {
      this.el('ctest-rumble-status').textContent = 'Rumble: ' +
        (m.rumble === 'supported' ? 'supported' : m.rumble === 'unsupported' ? 'not supported' : 'unknown');
    }
    const h = this.ctestHold(this._ctestHoldState || {}, PAD.state.buttons || {}, PAD.state.dt || 0.016);
    this._ctestHoldState = h.hold;
    this.el('ctest-hold-fill').style.width = Math.round(h.progress * 100) + '%';
    if (h.action === 'back') this.closeControllerTest();
    else if (h.action === 'rumble') this.ctestRumble();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => this._ctestLoop());
  },

  toggleFullscreen() {
    if (window.chakraNative && chakraNative.isDesktop) {
      chakraNative.setFullscreen(!chakraNative.getFullscreen());
    } else if (typeof document !== 'undefined' && document.documentElement && typeof document.documentElement.requestFullscreen === 'function') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else if (document.exitFullscreen) document.exitFullscreen();
    }
  },

  startRebind(action) {
    this._rebindAction = action;
    const onKey = (e) => {
      window.removeEventListener('keydown', onKey);
      this.applyRebind(action, e.key.toLowerCase());
      this._rebindAction = null;
      this.renderSettings();
    };
    window.addEventListener('keydown', onKey, { once: true });
  },

  applyRebind(action, key) {
    if (!INPUT.bindings[action]) return false;
    INPUT.bindings[action] = [key];
    STORE.set('chakravyuha_bindings_v1', INPUT.bindings);
    return true;
  },

  bindSettingsEntryPoints() {
    if (this._settingsBound) return;
    this._settingsBound = true;
    this.el('btn-hub-settings').addEventListener('click', () => { AUDIO.sfx('click'); this.settings('hub'); });
    this.el('btn-pause-settings').addEventListener('click', () => { AUDIO.sfx('click'); this.settings('pause'); });
    this.el('btn-settings-back').addEventListener('click', () => { AUDIO.sfx('click'); this.closeSettings(); });
  },
};
