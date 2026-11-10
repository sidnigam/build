# Architecture Research

**Domain:** Vanilla JS / HTML5 Canvas 2D action roguelite — surgical rendering upgrade + desktop/Steam packaging
**Researched:** 2026-06-17
**Confidence:** HIGH (codebase inspected directly; external tooling claims verified against official repos and multiple 2025 sources)

## Context From The Existing Codebase

This is not a greenfield design. The repo already has a coherent, single-threaded architecture that the upgrade must respect:

- **`game.js` (705 lines)** owns the loop (`frame → update → render`), a single `ctx = canvas.getContext('2d')`, and a monolithic `render()` that draws everything in z-order by hand.
- **Logical coordinate space:** the game renders into a fixed logical `this.W × this.H` space; CSS scales the canvas (`aspect-ratio: 16/9`) to fit the viewport. Mouse input is already mapped back into logical space (`(e.clientX - r.left) * (this.W / r.width)`). **This is the single most important fact for the upgrade** — world-space draws are already decoupled from screen pixels, so a camera abstraction has a clean seam to slot into.
- **Effects primitives already exist but are inlined:** `this.shake` (screen shake via `ctx.translate`), `this.particles` (array of `{x,y,r,t,max,color}` circles), `this.rings`, `this.bolts`, `this.texts`, `this.orbits`. These are spawned ad-hoc and drawn in `render()`. The upgrade *formalizes* these, it does not invent them.
- **Entities self-draw:** `entity.draw(ctx)` — the player, enemies, and bosses each have a `draw(ctx)` method that issues primitive calls. There are exactly 3 `draw(ctx)` methods. This is the surgical insertion point for sprites.
- **No build step, no deps, no module system** — files are loaded as `<script>` tags in `index.html`. `data.js` is pure data.
- **Hard constraint:** `node test/smoke.js` (headless full-run simulation) must stay green. The smoke test runs game *logic* with no canvas, so **all rendering work must remain isolated from update logic** — never let a sprite/camera/VFX module become required for the simulation to step.

The guiding principle for every recommendation below: **add a thin renderer abstraction layer, keep game logic untouched, and make sprites a drop-in replacement for primitive drawing — never a rewrite.**

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      DESKTOP SHELL (Electron)                      │
│  main process: BrowserWindow, Steamworks.js (achievements/cloud)  │
│         loads ──▶  app:// or http://localhost (game files)        │
├──────────────────────────────────────────────────────────────────┤
│                     RENDER LAYER  (new, additive)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Camera  │  │ SpriteMgr│  │ VFX/Pool │  │ LayerCompositor  │   │
│  │ (offset, │  │ (sheets, │  │ (particle│  │ (bg/world/fx/ui  │   │
│  │ zoom,    │  │ frames,  │  │  pool,   │  │  draw order)     │   │
│  │ shake)   │  │ animate) │  │  shake)  │  │                  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │             │             │                 │             │
│       └─────────────┴──────┬──────┴─────────────────┘             │
│                            ▼                                       │
│              ctx (single Canvas2D context)                        │
├──────────────────────────────────────────────────────────────────┤
│                  GAME LOGIC LAYER  (unchanged)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ game.js  │  │entities  │  │ rooms.js │  │ data.js  │           │
│  │ loop/    │  │ player/  │  │ layouts/ │  │ balance  │           │
│  │ update   │  │ enemies  │  │ spawns   │  │ (pure)   │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
├──────────────────────────────────────────────────────────────────┤
│        PERSISTENCE: localStorage ── (synced via Steam Cloud)      │
└──────────────────────────────────────────────────────────────────┘
```

Data flows **down** for rendering (logic state → render layer → ctx) and **out** for persistence (logic → localStorage → Steam Cloud file mirror). The render layer reads game state; it never mutates it.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Camera** | World→screen transform: offset, zoom, shake. One `apply(ctx)`/`reset(ctx)` pair wrapping all world draws. | A small object holding `x,y,zoom,shakeAmt`; calls `ctx.translate/scale`. Replaces the existing inline `this.shake` translate. |
| **SpriteManager** | Load sprite sheets (one `Image` per sheet), slice frame rects, advance animation timers, `drawSprite(ctx, sheet, frame, x, y, flip)`. | `Image.onload` + frame-rect lookup table from `data.js`; uses `ctx.drawImage(img, sx,sy,sw,sh, dx,dy,dw,dh)`. |
| **Animator** | Per-entity playback state: current clip, frame index, elapsed time, loop/one-shot, on-complete callback (e.g. death → despawn). | Plain `{clip, frame, t}` stored on each entity; ticked in `update`, read in `draw`. |
| **VFX / ParticleSystem** | Pooled emitters for hit sparks, dash trails, astra casts, ambient motes. Owns the object pool. | Pre-allocated array of reusable particle structs + free-list. Replaces the ad-hoc `this.particles.push`. |
| **LayerCompositor** | Enforce draw order: background → floor/world props → entities → projectiles/VFX → HUD → cursor. | Either ordered function calls (simplest) or N offscreen canvases composited per frame (only if blend/perf demands). |
| **AssetLoader** | Preload all sheets/images before gameplay; report progress for a loading screen. | Promise.all over `Image` loads keyed by id; gate `state` transition on completion. |
| **Desktop Shell (Electron main)** | Create window, set fixed/resizable size, load game URL, bridge Steamworks API to renderer. | `electron` + `electron-builder`; `steamworks.js` initialized in main, exposed via IPC/preload. |
| **SteamBridge** | Achievements (15+), cloud save mirror, overlay enablement, app-ID handshake. | `steamworks.js` (`client.achievement.activate`, cloud read/write). |

## Recommended Project Structure

Stay no-build initially (script tags), but introduce a `render/` namespace so the seam is obvious. Bundling can come later for Electron without restructuring.

```
chakravyuha/
├── index.html                # add new <script> tags in dependency order
├── js/
│   ├── data.js               # UNCHANGED — add sprite-sheet frame tables here (data-driven)
│   ├── utils.js              # UNCHANGED
│   ├── entities.js           # MINIMAL edits: draw() delegates to Sprites; add .anim state
│   ├── rooms.js              # UNCHANGED
│   ├── game.js               # EDIT render(): wrap world draws in Camera; call layers
│   ├── ui.js / meta.js / audio.js   # UNCHANGED
│   └── render/               # NEW — the entire upgrade lives here, opt-in
│       ├── assets.js         # AssetLoader: preload sheets, loading screen
│       ├── sprites.js        # SpriteManager + Animator
│       ├── camera.js         # Camera: apply/reset, zoom, shake, smooth follow
│       ├── vfx.js            # ParticleSystem + object pool, screen-shake driver
│       └── layers.js         # (optional) offscreen-canvas compositor
├── assets/
│   └── sprites/              # AI-generated sheets, post-processed to power-of-2 sheets
├── desktop/                  # NEW — Electron shell, isolated from game code
│   ├── main.js               # BrowserWindow + steamworks.js init
│   ├── preload.js            # contextBridge → window.steam API
│   └── steam_appid.txt       # MUST ship inside the .app bundle / next to exe
├── electron-builder.yml      # packaging config (win + mac targets)
├── package.json              # npm scripts: start, build:win, build:mac
└── .github/workflows/
    └── release.yml           # tag → build binaries (matrix: windows + macos)
```

### Structure Rationale

- **`render/` as a quarantined namespace:** every new system is additive and optional. The smoke test never loads `render/`, so logic stays headless-testable. If a render module throws, game logic is unaffected.
- **`data.js` holds frame tables:** the project is already "balance is data-driven." Sprite-sheet definitions (sheet id, frame size, clip ranges per animation) belong there too — artists/tuning change data, not engine code.
- **`desktop/` fully isolated:** the browser build still works (open `index.html`). Electron is a *wrapper*, not a fork. This keeps the free web version alive and de-risks the Steam path.

## Architectural Patterns

### Pattern 1: Sprite as Drop-In for Primitive Draw (the core upgrade)

**What:** Each `entity.draw(ctx)` currently issues `ctx.arc/fillRect`. Replace the *body* of `draw()` with a single `Sprites.draw(ctx, this.sheet, this.anim.frame, this.x, this.y, this.facing)` while keeping the method signature identical. Fall back to the existing primitive if the sheet hasn't loaded.

**When to use:** Always, for the 3 existing `draw(ctx)` methods and any new prop draws. This is *the* answer to "how do we add sprites without breaking everything."

**Trade-offs:** Pro — surgical, reversible, testable per-entity (convert player first, verify, then enemies, then bosses). Con — requires a consistent anchor convention (draw from center vs top-left); pick **center-anchored** to match the existing circle-based positions.

**Example:**
```javascript
// entities.js — before/after inside draw(ctx)
draw(ctx) {
  // NEW: sprite path, with graceful fallback to the old primitive
  if (Sprites.ready(this.sheetId)) {
    Sprites.draw(ctx, this.sheetId, this.anim, this.x, this.y, this.facing < 0);
  } else {
    ctx.fillStyle = this.color;                       // existing primitive
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, U.TAU); ctx.fill();
  }
}
```

### Pattern 2: Camera Wrap Around World Draws

**What:** The existing `render()` already does `ctx.save(); if (shake) ctx.translate(...)`. Generalize that into `Camera.apply(ctx)` (translate to keep target centered, scale by zoom, add shake) and `Camera.reset(ctx)`. Everything between them is world-space; HUD and cursor draw *after* reset (they already do — HUD is drawn before `ctx.restore()` today but should move outside for zoom independence).

**When to use:** Wrap all world draws once. Kill-zoom and screen shake become free (just animate `camera.zoom`/`camera.shakeAmt`).

**Trade-offs:** Pro — one transform, every world draw inherits it; mouse input already maps to logical space so aiming still works at zoom=1; for zoom≠1 you invert the camera transform on the mouse coords (one extra step). Con — must audit that nothing draws in screen-space *inside* the wrap (only HUD/cursor, already separable).

**Example:**
```javascript
// camera.js
const Camera = {
  x:0, y:0, zoom:1, shakeAmt:0,
  apply(ctx, W, H) {
    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.scale(this.zoom, this.zoom);
    if (this.shakeAmt > 0.5) ctx.translate(U.rand(-1,1)*this.shakeAmt, U.rand(-1,1)*this.shakeAmt);
    ctx.translate(-this.x, -this.y);   // follow target (arena-centered today, so x=W/2)
  },
  reset(ctx) { ctx.restore(); }
};
// game.js render(): Camera.apply(ctx,this.W,this.H);  ...world draws...  Camera.reset(ctx);  renderHUD(ctx);
```

### Pattern 3: Object-Pooled Particle System

**What:** Pre-allocate a fixed array of particle structs with an `active` flag and a free index. Emitters grab from the pool and recycle on death instead of `push`/GC churn. Drives hit sparks, dash trails, astra bursts, ambient motes.

**When to use:** For all VFX. A roguelite spawns hundreds of particles per kill flurry; pooling prevents frame hitches from garbage collection during exactly the "juice" moments you want smooth.

**Trade-offs:** Pro — zero allocation in the hot loop, predictable memory, smooth at 60fps. Con — fixed cap (size it generously, e.g. 1000); slightly more code than `array.push`. The existing `this.particles` push-array is a fine *behavioral* reference — keep the look, swap the storage.

**Example:**
```javascript
// vfx.js
const VFX = {
  pool: Array.from({length:1000}, () => ({active:false, x:0,y:0,vx:0,vy:0,t:0,max:0,r:0,color:''})),
  emit(x,y,opts) {
    const p = this.pool.find(q => !q.active); if (!p) return;   // or maintain a free cursor
    Object.assign(p, {active:true, x, y, ...opts});
  },
  update(dt) { for (const p of this.pool) if (p.active) { p.t -= dt; if (p.t<=0) p.active=false; else { p.x+=p.vx*dt; p.y+=p.vy*dt; } } },
  draw(ctx) { for (const p of this.pool) if (p.active) { ctx.globalAlpha = U.clamp(p.t/p.max,0,1); ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,U.TAU); ctx.fill(); } ctx.globalAlpha=1; }
};
```

### Pattern 4: Layered Draw Order (single-context first, offscreen only if needed)

**What:** Render in explicit passes against the *one* existing context: background → floor/mandala/props → entities → projectiles → VFX → (reset camera) → HUD → cursor. The current `render()` already follows this order top-to-bottom; just name the passes.

**When to use:** Always use ordered passes. Only escalate to N offscreen canvases (`createElement('canvas')` per layer, `drawImage` composited) if you need per-layer blend modes (e.g. additive glow for astras) or to cache a static background. Do **not** start with multi-canvas — it is the over-engineered default.

**Trade-offs:** Pro of single-context — simplest, matches today's code, fastest to ship. Offscreen layers add memory + composite cost; justify them with a concrete need (additive blending, static-bg caching), not as a default.

## Data Flow

### Frame Flow (per `requestAnimationFrame`)

```
frame(t)
  └─ update(dt)                    [LOGIC — headless-safe, smoke-test path]
        ├─ entities move/collide
        ├─ entity.anim advance     [tick frame timers — pure number math]
        ├─ VFX.update(dt)          [pool recycle]
        └─ Camera shake/zoom decay
  └─ render()                      [RENDER — never runs in smoke test]
        ├─ Camera.apply(ctx)
        ├─ Layers: bg → world → entities(draw via Sprites) → projectiles → VFX.draw
        ├─ Camera.reset(ctx)
        └─ renderHUD → cursor
```

Critical rule: **animation *timers* advance in `update` (pure math, smoke-safe); pixels are only emitted in `render`.** This keeps the headless simulation green because `update` never touches `ctx` or `Image`.

### Asset Load Flow

```
boot → AssetLoader.preload(sheets) → Promise.all(Image.onload)
     → progress bar (state='loading')
     → all loaded → enable sprite path → state='hub'
     (before load completes: entities fall back to primitive draw — game is still playable)
```

### Persistence / Steam Cloud Flow

```
gameplay → META.save() → localStorage   [UNCHANGED]
                    │
        (desktop)   └─▶ SteamBridge mirrors save blob to Steam Cloud on write,
                        reads it back on boot if newer. localStorage stays the
                        source of truth; Steam Cloud is a sync mirror.
```

## Desktop Packaging Architecture

**Decision: Electron, not Tauri.** Verified across multiple 2025 sources: Electron and NW.js are the *only* desktop frameworks with first-class Steamworks library support; Tauri's WebKit webview is less performant for canvas graphics and forces Rust for non-trivial Steam calls; a 2025 developer report abandoned Tauri for Electron specifically over Steam/Linux dependency pain. Electron's larger footprint is an acceptable trade for a commercial Steam title. (MEDIUM-HIGH confidence — consistent across the JS-game-on-Steam community; matches `PROJECT.md`'s stated Electron/Tauri intent.)

**How Electron loads the game — file:// vs localhost:**
- `file://` is the simplest (`win.loadFile('index.html')`) and works for relative `<script>` and `<img>` paths, which this codebase uses. But `file://` triggers CORS restrictions for some asset-loading patterns (custom protocols, certain fetch/audio cases) and is fragile.
- **Recommended:** register a custom `app://` protocol (or serve from an in-process `http://localhost` static server) and `loadURL` that. This sidesteps `file://` CORS gotchas for images/audio and matches how production Electron games ship. (HIGH confidence — corroborated by Electron issue threads and multiple guides.) Keep dev on `loadFile`/localhost, production on `app://`.

**Process model for Steam:**
- `steamworks.js` is a **native module → it loads in the main process**, not the renderer by default. Expose a minimal `window.steam` API to the game via `preload.js` + `contextBridge` (preferred) rather than disabling `contextIsolation`. Game code calls `window.steam.unlock('ABHIMANYU_FIRST_KILL')`; preload forwards via IPC to main where `client.achievement.activate(...)` runs.
- **`steam_appid.txt` placement is a known crash trap:** electron-builder does not auto-include it. On macOS it must live *inside the bundle* at `YourApp.app/Contents/steam_appid.txt`; on Windows next to the exe. Wire this into `electron-builder.yml` `extraResources`/`extraFiles` or the build will crash on launch. (HIGH confidence — documented in both greenworks and steamworks.js issue trackers.)

## Steamworks Integration Architecture

**Decision: `steamworks.js` (ceifa), not greenworks.** (HIGH confidence — verified against both official repos.)
- **greenworks** (greenheartgames) is maintained best-effort only, NW.js-focused, requires you to compile binaries yourself, ships no TypeScript types, and uses callback style. Its own README and slow issue cadence confirm low maintenance.
- **`steamworks.js`** was created explicitly because greenworks went stale: it is context-aware, Promise/return-flag based, ships prebuilt binaries, and targets Electron + NW.js. API is ergonomic: `init(appId)`, `client.achievement.activate('ID')`, cloud read/write.
- **Watch-item:** some 2025 reports note historical Steam Overlay quirks (Windows-first) with steamworks.js, and a newer zero-compilation alternative **`steamworks-ffi-node`** exists covering overlay/input/cloud cross-platform. Treat steamworks.js as the primary; flag overlay-on-macOS as a phase-level validation task, with steamworks-ffi-node as the fallback if overlay/macOS blocks. (MEDIUM confidence on the overlay caveat — single/few sources.)

**Bridge boundary:**

| Boundary | Communication | Notes |
|----------|---------------|-------|
| game ↔ Steam | `window.steam.*` (preload) → IPC → main `steamworks.js` | Game stays Steam-agnostic; the same game code runs in the browser with a no-op `window.steam` shim. |
| save ↔ Steam Cloud | main mirrors localStorage blob ↔ Steam Remote Storage | localStorage remains source of truth; cloud is sync layer. |
| achievements | `window.steam.unlock(id)` fire-and-forget | Map 15+ achievement IDs in `data.js`; logic calls semantic events, bridge maps to Steam IDs. |

## Build Pipeline Design

```
npm scripts                GitHub Actions (on tag push v*)
───────────                ───────────────────────────────
start    → electron .      matrix: [windows-latest, macos-latest]
build    → electron-builder    each runner:
build:win→  --win              1. npm ci
build:mac→  --mac              2. npm run build:<os>   (electron-builder)
                               3. ensure steam_appid.txt in bundle
                               4. upload artifact (.exe / .dmg/.app)
                               (optional) steamcmd → upload build to Steam depot
```

- electron-builder handles win (`nsis`/portable) + mac (`dmg`) targets from one config. Code signing (mac notarization, win cert) is a later hardening step — ship unsigned internal builds first.
- Steam depot upload via `steamcmd` can be a *manual* step initially; automate in CI only after the binary pipeline is proven. (MEDIUM confidence on CI specifics — patterns from Electron Forge + GitHub Actions guides; exact YAML is project-specific.)

## Suggested Build Order (phase dependency implications)

This ordering minimizes risk and keeps the smoke test green at every step:

1. **Render abstraction seam first (no visual change).** Introduce `render/camera.js` + `render/layers.js`; refactor `game.js render()` to wrap world draws in `Camera.apply/reset` and named passes — *still drawing primitives*. Verifies the seam without art dependency. **Blocks everything downstream.**
2. **AssetLoader + SpriteManager.** Loading screen, sheet loading, `Sprites.draw`. No entities converted yet. **Requires #1's layer pass structure.**
3. **Sprite conversion, one actor at a time.** Player → enemies → bosses, each with primitive fallback (Pattern 1). **Requires #2.** Can proceed per-actor as AI art lands — naturally parallel with art production.
4. **VFX/particle pool + camera juice.** Pooled particles, hit sparks, screen shake (now via Camera), kill-zoom, freeze-frames. **Requires #1 (camera) and is independent of #3** — can run in parallel with sprite conversion.
5. **Electron shell.** Wrap the (browser-working) game; `app://` loading; window/fullscreen/resolution settings. **Independent of #2–#4** — can start early once #1 is stable, since it wraps whatever the browser build is. Gamepad input also slots here.
6. **Steamworks integration.** `steamworks.js` in main, preload bridge, achievements, cloud-save mirror, overlay validation. **Requires #5.** App-ID/`steam_appid.txt` packaging is part of this phase's definition of done.
7. **CI/CD binaries.** electron-builder npm scripts → GitHub Actions matrix → artifacts. **Requires #5/#6** to have a working local build first.

Parallelization summary: **#1 is the gate.** After it, the *rendering track* (#2→#3, with #4 alongside) and the *packaging track* (#5→#6→#7) proceed independently and only reconverge at release.

## Anti-Patterns

### Anti-Pattern 1: Bolting on PixiJS / replacing the renderer wholesale

**What people do:** "Add sprites" → import PixiJS, recreate the scene graph, port every draw into Pixi sprites.
**Why it's wrong:** PixiJS is WebGL-first with its own ticker, scene graph, and coordinate model. Dropping it into a hand-rolled `requestAnimationFrame` + single-`ctx` loop means rebuilding the render layer and reconciling two game loops — exactly the "rewrite" the milestone forbids, and it risks the smoke-test contract. The existing `ctx.drawImage` is fully capable of sprite sheets, animation, and transparency.
**Do this instead:** Native Canvas2D `drawImage` with a thin SpriteManager (Pattern 1). Reserve PixiJS as a *future* option only if profiling shows Canvas2D fill-rate is the bottleneck at the target resolution — not as the opening move.

### Anti-Pattern 2: Multi-canvas layers as the default

**What people do:** Immediately split into 4 stacked `<canvas>` elements (bg/world/fx/ui) "for layering."
**Why it's wrong:** Adds compositing cost and DOM/sync complexity before any need is demonstrated; the current single-context ordered draw already produces correct layering.
**Do this instead:** Ordered passes on one context (Pattern 4). Add offscreen canvases only for a *specific* justified need (additive-blend glow, cached static background).

### Anti-Pattern 3: Letting render modules leak into update/logic

**What people do:** Reference `Sprites`/`Camera`/`ctx` from inside `update()` or entity logic.
**Why it's wrong:** Breaks `node test/smoke.js` (no canvas, no Image) — a hard project constraint — and couples balance to rendering.
**Do this instead:** Advance animation *timers* in `update` as pure numbers; emit pixels only in `render`. The render layer reads state, never required by simulation.

### Anti-Pattern 4: `array.push` particles during juice spikes

**What people do:** Keep `this.particles.push({...})` for the new heavier VFX.
**Why it's wrong:** GC churn during the exact kill-flurry moments you want buttery — causes frame hitches.
**Do this instead:** Object pool with a fixed cap (Pattern 3).

### Anti-Pattern 5: Trusting `file://` and forgetting `steam_appid.txt`

**What people do:** `win.loadFile('index.html')` and assume electron-builder bundles everything.
**Why it's wrong:** `file://` hits CORS edge cases for assets; `steam_appid.txt` is silently omitted from the bundle → launch crash on macOS.
**Do this instead:** `app://` (or localhost) protocol + explicit `extraResources` for `steam_appid.txt` inside the `.app`/next to the exe.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Steamworks (achievements/cloud/overlay) | `steamworks.js` in Electron **main**, exposed via preload `contextBridge` | `steam_appid.txt` must be bundled; overlay-on-macOS is a validation risk; `steamworks-ffi-node` is the fallback lib. |
| Steam depot upload | `steamcmd` (manual first, CI later) | Keep out of the critical path until binaries build reliably. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| game logic ↔ render layer | one-way reads (logic state → renderer) | Renderer never mutates logic; preserves smoke-test isolation. |
| entity.draw ↔ SpriteManager | direct call with primitive fallback | Per-actor conversion; reversible. |
| world draws ↔ Camera | `apply`/`reset` wrap in `render()` | Mouse coords inverse-transformed only when zoom≠1. |
| game ↔ Electron/Steam | `window.steam.*` preload shim (no-op in browser) | Same game code runs in browser and desktop. |

## Sources

- Existing codebase: `js/game.js`, `js/entities.js`, `index.html`, `.planning/PROJECT.md` (direct inspection — HIGH)
- [ceifa/steamworks.js](https://github.com/ceifa/steamworks.js/) — primary Steam lib, main-process/native module, appId/steam_appid.txt init (HIGH)
- [greenheartgames/greenworks](https://github.com/greenheartgames/greenworks) — maintenance status, NW.js focus (HIGH)
- [greenworks issue #183 — steam_appid.txt placement on macOS bundle](https://github.com/greenheartgames/greenworks/issues/183) (HIGH)
- [Phaser: Publishing Web Games on Steam with Electron (2025)](https://phaser.io/news/2025/03/publishing-web-games-on-steam-with-electron) — Electron + electron-builder + GitHub Actions pipeline (MEDIUM)
- [Web Game Dev — Desktop publishing](https://www.webgamedev.com/publishing/desktop) — Electron/NW.js only frameworks with Steam lib support; webview perf (MEDIUM)
- [jslegenddev — The Struggle of Packaging a JS Game for PC](https://jslegenddev.substack.com/p/the-struggle-of-wrapping-a-javascript) — Tauri vs Electron for Steam (MEDIUM)
- [Hacker News — Tauri-for-Steam abandonment report (2025)](https://news.ycombinator.com/item?id=46087456) (LOW/anecdotal)
- [Overaction Game Studio — Publishing a Web Game on Steam with ElectronJS + steamworks.js](https://www.overactiongamestudio.com/tutorials/18-developing-and-publishing-a-web-game-on-steam-with-electronjs-steamworks-js) (MEDIUM)
- [liana.one — Integrate Electron Steam API (steamworks alt to greenworks)](https://liana.one/integrate-electron-steam-api-steamworks) (MEDIUM)
- [trashmoon — Automating Steam releases with Electron Forge + GitHub Actions](https://trashmoon.com/blog/2022/automating-steam-releases-for-html-games-with-electron-forge-and-github-actions/) (MEDIUM)
- [Electron issue #2758 — loading app via http vs file protocol](https://github.com/electron/electron/issues/2758) and [debugandrelease — loading images in Electron](https://www.debugandrelease.com/how-to-load-images-in-electron-applications/) — file:// vs custom protocol CORS (HIGH)
- [steamworks-ffi-node (DEV)](https://dev.to/arty_prof/steamworks-ffi-node-a-steamworks-sdk-library-for-javascript-game-frameworks-15h1) — zero-compilation fallback covering overlay/input/cloud (LOW/MEDIUM)

---
*Architecture research for: vanilla JS/Canvas roguelite rendering upgrade + Electron/Steam packaging*
*Researched: 2026-06-17*
