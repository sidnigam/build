---
quick_id: 260926-djs
type: quick
autonomous: true
files_modified: [js/sprites.js, test/smoke.js]
requirements: [ART-01, ART-02, ART-03]
must_haves:
  truths:
    - "The player sprite is instantly findable on dark biome floors: a soft gold ground ring/glow sits under the player's feet"
    - "Sprite-rendered enemies/bosses get a dark contact shadow plus a faint rim in their DATA color, so silhouettes separate from the floor"
    - "Markers are destroyed with their entity (no leaks through mark-and-sweep/clearEntities) and cost no per-frame allocations"
    - "node test/smoke.js stays green"
---

# Quick 260926-djs: Character readability — ground rings + rim lift

Evidence: after 260926-dcz darkened the arena floor, the ~52px Abhimanyu sprite (dark skin, brown dhoti) blends into the Naraka floor in a headless-Chrome screenshot. Enemy/boss single-pose sprites (02-11, generating now) will have the same problem.

## Task 1 — Pure helper + CFG (js/sprites.js)
- Add CFG tunables: `RING_PLAYER_COLOR` (0xffd34d), `RING_PLAYER_ALPHA` (~0.55), `RING_W_PER_R` (~1.9, ellipse half-width = r*RING_W_PER_R/2… choose sensible), `RING_H_RATIO` (~0.38), `SHADOW_ALPHA` (~0.45), `RIM_ALPHA` (~0.35), `PLAYER_LIFT` (brightness ~1.12).
- Add pure `groundMarkerSpec(e)` → `{ kind: 'player'|'enemy'|'boss', rx, ry, color, alpha, shadowAlpha, pulse }` computed from e.r, e.boss, e.color / DATA color (player: gold ring + pulse factor from a phase value passed in or computed from GAME.time if available; bosses: larger, rim in boss color). Headless-testable; no PIXI.
- Smoke asserts (append-only): spec sizes scale with r, player kind is gold, boss rx > enemy rx for larger r, alpha values in (0,1].

## Task 2 — Pixi wiring (js/sprites.js drawEntity/removeEntity only)
- Per entity lazily create ONE `PIXI.Graphics` marker (`e._pixiMarker`) added to `entityContainer` with zIndex = sprite.zIndex - 0.5 (so it sits under that entity but still y-sorts), or to `bgContainer`/a dedicated marker layer above the bridge floor — pick whichever keeps it above the floor wash and below all entity sprites; document the choice.
- Draw with Pixi v8 Graphics API (`.ellipse(...).fill({color, alpha})`, `.stroke({width, color, alpha})` — NO beginFill/endFill). Redraw only when spec changes meaningfully (cache last rx/ry/color); per-frame just update position (feet point = same feet anchor used for the sprite) and alpha (player pulse ±15%).
- Player: soft outer glow (2-3 concentric ellipses decreasing alpha) + thin gold ring. Enemies/bosses: dark filled contact shadow + faint colored rim.
- Player sprite brightness lift: if a ColorMatrix is already used for hit flash (`_applyFlash`), compose with it — when not flashing, apply `brightness(PLAYER_LIFT)` only to the player (no filter on enemies to keep batching). If composing is risky, skip the lift and rely on the ring (note in SUMMARY).
- Marker hidden during death fade (fade with sprite alpha), destroyed in `removeEntity` and swept by `endEntities`/`clearEntities` along with the sprite.
- Only render markers for entities that render as sprites (primitive-fallback enemies already draw their own circle).

## Task 3 — Visual check
- A headless-Chrome screenshot script exists at /private/tmp/claude-501/-Users-sidnigam-Documents-coding-build-chakravyuha/1d54dd11-935d-453d-b5f2-51d5ff78390e/scratchpad/cdp-check.mjs (needs `python3 -m http.server 8091` from the chakravyuha dir; `node <script> <outdir>`; view 02-run-moving.png). Confirm the player is clearly findable; tune CFG if not. No commit for this task unless tuning changed code.

Constraints: only js/sprites.js (drawEntity/removeEntity/sweep internals + CFG + new helper) and test/smoke.js (append-only). Commit each task atomically (`feat(quick-260926-djs): ...`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; explicit paths only. `node test/smoke.js` green after each task. Write 260926-djs-SUMMARY.md (don't commit). Don't edit ROADMAP/STATE.
