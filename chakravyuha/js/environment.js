// ============================================================
// CHAKRAVYUHA — js/environment.js : ENV, runtime environment renderer (Phase 05.4)
// Turns a biome env manifest (D-11, assets/sprites/env/{biome}/{biome}-env.json) plus the current
// room (GAME.arena, obstacles, hazards, doors) into a Hades-style layered arena: tiled floor,
// architecture (walls/columns/gates), epic-inspired props, obstacle/hazard skins and cheap
// lighting/atmosphere. Degrades gracefully with no manifest (legacy bg tile + procedural walls) and
// fully headless (this whole file is inert without window.PIXI).
//
// D-12: ENV.pad() and ENV.viewRect() are the ONLY adapter functions reading Phase 05.1's
// camera/world API (GAME.arenaPad, CAMERA.viewRect). Everything else below is pure and takes its
// inputs as plain arguments, so it can be exercised headless (test/smoke.js) without a Pixi app.
// ============================================================
'use strict';

const ENV = {

  // ---------------- CFG (D-04b/D-05a/D-06/D-07a/D-09/D-13, all tunable) ----------------
  CFG: {
    PAD: { top: 200, side: 110, bottom: 60 },   // D-12 fallback when 05.1 exposes no padding
    FACE_MIN: 60, CAP_T: 48, LIP_T: 36, PLINTH_MIN: 40,
    COLUMN_SPACING: [260, 380],
    DECALS: [8, 14], DECAL_MAX_ALPHA: 0.55, DECAL_CLEAR: 160, DOOR_BAND: 120,
    PROPS: [10, 18], CLUSTER: [2, 4],
    LIGHT_MAX_IN_ARENA: 0.12, LIGHT_MAX_MARGIN: 0.4,
    CULL_PAD: 96, CULL_MOVE: 8,
    OCCLUDE_ALPHA: 0.45, PILLAR_FOOT_FIT: 1.1,
    MAX_OBJECTS: 120,
    // D-06/D-07: default procedural lighting per biome, used when the manifest has no `lights` block.
    DEFAULT_LIGHTS: {
      naraka:     { pools: { color: '#ff5533', count: [2, 4], r: [160, 260], alpha: 0.08 } },
      patala:     { pools: { color: '#3fe0c0', count: [2, 4], r: [160, 260], alpha: 0.08 } },
      ranabhoomi: { shafts: { count: [2, 4], alpha: 0.08, angle: -0.5 } },
      vaitarani:  { mist: { count: [4, 7], alpha: 0.10, marginAlpha: 0.3 } },
    },
  },

  // ================================================================
  // Pure math helpers (no PIXI/window/GAME reads besides pad()/viewRect() below)
  // ================================================================

  _rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  },
  _expand(r, m) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }; },
  _dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },

  // Deterministic PRNG (mulberry32) + small helpers. Same seed -> identical sequence.
  rng(seed) {
    let a = (seed >>> 0) || 1;
    const next = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const range = (r, def) => { const rr = r || def; return rr[0] + next() * (rr[1] - rr[0]); };
    const int = (a0, b0) => Math.floor(a0 + next() * (b0 - a0 + 1));
    const pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(next() * arr.length))];
    const weighted = (arr, wfn) => {
      const w = arr.map(wfn);
      const total = w.reduce((s, v) => s + v, 0);
      if (total <= 0) return pick(arr);
      let r = next() * total;
      for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
      return arr[arr.length - 1];
    };
    return { next, range, int, pick, weighted };
  },

  // ---------------- Manifest validation (D-11) ----------------
  // roles: floor|water|wallface|wallcap|column|gate|prop|decal|hazard-skin
  // ground roles (floor/water/decal/hazard-skin) require ground_safe:true (D-09).
  // '@'-tokens (@cap/@abyss/@water/@pool) are always valid skin/hazard references.
  validateManifest(m, opts = {}) {
    const errors = [];
    const strict = !!(opts && opts.strict);
    if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest missing or not an object'] };

    const ALL_ROLES = new Set(['floor', 'water', 'wallface', 'wallcap', 'column', 'gate', 'prop', 'decal', 'hazard-skin']);
    const GROUND_ROLES = new Set(['floor', 'water', 'decal', 'hazard-skin']);
    const AT_TOKENS = new Set(['@cap', '@abyss', '@water', '@pool']);

    const frameKeys = new Set();
    const tileKeys = new Set();
    const counts = { column: 0, gate: 0, prop: 0, decal: 0 };

    const checkEntry = (key, e, isTile) => {
      if (!e || typeof e !== 'object') { errors.push(`${key}: missing entry`); return; }
      if (!ALL_ROLES.has(e.role)) { errors.push(`${key}: unknown role '${e.role}'`); return; }
      if (!Array.isArray(e.size) || e.size.length !== 2 || !(e.size[0] > 0) || !(e.size[1] > 0)) {
        errors.push(`${key}: missing/invalid size`);
      }
      if (isTile) {
        if (!e.path) errors.push(`${key}: tile missing 'path'`);
        tileKeys.add(key);
      } else {
        if (!e.frame) errors.push(`${key}: frame entry missing 'frame' name`);
        frameKeys.add(key);
      }
      if (GROUND_ROLES.has(e.role) && e.ground_safe !== true) {
        errors.push(`${key}: ground role '${e.role}' missing ground_safe:true`);
      }
      if (e.role === 'column') counts.column++;
      if (e.role === 'gate') counts.gate++;
      if (e.role === 'prop') counts.prop++;
      if (e.role === 'decal') counts.decal++;
    };

    const tiles = m.tiles || {};
    for (const k of Object.keys(tiles)) checkEntry(k, tiles[k], true);
    const frames = m.frames || {};
    for (const k of Object.keys(frames)) checkEntry(k, frames[k], false);

    const resolves = (token) => {
      if (typeof token !== 'string') return false;
      if (AT_TOKENS.has(token)) return true;
      return frameKeys.has(token) || tileKeys.has(token);
    };
    const skins = m.skins || {};
    for (const kind of ['pillar', 'wall', 'pit']) {
      if (skins[kind] !== undefined && !resolves(skins[kind])) errors.push(`skins.${kind}: unresolved '${skins[kind]}'`);
    }
    if (skins.byTemplate) {
      for (const tpl of Object.keys(skins.byTemplate)) {
        const ov = skins.byTemplate[tpl] || {};
        for (const kind of Object.keys(ov)) {
          if (!resolves(ov[kind])) errors.push(`skins.byTemplate.${tpl}.${kind}: unresolved '${ov[kind]}'`);
        }
      }
    }
    const hazards = m.hazards || {};
    for (const hz of Object.keys(hazards)) {
      if (!resolves(hazards[hz])) errors.push(`hazards.${hz}: unresolved '${hazards[hz]}'`);
    }

    if (strict) {
      if (counts.column < 1) errors.push('strict: manifest needs >= 1 column');
      if (counts.gate < 1) errors.push('strict: manifest needs >= 1 gate');
      if (counts.prop < 6) errors.push('strict: manifest needs >= 6 props');
      if (counts.decal < 3) errors.push('strict: manifest needs >= 3 decals');
    }
    return { ok: errors.length === 0, errors };
  },

  // ---------------- D-12 adapters: the ONLY functions reading 05.1's camera/world API ----------------
  // {top, side, bottom} — converted from GAME.arenaPad {l,r,t,b} (05.1), min(l,r) for side so a
  // symmetric env frame never exceeds what the camera can actually reveal on the tighter side.
  pad() {
    const G = (typeof GAME !== 'undefined') ? GAME : null;
    const ap = G && G.arenaPad;
    if (ap) return { top: ap.t, side: Math.min(ap.l, ap.r), bottom: ap.b };
    return this.CFG.PAD;
  },
  viewRect() {
    if (typeof CAMERA !== 'undefined' && CAMERA.viewRect) return CAMERA.viewRect(this.CFG.CULL_PAD);
    return { x: 0, y: 0, w: 1280, h: 720 };
  },

  // ---------------- Pure geometry ----------------
  frameRect(arena, pad) {
    return { x: arena.x - pad.side, y: arena.y - pad.top, w: arena.w + pad.side * 2, h: arena.h + pad.top + pad.bottom };
  },
  spawnPoint(arena) { return { x: arena.x + 90, y: arena.y + arena.h / 2 }; },
  // All door y-slots for n = 1..3 doors (ROOMS.openDoors: x = arena right - 36, y = arena.y + h*(i+1)/(n+1)).
  doorSlots(arena) {
    const x = arena.x + arena.w - 36;
    const out = [];
    for (let n = 1; n <= 3; n++) for (let i = 0; i < n; i++) out.push({ n, i, x, y: arena.y + arena.h * ((i + 1) / (n + 1)) });
    return out;
  },
  _zoneRects(arena, pad) {
    return {
      north: { x: arena.x, y: arena.y - pad.top, w: arena.w, h: pad.top },
      south: { x: arena.x, y: arena.y + arena.h, w: arena.w, h: pad.bottom },
      west: { x: arena.x - pad.side, y: arena.y, w: pad.side, h: arena.h },
      east: { x: arena.x + arena.w, y: arena.y, w: pad.side, h: arena.h },
      corner_nw: { x: arena.x - pad.side, y: arena.y - pad.top, w: pad.side, h: pad.top },
      corner_ne: { x: arena.x + arena.w, y: arena.y - pad.top, w: pad.side, h: pad.top },
      corner_sw: { x: arena.x - pad.side, y: arena.y + arena.h, w: pad.side, h: pad.bottom },
      corner_se: { x: arena.x + arena.w, y: arena.y + arena.h, w: pad.side, h: pad.bottom },
    };
  },

  // ---------------- Architecture (D-04/D-04a) ----------------
  _columnItem(id, x, arenaY, manifest) {
    const frame = manifest.frames && manifest.frames.column;
    const worldH = (frame && frame.worldH) || 150;
    const footW = (frame && frame.footW) || worldH * 0.4;
    return {
      id, layer: 'struct', kind: 'column', frame: frame ? 'column' : null,
      x, y: arenaY, scale: 1, anchor: [0.5, 1], alpha: 1, rot: 0, flip: false, blend: 'normal',
      aabb: { x: x - footW / 2, y: arenaY - worldH, w: footW, h: worldH },
    };
  },
  _buildWalls(arena, pad, manifest, biomeId, rng) {
    const wcfg = manifest.walls || {};
    const faceH = Math.min(wcfg.faceH || 170, Math.max(0, pad.top - 24));
    const capT = wcfg.capT || this.CFG.CAP_T;
    const lipT = wcfg.lipT || this.CFG.LIP_T;
    const spacingRange = wcfg.columnSpacing || this.CFG.COLUMN_SPACING;
    const items = [];

    if (faceH >= this.CFG.FACE_MIN) {
      items.push({
        id: 'wall-face-north', layer: 'struct', kind: 'wall-face', frame: manifest.tiles && manifest.tiles.wallface ? 'wallface' : null,
        x: arena.x - pad.side, y: arena.y - faceH, scale: 1, anchor: [0, 0], alpha: 1, rot: 0, flip: false,
        aabb: { x: arena.x - pad.side, y: arena.y - faceH, w: arena.w + pad.side * 2, h: faceH },
      });
      let cx = arena.x + rng.range(spacingRange, this.CFG.COLUMN_SPACING) / 2;
      let ci = 0;
      let guard = 0;
      while (cx < arena.x + arena.w && guard++ < 64) {
        items.push(this._columnItem(`col-${ci++}`, cx, arena.y, manifest));
        cx += rng.range(spacingRange, this.CFG.COLUMN_SPACING);
      }
      items.push(this._columnItem('col-nw', arena.x, arena.y, manifest));
      items.push(this._columnItem('col-ne', arena.x + arena.w, arena.y, manifest));
    }

    const plinthW = pad.side - capT;
    if (plinthW >= this.CFG.PLINTH_MIN) {
      items.push({
        id: 'plinth-west', layer: 'struct', kind: 'plinth', frame: null,
        x: arena.x - pad.side, y: arena.y, scale: 1, anchor: [0, 0], alpha: 1, rot: 0, flip: false,
        aabb: { x: arena.x - pad.side, y: arena.y, w: plinthW, h: arena.h },
      });
      items.push({
        id: 'plinth-east', layer: 'struct', kind: 'plinth', frame: null,
        x: arena.x + arena.w + capT, y: arena.y, scale: 1, anchor: [0, 0], alpha: 1, rot: 0, flip: false,
        aabb: { x: arena.x + arena.w + capT, y: arena.y, w: plinthW, h: arena.h },
      });
    }
    items.push({
      id: 'cap-west', layer: 'struct', kind: 'wall-cap-strip', frame: manifest.tiles && manifest.tiles.wallcap ? 'wallcap' : null,
      x: arena.x - capT, y: arena.y, scale: 1, anchor: [0, 0], alpha: 1, rot: 0, flip: false,
      aabb: { x: arena.x - capT, y: arena.y, w: capT, h: arena.h },
    });
    items.push({
      id: 'cap-east', layer: 'struct', kind: 'wall-cap-strip', frame: manifest.tiles && manifest.tiles.wallcap ? 'wallcap' : null,
      x: arena.x + arena.w, y: arena.y, scale: 1, anchor: [0, 0], alpha: 1, rot: 0, flip: false,
      aabb: { x: arena.x + arena.w, y: arena.y, w: capT, h: arena.h },
    });
    const isWaterStrip = !!(manifest.tiles && manifest.tiles.water) && wcfg.south !== 'cap';
    items.push({
      id: 'south-strip', layer: isWaterStrip ? 'floor' : 'struct', kind: isWaterStrip ? 'water-strip' : 'wall-lip',
      frame: isWaterStrip ? 'water' : (manifest.tiles && manifest.tiles.wallcap ? 'wallcap' : null),
      x: arena.x - pad.side, y: arena.y + arena.h, scale: 1, anchor: [0, 0], alpha: 1, rot: 0, flip: false,
      aabb: { x: arena.x - pad.side, y: arena.y + arena.h, w: arena.w + pad.side * 2, h: lipT },
    });
    return items;
  },

  // D-04a west/east gates (west always, at spawn y; east one per open door). Guaranteed outside the
  // arena rect: gate width/height are capped so they never reach past the arena edge.
  gateItems(doors, arena, manifest, pad) {
    const P = pad || this.CFG.PAD;
    const gateFrame = manifest && manifest.frames && manifest.frames.gate;
    const gw = Math.max(20, Math.min(80, P.side - 10));
    const gh = Math.max(40, Math.min(140, P.top - 20));
    const mk = (id, cx, cy) => ({
      id, layer: 'struct', kind: 'gate', frame: gateFrame ? 'gate' : null,
      x: cx, y: cy, scale: 1, anchor: [0.5, 1], alpha: 1, rot: 0, flip: false,
      aabb: { x: cx - gw / 2, y: cy - gh, w: gw, h: gh },
    });
    const items = [];
    const sp = this.spawnPoint(arena);
    items.push(mk('gate-west', arena.x - P.side + gw / 2 + 2, sp.y));
    (doors || []).forEach((d, i) => items.push(mk(`gate-east-${i}`, arena.x + arena.w + P.side - gw / 2 - 2, d.y)));
    return items;
  },

  // ---------------- Props (D-05/D-05a/D-05b) ----------------
  _placeProps(arena, pad, manifest, biomeId, rng, reservedRects) {
    const items = [];
    const frames = manifest.frames || {};
    const propKeys = Object.keys(frames).filter(k => frames[k].role === 'prop');
    if (!propKeys.length) return items;
    const zones = this._zoneRects(arena, pad);
    const total = rng.int(this.CFG.PROPS[0], this.CFG.PROPS[1]);
    const placed = [];
    let count = 0, guard = 0;
    while (count < total && guard++ < total * 30) {
      const zoneName = rng.pick(['north', 'west', 'east', 'corner', 'south']);
      let rect;
      if (zoneName === 'corner') rect = zones[rng.pick(['corner_nw', 'corner_ne', 'corner_sw', 'corner_se'])];
      else rect = zones[zoneName];
      if (!rect || rect.w <= 4 || rect.h <= 4) continue;

      const eligible = propKeys.filter(k => {
        const f = frames[k];
        const zlist = f.zones || ['north', 'west', 'east', 'corner'];
        if (!zlist.includes(zoneName)) return false;
        if (zoneName === 'south' && !f.low) return false;
        if (zoneName === 'south' && biomeId === 'vaitarani' && !(manifest.tiles && manifest.tiles.water)) return false;
        return true;
      });
      if (!eligible.length) continue;

      const key = rng.weighted(eligible, k => frames[k].weight || 1);
      const frame = frames[key];
      let scale = (frame.worldH || 64) / frame.size[1];
      let width = frame.size[0] * scale;
      if (width > rect.w) { scale *= rect.w / width; width = rect.w; }
      const height = frame.size[1] * scale;
      const anchor = frame.anchor || [0.5, 1];

      const insetX0 = rect.x + width * anchor[0], insetX1 = rect.x + rect.w - width * (1 - anchor[0]);
      const insetY0 = rect.y + height * anchor[1], insetY1 = rect.y + rect.h - height * (1 - anchor[1]);
      if (insetX1 <= insetX0 || insetY1 <= insetY0) continue;

      const px = rng.range(null, [insetX0, insetX1]);
      const py = rng.range(null, [insetY0, insetY1]);
      const aabb = { x: px - width * anchor[0], y: py - height * anchor[1], w: width, h: height };
      if (this._rectsOverlap(aabb, arena)) continue;
      if (reservedRects.some(r => this._rectsOverlap(aabb, r))) continue;
      if (placed.some(p => this._rectsOverlap(this._expand(aabb, 8), p))) continue;

      const item = {
        id: `prop-${count}`, layer: 'entity', kind: 'prop', frame: key,
        x: px, y: py, scale, anchor, alpha: 1, rot: 0, flip: rng.next() < 0.5,
        tint: manifest.grade && manifest.grade.propTint, aabb, z: py,
      };
      if (frame.light) item.frameLight = frame.light;
      items.push(item);
      placed.push(aabb);
      count++;
    }
    return items;
  },

  // ---------------- Floor decals (D-03a) ----------------
  _placeDecals(arena, obstacles, hazards, manifest, rng) {
    const items = [];
    const frames = manifest.frames || {};
    const decalKeys = Object.keys(frames).filter(k => frames[k].role === 'decal');
    if (!decalKeys.length) return items;
    const total = rng.int(this.CFG.DECALS[0], this.CFG.DECALS[1]);
    const sp = this.spawnPoint(arena);
    const doorLimitX = arena.x + arena.w - this.CFG.DOOR_BAND;
    const circleHazards = (hazards || []).filter(h => h.type === 'fireVent' || h.type === 'venomPool');
    let count = 0, guard = 0;
    while (count < total && guard++ < total * 40) {
      const key = rng.pick(decalKeys);
      const frame = frames[key];
      const worldW = frame.worldW || frame.size[0] * 0.3;
      const scale = worldW / frame.size[0];
      const h2 = frame.size[1] * scale;
      const x = rng.range(null, [arena.x + 40, arena.x + arena.w - 40]);
      const y = rng.range(null, [arena.y + 40, arena.y + arena.h - 40]);
      if (this._dist(x, y, sp.x, sp.y) < this.CFG.DECAL_CLEAR) continue;
      if (x > doorLimitX) continue;
      const aabb = { x: x - worldW / 2, y: y - h2 / 2, w: worldW, h: h2 };
      if ((obstacles || []).some(o => this._obstacleOverlaps(o, aabb))) continue;
      if (circleHazards.some(h => this._dist(x, y, h.x, h.y) < h.r + Math.max(worldW, h2) / 2)) continue;
      items.push({
        id: `decal-${count}`, layer: 'floor', kind: 'decal', frame: key,
        x, y, scale, anchor: [0.5, 0.5],
        alpha: Math.min(frame.alpha != null ? frame.alpha : 0.45, this.CFG.DECAL_MAX_ALPHA),
        rot: rng.next() * Math.PI * 2, flip: false, aabb,
      });
      count++;
    }
    return items;
  },
  _obstacleOverlaps(o, aabb) {
    const orect = o.shape === 'rect' ? { x: o.x, y: o.y, w: o.w, h: o.h } : { x: o.x - o.r, y: o.y - o.r, w: 2 * o.r, h: 2 * o.r };
    return this._rectsOverlap(orect, aabb);
  },

  // ---------------- Obstacle/hazard skins (D-06) ----------------
  resolveSkin(manifest, kind, tpl) {
    const skins = (manifest && manifest.skins) || {};
    const byTpl = skins.byTemplate && tpl && skins.byTemplate[tpl];
    return (byTpl && byTpl[kind]) || skins[kind];
  },
  _skinObstacles(arena, obstacles, manifest, rng) {
    const items = [];
    const skinned = [];
    (obstacles || []).forEach((o, idx) => {
      const kind = o.kind === 'pit' ? 'pit' : (o.shape === 'rect' ? 'wall' : 'pillar');
      const token = this.resolveSkin(manifest, kind, o.tpl);
      if (!token) return; // no skin -> primitive draws (fallback preserved)

      if (kind === 'pillar') {
        if (token.startsWith('@')) return; // no procedural pillar skins defined
        const frame = manifest.frames && manifest.frames[token];
        if (!frame) return;
        const footW = 2 * o.r * this.CFG.PILLAR_FOOT_FIT;
        const scale = footW / (frame.footW || frame.size[0]);
        items.push({
          id: `pillar-${idx}`, layer: 'entity', kind: 'pillar-skin', frame: token,
          x: o.x, y: o.y + 0.45 * o.r, scale, anchor: frame.anchor || [0.5, 0.96], alpha: 1, rot: 0, flip: false,
          tint: manifest.grade && manifest.grade.propTint,
          aabb: { x: o.x - footW / 2, y: o.y - footW / 2, w: footW, h: footW },
          obstacleIndex: idx, z: o.y, footW,
        });
        skinned.push(idx);
      } else if (kind === 'wall') {
        if (token === '@cap') {
          items.push({
            id: `wallcap-${idx}`, layer: 'struct', kind: 'wall-cap', frame: manifest.tiles && manifest.tiles.wallcap ? 'wallcap' : null,
            x: o.x, y: o.y, scale: 1, anchor: [0, 0], alpha: 1, rot: 0, flip: false,
            aabb: { x: o.x, y: o.y, w: o.w, h: o.h }, obstacleIndex: idx,
          });
          const faceH = Math.min(28, 0.3 * o.h);
          items.push({
            id: `wallfront-${idx}`, layer: 'struct', kind: 'wall-front', frame: null,
            x: o.x, y: o.y + o.h, scale: 1, anchor: [0, 0], alpha: 1, rot: 0, flip: false,
            aabb: { x: o.x, y: o.y + o.h, w: o.w, h: faceH },
          });
          items.push({
            id: `wallshadow-${idx}`, layer: 'floor', kind: 'shadow', frame: null,
            x: o.x, y: o.y + o.h + faceH, scale: 1, anchor: [0, 0], alpha: 0.3, rot: 0, flip: false,
            aabb: { x: o.x, y: o.y + o.h + faceH, w: o.w, h: 6 },
          });
          skinned.push(idx);
        } else if (!token.startsWith('@')) {
          const frame = manifest.frames && manifest.frames[token];
          if (!frame) return;
          const scale = Math.min(1.15 * o.w / frame.size[0], 1.6 * o.h / frame.size[1]);
          items.push({
            id: `wallskin-${idx}`, layer: 'entity', kind: 'wall-skin', frame: token,
            x: o.x + o.w / 2, y: o.y + o.h + 6, scale, anchor: [0.5, 1], alpha: 1, rot: 0, flip: false,
            tint: manifest.grade && manifest.grade.propTint,
            aabb: { x: o.x, y: o.y, w: o.w, h: o.h }, obstacleIndex: idx, z: o.y + o.h,
          });
          items.push({
            id: `wallfoot-${idx}`, layer: 'floor', kind: 'shadow', frame: null,
            x: o.x, y: o.y, scale: 1, anchor: [0, 0], alpha: 0.3, rot: 0, flip: false,
            aabb: { x: o.x, y: o.y, w: o.w, h: o.h },
          });
          skinned.push(idx);
        }
      } else if (kind === 'pit') {
        const isRect = o.shape === 'rect';
        const aabb = isRect ? { x: o.x, y: o.y, w: o.w, h: o.h } : { x: o.x - o.r, y: o.y - o.r, w: 2 * o.r, h: 2 * o.r };
        if (token === '@abyss') {
          items.push({
            id: `pit-${idx}`, layer: 'floor', kind: 'abyss', frame: null,
            x: aabb.x + aabb.w / 2, y: aabb.y + aabb.h / 2, scale: 1, anchor: [0.5, 0.5], alpha: 1, rot: 0, flip: false,
            aabb, obstacleIndex: idx,
          });
          const rimN = rng.int(4, 8);
          for (let i = 0; i < rimN; i++) {
            const a = (i / rimN) * Math.PI * 2;
            items.push({
              id: `pitrim-${idx}-${i}`, layer: 'floor', kind: 'decal', frame: null,
              x: aabb.x + aabb.w / 2 + Math.cos(a) * aabb.w / 2, y: aabb.y + aabb.h / 2 + Math.sin(a) * aabb.h / 2,
              scale: 1, anchor: [0.5, 0.5], alpha: 0.5, rot: a, flip: false, aabb: { x: 0, y: 0, w: 0, h: 0 },
            });
          }
          skinned.push(idx);
        } else if (token === '@water') {
          items.push({
            id: `pitwater-${idx}`, layer: 'floor', kind: 'water', frame: manifest.tiles && manifest.tiles.water ? 'water' : null,
            x: aabb.x + aabb.w / 2, y: aabb.y + aabb.h / 2, scale: 1, anchor: [0.5, 0.5], alpha: 1, rot: 0, flip: false,
            aabb, obstacleIndex: idx,
          });
          skinned.push(idx);
        }
      }
    });
    return { items, skinned };
  },
  _skinHazards(hazards, manifest) {
    const items = [];
    (hazards || []).forEach((hz, hidx) => {
      if (hz.type === 'fireVent') {
        const token = manifest.hazards && manifest.hazards.fireVent;
        const frame = token && manifest.frames && manifest.frames[token];
        if (!frame) return;
        const scale = (2.1 * hz.r) / frame.size[0];
        items.push({
          id: `hazard-${hidx}`, layer: 'floor', kind: 'hazard-skin', frame: token,
          x: hz.x, y: hz.y, scale, anchor: [0.5, 0.5], alpha: 1, rot: 0, flip: false,
          aabb: { x: hz.x - hz.r, y: hz.y - hz.r, w: 2 * hz.r, h: 2 * hz.r }, hazardIndex: hidx,
        });
      } else if (hz.type === 'venomPool') {
        const token = (manifest.hazards && manifest.hazards.venomPool) || '@pool';
        items.push({
          id: `hazard-${hidx}`, layer: 'floor', kind: 'venom-rim', frame: token.startsWith('@') ? null : token,
          x: hz.x, y: hz.y, scale: 1, anchor: [0.5, 0.5], alpha: 0.4, rot: 0, flip: false,
          aabb: { x: hz.x - hz.r, y: hz.y - hz.r, w: 2 * hz.r, h: 2 * hz.r }, hazardIndex: hidx,
        });
      } else if (hz.type === 'riverCurrent') {
        const token = (manifest.hazards && manifest.hazards.riverCurrent) || (manifest.tiles && manifest.tiles.water ? '@water' : null);
        if (!token) return;
        items.push({
          id: `hazard-${hidx}`, layer: 'floor', kind: 'water-band', frame: manifest.tiles && manifest.tiles.water ? 'water' : null,
          x: hz.x, y: hz.y, scale: 1, anchor: [0, 0], alpha: 1, rot: 0, flip: false, dir: hz.dir,
          aabb: { x: hz.x, y: hz.y, w: hz.w, h: hz.h }, hazardIndex: hidx,
        });
      }
    });
    return items;
  },

  // ---------------- Lights/atmosphere (D-06/D-07/D-07a) ----------------
  _buildLights(arena, frame, biomeId, manifest, rng) {
    const items = [];
    const cfg = manifest.lights || this.CFG.DEFAULT_LIGHTS[biomeId] || {};
    if (cfg.pools) {
      const n = rng.int(cfg.pools.count[0], cfg.pools.count[1]);
      for (let i = 0; i < n; i++) {
        const x = rng.range(null, [arena.x + 40, arena.x + arena.w - 40]);
        const y = rng.range(null, [arena.y + 40, arena.y + arena.h - 40]);
        const r = rng.range(cfg.pools.r || [160, 260], [160, 260]);
        items.push({
          id: `pool-${i}`, layer: 'light', kind: 'pool', frame: null,
          x, y, scale: 1, anchor: [0.5, 0.5], alpha: Math.min(cfg.pools.alpha || 0.08, this.CFG.LIGHT_MAX_IN_ARENA),
          color: cfg.pools.color, rot: 0, flip: false, aabb: { x: x - r, y: y - r, w: 2 * r, h: 2 * r },
        });
      }
    }
    if (cfg.shafts) {
      const n = rng.int(cfg.shafts.count[0], cfg.shafts.count[1]);
      for (let i = 0; i < n; i++) {
        const x = rng.range(null, [arena.x, arena.x + arena.w]);
        items.push({
          id: `shaft-${i}`, layer: 'atmos', kind: 'shaft', frame: null,
          x, y: arena.y, scale: 1, anchor: [0.5, 0], alpha: Math.min(cfg.shafts.alpha || 0.08, this.CFG.LIGHT_MAX_IN_ARENA),
          rot: cfg.shafts.angle || -0.5, flip: false, aabb: { x: x - 40, y: arena.y, w: 80, h: arena.h },
        });
      }
    }
    if (cfg.mist) {
      const n = rng.int(cfg.mist.count[0], cfg.mist.count[1]);
      for (let i = 0; i < n; i++) {
        const x = rng.range(null, [frame.x, frame.x + frame.w]);
        const y = rng.range(null, [frame.y, frame.y + frame.h]);
        const insideArena = x > arena.x && x < arena.x + arena.w && y > arena.y && y < arena.y + arena.h;
        const maxAlpha = insideArena ? this.CFG.LIGHT_MAX_IN_ARENA : (cfg.mist.marginAlpha || this.CFG.LIGHT_MAX_MARGIN);
        items.push({
          id: `mist-${i}`, layer: 'atmos', kind: 'mist', frame: null,
          x, y, scale: 1, anchor: [0.5, 0.5], alpha: Math.min(cfg.mist.alpha || 0.1, maxAlpha), rot: 0, flip: false,
          aabb: { x: x - 64, y: y - 64, w: 128, h: 128 },
        });
      }
    }
    return items;
  },

  _capObjects(items) {
    while (items.length > this.CFG.MAX_OBJECTS) {
      let idx = -1;
      for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'decal') { idx = i; break; }
      if (idx === -1) for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'prop') { idx = i; break; }
      if (idx === -1) break;
      items.splice(idx, 1);
    }
  },

  // ---------------- layout() — the pure deterministic core (D-02..D-07) ----------------
  // opts: {biomeId, arena, obstacles, hazards, isBoss, seed, manifest, pad}
  // Returns {frame, floor, walls, items[], skinnedObstacles[]}. Gates are NOT included here — they
  // depend on GAME.doors (which changes independently of room layout) and are built via gateItems().
  layout(opts) {
    const { biomeId, arena, obstacles = [], hazards = [], seed, manifest = {} } = opts;
    const P = opts.pad || this.CFG.PAD;
    const rng = this.rng((seed >>> 0) || 1);
    const frame = this.frameRect(arena, P);
    const items = [];

    // floor
    const floorCfg = manifest.floor || {};
    const tileScale = floorCfg.tileScale || 0.6;
    const macroScale = floorCfg.macroScale || 1.7;
    const macroAlpha = floorCfg.macroAlpha != null ? floorCfg.macroAlpha : 0.35;
    const availFloor = ['floor_a', 'floor_b'].filter(k => manifest.tiles && manifest.tiles[k]);
    let floorMeta = null;
    if (availFloor.length) {
      const baseKey = rng.pick(availFloor);
      const overlayKey = availFloor.find(k => k !== baseKey) || null;
      items.push({
        id: 'floor-base', layer: 'floor', kind: 'floor-base', frame: baseKey,
        x: frame.x, y: frame.y, scale: tileScale, anchor: [0, 0], alpha: 1, rot: 0, flip: false,
        tilePosition: { x: rng.range(null, [0, 2048]), y: rng.range(null, [0, 2048]) },
        aabb: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
      });
      if (overlayKey) {
        items.push({
          id: 'floor-overlay', layer: 'floor', kind: 'floor-overlay', frame: overlayKey,
          x: frame.x, y: frame.y, scale: macroScale, anchor: [0, 0], alpha: macroAlpha, rot: 0, flip: false,
          tilePosition: { x: rng.range(null, [0, 2048]), y: rng.range(null, [0, 2048]) },
          aabb: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
        });
      }
      floorMeta = { base: baseKey, overlay: overlayKey, tileScale, macroScale, macroAlpha };
    }

    // walls (architecture, no gates)
    items.push(...this._buildWalls(arena, P, manifest, biomeId, rng));
    const wallsMeta = manifest.walls || { faceH: 170, capT: this.CFG.CAP_T, lipT: this.CFG.LIP_T };

    // reserved gate spans (west spawn gate + every possible east door slot, n=1..3) so props never
    // block a gate that will appear later when doors are opened.
    const reserved = [];
    const sp = this.spawnPoint(arena);
    const gw = Math.max(20, Math.min(80, P.side - 10));
    const gh = Math.max(40, Math.min(140, P.top - 20));
    reserved.push({ x: arena.x - P.side, y: sp.y - gh, w: P.side, h: gh * 2 });
    for (const slot of this.doorSlots(arena)) reserved.push({ x: arena.x + arena.w, y: slot.y - gh, w: P.side, h: gh * 2 });

    // props
    items.push(...this._placeProps(arena, P, manifest, biomeId, rng, reserved));

    // decals
    items.push(...this._placeDecals(arena, obstacles, hazards, manifest, rng));

    // obstacle skins
    const skinRes = this._skinObstacles(arena, obstacles, manifest, rng);
    items.push(...skinRes.items);

    // hazard skins
    items.push(...this._skinHazards(hazards, manifest));

    // lights/atmosphere
    items.push(...this._buildLights(arena, frame, biomeId, manifest, rng));

    // defensive final passes: guardrails must hold even if a per-branch computation drifted.
    for (const it of items) {
      if ((it.layer === 'light' || it.layer === 'atmos') && it.aabb && this._rectsOverlap(it.aabb, arena)) {
        it.alpha = Math.min(it.alpha, this.CFG.LIGHT_MAX_IN_ARENA);
      }
      if (it.kind === 'decal') it.alpha = Math.min(it.alpha, this.CFG.DECAL_MAX_ALPHA);
    }
    this._capObjects(items);

    return { frame, floor: floorMeta, walls: wallsMeta, items, skinnedObstacles: skinRes.skinned };
  },

  // ---------------- Culling / occlusion (D-13/D-06) ----------------
  visibleIndices(aabbs, view, padPx) {
    const pad = padPx == null ? this.CFG.CULL_PAD : padPx;
    const V = { x: view.x - pad, y: view.y - pad, w: view.w + pad * 2, h: view.h + pad * 2 };
    const out = [];
    (aabbs || []).forEach((b, i) => { if (b && this._rectsOverlap(b, V)) out.push(i); });
    return out;
  },
  // actor "behind" a skinned obstacle: north of its base (item.z), below the top of its footprint,
  // and within its horizontal span (+ actor radius).
  occluded(item, actors) {
    if (!item || !item.aabb || item.z == null) return false;
    for (const a of (actors || [])) {
      if (!a) continue;
      const r = a.r || 0;
      if (a.y < item.z && a.y > item.aabb.y + 0.15 * item.aabb.h && Math.abs(a.x - item.x) < item.aabb.w / 2 + r) return true;
    }
    return false;
  },

  // ================================================================
  // Pixi build/sync (D-02/D-13/D-13a). Everything below is guarded on window.PIXI/SPRITES and
  // wrapped so a failure degrades to `console.warn` + return false — the legacy renderBackground
  // path always still works. Fully inert (never touched) headless.
  // ================================================================
  _active: false,
  _plan: null,
  _manifests: {},
  _atlases: {},
  _tileTextures: {},
  _biomeStatus: {},
  _layersReady: false,
  _objs: [],
  _aabbs: [],
  _entityItems: [],
  _riverBands: [],
  _driftObjs: [],
  _gateObjs: [],
  _skinnedSet: null,
  _roomKey: null,
  _doorsCount: -1,
  _lastView: null,
  _lastVisibleCount: 0,
  _driftT: 0,

  // ---------------- layer setup (D-02) ----------------
  initLayers() {
    if (this._layersReady) return true;
    if (typeof window === 'undefined' || !window.PIXI || !SPRITES.worldContainer || !SPRITES.bridgeSprite || !SPRITES.bgContainer) return false;
    try {
      const PIXI = window.PIXI;
      this.floorLayer = new PIXI.Container();
      this.lightLayer = new PIXI.Container();
      this.structLayer = new PIXI.Container();
      this.atmosLayer = new PIXI.Container();

      const bridgeIdx = SPRITES.worldContainer.getChildIndex(SPRITES.bridgeSprite);
      SPRITES.worldContainer.addChildAt(this.floorLayer, bridgeIdx); // directly below the bridge
      SPRITES.bgContainer.addChild(this.lightLayer, this.structLayer); // bgContainer already sits above the bridge
      SPRITES.worldContainer.addChild(this.atmosLayer);
      const entIdx = SPRITES.worldContainer.getChildIndex(SPRITES.entityContainer);
      if (entIdx >= 0) SPRITES.worldContainer.setChildIndex(this.atmosLayer, Math.min(entIdx + 1, SPRITES.worldContainer.children.length - 1));

      this._procTextures(PIXI);

      this.vignette = new PIXI.Sprite(this._proc.vignette);
      this.vignette.anchor.set(0.5);
      this.vignette.visible = false;
      if (SPRITES.app && SPRITES.app.stage) {
        SPRITES.app.stage.addChildAt(this.vignette, Math.min(1, SPRITES.app.stage.children.length));
        this._resizeVignette();
      }
      this._layersReady = true;
      return true;
    } catch (e) {
      console.warn('ENV.initLayers failed', e);
      return false;
    }
  },
  _resizeVignette() {
    if (!this.vignette || !SPRITES.app) return;
    const w = SPRITES.app.screen ? SPRITES.app.screen.width : 1280;
    const h = SPRITES.app.screen ? SPRITES.app.screen.height : 720;
    this.vignette.width = w * 1.6;
    this.vignette.height = h * 1.6;
    this.vignette.position.set(w / 2, h / 2);
  },
  _procTextures(PIXI) {
    if (this._proc) return;
    const mk = (w, h, draw) => {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      draw(cv.getContext('2d'), w, h);
      return PIXI.Texture.from(cv);
    };
    this._proc = {
      pool: mk(128, 128, (c, s) => {
        const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, s, s);
      }),
      beam: mk(64, 256, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      }),
      mist: mk(128, 128, (c, s) => {
        const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, s, s);
      }),
      vignette: mk(256, 256, (c, s) => {
        const g = c.createRadialGradient(s / 2, s / 2, s * 0.32, s / 2, s / 2, s * 0.5);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
        c.fillStyle = g; c.fillRect(0, 0, s, s);
      }),
    };
  },
  _biomeWallColor(biomeId) {
    const b = (typeof DATA !== 'undefined' && DATA.BIOMES && DATA.BIOMES.find(x => x.id === biomeId));
    return (b && b.wall) || '#333333';
  },

  // ---------------- loading (D-13a) ----------------
  // Returns 'loading' | 'ready' | 'fallback' | 'unavailable' (no env manifest AND no legacy bg —
  // sync() then returns false so the full legacy primitive path runs).
  ensureLoaded(biomeId) {
    if (!biomeId) return 'unavailable';
    const st = this._biomeStatus[biomeId];
    if (st) return st;
    this._biomeStatus[biomeId] = 'loading';
    this._loadBiome(biomeId);
    return 'loading';
  },
  async _loadBiome(biomeId) {
    try {
      if (typeof window === 'undefined' || !window.PIXI) { this._biomeStatus[biomeId] = 'unavailable'; return; }
      const PIXI = window.PIXI;
      let manifest = null;
      try { manifest = await PIXI.Assets.load(`assets/sprites/env/${biomeId}/${biomeId}-env.json`); } catch (e) { manifest = null; }
      if (manifest) {
        const v = this.validateManifest(manifest, { strict: false });
        if (!v.ok) { console.warn('ENV: manifest invalid for', biomeId, v.errors); manifest = null; }
      }
      if (manifest) {
        try {
          const atlas = await PIXI.Assets.load(manifest.atlas);
          const tileTex = {};
          for (const key of Object.keys(manifest.tiles || {})) {
            const t = await PIXI.Assets.load(manifest.tiles[key].path);
            if (t && t.source) { try { t.source.addressMode = 'repeat'; } catch (e2) {} }
            tileTex[key] = t;
          }
          this._atlases[biomeId] = atlas;
          this._tileTextures[biomeId] = tileTex;
          this._manifests[biomeId] = manifest;
          this._biomeStatus[biomeId] = 'ready';
          return;
        } catch (e) {
          console.warn('ENV: atlas/tiles failed to load for', biomeId, e);
        }
      }
      // D-13a fallback kit: legacy bg tiled as the floor, procedural walls.
      const legacyTex = SPRITES.textures && SPRITES.textures['bg:' + biomeId];
      if (!legacyTex) { this._biomeStatus[biomeId] = 'unavailable'; return; }
      this._tileTextures[biomeId] = { floor_a: legacyTex };
      this._manifests[biomeId] = {
        schema: 1, biome: biomeId,
        tiles: { floor_a: { size: [legacyTex.width, legacyTex.height], role: 'floor', ground_safe: true } },
        frames: {}, skins: { wall: '@cap', pit: '@abyss' }, hazards: {},
        floor: { tileScale: 1, macroScale: 1, macroAlpha: 0 },
      };
      this._biomeStatus[biomeId] = 'fallback';
    } catch (e) {
      console.warn('ENV.ensureLoaded failed for', biomeId, e);
      this._biomeStatus[biomeId] = 'unavailable';
    }
  },

  // ---------------- build (D-13) ----------------
  clear() {
    const destroyAll = (arr) => { for (const o of (arr || [])) { try { if (o.parent) o.parent.removeChild(o); if (o.destroy) o.destroy(); } catch (e) {} } };
    destroyAll(this._objs);
    destroyAll(this._gateObjs);
    this._objs = []; this._aabbs = []; this._entityItems = []; this._riverBands = []; this._driftObjs = [];
    this._gateObjs = []; this._skinnedSet = new Set(); this._plan = null; this._roomKey = null; this._doorsCount = -1;
  },
  build(biomeId, plan) {
    if (!this.initLayers()) return false;
    this.clear();
    const PIXI = window.PIXI;
    const manifest = plan.manifest || {};
    const atlas = this._atlases[biomeId];
    const tileTex = this._tileTextures[biomeId] || {};
    const wallColor = this._biomeWallColor(biomeId);
    const skinnedSet = new Set();
    const entityItems = [];
    const riverBands = [];
    const driftObjs = [];

    const frameTexOf = (key) => {
      const fdef = manifest.frames && manifest.frames[key];
      return atlas && atlas.textures && fdef && atlas.textures[fdef.frame];
    };
    const spriteFor = (it) => {
      const t = it.frame && frameTexOf(it.frame);
      if (!t) return null;
      const s = new PIXI.Sprite(t);
      s.anchor.set(it.anchor ? it.anchor[0] : 0.5, it.anchor ? it.anchor[1] : 0.5);
      s.position.set(it.x, it.y);
      s.scale.set((it.scale || 1) * (it.flip ? -1 : 1), it.scale || 1);
      s.rotation = it.rot || 0;
      s.alpha = it.alpha != null ? it.alpha : 1;
      if (it.tint) { try { s.tint = it.tint; } catch (e) {} }
      return s;
    };
    const rectGfx = (w, h, color, alpha) => new PIXI.Graphics().rect(0, 0, Math.max(1, w), Math.max(1, h)).fill({ color: color, alpha: alpha == null ? 1 : alpha });

    for (const it of plan.items) {
      let obj = null;
      if (it.kind === 'floor-base' || it.kind === 'floor-overlay') {
        const tex = tileTex[it.frame];
        if (tex) {
          obj = new PIXI.TilingSprite({ texture: tex, width: it.aabb.w, height: it.aabb.h });
          obj.position.set(it.aabb.x, it.aabb.y);
          obj.tileScale.set(it.scale || 1);
          if (it.tilePosition) obj.tilePosition.set(it.tilePosition.x, it.tilePosition.y);
          obj.alpha = it.alpha;
          this.floorLayer.addChild(obj);
        }
      } else if (it.kind === 'wall-face' || it.kind === 'wall-cap-strip') {
        const tex = it.frame && tileTex[it.frame];
        obj = tex ? new PIXI.TilingSprite({ texture: tex, width: it.aabb.w, height: it.aabb.h }) : rectGfx(it.aabb.w, it.aabb.h, wallColor);
        obj.position.set(it.aabb.x, it.aabb.y);
        this.structLayer.addChild(obj);
      } else if (it.kind === 'water-strip') {
        const tex = it.frame && tileTex[it.frame];
        obj = tex ? new PIXI.TilingSprite({ texture: tex, width: it.aabb.w, height: it.aabb.h }) : rectGfx(it.aabb.w, it.aabb.h, '#0a1830', 0.8);
        obj.position.set(it.aabb.x, it.aabb.y);
        this.floorLayer.addChild(obj);
      } else if (it.kind === 'plinth' || it.kind === 'wall-lip') {
        obj = rectGfx(it.aabb.w, it.aabb.h, wallColor, 0.85);
        obj.position.set(it.aabb.x, it.aabb.y);
        this.structLayer.addChild(obj);
      } else if (it.kind === 'column' || it.kind === 'gate') {
        obj = spriteFor(it) || (() => { const g = rectGfx(it.aabb.w, it.aabb.h, wallColor); g.position.set(it.aabb.x, it.aabb.y); return g; })();
        this.structLayer.addChild(obj);
      } else if (it.kind === 'prop') {
        obj = spriteFor(it) || (() => { const g = rectGfx(it.aabb.w, it.aabb.h, wallColor, 0.75); g.position.set(it.aabb.x, it.aabb.y); return g; })();
        obj.zIndex = it.z != null ? it.z : it.y;
        SPRITES.entityContainer.addChild(obj);
        entityItems.push({ item: it, obj });
      } else if (it.kind === 'pillar-skin' || it.kind === 'wall-skin') {
        obj = spriteFor(it) || (() => {
          const g = new PIXI.Graphics().circle(0, 0, (it.footW || Math.max(it.aabb.w, it.aabb.h)) / 2).fill({ color: wallColor });
          g.position.set(it.x, it.y);
          return g;
        })();
        obj.zIndex = it.z != null ? it.z : it.y;
        SPRITES.entityContainer.addChild(obj);
        entityItems.push({ item: it, obj });
        if (it.obstacleIndex != null) skinnedSet.add(it.obstacleIndex);
      } else if (it.kind === 'wall-cap') {
        const tex = tileTex.wallcap;
        obj = tex ? new PIXI.TilingSprite({ texture: tex, width: it.aabb.w, height: it.aabb.h }) : rectGfx(it.aabb.w, it.aabb.h, wallColor);
        obj.position.set(it.aabb.x, it.aabb.y);
        this.structLayer.addChild(obj);
        if (it.obstacleIndex != null) skinnedSet.add(it.obstacleIndex);
      } else if (it.kind === 'wall-front') {
        obj = rectGfx(it.aabb.w, it.aabb.h, '#000000', 0.35);
        obj.position.set(it.aabb.x, it.aabb.y);
        this.structLayer.addChild(obj);
      } else if (it.kind === 'shadow') {
        obj = rectGfx(it.aabb.w, it.aabb.h, '#000000', it.alpha);
        obj.position.set(it.aabb.x, it.aabb.y);
        this.floorLayer.addChild(obj);
      } else if (it.kind === 'abyss') {
        obj = rectGfx(it.aabb.w, it.aabb.h, '#000000', 0.9);
        obj.position.set(it.aabb.x, it.aabb.y);
        this.floorLayer.addChild(obj);
        if (it.obstacleIndex != null) skinnedSet.add(it.obstacleIndex);
      } else if (it.kind === 'water') {
        const tex = tileTex.water;
        obj = tex ? new PIXI.TilingSprite({ texture: tex, width: it.aabb.w, height: it.aabb.h }) : rectGfx(it.aabb.w, it.aabb.h, '#0a1830', 0.85);
        obj.position.set(it.aabb.x, it.aabb.y);
        this.floorLayer.addChild(obj);
        if (it.obstacleIndex != null) skinnedSet.add(it.obstacleIndex);
      } else if (it.kind === 'decal') {
        obj = spriteFor(it);
        if (obj) this.floorLayer.addChild(obj);
      } else if (it.kind === 'hazard-skin') {
        obj = spriteFor(it);
        if (obj) this.floorLayer.addChild(obj);
      } else if (it.kind === 'venom-rim') {
        obj = new PIXI.Graphics().circle(0, 0, it.aabb.w / 2).stroke({ color: 0x7dff5a, width: 2, alpha: it.alpha });
        obj.position.set(it.x, it.y);
        this.floorLayer.addChild(obj);
      } else if (it.kind === 'water-band') {
        const tex = tileTex.water;
        obj = tex ? new PIXI.TilingSprite({ texture: tex, width: it.aabb.w, height: it.aabb.h }) : rectGfx(it.aabb.w, it.aabb.h, '#0a1830', 0.7);
        obj.position.set(it.aabb.x, it.aabb.y);
        this.floorLayer.addChild(obj);
        riverBands.push({ obj, hz: it });
      } else if (it.kind === 'pool') {
        obj = new PIXI.Sprite(this._proc.pool);
        obj.anchor.set(0.5); obj.position.set(it.x, it.y);
        obj.width = it.aabb.w; obj.height = it.aabb.h;
        obj.alpha = it.alpha; obj.blendMode = 'add';
        if (it.color) { try { obj.tint = it.color; } catch (e) {} }
        this.lightLayer.addChild(obj);
      } else if (it.kind === 'light') {
        obj = new PIXI.Sprite(this._proc.pool);
        obj.anchor.set(0.5); obj.position.set(it.x, it.y);
        obj.width = it.aabb.w; obj.height = it.aabb.h;
        obj.alpha = it.alpha; obj.blendMode = 'add';
        if (it.color) { try { obj.tint = it.color; } catch (e) {} }
        this.lightLayer.addChild(obj);
      } else if (it.kind === 'shaft') {
        obj = new PIXI.Sprite(this._proc.beam);
        obj.anchor.set(0.5, 0); obj.position.set(it.x, it.y);
        obj.width = 80; obj.height = it.aabb.h; obj.rotation = it.rot || 0;
        obj.alpha = it.alpha; obj.blendMode = 'add';
        this.atmosLayer.addChild(obj);
        driftObjs.push({ obj, baseX: it.x, phase: Math.random() * Math.PI * 2 });
      } else if (it.kind === 'mist') {
        obj = new PIXI.Sprite(this._proc.mist);
        obj.anchor.set(0.5); obj.position.set(it.x, it.y);
        obj.width = it.aabb.w; obj.height = it.aabb.h;
        obj.alpha = it.alpha;
        this.atmosLayer.addChild(obj);
        driftObjs.push({ obj, baseX: it.x, phase: Math.random() * Math.PI * 2 });
      }
      if (obj) { this._objs.push(obj); this._aabbs.push(it.aabb); }
      else { this._objs.push(null); this._aabbs.push(it.aabb); }
    }
    this._entityItems = entityItems;
    this._riverBands = riverBands;
    this._driftObjs = driftObjs;
    this._skinnedSet = skinnedSet;
    return true;
  },
  _buildGates(biomeId, doors, arena) {
    const destroyAll = (arr) => { for (const o of (arr || [])) { try { if (o.parent) o.parent.removeChild(o); if (o.destroy) o.destroy(); } catch (e) {} } };
    destroyAll(this._gateObjs);
    this._gateObjs = [];
    if (!window.PIXI) return;
    const PIXI = window.PIXI;
    const manifest = this._manifests[biomeId] || {};
    const atlas = this._atlases[biomeId];
    const wallColor = this._biomeWallColor(biomeId);
    const items = this.gateItems(doors, arena, manifest, this.pad());
    for (const it of items) {
      const fdef = it.frame && manifest.frames && manifest.frames[it.frame];
      const tex = atlas && atlas.textures && fdef && atlas.textures[fdef.frame];
      let obj;
      if (tex) {
        obj = new PIXI.Sprite(tex);
        obj.anchor.set(it.anchor[0], it.anchor[1]);
        obj.position.set(it.x, it.y);
      } else {
        obj = new PIXI.Graphics().rect(-it.aabb.w / 2, -it.aabb.h, it.aabb.w, it.aabb.h).fill({ color: wallColor });
        obj.position.set(it.x, it.y);
      }
      this.structLayer.addChild(obj);
      this._gateObjs.push(obj);
    }
  },

  // ---------------- per-frame sync (called from GAME.renderBackground) ----------------
  sync(G) {
    if (!G || G.state === 'hub') { if (this._active || this._plan) this.clear(); this._active = false; return false; }
    if (typeof window === 'undefined' || !window.PIXI || !SPRITES.worldContainer) return false;
    if (!this.initLayers()) return false;
    const biomeId = G.biome && G.biome.id;
    if (!biomeId) return false;
    const status = this.ensureLoaded(biomeId);
    if (status === 'loading' || status === 'unavailable') { if (this._active) this.clear(); this._active = false; return false; }

    const A = G.arena;
    const roomKey = biomeId + '|' + A.x + ',' + A.y + ',' + A.w + ',' + A.h + '|' + this._idOf(G.pillars) + '|' + ((G.hazards || []).length) + '|' + this._idOf(G.hazards);
    if (roomKey !== this._roomKey) {
      const manifest = this._manifests[biomeId];
      const pad = this.pad();
      const seed = (Math.random() * 4294967296) >>> 0;
      const plan = this.layout({ biomeId, arena: A, obstacles: G.pillars || [], hazards: G.hazards || [], isBoss: G.reward === 'boss', seed, manifest, pad });
      plan.manifest = manifest;
      this._plan = plan;
      this._roomKey = roomKey;
      this.build(biomeId, plan);
      this._doorsCount = -1;
    }
    const doors = G.doors || [];
    if (doors.length !== this._doorsCount) {
      this._buildGates(biomeId, doors, A);
      this._doorsCount = doors.length;
    }

    this._perFrame(G);
    this._active = true;
    return true;
  },
  // Identity fingerprint for arrays (avoids storing references across rebuilds while still
  // detecting "a new array was assigned" the way ROOMS/game.js replace G.pillars/G.hazards).
  _idOf(arr) {
    if (!arr) return '0';
    if (!arr.__envId) { try { Object.defineProperty(arr, '__envId', { value: ++ENV._idSeq, enumerable: false }); } catch (e) { return String(arr.length); } }
    return String(arr.__envId);
  },
  _idSeq: 0,
  _perFrame(G) {
    const view = this.viewRect();
    const moved = !this._lastView || Math.abs(view.x - this._lastView.x) > this.CFG.CULL_MOVE || Math.abs(view.y - this._lastView.y) > this.CFG.CULL_MOVE
      || Math.abs(view.w - this._lastView.w) > 0.01;
    if (moved) {
      this._lastView = view;
      const visible = this.visibleIndices(this._aabbs, view);
      const visSet = new Set(visible);
      this._objs.forEach((o, i) => { if (o) o.visible = visSet.has(i); });
      this._lastVisibleCount = visible.length;
    }
    const actors = [G.player].concat(G.enemies || []).filter(Boolean);
    for (const { item, obj } of this._entityItems) {
      if (item.z == null || !obj) continue;
      const target = this.occluded(item, actors) ? this.CFG.OCCLUDE_ALPHA : 1;
      obj.alpha += (target - obj.alpha) * 0.25;
    }
    const dt = 1 / 60;
    const tileScale = (this._plan && this._plan.floor && this._plan.floor.tileScale) || 1;
    for (const rb of this._riverBands) {
      if (!rb.obj.tilePosition) continue;
      const speed = (rb.hz.phase === 'surge' && typeof DATA !== 'undefined') ? DATA.HAZARDS.riverCurrent.surgePush : (typeof DATA !== 'undefined' ? DATA.HAZARDS.riverCurrent.push : 120);
      rb.obj.tilePosition.x += (rb.hz.dir || 1) * speed * tileScale * dt;
    }
    this._driftT += dt;
    for (const d of this._driftObjs) d.obj.position.x = d.baseX + Math.sin(this._driftT * 0.5 + d.phase) * 12;
    if (this.vignette) {
      this.vignette.alpha = this.grade('vignette', 0.4);
      this.vignette.visible = true;
      this._resizeVignette();
    }
  },

  isActive() { return !!this._active; },
  hasSkin(o) {
    if (!this._active || !this._skinnedSet || !o) return false;
    const idx = (typeof GAME !== 'undefined' && GAME.pillars) ? GAME.pillars.indexOf(o) : -1;
    return idx >= 0 && this._skinnedSet.has(idx);
  },
  stats() {
    return { items: this._objs.length, byLayer: { entity: this._entityItems.length, river: this._riverBands.length, drift: this._driftObjs.length }, visible: this._lastVisibleCount };
  },
  grade(key, dflt) {
    const m = this._plan && this._plan.manifest;
    return (m && m.grade && m.grade[key] != null) ? m.grade[key] : dflt;
  },
};
