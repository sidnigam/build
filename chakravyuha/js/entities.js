// ============================================================
// CHAKRAVYUHA — entities.js : player, enemies, bosses,
// projectiles, status effects, particles, damage pipeline.
// ============================================================
'use strict';

// ---------------- particles & floating text ----------------
function burst(x, y, color, n = 8, spd = 160, life = 0.4, r = 3) {
  for (let i = 0; i < n; i++) {
    const a = U.rand(U.TAU), s = U.rand(spd * 0.3, spd);
    GAME.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      t: U.rand(life * 0.5, life), max: life, color, r: U.rand(r * 0.5, r) });
  }
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

  e.hp -= dmg;
  e.flash = 0.1;
  if (src !== 'burn') {
    dmgText(e.x, e.y - e.r - 6, Math.round(dmg), crit ? '#ffd34d' : '#fff', crit ? 20 : 15);
    AUDIO.sfx(crit ? 'crit' : 'hit');
    burst(e.x, e.y, crit ? '#ffd34d' : '#ffffff', crit ? 10 : 5, 140, 0.3, 2.5);
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
  }

  if (e.hp <= 0) killEnemy(e);
  else if (e.boss) GAME.bossHurtT = 0.15;
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
  burst(e.x, e.y, e.color, 16, 220, 0.6, 4);
  AUDIO.sfx(e.boss ? 'bossdie' : 'kill');
  GAME.shake = Math.max(GAME.shake, e.boss ? 18 : 4);
  GAME.kills++;
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
    const def = DATA.BOONS.find(b => b.id === id);
    return def.base * DATA.RARITIES[this.boonRanks[id]].mult;
  }

  allBoons() {
    const out = [];
    for (const s of ['attack', 'special', 'dash', 'cast']) if (this.slots[s]) out.push(this.slots[s]);
    return out.concat(this.passives);
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
    return s;
  }

  dashCooldown() {
    let cd = 2.2;
    if (this.has('vayu_gust')) cd *= 1 - (this.val('vayu_gust') - 1) * 0.2;
    return Math.max(0.8, cd);
  }

  update(dt) {
    const I = INPUT;
    this.aim = Math.atan2(I.my - this.y, I.mx - this.x);

    // timers
    U.cool(this, 'atkCd', dt); U.cool(this, 'specialCd', dt);
    U.cool(this, 'iframes', dt); U.cool(this, 'hurtT', dt);
    U.cool(this, 'comboT', dt);
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
    if (I.keys['w'] || I.keys['arrowup']) dy -= 1;
    if (I.keys['s'] || I.keys['arrowdown']) dy += 1;
    if (I.keys['a'] || I.keys['arrowleft']) dx -= 1;
    if (I.keys['d'] || I.keys['arrowright']) dx += 1;
    const mag = Math.hypot(dx, dy);
    if (mag > 0) { dx /= mag; dy /= mag; }

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
    // dash toward movement keys, else toward aim
    const I = INPUT;
    let mx = 0, my = 0;
    if (I.keys['w'] || I.keys['arrowup']) my -= 1;
    if (I.keys['s'] || I.keys['arrowdown']) my += 1;
    if (I.keys['a'] || I.keys['arrowleft']) mx -= 1;
    if (I.keys['d'] || I.keys['arrowright']) mx += 1;
    this.dashDir = (mx || my) ? Math.atan2(my, mx) : this.aim;
    for (const e of GAME.enemies) e.galeHit = false;
    AUDIO.sfx('dash');
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
    for (const e of GAME.enemies) {
      if (e.dead) continue;
      const d = U.dist(this.x, this.y, e.x, e.y);
      if (d < w.range + e.r && Math.abs(U.angDiff(this.aim, U.angle(this.x, this.y, e.x, e.y))) < w.arc / 2) {
        hitEnemy(e, dmg, 'attack');
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
    burst(this.x, this.y, '#ff5566', 10, 180, 0.4);
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
  constructor(typeId, x, y, scale) {
    const d = DATA.ENEMIES[typeId];
    this.type = typeId; this.def = d;
    this.x = x; this.y = y; this.r = d.r;
    this.hp = d.hp * scale; this.maxhp = this.hp;
    this.dmg = d.dmg * Math.sqrt(scale);
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

      case 'shoot':
        // keep mid range
        if (dToP < 200) { this.x -= Math.cos(aToP) * this.curSpeed() * dt; this.y -= Math.sin(aToP) * this.curSpeed() * dt; }
        else if (dToP > 330) { this.x += Math.cos(aToP) * this.curSpeed() * dt; this.y += Math.sin(aToP) * this.curSpeed() * dt; }
        if (this.t <= 0) {
          enemyShot(this.x, this.y, Math.cos(aToP) * this.def.projSpeed, Math.sin(aToP) * this.def.projSpeed, this.dmg, this.color);
          this.t = U.rand(1.6, 2.6);
        }
        break;

      case 'spread':
        if (dToP < 170) { this.x -= Math.cos(aToP) * this.curSpeed() * dt; this.y -= Math.sin(aToP) * this.curSpeed() * dt; }
        if (this.t <= 0) {
          for (const off of [-0.3, 0, 0.3])
            enemyShot(this.x, this.y, Math.cos(aToP + off) * this.def.projSpeed, Math.sin(aToP + off) * this.def.projSpeed, this.dmg, this.color);
          this.t = U.rand(2, 3.2);
        }
        break;

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

      case 'summon':
        // drift away from the player, summon pretas
        if (dToP < 260) { this.x -= Math.cos(aToP) * this.curSpeed() * dt; this.y -= Math.sin(aToP) * this.curSpeed() * dt; }
        if (this.t <= 0) {
          const livingPretas = GAME.enemies.filter(e => !e.dead && e.type === 'preta').length;
          if (livingPretas < 5) {
            const e = new Enemy('preta', this.x + U.rand(-40, 40), this.y + U.rand(-40, 40), GAME.biome.scale);
            GAME.enemies.push(e);
            burst(this.x, this.y, this.color, 8, 120, 0.4);
          }
          this.t = 5;
        }
        break;
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

    // phase 2 trigger
    if (this.phase === 1 && this.hp < this.maxhp * 0.5) {
      this.phase = 2;
      GAME.shake = 14;
      burst(this.x, this.y, this.color, 30, 300, 0.8, 5);
      dmgText(this.x, this.y - this.r - 20, '!!', '#ff4430', 28);
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

    switch (this.state) {
      case 'intro':
        if (this.t <= 0) this.pickMove();
        break;

      case 'chase': {
        const spd = (this.type === 'kumbhakarna' ? 70 : 120) * speedMul;
        this.x += Math.cos(aToP) * spd * dt;
        this.y += Math.sin(aToP) * spd * dt;
        this.touchAttack(dToP, dt, this.dmg * 1.2);
        if (this.t <= 0) this.pickMove();
        break;
      }

      case 'radialWind':
        this.telegraph = { type: 'circle', r: this.r + 30 };
        if (this.t <= 0) {
          this.telegraph = null;
          const n = this.phase === 2 ? 16 : 10;
          const off = U.rand(U.TAU);
          for (let i = 0; i < n; i++) {
            const a = off + (i / n) * U.TAU;
            enemyShot(this.x, this.y, Math.cos(a) * 240, Math.sin(a) * 240, this.dmg * 0.7, this.color, 7);
          }
          AUDIO.sfx('special');
          this.state = 'rest'; this.t = 0.8;
        }
        break;

      case 'spiral':
        // ahiravana / yama: rotating bullet mandala
        this.spiralA = (this.spiralA || aToP) + dt * 3.4;
        this.spiralTick = (this.spiralTick || 0) + dt;
        if (this.spiralTick > 0.11) {
          this.spiralTick = 0;
          for (let k = 0; k < (this.phase === 2 ? 3 : 2); k++) {
            const a = this.spiralA + k * (U.TAU / 3);
            enemyShot(this.x, this.y, Math.cos(a) * 200, Math.sin(a) * 200, this.dmg * 0.6, this.color, 6);
          }
        }
        if (this.t <= 0) this.pickMove();
        break;

      case 'chargeWind':
        this.lungeA = aToP;
        this.telegraph = { type: 'line', a: this.lungeA, len: 560 };
        if (this.t <= 0) { this.state = 'charging'; this.t = 0.8; this.telegraph = null; GAME.shake = 6; }
        break;

      case 'charging': {
        this.x += Math.cos(this.lungeA) * 700 * speedMul * dt;
        this.y += Math.sin(this.lungeA) * 700 * speedMul * dt;
        this.touchAttack(U.dist(this.x, this.y, P.x, P.y), dt, this.dmg * 1.5);
        const A = GAME.arena;
        if (this.x < A.x + this.r + 4 || this.x > A.x + A.w - this.r - 4 ||
            this.y < A.y + this.r + 4 || this.y > A.y + A.h - this.r - 4) {
          GAME.shake = 10; this.t = 0;
        }
        if (this.t <= 0) { this.state = 'rest'; this.t = 1.0; }
        break;
      }

      case 'slamWind': {
        // telegraphed AoE circles at/near the player
        if (!this.slams) {
          this.slams = [];
          const n = this.phase === 2 ? 4 : 2;
          for (let i = 0; i < n; i++) {
            this.slams.push({ x: U.clamp(P.x + U.rand(-120, 120), GAME.arena.x + 40, GAME.arena.x + GAME.arena.w - 40),
                              y: U.clamp(P.y + U.rand(-90, 90), GAME.arena.y + 40, GAME.arena.y + GAME.arena.h - 40), r: 85 });
          }
        }
        GAME.dangerZones = this.slams.map(s => ({ ...s, frac: 1 - this.t / 1.1 }));
        if (this.t <= 0) {
          for (const s of this.slams) {
            GAME.rings.push({ x: s.x, y: s.y, r: s.r, t: 0.25, color: this.color });
            if (U.dist(P.x, P.y, s.x, s.y) < s.r + P.r) P.takeDamage(this.dmg * 1.4);
          }
          GAME.shake = 12; AUDIO.sfx('special');
          this.slams = null; GAME.dangerZones = [];
          this.state = 'rest'; this.t = 0.9;
        }
        break;
      }

      case 'summon': {
        if (this.t <= 0) {
          const pool = GAME.biome.enemies;
          const n = this.phase === 2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const e = new Enemy(U.choice(pool), this.x + U.rand(-90, 90), this.y + U.rand(-90, 90), GAME.biome.scale * 0.7);
            GAME.enemies.push(e);
          }
          burst(this.x, this.y, this.color, 14, 200, 0.5);
          this.pickMove();
        }
        break;
      }

      case 'noose': {
        // yama: pull the player toward him
        GAME.nooseT = this.t;
        const pull = 320;
        P.x += Math.cos(U.angle(P.x, P.y, this.x, this.y)) * pull * dt;
        P.y += Math.sin(U.angle(P.x, P.y, this.x, this.y)) * pull * dt;
        if (dToP < this.r + P.r + 16) {
          P.takeDamage(this.dmg * 1.6);
          GAME.nooseT = 0; this.state = 'rest'; this.t = 1.2;
        }
        if (this.t <= 0) { GAME.nooseT = 0; this.state = 'rest'; this.t = 0.8; }
        break;
      }

      case 'teleport':
        if (this.t <= 0) {
          burst(this.x, this.y, this.color, 16, 200, 0.5);
          const a = U.rand(U.TAU);
          this.x = U.clamp(P.x + Math.cos(a) * 200, GAME.arena.x + 60, GAME.arena.x + GAME.arena.w - 60);
          this.y = U.clamp(P.y + Math.sin(a) * 200, GAME.arena.y + 60, GAME.arena.y + GAME.arena.h - 60);
          burst(this.x, this.y, this.color, 16, 200, 0.5);
          this.pickMove();
        }
        break;

      case 'rest':
        if (this.t <= 0) this.pickMove();
        break;
    }

    clampToArena(this);
    this.atkT = Math.max(0, this.atkT - dt);
  }

  pickMove() {
    const moves = {
      tataka:      [['chase', 2.2, 3], ['radialWind', 0.7, 2], ['chargeWind', 0.6, 2], ['summon', 0.3, 1]],
      ahiravana:   [['teleport', 0.4, 3], ['spiral', 2.2, 3], ['radialWind', 0.7, 2], ['summon', 0.3, 2]],
      kumbhakarna: [['chase', 2.4, 3], ['slamWind', 1.1, 3], ['chargeWind', 0.7, 2], ['radialWind', 0.7, 1]],
      yama:        [['noose', 1.6, 2], ['spiral', 2.0, 3], ['slamWind', 1.1, 2], ['chargeWind', 0.6, 2], ['summon', 0.3, 1]],
    }[this.type];
    const pick = U.weightedChoice(moves.map(m => ({ m, w: m[2] })));
    // avoid repeating the same move twice
    if (pick.m[0] === this.lastMove && U.chance(0.6)) return this.pickMove();
    this.lastMove = pick.m[0];
    this.state = pick.m[0];
    this.t = pick.m[1];
    this.slams = null;
  }

  draw(ctx) {
    // telegraph reuse from Enemy
    if (this.telegraph) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(GAME.time * 18);
      ctx.strokeStyle = '#ff4444'; ctx.fillStyle = 'rgba(255,68,68,0.12)'; ctx.lineWidth = 2;
      if (this.telegraph.type === 'line') {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.telegraph.a);
        ctx.fillRect(0, -this.r * 0.8, this.telegraph.len, this.r * 1.6);
        ctx.strokeRect(0, -this.r * 0.8, this.telegraph.len, this.r * 1.6);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.telegraph.r, 0, U.TAU); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // noose line
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
  // push out of pillars
  for (const p of GAME.pillars) {
    const d = U.dist(ent.x, ent.y, p.x, p.y);
    const min = p.r + ent.r;
    if (d < min && d > 0.001) {
      const a = U.angle(p.x, p.y, ent.x, ent.y);
      ent.x = p.x + Math.cos(a) * min;
      ent.y = p.y + Math.sin(a) * min;
    }
  }
}
