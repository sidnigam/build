---
quick_id: 260926-dcz
type: quick
autonomous: true
files_modified: [js/game.js, js/sprites.js, test/smoke.js]
requirements: [ART-04, ART-05]
must_haves:
  truths:
    - "With an illustrated biome bg, the arena floor is calm enough that player sprite, enemies, telegraphs and hazards read clearly (darker wash + soft vignette)"
    - "Obstacles look like carved stone set into the floor (bevel, drop shadow, top highlight) instead of flat colored rectangles/circles; pits read as dark voids"
    - "HUD SPECIAL label no longer overlaps the HP bar/pips; Devanagari biome name is legible (>=11px) and does not collide with the ornament rule"
    - "node test/smoke.js stays green"
---

# Quick 260926-dcz: Arena readability polish

Evidence: headless-Chrome screenshot of a Naraka room after merging 02-08 backgrounds: the illustrated floor inside the arena is brighter/busier than the dimmed surround, so the ~52px player sprite and circle telegraphs (fire vents) get lost; the Phase 4 cross-wall renders as two flat red rects; HUD "SPECIAL [E / RMB]" text sits on the HP bar's lower border; the Devanagari name under the biome title is ~9px and overlaps the ornament diamond.

## Task 1 — Floor readability (js/sprites.js CFG + js/game.js renderBackground top section only)
- Raise `SPRITES.CFG.BG_FLOOR_TINT` default to ~0.55 and add `BG_FLOOR_DARKEN` (~0.25 black) applied inside the arena after the tint; add a soft radial vignette inside the arena (center transparent → edges ~0.35 black) using a guarded radial gradient (`ctx.createRadialGradient` may be a stub in smoke — feature-test like 260926-d5o did). Keep the mandala pattern above the wash. Tunables live in SPRITES.CFG.
- Only the `hasBg` branch changes; the primitive fallback path is untouched.
- verify: `node test/smoke.js`

## Task 2 — Stone obstacles + pits (js/game.js renderObstacles only)
- Walls/pillars: soft drop shadow offset (0, +6) at ~0.45 black; body in biome.wall; 2-3px top/left highlight edge (shadeMix toward accent/white ~0.35) and bottom/right dark edge; a few deterministic "mortar" lines (seeded from obstacle x/y, not random per frame) for rect walls; circular pillars get a capital ring + inner shading. Accent hairline stays subtle (alpha ≤ 0x40).
- Pits: radial gradient from pure black center to biome.bg at the rim (guarded), dashed accent rim kept but thinner/subtler; a thin inner shadow ring.
- Keep collision geometry untouched — drawing only. Deterministic per-frame output (no Math.random in draw).
- verify: `node test/smoke.js`

## Task 3 — HUD label fixes (js/game.js renderHUD / _hud* helpers only)
- Move the SPECIAL control hint so it sits to the right of the special bar or below it with ≥4px clearance from the HP panel and pips; keep ≥10px font.
- Devanagari biome name: ≥11px, positioned below the ornament rule with ≥3px clearance (shift run clock down a few px if needed so nothing overlaps).
- Append a smoke assert (test/smoke.js, append-only) that renderBackground + renderObstacles + renderHUD run without throwing for each of the 4 biomes with a layout that includes rect walls, circle pillars and pits (reuse existing Phase 4 smoke helpers/patterns).
- verify: `node test/smoke.js`

Constraints: only the named files/regions. Commit each task atomically (`feat(quick-260926-dcz): ...`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; explicit paths only. Write 260926-dcz-SUMMARY.md (don't commit). Don't edit ROADMAP/STATE.
