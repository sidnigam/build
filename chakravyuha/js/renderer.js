// js/renderer.js — CAMERA global (Phase 1: neutral transforms; hooks for Phase 2 scroll / Phase 3 zoom)
'use strict';

const CAMERA = {
  x: 0, y: 0, zoom: 1, shake: 0,   // D-05: neutral init

  begin(ctx) {
    ctx.save();                                   // D-07 transform order
    ctx.translate(this.x, this.y);
    ctx.scale(this.zoom, this.zoom);
    if (GAME.shake > 0.5)                          // D-06: read GAME.shake directly
      ctx.translate(U.rand(-GAME.shake, GAME.shake) * 0.5,
                    U.rand(-GAME.shake, GAME.shake) * 0.5);
  },

  end(ctx) {
    ctx.restore();
  },
};
