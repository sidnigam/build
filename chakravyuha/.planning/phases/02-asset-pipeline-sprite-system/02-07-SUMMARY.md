---
phase: 02-asset-pipeline-sprite-system
plan: 07
subsystem: rendering / procedural animation
tags: [pixi, sprites, procedural-animation, colormatrix, vfx]

requires:
  - phase: quick-260924-tka
    provides: Hardened SPRITES runtime (idle fallback, r-based scale, facing, y-sort, sweep, HUD bridge)
provides:
  - Pure procedural-animation helper library on SPRITES (procAnim, procStateFor, flashAmount, blinkAlpha, spawnPose, deathPose, textureAnimFor, headY, ghostAlpha)
  - Pixi runtime wiring: composed transform in drawEntity, ColorMatrixFilter hit-flash, death-fade pool (retireEntity/tickDying), dash afterimages (drawGhosts), boss phase2 texture selection with a phase-transition flash
  - Sprite-path readability overlays in game.js (renderSpriteExtras / renderPlayerSpriteExtras) restoring telegraphs, noose, status pips, HP bars, spawn ring, swing wedge, bow charge line, bhakti ring, and player swing.t decay
affects: [02-08, 02-10, 02-11, phase-4-gameplay-depth]

tech-stack:
  added: []
  patterns:
    - Pure, headless-testable procedural-animation math on SPRITES (no Pixi refs), composed at draw time with existing pure helpers (spriteLayout, facingSign, pickAnim)
    - Death handled as a pooled fade-out (retireEntity -> _dying -> tickDying) instead of immediate destroy, so dead entities visually shrink/fade instead of popping
    - ColorMatrixFilter attached/detached per-frame only while flashing (near-zero steady-state cost)
    - game.js-side "bridge canvas" overlays mirror js/entities.js draw() primitives by copying logic (never importing/modifying entities.js), keeping file ownership clean across parallel phases

key-files:
  created: []
  modified:
    - js/sprites.js
    - js/game.js
    - test/smoke.js

key-decisions:
  - "ColorMatrixFilter offset scale is OFF=1, not 255: the vendored Pixi v8 GL fragment shader (color-matrix-filter, found at vendor/pixi.min.js) does `result.r = uColorMatrix[0]*color.r + ... + uColorMatrix[4]` against `color.rgb` already sampled from the texture and normalized to 0..1 (alpha-unpremultiplied). The offset column is added directly to that 0..1 value, so a full white flash at k=1 uses offset 1 (not 255)."
  - "Windup states borrow the 'attack' texture (via textureAnimFor(e, available, procState==='windup' ? 'attack' : procState)) since there is no dedicated windup pose; procAnim still gives it a distinct crouch/tremble pose on top of that texture."
  - "Dead entities are retired into a pooled death-fade (_dying array + tickDying) rather than destroyed immediately, so js/entities.js's `e.dead` flag now drives a shrink-and-fade instead of an instant pop; endEntities/clearEntities both guard against leaking dying sprites when tickDying wasn't called that frame (hub state)."
  - "Sprite-path overlays are copied logic from Enemy.draw/Boss.draw/Player.draw, not shared functions — js/entities.js is untouched per the parallel-phase file-ownership rule, at the cost of two near-duplicate code paths (bridge-canvas primitives vs. Pixi sprite + overlay)."

requirements-completed: [ART-01, ART-02, ART-03, RENDER-03]

duration: ~55min
completed: 2026-09-25
---

# Phase 02 Plan 07: Procedural Animation Core Summary

**Every sprite-rendered actor (idle-only player atlas, single-pose enemy/boss atlases from 02-08/02-11) now animates procedurally in code — breathing, run bob/lean, dash stretch with tinted afterimages, attack lunge, enemy wind-up tremble, a ColorMatrixFilter white hit-flash, spawn fade-in, death shrink-fade via a pooled fade-out, and boss phase2 texture selection — with gameplay-critical primitives (telegraphs, HP bars, status pips, swing wedge, Yama's noose) restored on top via new game.js overlays.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3/3 complete
- **Files modified:** 2 (js/sprites.js, js/game.js) + test/smoke.js (append-only)

## Accomplishments

- Pure, headless-testable procedural-animation library on `SPRITES`: `procAnim`, `procStateFor`, `flashAmount`, `blinkAlpha`, `spawnPose`, `deathPose`, `textureAnimFor`, `headY`, `ghostAlpha`, plus a `trimW` clamp added to `spriteLayout`.
- Pixi runtime composes all of the above into `drawEntity` every frame: scale/rotation/alpha driven by breathing, run/dash/attack/windup poses, hit-squash, spawn fade-in, and iframes blink.
- White hit-flash via a lazily-attached/detached `PIXI.ColorMatrixFilter`; boss `phase===2` swaps to a `phase2` texture (falling back to `idle` when the atlas has none) and gets a one-shot phase-transition flash.
- Dead entities fade out over `DEATH_DUR` via a small pooled fade system (`retireEntity`/`tickDying`/`_dying`) instead of vanishing instantly; both `endEntities` and `clearEntities` guard against leaking dying/ghost sprites.
- Dash leaves tinted afterimage ghosts along `player.trail` (pooled `PIXI.Sprite`s, hidden not destroyed when unused).
- `js/game.js` `renderEntities` restores gameplay readability the sprite path had lost: enemy/boss telegraphs, Yama's dashed noose line, burn pips, stun glyph, asleep zzz, non-boss HP bars, the spawn ring, plus a dimmed swing wedge, bow charge line, and bhakti ring for the player — and critically, decays `player.swing.t` in the sprite path (previously only `Player.draw()` did this, so the sprite path never left the attack state).
- 20 new headless smoke asserts (17 for the pure helpers, 1 combined check for the overlays, all existing asserts still green).

## Task Commits

1. **Task 1: Pure procedural-animation helpers + headless smoke asserts** - `fc71ea5` (feat, TDD RED→GREEN)
2. **Task 2: Wire procedural transforms, hit flash, spawn/death, phase2 swap and dash ghosts into the Pixi runtime** - `c6a3c9e` (feat)
3. **Task 3: Sprite-path readability overlays + swing decay in renderEntities** - `54a2160` (feat, TDD RED→GREEN)

## Files Created/Modified

- `js/sprites.js` — CFG tunables + 9 pure procedural helpers; `drawEntity` rewritten to compose them; `_applyFlash` (ColorMatrixFilter), `retireEntity`/`tickDying` (death-fade pool), `drawGhosts` (dash afterimages) added; `movedSince` now also tracks `e._sprVX`; `spriteLayout` accepts `trimW`.
- `js/game.js` — `renderEntities` rewritten to tick the death pool, retire dead entities, and call the two new overlay methods; `renderSpriteExtras` and `renderPlayerSpriteExtras` added directly after it. No other region touched.
- `test/smoke.js` — append-only: 17 asserts for the pure helpers, 1 combined assert for the overlays (enemy telegraph/burns/stun, asleep+noose boss, player swing decay to exactly `t - dt` and clamp at 0, charging+bhaktiReady).

## Decisions Made

See `key-decisions` in frontmatter. Most notable: **ColorMatrixFilter OFF=1** (confirmed by reading `vendor/pixi.min.js`'s GL fragment shader source directly — `result.r += uColorMatrix[4]` against a 0..1-normalized `color.rgb`), which the plan flagged as needing verification before relying on the offset scale.

## Deviations from Plan

None — plan executed exactly as written. All `must_haves.truths` and `must_haves.artifacts` from the plan frontmatter are satisfied; `key_links` patterns (`SPRITES.(retireEntity|tickDying)`, `this.procAnim(`, `retireEntity`) are all present in the diff.

## Issues Encountered

None. The vendored Pixi v8 bundle's minified export table required searching by the internal identifier (`nM`) rather than the public `ColorMatrixFilter` name to find the class body and its GL fragment shader string; once found, the offset-scale question resolved unambiguously.

## User Setup Required

None - no external service configuration required.

## Non-blocking Human Review (user is away — do not wait on this)

Start a local server and eyeball the sprite path once the 02-08/02-11 enemy/boss atlases and player run/attack/dash procedural poses are live in-game:

```
python3 -m http.server 8080
```

Checklist for a later human pass:
1. Idle breath is subtle, not wobbly (tune `IDLE_BREATH`, `IDLE_HZ` if it reads as jittery).
2. Run bob and lean read at ~52px sprite height (tune `RUN_BOB_R`, `RUN_LEAN`, `RUN_HZ`).
3. Hit flash is visible but not blinding (tune `FLASH_MAX`, `PLAYER_HURT_DUR`, `PHASE_FLASH_DUR`).
4. Dead enemies fade instead of popping (tune `DEATH_DUR`; check the pooled fade never leaves a stuck sprite after a fast room clear).
5. Telegraphs are visible under enemy sprites (check `renderSpriteExtras` telegraph alpha/contrast against the new illustrated biome backgrounds once 02-10 lands).
6. Dash afterimages read as motion, not clutter (tune `GHOST_ALPHA`, `GHOST_MAX`, `GHOST_TINT`).
7. Boss phase2 flash and texture swap read clearly at the 50% hp transition (tune `PHASE_FLASH_DUR`; Yama's should feel like restrained divine wrath per D-15a once his phase2 art exists, not a demonic flash).

### CFG knobs to tune (all in `js/sprites.js` SPRITES.CFG, tagged `// tunable:`)

`IDLE_BREATH`, `IDLE_HZ`, `ASLEEP_SLOW`, `RUN_HZ`, `RUN_BOB_R`, `RUN_LEAN`, `DASH_STRETCH`, `ATTACK_STRETCH`, `WINDUP_SQUASH`, `WINDUP_TREMBLE`, `HIT_SQUASH`, `FLASH_MAX`, `PLAYER_HURT_DUR`, `SPAWN_DUR`, `SPAWN_MIN_SCALE`, `DEATH_DUR`, `PHASE_FLASH_DUR`, `SWING_DUR`, `MAX_WIDTH_PER_R`, `GHOST_ALPHA`, `GHOST_TINT`, `GHOST_MAX`, `TRAIL_LIFE`, `SHADOW_ALPHA`.

## Next Phase Readiness

- 02-10 (weapon overlay + biome backgrounds) can proceed: it depends on this plan's `SPRITES.CFG.SWING_DUR`, `SPRITES.headY`, and the sprite-path `renderEntities` shape, all of which are in place.
- 02-08/02-11 (art generation) can drop single-pose `idle`/`phase2` atlases in without further code changes — `textureAnimFor` already falls back to `idle` for any missing texture-anim, and `spriteLayout`'s `trimW` clamp is ready for wide art (coiled naga, hulking bhuta).
- No blockers introduced. The existing Blockers/Concerns in STATE.md (Yama-as-boss cultural question, QA-04 disclosure correction) are unaffected by this plan and remain open for a later phase.

---
*Phase: 02-asset-pipeline-sprite-system*
*Completed: 2026-09-25*
