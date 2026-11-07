# AI Content Disclosure

## Summary

All visual assets (sprites, backgrounds, god portraits, and the Phase 05.4 environment (env) tiles and env prop/architecture atlases) in Chakravyuha are **Pre-Generated** AI content — generated prior to release, shipped with the game, and consumed by players. This satisfies Steam's post-January 2026 Content Survey definition of "Pre-Generated" AI content (as opposed to "Live-Generated" AI content produced at runtime).

## Generation Details

- **Tool:** ComfyUI with SDXL 1.0 base installed and run locally (no cloud/third-party generation service).
- **Methods:**
  - **txt2img** with fixed, recorded seeds for all enemy sprites, all boss sprites, and all biome background textures. Up to 5 attempts (base seed + 0..4) per subject; every rejected seed and the reason for rejection is logged in `PROVENANCE.json`.
  - **img2img** (denoise 0.35) from the approved Abhimanyu reference image, for the 4 player idle frames only.
  - **No ControlNet and no IPAdapter were used for any asset.** (This corrects an earlier draft of this document, which described ControlNet reference-sheet conditioning as part of the workflow; that approach was tried during planning and abandoned — see `.planning/phases/02-asset-pipeline-sprite-system/02-CONTEXT-AMENDMENT.md` D-07a — because it did not hold the character's outfit and proportions consistent across pose changes.)
  - **Boss phase-2 variants are deterministic image post-processing** of each boss's generated base frame (`tools/art/phase2_variant.py`, hue/levels shift + a rim glow composited from the alpha mask) — not a separate generation, and not additional AI content beyond the base frame it is derived from.
- **Environment art (Phase 05.4, env tiles + env atlases):** txt2img only, fixed and recorded seeds (reserved per-biome ranges: naraka 61000, patala 62000, ranabhoomi 63000, vaitarani 64000), **max 5 attempts per subject** (base seed + 0..4); every rejected env seed and its reason is in `PROVENANCE.json` (32 rejected env attempts across 68 shipped env subjects). Checkpoints, chosen per asset kind (`tools/art/prompts.json` `env_checkpoint` = `sdxl_base` plus the recorded `env_checkpoint_policy` per-kind override): **SDXL 1.0 base** for every cutout kind (51 frames: props, columns, gates, decals, hazard skins) and 4 tiles; **DreamShaper XL alpha2 (xl1.0)** (CreativeML OpenRAIL++-M, license verification recorded in `PROVENANCE.json` `checkpoint_licenses[]`: Civitai version 126688, SHA-256 of the checkpoint file, the license text copy in `tools/art/licenses/openrail++-m.LICENSE.md` and the archived Civitai API response `tools/art/licenses/dreamshaper-xl-civitai-126688.json`) for 13 non-cutout tiles (floor tiles, wall faces, the Vaitarani water tile). Its `adopted: false` flag records that it was rejected as the *global* env default (cutout regressions in the 05.4-01 A/B); it is used only via the per-kind override. Each env entry's `checkpoint` field names the checkpoint actually used. Local ComfyUI only, no ControlNet, no IPAdapter, no img2img.
- **Post-processing:** rembg (`u2net` model) background removal, alpha despeckling, trim, bottom-aligned resize to the game's sprite sizes (128px enemies, 256px bosses), cover-crop to 1280x720 for biome backgrounds, atlas packing via `free-tex-packer-core` (`tools/pack-atlas.js`).
- **Env post-processing (`tools/art/finish_env.py`, all deterministic, driven by `tools/art/env_build.py`):** floor/water/wallcap **tiles** are made seamless by a half-roll + feathered centre-weighted cross-blend, then graded to the D-08 tile limits (contrast compression, HSV saturation scale, value scale; the factors are recorded per entry under `grading`); **wall-face strips** are cropped (recorded `crop` box) and made x-seamless the same way; **props, columns, gates and the hazard skin** are rembg cutouts (`u2net`, or `birefnet-general` for thin-detail subjects as recorded per entry), alpha-cleaned, despeckled, trimmed and fit to ≤ 384px (≤ 512px architecture), then given the fixed `env_grade` HSV grade (props sat×0.85/val×0.88, architecture sat×0.8/val×0.82); **decals** get a background-difference alpha key (no rembg) capped at alpha 0.55 and the decal grade (sat×0.7/val×0.8). Finished frames are packed into one atlas per biome (`{biome}-env-atlas.png`) via `tools/pack-atlas.js`.
- **Provenance record:** every shipped AI asset's prompt, negative prompt, seed, rejected seeds, checkpoint, sampler/scheduler/steps/cfg, and post-processing steps are logged in `assets/sprites/PROVENANCE.json` (schema version 1). A `.gen.json` sidecar with the exact ComfyUI API graph is committed alongside each finished frame for reproducibility.

## What is NOT AI-generated

- **All animation** (idle breathing, run bob/lean, dash stretch + afterimage, hit flash/squash, spawn fade-in, death shrink/fade, boss phase-2 selection) is procedural code (`js/sprites.js`, per 02-CONTEXT-AMENDMENT D-07a). The player's run/attack/dash states are code-driven transforms over the AI-generated idle frames, not separate AI-generated frames.
- **Weapons** (khanda, gandiva, gada) are code-drawn Pixi Graphics objects, not AI images.
- **UI ornament** (borders, corner flourishes, boon-card styling, rarity/god-color accents, HUD chrome) is CSS and inline SVG per 02-CONTEXT-AMENDMENT D-16a, not AI-generated. No UI art atlas was produced.
- **Fonts and Devanagari-accented headings** are not AI-generated.
- **Environment layout and runtime effects (Phase 05.4)** are code, not AI: `js/environment.js` places every tile, wall, column, gate, prop, decal and obstacle/hazard skin by a seeded deterministic layout; the light pools, dust shafts, mist, screen vignette, wall-top fades, edge ambient occlusion, contact shadows and pit interiors are procedural canvas textures; the fallback walls/pits/water fills used when an atlas frame is missing are procedural Pixi Graphics; water scrolling (river bands and the south river strip) is a code-driven tile offset; all runtime grading (floor wash/desaturation, margin dimming, architecture/prop tints) is code applied over the AI tiles. The env manifests' tuning values (scales, alphas, grades) are hand-tuned data, not AI output.

## Scope

The complete list of shipped AI Pre-Generated assets, enumerated from `PROVENANCE.json`: 13 character/boss atlases + 4 backgrounds + 6 god portraits + 17 env tiles + 4 env atlases = **44 shipped files** (the 4 env atlases pack 51 individually provenance-tracked env frames). `node tools/check-provenance.js` verifies this set.

**Player (1 atlas, idle only):**
- `player-atlas.png` (Abhimanyu — idle, 4 frames; img2img from the approved reference)

**Bosses (4 atlases, idle + phase-2 each):**
- `tataka-atlas.png`, `ahiravana-atlas.png`, `kumbhakarna-atlas.png`, `yama-atlas.png`

**Enemies (8 atlases, single idle frame each):**
- `preta-atlas.png`, `rakshasa-atlas.png`, `archer-atlas.png`, `naga-atlas.png`, `vetala-atlas.png`, `bhuta-atlas.png`, `daitya-atlas.png`, `yatudhana-atlas.png`

**Biome backgrounds (4, 1280x720 each):**
- `naraka-bg.png`, `patala-bg.png`, `ranabhoomi-bg.png`, `vaitarani-bg.png`

**God portraits (6, Phase 05.5):** see "God portraits (Phase 05.5)" below.

**Environment kits (Phase 05.4; `assets/sprites/env/{biome}/`, 17 tiles + 4 atlases, 51 atlas frames):**
- **Naraka:** tiles `naraka-floor-a-tile.png`, `naraka-floor-b-tile.png`, `naraka-wallcap-tile.png`, `naraka-wallface-tile.png`; `naraka-env-atlas.png` with 13 frames (column, gate, 7 props: brazier, chain_post, fire_pit, iron_cage, iron_cauldron, ledger_lectern, scroll_pile; 3 decals: ash_drift, ember_seam, scorch; hazard skin vent_grate).
- **Patala:** tiles `patala-floor-a-tile.png`, `patala-floor-b-tile.png`, `patala-wallcap-tile.png`, `patala-wallface-tile.png`; `patala-env-atlas.png` with 12 frames (column, gate, 6 props: crystal_rocks, fallen_pillar, gem_pile, glow_fungus, pool_basin, treasure_urn; 4 decals: gem_scatter, moss_patch, venom_rim, water_puddle).
- **Ranabhoomi:** tiles `ranabhoomi-floor-a-tile.png`, `ranabhoomi-floor-b-tile.png`, `ranabhoomi-wallcap-tile.png`, `ranabhoomi-wallface-tile.png`; `ranabhoomi-env-atlas.png` with 14 frames (column, gate, 9 props: arrow_cluster, chariot_wheel, chariot_wreck, conch_stand, dhvaja, fallen_banner, quiver, shield_pile, war_drum; 3 decals: dust_scuff, flat_arrows, ruts).
- **Vaitarani:** tiles `vaitarani-floor-a-tile.png`, `vaitarani-floor-b-tile.png`, `vaitarani-water-tile.png`, `vaitarani-wallcap-tile.png`, `vaitarani-wallface-tile.png`; `vaitarani-env-atlas.png` with 12 frames (column, gate, 7 props: driftwood, floating_diyas, moored_boat, mooring_post, reeds, rope_coil, stone_marker; 3 decals: algae_patch, stone_cracks, water_puddle).

## Review Status

All AI-generated assets above are marked `review_status: "provisional"` in `PROVENANCE.json` (`review_sheet` points at `assets/sprites/_review/contact-sheet.png`). The user was away during generation, so per 02-CONTEXT-AMENDMENT D-14a, human review did not block any Phase 2 plan. A future pass should:
1. Open the contact sheet and review every sprite, silhouette, phase-2 variant, and biome thumbnail.
2. Set each `PROVENANCE.json` entry's `review_status` to `"approved"` or `"regenerate"`.
3. Pay particular attention to the Yama depiction (dignified judge-deity, not demonic) and to the open STATE.md design/cultural concern about Yama appearing as a boss encounter at all.
4. Complete the Phase 7 cultural review (QA-03) before the Steam AI Content Survey is submitted.

**Environment art (Phase 05.4):** every env tile, env frame and env atlas entry is `review_status: "provisional"`. `PROVENANCE.json` `env_review_sheet` points at `assets/sprites/_review/env-contact-sheet.png` (generated by `tools/art/env_contact_sheet.py`): per biome, every tile as a 2x2 repeat (seam check), the wall face as a 3x1 strip, every atlas frame on a checker labelled `key · role · worldH · seed`, and one in-game shot. Env cultural review items for the human reviewer (the D-09 rules each env entry's `cultural_check` was self-reviewed against):
1. Ground-plane assets (floor tiles, water, decals, the hazard skin) carry `ground_safe: true` only after checking they hold no deity image, idol, face, yantra/deity mandala, Om, swastika, trishula, lotus throne or other sacred symbol, since they are walked on.
2. Serpent carvings (Patala column/walls) are plain serpent bodies, never multi-hooded divine Nagas.
3. Banners (Ranabhoomi dhvaja, fallen_banner) are plain/geometric with no emblem.
4. The conch (shankha) appears only upright on its stand (`conch_stand`, a vertical margin prop), never on the ground.
5. Diyas appear only on water (`floating_diyas` is restricted to the south river strip) or on lamp pillars/plinths.
6. No gore, blood, bones, skulls, corpses, pyres or cremation imagery anywhere; no deity figures in any env art.
Visual flags for review (not cultural violations): RESOLVED in 05.7-02 (regenerated, see the Phase 05.7 section): Naraka `vent_grate` (was a wheel hub), Ranabhoomi `chariot_wreck` (was a gun carriage), `war_drum` (was a cooking pot) and `ranabhoomi:column` (now has a lit diya).

## Checkpoint License

Checkpoint: `sd_xl_base_1.0.safetensors` (SDXL 1.0 base). License: CreativeML OpenRAIL++-M, which permits commercial redistribution of outputs. Recorded in the `checkpoint_license` field of `PROVENANCE.json` (confirmed in Phase 2 Plan 04, the license gate).

Additional checkpoints are recorded in `checkpoint_licenses[]` (the legacy `checkpoint_license` field is kept for compatibility): **DreamShaper XL alpha2 (xl1.0)**, `dreamshaperXL_alpha2Xl10.safetensors`, CreativeML OpenRAIL++-M, commercial image use allowed per the archived Civitai API flags, confirmed 2026-09-29 (used for the 13 env tiles listed above), and the FLUX.1-schnell stack used for the god portraits (see below).

## Status

> **Survey submission deferred to Phase 7 (store page). This file is the disclosure-ready record per RESEARCH Open Question 1.**
>
> The Steam AI Content Survey cannot be submitted until the store page exists. This document, together with `PROVENANCE.json`, constitutes the disclosure record that will be used to complete the survey at that time.
>
> Actual survey submission: Phase 7 (QA-03 / STEAM-05 milestone).

## Provenance Schema (D-13 / D-13a)

Each entry in `PROVENANCE.json assets[]` contains (fields vary slightly by `kind`):

```json
{
  "filename": "tataka-atlas.png",
  "actor": "tataka",
  "kind": "boss",
  "animations": { "idle": 1, "phase2": 1 },
  "tool": "ComfyUI (local)",
  "checkpoint": "sd_xl_base_1.0.safetensors (SDXL 1.0 base, CreativeML OpenRAIL++-M)",
  "method": "txt2img",
  "sampler": "dpmpp_2m",
  "scheduler": "karras",
  "steps": 32,
  "cfg": 7.0,
  "seed": 52003,
  "prompt": "...",
  "negative_prompt": "...",
  "rejected_seeds": [52000, 52001, 52002, 52004],
  "rejected_count": 4,
  "post_processing": ["rembg u2net background removal", "..."],
  "gen_sidecar": "assets/sprites/_raw/bosses/tataka/tataka.gen.json",
  "generated_date": "YYYY-MM-DD",
  "recorded_date": "YYYY-MM-DD",
  "review_status": "provisional",
  "review_note": "provisional — awaiting human art review",
  "self_review": "..."
}
```

## God portraits (Phase 05.5)

The six boon-granting gods (Hanuman, Agni, Indra, Vayu, Krishna, Durga) each have one
illustrated half-body bust portrait at `assets/sprites/gods/{id}-portrait.png`. Two earlier
checkpoints shipped nothing: SDXL 1.0 base (05.5-01, 7 attempts per god, 0/6 shipped) and
DreamShaper XL alpha2 (05.4-01 A/B, 2 god attempts, 0/2 shipped) — both collapsed into
statue/idol renders, halos, wrong arm counts, or a human-faced Hanuman/feminine Vayu (full
per-god, per-seed record in `05.5-01-SUMMARY.md`).

**05.5-04 shipped all 6 portraits** on a retried pipeline using **FLUX.1-schnell**
(Apache-2.0, Black Forest Labs), run locally as a **GGUF Q4_K_S quantization** (city96,
Apache-2.0) via the `ComfyUI-GGUF` custom node (city96, Apache-2.0, pinned to commit
`6ea2651e7df66d7585f6ffee804b20e92fb38b8a`), with a GGUF-quantized T5-XXL text encoder
(city96, Apache-2.0), CLIP-L (OpenAI ViT-L/14, MIT), and the FLUX.1-schnell VAE
(Apache-2.0). Generation is **txt2img, fixed and recorded seeds** (reserved range
71000–71599), **4 sampling steps, cfg 1.0, euler/simple, no negative prompt** (schnell is
not guidance-distilled; every constraint is expressed as positive, natural-language
phrasing instead), local ComfyUI only, no ControlNet or IPAdapter. Up to **6 attempts per
god** (`max_attempts_god_flux`); every rejected seed and its reason is recorded in
`PROVENANCE.json`. Final tallies: Agni and Krishna shipped on the first attempt (0 rejected
seeds each); Hanuman, Indra and Vayu each shipped on their second attempt (1 rejected seed
each); Durga shipped on her third attempt (2 rejected seeds) after an intermediate round
whose crown read as a halo-like aureole.

Finishing uses `tools/art/finish_portrait.py` with the **`birefnet-general`** rembg matte
(MIT, ZhengPeng7/BiRefNet; adopted via a CPU bake-off over Task 3 that found it alone, with
no colour-key fill, best preserved thin held props like Hanuman's gada and Vayu's scarves
compared to `u2net` and `isnet-general-use`), followed by alpha despeckling, trim, and a
bottom-aligned fit into 600x768 RGBA with a bottom alpha feather so the bust fades into the
boon panel. The divine aura shown behind each portrait on the boon-pick screen is CSS-drawn,
not AI, per the existing UI-ornament exemption above.

Observed performance on the M1 Pro 16 GB: about 250–480 seconds per 896x1152 image (slower
under memory pressure from concurrent CPU work), roughly 3-5x the SDXL-base generation time,
consistent with the Addendum's expectation. `assets/sprites/_review/gods-contact-sheet.png`
documents the shipped state, seed, rejected-attempt count and review status for every god.

Every shipped god portrait awaits **human cultural review (QA-03)** before the Steam AI
Content Survey is finalized, exactly as the character atlases above do. One minor
cross-deity note was flagged during review for the human reviewer's attention: Agni's
forehead tilak renders as a U-shaped Vaishnava urdhva-pundra mark (traditionally
Vishnu/Krishna iconography) rather than an Agni-specific mark; every other Agni attribute
(flame crown, ladle/flame-palm pose, single bearded face, two arms) is correct and distinct
from Vishnu, so this was not treated as a ship blocker — see the `agni-portrait.png`
provenance entry.

(05.7-02 update: the Agni tilak flag above is RESOLVED, the tilak was removed; see the Phase 05.7 section. The Indra vajra flag remains open: NOT SHIPPED. 05.7-03 gap closure was also NOT SHIPPED; see the Phase 05.7 section.)

## Phase 05.7 cultural and iconography corrections

Nine assets were flagged in cultural/iconography review and regenerated in plan 05.7-02. They replace existing files, so the file total is unchanged. Every shipped asset carries `cultural_review: pending (QA-03)` and a `superseded` record in PROVENANCE.json. Model for all shipped items: FLUX.1-schnell Q4_K_S GGUF (no SDXL fallback was needed).

| Asset | Flag fixed | Result |
|---|---|---|
| Yama boss atlas | Blue skin and tall gold crown read as Vishnu/Krishna (CULT-02) | SHIPPED seed 52354 (attempt 4; 4 rejects). Green skin, buffalo-head danda, pasha. Forehead mark removed by deterministic inpaint (`tools/art/retouch_mark.py`). QA-03 caveats: trident-like horn silhouette on the danda, rudraksha beads. 05.7-04 gap closure NOT SHIPPED: the code-drawn horn/dome replacement removed the trident silhouette (one upward point) but only produced thin hoop-like horns and a bubble-like dome that did not read as thick buffalo horns; the shipped atlas is unchanged (attempts recorded in `tools/art/prompts.json` `subjects.yama.gap_05_7_04`). |
| Kumbhakarna boss atlas | Prong staff read as a Shaiva trishula (CULT-03) | SHIPPED seed 52250 (attempt 0). Iron-banded club, no prongs. |
| Agni portrait | Vaishnava urdhva-pundra tilak (CULT-03) | SHIPPED seed 71150. Three prompt rewrites still painted a forehead mark, so the tilak was removed by deterministic inpaint. |
| Indra portrait | Vajra read as a cross (CULT-03) | NOT SHIPPED. 6/6 Flux attempts failed (cross, trident, T-rod). The earlier portrait (seed 71251) stays and is still flagged for the human reviewer. 05.7-03 gap closure NOT SHIPPED: no garment repair of the old rod passed acceptance (blotches and ghosting remained), so the portrait is unchanged; the code-drawn vajra itself passed all geometry metrics (see `tools/art/prompts.json` `subjects.indra.gap_05_7_03`). |
| Naraka gate | Gothic arch and portcullis (CULT-04) | SHIPPED seed 61501. Torana with lotus-panel square posts, transparent doorway. Slight torii-like crossbeam flagged. |
| Naraka vent_grate | Hubcap-like radial spokes (CULT-04) | SHIPPED seed 61510. Round stone ring with square lattice. Reads somewhat like a manhole cover. |
| Ranabhoomi chariot_wreck | Gun-carriage read (CULT-04) | SHIPPED seed 63812 (2 rejects). |
| Ranabhoomi war_drum | Cooking-pot read (CULT-04) | SHIPPED seed 63820. Laced barrel drum. |
| Ranabhoomi column | No visible diya flame (CULT-04) | SHIPPED seed 63800. Clay diya with one flame. |

Two shipped assets (Agni, Yama) were retouched after generation to remove a painted forehead mark. This is a deterministic cv2 inpaint of a small region, recorded in their `post_processing`. The 05.7-03/04 gap-closure attempts built a code-drawn overlay tool (`tools/art/prop_overlay.py`) and a masked img2img repair tool (`tools/art/guided_inpaint.py`); no overlay shipped in any final asset (Indra and Yama both NOT SHIPPED), so no shipped image contains code-drawn overlay content.

Carried to Phase 7 QA-03 (non-blocking, from 05.7-VERIFICATION): the Naraka gate crossbeam reads slightly torii-like; the Naraka vent reads somewhat like a manhole cover and has a plus-shaped centre glow; the Ranabhoomi column's diya flame is small at game scale. Human cultural sign-off (QA-03) is still pending for every 05.7 asset.
