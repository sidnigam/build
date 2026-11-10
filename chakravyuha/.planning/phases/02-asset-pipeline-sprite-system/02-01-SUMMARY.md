---
phase: 02-asset-pipeline-sprite-system
plan: "01"
subsystem: asset-pipeline
tags: [sprites, headless, animation-grouping, npm, package-json, smoke-test]
dependency_graph:
  requires: []
  provides: [SPRITES-global, package-json, npm-dev-deps, smoke-sprites-assertions]
  affects: [02-02-pixi-renderer, 02-03-atlas-packer, test/smoke.js]
tech_stack:
  added: [free-tex-packer-core@0.3.8, sharp@0.35.2]
  patterns: [vanilla-JS-global, headless-guard, pure-function-animation-grouping]
key_files:
  created:
    - package.json
    - .gitignore
    - package-lock.json
    - js/sprites.js
  modified:
    - index.html
    - test/smoke.js
key_decisions:
  - "PixiJS NOT added to npm — vendored as pixi.min.js script tag in Plan 02 to preserve no-module-system pattern"
  - "Headless guard checks typeof navigator (not document) — smoke sandbox has document but no navigator (RESEARCH Pitfall 3)"
  - "groupFramesByAnimation is a pure function with no Pixi dependency — runs headless and is tested directly"
metrics:
  duration_minutes: 5
  completed_date: "2026-06-20"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 2
---

# Phase 02 Plan 01: Asset Pipeline Foundation Summary

**One-liner:** Headless-safe SPRITES vanilla-JS global with navigator guard, animation-grouping pure function, npm devDep tree (free-tex-packer-core + sharp), wired into index.html and smoke tests green.

## What Was Built

The universal gate for all Phase 2 plans:

1. **package.json** — first npm dependency manifest for the project. devDependencies: `free-tex-packer-core@0.3.8` (atlas packing CI tool) and `sharp@0.35.2` (image processing). PixiJS deliberately excluded — vendored as a `<script>` tag in Plan 02 to avoid introducing a module system. `scripts.test` points to `node test/smoke.js`.

2. **js/sprites.js** — vanilla-JS global `SPRITES` mirroring the `CAMERA` pattern from `renderer.js`. Key design decisions:
   - D-05 headless guard at the top of `init()` and `load()`: `if (typeof navigator === 'undefined' || typeof document === 'undefined') return;` — fires in the smoke sandbox which has `document` but NOT `navigator`
   - `has(key)` returns `false` when `ready === false`, so all game entities fall through to their existing primitive `draw()` path (D-11 / RENDER-02 fallback)
   - `groupFramesByAnimation(frameNames)` is a pure function (no Pixi) that groups `{actor}_{state}_{n}.png` frames by animation state and sorts ascending by numeric index — ready for PixiJS `animations` block in Plan 02
   - `init()` and `load()` bodies are guarded stubs with comments pointing to Plan 02 fill-in points

3. **index.html** — `js/sprites.js` wired as script tag immediately after `js/renderer.js` and before `js/audio.js`

4. **test/smoke.js** — three new assertions added after the boot check:
   - `SPRITES.ready === false` (headless guard works)
   - `SPRITES.has('player') === false` (zero-asset fallback fires)
   - `SPRITES.groupFramesByAnimation([...shuffled...])` groups and sorts correctly (RENDER-03)

## Verification Results

`node test/smoke.js` exits 0 with all 20 checks green, including the 3 new SPRITES checks.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `SPRITES.init()` body: stub with `// Plan 02: Application.init() goes here` — intentional, Plan 02 fills in PixiJS `Application.init()`
- `SPRITES.load()` body: stub with guarded no-op — Plan 02 fills in `Assets.load()` per atlas and `sheets` population
- `SPRITES.createAnimatedSprite()`: returns `null` when `ready === false` — stubs the PixiJS `AnimatedSprite` construction deferred to Plan 02

These stubs are intentional and documented. The plan's goal (infrastructure foundation + smoke assertions) is fully achieved. No data flows through stubs to UI rendering — stubs only affect the Pixi path which requires assets and a real browser context.

## Self-Check

Files created exist:
- [x] package.json
- [x] .gitignore
- [x] js/sprites.js
- [x] test/smoke.js (modified)
- [x] index.html (modified)

Commits exist:
- [x] 122054e — chore(02-01): create package.json
- [x] 67c3784 — feat(02-01): create headless-safe SPRITES global
- [x] e615678 — test(02-01): extend smoke harness with SPRITES assertions
