// ============================================================
// CHAKRAVYUHA — entities.js : player, enemies, bosses,
// projectiles, status effects, particles, damage pipeline.
// ============================================================
'use strict';

// ---------------- particles & floating text ----------------
function burst(x, y, color, n = 8, spd = 160, life = 0.4, r = 3) {
  VFX.burst(x, y, color, n, spd, life, r);
}
function dmgText(x, y, str, color = '#fff', size = 16) {
  GAME.texts.push({ x: x + U.rand(-10, 10), y, str, color, size, t: 0.8 });
}

// ---------------- damage pipeline ----------------
// src: 'attack' | 'special' | 'cast' | 'dash' | 'burn' | 'chain' | 'thorns' | 'zone'
function hitEnemy(e, base, src = 'attack', opts = {}) {
  if (!e || e.dead) return 0;
  if (e.submerged) return 0;          // 05.7.1-05: a diving jala-rakshasa is untargetable
  const P = GAME.player;
  let dmg = base * META.bonusDamage();

  // slot boon damage bonuses
  if (src === 'attack' && P.has('han_attack')) dmg *= 1 + P.val('han_attack') / 100;
  if (src === 'special' && P.has('han_special')) dmg *= 1 + P.val('han_special') / 100;
  if (src === 'cast' && P.has('han_cast')) dmg *= 1 + P.val('han_cast') / 100;
  if (src === 'cast' && P.has('dur_cast')) dmg *= 1 + P.val('dur_cast') / 100;
  if (src === 'attack' && P.pavanaT > 0 && P.has('duo_pavanaputra')) dmg *= 1 + P.val('duo_pavanaputra') / 100;

  // bhakti: charged super-attack
  if (src === 'attack' && P.has('han_bhakti') && P.bhaktiReady) {
    dmg *= 3; P.bhaktiReady = false; P.bhaktiT = Math.max(3, 12 - P.val('han_bhakti') / 5);
    burst(e.x, e.y, '#ff8c42', 14, 220, 0.5, 4);
  }

  // maya mark: enemy takes more damage
  if (e.maya > 0) dmg *= 1 + (e.mayaPow || 20) / 100;
  // ghee: burning enemies take more
  if (e.burns.length > 0 && P.has('agni_ghee')) dmg *= 1 + P.val('agni_ghee') / 100;

  // crit
  let crit = false;
  if (src !== 'burn' && U.chance(META.critChance())) { dmg *= 2; crit = true; }

  // duo_khandava: chain-lightning hits deal more to already-burning foes
  const khandava = src === 'chain' && P.has('duo_khandava');
  if (khandava && e.burns.length > 0) dmg *= 1.5;

  // 05.7.1-05 (D-05): the naga shield-guard's frontal guard soaks hits from within ±guardArc
  // of its facing until it breaks (raw damage drains it)
  if (e.def && e.def.ai === 'shield' && e.guardHp > 0 &&
      Math.abs(U.angDiff(e.face != null ? e.face : 0, U.angle(e.x, e.y, P.x, P.y))) < e.def.guardArc) {
    e.guardHp -= dmg;
    dmg *= 1 - e.def.guardReduce;
    VFX.emit('phit', e.x, e.y, e.face || 0, e.color);
    if (e.guardHp <= 0) {
      e.guardHp = 0;
      VFX.emit('pblast', e.x, e.y, 0, e.color);
      AUDIO.sfx('shield');
      dmgText(e.x, e.y - e.r - 18, 'GUARD BROKEN', e.color, 13);
    }
  }

  // 05.7.1-05 (D-07): elite damage reduction — shielded blocks whole hits, armored halves them
  if (e.shieldHits > 0 && src !== 'burn') {
    e.shieldHits--;
    dmgText(e.x, e.y - e.r - 6, 'BLOCK', DATA.ELITE_MODS.shielded.color, 14);
    VFX.emit('phit', e.x, e.y, 0, DATA.ELITE_MODS.shielded.color);
    AUDIO.sfx('shield');
    return 0;
  }
  if (e.armor > 0) {
    e.armor -= dmg;
    dmg *= 1 - DATA.ELITE_MODS.armored.reduce;
    if (e.armor <= 0) {
      e.armor = 0;
      VFX.emit('pblast', e.x, e.y, 0, DATA.ELITE_MODS.armored.color);
      AUDIO.sfx('shield');
    }
  }

  e.hp -= dmg;
  e.flash = 0.1;
  const hitAngle = U.angle(P.x, P.y, e.x, e.y);
  if (src !== 'burn') {
    dmgText(e.x, e.y - e.r - 6, Math.round(dmg), crit ? '#ffd34d' : '#fff', crit ? 20 : 15);
    AUDIO.sfx(crit ? 'crit' : 'hit');
    VFX.emit(crit ? 'crit' : 'hit', e.x, e.y, hitAngle);
  } else {
    dmgText(e.x, e.y - e.r - 6, Math.round(dmg), '#ff7040', 12);
  }

  // on-hit boon effects (not from secondary sources, to avoid loops)
  const isDirect = src === 'attack' || src === 'special' || src === 'cast' || src === 'dash';
  if (isDirect) {
    if (src === 'attack' && P.has('agni_attack')) applyBurn(e, P.val('agni_attack'));
    if (src === 'special' && P.has('agni_special')) applyBurn(e, P.val('agni_special'));
    if (src === 'attack' && P.has('kri_attack')) { e.maya = 5; e.mayaPow = P.val('kri_attack'); }
    if (src === 'attack' && P.has('indra_attack') && U.chance(0.3)) chainLightning(e, P.val('indra_attack'), 3);
    if (src === 'special' && P.has('indra_special')) {
      hitEnemy(e, P.val('indra_special'), 'chain');
      burst(e.x, e.y - 20, '#ffd34d', 8, 120, 0.3);
      AUDIO.sfx('shock');
    }
    if (src === 'special' && P.has('kri_special')) { e.slowT = 4; e.slowF = 1 - Math.min(P.val('kri_special'), 80) / 100; }
    if (src === 'special' && P.has('dur_special')) e.stun = Math.max(e.stun, P.val('dur_special'));
    if (src === 'cast' && P.has('han_cast')) e.stun = Math.max(e.stun, 1);
    if (src === 'attack' && P.has('duo_kapidhvaja') && ++P.kapiHits >= 6) {
      P.kapiHits = 0;
      const v = P.val('duo_kapidhvaja');
      GAME.rings.push({ x: e.x, y: e.y, r: 130, t: 0.3, color: '#ff8c42' });
      for (const e2 of GAME.enemies.slice()) {
        if (!e2.dead && U.dist(e.x, e.y, e2.x, e2.y) < 130 + e2.r) {
          hitEnemy(e2, v, 'zone');
          e2.maya = 5; e2.mayaPow = Math.max(e2.mayaPow || 0, 20);
        }
      }
    }
  }
  // duo_khandava: ignite on chain-lightning hits
  if (khandava && !e.dead) applyBurn(e, P.val('duo_khandava'));

  if (e.hp <= 0) killEnemy(e);
  else if (e.boss) GAME.bossHurtT = 0.15;

  if (!e.dead && src !== 'burn') {
    if (e.boss && (crit || src === 'special' || opts.finisher || dmg >= e.maxhp * 0.08)) VFX.hitstop(6);
    else if (opts.finisher) VFX.hitstop(3);
    else if (opts.dashStrike) VFX.hitstop(2);   // 05.7.1-03 (D-15): dash-strike weight via the existing hook
  }
  if (opts.finisher) CAMERA.kick(Math.cos(hitAngle) * 4, Math.sin(hitAngle) * 4);

  return dmg;
}

// 05.7.1-05: knockback is skipped for bosses and for armored elites while their armor holds
function canKnock(e) { return !e.boss && !(e.armor > 0); }

function applyBurn(e, dps) {
  if (e.burns.length >= 3) e.burns.shift();
  e.burns.push({ dps, t: 3 });
  AUDIO.sfx('burn');
}

function chainLightning(from, dmg, jumps) {
  AUDIO.sfx('shock');
  let cur = from, hitSet = new Set([from]);
  hitEnemy(cur, dmg, 'chain');
  for (let j = 0; j < jumps; j++) {
    let best = null, bd = 180;
    for (const e of GAME.enemies) {
      if (e.dead || hitSet.has(e)) continue;
      const d = U.dist(cur.x, cur.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    GAME.bolts.push({ x1: cur.x, y1: cur.y, x2: best.x, y2: best.y, t: 0.15 });
    hitSet.add(best);
    hitEnemy(best, dmg, 'chain');
    cur = best;
  }
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  ENEMY_AI.releaseToken(e);   // 05.7.1-04: a dying attacker hands its attack token back
  // 05.7-01 (D-04): Yama's HP reaching 0 is the Trial being passed, not a kill — he is not a
  // foe. e.dead / every game-logic consequence below this point is unchanged; only the
  // presentation (VFX preset, flash colour, sfx, and the kills stat) branches.
  const trial = e.boss && e.type === 'yama';
  VFX.emit(trial ? 'phase' : (e.boss ? 'bossDeath' : 'death'), e.x, e.y, 0, trial ? '#ffd34d' : e.color);
  VFX.hitstop(e.boss ? 10 : 4);
  CAMERA.punch(e.x, e.y, e.boss ? 0.08 : 0.015, e.boss ? 0.6 : 0.16);
  if (e.boss) VFX.flash(trial ? 0xffd34d : 0xffffff, 0.35, 0.3);
  if (!trial) AUDIO.sfx(e.boss ? 'bossdie' : 'kill');
  GAME.shake = Math.max(GAME.shake, e.boss ? 18 : 2);
  if (!trial) GAME.kills++;
  // bhuta husks explode in a ring of shades
  if (e.type === 'bhuta') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * U.TAU;
      enemyShot(e.x, e.y, Math.cos(a) * 220, Math.sin(a) * 220, e.dmg * 0.6, '#8a93b8');
    }
  }
  if (e.elite) eliteDeath(e);
  // coins
  let coins = e.mini ? U.randInt(4, 6) : e.boss ? U.randInt(8, 12) : (U.chance(0.55) ? U.randInt(1, 3) : 0);
  for (let i = 0; i < coins; i++) {
    GAME.pickups.push({ x: e.x + U.rand(-14, 14), y: e.y + U.rand(-14, 14),
      type: 'mudra', val: U.randInt(2, 5), t: 12,
      vx: U.rand(-60, 60), vy: U.rand(-60, 60) });
  }
}

// 05.7.1-05 (D-07): elite on-death effects. Vampiric heals nearby allies, splitting leaves weak
// copies (never past the alive cap), explosive leaves a telegraphed mortar (fuse >= 0.6 s).
function eliteDeath(e) {
  const M = DATA.ELITE_MODS;
  if (e.elite.includes('vampiric')) {
    for (const o of GAME.enemies) {
      if (o === e || o.dead || o.boss || U.dist(e.x, e.y, o.x, o.y) > M.vampiric.deathR) continue;
      o.hp = Math.min(o.maxhp, o.hp + o.maxhp * M.vampiric.deathHeal);
      GAME.rings.push({ x: o.x, y: o.y, r: o.r + 8, t: 0.3, color: M.vampiric.color });
    }
  }
  if (e.elite.includes('splitting')) {
    const scale = (GAME.biome && GAME.biome.scale) || 1;
    for (let i = 0; i < M.splitting.copies && ROOMS.aliveCount() < DATA.WAVES.maxAlive; i++) {
      const c = new Enemy(e.type, e.x + U.rand(-20, 20), e.y + U.rand(-20, 20), scale, DATA.WAVES.weak);
      c.spawnT = 0.2;
      clampToArena(c);
      GAME.enemies.push(c);
    }
    burst(e.x, e.y, M.splitting.color, 10, 160, 0.4);
  }
  if (e.elite.includes('explosive')) {
    PROJ.spawn('mortar', { x: e.x, y: e.y, dmg: e.dmg * M.explosive.dmgMul, r: M.explosive.r,
      color: M.explosive.color, extra: { tx: e.x, ty: e.y, flight: M.explosive.fuse } });
  }
}

// 05.7.1-02: routed through PROJ. Family 'bolt' (the default) is today's generic bullet,
// bit-identical; other families use their data radius unless extra.r is given.
function enemyShot(x, y, vx, vy, dmg, color, r = 6, fam = 'bolt', extra) {
  return PROJ.spawn(fam, { x, y, vx, vy, dmg, color, r: fam === 'bolt' ? r : undefined, extra });
}

// ---------------- PLAYER ----------------
class Player {
  constructor(weaponId) {
    this.weapon = DATA.WEAPONS[weaponId];
    this.x = 0; this.y = 0; this.r = 13;
    this.maxhp = 100 + META.bonusHp();
    this.hp = this.maxhp;
    this.speed = DATA.KIT.speed * META.bonusSpeed();   // 05.7.1-03 (D-02): faster base tempo
    this.aim = 0;

    // dash
    this.dashMax = 2 + META.bonusDash();
    this.dashCharges = this.dashMax;
    this.dashRegen = 0;          // timer for recovering a charge
    this.dashT = 0;              // active dash time left
    this.iframes = 0;
    this.dashDir = 0;

    // combat
    this.atkCd = 0; this.comboIdx = 0; this.comboT = 0;
    this.charging = false; this.charge = 0;
    this.specialCd = 0;
    this.castCharges = 2; this.castMax = 2; this.castRegen = 0;
    this.swing = null;           // visual arc {a, t}
    this.bhaktiT = 0; this.bhaktiReady = false;

    // 05.7.1-03 kit state (D-12..D-14): dash-strike window, gada hop, press/hold machine
    this.sinceDash = 99; this.dashStrikeUsed = true; this.leapT = 0;
    this.leapFrom = null; this.leapTo = null; this._noDraw = false;
    this.holdT = 0; this.chargeKind = null; this.fullAt = -1; this.bufT = 0; this._lmbPrev = false;
    this.quickShots = 0; this.lastQuickT = -9; this.simT = 0;

    // duo boons
    this.pavanaT = 0;            // duo_pavanaputra: post-dash damage window
    this.kapiHits = 0;           // duo_kapidhvaja: attack-hit counter

    // environmental hazards
    this.hazardSlowT = 0; this.hazardSlowF = 1;
    STATUS.init(this);           // 05.7.1-02: player statuses (P.st)

    // boons: slot -> {def, rarity} ; passives: array
    this.slots = {};             // attack/special/dash/cast
    this.passives = [];
    this.boonRanks = {};         // id -> rarity index (for val lookup)

    this.defiance = META.defianceCount();
    this.mudra = META.startMudra();
    this.punyaRun = 0;           // punya earned this run
    this.hurtT = 0;
    this.trail = [];
  }

  has(id) { return id in this.boonRanks; }
  val(id) {
    const def = DATA.findBoon(id);
    return def.base * DATA.RARITIES[this.boonRanks[id]].mult;
  }

  allBoons() {
    const out = [];
    for (const s of ['attack', 'special', 'dash', 'cast']) if (this.slots[s]) out.push(this.slots[s]);
    return out.concat(this.passives);
  }

  eligibleDuos() {
    return DATA.DUO_BOONS.filter(d => !this.has(d.id) && d.gods.every(g => d.req[g].some(id => this.has(id))));
  }
  duoOfferFor(godId) {
    const l = this.eligibleDuos().filter(d => d.gods.includes(godId));
    return l.length ? U.choice(l) : null;
  }

  addBoon(def, rarity) {
    const entry = { def, rarity };
    if (def.slot === 'passive') this.passives.push(entry);
    else this.slots[def.slot] = entry;
    this.boonRanks[def.id] = rarity;
    // immediate passives
    if (def.id === 'han_hp') {
      const v = Math.round(this.val('han_hp'));
      this.maxhp += v; this.hp = Math.min(this.maxhp, this.hp + v);
    }
    if (def.id === 'vayu_gust') { this.dashMax += 1; this.dashCharges += 1; }
    AUDIO.sfx('boon');
  }

  upgradeBoon(entry) {
    if (entry.rarity >= 2) return false;
    entry.rarity++;
    this.boonRanks[entry.def.id] = entry.rarity;
    return true;
  }

  moveSpeed() {
    let s = this.speed;
    if (this.has('vayu_speed')) s *= 1 + this.val('vayu_speed') / 100;
    // venom pool and status slow do not double-multiply: the stronger (smaller) factor wins
    s *= Math.min(this.hazardSlowT > 0 ? this.hazardSlowF : 1, STATUS.slowFactor(this));
    return s;
  }

  dashCooldown() {
    let cd = DATA.KIT.dashCd;
    if (this.has('vayu_gust')) cd *= 1 - (this.val('vayu_gust') - 1) * 0.2;
    return Math.max(0.8, cd);
  }

  update(dt) {
    const I = INPUT;
    this.simT += dt;
    this.aim = Math.atan2(I.wy - this.y, I.wx - this.x);

    // timers
    U.cool(this, 'atkCd', dt); U.cool(this, 'specialCd', dt);
    U.cool(this, 'iframes', dt); U.cool(this, 'hurtT', dt);
    U.cool(this, 'comboT', dt); U.cool(this, 'pavanaT', dt);
    U.cool(this, 'hazardSlowT', dt);
    if (this.comboT <= 0) this.comboIdx = 0;
    if (this.has('han_bhakti') && !this.bhaktiReady) {
      this.bhaktiT -= dt;
      if (this.bhaktiT <= 0) this.bhaktiReady = true;
    }
    // 05.7.1-03 (D-14): no timed cast regen — astras lodge where they land and are walked over
    // to recover (GAME.lodged); castRegen stays 0 for compatibility
    // dash regen
    if (this.dashCharges < this.dashMax) {
      this.dashRegen += dt;
      if (this.dashRegen >= this.dashCooldown()) { this.dashRegen = 0; this.dashCharges++; }
    }
    STATUS.update(this, dt);
    const stunned = STATUS.stunned(this), rooted = STATUS.rooted(this);

    // movement
    let dx = 0, dy = 0;
    const analogMag = Math.hypot(I.ax || 0, I.ay || 0);
    if (analogMag > 0) {
      dx = I.ax; dy = I.ay;
    } else {
      const kb = PAD.digitalMoveVector(I.keys, I.bindings);
      dx = kb.dx; dy = kb.dy;
    }

    const wasDashing = this.dashT > 0;
    if (this.leapT > 0) {
      this._advanceLeap(dt);       // gada dash-strike hop: no normal movement while airborne
    } else if (this.dashT > 0) {
      this.dashT -= dt;
      this.x += Math.cos(this.dashDir) * 760 * dt;
      this.y += Math.sin(this.dashDir) * 760 * dt;
      this.trail.push({ x: this.x, y: this.y, t: 0.25 });
      // gale step damage
      if (this.has('vayu_dash')) {
        for (const e of GAME.enemies) {
          if (!e.dead && !e.galeHit && U.dist(this.x, this.y, e.x, e.y) < e.r + 26) {
            e.galeHit = true;
            hitEnemy(e, this.val('vayu_dash'), 'dash');
          }
        }
      }
      // trishula step: destroy projectiles
      if (this.has('dur_dash')) {
        for (const p of GAME.eprojectiles) {
          if (PROJ.destroyable(p) && U.dist(this.x, this.y, p.x, p.y) < 34) { p.t = 0; burst(p.x, p.y, '#e84a8a', 5, 100, 0.25); }
        }
      }
    } else if (!stunned && !rooted) {
      this.x += dx * this.moveSpeed() * dt;
      this.y += dy * this.moveSpeed() * dt;
    }
    // D-12: dash-strike window opens on the frame the dash ends (advanced here, so hitstop freezes it)
    if (wasDashing && this.dashT <= 0) this.sinceDash = 0;
    else if (this.dashT <= 0) this.sinceDash += dt;

    clampToArena(this);

    // attacking (a stun cancels any bow draw)
    // 05.7.1-03 (D-13/D-16): press/hold edges from INPUT.lmb — the pad writes the same field each
    // poll, so keyboard/mouse and controller share one state machine
    const press = !!I.lmb && !this._lmbPrev, release = !I.lmb && this._lmbPrev;
    this._lmbPrev = !!I.lmb;
    if (stunned) { this.charging = false; this.charge = 0; this.chargeKind = null; this.holdT = 0; this.bufT = 0; this.fullAt = -1; }
    else if (this.weapon.type === 'bow') this.updateBow(dt, I, press, release);
    else if (this.leapT > 0) { /* mid-hop: the slam lands on its own */ }
    else this.updateMelee(dt, I, press, release);

    for (const tr of this.trail) tr.t -= dt;
    this.trail = this.trail.filter(t => t.t > 0);
  }

  tryDash(dx, dy) {
    if (STATUS.stunned(this)) return;
    if (this.dashCharges <= 0 || this.dashT > 0) return;
    this.dashCharges--;
    this.st.rootT = 0;           // dashing breaks a root
    // D-13 dash-cancel: recovery and any charge end now; comboIdx/comboT survive so the string continues
    this.atkCd = 0; this.charging = false; this.charge = 0; this.chargeKind = null; this.holdT = 0;
    this.bufT = 0; this.fullAt = -1; this.leapT = 0;
    this.dashStrikeUsed = false;  // D-12: this dash opens a fresh dash-strike window
    this.dashT = 0.16;
    let iv = 0.32;
    if (this.has('dur_dash')) iv *= 1 + this.val('dur_dash') / 100;
    this.iframes = Math.max(this.iframes, iv);
    // dash toward the left stick if held (pad), else toward movement keys (rebindable), else toward aim
    const I = INPUT;
    this.dashDir = PAD.chooseDashDir(I.ax || 0, I.ay || 0, PAD.digitalMoveVector(I.keys, I.bindings), this.aim);
    for (const e of GAME.enemies) e.galeHit = false;
    AUDIO.sfx('dash');

    if (this.has('duo_pavanaputra')) this.pavanaT = 1.0;
    if (this.has('duo_marut')) {
      let best = null, bd = 260;
      for (const e of GAME.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const d = U.dist(this.x, this.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        GAME.bolts.push({ x1: this.x, y1: this.y, x2: best.x, y2: best.y, t: 0.15 });
        chainLightning(best, this.val('duo_marut'), 2);
      }
    }
  }

  attackRate() {
    let r = this.weapon.rate;
    if (this.has('vayu_attack')) r /= 1 + this.val('vayu_attack') / 100;
    return r;
  }

  // Melee press/hold machine: a press swings (or dash-strikes, or buffers during recovery);
  // holding past DATA.KIT.chargeDelay charges the weapon's heavy variant, fired on release.
  // Holding no longer auto-repeats swings (RESEARCH Pitfall 8).
  updateMelee(dt, I, press, release) {
    if (press) {
      this.holdT = 0;
      if (this.inDashStrikeWindow()) this.dashStrike();
      else if (this.atkCd <= 0) this.meleeAttack();
      else this.bufT = DATA.KIT.attackBuffer;
    }
    if (I.lmb) {
      this.holdT += dt;
      const ch = this.weapon.charged;
      if (ch && !this.chargeKind && this.holdT >= DATA.KIT.chargeDelay) { this.chargeKind = ch.kind; this.charge = 0; this.charging = true; }
      if (this.chargeKind) {
        const was = this.charge;
        this.charge = Math.min(1, this.charge + dt / ch.time);
        if (was < 1 && this.charge >= 1) VFX.emit('chargeReady', this.x, this.y, 0);
      }
    }
    if (release) {
      if (this.chargeKind && this.charge >= 0.35) this.releaseCharged(this.charge);
      this.chargeKind = null; this.charging = false; this.charge = 0; this.holdT = 0;
    }
    U.cool(this, 'bufT', dt);
    if (this.bufT > 0 && this.atkCd <= 0 && !this.chargeKind) { this.bufT = 0; this.meleeAttack(); }
  }

  // Charged heavy variants (D-13): Khanda piercing thrust, Gada wind-up smash.
  releaseCharged(c) {
    if (STATUS.stunned(this)) return;
    const w = this.weapon, ch = w.charged;
    if (!ch) return;
    const k = Math.max(0.5, c);
    this.atkCd = this.attackRate();
    const a = this.aim, ux = Math.cos(a), uy = Math.sin(a);
    if (ch.kind === 'thrust') {
      const dmg = w.combo[2] * ch.mult * k, kb = this.meleeKnockback(1.6);
      for (const e of GAME.enemies.slice()) {
        if (e.dead || e.submerged) continue;
        const rx = e.x - this.x, ry = e.y - this.y;
        const along = rx * ux + ry * uy, across = -rx * uy + ry * ux;
        if (along >= 0 && along <= ch.len && Math.abs(across) < ch.width / 2 + e.r) {
          hitEnemy(e, dmg, 'attack', { finisher: true, charged: true });
          if (canKnock(e) && !e.dead) { e.kx += ux * kb; e.ky += uy * kb; }
        }
      }
      this.swing = { a, t: 0.16, range: ch.len, arc: 0.3 };
      VFX.emit('dashStrike', this.x, this.y, a);
      CAMERA.kick(ux * 5, uy * 5);
      AUDIO.sfx('swing');
    } else if (ch.kind === 'smash') {
      const dmg = w.combo[0] * ch.mult * k;
      for (const e of GAME.enemies.slice()) {
        if (e.dead || e.submerged) continue;
        if (U.dist(this.x, this.y, e.x, e.y) < ch.radius + e.r) {
          hitEnemy(e, dmg, 'attack', { finisher: true, charged: true });
          if (!e.boss && !e.dead) {
            e.stun = Math.max(e.stun, ch.stun);
            const ka = U.angle(this.x, this.y, e.x, e.y);
            if (canKnock(e)) { e.kx += Math.cos(ka) * 360; e.ky += Math.sin(ka) * 360; }
          }
        }
      }
      GAME.rings.push({ x: this.x, y: this.y, r: ch.radius, t: 0.3, color: '#ffcf5c' });
      GAME.shake = Math.max(GAME.shake, 8);
      CAMERA.punch(this.x, this.y, 0.04, 0.22);
      VFX.emit('chargeFlash', this.x, this.y, 0);
      AUDIO.sfx('special');
    }
  }

  meleeKnockback(mult = 1) {
    let kb = this.weapon.knockback * mult;
    if (this.has('han_attack')) kb *= 1.5;
    if (this.pavanaT > 0 && this.has('duo_pavanaputra')) kb *= 2;
    return kb;
  }

  meleeAttack() {
    if (STATUS.stunned(this)) return;
    const w = this.weapon;
    this.atkCd = this.attackRate();
    this.comboT = 0.9;
    const dmg = w.combo[this.comboIdx % w.combo.length];
    const isFinisher = (this.comboIdx % w.combo.length) === w.combo.length - 1;
    this.comboIdx++;
    // 05.7.1-03 (D-13): per-weapon finisher — Khanda cross-cut (wider arc + ring), Gada shockwave
    const fin = isFinisher ? w.finisher : null;
    const arc = fin && fin.arc ? fin.arc : w.arc;
    this.swing = { a: this.aim, t: 0.12, range: w.range, arc };
    AUDIO.sfx('swing');
    const kb = this.meleeKnockback(isFinisher ? 1.6 : 1);
    const struck = new Set();
    for (const e of GAME.enemies) {
      if (e.dead || e.submerged) continue;
      const d = U.dist(this.x, this.y, e.x, e.y);
      if (d < w.range + e.r && Math.abs(U.angDiff(this.aim, U.angle(this.x, this.y, e.x, e.y))) < arc / 2) {
        struck.add(e);
        hitEnemy(e, dmg, 'attack', isFinisher ? { finisher: true } : undefined);
        if (canKnock(e)) {
          const a = U.angle(this.x, this.y, e.x, e.y);
          e.kx += Math.cos(a) * kb; e.ky += Math.sin(a) * kb;
        }
      }
    }
    if (fin && fin.arc) {
      VFX.emit('finisherRing', this.x, this.y, this.aim, '#fff4b0');
      if (fin.ring) GAME.rings.push({ x: this.x, y: this.y, r: fin.ring, t: 0.2, color: '#fff4b0' });
    }
    if (fin && fin.shock) {
      const reach = w.range + fin.shock;
      for (const e of GAME.enemies.slice()) {
        if (e.dead || struck.has(e)) continue;
        if (U.dist(this.x, this.y, e.x, e.y) < reach + e.r) {
          hitEnemy(e, dmg * fin.mult, 'attack', { finisher: true });
          if (canKnock(e) && !e.dead) {
            const a = U.angle(this.x, this.y, e.x, e.y);
            e.kx += Math.cos(a) * kb * 0.5; e.ky += Math.sin(a) * kb * 0.5;
          }
        }
      }
      GAME.rings.push({ x: this.x, y: this.y, r: reach, t: 0.25, color: '#ffcf5c' });
      VFX.emit('finisherRing', this.x, this.y, this.aim, '#ffcf5c');
    }
    if (isFinisher) GAME.shake = Math.max(GAME.shake, 3);
  }

  // ---- 05.7.1-03 (D-12): dash-strike ----
  inDashStrikeWindow() {
    return !this.dashStrikeUsed && !!this.weapon.dashStrike
      && (this.dashT > 0 || this.sinceDash < DATA.KIT.dashStrikeWindow);
  }

  dashStrike() {
    if (STATUS.stunned(this)) return;
    const w = this.weapon, ds = w.dashStrike;
    if (!ds) return;
    this.dashStrikeUsed = true;
    this.atkCd = this.attackRate();
    this.comboT = 0.9;
    const a = this.aim, I = INPUT;
    const td = U.dist(this.x, this.y, I.wx, I.wy);
    if (ds.kind === 'lunge') {
      const step = Number.isFinite(td) ? Math.min(ds.lunge, td) : ds.lunge;
      this.x += Math.cos(a) * step; this.y += Math.sin(a) * step;
      clampToArena(this);
      this.trail.push({ x: this.x, y: this.y, t: 0.25 });
      const kb = this.meleeKnockback(1);
      for (const e of GAME.enemies) {
        if (e.dead || e.submerged) continue;
        const d = U.dist(this.x, this.y, e.x, e.y);
        if (d < ds.range + e.r && Math.abs(U.angDiff(a, U.angle(this.x, this.y, e.x, e.y))) < ds.arc / 2) {
          hitEnemy(e, w.combo[0] * ds.mult, 'attack', { dashStrike: true });
          if (canKnock(e)) {
            const ka = U.angle(this.x, this.y, e.x, e.y);
            e.kx += Math.cos(ka) * kb; e.ky += Math.sin(ka) * kb;
          }
        }
      }
      this.swing = { a, t: 0.12, range: ds.range, arc: ds.arc };
      VFX.emit('dashStrike', this.x, this.y, a);
      AUDIO.sfx('swing');
    } else if (ds.kind === 'volley') {
      const dmg = U.lerp(w.dmgMin, w.dmgMax, ds.draw) * ds.mult;
      for (let i = 0; i < ds.count; i++) {
        const aa = a + (i - (ds.count - 1) / 2) * ds.spread;
        GAME.pprojectiles.push({
          x: this.x, y: this.y, vx: Math.cos(aa) * w.projSpeed, vy: Math.sin(aa) * w.projSpeed,
          dmg, r: 5, t: ds.life, pierce: false, src: 'attack', opts: { dashStrike: true },
          color: '#aef0ff', hitSet: new Set(),
        });
      }
      this.charging = false; this.charge = 0;
      VFX.emit('dashStrike', this.x, this.y, a);
      AUDIO.sfx('bow');
    } else if (ds.kind === 'leap') {
      const dist = Number.isFinite(td) ? Math.min(ds.maxDist, td) : ds.maxDist;
      const to = { x: this.x + Math.cos(a) * dist, y: this.y + Math.sin(a) * dist, r: this.r };
      clampToArena(to);
      this.leapFrom = { x: this.x, y: this.y };
      this.leapTo = { x: to.x, y: to.y };
      this.leapT = ds.hop;
      this.dashT = 0;             // the hop replaces what is left of the dash
      AUDIO.sfx('swing');
    }
  }

  _advanceLeap(dt) {
    const ds = this.weapon.dashStrike;
    this.leapT = Math.max(0, this.leapT - dt);
    const k = ds && ds.hop > 0 ? 1 - this.leapT / ds.hop : 1;
    this.x = U.lerp(this.leapFrom.x, this.leapTo.x, k);
    this.y = U.lerp(this.leapFrom.y, this.leapTo.y, k);
    this.trail.push({ x: this.x, y: this.y, t: 0.25 });
    if (this.leapT <= 0) this._gadaSlam();
  }

  _gadaSlam() {
    const w = this.weapon, ds = w.dashStrike;
    if (!ds) return;
    GAME.rings.push({ x: this.x, y: this.y, r: ds.radius, t: 0.25, color: '#ffcf5c' });
    VFX.emit('finisherRing', this.x, this.y, this.aim, '#ffcf5c');
    GAME.shake = Math.max(GAME.shake, 6);
    for (const e of GAME.enemies.slice()) {
      if (e.dead || e.submerged) continue;
      if (U.dist(this.x, this.y, e.x, e.y) < ds.radius + e.r) {
        hitEnemy(e, w.combo[0] * ds.mult, 'attack', { dashStrike: true });
        if (!e.boss && !e.dead) {
          e.stun = Math.max(e.stun, ds.stun);
          const a = U.angle(this.x, this.y, e.x, e.y);
          if (canKnock(e)) { e.kx += Math.cos(a) * 300; e.ky += Math.sin(a) * 300; }
        }
      }
    }
    CAMERA.punch(this.x, this.y, 0.03, 0.18);
    AUDIO.sfx('special');
  }

  updateBow(dt, I, press) {
    if (STATUS.stunned(this)) return;
    const w = this.weapon;
    // D-12: a press inside the dash window looses the point-blank volley instead of drawing;
    // the draw stays suppressed until the button is released
    if (press && this.inDashStrikeWindow()) { this.dashStrike(); this._noDraw = true; return; }
    if (this._noDraw) { if (!I.lmb) this._noDraw = false; return; }
    if (I.lmb && this.atkCd <= 0) {
      this.charging = true;
      const was = this.charge;
      this.charge = Math.min(1, this.charge + dt / w.chargeTime);
      if (was < 1 && this.charge >= 1) { this.fullAt = this.simT; VFX.emit('chargeReady', this.x, this.y, 0); }
    } else if (this.charging) {
      // release
      const c = this.charge;
      // D-13 power shot: releasing within DATA.KIT.perfectWindow of reaching full draw
      const perfect = this.fullAt >= 0 && this.simT - this.fullAt <= DATA.KIT.perfectWindow;
      this.charging = false; this.charge = 0; this.fullAt = -1;
      this.atkCd = this.attackRate();
      const spd = w.projSpeed * (0.8 + 0.4 * c);
      const arrow = (a, dmg, extra) => {
        GAME.pprojectiles.push(Object.assign({
          x: this.x, y: this.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          dmg, r: 5, t: 2, pierce: c >= 0.98, src: 'attack',
          color: c >= 0.98 ? '#ffd34d' : '#ffffff', hitSet: new Set(),
        }, extra));
      };
      let dmg = U.lerp(w.dmgMin, w.dmgMax, c);
      const ch = w.charged, fin = w.finisher;
      if (perfect && ch) {
        arrow(this.aim, dmg * ch.mult, { pierce: true, kb: ch.kb, color: '#fff4b0', opts: { finisher: true } });
        VFX.emit('chargeFlash', this.x, this.y, this.aim);
        if (typeof SETTINGS === 'undefined' || SETTINGS.get('screenFlash') !== false) VFX.flash(0xffd34d, 0.18, 0.12);
      } else if (fin && c < fin.maxCharge) {
        // D-13 finisher: the third quick shot in a rapid string splits into a fan
        this.quickShots = (this.simT - this.lastQuickT <= fin.window) ? this.quickShots + 1 : 1;
        this.lastQuickT = this.simT;
        if (this.quickShots >= fin.every) {
          for (let i = 0; i < fin.count; i++) arrow(this.aim + (i - (fin.count - 1) / 2) * fin.spread, dmg, { opts: { finisher: true } });
          this.quickShots = 0;
          VFX.emit('finisherRing', this.x, this.y, this.aim, '#aef0ff');
        } else arrow(this.aim, dmg);
      } else arrow(this.aim, dmg);
      AUDIO.sfx('bow');
    }
  }

  trySpecial() {
    if (STATUS.stunned(this)) return;
    if (this.specialCd > 0) return;
    const w = this.weapon, sp = w.special;
    this.specialCd = sp.cd;
    this.comboT = Math.max(this.comboT, 0.6);   // D-13: specials weave into the string (comboIdx kept)
    AUDIO.sfx('special');
    if (w.id === 'gandiva') {
      for (let i = 0; i < sp.count; i++) {
        const a = this.aim + (i - (sp.count - 1) / 2) * 0.16;
        GAME.pprojectiles.push({
          x: this.x, y: this.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
          dmg: sp.dmg, r: 5, t: 2, pierce: false, src: 'special',
          color: '#aef0ff', hitSet: new Set(),
        });
      }
    } else {
      let radius = sp.radius;
      if (this.has('han_special')) radius *= 1.3;
      GAME.rings.push({ x: this.x, y: this.y, r: radius, t: 0.25, color: '#fff' });
      GAME.shake = Math.max(GAME.shake, 6);
      for (const e of GAME.enemies) {
        if (e.dead || e.submerged) continue;
        if (U.dist(this.x, this.y, e.x, e.y) < radius + e.r) {
          hitEnemy(e, sp.dmg, 'special');
          if (sp.stun) e.stun = Math.max(e.stun, sp.stun);
          if (canKnock(e)) {
            const a = U.angle(this.x, this.y, e.x, e.y);
            e.kx += Math.cos(a) * 300; e.ky += Math.sin(a) * 300;
          }
        }
      }
    }
  }

  tryCast() {
    if (STATUS.stunned(this)) return;
    if (this.castCharges <= 0) return;
    this.castCharges--;
    AUDIO.sfx('cast');
    // krishna: orbiting discus instead of projectile
    if (this.has('kri_cast')) {
      GAME.orbits.push({ angle: this.aim, t: 6, dmg: this.val('kri_cast'), dist: 70, hitCd: {}, castAmmo: true });
      return;
    }
    // vayu: roaming cyclone
    if (this.has('vayu_cast')) {
      GAME.zones.push({ x: this.x + Math.cos(this.aim) * 60, y: this.y + Math.sin(this.aim) * 60,
        r: 55, dps: this.val('vayu_cast'), t: 5, type: 'cyclone',
        vx: Math.cos(this.aim) * 90, vy: Math.sin(this.aim) * 90, tick: 0, castAmmo: true });
      return;
    }
    const pierce = this.has('dur_cast');
    GAME.pprojectiles.push({
      x: this.x, y: this.y,
      vx: Math.cos(this.aim) * 560, vy: Math.sin(this.aim) * 560,
      dmg: 42, r: 9, t: 1.6, pierce, src: 'cast', chakra: true, lodge: true,
      color: '#ffd34d', hitSet: new Set(),
    });
  }

  // 05.7.1-03 (D-14): a recovered (or safety-returned) astra gives its charge back
  returnCast(n = 1, x, y) {
    if (!(n > 0)) return;
    this.castCharges = Math.min(this.castMax, this.castCharges + n);
    VFX.emit('castGlow', x != null ? x : this.x, y != null ? y : this.y, 0);
    AUDIO.sfx('punya');
  }

  // 05.7.1-02 (D-11): returns true only when the hit lands; opts.status rides only on a landed hit.
  takeDamage(amount, fromX, fromY, opts) {
    if (this.iframes > 0 || this.dashT > 0) return false;
    if (GAME.godMode) return false; // dev playtest toggle (F4)
    // lila dodge
    if (this.has('kri_lila') && U.chance(Math.min(this.val('kri_lila'), 40) / 100)) {
      dmgText(this.x, this.y - 24, 'DODGE', '#5c7cff', 14);
      AUDIO.sfx('shield');
      return false;
    }
    let dmg = amount;
    if (this.has('dur_kavacha')) dmg *= 1 - Math.min(this.val('dur_kavacha'), 40) / 100;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.hurtT = 0.25; this.iframes = Math.max(this.iframes, 0.5);
    GAME.shake = Math.max(GAME.shake, 8);
    dmgText(this.x, this.y - 24, dmg, '#ff5566', 18);
    AUDIO.sfx('hurt');
    VFX.emit('hurt', this.x, this.y, 0);
    VFX.flash(0xff2030, 0.28, 0.2);
    VFX.hitstop(3);
    if (fromX !== undefined) {
      const a = U.angle(fromX, fromY, this.x, this.y);
      CAMERA.kick(Math.cos(a) * 6, Math.sin(a) * 6);
    }
    if (this.hp > 0) {
      if (this.has('duo_yogamaya')) {
        this.iframes = Math.max(this.iframes, this.val('duo_yogamaya'));
        for (const e of GAME.enemies) {
          if (!e.dead && U.dist(this.x, this.y, e.x, e.y) < 180) { e.maya = 5; e.mayaPow = Math.max(e.mayaPow || 0, 20); }
        }
        GAME.rings.push({ x: this.x, y: this.y, r: 180, t: 0.3, color: '#5c7cff' });
      }
      if (this.has('duo_jwalamukhi')) {
        const v = this.val('duo_jwalamukhi');
        for (const e of GAME.enemies) if (!e.dead && U.dist(this.x, this.y, e.x, e.y) < 150) applyBurn(e, v);
        GAME.rings.push({ x: this.x, y: this.y, r: 150, t: 0.3, color: '#ff4430' });
        burst(this.x, this.y, '#ff7040', 14, 200, 0.4);
      }
    }
    if (opts && opts.status) STATUS.apply(this, opts.status, fromX, fromY);
    if (this.hp <= 0) GAME.onPlayerDeath();
    return true;
  }

  // 05.7.1-02 (RESEARCH Pitfall 2): burn/poison ticks — no i-frames, hitstop, flash, shake or kick,
  // so a poisoned player can still be hit.
  tickDamage(amount, type) {
    if (GAME.godMode || this.hp <= 0) return;
    let dmg = amount;
    if (this.has('dur_kavacha')) dmg *= 1 - Math.min(this.val('dur_kavacha'), 40) / 100;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    dmgText(this.x, this.y - 24, dmg, (DATA.STATUS[type] || {}).color || '#ff5566', 13);
    AUDIO.sfx(type === 'poison' ? 'poison' : 'burn');
    if (this.hp <= 0) GAME.onPlayerDeath();
  }

  meleeRetaliate(e) {
    if (this.has('dur_thorns') && !e.dead) hitEnemy(e, this.val('dur_thorns'), 'thorns');
  }

  draw(ctx) {
    // trail
    for (const t of this.trail) {
      ctx.globalAlpha = t.t / 0.25 * 0.4;
      ctx.fillStyle = '#7fdcb7';
      ctx.beginPath(); ctx.arc(t.x, t.y, this.r * 0.8, 0, U.TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // swing arc visual
    if (this.swing && this.swing.t > 0) {
      this.swing.t -= GAME.dt;
      ctx.globalAlpha = this.swing.t / 0.12 * 0.55;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.arc(this.x, this.y, this.swing.range, this.swing.a - this.swing.arc / 2, this.swing.a + this.swing.arc / 2);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 05.7.1-03: melee charge ring (fills 0 -> TAU, gold when full)
    if (this.chargeKind) {
      ctx.strokeStyle = this.charge >= 1 ? '#ffd34d' : 'rgba(255,211,77,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 10, -Math.PI / 2, -Math.PI / 2 + U.TAU * this.charge); ctx.stroke();
    }

    // bow draw indicator
    if (this.charging && !this.chargeKind) {
      ctx.strokeStyle = this.charge >= 0.98 ? '#ffd34d' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(this.aim) * 20, this.y + Math.sin(this.aim) * 20);
      ctx.lineTo(this.x + Math.cos(this.aim) * (20 + 60 * this.charge), this.y + Math.sin(this.aim) * (20 + 60 * this.charge));
      ctx.stroke();
    }

    const flash = this.hurtT > 0;
    // aura
    const grad = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, 30);
    grad.addColorStop(0, 'rgba(255, 215, 120, 0.5)');
    grad.addColorStop(1, 'rgba(255, 215, 120, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(this.x, this.y, 30, 0, U.TAU); ctx.fill();

    // body
    ctx.fillStyle = flash ? '#ff8888' : (this.iframes > 0 ? 'rgba(255,240,200,0.6)' : '#ffe9b3');
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.stroke();

    // facing tick (weapon direction)
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.x + Math.cos(this.aim) * (this.r + 2), this.y + Math.sin(this.aim) * (this.r + 2));
    ctx.lineTo(this.x + Math.cos(this.aim) * (this.r + 11), this.y + Math.sin(this.aim) * (this.r + 11));
    ctx.stroke();

    // bhakti ready glow
    if (this.bhaktiReady) {
      ctx.strokeStyle = '#ff8c42'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(GAME.time * 8);
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 6, 0, U.TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 05.7.1-02: status reads (stun stars, root/slow rings, burn ring, poison pips)
    drawPlayerStatus(ctx, this, this.y - this.r, this.y + this.r);
  }
}

// ---------------- ENEMY ----------------
class Enemy {
  constructor(typeId, x, y, scale, mods) {
    const d = DATA.ENEMIES[typeId];
    this.type = typeId; this.def = d;
    this.x = x; this.y = y; this.r = d.r;
    this.hp = d.hp * scale; this.maxhp = this.hp;
    this.dmg = d.dmg * Math.sqrt(scale);
    // Phase 05.1 (WAVE-01, D-18): weakened "fodder" instances — a mods object multiplies hp/dmg
    // (typically DATA.WAVES.weak) and flags the unit as weak; without mods, behavior is unchanged.
    this.spd = d.spd; this.color = d.color;
    this.cdMul = 1;                  // 05.7.1-05: post-attack cooldown multiplier (hasty elites)
    if (mods && mods.elite) {
      // 05.7.1-05 (D-07): elite — tougher, bigger, carrying 1-2 DATA.ELITE_MODS
      const E = DATA.WAVES.elite, M = DATA.ELITE_MODS;
      this.hp *= E.hp; this.maxhp = this.hp; this.dmg *= E.dmg;
      this.r = Math.round(this.r * E.rMul);
      this.elite = mods.elite.slice();
      for (const m of this.elite) {
        if (m === 'armored') this.armor = this.maxhp * M.armored.armorFrac;
        else if (m === 'shielded') this.shieldHits = M.shielded.hits;
        else if (m === 'hasty') { this.spd *= M.hasty.spd; this.cdMul = M.hasty.cd; }
        else if (m === 'warded') { this.wardT = 0; this.wardCycle = U.rand(0, M.warded.every); }
      }
    } else if (mods) { this.hp *= mods.hp || 1; this.maxhp = this.hp; this.dmg *= mods.dmg || 1; this.weak = true; }
    this.rallied = false;            // set each frame by ENEMY_AI.tick (rallying elites / banner aura)
    if (d.guard) this.guardHp = d.guard * scale;   // 05.7.1-05: naga shield-guard frontal guard
    this.dead = false; this.boss = false;
    this.flash = 0; this.stun = 0; this.maya = 0; this.slowT = 0; this.slowF = 1;
    this.burns = [];
    this.kx = 0; this.ky = 0;        // knockback velocity
    // 05.7.1-04 (D-02): faster engage — shorter spawn grace and first-attack timer (DATA.WAVES)
    this.state = 'idle'; this.t = U.rand(DATA.WAVES.engageDelay[0], DATA.WAVES.engageDelay[1]);
    this.spawnT = DATA.WAVES.spawnGrace;   // spawn-in grace
    this.telegraph = null;
    this.atkT = 0;
    // 05.7.1-04 (D-11): enemy telegraph invariant state (ENEMY_TG) + ENEMY_AI coordination
    this.windKind = null; this.windT = 0; this.windTotal = 0; this.armedAtk = false;
    this.slotT = 0; this.tokenCat = null;
  }

  curSpeed() {
    let s = this.spd;
    if (this.slowT > 0) s *= this.slowF;
    if (this.bannerSpd > 1) s *= this.bannerSpd;   // 05.7.1-05: standard-bearer aura
    return s;
  }

  // ---- telegraph invariant helpers (05.7.1-04, mirror Boss.strike/hurtPlayer/shoot) ----
  // Every damaging enemy attack goes through these two. Using them unarmed logs a violation.
  // 05.7.1-05: outgoing damage multiplier — rallied by a rallying elite or a standard-bearer
  dmgMul() { return this.rallied ? DATA.ELITE_MODS.rallying.dmg : 1; }
  isElite(mod) { return !!(this.elite && this.elite.includes(mod)); }
  // vampiric elites heal a share of the damage their landed hits deal
  lifesteal(amount) {
    if (!this.isElite('vampiric') || this.dead) return;
    this.hp = Math.min(this.maxhp, this.hp + amount * DATA.ELITE_MODS.vampiric.lifesteal);
  }
  hurtPlayer(amount, opts) {
    if (!this.armedAtk) ENEMY_TG.violations.push(this.type + ':unarmedHit');
    const dmg = amount * this.dmgMul();
    const landed = GAME.player.takeDamage(dmg, this.x, this.y, opts);
    if (landed) this.lifesteal(dmg);
    return landed;
  }
  fire(fam, vx, vy, dmg, extra) {
    if (!this.armedAtk) ENEMY_TG.violations.push(this.type + ':unarmedFire');
    ENEMY_TG.fireLog.push({ type: this.type, inView: ENEMY_AI.inViewBand(this.x, this.y, GAME.player) });
    if (ENEMY_TG.fireLog.length > 500) ENEMY_TG.fireLog.shift();
    // non-bolt families keep their own data colour so each family reads distinctly (D-09)
    return enemyShot(this.x, this.y, vx, vy, dmg * this.dmgMul(), fam === 'bolt' ? this.color : undefined, 6, fam,
      Object.assign({ owner: this }, extra));
  }
  // Start a wind-up of `kind` (ENEMY_TG.MIN key) lasting `secs`; windT accrues in update().
  windUp(kind, secs, telegraph) {
    this.windKind = kind; this.windT = 0; this.windTotal = secs; this.t = secs;
    this.armedAtk = false;
    this.telegraph = telegraph || null;
  }
  // The wind-up is over: log it, flag a short one, and arm the attack.
  armAttack() {
    ENEMY_TG.log(ENEMY_TG.windLog, { type: this.type, kind: this.windKind, wind: this.windT });
    if (this.windT < (ENEMY_TG.MIN[this.windKind] || 0) - 1e-6) ENEMY_TG.violations.push(this.type + ':short:' + this.windKind);
    this.armedAtk = true;
    this.telegraph = null;
  }
  // The attack resolved (or was aborted): disarm and hand the token back.
  endAttack() {
    this.armedAtk = false; this.windKind = null; this.holdToken = false;
    this.telegraph = null;
    ENEMY_AI.releaseToken(this);
  }

  update(dt) {
    const P = GAME.player;
    U.cool(this, 'flash', dt); U.cool(this, 'stun', dt);
    U.cool(this, 'maya', dt); U.cool(this, 'slowT', dt);
    if (this.spawnT > 0) { this.spawnT -= dt; return; }
    // 05.7.1-05: warded elites reflect player attack projectiles for `on` s every `every` s
    if (this.wardCycle != null) {
      const Wd = DATA.ELITE_MODS.warded;
      this.wardCycle += dt;
      this.wardT = (this.wardCycle % Wd.every) < Wd.on ? 1 : 0;
    }

    // burn ticks
    for (const b of this.burns) {
      b.t -= dt; b.acc = (b.acc || 0) + dt;
      if (b.acc >= 0.5) { b.acc -= 0.5; hitEnemy(this, b.dps * 0.5, 'burn'); }
    }
    this.burns = this.burns.filter(b => b.t > 0);
    if (this.dead) return;

    // knockback decay
    this.x += this.kx * dt; this.y += this.ky * dt;
    this.kx *= Math.pow(0.0001, dt); this.ky *= Math.pow(0.0001, dt);

    // a stun freezes everything, including a wind-up in progress (windT does not accrue)
    if (this.stun > 0) { clampToArena(this); return; }
    if (this.windKind && !this.armedAtk) this.windT += dt;

    this.t -= dt;
    const dToP = U.dist(this.x, this.y, P.x, P.y);
    const aToP = U.angle(this.x, this.y, P.x, P.y);

    switch (this.def.ai) {
      case 'chase':
        if (this.state === 'bite') { this.biteStep(P); break; }
        ENEMY_AI.steer(this, dt);
        this.touchAttack(dToP, dt);
        break;

      case 'lunge':
        if (this.state === 'idle') {
          ENEMY_AI.steer(this, dt);
          if (dToP < 130 && this.t <= 0 && ENEMY_AI.requestToken(this, 'melee')) {
            this.state = 'wind'; this.lungeA = aToP;
            this.windUp('melee', ENEMY_AI.windTime('melee', 0.45), { type: 'line', a: this.lungeA, len: 150 });
          }
        } else if (this.state === 'wind') {
          if (this.t <= 0) { this.armAttack(); this.state = 'lunge'; this.t = 0.22; AUDIO.sfx('swing'); }
        } else if (this.state === 'lunge') {
          this.x += Math.cos(this.lungeA) * 560 * dt;
          this.y += Math.sin(this.lungeA) * 560 * dt;
          this.touchAttack(U.dist(this.x, this.y, P.x, P.y), dt, this.dmg);
          if (this.t <= 0) { this.endAttack(); this.state = 'idle'; this.t = U.rand(1.2, 2) * this.cdMul; }
        }
        break;

      case 'shoot': {
        // hold the ranged band (ENEMY_AI); fire only within engageRange (Phase 05.1, WAVE-04) and
        // from inside the player's view band (D-18), after an aim tell that tracks the player
        const ER = DATA.WAVES.engageRange;
        if (this.state === 'aim') {
          if (this.telegraph) this.telegraph.a = aToP;
          if (this.t <= 0) {
            if (!ENEMY_AI.inViewBand(this.x, this.y, P)) { this.endAttack(); this.state = 'idle'; this.t = 0.3; break; }
            this.aimA = aToP;
            this.armAttack();
            const ps = this.def.projSpeed;
            this.fire(this.def.fam || 'bolt', Math.cos(this.aimA) * ps, Math.sin(this.aimA) * ps, this.dmg);
            this.endAttack(); this.state = 'idle'; this.t = U.rand(1.6, 2.6) * this.cdMul;
          }
          break;
        }
        ENEMY_AI.steer(this, dt);
        if (this.t <= 0) {
          if (dToP <= ER && ENEMY_AI.inViewBand(this.x, this.y, P) && ENEMY_AI.requestToken(this, 'ranged')) {
            this.state = 'aim'; this.aimA = aToP;
            this.windUp('ranged', ENEMY_AI.windTime('ranged', 0.35), { type: 'line', a: this.aimA, len: 180 });
          } else this.t = 0.3;
        }
        break;
      }

      case 'spread': {
        const ER = DATA.WAVES.engageRange;
        if (this.state === 'aim') {
          if (this.telegraph) this.telegraph.a = aToP;
          if (this.t <= 0) {
            if (!ENEMY_AI.inViewBand(this.x, this.y, P)) { this.endAttack(); this.state = 'idle'; this.t = 0.3; break; }
            this.aimA = aToP;
            this.armAttack();
            const ps = this.def.projSpeed;
            for (const off of [-0.3, 0, 0.3])
              this.fire(this.def.fam || 'bolt', Math.cos(this.aimA + off) * ps, Math.sin(this.aimA + off) * ps, this.dmg);
            this.endAttack(); this.state = 'idle'; this.t = U.rand(2, 3.2) * this.cdMul;
          }
          break;
        }
        ENEMY_AI.steer(this, dt);
        if (this.t <= 0) {
          if (dToP <= ER && ENEMY_AI.inViewBand(this.x, this.y, P) && ENEMY_AI.requestToken(this, 'ranged')) {
            this.state = 'aim'; this.aimA = aToP;
            this.windUp('status', ENEMY_AI.windTime('status', 0.45), { type: 'cone', a: this.aimA, arc: 0.7, r: 160 });
          } else this.t = 0.3;
        }
        break;
      }

      case 'teleport':
        if (this.state === 'idle') {
          if (this.t <= 0 && ENEMY_AI.requestToken(this, 'melee')) {
            // vanish, reappear near the player — ahead of it when it is running (escape cut)
            burst(this.x, this.y, this.color, 10, 140, 0.4);
            const pv = ENEMY_AI.pv;
            const a = Math.hypot(pv.x, pv.y) > 60 ? Math.atan2(pv.y, pv.x) + U.rand(-0.8, 0.8) : U.rand(U.TAU);
            this.x = U.clamp(P.x + Math.cos(a) * 90, GAME.arena.x + 20, GAME.arena.x + GAME.arena.w - 20);
            this.y = U.clamp(P.y + Math.sin(a) * 90, GAME.arena.y + 20, GAME.arena.y + GAME.arena.h - 20);
            burst(this.x, this.y, this.color, 10, 140, 0.4);
            this.state = 'strike';
            this.windUp('melee', ENEMY_AI.windTime('melee', 0.5), { type: 'circle', r: 46 });
          }
        } else {
          if (this.t <= 0) {
            this.armAttack();
            if (U.dist(this.x, this.y, P.x, P.y) < 60) { this.hurtPlayer(this.dmg); P.meleeRetaliate(this); }
            GAME.rings.push({ x: this.x, y: this.y, r: 46, t: 0.2, color: this.color });
            this.endAttack();
            this.state = 'idle'; this.t = U.rand(1.8, 2.8) * this.cdMul;
          }
        }
        break;

      case 'tank':
        if (this.state === 'bite') { this.biteStep(P); break; }
        ENEMY_AI.steer(this, dt);
        this.touchAttack(dToP, dt);
        break;

      case 'charge':
        if (this.state === 'idle') {
          ENEMY_AI.steer(this, dt);
          if (this.t <= 0 && dToP < 420 && ENEMY_AI.requestToken(this, 'heavy')) {
            this.state = 'wind'; this.lungeA = aToP;
            this.windUp('melee', ENEMY_AI.windTime('melee', 0.7), { type: 'line', a: this.lungeA, len: 420 });
          }
        } else if (this.state === 'wind') {
          if (this.t <= 0) { this.armAttack(); this.state = 'charge'; this.t = 0.7; GAME.shake = Math.max(GAME.shake, 3); }
        } else if (this.state === 'charge') {
          this.x += Math.cos(this.lungeA) * 640 * dt;
          this.y += Math.sin(this.lungeA) * 640 * dt;
          this.touchAttack(U.dist(this.x, this.y, P.x, P.y), dt, this.dmg);
          // stop at walls
          const A = GAME.arena;
          if (this.x < A.x + this.r || this.x > A.x + A.w - this.r ||
              this.y < A.y + this.r || this.y > A.y + A.h - this.r) this.t = 0;
          if (this.t <= 0) { this.endAttack(); this.state = 'idle'; this.t = U.rand(1.5, 2.5) * this.cdMul; }
        }
        break;

      case 'summon': {
        // hold the support band (ENEMY_AI, 260-560 px), summon pretas (Phase 05.1, WAVE-04: approach
        // when far, and never push the room over the alive cap). Non-damaging: no token.
        const ER = DATA.WAVES.engageRange;
        ENEMY_AI.steer(this, dt);
        if (this.t <= 0) {
          const livingPretas = GAME.enemies.filter(e => !e.dead && e.type === 'preta').length;
          if (dToP <= ER + 200 && livingPretas < 5 && ROOMS.aliveCount() < DATA.WAVES.maxAlive) {
            const e = new Enemy('preta', this.x + U.rand(-40, 40), this.y + U.rand(-40, 40), GAME.biome.scale);
            GAME.enemies.push(e);
            burst(this.x, this.y, this.color, 8, 120, 0.4);
          }
          this.t = 5;
        }
        break;
      }

      // ---- 05.7.1-05 (D-05): Naraka / Patala signature enemies ----
      case 'swarm': {
        // pishacha: orbit the player at 90-130 px, then dart in after a bite tell
        if (this.orbA == null) {
          this.orbA = U.angle(P.x, P.y, this.x, this.y);
          this.orbDir = U.chance(0.5) ? 1 : -1;
          this.orbR = U.rand(90, 130);
        }
        if (this.state === 'dartWind') {
          if (this.t <= 0) { this.armAttack(); this.lungeA = aToP; this.state = 'dart'; this.t = 0.3; AUDIO.sfx('swing'); }
          break;
        }
        if (this.state === 'dart') {
          this.x += Math.cos(this.lungeA) * 420 * dt;
          this.y += Math.sin(this.lungeA) * 420 * dt;
          this.touchAttack(U.dist(this.x, this.y, P.x, P.y), dt, this.dmg);
          if (this.t <= 0) {
            this.endAttack(); this.state = 'idle'; this.t = U.rand(1.2, 2.0) * this.cdMul;
            this.orbA = U.angle(P.x, P.y, this.x, this.y);
          }
          break;
        }
        const spd = this.curSpeed();
        this.orbA += dt * Math.min(2.2, 0.9 * spd / this.orbR) * this.orbDir;
        const tx = P.x + Math.cos(this.orbA) * this.orbR, ty = P.y + Math.sin(this.orbA) * this.orbR;
        const d = U.dist(this.x, this.y, tx, ty);
        if (d > 1e-6) { const st = Math.min(d, spd * dt); this.x += (tx - this.x) / d * st; this.y += (ty - this.y) / d * st; }
        if (this.t <= 0 && dToP < this.orbR + 60 && ENEMY_AI.requestToken(this, 'bite')) {
          this.state = 'dartWind';
          this.windUp('bite', ENEMY_AI.windTime('bite', 0.25), { type: 'circle', r: this.r + 8 });
        }
        break;
      }

      case 'mortar':
      case 'trapper': {
        // kumbhipaka stoker: 3 burning mortars around the player. mayavi weaver: alternates root
        // snares (mortar family) with a pair of slowing wisps. Every tell is a 'status' wind-up;
        // a lob started from outside the view band gets +LONG_TELL_BONUS and the longShot flag.
        const ER = DATA.WAVES.engageRange;
        if (this.state === 'lob') {
          if (this.t <= 0) {
            this.armAttack();
            if (this.lobKind === 'wisp') {
              const ws = DATA.PROJECTILES.wisp.speed;
              for (const off of [-0.4, 0.4]) this.fire('wisp', Math.cos(aToP + off) * ws, Math.sin(aToP + off) * ws, this.dmg);
            } else if (this.lobKind === 'snare') {
              for (const shot of this.plan.shots)
                this.fire('mortar', 0, 0, this.dmg * 0.5, Object.assign({}, shot.extra, { flight: 0.9, r: 46, status: { type: 'root', dur: 1.0 } }));
            } else {
              for (const shot of this.plan.shots)
                this.fire('mortar', 0, 0, this.dmg * (shot.dmgMul || 1), Object.assign({}, shot.extra, { pool: this.def.pool }));
            }
            this.marks = null; this.plan = null; this.longShot = false;
            if (this.def.ai === 'trapper') this.trapAlt = !this.trapAlt;
            this.endAttack(); this.state = 'idle';
            this.t = (this.def.ai === 'trapper' ? U.rand(2.2, 3.0) : U.rand(2.4, 3.4)) * this.cdMul;
          }
          break;
        }
        ENEMY_AI.steer(this, dt);
        if (this.t <= 0) {
          if (dToP <= ER && ENEMY_AI.requestToken(this, 'ranged')) {
            const long = !ENEMY_AI.inViewBand(this.x, this.y, P);
            const bonus = long ? ENEMY_AI.CFG.LONG_TELL_BONUS : 0;
            this.state = 'lob'; this.longShot = long;
            if (this.def.ai === 'trapper' && this.trapAlt) {
              this.lobKind = 'wisp';
              this.windUp('status', ENEMY_AI.windTime('status', 0.45) + bonus, { type: 'circle', r: this.r + 14 });
            } else {
              const snare = this.def.ai === 'trapper';
              this.lobKind = snare ? 'snare' : 'mortar';
              this.plan = PROJ.planPattern(this, snare ? { fam: 'mortar', aim: 'around', count: 2, radius: 90 }
                : { fam: 'mortar', aim: 'around', count: 3, radius: 110 }, P);
              if (snare) for (const m of this.plan.marks) m.r = 46;
              this.windUp('status', ENEMY_AI.windTime('status', 0.45) + bonus);
              this.marks = this.plan.marks;
            }
          } else this.t = 0.3;
        }
        break;
      }

      // ---- 05.7.1-05 (D-05): Ranabhoomi / Vaitarani signature enemies ----
      case 'sniper': {
        // danava javelineer: holds 420-600 px, locks its aim and winds a long line tell, then a beam.
        // Elites wind 'stun' and their beam stuns; a throw from outside the view band is a long shot.
        const ER = DATA.WAVES.engageRange;
        if (this.state === 'aim') {
          if (this.t <= 0) {
            this.armAttack();
            const extra = { a: this.aimA, tell: 0.1, w: 14 };
            if (this.elite) extra.status = { type: 'stun', dur: 0.4 };
            this.fire('beam', 0, 0, this.dmg, extra);
            this.longShot = false;
            this.endAttack(); this.state = 'idle'; this.t = U.rand(2.6, 3.6) * this.cdMul;
          }
          break;
        }
        ENEMY_AI.steer(this, dt);
        if (this.t <= 0) {
          if (dToP <= ER + 200 && ENEMY_AI.requestToken(this, 'ranged')) {
            this.aimA = aToP;
            const long = !ENEMY_AI.inViewBand(this.x, this.y, P);
            this.state = 'aim'; this.longShot = long;
            this.windUp(this.elite ? 'stun' : 'beam',
              Math.max(ENEMY_AI.windTime('beam', 0.8), ENEMY_TG.MIN.beam) + (long ? ENEMY_AI.CFG.LONG_TELL_BONUS : 0),
              { type: 'line', a: this.aimA, len: 900, w: 14 });
          } else this.t = 0.3;
        }
        break;
      }

      case 'buffer':
        // asura standard-bearer: no attack of its own; hangs back behind its allies (def.slotBack)
        // while ENEMY_AI.tick applies its aura (rallied + bannerSpd) to allies in range
        ENEMY_AI.steer(this, dt);
        break;

      case 'healer': {
        // brahmarakshasa: mends the most-wounded ally nearby every heal.every s; slow orb attack
        const H = this.def.heal, ER = DATA.WAVES.engageRange;
        if (this.healT == null) this.healT = H.every;
        this.healT -= dt;
        if (this.healT <= 0) {
          let best = null, bp = 1;
          for (const o of GAME.enemies) {
            if (o === this || o.dead || o.boss || o.spawnT > 0 || o.submerged || !(o.maxhp > 0)) continue;
            if (U.dist(this.x, this.y, o.x, o.y) > H.r) continue;
            const pc = o.hp / o.maxhp;
            if (pc < bp - 1e-9) { bp = pc; best = o; }
          }
          if (best) {
            best.hp = Math.min(best.maxhp, best.hp + best.maxhp * H.frac);
            GAME.bolts.push({ x1: this.x, y1: this.y, x2: best.x, y2: best.y, t: 0.25 });
            GAME.rings.push({ x: best.x, y: best.y, r: best.r + 10, t: 0.3, color: '#7dff5a' });
            this.healT = H.every;
          } else this.healT = 0.5;
        }
        if (this.state === 'cast') {
          if (this.t <= 0) {
            this.armAttack();
            this.fire('orb', Math.cos(aToP) * 140, Math.sin(aToP) * 140, this.dmg);
            this.longShot = false;
            this.endAttack(); this.state = 'idle'; this.t = U.rand(2.6, 3.4) * this.cdMul;
          }
          break;
        }
        ENEMY_AI.steer(this, dt);
        if (this.t <= 0) {
          if (dToP <= ER && ENEMY_AI.requestToken(this, 'ranged')) {
            const long = !ENEMY_AI.inViewBand(this.x, this.y, P);
            this.state = 'cast'; this.longShot = long;
            this.windUp('ranged', ENEMY_AI.windTime('ranged', 0.45) + (long ? ENEMY_AI.CFG.LONG_TELL_BONUS : 0),
              { type: 'circle', r: this.r + 16 });
          } else this.t = 0.3;
        }
        break;
      }

      case 'burrow': {
        // jala-rakshasa: dives (untargetable) toward a point ahead of the player's heading, then
        // emerges after a circle tell at the surfacing point: knockback hit + an expanding ring
        if (this.state === 'dive') {
          this.diveT -= dt;
          const pv = ENEMY_AI.pv, sp = Math.hypot(pv.x, pv.y), A = GAME.arena, m = this.r + 20;
          let tx = P.x, ty = P.y;
          if (sp > 30) { tx += pv.x / sp * 80; ty += pv.y / sp * 80; }
          tx = U.clamp(tx, A.x + m, A.x + A.w - m); ty = U.clamp(ty, A.y + m, A.y + A.h - m);
          const d = U.dist(this.x, this.y, tx, ty);
          if (d > 1e-6) { const st = Math.min(d, this.curSpeed() * 1.4 * dt); this.x += (tx - this.x) / d * st; this.y += (ty - this.y) / d * st; }
          if (U.dist(this.x, this.y, tx, ty) <= 20 || this.diveT <= 0) {
            this.state = 'emergeWind';
            this.windUp('melee', ENEMY_AI.windTime('melee', 0.6), { type: 'circle', r: 70 });
          }
          break;
        }
        if (this.state === 'emergeWind') {
          if (this.t <= 0) {
            this.armAttack();
            this.submerged = false;
            if (U.dist(this.x, this.y, P.x, P.y) < 70 + P.r) {
              this.hurtPlayer(this.dmg, { status: { type: 'knock', force: 420 } });
              P.meleeRetaliate(this);
            }
            this.fire('ring', 0, 0, this.dmg * 0.6, { ox: this.x, oy: this.y, gapArc: 0 });
            GAME.rings.push({ x: this.x, y: this.y, r: 70, t: 0.25, color: this.color });
            GAME.shake = Math.max(GAME.shake, 4);
            this.endAttack(); this.state = 'idle'; this.t = U.rand(2.5, 3.5) * this.cdMul;
          }
          break;
        }
        ENEMY_AI.steer(this, dt);
        if (this.t <= 0 && ENEMY_AI.requestToken(this, 'melee')) {
          // the token is held through the dive (holdToken) so tick() does not reclaim it
          this.submerged = true; this.holdToken = true;
          this.state = 'dive'; this.diveT = this.def.dive;
          burst(this.x, this.y, this.color, 10, 140, 0.4);
        }
        break;
      }

      case 'shield': {
        // naga shield-guard: turns its frontal guard toward the player, thrusts after a line tell
        if (this.face == null) this.face = aToP;
        if (this.state === 'thrust') {
          if (this.t <= 0) {
            this.armAttack();
            const ux = Math.cos(this.thrustA), uy = Math.sin(this.thrustA);
            const rx = P.x - this.x, ry = P.y - this.y;
            const along = rx * ux + ry * uy, across = Math.abs(-rx * uy + ry * ux);
            if (along >= -P.r && along <= 120 + P.r && across < this.r + P.r) {
              this.hurtPlayer(this.dmg, { status: { type: 'knock', force: 380 } });
              P.meleeRetaliate(this);
            }
            GAME.rings.push({ x: this.x + ux * 60, y: this.y + uy * 60, r: 24, t: 0.15, color: this.color });
            AUDIO.sfx('swing');
            this.endAttack(); this.state = 'idle'; this.t = U.rand(1.4, 2.2) * this.cdMul;
          }
          break;
        }
        this.face += U.clamp(U.angDiff(this.face, aToP), -2.5 * dt, 2.5 * dt);
        ENEMY_AI.steer(this, dt);
        if (dToP < 120 && this.t <= 0 && ENEMY_AI.requestToken(this, 'melee')) {
          this.state = 'thrust'; this.thrustA = this.face;
          this.windUp('melee', ENEMY_AI.windTime('melee', 0.45), { type: 'line', a: this.thrustA, len: 120 });
        }
        break;
      }
    }

    clampToArena(this);
    this.atkT = Math.max(0, this.atkT - dt);
  }

  // Contact damage. While a lunge/charge is active (armed) a touch hits at once; otherwise a
  // touch starts a 0.2 s "bite" tell (ENEMY_TG.MIN.bite) that needs a bite token.
  touchAttack(dToP, dt, dmg = this.dmg) {
    const P = GAME.player;
    const inReach = dToP < this.r + P.r + 4;
    if (this.armedAtk) {
      if (inReach && this.atkT <= 0) {
        this.hurtPlayer(dmg);
        P.meleeRetaliate(this);
        this.atkT = 0.8 * this.cdMul;
      }
      return;
    }
    if (inReach && this.atkT <= 0 && this.state !== 'bite' && ENEMY_AI.requestToken(this, 'bite')) {
      this.state = 'bite'; this.biteDmg = dmg;
      this.windUp('bite', ENEMY_AI.windTime('bite', 0.2), { type: 'circle', r: this.r + 8 });
    }
  }

  // The bite tell: hold position, then snap shut on whoever is still in reach.
  biteStep(P) {
    if (this.t > 0) return;
    this.armAttack();
    if (U.dist(this.x, this.y, P.x, P.y) < this.r + P.r + 10) {
      this.hurtPlayer(this.biteDmg != null ? this.biteDmg : this.dmg);
      P.meleeRetaliate(this);
    }
    this.atkT = 0.8 * this.cdMul;
    this.endAttack();
    this.state = 'idle';
  }

  draw(ctx) {
    if (this.spawnT > 0) {
      // spawn-in mandala
      const p = 1 - this.spawnT / DATA.WAVES.spawnGrace;
      ctx.globalAlpha = p;
      ctx.strokeStyle = this.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * (2 - p), 0, U.TAU * p); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    // telegraph (shared with the sprite path — js/combat.js, 05.7.1-01)
    drawTelegraph(ctx, this);
    // 05.7.1-05: a submerged jala-rakshasa shows only its ripple (drawn by drawOverlays)
    if (this.submerged) { drawOverlays(ctx, this, this.y - this.r, this.y + this.r); return; }

    // body
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.stroke();

    // eyes facing the player — instant readability for threat direction
    const a = U.angle(this.x, this.y, GAME.player.x, GAME.player.y);
    ctx.fillStyle = '#1a0a0d';
    const ex = this.x + Math.cos(a) * this.r * 0.45, ey = this.y + Math.sin(a) * this.r * 0.45;
    ctx.beginPath(); ctx.arc(ex - 3, ey, 2.4, 0, U.TAU); ctx.arc(ex + 3, ey, 2.4, 0, U.TAU); ctx.fill();

    // status pips, maya ring, stun glyph, hp bar (shared with the sprite path — js/combat.js)
    drawOverlays(ctx, this, this.y - this.r, this.y + this.r);
  }
}

// ---------------- BOSS telegraph invariant + movesets (GAME-05/06, D-06..D-11) ----------------
// violations: 'bossId:state' strings recorded whenever damage flows without an armed move.
// windLog: {boss, move, wind} recorded each time a damaging move finishes its wind-up.
const BOSS_TG = { violations: [], windLog: [] };

// Move selection (05.7.1-07, D-21): distance bands [close < 220 <= mid < 480 <= far] scale
// in-band move weights x2 and out-of-band x0.3 ('any' unscaled); a camping player (3 s within
// 60 px of one point, or within 90 px of a wall) doubles 'area' moves. Bosses string 1-3 (phase 1)
// or 2-3 (phase 2) moves into a chain; links rest CHAIN_REST[phase] s instead of the move's rest.
const BOSS_AI = { BANDS: [220, 480], IN_BAND: 2, OUT_BAND: 0.3, CAMP_R: 60, CAMP_T: 3, EDGE_R: 90, AREA_MUL: 2,
  CHAIN_P1: [[1, 0.25], [2, 0.55], [3, 0.2]], CHAIN_P2: [[2, 0.55], [3, 0.45]],
  CHAIN_REST: { 1: [0.28, 0.38], 2: [0.2, 0.28] } };

// wind: telegraph seconds (0 = none); active: seconds in the active/resolution state;
// dmg: whether this move can deal damage; activeState: state name override once armed.
const BOSS_MOVE_DEFS = {
  chase:    { wind: 0,    active: 2.2, dmg: false, band: 'any', area: false },
  swipe:    { wind: 0.45, active: 0.15, dmg: true, band: 'close', area: false },
  radial:   { wind: 0.7,  active: 0,   dmg: true, band: 'mid', area: true },
  spiral:   { wind: 0.6,  active: 2.2, dmg: true, band: 'any', area: true },
  charge:   { wind: 0.6,  active: 0.8, dmg: true, activeState: 'charging', band: 'far', area: false },
  slam:     { wind: 1.1,  active: 0,   dmg: true, band: 'any', area: true },
  summon:   { wind: 0.6,  active: 0,   dmg: false, band: 'any', area: false },
  noose:    { wind: 0.6,  active: 1.6, dmg: true, band: 'far', area: false },
  teleport: { wind: 0.4,  active: 0,   dmg: false, band: 'far', area: false },
  // ---- phase-2 signature attacks (D-12), 2 per boss ----
  leap:        { wind: 0.9, active: 0.25, dmg: true, band: 'far', area: false },  // tataka opener
  maw:         { wind: 0.7, active: 0.2,  dmg: true, band: 'close', area: false },  // tataka
  lamps:       { wind: 1.0, active: 0,    dmg: true, band: 'any', area: true },  // ahiravana opener
  crossBeams:  { wind: 0.9, active: 0.35, dmg: true, band: 'any', area: true },  // ahiravana
  quake:       { wind: 0.8, active: 1.8,  dmg: true, band: 'close', area: true },  // kumbhakarna opener
  roar:        { wind: 0.8, active: 0.3,  dmg: true, band: 'mid', area: false },  // kumbhakarna
  ledger:      { wind: 1.0, active: 0.3,  dmg: true, band: 'any', area: true },  // yama opener — "The Ledger is Opened"
  danda:       { wind: 0.8, active: 0.25, dmg: true, band: 'close', area: false },  // yama — "Danda of Judgment"
  // ---- Phase 05.7.1 (D-22): +2 moves per boss on the new projectile families/statuses.
  // Generic `pattern` moves (Boss._runPattern); a pattern `status` overrides the family default,
  // so drumStun's ring never also knocks back. Comments only — no new player-facing strings. ----
  thornVolley: { wind: 0.5, active: 0.7, dmg: true, band: 'mid', area: false,
                 pattern: { fam: 'needle', aim: 'player', count: 5, spread: 0.8, volleys: 3, volleyGap: 0.22 } },          // tataka
  rootSnare:   { wind: 0.9, active: 0.3, dmg: true, band: 'any', area: true,
                 pattern: { fam: 'mortar', aim: 'around', count: 4, radius: 150, status: { type: 'root', dur: 1.0 }, extra: { flight: 0.9 } } }, // tataka
  lampWisps:   { wind: 0.6, active: 0.4, dmg: true, band: 'any', area: true,
                 pattern: { fam: 'wisp', aim: 'radial', count: 4 } },                                                       // ahiravana
  serpentRing: { wind: 0.6, active: 0.3, dmg: true, band: 'any', area: true,
                 pattern: { fam: 'ring', aim: 'self', gapArc: 0.8, status: { type: 'poison', dps: 3, dur: 4 } } },          // ahiravana
  boulderOrbs: { wind: 0.6, active: 0.4, dmg: true, band: 'mid', area: false,
                 pattern: { fam: 'orb', aim: 'player', count: 3, spread: 0.6 } },                                           // kumbhakarna
  drumStun:    { wind: 0.6, active: 0.3, dmg: true, band: 'close', area: true,
                 pattern: { fam: 'ring', aim: 'self', gapArc: 0.7, status: { type: 'stun', dur: 0.4 } } },                  // kumbhakarna: war-drum
  pasha:       { wind: 0.6, active: 0.4, dmg: true, band: 'far', area: false,
                 pattern: { fam: 'coil', aim: 'player', count: 1, status: [{ type: 'root', dur: 0.8 }, { type: 'pull', force: 260 }] } }, // yama: "The Pasha Binds" (a judgment)
  scales:      { wind: 0.8, active: 0.8, dmg: true, band: 'any', area: true,
                 pattern: { fam: 'beam', aim: 'line', count: 2, spread: 0.9, volleys: 2, volleyGap: 0.45, tell: 0.1 } },   // yama: "The Scales Are Weighed" (a judgment)
};

// [id, weight, overrides?] per phase. The first phase-2 entry flagged {opener:true} always
// opens phase 2 deterministically (D-11); phase-1 numeric scaling (radial/spiral/slam/summon
// counts) is applied in Boss.update via this.phase, unchanged from before Phase 4.
const BOSS_MOVESETS = {
  tataka: {
    1: [['chase',3],['radial',2],['charge',2],['summon',1],['thornVolley',2]],
    2: [['leap',2,{opener:true}],['maw',2],['chase',3],['radial',2],['charge',2],['summon',1],['thornVolley',2],['rootSnare',2]],
  },
  ahiravana: {
    1: [['teleport',3],['spiral',3],['radial',2],['summon',2],['lampWisps',2]],
    2: [['lamps',2,{opener:true}],['crossBeams',2],['teleport',3],['spiral',2],['radial',1],['summon',1],['lampWisps',2],['serpentRing',2]],
  },
  kumbhakarna: {
    1: [['chase',3,{active:2.4}],['slam',3],['charge',2,{wind:0.7}],['radial',1],['boulderOrbs',2]],
    2: [['quake',2,{opener:true}],['roar',2],['chase',2,{active:2.0}],['slam',3],['charge',2,{wind:0.7}],['boulderOrbs',2],['drumStun',2]],
  },
  yama: {
    1: [['noose',2],['spiral',3,{active:2.0}],['slam',2],['charge',2],['summon',1],['pasha',2]],
    2: [['ledger',2,{opener:true}],['danda',2],['noose',2],['spiral',2,{active:2.0}],['slam',1],['summon',1],['pasha',2],['scales',2]],
  },
};

const PHASE2_TITLES = {
  tataka: 'THE FOREST HUNGERS', ahiravana: 'THE FIVE LAMPS BURN',
  kumbhakarna: 'THE MOUNTAIN RISES', yama: 'THE LEDGER IS OPENED',
};

// ---------------- BOSS ----------------
class Boss extends Enemy {
  constructor(bossId, x, y, def = DATA.BOSSES[bossId]) {
    super('bhuta', x, y, 1); // base init, then override
    const d = def;
    this.type = bossId; this.bossDef = d;
    this.boss = true;
    this.hp = d.hp; this.maxhp = d.hp;
    this.r = d.r; this.color = d.color;
    this.dmg = 16;
    this.state = 'intro'; this.t = 1.2;
    this.phase = 1;
    this.spawnT = 0;
    this.asleep = bossId === 'kumbhakarna';
    this.burns = [];
    this.armed = null;
    this.marks = [];
    this.dmgCalls = 0;
  }

  // ---- overridable hooks (05.7.1-06): MiniBoss (js/minibosses.js) swaps the move tables,
  // the phase threshold/title and may add custom move states without touching Boss ----
  moveTable(phase = this.phase) { return (BOSS_MOVESETS[this.type] || {})[phase] || []; }
  moveDefBase(id) { return BOSS_MOVE_DEFS[id]; }
  phaseAt() { return 0.5; }
  phaseTitle() { return PHASE2_TITLES[this.type]; }
  customInitWind() { return false; }
  customWindTelegraph() { return false; }
  customActive(dt, dToP, aToP, speedMul) { return false; }

  // ---- moveset data lookup ----
  moveDef(id) {
    const base = this.moveDefBase(id) || {};
    const entry = this.moveTable().find(m => m[0] === id);
    const overrides = (entry && entry[2]) ? entry[2] : {};
    return { ...base, ...overrides };
  }

  // ---- telegraph invariant helpers (D-06) ----
  strike() {
    this.dmgCalls = (this.dmgCalls || 0) + 1;
    if (!this.armed) BOSS_TG.violations.push(this.type + ':' + this.state);
  }
  hurtPlayer(amount) {
    if (!this.armed) BOSS_TG.violations.push(this.type + ':' + this.state);
    GAME.player.takeDamage(amount);
  }
  shoot(vx, vy, dmg, r = 7, x = this.x, y = this.y, fam = 'bolt', extra) {
    if (!this.armed) BOSS_TG.violations.push(this.type + ':' + this.state);
    const p = enemyShot(x, y, vx, vy, dmg, this.color, r, fam, extra ? Object.assign({ owner: this }, extra) : (fam === 'bolt' ? undefined : { owner: this }));
    this.dmgCalls = (this.dmgCalls || 0) + 1;
    return p;
  }

  // Generic data-driven pattern move (def.pattern -> PROJ.planPattern). Phase 2 adds one
  // projectile to 'around' / 'radial' / 'player' patterns (enrage scaling).
  patternFor(def) {
    const pat = Object.assign({}, def.pattern);
    if (this.phase === 2 && (pat.aim === 'around' || pat.aim === 'radial' || pat.aim === 'player')) {
      pat.count = (pat.count || 1) + 1;
    }
    return pat;
  }

  // Fire the armed pattern's volleys (volley 0 uses the plan shown during the wind), then rest.
  _runPattern(dt) {
    const def = this.moveDef(this.curMove);
    const pat = this.patternFor(def);
    const vol = pat.volleys || 1;
    const gap = pat.volleyGap || 0.15;
    const elapsed = (def.active || 0) - this.t;
    while (this.volley < vol && elapsed >= this.volley * gap) {
      const plan = this.volley === 0 ? this.patPlan : PROJ.planPattern(this, pat, GAME.player);
      for (const shot of plan.shots) {
        let vx = shot.vx || 0, vy = shot.vy || 0;
        // 'around' bombs carry only a target point: throw them so they arrive within the
        // family's travel time and fuse on the marked circle, not on the caster
        const fdef = DATA.PROJECTILES[shot.fam];
        if (!vx && !vy && fdef && fdef.behavior === 'bomb' && shot.extra && shot.extra.tx != null) {
          const tt = fdef.travel || 0.7;
          vx = (shot.extra.tx - shot.x) / tt; vy = (shot.extra.ty - shot.y) / tt;
        }
        this.shoot(vx, vy, this.dmg * (pat.dmgMul || 1), undefined, shot.x, shot.y, shot.fam,
          Object.assign({}, pat.extra, shot.extra, pat.status ? { status: pat.status } : {}));
      }
      this.volley++;
    }
    if (this.volley >= vol && this.t <= 0) {
      this.patPlan = null; this.armed = null;
      this.state = 'rest'; this.t = def.rest != null ? def.rest : 0.7;
    }
  }

  // ---- move lifecycle (D-07, D-09) ----
  startMove(id) {
    this.moveSerial = (this.moveSerial || 0) + 1;
    this.armed = null; this.telegraph = null; this.marks = []; this.slams = null; this.patPlan = null;
    GAME.dangerZones = [];
    this.curMove = id; this.lastMove = id;
    this.struck = false;
    const def = this.moveDef(id);
    if (def.wind > 0) {
      this.state = id + 'Wind';
      this.t = def.wind; this.windT = 0; this.windTotal = def.wind;
      this.initWind();
    } else {
      this.arm();
    }
  }

  arm() {
    const d = this.moveDef(this.curMove);
    if (d.dmg) BOSS_TG.windLog.push({ boss: this.type, move: this.curMove, wind: this.windT || 0 });
    this.armed = this.curMove;
    this.state = d.activeState || this.curMove;
    this.t = d.active;
    this.telegraph = null;
    this.marks = [];
    this.struck = false;
  }

  // set up one-time wind data (locked aim points, precomputed targets)
  initWind() {
    if (this.customInitWind()) return;
    const pdef = this.moveDef(this.curMove);
    if (pdef.pattern) {
      this.patPlan = PROJ.planPattern(this, this.patternFor(pdef), GAME.player);
      this.marks = this.patPlan.marks; this.volley = 0;
      return;
    }
    const P = GAME.player;
    const aToP = U.angle(this.x, this.y, P.x, P.y);
    const A = GAME.arena;
    switch (this.curMove) {
      case 'swipe': this.swipeA = aToP; break;
      case 'charge': this.lungeA = aToP; break;
      case 'slam': {
        this.slams = [];
        const n = this.phase === 2 ? 4 : 2;
        for (let i = 0; i < n; i++) {
          this.slams.push({ x: U.clamp(P.x + U.rand(-120, 120), A.x + 40, A.x + A.w - 40),
                             y: U.clamp(P.y + U.rand(-90, 90), A.y + 40, A.y + A.h - 40), r: 85 });
        }
        break;
      }
      case 'summon': {
        this.summonPts = [];
        const n = this.phase === 2 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          this.summonPts.push({ x: U.clamp(this.x + U.rand(-90, 90), A.x + 20, A.x + A.w - 20),
                                 y: U.clamp(this.y + U.rand(-90, 90), A.y + 20, A.y + A.h - 20) });
        }
        break;
      }
      case 'teleport': {
        const a = U.rand(U.TAU);
        this.teleTarget = { x: U.clamp(P.x + Math.cos(a) * 200, A.x + 60, A.x + A.w - 60),
                             y: U.clamp(P.y + Math.sin(a) * 200, A.y + 60, A.y + A.h - 60) };
        break;
      }
      // ---- phase-2 signature attacks (D-12) ----
      case 'leap':
        this.leapTarget = { x: U.clamp(P.x, A.x + 60, A.x + A.w - 60), y: U.clamp(P.y, A.y + 60, A.y + A.h - 60) };
        break;
      case 'maw': this.mawA = aToP; break;
      case 'lamps': {
        const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
        this.lampPts = [];
        for (let i = 0; i < 5; i++) {
          const a = i * (U.TAU / 5) + U.rand(-0.2, 0.2);
          this.lampPts.push({ x: cx + Math.cos(a) * 220, y: cy + Math.sin(a) * 220 });
        }
        break;
      }
      case 'crossBeams':
        this.beamPx = U.clamp(P.x, A.x + 18, A.x + A.w - 18);
        this.beamPy = U.clamp(P.y, A.y + 18, A.y + A.h - 18);
        break;
      case 'quake': this.waveR = this.r; this.quakeHit = false; break;
      case 'roar': this.roarA = aToP; break;
      case 'ledger':
        this.ledgerYs = [P.y, P.y - 140, P.y + 140].map(y => U.clamp(y, A.y + 20, A.y + A.h - 20));
        break;
      case 'danda': this.dandaA = aToP; break;
    }
  }

  // update telegraph/marks each frame during a Wind state
  updateWindTelegraph() {
    if (this.customWindTelegraph()) return;
    if (this.moveDef(this.curMove).pattern) { this.marks = this.patPlan ? this.patPlan.marks : []; return; }
    const P = GAME.player;
    const aToP = U.angle(this.x, this.y, P.x, P.y);
    const dToP = U.dist(this.x, this.y, P.x, P.y);
    switch (this.curMove) {
      case 'swipe':
        this.telegraph = { type: 'cone', a: this.swipeA, arc: 1.7, r: this.r + 80 };
        break;
      case 'radial':
        this.telegraph = { type: 'circle', r: this.r + 30 };
        break;
      case 'spiral':
        this.telegraph = { type: 'ring', r0: this.r + 10, r1: this.r + 44 };
        break;
      case 'charge':
        this.lungeA = aToP;
        this.telegraph = { type: 'line', a: this.lungeA, len: 560 };
        break;
      case 'slam':
        GAME.dangerZones = this.slams.map(s => ({ ...s, frac: 1 - this.t / this.windTotal }));
        break;
      case 'summon':
        this.marks = this.summonPts.map(p => ({ type: 'circle', x: p.x, y: p.y, r: 26 }));
        break;
      case 'noose':
        this.marks = [{ type: 'line', x: this.x, y: this.y, a: aToP, len: dToP, w: 10 }];
        break;
      case 'teleport':
        this.marks = [{ type: 'circle', x: this.teleTarget.x, y: this.teleTarget.y, r: this.r }];
        break;
      // ---- phase-2 signature attacks (D-12) ----
      case 'leap': {
        const A = GAME.arena;
        GAME.dangerZones = [{ x: this.leapTarget.x, y: this.leapTarget.y, r: 90, frac: 1 - this.t / this.windTotal }];
        break;
      }
      case 'maw':
        this.telegraph = { type: 'cone', a: this.mawA, arc: 1.9, r: 240 };
        break;
      case 'lamps':
        this.marks = this.lampPts.map(p => ({ type: 'circle', x: p.x, y: p.y, r: 34 }));
        break;
      case 'crossBeams': {
        const A = GAME.arena;
        this.marks = [
          { type: 'band', x: A.x, y: this.beamPy - 18, w: A.w, h: 36 },
          { type: 'band', x: this.beamPx - 18, y: A.y, w: 36, h: A.h },
        ];
        break;
      }
      case 'quake':
        this.telegraph = { type: 'ring', r0: this.r + 10, r1: this.r + 60 };
        break;
      case 'roar':
        this.telegraph = { type: 'cone', a: this.roarA, arc: 1.4, r: 320 };
        break;
      case 'ledger': {
        const A = GAME.arena;
        this.marks = this.ledgerYs.map(y => ({ type: 'band', x: A.x, y: y - 20, w: A.w, h: 40 }));
        break;
      }
      case 'danda':
        this.telegraph = { type: 'cone', a: this.dandaA, arc: U.TAU - 1.05, r: 200 };
        break;
    }
  }

  // ---- anti-camping (05.7.1-07): 12 samples x 0.25 s = 3 s of player positions ----
  trackCamp(dt) {
    const P = GAME.player;
    if (!this.campHist) this.campHist = [];
    this.campAcc = (this.campAcc || 0) + dt;
    if (this.campAcc >= 0.25) {
      this.campAcc -= 0.25;
      this.campHist.push({ x: P.x, y: P.y });
      if (this.campHist.length > 12) this.campHist.shift();
    }
  }
  camping() {
    const P = GAME.player, A = GAME.arena, R = BOSS_AI.EDGE_R;
    if (A && (P.x < A.x + R || P.x > A.x + A.w - R || P.y < A.y + R || P.y > A.y + A.h - R)) return true;
    const h = this.campHist || [];
    const need = Math.round(BOSS_AI.CAMP_T / 0.25);
    if (h.length < need) return false;
    let mx = 0, my = 0;
    for (const s of h) { mx += s.x; my += s.y; }
    mx /= h.length; my /= h.length;
    return h.every(s => U.dist(s.x, s.y, mx, my) <= BOSS_AI.CAMP_R);
  }

  // ---- move selection (05.7.1-07, D-21): strict no-repeat, distance bands, anti-camping,
  // 2-3 move chains. A pending phase-2 opener always goes first and resets the chain. ----
  logChain() {
    if (this.chainLen > 0) {
      if (!this.chainLog) this.chainLog = [];
      this.chainLog.push({ phase: this.chainPhase, len: this.chainLen });
      if (this.chainLog.length > 200) this.chainLog.shift();
    }
    this.chainLen = 0;
  }
  pickMove() {
    const P = GAME.player, H = GAME.heat || {};
    if (this.pendingOpener) {
      const id = this.pendingOpener; this.pendingOpener = undefined;
      this.logChain(); this.chainLeft = 0;
      this.startMove(id);
      return;
    }
    const midChain = this.chainLeft > 0;
    if (!midChain) {
      this.logChain();
      const tbl = this.phase >= 2 ? BOSS_AI.CHAIN_P2 : BOSS_AI.CHAIN_P1;
      this.chainLeft = U.weightedChoice(tbl.map(([n, w]) => ({ n, w }))).n - 1 + (H.chainBonus || 0);
      this.chainPhase = this.phase;
    } else this.chainLeft--;
    const table = this.moveTable();
    let cands = table.filter(m => m[0] !== this.lastMove);
    if (!cands.length) cands = table;
    // a chain continues with attacks: movement only ever opens (and so cancels) a chain
    if (midChain && cands.some(m => m[0] !== 'chase')) cands = cands.filter(m => m[0] !== 'chase');
    const d = U.dist(this.x, this.y, P.x, P.y);
    const band = d < BOSS_AI.BANDS[0] ? 'close' : d < BOSS_AI.BANDS[1] ? 'mid' : 'far';
    const camp = this.camping();
    const pick = U.weightedChoice(cands.map(m => {
      const def = this.moveDef(m[0]);
      let w = m[1];
      if (def.band && def.band !== 'any') w *= def.band === band ? BOSS_AI.IN_BAND : BOSS_AI.OUT_BAND;
      if (camp && def.area) w *= BOSS_AI.AREA_MUL;
      return { m, w };
    }));
    if (pick.m[0] === 'chase') { this.chainLeft = 0; this.chainLen = 0; }   // movement breaks a chain
    else this.chainLen = (this.chainLen || 0) + 1;
    this.startMove(pick.m[0]);
  }

  update(dt) {
    const P = GAME.player;
    U.cool(this, 'flash', dt); U.cool(this, 'stun', dt);
    U.cool(this, 'maya', dt); U.cool(this, 'slowT', dt);

    for (const b of this.burns) {
      b.t -= dt; b.acc = (b.acc || 0) + dt;
      if (b.acc >= 0.5) { b.acc -= 0.5; hitEnemy(this, b.dps * 0.5, 'burn'); }
    }
    this.burns = this.burns.filter(b => b.t > 0);
    if (this.dead) return;

    // phase 2 trigger (D-11): phaseShift beat, then a deterministic opener
    if (this.phase === 1 && this.hp < this.maxhp * this.phaseAt()) {
      this.phase = 2;
      this.state = 'phaseShift'; this.t = 1.2;
      this.armed = null; this.telegraph = null; this.marks = []; this.slams = null;
      GAME.dangerZones = []; GAME.nooseT = 0;
      GAME.shake = Math.max(GAME.shake, 14);
      VFX.emit('phase', this.x, this.y, 0, this.color);
      VFX.flash(0xfff0c0, 0.4, 0.25);
      VFX.hitstop(6);
      dmgText(this.x, this.y - this.r - 20, '!!', '#ff4430', 28);
      const title = this.phaseTitle();
      if (title) UI.banner(title, this.color);
      const table2 = this.moveTable(2);
      const openerEntry = table2.find(m => m[2] && m[2].opener);
      this.pendingOpener = openerEntry ? openerEntry[0] : undefined;
    }

    // kumbhakarna sleeps until hurt enough
    if (this.asleep) {
      if (this.hp < this.maxhp * 0.78) {
        this.asleep = false;
        GAME.shake = 16;
        UI.banner('KUMBHAKARNA AWAKENS', this.color);
        AUDIO.sfx('bosshurt');
      }
      return;
    }

    if (this.stun > 0) { clampToArena(this); return; }

    this.trackCamp(dt);
    const prevState = this.state;
    this.t -= dt;
    const dToP = U.dist(this.x, this.y, P.x, P.y);
    const aToP = U.angle(this.x, this.y, P.x, P.y);
    const speedMul = (this.phase === 2 ? 1.3 : 1) * (this.slowT > 0 ? this.slowF : 1);

    if (this.state.endsWith('Wind')) {
      this.windT = (this.windT || 0) + dt;
      this.updateWindTelegraph();
      if (this.t <= 0) this.arm();
    } else if (this.patPlan && this.state === this.curMove && this.moveDef(this.curMove).pattern) {
      this._runPattern(dt);
    } else if (this.customActive(dt, dToP, aToP, speedMul)) {
      /* subclass-owned move state */
    } else switch (this.state) {
      case 'intro':
        if (this.t <= 0) this.pickMove();
        break;

      case 'phaseShift':
        if (this.t <= 0) this.pickMove();
        break;

      case 'chase': {
        const spd = (this.type === 'kumbhakarna' ? 70 : 120) * speedMul;
        this.x += Math.cos(aToP) * spd * dt;
        this.y += Math.sin(aToP) * spd * dt;
        this.swipeCd = Math.max(0, (this.swipeCd || 0) - dt);
        if (dToP < this.r + P.r + 70 && this.swipeCd <= 0) {
          this.swipeCd = 1.2;
          this.startMove('swipe');
          break;
        }
        if (this.t <= 0) this.pickMove();
        break;
      }

      case 'swipe': {
        if (!this.struck) {
          this.struck = true;
          this.strike();
          if (dToP < this.r + 80 + P.r && Math.abs(U.angDiff(this.swipeA, aToP)) < 1.7 / 2) {
            this.hurtPlayer(this.dmg * 1.2);
          }
          burst(this.x, this.y, this.color, 10, 180, 0.3);
        }
        if (this.t <= 0) { this.state = 'rest'; this.t = 0.5; this.armed = null; }
        break;
      }

      case 'radial': {
        this.strike();
        const n = this.phase === 2 ? 16 : 10;
        const off = U.rand(U.TAU);
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * U.TAU;
          this.shoot(Math.cos(a) * 240, Math.sin(a) * 240, this.dmg * 0.7, 7);
        }
        AUDIO.sfx('special');
        this.state = 'rest'; this.t = 0.8; this.armed = null;
        break;
      }

      case 'spiral':
        // ahiravana / yama: rotating bullet mandala
        if (!this.struck) { this.struck = true; this.strike(); }
        this.spiralA = (this.spiralA || aToP) + dt * 3.4;
        this.spiralTick = (this.spiralTick || 0) + dt;
        if (this.spiralTick > 0.11) {
          this.spiralTick = 0;
          for (let k = 0; k < (this.phase === 2 ? 3 : 2); k++) {
            const a = this.spiralA + k * (U.TAU / 3);
            this.shoot(Math.cos(a) * 200, Math.sin(a) * 200, this.dmg * 0.6, 6);
          }
        }
        if (this.t <= 0) { this.armed = null; this.pickMove(); }
        break;

      case 'charging': {
        this.x += Math.cos(this.lungeA) * 700 * speedMul * dt;
        this.y += Math.sin(this.lungeA) * 700 * speedMul * dt;
        if (!this.struck) { this.struck = true; this.strike(); }
        const distNow = U.dist(this.x, this.y, P.x, P.y);
        if (distNow < this.r + P.r + 4 && this.atkT <= 0) { this.hurtPlayer(this.dmg * 1.5); this.atkT = 0.8; }
        const A = GAME.arena;
        if (this.x < A.x + this.r + 4 || this.x > A.x + A.w - this.r - 4 ||
            this.y < A.y + this.r + 4 || this.y > A.y + A.h - this.r - 4) {
          GAME.shake = 10; this.t = 0;
        }
        if (this.t <= 0) { this.state = 'rest'; this.t = 1.0; this.armed = null; }
        break;
      }

      case 'slam': {
        this.strike();
        for (const s of this.slams) {
          GAME.rings.push({ x: s.x, y: s.y, r: s.r, t: 0.25, color: this.color });
          if (U.dist(P.x, P.y, s.x, s.y) < s.r + P.r) this.hurtPlayer(this.dmg * 1.4);
        }
        GAME.shake = 12; AUDIO.sfx('special');
        this.slams = null; GAME.dangerZones = [];
        this.state = 'rest'; this.t = 0.9; this.armed = null;
        break;
      }

      case 'summon': {
        const pool = GAME.biome.enemies;
        for (const p of this.summonPts) {
          const e = new Enemy(U.choice(pool), p.x, p.y, GAME.biome.scale * 0.7);
          GAME.enemies.push(e);
        }
        burst(this.x, this.y, this.color, 14, 200, 0.5);
        this.armed = null;
        this.pickMove();
        break;
      }

      case 'noose': {
        // yama: pull the player toward him
        if (!this.struck) { this.struck = true; this.strike(); }
        GAME.nooseT = this.t;
        const pull = 320;
        P.x += Math.cos(U.angle(P.x, P.y, this.x, this.y)) * pull * dt;
        P.y += Math.sin(U.angle(P.x, P.y, this.x, this.y)) * pull * dt;
        if (dToP < this.r + P.r + 16) {
          this.hurtPlayer(this.dmg * 1.6);
          GAME.nooseT = 0; this.state = 'rest'; this.t = 1.2; this.armed = null;
        }
        if (this.t <= 0) { GAME.nooseT = 0; this.state = 'rest'; this.t = 0.8; this.armed = null; }
        break;
      }

      case 'teleport': {
        burst(this.x, this.y, this.color, 16, 200, 0.5);
        this.x = this.teleTarget.x; this.y = this.teleTarget.y;
        burst(this.x, this.y, this.color, 16, 200, 0.5);
        this.armed = null;
        this.pickMove();
        break;
      }

      // ---- phase-2 signature attacks (D-12) ----
      case 'leap': {
        if (!this.struck) {
          this.struck = true;
          this.strike();
          this.x = this.leapTarget.x; this.y = this.leapTarget.y;
          burst(this.x, this.y, this.color, 18, 220, 0.5);
          if (U.dist(P.x, P.y, this.x, this.y) < 90 + P.r) this.hurtPlayer(this.dmg * 1.6);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * U.TAU;
            this.shoot(Math.cos(a) * 230, Math.sin(a) * 230, this.dmg * 0.6, 7);
          }
          GAME.shake = Math.max(GAME.shake, 12);
          GAME.dangerZones = [];
        }
        if (this.t <= 0) { this.state = 'rest'; this.t = 0.8; this.armed = null; }
        break;
      }

      case 'maw': {
        if (!this.struck) {
          this.struck = true;
          this.strike();
          if (dToP < 240 + P.r && Math.abs(U.angDiff(this.mawA, aToP)) < 1.9 / 2) this.hurtPlayer(this.dmg * 1.5);
          burst(this.x, this.y, this.color, 10, 200, 0.3);
        }
        if (this.t <= 0) { this.state = 'rest'; this.t = 0.6; this.armed = null; }
        break;
      }

      case 'lamps': {
        this.strike();
        for (const lamp of this.lampPts) {
          burst(lamp.x, lamp.y, this.color, 10, 160, 0.4);
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * U.TAU;
            this.shoot(Math.cos(a) * 210, Math.sin(a) * 210, this.dmg * 0.6, 6, lamp.x, lamp.y);
          }
        }
        AUDIO.sfx('special');
        this.state = 'rest'; this.t = 0.9; this.armed = null;
        break;
      }

      case 'crossBeams': {
        if (!this.struck) {
          this.struck = true;
          this.strike();
          const A = GAME.arena;
          const inH = P.y > this.beamPy - 18 && P.y < this.beamPy + 18;
          const inV = P.x > this.beamPx - 18 && P.x < this.beamPx + 18;
          if (inH || inV) this.hurtPlayer(this.dmg * 1.4);
          GAME.bolts.push({ x1: A.x, y1: this.beamPy, x2: A.x + A.w, y2: this.beamPy, t: 0.25 });
          GAME.bolts.push({ x1: this.beamPx, y1: A.y, x2: this.beamPx, y2: A.y + A.h, t: 0.25 });
          GAME.shake = Math.max(GAME.shake, 8);
        }
        if (this.t <= 0) { this.state = 'rest'; this.t = 0.7; this.armed = null; }
        break;
      }

      case 'quake': {
        if (!this.struck) { this.struck = true; this.strike(); }
        this.waveR += 380 * dt;
        this.marks = [{ type: 'ringMark', x: this.x, y: this.y, r: this.waveR, width: 24 }];
        if (!this.quakeHit && Math.abs(dToP - this.waveR) < 12 + P.r) { this.hurtPlayer(this.dmg * 1.3); this.quakeHit = true; }
        if (this.waveR > 700 || this.t <= 0) { this.state = 'rest'; this.t = 1.0; this.armed = null; this.marks = []; }
        break;
      }

      case 'roar': {
        if (!this.struck) {
          this.struck = true;
          this.strike();
          if (dToP < 320 + P.r && Math.abs(U.angDiff(this.roarA, aToP)) < 1.4 / 2) {
            this.hurtPlayer(this.dmg * 1.2);
            P.x += Math.cos(this.roarA) * 140; P.y += Math.sin(this.roarA) * 140;
            clampToArena(P);
          }
          burst(this.x, this.y, this.color, 12, 220, 0.4);
          GAME.shake = Math.max(GAME.shake, 10);
        }
        if (this.t <= 0) { this.state = 'rest'; this.t = 0.8; this.armed = null; }
        break;
      }

      case 'ledger': {
        if (!this.struck) {
          this.struck = true;
          this.strike();
          const A = GAME.arena;
          for (const y of this.ledgerYs) {
            if (P.y > y - 20 && P.y < y + 20) this.hurtPlayer(this.dmg * 1.3);
            GAME.rings.push({ x: A.x + A.w / 2, y, r: 40, t: 0.3, color: this.color });
          }
        }
        if (this.t <= 0) { this.state = 'rest'; this.t = 0.8; this.armed = null; }
        break;
      }

      case 'danda': {
        if (!this.struck) {
          this.struck = true;
          this.strike();
          const safeCenter = this.dandaA + Math.PI;
          const inSafeWedge = Math.abs(U.angDiff(safeCenter, aToP)) < 0.5236; // 30deg half-wedge (60deg total)
          if (dToP < 200 + P.r && !inSafeWedge) this.hurtPlayer(this.dmg * 1.4);
          burst(this.x, this.y, this.color, 14, 200, 0.4);
        }
        if (this.t <= 0) { this.state = 'rest'; this.t = 0.7; this.armed = null; }
        break;
      }

      case 'rest':
        if (this.t <= 0) this.pickMove();
        break;
    }

    // chain link: a move that just ended mid-chain rests only CHAIN_REST[phase] s (Heat restMul)
    if (prevState !== 'rest' && this.state === 'rest' && this.chainLeft > 0) {
      this.t = Math.min(this.t, U.rand(...BOSS_AI.CHAIN_REST[Math.min(2, this.phase)]) * (GAME.heat && GAME.heat.restMul || 1));
    }

    clampToArena(this);
    this.atkT = Math.max(0, this.atkT - dt);
  }

  draw(ctx) {
    // telegraph (fill-progress), world-anchored marks and the noose rope — shared with the
    // sprite path (js/combat.js, 05.7.1-01)
    drawTelegraph(ctx, this);

    // aura
    const grad = ctx.createRadialGradient(this.x, this.y, 4, this.x, this.y, this.r * 2.2);
    grad.addColorStop(0, this.color + '55');
    grad.addColorStop(1, this.color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 2.2, 0, U.TAU); ctx.fill();

    // body: layered mandala rings
    ctx.fillStyle = this.flash > 0 ? '#fff' : this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    const spin = GAME.time * (this.asleep ? 0.2 : 1.2);
    for (let ring = 0; ring < 3; ring++) {
      const rr = this.r * (0.4 + ring * 0.25);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = spin * (ring % 2 ? -1 : 1) + (i / 8) * U.TAU;
        ctx.moveTo(this.x + Math.cos(a) * rr * 0.8, this.y + Math.sin(a) * rr * 0.8);
        ctx.lineTo(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr);
      }
      ctx.stroke();
    }

    // eyes
    const a = U.angle(this.x, this.y, GAME.player.x, GAME.player.y);
    ctx.fillStyle = this.asleep ? 'rgba(0,0,0,0.3)' : '#1a0508';
    const ex = this.x + Math.cos(a) * this.r * 0.4, ey = this.y + Math.sin(a) * this.r * 0.4;
    ctx.beginPath(); ctx.arc(ex - 6, ey, 4, 0, U.TAU); ctx.arc(ex + 6, ey, 4, 0, U.TAU); ctx.fill();

    // asleep zzz + burn pips (shared with the sprite path — js/combat.js)
    drawOverlays(ctx, this, this.y - this.r, this.y + this.r);
  }
}

// ---------------- shared helpers ----------------
function clampToArena(ent) {
  const A = GAME.arena;
  ent.x = U.clamp(ent.x, A.x + ent.r, A.x + A.w - ent.r);
  ent.y = U.clamp(ent.y, A.y + ent.r, A.y + A.h - ent.r);
  // push out of obstacles (pillar/wall/pit all block movement)
  for (const p of GAME.pillars) {
    if (p.shape === 'rect') {
      const cx = U.clamp(ent.x, p.x, p.x + p.w);
      const cy = U.clamp(ent.y, p.y, p.y + p.h);
      const d = U.dist(ent.x, ent.y, cx, cy);
      if (d > 0.001 && d < ent.r) {
        const a = Math.atan2(ent.y - cy, ent.x - cx);
        ent.x = cx + Math.cos(a) * ent.r;
        ent.y = cy + Math.sin(a) * ent.r;
      } else if (d <= 0.001) {
        // center is inside the rect: push out through the nearest side
        const distLeft = ent.x - p.x, distRight = (p.x + p.w) - ent.x;
        const distTop = ent.y - p.y, distBottom = (p.y + p.h) - ent.y;
        const min = Math.min(distLeft, distRight, distTop, distBottom);
        if (min === distLeft) ent.x = p.x - ent.r;
        else if (min === distRight) ent.x = p.x + p.w + ent.r;
        else if (min === distTop) ent.y = p.y - ent.r;
        else ent.y = p.y + p.h + ent.r;
      }
    } else {
      const d = U.dist(ent.x, ent.y, p.x, p.y);
      const min = p.r + ent.r;
      if (d < min && d > 0.001) {
        const a = U.angle(p.x, p.y, ent.x, ent.y);
        ent.x = p.x + Math.cos(a) * min;
        ent.y = p.y + Math.sin(a) * min;
      }
    }
  }
  // re-clamp to arena bounds so pushes never leave the arena
  ent.x = U.clamp(ent.x, A.x + ent.r, A.x + A.w - ent.r);
  ent.y = U.clamp(ent.y, A.y + ent.r, A.y + A.h - ent.r);
}
