# REQUIREMENTS — Chakravyuha v1.0

Generated: 2026-06-17
Source: PROJECT.md + Research (STACK, FEATURES, ARCHITECTURE, PITFALLS)

---

## v1 Requirements

### RENDER — Rendering Foundation

- [x] **RENDER-01**: Render abstraction layer with camera system and named draw passes (background, entities, effects, UI) — no visual change to gameplay, smoke tests stay green
- [x] **RENDER-02**: Asset loader that loads sprite sheets from disk with graceful fallback to primitive shapes if asset missing
- [x] **RENDER-03**: Sprite manager with per-actor frame animation support (frame index, frame timing, loop/once modes)

### ART — Visual Assets

- [x] **ART-01**: Player sprite — Abhimanyu with at least 4 animation states (idle, run/walk, attack, dash) generated via AI tools with provenance log
- [x] **ART-02**: Enemy sprites — each distinct enemy archetype has a unique sprite (minimum 6 variants across biomes)
- [x] **ART-03**: Boss sprites — all 4 bosses (Tataka, Ahiravana, Kumbhakarna, Yama) have large illustrated sprites with a phase-2 variant
- [x] **ART-04**: Environmental art — biome-specific background and floor tile sets for all 4 biomes (Naraka, Patala, Ranabhoomi, Vaitarani)
- [x] **ART-05**: UI art — styled boon card art, HUD elements, and overlay panels with Indian visual motifs
- [x] **ART-06**: AI provenance log — every generated asset has a record of prompt, model, and post-processing steps (IP defensibility + Steam AI survey)

### VFX — Visual Effects & Combat Feel

- [x] **VFX-01**: Particle system with object pooling — hit sparks, astra trails, death bursts, environmental ambiance
- [x] **VFX-02**: Camera shake system with adjustable intensity and opt-out accessibility toggle in settings
- [x] **VFX-03**: Hitstop (freeze frame) on significant impacts — 3–8 frame pause on heavy hits and kills
- [x] **VFX-04**: Screen flash on player damage/death with opt-out accessibility toggle
- [x] **VFX-05**: Biome-specific ambient particles (embers in Naraka, mist in Vaitarani, etc.)

### GAMEPLAY — Game Depth

- [x] **GAME-01**: Boon pool expanded to minimum 24 total boons — at least 4 boons per god (Hanuman, Krishna, Agni, Indra, Vayu, Durga)
- [x] **GAME-02**: At least 3 Duo Boon synergy combinations — named synergies unlocked by holding 2 specific god boons
- [x] **GAME-03**: Room layout variety — at least 3 distinct procedural layout templates per biome (12 total new templates)
- [x] **GAME-04**: Environmental hazards — at least 1 unique biome hazard per biome (spike traps, lava pools, river currents, etc.)
- [x] **GAME-05**: Multi-phase bosses — all 4 bosses have at least 2 distinct phases with changed behavior at health threshold
- [x] **GAME-06**: Boss telegraphing — all boss attacks have a visible wind-up (animation anticipation frame or indicator) before dealing damage

### PLATFORM — Desktop & Input

- [x] **PLAT-01**: Electron desktop app producing Windows (.exe installer) and macOS (.dmg) binaries from the existing HTML5 game
- [x] **PLAT-02**: Input abstraction layer supporting keyboard, mouse, and gamepad as interchangeable input sources
- [x] **PLAT-03**: Full gamepad support — all actions bindable to controller buttons, analog stick for movement, works on Steam Deck
- [x] **PLAT-04**: Save migration — localStorage data migrated to JSON file in Electron `app.getPath('userData')` before Steam Cloud phase
- [x] **PLAT-05**: Settings menu — volume (music/SFX), fullscreen toggle, resolution options, control rebinding, screen-shake toggle, screen-flash toggle

### STEAM — Steam Integration

- [ ] **STEAM-01**: Steamworks SDK integrated via steamworks.js in Electron main process with contextBridge to renderer
- [ ] **STEAM-02**: Steam achievements — minimum 15 achievements covering weapons, biomes, bosses, meta milestones
- [ ] **STEAM-03**: Steam Cloud Auto-Cloud syncing the userData save file across devices
- [ ] **STEAM-04**: Steam overlay functional on Windows; macOS overlay validated (fallback to steamworks-ffi-node if broken)
- [ ] **STEAM-05**: Steam store page assets — capsule art (616×353, 460×215, header 460×215), 6+ screenshots, store description, short description

### QA — Quality & Launch Gates

- [ ] **QA-01**: GitHub Actions CI/CD — signed Windows + macOS binaries produced automatically on every git tag push
- [ ] **QA-02**: Anonymous opt-in telemetry — single POST on run end recording weapon, biome reached, boons taken, run time
- [ ] **QA-03**: Cultural review sign-off — 2–3 reviewers with Hindu mythology knowledge approve art and narrative tone before store page goes live
- [x] **QA-04**: Steam AI Content Survey completed correctly for all AI-generated visual assets
- [ ] **QA-05**: Steam Deck Verified checklist passed — controller-complete, glyphs correct, minimum 9px font at 1280×800, functional default framerate

---

## v2 Requirements (deferred)

- Nintendo Switch port — requires Nintendo dev license, separate native build; plan after Steam ships
- Linux Steam build — add if wishlist demand warrants it after launch
- Full engine migration (Godot/Unity) — revisit as a Switch-port prerequisite decision
- Mobile (iOS/Android) — different control paradigm; post-Steam
- Multiplayer — co-op or PvP; significant architecture change
- Procedurally generated room layouts — hand-crafted variety ships faster and balances easier
- macOS hardened-runtime Steamworks entitlement hardening — ship unsigned for beta, harden before launch
- Trailer video — produce once screenshot quality is proven

---

## Out of Scope

- Linux Steam build — low demand signal, add post-launch if warranted
- DRM (Steam DRM wrapper) — ship DRM-free; Steam's DRM doesn't meaningfully deter pirates and adds support overhead
- Commissioned art — budget constraint; AI-generated assets only this milestone
- Localization (non-English) — defer; Hindi/Tamil localization is high value but out of scope for v1
- Custom soundtrack (composed) — existing synthesized WebAudio stays; real composition is post-Steam if revenue allows
- Speedrun mode / leaderboards — nice-to-have; defer to post-launch

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| RENDER-01 | Phase 1 | Complete |
| RENDER-02 | Phase 2 | Complete |
| RENDER-03 | Phase 2 | Complete |
| ART-01 | Phase 2 | Complete (human verify pending) |
| ART-02 | Phase 2 | Complete (human verify pending) |
| ART-03 | Phase 2 | Complete (human verify pending) |
| ART-04 | Phase 2 | Complete (human verify pending) |
| ART-05 | Phase 2 | Complete (human verify pending) |
| ART-06 | Phase 2 | Complete |
| VFX-01 | Phase 3 | Complete (human verify pending) |
| VFX-02 | Phase 3 | Complete (human verify pending) |
| VFX-03 | Phase 3 | Complete (human verify pending) |
| VFX-04 | Phase 3 | Complete (human verify pending) |
| VFX-05 | Phase 3 | Complete (human verify pending) |
| GAME-01 | Phase 4 | Complete (human verify pending) |
| GAME-02 | Phase 4 | Complete (human verify pending) |
| GAME-03 | Phase 4 | Complete (human verify pending) |
| GAME-04 | Phase 4 | Complete (human verify pending) |
| GAME-05 | Phase 4 | Complete (human verify pending) |
| GAME-06 | Phase 4 | Complete (human verify pending) |
| PLAT-01 | Phase 5 | Complete (human verify pending) |
| PLAT-02 | Phase 5 | Complete (human verify pending) |
| PLAT-03 | Phase 5 | Complete (human verify pending) |
| PLAT-04 | Phase 5 | Complete (human verify pending) |
| PLAT-05 | Phase 5 | Complete (human verify pending) |
| STEAM-01 | Phase 6 | Pending |
| STEAM-02 | Phase 6 | Pending |
| STEAM-03 | Phase 6 | Pending |
| STEAM-04 | Phase 6 | Pending |
| STEAM-05 | Phase 7 | Pending |
| QA-01 | Phase 7 | Pending |
| QA-02 | Phase 7 | Pending |
| QA-03 | Phase 7 | Pending |
| QA-04 | Phase 2 | Complete |
| QA-05 | Phase 7 | Pending |
