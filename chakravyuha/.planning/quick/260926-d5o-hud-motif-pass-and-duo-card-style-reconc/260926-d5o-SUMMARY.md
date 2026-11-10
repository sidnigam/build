---
quick_id: 260926-d5o
type: quick
requirements: [ART-05]
files-modified:
  - js/ui.js
  - js/game.js
  - test/smoke.js
completed: 2026-09-26
---

# Quick 260926-d5o: HUD motif pass + duo card style reconciliation — Summary

**Closed the ART-05 gap flagged in 02-09: the canvas-drawn in-run HUD (`GAME.renderHUD`) now carries the same gold/plum/lotus Indian-motif language as the DOM overlay panels, and duo boon cards now drive the 02-09 `.card.duo` CSS via classes + `--god`/`--god2` vars instead of ad-hoc inline styles.**

## Task 1 — Duo card reconciliation (js/ui.js)

In the `offerBoon` `def.duo` branch:
- `card.className` now built as `['card','boon-card','duo','god-'+def.gods[0],'rarity-'+rarity].join(' ')` (matches the convention used by single-god boon/amrit cards elsewhere in the file).
- `card.style.cssText = '--god:'+gA.color+';--god2:'+gB.color+';--rarity:'+R.color` set as the first style write (per the 02-09 headless-stub ordering rule — cssText replaces the whole inline style, so it must come before any other `card.style.*` write). There were no other per-property style writes left to reorder after removing the inline background/boxShadow/borderColor below.
- Removed the inline `background` (linear-gradient), `boxShadow`, and `borderColor` — all now covered by the existing `.card.duo` CSS rule (`border-image` + `::before`/`::after` gradients driven by `--god`/`--god2`), which 02-09 added preemptively for this exact hookup.
- Kept `card.duo = true` and the DUO innerHTML text unchanged.
- No `dataset`/`setAttribute`/`style.setProperty`/`querySelector` used.

## Task 2 — Canvas HUD motif pass (js/game.js, `renderHUD` + new `_hud*` helpers)

Restyled only inside `renderHUD` plus four small new private helper methods placed directly after it in the `GAME` object (`_hudPanel`, `_hudOrnament`, `_hudDiamond`, `_hudLotus`):

- **HP bar:** plum/black rounded backing panel (`_hudPanel`, double gold border), gold diamond end-caps (`_hudDiamond`), vertical-gradient red fill (guarded `createLinearGradient` pattern — falls back to a flat color if the gradient object or `addColorStop` isn't present, matching the smoke ctx Proxy stub exactly). Low-HP (<35%) pulse via `ctx.globalAlpha`, skipped when `SETTINGS.get('screenFlash') === false` (guarded with `typeof SETTINGS === 'undefined'`).
- **Dash pips:** gold-outlined diamonds (`_hudDiamond`), teal fill only when charged.
- **Cast pips:** new `_hudLotus` helper draws an 8-petal rosette (8 rotated ellipses/arcs, guarded `ctx.ellipse` with an `arc` fallback), filled gold when charged, faint gold outline-only when empty.
- **Special cooldown bar:** gold-bordered track, fills gold when ready (was white before).
- **Control hint:** switches between `SPECIAL [LT / X]` (`INPUT.device === 'pad'`) and `SPECIAL [E / RMB]` (default/kbm).
- **Biome/room title:** unchanged position and text; gained a `_hudOrnament` gold rule + centered diamond underneath, and (guarded) a smaller Devanagari biome-name line from `UI.DEVANAGARI.biomes[this.biome.id]` when present. The run-clock line was shifted down (52 → 66px) only when the Devanagari line is shown, so nothing overlaps.
- **Currencies:** same text positions; added a subtle dark backing plate with a gold hairline behind both currency lines.
- **Boon icon column:** added an outer gold hairline frame per icon slot, kept the existing rarity-colored stroke and god-color glyph fill.
- All new drawing is guarded against the smoke test's `ctx` Proxy stub: `roundRect`/`ellipse` are feature-tested before use (the stub returns a harmless no-op function for any unrecognized property, so both branches are always safe), and the gradient guard follows the plan's exact `(g && g.addColorStop) ? (...) : fallback` pattern.

## Task 3 — Smoke asserts (test/smoke.js, append-only)

Appended one new section at the end of the file, after the existing hazard/full-run checks and before the final pass/fail summary:
1. `GAME.renderHUD(__ctx)` is called once with `INPUT.device = 'pad'` and once with `'kbm'` during a live (`state === 'combat'`) run — asserts neither call throws.
2. A duo card is produced via the existing 04-02 duo-offer pattern (`DATA.DUO_BOONS[0]`, granting each god's prerequisite boon, then `UI.offerBoon(d.gods[0])`) and asserted to have `className` containing `'duo'` and `style.cssText` containing `'--god2'`.

Both new checks pass; full suite (2262 lines) is green.

## Verification

- `node test/smoke.js` run after every task: **ALL SMOKE TESTS PASSED** each time (final run tail: `ok renderHUD does not throw...`, `ok duo boon card carries the duo class and a --god2 CSS var...`, `ALL SMOKE TESTS PASSED`).
- `grep -n "_hud" js/game.js` confirms all four helpers are defined and called from `renderHUD`.

## Deviations from Plan

None — plan executed exactly as written. No architectural questions arose; no auth gates encountered.

## Commits

1. `92e2f83` — feat(quick-260926-d5o): duo boon cards use .card.duo CSS vars
2. `c5ead26` — feat(quick-260926-d5o): canvas HUD Indian-motif restyle
3. `168d20d` — test(quick-260926-d5o): assert HUD motif render + duo card style

## Files Modified

- `js/ui.js` — `offerBoon`'s `def.duo` branch only.
- `js/game.js` — `renderHUD` body plus four new `_hud*` helper methods added directly after it.
- `test/smoke.js` — one new append-only assertion block at the end of the file.

## Known Stubs

None. No new data sources or placeholder content were introduced; this is a pure restyle of existing, already-live HUD/card rendering paths.

## Self-Check: PASSED

- FOUND: js/ui.js (duo branch edited, verified via `git show 92e2f83`)
- FOUND: js/game.js (renderHUD + `_hudPanel`/`_hudOrnament`/`_hudDiamond`/`_hudLotus`, verified via `grep -n "_hud" js/game.js`)
- FOUND: test/smoke.js (two new `check(...)` calls, both `ok` in the latest run)
- FOUND commit 92e2f83, c5ead26, 168d20d (`git log --oneline -5`)
- `node test/smoke.js` → ALL SMOKE TESTS PASSED (re-run after all three tasks)
