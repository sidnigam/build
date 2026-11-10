# Quick 261019-nnu Summary — HiDPI blur + camera motion

Changes: js/sprites.js (Filter default resolution 'inherit'), js/gfx.js (grade/bloom 'inherit'; High bloom on fxContainer; Low resCap 2), js/renderer.js (look-ahead/follow tuning; small-punch rate limit; resetFx clears it), js/entities.js (non-boss kill punch 0.015/0.16s, shake 2), test/smoke.js (low resCap expectation 1→2).

Verification:
- SMOKE_FAST + full smoke green (one test exposed that resetFx didn't clear the new rate limit — fixed in resetFx, not the test).
- Real-GPU headless Chrome (Apple M1 Pro Metal) at 1440x900@2, tier High: worldFilters 1 (grade only), fxFilters 1 (bloom), render resolution 2.25, 60 FPS, ALIGN dx/dy 0, no exceptions. Native-res crop of the player shows crisp hair/jewelry/sash detail.

Pending (user): feel-check camera — if it still feels floaty, CAMERA.CFG LOOK_AIM/LOOK_MOVE can go to 0; screen shake can be reduced/disabled in Settings.
Observed for 05.4-05 (not fixed here): Naraka floor shows faint vertical tile seams; area below the arena's south edge shows a flat maroon band (fallback wall) and an undimmed floor strip.
