---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to execute
stopped_at: Completed 05.7.1-07-PLAN.md
last_updated: "2026-11-09T00:50:08.055Z"
last_activity: 2026-11-09
progress:
  total_phases: 18
  completed_phases: 11
  total_plans: 71
  completed_plans: 53
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-17)

**Core value:** Every death makes the next run feel different — god boons, weapon choice, and room layouts create builds players want to talk about.
**Current focus:** Phase 05.7.1 — hades-style-combat-depth-smarter-enemies-player-kit-difficulty-curve-boss-variety-tighter-arenas

## Current Position

Phase: 05.7.1 (hades-style-combat-depth-smarter-enemies-player-kit-difficulty-curve-boss-variety-tighter-arenas) — EXECUTING
Plan: 8 of 12

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 02 P01 | 5 | 3 tasks | 6 files |
| Phase 02 P03 | 25 | 3 tasks | 10 files |
| Phase 02 P02 | 35 | 3 tasks | 4 files |
| Phase 05.4 P05 | 55min | 2 tasks | 13 files |
| Phase 05.7 P02 | 8h | 4 tasks | 60 files |
| Phase 05.7.1 P01 | 29min | 3 tasks | 14 files |
| Phase 05.7.1 P02 | 15min | 2 tasks | 9 files |
| Phase 05.7.1 P03 | 17min | 3 tasks | 9 files |
| Phase 05.7.1 P04 | 14min | 2 tasks | 10 files |
| Phase 05.7.1 P05 | 20min | 3 tasks | 9 files |
| Phase 05.7.1 P06 | 14min | 2 tasks | 11 files |
| Phase 05.7.1 P07 | 13min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Gate-then-parallel structure — Phase 1 render seam gates everything; rendering track (2→3→4) and packaging track (5→6→7) run in parallel after.
- [Roadmap]: Save migration (PLAT-04) placed in the wrapper phase (5) before Steamworks, since Steam Auto-Cloud syncs files, not localStorage.
- [Roadmap]: Cultural review (QA-03) is a hard gate in Phase 7 before the store page goes live.
- [Phase 01-render-abstraction-seam]: CAMERA reads GAME.shake inside begin() at call time — no top-level GAME ref (D-06)
- [Phase 01-render-abstraction-seam]: HUD moved outside CAMERA.end() — steady during shake (D-10); crosshair folded into renderHUD (D-11)
- [Phase 01-render-abstraction-seam]: Danger zones kept in renderBackground under actors to preserve z-order (Open Question 2)
- [Phase 02]: PixiJS NOT added to npm — vendored as pixi.min.js script tag in Plan 02 to preserve no-module-system pattern
- [Phase 02]: Headless guard checks typeof navigator (not document) — smoke sandbox has document but no navigator per RESEARCH Pitfall 3
- [Phase 02]: groupFramesByAnimation is a pure function with no Pixi dependency — runs headless and tested directly in smoke
- [Phase 02]: pack-atlas.js duplicates groupFramesByAnimation locally — sprites.js is a browser global, not a CommonJS module; duplication is intentional to avoid import coupling
- [Phase 02]: PROVENANCE.json checkpoint_license null until Plan 04 commercial-license gate — ART-06 gate passes vacuously with 0 atlases, fails loudly on orphan atlas
- [Phase 02]: Bridge canvas at worldContainer z-index 0 — primitives form base layer below entity/fx containers for fallback fidelity
- [Phase 02]: CAMERA.begin() takes no ctx arg — worldContainer transform persists, end() is a no-op
- [Phase 02]: SPRITES.ready=false until first atlas loads — has(key) stays false until art files land in Plans 04-06
- [quick-260924-tka]: Sprite runtime hardened — idle fallback, r-based scale with feet anchor, facing flip, y-sort, per-frame mark-and-sweep, HUD on separate un-shaken bridge; game canvas no longer takes a 2D context.
- [05.7.4 style choice, 2026-11-08]: User picked style 1 (Hades-like painterly cel-shaded) + style 5 (Indian folk/miniature ornament) from the style board (698f13d). Direction: painterly rendering with miniature-art ornamental borders/motifs, a cooler and more vibrant per-biome palette (no red-on-red floors), and an ornamental border as the arena edge (pairs with 05.7.3 room shapes). Next: refinement round (hybrid, Naraka + Patala, palette variants).
- [Phase 05.4]: ENV per-frame rebuild bug fixed (clear() reset _roomKey/_plan); manifest grade now actually applies
- [Phase 05.4]: D-08b readability measured at GFX low AND medium; floor saturation controlled by grade.floorDesat (all tiers) + floorSat ColorMatrix (medium/high) + grade.floorWash
- [Phase 05.4]: Side gates drawn as rotated doorways in the west/east walls; skins carry a vis rect for occlusion/culling
- [Phase 05.7]: Indra vajra portrait NOT SHIPPED after 6/6 Flux failures; old portrait kept and flagged
- [Phase 05.7.1]: Balance bot uses grid-BFS navigation around GAME.pillars; baseline fixture captured at e39854c (khanda, zero meta, dt 1/60): full median biome 2, room 12.55 s, 85.5 dmg/min, 30/30 dead
- [Phase 05.7.1]: Telegraphs/marks/status overlays render through js/combat.js drawTelegraph/drawOverlays on both primitive and sprite paths
- [Phase 05.7.1]: Player.takeDamage returns true only on a landed hit; statuses (STATUS in js/combat.js) ride only on landed hits; DoT uses tickDamage (no i-frames); stun DR uses a status-local clock (P.st.clock)
- [Phase 05.7.1]: Enemy projectiles are data-driven (DATA.PROJECTILES + PROJ in js/combat.js); legacy 'bolt' keeps today's shape and no-source takeDamage call so the balance baseline stays bit-identical
- [Phase 05.7.1]: Player kit is data-driven (DATA.KIT + weapon dashStrike/charged/finisher); all kit damage goes through hitEnemy src 'attack' so attack boons apply; holding attack no longer auto-swings (charges after 0.28 s) - flag for plan-11 playtest
- [Phase 05.7.1]: Cast is a lodged-astra model: no regen; ammo invariant castCharges + lodged + in-flight <= castMax; returns on 8 s, room clear, boss defeat, room change (incl. in-flight) and defiance revive; balance --expect-baseline no longer applies from 05.7.1-03
- [Phase 05.7.1]: Enemy AI coordinated by ENEMY_AI (js/ai.js): attack tokens per category (melee 2/ranged 2/heavy 1/support 1/bite 4, +biome, Heat hook), slot rings with escape cut, ranged bands pulled inside a pure viewBand; tick() reclaims tokens from non-attacking/removed holders
- [Phase 05.7.1]: Enemy damage only via Enemy.hurtPlayer/fire behind windUp->armAttack (ENEMY_TG MIN melee/ranged .30, status .40, stun .50, beam .70, bite .20); chase/tank contact is a 0.2 s bite tell; spawn grace 0.45 s, engage delay 0.2-0.8 s
- [Phase 05.7.1]: Elites = any biome type at cost x DATA.WAVES.eliteMult (1.8) with eliteMods [1,1,2,2] DATA.ELITE_MODS; eliteShare is the tuning knob (naraka [.1,.35], patala [.15,.5], ranabhoomi [.25,.6], vaitarani [.35,.5])
- [Phase 05.7.1]: 8 new enemies (pishacha, kumbhipaka, nagaguard, mayavi, javelineer, bannerman, brahmarakshasa, jalarakshasa) on ENEMY_AI/ENEMY_TG; long shots from outside the view band get +0.3 s tell and e.longShot; def.band/longRange/slotBack/pack drive positioning and composition
- [Phase 05.7.1]: hitEnemy reduction order: submerged -> shield-guard arc -> elite shield -> elite armor; knockback via canKnock(e); buffs (rallied, bannerSpd) recomputed each ENEMY_AI.tick
- [Phase 05.7.1]: Mini-bosses = MiniBoss extends Boss (js/minibosses.js) over overridable Boss hooks (moveTable/moveDefBase/phaseAt/phaseTitle/custom*); generic def.pattern moves fire through PROJ.planPattern + guarded Boss.shoot; enrage at 40%
- [Phase 05.7.1]: Mini-boss lives on GAME.miniRef, never GAME.bossRef; fixed mid-biome room (miniRoom 3/3/3/2 of 4/5/5/3 rooms) behind a single miniboss door; reward +60 mudra and UI.offerBoon(undefined, {minRarity: 1})
- [Phase 05.7.1]: 05.7.2 hand-off: MUSIC.logic.snapshot excludes e.boss units, so a mini-boss room reads as calm until the score maps GAME.miniRef
- [Phase 05.7.1]: Boss move selection (BOSS_AI): strict no-repeat, distance bands close<220<=mid<480<=far (x2 in / x0.3 out), area moves x2 vs a camping player (3 s within 60 px or within 90 px of a wall); chains 1-3 (p1) / 2-3 (p2) with 0.28-0.38 / 0.20-0.28 s link rests; chase never continues a chain; opener resets the chain
- [Phase 05.7.1]: Heat hooks for plan 09: GAME.heat.chainBonus (extra chain links) and GAME.heat.restMul (chain-rest multiplier), inert while GAME.heat is undefined
- [Phase 05.7.1]: +2 pattern moves per boss: tataka thornVolley/rootSnare, ahiravana lampWisps/serpentRing, kumbhakarna boulderOrbs/drumStun (stun ring, no knock), yama pasha/scales (judgments, comments only, no new strings); phase 1 gets one, phase 2 both

### Roadmap Evolution

- Phase 5.7 inserted (2026-10-19, user decisions): Yama reframed as a Trial + iconography corrections (Yama, Kumbhakarna, Agni, Indra, Naraka gate/vent) via Flux.
- Phases 5.1–5.6 inserted after Phase 5 (2026-09-26, user playtest feedback): scrolling camera + larger arenas + denser waves; PS5 DualSense support; adaptive Indian classical score; epic-inspired environment art; god portraits + dialogue; graphics polish.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- [Cultural review QA-03, god portraits 2026-10-17]: all 6 shipped portraits are provisional. Flags: Agni wears a Vaishnava urdhva-pundra tilak (Vishnu/Krishna mark); Indra's vajra renders as a four-pointed cross rather than the classic double-ended vajra. Earlier SDXL attempts failed 6/6; FLUX.1-schnell (Apache-2.0, user-approved) + birefnet matte succeeded.

- [Polish backlog, 2026-09-27 screenshot review]: (a) RESOLVED by quick 260927-qze. (b) Fallback env north wall is a flat maroon band (resolved when 05.4 wall art lands). (c) Legacy biome bg shows tiling seams under TilingSprite (resolved by 05.4 seamless tiles). (d) Vaitarani rooms plan ~53 enemies from room 1 — tune after playtest. (f) Env art review (2026-10-17): Naraka gate reads Gothic/European rather than Indian (torana); Naraka vent_grate hazard skin reads like a modern hubcap; Naraka floor reads slightly like riveted metal; Patala venom pools very bright vs muted floor — tune in 05.4-05. Env manifests were silently falling back (PIXI spritesheet auto-detect) — fixed 1e3913a. (g) Flaky wall-clock perf asserts in the 05.3 music DSP smoke section (bankSpec job <50ms, bank <800ms) fail under CPU load (e.g. ComfyUI generating) — make load-tolerant (median of N / env multiplier). (e) RESOLVED by quick 260929-s6t (production bug in UI.offerAmrit/offerBoon fallbacks).

- [Cultural review]: yama-atlas.png (blue skin + golden crown) reads as Vishnu/Krishna iconography rather than Yama; kumbhakarna carries a trident-like staff (Shiva association). Both provisional — review before any public screenshots. Tataka regenerated to remove deity iconography.

- [Verification]: No browser/Electron GUI run has happened yet for any of the 2026-09-25/26 work (Pixi sprite path, VFX feel, settings panel, Electron launch, gamepad). All smoke tests are headless. A human play session is the next gate.

- [Phase 2]: AI art commercial-license + consistency tooling needs validation before mass generation.
- [QA-04]: QA-04 is marked complete but assets/sprites/AI-DISCLOSURE.md covers zero shipped assets and describes a ControlNet reference-sheet workflow (D-07) that was not actually used (idle frames were plain img2img from the locked reference). Revisit the disclosure before the Phase 7 store page.
- [Phase 2 / Design]: Yama as a boss may conflict with "gods are allies only" — needs a design/cultural decision (e.g. reframe as a trial). Phase 2 art depicts Yama as a dignified, stern judge-deity (never monstrous); see 02-CONTEXT-AMENDMENT.md D-15a.
- [Phase 6]: Steam overlay on macOS is a known-broken combo with steamworks.js; steamworks-ffi-node fallback is unverified on this build. Likely needs /gsd:research-phase.
- [Phase 7]: macOS hardened-runtime entitlements for Steamworks dylibs are undocumented; bake into CI early, not launch week. Likely needs /gsd:research-phase.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260924-tka | Harden sprite runtime and pack idle player atlas for in-game scale check | 2026-09-25 | 622f143 | Needs Review (browser check deferred by user) | [260924-tka-harden-sprite-runtime-and-pack-idle-play](./quick/260924-tka-harden-sprite-runtime-and-pack-idle-play/) |
| 260926-d5o | HUD motif pass and duo card style reconciliation | 2026-09-26 | 168d20d | Needs Review (visual) | [260926-d5o-hud-motif-pass-and-duo-card-style-reconc](./quick/260926-d5o-hud-motif-pass-and-duo-card-style-reconc/) |
| 260926-dcz | Arena readability polish: floor dimming, stone obstacles, HUD label fixes | 2026-09-26 | a5f516a | Verified (headless Chrome screenshot) | [260926-dcz-arena-readability-polish-floor-dimming-s](./quick/260926-dcz-arena-readability-polish-floor-dimming-s/) |
| 260926-djs | Character readability: ground rings and rim lift for sprites | 2026-09-26 | efc15f7 | Verified for player (headless Chrome); enemy/boss pending 02-11 art | [260926-djs-character-readability-ground-rings-and-r](./quick/260926-djs-character-readability-ground-rings-and-r/) |
| 260927-qze | Fix HUD glyph legend overlap | 2026-09-29 | 9b603f9 | Verified (headless Chrome, kbm/PS/Xbox) | [260927-qze-fix-hud-glyph-legend-overlap](./quick/260927-qze-fix-hud-glyph-legend-overlap/) |
| 260929-s6t | Make god-dialogue smoke test deterministic (real bug: god dialogue left visible on amrit/all-owned fallback) | 2026-09-29 | 5195467 | Verified (30/30 runs) | [260929-s6t-make-god-dialogue-smoke-test-determinist](./quick/260929-s6t-make-god-dialogue-smoke-test-determinist/) |
| 261019-jdr | Fix desktop settings persistence (sanitizeName rejected dotted key) | 2026-10-19 | 45a4fa9 | Verified (unit table + smoke) | [261019-jdr-fix-desktop-settings-persistence-sanitiz](./quick/261019-jdr-fix-desktop-settings-persistence-sanitiz/) |
| 261019-nnu | Fix HiDPI sprite blur and excessive camera motion (user playtest report) | 2026-10-19 | c1ff488 | Verified (real-GPU Retina screenshot, 60 FPS) | [261019-nnu-fix-hidpi-sprite-blur-and-excessive-came](./quick/261019-nnu-fix-hidpi-sprite-blur-and-excessive-came/) |
| fast | Dev god-mode toggle on F4 for playtesting | 2026-11-07 | b8b46b5 | ✅ | — |

## Session Continuity

Last session: 2026-11-09T00:50:08.051Z
Last activity: 2026-11-09
Stopped at: Completed 05.7.1-07-PLAN.md
Resume file: None
