// js/renderer.js — CAMERA global (Phase 2: drives PixiJS worldContainer; ctx transform removed)
// Phase 3: adds shake-intensity scaling + opt-out (VFX-02), kill-zoom punch and
// directional kick (VFX-02), all reading SETTINGS at call time (no top-level ref).
'use strict';

const CAMERA = {
  x: 0, y: 0, zoom: 1, shake: 0,   // D-05: neutral init

  // kill-zoom punch state (D-14)
  punchAmt: 0, punchT: 0, punchDur: 0, fx: 0, fy: 0,
  // directional kick state (D-13)
  kx: 0, ky: 0,

  // D-13: 0..1 multiplier applied to GAME.shake and to the kick/punch systems.
  // typeof SETTINGS undefined (should not happen post-Plan-01, but stay defensive) -> full intensity.
  shakeScale() {
    if (typeof SETTINGS === 'undefined') return 1;
    return SETTINGS.get('screenShake') ? SETTINGS.get('shakeIntensity') : 0;
  },

  // D-14: kill-zoom camera punch, focused on a world point. Overlapping punches take the max.
  punch(wx, wy, amount, dur) {
    if (this.shakeScale() === 0) return;
    if (amount >= this.punchAmt) {
      this.fx = wx; this.fy = wy;
      this.punchAmt = amount;
      this.punchDur = dur;
      this.punchT = dur;
    }
  },

  // D-13: directional impulse (player hurt knock, finisher). Camera motion — off with shakeScale 0.
  kick(dx, dy) {
    if (this.shakeScale() === 0) return;
    this.kx += dx; this.ky += dy;
    const mag = Math.hypot(this.kx, this.ky);
    if (mag > 12) { const k = 12 / mag; this.kx *= k; this.ky *= k; }
  },

  // Quick attack over the first 20% of the pulse, then an ease-out cubic back to 0.
  zoomPulse() {
    if (this.punchT <= 0) return 1;
    const u = 1 - this.punchT / this.punchDur;
    const env = u < 0.2 ? u / 0.2 : Math.pow(1 - (u - 0.2) / 0.8, 3);
    return 1 + this.punchAmt * env;
  },

  // Called every real frame (js/game.js frame()) so punch/kick keep animating during hitstop.
  update(dt) {
    this.punchT = Math.max(0, this.punchT - dt);
    const k = Math.exp(-dt * 18);
    this.kx *= k; this.ky *= k;
    this.zoom = this.zoomPulse();
  },

  resetFx() {
    this.punchAmt = 0; this.punchT = 0; this.punchDur = 0; this.fx = 0; this.fy = 0;
    this.kx = 0; this.ky = 0; this.zoom = 1;
  },

  // D-03: CAMERA.begin drives worldContainer position/scale instead of ctx transforms.
  // Takes no ctx argument. No-ops in headless (SPRITES.worldContainer is null).
  begin() {
    const wc = (typeof SPRITES !== 'undefined') && SPRITES.worldContainer;
    if (!wc) return;                              // headless / pre-init: no-op
    const scale = this.shakeScale();
    let ox = this.x + this.kx * scale, oy = this.y + this.ky * scale;
    const s = GAME.shake * scale;                 // D-06: read GAME.shake at call time
    if (s > 0.5) {
      ox += U.rand(-s, s) * 0.5;
      oy += U.rand(-s, s) * 0.5;
    }
    // Zoom about the punch focus point (D-14). When z === 1 this reduces to the old behaviour.
    const z = this.zoom;
    ox += this.fx - this.fx * z;
    oy += this.fy - this.fy * z;
    wc.position.set(ox, oy);
    wc.scale.set(z);
  },

  // No ctx.restore needed — container transform persists until next begin().
  end() { /* no-op — worldContainer transform stays set */ },
};
