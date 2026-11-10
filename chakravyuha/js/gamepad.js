// ============================================================
// CHAKRAVYUHA — gamepad.js : PAD, Web Gamepad API input layer
// Pure, headless-testable mapping/deadzone/detection helpers + a
// per-frame poll() that drives the shared INPUT object (js/game.js).
// Phase 05.2 Plan 01: DualSense/DS4/Xbox family+model detection,
// extended standard mapping (PS/touchpad/triggers), multi-pad
// arbitration, rebindable action bindings + capture, twin-stick
// world-space aim with aim-assist-lite, left-stick dash direction,
// and a public PAD.state snapshot consumed by later 05.2 plans.
// ============================================================
'use strict';

const PAD = {
  CFG: {
    DEADZONE: 0.2,
    AIM_REACH: 140,
    BTN: {
      A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9,
      LSTICK: 10, RSTICK: 11, DUP: 12, DDOWN: 13, DLEFT: 14, DRIGHT: 15,
      HOME: 16, TOUCHPAD: 17,
    },
    AXIS: { LX: 0, LY: 1, RX: 2, RY: 3 },
    TRIGGER_THRESHOLD: 0.3,
    NAV_THRESHOLD: 0.5,
    ACTIVITY_THRESHOLD: 0.5,
    ASSIST: { CONE: 0.26, RANGE: 460 },
  },

  BUTTON_NAMES: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', 'DUp', 'DDown', 'DLeft', 'DRight', 'Home', 'Touchpad'],
  ACTIONS: ['attack', 'special', 'dash', 'cast', 'pause'],
  DEFAULT_BINDINGS: { attack: ['RT', 'A'], special: ['LT', 'X'], dash: ['B', 'RB'], cast: ['Y'], pause: ['Start', 'Touchpad'] },
  BINDINGS_KEY: 'chakravyuha_padbindings_v1',

  bindings: null,
  _prevButtons: {},     // legacy per-key edge tracker (kept for compatibility with `_edge`)
  _prevPressed: {},     // per-button-name pressed state from the previous poll (edges/actionEdges)
  _aimAng: null,        // last resolved aim intent angle (world-space) — held while both sticks idle
  _capture: null,       // active rebind capture, see captureNext/captureStep
  _audioUnlocked: false,

  state: {
    connected: false, index: -1, id: '', family: 'generic', model: 'unknown', label: 'Controller',
    mapping: '', pads: [],
    buttons: {}, triggers: { LT: 0, RT: 0 }, axes: [],
    left: { x: 0, y: 0, mag: 0 }, right: { x: 0, y: 0, mag: 0 },
    edges: {}, actionEdges: {}, dt: 0,
    rumble: 'unknown', assistTarget: null,
  },

  get family() { return (this.state && this.state.family) || 'generic'; },

  applyDeadzone(x, y, dz) {
    const mag = Math.hypot(x, y);
    if (mag < dz) return { x: 0, y: 0, mag: 0 };
    const scaled = Math.min(1, (mag - dz) / (1 - dz));
    return { x: (x / mag) * scaled, y: (y / mag) * scaled, mag: scaled };
  },

  // ---------------- detection (D-01) ----------------
  familyFromId(id) {
    if (typeof id !== 'string' || !id) return 'generic';
    const s = id.toLowerCase();
    const vp = this._parseVendorProduct(s);
    // Vendor id is authoritative when present (an "Xbox Wireless Controller" id would otherwise
    // also match the generic DS4-style "wireless controller" substring below).
    if (vp && vp.vendor === '054c') return 'ps';
    if (vp && vp.vendor === '045e') return 'xbox';
    if (/xbox|xinput|microsoft/.test(s)) return 'xbox';
    if (/dualsense|dualshock|playstation|wireless controller/.test(s)) return 'ps';
    return 'generic';
  },

  _parseVendorProduct(lowerId) {
    let m = lowerId.match(/vendor:\s*([0-9a-f]{4})/);
    const vendor = m ? m[1] : null;
    m = lowerId.match(/product:\s*([0-9a-f]{4})/);
    let product = m ? m[1] : null;
    if (!vendor && !product) {
      m = lowerId.match(/^([0-9a-f]{4})-([0-9a-f]{4})-/);
      if (m) return { vendor: m[1], product: m[2] };
    }
    return { vendor, product };
  },

  modelFromId(id) {
    const family = this.familyFromId(id);
    const s = typeof id === 'string' ? id.toLowerCase() : '';
    const vp = s ? this._parseVendorProduct(s) : { vendor: null, product: null };
    let model = 'unknown', label = 'Controller';
    if (family === 'ps') {
      if (vp.product === '0ce6') { model = 'dualsense'; label = 'DualSense'; }
      else if (vp.product === '0df2') { model = 'dualsense-edge'; label = 'DualSense Edge'; }
      else if (vp.product === '05c4' || vp.product === '09cc' || vp.product === '0ba0') { model = 'dualshock4'; label = 'DualShock 4'; }
      else if (s.includes('dualsense edge')) { model = 'dualsense-edge'; label = 'DualSense Edge'; }
      else if (s.includes('dualsense')) { model = 'dualsense'; label = 'DualSense'; }
      else if (s.includes('dualshock')) { model = 'dualshock4'; label = 'DualShock 4'; }
    } else if (family === 'xbox') {
      model = 'xbox'; label = 'Xbox controller';
    }
    return { family, vendor: vp.vendor || null, product: vp.product || null, model, label };
  },

  // ---------------- mapping ----------------
  mapGamepad(gp) {
    const AX = this.CFG.AXIS;
    const BTN = this.CFG.BTN;
    const TT = this.CFG.TRIGGER_THRESHOLD;
    const axes = (gp && gp.axes) || [];
    const buttons = (gp && gp.buttons) || [];
    const pressed = (i) => !!(buttons[i] && buttons[i].pressed);
    const value = (i) => {
      const b = buttons[i];
      if (!b) return 0;
      return typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0);
    };
    const ltVal = value(BTN.LT), rtVal = value(BTN.RT);
    return {
      lx: axes[AX.LX] || 0,
      ly: axes[AX.LY] || 0,
      rx: axes[AX.RX] || 0,
      ry: axes[AX.RY] || 0,
      buttons: {
        A: pressed(BTN.A), B: pressed(BTN.B), X: pressed(BTN.X), Y: pressed(BTN.Y),
        LB: pressed(BTN.LB), RB: pressed(BTN.RB),
        LT: pressed(BTN.LT) || ltVal >= TT, RT: pressed(BTN.RT) || rtVal >= TT,
        Back: pressed(BTN.BACK), Start: pressed(BTN.START),
        LS: pressed(BTN.LSTICK), RS: pressed(BTN.RSTICK),
        DUp: pressed(BTN.DUP), DDown: pressed(BTN.DDOWN), DLeft: pressed(BTN.DLEFT), DRight: pressed(BTN.DRIGHT),
        Home: pressed(BTN.HOME), Touchpad: pressed(BTN.TOUCHPAD),
      },
      triggers: { LT: ltVal, RT: rtVal },
    };
  },

  digitalMoveVector(keys, bindings) {
    let dx = 0, dy = 0;
    const held = (list) => list.some(k => keys[k]);
    if (held(bindings.moveUp)) dy -= 1;
    if (held(bindings.moveDown)) dy += 1;
    if (held(bindings.moveLeft)) dx -= 1;
    if (held(bindings.moveRight)) dx += 1;
    const mag = Math.hypot(dx, dy);
    if (mag > 0) { dx /= mag; dy /= mag; }
    return { dx, dy };
  },

  // ---------------- multi-pad arbitration (D-02) ----------------
  pickPad(gps, prevIndex) {
    const list = gps || [];
    const isActive = (gp) => {
      if (!gp) return false;
      const buttons = gp.buttons || [];
      if (buttons.some(b => b && b.pressed)) return true;
      const axes = gp.axes || [];
      return axes.some(a => Math.abs(a || 0) > this.CFG.ACTIVITY_THRESHOLD);
    };
    const prev = (typeof prevIndex === 'number' && prevIndex >= 0) ? list[prevIndex] : null;
    if (prev && prev.connected !== false) {
      for (let i = 0; i < list.length; i++) {
        if (i === prevIndex) continue;
        const gp = list[i];
        if (gp && gp.connected !== false && isActive(gp)) return i;
      }
      return prevIndex;
    }
    let firstAny = -1;
    for (let i = 0; i < list.length; i++) {
      const gp = list[i];
      if (!gp || gp.connected === false) continue;
      if (firstAny < 0) firstAny = i;
      if (gp.mapping === 'standard') return i;
    }
    return firstAny;
  },

  // ---------------- bindings + rebinding (D-03, D-13) ----------------
  loadBindings() {
    const defaults = JSON.parse(JSON.stringify(this.DEFAULT_BINDINGS));
    if (typeof STORE === 'undefined') { this.bindings = defaults; return this.bindings; }
    let stored = null;
    try { stored = STORE.get(this.BINDINGS_KEY, null); } catch (e) { stored = null; }
    if (stored && typeof stored === 'object') {
      for (const action of this.ACTIONS) {
        const v = stored[action];
        if (Array.isArray(v) && v.every(b => this.BUTTON_NAMES.includes(b))) defaults[action] = v.slice();
      }
    }
    this.bindings = defaults;
    return this.bindings;
  },

  saveBindings() {
    if (typeof STORE === 'undefined') return;
    try { STORE.set(this.BINDINGS_KEY, this.bindings); } catch (e) { /* ignore */ }
  },

  resetBindings() {
    this.bindings = JSON.parse(JSON.stringify(this.DEFAULT_BINDINGS));
    this.saveBindings();
    return this.bindings;
  },

  applyPadRebind(bindings, action, btn) {
    const copy = {};
    for (const a of this.ACTIONS) copy[a] = (bindings[a] || []).slice();
    if (!this.ACTIONS.includes(action) || !this.BUTTON_NAMES.includes(btn) || btn === 'Home') return copy;
    for (const a of this.ACTIONS) {
      if (a === action) continue;
      copy[a] = copy[a].filter(b => b !== btn);
    }
    copy[action] = [btn];
    // D-13: pause always retains Start as a fallback, whichever action was just rebound.
    if (!copy.pause.includes('Start')) copy.pause.push('Start');
    return copy;
  },

  actionDown(buttons, action, bindings) {
    return (bindings[action] || []).some(b => !!buttons[b]);
  },

  // ---------------- capture (D-13) ----------------
  // captureNext stores the callback on `_captureCb` (outside the pure capture-state
  // object) so captureStep stays pure/serializable; poll() invokes it on fire.
  captureNext(cb, timeoutS = 5) {
    this._captureCb = cb;
    this._capture = { cb, waitRelease: true, t: 0, timeout: timeoutS };
  },

  captureStep(cap, pressedNow, dt) {
    if (!cap) return { cap: null, fired: null };
    const c = { cb: cap.cb, waitRelease: cap.waitRelease, t: cap.t + (dt || 0), timeout: cap.timeout };
    if (c.t > c.timeout) return { cap: null, fired: null };
    const anyPressed = (pressedNow || []).length > 0;
    if (c.waitRelease) {
      if (anyPressed) return { cap: c, fired: null };
      c.waitRelease = false;
      return { cap: c, fired: null };
    }
    if (anyPressed) {
      const name = this.BUTTON_NAMES.find(b => pressedNow.includes(b));
      if (name) return { cap: null, fired: name };
    }
    return { cap: c, fired: null };
  },

  // ---------------- aim + dash (D-05, D-06) ----------------
  resolveAim(left, right, prevAngle) {
    if (right && right.mag > 0) return { angle: Math.atan2(right.y, right.x), source: 'right' };
    if (left && left.mag > 0) return { angle: Math.atan2(left.y, left.x), source: 'move' };
    return { angle: prevAngle, source: 'hold' };
  },

  aimAssist(px, py, angle, enemies, cfg) {
    const c = cfg || this.CFG.ASSIST;
    let best = null, bestScore = Infinity;
    for (const e of (enemies || [])) {
      if (!e || e.dead || e.spawnT > 0) continue;
      const dist = Math.hypot(e.x - px, e.y - py);
      if (dist > c.RANGE) continue;
      const toE = Math.atan2(e.y - py, e.x - px);
      const diff = Math.abs(U.angDiff(angle, toE));
      if (diff > c.CONE) continue;
      const score = diff + dist / 2000;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (!best) return { angle, target: null };
    return { angle: Math.atan2(best.y - py, best.x - px), target: best };
  },

  chooseDashDir(ax, ay, kbVec, aim) {
    if (ax || ay) return Math.atan2(ay, ax);
    if (kbVec && (kbVec.dx || kbVec.dy)) return Math.atan2(kbVec.dy, kbVec.dx);
    return aim;
  },

  _edge(key, down, fn) {
    if (down && !this._prevButtons[key]) fn();
    this._prevButtons[key] = down;
  },

  // ---------------- per-frame poll ----------------
  poll() {
    if (typeof GLYPHS !== 'undefined') GLYPHS.refresh();
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const dt = Math.min(0.1, Math.max(0, (this._lastPollT === undefined ? 0 : (now - this._lastPollT) / 1000)));
    this._lastPollT = now;
    this.state.dt = dt;

    if (this.bindings === null) this.loadBindings();

    const gps = navigator.getGamepads() || [];
    const pads = [];
    for (let i = 0; i < gps.length; i++) {
      const gp = gps[i];
      if (gp && gp.connected !== false) pads.push({ index: i, id: gp.id, family: this.familyFromId(gp.id), mapping: gp.mapping || '' });
    }
    this.state.pads = pads;

    const idx = this.pickPad(gps, this.state.index);
    if (idx < 0) {
      this.state.connected = false;
      this.state.index = -1;
      this.state.id = '';
      this.state.edges = {};
      this.state.actionEdges = {};
      this._prevPressed = {};
      if (INPUT.device === 'pad') { INPUT.device = 'kbm'; }
      INPUT.ax = 0; INPUT.ay = 0;
      return;
    }

    const gp = gps[idx];
    if (idx !== this.state.index) this._prevPressed = {};   // active pad changed: no phantom edges
    this.state.index = idx;

    const m = this.mapGamepad(gp);
    const left = this.applyDeadzone(m.lx, m.ly, this.CFG.DEADZONE);
    const right = this.applyDeadzone(m.rx, m.ry, this.CFG.DEADZONE);

    const meta = this.modelFromId(gp.id);
    this.state.id = gp.id || '';
    this.state.family = meta.family;
    this.state.model = meta.model;
    this.state.label = meta.label;
    this.state.mapping = gp.mapping || '';
    this.state.connected = true;
    this.state.buttons = m.buttons;
    this.state.triggers = m.triggers;
    this.state.axes = (gp.axes || []).slice();
    this.state.left = left;
    this.state.right = right;
    this.state.rumble = (gp.vibrationActuator && typeof gp.vibrationActuator.playEffect === 'function') ? 'supported' : 'unsupported';

    // edges (rising-edge per button name)
    const edges = {};
    for (const name of this.BUTTON_NAMES) {
      const down = !!m.buttons[name];
      edges[name] = down && !this._prevPressed[name];
    }
    const actionEdges = {};
    for (const action of this.ACTIONS) {
      const wasDown = this.actionDown(this._prevPressed, action, this.bindings);
      const isDown = this.actionDown(m.buttons, action, this.bindings);
      actionEdges[action] = isDown && !wasDown;
    }
    this.state.edges = edges;
    this.state.actionEdges = actionEdges;

    const anyButton = this.BUTTON_NAMES.some(k => m.buttons[k]);
    const triggerActive = m.triggers.LT >= this.CFG.TRIGGER_THRESHOLD || m.triggers.RT >= this.CFG.TRIGGER_THRESHOLD;
    const active = left.mag > 0 || right.mag > 0 || anyButton || triggerActive;
    if (active) {
      INPUT.device = 'pad';
      if (!this._audioUnlocked && typeof AUDIO !== 'undefined') {
        this._audioUnlocked = true;
        try { AUDIO.init(); AUDIO.resume(); } catch (e) { /* best effort (D-16) */ }
      }
    }

    // capture: rebind in progress — suppress all other pad handling this frame
    if (this._capture) {
      const pressedNow = this.BUTTON_NAMES.filter(b => m.buttons[b]);
      const result = this.captureStep(this._capture, pressedNow, dt);
      this._capture = result.cap;
      this._prevPressed = {};
      for (const name of this.BUTTON_NAMES) this._prevPressed[name] = !!m.buttons[name];
      if (result.fired) {
        const cb = this._captureCb;
        this._captureCb = null;
        if (cb) { try { cb(result.fired); } catch (e) { /* ignore */ } }
      }
      return;
    }

    if (INPUT.device === 'pad') {
      INPUT.ax = left.x;
      INPUT.ay = left.y;
      INPUT.lmb = this.actionDown(m.buttons, 'attack', this.bindings);

      if (typeof GAME !== 'undefined' && GAME.player) {
        const P = GAME.player;
        const intent = this.resolveAim(left, right, this._aimAng !== null ? this._aimAng : (P.aim || 0));
        this._aimAng = intent.angle;
        const assistOn = (typeof SETTINGS === 'undefined') || SETTINGS.get('aimAssist') !== false;
        const assisted = assistOn
          ? this.aimAssist(P.x, P.y, intent.angle, GAME.enemies)
          : { angle: intent.angle, target: null };
        this.state.assistTarget = assisted.target;
        const a = assisted.angle;
        if (typeof INPUT.wx === 'number' || typeof INPUT.wy === 'number') {
          INPUT.wx = P.x + Math.cos(a) * this.CFG.AIM_REACH;
          INPUT.wy = P.y + Math.sin(a) * this.CFG.AIM_REACH;
        } else {
          INPUT.mx = P.x + Math.cos(a) * this.CFG.AIM_REACH;
          INPUT.my = P.y + Math.sin(a) * this.CFG.AIM_REACH;
        }
      }

      // ---- rumble event detector (D-12): boss slam (shake jump) / player death ----
      if (typeof GAME !== 'undefined') {
        const cur = { shake: GAME.shake, state: GAME.state, boss: !!(GAME.bossRef && !GAME.bossRef.dead) };
        const ev = this._frame ? this.rumbleEventFromFrame(this._frame, cur) : null;
        this._frame = cur;
        if (ev) this.rumble(ev);
      }

      // ---- menu focus gate: a visible panel consumes pad input as menu navigation ----
      if (typeof FOCUS !== 'undefined' && FOCUS.tickPad(this.state)) {
        this._prevPressed = {};
        for (const name of this.BUTTON_NAMES) this._prevPressed[name] = !!m.buttons[name];
        return;
      }

      // ---- combat/pause dispatch ----
      if (typeof GAME !== 'undefined') {
        if (actionEdges.special && GAME.playing()) GAME.player.trySpecial();
        if (actionEdges.dash && GAME.playing()) GAME.player.tryDash();
        if (actionEdges.cast && GAME.playing()) GAME.player.tryCast();
        if (actionEdges.pause) {
          if (GAME.state === 'paused') UI.resume(); else UI.pause();
        }
      }
    } else {
      INPUT.ax = 0; INPUT.ay = 0;
    }

    this._prevPressed = {};
    for (const name of this.BUTTON_NAMES) this._prevPressed[name] = !!m.buttons[name];
  },

  // ---------------- rumble (D-12) ----------------
  RUMBLE_PRESETS: {
    kill:  { duration: 40,  weak: 0.25, strong: 0,   tier: 0 },
    hit:   { duration: 60,  weak: 0.35, strong: 0.1, tier: 1 },
    crit:  { duration: 80,  weak: 0.5,  strong: 0.2, tier: 1 },
    hurt:  { duration: 160, weak: 0.5,  strong: 0.6, tier: 2 },
    heavy: { duration: 320, weak: 0.8,  strong: 1.0, tier: 3 },
    test:  { duration: 500, weak: 0.6,  strong: 0.9, tier: 3 },
  },
  VFX_RUMBLE: { hit: 'hit', crit: 'crit', death: 'kill', hurt: 'hurt', phase: 'heavy', bossDeath: 'heavy',
    dashStrike: 'hit', chargeFlash: 'crit', finisherRing: 'crit' },   // 05.7.1-03 kit hit feel

  _lastRumble: null,
  _rumbleActive: null,
  _frame: null,

  // Pure: preset name + intensity (0..1) -> playEffect args, or null (unknown preset / intensity <= 0).
  rumblePreset(name, intensity) {
    const p = this.RUMBLE_PRESETS[name];
    if (!p || !(intensity > 0)) return null;
    const clamp01 = v => Math.max(0, Math.min(1, v));
    return {
      duration: p.duration,
      weakMagnitude: clamp01(p.weak * intensity),
      strongMagnitude: clamp01(p.strong * intensity),
      tier: p.tier,
    };
  },

  // Pure: may a preset of `tier` play right now given the currently active preset (or null)?
  // A weaker/equal preset never interrupts a stronger one still playing; same-tier repeats are
  // throttled to >= 50ms apart.
  rumbleShouldPlay(now, active, tier) {
    if (!active || now >= active.until) return true;
    if (tier > active.tier) return true;
    if (tier === active.tier) return (now - active.at) >= 50;
    return false;
  },

  // Feature-detected single-call rumble on a live gamepad object. Never throws; a rejecting
  // playEffect promise is swallowed.
  _playOn(gp, eff) {
    const act = gp && gp.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return false;
    try {
      const p = act.playEffect('dual-rumble', {
        startDelay: 0, duration: eff.duration,
        weakMagnitude: eff.weakMagnitude, strongMagnitude: eff.strongMagnitude,
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return true;
    } catch (e) { return false; }
  },

  // Gated preset playback: SETTINGS.rumble on, active device is 'pad' (or opts.force), a positive
  // rumbleIntensity, and rumbleShouldPlay's tier/throttle rules. Returns whether gating passed.
  rumble(name, opts = {}) {
    if (typeof SETTINGS !== 'undefined' && SETTINGS.get('rumble') === false) return false;
    if (!(opts.force || (typeof INPUT !== 'undefined' && INPUT.device === 'pad'))) return false;
    const intensity = typeof SETTINGS !== 'undefined' ? SETTINGS.get('rumbleIntensity') : 0.8;
    const eff = this.rumblePreset(name, intensity);
    if (!eff) return false;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!this.rumbleShouldPlay(now, this._rumbleActive, eff.tier)) return false;
    this._lastRumble = name;
    this._rumbleActive = { tier: eff.tier, at: now, until: now + eff.duration };
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const gps = navigator.getGamepads() || [];
      const gp = gps[this.state.index];
      if (gp) this._playOn(gp, eff);
    }
    return true;
  },

  // Idempotent: wraps VFX.emit once so combat's existing emit('hit'/'crit'/'death'/'hurt'/'phase'/
  // 'bossDeath', ...) calls also trigger the matching rumble preset, with no js/vfx.js edit.
  installRumbleHooks() {
    if (typeof VFX === 'undefined' || VFX.emit._padRumble) return;
    const orig = VFX.emit;
    const wrapped = function (name, ...rest) {
      const r = orig.call(this, name, ...rest);
      const preset = PAD.VFX_RUMBLE[name];
      if (preset) { try { PAD.rumble(preset); } catch (e) { /* ignore */ } }
      return r;
    };
    wrapped._padRumble = true;
    VFX.emit = wrapped;
  },

  // Pure: boss-slam (shake jump while a boss is alive) / player-death rumble-event detector,
  // fed one frame of { shake, state, boss } at a time from poll().
  rumbleEventFromFrame(prev, cur) {
    if (!prev || !cur) return null;
    if (cur.shake - prev.shake >= 10 && cur.boss) return 'heavy';
    if (prev.state !== 'dead' && cur.state === 'dead') return 'heavy';
    return null;
  },
};

PAD.installRumbleHooks();   // VFX loads before gamepad.js (index.html + test/smoke.js)
