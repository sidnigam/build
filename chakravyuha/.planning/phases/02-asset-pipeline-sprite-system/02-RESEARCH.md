# Phase 2: Asset Pipeline + Sprite System - Research

**Researched:** 2026-06-20
**Domain:** PixiJS 8 renderer migration, AI-art (ComfyUI/SDXL) production pipeline, atlas packing, sprite animation, AI provenance + Steam disclosure
**Confidence:** HIGH (renderer + tooling), MEDIUM (Steam AI survey specifics, post-Jan-2026 rules)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Renderer Migration**
- **D-01:** Migrate to PixiJS 8 now — do NOT benchmark first. Skip the Canvas2D gate.
- **D-02:** PixiJS renderer **replaces** the Canvas 2D context entirely — one rendering surface, not a two-surface overlay.
- **D-03:** `CAMERA.begin/end` refactored to manipulate a PixiJS `Container` `position`/`scale` instead of `ctx.save/restore` + transforms. Named passes (renderBackground, renderEntities, renderEffects) become operations on child Containers within the camera Container.
- **D-04:** HUD lives on a **separate PixiJS Container** at root level, outside the camera Container (preserves Phase 1 D-10 — HUD never shakes).
- **D-05:** Smoke-test headless guard — the PixiJS Application/stage must be guarded behind `typeof document !== 'undefined'` (or equivalent). Entities' `draw()` methods must remain callable without a live PixiJS stage.

**AI Art Toolchain**
- **D-06:** Use **ComfyUI + SDXL locally** for all art generation. Commercial-safe checkpoint license (verify before use); reproducible via saved workflow JSON + fixed seeds.
- **D-07:** Style consistency via **reference sheet + locked workflow**: produce one Abhimanyu reference sheet first; lock the ComfyUI workflow (model, sampler, CFG, prompt template); generate all subsequent characters from the same workflow with the reference sheet as ControlNet input. Deviations regenerated.
- **D-08:** Sprite resolution standard: **128×128px per frame** for all characters; **512×288px** for background/floor tile assets.

**Sprite Format + Asset Loader**
- **D-09:** **Packed atlas per character + JSON descriptor**. ComfyUI outputs loose frames → `free-tex-packer-core` script packs them into an atlas PNG + JSON → game loads the atlas via PixiJS 8 `Assets.load()`.
- **D-10:** Asset directory layout:
  ```
  assets/sprites/
    player/    → player-atlas.png + player-atlas.json
    enemies/   → {type}-atlas.png + {type}-atlas.json
    bosses/    → {name}-atlas.png + {name}-atlas.json
    biomes/    → {biome}-bg.png, {biome}-floor.png (not atlased — full scene images)
    ui/        → ui-atlas.png + ui-atlas.json (boon cards, HUD elements, overlays)
  assets/sprites/PROVENANCE.json
  ```
- **D-11:** Graceful fallback when an atlas is missing: **silent fallback to existing Canvas primitive draw**. Loader checks for atlas at load time; if missing → `console.warn` + flag entity to use legacy `draw()` path. No crash, no visible error, smoke tests pass with zero assets present.
- **D-12:** New `SPRITES` vanilla JS global (same pattern as `CAMERA`/`GAME`) in `js/sprites.js`. Wraps PixiJS `Assets`; exposes `SPRITES.load()`, `SPRITES.get(key)`, `SPRITES.createAnimatedSprite(key, anim)`. Loaded via `<script>` in `index.html` after `renderer.js`.

**Provenance Logging**
- **D-13:** Single `assets/sprites/PROVENANCE.json` listing every generated asset (schema: filename, prompt, negative_prompt, model, checkpoint, sampler, cfg, seed, generated_date, post_processing[]).
- **D-14:** Provenance is per-atlas (asset level), not per-frame. Stored in git alongside assets.

### Claude's Discretion
- PixiJS Application init parameters (resolution, backgroundColor, antialias) — choose based on Chromium/Electron defaults and game resolution.
- Exact PixiJS scene-graph hierarchy within each named-pass Container.
- free-tex-packer configuration (padding, algorithm, output format).
- Animation frame counts per state — start minimal (idle: 4f, run: 6f, attack: 5f, dash: 4f); expand if art quality allows.
- SDXL checkpoint selection — pick a confirmed commercial-safe license before generation starts.

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
- (From phase boundary) Particles, hitstop, screen shake, kill-zoom → Phase 3. Gameplay depth → Phase 4. Desktop wrapper → Phase 5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RENDER-02 | Asset loader: loads sprite sheets from disk, graceful fallback to primitives if missing | PixiJS 8 `Assets.load()` for atlas; fallback via try/catch + per-entity `hasSprite` flag (see Architecture Pattern 3 + Pitfall 3) |
| RENDER-03 | Sprite manager: per-actor frame animation (frame index, timing, loop/once) | PixiJS 8 `AnimatedSprite` from `sheet.animations`; `animationSpeed`, `loop`, `play()`/`gotoAndPlay()` (Code Example 2). NOTE: `animations` block must be injected by pack script — see Pitfall 1 |
| ART-01 | Player sprite (Abhimanyu) — 4+ states (idle, run, attack, dash) | ComfyUI+SDXL reference-sheet-first workflow (D-07); 128×128 frames; reference sheet is the visual anchor — generate first, lock, approve |
| ART-02 | Enemy sprites — 6+ distinct archetypes | Codebase has **8** archetypes in `DATA.ENEMIES` (preta, rakshasa, archer, naga, vetala, bhuta, daitya, yatudhana) — exceeds the 6 minimum |
| ART-03 | Boss sprites — all 4 bosses + phase-2 variant | Codebase `DATA.BOSSES`: tataka, ahiravana, kumbhakarna, yama. 256×256 (double base). "phase-2 variant" = second illustrated form/palette per boss (the gameplay phase-2 behavior is Phase 4 GAME-05; here it's the art asset) |
| ART-04 | Environmental art — bg + floor for 4 biomes | Codebase `DATA.BIOMES`: naraka, patala, ranabhoomi/vaitarani (4). 512×288 full-scene images, not atlased (D-10) |
| ART-05 | UI art — boon cards, HUD, overlays w/ Indian motifs | `ui-atlas.png/json`; existing UI in `js/ui.js` + HUD in `GAME.renderHUD` |
| ART-06 | AI provenance log — prompt/model/post-processing per asset | `PROVENANCE.json` schema (D-13); ComfyUI workflow JSON IS the seed record (D-06) |
| QA-04 | Steam AI Content Survey completed for AI assets | Steam "Pre-Generated" AI disclosure on the Content Survey; gated on provenance complete. See State of the Art + Open Questions |
</phase_requirements>

## Summary

This phase has two coupled tracks: a **renderer migration** (Canvas 2D → PixiJS 8) and an **AI-art production pipeline** (ComfyUI/SDXL → free-tex-packer-core → atlas → PixiJS). The locked decisions (D-01..D-14) are already prescriptive and align with the project's CLAUDE.md stack. Research confirms all chosen tools are current and the chosen APIs exist as specified.

The single highest-risk technical detail: **PixiJS v8's `sheet.animations` only populates if the atlas JSON contains an `animations` block** keyed by animation name → ordered frame-name array. free-tex-packer-core's `"Pixi"` exporter emits `frames` + `meta` but **does not emit an `animations` block** (it has no concept of animation grouping). The pack script (`tools/pack-atlas.js`) must therefore inject the `animations` block, OR `SPRITES.createAnimatedSprite` must build the frame-texture array itself by filename pattern. Plan for this explicitly — it is the difference between RENDER-03 working and silently producing single-frame sprites.

The PixiJS v8 `Application.init()` is **async** (a v7→v8 breaking change driven by WebGPU support). Because the codebase boots synchronously and the smoke test runs headless with no DOM/WebGL, the `SPRITES`/PixiJS bootstrap must be guarded (D-05) so the game logic, `simulateRun`, and all `entity.draw()` paths remain callable with zero assets and no live stage.

**Primary recommendation:** Build the pipeline back-to-front. (1) Stand up `js/sprites.js` with the fallback path FIRST so smoke stays green with zero art. (2) Migrate the renderer with primitives still drawing via a Pixi `Graphics`/Canvas bridge. (3) Lock the ComfyUI workflow on the Abhimanyu reference sheet and get human approval before mass generation. (4) Wire `tools/pack-atlas.js` to inject the `animations` block. (5) Generate assets archetype-by-archetype, each landing a `PROVENANCE.json` entry.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pixi.js | **8.19.0** (verified npm 2026-06-05) | WebGL2/WebGPU 2D renderer | CLAUDE.md mandate; fastest JS 2D renderer; renderer-only (drops under existing loop) |
| free-tex-packer-core | **0.3.8** (verified npm) | Pack loose AI frames → atlas PNG + PixiJS JSON | CLAUDE.md mandate; scriptable in Node CI; `"Pixi"` exporter |
| ComfyUI + SDXL | local install | AI art generation | D-06; reproducible via workflow JSON + seeds; best provenance |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sharp | **0.35.2** (verified npm) | Load/resize/buffer PNG frames for the pack script; PNG I/O | Pack script reads ComfyUI frames, normalizes to 128×128, feeds free-tex-packer-core |
| rembg (Python) | latest | Background removal on generated frames | If ComfyUI workflow doesn't already produce transparent backgrounds (referenced in D-13 post_processing example) |
| @pixi/node | 8.0.0 (if ever needed) | Headless Pixi for Node | **NOT recommended for smoke test** — adds native deps; the existing `ctxStub` headless guard (D-05) is simpler and the locked approach |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| free-tex-packer-core | TexturePacker CLI | TexturePacker auto-emits the `animations` block and has better trimming, but is paid for the pro features and not `npm install`-able into CI. CLAUDE.md lists it as the alternative; free-tex-packer-core is the chosen default (D-09). |
| ComfyUI ControlNet consistency | IPAdapter / LoRA training on Abhimanyu | A character LoRA gives stronger consistency than ControlNet pose-transfer but needs a training step + dataset. D-07 locks reference-sheet + ControlNet — do not switch without revisiting CONTEXT. |
| Per-character atlas | One mega-atlas | D-09 locks per-character atlas (better fallback granularity — a missing player atlas doesn't kill enemies). Keep it. |

**Installation:**
```bash
npm init -y            # no package.json exists yet — create one
npm install pixi.js@8 free-tex-packer-core sharp
# ComfyUI + SDXL checkpoint installed separately (Python); verify checkpoint license first
```

**Version verification (done 2026-06-20):** pixi.js 8.19.0 (pub 2026-06-05), free-tex-packer-core 0.3.8, sharp 0.35.2, @pixi/node 8.0.0. All current.

## Architecture Patterns

### Recommended Project Structure
```
js/
├── renderer.js      # CAMERA — refactored to drive a Pixi camera Container (D-03)
├── sprites.js       # NEW: SPRITES global — Assets wrapper, animation, fallback (D-12)
├── game.js          # render passes become Container operations
└── entities.js      # draw(ctx) kept as fallback; add sprite-draw branch
tools/
└── pack-atlas.js    # NEW: free-tex-packer-core build step + animations-block injection
assets/sprites/
├── player/ enemies/ bosses/ biomes/ ui/   # D-10 layout
└── PROVENANCE.json
test/smoke.js        # add 'sprites.js' to file list, in order after renderer.js
index.html           # <script src="js/sprites.js"> after renderer.js, before game.js
```

### Pattern 1: Async PixiJS bootstrap behind a DOM guard (D-05)
**What:** PixiJS v8 `Application.init()` is async and needs a canvas + WebGL. The game boots synchronously and the smoke test has neither.
**When to use:** In `SPRITES.load()` / app init only. Never at module top level.
**Example:**
```javascript
// js/sprites.js — Source: pixijs.com v8 migration guide (async init is a v8 breaking change)
'use strict';
const SPRITES = {
  app: null, sheets: {}, ready: false,
  async init() {
    if (typeof document === 'undefined') return;   // D-05 headless guard
    const { Application } = await import('pixi.js'); // or global from <script> build
    this.app = new Application();
    await this.app.init({
      canvas: document.getElementById('game'),
      width: 1280, height: 720,
      backgroundColor: 0x0b0710,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
  },
};
```
Note the discretion items (resolution/backgroundColor/antialias) are filled with sane Chromium-Electron defaults; backgroundColor matches the existing `'#0b0710'` clear.

### Pattern 2: Camera as a Container (D-03, D-04)
**What:** Replace `ctx.save/translate/scale/restore` with a `worldContainer` whose `position`/`scale`/jitter is set in `CAMERA.begin`, and a sibling `hudContainer` outside it.
**When to use:** The `CAMERA` refactor.
**Example:**
```javascript
// Scene graph: stage → [ worldContainer → (bgC, entityC, fxC), hudContainer ]
CAMERA.begin() {
  worldContainer.position.set(this.x, this.y);
  worldContainer.scale.set(this.zoom);
  if (GAME.shake > 0.5) worldContainer.position.set(
    this.x + U.rand(-GAME.shake, GAME.shake) * 0.5,
    this.y + U.rand(-GAME.shake, GAME.shake) * 0.5);
}
// hudContainer is a stage child, NOT a worldContainer child — never shakes (D-04/Phase-1 D-10)
```
The named passes (renderBackground/Entities/Effects) add/update children of `bgC`/`entityC`/`fxC` respectively. Danger zones stay in the background pass under actors (preserves Phase 1 z-order decision).

### Pattern 3: Sprite-or-fallback per entity (RENDER-02, D-11)
**What:** Each entity checks for its atlas once; draws a Pixi `AnimatedSprite` if present, else calls its legacy `draw(ctx)`.
**When to use:** `GAME.renderEntities`.
**Example:**
```javascript
// In renderEntities — pseudo
for (const e of entities) {
  if (SPRITES.has(e.spriteKey)) SPRITES.drawEntity(e);   // updates an AnimatedSprite
  else e.draw(legacyCtxOrGraphicsBridge);                 // D-11 silent fallback
}
```
Because D-02 removes the Canvas 2D context entirely, the legacy `draw(ctx)` primitives must be retargeted. Two viable approaches for the planner to choose:
- **(a)** Keep a hidden 2D canvas as a Pixi texture source, run `draw(ctx)` onto it, upload as a texture each frame (simplest, preserves all primitive draws unchanged, modest perf cost — acceptable since fallback is the no-art path).
- **(b)** Port each primitive `draw()` to Pixi `Graphics` calls (more work, better perf, but doubles the draw code).
Recommendation: **(a)** for fallback — fallback is the zero-art / smoke-test path and need not be fast; reserve Graphics ports for cases where art is intentionally primitive (e.g. telegraphs, danger zones in Phase 3).

### Anti-Patterns to Avoid
- **Importing pixi.js at module scope in `sprites.js` unconditionally:** breaks the smoke test (`vm.runInContext` has no `window`/WebGL, and pixi.js touches globals on import). Guard all Pixi access behind `typeof document !== 'undefined'`. The existing `ctxStub` (Proxy absorbing all canvas ops) means the **game logic** path must never reach real Pixi.
- **Assuming `sheet.animations` is auto-populated:** it is NOT, with free-tex-packer-core output (see Pitfall 1).
- **One mega-atlas:** defeats per-asset fallback granularity (D-09 locks per-character).
- **Per-frame provenance:** D-14 locks per-atlas; don't over-record.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frame animation (index, timing, loop/once) | Custom frame-timer in each entity | PixiJS `AnimatedSprite` (`animationSpeed`, `loop`, `onComplete`, `gotoAndPlay`) | RENDER-03 is exactly what AnimatedSprite does; rolling your own re-implements ticker math + loop/once modes |
| Atlas packing (bin-packing, trim, rotation) | Custom packer | free-tex-packer-core | NP-hard bin packing, trimming, rotation, max-texture-size splitting — all solved |
| Asset load/cache/dedup | Manual `Image()` + Promise tracking | PixiJS `Assets` (`load`, `cache`, `unload`) | Handles caching, dedup, parsing the spritesheet JSON into textures |
| Background removal | Threshold/chroma-key in JS | rembg or a ComfyUI alpha-matte node | Edge quality on illustrated art needs a real matting model |
| Style consistency | Eyeballing prompts | Locked workflow JSON + fixed seed + ControlNet (D-07) | Reproducibility IS the provenance artifact (D-06) |

**Key insight:** Every piece of this pipeline has a mature solution. The only genuinely custom code is the glue: `js/sprites.js` (≈the `CAMERA`-sized wrapper) and `tools/pack-atlas.js` (the animations-block injector). Keep both thin.

## Runtime State Inventory

> This is a renderer-migration + new-asset phase, not a rename/refactor. Most categories are N/A, but the migration touches persisted state and build artifacts, so listed for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no save schema change. localStorage (META) untouched by rendering. | None — verified: only `renderer.js`/`game.js`/`entities.js` render paths change. |
| Live service config | None — no external services in this phase. | None. |
| OS-registered state | None — no Electron/OS integration yet (Phase 5). | None. |
| Secrets/env vars | None. | None. |
| Build artifacts | **No `package.json` / `node_modules` exists yet.** Adding pixi.js + free-tex-packer-core creates the first npm dependency tree. Generated atlases (`assets/sprites/*`) are new build outputs. | Create `package.json`; decide whether to commit `node_modules` or `.gitignore` it; commit atlases + PROVENANCE.json to git (D-14). |

## Common Pitfalls

### Pitfall 1: `sheet.animations` empty — single-frame sprites instead of animation
**What goes wrong:** `new AnimatedSprite(sheet.animations['idle'])` throws or yields one frame because `sheet.animations` is `{}`.
**Why it happens:** PixiJS v8 only builds `sheet.animations` from an **`animations` object in the atlas JSON** (`{ "idle": ["player_idle_0.png", "player_idle_1.png", ...] }`). free-tex-packer-core's `"Pixi"` exporter writes `frames` + `meta` but **no `animations` block** — it has no animation concept.
**How to avoid:** In `tools/pack-atlas.js`, after packing, parse the frame names, group by animation prefix, and inject an `animations` block into the JSON before writing. Establish a strict frame-naming convention (e.g. `player_idle_0.png ... player_idle_3.png`, `player_run_0.png ...`) so grouping is mechanical. Alternatively, have `SPRITES.createAnimatedSprite(key, anim)` build the frame array from `sheet.textures` by matching `${anim}_N` keys — but injecting the block at pack time is cleaner and keeps the runtime dumb.
**Warning signs:** Sprites freeze on frame 0; `Object.keys(sheet.animations).length === 0` after `Assets.load`.

### Pitfall 2: Async init races the first render
**What goes wrong:** First `GAME.render()` runs before `Assets.load()` resolves → sprites missing on frame 1, or `this.app` is null.
**Why it happens:** v8 `Application.init()` and `Assets.load()` are async; the game's `requestAnimationFrame` loop is sync.
**How to avoid:** Treat "assets not ready" identically to "assets missing" — fall through to the D-11 fallback path until `SPRITES.ready === true`. This also means a slow load degrades gracefully to primitives rather than a blank screen.
**Warning signs:** Flicker of primitives → sprites on boot (acceptable); or null-deref crash (not acceptable — guard it).

### Pitfall 3: Smoke test breaks on the new file
**What goes wrong:** `node test/smoke.js` throws on loading `sprites.js`, or `GAME.render()` calls a Pixi method through the headless `ctxStub`.
**Why it happens:** `smoke.js` loads each `js/*.js` via `vm.runInContext` in a sandbox with a fake `document` (no real canvas/WebGL) and a `ctxStub` Proxy. PixiJS touching `navigator`/`WebGL`/`HTMLCanvasElement` will throw.
**How to avoid:** (1) Add `'sprites.js'` to the `files` array in `smoke.js` (after `renderer.js`). (2) `sprites.js` must do nothing Pixi-related at module scope. (3) Every render path must reach the fallback when `SPRITES.ready` is false — which it always is in the headless sandbox (`SPRITES.init` early-returns on `typeof document === 'undefined'`... but note the sandbox DOES define `document`). **Important:** the smoke sandbox sets `sandbox.document = documentStub`, so `typeof document !== 'undefined'` is TRUE in smoke. Guard on a stronger signal — e.g. `typeof navigator === 'undefined'` or wrap PixiJS init in try/catch and set `ready=false` on failure. Verify the chosen guard against `test/smoke.js`'s sandbox (it has `document` but no `navigator`, no `requestAnimationFrame` that fires, no WebGL).
**Warning signs:** `smoke.js` exits non-zero; stack traces mentioning `pixi.js` / `WebGL` / `navigator`.

### Pitfall 4: SDXL checkpoint license is non-commercial
**What goes wrong:** Generate hundreds of assets, then discover the checkpoint forbids commercial use → cannot ship.
**Why it happens:** Many popular SDXL fine-tunes carry non-commercial or ambiguous licenses; base SDXL 1.0 is permissive (CreativeML OpenRAIL++-M) but derivatives vary.
**How to avoid:** Per D-06/discretion — confirm the exact checkpoint's license permits commercial redistribution of outputs BEFORE the Abhimanyu reference sheet is generated. Record the checkpoint name + license in PROVENANCE.json (the schema already has `checkpoint`). Make this a Wave 0 / first-task gate.
**Warning signs:** License says "non-commercial", "research only", or is silent on output ownership.

### Pitfall 5: Style drift across characters
**What goes wrong:** Enemies/bosses don't read as the same illustrated world as Abhimanyu.
**Why it happens:** Prompt-only generation without a locked workflow / reference conditioning.
**How to avoid:** D-07 — lock the workflow JSON after the approved reference sheet; feed the reference as ControlNet input; regenerate deviations. The human-approval gate on the reference sheet is the linchpin — schedule it as an explicit milestone before mass generation.
**Warning signs:** Inconsistent line weight, palette, or rendering style between assets.

## Code Examples

### Example 1: Load an atlas and build animations (RENDER-02 / RENDER-03)
```javascript
// Source: PixiJS v8 sprite-sheet + AnimatedSprite API (pixijs.com v8 docs)
import { Assets, AnimatedSprite } from 'pixi.js';

const sheet = await Assets.load('assets/sprites/player/player-atlas.json');
// REQUIRES the atlas JSON to contain an `animations` block (see Pitfall 1)
const idle = new AnimatedSprite(sheet.animations['idle']);
idle.animationSpeed = 0.15;   // frames advanced per ticker frame
idle.loop = true;
idle.anchor.set(0.5);
idle.play();
entityContainer.addChild(idle);

// one-shot (attack/dash):
const attack = new AnimatedSprite(sheet.animations['attack']);
attack.loop = false;
attack.onComplete = () => { /* swap back to idle/run */ };
attack.gotoAndPlay(0);
```

### Example 2: free-tex-packer-core pack step with animations injection (tools/pack-atlas.js)
```javascript
// Source: github.com/odrick/free-tex-packer-core README (Node API) + injection glue
const texturePacker = require('free-tex-packer-core');
const fs = require('fs');

const images = frameFiles.map(f => ({ path: f.name, contents: fs.readFileSync(f.path) }));
texturePacker(images, {
  textureName: 'player-atlas',
  exporter: 'Pixi',          // PixiJS-compatible JSON Hash
  width: 2048, height: 2048,
  padding: 2,                // discretion: avoid bleeding
  allowRotation: false,      // simpler for AnimatedSprite frame order
  allowTrim: true,
  removeFileExtension: false,
}, (files, error) => {
  if (error) throw error;
  for (const file of files) {
    if (file.name.endsWith('.json')) {
      const atlas = JSON.parse(file.buffer.toString());
      // INJECT animations: group frame keys by `${anim}_N` prefix (Pitfall 1)
      atlas.animations = groupFramesByAnimation(Object.keys(atlas.frames));
      fs.writeFileSync(`assets/sprites/player/${file.name}`, JSON.stringify(atlas));
    } else {
      fs.writeFileSync(`assets/sprites/player/${file.name}`, file.buffer);
    }
  }
});
```

### Example 3: Headless-safe SPRITES global skeleton (D-12, Pitfall 3)
```javascript
// js/sprites.js — must not touch Pixi at module scope; guard against smoke sandbox
'use strict';
const SPRITES = {
  ready: false, app: null, sheets: {}, _missing: new Set(),
  async load(manifest) {
    // smoke sandbox HAS `document` but no real WebGL/navigator — guard accordingly
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
    try {
      // init Application + Assets.load(...) here
      this.ready = true;
    } catch (e) { console.warn('SPRITES disabled — fallback to primitives', e); this.ready = false; }
  },
  has(key) { return this.ready && !!this.sheets[key]; },     // D-11
  get(key) { return this.sheets[key]; },
  createAnimatedSprite(key, anim) { /* AnimatedSprite from sheets[key].animations[anim] */ },
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PixiJS v7 sync `new Application(opts)` | v8 `new Application()` + `await app.init(opts)` | PixiJS v8 (2024) | Bootstrap is async; must guard headless (D-05, Pitfall 2/3) |
| v7 `@pixi/*` sub-packages | v8 single `pixi.js` import | v8 | One install, simpler `<script>` bundling |
| v7 `Graphics().beginFill().drawRect().endFill()` | v8 `Graphics().rect().fill()` | v8 | If any primitive is ported to Graphics (fallback approach b), use new API |
| Steam: no AI disclosure | Steam Content Survey **AI Content Disclosure** (Pre-Generated vs Live-Generated) | rules **rewritten Jan 2026** to focus on content "consumed by players" | QA-04: disclose AI-generated art as Pre-Generated; provenance log backs the disclosure |

**Deprecated/outdated:**
- PixiJS v7 patterns in older tutorials — verify any copied snippet against v8 (Graphics API + async init are the common traps).
- Pre-2026 Steam AI-disclosure guidance — Valve narrowed scope in Jan 2026; efficiency/dev tools (e.g. code assistants) are now exempt, but player-facing AI art (this phase's output) is **in scope** and must be disclosed.

## Common Operations Quick Reference

- **Atlas JSON format:** TexturePacker/free-tex-packer "JSON Hash" — `{ frames: {name: {frame:{x,y,w,h}, rotated, trimmed, spriteSourceSize, sourceSize}}, meta: {image, size, scale}, animations: {name: [frameName...]} }`. The `animations` block is the part free-tex-packer omits — inject it.
- **Frame naming convention (establish in plan):** `{actor}_{state}_{n}.png` zero-padded (e.g. `tataka_idle_00.png`). Drives the grouping injector and keeps frame order deterministic.
- **Boss sizing:** 256×256 source frames (double the 128 base, per CONTEXT specifics) — keep within the 2048 atlas; ~8 frames of 256 fits comfortably.

## Open Questions

1. **Exact fields of the current Steam AI Content Survey (post-Jan-2026)**
   - What we know: Pre-Generated AI content (ships with game, consumed by players) must be disclosed on the Content Survey; disclosure appears publicly as "AI Generated Content Disclosure"; developers describe what AI was used and (for live AI) guardrails.
   - What's unclear: the precise free-text/field structure of the 2026 form (Steamworks doc page is behind partner login; could not fetch live). The store page does not exist yet, so the survey can't actually be submitted in Phase 2.
   - Recommendation: Treat QA-04 in this phase as **"produce the disclosure-ready record"** — a `PROVENANCE.json` complete enough to fill the survey, plus a short `assets/sprites/AI-DISCLOSURE.md` drafting the public disclosure text. Actual submission happens with the store page (Phase 7 QA-03/STEAM-05 timeframe). Verify exact fields against the live partner form when the store page is created.

2. **Whether to commit `node_modules` (no build system exists yet)**
   - What we know: The game ships as `<script>`-loaded vanilla JS; PixiJS will be a new dependency; Electron wrapper is Phase 5.
   - What's unclear: whether PixiJS is loaded as a bundled `<script>` (vendored `pixi.min.js` in repo) or via npm/import.
   - Recommendation: For Phase 2, **vendor a single `pixi.min.js`** into the repo and load via `<script>` (matches the existing no-module-system pattern; D-12 says `sprites.js` loads via `<script>`). Keep `free-tex-packer-core`/`sharp` as devDependencies for the pack tool only (Node, never shipped). This avoids introducing a bundler mid-milestone.

3. **"Phase-2 boss variant" — art asset vs gameplay**
   - What we know: ART-03 says "with a phase-2 variant"; GAME-05 (multi-phase boss behavior) is Phase 4.
   - What's unclear: scope of the variant in THIS phase.
   - Recommendation: In Phase 2, deliver the **art asset** for each boss's second form (alternate palette / damaged / enraged sprite set). The behavior that triggers it is Phase 4. Plan the asset, not the trigger logic.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | pack tool, smoke test | ✓ | v25.6.1 | — |
| npm | install pixi/packer/sharp | ✓ | (bundled w/ Node) | — |
| ComfyUI + SDXL | ART-01..05 generation | ✗ (not verified on this machine) | — | None — required for art; human installs locally (D-06). Pipeline code can be built/tested with placeholder frames before ComfyUI is set up. |
| Python (for ComfyUI / rembg) | art post-processing | ✗ (not verified) | — | rembg optional if ComfyUI emits transparency |
| Commercial-safe SDXL checkpoint | all generation | ✗ (must be selected) | — | None — Wave 0 gate (Pitfall 4) |

**Missing dependencies with no fallback:**
- ComfyUI + SDXL + a license-cleared checkpoint — blocks actual art generation. **Does NOT block** building/testing the renderer migration, `sprites.js`, `pack-atlas.js`, or fallback paths (those work with zero or placeholder assets — by design, D-11).

**Missing dependencies with fallback:**
- rembg — only needed if the ComfyUI workflow doesn't already produce transparent PNGs.

**Sequencing implication:** The renderer + loader + packer + fallback (RENDER-02, RENDER-03, the `SPRITES` global, `tools/pack-atlas.js`) can all be built and smoke-verified with **placeholder/empty assets** before ComfyUI exists. Art generation (ART-01..06) is gated on the toolchain + license being ready. Plan these as separable tracks.

## Validation Architecture

> nyquist_validation is enabled (config.json workflow.nyquist_validation: true).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Custom Node smoke harness (`test/smoke.js`) — no jest/vitest; `vm.runInContext` sandbox |
| Config file | none — single self-contained script |
| Quick run command | `node test/smoke.js` |
| Full suite command | `node test/smoke.js` (same — it is the whole suite) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RENDER-02 | Loader falls back to primitives when atlas missing (zero assets present) | smoke | `node test/smoke.js` (must stay green with `js/sprites.js` loaded and no assets) | ✅ extend smoke |
| RENDER-02 | `js/sprites.js` loads headless without crashing | smoke | `node test/smoke.js` | ❌ Wave 0 — add `'sprites.js'` to files list + headless guard assertion |
| RENDER-03 | `SPRITES.createAnimatedSprite` returns a frame array for a known animation when assets present | unit-ish | new assertion in smoke (mock a sheet object; verify frame grouping) | ❌ Wave 0 — add `check('animation frames grouped', ...)` |
| RENDER-03 | Entities still call `draw()` (fallback) when `SPRITES.ready` is false | smoke | `node test/smoke.js` (already exercises render via `GAME.render()` in `simulateRun`) | ✅ implicit — render runs every frame in sim |
| ART-01..05 | Assets exist + are valid atlases | manual | human visual review (illustrated art quality is not machine-verifiable) | manual-only — justified: art aesthetics + silhouette quality need human eyes |
| ART-06 | Every atlas has a PROVENANCE.json entry | unit | new smoke/CI check: every `*-atlas.png` under `assets/sprites/` has a matching `PROVENANCE.json` entry | ❌ Wave 0 — add provenance-completeness check |
| QA-04 | Disclosure record is complete enough to fill the survey | manual | human review of PROVENANCE.json + AI-DISCLOSURE.md draft | manual-only — survey submission is Phase 7 |

### Sampling Rate
- **Per task commit:** `node test/smoke.js`
- **Per wave merge:** `node test/smoke.js`
- **Phase gate:** `node test/smoke.js` green + human art review + provenance-completeness check green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/smoke.js` — add `'sprites.js'` to the `files` array (correct order: after `renderer.js`, before `game.js`)
- [ ] `test/smoke.js` — add headless-guard assertion: `js/sprites.js` loads and `GAME.render()` runs without a live Pixi stage (verify the chosen guard handles the sandbox that has `document` but no `navigator`/WebGL — Pitfall 3)
- [ ] `test/smoke.js` — add frame-grouping unit assertion for `SPRITES.createAnimatedSprite` / the animations injector
- [ ] `test/smoke.js` (or `tools/`) — add provenance-completeness check (every atlas ↔ PROVENANCE.json entry) for ART-06
- [ ] `package.json` — create it (none exists); add pixi/packer/sharp; optionally a `test` script (`node test/smoke.js`)

*(No general test framework needed — the existing smoke harness is the project's test infra per CLAUDE.md and covers the integration surface.)*

## Sources

### Primary (HIGH confidence)
- npm registry (verified 2026-06-20): pixi.js 8.19.0 (pub 2026-06-05), free-tex-packer-core 0.3.8, sharp 0.35.2, @pixi/node 8.0.0
- PixiJS v8 migration guide — async `Application.init()`, single `pixi.js` package, Graphics API overhaul, `Assets.load`, Ticker callback: https://pixijs.com/8.x/guides/migrations/v8
- free-tex-packer-core README — Node `texturePacker()` API, `exporter: 'Pixi'`, options, callback output: https://github.com/odrick/free-tex-packer-core
- Codebase: `js/renderer.js` (CAMERA), `js/entities.js` (player/Enemy `draw`), `js/game.js` (render passes, `init`), `js/data.js` (8 enemies, 4 bosses, 4 biomes), `test/smoke.js` (vm sandbox, file list, render-in-sim)
- CLAUDE.md §Technology Stack — PixiJS 8 / free-tex-packer mandate, version table

### Secondary (MEDIUM confidence)
- StraySpark — Steam 2026 AI Disclosure rules, Pre-Generated definition: https://www.strayspark.studio/blog/steam-ai-disclosure-rules-2026-indie-developer-guide
- PC Gamer — Steam Jan 2026 update narrows AI disclosure to player-consumed content: https://www.pcgamer.com/software/ai/steam-updates-ai-disclosure-form-to-specify-that-its-focused-on-ai-generated-content-that-is-consumed-by-players-not-efficiency-tools-used-behind-the-scenes/
- Steamworks Content Survey doc (AI disclosure is part of it): https://partner.steamgames.com/doc/gettingstarted/contentsurvey

### Tertiary (LOW confidence — flagged for validation)
- PixiJS `Spritesheet.animations` requires an `animations` block in atlas JSON, and free-tex-packer-core omits it (Pitfall 1) — established from training + v8 docs structure; **validate empirically** by inspecting one free-tex-packer-core "Pixi" output and a `sheet.animations` dump during implementation (Wave 0).
- Exact 2026 Steam AI survey field structure — partner-login-gated; could not fetch live (Open Question 1).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm; tools match CLAUDE.md mandate
- Architecture (renderer migration, fallback, sprite manager): HIGH — v8 API confirmed; integration points read directly from source
- Animations-block injection pitfall: MEDIUM — strongly expected from v8 spritesheet structure; flagged to validate empirically in Wave 0
- Steam AI survey: MEDIUM — 2026 rules confirmed via reputable secondary sources; exact form fields unverified (partner-gated, store page doesn't exist yet)
- ComfyUI/SDXL pipeline: MEDIUM — approach is locked by D-06/D-07; license + consistency are human-gated, not machine-verifiable

**Research date:** 2026-06-20
**Valid until:** ~2026-07-20 for PixiJS/tooling (stable); ~2026-07-04 for Steam AI rules (recently changed, may iterate)
