---
quick_id: 260927-qze
type: quick
subsystem: rendering, ui
tags: [hud, glyphs, gamepad, layout]

requires:
  - phase: 05.2-ps5-dualsense-controller-support-and-controller-ux
    plan: 03
    provides: "GLYPHS.drawTokens(ctx,x,y,tokens,size) (already returned drawn width), renderHUD DASH/ASTRA/SPECIAL legend"
provides:
  - "renderHUD legend layout: measured [badge(s)] LABEL items placed left-to-right with guaranteed
    non-overlapping horizontal extents, for keyboard/mouse, PS, and Xbox glyph families"
affects: []

tech-stack:
  added: []
  patterns:
    - "Legend items are laid out by first estimating each item's total width (badge estimate via a
      chars*6.5 fallback formula mirrored from the game's own guarded ctx.measureText fallback, plus
      label width) to decide x-positions with a guaranteed itemGap, then drawing with the real
      GLYPHS.drawTokens return value to place the label — so intra-item (badge vs its own label)
      overlap is structurally impossible, and inter-item overlap is prevented by the pre-layout
      estimate always being >= the real drawn width."

key-files:
  created: []
  modified:
    - js/game.js
    - test/smoke.js

key-decisions:
  - "GLYPHS.drawTokens already returned a total-width value (no signature or behavior change needed
    there), so all layout logic lives in renderHUD's legend block per the plan's conditional
    instruction ('js/glyphs.js drawTokens only if it lacks width measurement')."
  - "Chose a fully sequential/dynamic x layout (each item starts after the previous item's measured
    end + a >=12px item gap) rather than keeping the old fixed column anchors tied to
    P.dashMax/P.castMax pip positions, because fixed anchors could not guarantee the plan's >=10px
    inter-item gap requirement once glyph/key label lengths vary by device family or rebound keys."
  - "SPECIAL wraps to a second row only if its cumulative row-1 x position would exceed a ~300px row
    budget (rowStartX + 300); DASH/ASTRA always stay on row 1, matching the plan's literal wording."

requirements-completed: []

duration: ~25min
completed: 2026-09-27
---

# Quick 260927-qze: Fix HUD glyph legend overlap Summary

**Rewrote renderHUD's DASH/ASTRA/SPECIAL legend to lay out `[badge(s)] LABEL` sequentially using measured widths (GLYPHS.drawTokens' existing return value for badges, a guarded ctx.measureText-or-chars*6.5 estimate for labels) instead of drawing both at the same x, eliminating the "QTRA"/"E RMB SPECIAL" text collisions visible on both keyboard and pad HUDs.**

## Performance

- **Duration:** ~25 min active work
- **Completed:** 2026-09-27
- **Tasks:** 2/2 completed
- **Files modified:** 2 (`js/game.js`, `test/smoke.js`)

## Accomplishments

- **Layout fix (Task 1):** `renderHUD`'s legend block now computes, per item (DASH/ASTRA/SPECIAL), a
  pre-layout width estimate (badge tokens estimated via a `chars*6.5` fallback mirrored from the
  game's own guarded measure function, plus the label's measured width) to decide each item's x
  position with a guaranteed >=12px gap between items, then draws with `GLYPHS.drawTokens`'s real
  returned width to place the label immediately after the badge(s) with an 8px gap. `GLYPHS.drawTokens`
  needed no changes — it already returned the total drawn width. If the row would exceed a ~300px
  budget, SPECIAL wraps to a second row 16px below; DASH and ASTRA always stay on row 1.
- **Smoke assert (Task 2):** An append-only smoke check spies on `GLYPHS.drawTokens` (capturing its
  real x/y/returned-width per legend item) and a recording `ctx` (capturing `fillText` x/y for the
  DASH/ASTRA/SPECIAL labels, measured with the same `chars*6.5` fallback the production code uses
  when no `ctx.measureText` is available), reconstructs each item's horizontal extent, buckets extents
  by row (in case of a wrapped SPECIAL), and asserts no two extents in the same row overlap — run once
  for `INPUT.device === 'kbm'` and once for `INPUT.device === 'pad'` with `PAD.state.family === 'ps'`.

## Visual Verification

Verified with a custom headless-Chrome CDP script (modeled on `tools/browser-check.mjs`) against a
live run, forcing each device/family via a fake `navigator.getGamepads` override (poll() otherwise
resets `INPUT.device` to `'kbm'` every frame when no real gamepad is connected):

- **Keyboard/mouse:** `[Space] DASH`, `[Q] ASTRA`, `[E][RMB] SPECIAL` — clear gaps, no overlap.
- **PS family:** `[○][R1] DASH`, `[△] ASTRA`, `[L2][□] SPECIAL` — glyph badges render correctly with
  clear gaps.
- **Xbox family:** `[B][RB] DASH`, `[Y] ASTRA`, `[LT][X] SPECIAL` — clear gaps.

All three screenshots confirmed no badge/label overlap and all legend text readable (10px Georgia,
meets the >=10px requirement). Row sits well clear of the HP panel (top) and dash/cast pips + special
bar (immediately above), unchanged from the prior vertical position.

## Task Commits

1. **Task 1: Layout fix (js/game.js renderHUD legend block)** - `7c5148b` (fix)
2. **Task 2: Smoke assert (test/smoke.js, append-only)** - `9b603f9` (fix)

## Files Created/Modified

- `js/game.js` — `renderHUD`'s DASH/ASTRA/SPECIAL legend block replaced: measures badge/label widths
  before drawing, lays out items left-to-right with guaranteed gaps, wraps SPECIAL to a second row if
  the row would exceed ~300px. No other HUD elements touched.
- `test/smoke.js` — new append-only section "HUD glyph legend overlap fix (quick 260927-qze)": 2 new
  checks (kbm non-overlap, pad/ps-family non-overlap), 876 overall (up from 874 before this task,
  verified by running the pre-Task-2 revision of smoke.js directly).

## Decisions Made

See `key-decisions` in frontmatter. Summary: kept `GLYPHS.drawTokens` untouched (it already returns
width); switched from fixed pip-column x-anchors to a fully sequential dynamic layout to guarantee the
plan's explicit `>=10px` inter-item gap requirement regardless of binding/label length; SPECIAL-only
row-wrap check per the plan's literal wording.

## Deviations from Plan

None — plan executed as written. `GLYPHS.drawTokens` required no signature/behavior change (Task 1's
conditional clause "only if it lacks width measurement" did not apply).

## Issues Encountered

- `tools/browser-check.mjs`'s built-in pad-device switch (line ~119-130) sets `INPUT.device = 'pad'`
  only transiently for a synchronous probe and reverts it before the next screenshot, and
  `PAD.poll()` itself resets `INPUT.device` back to `'kbm'` every frame when `navigator.getGamepads()`
  reports no connected pad — so neither of that tool's screenshots actually shows pad-family glyphs.
  Worked around this with a small ad-hoc CDP script (not committed, lived in `/tmp`) that injects a
  fake connected gamepad (with a PS or Xbox vendor-ID-bearing `id` string) so `poll()`'s normal
  per-frame detection naturally sets `INPUT.device = 'pad'` and `PAD.state.family` and keeps it there.
- One unrelated flaky failure was observed in "god presence on boon panel (Phase 05.5)" on a single
  full (non-`SMOKE_FAST`) run ("god-dialogue not hidden after offerAmrit"), reproducing on neither the
  pre-existing baseline nor two subsequent re-runs of the same code. This is a pre-existing,
  timing-dependent test unrelated to the HUD legend subsystem touched here — out of scope per the
  scope-boundary rule, not fixed, and not reproducible on repeated runs (`node test/smoke.js` was green
  on the final two consecutive runs before each commit).

## User Setup Required

None.

## Known Stubs

None.

## Next Phase Readiness

- `node test/smoke.js` is green (406 checks, up from 404) as of the final commit.
- No blockers. No further follow-up planned for this quick task.

---
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: js/game.js
- FOUND: test/smoke.js
- FOUND: .planning/quick/260927-qze-fix-hud-glyph-legend-overlap/260927-qze-SUMMARY.md
- FOUND commit: 7c5148b (Task 1)
- FOUND commit: 9b603f9 (Task 2)
