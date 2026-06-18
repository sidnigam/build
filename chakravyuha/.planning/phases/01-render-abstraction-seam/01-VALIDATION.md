---
phase: 1
slug: render-abstraction-seam
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Custom smoke test (vanilla Node) |
| **Config file** | `test/smoke.js` |
| **Quick run command** | `node test/smoke.js` |
| **Full suite command** | `node test/smoke.js` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node test/smoke.js`
- **After every plan wave:** Run `node test/smoke.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | RENDER-01 | smoke | `node test/smoke.js` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | RENDER-01 | smoke | `node test/smoke.js` | ✅ | ⬜ pending |
| 1-01-03 | 01 | 1 | RENDER-01 | smoke | `node test/smoke.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

`node test/smoke.js` already provides headless render coverage via `ctxStub` Proxy. No new test infrastructure needed — RENDER-01 is verified by the smoke test staying green after the refactor.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| World renders pixel-identical to pre-refactor build | RENDER-01 | Visual regression requires eyeball check | Open index.html in browser, play a run, compare world drawing vs baseline — no position/color changes. HUD is intentionally stabilized (no shake) per D-10. |
| HUD does not shake during camera shake | RENDER-01 (D-10) | Visual-only; not captured by smoke stub | Trigger shake (take damage), verify health bar and boon icons are stable while world shakes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
