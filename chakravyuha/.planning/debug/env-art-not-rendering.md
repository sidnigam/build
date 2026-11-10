---
status: resolved
trigger: "Naraka/Patala env kits merged (05.4-02) but real-GPU headless-Chrome run shows OLD legacy diagonal-cracked naraka-bg.png floor + flat maroon placeholder walls instead of new kit art. No console warnings about manifest/atlas/tiles failing."
created: 2026-10-17T15:16:16Z
updated: 2026-10-17T15:55:00Z
---

## Current Focus

hypothesis: CONFIRMED and fixed — see Resolution.
test: n/a — resolved
expecting: n/a
next_action: done

## Symptoms

expected: new kit floor tiles/walls/props visible in Naraka and Patala rooms; legacy bg only when no kit exists (Ranabhoomi/Vaitarani currently)
actual: old legacy diagonal-cracked naraka-bg.png floor with visible tiling seam + flat maroon placeholder walls (procedural fallback kit) shown instead of new kit art, in a real-GPU headless-Chrome run of a Naraka combat room
errors: none - no "ENV: manifest invalid" or "atlas/tiles failed" console warnings
reproduction: tools/browser-check.mjs <outdir> <port> --gpu against a Naraka combat room, served via python3 -m http.server <port> from repo root
started: after 05.4-02 merge (env kits added) - 05.4-04 (runtime renderer, written before kits existed) was verified only against the fallback path

## Eliminated

- hypothesis: manifest field-name mismatch between tools/art/env_build.py output and js/environment.js expectations
  evidence: Read assets/sprites/env/naraka/naraka-env.json in full — schema, tiles{}, frames{}, skins{}, hazards{}, floor{}, walls{}, grade{} all match exactly what environment.js's validateManifest()/layout()/_loadBiome() read. `ENV.validateManifest(realManifest, {strict:true})` already passes in the existing smoke sweep (test/smoke.js "real manifests on disk" section). Not the bug.
  timestamp: 2026-10-17T15:25:00Z

- hypothesis: ensureLoaded()'s 300ms retry-on-race logic (05.4-04 Rule-1 fix) is stuck returning 'loading' forever and never transitions to 'ready'
  evidence: CDP probe showed ENV._biomeStatus.naraka === 'fallback' (a terminal, non-retrying state), not 'loading' — the retry path was never the blocker. The legacy texture (SPRITES.textures['bg:naraka']) was present (fallback kit built successfully using it), so the race-retry branch was not involved at all.
  timestamp: 2026-10-17T15:40:00Z

## Evidence

- timestamp: 2026-10-17T15:30:00Z
  checked: vendor/pixi.min.js spritesheetLoader registration (grep "spritesheet")
  found: "async testParse(r,t){return zt.extname(t.src).toLowerCase()===".json"&&!!r.frames}" — PIXI's Assets spritesheet loader auto-detects ANY *.json asset whose already-parsed data has a truthy top-level `frames` property, purely by extension + presence of the key (never checking the shape of `frames`). Its parse() then unconditionally does `c+(o!=null?o:r.meta.image)` to locate the atlas PNG — i.e. it requires `data.meta.image` whenever no override `imageFilename` is given.
  implication: Chakravyuha's D-11 env manifest schema (assets/sprites/env/{biome}/{biome}-env.json) has a top-level `frames` key by design (role/size/frame-name per D-11), but no `meta` block at all. Loading this manifest via `PIXI.Assets.load()` makes Pixi misidentify it as a spritesheet manifest and crash inside its own parser.

- timestamp: 2026-10-17T15:33:00Z
  checked: live CDP probe (`PIXI.Assets.load('assets/sprites/env/naraka/naraka-env.json')` called directly in a real GPU-headless-Chrome page, before the fix)
  found: 'TypeError: Cannot read properties of undefined (reading \'image\')\n    at Object.parse (vendor/pixi.min.js:20:50424)\n    at ... xa._loadAssetWithRetry ... xa.load ...' — confirms the exact crash predicted from reading the vendor source.
  implication: this crash happens on every `_loadBiome()` call for any biome with a real manifest.

- timestamp: 2026-10-17T15:33:30Z
  checked: js/environment.js `_loadBiome()` line 774 (pre-fix): `try { manifest = await PIXI.Assets.load(...) } catch (e) { manifest = null; }`
  found: the catch block is silent — no console.warn, no logging of any kind — unlike the sibling atlas/tile load try/catch three lines below it, which does `console.warn('ENV: atlas/tiles failed to load for', biomeId, e)`.
  implication: this exactly explains the reported symptom "no console warnings appear" — the crash is real, but is swallowed without a trace, so `manifest` silently becomes `null` and `_loadBiome` falls through to the D-13a three-tier fallback (legacy bg tiled as floor + procedural Graphics walls), which is exactly the old diagonal-cracked bg + maroon walls seen in the GPU screenshot.

- timestamp: 2026-10-17T15:36:00Z
  checked: CDP probe of `ENV._biomeStatus`/`ENV._manifests`/`ENV.stats()` right after entering Naraka (pre-fix) and after jumping to Patala via `ROOMS.enterBiome(1)` (pre-fix)
  found: `{"naraka":"fallback"}`, manifestKeys=["naraka"] (the synthetic fallback manifest, not the real one), stats.items=19. After jumping to Patala: `{"naraka":"fallback","patala":"fallback"}`, stats.items=53 (also fallback-sized). Screenshots (naraka-combat.png, patala-combat.png, read directly) show the old diagonal-cracked legacy bg tile for both biomes — no new flagstone floor, no architectural walls/columns/props, exactly matching the reported symptom.
  implication: confirms the bug affects every biome with a real manifest (not naraka-specific), and that it was never caught by 05.4-04's own env_shots.mjs verification because no real manifests existed on disk yet when that plan was verified (per its SUMMARY: "no env manifests exist yet").

- timestamp: 2026-10-17T15:48:00Z
  checked: post-fix CDP probe (same script, same biomes, after switching `_loadBiome`'s manifest fetch from `PIXI.Assets.load(...)` to `fetch(...).then(r=>r.json())`)
  found: `{"naraka":"ready"}`, atlasKeys=["naraka"], stats.items=61 (vs 19 before), stats.byLayer.entity=20 (props/skins now present). Patala: `{"naraka":"ready","patala":"ready"}`, stats.items=76. Screenshots (read directly) show the new grey axis-aligned flagstone floor, architectural wall faces with columns (orange-glowing in Naraka, teal-carved in Patala), and props (brazier/cauldron silhouettes in Naraka) — matching the EXPECTED behavior exactly. A direct repeat of the raw `PIXI.Assets.load('.../naraka-env.json')` call in the same page still throws the same TypeError (confirms Pixi's own bug/behavior is unchanged — the fix is entirely in how Chakravyuha avoids that code path, not a Pixi patch).
  implication: root cause confirmed and fix verified live in a real-GPU headless Chrome session for both affected biomes.

## Resolution

root_cause: |
  js/environment.js's ENV._loadBiome() fetched the per-biome D-11 environment manifest
  (assets/sprites/env/{biome}/{biome}-env.json) via `PIXI.Assets.load(...)`. Real PIXI (vendor/pixi.min.js)
  registers a spritesheetLoader whose auto-detection (`testParse`) matches ANY *.json asset whose
  already-parsed data has a truthy top-level `frames` key, regardless of shape — it does not check for
  `meta.image` before deciding to treat the file as a spritesheet. Chakravyuha's own D-11 manifest schema
  independently uses a top-level `frames` key (by design, see js/environment.js validateManifest), but has
  no `meta` block. So every real manifest produced by tools/art/env_build.py collides with Pixi's
  spritesheet heuristic: PIXI.Assets.load() hands the parsed manifest to spritesheetLoader.parse(), which
  unconditionally reads `data.meta.image` to locate the atlas PNG and throws
  "TypeError: Cannot read properties of undefined (reading 'image')" since `meta` is undefined.
  `_loadBiome`'s own `try { manifest = await PIXI.Assets.load(...) } catch (e) { manifest = null; }` swallowed
  that crash with no logging (unlike the atlas/tile load three lines below, which does console.warn), so the
  function silently fell through to the D-13a three-tier fallback (legacy bg tiled as floor + procedural
  Graphics walls) for every biome that actually has real shipped art — exactly the symptom reported (old
  cracked bg + maroon placeholder walls, zero console warnings). This was never caught by 05.4-04's own
  verification because no real env manifests existed on disk at the time that plan was built/verified.
fix: |
  js/environment.js `_loadBiome()`: fetch the per-biome manifest JSON via plain `fetch(url).then(r=>r.json())`
  instead of `PIXI.Assets.load(url)`. The manifest is pure data (never an image/texture PIXI needs to
  cache/track), so routing it through Pixi's asset pipeline was never necessary and is exactly what
  triggered the spritesheet-detection collision. The atlas (`manifest.atlas`, a real spritesheet JSON with
  a proper `meta.image`) and tile PNGs still correctly go through `PIXI.Assets.load()` — unchanged, no
  collision there. 404s (biomes with no manifest yet, e.g. Ranabhoomi/Vaitarani) still silently fall through
  to the existing fallback kit, same as before — `res.ok` is checked before parsing. No manifest schema
  change, no env_build.py change required.
verification: |
  1. node test/smoke.js — ALL SMOKE TESTS PASSED (including the new regression assertion below); confirmed
     the new assertion FAILS when js/environment.js's fix is reverted (git stash) and PASSES with it applied
     — proves the test is load-bearing, not a false positive.
  2. node tools/check-provenance.js — "provenance ok (27 atlases/backgrounds/portraits)" (unchanged).
  3. Live real-GPU headless-Chrome CDP probe (ad-hoc script, not committed — scratchpad only) against a
     Naraka combat room and a Patala combat room (via ROOMS.enterBiome(1)): ENV._biomeStatus flips from
     {naraka:'fallback'} / {naraka:'fallback',patala:'fallback'} (pre-fix) to {naraka:'ready'} /
     {naraka:'ready',patala:'ready'} (post-fix); ENV.stats().items roughly triples (19→61 naraka,
     53→76 patala) as the real architecture/prop/column items replace the flat fallback kit.
  4. Screenshots read directly (naraka-combat.png, patala-combat.png) confirm visually: pre-fix shows the
     old diagonal-cracked legacy floor tile with no walls/columns/props in view; post-fix shows the new
     grey axis-aligned flagstone floor, architectural wall faces with columns (orange-glowing braziers in
     Naraka; teal carved serpent-coil column + wall art in Patala), and props. No console warnings in either
     case other than an unrelated favicon.ico 404.
files_changed:
  - chakravyuha/js/environment.js
  - chakravyuha/test/smoke.js
