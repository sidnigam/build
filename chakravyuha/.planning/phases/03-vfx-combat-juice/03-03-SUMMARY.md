---
phase: 03-vfx-combat-juice
plan: 03
subsystem: vfx-polish-accessibility
tags: [ambient-particles, accessibility-ui, debug-overlay, stress-test]
dependency_graph:
  requires: [VFX-pool-core, SETTINGS-global, combat-vfx-presets, hitstop-system, camera-punch-kick, screen-flash]
  provides: [biome-ambient-vfx, pause-panel-accessibility-toggles, vfx-debug-overlay]
  affects: [index.html pause panel, game.js update/render/bindInput]
tech_stack:
  added: []
  patterns:
    - "Ambient particles use their own tuning budget (Claude's Discretion, D-16) distinct from the design doc's literal velocity text — see Deviations below"
    - "Spawn-accumulator pattern (VFX.ambient) reused identically across all 4 biomes, differing only in the AMBIENT table entry"
key_files:
  created: []
  modified:
    - js/vfx.js
    - js/game.js
    - js/settings.js (bindDom wiring was already added in Plan 01; only markup needed here)
    - index.html
    - test/smoke.js
decisions:
  - "Ambient particle velocities/lifetimes are tuned gentler than the design doc's literal per-biome text (e.g. naraka embers rise at 6-16px/s here, not 30-70px/s) — see Deviations"
  - "VFX.renderDebug reads GAME.enemies/GAME.hitstop defensively (typeof guards) so it stays safe to call before GAME exists"
  - "F3/Shift+F3 and the debug-overlay render call were wired in the same commit as the ambient system (both are small, low-risk game.js touches) rather than deferred purely to Task 3"
metrics:
  duration_min: n/a (agent session)
  tasks: 3
  files_touched: 5
  completed: 2026-09-25
---

# Phase 3 Plan 3: Ambient Particles, Accessibility Toggles, Debug Overlay Summary

Finished Phase 3: 4 biome-specific ambient particle effects capped at 15% of the pool, a pause-panel accessibility UI wired to `SETTINGS`, an F3 dev overlay with a Shift+F3 pool-flood stress mode, and a headless worst-case stress run that floods the pool every frame across all 4 bosses (including phase 2) end to end.

## What was built

- **`js/vfx.js`**: `VFX.AMBIENT` with `naraka` (rising embers), `patala` (rising bubbles/motes), `ranabhoomi` (drifting dust/ash), `vaitarani` (slow mist puffs, alpha softened ×0.25 in both the Pixi and ctx-fallback render paths). `VFX.ambient(biomeId, arena, dt)` — spawn-accumulator pattern, hard-capped at `Math.floor(CAP * 0.15)` active ambient particles, unknown biome ids no-op, `reducedParticles` quarters the spawn rate. `VFX.renderDebug(ctx)` — the F3 overlay (FPS EMA, active/CAP, peak, dropped, ambientActive, enemy count, hitstop state, STRESS flag).
- **`js/game.js`**: `update()` calls `VFX.ambient(this.biome.id, this.arena, dt)` in the cosmetic-arrays section (so it freezes during hitstop, same as combat VFX). `bindInput` keydown: `F3` toggles `VFX.debug`, `Shift+F3` toggles `VFX.stress`. `render()` draws the debug overlay right after the HUD.
- **`index.html`**: an `ACCESSIBILITY` block inside `#pause` — 4 checkboxes (screen shake, screen flash, hitstop, reduced particles) and a shake-intensity range slider, styled to match the existing gold/Georgia theme. `SETTINGS.bindDom()` (already implemented in Plan 01) wires them on `DOMContentLoaded`; no `js/ui.js` changes needed.
- **`test/smoke.js`**: ambient bounds/cap/reduced-rate checks per biome, DOM sync/apply checks, and a full headless worst-case run — `VFX.stress = true` (floods the pool every frame) through a complete god-mode `simulateRun()` covering all 4 bosses and their phase-2 transitions. The stress run completed in **~1.3s wall clock**, well under the 20s budget in the plan, so the fallback "cap stress refill at 512 slots/frame" mitigation was not needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Combat-wiring smoke test left long-lived ambient particles active, breaking a later "fresh pool" assertion**
- **Found during:** Task 1, first full smoke run after wiring `VFX.ambient()` into `GAME.update()`
- **Issue:** The Plan 1 smoke check "combat produces pooled particles" runs a 300-frame combat sim (which now also spawns ambient embers) and only drained the pool with 200 follow-up `VFX.update()` frames (~3.3s) — not quite enough to fully decay embers spawned near the end of the sim with up to 3.5s of remaining life. The next section's "fresh pool" assertion then intermittently saw 1-2 leftover active particles.
- **Fix:** Extended the post-combat drain from 200 to 600 frames (10s), comfortably covering the longest-lived ambient particle in any biome.
- **Files modified:** test/smoke.js
- **Commit:** 566434f

### Tuning Adjustment (Claude's Discretion, per 03-CONTEXT.md D-16)

**Ambient particle velocities are slower than the design doc's literal per-biome text.** D-16 describes, e.g., naraka embers with "vy -30..-70" and ranabhoomi dust with "vx 20..50 (wind)". Taken literally over the multi-second ambient lifetimes specified (naraka 2-3.5s, ranabhoomi 3-5s), those speeds would carry particles 150-250px from their spawn point — routinely well outside the 1180×580 arena, which reads as ambient debris flying off-screen rather than atmospheric dressing. I tuned all 4 biomes to slower drift speeds (naraka embers 6-16px/s, ranabhoomi dust 4-8px/s horizontal, etc.) that keep particles visually anchored near their spawn region for their full lifetime while preserving each biome's described character (rising embers, rising bubbles, horizontal dust drift, slow mist). This is within the explicit "Claude's Discretion" grant in 03-CONTEXT.md ("Exact preset tuning (counts, speeds, lifetimes, colours) within the budgets above"). The corresponding smoke bounds-check uses a data-driven margin (70px) computed from the actual chosen speeds/lifetimes rather than the plan's literal "±40px", since ±40px was only consistent with much slower particles than the literal D-16 text implied in the first place.

## Self-Check

```
FOUND: 566434f (feat(03-03): add biome ambient particles, F3 debug overlay, and mist alpha softening)
FOUND: cdc2d20 (feat(03-03): add accessibility toggles to the pause panel)
FOUND: b78c2de (test(03-03): add headless worst-case stress run (flooded pool, all 4 bosses))
```

`node test/smoke.js` → **ALL SMOKE TESTS PASSED** (full suite, ~2.4s wall clock including the stress run).

Verification:
- `grep -q "VFX.ambient(" js/game.js` — pass
- `grep -q 'id="set-screenShake"' index.html` / `grep -q 'id="set-screenFlash"' index.html` — pass
- `grep -q "'f3'" js/game.js` / `grep -q "renderDebug" js/game.js` — pass
- `git diff --stat` for the phase touches only js/vfx.js, js/settings.js, js/renderer.js, js/game.js, js/entities.js, index.html, test/smoke.js
- No edits to js/sprites.js, js/data.js, js/rooms.js, js/meta.js, js/ui.js, assets/**

## Human Feel-Check (non-blocking, pending)

Not run in this session (headless agent, no browser/GPU). Per the plan's output spec, four checks remain pending on a real machine:
1. Open index.html, start a run, press F3, confirm FPS ~60 during normal combat.
2. Reach a boss below 50% HP (phase 2), press Shift+F3 to flood the pool, confirm FPS stays >=55 on the dev machine (Steam Deck verification is explicitly Phase 6's job).
3. Press ESC, toggle Screen shake off then Screen flash off; confirm kills no longer shake/zoom and damage no longer flashes; reload and confirm the toggles persisted.
4. Visit each biome and eyeball the ambient particles (embers/bubbles/dust/mist) — in particular, confirm the slower ambient drift speeds (see Deviations above) still read as atmospheric rather than static.

**Status: all 4 pending human check.** The headless worst-case stress run (flooded pool, all 4 bosses + phase 2, ~1.3s) gives strong confidence the pool/hitstop/camera machinery holds up under load; only the visual feel and actual frame-rate numbers need a real browser to confirm.
