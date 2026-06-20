# Phase 2: Asset Pipeline + Sprite System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 02-asset-pipeline-sprite-system
**Areas discussed:** Renderer choice, AI art toolchain + style consistency, Sprite format + asset loader API, Provenance logging format

---

## Renderer Choice

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate to PixiJS 8 now | GPU-batched sprites, Phase 3 VFX headroom, smoke test guard required | ✓ |
| Benchmark first, decide after | Worst-case FPS test on Canvas 2D before committing | |
| Stay on Canvas 2D (drawImage) | Simpler, no new library, risk of not holding 60FPS under Phase 3 VFX load | |

**User's choice:** Migrate to PixiJS 8 now

---

## PixiJS Integration Shape

| Option | Description | Selected |
|--------|-------------|----------|
| PixiJS replaces Canvas 2D context | One surface, CAMERA becomes Container manipulation, cleanest architecture | ✓ |
| PixiJS overlay on top of Canvas 2D | Two surfaces, z-order conflicts likely, awkward to maintain | |

**User's choice:** PixiJS renderer replaces the Canvas 2D context entirely

---

## AI Art Generation Tool

| Option | Description | Selected |
|--------|-------------|----------|
| ComfyUI + SDXL locally | Commercial-safe, reproducible, best provenance via workflow JSON | ✓ |
| Midjourney | High quality, style drift between sessions, manual provenance tracking | |
| Adobe Firefly / other web tool | Commercially safe, less control over animation consistency | |

**User's choice:** ComfyUI + SDXL locally

---

## Style Consistency Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Style reference sheet + locked workflow | Abhimanyu reference sheet first, ControlNet input for all subsequent art | ✓ |
| LoRA per character archetype | Higher upfront cost, better style lock-in | |
| Human-curated prompt discipline | Faster to start, drift likely over 50+ assets | |

**User's choice:** Style reference sheet + locked workflow (Recommended)

---

## Sprite Resolution Standard

| Option | Description | Selected |
|--------|-------------|----------|
| 128×128px characters, 512×288 backgrounds | Hades-style dimensions, manageable file sizes | ✓ |
| 256×256px characters | Higher detail, larger atlas files | |
| You decide | Claude picks based on canvas size and performance | |

**User's choice:** 128×128px per frame for characters, 512×288 for backgrounds

---

## Sprite Packaging Format

| Option | Description | Selected |
|--------|-------------|----------|
| Packed atlas + JSON (free-tex-packer) | PixiJS native format, fewer requests, optimal batching | ✓ |
| Per-animation strip files | Simpler to produce, more load requests | |
| Loose individual frame PNGs | Maximum flexibility, high load-time cost, not for ship | |

**User's choice:** Packed atlas per character + JSON descriptor (Recommended)

---

## Asset Directory Layout

| Option | Description | Selected |
|--------|-------------|----------|
| assets/sprites/ with subdirs per type | Clean separation, easy to extend | ✓ |
| assets/ flat with naming convention | Simpler folder, gets unwieldy at 20+ atlases | |
| You decide | Claude picks layout | |

**User's choice:** assets/sprites/ with subdirectories per type

---

## Missing Asset Fallback Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Silent fallback to Canvas primitive draw | No crash, smoke tests pass with zero assets, console.warn in dev | ✓ |
| Colored placeholder rectangle | More useful for art review, doesn't match prior art | |
| Fail loudly in dev, silent in production | Requires dev flag wiring | |

**User's choice:** Silent fallback to existing Canvas primitive draw

---

## Provenance Storage Format

| Option | Description | Selected |
|--------|-------------|----------|
| Single PROVENANCE.json in assets/sprites/ | One source of truth, searchable, git-tracked | ✓ |
| JSON sidecar per atlas | Provenance travels with asset, more files to manage | |
| PROVENANCE.md (Markdown table) | Human-readable, harder to parse programmatically | |

**User's choice:** Single PROVENANCE.json in assets/sprites/ (Recommended)

---

## Provenance Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Asset level — per-atlas specific post-processing | Accurate for Steam's per-asset disclosure requirement | ✓ |
| Global common steps + per-asset exceptions | Less repetition, risks missing asset-specific details | |

**User's choice:** Asset level — per-atlas entry describes its specific post-processing

---

## Claude's Discretion

- PixiJS Application initialization parameters (resolution, backgroundColor, antialias)
- Exact PixiJS scene graph hierarchy within each named pass Container
- free-tex-packer configuration (padding, algorithm, output format)
- Animation frame counts per state (starting minimal: idle 4f, run 6f, attack 5f, dash 4f)
- SDXL checkpoint selection (must confirm commercial-safe license first)

## Deferred Ideas

None — discussion stayed within phase scope.
