// ============================================================
// CHAKRAVYUHA — ui.js : DOM overlays — hub, boon choices, shop,
// Path of Dharma (meta), armory, codex, death & victory screens.
// ============================================================
'use strict';

const UI = {
  el(id) { return document.getElementById(id); },
  show(id) { this.el(id).classList.remove('hidden'); },
  hide(id) { this.el(id).classList.add('hidden'); },
  hideAll() {
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
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
    t.innerHTML = `<div class="bt-name">${biome.name}</div><div class="bt-sub">${biome.sub}</div>`;
    t.style.color = biome.accent;
    t.classList.remove('hidden');
    clearTimeout(this._biomeT);
    this._biomeT = setTimeout(() => t.classList.add('hidden'), 2800);
  },

  bossIntro(def) {
    const t = this.el('boss-intro');
    t.innerHTML = `<div class="bt-name" style="color:${def.color}">${def.name}</div>
      <div class="bt-sub">${def.sub}</div><div class="bt-quote">${def.intro}</div>`;
    t.classList.remove('hidden');
    clearTimeout(this._bossT);
    this._bossT = setTimeout(() => t.classList.add('hidden'), 4200);
  },

  // ---------- hub (the Banyan at the Edge of Worlds) ----------
  hub() {
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

  offerBoon() {
    const god = this.pickGod();
    if (!god) { // everything owned: amrit fallback
      if (GAME.player.allBoons().some(b => b.rarity < 2)) return this.offerAmrit();
      GAME.player.mudra += 60; this.banner('+60 MUDRA (the gods have given all they can)', '#ffcf5c');
      return;
    }
    const g = DATA.GODS[god];
    const pool = U.shuffle(this.offerableBoons(god)).slice(0, META.boonChoices());
    GAME.state = 'choosing';
    this.el('boon-god').innerHTML =
      `<span class="god-sym">${g.sym}</span><div><div class="god-name" style="color:${g.color}">${g.name}</div>
       <div class="god-title">${g.title}</div><div class="god-greet">${g.greet}</div></div>`;
    const cards = this.el('boon-cards');
    cards.innerHTML = '';
    for (const def of pool) {
      const rarity = this.rollRarity();
      const R = DATA.RARITIES[rarity];
      const v = def.base * R.mult;
      const card = document.createElement('div');
      card.className = 'card boon-card';
      card.style.borderColor = R.color;
      card.innerHTML = `<div class="card-rarity" style="color:${R.color}">${R.name} · ${def.slot.toUpperCase()}</div>
        <div class="card-name" style="color:${g.color}">${def.name}</div>
        <div class="card-desc">${def.desc(v)}</div>`;
      card.onclick = () => {
        GAME.player.addBoon(def, rarity);
        this.hide('boonpick');
        GAME.state = 'cleared';
      };
      cards.appendChild(card);
    }
    this.show('boonpick');
  },

  offerAmrit() {
    const P = GAME.player;
    const upgradable = P.allBoons().filter(b => b.rarity < 2);
    if (!upgradable.length) {
      P.mudra += 50; this.banner('+50 MUDRA (nothing left to refine)', '#ffcf5c');
      return;
    }
    GAME.state = 'choosing';
    this.el('boon-god').innerHTML =
      `<span class="god-sym">◈</span><div><div class="god-name" style="color:#5cb8ff">Amrit</div>
       <div class="god-title">Nectar of the Churning Ocean</div>
       <div class="god-greet">"One drop, and the divine grows more divine still."</div></div>`;
    const cards = this.el('boon-cards');
    cards.innerHTML = '';
    for (const entry of U.shuffle(upgradable).slice(0, 3)) {
      const g = DATA.GODS[entry.def.god];
      const next = DATA.RARITIES[entry.rarity + 1];
      const v = entry.def.base * next.mult;
      const card = document.createElement('div');
      card.className = 'card boon-card';
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
    this.hideAll();
    const line = U.choice(DATA.DEATH_LINES).replace('%n', META.deaths);
    this.el('death-line').textContent = line;
    this.el('death-stats').innerHTML = this.runStatsHtml(
      DATA.EPITAPHS[GAME.biomeIdx] || DATA.EPITAPHS[0]);
    this.show('death');
  },

  victory() {
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
};
