---
phase: quick-260924-tka
plan: 01
subsystem: rendering / sprite runtime
tags: [pixi, sprites, atlas, provenance, state]
requires: [02-01, 02-02, 02-03]
provides:
  - Hardened SPRITES runtime (idle fallback, r-based scale + feet anchor, facing flip, y-sort, mark-and-sweep, separate HUD bridge)
  - Packed idle player atlas + provenance entry
affects: [js/sprites.js, js/game.js, test/smoke.js, assets/sprites/player, assets/sprites/PROVENANCE.json, .planning/STATE.md]
tech-stack:
  added: []
  patterns:
    - Pure, headless-testable sprite helpers on the SPRITES global (no Pixi refs)
    - Per-frame mark-and-sweep for entity sprites (beginEntities/_markSeen/endEntities)
    - Two 2D bridge canvases: world (in worldContainer, shaken) and HUD (in hudContainer, steady)
key-files:
  created:
    - assets/sprites/player/player-atlas.png
    - assets/sprites/player/player-atlas.json
  modified:
    - js/sprites.js
    - js/game.js
    - test/smoke.js
    - assets/sprites/PROVENANCE.json
    - .planning/STATE.md
decisions:
  - "Sprite runtime hardened: idle fallback, r-based scale with feet anchor, facing flip, y-sort, per-frame mark-and-sweep, HUD on separate un-shaken bridge; game canvas no longer takes a 2D context."
  - "Per-frame img2img seeds were not recorded; the workflow seed 205981 belongs to the reference-sheet txt2img, so provenance says 'not recorded per-frame'."
metrics:
  completed: 2026-09-24
  tasks: "3/4 (Task 4 human-verify checkpoint PENDING)"
---

# Quick 260924-tka: Harden Sprite Runtime and Pack Idle Player Atlas Summary

The PixiJS sprite runtime now handles a real, partial (idle-only) atlas correctly. Sprites fall back to idle, are sized at 4x the hitbox radius with feet at the bottom of the hitbox, flip to face their target, sort by y, and get swept when their entity goes away. The HUD draws on its own bridge canvas that camera shake does not move. The real Abhimanyu idle atlas is packed and has a provenance entry.

## Status

**Tasks 1-3 are complete and committed. Task 4 (checkpoint:human-verify, the in-game scale check) is PENDING user verification.**

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 8f521ff | Pure sprite helpers + mark-and-sweep bookkeeping, with smoke assertions |
| 2 | f13ae41 | Helpers wired into the Pixi runtime; HUD bridge; 2D-context removal |
| 3 | 622f143 | Idle player atlas packed, PROVENANCE entry added, STATE.md refreshed |

## What Was Done

- **Task 1:** Added `SPRITES.CFG` (tunable), `pickAnim`, `animForEntity` (replaces `_animFor`), `movedSince`, `facingSign`, `spriteLayout`, `heightPerRFor`, and `beginEntities/_markSeen/endEntities/clearEntities`. `removeEntity` now always destroys the sprite. Added 12 new headless smoke checks. They failed first (RED: `pickAnim is not a function`) and passed after the implementation (GREEN).
- **Task 2:** `init()` turns on `entityContainer.sortableChildren` and adds the `hudBridge*` canvas/texture/sprite to `hudContainer`. `drawEntity` creates the new sprite before swapping, uses the pickAnim fallback, and sets layout, facing, and zIndex. `render()` runs the sweep every frame and draws the HUD onto `SPRITES.hudBridgeCtx`. `GAME.init` no longer calls `getContext('2d')`.
- **Task 3:** `player-atlas.{png,json}` has idle with 4 frames. Each frame is trimmed to 46x127 inside a 128x128 original, and `meta.image` is `player-atlas.png`. Added a PROVENANCE entry. `check-provenance` prints `provenance ok (1 atlases)`. STATE.md now shows Paused at 02-04 task 2. The resolved renderer blocker was removed, the pose-consistency and QA-04 concerns were added, a decision bullet was added, and the resume file is `.planning/HANDOFF.json`.

## Deviations from Plan

**1. [Rule 2 - Correctness] drawEntity keeps the existing sprite alive when pickAnim returns null**
- The plan said to "return without touching the existing sprite". The per-frame sweep would still have destroyed that sprite, so drawEntity now calls `_markSeen(e)` before it returns when a sprite already exists.
- Files: js/sprites.js (commit f13ae41)

**2. [Minor] Added `init_image_note` field to the PROVENANCE entry** to record that the init image is a border-cropped derivative of the locked reference, as the plan text asked.

Everything else was executed as written. ROADMAP.md was not touched.

## Known Stubs / Limitations

- renderEffects primitives (projectiles, orbits, rings, damage text) still draw on the world bridge, so they render UNDER Pixi entity sprites. This is an accepted limitation, documented in the sprites.js init comment. The fx layer moves to Pixi in a later plan.
- The player atlas only has idle. run/attack/dash fall back to idle on purpose (they are blocked on pose-consistency; see HANDOFF.json).

## Pending: Task 4 human-verify

Start the server with `python3 -m http.server 8080` from the project root (fallback: `npx http-server -p 8080 -c-1`). Then check steps 1-7 from the plan: no "SPRITES disabled" warning, the sprite is about 52px tall with feet at the bottom of the hitbox, it flips to face the aim, it stays visible through move/attack/dash, the HUD stays steady during shake and draws above the sprite, no sprites are left over after a room change or in the hub, and the size looks right (or give a HEIGHT_PER_R / FEET_ANCHOR_Y tuning value).

## Self-Check: PASSED

- FOUND: js/sprites.js, js/game.js, test/smoke.js, assets/sprites/player/player-atlas.png, assets/sprites/player/player-atlas.json, assets/sprites/PROVENANCE.json
- FOUND commits: 8f521ff, f13ae41, 622f143
- `node test/smoke.js`: ALL SMOKE TESTS PASSED
