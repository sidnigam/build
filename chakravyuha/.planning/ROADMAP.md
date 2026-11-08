# Roadmap: Chakravyuha — चक्रव्यूह

## Overview

Chakravyuha is a working vanilla-JS/HTML5-Canvas action roguelite being upgraded from a functional prototype into a commercial Steam release. The journey is a **gate-then-parallel** upgrade: a render-abstraction seam lands first (no visual change, smoke tests stay green) and unblocks everything. After that gate, a **rendering track** (sprites → VFX → gameplay depth) and a **packaging track** (Electron shell → Steamworks → CI/CD + store) proceed independently and reconverge at launch. Cultural reverence and AI-art provenance are cross-cutting gates: provenance logging begins at the first generated asset, and cultural sign-off blocks the store page going live. The result is a polished, controller-complete, Steam-Deck-ready title with cohesive illustrated art, deep combat juice, 24 boons with named synergies, and multi-phase bosses — built without abandoning the vanilla-JS engine.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Render Abstraction Seam** - Camera + named draw passes over untouched game logic, zero visual change (completed 2026-06-19)
- [x] **Phase 2: Asset Pipeline + Sprite System** - AI-art consistency/provenance pipeline, asset loader, sprite manager, cohesive illustrated actors
- [x] **Phase 3: VFX + Combat Juice** - Pooled particles, hitstop, screen shake/flash, kill-zoom with accessibility toggles
- [x] **Phase 4: Gameplay Depth** - 24 boons + Duo synergies, multi-phase telegraphed bosses, room/hazard variety
- [x] **Phase 5: Desktop Wrapper + Gamepad + Settings** - Electron Win/macOS shell, input abstraction, full gamepad, save migration, settings menu
- [x] **Phase 5.1: Scrolling Camera + Larger Arenas + Denser Waves** (INSERTED)
- [x] **Phase 5.2: PS5 DualSense Controller Support** (INSERTED)
- [x] **Phase 5.3: Adaptive Indian Classical Score** (INSERTED)
- [x] **Phase 5.4: Epic-Inspired Environment Art Upgrade** (INSERTED) (completed 2026-11-07, human visual check deferred)
- [x] **Phase 5.5: God Portraits + Boon Dialogue** (INSERTED)
- [x] **Phase 5.6: Graphics Polish (Lighting, Bloom, Sprite Quality)** (INSERTED)
- [x] **Phase 5.7: Cultural + Iconography Corrections** (INSERTED) (completed 2026-11-07; CULT-02 Yama danda + CULT-03 Indra vajra deferred to Phase 7 QA-03)
- [ ] **Phase 5.7.1: Hades-style Combat Depth** (INSERTED) - pace, closer camera, enemy variety + mini-bosses, projectile/status variety, player kit, difficulty, boss variety
- [ ] **Phase 5.7.2: Thrilling Combat + Boss Theme** (INSERTED) - per-biome, high-tempo, Hades-inspired Indian procedural score
- [ ] **Phase 5.7.3: Room Shape + Size Variety** (INSERTED) - non-rectangular, varied arenas
- [ ] **Phase 5.7.4: Art Direction Refresh** (INSERTED) - style exploration, then vibrant backgrounds
- [ ] **Phase 6: Steam Integration** - Steamworks SDK, 15+ achievements, Cloud saves, validated overlay
- [ ] **Phase 7: CI/CD + Store Submission + Cultural Review** - Signed CI binaries, store assets, telemetry, AI survey, cultural sign-off, Deck Verified

## Phase Details

### Phase 1: Render Abstraction Seam
**Goal**: A camera abstraction and named draw passes wrap all world rendering, with no change to gameplay visuals and the smoke test staying green — the universal gate that makes every downstream phase safe.
**Depends on**: Nothing (first phase)
**Requirements**: RENDER-01
**Success Criteria** (what must be TRUE):
  1. The game looks pixel-identical to the current build after the refactor (no visual regression)
  2. World draws are wrapped in a single camera apply/reset pair supporting offset, zoom, and shake
  3. Rendering is organized into named, ordered passes (background, entities, effects, UI)
  4. `node test/smoke.js` passes green, and render modules never load in the headless path
**Plans**: 1 plan
- [x] 01-01-PLAN.md — Camera seam + 4 named draw passes over GAME.render(), smoke green, visual A/B
**UI hint**: yes

### Phase 2: Asset Pipeline + Sprite System
**Goal**: A human-in-the-loop AI-art pipeline produces cohesive illustrated sprites with strong silhouettes, loaded from disk by an asset loader and animated by a sprite manager, replacing primitive draws with graceful fallback — with provenance logged from the first asset.
**Depends on**: Phase 1
**Requirements**: RENDER-02, RENDER-03, ART-01, ART-02, ART-03, ART-04, ART-05, ART-06, QA-04
**Success Criteria** (what must be TRUE):
  1. The game loads sprite sheets from disk and falls back to primitive shapes when an asset is missing
  2. Abhimanyu, every enemy archetype (6+), and all 4 bosses render as animated illustrated sprites with phase-2 boss variants
  3. All 4 biomes show illustrated backgrounds/floor tiles, and boon cards/HUD/overlays use Indian visual motifs
  4. Every generated asset has a provenance record (prompt, model, post-processing), and the Steam AI Content Survey is filled correctly for those assets
  5. `node test/smoke.js` stays green with sprites integrated
**Plans**: 6 plans
- [x] 02-01-PLAN.md — Bootstrap: package.json + headless-safe SPRITES global + smoke harness extensions (RENDER-02, RENDER-03)
- [x] 02-02-PLAN.md — PixiJS 8 renderer migration: CAMERA→Container, primitive bridge, sprite-or-fallback (RENDER-02, RENDER-03)
- [x] 02-03-PLAN.md — Atlas pack tool (animations injection) + provenance tooling + AI disclosure draft (ART-06, QA-04)
- [x] 02-04-PLAN.md — License gate + reference lock + idle frames (run/attack/dash SUPERSEDED by 02-07 procedural animation)
- [~] 02-05-PLAN.md — SUPERSEDED by 02-08/02-11 (art pivot, see 02-CONTEXT-AMENDMENT)
- [~] 02-06-PLAN.md — SUPERSEDED by 02-08/02-09
- [x] 02-07-PLAN.md — Procedural animation core, hit flash, spawn/death, dash ghosts
- [x] 02-08-PLAN.md — ComfyUI art tooling + 4 biome backgrounds
- [x] 02-09-PLAN.md — CSS/SVG Indian-motif UI pass
- [x] 02-10-PLAN.md — Code-drawn weapon overlay + biome background rendering
- [x] 02-11-PLAN.md — 4 bosses (+phase-2) + 8 enemies + review contact sheet
**UI hint**: yes

### Phase 3: VFX + Combat Juice
**Goal**: Combat feels good — pooled particles, hit sparks, screen shake (via the camera), kill-zoom, and freeze-frames land on impacts, shipping in the same phase as the mandatory screen-shake and screen-flash accessibility toggles.
**Depends on**: Phase 1
**Requirements**: VFX-01, VFX-02, VFX-03, VFX-04, VFX-05
**Success Criteria** (what must be TRUE):
  1. Hits, astra casts, dash trails, and deaths emit particles from an object-pooled system with no GC stutter under load
  2. Heavy hits and kills produce hitstop (3-8 frame freeze) and the camera punches/zooms on kills
  3. Player damage flashes the screen and biome-specific ambient particles play per biome
  4. Players can disable screen shake and screen flash via toggles
  5. Frame rate holds at target during worst-case load (boss phase 2 + max particles) and the smoke test stays green
**Plans**: 3 plans
- [x] 03-01-PLAN.md — SETTINGS global + pooled VFX particle core, burst() routed through VFX
- [x] 03-02-PLAN.md — Hitstop, camera punch/kick, combat presets, screen flash, hook points
- [x] 03-03-PLAN.md — Biome ambient particles, F3 debug overlay, accessibility toggles, worst-case stress run
**UI hint**: yes

### Phase 4: Gameplay Depth
**Goal**: The content that justifies a paid release and delivers the Core Value — players assemble talked-about builds from a deep boon pool with named synergies, fight multi-phase telegraphed bosses, and explore varied rooms with biome hazards.
**Depends on**: Phase 2
**Requirements**: GAME-01, GAME-02, GAME-03, GAME-04, GAME-05, GAME-06
**Success Criteria** (what must be TRUE):
  1. Players can choose from 24+ boons (4+ per god) and unlock at least 3 named Duo Boon synergies
  2. Each biome offers 3+ distinct room layout templates and at least 1 unique environmental hazard
  3. All 4 bosses have 2+ distinct phases with changed behavior at a health threshold
  4. Every boss attack shows a visible wind-up before dealing damage
  5. `node test/smoke.js` completes full runs green with the expanded content
**Plans**: 4 plans
- [x] 04-01-PLAN.md — Boss telegraph invariant + phase-2 movesets
- [x] 04-02-PLAN.md — Boon-count guard + 6 Duo Boons
- [x] 04-03-PLAN.md — Room layout templates + obstacle collision
- [x] 04-04-PLAN.md — Biome hazards

### Phase 5: Desktop Wrapper + Gamepad + Settings
**Goal**: The browser build becomes a real desktop app — an Electron shell produces Win/macOS binaries, an input abstraction makes keyboard/mouse/gamepad interchangeable for a fully controller-playable experience, saves migrate to a userData file, and a settings menu exposes all options.
**Depends on**: Phase 1
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05
**Success Criteria** (what must be TRUE):
  1. Players can install and launch Windows (.exe) and macOS (.dmg) builds of the game
  2. The entire game is playable with a gamepad (analog movement, all actions bindable), keyboard, or mouse interchangeably
  3. Players can adjust volume, fullscreen, resolution, rebind controls, and toggle screen shake/flash from a settings menu
  4. Existing localStorage save data migrates to a JSON file in the Electron userData path with no progress loss
  5. `node test/smoke.js` stays green and the browser build still runs
**Plans**: 3 plans
- [x] 05-01-PLAN.md — Electron shell + packaging + STORE + save migration
- [x] 05-02-PLAN.md — Gamepad + input abstraction + rebinding model
- [x] 05-03-PLAN.md — Settings menu
**UI hint**: yes

### Phase 05.1: Scrolling camera, larger arenas and denser waves (INSERTED)
**Goal**: Rooms become larger than the screen with a smooth follow camera, and combat pacing shifts to more enemies per room — easy, numerous early waves ramping to intense later ones.
**Depends on**: Phase 5
**Success Criteria** (what must be TRUE):
  1. Arenas are larger than the 1280x720 viewport and the camera follows the player smoothly, clamped to arena bounds; HUD stays fixed
  2. Mouse aim, gamepad aim, projectiles, telegraphs, hazards, obstacles and doors all work in world space under the moving camera
  3. Off-screen enemies and doors are signposted (edge indicators)
  4. Early waves spawn more but weaker enemies; density and difficulty ramp per room and biome; boss arenas stay readable
  5. `node test/smoke.js` stays green with full-run simulations on the larger arenas
**Plans**: TBD

### Phase 05.2: PS5 DualSense controller support and controller UX (INSERTED)
**Goal**: A PS5 DualSense controller plays the whole game — PlayStation glyphs, menu navigation, aim indicator, rumble — in both the browser build and Electron.
**Depends on**: Phase 05.1 (world-space aim)
**Success Criteria** (what must be TRUE):
  1. A DualSense connected over USB or Bluetooth is detected and mapped (standard mapping) with correct sticks, triggers and face buttons
  2. On-screen prompts switch to PlayStation glyphs (Cross/Circle/Square/Triangle, L1/R1/L2/R2) when a DualSense is the active device
  3. Every menu (hub, boon pick, shop, shrine, armory, codex, settings, pause, death) is navigable with the controller alone
  4. Gamepad aim shows an aim indicator instead of the mouse crosshair; rumble fires on hits, damage and boss events (toggleable)
  5. A controller test screen shows live inputs for troubleshooting
**Plans**: TBD

### Phase 05.3: Adaptive Indian classical score (INSERTED)
**Goal**: Music rooted in Indian classical forms — raga-based melody over tanpura drone and tala-driven percussion — that intensifies with combat and bosses to build a thrilling atmosphere.
**Depends on**: Phase 5
**Success Criteria** (what must be TRUE):
  1. Each biome has its own raga/tala identity with drone, melodic and percussion layers
  2. Music intensity adapts to game state (explore/cleared, combat, low HP, boss, boss phase 2) with smooth transitions
  3. Hub and boon/menu screens have calmer themes
  4. Music respects the Phase 5 music volume setting, and all sources are license-clean for commercial release
**Plans**: TBD

### Phase 05.4: Epic-inspired environment art upgrade (INSERTED)
**Goal**: Hades-style, richly detailed arenas inspired by the Mahabharata and Ramayana — architecture, props and lighting that fill the larger arenas while keeping combat readable.
**Depends on**: Phase 05.1 (arena size)
**Success Criteria** (what must be TRUE):
  1. Each of the 4 biomes has detailed floor art sized for the larger arenas plus architectural borders (walls, pillars, arches) framing the play space
  2. Biome-specific props and set dressing drawn from the epics (e.g. Kurukshetra chariots and banners, naga palaces of Patala, the Vaitarani river crossing)
  3. Obstacles and hazards are visually integrated with the environment art
  4. Player, enemies and telegraphs remain readable on every biome; provenance recorded for every new asset
**Plans**: TBD

### Phase 05.5: God portraits and boon dialogue (INSERTED)
**Goal**: Each boon-granting god appears with a reverent, illustrated portrait and speaks to Abhimanyu with contextual dialogue when offering boons.
**Depends on**: Phase 5
**Success Criteria** (what must be TRUE):
  1. All 6 gods (Hanuman, Agni, Indra, Vayu, Krishna, Durga) have illustrated portraits true to traditional iconography, shown on the boon screen
  2. Gods deliver contextual lines (first meeting, repeat, low HP, after bosses, duo boons, deaths) that never repeat back-to-back
  3. Portraits and dialogue pass a reverence check — gods as wise, powerful allies, consistent with the epics
  4. Provenance recorded for every portrait; dialogue is data-driven
**Plans**: TBD

### Phase 05.6: Graphics polish: lighting, bloom and sprite quality (INSERTED)
**Goal**: A final visual pass — dynamic lighting, bloom, color grading and higher-fidelity character sprites — so the game reads as a polished commercial title.
**Depends on**: Phase 05.4, Phase 05.5
**Success Criteria** (what must be TRUE):
  1. Light sources (fire, astra casts, hazards, boons) glow and light their surroundings; bloom and per-biome color grading are applied
  2. Character sprites are sharper and more detailed at game scale (higher-res source, clean outlines)
  3. Graphics quality settings let lower-end machines disable expensive effects
  4. Frame rate holds at target in worst-case combat on the dev machine
**Plans**: TBD

### Phase 05.7: Cultural and iconography corrections (INSERTED)
**Goal**: Honor the "gods are allies only" rule and correct iconography flagged in review — Yama's fight is reframed as a Trial of Dharma with traditional Yama iconography, and flagged boss, portrait and environment art is regenerated.
**Depends on**: Phase 05.4 (art GPU serialization), Phase 05.5
**Requirements**: CULT-01, CULT-02, CULT-03, CULT-04
**Success Criteria** (what must be TRUE):
  1. CULT-01: Yama's encounter is framed as a trial/judgment in all player-facing text (boss label "THE TRIAL", intro, defeat/victory copy, god dialogue) — no hostile/enemy framing of a deity
  2. CULT-02: Yama's boss sprite (idle + phase 2) shows traditional iconography (dark/green-hued skin, danda + pasha, buffalo motif, dignified) and does not read as Vishnu/Krishna
  3. CULT-03: Kumbhakarna carries a club/mace (no trident); Agni portrait has no Vaishnava tilak; Indra holds a classic double-ended vajra
  4. CULT-04: Naraka gate reads as an Indian torana/temple gateway and the vent-grate hazard skin as a carved stone/iron vent (no Gothic/modern forms)
  5. Provenance recorded for every regenerated asset; smoke + check-provenance green
**Plans**: 4 plans (2 gap closure)
- [x] 05.7-01-PLAN.md — Trial of Dharma text reframe + reverence lint (CULT-01)
- [x] 05.7-02-PLAN.md — Flux regeneration: Yama, Kumbhakarna, Agni, Naraka gate/vent, Ranabhoomi props (CULT-02/03/04; Indra NOT SHIPPED)
- [ ] 05.7-03-PLAN.md — Gap closure: Indra classic vajra via Flux masked garment repair + code-drawn vajra overlay (CULT-03)
- [ ] 05.7-04-PLAN.md — Gap closure: Yama blunt buffalo-horn danda finial + beads; sheets, disclosure, REQUIREMENTS consistency (CULT-02, CULT-03)

### Phase 05.7.1: Hades-style combat depth: smarter enemies, player kit, difficulty curve, boss variety, tighter arenas (INSERTED)

**Goal:** Combat feels fast, exciting, dangerous and unpredictable like Hades. Smarter and more varied enemies, mini-bosses, distinct projectiles and hit effects, a deeper player kit, a steeper difficulty curve and varied bosses replace today's easy, samey fights. A closer camera raises immersion. Source: user playtests 2026-11-07 (rounds 1 and 2).
**Requirements**: TBD (derive in discuss-phase)
**Depends on:** Phase 05.7
**Success Criteria** (what must be TRUE):
  1. Pace: faster player and enemy tempo, shorter downtime between waves and quicker room clears, so the game feels fast-paced and exciting
  2. Camera: zoomed in closer than today (05.1 scrolling camera) for immersion. Threats are still visible in time (off-screen indicators or look-ahead where needed), and every arena size still frames correctly
  3. Smarter, more varied enemies: more enemy types per biome, flanking and surrounding, mixed melee and ranged roles, varied attack timing within readable telegraphs, and elites with modifiers
  4. Mini-bosses: at least one per biome (asura/rakshasa only), with their own movesets and telegraphs, appearing as special rooms or elite encounters
  5. Projectile and hit variety: enemy attacks look and behave distinctly (stun, large or slow orbs, fast needles, piercing beams, homing, splitting, ground AoE, knockback, DoT/burn, slow), each with its own visual identity and a clear status-effect read on the player
  6. Player kit depth: a dash-strike, attack combos with cancels, a meaningful special/cast, and improved hit feel
  7. Difficulty: higher pressure and damage, mixed wave compositions, plus an opt-in Heat-style difficulty modifier system. Base difficulty is noticeably harder than today
  8. Boss variety: boss move order is randomized within each phase, there are new patterns and fewer permanent safe spots, and every attack keeps a fair telegraph (Phase 4 invariant)
  9. Gods remain allies only; `node test/smoke.js` stays green, with new headless balance/AI tests
**Plans**: 12 plans (11 waves; wave 7 runs 07 + 12 (art) in parallel; 08 runs after 07; 11 has a human playtest checkpoint)
- [ ] 05.7.1-01-PLAN.md — Foundation: COMBAT-01..19 registered, seeded U, test harness + combat suite, bot balance sim + pre-tuning baseline, shared telegraph renderer (sprite-path fix)
- [ ] 05.7.1-02-PLAN.md — Player statuses (STATUS, hit-landed contract, DoT, stun DR) + data-driven projectile families (PROJ, cap, pattern planner)
- [ ] 05.7.1-03-PLAN.md — Player kit: dash-strike, dash-cancel, hold/charged variants, finishers, lodged-astra cast, faster tempo, pad parity
- [ ] 05.7.1-04-PLAN.md — Enemy AI: slots, attack tokens, range bands, view-band firing, ENEMY_TG telegraph invariant for the existing 8
- [ ] 05.7.1-05-PLAN.md — Elite modifiers + working elite budget; 8 new signature enemies (2 per biome)
- [ ] 05.7.1-06-PLAN.md — 4 mini-bosses (MiniBoss extends Boss, pattern moves, enrage) + room/door/reward flow; 4/5/5/3 biome rooms
- [ ] 05.7.1-07-PLAN.md — Boss variety: no-repeat weighted picks, distance bands, anti-camp, chains; +2 moves per boss
- [ ] 05.7.1-08-PLAN.md — Camera: 1.3x base + context zoom, threat/astra indicators, rewritten rest-identity tests, readability re-check
- [ ] 05.7.1-09-PLAN.md — Vows of Tapas (Heat) gameplay: DATA.HEAT, HEAT module, META persistence, all 12 vows wired into runs, Punya scaling + best Heat
- [ ] 05.7.1-10-PLAN.md — Vows of Tapas hub panel with pad navigation; F4 god mode gated to dev builds
- [ ] 05.7.1-11-PLAN.md — Balance pass via the sim (bands vs baseline), perf check, human playtest checkpoint
- [ ] 05.7.1-12-PLAN.md — Art: 8 enemy + 4 mini-boss sprites in the 1+5 direction via Flux, provenance (no gameplay dependents)

### Phase 05.7.2: Thrilling adaptive combat and boss theme (procedural score upgrade) (INSERTED)

**Goal:** A high-tempo, unmistakably Indian score in the spirit of Hades' music, with its own musical identity per biome, combat and boss state, made more dynamic and more Indian. It stays procedural and license-clean. Source: user playtests 2026-11-07.
**Requirements**: TBD (derive in discuss-phase)
**Depends on:** Phase 05.3 (procedural score; the 2026-11-07 ConvolverNode fix d2e0f4b makes it audible). Can run in parallel with 05.7.1
**Success Criteria** (what must be TRUE):
  1. Each biome has its own distinct theme (raga, tala, instrumentation, groove), each phase or state (explore, combat, elite/mini-boss, boss phase 1/2, hub, boon) has distinct music, and tempo stays high in combat
  2. Hades-inspired energy, Indian voice: a driving rhythm section (dhol, tabla, pakhawaj, mridangam, nagada), strong melodic hooks (bansuri, shehnai, sitar, sarangi, veena-like leads), riffs and builds with drops on wave start, elite spawns and room clear
  3. Bosses get a more intense theme that escalates in phase 2
  4. It stays adaptive: it follows the INTENSITY levels and crossfades smoothly between states
  5. It stays fully procedural and license-clean, respects the music volume setting, and has no frame-rate cost in worst-case combat
  6. `node test/smoke.js` stays green, with headless tests for the new generators

### Phase 05.7.3: Room shape and size variety (INSERTED)

**Goal:** No two rooms feel like the same rectangular box. Arenas use varied boundary shapes and sizes while keeping each biome's theme. Source: user playtest 2026-11-07.
**Requirements**: TBD (derive in discuss-phase)
**Depends on:** Phase 05.7.1 (camera zoom and pacing settle first)
**Success Criteria** (what must be TRUE):
  1. Non-rectangular arena boundaries: L, T and cross shapes, circular or octagonal rings, multi-chamber rooms joined by corridors, irregular cave or riverbank edges, islands across water or pits. Each biome has its own shape set
  2. Room sizes vary per encounter (small duel rooms up to large set-piece arenas), tuned to the encounter type
  3. Collision, enemy spawning and pathing, hazards, doors and the scrolling camera all work with arbitrary room polygons
  4. The env renderer (05.4) dresses arbitrary boundaries (walls, edges, props) and the 05.4-05 readability limits still pass
  5. `node test/smoke.js` stays green, with headless tests covering every room template

### Phase 05.7.4: Art direction refresh (vibrant backgrounds) (INSERTED)

**Goal:** Backgrounds and arenas look vibrant and striking. Several art-direction options are explored on the real game first, the user picks one, and the environment art is updated to match. Source: user playtest 2026-11-07.
**Requirements**: TBD (derive in discuss-phase)
**Depends on:** Phase 05.7.3 (art must dress the new room shapes); the style exploration can run earlier
**Success Criteria** (what must be TRUE):
  1. A style exploration board shows the same Naraka (and ideally Patala) arena in 4-6 candidate art directions, with cost and feasibility notes for each, and the user chooses one
  2. Environment backgrounds use more vibrant colour and stronger visual identity per biome in the chosen direction, while the 05.4-05 readability limits for combat still hold (floor contrast, telegraphs, characters readable)
  3. Characters, bosses and portraits stay coherent with the chosen direction (restyled, or confirmed compatible)
  4. Provenance is recorded for every new asset; smoke and check-provenance stay green

### Phase 6: Steam Integration
**Goal**: The desktop build talks to Steam — achievements unlock and persist, saves sync via Steam Cloud across machines, and the overlay is validated on both Windows and macOS.
**Depends on**: Phase 5
**Requirements**: STEAM-01, STEAM-02, STEAM-03, STEAM-04
**Success Criteria** (what must be TRUE):
  1. Steamworks initializes in the Electron main process and exposes achievements/cloud to the renderer via a secure bridge
  2. Players can unlock 15+ achievements (covering weapons, biomes, bosses, meta) that persist across restarts
  3. Save files sync across machines via Steam Cloud and restore correctly
  4. The Steam overlay opens in the Steam-launched build on Windows, and the macOS overlay is validated (or the FFI fallback decision is made)
**Plans**: TBD

### Phase 7: CI/CD + Store Submission + Cultural Review
**Goal**: The game is launch-ready — tagged commits produce signed/notarized binaries automatically, the store page has its assets, telemetry is wired, and the AI disclosure plus cultural sign-off gate the public launch.
**Depends on**: Phase 6
**Requirements**: STEAM-05, QA-01, QA-02, QA-03, QA-05
**Success Criteria** (what must be TRUE):
  1. Pushing a git tag produces signed Windows + macOS binaries via GitHub Actions automatically
  2. The Steam store page has capsule art, 6+ screenshots, and store/short descriptions ready
  3. 2-3 cultural reviewers sign off on art and narrative tone BEFORE the store page goes live (hard gate). Carried in from 05.7 (must be resolved or signed off here): Indra portrait vajra (CULT-03; rejected candidate `_raw/gods/indra/indra-0573-candidate-s71270-REJECTED.png`), Yama danda head (CULT-02; trishula-like silhouette, rejected candidate `_raw/bosses/yama/yama-0574-candidate-s52360-REJECTED.png`), Yama rudraksha beads, Naraka gate torii-like crossbeam, vent plus-glow, small Ranabhoomi diya
  4. Anonymous opt-in telemetry records weapon, biome reached, boons taken, and run time on run end
  5. The Steam Deck Verified checklist passes (controller-complete, correct glyphs, ≥9px font at 1280×800, functional default framerate)
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order. After Phase 1, the rendering track (2 → 3 → 4) and packaging track (5 → 6 → 7) are genuinely parallel — the desktop shell wraps the browser build and does not depend on sprites/VFX.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Render Abstraction Seam | 1/1 | Complete   | 2026-06-19 |
| 2. Asset Pipeline + Sprite System | 9/9 active (2 superseded) | Complete (art provisional — human review pending) | 2026-09-26 |
| 3. VFX + Combat Juice | 3/3 | Complete | 2026-09-25 |
| 4. Gameplay Depth | 4/4 | Complete | 2026-09-26 |
| 5. Desktop Wrapper + Gamepad + Settings | 3/3 | Complete | 2026-09-25 |
| 6. Steam Integration | 0/TBD | Not started | - |
| 7. CI/CD + Store Submission + Cultural Review | 0/TBD | Not started | - |
