# Deferred items — Phase 05.1

## Pre-existing flaky test: `riverCurrent: pushes the player along its direction`

- **Found during:** 05.1-02 execution (Task 1/2 smoke runs).
- **Symptom:** Occasionally fails with "player displacement too small (0px in 1s)".
- **Scope:** Out of scope for 05.1-02 — confirmed present on the pre-05.1-02 commit (`49a5ef2`,
  end of 05.1-01) by stashing this plan's changes and re-running `node test/smoke.js` ~6 times;
  failed intermittently (~1/6 runs) with the identical message, unrelated to any file this plan
  touches (js/renderer.js, js/sprites.js, js/game.js, js/entities.js, js/gamepad.js).
- **Action:** Not fixed here per the deviation-rules scope boundary (pre-existing flakiness in an
  unrelated hazard test, not caused by this plan's changes). Left for a future hazard-focused plan
  to investigate (likely a river-push/movement-order race under `GAME.update`).
