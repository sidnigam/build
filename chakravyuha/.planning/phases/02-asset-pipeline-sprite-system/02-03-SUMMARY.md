---
phase: 02-asset-pipeline-sprite-system
plan: 03
subsystem: asset-pipeline
tags: [atlas-packing, provenance, ai-disclosure, free-tex-packer, smoke-test]
dependency_graph:
  requires: [02-01]
  provides: [pack-atlas-toolchain, provenance-ledger, ai-disclosure-draft, provenance-smoke-check]
  affects: [02-04, 02-05, 02-06, test/smoke.js]
tech_stack:
  added: [free-tex-packer-core, sharp]
  patterns: [animations-block-injection, provenance-completeness-gate, vacuous-CI-check]
key_files:
  created:
    - tools/pack-atlas.js
    - tools/check-provenance.js
    - assets/sprites/PROVENANCE.json
    - assets/sprites/AI-DISCLOSURE.md
    - assets/sprites/player/.gitkeep
    - assets/sprites/enemies/.gitkeep
    - assets/sprites/bosses/.gitkeep
    - assets/sprites/biomes/.gitkeep
    - assets/sprites/ui/.gitkeep
  modified:
    - test/smoke.js
decisions:
  - "pack-atlas.js duplicates groupFramesByAnimation locally (not imported from sprites.js) — sprites.js is a browser global, not a CommonJS module; duplication is intentional"
  - "check-provenance.js is vacuously correct with 0 atlases — passes in CI before art plans generate assets; fails loudly on any orphan atlas"
  - "PROVENANCE.json checkpoint_license field left null — filled by Plan 04 commercial-license gate (RESEARCH Pitfall 4)"
metrics:
  duration_minutes: 25
  completed_date: "2026-06-20"
  tasks_completed: 3
  files_created: 9
  files_modified: 1
requirements_satisfied: [ART-06, QA-04]
---

# Phase 02 Plan 03: Atlas Packing Toolchain Summary

Atlas packing toolchain with free-tex-packer-core + animations-block injection (Pitfall 1 fix), ART-06 provenance completeness gate (check-provenance.js), QA-04 Steam AI disclosure draft, and provenance check wired into smoke harness.

## What Was Built

### Task 1: pack-atlas.js with animations-block injection (pre-existing, committed `93305e8`)

`tools/pack-atlas.js` wraps `free-tex-packer-core` with the critical animations-block injection. The free-tex-packer "Pixi" exporter omits the `animations` block that PixiJS AnimatedSprite requires — this tool injects it at pack time so the runtime loader stays dumb. Usage: `node tools/pack-atlas.js <inputDir> <textureName> <outDir>`. Optionally resizes frames with `--size N` via sharp.

Algorithm duplicates `groupFramesByAnimation` from sprites.js (browser global — cannot be required). The injection is additive: frames+meta blocks from free-tex-packer are preserved unchanged.

### Task 2: Provenance ledger, AI disclosure draft, check-provenance.js (committed `ea6f124`)

- `assets/sprites/PROVENANCE.json`: D-13 ledger with `schema_version: 1`, empty `assets[]`, and null `checkpoint_license` field. Art plans 04-06 append entries per generated atlas.
- `assets/sprites/AI-DISCLOSURE.md`: QA-04 disclosure-ready record for Steam's post-Jan-2026 AI Content Survey. Declares assets as "Pre-Generated" AI content (ComfyUI + SDXL, fixed seeds, reproducible workflows). Survey submission deferred to Phase 7.
- `assets/sprites/{player,enemies,bosses,biomes,ui}/.gitkeep`: D-10 directory layout committed to git.
- `tools/check-provenance.js`: ART-06 gate. Exports `checkProvenance(rootDir)` — recursively finds `*-atlas.png`, compares against `PROVENANCE.json assets[].filename`, returns `{ ok, missing, atlases }`. When run directly exits 0 with "provenance ok (N atlases)" or exits 1 listing orphans.

### Task 3: Wire provenance check into smoke harness (committed `afb542f`)

Added provenance-completeness assertion at end of `test/smoke.js` using the existing `check()` helper. Runs in smoke harness's own Node context (plain `require`, not inside the vm sandbox). Passes vacuously with 0 atlases; will fail loudly if any art plan ships an atlas without a provenance entry.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 (TDD RED) | `c1a0afc` | test(02-03): add failing tests for pack-atlas animations-block injection |
| Task 1 (TDD GREEN) | `93305e8` | feat(02-03): create pack-atlas.js with animations-block injection |
| Task 2 | `ea6f124` | feat(02-03): create provenance ledger, AI disclosure, and check-provenance tool |
| Task 3 | `afb542f` | feat(02-03): wire provenance-completeness check into smoke harness (ART-06) |

## Verification Results

All acceptance criteria met:

- `node tools/pack-atlas.js` packs synthetic 1x1 frames into atlas PNG+JSON with injected, correctly-ordered animations block (idle: ascending, run: ascending, frames+meta preserved)
- `node tools/check-provenance.js` exits 0, prints "provenance ok (0 atlases)"
- `node test/smoke.js` exits 0 — 21 checks all passing, including new provenance check
- `assets/sprites/PROVENANCE.json` parses as JSON with `assets[]` (len 0) and `checkpoint_license: null`
- `assets/sprites/AI-DISCLOSURE.md` contains `Pre-Generated` and `# AI Content Disclosure`
- All 5 sprite subdirectories exist with `.gitkeep`

## Deviations from Plan

None — plan executed exactly as written. The previous execution (interrupted) had already completed Tasks 1 and 2; this session resumed from Task 2 commit and completed Task 3.

## Known Stubs

- `PROVENANCE.json assets[]` is intentionally empty — Plans 04-06 append entries per generated atlas. This is not a stub; it is the designed initial state documented in D-13/D-14.
- `checkpoint_license: null` — filled by Plan 04's commercial-license gate (RESEARCH Pitfall 4). Intentional placeholder tracked in PROVENANCE.json schema.

## Self-Check: PASSED

Files verified:
- tools/pack-atlas.js: exists
- tools/check-provenance.js: exists, exports checkProvenance
- assets/sprites/PROVENANCE.json: exists, valid JSON
- assets/sprites/AI-DISCLOSURE.md: exists, contains Pre-Generated
- assets/sprites/player/.gitkeep through ui/.gitkeep: all exist
- test/smoke.js: contains require('../tools/check-provenance.js') and provenance check
- node test/smoke.js: exits 0, 21/21 checks passing
