---
phase: 2
slug: asset-pipeline-sprite-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Custom Node smoke harness (`test/smoke.js`) — `vm.runInContext` sandbox; no jest/vitest |
| **Config file** | none — single self-contained script |
| **Quick run command** | `node test/smoke.js` |
| **Full suite command** | `node test/smoke.js` (same — it is the whole suite) |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node test/smoke.js`
- **After every plan wave:** Run `node test/smoke.js`
- **Before `/gsd:verify-work`:** `node test/smoke.js` green + human art review + provenance-completeness check green

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-W0-01 | Wave 0 | 0 | RENDER-02 | smoke | `node test/smoke.js` | ❌ Wave 0 — add `'sprites.js'` to files list | ⬜ pending |
| 02-W0-02 | Wave 0 | 0 | RENDER-03 | unit-ish | `node test/smoke.js` | ❌ Wave 0 — add animation-frame grouping assertion | ⬜ pending |
| 02-W0-03 | Wave 0 | 0 | ART-06 | unit | `node test/smoke.js` | ❌ Wave 0 — add provenance-completeness check | ⬜ pending |
| 02-W0-04 | Wave 0 | 0 | — | infra | `node test/smoke.js` | ❌ Wave 0 — create `package.json` with test script | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/smoke.js` — add `'sprites.js'` to the `files` array (after `renderer.js`, before `game.js`)
- [ ] `test/smoke.js` — add headless-guard assertion: `sprites.js` loads and `GAME.render()` runs without a live Pixi stage (guard must handle sandbox with `document` but no `navigator`/WebGL — Pitfall 3)
- [ ] `test/smoke.js` — add frame-grouping unit assertion for `SPRITES.createAnimatedSprite` / the animations injector (Pitfall 1)
- [ ] `test/smoke.js` (or `tools/`) — add provenance-completeness check: every `*-atlas.png` under `assets/sprites/` has a matching `PROVENANCE.json` entry (ART-06)
- [ ] `package.json` — create (none exists); add `pixi.js@8`, `free-tex-packer-core`, `sharp` as devDependencies; add `test` script: `node test/smoke.js`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Abhimanyu reference sheet visual quality, strong silhouette, Indian mythology motif | ART-01 | Art aesthetics + silhouette quality require human eyes | Review generated reference sheet before locking the ComfyUI workflow; reject if style is inconsistent |
| All 6+ enemy archetypes rendered as illustrated sprites | ART-02 | Art quality is not machine-verifiable | Run the game; inspect each enemy archetype renders as a sprite (not primitive) in at least one room |
| All 4 bosses + phase-2 variants render correctly | ART-03 | Art quality + visual consistency | Trigger each boss encounter; confirm base + variant sprite loads |
| Biome backgrounds/floors illustrated with correct motifs | ART-04 | Art quality | Enter each of the 4 biomes; confirm illustrated background loads |
| Boon cards, HUD, overlays use Indian visual motifs | ART-05 | Art quality + cultural accuracy | Navigate the boon selection screen and inspect overlay art |
| AI disclosure record is complete enough to fill the Steam survey | QA-04 | Survey submission is Phase 7; field structure is partner-gated | Review `assets/sprites/PROVENANCE.json` and `assets/sprites/AI-DISCLOSURE.md` draft |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s (smoke is ~2s)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
