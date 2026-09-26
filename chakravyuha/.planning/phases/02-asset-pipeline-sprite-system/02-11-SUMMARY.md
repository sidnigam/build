---
phase: 02-asset-pipeline-sprite-system
plan: 11
subsystem: art-pipeline
tags: [comfyui, sdxl, txt2img, rembg, python, provenance, bosses, enemies, contact-sheet, ai-disclosure]

# Dependency graph
requires:
  - phase: 02-08
    provides: "tools/art/* pipeline (comfy_client, prompts.json, finish_sprite/finish_biome, phase2_variant, record_provenance) and 4 biome backgrounds"
provides:
  - "4 boss atlases (tataka, ahiravana, kumbhakarna, yama), each with idle + phase2 frames"
  - "8 enemy atlases (preta, rakshasa, archer, naga, vetala, bhuta, daitya, yatudhana), each idle-only"
  - "assets/sprites/_review/contact-sheet.png for later human art review"
  - "Corrected assets/sprites/AI-DISCLOSURE.md matching the actual generation workflow"
  - "Complete provisional PROVENANCE.json (17 tracked files: 13 atlases + 4 backgrounds)"
affects: [02-10, phase-7-qa]

tech-stack:
  added: []
  patterns:
    - "Cultural-guard rejection is a first-class checklist item, not just subject-correctness: reject any halo/circular-glow backdrop, multi-arm pose, crown/diadem, or lotus/trident on a non-deity character, even when the rest of the image is otherwise clean"
    - "Coordinator/orchestrator mid-task art-direction review can require regenerating an already-committed, already-accepted asset; handled as a `fix(phase-plan):` commit with the old seed recorded in rejected_seeds and the reason documented"
    - "Body-plan-incorrect generations (e.g. a naga with legs instead of a single tail) need a prompt rewrite, not just a new seed -- an anchor concept (e.g. 'shaped like a merman') was more reliable than piling on negative-only phrasing"
    - "A background element (halo disc, decorative border) that looks disqualifying in the raw generation may be cleanly removed by rembg's semantic cutout if it isn't solid/opaque -- always check the *finished* frame before rejecting on background alone"

key-files:
  created:
    - assets/sprites/bosses/tataka-atlas.png
    - assets/sprites/bosses/ahiravana-atlas.png
    - assets/sprites/bosses/kumbhakarna-atlas.png
    - assets/sprites/bosses/yama-atlas.png
    - assets/sprites/enemies/{preta,rakshasa,archer,naga,vetala,bhuta,daitya,yatudhana}-atlas.png
    - assets/sprites/_review/contact-sheet.png
    - tools/art/contact_sheet.py
  modified:
    - tools/art/gen_subject.py
    - tools/art/prompts.json
    - assets/sprites/PROVENANCE.json
    - assets/sprites/AI-DISCLOSURE.md

key-decisions:
  - "Fixed a gen_subject.py pluralization bug (kind_dir 'boss'+'s' -> 'bosss') discovered on the first boss generation; scratch-only impact (assets/sprites/_gen is gitignored) but fixed for correctness and future-session clarity"
  - "Tataka was regenerated mid-plan on orchestrator cultural-review feedback: the first accepted version (multi-armed, crowned, dual-wielding) read as deity iconography (Durga/Kali-coded), violating the hard 'gods are never enemies' rule. Rewrote the prompt to force two arms / no crown-halo-lotus-trident, tightened the global enemy_negative_extra guard project-wide, and re-checked Ahiravana/Kumbhakarna against it (both already compliant, no change needed)"
  - "Yama needed all 5 retries; accepted the least-bad result (missing a staff prop lost to alpha despeckling) over an otherwise-dignified attempt whose background halo disc was so large it made the cutout silhouette unreadable as a person -- prioritized gameplay silhouette readability over prop completeness"
  - "Naga needed all 5 retries to get the D-15a body plan right (human torso + single tail instead of legs, not a divine multi-hooded serpent); a 'shaped like a merman' anchor phrase finally worked after two rounds of negative-only phrasing failed"

requirements-completed: [ART-02, ART-03, ART-06, QA-04]

duration: "~2h 37m wall-clock this session (2026-09-26 08:57-11:34 local), covering the tail end of 02-08 plus all of 02-11"
completed: 2026-09-26
---

# Phase 2 Plan 11: Boss + Enemy Character Art, Contact Sheet, Provenance Finalize Summary

**12 illustrated character atlases (4 bosses with ember/divine phase-2 variants, 8 enemies) generated via local ComfyUI/SDXL txt2img, self-reviewed with an explicit cultural-iconography guard, packed, and recorded as provisional, plus a labelled contact sheet and a corrected AI disclosure.**

## Performance

- **Tasks:** 3 (all complete)
- **Files created:** 12 atlas PNG+JSON pairs, 12 `_raw/{bosses,enemies}/{key}/` directories with finished frames + `.gen.json` sidecars, `tools/art/contact_sheet.py`, `assets/sprites/_review/contact-sheet.png`
- **Files modified:** `tools/art/gen_subject.py` (bugfix), `tools/art/prompts.json` (cultural-guard hardening + per-character prompt iteration), `assets/sprites/PROVENANCE.json`, `assets/sprites/AI-DISCLOSURE.md`
- Generation attempts: 33 total txt2img calls across 12 characters (bosses: 5+1+2+5=13; enemies: 1+2+1+5+1+1+1+1=13... see per-character table below for the exact count per subject)

## Accomplishments
- All 4 bosses (tataka, ahiravana, kumbhakarna, yama) have a packed atlas with `idle` (256px) and `phase2` frames; Yama's phase2 uses the `divine` variant per D-15a, the other three use `ember`
- All 8 enemy archetypes have a packed single-frame `idle` (128px) atlas, each visually distinct by silhouette and palette
- A mid-plan cultural-review correction (Tataka) was applied cleanly: regenerated, old seed recorded as rejected with reason, committed as `fix(02-11)`, and the underlying guard (no multi-arm/crown/halo/lotus/trident on non-deity characters) was hardened project-wide in `prompts.json` so it applies to every remaining subject automatically
- `tools/art/contact_sheet.py` produces a single labelled review PNG: bosses (idle/phase2/silhouette), enemies (idle/silhouette), the player's 4 idle frames, an in-game `r*4`-scaled lineup over a darkened `naraka-bg`, and biome thumbnails
- `assets/sprites/PROVENANCE.json` now tracks 17 files (13 atlases + 4 backgrounds), every entry `review_status: "provisional"`, plus a top-level `review_sheet` pointer
- `assets/sprites/AI-DISCLOSURE.md` rewritten to match the actual workflow (no ControlNet; txt2img with fixed seeds for characters/biomes; img2img only for the player idle frames; phase-2 variants are deterministic post-processing, not additional generation; procedural animation, code-drawn weapons, and CSS/SVG UI are explicitly out of AI scope)

## Task Commits

1. **Task 1: Bosses** - four commits (one per boss, plus one mid-plan correction):
   - `255a512` (feat) — tataka (initial; later superseded)
   - `d1cc0dd` (feat) — ahiravana
   - `8df0ef0` (feat) — kumbhakarna
   - `90c879b` (fix) — tataka regenerated per orchestrator cultural-review
   - `5136da3` (feat) — yama
2. **Task 2: Enemies** - eight commits (one per archetype):
   - `77eee23` preta, `0b33f57` rakshasa, `5295f11` archer, `0b232e1` naga, `cf48a05` vetala, `0bee939` bhuta, `bff7b1d` daitya, `b115072` yatudhana (all feat)
3. **Task 3: Contact sheet + provenance/disclosure finalize** - `94e5f9e` (feat)

**Plan metadata:** (this commit, following SUMMARY)

*(02-08's own commits — tooling, and the naraka/patala-v1/patala-regen/ranabhoomi/vaitarani biome generations — are recorded in `02-08-SUMMARY.md`; this plan's git history starts at `255a512`.)*

## Per-character table

| Character | Kind | Accepted seed | Attempts | Rejected seeds + reasons | Mirrored? | Self-review note |
|---|---|---|---|---|---|---|
| tataka | boss | 52003 (2nd round) | 5 (2nd round; 5 in 1st round, superseded) | 1st round: 52000 (tree-scenery background not cleanly cut out), 52001/52002 (bust-only portrait crop), 52004 (moon-disc halo + tree scenery). 2nd round (post cultural-review): 52000 (two-view turnaround sheet), 52001 (bearded male figure, not the female demoness Tataka is written as), 52002 (male-read again + sun-disc halo + tree/bird scenery), 52004 (busy forest scenery + cropped legs) | No | Two arms, clearly female, no crown/halo, single weapon, plain background, full body head-to-feet. Tusks/fangs/claws did not render clearly within the retry budget -- reads ethereal/feral rather than overtly monstrous; candidate for a future regen pass. A small background wisp near the foot blends acceptably with the ember glow. |
| ahiravana | boss | 52100 | 1 | none | No | Full body, jade-teal sorcerer-king, swirling green sorcerous smoke, bowl of green flame. A faint background sketch doodle was cleanly removed by rembg. |
| kumbhakarna | boss | 52201 | 2 | 52200 (sun-disc halo directly behind figure -- cultural-guard risk) | No | Two arms, huge belly, fanged lion-maned face, golden-yellow/bronze, single mace-staff, clean readable silhouette. |
| yama | boss (divine exception) | 52304 | 5 | 52300 (lost both arms to rembg cutout -- segmentation failure), 52301 (picture-frame border + 4 arms), 52302 (picture-frame border), 52303 (dignified but background halo disc so large the silhouette read as a solid circle) | No | **FLAGGED.** Standing, two arms, crown, dignified serene expression, no fangs/horns/grotesque features, readable humanoid silhouette, no border. Staff prop lost to despeckling. Dignity check passed throughout all 5 attempts -- no demonic/monstrous read at any point. |
| preta | enemy | 63000 | 1 | none | No | Gaunt spectral hungry-ghost, pale sea-green glow, tattered shroud. Thin silhouette fits the emaciated design intent. |
| rakshasa | enemy | 63101 | 2 | 63100 (plain circular disc behind figure -- halo-risk, rejected out of caution) | No | Fanged horned demon warrior, single curved sword, bronze armor, clean readable silhouette. |
| archer | enemy | 63200 | 1 | none | No | Horned asura bowman, dark bronze/ochre-gold armor, drawing a recurve bow. A decorative floating flourish behind the shoulder was mostly removed by despeckling. |
| naga | enemy (cultural care) | 63304 | 5 | 63300 (ornate border frame + full dragon head, not humanoid), 63301/63302 (legs AND a separate tail -- lizardman, not 'tail instead of legs' -- plus dragon heads), 63303 (legs+sandaled feet again, ambiguous double-hood shape) | No | Reworded around a 'shaped like a merman' anchor phrase. Human face/torso, no legs, single continuous tail, one spear (serpent-head haft ornament, not a second body head). A soft background glow was cleanly removed by rembg cutout. |
| vetala | enemy | 63400 | 1 | none | No | Gaunt vampiric corpse-spirit, wide ragged wings, long claws, violet glow. Distinct, highly readable silhouette. |
| bhuta | enemy | 63500 | 1 | none | No | Hulking ghost golem, massive chunky slate blue-grey body. Chunky, highly readable silhouette. |
| daitya | enemy | 63600 | 1 | none | No | Massive horned brute, amber-orange skin, bronze bracers, dual-wielding club+blade (slightly more armed than the single-club prompt, reads fine). |
| yatudhana | enemy | 63700 | 1 | none | No | Magenta-pink robed sorcerer, wide-brimmed hat, bone staff with glowing orb. Distinct silhouette. |

**Total generation calls this plan:** 5 (tataka round 1) + 5 (tataka round 2) + 1 (ahiravana) + 2 (kumbhakarna) + 5 (yama) + 1 (preta) + 2 (rakshasa) + 1 (archer) + 5 (naga) + 1 (vetala) + 1 (bhuta) + 1 (daitya) + 1 (yatudhana) = **31 txt2img calls** for 12 shipped atlases.

## Total generation time

Wall-clock for this resumed session (tail end of 02-08 through the end of 02-11): **2h 37m** (2026-09-26 08:57 - 11:34 local), of which roughly 1h 47m (09:47-11:34) was Task 1 + Task 2 of this plan (boss and enemy generation, review, packing, recording) and the remainder was the tail of 02-08 (patala regen, ranabhoomi, vaitarani) plus Task 3 (contact sheet + disclosure). Average time per accepted 1024x1024 character generation was consistent with 02-08's ~4-4.5 min/image estimate.

## Files Created/Modified
- `assets/sprites/bosses/{tataka,ahiravana,kumbhakarna,yama}-atlas.{png,json}` — boss atlases (idle + phase2)
- `assets/sprites/enemies/{preta,rakshasa,archer,naga,vetala,bhuta,daitya,yatudhana}-atlas.{png,json}` — enemy atlases (idle)
- `assets/sprites/_raw/{bosses,enemies}/{key}/` — finished frames + `.gen.json` sidecars for every character
- `tools/art/contact_sheet.py` — contact-sheet generator
- `assets/sprites/_review/contact-sheet.png` — the review artifact itself
- `tools/art/gen_subject.py` — fixed `kind_dir` pluralization (`boss` -> `bosses`, `enemy` -> `enemies`)
- `tools/art/prompts.json` — cultural-guard hardening (global `enemy_negative_extra` now includes multi-arm/crown/tiara/diadem/lotus/trident guards), plus per-character prompt iteration for tataka, naga, and the three non-yama biomes (from 02-08)
- `assets/sprites/PROVENANCE.json` — 12 new provisional entries, player-atlas status corrected, top-level `review_sheet` added
- `assets/sprites/AI-DISCLOSURE.md` — rewritten to match the actual workflow

## Decisions Made
- Applied the mid-plan orchestrator cultural-review course-correction to Tataka (see Deviations below) and used it as the trigger to harden the shared `enemy_negative_extra` template project-wide, rather than special-casing just the one character.
- For Yama, treated "readable silhouette at gameplay scale" as a harder constraint than "every scripted prop is visible" when all 5 retries had some flaw — a dignified figure missing a staff reads far better in a 144px on-screen boss than a dignified figure whose background halo swallows the whole silhouette into a circle.
- For the naga, abandoned incremental negative-prompt patching after two failed rounds and switched to a positive anchor concept ("shaped like a merman") that the model already has strong, consistent training on for the specific body-plan requirement (human torso, single tail, no legs).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] gen_subject.py `_gen/` output directory pluralization bug**
- **Found during:** Task 1, first boss generation (tataka attempt 0)
- **Issue:** `kind_dir = kind + "s"` produced `"bosss"` and would have produced `"enemys"` for enemy subjects, instead of `"bosses"` / `"enemies"`
- **Fix:** Replaced with an explicit `{"biome": "biomes", "boss": "bosses", "enemy": "enemies"}` mapping; moved the one already-generated tataka attempt into the corrected path
- **Files modified:** `tools/art/gen_subject.py`
- **Verification:** `py_compile` passes; subsequent generations wrote to the correctly-named `_gen/bosses/` and `_gen/enemies/` directories (gitignored, so no committed-file impact from the original bug)
- **Committed in:** `255a512`

### Architectural / Direction Change (orchestrator-directed, not a Rule 1-3 auto-fix)

**2. Tataka regenerated for cultural-constraint compliance**
- **Found during:** Mid-plan, after Task 1's tataka/ahiravana/kumbhakarna commits, via an orchestrator art-direction review message
- **Issue:** The originally-accepted tataka-atlas (seed 52003, first round) was multi-armed, crowned, and dual-wielding a weapon in each hand — deity iconography reading as Durga/Kali-coded, which violates CLAUDE.md's "gods are allies only, never enemies" rule for a boss that must read as an asura/rakshasi, not a goddess
- **Fix:** Rewrote the tataka prompt to force exactly two arms, no crown/halo/diadem/lotus/trident, no multiple weapons; added matching negatives; regenerated (5 more attempts, seed 52003 second-round accepted); hardened the shared `enemy_negative_extra` guard so every remaining subject inherits the same protection; re-verified ahiravana and kumbhakarna against the new guard (both already compliant)
- **Files modified:** `tools/art/prompts.json`, `assets/sprites/_raw/bosses/tataka/*`, `assets/sprites/bosses/tataka-atlas.{png,json}`, `assets/sprites/PROVENANCE.json`
- **Verification:** Visual re-review (two arms, no crown/halo, single weapon); `node tools/check-provenance.js` and `node test/smoke.js` pass
- **Committed in:** `90c879b`

---

**Total deviations:** 1 auto-fixed (Rule 1, tooling bug) + 1 orchestrator-directed correction (cultural constraint, documented above per Rule 2/4 spirit — treated as adding back a missing critical constraint rather than an open-ended architectural change)
**Impact on plan:** No scope creep. The cultural-constraint fix used the existing pipeline exactly as designed (edit prompts.json, regenerate, re-record provenance) and strengthened a guard that benefits every subsequent character.

## Issues Encountered
- Yama and naga each needed all 5 retries to resolve recurring, structurally similar problems (background halo/border risk for Yama; incorrect body plan for naga). Both were resolved within the retry budget by targeted prompt rewrites rather than blind reseeding. See per-character table for details.
- ComfyUI stayed up and reachable throughout; no auth gates; no `--wait-only` resumes were needed (every generation completed within a single Bash call).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ART-02 (8 distinct enemy sprites, minimum 6 required) and ART-03 (4 bosses with phase-2 variants) are satisfied.
- ART-06 / QA-04: every shipped AI asset (17 files: 13 atlases + 4 backgrounds) has a complete provisional `PROVENANCE.json` entry, and `AI-DISCLOSURE.md` matches the actual workflow.
- `node tools/check-provenance.js` reports "provenance ok (17 atlases/backgrounds)".
- `node test/smoke.js` passes.
- 02-10 (weapon overlay + biome background rendering) and any future phase can consume these atlases directly; the game.js manifest already lists every path.
- **Non-blocking human review** (per D-14a, the user is away): open `assets/sprites/_review/contact-sheet.png`, then play one run in the browser once 02-10 wires backgrounds in. Mark each `PROVENANCE.json` entry's `review_status` "approved" or "regenerate". Pay particular attention to:
  - The Yama depiction (dignified judge-deity, not demonic) and the still-open STATE.md design/cultural concern about Yama as a boss encounter at all.
  - The Tataka regeneration (two arms, no deity iconography) — confirm the orchestrator's cultural concern is fully resolved and decide whether the "FLAGGED"-adjacent softer/prettier read (vs. overtly monstrous) needs a further pass.
  - The naga (serpent-folk warrior, not a divine multi-hooded Naga) — confirm the final body plan reads correctly at gameplay scale.

---
*Phase: 02-asset-pipeline-sprite-system*
*Completed: 2026-09-26*

## Self-Check: PASSED
All 12 atlas files, the contact sheet, and all 14 commit hashes (255a512, d1cc0dd, 8df0ef0, 90c879b, 5136da3, 77eee23, 0b33f57, 5295f11, 0b232e1, cf48a05, 0bee939, bff7b1d, b115072, 94e5f9e) verified present.
