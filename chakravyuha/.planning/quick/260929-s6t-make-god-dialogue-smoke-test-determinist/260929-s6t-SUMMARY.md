---
quick_id: 260929-s6t
type: quick
subsystem: ui
tags: [boon-panel, dialogue-ui, amrit, smoke-test, determinism]

requires:
  - phase: 05.5-03
    provides: "UI.presentGod/clearGodPresence/typeGodDialogue/offerAmrit and the 'god presence on boon panel' smoke section"
provides:
  - "offerAmrit() and offerBoon()'s all-owned fallback branch now always call UI.clearGodPresence() before any early return"
affects: []

tech-stack:
  added: []
  patterns:
    - "Any UI.offerBoon/offerAmrit code path that can return before showing a panel must still call clearGodPresence() first, so a previously-presented god's portrait/dialogue never lingers on screen behind an unrelated reward banner"

key-files:
  created: []
  modified:
    - js/ui.js

key-decisions:
  - "Fixed the production bug (moved clearGodPresence() to the top of offerAmrit(), and added it to offerBoon()'s 'everything owned' mudra-fallback branch) rather than touching test/smoke.js — the test's assertion was correct and the plan explicitly forbade loosening it."

requirements-completed: []

duration: ~30m
completed: 2026-09-29
---

# Quick 260929-s6t: Make god-dialogue smoke test deterministic Summary

**`offerAmrit()` skipped `clearGodPresence()` whenever its "nothing left to refine" early-return path was taken (RNG-dependent on prior boon rarity rolls), leaving a previous god's dialogue/portrait visibly not-hidden — fixed by calling `clearGodPresence()` unconditionally at the top of that method and of `offerBoon()`'s matching "everything owned" fallback.**

## Root Cause

`test/smoke.js`'s "god presence on boon panel" section (05.5-03) failed once, non-reproducibly, with `"7: god-dialogue not hidden after offerAmrit"`. `UI.offerAmrit()` computed `upgradable = P.allBoons().filter(b => b.rarity < 2)` and, when that list was empty, returned immediately after a mudra-only reward banner — **before** its own `this.clearGodPresence()` call further down the function body. `GAME.player`'s only owned boon at that point in the smoke script comes from a card pick in step 4 (`GAME.player.addBoon(def, rarity)`), whose `rarity` is chosen by `UI.rollRarity()` — genuine `Math.random()`-driven, not seeded. Whenever that roll happened to land on the max rarity (2), the lone owned boon was already fully upgraded, `upgradable` was empty, and `offerAmrit()`'s early-return path left the previous (step 6 duo) god-dialogue panel visible instead of hidden. This matches the reported symptom exactly: one failure in a full run, never reproducible on immediate re-run, because it depended on a ~1-in-several-dozen probability chain of prior random rolls, not on wall-clock timing (the smoke harness's `setTimeout` is a manually-drained fake queue, so no real race was involved).

The same class of bug existed in `offerBoon()`'s "everything owned" branch (the `+60 MUDRA` fallback when literally no boons remain to offer at all): it also returned without clearing god presence.

## Fix

- `js/ui.js` `offerAmrit()`: moved `this.clearGodPresence()` to immediately after `const P = GAME.player;`, so it runs on every call, including the early "nothing left to refine" return.
- `js/ui.js` `offerBoon()`: added `this.clearGodPresence()` to the "everything owned" (`+60 MUDRA`) branch before its early return, for the same reason.
- `test/smoke.js` was **not** modified — the existing assertions were correct; the bug was in production code, not the test.

## Verification

- `node test/smoke.js` (full suite, no `SMOKE_FAST`): all sections green, including "god presence on boon panel" and "codex gods section".
- 30 consecutive repeats of `SMOKE_FAST=1 node test/smoke.js`, checked specifically for the "god presence on boon panel: all behavior assertions pass" line: **30/30 PASS, 0 FAIL**.
- One additional full (non-`SMOKE_FAST`) run after the repeats: green.

## Task Commits

1. **Fix `offerAmrit`/`offerBoon` fallback paths to always clear god presence** — `5195467` (fix)

## Files Modified

- `js/ui.js` — `offerBoon()` and `offerAmrit()`: `clearGodPresence()` now called unconditionally before any early return, not just on the "happy path" that shows a new boon panel.

## Decisions Made

- Root-caused via static reading of `offerAmrit`/`offerBoon`/`presentGod`/`clearGodPresence`/`typeGodDialogue` rather than bisection, since the smoke harness's `setTimeout` is a fake, manually-drained queue (confirmed in `test/smoke.js`'s sandbox setup) — ruling out a real timer race and pointing at state-dependent (RNG) control flow instead.
- Left `test/smoke.js` untouched per the plan's "never loosen the assertion" instruction — the fix is entirely in production code.

## Deviations from Plan

None — plan executed exactly as written. The root cause was a real production bug (not a test-only artifact), which the plan anticipated as the likely scenario and required fixing at the source.

## Issues Encountered

None.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: js/ui.js
- FOUND commit: 5195467
- `node test/smoke.js` → ALL SMOKE TESTS PASSED (both before-repeats and after-repeats runs).
- 30/30 `SMOKE_FAST=1 node test/smoke.js` repeats passed the "god presence on boon panel" assertion.

---
*Quick task: 260929-s6t*
*Completed: 2026-09-29*
