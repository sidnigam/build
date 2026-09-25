---
phase: 02-asset-pipeline-sprite-system
plan: 10
subsystem: rendering / weapon overlay + biome backgrounds
tags: [pixi, graphics-v8, sprites, weapons, biomes]

requires:
  - phase: 02-07
    provides: Procedural animation core (SPRITES.CFG.SWING_DUR, SPRITES.headY, drawEntity/renderEntities shape)
provides:
  - Code-drawn weapon overlay (khanda/gandiva/gada) that rotates with aim, sweeps with combo swings, and draws back with bow charge — no AI art needed
  - Non-atlas biome background texture loader + cover-fit Pixi sprite rendered below the primitive bridge, with a dim/tint readability pass and graceful D-11 fallback
affects: [02-08, 02-11, phase-4-gameplay-depth]

tech-stack:
  added: []
  patterns:
    - PixiJS v8 chained Graphics API (rect/circle/poly/moveTo/lineTo/quadraticCurveTo -> fill()/stroke()) for code-drawn art, confirmed against the vendored bundle (no v7 beginFill/endFill)
    - Non-atlas single-image texture loading (SPRITES.textures/loadTextures) alongside the existing atlas loader, both sharing the same navigator/document/PIXI headless guard and non-fatal (D-11) per-entry try/catch
    - Cover-fit sprite placement math (max of width/height scale ratios) for a fixed-aspect background image against the shake-padded arena rect

key-files:
  created: []
  modified:
    - js/sprites.js
    - js/game.js
    - test/smoke.js

key-decisions:
  - "Weapon art is authored in local weapon-space (grip/limb-center at the origin, +x axis, r=13 reference scale) and transformed via a single Container (position/rotation/scale) driven by the pure weaponPose(e) helper — kept the Graphics-building code (_buildWeapon) and the per-frame transform code (drawWeapon) separate so the weapon-pose math stays unit-testable without Pixi."
  - "The biome background sprite is inserted at worldContainer index 0 (addChildAt), pushing the existing bridgeSprite to index 1 — this keeps the D-11 primitive fallback (mandala/walls/zones/etc., drawn on the bridge canvas) rendering on top of the illustrated bg, and preserves the pre-02-10 render order when no bg texture is loaded (bgSprite simply doesn't exist yet)."
  - "renderBackground's arena floor uses ctx.clearRect before repainting a tinted wash when a bg is shown, since the outer dim rect was already painted across the full padded canvas; this keeps the arena floor legible without a second full off-arena fillRect."

requirements-completed: [ART-01, ART-04, RENDER-02]

duration: ~35min
completed: 2026-09-25
---

# Phase 02 Plan 10: Weapon Overlay + Biome Background Rendering Summary

**Player weapons (khanda sword, gandiva bow, gada mace) are now drawn in code with PixiJS v8 Graphics — rotating with aim, sweeping through combo swings, pulling back while the bow charges — and every biome's illustrated background PNG renders under the arena with a readability dim/tint pass, falling back silently to the original primitive fill when the art isn't there yet.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 complete
- **Files modified:** 2 (js/sprites.js, js/game.js) + test/smoke.js (append-only)

## Accomplishments

- Pure `weaponKindFor`/`weaponPose` helpers (headless-testable): named-weapon-to-kind mapping, foreshortened hand position along aim, melee swing sweep that eases through the arc and alternates direction by `comboIdx`, bow draw-back `pull`, and a front/behind `z` key.
- Pure `bgKeyFor`/`bgPathFor`/`hasTexture`/`loadTextures` helpers mirroring the existing atlas-loader pattern for single, non-atlased biome background images.
- `_buildWeapon` draws all three weapon kinds with the v8 chained Graphics API (confirmed no v7 `beginFill`/`endFill` anywhere in the bundle or this code) in a gold+steel+leather palette; `drawWeapon` positions/rotates/scales the weapon from `weaponPose`, rebuilds on a weapon-kind change, inherits the player sprite's alpha (iframes blink), and redraws the bowstring + a nocked-arrow tip each frame while pulling.
- Weapon lifecycle is tied to the sprite lifecycle: `_destroyWeapon` runs from both `removeEntity` and `retireEntity`, so a despawned/dead player's weapon never leaks a Pixi object.
- `setBackground` shows a cover-fit `PIXI.Sprite` of the loaded biome image at `worldContainer` index 0 (below the primitive bridge canvas), and `renderBackground` uses it with an outside-arena dim overlay and an inside-arena biome-tinted wash — the mandala/walls/danger-zones/pillars/doors/pickups draw unchanged on top either way. The hub always passes a null background key.
- 7 new headless smoke asserts for the pure helpers (weapon kind/pose/bg-key/texture guards); existing suite untouched and green.

## Task Commits

1. **Task 1: Pure weapon-pose and background-key helpers + headless smoke asserts** - `36824cb` (feat, TDD RED→GREEN)
2. **Task 2: Pixi runtime — drawWeapon and setBackground sprite below the bridge** - `52c11ab` (feat)
3. **Task 3: Wire biome textures + weapon into game.js** - `8327ff1` (feat)

## Files Created/Modified

- `js/sprites.js` — CFG tunables (`WEAPON_HAND_R`, `WEAPON_HAND_DY`, `WEAPON_SCALE_PER_R`, `WEAPON_REACH_BULGE`, `BG_DIM_OUTER`, `BG_FLOOR_TINT`); pure `weaponKindFor`/`weaponPose`/`bgKeyFor`/`bgPathFor`/`hasTexture`/`loadTextures`; Pixi runtime `_buildWeapon`/`drawWeapon`/`_destroyWeapon`; `setBackground` filled out from its 02-10-Task-1 stub; `removeEntity`/`retireEntity` now also destroy the weapon.
- `js/game.js` — init `.then` callback loads biome textures; `renderBackground`'s top two fills branch on `SPRITES.setBackground`; `renderEntities` calls `SPRITES.drawWeapon(P)` after `drawEntity(P)`. No other region touched.
- `test/smoke.js` — append-only: 7 asserts for weapon-pose/bg-key/texture-guard pure helpers.

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

None — plan executed exactly as written. All `must_haves.truths` and `must_haves.artifacts` are satisfied; `key_links` patterns (`setBackground\(`, `loadTextures\(`, `drawWeapon\(`) are present at the exact call sites the plan specified.

## Issues Encountered

None. Confirmed the vendored Pixi v8 `GraphicsContext.fill`/`.stroke` accept either a raw color number or a style object (`{color, alpha, width, ...}`) and return `this` for chaining, by reading the minified source directly (searched by the actual method-name tokens, e.g. `.poly(`, `fill(t,e)`, since class names are mangled but public method names are not).

## User Setup Required

None - no external service configuration required.

## Non-blocking Human Review (user is away — do not wait on this)

Start a local server once player-atlas and (ideally) some 02-08 biome PNGs exist:

```
python3 -m http.server 8080
```

Checklist for a later human pass:
1. Weapon size and hand position against the ~52px sprite (tune `WEAPON_HAND_R`, `WEAPON_HAND_DY`, `WEAPON_SCALE_PER_R` in `SPRITES.CFG` if the weapon looks oversized or floats away from the hand).
2. The swing sweep direction alternates on the combo (khanda 3-hit, gada 2-hit).
3. The bow pulls back visibly on hold and releases cleanly.
4. The biome background dimming keeps enemies, telegraphs, and doors readable against the illustrated floor (tune `BG_DIM_OUTER`, `BG_FLOOR_TINT`).
5. The hub has no biome background (confirm `renderBackground` passes `null` there — verified in code, worth a visual double-check once assets exist).

### CFG knobs to tune (in `js/sprites.js` SPRITES.CFG, tagged `// tunable:`)

`WEAPON_HAND_R`, `WEAPON_HAND_DY`, `WEAPON_SCALE_PER_R`, `WEAPON_REACH_BULGE`, `BG_DIM_OUTER`, `BG_FLOOR_TINT`.

## Next Phase Readiness

- 02-08 (biome backgrounds + bosses) and 02-11 (enemy sprites) can land their assets with zero further code changes: missing biome PNGs already fall back silently (D-11), and the texture keys (`bgKeyFor`) already match the `{biome}-bg.png` naming the art plans use.
- No blockers introduced. Phase 2's procedural-animation + weapon-overlay + biome-background code surface (02-07 + 02-10) is now complete and ready for the art-generation plans to populate `assets/sprites/`.

---
*Phase: 02-asset-pipeline-sprite-system*
*Completed: 2026-09-25*
