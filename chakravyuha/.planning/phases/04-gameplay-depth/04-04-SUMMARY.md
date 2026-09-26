---
phase: 04-gameplay-depth
plan: 04
subsystem: environmental-hazards
tags: [hazards, telegraphs, data-driven, biome-content]

# Dependency graph
requires:
  - phase: 04-gameplay-depth
    plan: 03
    provides: "ROOMS.pointBlocked/obstacleDist and the obstacle-aware arena that hazard placement (freePoint) builds on"
provides:
  - "DATA.HAZARDS (4 types) + biome.hazard ids"
  - "ROOMS.freePoint/spawnHazards (placement, combat-rooms only) + GAME.hazards reset every room"
  - "Player.hazardSlowT/hazardSlowF applied in moveSpeed()"
  - "GAME.updateHazards(dt)/renderHazards(ctx) with a telegraph-before-damage violation gate (GAME.hazardViolations)"
affects: [room-generation, combat-encounters, player-movement, smoke-test-harness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hazard damage invariant mirrors BOSS_TG: a local hurtP(h, amount, shown) helper logs to GAME.hazardViolations whenever shown < 0.6s, applied uniformly across all four hazard types"
    - "Hazards go fully dormant (state reset, markers cleared, no damage) whenever GAME.state !== 'combat' or a boss is present, checked once at the top of updateHazards"
    - "venomPool's 'always visible' telegraph is enforced by gating the first damage tick on h.age >= def.grace (room-time since the pool existed), not on player dwell time — matches D-17's 'always-visible pool' framing while still guaranteeing >=0.6s of visibility before any hit"

key-files:
  created: []
  modified:
    - js/data.js
    - js/rooms.js
    - js/entities.js
    - js/game.js
    - test/smoke.js

key-decisions:
  - "[Rule 1 - Bug] venomPool's first damage tick could fire on the very first frame the player stood in the pool (h.tickT starts at 0 per the plan's own spawnHazards spec), violating the telegraph-before-damage requirement. Fixed by gating the first (and only the first, since h.tickT resets to def.tick afterward) tick on h.age >= def.grace, so the pool must have existed for >=0.6s of room time before it can ever deal its first hit — consistent with venom pools being 'always visible from room start' rather than needing a warn phase."
  - "The hazard re-run check against a weak-player full run only asserts a clean completion (no errors, reaches 'dead' or 'victory'), not specifically 'dead': by the time this check runs (after an earlier meta-progression test block maxes out META singleton state, e.g. Sanjeevani/defiance), a 'weak player' scenario can legitimately survive to victory — that's correct meta-progression behavior, not a hazard regression, so asserting exact death would make the suite flaky for reasons unrelated to this plan."

requirements-completed: [GAME-04]

# Metrics
duration: ~65min
completed: 2026-09-26
---

# Phase 4 Plan 4: Environmental Hazards Summary

**Each biome gets one unique, telegraphed environmental hazard — Naraka fire vents, Patala venom pools, Ranabhoomi arrow volleys, Vaitarani river current — placed only in combat rooms, affecting both player and enemies, with a code-enforced telegraph-before-damage invariant (GAME.hazardViolations) mirroring the Phase 4-01 boss telegraph gate.**

## Performance

- **Duration:** ~65 min
- **Tasks:** 2
- **Files modified:** 5 (js/data.js, js/rooms.js, js/entities.js, js/game.js, test/smoke.js)

## Accomplishments
- `DATA.HAZARDS` ships all four types (`fireVent`, `venomPool`, `arrowVolley`, `riverCurrent`) with a `hazard` id on each `DATA.BIOMES` entry; every damaging type has a telegraph floor `>= 0.6s` (`warn` or `grace`).
- `ROOMS.freePoint`/`ROOMS.spawnHazards` place hazards clear of obstacles, the player spawn, and doors; wired into `enterRoom`'s combat-room branch only — sarovar/kubera/boss rooms never get hazards, and `GAME.hazards` resets every room.
- `Player.hazardSlowT`/`hazardSlowF` (cooled each frame) scale `moveSpeed()` without touching dash speed.
- `updateHazards(dt)`/`renderHazards(ctx)` (delimited, two call sites) simulate and draw all four hazards:
  - **fireVent**: dormant -> warn (pulsing telegraph) -> erupt (AoE burst, damages player + enemies once per eruption) -> dormant.
  - **venomPool**: always-visible, slows + tick-damages the player while inside (enemies slowed too, nagas immune), with a room-time grace floor before the first possible tick.
  - **arrowVolley**: periodic ground marker near the player telegraphs, then resolves as an AoE hit.
  - **riverCurrent**: constant directional push on player and enemies, with a telegraphed surge (brighten -> faster push).
- Every hazard's damage routes through a `hurtP()` helper that logs to `GAME.hazardViolations` if the telegraph shown was `< 0.6s` — asserted empty across all targeted per-type sims and full god-mode/weak-player runs.
- Hazards go fully dormant (cleared markers, no damage) the instant the room leaves active combat (room cleared or a boss room).

## Task Commits

1. **Task 1: Hazard data, placement in rooms, player slow hook + static/placement smoke** - `253fe9a` (feat)
2. **Task 2: Hazard simulation + drawing in delimited game.js functions, with telegraph/behavior smoke** - `52ef9ec` (feat)

## Files Created/Modified
- `js/data.js` — `DATA.HAZARDS` (4 types) + `hazard` field on each `DATA.BIOMES` entry.
- `js/rooms.js` — `freePoint(r, opts)`, `spawnHazards()`; `enterRoom` resets `G.hazards` every room and calls `spawnHazards()` only in the combat-room branch.
- `js/entities.js` — `Player.hazardSlowT`/`hazardSlowF` fields, cooled in `update()`, applied in `moveSpeed()`.
- `js/game.js` — `hazards: []` added to initial GAME state; `this.updateHazards(dt)` call after the enemy update loop; `this.renderHazards(ctx)` call after `renderObstacles`; delimited `updateHazards`/`renderHazards` methods implementing all four hazard types.
- `test/smoke.js` — hazard/biome mapping + telegraph-floor statics, per-biome placement (10x), non-combat-room emptiness, player slow scaling, per-type behavior checks (fireVent/venomPool/arrowVolley/riverCurrent) against a live neutralized combat room, dormancy-on-clear, the `hazardViolations` gate, and full god-mode/weak-player re-runs with hazards active.

## Decisions Made
- See `key-decisions` above (venomPool grace-floor bug fix, weak-player re-run assertion relaxed to "completes cleanly" given pre-existing meta-progression state pollution from an earlier test block).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] venomPool's first tick could deal undertelegraphed damage**
- **Found during:** Task 2, first run of the venomPool behavior check (global `hazardViolations` gate failed).
- **Issue:** Per the plan's own `spawnHazards` spec, a freshly placed venom pool starts with `tickT: 0`. If a player stands in the pool on the very first simulated frame after room entry, the first tick would fire with `shown = h.age` close to `0` (well under the required `0.6s` telegraph floor), violating the "every damaging hazard shows a visible warning >= 0.6s before it can deal damage" truth.
- **Fix:** Gated the first (and only the first — `tickT` is reset to `def.tick` afterward) tick on `h.age >= def.grace` (`0.6s`), so a venom pool must have existed for at least its grace period of room time before it can ever deal its first hit. This matches D-17's framing of venom pools as "always visible from room start" — in real gameplay the player needs meaningfully more than 0.6s to walk from spawn to any hazard, so this doesn't change felt difficulty, it just removes a frame-1 edge case exposed by the synchronized test setup.
- **Files modified:** js/game.js
- **Verification:** `node test/smoke.js` run 15x consecutively, all green with no flakes.
- **Committed in:** `52ef9ec` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (bug fix enforcing the plan's own telegraph invariant; no scope creep)
**Impact on plan:** None — the fix makes the implementation match the plan's stated must-have truth that a synchronized smoke test happened to expose immediately.

## Issues Encountered
- A pre-existing (not hazard-related) source of test flakiness was discovered and worked around: re-running `simulateRun({ weakPlayer: true })` late in `test/smoke.js` (after an earlier meta-progression test block maxes out the process-wide `META` singleton) can legitimately let the "weak" player survive to victory instead of dying, since defiance/HP bonuses now persist across simulated runs within the same smoke process. The hazard re-run check was written to assert "completes cleanly, reaches an end state" rather than a specific end state, to avoid coupling hazard verification to unrelated meta-progression test ordering.

## Next Phase Readiness
- Phase 4 (04-01..04-04) is now complete: boss telegraphs/phase-2 movesets, duo boons, room layout templates, and environmental hazards are all smoke-verified together in the same `test/smoke.js` run.
- Non-blocking playtest notes carried over from 04-CONTEXT.md and this plan: venom tick feel (a `takeDamage` flash every second may read as noisy — consider a quieter tick later), arrow volley frequency against Ranabhoomi's already-dense waves, river surge interacting with The Fords' pits (enemies/player pushed by the current can be shoved into pits, which is allowed — pits push out via `clampToArena` but this may read as unfair without playtesting).

---
*Phase: 04-gameplay-depth*
*Completed: 2026-09-26*
