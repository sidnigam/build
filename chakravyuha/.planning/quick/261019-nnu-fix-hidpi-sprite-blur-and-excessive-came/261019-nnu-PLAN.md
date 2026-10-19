---
quick_id: 261019-nnu
type: quick
autonomous: true
files_modified: [js/sprites.js, js/gfx.js, js/renderer.js, js/entities.js, test/smoke.js]
---
# Quick 261019-nnu: Fix HiDPI sprite blur + excessive camera motion (user playtest report)

User report: "Why is the background moving so much and all the sprites are super blurry?"

Root causes (verified in code + vendored Pixi):
1. Blur — Pixi v8 `Filter.defaultOptions.resolution = 1`. GFX puts an AdjustmentFilter (grade) on worldContainer at Medium/High, so the whole world re-rasterizes at 1x and is stretched on Retina (renderer at 2x+). High tier also put AdvancedBloomFilter on worldContainer at resolution 0.5, and Pixi renders a filter chain at the MIN resolution of its filters → world at 0.5x (quarter sharpness). Per-sprite ColorMatrix filters (player lift, hit flash) had the same 1x default. Low tier capped the backing store at 1x (soft on HiDPI).
2. Motion — camera look-ahead toward aim up to 110px (LOOK_AIM 0.2) + movement 40px, so mouse movement slid the world; every non-boss kill fired a zoom punch (0.03/0.18s) + shake 4, which with 20-50-enemy rooms was near-continuous.

Fix: Filter.defaultOptions.resolution='inherit' at SPRITES.init; grade/bloom resolution 'inherit'; High bloom moved to fxContainer (BLOOM_HIGH opts); Low resCap 1→2; camera LOOK_AIM 0.06 / MAX 40 / LOOK_MOVE 20 / FOLLOW_RATE 6; non-boss kill punch 0.015/0.16s rate-limited to one per 0.6s (cleared by CAMERA.resetFx), non-boss kill shake 4→2.
