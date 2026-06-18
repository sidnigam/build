# Phase 1: Render Abstraction Seam - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap the existing `GAME.render()` monolith in a camera abstraction and named draw passes — no visual change to gameplay, smoke tests stay green. This is the universal gate: every downstream phase (sprites, VFX, Electron shell) depends on this seam landing first.

**In scope:** Camera object, CAMERA.begin/end, 4 named pass functions, smoke.js file list update.
**Out of scope:** Actual sprites, VFX, scrolling camera, new art assets — those are Phase 2/3.

</domain>

<decisions>
## Implementation Decisions

### Module Location
- **D-01:** Create a new `js/renderer.js` file that exports the `CAMERA` global object. Do NOT inline the camera into `game.js`.
- **D-02:** Add `renderer.js` to `smoke.js`'s file list (between `utils.js` and `game.js`). The existing `ctxStub` Proxy absorbs all canvas ops — no `typeof document` guard needed in `renderer.js`.
- **D-03:** Load order in `index.html`: `renderer.js` must load before `game.js` so `CAMERA` is available when `GAME` initializes.

### Camera API Shape
- **D-04:** Camera uses a **begin/end pair**: `CAMERA.begin(ctx)` saves state + applies transforms; `CAMERA.end(ctx)` restores state.
- **D-05:** `CAMERA` exposes four properties: `x`, `y`, `zoom`, `shake`. Initialize all to neutral values (`x:0, y:0, zoom:1, shake:0`) in Phase 1 — they are the hook for Phase 2 (scrolling) and Phase 3 (kill-zoom).
- **D-06:** Shake stays on `GAME.shake` (int/float). `CAMERA.begin(ctx)` reads `GAME.shake` to apply the translate. `update()` and the shake decay logic are **not touched**.
- **D-07:** `CAMERA.begin(ctx)` applies transforms in this order: `ctx.save()` → `translate(CAMERA.x, CAMERA.y)` → `scale(CAMERA.zoom, CAMERA.zoom)` → `translate(rand(-GAME.shake, GAME.shake)*0.5, rand(-GAME.shake, GAME.shake)*0.5)` (only when `GAME.shake > 0.5`).

### Draw Pass Structure
- **D-08:** Split `GAME.render()` into **4 named pass methods on GAME** (not in renderer.js):
  - `GAME.renderBackground(ctx)` — biome bg, floor, mandala, walls, zones, pillars, doors, pickups; also hub bg via existing `renderHubBg`
  - `GAME.renderEntities(ctx)` — enemies, player (calls existing `e.draw(ctx)` / `player.draw(ctx)` unchanged)
  - `GAME.renderEffects(ctx)` — orbits, projectiles (player + enemy), bolts, rings, particles, damage texts
  - `GAME.renderHUD(ctx)` — all UI: HP bar, defiance lotuses, dash/cast pips, special cooldown, currencies, biome label, boon icons, boss bar, door hint, **crosshair** (see D-10)
- **D-09:** `renderer.js` owns **only** `CAMERA`. Pass functions stay on `GAME` to access `GAME` state (enemies, particles, zones, etc.) without passing large state bundles or creating circular globals.

### HUD / UI Pass Treatment
- **D-10:** `renderHUD()` is called **after** `CAMERA.end(ctx)` — outside the camera save/restore block. HUD elements (health bar, boon icons, boss bar, etc.) will never shake with the world. This is the correct architecture.
- **D-11:** The crosshair (currently drawn after `ctx.restore()` in the existing render) is **folded into `renderHUD()`**. After this change, `renderHUD()` is the complete, self-contained UI pass with no dangling draws.

### Resulting render() call sequence
```js
render() {
  const ctx = this.ctx;
  const inRun = this.state !== 'hub';

  CAMERA.begin(ctx);
  this.renderBackground(ctx);
  if (inRun) {
    this.renderEntities(ctx);
    this.renderEffects(ctx);
  }
  CAMERA.end(ctx);
  this.renderHUD(ctx);   // UI pass — outside camera transform
}
```

### Claude's Discretion
- Internal implementation of `CAMERA.begin`/`CAMERA.end` (e.g., whether `CAMERA.shake` property mirrors `GAME.shake` internally or reads it directly).
- Exact split boundary between `renderBackground` and `renderEffects` for items like danger zones (boss slam indicators) — place where visually correct.
- Whether `renderBackground` returns early for hub state or defers to a `renderHubBg` internal call — match current behavior exactly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/REQUIREMENTS.md` §RENDER — RENDER-01 is the sole requirement for this phase; read the exact acceptance criteria there.

### Existing Source Files to Read Before Planning
- `js/game.js` — current `GAME.render()` (lines ~331–547), `renderHUD()` (lines ~575–697), `renderHubBg()` — these are the exact code being refactored
- `js/entities.js` — `player.draw(ctx)` (line ~436) and `enemy.draw(ctx)` (line ~665) — must remain signature-compatible
- `test/smoke.js` — file load list (line 83), `ctxStub` definition (lines 40–49), `GAME.render()` call sites (lines 167, 238) — must stay green

### Phase Success Criteria (from ROADMAP.md)
- `.planning/ROADMAP.md` §Phase 1 — 4 success criteria; #4 ("render modules never load in headless path") is satisfied by D-02 (ctxStub absorbs all calls)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GAME.ctx` — raw Canvas 2D context stored on GAME; `CAMERA.begin(ctx)` receives this directly
- `GAME.shake` — float, decayed in `update()`, already used in existing shake translate; camera reads it (D-06)
- `U.rand(a, b)` — used for the shake offset; camera will use same utility
- `ctxStub` in smoke.js — Proxy that no-ops all canvas ops; already handles `createRadialGradient`, `measureText`, etc.

### Established Patterns
- All game objects are vanilla JS globals (`GAME`, `DATA`, `META`, `AUDIO`, `UI`, `U`, `INPUT`) — `CAMERA` follows the same pattern
- No module system, no imports — `renderer.js` must be a self-contained `'use strict'` script that assigns `const CAMERA = { ... }`
- `ctx.save()` / `ctx.restore()` pattern is already used in `render()` — begin/end mirrors this directly

### Integration Points
- `GAME.render()` is the only entry point to change; called from `frame()` (line ~153) and from `smoke.js` test harness
- `renderHubBg(ctx)` is an existing method on GAME — keep it, call from `renderBackground()`
- `renderHUD(ctx)` is an existing method on GAME — keep signature, move call site outside camera block

</code_context>

<specifics>
## Specific Ideas

No specific visual references — this is a pure structural refactor. The output must be pixel-identical to the current build: no color changes, no position changes, no timing changes.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-render-abstraction-seam*
*Context gathered: 2026-06-17*
