# Chakravyuha — चक्रव्यूह

## What This Is

A commercial action roguelite for Steam set in Indian mythology. You play Abhimanyu, trapped in the Chakravyuha battle formation, fighting your way up through Yama's realm run by run. Built on a working HTML5/Canvas/vanilla JS MVP — this milestone upgrades it from a functional prototype to a polished, commercially releasable Steam title with stylized 2D art and significantly deeper gameplay.

## Core Value

Every death makes the next run feel different — the combination of god boons, weapon choice, and room layouts creates builds players want to talk about.

## Requirements

### Validated

- ✓ Working roguelite loop — 4 biomes (Naraka, Patala, Ranabhoomi, Vaitarani), 4 bosses, persistent meta — existing
- ✓ Three weapons — Khanda (sword), Gandiva (bow), Gada (mace) with distinct feel — existing
- ✓ Six gods — Hanuman, Krishna, Agni, Indra, Vayu, Durga with boon selection — existing
- ✓ Persistent progression — Path of Dharma meta upgrades via localStorage — existing
- ✓ Combat system — melee, charge attacks, special, astra, dash with i-frames — existing
- ✓ Save/load integrity — localStorage with tested round-trips — existing
- ✓ Audio system — synthesized SFX + tanpura drone via WebAudio — existing
- ✓ Smoke test suite — headless full-run simulation (node test/smoke.js) — existing
- ✓ Render abstraction seam — CAMERA global + 4 named draw passes (renderBackground/renderEntities/renderEffects/renderHUD); HUD outside camera transform; smoke green — Validated in Phase 01

### Active

**Visual Upgrade**
- [ ] Sprite system — replace canvas primitive rendering with sprite-based renderer (AI-generated assets)
- [ ] Character art — Abhimanyu player sprite with attack/dash/death animations
- [ ] Enemy sprites — each enemy archetype has a distinct illustrated sprite sheet
- [ ] Boss art — all 4 bosses have large, multi-frame illustrated sprites with phase variants
- [ ] Environmental art — biome-specific backgrounds, floor tiles, and decorative elements per biome
- [ ] UI polish — styled overlays, boon card art, HUD elements with Indian design motifs
- [ ] VFX system — particle effects for hits, astra casts, dash trails, and environmental ambiance

**Gameplay Depth**
- [ ] Combat juice — hit sparks, screen shake, camera zoom on kills, impact sounds, freeze frames
- [ ] Room variety — at least 3 distinct layout templates per biome + environmental hazards per biome
- [ ] Boon depth — minimum 4 boons per god (24 total), at least 3 named synergy combos (Duo Boons)
- [ ] Boss encounters — each boss has 2+ phases, clearly telegraphed attack patterns, phase transition cinematics

**Steam Release**
- [ ] Desktop build — Electron or Tauri wrapper producing Windows + macOS binaries
- [ ] Gamepad support — full controller input (required for Steam Deck + roguelite audience)
- [ ] Settings menu — resolution, fullscreen, volume, rebind controls, accessibility options
- [ ] Steam integration — Steamworks SDK: achievements (15+), cloud saves, overlay
- [ ] Steam page assets — capsule art, screenshots (6+), store description, trailer

**Quality & Distribution**
- [ ] CI/CD pipeline — GitHub Actions builds desktop binaries on every tag
- [ ] Analytics — anonymous opt-in telemetry (weapon, biome reached, boons taken, run time)
- [ ] Cultural review — 2-3 reviewers verify mythological accuracy and tone before release

### Out of Scope

- Nintendo Switch (this milestone) — requires separate Nintendo dev license + native port; plan after Steam ships
- Mobile (iOS/Android) — different control paradigm; defer post-Steam
- Multiplayer — co-op or PvP requires significant architecture changes; not core to the roguelite loop
- Full engine migration (Godot/Unity) — JS stays for Steam; engine decision revisited before Switch port
- Linux Steam build — low priority for initial release; add if wishlist demand warrants it
- Procedurally generated room layouts — hand-crafted layout variety is faster to ship and easier to balance

## Context

- **Codebase:** Pure vanilla JS + HTML5 Canvas, ~8 files, no build step, no external dependencies. All game data lives in `data.js`. Balance is entirely data-driven — easy to modify without touching engine code.
- **Existing plan:** `PLAN.md` in repo root covers testing, marketing, and platform strategy — use as reference input for requirements, not as the roadmap.
- **Art production:** AI-generated 2D art (Midjourney/Stable Diffusion). Sprite sheets will need post-processing (cleanup, animation frame extraction) before integration.
- **Smoke tests:** `test/smoke.js` simulates complete runs headlessly — must stay green throughout all phases.
- **Hades/Dead Cells visual target:** Stylized illustrated look with strong silhouettes, not pixel art.

## Constraints

- **Tech stack:** Vanilla JS stays — no framework migration this milestone
- **Art tooling:** AI-generated assets only — no commissioned art budget
- **Platform:** Steam (Windows + macOS) as primary target; Switch deferred
- **Tests must pass:** `node test/smoke.js` must remain green after every phase
- **Mythological reverence:** Gods are allies only, never enemies; asuras/rakshasas oppose the player — this line must not be crossed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stay in vanilla JS for Steam | Faster path to ship; avoids engine migration risk; Switch port can be a separate project | — Pending |
| AI-generated art | No art budget; AI tools can produce Hades-adjacent illustrated style at viable quality | — Pending |
| Electron/Tauri for desktop build | Wraps existing HTML5 game with minimal code changes | — Pending |
| Commercial release ($5–15) | Project quality and uniqueness of IP justifies paid release | — Pending |
| HUD outside camera transform (D-10) | HUD no longer shakes with the world — intentional UX improvement; eliminates visual noise during shake | — Validated in Phase 01 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-19 — Phase 01 complete (render abstraction seam)*
