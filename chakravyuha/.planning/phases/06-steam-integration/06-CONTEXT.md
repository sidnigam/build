# Phase 6: Steam Integration — Context

**Gathered:** 2026-10-19 (user decisions captured by the orchestrator, plus planner decisions grounded in 06-RESEARCH.md)
**Status:** Planned. **EXECUTION GATED** (see G-1).
**Requirements:** STEAM-01, STEAM-02, STEAM-03, STEAM-04

<domain>
## Phase Boundary

The desktop (Electron) build talks to Steam:
- Steamworks loads in the Electron **main process only**. The sandboxed renderer reaches it through a narrow `contextBridge` API.
- 18 achievements are defined as data, evaluated by a pure rules table and unlocked through the bridge.
- Saves sync via Steam **Auto-Cloud**. This is partner-site configuration plus correct, documented paths. There is no Cloud API code.
- The overlay is validated on Windows and macOS against a written decision rule.

Out of scope (deferred):
- Steam Cloud API (manual remote storage)
- leaderboards
- rich presence
- Steam stats as a product feature. The bridge supports stats, but no stat is required this phase.
- `restartAppIfNecessary` / Steam DRM
- Steam Deck checklist (Phase 7)
- steamcmd/CI depot upload (Phase 7)
- Linux build
- an in-game achievement toast (only if the macOS overlay decision picks option A)
- pausing the game when the overlay opens. steamworks.js 0.4.x has no `GameOverlayActivated` callback.
</domain>

<gates>
## Gates

- **G-1 Playtest gate (user decision, 2026-10-19):** No Phase 6 plan executes until the user (a) confirms that the playtest feedback has been addressed and (b) explicitly approves Phase 6 execution. Every plan carries `gate: "playtest-approved"` in its frontmatter. The executor must stop if the gate is not satisfied.
- **G-2 Steamworks partner account:** The user has **no** partner account or AppID yet. Plans 06-01 to 06-03 need **no** account. They run against Spacewar, **AppID 480**. Plan 06-04 is **blocked** until the user completes the checklist below.
- **G-3 Binding check (Wave 0, inside 06-01 Task 1):** steamworks.js must load under the pinned Electron 42.11.8 before any other Steam work proceeds. The fallback rule is in D-02.
</gates>

<decisions>
## Decisions

- **D-01 Execution order.** 06-01 (bridge) and 06-02 (achievement data/rules/META) run in parallel in Wave 1. 06-03 (gameplay wiring + docs + AppID-480 validation checkpoint) runs in Wave 2. 06-04 (production AppID, blocked on user inputs) runs in Wave 3.
- **D-02 Binding.** Use `steamworks.js` pinned **exactly** at `0.4.0` as a runtime `dependency`. It is required **only** by `electron/steam.js` (main process). All binding calls go through one adapter (`createSteamBridge`), so swapping the binding touches one file. **Fallback rule:** switch to `steamworks-ffi-node` behind the same adapter if any of these happen:
  - `require('steamworks.js')` fails under Electron 42.11.8 (ABI error, or a missing prebuilt for darwin-arm64, darwin-x64 or win32-x64)
  - the main process crashes on init
  - the overlay decision rule (D-09) selects option B

  Do not pre-build both bindings. **Do not bump Electron** during this phase.
- **D-03 Security model is unchanged.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` stay exactly as they are. Never follow the steamworks.js README's renderer-`require` setup. `electron/preload.js` adds `window.chakraSteam`, which exposes only these:
  - `isAvailable`
  - `status`
  - `unlockAchievement`
  - `isAchievementUnlocked`
  - `setStat` / `getStat`
  - `store`
  - `activateOverlay`

  The main process validates every argument:
  - API/stat names must match `^[A-Z][A-Z0-9_]{0,63}$`
  - stat values must be finite integers
  - overlay dialogs must be in the allowlist `['Friends','Achievements']`
- **D-04 Graceful no-op.** If Steam is not running, init fails, the binding is missing, it is the browser build, it is headless smoke, or `CHAKRA_NO_STEAM=1` is set: every Steam call is a silent no-op, the game runs normally, and the main process never crashes. Renderer code always checks `typeof window !== 'undefined' && window.chakraSteam && typeof window.chakraSteam.X === 'function'` and wraps the call in try/catch.
- **D-05 AppID resolution.** Implemented as a pure `resolveAppId({ isPackaged, env, devAppId })`:
  - **Unpackaged dev:** `env.CHAKRA_STEAM_APPID` if set, otherwise `480`.
  - **Packaged:** `env.CHAKRA_STEAM_APPID` if set, otherwise `null`. With `null`, `init()` takes no AppID and Steam supplies it when it launches the game.
  - This means the real AppID **never needs to be hard-coded**.
  - A `steam_appid.txt` containing `480` sits at the project root for dev only. It is explicitly excluded from packaged builds (`!steam_appid.txt` in `build.files`, verified by test and by inspecting the asar).
  - No `restartAppIfNecessary` call this phase, so a DRM-free direct launch keeps working. Revisit in Phase 7.
- **D-06 Achievements are data + pure rules.**
  - The 18 definitions live in `DATA.ACHIEVEMENTS` (`js/data.js`). Because of that, the existing 05.7 reverence lint covers their copy automatically. Each one has `id` (Steam API name `ACH_*`), `name`, `desc`, `cat` (`weapon|biome|boss|meta`) and `hidden`.
  - The predicates live in `ACH.RULES` (`js/achievements.js`). Each is pure: `(meta, run, DATA) -> bool`.
  - `META.achievements` is a local mirror (`id -> first-unlock ms`). It is used for idempotence and to **re-push to Steam at boot**, which covers unlocks earned while Steam was offline. Steam remains the display source of truth.
  - No "defeat the god" framing. Yama's achievement is "Pass the Trial of Dharma".
- **D-07 META tracking and migration.** New persisted fields:
  - `achievements {}`
  - `lifetimePunya`
  - `bossesPassed []`
  - `duosUnlocked []`
  - `weaponWins {}`
  - `saveVersion: 2`

  The pure `META.migrate(raw)` seeds old saves retroactively:
  - `lifetimePunya = punya + punya spent on upgrades + punya spent on weapon unlocks`, computed from `DATA.META` costs and `DATA.WEAPONS[].unlock`
  - `bossesPassed` = the bosses of biomes `< bestBiome`, plus `yama` if `wins > 0`

  `META.earnPunya(amt)` replaces the three `META.punya += ...` sites. A boot evaluation grants every achievement that is already satisfied.
- **D-08 Steam Cloud = Auto-Cloud, progression only.**
  - Sync only `chakravyuha_save_v1.json`.
  - Settings and bindings files stay per-device, because a Deck and a desktop want different resolution, quality and bindings.
  - Pin the app name with a top-level `"productName": "Chakravyuha"` in package.json, so dev and packaged builds resolve the same `userData` directory.
  - Expected roots:

    | OS | Steam Auto-Cloud root | Subdirectory | Pattern | Resolves to |
    |----|----------------------|--------------|---------|-------------|
    | Windows (and Steam Deck via Proton) | `WinAppDataRoaming` | `Chakravyuha/saves` | `chakravyuha_save_v1.json` | `%APPDATA%\Chakravyuha\saves` |
    | macOS (root override) | `MacAppSupport` | `Chakravyuha/saves` | same | `~/Library/Application Support/Chakravyuha/saves` |
    | Linux (not shipped; documented only) | `LinuxXdgConfigHome` if offered, else `LinuxHome` + `.config/Chakravyuha/saves` | — | same | `~/.config/Chakravyuha/saves` |

  - `CHAKRA_DIAG=1` prints the resolved paths, so the table is verified on each OS rather than inferred.
- **D-09 Overlay.**
  - `electronEnableSteamOverlay()` is called (guarded) before `app.whenReady`.
  - Validation protocol (06-03 Task 3):
    - **Windows:** Shift+Tab must open the overlay. That is a STEAM-04 hard pass.
    - **macOS:**
      - The overlay opens → PASS.
      - The overlay is broken but unlock/persist works and the toast shows → PASS-with-documented-limitation; keep steamworks.js.
      - Neither the overlay nor the toast shows → user decision:
        - **A** keep steamworks.js, add an in-game toast (macOS), document it. **Recommended.**
        - **B** spike steamworks-ffi-node behind the adapter (gap plan).
        - **C** defer.
  - Also check that FPS is unchanged with the overlay switches enabled.
- **D-10 Testing.**
  - `node test/smoke.js` stays green after every task, with Steam absent (headless has no `window.chakraSteam`).
  - The new `test/electron-bridge.test.js` unit-tests `electron/steam.js` and `electron/util.js` with a **fake binding**. It is pure Node with no Electron.
  - The AppID-480 tests validate **plumbing only**, using Spacewar's own API names (for example `ACH_WIN_ONE_GAME`). Our `ACH_*` names are validated end-to-end only on the production AppID (06-04).
  - The executor environment has `ELECTRON_RUN_AS_NODE=1` set. Launch the real app with `env -u ELECTRON_RUN_AS_NODE ...`, and use `ELECTRON_RUN_AS_NODE=1 npx electron -e` for Electron-ABI `require` checks.
- **D-11 Pre-existing bug, found during planning, fixed in 06-01.** `electron/main.js` `sanitizeName` only allows `[a-zA-Z0-9_-]`. So `SETTINGS.KEY = 'chakravyuha.settings'` is silently rejected, and **desktop settings never persist**. Fix: allow `.` but reject a leading `.`, any `..`, and path separators. Move the helper to `electron/util.js` so it can be unit-tested. (This could also be pulled forward as a `/gsd:quick` fix before the playtest.)
- **D-12 Pending-unlock retry.** `electron/steam.js` queues unlocks that failed (stats not received yet at startup), retries up to 3 times on a 5 s timer, then drops the unlock with a log line. On AppID 480 our `ACH_*` names are not in Spacewar's schema, so they drop harmlessly. Every activate is followed by `stats.store()`, because SetAchievement needs StoreStats to persist and to show the toast.
</decisions>

<discretion>
## Claude's Discretion

- How achievement icons are made (06-04 Task 1). Recommended: deterministic `sharp` composites built from existing provenance-tracked art (boss/god/weapon sprites) on a mandala frame in the `DATA` color, with a grayscale+darkened "unachieved" variant and provenance `derived_from` entries. Use AI-gen only where no source art fits.
- Achievement display names (they must pass the reverence lint).
- Internal log format of `electron/steam.js`.
</discretion>

<user_input_checklist>
## What the user must do (blocks 06-04 only)

| # | Action | Cost | Lead time |
|---|--------|------|-----------|
| 1 | Create a Steamworks partner account at partner.steamgames.com, accept the Steam Distribution Agreement, and complete the tax (W-8BEN/W-9) and bank forms | Free | Hours to a few days (identity, tax and bank verification) |
| 2 | Pay the Steam Direct fee for the app | **$100 one-time** (recoupable after $1,000 in revenue) | Same day. Valve requires roughly 30 days between paying and being able to release, so pay early. |
| 3 | Create the app and note the **AppID** | Free | Minutes after #2 |
| 4 | App Admin > Stats & Achievements: create the 18 achievements using the exact API names, names, descriptions and hidden flags from `dist/steam/achievements.md` (generated by 06-04 Task 1). Upload the icons (`<API>_ACHIEVED.png` / `<API>_UNACHIEVED.png`, 256x256). Then **Publish** the changes. | Free | About 1 hour |
| 5 | Steam Cloud settings: set a byte quota (for example 1 MB) and file count (for example 10). Enable Auto-Cloud with the roots from D-08. Publish. | Free | About 15 minutes |
| 6 | Upload a build through SteamPipe (the GUI ContentBuilder or steamcmd). Use `npm run dist:mac` / `dist:win` outputs, unsigned is fine for private testing. Set it live on a private beta branch. | Free | About 1 hour first time |
| 7 | Have Steam installed and logged in on **two machines** (ideally one Windows and one Mac) for the Cloud and overlay verification | — | — |
| (Phase 7) | Apple Developer Program ($99/yr) and a Windows code-signing cert (~$70-400/yr, OV 1-3 days / EV up to 2 weeks) | — | Not needed for Phase 6 |

**Doable now (after G-1, no account):** 06-01, 06-02 and 06-03 in full. Also 06-04 Task 1 (icons and the partner-site sheet).
</user_input_checklist>

<canonical_refs>
## Canonical References

- `.planning/phases/06-steam-integration/06-RESEARCH.md`: binding decision, AppID 480 flow, pitfalls, and the 18-achievement source list
- `electron/main.js`, `electron/preload.js`: the existing IPC/contextBridge pattern to mirror
- `js/storage.js`, `js/meta.js`: persistence and the META load/save pattern
- `test/smoke.js` § "Phase 05.7 reverence lint": walks all of `DATA`, so `DATA.ACHIEVEMENTS` is linted automatically
</canonical_refs>
