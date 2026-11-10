# Phase 2: Context Amendment — Art-Direction Pivot

**Amended:** 2026-09-25
**Authority:** Orchestrator audit; the user handed these decisions over ("user delegated decisions"). The user is away, so human review is **non-blocking** and happens later.
**Relationship to 02-CONTEXT.md:** Additive. The original CONTEXT is unchanged. Where an amendment below conflicts with an original decision, the amendment wins for plans 02-07 onward.

## Why this amendment exists

- Per-frame SDXL generation cannot keep a character consistent across large pose changes. run/attack/dash failed with low-denoise img2img because the legs do not move. They also failed with ControlNet OpenPose, where the outfit drifted. See `.planning/HANDOFF.json` blockers.
- The locked reference art is a tall, front-facing figure. In-game, the player hitbox is r=13 on a 1280x720 arena, so a sprite is roughly 52px tall. At that size, fine pose detail does not read. Silhouette, motion, and weapon read much better.

## Amended decisions

### D-07a (amends D-07): One key pose per character + procedural animation
- Each enemy and boss gets **ONE illustrated key pose**: a single txt2img image in the locked style.
- Animation is done **procedurally in code**, in the style of Brotato and Vampire Survivors:
  - idle: breathing squash/stretch
  - run: bob + lean in the direction of travel
  - facing flip (this already exists)
  - dash: stretch + afterimage ghosts
  - hit: white flash (ColorMatrix when `e.flash>0` or player `hurtT>0`) + squash
  - spawn: fade and scale in
  - death: shrink and fade
- The player **keeps the existing 4-frame idle atlas**. run/attack/dash are procedural transforms over the idle frames.
- **Weapon overlay:** the player's weapon is a separate Pixi object drawn in code with Graphics. There is one stylized weapon per `DATA.WEAPONS` entry: khanda = sword, gandiva = bow, gada = mace, in a gold + steel palette. It rotates with `e.aim` and sweeps along `e.swing {a,t,range,arc}` during attacks. This needs no AI art.
- Hit flash and all procedural states **read existing entity fields only**: `e.flash`, `e.spawnT`, `e.dead`, `e.phase`, `e.asleep`, `e.stun`, and player `hurtT`, `iframes`, `dashT`, `swing`, `trail`, `charging`, `charge`, `comboIdx`. There are **no changes to js/entities.js**, because Phase 3/4 own that file.
- The ControlNet reference-sheet conditioning named in D-07 is **not used**. Style consistency comes from the locked checkpoint + sampler + a locked style prompt template + fixed recorded seeds.

### D-08a (amends D-08): Sizes
- Enemies: one 128x128 frame. Bosses: one 256x256 frame, plus one 256x256 `phase2` frame.
- Biome backgrounds: **1280x720 PNG**, which supersedes 512x288. Each one is generated at 1344x768 and downscaled. It is a top-down painted ground texture, so a single `{id}-bg.png` is both the background and the floor. D-10's separate `{biome}-floor.png` is dropped.
- The sizing tunables in `SPRITES.CFG` still control on-screen size: HEIGHT_PER_R, BOSS_HEIGHT_PER_R, HEIGHT_PER_R_OVERRIDE, and a new MAX_WIDTH_PER_R.

### D-09a (amends D-09): Atlas naming for single-pose actors
- Frames are named `{key}_idle_0.png`, for example `preta_idle_0.png`. The boss phase-2 frame is `{key}_phase2_0.png`, which gives the anim `phase2`.
- Packing uses the existing `tools/pack-atlas.js` with one input directory per actor under `assets/sprites/_raw/{enemies|bosses}/{key}/`.
- The boss phase-2 variant is a **post-processed copy** of the base frame: hue shift, ember glow, darken. It is not a separate generation. `SPRITES` picks `phase2` when `boss.phase === 2`.

### D-13a (amends D-13): Provenance additions
- Every generated asset entry adds these fields: `review_status: "provisional"`, `review_note: "provisional — awaiting human art review"`, `seed`, `rejected_seeds[]`, `rejected_count`, `self_review` (a short note from the generating agent), `method: "txt2img"`, and the full prompt/negative.
- A generation sidecar `*.gen.json`, which holds the exact ComfyUI API graph, is committed next to each finished `_raw` frame. It is the reproducibility record.
- Full-resolution generator outputs and rejected attempts go to `assets/sprites/_gen/`, which is git-ignored. They can be reproduced from seed + graph.
- Biome backgrounds (`*-bg.png`) are now covered by `tools/check-provenance.js` in addition to `*-atlas.png`.

### D-14a: Agent self-review, and non-blocking human review
- The generating agent views every result with the Read tool. It checks: correct subject, full body in frame, single character, no text or watermark, no extra limbs or heads, a readable silhouette, and a clean background removal.
- Each character gets **up to 4 retries** with new seeds. The rejected-seed count is recorded.
- All art is marked provisional. The user is away, so **no plan blocks on a human checkpoint**. A contact sheet at `assets/sprites/_review/contact-sheet.png` is produced for a later human pass.

### D-15a: Cultural constraints for enemy/boss art (hard — CLAUDE.md)
- Gods are allies only, never enemies. Enemies are asuras, rakshasas, pretas, nagas (serpent-folk warriors, **not** divine Nagas such as Shesha or Vasuki: no halo, no multi-hooded divine iconography), vetalas, bhutas, daityas, and yatudhanas.
- **Yama** (DATA.BOSSES.yama, Yama Dharmaraja) is a deity. He is depicted as a **dignified, stern judge-deity** and must never look monstrous or demonic. His phase-2 variant is a restrained "divine wrath" aura (cool indigo/gold glow), **not** the red ember/demonic treatment used for asura bosses.
- There is an open design/cultural concern: having Yama as a boss may conflict with "gods are allies only". This is recorded in STATE.md Blockers/Concerns for a design decision, for example reframing the fight as a trial or test rather than enmity. It is out of scope for Phase 2 art.

### D-16a: UI art (ART-05) is code/CSS-drawn, not AI-generated
- UI art uses CSS and inline SVG instead of AI images: ornate gold borders, lotus/mandala corner flourishes as inline SVG data URIs in CSS, boon cards tinted by god color (02-UI-SPEC god identity colors), rarity accents (02-UI-SPEC rarity colors), and Devanagari-accented headings.
- The edit surface is `index.html` `<style>` plus `js/ui.js` card/panel markup. The `assets/sprites/ui/` atlas from D-10 is dropped.
- The in-run HUD is canvas-drawn in `GAME.renderHUD` (js/game.js). That code is outside Phase 2's allowed edit region under the parallel-phase file-ownership rules, so the motif pass on the canvas HUD bars is **deferred**. It is flagged to the orchestrator.

### D-17a: Requirement interpretation
- ART-01 ("at least 4 animation states ... generated via AI tools") is satisfied like this: the AI-generated 4-frame idle atlas, with run/attack/dash done as code-driven procedural states over those frames plus the code-drawn weapon sweep. REQUIREMENTS.md wording may need a follow-up edit by the orchestrator/user. Phase 2 does not edit REQUIREMENTS.md.
- AI-DISCLOSURE.md is corrected to describe the workflow that was actually used: txt2img/img2img with fixed seeds, no ControlNet. It also states that UI art is not AI-generated. This resolves the QA-04 concern in STATE.md.

## File ownership (parallel phases)
Phase 2 may edit:
- `js/sprites.js`
- `js/game.js`, only in the init manifest, `renderBackground`, and `renderEntities` regions (plus new helper methods placed directly after `renderEntities`)
- `assets/**` and `tools/art/**`, plus `tools/check-provenance.js`, which Phase 2 created
- `index.html` `<style>` and the `js/ui.js` card/panel markup
- `test/smoke.js` (append-only)
- Phase-2 `.planning` files

Phase 2 must NOT edit js/entities.js, js/renderer.js, js/data.js, js/rooms.js, or js/meta.js.

## Plan map (supersession)
| Plan | Status |
|------|--------|
| 02-04 | Idle work stands (license gate, reference lock, 4-frame idle atlas). run/attack/dash are **superseded by 02-07** (procedural). |
| 02-05 | **Superseded by 02-08 (bosses) + 02-11 (enemies)** |
| 02-06 | **Superseded by 02-08 (biomes) + 02-09 (UI) + 02-11 (provenance/disclosure finalize)** |
| 02-07 | Procedural animation core + hit flash + spawn/death + boss phase-2 selection + sprite-path readability overlays |
| 02-08 | Art tools (tools/art) + 4 biome backgrounds + 4 bosses (+ phase-2 variants) |
| 02-09 | CSS/SVG Indian-motif UI pass (ART-05) |
| 02-10 | Code-drawn weapon overlay + biome background texture loading/rendering |
| 02-11 | 8 enemy sprites + contact sheet + provenance/disclosure finalize |
