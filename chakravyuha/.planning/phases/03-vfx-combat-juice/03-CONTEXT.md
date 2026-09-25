# Phase 3: VFX + Combat Juice - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning
**Discuss mode:** auto (user delegated all decisions; recommended defaults locked below)

<domain>
## Phase Boundary

Make combat feel good. Ship a pooled particle system, hit sparks, death bursts, dash/astra trails, hitstop (freeze frames), kill-zoom camera punch, screen flash, and biome ambient particles. Ship the screen-shake and screen-flash accessibility toggles in the same phase.

**In scope:** VFX-01 (pooled particles), VFX-02 (shake intensity + opt-out), VFX-03 (hitstop), VFX-04 (screen flash + opt-out), VFX-05 (biome ambient particles). Also: a dev FPS/particle overlay and a headless pool stress test.

**Out of scope:** The full settings menu, volume, fullscreen, and key rebinding (Phase 5). New art assets and sprite work (Phase 2). Boss/boon content changes (Phase 4). `@pixi/particle-emitter`: there is no module system and a hand-rolled pool covers our needs.

</domain>

<decisions>
## Implementation Decisions

### Particle System (VFX-01)
- **D-01:** New `js/vfx.js` defines a `VFX` global in the same vanilla-global style as `CAMERA`/`SPRITES`. There is **no Pixi access at module scope**. The simulation core is pure data and runs headless in `node test/smoke.js`.
- **D-02:** Use a fixed-size object pool: `VFX.CAP = 2048`. It is pre-allocated once at script eval into `VFX.pool` (an array of plain structs) with an `Int32Array` free-list stack. `emit` pops a free index and never allocates. If the pool is full, the emit is **dropped** and `VFX.dropped++` is incremented. There is no array growth, no `push`, and no `filter` in the hot path. `update(dt)` returns dead particles to the free list.
- **D-03:** Particle struct fields: `active, x, y, vx, vy, t, max, r0, r1, color (css string), tint (int), tex (0 dot | 1 spark | 2 ember | 3 mist), add (bool: additive blend), drag, grav, layer (0 under entities | 1 over), ambient (bool), rot`. Color strings are parsed once per distinct string into an int through a small cache (`VFX._tintCache` Map). Only the first sighting of a color allocates.
- **D-04:** Named presets live in `VFX.PRESETS` inside vfx.js (NOT data.js, which Phase 3 must not edit). Presets: `hit` (directional white spark cone, additive), `crit` (gold spark cone plus a larger flash dot), `death` (enemy-color burst plus orange embers), `bossDeath` (large multi-ring burst, ~120 particles), `hurt` (red burst), `dash` (soft teal trail dots, 2 per sim frame), `castGlow` (gold additive glow at the astra spawn point), `astraTrail` (gold embers trailing chakra projectiles and orbit discs), `phase` (white/gold boss phase-change ring). Plus 4 ambient presets (D-16). Call signature: `VFX.emit(name, x, y, angle, color)`. The args are positional so emitting allocates no options object.
- **D-05:** `burst(x, y, color, n, spd, life, r)` in entities.js keeps its exact signature. Its body becomes a thin wrapper: `VFX.burst(x, y, color, n, spd, life, r)`. That emits omnidirectional `dot` particles, which preserves the current look for every existing call site. `GAME.particles` is kept as an always-empty array for compatibility (rooms.js may still reset it). The per-frame `this.particles.filter` in `GAME.update` is removed.
- **D-06:** Rendering. When `SPRITES.fxContainer` exists and `window.PIXI` is present, `VFX` lazily attaches on first `render()`. It generates 4 small textures from 2D canvases (`dot`, `spark`, `ember`, `mist`) using radial gradients and `PIXI.Texture.from(canvas)`. It pre-creates `CAP` `PIXI.Sprite`s (visible=false), in two layer containers that VFX adds at runtime: an "under" container appended to `SPRITES.bgContainer` (below entities) and an "over" container appended to `SPRITES.fxContainer` (above entities). Each frame, `VFX.render()` syncs `visible/position/scale/alpha/tint/rotation/blendMode` for active slots and hides slots that just died. If Pixi is not attached, `VFX.render(ctx)` falls back to drawing arcs into the given 2D ctx (the world bridge), so the old behaviour is preserved. **sprites.js is not edited.** VFX only calls `addChild` on containers SPRITES already exposes.
- **D-07:** Moving particles off the world bridge canvas cuts per-frame bridge rasterization and texture-upload cost. This supports success criterion 5.
- **D-08:** `reducedParticles` setting: every `emit`/`burst` count is multiplied by 0.35 (min 1), and ambient spawn rate is multiplied by 0.25.

### Hitstop (VFX-03)
- **D-09:** Add `GAME.hitstop` (seconds remaining) and `GAME.hitstopCd` (anti-chain grace). `VFX.hitstop(frames)` converts frames to seconds with `frames / 60`. It sets `GAME.hitstop = max(GAME.hitstop, s)`. Hitstop never stacks additively.
- **D-10:** Weights: melee finisher that connects = **3f**; normal enemy kill = **4f**; heavy boss hit (crit, `special`, finisher, or a single hit of 8% or more of boss maxhp) = **6f**; boss phase change = **6f**; boss kill = **10f**; player hurt = **3f**.
- **D-11:** When `GAME.hitstop > 0`, `GAME.update(dt)` decrements it, keeps decaying `GAME.shake`, and **returns before any simulation** (player, enemies, projectiles, particles, runTime). Rendering, audio, UI, and real-time effects (flash fade, camera zoom) keep running because they are ticked from `GAME.frame` and not from `update`. When hitstop ends, `GAME.hitstopCd = 0.06`. While `hitstopCd > 0`, requests under 8 frames are ignored. This guarantees forward progress under kill spam, including the smoke simulator that calls `hitEnemy` every frame. Hitstop is reset to 0 in `startRun()`.
- **D-12:** `SETTINGS.get('hitstop') === false` turns `VFX.hitstop` into a no-op. This is an optional comfort toggle; it is not required by the roadmap.

### Camera: Shake + Kill-Zoom (VFX-02)
- **D-13:** `GAME.shake` remains the single shake source (Phase 1 D-06). `CAMERA.begin()` multiplies it by `SETTINGS.get('screenShake') ? SETTINGS.get('shakeIntensity') : 0`, where `shakeIntensity` is a 0..1 float with default 1. Add `CAMERA.kick(dx, dy)` for directional impulses (player hurt knock, finisher). The kick decays exponentially in `CAMERA.update(dt)` and is also zeroed when shake is disabled.
- **D-14:** Kill-zoom. `CAMERA.punch(wx, wy, amount, dur)` sets a zoom pulse (`zoom = 1 + amount * ease(t)`, quick in and ease-out back to 1) focused on the world point. `CAMERA.begin()` computes `position = focus - focus*zoom + shakeOffset + kickOffset`, so the world scales about the kill point. Zoom is always ≥ 1, so the screen stays covered. Amounts: normal kill 0.03 over 0.18s; boss kill 0.08 over 0.6s. Overlapping punches take the max. Punch and kick are camera motion, so they are **disabled when `screenShake` is off** (reduced-motion reading). `CAMERA.update(dt)` is called from `GAME.frame` with real dt, so it still animates during hitstop. The mouse aim offset during a ≤0.6s zoom pulse is accepted.

### Screen Flash (VFX-04)
- **D-15:** `VFX.flash(color, alpha, dur)`. Player hurt = red `0xff2030`, alpha 0.28, 0.2s. Player death and defiance revive = red/teal, alpha 0.45, 0.35s. Boss phase change = gold-white `0xfff0c0`, alpha 0.4, 0.25s. Boss kill = white, 0.35 alpha, 0.3s. The overlay is a full-screen `PIXI.Graphics` rect added by VFX at runtime to `SPRITES.hudContainer` **at index 0** (beneath the HUD bridge sprite, so HUD text stays readable). Alpha fades linearly in `VFX.tick(dt)`, which is called from `GAME.frame`. `SETTINGS.get('screenFlash') === false` makes `VFX.flash` a no-op. Headless: the flash state is still tracked (`VFX.flashT`) but nothing is drawn.

### Biome Ambient (VFX-05)
- **D-16:** `VFX.AMBIENT` is keyed by `DATA.BIOMES` ids. `naraka`: rising orange/red embers, additive, over layer. `patala`: slow rising teal/green bubbles and motes, under layer. `ranabhoomi`: drifting grey-tan dust/ash with horizontal drift, under layer. `vaitarani`: large, low-alpha, slow blue-grey mist puffs, under layer. `VFX.ambient(biomeId, arena, dt)` is called from `GAME.update` during run states. It uses a spawn accumulator (rate/sec). Ambient particles are capped at **15% of CAP** (`VFX.ambientActive` counter) so combat VFX are never starved. Unknown biome id = no-op.

### Settings / Accessibility
- **D-17:** New `js/settings.js` defines a `SETTINGS` global: `DEFAULTS = { screenShake: true, shakeIntensity: 1, screenFlash: true, hitstop: true, reducedParticles: false }`. API: `get(key)`, `set(key, val)` (validates type against the default, clamps numbers 0..1, persists), `all()` (copy), `reset()`, `load()`. Values persist to localStorage key `'chakravyuha.settings'` as JSON, inside try/catch. Corrupt or missing storage falls back to defaults, and unknown keys are ignored. The global is headless-safe: smoke's in-memory localStorage stub works. It is designed to be extended: Phase 5 adds keys to `DEFAULTS` and builds the full menu.
- **D-18:** Toggle UI uses minimal DOM in the existing `#pause` panel of index.html. It adds an `ACCESSIBILITY` block with 4 checkboxes (Screen shake & camera punch, Screen flash, Hitstop, Reduced particles) and one range input (Shake intensity 0–100). `SETTINGS.bindDom()` in settings.js wires them: it syncs checked/value from SETTINGS and writes on `change`. It self-registers on `DOMContentLoaded` inside settings.js, so neither ui.js nor GAME.init needs editing. In headless smoke `addEventListener` is a no-op, and `bindDom` is also guarded against missing elements.

### Performance (success criterion 5)
- **D-19:** F3 toggles `VFX.debug`, a dev overlay drawn into the HUD bridge ctx. It shows an FPS EMA from real dt, `active/CAP`, `peak`, `dropped`, `ambientActive`, and enemy count. Shift+F3 toggles `VFX.stress`, which fills the pool every frame so worst-case load can be profiled in the browser (for example during a boss phase 2).
- **D-20:** Headless stress assert in smoke: emit far beyond CAP for 600 frames. Assert `pool.length === CAP` throughout, the pool entries are the same object identities before and after, `active <= CAP`, `dropped > 0`, and all particles drain to 0 after their lifetime. There is also a loose timing assert (600 full-pool updates < 3000 ms) that catches pathological regressions without flaking.

### Claude's Discretion
- Exact preset tuning (counts, speeds, lifetimes, colours) within the budgets above.
- Easing curve for the zoom punch; texture sizes for generated particle textures (16–64 px).
- Whether `VFX.render` uses `PIXI.Sprite` in plain Containers (recommended: stable v8 API) or v8 `ParticleContainer`/`Particle`. Use plain Sprites unless profiling shows a need.

</decisions>

<file_ownership>
## File Ownership (parallel phases)

Phase 3 MAY edit: `js/vfx.js` (new), `js/settings.js` (new), `js/renderer.js`, `js/game.js`, `index.html`, and `test/smoke.js`. Some edits are restricted:
- `js/game.js`: update loop, frame, bindInput (F3), startRun/onPlayerDeath juice lines, renderEffects, and the `render()` call list. It must NOT touch renderBackground, renderEntities, or the SPRITES manifest block in init (Phase 2 owns those).
- `js/entities.js`: only the `burst()` body, `hitEnemy`, `killEnemy`, `Player.takeDamage`, the finisher line in `meleeAttack` (passing `{ finisher: isFinisher }` to `hitEnemy`), and the boss phase-2 trigger block. All edits there are small and surgical.
- `index.html`: script tags plus pause-panel toggle markup and minimal CSS.
- `test/smoke.js`: append-only, plus the two new files in the `files` load list.

Phase 3 MUST NOT edit: `js/sprites.js`, `js/data.js`, `js/rooms.js`, `js/meta.js`, `js/ui.js`, or `assets/**`.
</file_ownership>

<canonical_refs>
## Canonical References
- `.planning/ROADMAP.md` §Phase 3: goal and 5 success criteria
- `.planning/REQUIREMENTS.md`: VFX-01..VFX-05
- `.planning/research/ARCHITECTURE.md` Pattern 3 (object-pooled particles), Anti-Pattern 4
- `.planning/research/PITFALLS.md` Pitfall 7 (frame budget, GC stutter, profile at boss phase 2)
- `.planning/phases/01-render-abstraction-seam/01-CONTEXT.md` D-05/D-06/D-10 (CAMERA fields, GAME.shake source, HUD outside camera)
- `.planning/phases/02-asset-pipeline-sprite-system/02-CONTEXT.md` D-03/D-04/D-11 (Pixi containers, HUD container, fallback)
- `js/sprites.js` lines 57–88 (containers: worldContainer{bridgeSprite@0, bgContainer, entityContainer, fxContainer}, hudContainer{hudBridgeSprite})
</canonical_refs>

<deferred>
## Deferred Ideas
- Full settings menu, volume, fullscreen, and rebinding: Phase 5
- Web Worker / OffscreenCanvas particle simulation: only if Steam Deck profiling demands it (Phase 6)
- Moving projectiles, rings, bolts, and damage text off the bridge canvas onto Pixi: a later polish pass (noted in sprites.js KNOWN LIMITATION)
</deferred>
