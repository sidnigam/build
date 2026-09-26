---
quick_id: 260926-dcz
type: quick
requirements: [ART-04, ART-05]
files-modified:
  - js/sprites.js
  - js/game.js
  - test/smoke.js
completed: 2026-09-26
---

# Quick 260926-dcz: Arena readability polish — Summary

**Darkened/vignetted the illustrated arena floor, restyled obstacles as beveled carved-stone with gradient-based dark-void pits, and fixed two HUD label overlaps (SPECIAL hint on the HP bar, Devanagari biome name on the ornament diamond) — closing the ART-04/ART-05 readability gap flagged after merging the 02-08 biome backgrounds.**

## Task 1 — Floor readability (js/sprites.js CFG + js/game.js renderBackground)

- `SPRITES.CFG.BG_FLOOR_TINT` raised 0.35 → 0.55; new `SPRITES.CFG.BG_FLOOR_DARKEN` (0.25 flat black) added and applied over the tint, inside the arena only, after the existing biome-tint wash.
- New soft radial vignette (center transparent → edge ~0.35 black) drawn inside the arena, guarded with `ctx.createRadialGradient && ... && grad.addColorStop` (skips cleanly if unsupported — smoke's ctx stub always supports it, so the assertion below exercises the real gradient path).
- Only the `hasBg` branch changed; the primitive (no-bg) fallback path is untouched.
- Mandala pattern, walls, zones, doors — all still drawn above the new wash, unchanged.

## Task 2 — Stone obstacles + pits (js/game.js renderObstacles)

- **Rect walls:** drop shadow (offset 0,+6 @ ~0.45 black), body in `biome.wall`, top/left highlight bevel and bottom/right dark bevel (via existing `shadeMix` toward white/black at 0.35), 2–3 deterministic mortar lines seeded from `Math.floor(o.x)*13 + Math.floor(o.y)*7` (no `Math.random` — same seed always produces the same line count/position for a given wall), accent hairline kept at `+'40'` (≤ 0x40 alpha, per constraint).
- **Circular pillars:** same drop shadow, plus a guarded radial gradient bevel (light corner → dark rim) with a `shadeMix` fallback if gradients are unavailable, a capital ring at r*0.82, and the accent hairline moved to r*0.6 (unchanged position), both ≤ 0x40 alpha.
- **Pits:** replaced the old two-flat-fill look with a guarded radial gradient from pure black center to `biome.bg` at the rim (falls back to `rgba(0,0,0,0.6)` flat fill if gradients are unsupported), a new thin inner shadow ring (`rgba(0,0,0,0.5)`, 3px), and a thinner/subtler dashed accent rim (`lineWidth` 2→1.2, dash `[6,5]`→`[5,6]`, alpha `'66'`→`'40'`).
- Collision geometry (`o.x/o.y/o.w/o.h/o.r`) untouched everywhere — this is draw-only. No per-frame randomness introduced.

## Task 3 — HUD label fixes (js/game.js renderHUD)

- SPECIAL control hint moved from `by+26` (which sat on the HP bar/panel's lower border) to `by+58` — now below the dash/cast pip row and the special cooldown bar, with clearance from both the HP panel (ends `by+22`ish) and the pip diamonds/lotus (bounding roughly `by+27` to `by+45`).
- Devanagari biome name moved from y=52 to y=58 so its (11px font) glyph top clears the HUD ornament diamond's bounding box (diamond center y=40, half-diagonal ≈5.7px → bottom edge ≈45.7), giving >3px clearance. Font size kept at 11px (already met the `>=11px` truth).
- Run-clock line, which only shifts when the Devanagari line is shown, moved from `66` to `72` to keep pace with the Devanagari line's new position (preserves the original ~14px gap between the two lines).
- Appended one new smoke assertion (append-only, after the existing 260926-d5o block): starts a run, sets `GAME.pillars` to a layout containing a rect wall, a circle pillar, a rect pit, and a circle pit, then calls `renderBackground` + `renderObstacles` + `renderHUD` for every `DATA.BIOMES` entry, asserting none of the three throw.

## Verification

- `node test/smoke.js` run after every task: **ALL SMOKE TESTS PASSED** each time; final full run tail: `ok renderBackground + renderObstacles + renderHUD run without throwing for each biome (rect walls, circle pillars, pits)`, `ALL SMOKE TESTS PASSED`.
- Visual (headless-Chrome `cdp-check.mjs`, Naraka biome, moving-player screenshot):
  - **Before:** illustrated stone floor at full brightness/tint, ~52px player sprite and enemy dots visually lost against the busy texture, fire-vent telegraph rings barely visible, Phase 4 cross-wall rendered as two flat red rects, "SPECIAL [E / RMB]" text sitting on/overlapping the HP bar's lower border, Devanagari "नरक" squeezed directly under the ornament diamond.
  - **After:** floor reads calm and dark (tint+darken+vignette combined), player sprite/enemies/telegraph rings clearly pop off the background, pits render as true dark voids (black center → biome-tinted rim) instead of flat gray discs, a circular pillar shows a clear beveled/highlighted stone-capital look, "SPECIAL [E / RMB]" now sits in its own row below the pips/bar with clear gaps on all sides, and "नरक" sits cleanly below the ornament diamond with visible gap.
  - Note: neither randomly generated verification room happened to include a rect wall obstacle in frame, so the rect-wall bevel/mortar look was verified by code review + the smoke assert (which does exercise a rect wall via `GAME.pillars`) rather than by direct screenshot; the circle-pillar and pit renders were directly screenshot-verified.

## Deviations from Plan

None — plan executed exactly as written. No architectural questions arose; no auth gates encountered.

## Commits

1. `59c0417` — feat(quick-260926-dcz): darken + vignette illustrated arena floors
2. `52e544c` — feat(quick-260926-dcz): carved-stone obstacle rendering + dark-void pits
3. `a5f516a` — feat(quick-260926-dcz): fix HUD SPECIAL label + Devanagari overlap

## Files Modified

- `js/sprites.js` — `SPRITES.CFG` tunables only (`BG_FLOOR_TINT` value change, new `BG_FLOOR_DARKEN`).
- `js/game.js` — `renderBackground` (arena-floor `hasBg` branch only), `renderObstacles` (full rewrite of the draw-only body), `renderHUD` (SPECIAL hint + Devanagari/run-clock y-offsets only).
- `test/smoke.js` — one new append-only assertion block at the end of the file.

## Known Stubs

None. No new data sources or placeholder content were introduced; this is a pure rendering/readability restyle of existing, already-live arena/obstacle/HUD draw paths.

## Self-Check: PASSED

- FOUND: js/sprites.js (`BG_FLOOR_TINT`/`BG_FLOOR_DARKEN`, verified via `grep -n "BG_FLOOR" js/sprites.js`)
- FOUND: js/game.js (`renderBackground` vignette block, `renderObstacles` rewrite, `renderHUD` y-offset changes — verified via `git show` on each commit)
- FOUND: test/smoke.js (new `check(...)` call for the readability-polish assert, `ok` in the latest run)
- FOUND commits 59c0417, 52e544c, a5f516a (`git log --oneline -5`)
- `node test/smoke.js` → ALL SMOKE TESTS PASSED (re-run after all three tasks)
