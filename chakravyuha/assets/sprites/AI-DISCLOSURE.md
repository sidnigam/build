# AI Content Disclosure

## Summary

All visual assets (sprites, backgrounds, UI art) in Chakravyuha are **Pre-Generated** AI content — generated prior to release, shipped with the game, and consumed by players. This satisfies Steam's post-January 2026 Content Survey definition of "Pre-Generated" AI content (as opposed to "Live-Generated" AI content produced at runtime).

## Generation Details

- **Tool:** ComfyUI with SDXL locally installed
- **Method:** Reproducible workflows using fixed seeds, saved workflow JSON, and ControlNet reference-sheet conditioning (D-07) for style consistency across all characters
- **Post-processing:** Background removal (rembg or ComfyUI alpha-matte node), frame extraction, atlas packing via free-tex-packer-core
- **Provenance record:** All per-atlas prompt/model/seed details are logged in `assets/sprites/PROVENANCE.json` (schema version 1)

## Scope

AI Pre-Generated assets include:
- Player sprites (Abhimanyu — idle, run, attack, dash, death animations)
- Enemy sprites (preta, rakshasa, archer, naga, vetala, bhuta, daitya, yatudhana)
- Boss sprites (Tataka, Ahiravana, Kumbhakarna, Yama — base + phase-2 variant each)
- Environmental art (backgrounds and floor tiles for 4 biomes: Naraka, Patala, Ranabhoomi, Vaitarani)
- UI art (boon cards, HUD elements, overlays with Indian design motifs)

## Checkpoint License

The SDXL checkpoint used for generation must carry a license permitting commercial redistribution of outputs. The confirmed checkpoint name and license string are recorded in the `checkpoint_license` field of `PROVENANCE.json` before any generation begins (RESEARCH Pitfall 4 gate). This field is `null` until confirmed in Phase 2 Plan 04.

## Status

> **Survey submission deferred to Phase 7 (store page). This file is the disclosure-ready record per RESEARCH Open Question 1.**
>
> The Steam AI Content Survey cannot be submitted until the store page exists. This document, together with `PROVENANCE.json`, constitutes the disclosure record that will be used to complete the survey at that time.
>
> Actual survey submission: Phase 7 (QA-03 / STEAM-05 milestone).

## Provenance Schema (D-13)

Each entry in `PROVENANCE.json assets[]` contains:

```json
{
  "filename": "player-atlas.png",
  "prompt": "...",
  "negative_prompt": "...",
  "model": "SDXL 1.0",
  "checkpoint": "...",
  "sampler": "DPM++ 2M Karras",
  "cfg": 7.5,
  "seed": 1234567890,
  "generated_date": "YYYY-MM-DD",
  "post_processing": ["background removed via rembg", "frames extracted", "atlas packed via free-tex-packer"]
}
```
