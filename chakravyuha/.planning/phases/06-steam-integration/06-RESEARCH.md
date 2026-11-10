# Phase 6: Steam Integration - Research

**Researched:** 2026-10-19
**Domain:** Steamworks SDK integration in Electron (achievements, Cloud, overlay) for a vanilla-JS/Pixi game
**Confidence:** MEDIUM-HIGH (steamworks.js mechanics verified against GitHub README/issues; current activity levels and exact macOS overlay status change over time — re-verify immediately before Wave 0)

## Summary

This phase is **blocked from full execution** by the user's playtest gate and by five missing external inputs (Steamworks partner account, Apple Developer ID, Windows cert, cultural reviewers, telemetry endpoint — the last two belong to Phase 7). None of those inputs are required to build and test almost all of Phase 6, however. Steam ships a universal test AppID (**480, "Spacewar"**) specifically so developers can build and exercise achievements, stats, cloud, and overlay code against a real Steam client before they have their own AppID. Nearly the entirety of STEAM-01/02/03/04 can be implemented, wired, and smoke-tested now using AppID 480 and a local Steam client in developer mode; only final achievement *art/definitions* and the production AppID require the partner account.

**Primary recommendation:** Adopt `steamworks.js` (NAPI-RS, N-API ABI-stable) as the default binding — load it **only in the Electron main process** (which already has full Node access) and expose a narrow, typed surface (`unlockAchievement`, `getStat`, `isCloudEnabled`, `overlayOpen` event) to the sandboxed renderer via the existing `contextBridge` pattern in `electron/preload.js`. This avoids the commonly-cited requirement to disable `contextIsolation`/`sandbox` — that requirement only applies if you `require('steamworks.js')` directly in the renderer, which this project's architecture should not do anyway. Treat `steamworks-ffi-node` as the **documented fallback** if manual macOS overlay testing in Phase 6 confirms `steamworks.js`'s known-broken overlay (issue #50, still open as of March 2026) — do not pre-build both; build steamworks.js first, verify, decide.

## User Constraints (none captured yet)

No `CONTEXT.md` exists yet for Phase 6 (discuss-phase has not run). The directives below come from `CLAUDE.md` and `.planning/STATE.md` and are treated with equivalent authority:

- Gods are allies only, never enemies — relevant to achievement copy (no "defeat the god" framing; Yama's boss is "THE TRIAL", see Phase 5.7).
- Vanilla JS stays, no framework migration — the Steam bridge must be plain CommonJS/contextBridge, consistent with `electron/preload.js`.
- `node test/smoke.js` must stay green after every phase — Steam calls must be no-ops/mocked in the headless path (smoke.js stubs `window`/DOM but has no `window.chakraNative`-style Steam global yet; a `window.chakraSteam` stub must degrade identically to running with Steam absent).
- **User decision (2026-10-19):** Phase 6/7 EXECUTION waits for a playtest gate. Research and plan now; do not execute without a stated go-ahead. User does not yet have a Steamworks partner account/AppID, Apple Developer ID, Windows code-signing cert, cultural reviewers, or telemetry endpoint. The game will move to its own git repo (subtree split) before CI work (Phase 7 concern, noted here for awareness).

## Doable Now vs. Needs User Input

### (A) Doable now, no user inputs required

| Item | How |
|------|-----|
| Steamworks SDK + `steamworks.js` wired in main process | `npm install steamworks.js`; `client.init()` guarded in try/catch; works fully against AppID 480 |
| `steam_appid.txt` dev flow | Drop a file containing `480` next to the Electron executable (or in cwd for `npm run start:desktop`) so `SteamAPI_Init()` succeeds without Steam launching the game |
| Achievement unlock/get logic with a **local mock** | Build `STEAM.unlock(id)` that calls `steamworks.js` if `client` initialized, else falls back to an in-memory/`STORE`-backed mock so smoke tests and no-Steam play still work |
| Achievement **definitions as data** (names, descriptions, mapped triggers) | Write `js/achievements.js` (data-driven, like `data.js`) now; actual Steamworks-partner-site icon upload happens later, data stays the same |
| Init failure handling (Steam not running) | `client.init()` throws/returns false — game must catch and continue running with Steam features disabled; this is testable today without any account |
| `asarUnpack` config for the native `.node` binary | Add to `package.json` `build` block now; testable today via `npm run dist:mac`/`dist:win` (unsigned) |
| Steam Cloud **path/shape** readiness | No code needed yet (Auto-Cloud is partner-site config), but verify `app.getPath('userData')` save path is stable across OS now — already true, see Architecture below |
| contextBridge-safe API surface design + implementation | Fully codeable now; test with AppID 480 locally |
| Testing achievements/stats against AppID 480 | Fully doable on the dev's own machine right now (see "Testing with AppID 480" below) |
| Overlay behavior **on Windows** (if dev has a Windows machine/VM) | Testable with AppID 480 |
| Overlay behavior **on macOS** | Testable today with AppID 480 **and is exactly the open question this phase must answer** — no account needed, just a Mac + Steam client installed and running |

### (B) Needs user inputs

| Item | What exactly is needed | Approx. cost | Lead time | Steps |
|------|------------------------|--------------|-----------|-------|
| Steamworks partner account + production AppID | Valve "Steam Direct" account | **$100 one-time fee** per app (recoupable from future sales) | Account approval: hours–days. AppID → store page eligibility: Valve requires the app to exist ~2 weeks (historically 30 days, reduced) before release, so request early | 1. Create a Steamworks account at partner.steamgames.com 2. Pay the $100 Steam Direct fee 3. Fill out the "Steam Distribution Agreement" + tax/banking forms 4. Request a new AppID (free once account exists) 5. Fill out achievement definitions in the partner site's Stats & Achievements page once the real AppID exists |
| Final achievement icons uploaded to partner site | 256×256 PNG (achieved, colorful) — Steam can auto-generate the grayscale "unachieved" variant, or supply your own 256×256 "unachieved" set | Art time only (AI-gen + provenance per existing ART-06 pipeline) | Can be done any time after AppID exists | Upload per achievement in Steamworks > App Admin > Stats & Achievements; name files `API_NAME_ACHIEVED.png` / `_UNACHIEVED.png` if batch-uploading |
| Steam Cloud Auto-Cloud root-path config | None (no cost) — just partner site form fields once AppID exists | Minutes | After AppID exists | Steamworks > Edit Steamworks Settings > Cloud tab > add a Root (`WinMyDocs`/`MacAppSupport`/Linux path) + file pattern `saves/*.json` matching `app.getPath('userData')/saves/*.json` |
| macOS Developer ID (notarization) | Apple Developer Program enrollment | **$99/year** | Approval: usually same-day to a few days (can take up to ~48h for review) | developer.apple.com/programs — enroll as individual or org; needed before any signed/notarized macOS build (Phase 7, but the entitlements research below should be done in Phase 6/7 planning regardless) |
| Windows code-signing certificate | OV or EV code-signing cert from a CA (DigiCert, SSL.com, etc.) | **~$70-400/year** (OV cheaper, EV requires hardware token + stricter identity vetting) | OV: 1-3 days. EV: up to 1-2 weeks (identity verification) | Purchase from a CA, complete identity verification, receive cert (EV ships on a USB HSM token) |

## Steamworks Binding Decision — Verified

| Option | Verified current state (Oct 2026) | Verdict |
|--------|-----------------------------------|---------|
| `steamworks.js` (`ceifa/steamworks.js`) | npm shows **0.4.0**, last published **2024-08-06** — no release in 2+ years. Built with NAPI-RS targeting **Node-API (N-API)**, which Node/Electron guarantee is ABI-stable across versions — unlike raw V8/NAN addons, a single N-API build should keep loading on Electron 42 without a rebuild. No prebuilt-binary manifest or Electron-version compatibility matrix is published; this must be verified empirically (`npm install steamworks.js && electron -e "console.log(require('steamworks.js'))"` under the project's pinned Electron 42.11.8) before relying on it. | **Primary** — simplest integration, most examples, achievements/stats/cloud/localplayer confirmed working cross-platform in its README |
| `steamworks-ffi-node` (`ArtyProf/steamworks-ffi-node`) | Actively maintained in 2026 (dev.to post, SourceForge mirror, GitHub issues open through at least #89). Uses Koffi (pure-JS FFI, zero native compilation, not Node-ABI-locked at all). Claims a working **native overlay via Metal (macOS) / OpenGL (Windows, Linux incl. Steam Deck desktop mode)** rendered by capturing Electron's content into a native surface — this is a materially different, more invasive approach than steamworks.js (which relies on Steam's standard overlay injection, the thing that's broken on macOS). | **Documented fallback** — adopt only if hands-on testing confirms steamworks.js's overlay is unusable on macOS and the FFI library's overlay claim holds up on this project's own Electron build |
| `greenworks` | Not re-verified — CLAUDE.md and STACK.md already correctly rule this out (NW.js-centric, stale, hand-compiled binary matrix) | **Do not use** |

**macOS overlay (issue #50) — verified current status:** Opened Nov 2022, still **open and unresolved** as of the most recent substantive comment (May 2025: "Overlay in MacOS simply not working... Works well with windows"), with a March 2026 comment pointing toward `steamworks-ffi-node`'s overlay work as the alternative rather than a fix landing in steamworks.js itself. **Treat the STATE.md concern as still valid: plan Phase 6 to include an explicit macOS overlay test task with a go/no-go decision point**, not an assumption either way.

**Electron version note:** project pins Electron `42.11.8`; current npm `latest` is `44.9.0`. This is an intentional, reasonable pin (steamworks.js ABI risk is exactly why bumping Electron casually is risky per STACK.md's "Version Compatibility" table) — do not bump Electron opportunistically during this phase.

## Architecture Patterns

### Recommended process split (keeps existing sandboxed renderer intact)

```
electron/
├── main.js        # existing: BrowserWindow, save IPC — ADD: require('steamworks.js') here, client.init()
├── steam.js        # NEW: thin wrapper module, isolates all steamworks.js calls, exports init()/unlock()/getStat()/cloudStatus()
└── preload.js      # existing contextBridge — ADD: window.chakraSteam = { unlock(id), isReady(), onOverlay(cb) }
```

This mirrors the exact pattern already used for `store:read`/`store:write` — do not special-case Steam into a different security model. `steamworks.js`'s own README tells users to set `contextIsolation: false, nodeIntegration: true` because its examples assume the native module is `require()`'d directly in the renderer; **this project should not follow that example** — keep `contextIsolation: true, nodeIntegration: false, sandbox: true` (current `main.js` config) and instead:

1. `electron/steam.js` (main process, full Node access) calls `steamworks.js` directly.
2. `main.js` registers `ipcMain.handle('steam:unlock', ...)`, `ipcMain.on('steam:getOverlayState', ...)` etc., following the existing `ipcMain.on('store:write', ...)` pattern.
3. `preload.js` exposes only the specific calls the renderer needs (`unlockAchievement(id)`, `isSteamActive()`), same shape as `saveRead`/`saveWrite`.
4. `js/` game code (renderer) calls `window.chakraSteam.unlockAchievement('FIRST_BLOOD')` — never touches `steamworks.js` directly, never needs Node integration in the renderer.

### Init failure handling (game must still run)

```javascript
// electron/steam.js
let client = null;
function init() {
  try {
    const steamworks = require('steamworks.js');
    client = steamworks.init(480); // dev: 480 (Spacewar); swap for real AppID at release
  } catch (e) {
    client = null; // Steam not running, SDK missing, or init failed — non-fatal
  }
}
function unlockAchievement(apiName) {
  if (!client) return false;
  try { client.achievement.activate(apiName); return true; }
  catch (e) { return false; }
}
```
Per Pitfall 5 (PITFALLS.md): pump Steam's callback loop every tick and call `StoreStats()`-equivalent after every achievement set, or unlocks won't persist. `steamworks.js`'s `client.achievement.activate()` reportedly handles the store-stats call internally per its README example, but **this must be verified against AppID 480 with an actual app restart** before trusting it — add an explicit "survives restart" check to the Wave 0 test plan.

### Smoke-test-safe stub

`test/smoke.js` has no `window.chakraNative`-equivalent for Steam. Add a no-op `window.chakraSteam` stub (or leave `window.chakraSteam` undefined and have game code guard with `typeof window !== 'undefined' && window.chakraSteam && window.chakraSteam.unlockAchievement`) so achievement-trigger calls sprinkled through gameplay code (on boss kill, on biome reached, etc.) never throw headless. This follows the same `typeof navigator` headless-guard precedent already established in Phase 2 (STATE.md: "Headless guard checks typeof navigator (not document)").

### Steam Cloud / Auto-Cloud

No client code changes needed beyond what Phase 5 already did (PLAT-04: saves already live at `app.getPath('userData')/saves/*.json` via `electron/main.js`'s `savesDir()`). Auto-Cloud is **partner-site configuration only** — a Root (e.g. a Windows "AppData\Roaming\<productName>\saves" / macOS "Library/Application Support/<productName>/saves") + file pattern (`*.json`), configured once an AppID exists. **Action for Phase 6 without an AppID:** document the exact per-OS `app.getPath('userData')` paths this Electron app produces (verify with a quick log on each OS, or infer from Electron's documented per-platform `userData` defaults: `%APPDATA%\Chakravyuha` on Windows, `~/Library/Application Support/Chakravyuha` on macOS, `~/.config/Chakravyuha` on Linux/Deck) so the Root config is correct on day one.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Achievement persistence across restarts | Custom "unlocked achievements" JSON synced manually | `steamworks.js` `client.achievement.activate()` + Steam's own stats storage | Steam already persists and cloud-syncs achievement state; a parallel local system risks desync |
| Cross-machine save sync | Custom upload/download save-diff protocol | Steam Auto-Cloud (file-pattern based, zero code) | REQUIREMENTS.md and STACK.md both already call out this exact choice; Auto-Cloud needs zero binding code vs. the Cloud API |
| In-game overlay rendering | A custom pause/friends-list UI to work around overlay issues | Steam's actual overlay (steamworks.js) or the FFI library's native overlay capture | Reinventing "Shift+Tab" UI is exactly the kind of thing Steam already solves; only fall back if both binding options are verified broken |

**Key insight:** every piece of this phase (achievements, cloud, overlay) is infrastructure Steam already owns — the only genuine engineering here is the **bridge/IPC plumbing** and the **init-failure resilience**, both of which fit this project's existing Electron patterns exactly.

## Achievement Definitions Workflow

1. **Design now (data-only, no account needed):** author `js/achievements.js` as a flat array like `DATA.BOONS`, e.g. `{ id: 'ACH_FIRST_TRIAL', name: '...', desc: '...', trigger: 'run_win' }`.
2. **Test now against AppID 480:** achievements fire and are visually confirmed via the Steam overlay's achievement toast and the in-client "View Achievements" page for Spacewar — note Spacewar's own predefined achievement *names* won't match yours; what you're testing is the **mechanism** (unlock call succeeds, persists, pumps correctly), not your actual IDs, since AppID 480's stat schema is fixed to Spacewar's own definitions. To test your own custom API names end-to-end you need your real AppID — document this limitation so the plan doesn't over-promise "fully tested achievements" before the account exists.
3. **Once the real AppID exists (user input, Phase B):** Steamworks > App Admin > Stats & Achievements — create each API name (e.g. `ACH_FIRST_TRIAL`), display name, description, hidden/visible flag, upload icon.
4. **Icons:** 256×256 PNG per achievement (can submit smaller, min 64×64, but 256×256 avoids upscaling blur); "achieved" version full color, "unachieved" can be auto-grayscaled by Steam or hand-supplied. Fold icon generation into the existing AI-art + provenance pipeline (ART-06) — these are player-facing AI-generated images and belong in `PROVENANCE.json` / the Phase 7 AI disclosure survey.

### Proposed achievement list (grounded in `js/data.js` / `js/meta.js`, 18 total)

| # | Working title | Trigger (from actual game data) | Needs new `meta.js` tracking? |
|---|----------------|----------------------------------|-------------------------------|
| 1 | First Trial | Complete a run (any biome reached, `META.runs` increments) | No |
| 2 | The Trial Endures | First death (`META.deaths` increments) | No |
| 3 | Dharma Upheld | First full-run victory (`META.wins` increments) | No |
| 4 | Blade of the Kuru Prince | Win a run using only `khanda` | Yes — needs per-run "weapon used" exposed to win event |
| 5 | Gandiva's Arrow | Win a run using `gandiva` | Yes (same tracking as #4) |
| 6 | Gada of Bhima | Win a run using `gada` | Yes (same tracking as #4) |
| 7 | Devourer Undone | Defeat `tataka` | Yes — per-boss-defeated set |
| 8 | Sorcerer-King Sealed | Defeat `ahiravana` | Yes |
| 9 | The Sleeping Mountain Wakes No More | Defeat `kumbhakarna` | Yes |
| 10 | The Final Judgment | Defeat Yama / pass the Trial | Yes |
| 11 | Blessed by All | Collect at least one boon from all 6 gods (`hanuman,agni,indra,vayu,krishna,durga`) in a single run | Yes — per-run god-set tracking |
| 12 | Bound in Synergy | Unlock any one Duo Boon (`DATA.DUO_BOONS`) | Yes — duo-boon-unlocked event hook |
| 13 | Six Divine Pacts | Unlock all 6 named Duo Boons across playthroughs (lifetime) | Yes — lifetime duo-boon set in `meta.js` |
| 14 | Weapons of the Pandavas | Unlock all 3 weapons (`META.weapons.length === 3`) | No — already tracked |
| 15 | Keeper of Punya | Accumulate 1000 lifetime Punya earned | Yes — lifetime-earned counter (current `punya` is a spendable balance, not cumulative) |
| 16 | Sanjeevani's Gift | Reach max rank (3) on the `sanjeevani` Path of Dharma upgrade | No — `META.rank('sanjeevani')` already queryable |
| 17 | Unscathed Through Vaitarani | Clear the `vaitarani` biome's rooms without taking damage in a single run | Yes — per-room no-hit tracking |
| 18 | Codex Complete | View the full codex (`META.codexSeen`) | No — already tracked |

**Design note for the planner:** roughly half of these need new lightweight tracking fields in `js/meta.js` (a `lifetimePunya` counter, a `bossesDefeated` set, a `duoBoonsUnlocked` set, a per-run `weaponUsed`/`godsCollected` snapshot passed to a "run ended" hook) — this is a legitimate Phase 6 implementation task, not just a Steam-bridge task. Keep IDs reverent (no "kill the god" framing) — all four boss achievements above are phrased around the *encounter* concluding, consistent with Phase 5.7's Trial-of-Dharma reframe.

## Testing Achievements with AppID 480

1. Create `steam_appid.txt` containing `480` in the directory the Electron binary runs from (or project root for `npm run start:desktop`).
2. Ensure the Steam client is **running and logged in** on the dev machine (required for `SteamAPI_Init()` to succeed even with 480).
3. `client.init()` (or `steamworks.init(480)`) should resolve; `client.achievement.activate('SOME_SPACEWAR_ACHIEVEMENT_NAME')` — note Spacewar's own stat/achievement schema is fixed and not editable, so use this purely to confirm the **plumbing** (init succeeds, call doesn't throw, overlay toast appears if applicable), not to validate real achievement names.
4. For overlay testing specifically: launch the dev build, confirm Shift+Tab opens the overlay, confirm it renders on top of the Electron window, test on both Windows and macOS machines available to the user.
5. Real per-achievement end-to-end testing (your own IDs, icons, persistence across restart with your actual definitions) requires the production AppID — flag this clearly as a (B)-gated final verification step, not a Phase 6 blocker.

## Common Pitfalls

### Pitfall: Achievements fire but don't persist
**What goes wrong:** `SetAchievement()`/`activate()` succeeds in-session but the unlock is lost on restart.
**Why it happens:** Steam requires an explicit `StoreStats()` call (or steamworks.js's internal equivalent) to flush to Steam's backend; some wrappers don't call it automatically for every code path.
**How to avoid:** Explicitly verify (don't assume) that `client.achievement.activate()` persists after a full app restart using AppID 480 before building the full list on top of it.
**Warning signs:** Achievement toast shows, but `client.achievement.isActivated()` (or restarting and re-checking) returns false.

### Pitfall: Renderer requires Node integration "because steamworks.js examples say so"
**What goes wrong:** Following steamworks.js's own quick-start (`contextIsolation: false, nodeIntegration: true`) reverts this project's hardened `main.js` config, reopening the exact security surface Phase 5 closed.
**Why it happens:** Most steamworks.js tutorials assume a renderer-side `require()`, since that's the simplest demo.
**How to avoid:** Keep all `steamworks.js` calls in `electron/main.js`/`electron/steam.js` (main process), bridge via `contextBridge` + IPC exactly like saves/fullscreen already do.

### Pitfall: Steam not running breaks the whole game
**What goes wrong:** An un-guarded `steamworks.init()` throws synchronously during app startup, crashing the Electron main process before the window opens.
**Why it happens:** Treating Steam init as mandatory infrastructure rather than an optional enhancement.
**How to avoid:** Wrap every Steam call in try/catch, default to `client = null`, and make every downstream Steam-dependent function a safe no-op when `client` is null. Test explicitly with Steam fully closed.

## Open Questions

1. **Does steamworks.js 0.4.0 actually load correctly under Electron 42.11.8 without a rebuild?**
   - What we know: N-API is designed to be ABI-stable across Node/Electron versions; the package ships prebuilt binaries per its README.
   - What's unclear: No explicit Electron-42 compatibility statement from the maintainer; the library has had no release in 2+ years, raising risk if something regressed.
   - Recommendation: First Wave 0 task should be `npm install steamworks.js` + a trivial `require()` smoke check under the pinned Electron version, before any other Phase 6 work proceeds.

2. **Will steamworks.js's macOS overlay actually be needed, or is overlay-on-macOS non-critical for this specific game?**
   - What we know: issue #50 is still open; the FFI alternative claims a working fix via a fundamentally different (capture-based) approach.
   - What's unclear: Whether achievement toasts specifically (vs. the full overlay UI) work on macOS even when Shift+Tab doesn't — some reports distinguish these.
   - Recommendation: Test narrowly — does `achievement.activate()` show *any* on-screen confirmation on macOS even without a working Shift+Tab overlay? If achievement/cloud function correctly and only the full interactive overlay is broken, STEAM-04's "fallback to FFI" may not be worth the swap in binding complexity; document the actual, specific gap rather than treating "overlay" as all-or-nothing.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in (`vm` + hand-rolled assertions), no external test runner |
| Config file | none — `test/smoke.js` is a single executable script |
| Quick run command | `node test/smoke.js` |
| Full suite command | `node test/smoke.js` (same — no separate "full" suite exists) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STEAM-01 | Steam bridge init doesn't crash headless/no-Steam path | smoke | `node test/smoke.js` | ❌ Wave 0 — add `window.chakraSteam` stub + guard assertions |
| STEAM-02 | Achievement trigger calls don't throw when `chakraSteam` absent | smoke | `node test/smoke.js` | ❌ Wave 0 — add calls at boss-kill/run-end hooks with guards, assert no throw |
| STEAM-03 | Save file still written/read correctly at `userData` path (unaffected by Steam work) | smoke (existing) | `node test/smoke.js` | ✅ already covered by Phase 5 save tests |
| STEAM-04 | Manual: overlay opens on Steam-launched Win/macOS build | manual-only | n/a — requires real Steam client + AppID 480, not automatable in headless smoke | ❌ — document as a manual QA checklist item, not a unit test |

### Sampling Rate
- **Per task commit:** `node test/smoke.js`
- **Per wave merge:** `node test/smoke.js` (full run simulations already included)
- **Phase gate:** Full suite green before `/gsd:verify-work`; additionally a manual overlay/achievement-persistence pass against AppID 480 before marking STEAM-02/04 done (cannot be automated).

### Wave 0 Gaps
- [ ] `test/smoke.js` — add a `window.chakraSteam` stub object (no-op functions) alongside the existing DOM/Audio stubs, so any achievement-trigger call points added to gameplay code don't throw in headless runs.
- [ ] `js/achievements.js` — new data file (achievement defs) with no test coverage yet; add a structural smoke assertion (every achievement has `id`/`name`/`desc`/`trigger`, no duplicate IDs) mirroring the existing boon-count guard pattern (GAME-01's smoke check).
- [ ] `electron/steam.js` — new main-process module; not reachable from the headless smoke harness at all (smoke.js never loads `electron/`) — this is expected and correct; its correctness is verified manually against AppID 480, not via smoke.js.

## Sources

### Primary (HIGH confidence)
- `ceifa/steamworks.js` GitHub repo + README (binding mechanics, achievement API, Electron setup example) — https://github.com/ceifa/steamworks.js/
- `ceifa/steamworks.js` issue #50 (macOS overlay, still open, last substantive comment May 2025 / pointer comment Mar 2026) — https://github.com/ceifa/steamworks.js/issues/50
- npm registry `steamworks.js` version/publish-time data (verified live 2026-10-19: 0.4.0, published 2024-08-06) — https://www.npmjs.com/package/steamworks.js
- Steamworks official docs — Achievements guide (icon specs, naming convention) — https://partner.steamgames.com/doc/features/achievements/ach_guide
- Steamworks official docs — Steam Cloud / Auto-Cloud (Root paths, file patterns) — https://partner.steamgames.com/doc/features/cloud
- Project files: `electron/main.js`, `electron/preload.js`, `js/storage.js`, `js/meta.js`, `js/data.js`, `package.json`, `test/smoke.js` (read directly)

### Secondary (MEDIUM confidence)
- `ArtyProf/steamworks-ffi-node` repo + dev.to writeup (FFI approach, claimed cross-platform overlay via Metal/OpenGL capture) — https://github.com/ArtyProf/steamworks-ffi-node, https://dev.to/arty_prof/steamworks-ffi-node-a-steamworks-sdk-library-for-javascript-game-frameworks-15h1
- electron-builder `asarUnpack` pattern for native Steam modules (community examples, GitHub issues) — https://www.electron.build/configuration.html
- Steam Direct fee / AppID process ($100, account steps) — general Steamworks partner documentation, cross-referenced across multiple dev guides

### Tertiary (LOW confidence — flagged for validation)
- Exact current Electron-42 compatibility of steamworks.js 0.4.0's prebuilt binaries — no explicit statement found; must be empirically verified in Wave 0.
- Whether achievement toast notifications specifically work on macOS independent of the broader overlay bug — not confirmed either way in available sources; test directly.

## Metadata

**Confidence breakdown:**
- Standard stack (steamworks.js vs ffi): MEDIUM-HIGH — binding mechanics and overlay issue status verified against primary GitHub sources, but exact Electron-42 ABI compatibility is unverified and time-sensitive
- Architecture (contextBridge pattern): HIGH — directly derived from this project's existing, working `storage.js`/`preload.js`/`main.js` pattern
- Achievement list: HIGH for grounding in actual game data (`data.js`/`meta.js` read directly); MEDIUM for which items need new tracking fields (reasonable inference, not yet implemented)

**Research date:** 2026-10-19
**Valid until:** ~14 days for the steamworks.js/overlay status claims (fast-moving, re-verify issue #50 immediately before Wave 0); ~90 days for Steamworks achievement/cloud mechanics and pricing (stable, official docs)
