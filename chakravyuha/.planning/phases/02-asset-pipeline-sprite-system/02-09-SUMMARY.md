---
phase: 02-asset-pipeline-sprite-system
plan: 09
subsystem: ui / css-svg art
tags: [css, inline-svg, mask-image, color-mix, devanagari, boon-cards]

requires:
  - phase: 02-CONTEXT-AMENDMENT (D-16a)
    provides: Decision that UI art (ART-05) is CSS/inline-SVG code-drawn, not AI-generated
provides:
  - Indian-motif CSS token system in index.html :root (gold/god/rarity/spacing tokens, --font-dev stack)
  - Inline-SVG data-URI flourishes used as CSS masks/background-images: lotus corner (+3 mirrored variants), ornament rule, 8-petal mandala, temple-toran band (plain + gold-baked)
  - God-tinted, rarity-accented, lotus-cornered, mandala-watermarked .card theming, plus a .card.duo two-god gradient border variant
  - Ornate .panel-h ornament rules, toran-banded .panel.solid, Devanagari accents on shop/shrine/armory/codex/pause/death/victory via CSS content
  - UI.DEVANAGARI name maps (gods/biomes/bosses/amrit) and god-*/rarity-* card classes + --god/--rarity CSS custom properties wired from js/ui.js
affects: [02-10, 02-11, phase-4-gameplay-depth (duo boon cards), phase-7-store-page (AI-DISCLOSURE UI-art note)]

tech-stack:
  added: []
  patterns:
    - "Indian-motif ornament as zero-asset inline-SVG data URIs used two ways: (1) monochrome art as a CSS mask-image, tinted at runtime via background-color = var(--god, var(--gold)) so the same SVG works for any god/rarity color; (2) a second baked-gold-color copy (--svg-toran-gold) used directly as background-image where masking isn't convenient (repeating panel bands)."
    - "Per-instance theming via CSS custom properties set on element.style.cssText (headless-stub-safe: no dataset/setAttribute/style.setProperty/querySelector), consumed by var(--god, fallback) / var(--rarity, fallback) in CSS so untyped cards (shop/shrine/armory) still get a sensible default tint."
    - "prefers-reduced-motion: no-preference gate wraps the only new animation (epic-rarity shimmer via animated background-position on a diagonal highlight layer); base state is a static, still-visible diagonal glow when motion is reduced."

key-files:
  created: []
  modified:
    - index.html
    - js/ui.js

key-decisions:
  - "Wrote UI.className assignment for boon/amrit cards via `['card','boon-card','god-'+id,'rarity-'+n].join(' ')` instead of string concatenation with an embedded leading space, so the class-name tokens are unambiguous and match the plan's own automated grep check for a standalone 'rarity-' literal."
  - "card.style.cssText is always set before card.style.borderColor (per the plan's headless-stub constraint: cssText replaces the whole inline style, so any per-property assignment must come after it)."
  - "Shop/shrine/armory cards (no single 'god' owner) get a fixed thematic --god value (Kubera gold #ffcf5c / punya purple #c77dff / gold #ffd34d) rather than no var at all, so the shared .card lotus-corner and gradient theming still reads correctly instead of falling back to a flat default everywhere."
  - "#pause keeps plain `.panel` (not `.panel.solid`) so its existing semi-transparent backdrop and the Phase-3 accessibility toggles (.a11y block) are untouched; only its `.menu-btns::before` gained a small Devanagari 'विराम' label above the button stack."
  - "#settings (Phase 5's own panel) is `.panel.solid` like shrine/armory/codex, so it inherits the new toran bands + ornament box-shadow automatically. Its own `<style id=\"settings-css\">` block was left completely untouched, per the execution note."
  - ".card.duo is a CSS-only hook (border-image + tinted ::before/::after using --god/--god2) added preemptively for the parallel Phase-4 agent's small `duo` class addition to boon cards; no markup for it was added here."

requirements-completed: [ART-05]

duration: ~35min
completed: 2026-09-26
---

# Phase 02 Plan 09: CSS/SVG Indian-Motif UI Pass Summary

**Overlay panels and boon/shop/shrine/armory cards now carry a zero-asset, resolution-independent Indian-motif treatment (gold lotus corners, mandala watermark, temple-toran panel bands, god-tinted gradients, rarity ribbons/glow, and Devanagari headings) built entirely from CSS custom properties and inline-SVG data URIs — no new image files, no AI-generated UI art.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2/2 complete
- **Files modified:** 2 (index.html, js/ui.js)

## Accomplishments

- Added a full design-token layer to `index.html` `:root`: `--gold-deep`, `--gold-soft`, the six god-identity colors, three rarity colors, the 4px-based spacing scale, and a `--font-dev` Devanagari font stack — all matching 02-UI-SPEC values exactly.
- Authored 8 inline-SVG flourishes as CSS custom properties (`--svg-corner` + 3 mirrored variants, `--svg-rule`, `--svg-mandala`, `--svg-toran`, `--svg-toran-gold`), single-quoted internally with `#` encoded as `%23` so they nest cleanly inside a double-quoted `url("data:image/svg+xml;utf8,...")`.
- `.card` now has a god-tinted vertical gradient background (`color-mix(in srgb, var(--god, ...) 10%, #0a0610)`), an inset gold hairline, four lotus corners (multi-layer `mask-image`, one mirrored SVG variant per corner), and a faint bottom-right mandala watermark — all behind the card content via `isolation: isolate` + `z-index: -1`.
- Rarity is now visible independent of the border color: `.rarity-1` adds a blue glow, `.rarity-2` adds a moving diagonal purple highlight sweep (`epicShimmer`, 4s) gated inside `@media (prefers-reduced-motion: no-preference)` — reduced-motion users get the same highlight frozen in its start position, not a hard cut to nothing.
- Added `.card.duo` (border-image + tinted pseudo-elements driven by `--god`/`--god2`) so the Phase-4 parallel agent's small `duo` class addition to boon cards will render a two-god gradient border with no further CSS work.
- `.panel-h` gained flanking ornament-rule pseudo-elements; `.panel.solid` (shop/shrine/armory/codex/**settings**) gained repeating gold toran bands top and bottom plus an inset glow box-shadow.
- Devanagari accents added via CSS `content` (no markup changes) on `#shop`/`#shrine`/`#armory`/`#codex` `.panel-sub::before`, `#pause .menu-btns::before` ("विराम"), `.death-h::after` ("वीरगति"), and `.victory-h::after` ("विजय").
- Buttons gained small gold corner ticks (masked `--svg-corner`, brightening on hover) and `button.primary` gained a faint gold underline rule; `:focus-visible` outlines added to buttons and cards for future keyboard/gamepad nav.
- `js/ui.js`: added `UI.DEVANAGARI` (gods/biomes/bosses/amrit name maps). `offerBoon`/`offerAmrit` set `--god` on `#boon-god` and render a `.god-dev` line; boon/amrit cards get `god-{id} rarity-{n}` classes and `--god`/`--rarity` CSS vars (set via `style.cssText`, then `borderColor` after, per the headless-stub ordering rule). `renderShop`/`shrine`/`armory` cards get a fixed thematic `--god` var. `biomeTitle`/`bossIntro` render a `.bt-dev` Devanagari line.
- No `dataset`, `setAttribute`, `style.setProperty`, or `querySelector` used anywhere in the edits (verified by the plan's own grep check) — safe for the headless `test/smoke.js` `El` stub.

## Task Commits

1. **Task 1: CSS motif system in index.html `<style>`** - `333047e` (feat)
2. **Task 2: ui.js card/panel markup — god/rarity classes + Devanagari maps** - `30ca533` (feat)

_No separate plan-metadata commit was made per this executor's constraints (STATE.md/ROADMAP.md are not touched by this run); this SUMMARY's own commit closes out the plan._

## Files Created/Modified

- `index.html` — CSS-only change, confined to the first `<style>` block (verified byte-identical outside it via a diff of everything after `</style>` and everything before `<style>`). The Phase-5 `<style id="settings-css">` block was not touched.
- `js/ui.js` — `UI.DEVANAGARI` map added; `biomeTitle`, `bossIntro`, `offerBoon`, `offerAmrit`, `renderShop`, `shrine`, `armory` markup/class/style-var changes only. No control-flow, state-transition, or `onclick` changes; card creation order/count unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missed `.bt-name::after` ornament rule and `.bt-dev` style rule in the first CSS edit pass**
- **Found during:** Task 1 self-verification (re-reading the transient-title section against the plan's item 7 before running the automated check).
- **Issue:** The first large `<style>`-block rewrite covered every other required rule but omitted the `.bt-name::after` ornament-rule mask and the `.bt-dev` Devanagari-name rule, which the automated verify script explicitly checks for (`.bt-dev` substring) and which `biomeTitle`/`bossIntro` in `js/ui.js` already reference.
- **Fix:** Added both rules directly after `.bt-name` in a follow-up edit, before running any verification.
- **Files modified:** `index.html`
- **Commit:** folded into `333047e` (caught before the task's commit, not a separate fix commit)

**2. [Rule 3 - Blocking] Class-name string shape didn't match the plan's own automated grep check**
- **Found during:** Task 2 automated verification (first run failed with `missing 'rarity-'`).
- **Issue:** Following the plan's literal example (`'card boon-card god-' + def.god + ' rarity-' + rarity`) produces a JS source string `' rarity-'` (leading space glued to the quote), which does not contain the exact substring `'rarity-'` the plan's own verify script greps for.
- **Fix:** Rewrote both boon-card and amrit-card `className` assignments as `['card', 'boon-card', 'god-' + id, 'rarity-' + n].join(' ')`, which produces the identical resulting class string at runtime but keeps `'rarity-'` as its own literal token in source, satisfying the check. Re-ran the verify script and `node test/smoke.js`; both green.
- **Files modified:** `js/ui.js`
- **Commit:** `30ca533`

No architectural changes; no auth gates encountered.

## Known Stubs

None. This plan only adds CSS/SVG chrome and Devanagari text/class wiring to already-rendered, already-tested UI paths (boon pick, amrit, shop, shrine, armory, codex, biome title, boss intro) — there is no new data source to wire and no placeholder content introduced.

## ART-05 Gap (flagged for orchestrator)

Per 02-CONTEXT-AMENDMENT D-16a and this plan's scope note: the **in-run canvas HUD** (HP bar, boon/astra charge pips, mudra counter — drawn in `GAME.renderHUD` inside `js/game.js`) is **not** covered by this motif pass. `js/game.js` outside the `renderBackground`/`renderEntities` regions is outside Phase 2's file-ownership rules for this plan. A follow-up plan/owner is needed to bring the same gold/lotus/Devanagari treatment to the canvas-drawn HUD bars so the whole UI (DOM overlays + in-run HUD) reads consistently. No code change was attempted for this in 02-09.

## Manual Visual Checks Pending (non-blocking — user is away)

The user is away, so none of the following block completion, but they should be checked by a human pass before art sign-off:

1. Serve the game (`python3 -m http.server 8080` from the `chakravyuha/` directory) and open it in a browser.
2. Open a boon pick multiple times (or trigger via dev console) and confirm each of the six gods (Hanuman orange, Agni red, Indra gold, Vayu teal, Krishna blue, Durga pink) tints its cards' gradient/corners/mandala distinctly, and that `.god-dev` Devanagari names render.
3. Confirm rare (blue glow) and epic (purple glow + moving diagonal shimmer) rarity accents are visibly different from common cards.
4. Open the shop, the Path of Dharma (shrine), the armory, and the codex; confirm each panel shows ornament rules flanking its heading, gold toran bands top/bottom, and its Devanagari `.panel-sub` line ("कुबेर का भंडार" / "धर्म मार्ग" / "शस्त्रागार" / "पोथी").
5. Confirm Devanagari glyphs render with a reasonable fallback font on both macOS and Windows (the `--font-dev` stack lists 5 fallbacks ending in generic `serif`; some environments may only render the final generic serif's placeholder-free Latin substitution for missing glyphs — verify visually, this cannot be checked headlessly).
6. Toggle OS-level "reduce motion" and confirm the epic-card shimmer stops animating (a static diagonal highlight should remain, not full removal of the tint).
7. Trigger the death and victory screens and confirm "वीरगति" / "विजय" render under the headings without crowding the existing `.death-line`/`.run-stats` layout.
8. Confirm the pause panel (Phase 3's accessibility toggles) and the Phase 5 settings panel both still read clearly — pause is plain `.panel` (only gained a small "विराम" label above its buttons), settings is `.panel.solid` and now has toran bands like shrine/armory/codex.

## Self-Check: PASSED

- FOUND: index.html (style-only diff confined to first `<style>` block, verified programmatically — bodies/heads outside it are byte-identical to the pre-plan commit)
- FOUND: js/ui.js
- FOUND commit 333047e (git log --oneline --all)
- FOUND commit 30ca533 (git log --oneline --all)
- `node test/smoke.js` → ALL SMOKE TESTS PASSED (re-run after both tasks)
