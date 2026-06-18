<!-- GSD:project-start source:PROJECT.md -->
## Project

**Chakravyuha — चक्रव्यूह**

A commercial action roguelite for Steam set in Indian mythology. You play Abhimanyu, trapped in the Chakravyuha battle formation, fighting your way up through Yama's realm run by run. Built on a working HTML5/Canvas/vanilla JS MVP — this milestone upgrades it from a functional prototype to a polished, commercially releasable Steam title with stylized 2D art and significantly deeper gameplay.

**Core Value:** Every death makes the next run feel different — the combination of god boons, weapon choice, and room layouts creates builds players want to talk about.

### Constraints

- **Tech stack:** Vanilla JS stays — no framework migration this milestone
- **Art tooling:** AI-generated assets only — no commissioned art budget
- **Platform:** Steam (Windows + macOS) as primary target; Switch deferred
- **Tests must pass:** `node test/smoke.js` must remain green after every phase
- **Mythological reverence:** Gods are allies only, never enemies; asuras/rakshasas oppose the player — this line must not be crossed
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Electron** | `42.x` (latest) or current LTS-style stable | Desktop wrapper producing Windows + macOS binaries | Only the Electron/NW.js family is supported by the JS Steamworks bindings. Electron bundles Chromium so the Canvas/WebGL renderer is **pixel-identical across Windows and macOS** — critical when you ship illustrated sprites and VFX. Tauri uses OS-native WebViews (WebKit on macOS) which render differently per-OS and have no usable Steamworks path. |
| **PixiJS** | `8.x` (8.19+) | WebGL sprite renderer layered over existing game logic | Fastest JS 2D renderer in independent benchmarks (~47 FPS vs Phaser ~43 in the rendering-benchmark suite), GPU-accelerated, batched sprite/particle rendering. Hades-style art = hundreds of layered animated sprites + VFX; raw Canvas 2D (current approach) is CPU-bound and will not hold 60 FPS at that sprite count. PixiJS is a *renderer only* — it does not impose a game framework, so it drops in under your existing loop/data-driven systems without a rewrite. |
| **Web Gamepad API** | Native (browser/Chromium built-in) | Controller input (Steam Deck + roguelite audience) | Native, zero-dependency, present in Chromium (so works in Electron). `navigator.getGamepads()` polled inside your existing `requestAnimationFrame` loop fits the game's architecture exactly. Steam Input additionally remaps most controllers to the W3C "standard" layout before your app sees them. You write a thin deadzone + rebind layer yourself (~150 lines) rather than adopting a heavy library. |
| **electron-builder** | `26.x` | Packaging + code-signing Windows (`.exe`/NSIS) and macOS (`.dmg`/`.app`) binaries | De-facto standard for Electron packaging, integrates with GitHub Actions, handles macOS notarization and Windows signing, and supports copying the Steamworks redistributable binaries into the build output. |
### Steamworks Binding — Decision
| Option | Version | Recommendation | Rationale |
|--------|---------|----------------|-----------|
| **steamworks.js** (`ceifa/steamworks.js`) | `0.4.0` | **Default choice for achievements + stats + cloud** | Most widely used, active, TypeScript types, NAPI native module. Achievements, stats, Steam Cloud (remote storage), localplayer all work cross-platform. **Known limitation:** Steam overlay works on Windows only; on macOS the overlay (Shift+Tab, invite, achievement toasts) does not work (issue #50). Node/ABI version-locked. |
| **steamworks-ffi-node** (`ArtyProf/steamworks-ffi-node`) | active, FFI-based (Koffi) | **Adopt IF macOS overlay parity is required** | Zero-compilation FFI wrapper, not ABI-locked to Node version, claims a working cross-platform Electron overlay (tested macOS/Metal, Windows, Linux/Steam Deck) by capturing Electron's content into a native surface. ~6 shipped Steam titles. Newer/smaller track record than steamworks.js — verify the overlay claim against your build before committing. |
| **greenworks** | — | **Do NOT use** | Maintained "best-effort," NW.js-focused, requires hand-compiling matching Electron/Node/Steamworks binary combinations, missing newer Steam integrations, slow issue response. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@pixi/particle-emitter` | latest for Pixi v8 | Particle VFX (hit sparks, dash trails, astra casts, ambiance) | Use for the VFX system requirement; tuned for PixiJS batched rendering. |
| TexturePacker (CLI) or `free-tex-packer` | latest | Pack AI-generated frames into sprite-sheet atlases + JSON | Required for the asset pipeline — AI art comes as loose frames; atlases cut draw calls and load time. `free-tex-packer-core` is scriptable in CI. |
| Aseprite **or** a custom frame-extraction script | latest | Slice/clean AI sprite sheets into named animation frames | Aseprite if doing manual cleanup; a Node script if frames are programmatically extractable. Output feeds the atlas packer. |
| `electron-notarize` (or built into electron-builder 26) | bundled | macOS notarization for Gatekeeper | Mandatory to distribute an unflagged macOS `.app` outside the App Store. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **GitHub Actions** | CI/CD — build Win + macOS binaries on every tag | Use a `macos-latest` runner for the macOS `.dmg` (notarization needs macOS) and `windows-latest` for the `.exe`. Cross-compiling Win from Mac is the exact pain point that pushes people off plain Electron — solve it with a per-OS runner matrix, not local cross-compile. |
| **steamcmd / Steam SDK content builder** | Upload built binaries to Steam depots | Scriptable from CI as a release step after binaries are produced and signed. |
| Smoke test (`node test/smoke.js`) | Must stay green every phase | Renderer swap (Canvas→Pixi) and input layer must not break headless run simulation — keep game logic decoupled from the Pixi render layer so smoke tests run without a GPU. |
## Installation
# Core wrapper + renderer
# Dev / packaging
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Electron | **NW.js** | NW.js is genuinely viable (5,700+ Steam games, no front/back split, simpler file I/O, easier pre-built cross-platform binaries — RPG Maker/Construct ship on it). Choose it if electron-builder's front/back-process model and packaging friction become a time sink. The Steamworks bindings support both. Electron wins here mainly on larger ecosystem + better-documented Steamworks overlay attempts. |
| PixiJS | **Phaser 3** | Choose Phaser only if you wanted its batteries (physics, scenes, tweens, input, tilemaps). You already have a working engine with all of that hand-rolled — Phaser would mean rewriting working systems. Reject for this milestone. |
| PixiJS | **Keep raw Canvas 2D** | Only viable if final sprite/VFX counts stay low. Given the Hades/Dead Cells target (layered illustrated sprites + particles + screen effects at 60 FPS), Canvas 2D will bottleneck. Migrate to Pixi. |
| Web Gamepad API | **gamepad.js / contro / `gamecontroller.js`** | A wrapper library is worth it only if cross-browser mapping inconsistency bites — but in Electron you target one Chromium version, so the native API is consistent. Skip the library. |
| steamworks.js | **steamworks-ffi-node** | When a working **macOS in-game overlay** is a hard requirement (see Steamworks decision above). |
| Steam Auto-Cloud | **Steamworks Remote Storage API** | Use the API only if you need conflict resolution UI or per-slot cloud control beyond file-pattern sync. For a single-save roguelite, Auto-Cloud is simpler and needs zero binding code. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Tauri** | OS-native WebViews render Canvas/WebGL inconsistently across Win/macOS; macOS WebKit is slower for graphics; **no usable Steamworks path** (backend is Rust, the JS Steam libs don't target it). | Electron (or NW.js) |
| **greenworks** | Hand-compiled binary matrix, NW.js-centric, stale, missing integrations. | steamworks.js |
| **localStorage as the save-of-record (post-wrap)** | Steam Auto-Cloud syncs *files by path*, not Chromium's localStorage DB. Cloud saves can't be wired to localStorage without fragile hacks. | Migrate persistence to a JSON file in `app.getPath('userData')`, then point Steam Auto-Cloud at it. Keep localStorage only as an in-memory/legacy fallback. |
| **Phaser** (as a full framework) | Forces rewriting your already-working loop, scenes, audio, input. | PixiJS as a pure renderer under the existing loop |
| **Steamworks CEG / Steam DRM** | Optional; adds build complexity and breaks the Electron unpacked-asar model; no anti-piracy benefit at this price point. | Ship DRM-free (fully allowed on Steam — Steamworks ≠ DRM). |
## Stack Patterns by Variant
- Use `steamworks-ffi-node` instead of `steamworks.js`
- Because it's the only JS option claiming a working cross-platform (incl. macOS/Metal) Electron overlay; verify on your own build first.
- Switch the wrapper to NW.js with `nw-builder@4`
- Because NW.js ships pre-built per-platform binaries and avoids the front/back-process packaging split; both Steamworks bindings still work.
- Skip PixiJS, keep Canvas 2D
- Because avoiding the renderer migration de-risks the smoke-test suite. Validate with a worst-case-sprite-count benchmark before deciding.
## Critical Cross-Cutting Findings (feed these to PITFALLS + roadmap)
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `steamworks.js@0.4.0` | Electron 42 / Node 20+ | NAPI native module is **ABI/Node-version-locked** — pin Electron and rebuild bindings if you bump it. This lock-in is the main reason to consider the FFI alternative. |
| `pixi.js@8` | Electron 42 (Chromium WebGL2) | Pixi v8 defaults to WebGL2/WebGPU; Chromium in Electron supports both. v8 has breaking API changes from v7 — target v8 from the start. |
| `electron-builder@26` | Electron 42 | Handles asar packaging of `steamworks.js` native binaries — mark native modules as unpacked (`asarUnpack`) or Steam libs won't load. |
| Steam Auto-Cloud | save file in `app.getPath('userData')` | Path patterns configured in Steamworks partner site must match the actual on-disk userData path per OS. |
## Sources
- jslegenddev — "The Struggle of Wrapping a JavaScript Game" — Electron/Tauri/NW.js wrapper tradeoffs (MEDIUM, practitioner experience): https://jslegenddev.substack.com/p/the-struggle-of-wrapping-a-javascript
- webgamedev.com — Desktop publishing (Electron/NW.js are the only Steamworks-supported wrappers) (MEDIUM): https://www.webgamedev.com/publishing/desktop
- `ceifa/steamworks.js` GitHub README + issues #50 (macOS overlay broken), #97, #195 (overlay) (HIGH on the limitation): https://github.com/ceifa/steamworks.js/
- `ArtyProf/steamworks-ffi-node` (FFI wrapper, claimed cross-platform overlay) (MEDIUM): https://dev.to/arty_prof/steamworks-ffi-node-a-steamworks-sdk-library-for-javascript-game-frameworks-15h1
- `greenheartgames/greenworks` (why not to use) (HIGH): https://github.com/greenheartgames/greenworks
- Shirajuki JS game rendering benchmark (PixiJS fastest 2D renderer) (HIGH): https://github.com/Shirajuki/js-game-rendering-benchmark
- generalistprogrammer.com — PixiJS (renderer) vs Phaser (framework) (MEDIUM): https://generalistprogrammer.com/tutorials/phaser-vs-pixijs-renderer-comparison
- MDN — Using the Gamepad API + Controls Gamepad API (HIGH): https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
- Adam Jones — W3C standard gamepad mapping for Xbox (HIGH): https://adamjones.me/blog/gamepad-mapping/
- Steamworks docs — Content Survey / Age Ratings / Age Gate (HIGH): https://partner.steamgames.com/doc/gettingstarted/contentsurvey
- Steamworks docs — Steam Cloud / Auto-Cloud (HIGH): https://partner.steamgames.com/doc/features/cloud
- Steamworks docs + HN — Steam DRM (CEG) is optional, Steamworks ≠ DRM (HIGH): https://partner.steamgames.com/doc/features/drm
- npm registry — current versions verified 2026-06-17 (HIGH): steamworks.js 0.4.0, pixi.js 8.19.0, electron 42.4.1, electron-builder 26.15.3, nw-builder 4.17.11
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
