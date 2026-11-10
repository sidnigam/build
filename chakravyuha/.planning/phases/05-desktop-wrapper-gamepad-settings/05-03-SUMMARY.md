---
phase: 05-desktop-wrapper-gamepad-settings
plan: 03
subsystem: ui
tags: [settings-menu, web-audio, gain-node, fullscreen-api, keyboard-rebinding, store]

requires:
  - phase: 05-desktop-wrapper-gamepad-settings
    plan: "01"
    provides: STORE persistence abstraction (desktop/browser/headless), window.chakraNative bridge
  - phase: 05-desktop-wrapper-gamepad-settings
    plan: "02"
    provides: INPUT.bindings rebindable keyboard-action map, PAD.digitalMoveVector
  - phase: 03-vfx-combat-juice
    plan: "01"
    provides: SETTINGS global (screenShake/shakeIntensity/screenFlash/hitstop/reducedParticles), bindDom() pause-panel wiring
provides:
  - SETTINGS extended with masterVolume/musicVolume/sfxVolume/resolutionMode, persisted through STORE
  - AUDIO.setVolume/getVolume routed through a dedicated sfxGain node
  - UI.settings(returnTo)/UI.closeSettings()/UI.applyRebind() — settings panel reachable from hub and pause
  - Keyboard rebinding UI that writes into INPUT.bindings and persists via STORE
affects: [06-steam-integration, 07-ci-packaging-release]

tech-stack:
  added: []
  patterns:
    - "SETTINGS.load()/save() route through STORE instead of raw localStorage, but load() clears any stale STORE._cache entry first to preserve always-fresh-read semantics (STORE's browser-mode get() never caches, but set()/reset() do, so a forced cache-bust keeps load() honest)"
    - "AUDIO gain staging: master -> (musicGain | sfxGain) -> destination, each independently controllable via SETTINGS-backed getVolume/setVolume"
    - "Settings panel is a same-z-index overlay stacked on top of hub/pause (not hidden underneath) — solid opaque background covers it visually; GAME.state is left untouched while settings is open, restored via UI.closeSettings()'s returnTo dispatch"

key-files:
  created: []
  modified:
    - js/settings.js
    - js/audio.js
    - js/ui.js
    - js/game.js
    - index.html
    - test/smoke.js

key-decisions:
  - "SETTINGS.load() force-clears STORE._cache[this.KEY] before reading, so directly-manipulated localStorage (as several pre-existing Phase 3 smoke tests do) is always picked up fresh, matching the pre-STORE raw-localStorage.getItem behavior the corrupt-JSON and reset tests depend on"
  - "resolutionMode gets its own validation branch in set()/load() (enum check against ['auto','1280x720','1600x900','1920x1080']) rather than falling through the generic number-clamp branch used by the three new volume keys"
  - "UI.settings()/closeSettings() intentionally do not hide the underlying #hub/#pause panel — the new #settings panel is DOM-order-last and visually opaque, so it covers them; GAME.state is never touched by open/close, only closeSettings()'s returnTo dispatch (hub() vs show('pause')) restores the right view"

requirements-completed: [PLAT-05]

duration: ~35min
completed: 2026-09-25
---

# Phase 5 Plan 3: Settings Menu (Volume, Fullscreen, Resolution, Rebinding) Summary

**A `#settings` panel reachable from both the hub and pause menu, exposing master/music/SFX volume sliders (backed by a new `AUDIO.sfxGain` node), fullscreen toggle, a resolution-mode selector, keyboard-action rebinding that writes live into `INPUT.bindings`, and Phase 3's existing screen-shake/screen-flash toggles — all persisted through the `STORE` abstraction under the same `chakravyuha.settings` key.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 completed
- **Files modified:** 6

## Accomplishments
- `SETTINGS.DEFAULTS` gained `masterVolume`/`musicVolume`/`sfxVolume`/`resolutionMode`, with `resolutionMode` validated against a 4-value enum and volumes clamped 0..1 via the existing numeric-clamp branch; `load()`/`save()` now go through `STORE.get`/`STORE.set` under the unchanged `'chakravyuha.settings'` key.
- `AUDIO` gained a dedicated `sfxGain` node between `tone()`/`noise()` and `master`; `setVolume(kind, value)`/`getVolume(kind)` for `'master'|'music'|'sfx'` read/write `SETTINGS` and re-apply gains via a new `_applyVolumes()` helper, which `toggleMute()` now also calls (composing mute with the volume setting instead of hardcoding a literal).
- `UI.settings(returnTo)`/`UI.closeSettings()`/`UI.renderSettings()`/`UI.toggleFullscreen()`/`UI.startRebind()`/`UI.applyRebind()`/`UI.bindSettingsEntryPoints()` implement the full settings-panel logic in `js/ui.js`, wired once from `UI.hub()`.
- `index.html` gained `#btn-hub-settings` (hub), `#btn-pause-settings` (pause), the `#settings` panel markup (volume sliders, fullscreen button, resolution `<select>`, shake/flash checkboxes, rebind-list container, back button), and a separate `<style id="settings-css">` block that does not touch the existing Phase 2/3 `<style>` block.
- `js/game.js`'s `bindInput()` gained exactly one line loading any previously-saved custom bindings from `STORE` before registering listeners, so rebinding survives a reload.
- `node test/smoke.js` stays green: 126 checks total, including 7 new SETTINGS volume/resolution checks, 10 new settings-menu/AUDIO/rebinding checks, and 5 new full-boot/open-close/volume-round-trip checks.

## Task Commits

1. **Task 1: Extend SETTINGS with volume/resolution keys, persist via STORE** - `6a44f0c` (feat)
2. **Task 2: AUDIO volume hooks + settings panel logic in ui.js** - `fbf1ca8` (feat)
3. **Task 3: Settings panel markup + hub/pause entry points + smoke coverage** - `defade6` (feat)

_Note: all three tasks were TDD-flagged or effectively TDD in practice; test assertions and implementation were committed together per task (matching 05-01/05-02's precedent) since `test/smoke.js` is a single shared, append-only file across the whole plan — splitting RED/GREEN would have fragmented an otherwise atomic, easily-reviewed change. `node test/smoke.js` confirms every listed behavior passes after each task._

## Files Created/Modified
- `js/settings.js` - `DEFAULTS` gains `masterVolume`/`musicVolume`/`sfxVolume`/`resolutionMode`; `RESOLUTION_MODES` enum; `load()`/`save()` swapped to `STORE.get`/`STORE.set`; `load()` force-clears `STORE._cache` for its key first; `set()` gets a `resolutionMode` validation branch
- `js/audio.js` - `sfxGain` node created in `init()` and connected `master`; `tone()`/`noise()` route their per-sound gain into `sfxGain` instead of `master`; `setVolume`/`getVolume`/`_applyVolumes` added; `toggleMute()` now calls `_applyVolumes()`
- `js/ui.js` - `settings()`/`closeSettings()`/`renderSettings()`/`toggleFullscreen()`/`startRebind()`/`applyRebind()`/`bindSettingsEntryPoints()` added; `hub()` gained a one-line call to `bindSettingsEntryPoints()`
- `js/game.js` - `bindInput()` gained one line: `Object.assign(INPUT.bindings, STORE.get('chakravyuha_bindings_v1', {}));`
- `index.html` - `#btn-hub-settings`/`#btn-pause-settings` buttons, `#settings` panel markup, `<style id="settings-css">` block
- `test/smoke.js` - 22 new `check()` calls across three new sections (SETTINGS volume/resolution + STORE persistence; AUDIO volume hooks + rebinding; full boot + open/close + volume round-trip)

## Decisions Made
- Forced a `STORE._cache` bust at the top of `SETTINGS.load()` so directly-manipulated `localStorage` (used by several pre-existing Phase 3 smoke tests, e.g. the corrupt-JSON fallback test) is always re-read fresh rather than served from a stale cache entry left over from an earlier `SETTINGS.set()`/`reset()` call — this preserves the exact always-fresh-read behavior the original raw-`localStorage.getItem` implementation had.
- Gave `resolutionMode` its own explicit enum-validation branch in both `set()` and the `load()` merge step (rather than relying on the generic type-match merge used for booleans/numbers), so a corrupted or hand-edited storage value can't silently set an invalid resolution mode.
- Followed the plan's literal panel-stacking approach: `UI.settings()`/`UI.closeSettings()` never call `hideAll()` or touch `GAME.state` directly — the settings panel is DOM-order-last with an opaque `.panel.solid` background, so it visually covers whichever panel (hub or pause) is still shown underneath; `closeSettings()`'s `returnTo` dispatch (`hub()` vs `show('pause')`) is what actually restores the prior view.

## Deviations from Plan

None — plan executed exactly as written. The `STORE._cache`-busting addition to `load()` was implied but not explicitly spelled out in the plan text; it falls under the plan's own instruction to make "STORE use lazy (call-time)" and to keep existing Phase 3 SETTINGS tests passing, so it was implemented as part of Task 1 rather than treated as a separate deviation.

## Issues Encountered
- Traced a subtle interaction between `STORE`'s caching semantics (browser-mode `get()` never caches, but `set()` always does) and several pre-existing Phase 3 smoke tests that write directly to `localStorage` and expect `SETTINGS.load()` to see the change immediately. Resolved by having `load()` explicitly evict any stale cache entry for its key before reading — verified all pre-existing Phase 3 SETTINGS/accessibility/stress-run checks still pass unchanged (126/126 green) after the STORE swap.

## User Setup Required
None - no external service configuration required.

## Manual Checks Pending
- Open Settings from the hub and from pause in a real browser/Electron window; verify the volume sliders audibly change loudness, fullscreen actually toggles (desktop via `chakraNative`, browser via the Fullscreen API), and the resolution selection persists across reopening/reload.
- Rebind a key (e.g. dash) via the settings panel's rebind row and confirm the game immediately reads the new key (not just via headless `UI.applyRebind()`/`PAD.digitalMoveVector` assertions, which cover the logic but not the real keydown-capture UX of `startRebind()`).
- Confirm the shake/flash checkboxes in the new `#settings` panel and Phase 3's existing `#pause` accessibility checkboxes both reflect/control the same underlying `SETTINGS` state (they intentionally don't live-mirror each other's checked state — whichever surface is opened last reflects reality, per 05-03-PLAN.md's interface note).
- Visually confirm `.settings-row` styling reads consistently with the existing `.panel`/`.a11y` gold-on-deep-plum look across both hub- and pause-opened contexts.

## Next Phase Readiness
PLAT-05 (settings menu) is complete. Phase 5 (desktop wrapper + gamepad + settings) is now fully implemented: `STORE` (05-01), `PAD`/`INPUT.bindings` (05-02), and the settings menu tying both together with volume/fullscreen/resolution/rebinding (05-03). No blockers identified for Phase 6 (Steam integration) or Phase 7 (CI/packaging/release).

---
*Phase: 05-desktop-wrapper-gamepad-settings*
*Completed: 2026-09-25*

## Self-Check: PASSED

All modified files confirmed present on disk (js/settings.js, js/audio.js, js/ui.js, js/game.js, index.html, test/smoke.js). All three task commit hashes (6a44f0c, fbf1ca8, defade6) confirmed in `git log`. `node test/smoke.js` reports 126 checks, 0 failures, "ALL SMOKE TESTS PASSED".
