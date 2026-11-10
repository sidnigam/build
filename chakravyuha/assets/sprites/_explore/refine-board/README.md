# Art-direction REFINEMENT board, style 1 + style 5 hybrid (Phase 05.7.4 pre-work, round 2)

**EXPLORATION ONLY. NOT SHIPPED.** Nothing here is referenced by the game, any manifest or `assets/sprites/PROVENANCE.json`.
Raw files are `raw/r_<biome>_<variant>_<seed>.png` (+ `.json` sidecar with exact prompt, seed, seconds); no `-bg/-tile/-atlas/-portrait` suffix, so `tools/check-provenance.js` ignores them.

- Date: 2026-11-08
- Checkpoint: FLUX.1-schnell Q4_K_S GGUF (`flux1-schnell-Q4_K_S.gguf`), t5-v1_1-xxl Q5_K_M + clip_l, ae.safetensors, via `tools/art/comfy_client.build_flux_gguf_graph` (4 steps, euler/simple, cfg 1.0, 1344x768)
- Seed 74100 for every tile, ONE seed per variant (time/memory; no second seeds). Board: `refine-board.png` (plain), `refine-board-readability.png` (cyan player circle, 3 red enemy circles, orange telegraph ring, same positions as round 1).
- Timings (s, incl. queue/model load, memory-starved 16 GB, swap ~15/16 GB): Naraka A 371, B 446, C 368, Patala A 591, B 283, Ranabhoomi A 485, Vaitarani A 440. All under the 20 min cap.

## Prompt structure
`<STYLE> + <SCENE> + <CAMERA>`.
STYLE: "Hades-style painterly cel-shaded game art with bold dark ink outlines and saturated rim lighting, blended with Indian miniature painting ornament: a wide decorative patterned border band running around the arena edge like a miniature-painting frame, carved motif walls and pillars, fine gold leaf detailing, "
FLOOR clause (all): "The floor is calm, even, low-contrast, mid-dark flagstone with soft painted variation and no glowing cracks."
CAMERA: "Game camera: top-down three-quarter view looking down at roughly 45 degrees, the whole arena floor visible and centred, open empty bare floor in the middle, walls framing the edges, an empty arena without characters, people, text or UI."
SCENE (variant part, full text in sidecars):
- Naraka A: cool slate-blue and charcoal stone floor, carved dark stone pillars with gold ornament, orange fire braziers and chains as only warm accents, gold patterned border band
- Naraka B: deep violet and indigo stone floor, crimson and gold patterned border band, indigo pillars, small ember braziers
- Naraka C: dark teal-green stone floor, brass and gold ornament border band, dark green pillars with gold motifs, orange braziers
- Patala A: jade and teal stone floor, gold serpent-motif border band, serpent-scale pillars/walls, bioluminescent cyan crystals and pools
- Patala B: deep sapphire stone floor, emerald and gold naga-motif border band, serpent pillars, warm golden hanging lamps
- Ranabhoomi A: ochre/sandstone packed-earth floor, gold and saffron border band, sandstone pillars, saffron banners, sunset rim light
- Vaitarani A: pale grey-blue stone floor kept mid-dark, inky blue river at the edge, cyan and gold border band, ghost lamps

## Floor stats
`tools/art/shot_stats.py` applies only partly: it drops pixels with HSV sat > 0.55 as "entities", and these floors are all saturated, so 97-100% of the region is excluded and its numbers are meaningless (it printed FAIL/PASS noise). Equivalent used instead: same luma/sat definitions (`shot_stats.hsv_arrays`), patch x 30-70%, y 50-80% of the image (where combat happens), excluding only luma > 0.65.

| Variant | luma mean (<=0.30) | luma std (<=0.12) | sat mean (<=0.30) | floor mean colour |
|---|---|---|---|---|
| Naraka A | 0.355 | 0.082 | 0.77 | #1e678b |
| Naraka B | 0.315 | 0.078 | 0.72 | #9d30a5 |
| Naraka C | 0.340 | 0.080 | 0.85 | #0f696c |
| Patala A | 0.288 | 0.056 | 0.95 | #045c5b |
| Patala B | 0.307 | 0.069 | 0.97 | #045ba2 |
| Ranabhoomi A | 0.319 | 0.054 | 0.70 | #a83a32 |
| Vaitarani A | 0.282 | 0.047 | 0.96 | #055586 |

Std passes everywhere (calm, low-frequency). Luma is slightly over 0.30 on Naraka A/B/C, Ranabhoomi, Patala B. Saturation fails everywhere by a wide margin (raw Flux output is vivid); the 05.4 deterministic HSV grade (`env_grade`) would need to pull sat to ~0.3-0.4 and luma down ~10-15%, which also keeps hue identity. Treat these as palette/hue targets, not final values.

## Swatches (5 dominant colours, whole image, 32-level quantised means) and verdicts
- **Naraka A**: #060a12 #041829 #082536 #154f6e #0e354b. Readability: GOOD. Red enemies pop on blue (complementary-ish), orange telegraph clearly visible, orange braziers are the only warm accents. Fusion: good style-1 painterly/ink, red-orange carved border band along the upper walls (miniature feel), gold capitals; border is on the walls rather than a floor frame.
- **Naraka B**: #0e0f30 #090716 #2e114e #4d1a6c #702689. Readability: POOR-MEDIUM. Floor is hot magenta with a bright central hotspot; red enemies are closer to the floor hue and the telegraph ring washes out. Fusion: floor outlined by a thin cyan edge, border band crimson/gold only on walls. Needs a much darker, less magenta indigo (target hue ~255 not 295).
- **Naraka C**: #062d2e #050e13 #094c50 #031c22 #0c6c6f. Readability: GOOD. Red enemies and orange telegraph pop strongly on teal, very calm floor, faint orange crack hairlines. Fusion: medium; brass/gold ornament reads weakly, border is on walls. Matches Yama-green nod.
- **Patala A**: #044e4d #042f31 #060e0d #046968 #021c23. Readability: GOOD (red pops; telegraph orange visible; cyan accents cluster at edges, do not compete with player in the middle). Fusion: BEST of the set: arched gold serpent-motif border band, carved roundels and cyan bioluminescent pools, clean painterly look.
- **Patala B**: #032a4e #031630 #030710 #044e8e #03386c. Readability: GOOD-MEDIUM (floor very saturated blue; red enemies fine, telegraph orange clear; cyan player is a bit close to the floor hue). Fusion: good: golden lamps give warm accents, arched doorway, carved naga walls; border less visible.
- **Ranabhoomi A**: #0d0714 #171526 #712528 #8e2f2e #511923. Readability: FAIL: the floor came out orange-red (hue ~4), the exact round-1 problem; red enemies vanish. Also a visible "Hades" signature/watermark bottom right (Flux artifact; unusable as is). Composition (arched sandstone arena, setting sun, rounded border band) is promising. Needs a rerun with an explicit "dusty ochre-brown / tan" floor and "no red".
- **Vaitarani A**: #032e4f #03162e #054873 #00050d #045688. Readability: GOOD (extremely flat, std 0.047; red/orange pop). Fusion: medium; curved border band and stairs/river at the back, but ghost lamps are small and the river is hard to read. Floor is very close to Patala B (blue), so differentiate with a paler grey-blue.

## Recommendation per biome
- Naraka: C (teal-green, brass, orange) as primary, A (slate-blue) as runner-up. Reject B (magenta).
- Patala: A (jade/teal + gold serpents + cyan), with the Patala B lamp accents (warm gold) borrowed for variety. Keep Patala floor greener and Vaitarani bluer so biomes stay distinct.
- Ranabhoomi: not resolved; rerun targeting tan/ochre floor, saffron banners, sunset only as rim light.
- Vaitarani: pale grey-blue/steel floor with inky river, cyan/gold ghost lamps (needs a rerun to enlarge the lamps and river).
Common: floors mid-dark, desaturated in the grade pass, calm; fire/orange/gold only as accents and light; border band as arena frame (the floor edge) is the main thing still to push in a next round (currently it sits on walls/rim in most tiles).
