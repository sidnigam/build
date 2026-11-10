---
phase: 02-asset-pipeline-sprite-system
plan: 08
subsystem: art-pipeline
tags: [comfyui, sdxl, txt2img, rembg, python, provenance, biomes]

# Dependency graph
requires:
  - phase: 02-04
    provides: locked style checkpoint, sampler/scheduler params, license gate
provides:
  - "tools/art/* reusable pipeline: comfy_client.py (queue/poll/download/sidecar), prompts.json (locked style + all 16 subject prompts/seeds), finish_sprite.py, finish_biome.py, phase2_variant.py, record_provenance.py"
  - "4 biome background PNGs (1280x720) with complete provisional PROVENANCE entries: naraka, patala, ranabhoomi, vaitarani"
  - "check-provenance.js extended to cover *-bg.png and an `incomplete` field-completeness gate"
affects: [02-11, 02-10]

tech-stack:
  added: ["ComfyUI local API (stdlib urllib client)", "rembg u2net (background removal, reused in 02-11)"]
  patterns:
    - "Generate -> self-review with Read tool -> finish -> record_provenance.py idempotent upsert"
    - "Biome ground textures are top-down orthographic with no focal point; retries triggered by composition failures (circular/radial arrangement, stray walls), not just subject errors"
    - "Prompt tuning for palette/tone (saturation, contrast) is done in prompts.json before generation, then --attempt N re-runs with the new text at a new seed"

key-files:
  created:
    - tools/art/comfy_client.py
    - tools/art/prompts.json
    - tools/art/gen_subject.py
    - tools/art/finish_sprite.py
    - tools/art/finish_biome.py
    - tools/art/phase2_variant.py
    - tools/art/record_provenance.py
    - tools/art/README.md
    - assets/sprites/biomes/naraka-bg.png
    - assets/sprites/biomes/patala-bg.png
    - assets/sprites/biomes/ranabhoomi-bg.png
    - assets/sprites/biomes/vaitarani-bg.png
    - assets/sprites/_raw/biomes/*.gen.json
  modified:
    - tools/check-provenance.js
    - assets/sprites/PROVENANCE.json

key-decisions:
  - "patala-bg regenerated once per orchestrator art-direction feedback: seed 41100 (bright green circuit-maze relief) was too saturated/busy; prompt pushed toward dark/muted/low-contrast deep teal-black stone, accepted seed 41101"
  - "ranabhoomi needed 4 attempts: seeds 41200-41202 composed battlefield debris into a circular/radial scene or included a stray wall fragment (fails 'no focal point' / 'no walls' checklist items), not just subject-correctness failures; prompt was tightened toward a seamless scattered-debris texture before the accepted attempt (seed 41203)"
  - "ranabhoomi and vaitarani prompts written from the start with dark/muted/low-contrast palette language per orchestrator guidance, ahead of first generation"

requirements-completed: [ART-04, ART-06]

duration: ~65min generation time across two sessions (session 1: tooling + naraka/patala v1; session 2, this resume: patala regen + ranabhoomi + vaitarani, ~37 min of ComfyUI wall-clock time)
completed: 2026-09-26
---

# Phase 2 Plan 08: Art Pipeline Tooling + 4 Biome Backgrounds Summary

**Stdlib-only ComfyUI/SDXL pipeline (client, locked prompts, finishers, phase2 variant, provenance upsert) plus 4 illustrated 1280x720 biome arena floors, all self-reviewed and recorded as provisional.**

## Performance

- **Tasks:** 3 (all complete)
- **Files modified/created:** 8 new tools/art scripts + README, 1 modified (check-provenance.js), 4 biome PNGs + 4 sidecars, PROVENANCE.json
- Generation attempts: 9 total txt2img calls across 4 biomes (naraka 1, patala 2, ranabhoomi 4, vaitarani 1)

## Accomplishments
- Reusable, resumable ComfyUI API client (`--wait-only` resumes across the Bash 10-minute timeout)
- `prompts.json` locked with the style template and all 16 subject prompts/seeds (4 biomes, 4 bosses, 8 enemies), including the Yama and naga cultural negatives — ready for 02-11 to consume without re-deriving anything
- Post-processing scripts: rembg + despeckle + bottom-aligned trim/resize (sprites), cover-crop to 1280x720 (biomes), ember/divine phase-2 recolor+glow, idempotent PROVENANCE.json upsert
- `check-provenance.js` now matches `*-bg.png` in addition to `*-atlas.png`, and reports an `incomplete` list of entries missing required fields
- All 4 biome arena backgrounds generated, self-reviewed, finished, and recorded

## Task Commits

Each task committed atomically (task 3 spans multiple commits across the resume):

1. **Task 1: Generation tooling** - `d044d03` (feat) — comfy_client, prompts.json, gen_subject, README, `_gen/.gitignore`
2. **Task 2: Post-processing tooling** - `3ecadbe` (feat) — finish_sprite, finish_biome, phase2_variant, record_provenance, check-provenance extension
3. **Task 3: Generate 4 biomes** - four commits:
   - `b7e1016` (feat) — naraka-bg (accepted attempt 0) + patala-bg v1 (accepted attempt 0, later rejected on art direction)
   - `8e9f3d3` (fix) — patala-bg regenerated (dark/muted direction), rejected seed 41100 recorded; ranabhoomi/vaitarani prompts softened ahead of generation
   - `55313c1` (feat) — ranabhoomi-bg (accepted attempt 3, after 3 composition rejects)
   - `976fecd` (feat) — vaitarani-bg (accepted attempt 0)

**Plan metadata:** (this commit, following SUMMARY)

## Per-biome table

| Biome | Accepted seed | Rejected seeds + reasons | File size | Self-review note |
|---|---|---|---|---|
| naraka | 41000 | none | 1.46 MB | Cracked iron-grey basalt with ember seams, even top-down detail, no figures/text/horizon; reads clearly as infernal ground. Orchestrator-accepted as-is (dark stone, ember cracks read well under gameplay). |
| patala | 41101 (v2) | 41100 — accepted at first but flagged by orchestrator art-direction review as too saturated/high-contrast (bright green circuit-maze relief) that would compete with sprites/telegraphs | 1.51 MB | Regenerated with prompt pushed toward dark, muted, low-contrast, deep teal-black underground stone with faint dim bioluminescent moss. Calmer, reads as dim underground floor. |
| ranabhoomi | 41203 | 41200 (circular wheel-and-spear emblem, strong central focal object), 41201 (arc-of-arrows composition + stray corner wall fragment, uneven detail), 41202 (still a circular arrow arrangement) | 1.57 MB | After tightening the prompt to a seamless scattered-debris texture: cracked pebbled dry earth, even detail throughout, no focal object. Muted desaturated tan-umber. |
| vaitarani | 41300 | none | 1.07 MB | Dark slate-grey river stones, even top-down detail, no focal point; muted/low-contrast per art-direction guidance. |

## Generation timing per image (for planning 02-11)

| Subject | Attempt | Generated at (UTC) | Approx wall-clock per call |
|---|---|---|---|
| naraka | 0 (s41000) | 2026-09-25T16:25:28Z | ~4.5 min (prior session) |
| patala | 0 (s41100, superseded) | 2026-09-25T16:29:58Z | ~4.5 min (prior session) |
| patala | 1 (s41101, accepted) | 2026-09-26T13:01:50Z | ~4.3 min |
| ranabhoomi | 0 (s41200) | 2026-09-26T13:08:06Z | ~6.3 min (includes ComfyUI queue warm-up after prior job) |
| ranabhoomi | 1 (s41201) | 2026-09-26T13:12:52Z | ~4.8 min |
| ranabhoomi | 2 (s41202) | 2026-09-26T13:16:26Z | ~3.6 min |
| ranabhoomi | 3 (s41203, accepted) | 2026-09-26T13:20:09Z | ~3.7 min |
| vaitarani | 0 (s41300, accepted) | 2026-09-26T13:24:22Z | ~4.2 min |

Average ~4.3 min/image at 1344x768 on the M1 Pro 16GB. 02-11's characters generate at 1024x1024 (character_size), which should be comparable or slightly faster; budget ~4-5 min per attempt, and expect a similar retry rate (roughly 1-4 retries per subject is plausible, especially for compositionally tricky prompts).

## Files Created/Modified
- `tools/art/comfy_client.py` — stdlib-only ComfyUI API client (queue/poll/download/sidecar, `--wait-only` resume)
- `tools/art/prompts.json` — locked style template + all 16 subject prompts/seeds/palettes
- `tools/art/gen_subject.py` — per-subject generation driver
- `tools/art/finish_sprite.py` — rembg + despeckle + bottom-aligned trim/resize
- `tools/art/finish_biome.py` — cover-crop to 1280x720
- `tools/art/phase2_variant.py` — ember/divine post-processed boss phase-2 variant
- `tools/art/record_provenance.py` — idempotent PROVENANCE.json upsert
- `tools/art/README.md` — pipeline order, self-review checklist, cultural guards
- `tools/check-provenance.js` — extended to `-bg.png`, added `incomplete` field-completeness gate
- `assets/sprites/biomes/{naraka,patala,ranabhoomi,vaitarani}-bg.png` — 1280x720 arena backgrounds
- `assets/sprites/_raw/biomes/*.gen.json` — reproducibility sidecars
- `assets/sprites/PROVENANCE.json` — 4 biome entries (+ existing player entry), all `review_status: "provisional"`

## Decisions Made
- Regenerated patala once per explicit orchestrator art-direction feedback rather than treating the original as final; recorded the superseded seed as a rejected seed with the reason, per D-13a provenance conventions.
- Treated "reads as an even ground texture with no focal point" (checklist item i) as a first-class rejection criterion for ranabhoomi, distinct from subject-correctness failures — SDXL kept composing battlefield debris (arrows, wheel spokes) into a radial/circular "scene," which needed a prompt change (toward "seamless repeating texture, evenly scattered debris") rather than just a new seed, to reliably fix.
- Wrote ranabhoomi/vaitarani prompts with dark/muted/low-contrast language from the start (before their first generation), per the orchestrator's general guidance for the remaining two biomes, rather than generating bright versions first and correcting after.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/art-direction] patala-bg was too saturated and busy**
- **Found during:** Task 3 review at the start of this resumed session (orchestrator feedback, corroborated by direct visual inspection of the accepted PNG)
- **Issue:** seed 41100 produced a bright, high-contrast green circuit-maze relief pattern that would compete with sprites and telegraphs in gameplay
- **Fix:** Edited `tools/art/prompts.json` patala entry toward dark/muted/low-contrast deep teal-black underground stone; regenerated at attempt 1 (seed 41101); replaced the PROVENANCE.json entry via `record_provenance.py` (idempotent upsert by filename) with seed 41100 recorded in `rejected_seeds`
- **Files modified:** `tools/art/prompts.json`, `assets/sprites/biomes/patala-bg.png`, `assets/sprites/_raw/biomes/patala-bg.gen.json`, `assets/sprites/PROVENANCE.json`
- **Verification:** Visual re-review of the new PNG (calmer, dark, muted); `node tools/check-provenance.js` and `node test/smoke.js` both pass
- **Committed in:** `8e9f3d3`

**2. [Rule 1 - Bug] ranabhoomi attempts 0-2 failed the "no focal point / no walls" checklist item, not subject correctness**
- **Found during:** Task 3, self-review of each ranabhoomi attempt
- **Issue:** SDXL repeatedly composed the requested battlefield debris (broken arrows, chariot-wheel spokes) into a circular/radial arrangement resembling a shield or mandala emblem, or introduced a stray masonry wall fragment in one corner — both violate the biome requirement to read as an even, focal-point-free ground texture
- **Fix:** Retried 3 times with new seeds per the plan's retry allowance; on the 4th attempt, edited the ranabhoomi ground description in `prompts.json` to explicitly ask for "seamless repeating texture, evenly scattered small debris" and dropped the wheel-spoke phrasing that seemed to be driving the circular composition; the resulting attempt (seed 41203) passed
- **Files modified:** `tools/art/prompts.json`, `assets/sprites/biomes/ranabhoomi-bg.png`, `assets/sprites/_raw/biomes/ranabhoomi-bg.gen.json`, `assets/sprites/PROVENANCE.json`
- **Verification:** Visual review of the accepted PNG (even pebbled-earth texture, no focal object); `node tools/check-provenance.js` and `node test/smoke.js` pass
- **Committed in:** `55313c1`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — art-direction/composition bugs surfaced during self-review, fixed within the plan's own retry/prompt-tuning mechanism)
**Impact on plan:** No scope creep; both fixes used the existing pipeline (edit prompts.json, re-run gen_subject.py, re-run record_provenance.py) exactly as designed for this kind of iteration.

## Issues Encountered
None beyond the two documented above. ComfyUI stayed up and reachable across the whole session; no auth gates, no timeouts requiring `--wait-only` resume (all generations completed within a single Bash call).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 02-11 (bosses + enemies) can proceed immediately: `tools/art/prompts.json` already has all 12 remaining subjects (4 bosses, 8 enemies) with locked seeds, palettes, and cultural negatives; the finish/phase2/record scripts are exercised and working.
- `assets/sprites/PROVENANCE.json` has 5 entries (player + 4 biomes), all provisional; `node tools/check-provenance.js` reports "provenance ok (5 atlases/backgrounds)".
- `node test/smoke.js` passes.
- **Non-blocking human review** (per D-14a, the user is away): open the 4 finished PNGs directly —
  - `assets/sprites/biomes/naraka-bg.png`
  - `assets/sprites/biomes/patala-bg.png` (regenerated per orchestrator note; please confirm the new dark/muted direction reads correctly)
  - `assets/sprites/biomes/ranabhoomi-bg.png`
  - `assets/sprites/biomes/vaitarani-bg.png`
  and, after 02-10 wires background rendering in-game, check them at actual in-game brightness/tint. Everything is marked `review_status: "provisional"`; nothing in this plan blocks on that review.

---
*Phase: 02-asset-pipeline-sprite-system*
*Completed: 2026-09-26*

## Self-Check: PASSED
All files created and all commit hashes (d044d03, 3ecadbe, b7e1016, 8e9f3d3, 55313c1, 976fecd) verified present.
