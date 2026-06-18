# Phase 1: Render Abstraction Seam - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 01-render-abstraction-seam
**Areas discussed:** Module location, Camera API shape, Draw pass structure, HUD/UI pass treatment

---

## Module Location

| Option | Description | Selected |
|--------|-------------|----------|
| New js/renderer.js | Clean separation. smoke.js gains one line; ctxStub absorbs all canvas ops. | ✓ |
| Inline in game.js | Zero new files, smoke.js unchanged, but game.js grows past 800 lines. | |

**User's choice:** New `js/renderer.js`

| Option | Description | Selected |
|--------|-------------|----------|
| Let ctxStub absorb it | Add renderer.js to smoke.js file list; ctxStub no-ops all canvas ops. | ✓ |
| Guard with typeof document | Wrap init in environment check for true no-op in Node. | |

**User's choice:** Let ctxStub absorb it — add to smoke.js file list, no explicit guard.

---

## Camera API Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Begin/End pair | CAMERA.begin(ctx) / CAMERA.end(ctx) — directly replaces ctx.save/translate/restore. | ✓ |
| Callback/closure CAMERA.frame(ctx, fn) | Camera owns lifecycle; world draws inside callback. | |
| Property bag + explicit apply | Fine-grained but two separate concepts to maintain. | |

**User's choice:** Begin/End pair

| Option | Description | Selected |
|--------|-------------|----------|
| x, y, zoom, shake properties | Full set, neutral values in Phase 1; hooks for Phase 2/3. | ✓ |
| Just shake for now | Simpler but means re-work when scrolling/zoom lands. | |

**User's choice:** x, y, zoom, shake — initialized to neutral (0, 0, 1, 0)

| Option | Description | Selected |
|--------|-------------|----------|
| Stay on GAME, camera reads it | Zero change to update() logic. CAMERA.begin reads GAME.shake. | ✓ |
| Migrate to CAMERA.shake | Shake becomes camera property; update() must be changed. | |

**User's choice:** GAME.shake stays on GAME; camera reads it internally.

---

## Draw Pass Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Function segmentation | renderBackground, renderEntities, renderEffects, renderHUD as GAME methods. | ✓ |
| Pass system — addDrawable | Collect drawables per pass, flush in order. Good for z-sort but premature. | |
| Logical comments only | // --- PASS: entities --- inline. Zero structure, not actionable for agents. | |

**User's choice:** Function segmentation — 4 methods on GAME

| Option | Description | Selected |
|--------|-------------|----------|
| Stay in game.js | Pass methods access GAME state directly; renderer.js owns CAMERA only. | ✓ |
| Move to renderer.js | Requires passing large GAME state or circular dependency with globals. | |

**User's choice:** Pass functions stay on GAME; renderer.js owns only CAMERA.

---

## HUD / UI Pass Treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Fix it now — UI outside camera | renderHUD() called after CAMERA.end(ctx); HUD never shakes. | ✓ |
| Leave as-is, fix in Phase 2 | No change to current behavior; Phase 2 unentangles it. | |

**User's choice:** Fix now — renderHUD() moves outside camera transform

| Option | Description | Selected |
|--------|-------------|----------|
| Fold crosshair into renderHUD | renderHUD() becomes complete UI pass; no dangling draw. | ✓ |
| Keep crosshair separate | Crosshair stays as a final draw after renderHUD(). | |

**User's choice:** Fold crosshair into renderHUD() for a clean UI pass boundary.

---

## Claude's Discretion

- Internal implementation details of CAMERA.begin/end
- Exact placement of boss danger zones within renderBackground vs renderEffects
- Hub state early-return logic within renderBackground

## Deferred Ideas

None — discussion stayed within phase scope.
