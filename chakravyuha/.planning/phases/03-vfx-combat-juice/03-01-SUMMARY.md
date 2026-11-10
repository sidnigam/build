---
phase: 03-vfx-combat-juice
plan: 01
subsystem: vfx-foundation
tags: [particles, object-pool, settings, accessibility, pixi]
dependency_graph:
  requires: []
  provides: [VFX-pool-core, SETTINGS-global]
  affects: [entities.js burst(), game.js update/render loop]
tech_stack:
  added: []
  patterns:
    - "Fixed-size object pool with Int32Array free-list stack (VFX.pool/free/freeTop) — no array growth, no push/filter in the hot path"
    - "Vanilla-global module pattern (VFX/SETTINGS) mirroring CAMERA/SPRITES — no Pixi reference at module scope, lazy Pixi attach on first render()"
key_files:
  created:
    - js/settings.js
    - js/vfx.js
  modified:
    - js/entities.js
    - js/game.js
    - index.html
    - test/smoke.js
decisions:
  - "burst() overrides t/max on the pool entry after calling VFX.spawn(), to preserve the exact legacy random-life distribution while sharing the generic spawner with future presets"
  - "VFX.stress fills the pool directly via spawn() (not burst()) to bypass reducedParticles count scaling during profiling"
  - "_renderFlash()/flashT/flashColor/flashDur fields are stubbed in vfx.js now (referenced only from the Pixi path, never exercised headless) so Plan 02 can wire VFX.flash() without touching the render plumbing again"
metrics:
  duration_min: n/a (agent session)
  tasks: 2
  files_touched: 6
  completed: 2026-09-25
---

# Phase 3 Plan 1: VFX Foundation + SETTINGS Summary

Fixed-size 2048-slot pooled particle simulation (`js/vfx.js`) and a persisted accessibility-settings global (`js/settings.js`), with every existing `burst()` call site now routed through the pool and zero per-frame array churn left in `GAME.update`/`renderEffects`.

## What was built

- **`js/settings.js`**: `SETTINGS` global with `DEFAULTS` (screenShake, shakeIntensity, screenFlash, hitstop, reducedParticles), `get/set/all/reset/load/save`, localStorage persistence under key `chakravyuha.settings`, type/range validation, and corrupt-JSON fallback to defaults. Also includes `DOM_MAP`, `syncDom()`, `applyFromDom()`, and `bindDom()` — implemented now (ahead of Plan 03's UI wiring) since they were simple, headless-safe, and let Plan 03 focus purely on `index.html` markup.
- **`js/vfx.js`**: `VFX` global — `CAP=2048`, pre-allocated `pool` array of plain particle structs, `Int32Array` free-list (`free`/`freeTop`), `_alloc`/`_release`/`spawn`/`burst`/`emit`/`update`/`render`/`stats`. No Pixi reference at module scope; `_tryAttach()`/`_renderPixi()` are the only places that touch `window.PIXI`, and both are guarded to no-op headless. A trivial `PRESETS.dot` preset exists as a placeholder; Plan 02 fills in the combat set (hit/crit/death/etc.).
- **`js/entities.js`**: `burst(x,y,color,n,spd,life,r)` is now a one-line `VFX.burst(...)` wrapper — signature and every call site unchanged.
- **`js/game.js`**: `update()` calls `VFX.update(dt)` instead of the old push/filter loop over `GAME.particles`; `renderEffects(ctx)` calls `VFX.render(ctx)` in the same position in the draw order; the hub-state branch of `render()` also calls `VFX.render(ctx)` so any leftover sprites hide themselves outside a run. `GAME.particles` stays as an always-empty array for back-compat with `rooms.js` resets.
- **`index.html`**: `settings.js` loads right after `utils.js`; `vfx.js` loads right after `sprites.js`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Flood test parameters didn't actually saturate the pool**
- **Found during:** Task 1, RED/GREEN cycle for the flood smoke assertion
- **Issue:** The first draft used 50 particles/frame at life 0.2-0.4s; steady-state active count settled around ~1000, well under `CAP=2048`, so `VFX.stats().dropped` never went above 0 and the assertion failed.
- **Fix:** Raised the flood to 100 particles/frame at life 2s, which saturates the pool within ~20 frames and reliably produces `dropped > 0` across the full 600-frame flood.
- **Files modified:** test/smoke.js
- **Commit:** 468700d

No other deviations — Task 2 (routing burst()/game loop through VFX, script tags) matched the plan exactly.

## Self-Check

```
FOUND: js/settings.js
FOUND: js/vfx.js
FOUND: 468700d (feat(03-01): add SETTINGS global and pooled VFX particle simulation core)
FOUND: 23d449f (feat(03-01): route burst() and the game loop through VFX)
```

`node test/smoke.js` → **ALL SMOKE TESTS PASSED** (verified after both tasks).

Verification greps all pass:
- `grep -q "VFX.burst(" js/entities.js` — yes
- `grep -q "VFX.update(dt)" js/game.js` — yes
- `grep -q "VFX.render(ctx)" js/game.js` — yes
- `! grep -q "this.particles.filter" js/game.js` — confirmed absent
- `grep -q 'js/vfx.js' index.html` / `grep -q 'js/settings.js' index.html` — yes
- `grep -n "particles.push\|particles.filter" js/*.js` — no matches
- `git diff --stat` touches none of js/sprites.js, js/data.js, js/rooms.js, js/meta.js, js/ui.js

## Human Feel-Check (non-blocking, pending)

Not run in this session (headless agent, no browser available). Per the plan's output spec:
> Open index.html in a browser, start a run, and confirm hit/kill bursts still appear and now render ABOVE sprite entities.

**Status: pending human check.** The ctx-fallback path (used until an art atlas is loaded) was exercised in smoke and works; the Pixi sprite-rendering path (`_tryAttach`/`_renderPixi`) is implemented per spec (D-06) but has not been visually verified in a real browser since this session had no GPU/display.
