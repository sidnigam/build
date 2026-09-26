# AI Content Disclosure

## Summary

All visual assets (sprites, backgrounds) in Chakravyuha are **Pre-Generated** AI content — generated prior to release, shipped with the game, and consumed by players. This satisfies Steam's post-January 2026 Content Survey definition of "Pre-Generated" AI content (as opposed to "Live-Generated" AI content produced at runtime).

## Generation Details

- **Tool:** ComfyUI with SDXL 1.0 base installed and run locally (no cloud/third-party generation service).
- **Methods:**
  - **txt2img** with fixed, recorded seeds for all enemy sprites, all boss sprites, and all biome background textures. Up to 5 attempts (base seed + 0..4) per subject; every rejected seed and the reason for rejection is logged in `PROVENANCE.json`.
  - **img2img** (denoise 0.35) from the approved Abhimanyu reference image, for the 4 player idle frames only.
  - **No ControlNet and no IPAdapter were used for any asset.** (This corrects an earlier draft of this document, which described ControlNet reference-sheet conditioning as part of the workflow; that approach was tried during planning and abandoned — see `.planning/phases/02-asset-pipeline-sprite-system/02-CONTEXT-AMENDMENT.md` D-07a — because it did not hold the character's outfit and proportions consistent across pose changes.)
  - **Boss phase-2 variants are deterministic image post-processing** of each boss's generated base frame (`tools/art/phase2_variant.py`, hue/levels shift + a rim glow composited from the alpha mask) — not a separate generation, and not additional AI content beyond the base frame it is derived from.
- **Post-processing:** rembg (`u2net` model) background removal, alpha despeckling, trim, bottom-aligned resize to the game's sprite sizes (128px enemies, 256px bosses), cover-crop to 1280x720 for biome backgrounds, atlas packing via `free-tex-packer-core` (`tools/pack-atlas.js`).
- **Provenance record:** every shipped AI asset's prompt, negative prompt, seed, rejected seeds, checkpoint, sampler/scheduler/steps/cfg, and post-processing steps are logged in `assets/sprites/PROVENANCE.json` (schema version 1). A `.gen.json` sidecar with the exact ComfyUI API graph is committed alongside each finished frame for reproducibility.

## What is NOT AI-generated

- **All animation** (idle breathing, run bob/lean, dash stretch + afterimage, hit flash/squash, spawn fade-in, death shrink/fade, boss phase-2 selection) is procedural code (`js/sprites.js`, per 02-CONTEXT-AMENDMENT D-07a). The player's run/attack/dash states are code-driven transforms over the AI-generated idle frames, not separate AI-generated frames.
- **Weapons** (khanda, gandiva, gada) are code-drawn Pixi Graphics objects, not AI images.
- **UI ornament** (borders, corner flourishes, boon-card styling, rarity/god-color accents, HUD chrome) is CSS and inline SVG per 02-CONTEXT-AMENDMENT D-16a, not AI-generated. No UI art atlas was produced.
- **Fonts and Devanagari-accented headings** are not AI-generated.

## Scope

The complete list of shipped AI Pre-Generated assets, enumerated from `PROVENANCE.json` (13 atlases + 4 backgrounds = 17 files):

**Player (1 atlas, idle only):**
- `player-atlas.png` (Abhimanyu — idle, 4 frames; img2img from the approved reference)

**Bosses (4 atlases, idle + phase-2 each):**
- `tataka-atlas.png`, `ahiravana-atlas.png`, `kumbhakarna-atlas.png`, `yama-atlas.png`

**Enemies (8 atlases, single idle frame each):**
- `preta-atlas.png`, `rakshasa-atlas.png`, `archer-atlas.png`, `naga-atlas.png`, `vetala-atlas.png`, `bhuta-atlas.png`, `daitya-atlas.png`, `yatudhana-atlas.png`

**Biome backgrounds (4, 1280x720 each):**
- `naraka-bg.png`, `patala-bg.png`, `ranabhoomi-bg.png`, `vaitarani-bg.png`

## Review Status

All AI-generated assets above are marked `review_status: "provisional"` in `PROVENANCE.json` (`review_sheet` points at `assets/sprites/_review/contact-sheet.png`). The user was away during generation, so per 02-CONTEXT-AMENDMENT D-14a, human review did not block any Phase 2 plan. A future pass should:
1. Open the contact sheet and review every sprite, silhouette, phase-2 variant, and biome thumbnail.
2. Set each `PROVENANCE.json` entry's `review_status` to `"approved"` or `"regenerate"`.
3. Pay particular attention to the Yama depiction (dignified judge-deity, not demonic) and to the open STATE.md design/cultural concern about Yama appearing as a boss encounter at all.
4. Complete the Phase 7 cultural review (QA-03) before the Steam AI Content Survey is submitted.

## Checkpoint License

Checkpoint: `sd_xl_base_1.0.safetensors` (SDXL 1.0 base). License: CreativeML OpenRAIL++-M, which permits commercial redistribution of outputs. Recorded in the `checkpoint_license` field of `PROVENANCE.json` (confirmed in Phase 2 Plan 04, the license gate).

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
