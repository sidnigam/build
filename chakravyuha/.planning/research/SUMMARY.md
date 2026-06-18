# Project Research Summary

**Project:** Chakravyuha — चक्रव्यूह
**Domain:** Commercial action roguelite (Hades-like) for Steam — vanilla JS/Canvas prototype upgraded to a shippable paid title
**Researched:** 2026-06-17
**Confidence:** MEDIUM-HIGH

## Executive Summary

Chakravyuha is a working vanilla-JS/HTML5-Canvas action roguelite (4 biomes, 4 bosses, 3 weapons, 6 gods, meta-progression, audio, headless smoke test) being upgraded into a commercial Steam release. The research is unusually convergent: this is *not* a greenfield build but a **surgical upgrade of a coherent existing engine**, and the dominant theme across all four research files is "add thin layers, never rewrite." The codebase already renders into a fixed logical coordinate space with a single Canvas2D context and entity `draw(ctx)` methods — which gives clean seams for a camera abstraction, a sprite manager, and a pooled VFX system to slot in without touching game logic. The hard project constraint (`node test/smoke.js` must stay green) forces a discipline that the architecture research embraces: animation *timers* advance in headless-safe `update()`; pixels are only emitted in `render()`.

The recommended approach is a **render-abstraction seam first** (camera + named draw passes, still drawing primitives — no visual change), which unblocks two then-parallel tracks: a *rendering track* (asset loader → sprite manager → per-actor sprite conversion, with the pooled VFX/juice system alongside) and a *packaging track* (Electron shell → Steamworks → CI/CD). Notably, the STACK and ARCHITECTURE researchers **disagree on the renderer**: STACK recommends migrating to PixiJS (WebGL) for sprite/particle throughput at the Hades target density, while ARCHITECTURE argues native Canvas2D `drawImage` + offscreen pre-rendering is sufficient and that bolting on PixiJS is an anti-pattern that risks the smoke-test contract and forces reconciling two game loops. This is the single biggest open decision and should be resolved early by a worst-case-sprite-count benchmark (boss phase 2 + max particles) — defaulting to the lower-risk Canvas2D path unless profiling proves it bottlenecks. For desktop, all sources agree on **Electron + electron-builder + steamworks.js** (Tauri is rejected: no usable Steamworks path, inconsistent WebKit rendering; greenworks is rejected as stale).

The biggest *non-technical* risks dominate the launch. **Cultural reverence is a hard gate**: depicting Hindu deities as enemies/defeated targets triggers organized backlash that can sink an indie launch (SMITE, Atlus precedents) — gods must remain allies/boon-givers only, with a 2-3 reviewer sign-off *before* art is finalized and the store page goes live. **AI-generated art carries three compounding risks**: weak/no IP protection without substantial human editing, Steam rejection on training-data provenance, and frame-to-frame inconsistency ("AI smell") that breaks the stylized-illustration target — all requiring a human-in-the-loop pipeline, provenance logging, and an accurate Steam AI Content Survey. And the **Steam overlay on browser/Chromium engines is a known-broken combo on macOS** with steamworks.js — it must be flagged for phase-level validation, not assumed trivial, with steamworks-ffi-node as a fallback if macOS overlay parity becomes a blocker.

## Key Findings

### Recommended Stack

The wrapper/sprite/gamepad layers sit *on top* of the unchanged vanilla-JS engine. Electron is the consensus desktop wrapper (only the Electron/NW.js family supports the JS Steamworks bindings, and Chromium renders Canvas/WebGL pixel-identically across Win/macOS). The renderer choice is contested (see Gaps). Gamepad input uses the native Web Gamepad API polled in the existing rAF loop with a thin (~150-line) deadzone/rebind layer — no library needed in a single-Chromium target. Cloud saves require migrating persistence from localStorage to a JSON file in `userData`, then pointing Steam Auto-Cloud at it (path-based sync, not the API).

**Core technologies:**
- **Electron 42 + electron-builder 26**: desktop wrapper + Win/macOS packaging, signing, notarization — only viable Steamworks-compatible wrapper with uniform cross-OS rendering.
- **steamworks.js 0.4.0**: achievements/stats/cloud — most-used, maintained, typed; **known macOS overlay gap** (issue #50); ABI/Node-version-locked (pin Electron). Fallback: steamworks-ffi-node if macOS overlay parity is required.
- **Renderer (CONTESTED)**: PixiJS 8 (STACK — WebGL throughput for hundreds of layered sprites) *vs* native Canvas2D `drawImage` + offscreen pre-render (ARCHITECTURE — lower-risk, surgical, smoke-safe). Resolve by benchmark before committing.
- **Web Gamepad API** (native): controller input for the Steam Deck/roguelite audience; Steam Input pre-remaps to the W3C standard layout.
- **GitHub Actions matrix (windows-latest + macos-latest)**: per-OS CI runners — cross-compiling Win from Mac is the classic Electron failure; macOS runner is mandatory for notarization.

**Explicitly rejected:** Tauri (no Steamworks path, inconsistent WebKit rendering), greenworks (stale, hand-compiled binary matrix), Phaser as a framework (forces rewriting working systems), Steam DRM/CEG (optional, counterproductive — ship DRM-free), localStorage as post-wrap save-of-record (Auto-Cloud syncs files, not Chromium's localStorage DB).

### Expected Features

Chakravyuha already has the core loop; the gaps that move the review-score needle are **platform/QA table stakes, game feel, and content depth**. Missing table-stakes items draw explicit negative reviews and fail Steam Deck Verified.

**Must have (table stakes — required to not tank reviews):**
- Full zero-config gamepad support + control rebinding + SteamInput glyphs matching the active device — Deck Verified requirement; the biggest engineering lift (the vanilla codebase has no input-abstraction layer).
- Settings (resolution, fullscreen, vsync, separate volume sliders) + text legible ≥9px @ 1280x800 — baseline + Verified.
- 15+ achievements, Steam Cloud saves (tested cross-machine + restore), non-breaking Steam Overlay, pause + save-and-quit mid-run.
- Screen-shake/flash toggles (mandatory *because* heavy juice is being added) + color-safe design.
- Run-summary/death screen + readable, controller-navigable meta-progression UI.

**Should have (competitive differentiators):**
- Cohesive sprite art with strong silhouettes (the prototype→commercial threshold; AI-consistency is the #1 quality risk).
- Combat juice (hitstop, sparks, shake, camera punch, impact SFX) — highest ROI polish; turns "tech demo" into "feels good."
- 24 boons + 3+ named Duo Boon synergies — the talked-about-builds engine and stated Core Value.
- Multi-phase telegraphed bosses; room/layout/hazard variety per biome; Indian-mythology narrative framing (genre-novel positioning).

**Defer (v1.x / v2+):**
- Difficulty modifiers (Pact-of-Punishment style), weapon aspects/variants, additional enemy types, colorblind preset modes — add on positive reception.
- Linux/Proton build, Switch port, new biome/boss content drops — post-launch / separate projects.

**Anti-features to avoid:** mandatory grind-to-be-viable meta (top roguelite complaint), unfair/unreadable deaths, over-juice with no toggles, run-bricking RNG, procgen layouts (correctly out of scope), full engine migration.

### Architecture Approach

The upgrade is additive: a thin `render/` namespace (quarantined so the smoke test never loads it) layered over untouched game logic, with sprites as a *drop-in replacement* for primitive draws (graceful fallback to the existing primitive if a sheet hasn't loaded). The existing logical coordinate space already decouples world-space draws from screen pixels, giving a clean seam for a camera. Electron's `desktop/` shell is fully isolated so the browser build keeps working. Steam is bridged via a `window.steam.*` preload shim that is a no-op in the browser, keeping the same game code running in both environments.

**Major components:**
1. **Camera** — world→screen transform (offset, zoom, shake); one `apply/reset` pair wraps all world draws, replacing the inline `this.shake`. Makes kill-zoom and shake "free."
2. **SpriteManager + Animator** — load sheets, slice frame rects, advance animation timers (in `update`, pure math), `drawSprite` via `ctx.drawImage`; per-entity playback state.
3. **VFX/ParticleSystem (object-pooled)** — fixed-cap pool (no per-frame allocation → no GC stutter during juice spikes); replaces ad-hoc `this.particles.push`.
4. **LayerCompositor** — ordered draw passes on the single context (multi-canvas only if a specific blend/caching need is proven).
5. **Desktop Shell + SteamBridge** — Electron main creates the window, inits steamworks.js, exposes achievements/cloud via preload contextBridge; `steam_appid.txt` must be bundled (a known crash trap).

### Critical Pitfalls

1. **Hindu gods used as enemies / sacred figures trivialized** — organized backlash can sink the launch. Enforce the hard rule: gods are allies/boon-givers only; asuras/rakshasas are the opposition. 2-3 qualified cultural reviewers sign off *before* art finalization and store-page submission.
2. **AI art: no-IP + provenance + frame inconsistency** — add substantial human editing to every asset (improves quality *and* strengthens IP), use commercially-licensed models, log provenance, and use a consistency pipeline (locked reference sheet, fixed palette, fewer clean frames) reviewed *in motion*.
3. **Inaccurate Steam AI content disclosure** — incomplete/inaccurate disclosure can get the game removed. Complete Valve's AI Content Survey honestly for pre-generated content during store setup; over-disclose rather than under.
4. **Steam Overlay fails to inject (Electron/macOS)** — init Steam in main process before the renderer; test overlay explicitly on Win + macOS in the Steam-launched build (not just achievements firing); steamworks-ffi-node is the fallback.
5. **Canvas 2D drops below 60fps with sprites + particles** — pre-render statics offscreen, use image sprites not procedural strokes, object-pool particles, cap counts; profile worst case (boss phase 2 + max particles) **on Steam Deck**, not the title screen on a dev desktop.
6. **macOS code signing + notarization + Steamworks dylib entitlements** — set up Developer ID + hardened-runtime entitlements + notarization in CI *early*; an unsigned build that "works on the dev's Mac" hides the Gatekeeper block until launch week.

## Implications for Roadmap

Research strongly implies a **gate-then-parallel** structure. The render-abstraction seam is the gate; after it, a rendering track and a packaging track proceed independently and reconverge at release. Cultural review and art-pipeline discipline are cross-cutting gates that must precede art finalization and store submission. Smoke tests stay green at every phase boundary.

### Phase 1: Render Abstraction Seam (no visual change)
**Rationale:** ARCHITECTURE's explicit gate — introduce `render/camera.js` + named draw passes, refactor `game.js render()` to wrap world draws in `Camera.apply/reset`, still drawing primitives. Verifies the seam with zero art dependency and zero smoke-test risk. **Blocks everything downstream.**
**Delivers:** Camera abstraction, layered draw passes, unchanged visuals, green smoke test.
**Avoids:** Pitfall — render modules leaking into update/logic (breaks headless smoke test).

### Phase 2: Asset Pipeline + Sprite System (rendering track)
**Rationale:** Requires Phase 1's pass structure. Establish the AI-art consistency + provenance pipeline *before* mass-producing frames, then AssetLoader + SpriteManager, then per-actor sprite conversion (player → enemies → bosses) with primitive fallback — naturally parallel with art production.
**Delivers:** Loading screen, sheet loading, cohesive illustrated sprites with strong silhouettes.
**Uses:** Renderer-of-record decision (Canvas2D `drawImage` default vs PixiJS — resolve via benchmark first).
**Avoids:** Pitfalls — AI sprite inconsistency (consistency pipeline, in-motion review), AI no-IP/provenance (human-edit + provenance log).

### Phase 3: VFX + Combat Juice (rendering track, parallel with Phase 2)
**Rationale:** Requires only Phase 1's camera; independent of sprite conversion. Pooled particles, hit sparks, screen shake (via camera), kill-zoom, freeze-frames — highest perceived-quality ROI.
**Delivers:** "Feels good" combat juice. Ships with mandatory screen-shake/flash toggles in the same phase.
**Avoids:** Pitfalls — Canvas 60fps under load (object pooling, particle caps, offscreen pre-render), over-juice with no toggles.

### Phase 4: Gameplay Depth (boons, bosses, room variety)
**Rationale:** Content depth that justifies a paid release and delivers the Core Value. Boon synergies require boon-system depth first; boss phase art depends on the proven sprite pipeline; room variety multiplies perceived replay cheaply.
**Delivers:** 24 boons + 3+ Duo synergies, multi-phase telegraphed bosses, ≥3 layout templates/biome + hazards.
**Avoids:** Pitfalls — boon power creep/"solved" builds (data-driven balance harness), room sameness, poor boss telegraphing (windup + audio + VFX as gameplay).

### Phase 5: Desktop Wrapper + Gamepad + Settings (packaging track)
**Rationale:** Independent of the rendering track once Phase 1 is stable — wraps whatever the browser build is. The input-abstraction layer is the keystone unblocking gamepad, rebinding, and SteamInput glyphs (three Deck-Verified table stakes). Persistence migration (localStorage → userData file) belongs here, *before* Steamworks.
**Delivers:** Electron shell with `app://` loading, fullscreen/resolution/volume/rebind settings, full zero-config gamepad, save-file migration, accessibility toggles.
**Avoids:** Pitfalls — Electron bloat (lazy-load, budget on Deck), file:// CORS + missing steam_appid.txt, gamepad-as-afterthought.

### Phase 6: Steam Integration
**Rationale:** Requires Phase 5. Steamworks in main + preload bridge, 15+ achievements (with `StoreStats()`/`RunCallbacks()` plumbing), Steam Auto-Cloud, overlay validation on Win **and** macOS, offline-launch verification.
**Delivers:** Working achievements (persistent across restart), cloud saves (cross-machine tested), validated overlay.
**Avoids:** Pitfalls — overlay injection failure, API-key/offline/DRM mistakes, achievement non-persistence.

### Phase 7: CI/CD + Store Submission + Cultural Review
**Rationale:** Requires a working local build (Phase 5/6). electron-builder → GitHub Actions matrix → signed/notarized artifacts. Store-page assets, accurate AI Content Survey, and the cultural-review sign-off gate the public launch.
**Delivers:** Tag-triggered Win + macOS binaries (signed/notarized), capsule/6+ screenshots/trailer, completed AI disclosure, cultural sign-off.
**Avoids:** Pitfalls — macOS notarization/entitlement block (automated in CI), inaccurate AI disclosure (storefront removal), cultural backlash (pre-launch reviewer gate).

### Phase Ordering Rationale
- **Phase 1 is the universal gate** (ARCHITECTURE): nothing downstream is safe until the render seam exists and the smoke test stays green through it.
- After the gate, the **rendering track (2→3→4) and packaging track (5→6→7) are genuinely parallel** — the desktop shell wraps the browser build and doesn't depend on sprites/VFX. This enables concurrent execution.
- **Persistence migration sequences before Steamworks** (STACK): Auto-Cloud syncs files, not localStorage — so the userData-file migration must land in the wrapper phase, not the Steam phase.
- **Cultural review and AI-provenance discipline are cross-cutting**: provenance logging starts at the *first* art generation (Phase 2); cultural sign-off gates art finalization and store submission (Phase 7).

### Research Flags

Phases likely needing deeper `/gsd:research-phase` during planning:
- **Phase 2 (renderer decision):** The STACK-vs-ARCHITECTURE disagreement (PixiJS vs Canvas2D) is unresolved and high-stakes; needs a worst-case-density benchmark before committing.
- **Phase 6 (Steam overlay on macOS):** Known-broken combo with steamworks.js; the steamworks-ffi-node fallback's cross-platform overlay claim must be verified on the actual build before relying on it.
- **Phase 7 (macOS notarization + Steamworks dylib entitlements):** "Good luck figuring out which entitlements" per developer reports — exact hardened-runtime exceptions are poorly documented and need pinning down.
- **Phase 2 (AI consistency pipeline):** Vendor-specific (Spritesheets.AI/PixelLab/ControlNet); the right tooling for the chosen art model needs validation.

Phases with standard patterns (skip research-phase):
- **Phase 1 (render seam):** Architecture researcher inspected the codebase directly and gave concrete patterns/examples.
- **Phase 3 (VFX pooling) & Phase 5 (gamepad/settings):** Well-documented patterns; object pooling and Web Gamepad API are established.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Wrapper/sprite/gamepad HIGH; Steamworks-on-macOS-overlay HIGH on the *problem*, MEDIUM on the recommended fix. Renderer choice unresolved between PixiJS and Canvas2D. |
| Features | HIGH | Steam Deck/Steamworks reqs from official docs; roguelite design from broad player/critic consensus across multiple sources. |
| Architecture | HIGH | Codebase inspected directly; external tooling claims verified against official repos and 2025 sources. |
| Pitfalls | HIGH (technical) / MEDIUM-HIGH (cultural + 2026 AI rules) | Steamworks/Electron/Canvas verified against docs + post-mortems; cultural and AI-disclosure verified across multiple credible sources. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address
- **Renderer of record (PixiJS vs Canvas2D):** STACK and ARCHITECTURE disagree. *Handle:* benchmark worst-case sprite/particle density (boss phase 2 + max particles) at target resolution on Steam Deck early in Phase 2; default to lower-risk Canvas2D + offscreen pre-render unless it bottlenecks.
- **macOS Steam overlay parity:** Broken with steamworks.js; FFI fallback unverified on this build. *Handle:* validate overlay on a real Steam-launched macOS build in Phase 6; decide steamworks-ffi-node swap based on whether QA/cultural review treats the gap as a blocker.
- **macOS hardened-runtime entitlements for Steamworks dylibs:** Exact set undocumented. *Handle:* test a notarized build through Gatekeeper early; bake entitlements into CI config, not a launch-week scramble.
- **AI art commercial-license + provenance:** Depends on the chosen generator's ToS. *Handle:* verify commercial-use terms before mass generation; establish provenance logging at the first asset.
- **CI YAML specifics:** Patterns are clear, exact YAML is project-specific. *Handle:* iterate once a working local build exists; keep steamcmd depot upload manual until the binary pipeline is proven.

## Sources

### Primary (HIGH confidence)
- Steamworks official docs — Content Survey/age ratings, Steam Cloud/Auto-Cloud, Steam DRM (optional), Steam Deck compatibility + recommendations, achievements guide, Steam Input best practices.
- ceifa/steamworks.js GitHub (README + issues #50/#97/#195 — macOS overlay limitation) and greenheartgames/greenworks (maintenance status, steam_appid.txt placement #183).
- Existing codebase — js/game.js, js/entities.js, index.html, .planning/PROJECT.md (direct inspection).
- web.dev / MDN — HTML5 Canvas performance, OffscreenCanvas + Web Worker, optimizing canvas; MDN Gamepad API.
- Shirajuki JS game rendering benchmark (PixiJS fastest 2D renderer); npm registry version verification (2026-06-17).
- Electron issue #2758 (file:// vs custom protocol CORS); "One Game, By One Man, On Six Platforms" (macOS dylib entitlements, overlay pain).

### Secondary (MEDIUM confidence)
- jslegenddev — wrapping/packaging a JS game (Electron/Tauri/NW.js tradeoffs, Steamworks "deal breaker").
- webgamedev.com desktop publishing; Phaser "Publishing Web Games on Steam with Electron" (2025); Overaction/liana.one/trashmoon Electron+steamworks.js+CI guides.
- Steam AI disclosure 2026 indie guides (strayspark, everydayai); AI-generated game assets legal guides (promise.legal).
- Roguelite design analysis (Hades vs Dead Cells variety/power-creep; stat-meta-progression criticism); GameAnalytics/Game Developer/Wayline on juice; Notebookcheck on late-game particle/perf complaints.
- Cultural sensitivity controversies (SMITE Hindu gods; SEGA/Atlus deities-as-demons; HuffPost Hindu gods in gaming).

### Tertiary (LOW confidence)
- ArtyProf/steamworks-ffi-node — claimed cross-platform (incl. macOS/Metal) Electron overlay; smaller track record, verify on own build.
- HN Tauri-for-Steam abandonment report (anecdotal, corroborates the Electron consensus).
- Spritesheets.AI / PixelLab — AI sprite consistency tooling (vendor sources).

---
*Research completed: 2026-06-17*
*Ready for roadmap: yes*
