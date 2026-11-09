# tools/art — Chakravyuha AI art pipeline

Local ComfyUI + SDXL 1.0 base txt2img pipeline for biome backgrounds, boss key poses,
and enemy key poses. Follows `.planning/phases/02-asset-pipeline-sprite-system/02-CONTEXT-AMENDMENT.md`
(D-07a / D-08a / D-09a / D-13a / D-14a / D-15a): one illustrated key pose per character,
animated procedurally in code (see `js/sprites.js`, plan 02-07).

All Python scripts run with `~/ComfyUI/venv/bin/python` (has rembg + PIL + numpy).
ComfyUI must be running at `http://127.0.0.1:8188` (check with `curl -s http://127.0.0.1:8188/system_stats`).
If it's down: `cd ~/ComfyUI && nohup venv/bin/python main.py > /tmp/comfyui.log 2>&1 &` then poll `/system_stats`.

## Pipeline order

For each subject key in `tools/art/prompts.json` → `subjects`:

1. **Generate** — one txt2img image from the locked style + subject prompt:
   ```
   ~/ComfyUI/venv/bin/python tools/art/gen_subject.py <key> --attempt 0
   ```
   Writes `assets/sprites/_gen/{biomes|bosses|enemies}/<key>/<key>_s<seed>.png` + a `.gen.json` sidecar
   with the exact ComfyUI API graph + params (the reproducibility record).
   SDXL 1024x1024 takes roughly 1.5–4 min on an M1 Pro 16GB. If a Bash call (10-min max) times
   out, the script prints `PROMPT_ID=<id>` to stderr; resume with:
   ```
   ~/ComfyUI/venv/bin/python tools/art/gen_subject.py <key> --attempt N --wait-only <id>
   ```

2. **Self-review** (see checklist below) — read the raw PNG (and the silhouette once finished)
   with the Read tool. Reject and retry with `--attempt N+1` (new seed = base_seed + N) up to
   `prompts.json.max_retries` (4 retries = 5 attempts total). Log every rejected seed + a one-line
   reason. If all 5 attempts fail, keep the least-bad attempt and prefix `self_review` with `FLAGGED:`.

3. **Finish**:
   - Sprites (bosses/enemies):
     ```
     ~/ComfyUI/venv/bin/python tools/art/finish_sprite.py --in <raw.png> \
         --out assets/sprites/_raw/<bosses|enemies>/<key>/<key>_idle_0.png \
         --size 128|256 [--mirror] [--silhouette <sil.png>]
     ```
     rembg (u2net) background removal → alpha despeckle (drop small alpha islands) → trim to
     bbox → bottom-center fit into size×size with a 4px margin, transparent background.
     `--mirror` flips horizontally after trim — use it when the generated pose faces left
     (source art must face RIGHT; `SPRITES.CFG.DEFAULT_FACING = +1`).
   - Biomes:
     ```
     ~/ComfyUI/venv/bin/python tools/art/finish_biome.py --in <raw.png> \
         --out assets/sprites/biomes/<id>-bg.png
     ```
     Cover-scale 1344x768 → 1280x731 (LANCZOS) → center-crop to exactly 1280x720 → RGB PNG.

4. **Phase 2 (bosses only)** — deterministic post-process of the finished idle frame, no
   additional generation:
   ```
   ~/ComfyUI/venv/bin/python tools/art/phase2_variant.py --in <key>_idle_0.png \
       --out <key>_phase2_0.png --mode ember|divine
   ```
   `ember` (asura bosses: tataka, ahiravana, kumbhakarna) — hue shift toward red, darken 15%,
   +15% saturation, ember rim glow behind the sprite.
   `divine` (Yama only, D-15a) — no hue shift, ≤5% darkening, +8% contrast, two-layer cool
   indigo/gold glow behind the sprite ("divine wrath", never demonic).

5. **Pack** into a PixiJS-ready atlas:
   ```
   node tools/pack-atlas.js assets/sprites/_raw/<bosses|enemies>/<key> <key>-atlas assets/sprites/<bosses|enemies>
   ```
   Frames must be named `{key}_{anim}_{n}.png` (e.g. `yama_idle_0.png`, `yama_phase2_0.png`).

6. **Record provenance** (idempotent upsert by filename):
   ```
   ~/ComfyUI/venv/bin/python tools/art/record_provenance.py \
       --filename <key>-atlas.png --path assets/sprites/<bosses|enemies>/<key>-atlas.png \
       --actor <key> --kind boss|enemy|biome --sidecar <gen.json> \
       --rejected-seeds <csv> --post "step|step|step" --self-review "<note>" \
       [--animations '{"idle":1,"phase2":1}'] [--raw assets/sprites/_raw/<kind>/<key>/]
   ```

7. Run `node tools/check-provenance.js` and `node test/smoke.js` — both must be green.

## Directory layout

```
assets/sprites/_gen/<biomes|bosses|enemies>/<key>/     full-res raw generations + rejects (git-ignored)
assets/sprites/_raw/<bosses|enemies>/<key>/            finished frames + .gen.json sidecars (committed)
assets/sprites/_raw/biomes/<id>-bg.gen.json            biome sidecars (committed)
assets/sprites/<bosses|enemies>/<key>-atlas.{png,json} packed atlases (committed)
assets/sprites/biomes/<id>-bg.png                      biome background (committed)
assets/sprites/PROVENANCE.json                         one entry per generated asset
assets/sprites/_review/contact-sheet.png               human review contact sheet (plan 02-11)
```

## Self-review checklist (D-14a)

- (a) correct subject
- (b) whole subject in frame, not cropped
- (c) exactly one character (biomes: zero characters)
- (d) no text, letters, watermark or signature
- (e) no extra limbs or heads beyond intent
- (f) silhouette readable as a black shape (sprites — check the `--silhouette` output)
- (g) clean background removal with no halo (sprites)
- (h) cultural guard respected (see below)
- (i) biomes: reads as ground seen from above, even detail, no strong focal point or horizon
- (j) env art (Phase 05.4, D-09a): ground-plane asset (floor/water/decal/hazard-skin): no
  face/idol/yantra/sacred symbol; vertical asset (column/gate/wall/prop): no deity figure

## God portraits (Phase 05.5)

The 6 boon gods (Hanuman, Agni, Indra, Vayu, Krishna, Durga) get one illustrated half-body
bust portrait each, via the same ComfyUI/SDXL pipeline extended with a `god` subject kind
(`.planning/phases/05.5-god-portraits-and-boon-dialogue/05.5-CONTEXT.md`, D-01 to D-11).

Pipeline order per god:

1. **Generate** — `~/ComfyUI/venv/bin/python tools/art/gen_subject.py <god_id> --attempt N`.
   `gen_subject.py` branches on `kind == "god"` (not on the key name) and builds
   `god_style_positive/negative` + `god_negative_extra` + the per-subject `negative_extra`.
   It never appends `enemy_negative_extra` for gods — that guard bans multiple arms, crowns
   and deity markers, which would break Durga's eight arms and Hanuman's crown.
   Generation size is `god_size` (896x1152, an SDXL-native ~1MP bucket).
   Before queueing, it polls `/queue` and waits (up to `--busy-wait`, default 600s) if
   another job is running — **never run concurrently with Phase 05.4** (environment art);
   the orchestrator serializes the two.
2. **Self-review** — Read the raw PNG with the Read tool against the full 05.5-CONTEXT
   Iconography Bible checklist: H1-H7 (correct deity, benevolent expression, no
   sexualization, no horror, no conflated deity iconography, no text/watermark/swastika,
   one primary figure) plus the per-god H-god row, plus S1-S5 (bust composition, hands,
   clean cutout, house style, 64px readability). Up to `max_retries_god` retries (7 attempts
   total, `base_seed + 0..6`). **A hard (H) check failure is never shipped, at any retry
   count.** If a repeated failure pattern emerges, rewrite the subject's prompt toward a
   positive anchor phrase rather than piling on more negatives (02-11 lesson).
3. **Finish** — `~/ComfyUI/venv/bin/python tools/art/finish_portrait.py --in <raw> \
   --out assets/sprites/gods/<id>-portrait.png --subject <id> \
   --silhouette assets/sprites/_gen/gods/<id>/<id>_sil.png [--mirror]`.
   rembg u2net cutout -> alpha clean -> despeckle (2% min, keeps thin elements like Vayu's
   scarves and Agni's flame-crown) -> crop to bbox -> fit into 600x768 (12px top margin,
   bottom-aligned, crop allowed) -> bottom 12% alpha feather (so the bust fades into the
   in-game panel; there is deliberately no generated halo disc — the divine aura is
   CSS-drawn in-game) -> optional silhouette.
   **Never pass `--mirror` for krishna or durga** — the tool itself refuses this (exit 2)
   because flute/abhaya-mudra handedness is iconographic. Regenerate a right-facing attempt
   instead. Re-read the finished PNG and silhouette afterward: confirm the cutout did not
   remove a required attribute (Krishna's flute/feather, Durga's lion/arm count, Hanuman's
   gada/tail) — if it did, treat the attempt as a failed H1.
4. **Record provenance**:
   ```
   ~/ComfyUI/venv/bin/python tools/art/record_provenance.py --filename <id>-portrait.png \
       --path assets/sprites/gods/<id>-portrait.png --actor <id> --kind god \
       --sidecar assets/sprites/_raw/gods/<id>/<id>-portrait.gen.json \
       --rejected-seeds <csv> --post "step|step|step" --self-review "<note>" \
       --iconography "<attributes verified present>" --raw assets/sprites/_raw/gods/<id>/
   ```
   `--kind god` entries additionally get `cultural_review: "pending — human cultural
   reviewer (QA-03)"` and `iconography_notes` (from `--iconography`).
5. **Review sheet** — once all 6 gods are resolved (shipped or not), run
   `~/ComfyUI/venv/bin/python tools/art/gods_sheet.py --out assets/sprites/_review/gods-contact-sheet.png`.
   This upserts the top-level `review_sheet_gods` key into `PROVENANCE.json`. It does not
   touch `contact_sheet.py` or `contact-sheet.png`.
6. Run `node tools/check-provenance.js` (now matches `*-portrait.png` and completeness-checks
   `kind: "god"`) and `node test/smoke.js` — both must stay green.

**Checkpoint as config.** `prompts.json` has top-level `checkpoint` (filename) and
`checkpoint_label` (provenance label, including the license). `gen_subject.py` passes it to
`build_txt2img_graph(ckpt=...)` and records `params.checkpoint` / `params.checkpoint_label`
in the sidecar; `record_provenance.py` prefers the sidecar's `checkpoint_label`, falling
back to its own constant for older sidecars. Swapping checkpoints is therefore a
`prompts.json` edit only — no code change — as long as the new checkpoint's license is
recorded in `checkpoint_label`.

**Never run this pipeline concurrently with Phase 05.4's environment-art generation.**
ComfyUI is single-tenant; `gen_subject.py`'s busy-wait guard reduces but does not replace
the orchestrator serializing the two phases' art executors.

### God portraits — FLUX.1-schnell retry (05.5-04)

SDXL 1.0 base (05.5-01, 42 attempts) and DreamShaper XL (05.4-01 A/B) both shipped 0/6 god
portraits — statue/idol renders, halos, wrong arm counts, and held props destroyed by the
rembg cutout. 05.5-04 retries on **FLUX.1-schnell** (Apache-2.0), a GGUF Q4_K_S quant run
locally via the `ComfyUI-GGUF` custom node (city96, pinned to commit
`6ea2651e7df66d7585f6ffee804b20e92fb38b8a`), with natural-language positive-only prompts (no
negative — cfg 1.0), a medium-grey backdrop, and props pressed against the body.

- **The `god_checkpoint` switch.** `prompts.json` top-level `god_checkpoint:
  "flux1_schnell_q4ks"` selects the `checkpoints.flux1_schnell_q4ks` catalog profile
  (`graph: "flux_gguf"`) for every god subject; a per-subject `checkpoint_profile` can
  override it, and `--ckpt-profile sdxl_base` forces the legacy SDXL path for an A/B.
  `gen_subject.py`'s `resolve_profile()`/`seed_for()` implement the shared precedence
  (`--ckpt-profile` > `env_checkpoint` (env keys) > `entry.checkpoint_profile` or
  `god_checkpoint` (god keys) > legacy). `build_prompt()` routes to the Flux positive-only
  template (`flux_subject` + `god_style_positive_flux`, `neg=""`) only when the resolved
  profile's `graph == "flux_gguf"` — every legacy SDXL subject's `--dry-run` output stays
  byte-identical.
- **Flux prompt rules**: positive phrasing only (schnell has no negative prompt — cfg 1.0,
  `ConditioningZeroOut` only satisfies the KSampler signature), the **subject goes first** in
  the assembled prompt (CLIP-L only sees ~77 tokens; T5 sees ~256), and the total stays at or
  under **~180 words**. `gen_subject.py <god> --dry-run` prints `graph=flux_gguf seed=...
  negative='' words=N` and `LINT:` warnings for a negation (`\bno\b|\bnot\b|without|never`) or
  an over-180-word prompt (`lint_prompt()`).
- **`--flux-smoke`**: generates the fixed neutral chariot-wheel prompt at seed `71599` (no
  `key` argument needed) to `assets/sprites/_gen/gods/_smoke/smoke_s71599.png` + sidecar,
  with a 1800s default timeout for the first model load. Gate-held for Task 4 (GPU-gated) —
  do not run before the ComfyUI restart.
- **`--validate`**: builds the resolved Flux graph and checks it against the live
  `/object_info`. Before a ComfyUI restart, `UnetLoaderGGUF`/`DualCLIPLoaderGGUF` aren't
  loaded yet, so they're statically checked instead (grep `ComfyUI-GGUF/nodes.py` for the
  class + `unet_name`/`clip_name1`/`clip_name2`/`type` input keys, and the `type` value
  against the core `DualCLIPLoader` combo list) and reported as `VALIDATE SKIP ... --
  static check OK` rather than an error.
- **The matte decision and flags** (`finish_portrait.py`, D-31). New flags: `--matte
  {u2net,isnet-general-use,birefnet-general}` (default `u2net`; `bria-rmbg` is never offered
  — its license is non-commercial), `--alpha-matting`, `--keyfill --key-de 18
  --key-max-growth 0.15` (a colour-distance key against the sampled backdrop, guarded against
  runaway growth — `keyfill_core()`), `--despeckle-min 0.02`. A 6-config CPU bake-off against
  the 05.5-01 prop-loss raws (`tools/art/prompts.json` → `god_finish`) adopted
  **`matte=birefnet-general`, `keyfill=false`**: birefnet-general alone recovered every lost
  prop/cropped limb with no new artifacts, while `u2net+keyfill` tripped the growth guard on
  every real image (SDXL's "flat grey" backdrop isn't flat enough for a naive colour key) and
  `birefnet+keyfill` added a minor new artifact over plain birefnet. The CLI prints
  `matte=... keyfill_added=...% skipped=...` for Task 4 to record into provenance
  `post_processing`. `--self-test` exercises `keyfill_core`/`despeckle` against synthetic
  images only (no rembg) — default CLI behaviour (`u2net`, no keyfill, despeckle 0.02) is
  unchanged.
- **`god_panel_shots.mjs`** (new; follows the `env_shots.mjs`/`browser-check.mjs` CDP
  pattern): `node tools/art/god_panel_shots.mjs OUT_DIR --gods hanuman,agni,... [--expect
  portrait|fallback]`. Uses its own ports — http **8095**, CDP **9335** — so it never
  collides with 05.4's `env_shots.mjs` (8091/9333). Starts its own `python3 -m http.server
  8095` if nothing already answers there, drives `GAME.startRun()` +
  `UI.preloadGodPortraits()`, then per god: `UI.offerBoon(id)` → wait 2.5s →
  `UI.skipGodDialogue()` → wait 300ms → screenshot `<out>/<id>-panel.png`, recording
  `hasPortrait` (`#boonpick.has-portrait`) and any page exceptions to `<out>/report.json`.
  `--expect portrait|fallback` sets the exit code (1 on any mismatch or exception). Kills
  Chrome and the server on exit.
- **The GPU gate (D-33)**: Tasks 1-3 (downloads, node install, licenses, graph/prompt
  tooling, the CPU matte bake-off, the fallback-path panel check) need no GPU and never touch
  ComfyUI's queue. Only Task 4 — the ComfyUI **restart** (to load `ComfyUI-GGUF`) and all
  generation — waits for the orchestrator's explicit "GPU gate open", with `/queue` idle on
  two polls 60s apart and no other `gen_subject.py`/`gen_batch.py` process running.
- **Task 4 result: 6/6 shipped.** After the gate opened, `--flux-smoke` passed on the first
  try (seed 71599, 247.5s, `ram_free` 7.0GB before → 1.2GB mid-sample → 6.8GB after — no
  `--lowvram` fallback needed). Per-god generation ran 250–770s/image (896x1152, 4 steps) on
  the M1 Pro 16GB, noticeably slower under concurrent CPU memory pressure from an unrelated
  parallel atlas-rebuild job (down to ~130MB unused RAM at points; the batch script's default
  900s wait timeout was exceeded twice under that pressure — both recovered cleanly with
  `gen_subject.py <god> --attempt N --wait-only <prompt_id>`, since the ComfyUI job itself had
  already finished, only the script's poll had given up). Agni and Krishna shipped on attempt
  0; Hanuman, Indra and Vayu shipped on attempt 1 after a round-0 rejection each (Hanuman:
  full-body framing from an early `dhoti` mention pulling the composition past the waist;
  Indra: the Vajra read as an upright trident/trishula — fixed by holding it horizontally
  with mirrored prongs; Vayu: an anachronistic wristwatch — fixed by moving the jewellery
  description to an upper-arm band with explicitly bare wrists). Durga shipped on attempt 2
  after two rejections (round 0: full-body framing + only 6/8 arms; round 1: composition and
  arm count fixed, but "tall golden crown" generated a halo-like radiant arch — fixed by
  describing a slender tiara with nothing but her own hair behind her head).

## Environment art (Phase 05.4)

Each of the 4 combat biomes gets a Hades-style layered arena (floor tiles, an architectural
border, epic-inspired props, obstacle/hazard skins, cheap lighting) via the same ComfyUI/
SDXL pipeline extended with env generation kinds
(`.planning/phases/05.4-epic-inspired-environment-art-upgrade/05.4-CONTEXT.md`, D-01 to D-16).

**Checkpoint as a catalog.** `prompts.json` has a `checkpoints` catalog (`sdxl_base`,
`dreamshaper_xl_alpha2`, each with file/label/sampler/scheduler/steps/cfg/license) and a top-
level `env_checkpoint` selecting the active profile for env subjects only — the legacy
`checkpoint`/`checkpoint_label` keys (character/biome generation) are untouched. Swapping the
env checkpoint is a `prompts.json` edit, no code change.

Per-biome workflow:

1. **Write subjects** — add entries under `prompts.json env_subjects.{biome}` (template,
   subject, palette, base_seed, role, ground_safe, plus optional negative_extra/size/crop/
   worldH/zones/light/low/hazard/skinFor). Env keys are addressed as `{biome}:{key}`
   (e.g. `naraka:brazier`) everywhere below.
2. **Generate in the background**:
   ```
   ~/ComfyUI/venv/bin/python tools/art/gen_batch.py --next-pending naraka \
       --log assets/sprites/_gen/gen_batch.log &
   ```
   launched with Bash `run_in_background`; poll the log for `OK/SKIP/FAIL` lines and the
   final `BATCH DONE n_ok n_fail`. `gen_batch.py KEY[,KEY...] --attempt N` drives specific
   keys/attempts directly (used for the ENV-01 A/B). Before every queue it waits for
   ComfyUI's `/queue` to be idle (D-14 serialization with 05.5).
3. **Self-review (raw pass)** — one `review_grid.py` grid per batch instead of N individual
   Reads:
   ```
   ~/ComfyUI/venv/bin/python tools/art/review_grid.py --out /tmp/review.png --cell 256 \
       assets/sprites/_gen/env/naraka/brazier/brazier_s61000.png=s61000 ...
   ```
   Read the grid once against the D-09a cultural checklist item (j) below plus the D-14a
   checklist. Record `accepted_attempt` / `rejected: {seed: reason}` / `self_review` /
   `cultural_check` (and `crop` for wallface subjects) directly on the subject in
   `prompts.json`.
4. **Check readiness**: `~/ComfyUI/venv/bin/python tools/art/env_build.py naraka --check`
   lists every subject's accepted state, attempts present on disk, and missing review fields
   — builds nothing.
5. **Build**: `~/ComfyUI/venv/bin/python tools/art/env_build.py naraka`. For every accepted
   subject: finishes it by role via `finish_env.py` (tile/strip/prop/decal — seamless tiling,
   deterministic HSV grading per `env_grade`, rembg cutout for props/columns/gates, ΔE alpha
   key for decals), packs `assets/sprites/_raw/env/naraka/frames` into `naraka-env-atlas` via
   `tools/pack-atlas.js`, writes/merges `assets/sprites/env/naraka/naraka-env.json` (tuning-
   preserving — re-runs keep existing `worldH`/`floor.tileScale`/`grade.*` etc. and only
   refresh structural fields: path/frame/size/role/ground_safe), and upserts PROVENANCE.json
   (`env-tile` per tile, `env-prop` per frame, `env-atlas` with `components` = the atlas
   JSON's frame names).
6. **Self-review (finished pass)** — another `review_grid.py` pass: `--repeat 2x2` for floor
   tiles/wallcaps (seam check), `--repeat 3x1` for wallface strips, `--bg checker` for cutout
   props/decals (confirms clean alpha, no halo).
7. Run `node tools/check-provenance.js` and `node test/smoke.js` — both must stay green.

**Manifest schema** (one per biome, `assets/sprites/env/{biome}/{biome}-env.json`, read by
`js/environment.js`): see CONTEXT D-11 for the authoritative schema and field meanings
(tiles/frames/floor/walls/skins/hazards/lights/grade blocks; `@`-prefixed tokens are
procedural/tile skins, not atlas frames). `ENV.validateManifest(m, {strict})` enforces role/
size/frame presence, the ground_safe gate, and skin-reference resolution.

**Self-test**: `~/ComfyUI/venv/bin/python tools/art/finish_env.py --self-test` exercises
`make_seamless`, tile stats + deterministic grading, prop-mode cutout trimming, decal-mode
alpha estimation, and manifest tuning-preserving merge against synthetic images — no ComfyUI
or real generations required.

**Never run env generation concurrently with Phase 05.5's god-portrait generation** — see
the queue-idle rule below (D-14). `gen_subject.py`/`gen_batch.py`'s busy-wait guard reduces
but does not replace the orchestrator serializing the two phases' art executors.

## Cultural guards (CLAUDE.md, D-15a — hard constraints)

- Gods are allies only, never enemies. Enemies are asuras, rakshasas, pretas, nagas
  (serpent-folk warriors — **not** divine Nagas such as Shesha or Vasuki: no halo, no
  multi-hooded divine iconography), vetalas, bhutas, daityas, and yatudhanas.
- **Yama** (the sole boss who is a deity) must always read as a **dignified, stern
  judge-deity** — never monstrous or demonic. No fangs, horns, skull motifs, snarl, or
  grotesque features. His phase-2 variant is the restrained "divine wrath" `divine` mode
  (cool indigo/gold glow), never the `ember` mode used for asura bosses.
- No enemy or asura boss may carry divine iconography (halo, multiple heads/hoods as a
  mark of divinity, worship motifs) — `enemy_negative_extra` in prompts.json enforces this
  in the negative prompt for every subject except Yama.

## Re-finishing character atlases (05.6-03)

Rebuilds the 13 character atlases (player + 8 enemies + 4 bosses) at 2x from the
**original** full-resolution SDXL/img2img outputs, with sharpening and a baked outline.
No new generation — every pixel traces back to a ComfyUI output already on disk.

**Do not clear `~/ComfyUI/output`.** The full-resolution sources for every character live
only there (ComfyUI's PNG-embedded `prompt` metadata is the only record of the exact seed +
prompt text used). If `~/ComfyUI/output` has been cleared before this pipeline runs,
`recover_sources.py` will report the actor as unmatched — regenerate it from its recorded
seed (`assets/sprites/PROVENANCE.json`'s `seed`/`prompt` fields, or the player's
`seeds`/`denoise`) via `gen_subject.py`/`comfy_client.py` instead, then re-run
`finish_sprite.py`/`phase2_variant.py` by hand with the same flags `rebuild_atlases.py`
would have used.

1. **Recover sources** (no ComfyUI connection needed — reads PNG metadata only):
   ```
   ~/ComfyUI/venv/bin/python tools/art/recover_sources.py
   ```
   Matches every boss/enemy PROVENANCE entry to a `~/ComfyUI/output/*.png` on
   `(seed, exact prompt text, width, height)`; matches the player's four img2img frames by
   filename prefix + `denoise==0.35` + seed. Copies matches to `assets/sprites/_gen/...`
   (gitignored) and writes `assets/sprites/_gen/recovered.json`. Exits non-zero and lists any
   unmatched actor.

2. **Legacy-reproduction check** (pins source identity + the correct mirror flag before
   anything is overwritten):
   ```
   ~/ComfyUI/venv/bin/python tools/art/rebuild_atlases.py --legacy-check
   ```
   Re-finishes each actor's recovered source at the *old* size with the *old* CLI semantics
   (`--matte u2net`, no `--sharpen`/`--outline`, `margin=4`), diffs both mirror orientations
   against the committed `assets/sprites/_raw/...` frame, and writes
   `assets/sprites/_gen/legacy_check.json`. A mean-abs-RGBA diff under 3.0 (0-255 scale) is
   `ok: true`. The player's historical pipeline predates `despeckle`/`fit_bottom_aligned`, so
   it may read `ok: false` even when visually identical — check it by eye and record it as a
   documented exception rather than blocking on it.

3. **(Optional) matte comparison** — compares `u2net` against `birefnet-general` per actor at
   game scale, so a per-character cutout model can be chosen (the 05.5-04 god-portrait
   bake-off found `birefnet-general` preserves thin held props/limbs far better, with no new
   artifacts):
   ```
   ~/ComfyUI/venv/bin/python tools/art/rebuild_atlases.py --matte-preview [--only a,b]
   ```
   Writes `$SCRATCH/matte-preview/<actor>.png` (u2net left, birefnet-general right). Review
   with the Read tool and set the winning matte per actor in `rebuild_atlases.py`'s
   `MATTE_CHOICE` dict before building.

4. **Build** (writes the new `_raw` frames, repacks every atlas, updates PROVENANCE):
   ```
   ~/ComfyUI/venv/bin/python tools/art/rebuild_atlases.py --build [--only a,b]
   ```
   Backs up the pre-rebuild atlases + `_raw` to `$SCRATCH/old-atlases/` once (never
   overwritten by a later `--build`, so the tuning loop always diffs against the true
   pre-05.6-03 originals). Per actor: `finish_sprite.py` at the new size with
   `--sharpen --outline N` (`ACTOR_TABLE`'s per-actor outline px/color, D-19), the chosen
   mirror flag from `legacy_check.json`; bosses additionally run `phase2_variant.py
   --scale 2` on the outlined idle frame; packs with `tools/pack-atlas.js --padding 8`;
   asserts the atlas JSON's animation keys are unchanged; prints the old-vs-new
   dimensions/KB/GPU-MB memory report; upserts `PROVENANCE.json` (`post_processing`,
   `source_recovered_from`, `repacked_phase`, `repacked_date`, and the player's
   `seeds`/`denoise`) while preserving every other field.

5. **Review**:
   ```
   ~/ComfyUI/venv/bin/python tools/art/scale_preview.py
   ```
   Writes `$SCRATCH/scale-preview/<actor>.png` and `all.png` — old vs new at on-screen size
   (render resolution 1 and 2) over a home-biome floor crop and a mid-grey background, plus a
   4x nearest-neighbour zoom for player/preta/tataka. Review with the Read tool against:
   sharper with no ringing/halos; a thin ~1px painted ink outline (not a sticker border, no
   blobbed thin parts); ghost/glow actors still read ethereal/divine; phase-2 glows unchanged;
   clean silhouette separation from the home floor. Tune `ACTOR_TABLE`'s `outline`/
   `OUTLINE_COLOR_OVERRIDE` and re-run `--build --only <actor>` + this script to iterate
   (at most 3 rounds; flag anything still marginal in the plan's SUMMARY).

6. **Report** (no rebuilding — just the memory numbers):
   ```
   ~/ComfyUI/venv/bin/python tools/art/rebuild_atlases.py --report
   ```

7. Run `node tools/check-provenance.js` and `node test/smoke.js` — both must stay green.

## Phase 05.7-02 additions (cultural / iconography regeneration)

- **Non-god Flux routing.** A boss/enemy entry in `prompts.json` opts in with
  `"checkpoint_profile": "flux1_schnell_q4ks"` + `flux_base_seed` + `flux_subject`; its prompt is
  `flux_subject + boss_style_positive_flux`, negative is empty, size is `boss_size_flux`. Env entries
  route to Flux only with `--ckpt-profile flux1_schnell_q4ks` AND a `flux_subject`
  (`flux_subject + env_style_positive_flux`); every other env key is unchanged.
- **`rebuild_atlases.py --src KEY=PATH [--mirror KEY]`** finishes a freshly generated source for a boss
  (no `recovered.json` / `legacy_check.json` needed). It skips `update_provenance` and prints a
  `POST: a|b|c` line to pass to `record_provenance.py --post`. Set `GSD_SCRATCH` so the `old-atlases`
  backup lands in your own scratch.
- **`finish_env.hole_punch(img, seeds=None, tol=18)`** punches an enclosed flat-coloured region (a gate
  doorway that rembg filled in) to alpha 0. Enable per subject with `"hole_punch": true` (centre seed) or
  `[[x,y],...]` in `env_subjects`; the result is recorded in provenance `finish.hole_punch`.
- **`env_build.py BIOME --preview KEY --raw RAW.png --out OUT.png`** runs only the finish chain and
  writes OUT.png (no manifest/atlas/provenance/_raw writes); prints `{size, hole_punch}`.
- **`env_build.py --only k,k` is safe** for partial rebuilds: `finish_env.merge_manifest` (05.4-03 fix)
  keeps every non-rebuilt tile/frame and all tuning blocks from the existing manifest.
- **`record_provenance.py --superseded JSON`** records the replaced generation; `--iconography` now also
  applies to boss / env-* kinds (sets `cultural_review: pending` + `iconography_notes`).

## 05.7-03 overlay + guided inpaint tools

Gap closure for CULT-03 (Indra's vajra). A plain Flux prompt never produced a classic vajra, so the
portrait is repaired and the vajra is **drawn by code** and composited. Run with
`~/ComfyUI/venv/bin/python`.

### `prop_overlay.py` subcommands

| Subcommand | Purpose |
|------------|---------|
| `grid` | crop + labelled coordinate grid (read exact coordinates) |
| `mask` | union of `--poly` / `--rect`, `--fg-only`, `--dilate`, `--keep-skin` boxes |
| `fill` | `bg` or Telea fill under a mask (alpha preserved) |
| `fgmask` / `handmask` | foreground in a box / skin component (fingers to re-layer) |
| `realpha` | blend a repaired RGB into the original RGBA with the soft mask M and rembg alpha |
| `vajra` | draw a classic double-ended vajra layer; exit 1 if geometry metrics fail |
| `horns` | buffalo-horn finial layer (Yama, plan 05.7-04) |
| `composite` | contact shadow + layer + front-mask restore; `--footprint-out` = every pixel it may change |
| `recolor` | hue-window recolour inside boxes |
| `peaks` | count upward points of a silhouette (trident = 3, blunt finial = 1) |
| `diffcheck` | pixels changed outside the allowed masks (exit 1 if any) |
| `preview` | multi-height side-by-side review sheet |

`--self-test` prints `prop_overlay self-test: 11/11 PASS`.

### Vajra geometry and metrics

Local frame: u along the axis, v perpendicular, all values fractions of the length L, mirrored at u to -u:
central ribbed ball, ring, lotus collar, ring, then a 5-prong cage (central prong plus 2 outer and 2 inner
Bezier prongs per end) that bows outward and closes to a single point. `vajra_metrics` requires
aspect 3.0-5.0, `center_ratio` <= 0.80 (a crossguard or hilt fails), `tip_ratio_l/r` <= 0.60 over the outer 4%
of the length (closed points; an open trident-like fan measures about 1.0), mirror IoU l/r and u/d >= 0.97,
one connected component, widest part at |u| >= 0.25L (a prong cage, not the centre).

### The peaks test

`peaks` takes the topmost foreground y per column, smooths it (window 5) and counts local minima with
prominence >= 8% of the box height. A trident gives 3, a dome-capped finial gives 1.

### Disclosure rule

Code-drawn overlays are not AI art. Record them in PROVENANCE as
`procedural_overlay: {tool, ai_generated: false, recipe, metrics}` plus a `post_processing` line.

### `guided_inpaint.py`

```
guided_inpaint.py --in IMG --mask MASK --prompt TEXT --seed N --denoise D --out OUT.png \
    [--bg "#767676"] [--prefill telea|none] [--grow 6] [--feather 3] [--timeout 900] \
    [--dry-run] [--prefill-only] [--self-test]
```

FLUX.1-schnell masked img2img (LoadImage + LoadImageMask(red) + VAEEncode + SetLatentNoiseMask + KSampler
denoise D). Telea prefill, pad to /16, recomposite strictly inside the soft mask M (grow, Gaussian sigma
feather). The AI part records its seed, denoise, prompt and a `OUT.gen.json` sidecar. `--prefill-only` is the
deterministic cv2 fallback (no ComfyUI). The prompt is LINTed like gen_subject (no negation words, <= 180
words). `--self-test` prints `guided_inpaint self-test: 5/5 PASS`.

Notes: `realpha` deliberately re-blends guided_inpaint's already-blended output with the same soft mask M, so
the generated pixels carry an effective weight of M squared. This is intentional, harmless and seam-free (the
result is still exactly the original wherever M = 0). Do not "fix" it into a hard cut, which would
reintroduce the seam ring.

## Phase 05.7.1 additions (new enemies + mini-bosses, 05.7.1-12)

- **`flux_style` per-subject override.** A Flux boss/enemy entry may name a top-level style clause with
  `"flux_style": "<prompts.json key>"`; its prompt becomes `flux_subject + prompts[flux_style]` instead of
  `flux_subject + boss_style_positive_flux`. Entries without `flux_style` (every legacy subject) are
  unchanged and their `--dry-run` output stays byte-identical.
- **`style_1x5_positive_flux`** is the 05.7.4 art direction (style 1 Hades-like painterly cel-shaded +
  style 5 Indian miniature ornament) on a flat light-grey backdrop. It deliberately avoids
  "border"/"frame" words (style 5 tends to add decorative picture borders).
- **12 subjects** (flux_base_seed in brackets): enemies pishacha (75000), kumbhipaka (75010), nagaguard
  (75020), mayavi (75030), javelineer (75040), bannerman (75050), brahmarakshasa (75060), jalarakshasa
  (75070); mini-bosses subahu (75100), mahiravana (75110), alambusha (75120), maricha (75130). Each also
  carries `base_seed` = `flux_base_seed` (`seed_for` reads `base_seed` eagerly).
- **Positive-only guards.** Each subject ends with a positive anchor ("Exactly two arms, a bare head with
  only the plain grey backdrop directly behind it") instead of "no halo, no crown", so the dry-run LINT
  stays clean; the naga keeps ONE small hood.
- **Atlas rows.** `rebuild_atlases.py ACTOR_TABLE` has `src_only` rows for the 12 (enemies 256 px,
  outline 5; mini-bosses 384 px, outline 4, `ember` phase 2). 384 instead of 512 keeps the projected
  total under `MAX_TOTAL_GPU_MB`. `src_only` rows are built only with `--src KEY=PATH`.
- **3-attempt cap** per subject (attempts 0..2), ONE GPU job at a time. A subject that fails review
  3 times ships `FLAGGED:` if it passes every cultural guard, otherwise `"status": "NOT SHIPPED"` and the
  primitive fallback stays.
- **QA-03 flags** (`"cultural_flag": "QA-03"`): pishacha, brahmarakshasa, jalarakshasa, subahu,
  mahiravana, alambusha, maricha.
