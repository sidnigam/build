# Art-direction style exploration board (Phase 05.7.4 pre-work)

**EXPLORATION ONLY. NOT SHIPPED.** Nothing here is referenced by the game, any manifest, or
`assets/sprites/PROVENANCE.json`. Raw files are named `s<style>_<biome>_<seed>.png` (no `-bg/-tile/-atlas/-portrait`
suffix, so `tools/check-provenance.js` ignores them; verified green).

- Date: 2026-11-07
- Checkpoint: FLUX.1-schnell Q4_K_S GGUF (`flux1-schnell-Q4_K_S.gguf`, Apache-2.0), t5-v1_1-xxl Q5_K_M + clip_l, ae.safetensors,
  via `tools/art/comfy_client.build_flux_gguf_graph` (4 steps, euler/simple, cfg 1.0, 1344x768)
- Seed: 74100 for every style (1 attempt per style, see "Coverage")
- Boards: `style-board.png` (plain), `style-board-readability.png` (stand-in markers at game scale: cyan player circle, 3 red enemy
  circles, orange telegraph ring). Each raw has a `.json` sidecar with exact prompt/seed.
- Composition (same for all): top-down 3/4 view of an empty Naraka arena, floor + framing pillars/walls + braziers/cauldrons, no
  characters/text/UI. Prompt = `<style clause> + <scene> + <camera clause>`; the full prompt is in each sidecar. Scene text:
  "an empty combat arena in Yama's hells, Naraka: a wide square stone courtyard floor of dark basalt flagstones with glowing
  molten-orange cracks, framed at the back and sides by tall carved iron-black pillars and heavy chained walls, a few braziers of
  fire, hanging iron chains, a cauldron ... lava glow and ember light, red and orange palette with deep crimson shadows".
  Style clauses:
  1. "Hades-style painterly cel-shaded game art with bold dark ink outlines, hand-painted textures, saturated vivid colours and strong coloured rim lighting"
  2. "3D low-poly game scene, faceted flat-shaded polygons, stylized pre-rendered 3D look, clean stylized lighting with soft shadows"
  3. "realistic cinematic painterly concept art, highly detailed, atmospheric, volumetric light rays, smoke and haze, rich depth"
  4. "bold flat vector cartoon game art, clean simple shapes, thick uniform outlines, punchy saturated palette, minimal texture, highly readable, in the style of Cult of the Lamb"
  5. "Indian folk miniature painting style inspired by Pattachitra and Rajput-Mughal miniatures and Kalighat, flat patterned colour fields, decorative ornamental border motifs on the floor, fine gold leaf detail, black contour lines"
  6. "neon dark-fantasy game art, near-black base with highly saturated emissive neon glows, strong bloom, deep contrast, glowing edges"

## Coverage and caveats (read this)

- **GPU was heavily memory-starved** (16 GB machine, swap ~17.5/18 GB used): per-image time ranged 12 to 58 minutes, so the
  budget allowed ONE attempt per style and **no Patala renders**. Patala was not rendered (scene text for it is ready in the
  generation script if wanted later).
- Style 6 (Neon dark-fantasy) was NOT rendered (see Final status at the bottom).
- Single-seed samples: Flux schnell ignores much of the "style" vocabulary when the scene text is strong, so all six share a
  strong "dark stone + lava cracks" base. Differences are real but compressed; a second attempt per style would widen them.
- **Style 2 did not achieve true faceted low-poly.** Flux produced a smooth stylized 3D render, not hard polygons. Judge it as
  "pre-rendered 3D look", not as proper low-poly.
- Style 5 came out as a "painted carpet inside a stone hall" (decorative border, flat red field); it is miniature-inspired
  decoration but not a convincing Pattachitra/Rajput look.
- Skull ornaments appear in some images (1, 5). Fine for Naraka but note for the cultural/iconography reviews; nothing deity-like
  is depicted.
- Floors are pre-composed "whole-room" images here. For the game these would be re-done as tileable floor + wall-cap + props
  (the 05.4 pipeline), so what matters is the *style*, not the room layout.

## Per-style notes

Readability is judged on the readability board: can a small bright player, red enemies and an orange telegraph be read on the
floor (floor value/saturation noise vs marker contrast).

### 1. Hades-like painterly cel-shaded (`s1_naraka_74100.png`)
- **Look:** dark red/crimson hall, glowing orange crack lines, painterly brushwork, ink-ish edges, coloured rim light on pillars.
- **Pros:** closest to the current project target ("Hades-adjacent"); consistent with existing character atlases (painterly +
  outline); rich and vibrant; props/walls read as game art.
- **Cons:** the floor is a saturated red wash; the glowing cracks form a busy web. Strongest "not cool" (all warm).
- **Readability:** MEDIUM-LOW. Red enemies on a crimson floor lose contrast; telegraph ring OK because orange stands out only on
  darker patches. Needs a darkened/desaturated, low-frequency combat floor and brighter enemy rim lights.
- **Cost/feasibility:** LOW. Same SDXL/Flux 2D pipeline, same PixiJS layered sprites; essentially a regrade/regen of the 05.4 set.
  Best fit for AI-only art.

### 2. 3D low-poly (pre-rendered) (`s2_naraka_74100.png`)
- **Look (as rendered):** smooth stylized 3D render with soft lighting, not truly faceted.
- **Pros:** clean depth cues, consistent lighting direction, modern "3D-in-2D" polish.
- **Cons:** AI did not give real low-poly; mushy detail; the central pink light pool washes out the floor; style clashes with the
  existing painted characters.
- **Readability:** MEDIUM-LOW (pale pink hotspot reduces contrast in the middle of the arena, where combat happens).
- **Cost/feasibility:** HIGH, and two distinct meanings:
  (a) *True 3D low-poly* needs a 3D renderer (e.g. Three.js) plus real meshes, 3D character models/rigs and lighting. That is a
  renderer migration away from PixiJS 2D and contradicts "vanilla JS + PixiJS 2D, AI-generated 2D art only"; AI image gen cannot
  produce rigged 3D assets reliably. Not viable this milestone.
  (b) *Pre-rendered 2D approximation* (render/fake low-poly looks into 2D sprites/tiles) is feasible with the current stack but
  needs a controllable low-poly look from Flux (not achieved in this sample) or a hand-built Blender/Three.js offline render
  pipeline for props/tiles; characters would still need re-doing to match. Risky and large.

### 3. Realistic cinematic painterly (`s3_naraka_74100.png`)
- **Look:** dark, smoky, volumetric haze, spotlit stone floor, atmospheric depth.
- **Pros:** most atmospheric and "premium"; strong mood; the lit central floor is very legible.
- **Cons:** the darkest, least vibrant and least "cool"; dim edges; hardest to keep a consistent look across hundreds of
  generated props/tiles; photoreal props clash with stylized characters; heavier fog/haze overlays cost fill rate.
- **Readability:** MEDIUM-HIGH in the lit centre (bright pale floor makes markers pop) but poor at the dark edges; the strong
  vignette is itself a readability aid. Fails the user's "vibrant" ask.
- **Cost/feasibility:** MEDIUM. 2D pipeline works, but photoreal assets and per-prop consistency/matting are hard; characters
  would need regenerating to match, and lighting/fog needs Pixi filters (OK on PixiJS 8).

### 4. Bold cartoon / flat vector (`s4_naraka_74100.png`)
- **Look:** thick outlines, simplified stone shapes, clear chunky pillars, bright flames, purple-grey walls and red floor.
- **Pros:** cleanest silhouette language; cooler purple/blue-grey walls against hot floor give the "cooler" feel the user asked
  for; props are instantly identifiable; very scalable to tiles; suits procedural reuse.
- **Cons:** can feel "mobile/kiddie" against Yama's hells tone; mythology gravitas needs ornament work; floor is still a red
  web of lava lines.
- **Readability:** MEDIUM-HIGH (flat value structure, walls clearly separated from floor); red-on-red enemies still need a
  brighter outline/rim. Easiest style to tune for readability (flatten the floor value range).
- **Cost/feasibility:** LOW-MEDIUM. Pure 2D, same pipeline; flat shapes are easiest for Flux to keep consistent and for
  rembg/seamless-tile finishing. Existing character art would need an outline/flatten pass or a regen to match.

### 5. Indian folk / miniature-inspired (`s5_naraka_74100.png`)
- **Look:** reads as a patterned red carpet field with a decorative flower-scroll border inside a stone hall with ornate
  red-gold patterned pillars.
- **Pros:** distinctive and culturally rooted; the border motif doubles as a clear arena boundary; the flat red field is the
  calmest floor, so readability of gameplay is good; gold/ornament detail supports the mythology identity.
- **Cons:** the sample is not a true miniature style (still 3D-ish painted); the big saturated red field is flat and dull;
  Flux's grasp of Pattachitra/Kalighat is shallow so authenticity and cultural review risk is real; heavy ornament can
  clash with characters; very warm (not "cool").
- **Readability:** HIGH on the plain red field (low-frequency floor, markers pop, telegraph visible).
- **Cost/feasibility:** MEDIUM-HIGH. Doable in 2D, but authentic folk style needs LoRA/reference work or heavy iteration; flat
  patterned fills are friendly to shader/tint recolouring per biome. Requires cultural review (QA-03) of motifs.

### 6. Neon dark-fantasy
- NOT RENDERED (see Final status). Expected strengths are
  high contrast and the best enemy/telegraph readability on a near-black floor, and the "cooler" feel is easy (cyan/violet neon);
  expected weakness is that it drifts away from a mythological/earthy Indian tone toward cyberpunk, and bloom costs fill rate.
  Feasibility would be LOW-MEDIUM (2D + Pixi bloom/glow filters). This verdict is an expectation, not an observation.

## Cross-cutting observation

All six samples kept a lava-red floor, so none is yet "cool". The user's feedback ("more vibrant, cooler") is best served by
changing the *palette* (cool-neutral stone floor in blue-grey/violet with hot orange as accent and light source) in whichever
style is chosen, not just the rendering style. Floors should be low-frequency and darker than characters; avoid red enemies on
red floors.

## Status
(see bottom line, appended after the last generation attempt)

**Final status (2026-11-07):** Naraka rendered for styles 1-5 (1 attempt each, seed 74100). **Style 6 (Neon dark-fantasy) was
NOT rendered**: its single attempt ran 45+ minutes under swap thrash and was interrupted at the budget cap, so the boards show
5 tiles. **Patala was not rendered for any style.** Re-run the six styles later on a less memory-starved machine/session if
needed (prompts above; the generation recipe is `build_flux_gguf_graph` with those clauses).
