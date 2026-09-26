---
phase: 04-gameplay-depth
plan: 01
subsystem: combat-ai
tags: [boss-ai, telegraphs, data-driven, phase-transitions]

# Dependency graph
requires:
  - phase: 03-vfx-combat-juice
    provides: burst()/VFX.hitstop()/GAME.shake/UI.banner combat-feedback helpers reused for all new telegraphs
provides:
  - "BOSS_TG telegraph invariant (armed-checked hurtPlayer/shoot/strike, zero-violation smoke gate)"
  - "BOSS_MOVE_DEFS + BOSS_MOVESETS data-driven boss move tables (replacing inline pickMove tables)"
  - "8 phase-2-only signature attacks (2 per boss) with deterministic openers after a phaseShift beat"
  - "cone/ring telegraph shapes + world-anchored marks (line/circle/band/ringMark) in Boss.draw"
affects: [combat-ai, boss-encounters, smoke-test-harness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Boss move lifecycle: startMove(id) -> (optional <id>Wind telegraph) -> arm() -> active state -> rest/pickMove, with all damage routed through this.strike()/hurtPlayer()/shoot()"
    - "BOSS_MOVE_DEFS + BOSS_MOVESETS[bossId][phase] as pure data, merged per-move via Boss.moveDef() with phase-table overrides"
    - "Phase-2 opener flagged {opener:true} in the moveset table, consumed once via this.pendingOpener"

key-files:
  created: []
  modified:
    - js/entities.js
    - test/smoke.js

key-decisions:
  - "Restricted the smoke harness's 'every recorded hit has armed truthy' assertion to direct/synchronous damage moves (swipe/charge/slam/noose) — ranged moves (radial/spiral/lamps/leap) deal damage via shoot()-spawned projectiles resolved several frames later by the shared enemy-projectile loop, after the boss has legitimately moved to rest/its next move; the real invariant (armed-check at fire time) is already covered by the zero BOSS_TG.violations gate."
  - "Phase-2 tables define both new moves and phase-1 holdovers explicitly (not a generic merge) so opener flags and per-boss tuning stay readable in one place."
  - "danda's 300deg cone + 60deg safe wedge implemented as {type:'cone', arc: TAU-1.05} — the existing cone renderer needed no special-casing for a near-full-circle danger zone."

requirements-completed: [GAME-05, GAME-06]

# Metrics
duration: ~45min
completed: 2026-09-25
---

# Phase 4 Plan 1: Boss Telegraphs & Phase-2 Movesets Summary

**Data-driven BOSS_MOVE_DEFS/BOSS_MOVESETS with a code-enforced armed-damage telegraph invariant (BOSS_TG.violations), an untelegraphed chase-contact replaced by a telegraphed cone swipe, and 8 new phase-2-only signature attacks (2 per boss) opening deterministically after a phaseShift beat.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3
- **Files modified:** 2 (js/entities.js, test/smoke.js)

## Accomplishments
- Every damaging boss action (hurtPlayer/shoot/strike) is now gated by an `armed` check; any bypass is recorded in `BOSS_TG.violations`, asserted empty across every full run and every per-move harness invocation (zero violations, confirmed stable across repeated runs).
- Boss contact damage (`touchAttack`) is gone from `class Boss`; `chase` now transitions into a telegraphed `swipe` cone attack when in reach.
- `spiral`, `noose`, `summon`, and `teleport` all gained proper `<id>Wind` telegraph states (previously untelegraphed or only partially telegraphed).
- 50% HP now triggers a `phaseShift` beat (1.2s, banner, shake, clears active telegraphs/dangerZones/noose) that deterministically opens with the boss's phase-2 signature move (`leap`/`lamps`/`quake`/`ledger`) before falling back to weighted-random phase-2 picks.
- 8 new phase-2 moves shipped: `leap`+`maw` (Tataka), `lamps`+`crossBeams` (Ahiravana), `quake`+`roar` (Kumbhakarna), `ledger`+`danda` (Yama) — all using judgment/ledger vocabulary for Yama, no new hostile framing (D-13).
- `Boss.draw` gained `cone`/`ring` telegraph shapes and world-anchored `marks` (line/circle/band/ringMark) for multi-marker and off-center attacks.

## Task Commits

1. **Task 1: Data-driven boss movesets with telegraph invariant** - `1af8167` (feat)
2. **Task 2: Smoke harness — telegraph-before-damage + global violation gate** - `4b76727` (test)
3. **Task 3: 8 phase-2 signature attacks + deterministic openers** - `f5564d5` (feat)

_No plan-metadata commit yet — this SUMMARY is committed together with the phase's final docs commit per the execution instructions for this run._

## Files Created/Modified
- `js/entities.js` — `BOSS_TG`, `BOSS_MOVE_DEFS`, `BOSS_MOVESETS`, `PHASE2_TITLES` module consts; `Boss.moveDef/strike/hurtPlayer/shoot/startMove/arm/initWind/updateWindTelegraph/pickMove` methods; retrofitted `update()` state machine; extended `draw()` telegraph/marks rendering.
- `test/smoke.js` — static Boss-source check, moveset data-integrity check, per-move telegraph harness (`__bossMove`) covering all phase-1/phase-2 moves for all 4 bosses, phase-2 `>=2-new-attacks` static check, phase-transition harness (`__bossPhaseTransition`), and a global `BOSS_TG.violations` gate.

## Decisions Made
- See `key-decisions` above (harness assertion scope, explicit phase-2 tables, cone-arc reuse for danda's safe wedge).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Smoke harness's "every hit armed" check was a false positive for ranged moves**
- **Found during:** Task 2, first run of the per-move harness (`radial`/`spiral` moves failed intermittently)
- **Issue:** The harness wraps `P.takeDamage` and records whether `B.armed` was truthy at the moment of the hit. For `radial`/`spiral`, damage is delivered by `enemyShot()`-spawned projectiles that travel and collide with the player several frames after the boss has legitimately transitioned to `rest` (armed correctly cleared) — this produced flaky "unarmed hit recorded" failures despite the actual telegraph invariant (armed-check at the moment `shoot()` is called) being fully satisfied (`BOSS_TG.violations` stayed at 0 throughout).
- **Fix:** Restricted the "every hit armed" assertion to direct/synchronous damage moves (`swipe`, `charge`, `slam`, `noose`) where `hurtPlayer()` is called at the exact moment of contact. Ranged moves are still fully covered by the `newViolations.length === 0`, `wind >= def.wind`, and `dmgCalls > 0` checks.
- **Files modified:** test/smoke.js
- **Verification:** `node test/smoke.js` run 5× consecutively, all green with no flakes.
- **Committed in:** `4b76727` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix in the test harness itself, not production code)
**Impact on plan:** No scope creep; the production telegraph invariant is unchanged and fully verified via the authoritative `BOSS_TG.violations` gate.

## Issues Encountered
None beyond the harness deviation above.

## Next Phase Readiness
- `Boss.hurtPlayer`/`Boss.shoot`/`Boss.strike` are the only sanctioned damage entry points for future boss work (04-03/04-04 hazards do not touch bosses, so no conflict expected).
- `BOSS_MOVESETS`/`BOSS_MOVE_DEFS` are ready for future balance tuning without touching the state machine.
- Non-blocking playtest note carried over from 04-CONTEXT.md: verify the phaseShift beat + opener timing reads as a dramatic pause rather than a cheap follow-up, and check swipe cadence (~1.2s cooldown in reach) against boss-hugging safety now that contact damage is gone.

---
*Phase: 04-gameplay-depth*
*Completed: 2026-09-25*
