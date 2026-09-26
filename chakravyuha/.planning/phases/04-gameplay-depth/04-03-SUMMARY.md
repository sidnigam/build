---
phase: 04-gameplay-depth
plan: 03
subsystem: room-layouts
tags: [room-generation, collision, data-driven, biome-content]

# Dependency graph
requires:
  - phase: 04-gameplay-depth
    plan: 02
    provides: "Shared entities.js/test/smoke.js state (boons/duos) this plan builds on without touching"
provides:
  - "DATA.LAYOUTS: 12 hand-authored per-biome room templates (pillar/wall/pit obstacles, normalized coords)"
  - "ROOMS geometry helpers: materializeLayout/obstacleDist/pointBlocked/blocksProjectile/layoutsFor/findClearSpawnPoint"
  - "Shape-aware clampToArena (circle+rect obstacles all block movement), ROOMS.blocksProjectile gating both projectile loops"
  - "renderObstacles(ctx) drawing pillar/wall/pit with biome-palette primitives"
  - "Template-driven buildArena (no immediate repeat per biome) + obstacle-aware spawnWave"
affects: [room-generation, collision-system, combat-encounters, smoke-test-harness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Obstacle shape union: {shape:'circle'|'rect', kind:'pillar'|'wall'|'pit', ...} stored in GAME.pillars; legacy shape-less entries default to circle/pillar for backward compat"
    - "ROOMS.pointBlocked(x,y,r,{obstacles,projectile}) as the single blocking predicate: movement checks all kinds, projectile checks skip kind==='pit'"
    - "buildArena(isBoss, forceId) — forceId lets tests/tools pin an exact template; normal play excludes the immediately-previous template id per biome"

key-files:
  created: []
  modified:
    - js/data.js
    - js/rooms.js
    - js/entities.js
    - js/game.js
    - test/smoke.js

key-decisions:
  - "Rect push-out in clampToArena re-clamps to arena bounds afterward (D-16) so a push-out near an arena edge can never eject the entity outside the playfield."
  - "findClearSpawnPoint scans the right 70% of the arena (biased away from the player's spawn corner at the far left) as the guaranteed-free fallback when 40 randomized tries all land on an obstacle or too close to the player."
  - "The room-layout-variety smoke check runs each biome's buildArena(false) sequence in isolation (resetting lastLayoutId per biome) rather than interleaving biomes, because lastLayoutId is a single ROOMS-level variable — interleaving would produce spurious 'consecutive repeat' failures that don't reflect real gameplay (in real play, boss rooms/biome switches never interrupt a biome's own room sequence, since boss buildArena(true) never touches lastLayoutId and template ids never collide across biomes)."

requirements-completed: [GAME-03]

# Metrics
duration: ~55min
completed: 2026-09-26
---

# Phase 4 Plan 3: Room Layout Templates Summary

**12 hand-authored per-biome room layout templates (pillar/wall/pit obstacles in normalized coordinates) replace random 0-3 pillars, with shape-aware collision for circles and rects, pit-vs-wall projectile blocking, obstacle-aware enemy spawning, and smoke-proven bounds/clearance/reachability for every template.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3
- **Files modified:** 5 (js/data.js, js/rooms.js, js/entities.js, js/game.js, test/smoke.js)

## Accomplishments
- `DATA.LAYOUTS` ships 3 templates per biome (12 total): Naraka (Iron Colonnade, Forge Cross, Chained Pits), Patala (Serpent Coil, Twin Abyss, Naga Halls), Ranabhoomi (Broken Chariots, The Trench, Ring of Banners), Vaitarani (The Fords, Bone Islands, Ferry Posts) — all validated in-bounds with >=80px spawn clearance and >=58px door clearance, and reachable from spawn to every door candidate via a 10px-grid flood-fill.
- `ROOMS.materializeLayout/obstacleDist/pointBlocked/blocksProjectile/layoutsFor` are pure geometry helpers with no rendering dependency; legacy shape-less circle pillars still work everywhere (default `shape:'circle', kind:'pillar'`).
- `clampToArena` generalized to push entities out of circles AND rects (closest-point + center-inside cases), always re-clamped to arena bounds afterward so a push-out can never eject an entity through the outer wall.
- Both projectile loops (`pprojectiles`/`eprojectiles`) now call `ROOMS.blocksProjectile(p)`: pillars/walls stop projectiles, pits let them fly over.
- `renderObstacles(ctx)` (delimited, in `renderBackground`'s call site) draws pillar (unchanged look), wall (drop-shadow + top face + accent stroke), and pit (double-darkened fill + dashed accent edge) using only existing Canvas primitives and the biome palette.
- `buildArena(isBoss, forceId)` picks a random per-biome template that's never the same as the immediately preceding one, materializes it into `GAME.pillars`, and records `ROOMS.layoutHistory` (capped at 200); biomes with no templates fall back to the legacy random-pillar generator; boss arenas remain open.
- `spawnWave` rejects spawn points blocked by an obstacle (40 tries), with a guaranteed-free coarse-grid fallback scan of the arena's right 70% if all randomized tries fail.

## Task Commits

1. **Task 1: DATA.LAYOUTS (12 templates) + ROOMS geometry helpers + static layout validation smoke** - `4b115c4` (feat)
2. **Task 2: Shape-aware collision (entities) + projectile blocking hook and obstacle drawing (game.js)** - `a11b015` (feat)
3. **Task 3: Template-driven buildArena + obstacle-aware enemy spawns + runtime variety smoke** - `32603c0` (feat)

## Files Created/Modified
- `js/data.js` — `DATA.LAYOUTS` (12 templates across 4 biomes).
- `js/rooms.js` — `layoutsFor/materializeLayout/obstacleDist/pointBlocked/blocksProjectile/findClearSpawnPoint`; `buildArena(isBoss, forceId)` rewritten to be template-driven with a legacy fallback; `spawnWave` obstacle-aware with a guaranteed-free fallback.
- `js/entities.js` — `clampToArena` generalized for circle + rect obstacles, re-clamped to arena bounds after push-out.
- `js/game.js` — both projectile loops call `ROOMS.blocksProjectile(p)`; new delimited `renderObstacles(ctx)` method + its one call site in `renderBackground` (replacing the old inline pillar-draw block).
- `test/smoke.js` — static layout validation (count/uniqueness/bounds/clearance/reachability), collision unit checks (rect push-out, legacy circle compat, pit-vs-wall projectile blocking with a live combat room), obstacle draw-path smoke, runtime variety (>=4 distinct templates, no immediate per-biome repeat), and forced-template spawn safety for all 12 templates.

## Decisions Made
- See `key-decisions` above (re-clamp after rect push-out, fallback spawn-scan region, per-biome-isolated variety test to avoid a shared-`lastLayoutId` test artifact).

## Deviations from Plan
None — plan executed as written. All 12 starting template coordinates from the plan passed bounds/clearance/reachability validation without needing the discretionary nudge the plan anticipated.

## Issues Encountered
None.

## Next Phase Readiness
- `GAME.pillars` entries now carry `shape`/`kind`; 04-04 (hazards) can reuse `ROOMS.pointBlocked`/`obstacleDist` for hazard placement checks if needed, but hazards are data-driven separately per `DATA.HAZARDS` (no dependency either way).
- `ROOMS.layoutHistory` is available for any future debug/telemetry overlay.
- Non-blocking playtest note carried over from 04-CONTEXT.md: enemies still slide along obstacles without real pathfinding (deferred, D-14 scope); check Naga Halls lanes and Fords chokepoints feel fair against ranged enemies (`naga`/`preta`/archers) once VFX/hazards from Phase 3/04-04 are layered in.

---
*Phase: 04-gameplay-depth*
*Completed: 2026-09-26*
