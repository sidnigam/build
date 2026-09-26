---
quick_id: 260926-djs
type: quick
subsystem: rendering / sprite readability
tags: [pixi, sprites, ground-marker, colormatrix, readability]

requires:
  - phase: 02-07
    provides: Procedural animation core (_applyFlash ColorMatrixFilter, retireEntity/tickDying death-fade pool, mark-and-sweep)
  - phase: 02-10
    provides: Weapon overlay + biome background Pixi wiring (drawWeapon/_destroyWeapon lifecycle pattern reused for the marker)
provides:
  - SPRITES.groundMarkerSpec(e, phase) / SPRITES.parseColor(c) — pure, headless-testable ground-marker sizing/color helpers
  - SPRITES.drawMarker(e, t) / SPRITES._destroyMarker(e) — Pixi Graphics ground-plane marker (gold pulsing ring for the player, dark contact shadow + DATA-color rim for enemies/bosses), lifecycle-matched to the sprite (removeEntity/retireEntity+tickDying/endEntities/clearEntities)
  - Player-only brightness lift composed into the existing hit-flash ColorMatrixFilter via a two-entry filters array
affects: [02-11 (enemy/boss atlases will light up the new dark-shadow+rim marker once loaded), phase-4-gameplay-depth]

tech-stack:
  added: []
  patterns:
    - Ground marker Graphics is drawn once in LOCAL coordinates (origin-centered) and cached by a spec-derived key string; per-frame work is limited to position/alpha updates, matching the existing drawWeapon/drawGhosts "build once, reposition every frame" convention in this file
    - Marker lifecycle is threaded through the existing death-fade pool (_dying/tickDying) exactly like the sprite itself, rather than being destroyed at the moment of death, so it fades in sync with deathPose(t).alpha
    - Player-only ColorMatrixFilter composition via a filters array (`[liftFilter, flashFilter]`) instead of manual 5x4 matrix multiplication — Pixi applies filters in sequence, so this gets the same visual result with far less risk

key-files:
  created: []
  modified:
    - js/sprites.js
    - test/smoke.js

key-decisions:
  - "Introduced CFG.MARKER_SHADOW_ALPHA as a distinct key rather than reusing the plan's literal suggestion of CFG.SHADOW_ALPHA, because CFG.SHADOW_ALPHA already exists (0.35) and drives the separate ctx-drawn ground shadow in js/game.js's renderSpriteExtras/renderPlayerSpriteExtras (out of scope for this quick task, per files_modified). Reusing the same key would have silently retuned that unrelated, already-shipped ctx shadow."
  - "Ground marker lives in SPRITES.entityContainer (not bgContainer or a new layer) with zIndex = spriteZ - 0.5. entityContainer already sorts by zIndex=e.y every frame (sortableChildren=true), so this places the marker directly under its own entity's sprite for free — no new container, no extra draw-order bookkeeping. It sits above the bridge-canvas floor wash (bgContainer, index 0 of worldContainer) and below every entity sprite."
  - "Marker Graphics content is drawn once at local origin (0,0) and only rebuilt when a cached key (kind+rx+ry+color) changes; per-frame drawMarker only sets marker.x/y (feet anchor, same e.y + layout.dy used by the sprite) and marker.alpha (player pulse x spr.alpha). No new Pixi objects are created after the first frame for a given entity."
  - "Death-fade: retireEntity now hands { spr, marker, t, bx, by } into the _dying pool instead of just { spr, ... }; tickDying sets item.marker.alpha = pose.alpha every tick and destroys the marker alongside the sprite once pose.done. This was necessary because game.js's renderEntities calls SPRITES.retireEntity(e) and then `continue`s — drawEntity (and therefore drawMarker) is never called again for a dead entity, so the marker had to be driven by the same death-fade tick as the sprite, not by drawMarker."
  - "Player brightness lift (CFG.PLAYER_LIFT, ColorMatrixFilter.brightness(v, false) — confirmed present on the vendored Pixi v8 bundle) is composed with the existing hit-flash filter via spr.filters = [liftFilter, flashFilter] rather than merging the two 5x4 matrices by hand. Built lazily, wrapped in its own try/catch — if it fails to construct, isPlayer && liftF is falsy and the sprite simply relies on the gold ring for readability, matching the plan's explicit fallback instruction."
requirements-completed: [ART-01, ART-02, ART-03]

duration: ~35min
completed: 2026-09-26
---

# Quick 260926-djs: Character readability — ground rings + rim lift Summary

**A pure `groundMarkerSpec`/`parseColor` helper pair drives a new per-entity Pixi Graphics ground marker (gold pulsing ring + glow under the player, dark contact shadow + DATA-color rim under sprite-rendered enemies/bosses), lifecycle-matched to the sprite through the existing mark-and-sweep and death-fade pool, plus a player-only ColorMatrixFilter brightness lift composed with the existing hit-flash filter.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 complete (Task 3 required no code changes — verified visually, no commit)
- **Files modified:** 1 (js/sprites.js) + test/smoke.js (append-only)

## Accomplishments

- `SPRITES.parseColor(c)` — pure hex-string-to-number conversion (`'#rrggbb'` → `0xrrggbb`) for feeding `e.color` (a CSS string, per `DATA`/entity conventions) into Pixi Graphics fill/stroke calls.
- `SPRITES.groundMarkerSpec(e, phase)` — pure, headless-testable: classifies player/enemy/boss, sizes the marker ellipse from `e.r` (bosses get an extra `BOSS_MARKER_SCALE` multiplier beyond their naturally larger `r`), picks gold for the player vs. the entity's own DATA color for enemies/bosses, and computes a ±15% pulse factor for the player only (flat 1 for everyone else).
- `SPRITES.drawMarker(e, t)` — lazily creates one `PIXI.Graphics` per entity in `entityContainer` (documented placement choice: reuses the existing y-sort via `zIndex = spriteZ - 0.5`, no new layer needed), redraws its content only when the cached spec key changes, and every other frame only updates position (same feet anchor as the sprite, `e.y + layout.dy`) and alpha (player pulse × current sprite alpha, so it inherits spawn-fade/iframes-blink for free).
- Marker lifecycle fully mirrors the sprite: destroyed immediately in `removeEntity`; handed into the `_dying` pool alongside the sprite in `retireEntity` so `tickDying` fades its alpha in lockstep with `deathPose(t)` and destroys it on completion; swept by `endEntities`' dying-pool leak-guard and by `clearEntities`.
- `_applyFlash(spr, k, isPlayer)` now also lazily builds a player-only `ColorMatrixFilter` (`.brightness(CFG.PLAYER_LIFT, false)`) and composes it with the hit-flash filter as a two-entry `filters` array when flashing, or alone when not — confirmed `.brightness()` exists on the vendored Pixi v8 `ColorMatrixFilter` by reading `vendor/pixi.min.js` directly before relying on it.
- New CFG tunables: `RING_PLAYER_COLOR`, `RING_PLAYER_ALPHA`, `RING_W_PER_R`, `RING_H_RATIO`, `MARKER_SHADOW_ALPHA`, `RIM_ALPHA`, `PLAYER_LIFT`, `BOSS_MARKER_SCALE` (all tagged `// tunable:` in `SPRITES.CFG`).
- 7 new headless smoke asserts for the pure helpers (color parsing, size scaling, player-is-gold, boss-larger-than-enemy, alpha ranges, pulse behavior) + 1 comprehensive assert exercising the full marker lifecycle (`removeEntity`, `endEntities`, `retireEntity` → `tickDying` fade-and-destroy, `clearEntities` sweep) with mock sprite/marker objects.

## Task Commits

1. **Task 1: Pure `groundMarkerSpec`/`parseColor` helpers + CFG tunables + smoke asserts** — `99563a5` (feat)
2. **Task 2: Pixi wiring — `drawMarker`/`_destroyMarker`, death-fade + sweep integration, player brightness lift, smoke assert** — `efc15f7` (feat)
3. **Task 3: Visual check via headless-Chrome CDP screenshot** — no commit (no CFG tuning needed; see Visual Verification below)

## Files Created/Modified

- `js/sprites.js` — CFG tunables; pure `parseColor`/`groundMarkerSpec`; `drawEntity` now computes `isPlayerEntity` once and calls `this.drawMarker(e, t)` + passes it into `_applyFlash`; `_applyFlash` composes the player-only lift filter; new `drawMarker`/`_destroyMarker` methods; `retireEntity`/`tickDying`/`endEntities`/`clearEntities`/`removeEntity` all extended to carry the marker through the same lifecycle as the sprite.
- `test/smoke.js` — append-only: 7 asserts for the pure helpers, 1 assert for the full marker mark-and-sweep/death-fade lifecycle.

## Decisions Made

See `key-decisions` in frontmatter. Most notable: renaming the plan's suggested `CFG.SHADOW_ALPHA` tunable to `CFG.MARKER_SHADOW_ALPHA` to avoid silently retuning the pre-existing, out-of-scope ctx-drawn ground shadow in `js/game.js`.

## Deviations from Plan

**1. [Naming, low-risk] `SHADOW_ALPHA` → `MARKER_SHADOW_ALPHA`**
- **Found during:** Task 1
- **Issue:** The plan's CFG tunable list names `SHADOW_ALPHA` (~0.45), but `SPRITES.CFG.SHADOW_ALPHA` (0.35) already exists and drives a separate ctx-drawn ground-shadow ellipse in `js/game.js` (`renderSpriteExtras`/`renderPlayerSpriteExtras`) — a file this quick task's `files_modified` explicitly excludes.
- **Fix:** Added a new, distinctly-named key (`MARKER_SHADOW_ALPHA`) for the new Pixi marker's dark contact-shadow ellipse, leaving the existing `SHADOW_ALPHA`/game.js behavior completely untouched.
- **Files modified:** `js/sprites.js` (CFG only).
- **Commit:** `99563a5`

No other deviations. All `must_haves.truths` from the plan frontmatter are satisfied.

## Issues Encountered

None. Confirmed `ColorMatrixFilter.prototype.brightness(t, e)` exists in the vendored Pixi v8 bundle (`vendor/pixi.min.js`) by grepping the minified source directly before relying on it for the player lift composition.

## Visual Verification (Task 3)

Ran the existing headless-Chrome CDP screenshot script (`python3 -m http.server 8091` + `node cdp-check.mjs`) against the current build. Only the `player` sprite atlas is loaded in this environment (enemy/boss atlases from 02-11 are not yet generated, so all enemies render via the D-11 primitive fallback, which is unaffected by this quick task).

- **Player:** the gold ground ring/glow is clearly visible under Abhimanyu's feet in the Naraka arena — a cropped close-up confirms a legible soft-gold ellipse (glow + thin ring) distinct from the dark stone floor. The player reads as instantly findable, resolving the evidence in the plan ("the ~52px Abhimanyu sprite... blends into the Naraka floor").
- **Hub screen:** renders cleanly with no stray markers (no entities present, as expected).
- **Enemies/bosses:** could not be visually confirmed with real sprite art in this pass (atlases not yet generated by 02-11), but the marker code path is exercised for any sprite-rendered entity and is covered by the Task 2 smoke assert (marker creation/destroy/fade lifecycle). Re-verify visually once 02-11's enemy/boss atlases land.

No CFG tuning was needed — sizes/alphas read well at the current defaults, so Task 3 made no code changes and has no commit.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- 02-11 (enemy/boss atlas generation) can land art with zero further code changes to this marker system: `drawMarker` already runs for any entity that gets a Pixi sprite, and will immediately start showing the dark-shadow + DATA-color rim for enemies/bosses once their atlases load.
- Recommend a follow-up visual pass once 02-11 assets exist, to confirm the enemy/boss rim reads well against the illustrated biome backgrounds (tune `RIM_ALPHA`, `MARKER_SHADOW_ALPHA`, `BOSS_MARKER_SCALE` if needed).
- No blockers introduced.

---
*Quick task: 260926-djs*
*Completed: 2026-09-26*
