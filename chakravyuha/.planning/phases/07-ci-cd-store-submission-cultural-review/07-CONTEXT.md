# Phase 7: CI/CD + Store Submission + Cultural Review — Context

**Gathered:** 2026-10-19 (user decisions from the orchestrator, plus planner decisions grounded in 07-RESEARCH.md, 06-CONTEXT.md and a codebase read)
**Status:** Planned. **EXECUTION GATED** (see G-1).
**Requirements:** STEAM-05, QA-01, QA-02, QA-03, QA-05

<domain>
## Phase Boundary

The game becomes launch-ready:
- Tagged commits build Windows and macOS binaries on GitHub Actions. They are unsigned today, and become signed and notarized as soon as secrets are added. This is a config-only change.
- Opt-in, anonymous telemetry sends one POST when a run ends. It is disabled by default.
- The game is ready for Steam Deck: it detects the Deck, uses Xbox-style glyphs, keeps every rendered font at 9px or larger at 1280x800, and runs at a working default framerate.
- Store assets are produced by script: 6+ screenshots, every current capsule size, the logo, icons, the store copy and the AI-disclosure answers.
- A cultural-review packet and sign-off form exist. The sign-off is a **hard gate** before the store page goes public.

Out of scope (deferred):
- trailer video (ROADMAP v2)
- Linux native build (the Deck runs the Windows build through Proton)
- a telemetry server or dashboard. The user chooses the endpoint; only the client is built here.
- the Steam Cloud API, leaderboards, rich presence (Phase 6 deferrals stand)
- Steam DRM/CEG
- Switch
</domain>

<gates>
## Gates

- **G-1 Playtest gate (user decision, 2026-10-19).** No Phase 7 plan executes until the user (a) confirms the playtest feedback has been addressed and (b) explicitly approves Phase 7 execution. Every plan carries `gate: "playtest-approved"`. The executor stops if the gate is not satisfied.
- **G-2 Phase 6 code complete.** Every Phase 7 plan depends on `06-03`. That is when the Steam bridge, `electron/util.js`, the asarUnpack config and the achievement wiring are in place. 07-06 also depends on `06-04`, which needs the production AppID.
- **G-3 Art final before anything is shown publicly.** The packet and capsule *tools* can run any time. The **final** screenshots, capsules and packet must be regenerated after Phase 5.4 and 5.7 have shipped. That way reviewers and the store see the corrected Agni, Indra, Yama, Kumbhakarna and Naraka art.
- **G-4 Credentials.** 07-06 is `autonomous: false` and blocked until the user completes the checklist below.
- **G-5 CULTURAL HARD GATE (QA-03, non-negotiable).** The store page must not be set to public ("Coming Soon" or released) until both of these hold:
  - `node tools/review/check-signoff.js` exits 0. That requires at least 2 reviewers, zero open "hard no" items, and every "needs revision" item either resolved and re-confirmed or explicitly accepted by its reviewer.
  - The user confirms.

  Private partner-site drafts and private beta branches are allowed before the gate.
</gates>

<decisions>
## Decisions

- **D-01 Repo layout.** Every path is project-relative. The workflow lives at `.github/workflows/build.yml` and assumes **repo root == the project dir** (after the subtree split). Inside the current monorepo the file is inert, because GitHub only reads root workflows. That is expected.
- **D-02 CI shape.**
  - Triggers: `push: tags: ['v*']` and `workflow_dispatch`.
  - A `test` job runs on ubuntu-latest:
    - `npm ci` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`
    - `node test/smoke.js`
    - `node tools/run-tests.js` (all `test/*.test.js`)
    - `node tools/check-provenance.js`
  - A `build` matrix job (`needs: test`) runs on macos-latest and windows-latest:
    - `npm ci`
    - `electron-builder --publish never`
    - `node tools/ci/verify-dist.js`
    - `actions/upload-artifact@v4`
  - A `steam-deploy` job runs only on tag pushes **and** only when the Steam secrets exist. It uploads to a **beta** branch only and never sets `default` live from CI.
  - `permissions: contents: read`. Concurrency is per ref.
- **D-03 Signing is gated on secrets.**
  - Job-level env flags (`HAS_MAC_SIGNING`, `HAS_NOTARY_API_KEY`, `HAS_NOTARY_APPLE_ID`, `HAS_WIN_PFX`, `HAS_AZURE_SIGNING`) are computed from `secrets.* != ''`, and the steps branch on them.
  - With no secrets, the steps run the unsigned path. The unsigned path is the default and keeps `package.json` `mac.identity: null` byte-for-byte.
  - The signed path uses `build/electron-builder.signed.cjs`. It reads `package.json` `build`, deletes `mac.identity`, and adds:
    - `hardenedRuntime: true`
    - `entitlements` / `entitlementsInherit` = `build/entitlements.mac.plist`
    - `gatekeeperAssess: false`
    - `notarize: true`
    - Azure signing options, only when `AZURE_*` env vars exist
- **D-04 Entitlements.**
  - Exactly `com.apple.security.cs.allow-jit` and `com.apple.security.cs.disable-library-validation`.
  - **Never** `allow-unsigned-executable-memory` or `disable-executable-page-protection`. A test enforces this.
  - One signed launch on a clean Mac must empirically confirm that the Steamworks dylib loads (07-06).
- **D-05 Windows signing route is the user's choice (07-06 Task 1).** Since June 2023 (CA/B Forum), new OV and EV certificates must keep the key on a hardware token or cloud HSM. A plain exportable `.pfx` in a GitHub secret is generally **no longer obtainable**. The supported CI routes are:
  - **(a) Azure Artifact Signing** (formerly Trusted Signing). About $10 a month. electron-builder `win.azureSignOptions`. **Recommended if the user is eligible.** Eligibility for individuals and by region must be checked at sign-up.
  - **(b)** A CA cloud-signing service (SSL.com eSigner, DigiCert KeyLocker, etc.) through a custom `win.sign` hook.
  - **(c)** A legacy exportable `.pfx` (`WIN_CSC_LINK`), if the user somehow has one.
  - **(d)** Ship unsigned at first. SmartScreen will warn, and Steam installs are less affected than direct downloads.

  07-01 wires (a) and (c) as inert gated paths. (b) is added only if chosen.
- **D-06 Notarization auth.** Prefer an App Store Connect API key:
  - Secrets: `APPLE_API_KEY_P8` (the file contents, written to `$RUNNER_TEMP` at runtime), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  - Fallback: `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`

  Executors confirm the env var names against the installed electron-builder 26 notarize code before relying on them.
- **D-07 Perf-tolerant smoke in CI.** Shared runners are slow, and STATE.md logs flaky wall-clock asserts. `test/smoke.js` gains `PERF_MULT = Number(process.env.CHAKRA_PERF_MULT) || 1`, applied to the wall-clock thresholds only:
  - VFX 3000ms
  - bankSpec 50ms / bank 800ms
  - music avgTickMs 0.75

  CI sets `CHAKRA_PERF_MULT=4`. The local default is unchanged.
- **D-08 SteamPipe from CI.**
  - `steampipe/` holds VDF templates. `tools/steampipe/gen-vdf.js` renders them from env (`STEAM_APPID`, `STEAM_DEPOT_WIN`, `STEAM_DEPOT_MAC`, `STEAM_BRANCH` default `beta`).
  - Auth reuses a `config.vdf` produced by **one interactive local `steamcmd` login** with a dedicated build account. It is stored base64 as the `STEAM_CONFIG_VDF` secret, and `STEAM_USERNAME` is stored as a secret too. CI never stores a password plus a Guard code.
  - Windows depot: the NSIS installer is *not* what Steam wants. Upload the unpacked `dist/win-unpacked/` directory.
  - Mac depot: upload `dist/mac*/Chakravyuha.app`. Steam depots ship app directories, not installers.
- **D-09 Telemetry (QA-02).**
  - The client is vanilla `js/telemetry.js`.
  - The endpoint comes from `js/telemetry-config.js` (`TELEMETRY_CONFIG.endpoint`, committed as `null`). CI rewrites that file only when the repo variable `TELEMETRY_ENDPOINT` is set (wired in 07-06).
  - It sends only when the endpoint is a valid `https:` URL (or `http://localhost`/`127.0.0.1` for dev) **and** `SETTINGS.telemetryOptIn === true`. The default is `false`.
  - At most one POST per run, on death or victory. It uses `keepalive: true`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, and never throws or awaits.
  - The payload is a strict whitelist:
    - `{ schema: 1, version, outcome, weapon, biomeReached, biomeIdx, boons: [{id, rank}], runTimeSec }`
    - It contains **no** device ID, account, timestamp or random ID. Nothing is persisted for telemetry.
  - The settings toggle and privacy note are **hidden** when the endpoint is null, so builds without an endpoint show nothing.
- **D-10 Steam Deck (QA-05).**
  - Detection is a pure `detectSteamDeck(env, platform)` in `electron/util.js`. It returns true if `env.SteamDeck === '1'` or `env.SteamOS === '1'`, which works under Proton because env vars pass through. Otherwise it returns false.
  - The flag is exposed as `chakraNative.isSteamDeck()`.
  - When it is true:
    - the window starts fullscreen
    - `INPUT.device` starts as `'pad'`, so no keyboard/mouse glyphs appear at boot
    - the pad family defaults to `'xbox'`
  - `PAD.familyFromId` maps Valve vendor `28de` and `steam virtual gamepad`/`steam deck` ids to `'xbox'`. The Deck's A/B/X/Y layout matches Xbox, which Deck Verified accepts.
  - The font floor is **9px effective at 1280x800** (a hard fail), and anything under 12px is reported as a warning. It is measured by `tools/deck-audit.mjs` over both DOM text and canvas `fillText`.
  - There are no free-text inputs, so the on-screen keyboard item is documented as N/A and asserted by the audit.
  - Electron-under-Proton GPU switches are env-gated escape hatches only (`CHAKRA_DECK_SAFE=1`). They are off by default.
- **D-11 Store asset sizes (STEAM-05).** These verified current sizes **supersede the stale REQUIREMENTS.md text** (616x353/460x215). The orchestrator should update REQUIREMENTS.md; this phase does not edit it.

  | Asset | Size |
  |-------|------|
  | Header capsule | 920x430 |
  | Small capsule | 462x174 (legible at 120x45) |
  | Main capsule | 1232x706 |
  | Vertical capsule | 748x896 |
  | Library capsule | 600x900 |
  | Library hero | 3840x1240, **no logo or text** |
  | Library logo | transparent PNG, at most 1280 wide or 720 tall |
  | Screenshots | 1920x1080 16:9, at least 6 |
  | Community icon | 184x184 |
  | App icon | `build/icon.png` 1024x1024, which electron-builder turns into icns/ico |

  Capsules carry the logo/title and nothing else: no review quotes, awards or price text.
- **D-12 Capsule art content (reverence).**
  - Compose from existing provenance-tracked art: Abhimanyu, the chakravyuha spiral, asura/rakshasa foes and the biome backdrops.
  - **No deity faces on capsule art** in v1. **Never** stage Yama or any god as Abhimanyu's opponent.
  - God portraits appear only in screenshots of the boon panel, as allies.
  - The logo uses OFL fonts (for example Noto Serif Devanagari plus an OFL Latin serif). The font files and `OFL.txt` are stored in `tools/store/fonts/`.
  - Derived assets are recorded in `store/PROVENANCE-store.json` with `derived_from`.
  - Flux key art is optional. It is used only if the composite is judged weak, the ComfyUI server answers, and the orchestrator opens the GPU gate. Its provenance is recorded the same way.
- **D-13 Generated binaries go to `dist/` (gitignored).**
  - Store binaries → `dist/store/`. The packet → `dist/cultural-review-packet/`.
  - Committed: the tools, the sources (copy, layouts, scene list, flagged items, form template), `build/icon.png` and `store/PROVENANCE-store.json`.
  - The final uploaded set is archived at upload time (07-06).
- **D-14 Store copy accuracy.**
  - The copy lives in `store/copy/store-page.md`. It covers:
    - the short description, at most 300 characters
    - About This Game
    - the feature bullets
    - a mythology note
    - the content-survey notes
    - the telemetry and privacy text
    - the AI disclosure blurb
  - A test checks it:
    - the length limits
    - counted claims ("three weapons", "four realms", "six gods") match `DATA`
    - the D-10/05.7 vocabulary: never defeat/kill/slay/beat Yama, never god-as-enemy
    - no "Hades" or other trademark comparisons
    - no "open source" claim
  - Facts: Abhimanyu is the son of Arjuna and Subhadra. He learned to enter the formation while in the womb. He fell on the 13th day of the Kurukshetra war. Yama Dharmaraja is a judge, and the final encounter is the Trial of Dharma.
- **D-15 AI disclosure answers.**
  - `tools/store/ai-disclosure-report.js` produces `store/ai-disclosure-answers.md` from `PROVENANCE.json` and `store/PROVENANCE-store.json`.
  - It answers:
    - **Pre-generated: yes.** It lists the models and licenses: SDXL 1.0 OpenRAIL++-M, FLUX.1-schnell Apache-2.0, plus birefnet/rembg for matting.
    - **Live-generated: no.** Dialogue is static data.
    - **Audio: not AI.** It is WebAudio synthesis.
    - **Marketing assets: yes.** The capsules are derived from AI art.
  - It **flags every `review_status: provisional`** as a blocker to resolve before submission.
- **D-16 Cultural packet (QA-03).**
  - `tools/review/build-packet.js` builds `dist/cultural-review-packet/`, which contains:
    - `00-README`
    - `01-framing.md`, from the committed `docs/cultural-review/framing.md`. It covers the premise, gods-as-allies, the Yama Trial decision with its rationale, and the iconography choices.
    - `02-dialogue-and-lore.md`, exported from `DIALOGUE.LINES`/`LORE`, `DATA` boss titles/intros, boons, `VICTORY_LINES` and `DATA.ACHIEVEMENTS`
    - `03-flagged-items.md`, from `docs/cultural-review/flagged-items.json`
    - `04-sign-off-form.md`, with Approved / Needs revision / Hard no plus a note, per item
    - `images/`: the `_review` contact sheets, plus store capsules and screenshots when `dist/store` exists
  - Responses are recorded in `.planning/phases/07-ci-cd-store-submission-cultural-review/07-CULTURAL-REVIEW-RESPONSES.md`, and `tools/review/check-signoff.js` checks them.
  - If a reviewer returns a "hard no" or a revision, that becomes a gap-closure plan, never an in-place waiver.
- **D-17 Test runner.**
  - `tools/run-tests.js` runs `test/smoke.js` and then every `test/*.test.js`, isolated per file. It exits non-zero on any failure.
  - New Phase 7 tests are separate `test/*.test.js` files wherever possible. 07-01 and 07-02 are the only plans that touch `test/smoke.js`, and they run sequentially.
- **D-18 Ports for the CDP tools.** `store/screens` uses http 8099 and CDP 9339. `deck-audit` uses 8101 and 9341. These avoid the ports already taken: 8091/9333-4, 8095/9335 and 8097/9337.
</decisions>

<discretion>
## Claude's Discretion

- The capsule layouts (the JSON layout specs in `store/capsules/layouts.json`) and the choice of logo font. Both must be OFL.
- Which 6-8 screenshot scenes ship. Candidates:
  - Naraka combat
  - Patala combat
  - Kumbhakarna fight
  - the Yama Trial intro
  - a god boon panel with dialogue
  - the Path of Dharma hub
  - an astra cast
  - Kubera's shop
- The store copy prose. It must pass D-14.
- The wording of the reviewer outreach email and the suggested honorarium.
- Whether a canvas text that is too small is fixed by a `Math.max(9, …)` floor or by resizing it.
</discretion>

<user_input_checklist>
## User-input checklist (Phase 6 + Phase 7 combined, ordered by lead time, longest first)

| # | Action | Blocks | Cost | Lead time |
|---|--------|--------|------|-----------|
| 0 | **Playtest approval** for Phases 6 and 7 (G-1) | everything | — | user-paced |
| 1 | Steamworks partner account: agreement, tax (W-8BEN/W-9) and bank forms. **Pay the Steam Direct fee early**: Valve requires about 30 days between payment and release, and the store page must be public as "Coming Soon" for at least about 2 weeks before release. | 06-04, 07-06 | $100 one-time (recoupable) | hours to days to verify; **30-day release clock** |
| 2 | **Recruit 2-3 cultural reviewers** (one textual/academic Mahabharata background, one devotional-practice perspective). Send the 07-05 packet and outreach email. Collect the forms. | 07-06 store go-live (G-5) | Suggested honorarium of about $50-150 per reviewer (discretionary) | 1-3 weeks. **Start the day 07-05 completes.** |
| 3 | Windows signing route (D-05): set up Azure Artifact Signing (identity validation) **or** buy an OV/EV certificate with cloud signing. Or decide to ship unsigned at first. | 07-06 signed .exe | Azure about $10/month; OV with cloud HSM about $200-500/yr; EV more | Azure: days. OV: 1-5 days. EV: 1-2 weeks. |
| 4 | Apple Developer Program enrollment. Then create a Developer ID Application certificate (.p12) and an App Store Connect API key (.p8). | 07-06 notarized .dmg | $99/yr | Individual: 1-2 days. Organization: up to 2+ weeks (D-U-N-S). |
| 5 | Valve reviews: store page review and build review, each about 3-5 business days. Plan them into the launch date. | launch | free | about 1 week each |
| 6 | Create the app and note the AppID and the Windows/Mac **depot IDs** | 06-04, 07-06 | free | minutes after #1 |
| 7 | Phase 6 partner-site config: the 18 achievements and icons, then the Auto-Cloud quota and roots. Then publish. | 06-04 | free | about 1-1.5 h |
| 8 | Run the subtree split and push the standalone repo to GitHub with Actions enabled. Private-repo macOS minutes are billed at 10x (the free plan includes 2,000 min/month, and a mac build takes about 10-15 min). | 07-01 CI run, 07-06 | free (public repo) / plan minutes | minutes |
| 9 | Dedicated Steam **build account**. Grant it upload permission for the app. Run `steamcmd +login <builduser>` once locally (Steam Guard). Store `config.vdf` base64 as `STEAM_CONFIG_VDF` and the username as `STEAM_USERNAME`. Set repo vars `STEAM_APPID`, `STEAM_DEPOT_WIN`, `STEAM_DEPOT_MAC`. | 07-06 SteamPipe | free | about 30 min |
| 10 | Add the GitHub secrets: `CSC_LINK`/`CSC_KEY_PASSWORD` (mac .p12), `APPLE_API_KEY_P8`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER` (or `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`), and the Windows route secrets (`AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` plus vars `AZURE_SIGN_ENDPOINT`/`AZURE_SIGN_ACCOUNT`/`AZURE_SIGN_PROFILE`, **or** `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`) | 07-06 | — | about 20 min after #3/#4 |
| 11 | Telemetry endpoint: either an HTTPS POST endpoint (for example a Cloudflare Worker with KV/D1 on the free tier) that **does not log IPs**, or "none". If none, the toggle stays hidden and QA-02 data collection waits. Set the repo variable `TELEMETRY_ENDPOINT`. | QA-02 data collection | free tier to a few $/month | about 1-2 h |
| 12 | Verification hardware: Steam on a Windows machine and a clean Mac (for overlay, Cloud, Gatekeeper and SmartScreen). A Steam Deck is optional, because Valve runs the Deck compatibility review after you request it in the partner site. | 06-03, 06-04, 07-06 | — | — |
| 13 | Partner-site store page fill-in: upload the `dist/store` assets, paste the copy, and submit the Content Survey (general + AI sections) using `store/ai-disclosure-answers.md`. **Do not make the page public until G-5 passes.** | launch | free | about 2 h |
</user_input_checklist>

<risks>
## Known Risks

- **Electron under Proton on the Deck** can render a black window or fail GPU init. Mitigations: the env-gated `CHAKRA_DECK_SAFE` switches, and Valve's Deck review. If it fails, a Linux native build becomes a gap item; it is not planned now.
- **OV/EV signing without an HSM path** (D-05). Do not plan around a `.pfx`.
- **REQUIREMENTS.md STEAM-05 sizes are stale** (D-11). The orchestrator should correct the wording.
- **Provisional `review_status`.** Every provenance entry is still `provisional`. Resolve this before submitting the AI survey (D-15). It is flagged by the report rather than changed silently.
</risks>

<canonical_refs>
## Canonical References

- `.planning/phases/07-ci-cd-store-submission-cultural-review/07-RESEARCH.md`
- `.planning/phases/06-steam-integration/06-CONTEXT.md` (D-02 binding, D-03 security, D-05 AppID, D-08 Cloud, D-10 ELECTRON_RUN_AS_NODE note)
- `.planning/phases/05.7-cultural-and-iconography-corrections/05.7-CONTEXT.md` (Yama Trial UD-1, D-09/D-10 vocabulary)
- `tools/browser-check.mjs`, `tools/art/boss_shots.mjs`, `tools/art/god_panel_shots.mjs` (the CDP driver pattern)
- `assets/sprites/AI-DISCLOSURE.md`, `assets/sprites/PROVENANCE.json`, `tools/check-provenance.js`
</canonical_refs>
