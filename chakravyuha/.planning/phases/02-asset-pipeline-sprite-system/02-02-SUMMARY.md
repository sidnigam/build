---
phase: 02-asset-pipeline-sprite-system
plan: "02"
subsystem: renderer
tags: [pixi, renderer, camera, sprite-system, bridge-canvas]
dependency_graph:
  requires: ["02-01"]
  provides: ["02-03", "02-04", "02-05", "02-06"]
  affects: ["js/renderer.js", "js/game.js", "js/sprites.js"]
tech_stack:
  added: ["PixiJS 8.19.0 (vendored UMD)"]
  patterns:
    - "Hidden-canvas bridge: legacy draw(ctx) primitives render to offscreen 2D canvas, uploaded to PIXI.Texture each frame"
    - "CAMERA drives worldContainer.position/scale instead of ctx transforms"
    - "Sprite-or-fallback: SPRITES.has(key) gates AnimatedSprite vs entity.draw(ctx)"
    - "Headless guard: typeof navigator === 'undefined' early-returns all Pixi paths"
key_files:
  created: ["vendor/pixi.min.js"]
  modified:
    - "index.html — <script src=vendor/pixi.min.js> added before js/sprites.js"
    - "js/sprites.js — Application init, scene graph, bridge canvas, load(), createAnimatedSprite, drawEntity, removeEntity"
    - "js/renderer.js — CAMERA.begin/end refactored to drive worldContainer; no ctx param"
    - "js/game.js — render() uses bridge pipeline; renderEntities() has sprite-or-fallback"
decisions:
  - "Bridge canvas inserted into worldContainer at z-index 0 (addChildAt index 0), below entity and fx containers — primitives form the base layer for fallback fidelity"
  - "CAMERA.begin() takes no ctx argument — worldContainer transform persists, end() is a no-op"
  - "Headless render() is a complete no-op (returns at SPRITES.bridgeCtx guard) — smoke runs unchanged"
  - "SPRITES.load() flips ready=true only when at least one atlas loads — ready=false until art lands"
metrics:
  duration_minutes: 35
  completed_date: "2026-06-20T20:45:18Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase 02 Plan 02: PixiJS Renderer Migration Summary

**One-liner:** PixiJS 8 replaces Canvas 2D as the renderer — hidden-canvas bridge preserves all legacy draw(ctx) primitives, CAMERA drives worldContainer, and sprite-or-fallback lets art drop in per-entity with zero wiring.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Vendor PixiJS 8 + bootstrap Application + scene graph | 4f93a57 | vendor/pixi.min.js, index.html, js/sprites.js, js/game.js |
| 2 | Refactor CAMERA to drive worldContainer + bridge-canvas pipeline | e3b66e4 | js/renderer.js, js/game.js |
| 3 | Sprite-or-fallback renderEntities + SPRITES.load/createAnimatedSprite | bb90f38 | js/game.js |

## What Was Built

**PixiJS scene graph (js/sprites.js):**
- `SPRITES.init(canvas)` builds a PixiJS Application (async v8 pattern) and a 5-container scene graph: `worldContainer` → [`bgContainer`, `entityContainer`, `fxContainer`] + `hudContainer` at stage root.
- Hidden bridge canvas (1280x720 offscreen 2D) is created and its texture inserted into `worldContainer` at z-index 0.
- `clearBridge()` / `uploadBridge()` manage the per-frame texture re-upload.

**CAMERA refactoring (js/renderer.js):**
- `CAMERA.begin()` takes no ctx argument. Guards on `SPRITES.worldContainer` (no-op headless). Sets `wc.position.set(ox, oy)` and `wc.scale.set(this.zoom)` including shake offset.
- `CAMERA.end()` is a no-op — container transform persists until next frame's `begin()`.

**render() pipeline (js/game.js):**
- Guards on `SPRITES.bridgeCtx` — returns immediately in headless (smoke stays green, no ctx errors).
- Calls `SPRITES.clearBridge()` → `CAMERA.begin()` → render passes with `ctx = SPRITES.bridgeCtx` → `CAMERA.end()` → `SPRITES.uploadBridge()`.
- All `renderBackground`, `renderEffects`, `renderHUD` pass unchanged — they still take a ctx and draw 2D primitives.

**Sprite-or-fallback (js/game.js renderEntities):**
- Enemies: `SPRITES.has(e.type)` → `SPRITES.drawEntity(e)` or `e.draw(ctx)` fallback.
- Dead enemies: `SPRITES.removeEntity(e)` cleans up `_pixiSprite` from scene graph.
- Player: `SPRITES.has('player')` → sets `spriteKey = 'player'`, calls `SPRITES.drawEntity(player)` or `player.draw(ctx)` fallback.

**createAnimatedSprite + drawEntity (js/sprites.js):**
- `createAnimatedSprite(key, anim)`: returns null when `!has(key)` (D-11). Creates `PIXI.AnimatedSprite` with `animationSpeed=0.15`, loops idle/run, one-shot attack/dash with `onComplete` gotoAndStop.
- `drawEntity(e)`: per-entity sprite cache (`e._pixiSprite`). Swaps animation when `_animFor(e)` result changes. Destroys old sprite and creates new one on animation transition.
- `_animFor(e)`: maps player state (dashT, swing.t, velocity) and enemy state (wind/lunge/strike/charge → attack; chase/approach → run; else idle) to animation names.

**SPRITES.load(manifest) (js/sprites.js):**
- Per-atlas `PIXI.Assets.load(entry.path)` in try/catch — missing atlas is non-fatal, logged with `console.warn`, key added to `_missing`.
- Sets `this.ready = true` after loop if any atlas loaded.
- GAME.init() chains: `SPRITES.init(canvas).then(() => SPRITES.load(manifest))` with player + DATA.ENEMIES + DATA.BOSSES entries.

## Deviations from Plan

None — plan executed exactly as written. All three tasks matched their acceptance criteria.

## Verification

```
node test/smoke.js → ALL SMOKE TESTS PASSED
```

- `render()` no-ops headless (SPRITES.bridgeCtx undefined) — zero test breakage.
- All 4 runs (god mode, death, stress, weapon variants) complete with no runtime errors.
- `SPRITES.has()` returns false with zero atlases — all entities fall through to `draw(ctx)` on bridge.

## Known Stubs

None — no stub data flows to rendering. All fallback paths (has() = false → draw(ctx)) are the same behavior as pre-migration. Art files (`.json` atlases) will be loaded by Plans 04-06; when present, `has(key)` becomes true and `drawEntity` takes over automatically.

## Self-Check: PASSED

Files created/modified:
- FOUND: /Users/sidnigam/Documents/coding/build/chakravyuha/vendor/pixi.min.js
- FOUND: /Users/sidnigam/Documents/coding/build/chakravyuha/js/renderer.js
- FOUND: /Users/sidnigam/Documents/coding/build/chakravyuha/js/sprites.js
- FOUND: /Users/sidnigam/Documents/coding/build/chakravyuha/js/game.js

Commits verified:
- 4f93a57 feat(02-02): vendor PixiJS 8 and bootstrap Application scene graph
- e3b66e4 feat(02-02): refactor CAMERA to drive worldContainer + bridge-canvas render pipeline
- bb90f38 feat(02-02): implement sprite-or-fallback renderEntities for RENDER-02/RENDER-03
