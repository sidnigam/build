---
quick_id: 260927-qze
type: quick
autonomous: true
files_modified: [js/game.js, js/glyphs.js, test/smoke.js]
must_haves:
  truths:
    - "HUD DASH/ASTRA/SPECIAL legend: glyph badges and label text never overlap, for keyboard, PS and Xbox families"
    - "Legend stays clear of the HP panel, pips and special bar; all text >= 10px"
    - "node test/smoke.js green"
---

# Quick 260927-qze: Fix HUD glyph legend overlap

Evidence (headless Chrome, merged build): under the dash pips / cast pips / special bar, the 05.2-03 legend drew glyph badges on top of their labels — "Q" overlaps "ASTRA" (reads "QTRA"), "E" and "RMB" badges overlap "SPECIAL"; "Space" sits under the dash pips with no label.

## Task 1 — Layout fix (js/game.js renderHUD legend block; js/glyphs.js drawTokens only if it lacks width measurement)
- Lay out each legend item as `[badge(s)] LABEL` left-to-right with measured widths: use `ctx.measureText` (guarded fallback width = chars*6.5 for the smoke stub) and have `GLYPHS.drawTokens` return the total drawn width (add a return value if missing, without changing its signature for existing callers).
- Place the three items on one row below the pips/special bar with ≥10px gaps between items; if the row would exceed ~300px, wrap SPECIAL to a second row. Keep y clear of the HP panel and pips (≥4px).
- Verify visually: start `python3 -m http.server 8095` in the background from the chakravyuha dir, run `node tools/browser-check.mjs <outdir> 8095` (outdir under /private/tmp/claude-501/-Users-sidnigam-Documents-coding-build-chakravyuha/1d54dd11-935d-453d-b5f2-51d5ff78390e/scratchpad/qze), and Read 01-spawn.png (crop/zoom the top-left 400x120 region with sharp before reading) for the keyboard case; the script also switches INPUT.device to 'pad' — check that screenshot too. Stop the server afterwards.
## Task 2 — Smoke assert (append-only)
- With a recording ctx stub that logs fillText x/width and badge rects, assert that for kbm and pad (ps family) the legend items' horizontal extents don't overlap.

Commit each task (`fix(quick-260927-qze): ...`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; explicit paths only. Full `node test/smoke.js` green before each commit (use SMOKE_FAST=1 while iterating). Write 260927-qze-SUMMARY.md (don't commit). Don't edit ROADMAP/STATE.
