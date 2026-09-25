---
phase: 05-desktop-wrapper-gamepad-settings
plan: 02
subsystem: input
tags: [gamepad, web-gamepad-api, input-abstraction, keybindings, steam-deck]

requires:
  - phase: 05-desktop-wrapper-gamepad-settings
    plan: "01"
    provides: index.html script-tag append pattern, test/smoke.js structure (sequenced to avoid conflicting concurrent edits to shared files)
provides:
  - PAD global (js/gamepad.js) — pure applyDeadzone/mapGamepad/digitalMoveVector + per-frame poll()
  - INPUT.ax/ay/device/bindings on the shared INPUT object (js/game.js)
  - Rebindable keyboard action dispatch (dash/cast/special/pause read INPUT.bindings)
  - Player movement merges analog stick + rebindable keyboard digital input
affects: [05-03-settings-menu, 07-steam-deck-verification]

tech-stack:
  added: []
  patterns:
    - "Web Gamepad API polled once per frame from GAME.frame() via PAD.poll(), guarded by typeof navigator === 'undefined' (mirrors SPRITES' existing headless-guard pattern)"
    - "Edge-triggered gamepad buttons (dash/special/cast/pause) via PAD._prevButtons, to match keydown semantics rather than held semantics"
    - "INPUT.device last-used-input tracking ('kbm'|'pad'), reclaimed by any keyboard/mouse activity — no consumer this phase, reserved for future control-glyph UI"

key-files:
  created:
    - js/gamepad.js
  modified:
    - js/game.js
    - js/entities.js
    - index.html
    - test/smoke.js

key-decisions:
  - "PAD.digitalMoveVector's default bindings literal was inlined directly in test/smoke.js's Task-1 checks (rather than referencing INPUT.bindings) because Task 1 executes before Task 2 adds that field to js/game.js — avoids an order-dependent test"
  - "bindInput()'s dash/cast/special/pause key checks were switched from hardcoded literals to INPUT.bindings.*.includes(k) lookups, per the plan's 'preferred if it fits cleanly' option — makes those four actions genuinely rebindable, not just movement"

patterns-established:
  - "Gamepad button mapping is fixed to the W3C standard layout (not user-remappable) this phase — Steam Input remaps upstream; in-app button rebinding is out of scope (see 05-CONTEXT.md Deferred notes)"

requirements-completed: [PLAT-02, PLAT-03]

duration: ~30min
completed: 2026-09-25
---

# Phase 5 Plan 2: Gamepad + Input Abstraction Summary

**Web Gamepad API input layer (PAD) making keyboard/mouse and a standard-mapping controller fully interchangeable for movement, aim, and all four combat actions, plus a rebindable keyboard-bindings data model consumed at the single player movement-read site.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 3/3 completed
- **Files modified/created:** 5

## Accomplishments
- `js/gamepad.js`'s `PAD` exposes three pure, headless-testable functions (`applyDeadzone`, `mapGamepad`, `digitalMoveVector`) and a headless-guarded `poll()` that drives `INPUT.ax/ay/mx/my/lmb/device` and edge-triggers dash/special/cast/pause from a standard-mapping gamepad.
- `INPUT` (js/game.js) gained `ax`/`ay`/`device`/`bindings`; `bindInput()`'s dash/cast/special/pause key checks now consult `INPUT.bindings` (making those four actions rebindable), and any keyboard/mouse activity reclaims `INPUT.device = 'kbm'` from a connected pad.
- `frame()` calls `PAD.poll()` once per tick, before the existing `dt` calculation.
- `Player.update()`'s movement-read site (the *only* block touched in `js/entities.js`, per file ownership) now prefers the left stick when deflected, falling back to `PAD.digitalMoveVector(I.keys, I.bindings)` otherwise.
- `node test/smoke.js` stays green: 47 checks total, including 9 new PAD-specific assertions (all four `applyDeadzone` cases, `mapGamepad`, three `digitalMoveVector` cases including custom-bindings rebinding, and the critical no-`navigator` `poll()` guard) plus the full-run/death/boons/meta/weapon simulations passing unchanged (they never populate `INPUT.ax/ay`, so they exercise the keyboard-fallback branch, a behavioral no-op versus the pre-existing code).

## Task Commits

1. **Task 1: js/gamepad.js — pure input-mapping functions + poll()** - `701d682` (feat)
2. **Task 2: Wire INPUT.bindings/ax/ay/device + PAD.poll() into the frame loop** - `b6aa079` (feat)
3. **Task 3: Player movement-read site — merge analog stick with keyboard** - `ac3472b` (feat)

_Note: Task 1 was TDD-flagged in the plan; the test assertions (test/smoke.js) and implementation (js/gamepad.js) were committed together in Task 1's single commit, consistent with how Plan 05-01's TDD task was handled (test/smoke.js is a shared, append-only file — see that plan's SUMMARY for the same rationale). `node test/smoke.js` confirms every listed behavior passes._

## Files Created/Modified
- `js/gamepad.js` - `PAD` global: `CFG` (deadzone/aim-reach/button+axis index constants), `applyDeadzone`, `mapGamepad`, `digitalMoveVector`, `_edge` helper, `poll()`
- `js/game.js` - `INPUT` object literal gained `ax`/`ay`/`device`/`bindings`; `bindInput()`'s keydown/mousemove/mousedown handlers set `INPUT.device='kbm'` and dash/cast/special/pause checks now use `INPUT.bindings.*.includes(k)`; `frame()` calls `PAD.poll()` as its first line — no other part of the file touched
- `js/entities.js` - `Player.update()`'s movement-read block (the only block touched) merges `INPUT.ax/ay` (analog) with `PAD.digitalMoveVector` (rebindable keyboard) fallback
- `index.html` - added `<script src="js/gamepad.js"></script>` after `js/storage.js`
- `test/smoke.js` - `gamepad.js` added to loaded files; 9 new PAD checks

## Decisions Made
- Inlined a local default-bindings literal in `test/smoke.js`'s Task 1 checks instead of depending on `INPUT.bindings` (which Task 2 adds), since Task 1 was executed and committed first, per plan sequencing.
- Took the plan's "preferred if it fits cleanly" option to route `bindInput()`'s dash/cast/special/pause dispatch through `INPUT.bindings` lookups instead of leaving them as hardcoded literals — a small, mechanical swap that makes keyboard rebinding of those four actions actually functional (not just movement), ready for the settings menu (05-03) to write into `INPUT.bindings`.

## Deviations from Plan
None - plan executed exactly as written (including taking the explicitly-offered "preferred" option for `bindInput()`'s dispatcher, which the plan itself flagged as optional-but-preferred, not a deviation).

## Issues Encountered
None. `node test/smoke.js` passed on the first run after each task; no fix-attempt cycles were needed.

## User Setup Required
None - no external service configuration required.

## Manual Checks Pending
- Connect a real standard-mapping controller (e.g. Xbox pad, or a Steam Deck via Steam Input's default remap) in an actual browser or Electron window and confirm: left stick moves Abhimanyu, right stick aims (crosshair follows), RT/A attacks, LT/X triggers special, B/RB dashes, Y casts, Start pauses/resumes.
- Confirm keyboard/mouse still fully work with no regression when a controller is *also* connected (device-switching via last-input-wins).
- Crosshair visual swap for gamepad aim (drawing a distinct aim indicator instead of the mouse crosshair) is explicitly deferred — see 05-CONTEXT.md Deferred notes; `renderHUD()` is out of this phase's file-ownership scope.
- Gamepad button rebinding (as opposed to keyboard rebinding) is out of scope this milestone per 05-CONTEXT.md D-05.

## Next Phase Readiness
`PAD` and `INPUT.bindings` are ready for 05-03 (settings menu) to expose keyboard rebinding UI. 05-03 was **not executed** in this session per explicit instruction (it depends on Phase 3's `js/settings.js`, which has not yet been merged into this branch). No blockers for 05-03 once that dependency lands — `INPUT.bindings` is a plain, already-consulted data map ready to be read/written by a settings panel.

---
*Phase: 05-desktop-wrapper-gamepad-settings*
*Completed: 2026-09-25*

## Self-Check: PASSED

All created/modified files confirmed present on disk (js/gamepad.js, js/game.js, js/entities.js, index.html, test/smoke.js). All three task commit hashes (701d682, b6aa079, ac3472b) confirmed in `git log`.
