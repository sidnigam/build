# Phase 2: Asset Pipeline + Sprite System - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the AI-art production pipeline, asset loader, and sprite manager — replacing primitive Canvas 2D draws with cohesive illustrated sprites for player/enemies/bosses/biomes/UI, with provenance tracked from the first generated asset.

**In scope:** PixiJS 8 migration (renderer replacement), asset loader (RENDER-02), sprite manager (RENDER-03), all art production (ART-01 through ART-06), ComfyUI pipeline setup, atlas packing tooling, provenance logging, Steam AI Content Survey completion (QA-04).

**Out of scope:** Particles, hitstop, screen shake, kill-zoom (Phase 3). Gameplay content depth (Phase 4). Desktop wrapper (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Renderer Migration
- **D-01:** Migrate to PixiJS 8 now — do NOT benchmark first. Skip the Canvas2D gate; PixiJS GPU-batched rendering is the right choice for Hades-level sprite + VFX density and Phase 3 will require it anyway.
- **D-02:** PixiJS renderer **replaces** the Canvas 2D context entirely — not a two-surface overlay. One rendering surface: PixiJS owns it.
- **D-03:** `CAMERA.begin/end` is refactored to manipulate a PixiJS `Container`'s `position` and `scale` instead of `ctx.save/restore` + transforms. The named passes (renderBackground, renderEntities, renderEffects) become operations on child Containers within the camera Container.
- **D-04:** HUD lives on a **separate PixiJS Container** at root level, outside the camera Container, preserving the D-10 decision from Phase 1 (HUD never shakes with the world).
- **D-05:** Smoke test headless guard — the PixiJS Application and stage must be guarded behind `typeof document !== 'undefined'` (or equivalent). Entities' draw() methods must remain callable without a live PixiJS stage.

### AI Art Toolchain
- **D-06:** Use **ComfyUI + SDXL locally** for all art generation. Rationale: commercial-safe license (check checkpoint license before use), reproducible via saved workflow JSON + fixed seeds, best provenance tracking (workflow IS the seed record).
- **D-07:** Style consistency via **reference sheet + locked workflow**: produce one Abhimanyu reference sheet first (front/side/3-4 view in target style). Lock the ComfyUI workflow (model, sampler, CFG, prompt template). All subsequent characters generated from the same workflow with the reference sheet as ControlNet input. Deviations regenerated.
- **D-08:** Sprite resolution standard: **128×128px per frame** for all characters (player, enemies, bosses); **512×288px** for background/floor tile assets.

### Sprite Format + Asset Loader
- **D-09:** Sprite packaging: **packed atlas per character + JSON descriptor**. ComfyUI outputs loose frames → `free-tex-packer-core` script packs them into an atlas PNG + JSON → game loads the atlas. PixiJS 8 `Assets.load()` natively consumes this format.
- **D-10:** Asset directory layout:
  ```
  assets/sprites/
    player/          → player-atlas.png + player-atlas.json
    enemies/         → {type}-atlas.png + {type}-atlas.json
    bosses/          → {name}-atlas.png + {name}-atlas.json
    biomes/          → {biome}-bg.png, {biome}-floor.png (not atlased — full scene images)
    ui/              → ui-atlas.png + ui-atlas.json (boon cards, HUD elements, overlays)
  assets/sprites/PROVENANCE.json
  ```
- **D-11:** Graceful fallback when an atlas is missing: **silent fallback to existing Canvas primitive draw**. Asset loader checks for the atlas file at load time; if not found, logs `console.warn` and flags the entity to use its legacy `draw()` path. No crash, no visible error in production, smoke tests pass with zero assets present.
- **D-12:** New `SPRITES` vanilla JS global (same pattern as `CAMERA`, `GAME`, etc.) in `js/sprites.js`. Wraps PixiJS `Assets` loader and exposes `SPRITES.load()`, `SPRITES.get(key)`, `SPRITES.createAnimatedSprite(key, anim)`. Loaded via `<script>` in `index.html` after `renderer.js`.

### Provenance Logging
- **D-13:** Single `assets/sprites/PROVENANCE.json` — one JSON file listing every generated asset. Schema per entry:
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
    "generated_date": "2026-06-20",
    "post_processing": ["background removed via rembg", "frames extracted", "atlas packed via free-tex-packer"]
  }
  ```
- **D-14:** Provenance is per-atlas (asset level), not per-frame. Each atlas entry describes its specific post-processing steps. Stored in git alongside the assets.

### Claude's Discretion
- PixiJS Application initialization parameters (resolution, backgroundColor, antialias settings) — choose based on Chromium Electron defaults and game resolution.
- Exact PixiJS scene graph hierarchy within each named pass Container.
- free-tex-packer configuration (padding, algorithm, output format).
- Animation frame counts per state — start minimal (idle: 4f, run: 6f, attack: 5f, dash: 4f) and expand if art quality allows.
- SDXL checkpoint selection — pick a checkpoint with confirmed commercial-safe license before generation starts.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/REQUIREMENTS.md` §RENDER — RENDER-02 (asset loader with fallback) and RENDER-03 (sprite manager with animation) are the core infra requirements
- `.planning/REQUIREMENTS.md` §ART — ART-01 through ART-06 define all art deliverables and the provenance log requirement
- `.planning/REQUIREMENTS.md` §QA — QA-04 (Steam AI Content Survey) is gated on provenance logging being complete

### Existing Source Files to Read Before Planning
- `js/renderer.js` — current CAMERA global (19 lines); Phase 2 migrates this from Canvas 2D transforms to PixiJS Container manipulation
- `js/entities.js` — `player.draw(ctx)` (~line 435) and `Enemy.draw(ctx)` (~line 660); these are the fallback paths when sprite is missing AND the reference for what each entity's visual state represents
- `js/game.js` — `renderBackground()`, `renderEntities()`, `renderEffects()`, `renderHUD()` (Phase 1 named passes); these become PixiJS Container operations
- `test/smoke.js` — headless guard pattern; new `js/sprites.js` must be added to file list and must not crash without a DOM

### Stack Reference
- `CLAUDE.md` §Technology Stack — PixiJS 8 recommendation, `@pixi/particle-emitter` for Phase 3, `free-tex-packer` for atlas packing; read the full table before planning the renderer migration
- `CLAUDE.md` §Technology Stack — `TexturePacker (CLI) or free-tex-packer` entry covers atlas pipeline specifics

### Phase Success Criteria (from ROADMAP.md)
- `.planning/ROADMAP.md` §Phase 2 — 5 success criteria; #1 (fallback when asset missing), #2 (all characters animated), #3 (biomes + UI illustrated), #4 (provenance + Steam survey), #5 (smoke test green)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/renderer.js` → `CAMERA` global — the pattern to follow for new `SPRITES` global in `js/sprites.js`
- `player.draw(ctx)` in `js/entities.js` — kept as the fallback path; the sprite check wraps it, does not delete it
- `Enemy.draw(ctx)` in `js/entities.js` — same: fallback path, preserved intact
- `U.rand()` in `js/utils.js` — used in CAMERA shake; still usable for any procedural needs in sprite manager

### Established Patterns
- All infrastructure is vanilla JS globals (`GAME`, `CAMERA`, `DATA`, `META`, `AUDIO`, `UI`, `U`, `INPUT`) — `SPRITES` follows the same pattern, no module system
- `'use strict'` self-contained script files, loaded via `<script>` in `index.html` in dependency order
- `ctxStub` in `smoke.js` is a Proxy that absorbs all canvas ops — new file must not import PixiJS at module scope in the headless path
- Named render passes on `GAME` object (renderBackground, renderEntities, renderEffects, renderHUD) — these are the hooks for the PixiJS scene graph operations

### Integration Points
- `index.html` — add `<script src="js/sprites.js">` after `renderer.js` and before `game.js`
- `test/smoke.js` file list — add `js/sprites.js` in the correct load order
- `GAME.renderEntities(ctx)` — replace entity primitive draws with `SPRITES.drawEntity(entity, pixiStage)` calls; keep fallback to `entity.draw(ctx)` when no atlas
- `GAME.renderBackground(ctx)` — replace biome bg draw with PixiJS Sprite from biome atlas when available

</code_context>

<specifics>
## Specific Ideas

- **Visual target:** Hades-adjacent illustrated 2D with strong silhouettes, warm earth tones, Indian mythology motifs. NOT pixel art.
- **Abhimanyu reference sheet first** — this is the visual anchor for all other art. Everything else gets generated after this is locked and approved.
- **128×128 character sprites at 1–2× scale** fit the existing ~800×600 canvas with room for large bosses at 256×256 (double the base tile).
- **free-tex-packer-core** is the packing tool — scriptable in Node.js, no cost, outputs PixiJS-compatible JSON. The packing script lives in `tools/pack-atlas.js` and runs as a build step.
- **ComfyUI workflow JSON** is the provenance artifact — save the workflow alongside the prompt in PROVENANCE.json rather than transcribing all parameters manually.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-asset-pipeline-sprite-system*
*Context gathered: 2026-06-20*
