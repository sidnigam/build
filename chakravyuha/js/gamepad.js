// ============================================================
// CHAKRAVYUHA — gamepad.js : PAD, Web Gamepad API input layer
// Pure, headless-testable mapping/deadzone helpers + a per-frame
// poll() that drives the shared INPUT object (js/game.js).
// ============================================================
'use strict';

const PAD = {
  CFG: {
    DEADZONE: 0.2,
    AIM_REACH: 140,
    BTN: { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LSTICK: 10, RSTICK: 11, DUP: 12, DDOWN: 13, DLEFT: 14, DRIGHT: 15 },
    AXIS: { LX: 0, LY: 1, RX: 2, RY: 3 },
  },

  _prevButtons: {},

  applyDeadzone(x, y, dz) {
    const mag = Math.hypot(x, y);
    if (mag < dz) return { x: 0, y: 0, mag: 0 };
    const scaled = Math.min(1, (mag - dz) / (1 - dz));
    return { x: (x / mag) * scaled, y: (y / mag) * scaled, mag: scaled };
  },

  mapGamepad(gp) {
    const AX = this.CFG.AXIS;
    const BTN = this.CFG.BTN;
    const axes = (gp && gp.axes) || [];
    const buttons = (gp && gp.buttons) || [];
    const pressed = (i) => !!(buttons[i] && buttons[i].pressed);
    return {
      lx: axes[AX.LX] || 0,
      ly: axes[AX.LY] || 0,
      rx: axes[AX.RX] || 0,
      ry: axes[AX.RY] || 0,
      buttons: {
        A: pressed(BTN.A), B: pressed(BTN.B), X: pressed(BTN.X), Y: pressed(BTN.Y),
        LB: pressed(BTN.LB), RB: pressed(BTN.RB), LT: pressed(BTN.LT), RT: pressed(BTN.RT),
        Back: pressed(BTN.BACK), Start: pressed(BTN.START),
        DUp: pressed(BTN.DUP), DDown: pressed(BTN.DDOWN), DLeft: pressed(BTN.DLEFT), DRight: pressed(BTN.DRIGHT),
      },
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

  _edge(key, down, fn) {
    if (down && !this._prevButtons[key]) fn();
    this._prevButtons[key] = down;
  },

  poll() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const gps = navigator.getGamepads();
    const gp = gps && gps[0];
    if (!gp) return;

    const m = this.mapGamepad(gp);
    const left = this.applyDeadzone(m.lx, m.ly, this.CFG.DEADZONE);
    const right = this.applyDeadzone(m.rx, m.ry, this.CFG.DEADZONE);

    const anyButton = Object.keys(m.buttons).some(k => m.buttons[k]);
    if (left.mag > 0 || right.mag > 0 || anyButton) INPUT.device = 'pad';

    INPUT.ax = left.x;
    INPUT.ay = left.y;

    if (right.mag > 0 && typeof GAME !== 'undefined' && GAME.player) {
      const ang = Math.atan2(right.y, right.x);
      INPUT.mx = GAME.player.x + Math.cos(ang) * this.CFG.AIM_REACH;
      INPUT.my = GAME.player.y + Math.sin(ang) * this.CFG.AIM_REACH;
    }

    INPUT.lmb = m.buttons.RT || m.buttons.A;

    this._edge('special', m.buttons.LT || m.buttons.X, () => {
      if (typeof GAME !== 'undefined' && GAME.playing()) GAME.player.trySpecial();
    });
    this._edge('dash', m.buttons.B || m.buttons.RB, () => {
      if (typeof GAME !== 'undefined' && GAME.playing()) GAME.player.tryDash();
    });
    this._edge('cast', m.buttons.Y, () => {
      if (typeof GAME !== 'undefined' && GAME.playing()) GAME.player.tryCast();
    });
    this._edge('pause', m.buttons.Start, () => {
      if (typeof GAME === 'undefined') return;
      if (GAME.state === 'paused') UI.resume(); else UI.pause();
    });
  },
};
