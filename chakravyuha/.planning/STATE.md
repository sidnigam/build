---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to execute
stopped_at: Completed 05.7-02-PLAN.md
last_updated: "2026-11-07T06:04:19.104Z"
last_activity: 2026-11-07
progress:
  total_phases: 14
  completed_phases: 11
  total_plans: 57
  completed_plans: 44
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-17)

**Core value:** Every death makes the next run feel different — god boons, weapon choice, and room layouts create builds players want to talk about.
**Current focus:** Phase 06 — steam-integration (planned; execution gated on G-1 playtest approval)

## Current Position

Phase: 06 (steam-integration) — 4 plans, not started. 05.7 complete with CULT-02/03 deferred to Phase 7 QA-03 (user decision 2026-11-07)
Plan: 0 of 4 — awaiting G-1 playtest-approved gate

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
- [Phase 05.4]: ENV per-frame rebuild bug fixed (clear() reset _roomKey/_plan); manifest grade now actually applies
- [Phase 05.4]: D-08b readability measured at GFX low AND medium; floor saturation controlled by grade.floorDesat (all tiers) + floorSat ColorMatrix (medium/high) + grade.floorWash
- [Phase 05.4]: Side gates drawn as rotated doorways in the west/east walls; skins carry a vis rect for occlusion/culling
- [Phase 05.7]: Indra vajra portrait NOT SHIPPED after 6/6 Flux failures; old portrait kept and flagged

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

## Session Continuity

Last session: 2026-11-07T06:04:19.100Z
Last activity: 2026-11-07
Stopped at: Completed 05.7-02-PLAN.md
Resume file: None
