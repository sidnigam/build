---
phase: quick-260924-tka
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - js/sprites.js
  - js/game.js
  - test/smoke.js
  - assets/sprites/player/player-atlas.png
  - assets/sprites/player/player-atlas.json
  - assets/sprites/PROVENANCE.json
  - .planning/STATE.md
autonomous: false
requirements: [RENDER-03, ART-06]

must_haves:
  truths:
    - "When only 'idle' exists in the player atlas, the player sprite stays visible while running, attacking, and dashing (falls back to idle)"
    - "The player sprite's height is a tunable multiple of hitbox radius (about 4 x r), and its feet sit at the bottom of the hitbox circle"
    - "The player sprite flips horizontally toward the aim direction; enemy sprites flip toward the player"
    - "Entity sprites are sorted by y (lower on screen draws in front)"
    - "The HUD does not move with camera shake and draws above entity sprites"
    - "No entity sprites remain after a room change (G.enemies = []) or after going back to the hub"
    - "player-atlas.png/.json exist with an 'idle' animation of 4 frames, and PROVENANCE.json has an entry for it that passes check-provenance"
    - "node test/smoke.js stays green, with new headless assertions for the pure helpers"
  artifacts:
    - path: "js/sprites.js"
      provides: "Pure helpers pickAnim/animForEntity/movedSince/facingSign/spriteLayout, mark-and-sweep, separate HUD bridge"
      contains: "hudBridgeCtx"
    - path: "assets/sprites/player/player-atlas.json"
      provides: "Player atlas with animations.idle (4 frames)"
      contains: "\"animations\""
    - path: "assets/sprites/PROVENANCE.json"
      provides: "Provenance entry for player-atlas.png"
      contains: "player-atlas.png"
  key_links:
    - from: "js/game.js render()"
      to: "SPRITES.hudBridgeCtx"
      via: "renderHUD(SPRITES.hudBridgeCtx) instead of the world bridge ctx"
      pattern: "renderHUD\\(SPRITES\\.hudBridgeCtx"
    - from: "js/game.js render()"
      to: "SPRITES.beginEntities / SPRITES.endEntities"
      via: "sweep runs every frame, including in the hub"
      pattern: "SPRITES\\.endEntities\\(\\)"
    - from: "js/sprites.js drawEntity"
      to: "SPRITES.pickAnim"
      via: "falls back to idle when the requested animation is missing from the atlas"
      pattern: "pickAnim\\("
    - from: "js/game.js init manifest"
      to: "assets/sprites/player/player-atlas.json"
      via: "{ key: 'player', path: 'assets/sprites/player/player-atlas.json' }"
      pattern: "player-atlas\\.json"
---

<objective>
Fix the PixiJS sprite runtime (plans 02-01..02-03). It has never run with a real atlas, and an audit found 7 hidden bugs. Then pack the 4 existing idle frames into the real player atlas so the in-game scale can be checked by eye. Also bring the stale STATE.md up to date.

Purpose: The art direction is being reconsidered (one illustrated pose plus procedural animation, instead of per-pose AI frames). Before deciding, the runtime has to show a real sprite correctly: right size, facing, depth order, no leaked sprites, and a HUD that stays steady.
Output: Hardened js/sprites.js plus game.js render wiring, new smoke assertions, player-atlas.{png,json}, a PROVENANCE entry, and a refreshed STATE.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/HANDOFF.json
@js/sprites.js
@js/game.js
@test/smoke.js
@tools/pack-atlas.js
@tools/check-provenance.js
@assets/sprites/PROVENANCE.json
@assets/sprites/comfyui-workflow.json

<interfaces>
<!-- Facts extracted from the codebase. Do not re-explore. -->

Load order in the smoke sandbox and index.html: utils, renderer, sprites, audio, data, meta, entities, rooms, ui, game.
Smoke sandbox: has `document` and `window`, but NO `navigator`, so SPRITES.init/load return early and bridgeCtx stays null.
GAME.render() returns early when !SPRITES.bridgeCtx, so render code never runs headless.
Smoke helpers: `check(label, cond)` and `vm.runInContext(src, sandbox)`. The existing SPRITES checks are around lines 102-109. Add the new checks right after them.

Entities (js/entities.js):
- Player: `this.r = 13`, `this.aim` (radians), `this.dashT`, `this.swing = {a,t,...}` (t counts down from 0.12). There is NO `type` field and NO vx/vy. Movement is `this.x += dx * speed * dt`.
- Enemy: `this.type = typeId` (preta r11, rakshasa r15, archer r13, naga r14, vetala r13, bhuta r21, daitya r19, yatudhana r14). Knockback is `kx/ky`. There is NO vx/vy.
- Enemy states: idle, wind, lunge, strike, charge.
- Boss: `this.boss` is truthy, and r is tataka 34, ahiravana 30, kumbhakarna 46, yama 36. Boss states: intro, rest, charging, strike, plus pickMove names: chase, radialWind, chargeWind, slamWind, summon, teleport, spiral, noose.
- The states 'approach' and 'retreat' do NOT exist, and 'chase' exists only as a boss move name.

rooms.js enterRoom (~L91): `G.enemies = []` replaces the array without calling removeEntity, which leaks sprites.
ui.js L48: `GAME.state = 'hub'`. In the hub, render() skips renderEntities, which leaks the player sprite.

game.js:
- init() L31: `this.ctx = this.canvas.getContext('2d')`. `GAME.ctx` is not read anywhere else. BUG FOUND DURING PLANNING: a canvas that already has a 2D context cannot give PixiJS a WebGL context. This line must go (see Task 2).
- init() L37: the manifest already contains `{ key: 'player', path: 'assets/sprites/player/player-atlas.json' }`.
- render() L341-358: uses a single bridge ctx for background, entities, effects, and HUD.
- renderEntities() L467-480.

Raw frames: assets/sprites/_raw/player/player_idle_{0..3}.png, 128x128 RGBA.
pack-atlas usage: `node tools/pack-atlas.js <inputDir> <textureName> <outDir>`. It uses allowTrim: true, so Pixi textures carry `trim` (Rectangle in orig space) and `orig` (128x128).
check-provenance: every `*-atlas.png` under assets/sprites needs an entry in `PROVENANCE.json.assets[]` whose `filename` equals the basename.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure, headless-testable sprite helpers and sweep bookkeeping (with smoke assertions)</name>
  <files>js/sprites.js, test/smoke.js</files>
  <behavior>
    - pickAnim(['idle'], 'run') returns 'idle'. pickAnim(['idle','run'], 'run') returns 'run'. pickAnim(['walk'], 'attack') returns 'walk' (first available). pickAnim([], 'idle') returns null.
    - animForEntity(player-like {dashT:0.1}, false) returns 'dash'. {swing:{t:0.05}} returns 'attack'. Moved=true returns 'run'. Otherwise 'idle'.
    - animForEntity(enemy {type:'rakshasa', state:'wind'}, false) returns 'attack', and the same holds for lunge/strike/charge/charging/noose/spiral/summon and any state ending in 'Wind' (radialWind, chargeWind, slamWind). state 'idle' with moved=true returns 'run'. 'intro'/'rest' with moved=false return 'idle'.
    - movedSince(e): the first call stores the position and returns false. If the position then changes by more than MOVE_EPS, it returns true. If the position is unchanged, it returns false.
    - facingSign(0) returns DEFAULT_FACING. facingSign(Math.PI) returns -DEFAULT_FACING. facingSign(Math.PI/2 + 0.01, prev) returns prev (inside the deadzone, it keeps the previous sign).
    - spriteLayout({ r:13, frameH:128 }) gives scale = 13*HEIGHT_PER_R/128, anchorY = FEET_ANCHOR_Y, dy = 13*FEET_OFFSET_R. With trim {y:10,h:100} out of frameH 128: scale = 13*HEIGHT_PER_R/100 and anchorY = (10+100)/128.
    - Sweep: after beginEntities(), register fake entity A via _markSeen(A) but not B (both tracked, each with a fake _pixiSprite {parent:null, destroy(){this.d=true}}). Then endEntities() destroys B's sprite, sets B._pixiSprite = null, removes B from tracking, and leaves A alone. clearEntities() removes everything.
  </behavior>
  <action>
In js/sprites.js (vanilla global, 'use strict', no Pixi references in any of these helpers), add a config block on SPRITES:
`CFG: { HEIGHT_PER_R: 4, BOSS_HEIGHT_PER_R: 4, HEIGHT_PER_R_OVERRIDE: {}, FEET_ANCHOR_Y: 0.9, FEET_OFFSET_R: 1, DEFAULT_FACING: 1, FACING_DEADZONE: 0.08, MOVE_EPS: 0.4 }`.
Comment each one as tunable. Note on DEFAULT_FACING: "+1 = source art faces right/front; set -1 if a sheet faces left".

Add these pure methods:
- `pickAnim(available, requested)`: return requested if present, else 'idle' if present, else available[0], else null. (Audit item 3.)
- `animForEntity(e, moved)`: replaces `_animFor`, which must be deleted. It has no callers outside sprites.js. Treat the entity as the player when `e.spriteKey === 'player' || e.type === undefined`. Player: dashT>0 gives 'dash', swing&&swing.t>0 gives 'attack', moved gives 'run', else 'idle'. Enemy/boss: if the state is in ATTACK_STATES = new Set(['wind','lunge','strike','charge','charging','noose','spiral','summon','slam','cast','sweep']) OR /Wind$/.test(state), return 'attack'. Else if moved, return 'run'. Else return 'idle'. Movement is detected from position change because entities have no vx/vy and 'chase'/'approach'/'retreat' are not real enemy states. (Audit item 7.)
- `movedSince(e)`: compares against `e._sprLastX/_sprLastY`, updates them, and returns true when |dx|+|dy| > CFG.MOVE_EPS. It returns false on the first call, when those fields are undefined.
- `facingSign(angle, prev)`: let c = Math.cos(angle). If |c| < CFG.FACING_DEADZONE and prev is set, return prev. Otherwise return c < 0 ? -CFG.DEFAULT_FACING : CFG.DEFAULT_FACING. (Audit item 5.)
- `spriteLayout({ r, frameH, trimY, trimH, heightPerR })`: hpr = heightPerR || CFG.HEIGHT_PER_R. If trimH is > 0, set contentH = trimH and anchorY = (trimY + trimH) / frameH, so the anchor sits exactly at the bottom of the visible pixels. Otherwise set contentH = frameH and anchorY = CFG.FEET_ANCHOR_Y. Set scale = (r * hpr) / contentH and dy = r * CFG.FEET_OFFSET_R. Return {scale, anchorY, dy}. (Audit item 4.)
- `heightPerRFor(key, e)`: returns CFG.HEIGHT_PER_R_OVERRIDE[key], else (e.boss ? CFG.BOSS_HEIGHT_PER_R : CFG.HEIGHT_PER_R).

Add sweep bookkeeping. It must have no Pixi dependency so smoke can drive it with fake sprites (audit item 2):
- `_frameId: 0` and `_tracked: new Set()`.
- `beginEntities()` increments _frameId.
- `_markSeen(e)`: sets e._sprSeen = this._frameId and adds e to _tracked.
- `endEntities()`: for each e in _tracked where e._sprSeen !== _frameId, call removeEntity(e).
- `clearEntities()`: calls removeEntity on everything tracked.
- Rewrite `removeEntity(e)` so it always calls destroy() on the sprite, even when it has no parent (the current code only destroys when parent exists). Detach it from its parent if it has one, null out _pixiSprite/_pixiAnim/_pixiLayout, and delete e from _tracked. The sprite's `.destroy` must be guarded with typeof check.

In test/smoke.js, add a block `// ---------------- SPRITES pure helpers (quick-260924-tka) ----------------` right after the existing groupFramesByAnimation check. It should contain one `check(...)` per behavior bullet above, using `vm.runInContext` with JSON.stringify where needed. Compute the expected numbers from SPRITES.CFG inside the sandbox so the tests survive later tuning. Follow RED then GREEN: write the checks first, confirm they fail, then implement.
  </action>
  <verify>
    <automated>node test/smoke.js</automated>
  </verify>
  <done>All new helper and sweep checks pass along with all the existing smoke checks. `_animFor` no longer exists. None of the new helpers reference PIXI or window.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the helpers into the Pixi runtime: HUD bridge, fallback, scale/anchor, facing, depth sort, sweep, and the 2D-context conflict</name>
  <files>js/sprites.js, js/game.js</files>
  <action>
js/sprites.js init() (stays inside the existing navigator/document guard and try/catch):
- Set `this.entityContainer.sortableChildren = true` (audit item 6).
- Keep the existing world bridge (bridgeCanvas/Ctx/Texture/Sprite at worldContainer index 0, below entities). Add a second 1280x720 canvas: `hudBridgeCanvas`, `hudBridgeCtx`, `hudBridgeTexture`, `hudBridgeSprite`. Add it to `this.hudContainer`, which sits on app.stage outside worldContainer and so is unaffected by the camera. Declare the new null fields next to the existing bridge fields. (Audit item 1.)
- Add a comment stating the known limitation: renderEffects primitives (projectiles, orbits, rings, damage text) draw on the world bridge and therefore render UNDER Pixi entity sprites. This is accepted for now, and the fx layer moves to Pixi in a later plan.
- clearBridge() clears both ctxs. uploadBridge() calls `.source.update()` on both textures. Null-guard each.

Rewrite drawEntity(e):
1. Look up key/has/entityContainer as today, and the sheet.
2. Compute `moved = this.movedSince(e)` and `want = this.animForEntity(e, moved)`.
3. Compute `animName = this.pickAnim(Object.keys(sheet.animations || {}), want)`. If animName is null, return without touching the existing sprite.
4. If there is no sprite yet or `e._pixiAnim !== animName`: create the new sprite with createAnimatedSprite(key, animName) FIRST. Only if that succeeds, remove and destroy the old sprite and add the new one. If it fails, keep the old sprite. This prevents the invisible-entity bug. Compute and cache `e._pixiLayout = this.spriteLayout({ r: e.r, frameH: tex.orig.height, trimY: tex.trim ? tex.trim.y : 0, trimH: tex.trim ? tex.trim.height : 0, heightPerR: this.heightPerRFor(key, e) })` from the first frame's texture (`spr.textures[0]`). Then call `spr.anchor.set(0.5, layout.anchorY)`.
5. Every frame: set the facing angle. For the player use e.aim. For enemies use `Math.atan2(GAME.player.y - e.y, GAME.player.x - e.x)`, guarded by `typeof GAME !== 'undefined' && GAME.player`. Then `e._sprFacing = this.facingSign(angle, e._sprFacing)`, `spr.scale.set(layout.scale * e._sprFacing, layout.scale)`, `spr.x = e.x`, `spr.y = e.y + layout.dy`, `spr.zIndex = e.y`, and `this._markSeen(e)`.
In createAnimatedSprite, remove `spr.anchor.set(0.5)` (drawEntity now sets the anchor), or leave it, since drawEntity overrides it.

js/game.js:
- init(): DELETE `this.ctx = this.canvas.getContext('2d');` and replace it with `this.ctx = null; // visible canvas is Pixi-owned (WebGL); a prior 2D context would block WebGL`. Reason: getContext('webgl') returns null on a canvas that already has a 2D context, so PixiJS init fails. grep confirms GAME.ctx is not read anywhere. If the smoke documentStub relies on getContext being called, nothing breaks, because removing a call cannot break a stub.
- render(): keep the headless early return. New order: clearBridge, then CAMERA.begin, then renderBackground(ctx), then `SPRITES.beginEntities()`, then if inRun { renderEntities(ctx), renderEffects(ctx) }, then `SPRITES.endEntities()` (this sweeps sprites whose entities were replaced by `G.enemies = []` or were not drawn because we are in the hub), then CAMERA.end, then `this.renderHUD(SPRITES.hudBridgeCtx || ctx)`, then uploadBridge.
- renderEntities(): keep the dead-enemy removeEntity call (it is harmless). Everything else stays the same.
Do NOT modify rooms.js or ui.js. The per-frame sweep covers both leak paths.
  </action>
  <verify>
    <automated>node test/smoke.js && grep -q "hudBridgeCtx" js/sprites.js && grep -q "renderHUD(SPRITES.hudBridgeCtx" js/game.js && grep -q "SPRITES.endEntities()" js/game.js && ! grep -q "getContext('2d')" js/game.js && grep -q "sortableChildren = true" js/sprites.js</automated>
  </verify>
  <done>Smoke is green. The HUD draws onto a canvas-backed sprite inside hudContainer. drawEntity never leaves an entity without a sprite when the atlas has any animation. Sprites are scaled from r, feet-anchored, flipped by facing, and z-sorted by y. Untouched sprites are swept every frame. The game canvas no longer takes a 2D context.</done>
</task>

<task type="auto">
  <name>Task 3: Pack the idle player atlas, record provenance, and refresh STATE.md</name>
  <files>assets/sprites/player/player-atlas.png, assets/sprites/player/player-atlas.json, assets/sprites/PROVENANCE.json, .planning/STATE.md</files>
  <action>
1. Run `node tools/pack-atlas.js assets/sprites/_raw/player player-atlas assets/sprites/player` without --size, since the frames are already 128px. Confirm the output JSON has `animations.idle` with 4 frames in order 0..3, that `meta.image` is `player-atlas.png` (relative, so Pixi Assets resolves it next to the JSON), and that frames carry trim data. If `meta.image` is not the bare relative filename, fix it in the JSON. Confirm game.js init's manifest still requests `{ key: 'player', path: 'assets/sprites/player/player-atlas.json' }`.
2. Append one object to PROVENANCE.json `assets[]`. Do not touch `checkpoint_license`. Use the fields below and match the existing 2-space JSON style:
   `filename: "player-atlas.png"`, `path: "assets/sprites/player/player-atlas.png"`, `actor: "player"`, `animations: { idle: 4 }`, `status: "partial — idle only; run/attack/dash blocked on pose-consistency (see HANDOFF.json)"`, `tool: "ComfyUI (local)"`, `checkpoint: "sd_xl_base_1.0.safetensors (SDXL 1.0 base, CreativeML OpenRAIL++-M)"`, `method: "img2img"`, `init_image: "assets/sprites/reference/_derived/abhimanyu-char-base.png"` (a border-cropped derivative of the locked reference assets/sprites/reference/abhimanyu-reference.png), `denoise: 0.35`, `sampler: "dpmpp_2m"`, `scheduler: "karras"`, `steps: 32`, `cfg: 7.0`, `prompt_source: "assets/sprites/comfyui-workflow.json positive/negative prompt"`, `seeds: "not recorded per-frame"` (only write this if the per-frame seeds really cannot be found in the 6bbe839 commit message or workflow file; check `git show --stat 6bbe839` and the commit body first), `post_processing: ["rembg u2net background removal", "free-tex-packer-core 0.3.8 via tools/pack-atlas.js (trim, 2px padding)"]`, `raw_frames: "assets/sprites/_raw/player/player_idle_{0..3}.png"`, `generated_date: "2026-09-13"`, `packed_date: "2026-09-24"`.
   Then run `node tools/check-provenance.js`, which must print `provenance ok (1 atlases)`.
3. Update .planning/STATE.md. Do NOT touch ROADMAP.md.
   (a) Delete the blocker line "Renderer of record unresolved (PixiJS vs Canvas2D)...", since Phase 2 D-01 resolved it in favor of PixiJS.
   (b) In the frontmatter, set `stopped_at: "02-04 paused at task 2/2 — idle frames only (4/4); run/attack/dash blocked on pose-consistency"`, `last_updated` to the current ISO timestamp, and `status: Paused`.
   (c) Update "Current Position" to Phase 02, Plan 4 of 6, PAUSED at task 2. Add a note that the idle atlas is packed and wired via quick-260924-tka, and that an art-direction pivot is under consideration: a single illustrated pose per actor plus procedural animation (squash/bob/lean/flip), instead of per-pose AI frames.
   (d) Update Session Continuity to the last session 2026-09-24, and set the resume file to .planning/HANDOFF.json.
   (e) Under Blockers/Concerns, add "[Phase 2]: Run/attack/dash frame generation has no working pose-consistency technique (img2img cannot move legs; ControlNet OpenPose attempt drifted outfit) — see HANDOFF.json." Also add "[QA-04]: QA-04 is marked complete but assets/sprites/AI-DISCLOSURE.md covers zero shipped assets and describes a ControlNet reference-sheet workflow (D-07) that was not actually used (idle frames were plain img2img from the locked reference). Revisit the disclosure before the Phase 7 store page."
   (f) Add a Decisions bullet: "[quick-260924-tka]: Sprite runtime hardened — idle fallback, r-based scale with feet anchor, facing flip, y-sort, per-frame mark-and-sweep, HUD on separate un-shaken bridge; game canvas no longer takes a 2D context."
4. Run `node test/smoke.js` again. The provenance check must now pass with 1 atlas.
  </action>
  <verify>
    <automated>node tools/check-provenance.js && node -e "const a=require('./assets/sprites/player/player-atlas.json');if(!a.animations||!a.animations.idle||a.animations.idle.length!==4)process.exit(1);console.log('idle frames',a.animations.idle, 'image', a.meta.image)" && node test/smoke.js && ! grep -q "Renderer of record unresolved" .planning/STATE.md && grep -q "QA-04" .planning/STATE.md</automated>
  </verify>
  <done>The atlas PNG and JSON exist with idle 4 frames. PROVENANCE has a player-atlas.png entry and check-provenance passes. Smoke is green. STATE.md reflects the real paused position, the resolved blocker is gone, and the pose-consistency and QA-04 concerns are recorded. ROADMAP.md is untouched.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: In-game scale and runtime check with the real idle atlas</name>
  <what-built>A hardened Pixi sprite runtime and a packed idle-only player atlas. The player should render as the Abhimanyu sprite at a size based on the hitbox.</what-built>
  <how-to-verify>
    Claude first starts the server in the background: `python3 -m http.server 8080` from the project root (fallback: `npx http-server -p 8080 -c-1`). Then:
    1. Open http://localhost:8080/index.html. Open DevTools and check the Console. There should be no "SPRITES disabled" warning (if there is, Pixi/WebGL init failed). "atlas missing" warnings for enemies/bosses are expected.
    2. Start a run. The player shows as the Abhimanyu sprite (not a circle), about 4x the hitbox radius tall (~52px), with the feet at the bottom of where the hitbox circle would be.
    3. Move the mouse left and right of the player. The sprite flips to face the aim side.
    4. Move with WASD, attack with LMB, dash with Space. The sprite stays visible the whole time (idle fallback) and never blinks out.
    5. Take hits or land finishers to trigger screen shake. The HP bar/HUD stays still while the arena shakes, and the HUD draws over the player sprite when they overlap.
    6. Clear a room and go through a door. There should be no leftover sprites. Die or quit back to the hub: the player sprite must not stay on the hub screen.
    7. Note whether the size looks right. If not, report a new HEIGHT_PER_R / FEET_ANCHOR_Y value (both are in SPRITES.CFG).
  </how-to-verify>
  <action>Start the static server in the background (python3 -m http.server 8080 from project root), then present the steps below to the user and wait.</action>
  <done>User replies "approved" (or supplies a HEIGHT_PER_R / FEET_ANCHOR_Y tuning value, which gets applied to SPRITES.CFG and re-verified).</done>
  <resume-signal>Type "approved", or describe any issues and give the preferred HEIGHT_PER_R value</resume-signal>
</task>

</tasks>

<verification>
- `node test/smoke.js` passes, including the new SPRITES helper checks and the provenance check with 1 atlas.
- `node tools/check-provenance.js` prints `provenance ok (1 atlases)`.
- grep: no `_animFor`, no `getContext('2d')` in game.js, `renderHUD(SPRITES.hudBridgeCtx` present, `SPRITES.endEntities()` present.
- Human checkpoint approved.
</verification>

<success_criteria>
- All 7 audit defects are fixed (HUD layering, sprite leak, partial-atlas invisibility, sizing, facing, depth sort, enemy anim mapping), plus the 2D-context/WebGL conflict found during planning.
- The idle player atlas is packed, loaded by the existing manifest key 'player', and covered by provenance.
- STATE.md reflects reality. ROADMAP.md is untouched.
- The user has seen the sprite in-game and confirmed the scale (or given a tuning value).
</success_criteria>

<output>
After completion, create `.planning/quick/260924-tka-harden-sprite-runtime-and-pack-idle-play/260924-tka-SUMMARY.md`
</output>
