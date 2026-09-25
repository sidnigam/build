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
