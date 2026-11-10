---
phase: 04-gameplay-depth
plan: 02
subsystem: boons-progression
tags: [boons, duo-synergies, data-driven, ui-cards]

# Dependency graph
requires:
  - phase: 04-gameplay-depth
    plan: 01
    provides: "Boss.hurtPlayer/shoot/strike helpers untouched by this plan; no dependency, but confirms shared entities.js state at time of edit"
provides:
  - "DATA.DUO_BOONS (6 named two-god synergy boons) + DATA.findBoon(id) lookup across both boon arrays"
  - "Player.eligibleDuos()/duoOfferFor(godId) gating + 6 working duo effect hooks in the combat pipeline"
  - "UI.offerBoon(forceGod) duo card placement with two-color styling"
affects: [combat-pipeline, boon-picker-ui, smoke-test-harness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DATA.findBoon(id) as the single lookup point across DATA.BOONS + DATA.DUO_BOONS (Player.val uses it exclusively)"
    - "Duo gating: eligibleDuos() = unowned duos where every god in d.gods has >=1 owned boon from d.req[god]"
    - "Duo effects hook into existing pipeline entry points only: hitEnemy (src-gated), takeDamage (post-damage, alive-gated), tryDash (post-dash-start), meleeAttack (knockback multiplier) — no new entry points added"

key-files:
  created: []
  modified:
    - js/data.js
    - js/entities.js
    - js/ui.js
    - test/smoke.js

key-decisions:
  - "META.lastWeapon is left set to 'gandiva' (bow) by an earlier VFX stress block in smoke.js; the new duo stress test explicitly resets it to 'khanda' before GAME.startRun() so P.meleeAttack() (called directly, bypassing the bow/melee branch in Player.update) doesn't throw on w.combo being undefined for a bow weapon."
  - "duo_khandava's 'ignite on chain hit' and 'bonus damage vs already-burning' are implemented as two separate hooks around hitEnemy's existing crit/damage-application boundary, keeping the pre-existing on-hit boon block untouched."
  - "duo_kapidhvaja's AoE reuses hitEnemy(..., 'zone') (indirect source, no recursion) exactly like the existing kri_attack-style patterns, so no new no-recursion guard was needed."

requirements-completed: [GAME-01, GAME-02]

# Metrics
duration: ~50min
completed: 2026-09-26
---

# Phase 4 Plan 2: Boons Audit + Duo Boons Summary

**Six named Duo Boons (Pavanaputra, Khandava Firestorm, Yogamaya's Veil, Marut Gana, Jwalamukhi, Kapidhvaja) gated by two-god prerequisites, surfaced as a specially styled first card in the boon picker, each with a working synergy effect wired into the existing damage/dash/hit pipeline.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3
- **Files modified:** 4 (js/data.js, js/entities.js, js/ui.js, test/smoke.js)

## Accomplishments
- GAME-01 locked: smoke now asserts `DATA.BOONS.length >= 24` and `>= 4` boons per god (27 total confirmed, no new single-god boons added per D-01).
- GAME-02: `DATA.DUO_BOONS` (6 entries) added with `req` lists per god, `DATA.findBoon(id)` resolving across both boon arrays; `Player.val` switched to `DATA.findBoon`.
- `Player.eligibleDuos()`/`duoOfferFor(godId)` implement the "own >=1 req boon from each god" gate (D-03).
- All six duo effects implemented using only existing helpers (`hitEnemy`, `applyBurn`, `chainLightning`, `GAME.rings`, `GAME.bolts`, `burst()`):
  - **Pavanaputra** (Hanuman+Vayu): post-dash 1s window of +dmg and 2x knockback on attacks.
  - **Khandava Firestorm** (Agni+Indra): chain-lightning hits ignite foes and deal +50% to already-burning foes.
  - **Yogamaya's Veil** (Krishna+Durga): extended i-frames + Maya-marks nearby foes when struck.
  - **Marut Gana** (Indra+Vayu): each dash looses chain lightning at the nearest foe.
  - **Jwalamukhi** (Agni+Durga): struck -> ignites nearby foes.
  - **Kapidhvaja** (Hanuman+Krishna): every 6th attack hit raises a Monkey Banner AoE + Maya mark.
- `UI.offerBoon(forceGod)` places an eligible, unowned duo as the first card, two-god-color styled (`duo` class, inline gradient/border/box-shadow, `DUO · GodA + GodB` header), replacing one regular card when the pool is full; picking it grants the duo like any other boon.
- Smoke coverage added: boon count lock, duo data integrity (unique ids, valid gods/req lists, desc strings at every rarity, findBoon resolution), eligibility/offer-targeting/post-pick-exclusion, targeted per-effect checks against a live test enemy, a 4000-frame stress run with every boon + every duo active simultaneously, and duo-card offer/negative-case checks in the picker.

## Task Commits

1. **Task 1: DATA.DUO_BOONS + lookup + eligibility, with count/integrity/eligibility smoke** - `dbbf340` (feat)
2. **Task 2: Duo synergy effects in the combat pipeline + targeted and stress smoke** - `37046e6` (feat)
3. **Task 3: Duo offer placement and special card treatment in the boon picker** - `9615593` (feat)

## Files Created/Modified
- `js/data.js` — `DATA.DUO_BOONS` (6 entries) + `DATA.findBoon(id)`.
- `js/entities.js` — `Player.val` uses `DATA.findBoon`; new fields `pavanaT`/`kapiHits`; `eligibleDuos()`/`duoOfferFor(godId)`; duo effect hooks in `tryDash`, `meleeAttack`, `hitEnemy`, `takeDamage`.
- `js/ui.js` — `offerBoon(forceGod)` duo-card unshift + duo-specific card styling/markup; no other function touched.
- `test/smoke.js` — boon count lock, duo integrity, eligibility/offer-targeting, six targeted duo-effect checks, duo stress run, duo-card offer + negative-case checks (all appended, before the final summary line).

## Decisions Made
- See `key-decisions` above (lastWeapon reset for the melee-only stress test, khandava hook placement, kapidhvaja zone-source reuse).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Duo stress test threw on `w.combo` being undefined**
- **Found during:** Task 2, first run of the 4000-frame all-boons-all-duos stress block.
- **Issue:** An earlier, pre-existing smoke block (VFX stress, line ~888) sets `META.lastWeapon = 'gandiva'` (a bow) and never resets it. The new duo stress test starts a fresh run afterward and calls `P.meleeAttack()` directly (as the pre-existing "all 25+ boons" stress block also does), which assumes a melee weapon with a `combo` array; bow weapons have no `combo`, causing a `TypeError` on `w.combo.length`.
- **Fix:** Set `META.lastWeapon = 'khanda'` at the start of the new duo stress block before `GAME.startRun()`.
- **Files modified:** test/smoke.js
- **Verification:** `node test/smoke.js` run 4x consecutively, all green with no flakes.
- **Committed in:** `37046e6` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (blocking issue in the test harness's cross-block state, not production code)
**Impact on plan:** No scope creep; the fix only affects the new test block's own setup and does not touch any other smoke assertion.

## Issues Encountered
None beyond the deviation above.

## Next Phase Readiness
- `DATA.findBoon`, `Player.eligibleDuos()/duoOfferFor()`, and `UI.offerBoon(forceGod)` are stable public surfaces; 04-03/04-04 (room layouts/hazards) do not touch boons or the boon picker, so no conflict expected.
- Non-blocking playtest note carried over from 04-CONTEXT.md: verify duo power budget (Pavanaputra +60% post-dash dmg, Kapidhvaja 30 AoE per 6 hits) and duo card readability in the real UI (inline styles only, no CSS file touched).

---
*Phase: 04-gameplay-depth*
*Completed: 2026-09-26*
