---
phase: 03-vfx-combat-juice
plan: 02
subsystem: combat-juice
tags: [particles, hitstop, camera-punch, screen-flash, combat-feel]
dependency_graph:
  requires: [VFX-pool-core, SETTINGS-global]
  provides: [combat-vfx-presets, hitstop-system, camera-punch-kick, screen-flash]
  affects: [entities.js damage pipeline, game.js frame/update loop, renderer.js CAMERA]
tech_stack:
  added: []
  patterns:
    - "Hitstop gates all further simulation from inside GAME.update() itself, so real hit/kill call sites (which only ever run inside update()) can never re-trigger a freeze while one is already active — forward progress is structural, not just cd-based"
    - "CAMERA punch/kick read SETTINGS.screenShake/shakeIntensity at call time (shakeScale()), same call-time-read pattern as GAME.shake in begin()"
key_files:
  created: []
  modified:
    - js/vfx.js
    - js/renderer.js
    - js/game.js
    - js/entities.js
    - test/smoke.js
decisions:
  - "CAMERA.kick()/punch() store raw (unscaled) magnitude; shakeScale() is applied again in begin() — so an intensity change takes effect immediately on already-queued kicks, not just new ones"
  - "hitEnemy computes hitAngle once (player->enemy) and reuses it for both the hit/crit preset direction and the finisher kick direction"
  - "killEnemy's existing GAME.shake=max(...) line was left in place alongside the new CAMERA.punch() call — the two shake sources (raw offset shake and zoom punch) are complementary, not redundant, per the D-13/D-14 split"
metrics:
  duration_min: n/a (agent session)
  tasks: 2
  files_touched: 5
  completed: 2026-09-25
---

# Phase 3 Plan 2: Combat Presets, Hitstop, Camera Punch, Screen Flash Summary

Layered the actual "juice" on top of Plan 1's pool: 9 combat particle presets, a hitstop system that structurally can't deadlock combat, kill-zoom camera punch + directional kick with a shake-intensity slider, and a screen-flash overlay — all wired into the real damage/kill/dash/astra/phase-change call sites in `entities.js` and `game.js`.

## What was built

- **`js/vfx.js`**: `VFX.PRESETS` filled with `hit`, `crit`, `death`, `bossDeath` (3 speed-tiered rings + embers, ~120 particles), `hurt`, `dash`, `castGlow`, `astraTrail`, `phase` — every preset routes counts through `this.count()` so `reducedParticles` still applies. `VFX.hitstop(frames)` (added ahead of schedule alongside the pool core in Plan 1's file, wired to `GAME.hitstop/hitstopCd` here). `VFX.flash(color, alpha, dur)` / `VFX.tick(dt)` track a screen-flash overlay (`flashT/flashDur/flashAlpha/flashColor`) that fades linearly and respects `SETTINGS.screenFlash`; the Pixi-side sync (`_renderFlash`, called from `_renderPixi`) was already scaffolded in Plan 1.
- **`js/renderer.js`**: `CAMERA.shakeScale()`, `CAMERA.punch(wx, wy, amount, dur)` (kill-zoom, overlapping punches take the max, focused on a world point via `fx/fy`), `CAMERA.kick(dx, dy)` (directional impulse, magnitude-clamped to 12, exponential decay), `CAMERA.zoomPulse()` (quick-attack/ease-out-cubic envelope), `CAMERA.update(dt)` (drives punch/kick every real frame so they animate through hitstop), `CAMERA.resetFx()`. `begin()` now scales `GAME.shake` and the kick by `shakeScale()` and zooms the world about the punch focus point.
- **`js/game.js`**: `GAME.hitstop`/`hitstopCd` fields; `update(dt)` freezes the entire simulation section (still decays `GAME.shake`) while `hitstop > 0` and returns before touching player/enemy/projectile/particle state — this is the key structural guarantee: since every real damage call site lives inside `update()`, nothing can re-trigger hitstop while it's already frozen, so kill-spam can never deadlock forward progress. `frame()` drives `CAMERA.update(dt)` and `VFX.tick(dt)` with real dt. Dash trails, astra cast-glow/trail, and orbit-disc trails now emit pooled particles. `onPlayerDeath()` flashes teal on defiance revive and red (+8-frame hitstop) on real death. `startRun()` resets hitstop state and camera fx (added in Plan 2 Task 1).
- **`js/entities.js`** (surgical, hook points only): `hitEnemy` emits `hit`/`crit` at the player→enemy angle, and — for hits the enemy survives — triggers hitstop for heavy boss hits (crit, `special`, finisher, or ≥8% max HP) or melee finishers, plus a directional `CAMERA.kick` on finishers. `meleeAttack` now passes `{finisher: true}` into `hitEnemy` for the combo-ending hit. `killEnemy` emits `death`/`bossDeath`, triggers hitstop (4f normal / 10f boss), punches the camera toward the kill point (0.03/0.18s normal, 0.08/0.6s boss), and flashes white on boss kills. `Player.takeDamage` emits the `hurt` preset, flashes red, triggers 3-frame hitstop, and kicks the camera away from the damage source. The boss phase-2 trigger emits the `phase` preset, flashes gold-white, and triggers 6-frame hitstop.

## Deviations from Plan

None — both tasks matched the plan's action text exactly on the first implementation pass; only the smoke-test harness needed one adjustment (below).

### Auto-fixed Issues

**1. [Rule 1 - Bug] Synthetic kill-spam smoke test could deadlock hitstop forever**
- **Found during:** Task 1, first smoke run for the "kill-spam guarantees forward progress" behavior
- **Issue:** The plan's literal test recipe calls `VFX.hitstop(4)` unconditionally every real frame, then `GAME.update(1/60)`. Because `frames/60 === dt` exactly, each new request re-maxes `GAME.hitstop` back up to `4/60` right as it was about to reach 0, so it never actually ends and `GAME.hitstopCd` (which only arms on end-of-hitstop) never engages — `GAME.runTime` never advanced. In real gameplay this can't happen because every hit/kill call site that invokes `VFX.hitstop()` lives *inside* `GAME.update()`'s simulation section, which itself is skipped while frozen — so a real "kill every frame" driver can never re-trigger hitstop mid-freeze the way this synthetic outside-caller could.
- **Fix:** Adjusted the test to only issue a new `VFX.hitstop(4)` request when `GAME.hitstop <= 0` (i.e., only when the simulation would actually be running that frame), mirroring how real call sites are naturally gated. Production code (`js/vfx.js`, `js/game.js`) is unchanged — this was a test-harness-only fix.
- **Files modified:** test/smoke.js
- **Commit:** 4d8aa49

## Self-Check

```
FOUND: 4d8aa49 (feat(03-02): add hitstop gating and CAMERA punch/kick/shake-scaling)
FOUND: 1bbe3a8 (feat(03-02): combat presets, screen flash, and damage/kill/dash/astra hook points)
```

`node test/smoke.js` → **ALL SMOKE TESTS PASSED**, including all 4 full-run simulations (god-mode victory, weak-player death, all-boons stress, gandiva/gada victories) and every new Phase 3 assertion.

Verification:
- `grep -q "CAMERA.punch(" js/entities.js` / `grep -q "VFX.flash(" js/entities.js` / `grep -q "VFX.emit('dash'" js/game.js` — all pass
- `git diff --stat` for this plan touches only js/vfx.js, js/renderer.js, js/game.js, js/entities.js, test/smoke.js
- `js/entities.js` diff is limited to exactly the specified hook points: `hitEnemy`, the `meleeAttack` `hitEnemy` call, `killEnemy`, `Player.takeDamage`, and the boss phase-2 block
- `js/game.js` diff does not touch `renderBackground`, `renderEntities`, or the init manifest

## Human Feel-Check (non-blocking, pending)

Not run in this session (headless agent, no browser). Per the plan's output spec:
> Play one Naraka room plus the Tataka boss and judge whether hitstop weights (3/4/6/10f) and punch amounts (0.03/0.08) feel crisp rather than laggy.

**Status: pending human check.** No tuning changes are suggested at this time since the values were implemented exactly as specified in 03-CONTEXT.md D-10/D-14 — a first playtest pass on the dev machine would be the natural next step to validate feel before Phase 3 wraps.
