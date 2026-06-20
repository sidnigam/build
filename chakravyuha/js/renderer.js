// js/renderer.js — CAMERA global (Phase 2: drives PixiJS worldContainer; ctx transform removed)
'use strict';

const CAMERA = {
  x: 0, y: 0, zoom: 1, shake: 0,   // D-05: neutral init

  // D-03: CAMERA.begin drives worldContainer position/scale instead of ctx transforms.
  // Takes no ctx argument. No-ops in headless (SPRITES.worldContainer is null).
  begin() {
    const wc = (typeof SPRITES !== 'undefined') && SPRITES.worldContainer;
    if (!wc) return;                              // headless / pre-init: no-op
    let ox = this.x, oy = this.y;
    if (GAME.shake > 0.5) {                       // D-06: read GAME.shake at call time
      ox += U.rand(-GAME.shake, GAME.shake) * 0.5;
      oy += U.rand(-GAME.shake, GAME.shake) * 0.5;
    }
    wc.position.set(ox, oy);
    wc.scale.set(this.zoom);
  },

  // No ctx.restore needed — container transform persists until next begin().
  end() { /* no-op — worldContainer transform stays set */ },
};
