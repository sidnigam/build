# Phase 1: Render Abstraction Seam - Research

**Researched:** 2026-06-17
**Domain:** Vanilla JS Canvas 2D rendering refactor (structural seam, zero behavior change)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Create a new `js/renderer.js` file that exports the `CAMERA` global object. Do NOT inline the camera into `game.js`.
- **D-02:** Add `renderer.js` to `smoke.js`'s file list (between `utils.js` and `game.js`). The existing `ctxStub` Proxy absorbs all canvas ops — no `typeof document` guard needed in `renderer.js`.
- **D-03:** Load order in `index.html`: `renderer.js` must load before `game.js` so `CAMERA` is available when `GAME` initializes.
- **D-04:** Camera uses a **begin/end pair**: `CAMERA.begin(ctx)` saves state + applies transforms; `CAMERA.end(ctx)` restores state.
- **D-05:** `CAMERA` exposes four properties: `x`, `y`, `zoom`, `shake`. Initialize all to neutral (`x:0, y:0, zoom:1, shake:0`) in Phase 1 — hooks for Phase 2 (scrolling) and Phase 3 (kill-zoom).
- **D-06:** Shake stays on `GAME.shake`. `CAMERA.begin(ctx)` reads `GAME.shake` to apply the translate. `update()` and shake decay logic are **not touched**.
- **D-07:** `CAMERA.begin(ctx)` applies transforms in order: `ctx.save()` → `translate(CAMERA.x, CAMERA.y)` → `scale(CAMERA.zoom, CAMERA.zoom)` → `translate(rand(-GAME.shake, GAME.shake)*0.5, rand(-GAME.shake, GAME.shake)*0.5)` (only when `GAME.shake > 0.5`).
- **D-08:** Split `GAME.render()` into **4 named pass methods on GAME**: `renderBackground(ctx)`, `renderEntities(ctx)`, `renderEffects(ctx)`, `renderHUD(ctx)` (existing).
- **D-09:** `renderer.js` owns **only** `CAMERA`. Pass functions stay on `GAME`.
- **D-10:** `renderHUD()` is called **after** `CAMERA.end(ctx)` — outside the camera save/restore block.
- **D-11:** The crosshair is **folded into `renderHUD()`**. After this change `renderHUD()` is the complete, self-contained UI pass.

### Claude's Discretion
- Internal implementation of `CAMERA.begin`/`CAMERA.end` (whether `CAMERA.shake` mirrors `GAME.shake` internally or reads it directly).
- Exact split boundary between `renderBackground` and `renderEffects` for items like danger zones — place where visually correct.
- Whether `renderBackground` returns early for hub state or defers to a `renderHubBg` internal call — match current behavior exactly.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RENDER-01 | Render abstraction layer with camera system and named draw passes (background, entities, effects, UI) — no visual change, smoke tests stay green | Verified the exact existing `render()` structure (game.js:332-547), confirmed `e.draw(ctx)`/`player.draw(ctx)` signatures (entities.js:436/665/937), confirmed smoke test currently passes and ctxStub absorbs all canvas ops. The four CONTEXT-locked passes map cleanly onto the existing draw order. The only fidelity risk (HUD-was-inside-shake) is documented below with the exact resolution. |
</phase_requirements>

## Summary

This is a **pure structural refactor** with zero intended behavior change. Every implementation decision is already locked in CONTEXT.md — the research job is to verify that the locked decisions match the actual code and to surface any pixel-fidelity traps hidden in the existing `render()` before the planner writes tasks.

The existing `GAME.render()` (game.js lines 332-547) is one monolith wrapped in a single `ctx.save()` (line 337) / `ctx.restore()` (line 535) pair, with shake applied right after the save and the crosshair drawn *after* the restore. The locked plan slices this into `CAMERA.begin/end` plus four named pass methods. The draw order in the existing monolith maps cleanly onto the four passes, and all three entity `draw(ctx)` methods (Player, Enemy, Boss) already take a single `ctx` argument so they need no changes.

**One real fidelity trap exists and must be handled exactly** (detailed in Common Pitfalls): in the *current* code, `renderHUD()` is called at line 534 — **inside** the save/restore block, i.e. it is currently subject to the shake translate. The locked decision D-10 moves it **outside** the camera block. This is an intentional, correct architecture change (HUD should not shake), but it means the output is **not** byte-identical when `GAME.shake > 0.5` — the HUD will stop jittering. The planner must treat "pixel-identical" as "pixel-identical for world content + intentionally-stabilized HUD," and the verification step must account for it.

**Primary recommendation:** Implement exactly per D-01 through D-11. Extract `CAMERA` into `renderer.js`, slice `render()` into the four passes preserving the existing top-to-bottom draw order, move `renderHUD` + crosshair outside the camera block, add `renderer.js` to both `index.html` (before game.js) and `smoke.js` (between utils.js and game.js). Verify with `node test/smoke.js` plus a manual visual A/B against the pre-refactor build.

## Standard Stack

No new libraries. This phase adds zero dependencies — it is a refactor of existing vanilla JS.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none) | — | Pure vanilla JS / Canvas 2D refactor | CLAUDE.md mandates "Vanilla JS stays — no framework migration this milestone." PixiJS migration is Phase 2+, explicitly out of scope here. |

**Installation:** None.

## Architecture Patterns

### Existing Project Conventions (verified from source)
- **Global singletons, no module system.** `GAME`, `DATA`, `META`, `AUDIO`, `UI`, `U`, `INPUT` are all bare `const` globals declared at file top with `'use strict'`. `CAMERA` follows this exact pattern (D-05/D-09).
- **Script-tag load order is the dependency graph.** `index.html` loads scripts in sequence (utils → audio → data → meta → entities → rooms → ui → game). `smoke.js` mirrors this list (line 83) and runs each file via `vm.runInContext` in the same shared sandbox. Both lists must be updated (D-02, D-03).
- **`ctx.save()`/`ctx.restore()` nesting is already used internally** (e.g. orbits at game.js:449/459, projectiles at 466/474, dash pips at 603/607). `CAMERA.begin/end` mirrors this outer pair directly.
- **All entity rendering is polymorphic single-arg `draw(ctx)`.** Player (entities.js:436), Enemy (665), and Boss extends Enemy (734, draw at 937) all take only `ctx`. `renderEntities` calls `e.draw(ctx)` and `player.draw(ctx)` unchanged.

### Recommended File Layout
```
js/
├── utils.js       # U global (rand, TAU, clamp, lerp) — unchanged
├── renderer.js    # NEW: CAMERA global only (begin/end + x,y,zoom,shake)
├── game.js        # GAME.render() sliced into 4 pass methods
└── entities.js    # draw(ctx) methods unchanged
```

### Pattern: begin/end transform bracket (the seam)
**What:** A camera object that brackets all world drawing in a save/transform/restore pair, leaving the HUD pass outside.
**When to use:** This phase — it is the literal deliverable.
**Resulting render() sequence (from CONTEXT D, authoritative):**
```js
render() {
  const ctx = this.ctx;
  const inRun = this.state !== 'hub';

  CAMERA.begin(ctx);
  this.renderBackground(ctx);   // bg, floor, mandala, walls, zones, pillars, doors, pickups, hub bg
  if (inRun) {
    this.renderEntities(ctx);   // enemies (e.draw), player (player.draw)
    this.renderEffects(ctx);    // orbits, projectiles, bolts, rings, particles, damage texts
  }
  CAMERA.end(ctx);
  this.renderHUD(ctx);          // UI pass — OUTSIDE camera transform; includes crosshair (D-11)
}
```

### Mapping the existing monolith onto the 4 passes (exact line ranges, verified)
| Pass | Source lines in current `render()` | Notes |
|------|-----------------------------------|-------|
| (camera begin) | 337 `ctx.save()` + 339 shake translate | becomes `CAMERA.begin(ctx)` (D-07) |
| `renderBackground` | 342-440: bg fill (342-343), hub-bg branch (345), floor (348-349), mandala (352-364), walls (367-372), danger zones (375-381), zones (384-399), pillars (402-409), doors (412-432), pickups (435-440) | **hub branch (line 345) must early-return here** — see hub trap below |
| `renderEntities` | 443-444: enemies `e.draw(ctx)`, player `player.draw(ctx)` | unchanged signatures |
| `renderEffects` | 447-532: orbits (447-460), pprojectiles (463-485), eprojectiles (486-491), bolts (494-506), rings (509-515), particles (518-523), damage texts (526-532) | discretion D: danger zones at 375-381 may stay in background (visually correct there) |
| (camera end) | 535 `ctx.restore()` | becomes `CAMERA.end(ctx)` |
| `renderHUD` | 534 `renderHUD(ctx)` call + 537-546 crosshair | crosshair folds INTO renderHUD (D-11); call site moves AFTER `CAMERA.end` (D-10) |

### Anti-Patterns to Avoid
- **Adding a `typeof document` / headless guard to renderer.js.** D-02 is explicit: the smoke `ctxStub` Proxy (smoke.js:40-49) no-ops every canvas method, so `CAMERA.begin/end` run harmlessly headless. A guard is dead code and contradicts the locked decision.
- **Passing GAME state bundles into renderer.js.** D-09 keeps pass methods on `GAME` precisely so they read `this.enemies`, `this.particles`, etc. directly. Do not move pass logic into renderer.js.
- **"Optimizing" the draw order while refactoring.** Any reorder changes z-order / overdraw and breaks pixel fidelity. Preserve the exact top-to-bottom sequence.
- **Touching `update()` or shake decay** (game.js:160 `this.shake = Math.max(0, this.shake - dt*60)`). D-06 forbids it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shake RNG offset | A new random function | Existing `U.rand(a,b)` (utils.js:12) | The current shake at line 339 already uses `U.rand` — matching it guarantees identical jitter distribution. |
| Headless canvas no-op | A mock context in renderer.js | Existing `ctxStub` Proxy in smoke.js | Already handles `createRadialGradient`, `measureText`, and arbitrary method calls via Proxy get-trap. |
| Save/restore bracket | Manual transform tracking | Native `ctx.save()`/`ctx.restore()` | Canvas state stack already correctly nests everywhere in this codebase. |

**Key insight:** Everything this phase needs already exists in the codebase. The phase is reorganization, not construction.

## Common Pitfalls

### Pitfall 1: HUD currently shakes — moving it out changes shake-frame output (THE key trap)
**What goes wrong:** In the current code, `renderHUD(ctx)` is at line 534, **before** `ctx.restore()` at 535 — so the entire HUD is drawn inside the shake translate and currently jitters when `GAME.shake > 0.5` (e.g. on hits, defiance revive which sets shake=14). D-10 moves `renderHUD` **after** `CAMERA.end`. After the refactor the HUD will be rock-steady during shake.
**Why it happens:** "Pixel-identical" naively read means byte-identical; but the locked architecture intentionally stabilizes the HUD.
**How to avoid:** Treat the success criterion as "pixel-identical for **world** content; HUD intentionally no longer shakes (correct per D-10)." Document this in the verification step so a reviewer doing an A/B during a shake frame doesn't flag it as a regression. The crosshair (lines 537-546) was *already* outside the shake (drawn after restore), so folding it into the now-outside `renderHUD` preserves its behavior exactly.

### Pitfall 2: Hub state must early-return without entities/effects/HUD
**What goes wrong:** Current hub path (line 345) does `renderHubBg(ctx); ctx.restore(); return;` — it draws ONLY the background fill (342-343) + hub mandala, then bails. It never draws entities, effects, HUD, or crosshair (cursor is `none` over menu panels). A naive refactor that always runs all four passes would draw a null-player HUD or crash.
**Why it happens:** The `if (!inRun)` early return is buried mid-monolith.
**How to avoid:** The CONTEXT render() sequence already guards entities/effects behind `if (inRun)`. `renderHUD` is internally safe — it early-returns on `if (!P) return;` (game.js:577) when there's no player (hub). For the background pass, follow discretion item: either early-return inside `renderBackground` for hub (calling `renderHubBg`) or branch — but must produce identical output: hub draws `#0b0710` fill + hub mandala only. Verify the hub still renders correctly (smoke test "boot: reaches hub" exercises the hub state but not its pixels).

### Pitfall 3: renderHUD's crosshair uses INPUT.mx/my in screen space
**What goes wrong:** The crosshair (537-546) reads `INPUT.mx`/`INPUT.my`, which are canvas-pixel coordinates (set in mousemove handler, lines 63-64). Because it was drawn *outside* the transform, those coords are screen-space. When folded into `renderHUD` (also outside the camera block per D-10), this stays correct. If it were ever drawn inside the camera transform it would be offset by zoom/shake.
**How to avoid:** Keep the crosshair draw in `renderHUD`, which is called after `CAMERA.end`. No coordinate transform needed. (Phase 2/3 note: once zoom≠1, anything drawn inside the camera block needs inverse-transform for mouse → world picking; not this phase.)

### Pitfall 4: Both file lists must be updated, or load fails
**What goes wrong:** `CAMERA` is referenced in `game.js`'s `render()`. If `renderer.js` is missing from `index.html` (D-03) the browser throws `CAMERA is not defined`; if missing from `smoke.js` line 83 the headless test throws the same. Forgetting one is the most likely mechanical mistake.
**How to avoid:** Update BOTH lists in the same task. `index.html`: add `<script src="js/renderer.js"></script>` before `js/game.js` (currently line 226). `smoke.js` line 83: insert `'renderer.js'` between `'utils.js'` and `'audio.js'` — note CONTEXT says "between utils.js and game.js," which the existing list satisfies by placing it right after `utils.js` (it must load before game.js and may load before/after the others since it only depends on `U.rand` from utils.js).

### Pitfall 5: renderer.js depends on U (utils) and reads GAME.shake
**What goes wrong:** `CAMERA.begin` uses `U.rand` (D-07) and reads `GAME.shake` (D-06). In `index.html`, utils.js (line 219) loads before any insertion point, so `U` is available. `GAME` is referenced only at *call time* (inside `begin`), not at *definition time*, so `renderer.js` loading before `game.js` (D-03) is fine — `GAME` exists by the time `render()` runs.
**How to avoid:** Ensure `renderer.js` loads after `utils.js` and before `game.js`. Do not reference `GAME` at the top level of renderer.js (only inside `begin`/`end` method bodies).

## Code Examples

### renderer.js skeleton (matches D-04 through D-07)
```js
// js/renderer.js — CAMERA global (Phase 1: neutral transforms, hooks for Phase 2/3)
'use strict';

const CAMERA = {
  x: 0, y: 0, zoom: 1, shake: 0,   // D-05 neutral init

  begin(ctx) {
    ctx.save();                                    // D-07 order
    ctx.translate(this.x, this.y);
    ctx.scale(this.zoom, this.zoom);
    if (GAME.shake > 0.5)                           // D-06: read GAME.shake
      ctx.translate(U.rand(-GAME.shake, GAME.shake) * 0.5,
                    U.rand(-GAME.shake, GAME.shake) * 0.5);
  },

  end(ctx) {
    ctx.restore();
  },
};
```
*Source: synthesized from CONTEXT.md D-04/05/06/07 + existing shake code at game.js:339 and U.rand at utils.js:12. HIGH confidence — verified against source.*

### Existing shake line being replaced (game.js:339, verified)
```js
// BEFORE (inside render, after ctx.save at line 337):
if (this.shake > 0.5) ctx.translate(U.rand(-this.shake, this.shake) * 0.5, U.rand(-this.shake, this.shake) * 0.5);
// AFTER: this logic moves verbatim into CAMERA.begin (reads GAME.shake instead of this.shake)
```

### smoke.js file list change (line 83, verified)
```js
// BEFORE:
const files = ['utils.js', 'audio.js', 'data.js', 'meta.js', 'entities.js', 'rooms.js', 'ui.js', 'game.js'];
// AFTER (renderer.js after utils.js, before game.js — satisfies D-02):
const files = ['utils.js', 'renderer.js', 'audio.js', 'data.js', 'meta.js', 'entities.js', 'rooms.js', 'ui.js', 'game.js'];
```

## State of the Art

Not applicable — no external technology choices in this phase. The renderer-of-record decision (Canvas2D vs PixiJS) is explicitly deferred to Phase 2 (see STATE.md blockers). This phase deliberately keeps Canvas 2D and only introduces the *seam* that makes a later renderer swap safe.

**Forward-compatibility note:** The `x`, `y`, `zoom`, `shake` properties on CAMERA are dead-but-wired in Phase 1 (all neutral). Phase 2 uses `x`/`y` for a scrolling camera; Phase 3 uses `zoom` for kill-zoom. Naming them now per D-05 means downstream phases only set values — they never touch the seam structure.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `node test/smoke.js` gate | ✓ (assumed — smoke test runs green) | — | — |

Smoke test verified passing at research time (`ALL SMOKE TESTS PASSED`, exit 0). No external tools, services, or new packages. Browser/Chromium not needed for the gate (smoke is headless via `vm`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Custom Node harness (no framework) — `test/smoke.js` using `vm` + DOM/canvas stubs |
| Config file | none — single self-contained script |
| Quick run command | `node test/smoke.js` |
| Full suite command | `node test/smoke.js` (it is the entire suite) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RENDER-01 | `GAME.render()` runs without error headless after refactor (all 4 passes + CAMERA begin/end) | smoke | `node test/smoke.js` | ✅ (render() called at smoke.js:167, 237) |
| RENDER-01 | renderer.js loads in headless path without error and `CAMERA` is defined | smoke | `node test/smoke.js` (after adding renderer.js to file list) | ✅ |
| RENDER-01 | No visual regression on world content; HUD intentionally stabilized | manual-only | Visual A/B: open `index.html` pre- and post-refactor, compare a run | ❌ manual (Canvas pixel output cannot be asserted via stub — ctxStub no-ops draws) |

**Manual-only justification:** The smoke `ctxStub` is a no-op Proxy — it proves `render()` *executes* without throwing, but cannot assert *pixel output*. Visual fidelity (success criterion #1) is inherently a human A/B check. The smoke test covers criterion #4 (green + headless render works); a human covers #1/#2/#3.

### Sampling Rate
- **Per task commit:** `node test/smoke.js`
- **Per wave merge:** `node test/smoke.js`
- **Phase gate:** `node test/smoke.js` green AND manual visual A/B confirms world content unchanged (HUD-no-longer-shakes is expected, not a regression).

### Wave 0 Gaps
- None — existing test infrastructure (`test/smoke.js`) already calls `GAME.render()` inside both simulated runs and covers all states (hub, combat, cleared, choosing, dead, victory). The only change needed is adding `'renderer.js'` to the file list (smoke.js:83), which is part of the implementation, not a missing test.

## Open Questions

1. **Does "pixel-identical" tolerate the HUD-stops-shaking change?**
   - What we know: D-10 intentionally moves HUD outside the shake; this is the correct architecture and was an explicit user decision.
   - What's unclear: Whether the planner's verification step should phrase success criterion #1 as "world pixel-identical, HUD intentionally stabilized."
   - Recommendation: Plan should explicitly note this in the verify step so a reviewer doing an A/B on a shake frame does not flag the steadier HUD as a regression. Everything else (non-shake frames, all world content) is genuinely pixel-identical.

2. **Where do boss-slam danger zones (game.js:375-381) belong — background or effects?**
   - What we know: Discretion item in CONTEXT; currently drawn early (before entities), so they sit *under* enemies/player.
   - What's unclear: Nothing functionally — it's a naming/placement choice.
   - Recommendation: Keep danger zones in `renderBackground` (they currently draw before entities at line 375, under the actors — moving them to effects would draw them *over* actors and change z-order/pixels). Preserving current order = preserving fidelity.

## Sources

### Primary (HIGH confidence)
- `js/game.js` lines 332-547 (`render()`), 549-566 (`renderHubBg`), 575-697 (`renderHUD`), 160 (shake decay) — read directly, the exact code being refactored.
- `js/entities.js` lines 132/436 (Player.draw), 499/665 (Enemy.draw), 734/937 (Boss.draw) — confirmed all `draw(ctx)` single-arg.
- `js/utils.js` line 12 (`U.rand`), line 6 (`U.TAU`) — shake offset utility.
- `test/smoke.js` lines 40-49 (ctxStub Proxy), 83 (file list), 167/237 (render call sites) — headless harness.
- `index.html` lines 219-226 (script load order).
- `node test/smoke.js` — executed, returns `ALL SMOKE TESTS PASSED` (exit 0) at research time.
- `CLAUDE.md` — "Vanilla JS stays — no framework migration this milestone"; "`node test/smoke.js` must remain green after every phase."
- `.planning/phases/01-render-abstraction-seam/01-CONTEXT.md` — all D-01..D-11 locked decisions.

### Secondary (MEDIUM confidence)
- None needed — this is an internal refactor; no web research applicable.

### Tertiary (LOW confidence)
- None.

## Project Constraints (from CLAUDE.md)
- **Vanilla JS only** — no framework/renderer migration this milestone. (This phase adds zero dependencies; PixiJS is Phase 2+.)
- **`node test/smoke.js` must remain green after every phase** — the hard gate for this phase (success criterion #4).
- **GSD workflow enforcement** — file edits must go through a GSD command (this phase runs under `/gsd:execute-phase`).
- **Mythological reverence** — not applicable to a pure rendering refactor (no content changes).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no dependencies; verified against CLAUDE.md constraint.
- Architecture: HIGH — every decision locked in CONTEXT.md and cross-checked against actual source line ranges.
- Pitfalls: HIGH — the HUD-shake trap and hub early-return were found by reading the actual `render()` flow, not assumed.

**Research date:** 2026-06-17
**Valid until:** Stable indefinitely (internal refactor of a frozen codebase) — re-verify only if `game.js` `render()` is edited before this phase executes.
