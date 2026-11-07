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
  }
  if (opts.finisher) CAMERA.kick(Math.cos(hitAngle) * 4, Math.sin(hitAngle) * 4);

  return dmg;
}

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
  // coins
  let coins = e.boss ? U.randInt(8, 12) : (U.chance(0.55) ? U.randInt(1, 3) : 0);
  for (let i = 0; i < coins; i++) {
    GAME.pickups.push({ x: e.x + U.rand(-14, 14), y: e.y + U.rand(-14, 14),
      type: 'mudra', val: U.randInt(2, 5), t: 12,
      vx: U.rand(-60, 60), vy: U.rand(-60, 60) });
  }
}

function enemyShot(x, y, vx, vy, dmg, color, r = 6) {
  GAME.eprojectiles.push({ x, y, vx, vy, dmg, color, r, t: 4 });
}

// ---------------- PLAYER ----------------
class Player {
  constructor(weaponId) {
    this.weapon = DATA.WEAPONS[weaponId];
    this.x = 0; this.y = 0; this.r = 13;
    this.maxhp = 100 + META.bonusHp();
    this.hp = this.maxhp;
    this.speed = 265 * META.bonusSpeed();
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

    // duo boons
    this.pavanaT = 0;            // duo_pavanaputra: post-dash damage window
    this.kapiHits = 0;           // duo_kapidhvaja: attack-hit counter

    // environmental hazards
    this.hazardSlowT = 0; this.hazardSlowF = 1;

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
    if (this.hazardSlowT > 0) s *= this.hazardSlowF;
    return s;
  }

  dashCooldown() {
    let cd = 2.2;
    if (this.has('vayu_gust')) cd *= 1 - (this.val('vayu_gust') - 1) * 0.2;
    return Math.max(0.8, cd);
  }

  update(dt) {
    const I = INPUT;
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
    // cast regen
    if (this.castCharges < this.castMax) {
      this.castRegen += dt;
      if (this.castRegen >= 6) { this.castRegen = 0; this.castCharges++; }
    }
    // dash regen
    if (this.dashCharges < this.dashMax) {
      this.dashRegen += dt;
      if (this.dashRegen >= this.dashCooldown()) { this.dashRegen = 0; this.dashCharges++; }
    }

    // movement
    let dx = 0, dy = 0;
    const analogMag = Math.hypot(I.ax || 0, I.ay || 0);
    if (analogMag > 0) {
      dx = I.ax; dy = I.ay;
    } else {
      const kb = PAD.digitalMoveVector(I.keys, I.bindings);
      dx = kb.dx; dy = kb.dy;
    }

    if (this.dashT > 0) {
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
          if (U.dist(this.x, this.y, p.x, p.y) < 34) { p.t = 0; burst(p.x, p.y, '#e84a8a', 5, 100, 0.25); }
        }
      }
    } else {
      this.x += dx * this.moveSpeed() * dt;
      this.y += dy * this.moveSpeed() * dt;
    }

    clampToArena(this);

    // attacking
    if (this.weapon.type === 'bow') this.updateBow(dt, I);
    else if (I.lmb && this.atkCd <= 0) this.meleeAttack();

    for (const tr of this.trail) tr.t -= dt;
    this.trail = this.trail.filter(t => t.t > 0);
  }

  tryDash(dx, dy) {
    if (this.dashCharges <= 0 || this.dashT > 0) return;
    this.dashCharges--;
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

  meleeAttack() {
    const w = this.weapon;
    this.atkCd = this.attackRate();
    this.comboT = 0.9;
    const dmg = w.combo[this.comboIdx % w.combo.length];
    const isFinisher = (this.comboIdx % w.combo.length) === w.combo.length - 1;
    this.comboIdx++;
    this.swing = { a: this.aim, t: 0.12, range: w.range, arc: w.arc };
    AUDIO.sfx('swing');
    let kb = w.knockback * (isFinisher ? 1.6 : 1);
    if (this.has('han_attack')) kb *= 1.5;
    if (this.pavanaT > 0 && this.has('duo_pavanaputra')) kb *= 2;
    for (const e of GAME.enemies) {
      if (e.dead) continue;
      const d = U.dist(this.x, this.y, e.x, e.y);
      if (d < w.range + e.r && Math.abs(U.angDiff(this.aim, U.angle(this.x, this.y, e.x, e.y))) < w.arc / 2) {
        hitEnemy(e, dmg, 'attack', isFinisher ? { finisher: true } : undefined);
        if (!e.boss) {
          const a = U.angle(this.x, this.y, e.x, e.y);
          e.kx += Math.cos(a) * kb; e.ky += Math.sin(a) * kb;
        }
      }
    }
    if (isFinisher) GAME.shake = Math.max(GAME.shake, 3);
  }

  updateBow(dt, I) {
    const w = this.weapon;
    if (I.lmb && this.atkCd <= 0) {
      this.charging = true;
      this.charge = Math.min(1, this.charge + dt / w.chargeTime);
    } else if (this.charging) {
      // release
      const c = this.charge;
      this.charging = false; this.charge = 0;
      this.atkCd = this.attackRate();
      const dmg = U.lerp(w.dmgMin, w.dmgMax, c);
      GAME.pprojectiles.push({
        x: this.x, y: this.y,
        vx: Math.cos(this.aim) * w.projSpeed * (0.8 + 0.4 * c),
        vy: Math.sin(this.aim) * w.projSpeed * (0.8 + 0.4 * c),
        dmg, r: 5, t: 2, pierce: c >= 0.98, src: 'attack',
        color: c >= 0.98 ? '#ffd34d' : '#ffffff', hitSet: new Set(),
      });
      AUDIO.sfx('bow');
    }
  }

  trySpecial() {
    if (this.specialCd > 0) return;
    const w = this.weapon, sp = w.special;
    this.specialCd = sp.cd;
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
        if (e.dead) continue;
        if (U.dist(this.x, this.y, e.x, e.y) < radius + e.r) {
          hitEnemy(e, sp.dmg, 'special');
          if (sp.stun) e.stun = Math.max(e.stun, sp.stun);
          if (!e.boss) {
            const a = U.angle(this.x, this.y, e.x, e.y);
            e.kx += Math.cos(a) * 300; e.ky += Math.sin(a) * 300;
          }
        }
      }
    }
  }

  tryCast() {
    if (this.castCharges <= 0) return;
    this.castCharges--;
    AUDIO.sfx('cast');
    // krishna: orbiting discus instead of projectile
    if (this.has('kri_cast')) {
      GAME.orbits.push({ angle: this.aim, t: 6, dmg: this.val('kri_cast'), dist: 70, hitCd: {} });
      return;
    }
    // vayu: roaming cyclone
    if (this.has('vayu_cast')) {
      GAME.zones.push({ x: this.x + Math.cos(this.aim) * 60, y: this.y + Math.sin(this.aim) * 60,
        r: 55, dps: this.val('vayu_cast'), t: 5, type: 'cyclone',
        vx: Math.cos(this.aim) * 90, vy: Math.sin(this.aim) * 90, tick: 0 });
      return;
    }
    const pierce = this.has('dur_cast');
    GAME.pprojectiles.push({
      x: this.x, y: this.y,
      vx: Math.cos(this.aim) * 560, vy: Math.sin(this.aim) * 560,
      dmg: 42, r: 9, t: 1.6, pierce, src: 'cast', chakra: true,
      color: '#ffd34d', hitSet: new Set(),
    });
  }

  takeDamage(amount, fromX, fromY) {
    if (this.iframes > 0 || this.dashT > 0) return;
    if (GAME.godMode) return; // dev playtest toggle (F4)
    // lila dodge
    if (this.has('kri_lila') && U.chance(Math.min(this.val('kri_lila'), 40) / 100)) {
      dmgText(this.x, this.y - 24, 'DODGE', '#5c7cff', 14);
      AUDIO.sfx('shield');
      return;
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

    // bow draw indicator
    if (this.charging) {
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
    if (mods) { this.hp *= mods.hp || 1; this.maxhp = this.hp; this.dmg *= mods.dmg || 1; this.weak = true; }
    this.spd = d.spd; this.color = d.color;
    this.dead = false; this.boss = false;
    this.flash = 0; this.stun = 0; this.maya = 0; this.slowT = 0; this.slowF = 1;
    this.burns = [];
    this.kx = 0; this.ky = 0;        // knockback velocity
    this.state = 'idle'; this.t = U.rand(0.3, 1.2);
    this.spawnT = 0.6;               // spawn-in grace
    this.telegraph = null;
    this.atkT = 0;
  }

  curSpeed() {
    let s = this.spd;
    if (this.slowT > 0) s *= this.slowF;
    return s;
  }

  update(dt) {
    const P = GAME.player;
    U.cool(this, 'flash', dt); U.cool(this, 'stun', dt);
    U.cool(this, 'maya', dt); U.cool(this, 'slowT', dt);
    if (this.spawnT > 0) { this.spawnT -= dt; return; }

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

    if (this.stun > 0) { clampToArena(this); return; }

    this.t -= dt;
    const dToP = U.dist(this.x, this.y, P.x, P.y);
    const aToP = U.angle(this.x, this.y, P.x, P.y);

    switch (this.def.ai) {
      case 'chase':
        this.x += Math.cos(aToP) * this.curSpeed() * dt;
        this.y += Math.sin(aToP) * this.curSpeed() * dt;
        this.touchAttack(dToP, dt);
        break;

      case 'lunge':
        if (this.state === 'idle') {
          this.x += Math.cos(aToP) * this.curSpeed() * dt;
          this.y += Math.sin(aToP) * this.curSpeed() * dt;
          if (dToP < 130 && this.t <= 0) { this.state = 'wind'; this.t = 0.45; this.lungeA = aToP; }
        } else if (this.state === 'wind') {
          this.telegraph = { type: 'line', a: this.lungeA, len: 150 };
          if (this.t <= 0) { this.state = 'lunge'; this.t = 0.22; this.telegraph = null; AUDIO.sfx('swing'); }
        } else if (this.state === 'lunge') {
          this.x += Math.cos(this.lungeA) * 560 * dt;
          this.y += Math.sin(this.lungeA) * 560 * dt;
          this.touchAttack(U.dist(this.x, this.y, P.x, P.y), dt, this.dmg);
          if (this.t <= 0) { this.state = 'idle'; this.t = U.rand(1.2, 2); }
        }
        break;

      case 'shoot': {
        // keep mid range (Phase 05.1, WAVE-04): fairness in large arenas — only fire within engageRange
        const ER = DATA.WAVES.engageRange;
        if (dToP < 200) { this.x -= Math.cos(aToP) * this.curSpeed() * dt; this.y -= Math.sin(aToP) * this.curSpeed() * dt; }
        else if (dToP > 330) { this.x += Math.cos(aToP) * this.curSpeed() * dt; this.y += Math.sin(aToP) * this.curSpeed() * dt; }
        if (this.t <= 0) {
          if (dToP <= ER) {
            enemyShot(this.x, this.y, Math.cos(aToP) * this.def.projSpeed, Math.sin(aToP) * this.def.projSpeed, this.dmg, this.color);
            this.t = U.rand(1.6, 2.6);
          } else this.t = 0.3;
        }
        break;
      }

      case 'spread': {
        const ER = DATA.WAVES.engageRange;
        if (dToP < 170) { this.x -= Math.cos(aToP) * this.curSpeed() * dt; this.y -= Math.sin(aToP) * this.curSpeed() * dt; }
        else if (dToP > 360) { this.x += Math.cos(aToP) * this.curSpeed() * dt; this.y += Math.sin(aToP) * this.curSpeed() * dt; }
        if (this.t <= 0) {
          if (dToP <= ER) {
            for (const off of [-0.3, 0, 0.3])
              enemyShot(this.x, this.y, Math.cos(aToP + off) * this.def.projSpeed, Math.sin(aToP + off) * this.def.projSpeed, this.dmg, this.color);
            this.t = U.rand(2, 3.2);
          } else this.t = 0.3;
        }
        break;
      }

      case 'teleport':
        if (this.state === 'idle') {
          if (this.t <= 0) {
            // vanish, reappear near player
            burst(this.x, this.y, this.color, 10, 140, 0.4);
            const a = U.rand(U.TAU);
            this.x = U.clamp(P.x + Math.cos(a) * 90, GAME.arena.x + 20, GAME.arena.x + GAME.arena.w - 20);
            this.y = U.clamp(P.y + Math.sin(a) * 90, GAME.arena.y + 20, GAME.arena.y + GAME.arena.h - 20);
            burst(this.x, this.y, this.color, 10, 140, 0.4);
            this.state = 'strike'; this.t = 0.5;
          }
        } else {
          this.telegraph = { type: 'circle', r: 46 };
          if (this.t <= 0) {
            this.telegraph = null;
            if (U.dist(this.x, this.y, P.x, P.y) < 60) { P.takeDamage(this.dmg); P.meleeRetaliate(this); }
            GAME.rings.push({ x: this.x, y: this.y, r: 46, t: 0.2, color: this.color });
            this.state = 'idle'; this.t = U.rand(1.8, 2.8);
          }
        }
        break;

      case 'tank':
        this.x += Math.cos(aToP) * this.curSpeed() * dt;
        this.y += Math.sin(aToP) * this.curSpeed() * dt;
        this.touchAttack(dToP, dt);
        break;

      case 'charge':
        if (this.state === 'idle') {
          this.x += Math.cos(aToP) * this.curSpeed() * dt;
          this.y += Math.sin(aToP) * this.curSpeed() * dt;
          if (this.t <= 0 && dToP < 420) { this.state = 'wind'; this.t = 0.7; this.lungeA = aToP; }
        } else if (this.state === 'wind') {
          this.telegraph = { type: 'line', a: this.lungeA, len: 420 };
          if (this.t <= 0) { this.state = 'charge'; this.t = 0.7; this.telegraph = null; GAME.shake = Math.max(GAME.shake, 3); }
        } else if (this.state === 'charge') {
          this.x += Math.cos(this.lungeA) * 640 * dt;
          this.y += Math.sin(this.lungeA) * 640 * dt;
          this.touchAttack(U.dist(this.x, this.y, P.x, P.y), dt, this.dmg);
          // stop at walls
          const A = GAME.arena;
          if (this.x < A.x + this.r || this.x > A.x + A.w - this.r ||
              this.y < A.y + this.r || this.y > A.y + A.h - this.r) this.t = 0;
          if (this.t <= 0) { this.state = 'idle'; this.t = U.rand(1.5, 2.5); }
        }
        break;

      case 'summon': {
        // drift away from the player, summon pretas (Phase 05.1, WAVE-04: approach when far,
        // and never push the room over the alive cap)
        const ER = DATA.WAVES.engageRange;
        if (dToP < 260) { this.x -= Math.cos(aToP) * this.curSpeed() * dt; this.y -= Math.sin(aToP) * this.curSpeed() * dt; }
        else if (dToP > 560) { this.x += Math.cos(aToP) * this.curSpeed() * dt; this.y += Math.sin(aToP) * this.curSpeed() * dt; }
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
    }

    clampToArena(this);
    this.atkT = Math.max(0, this.atkT - dt);
  }

  touchAttack(dToP, dt, dmg = this.dmg) {
    const P = GAME.player;
    if (dToP < this.r + P.r + 4 && this.atkT <= 0) {
      P.takeDamage(dmg);
      P.meleeRetaliate(this);
      this.atkT = 0.8;
    }
  }

  draw(ctx) {
    if (this.spawnT > 0) {
      // spawn-in mandala
      const p = 1 - this.spawnT / 0.6;
      ctx.globalAlpha = p;
      ctx.strokeStyle = this.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * (2 - p), 0, U.TAU * p); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    // telegraph
    if (this.telegraph) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(GAME.time * 18);
      ctx.strokeStyle = '#ff4444'; ctx.fillStyle = 'rgba(255,68,68,0.12)'; ctx.lineWidth = 2;
      if (this.telegraph.type === 'line') {
        const tg = this.telegraph;
        ctx.save();
        ctx.translate(this.x, this.y); ctx.rotate(tg.a);
        ctx.fillRect(0, -this.r, tg.len, this.r * 2);
        ctx.strokeRect(0, -this.r, tg.len, this.r * 2);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.telegraph.r, 0, U.TAU);
        ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

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

    // status pips
    if (this.burns.length) {
      ctx.fillStyle = '#ff7040';
      for (let i = 0; i < this.burns.length; i++) {
        ctx.beginPath(); ctx.arc(this.x - 8 + i * 8, this.y - this.r - 8, 3, 0, U.TAU); ctx.fill();
      }
    }
    if (this.maya > 0) {
      ctx.strokeStyle = '#5c7cff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 4, 0, U.TAU); ctx.stroke();
    }
    if (this.stun > 0) {
      ctx.fillStyle = '#ffd34d';
      ctx.font = '12px Georgia';
      ctx.fillText('✦', this.x - 4, this.y - this.r - 10);
    }

    // hp bar for elites/damaged
    if (this.hp < this.maxhp && !this.boss) {
      const w = this.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(this.x - w / 2, this.y + this.r + 4, w, 4);
      ctx.fillStyle = '#ff5566';
      ctx.fillRect(this.x - w / 2, this.y + this.r + 4, w * U.clamp(this.hp / this.maxhp, 0, 1), 4);
    }
  }
}

// ---------------- BOSS telegraph invariant + movesets (GAME-05/06, D-06..D-11) ----------------
// violations: 'bossId:state' strings recorded whenever damage flows without an armed move.
// windLog: {boss, move, wind} recorded each time a damaging move finishes its wind-up.
const BOSS_TG = { violations: [], windLog: [] };

// wind: telegraph seconds (0 = none); active: seconds in the active/resolution state;
// dmg: whether this move can deal damage; activeState: state name override once armed.
const BOSS_MOVE_DEFS = {
  chase:    { wind: 0,    active: 2.2, dmg: false },
  swipe:    { wind: 0.45, active: 0.15, dmg: true },
  radial:   { wind: 0.7,  active: 0,   dmg: true },
  spiral:   { wind: 0.6,  active: 2.2, dmg: true },
  charge:   { wind: 0.6,  active: 0.8, dmg: true, activeState: 'charging' },
  slam:     { wind: 1.1,  active: 0,   dmg: true },
  summon:   { wind: 0.6,  active: 0,   dmg: false },
  noose:    { wind: 0.6,  active: 1.6, dmg: true },
  teleport: { wind: 0.4,  active: 0,   dmg: false },
  // ---- phase-2 signature attacks (D-12), 2 per boss ----
  leap:        { wind: 0.9, active: 0.25, dmg: true },  // tataka opener
  maw:         { wind: 0.7, active: 0.2,  dmg: true },  // tataka
  lamps:       { wind: 1.0, active: 0,    dmg: true },  // ahiravana opener
  crossBeams:  { wind: 0.9, active: 0.35, dmg: true },  // ahiravana
  quake:       { wind: 0.8, active: 1.8,  dmg: true },  // kumbhakarna opener
  roar:        { wind: 0.8, active: 0.3,  dmg: true },  // kumbhakarna
  ledger:      { wind: 1.0, active: 0.3,  dmg: true },  // yama opener — "The Ledger is Opened"
  danda:       { wind: 0.8, active: 0.25, dmg: true },  // yama — "Danda of Judgment"
};

// [id, weight, overrides?] per phase. The first phase-2 entry flagged {opener:true} always
// opens phase 2 deterministically (D-11); phase-1 numeric scaling (radial/spiral/slam/summon
// counts) is applied in Boss.update via this.phase, unchanged from before Phase 4.
const BOSS_MOVESETS = {
  tataka: {
    1: [['chase',3],['radial',2],['charge',2],['summon',1]],
    2: [['leap',2,{opener:true}],['maw',2],['chase',3],['radial',2],['charge',2],['summon',1]],
  },
  ahiravana: {
    1: [['teleport',3],['spiral',3],['radial',2],['summon',2]],
    2: [['lamps',2,{opener:true}],['crossBeams',2],['teleport',3],['spiral',2],['radial',1],['summon',1]],
  },
  kumbhakarna: {
    1: [['chase',3,{active:2.4}],['slam',3],['charge',2,{wind:0.7}],['radial',1]],
    2: [['quake',2,{opener:true}],['roar',2],['chase',2,{active:2.0}],['slam',3],['charge',2,{wind:0.7}]],
  },
  yama: {
    1: [['noose',2],['spiral',3,{active:2.0}],['slam',2],['charge',2],['summon',1]],
    2: [['ledger',2,{opener:true}],['danda',2],['noose',2],['spiral',2,{active:2.0}],['slam',1],['summon',1]],
  },
};

const PHASE2_TITLES = {
  tataka: 'THE FOREST HUNGERS', ahiravana: 'THE FIVE LAMPS BURN',
  kumbhakarna: 'THE MOUNTAIN RISES', yama: 'THE LEDGER IS OPENED',
};

// ---------------- BOSS ----------------
class Boss extends Enemy {
  constructor(bossId, x, y) {
    super('bhuta', x, y, 1); // base init, then override
    const d = DATA.BOSSES[bossId];
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

  // ---- moveset data lookup ----
  moveDef(id) {
    const base = BOSS_MOVE_DEFS[id] || {};
    const table = BOSS_MOVESETS[this.type] && BOSS_MOVESETS[this.type][this.phase];
    const entry = table && table.find(m => m[0] === id);
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
  shoot(vx, vy, dmg, r = 7, x = this.x, y = this.y) {
    if (!this.armed) BOSS_TG.violations.push(this.type + ':' + this.state);
    enemyShot(x, y, vx, vy, dmg, this.color, r);
    this.dmgCalls = (this.dmgCalls || 0) + 1;
  }

  // ---- move lifecycle (D-07, D-09) ----
  startMove(id) {
    this.moveSerial = (this.moveSerial || 0) + 1;
    this.armed = null; this.telegraph = null; this.marks = []; this.slams = null;
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

  pickMove(depth = 0) {
    const table = BOSS_MOVESETS[this.type][this.phase];
    let moveId;
    if (this.pendingOpener) {
      moveId = this.pendingOpener;
      this.pendingOpener = undefined;
    } else {
      const pick = U.weightedChoice(table.map(m => ({ m, w: m[1] })));
      moveId = pick.m[0];
      // avoid repeating the same move twice
      if (moveId === this.lastMove && depth < 20 && U.chance(0.6)) return this.pickMove(depth + 1);
    }
    this.startMove(moveId);
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
    if (this.phase === 1 && this.hp < this.maxhp * 0.5) {
      this.phase = 2;
      this.state = 'phaseShift'; this.t = 1.2;
      this.armed = null; this.telegraph = null; this.marks = []; this.slams = null;
      GAME.dangerZones = []; GAME.nooseT = 0;
      GAME.shake = Math.max(GAME.shake, 14);
      VFX.emit('phase', this.x, this.y, 0, this.color);
      VFX.flash(0xfff0c0, 0.4, 0.25);
      VFX.hitstop(6);
      dmgText(this.x, this.y - this.r - 20, '!!', '#ff4430', 28);
      UI.banner(PHASE2_TITLES[this.type], this.color);
      const table2 = BOSS_MOVESETS[this.type][2] || [];
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

    this.t -= dt;
    const dToP = U.dist(this.x, this.y, P.x, P.y);
    const aToP = U.angle(this.x, this.y, P.x, P.y);
    const speedMul = (this.phase === 2 ? 1.3 : 1) * (this.slowT > 0 ? this.slowF : 1);

    if (this.state.endsWith('Wind')) {
      this.windT = (this.windT || 0) + dt;
      this.updateWindTelegraph();
      if (this.t <= 0) this.arm();
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

    clampToArena(this);
    this.atkT = Math.max(0, this.atkT - dt);
  }

  draw(ctx) {
    // telegraph: grows from 0 to full size over the wind-up (fill-progress cue)
    if (this.telegraph) {
      const frac = this.windTotal ? U.clamp(1 - this.t / this.windTotal, 0.08, 1) : 1;
      const tg = this.telegraph;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(GAME.time * 18);
      ctx.strokeStyle = '#ff4444'; ctx.fillStyle = 'rgba(255,68,68,0.12)'; ctx.lineWidth = 2;
      if (tg.type === 'line') {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(tg.a);
        const len = tg.len * frac;
        ctx.fillRect(0, -this.r * 0.8, len, this.r * 1.6);
        ctx.strokeRect(0, -this.r * 0.8, len, this.r * 1.6);
        ctx.restore();
      } else if (tg.type === 'circle') {
        const r = tg.r * frac;
        ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, U.TAU); ctx.fill(); ctx.stroke();
      } else if (tg.type === 'cone') {
        const r = tg.r * frac;
        ctx.beginPath(); ctx.moveTo(this.x, this.y);
        ctx.arc(this.x, this.y, r, tg.a - tg.arc / 2, tg.a + tg.arc / 2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (tg.type === 'ring') {
        const r0 = tg.r0, r1 = tg.r1;
        ctx.lineWidth = Math.max(1, (r1 - r0) * frac);
        ctx.strokeStyle = 'rgba(255,68,68,0.35)';
        ctx.beginPath(); ctx.arc(this.x, this.y, (r0 + r1) / 2, 0, U.TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // world-anchored marks (multi-marker wind-ups: summon points, noose rope, teleport dest)
    if (this.marks && this.marks.length) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(GAME.time * 18);
      ctx.strokeStyle = '#ff4444'; ctx.fillStyle = 'rgba(255,68,68,0.12)'; ctx.lineWidth = 2;
      for (const m of this.marks) {
        if (m.type === 'line') {
          ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.a);
          ctx.fillRect(0, -m.w / 2, m.len, m.w);
          ctx.strokeRect(0, -m.w / 2, m.len, m.w);
          ctx.restore();
        } else if (m.type === 'circle') {
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, U.TAU); ctx.fill(); ctx.stroke();
        } else if (m.type === 'band') {
          ctx.fillRect(m.x, m.y, m.w, m.h);
          ctx.strokeRect(m.x, m.y, m.w, m.h);
        } else if (m.type === 'ringMark') {
          // expanding shockwave ring (kumbhakarna quake) — stroke only, no fill
          ctx.save();
          ctx.lineWidth = m.width;
          ctx.strokeStyle = 'rgba(255,68,68,0.55)';
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, U.TAU); ctx.stroke();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }

    // noose line (active pull only)
    if (this.state === 'noose') {
      const P = GAME.player;
      ctx.strokeStyle = '#9fb8ff'; ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(P.x, P.y); ctx.stroke();
      ctx.setLineDash([]);
    }

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

    if (this.asleep) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Georgia';
      ctx.fillText('z z z', this.x + this.r * 0.5, this.y - this.r - 8);
    }

    // eyes
    const a = U.angle(this.x, this.y, GAME.player.x, GAME.player.y);
    ctx.fillStyle = this.asleep ? 'rgba(0,0,0,0.3)' : '#1a0508';
    const ex = this.x + Math.cos(a) * this.r * 0.4, ey = this.y + Math.sin(a) * this.r * 0.4;
    ctx.beginPath(); ctx.arc(ex - 6, ey, 4, 0, U.TAU); ctx.arc(ex + 6, ey, 4, 0, U.TAU); ctx.fill();

    // burn pips
    if (this.burns.length) {
      ctx.fillStyle = '#ff7040';
      for (let i = 0; i < this.burns.length; i++) {
        ctx.beginPath(); ctx.arc(this.x - 10 + i * 10, this.y - this.r - 12, 4, 0, U.TAU); ctx.fill();
      }
    }
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
