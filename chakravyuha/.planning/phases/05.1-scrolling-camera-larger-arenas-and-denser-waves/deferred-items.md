# Deferred items — Phase 05.1

## RESOLVED (05.1-03): flaky test `riverCurrent: pushes the player along its direction`

- **Found during:** 05.1-02 execution (Task 1/2 smoke runs); root-caused and fixed during 05.1-03.
- **Symptom:** Occasionally failed with "player displacement too small (Npx in 1s)".
- **Root cause:** Test-fixture bug, not game logic. The fixture hardcodes the player at the arena's
  horizontal center (`A.x + A.w / 2`) to test the river hazard's push in isolation. Vaitarani's
  `vait_fords` layout template (1 of 3 templates, chosen at random by `ROOMS.buildArena`) runs a
  near-full-height column of `pit` obstacles straight through that exact x (fractions `.46`-`.53`).
  When that template was picked *and* the river band's y happened to land inside one of the pit
  segments (~76% of that template's height), `clampToArena`'s obstacle-push-out logic pinned the
  player against the pit edge every frame, masking the river's own push and producing a
  near-zero net displacement over the 1s window — roughly matching the observed ~1-in-6 rate
  (⅓ template chance × ~76% y-overlap chance × ~50% push-direction-into-the-pit chance).
  Confirmed by reproducing the failure with `GAME.pillars` intact and eliminating it entirely
  (15+ consecutive green runs, then a further 10/10 clean) once `GAME.pillars` is cleared for this
  fixture only.
- **Fix:** `test/smoke.js` — the riverCurrent fixture now sets `GAME.pillars = []` before
  positioning the player, isolating the push-math check from the room's (unrelated) obstacle
  layout, matching how the surrounding per-hazard fixtures already isolate their own concern.
  Test-only change; no production code touched.
- **Commit:** `fix(05.1-03): isolate riverCurrent push-math test from obstacle-layout collisions`
