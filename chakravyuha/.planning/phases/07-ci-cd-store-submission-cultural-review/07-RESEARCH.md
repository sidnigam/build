# Phase 7: CI/CD + Store Submission + Cultural Review - Research

**Researched:** 2026-10-19
**Domain:** GitHub Actions for Electron/electron-builder, macOS notarization/entitlements, Steam store page assets, AI disclosure, opt-in telemetry, cultural review process, Steam Deck Verified
**Confidence:** MEDIUM-HIGH (store asset sizes and Deck checklist verified against current 2026 sources — the project's own REQUIREMENTS.md capsule sizes are stale and must be corrected; CI/signing mechanics verified against electron-builder docs/issues)

## Summary

Phase 7 splits cleanly into things buildable today with zero external accounts (an unsigned CI matrix, telemetry client with a disabled-by-default endpoint, Steam Deck UI/font/glyph fixes, AI disclosure document prep) and things that hard-require user-obtained credentials (signed/notarized builds, SteamPipe upload, the actual AI Content Survey submission, the actual cultural review, final store asset upload). **Do the unsigned CI pipeline and all code-level Deck-readiness work now; defer signing, SteamPipe, and submission steps behind explicit account-acquisition milestones.**

The project's own `REQUIREMENTS.md` STEAM-05 line (capsule sizes "616×353, 460×215, header 460×215") is **out of date** — Valve changed these in/around August 2024. Current correct sizes are documented below and must override REQUIREMENTS.md when the planner builds store-asset tasks.

**Primary recommendation:** Build the GitHub Actions matrix now (macos-latest + windows-latest, electron-builder, unsigned artifacts uploaded via `actions/upload-artifact`), wire opt-in telemetry with a build-time-configurable endpoint that defaults to `null`/disabled, and run the Steam Deck font/glyph audit against the current, verified checklist this phase — none of that needs the missing accounts. Treat signing/notarization, SteamPipe upload, AI survey submission, and cultural sign-off as a second wave gated explicitly on the user obtaining: a Steamworks AppID (Phase 6 dependency), an Apple Developer ID, a Windows code-signing cert, and 2-3 cultural reviewers.

## User Constraints (none captured yet)

No `CONTEXT.md` exists yet for Phase 7. Treat these as binding per `CLAUDE.md`/`STATE.md`:

- Mythological reverence rule is a hard gate on QA-03 — cultural sign-off blocks the store page going live, non-negotiable.
- Vanilla JS stays — telemetry client should be a small vanilla `fetch()` wrapper, no analytics SDK.
- `node test/smoke.js` must stay green — CI should run it as a required check before packaging.
- **User decision (2026-10-19):** execution waits for a playtest gate. The game will be moved to its own git repo via **subtree split** before CI work begins — the GitHub Actions workflow file should be written assuming it lives at the root of that eventual standalone repo (paths like `package.json`, `electron/`, not nested under a monorepo prefix), so it needs no rewrite after the split.
- User does not yet have: Steamworks partner account/AppID (blocks Phase 6 completion and SteamPipe), Apple Developer ID (blocks notarization), Windows code-signing cert (blocks signed .exe), cultural reviewers (blocks QA-03), telemetry endpoint (blocks QA-02 data collection, not the client code).

## Doable Now vs. Needs User Input

### (A) Doable now, no user inputs required

| Item | How |
|------|-----|
| GitHub Actions matrix (macos-latest, windows-latest) running `node test/smoke.js` + `electron-builder` **unsigned** | Standard workflow file, testable today on any branch/tag push |
| Artifact upload of unsigned `.dmg`/`.exe`/`.app`/NSIS installer | `actions/upload-artifact@v4` step after `electron-builder` runs |
| `asarUnpack` + hardened-runtime **entitlements file** prepared (not yet applied/signed) | Write `build/entitlements.mac.plist` now with the researched entitlement set; it's inert until `hardenedRuntime: true` + a real identity are added |
| Telemetry client code: single POST on run end, opt-in toggle, endpoint from a config constant defaulting to disabled | Fully codeable + unit-testable now; point it at `http://localhost` or leave `TELEMETRY.endpoint = null` until the user has a real endpoint |
| Steam Deck UI checklist pass: font sizes ≥9px at 1280×800, controller glyph correctness (`js/glyphs.js` already has PS/Xbox/kbm — verify Deck uses the Xbox-style glyph set via Steam Input, not a distinct "Deck" glyph) | Code/CSS fixes, testable in the existing headless-safe + manual browser flow today |
| Default framerate / resolution check (Deck prefers 1280×800 or 1280×720) | `electron/main.js` currently sets `width: 1280, height: 720` — already Deck-compatible; verify in-game render targets this correctly, no change needed unless found otherwise |
| AI Content Survey **prep** (not submission) — reconcile `assets/sprites/AI-DISCLOSURE.md` + `PROVENANCE.json` against the current survey's actual field list | Fully doable now; the document already flags itself as needing a pre-submission review (STATE.md: "QA-04 ... assets/sprites/AI-DISCLOSURE.md covers zero shipped assets and describes a workflow not actually used") |
| Store page copy drafts (short/long description), screenshot **candidate** capture from existing builds | Doable now from the current build; final screenshots likely redone after Phase 5.4/5.6/5.7 art lands, but the workflow and spec-compliance pass can start now |
| Cultural review **packet** preparation (contact sheets, dialogue export, lore cross-reference doc) | Fully doable now — the project already has `assets/sprites/_review/contact-sheet.png` and dialogue is data-driven in a reachable file; assembling the packet doesn't require reviewers to exist yet |
| Identify 2-3 candidate cultural reviewers (sourcing, not signing) | Research/outreach-planning doable now; actual recruitment is on the user but the *process* (where to look, what to send) can be fully specified this phase |

### (B) Needs user inputs

| Item | What exactly is needed | Approx. cost | Lead time | Steps |
|------|------------------------|--------------|-----------|-------|
| macOS signing + notarization in CI | Apple Developer ID, then an **app-specific password** or **API key** (App Store Connect API key, recommended over app-specific password) stored as GitHub secrets | $99/yr (Apple Developer Program) | Enrollment same-day to ~48h | 1. Enroll at developer.apple.com 2. Create a "Developer ID Application" certificate 3. Export as `.p12`, base64-encode, store as `CSC_LINK`/`CSC_KEY_PASSWORD` GitHub secrets 4. Create an App Store Connect API key (`.p8`) for `notarytool`, store as `API_KEY_ID`/`API_KEY_ISSUER_ID`/`API_KEY_PATH`-equivalent secrets 5. Set `"mac": { "hardenedRuntime": true, "notarize": true, "entitlements": "build/entitlements.mac.plist", "entitlementsInherit": "build/entitlements.mac.plist" }` in `package.json` |
| Windows code signing in CI | OV or EV code-signing certificate (`.pfx`) | ~$70-400/yr depending on CA/OV vs EV | OV: 1-3 days; EV: 1-2 weeks (hardware token + identity vetting) | 1. Purchase from a CA (DigiCert, SSL.com, Sectigo) 2. Complete identity verification 3. Base64-encode `.pfx`, store as `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` GitHub secrets 4. electron-builder signs automatically when these env vars are present |
| SteamPipe / steamcmd depot upload from CI | Steamworks AppID (Phase 6 dependency) + a **dedicated Steam build account** (not the owner's personal account) with Steam Guard on a stable machine for the first `steamcmd` login (generates `sentry` file) | Free (part of Steamworks) | Minutes once AppID exists, but first interactive login to generate the auth sentry can't be fully automated in CI — must be done once locally/manually, then the resulting `config.vdf`/sentry can be stored as a secret | 1. Create a limited-permission Steam account for CI builds (Steamworks > Users & Permissions) 2. `steamcmd +login <builduser>` once locally to accept Steam Guard and cache credentials 3. Store the resulting auth artifacts as GitHub secrets 4. Write `app_build.vdf` + depot configs 5. Add a CI step: `steamcmd +login <user> +run_app_build ../scripts/app_build.vdf +quit` |
| Steam AI Content Survey submission | Steamworks AppID + store page draft must exist | Free | Minutes to fill once the app exists | Steamworks > App Admin > Store Page Content Survey tab (or wherever Valve currently places it — confirm location at submission time since Valve has moved this between the Content Survey and a dedicated AI section over 2025-2026) |
| Cultural review sign-off | 2-3 real reviewers with Hindu mythology/Mahabharata knowledge | Possibly a small honorarium/thank-you (no fixed Steam cost) | 1-3 weeks (finding + review turnaround) | See "Cultural Review Process" section below |
| Final store page asset upload + screenshots/trailer | Steamworks AppID | Free (Valve hosting) | N/A once AppID + assets exist | Steamworks > App Admin > Store Page Assets |

## GitHub Actions CI/CD Matrix

### Now (unsigned)
```yaml
# .github/workflows/build.yml (sketch — written for repo root post subtree-split)
name: build
on:
  push:
    tags: ['v*']
  workflow_dispatch: {}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: node test/smoke.js
  build:
    needs: test
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run dist:mac
        if: matrix.os == 'macos-latest'
      - run: npm run dist:win
        if: matrix.os == 'windows-latest'
      - uses: actions/upload-artifact@v4
        with: { name: chakravyuha-${{ matrix.os }}, path: dist/** }
```
This runs today with **zero secrets** — electron-builder produces unsigned artifacts (macOS: ad-hoc or unsigned `.dmg`; Windows: unsigned NSIS `.exe` that will trigger SmartScreen but still installs). Confirmed pattern from electron-builder's own CI docs and widespread community use (GitHub Actions `macos-latest`/`windows-latest` runners are the standard per-OS-native-build approach cited in STACK.md).

### Later (signed/notarized) — additive, gated on (B) items
Add to the `macos-latest` job:
```yaml
      - run: npm run dist:mac
        env:
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          APPLE_API_KEY: ${{ secrets.APPLE_API_KEY_PATH }}
          APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
```
electron-builder (26.x, bundled `@electron/notarize`) picks up `notarytool`-compatible env vars automatically when `"notarize": true` is set in the mac build config — no separate notarization script needed in modern electron-builder. Add to the `windows-latest` job: `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` similarly.

**Required GitHub secrets once (B) items exist:** `CSC_LINK`, `CSC_KEY_PASSWORD` (mac), `APPLE_API_KEY_PATH`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER` (notarization), `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (windows). None of these exist yet per the user's stated constraints — leave the workflow structured so adding them later is a config-only change (conditional `if: secrets.CSC_LINK != ''` or simply document "add these secrets when available").

## macOS Hardened Runtime Entitlements for Steamworks dylibs

Verified against electron-builder/Electron documentation and community issue threads (MEDIUM-HIGH confidence — this is a notoriously under-documented area, flagged as a concern in both `STATE.md` and `PITFALLS.md`):

- **`com.apple.security.cs.allow-jit`** — required by modern Electron itself (V8 JIT), independent of Steamworks. Already needed regardless of Steam integration.
- **`com.apple.security.cs.disable-library-validation`** — **the one that matters for Steamworks.** Required because the Steamworks native module (`steamworks.js`'s `.node` addon, or the Steamworks redistributable `.dylib`) is signed by a different Team ID (Valve's, or unsigned) than the app bundle. Without this entitlement, the hardened runtime blocks loading it at all — the app may crash silently or fail to find the Steam API.
- **`com.apple.security.cs.allow-unsigned-executable-memory`** — **do not add out of habit.** Research explicitly flags this as a legacy entitlement needed by old (2019-era) Electron/V8 but unnecessary and actively weakening on modern Electron 42. Only add if a specific crash log demands it.
- Do **not** set `com.apple.security.cs.disable-executable-page-protection` — overly broad, not needed for this use case.

Example `build/entitlements.mac.plist` (buildable and committable now, inert until signing is wired):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>
```
`package.json` `build.mac` additions (apply only once a Developer ID + cert exist): `"hardenedRuntime": true, "entitlements": "build/entitlements.mac.plist", "entitlementsInherit": "build/entitlements.mac.plist", "gatekeeperAssess": false`.

**Verification step before trusting this list:** once the Steam binding is in place (Phase 6) and a Developer ID exists, do one signed+notarized **test build and launch on a clean Mac** specifically to confirm the Steamworks dylib loads — the entitlement list above is the documented minimum, but Steamworks' exact dylib signing can vary by SDK version and this must be confirmed empirically, not assumed from documentation alone (per PITFALLS.md Pitfall 9, this exact scenario "commonly stalls the macOS build at the eleventh hour").

## `asarUnpack` Configuration

Extend `package.json`'s existing `build` block (currently has no `asarUnpack` entry):
```json
"asarUnpack": [
  "node_modules/steamworks.js/**"
]
```
Add the real package path once Phase 6 lands it (adjust if `steamworks-ffi-node` + `koffi` is used instead: `"node_modules/steamworks-ffi-node/**", "node_modules/koffi/**"`). This is required because native `.node`/`.dylib`/`.dll` files cannot be `require()`'d or `dlopen`'d from inside an `asar` archive.

## Current Steam Store Page Asset Specs (verified — supersedes REQUIREMENTS.md)

**REQUIREMENTS.md STEAM-05 lists stale sizes (`616×353, 460×215, header 460×215`). These changed around August 2024. Current correct sizes as of 2026:**

| Asset | Current size | Notes |
|-------|--------------|-------|
| Header capsule | **920×430** | Primary store page header (replaced the old 460×215) |
| Small capsule | **462×174** | Auto-downscaled to 120×45 for most discovery-queue browsing — design for legibility at the smaller size |
| Main capsule | **1232×706** | Used in featured/discovery placements |
| Vertical/"portrait" capsule | **748×896** | Newer format for vertical placements |
| Library capsule (grid) | **600×900** | Portrait, shown in the user's library grid |
| Library hero | **3840×1240** | Ultra-wide banner at top of library detail page |
| Library logo | up to **1280×720**, transparent PNG | Overlaid on the hero |
| Screenshots | **minimum 6 required** per REQUIREMENTS.md (matches current Valve minimum); recommend 1920×1080, 16:9 | Current guidance unchanged from prior knowledge — 1920×1080 remains the safe standard |
| Trailer | Deferred (per ROADMAP v2/out-of-scope: "Trailer video — produce once screenshot quality is proven") | No fixed Steam trailer resolution requirement beyond standard video specs (1080p+ recommended); not blocking Phase 7 |

**Action for planner:** update REQUIREMENTS.md STEAM-05 wording when planning Phase 7 tasks — the verified table above is authoritative, not the original requirement text.

## Steam AI Content Disclosure — Mapping to Project Artifacts

Current (2026) Steamworks Content Survey has three sections: **General Content**, **Mature Content**, **Generative AI Content**. The AI section distinguishes:
- **Pre-Generated AI content** (made during development, shipped as static assets) — **this project's case**: all sprites, boss art, biome backgrounds per `assets/sprites/AI-DISCLOSURE.md`.
- **Live-Generated AI content** (created at runtime, e.g. procedural AI dialogue) — **not applicable**; this project's "dialogue" system (Phase 5.5) is explicitly data-driven/static per STATE.md, not live-generated, and must NOT be mis-checked as live-AI.

Disclosure scope must cover: art/textures shipping in the game (yes — sprites, bosses, biome art), audio/music/voice (the project's score is **synthesized WebAudio, not AI-generated** — per existing PITFALLS.md guidance, do not mislabel algorithmic synthesis as AI content), marketing assets on the store page (if capsule art reuses AI-generated sprites/backgrounds, that also needs disclosure).

**Direct action items before submission:**
1. Resolve the STATE.md-flagged gap: `AI-DISCLOSURE.md` currently describes a ControlNet workflow that was **not actually used** — it already self-corrects this (the file has a correction note), but confirm the final document accurately matches shipped assets' *actual* generation method (ComfyUI/SDXL txt2img + img2img, no ControlNet) before survey submission.
2. Re-run the disclosure audit after Phase 5.4/5.5/5.6/5.7 land (new environment art, god portraits via FLUX.1-schnell, cultural-correction regenerations) — `PROVENANCE.json` needs every new asset added, and the checkpoint/model list will need **FLUX.1-schnell** added alongside SDXL (different model = different license line; FLUX.1-schnell is Apache-2.0 per STATE.md, confirm this is recorded).
3. Set every `review_status` field in `PROVENANCE.json` from `"provisional"` to `"approved"`/`"regenerate"` — the AI-DISCLOSURE.md explicitly states this must happen before survey submission and currently has NOT happened (100% provisional as of the last read).

## Opt-in Telemetry Design

**Design goals from the phase brief:** anonymous, opt-in, single POST on run end, records weapon/biome reached/boons taken/run time, endpoint configurable (and disabled by default since no endpoint exists yet).

```javascript
// js/telemetry.js (sketch, vanilla, no framework)
'use strict';
const TELEMETRY = {
  ENDPOINT: null, // set at build time or via a future settings value; null = fully disabled, no network call ever attempted
  enabled() {
    return !!this.ENDPOINT && SETTINGS.telemetryOptIn === true; // explicit opt-in, default false
  },
  onRunEnd(payload) {
    if (!this.enabled()) return;
    // payload: { weapon, biomeReached, boonsTaken: [...ids], runTimeSeconds, won: bool }
    // no player identifiers of any kind — no IP correlation requested, no persistent device ID
    try {
      fetch(this.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true, // survives page/app teardown on run-end-triggered quit
      }).catch(() => {}); // never block or error the game on network failure
    } catch (e) { /* ignore — telemetry must never affect gameplay */ }
  },
};
```

**Privacy / GDPR-light notes:**
- No persistent identifier of any kind (no device ID, no IP logging requirement, no account linkage) — this keeps the design outside most GDPR "personal data" triggers since nothing ties a payload to an identifiable person. Still disclose it on the store page/privacy text per PITFALLS.md's existing guidance ("Telemetry collected without consent" risk).
- Must be **opt-in, not opt-out** — add a `SETTINGS.telemetryOptIn` toggle (default `false`) to the existing Phase 5 settings menu (`PLAT-05` already covers a settings menu; this is an additive field, not a new menu).
- `keepalive: true` on the fetch call matters because "run end" may coincide with the player closing the app — a normal fetch can be aborted mid-flight on process teardown.
- Server-side endpoint itself is entirely a (B) user-input item — the client code above is complete and inert (`ENDPOINT: null`) until the user provides a real URL, satisfying "configurable/disabled-by-default" from the brief.

## Steam Deck Verified Checklist — Current Items vs. This Project

| Checklist item (verified current) | Project status | Action |
|---|---|---|
| Controller glyphs match active input device (no kbm glyphs shown when using a controller) | `js/glyphs.js` already branches on `INPUT.device === 'pad'` vs kbm and has separate `ps`/`xbox` families | Confirm Steam Deck's Steam Input layer presents as the **Xbox-style standard gamepad mapping** (not a distinct "Deck" glyph set) to the Gamepad API — if so, existing `xbox` glyph table already covers Deck; verify empirically, don't assume |
| Full controller navigability (every menu reachable, no mouse/keyboard required) | Phase 05.2 explicitly delivered controller-complete menus | Should already pass; re-verify post Phase 5.4-5.7 art/UI changes didn't regress any new menu |
| Native resolution support, 1280×800 preferred (1280×720 acceptable) | `electron/main.js` sets `width: 1280, height: 720` | Already compliant; no change required |
| Minimum 9px smallest font height at 1280×800 | Spot-checked `index.html` CSS: smallest found is `.card::before`/`.hub-stats`/`.controls-hint` etc. at **13px**, well above 9px; smallest overall observed in the grep was 12px (`button.danger`) | Likely already compliant — but this was a partial grep, not an exhaustive audit; **Phase 7 action: run a full font-size audit across `index.html`, any dynamically-set canvas/HUD text sizes, and boon-card text at actual 1280×800 scaling** (not just desktop 1280×720) since Deck's slightly different effective DPI could shrink text further than desktop testing shows |
| On-screen keyboard / controller-friendly text entry if the game requires typed input | Check whether the game has any name-entry or free-text field | If none exists (likely, given no leaderboard/profile-name feature in scope), this item is **not applicable** — confirm and document as N/A rather than leaving unchecked |
| Functional default framerate | Not yet profiled on actual Deck hardware (STATE.md: "No browser/Electron GUI run has happened... human play session is the next gate") | This is exactly the user's stated playtest gate — Phase 7's Deck-verification task depends on that gate having occurred first; sequence accordingly |

## Cultural Review Process

**Finding reviewers (not a Valve requirement — this is the project's own QA-03 gate):**
- Academic route: contact South Asian Studies / Religious Studies departments at universities with Hindu studies programs (many have public faculty directories; a short, respectful outreach email asking for paid consulting time is standard practice).
- Community route: Hindu American Foundation (HAF) has previously engaged publicly on video game depictions (per PITFALLS.md's SMITE/SEGA precedent) — reaching out to organizations like this, or to moderated communities (e.g. r/hinduism with clear disclosure of intent, or Hindu cultural centers) can surface willing reviewers; vet for genuine depth of knowledge (Mahabharata familiarity specifically, since the game's narrative is Abhimanyu/Chakravyuha-specific) rather than general cultural identity alone.
- Freelance/professional route: cultural sensitivity consultants exist as a paid service category (gaming-industry diversity/sensitivity reading services) — slower to vet but lowest scheduling risk.
- Aim for **2-3 reviewers** with some diversity of background (e.g. one with textual/academic Mahabharata knowledge, one with lived devotional-practice perspective) rather than three similar profiles, to catch different categories of concern (iconographic accuracy vs. devotional tone vs. narrative framing).

**Review packet to send (buildable now, before reviewers are found):**
1. **Contact sheet** — `assets/sprites/_review/contact-sheet.png` already exists; regenerate after Phase 5.4-5.7 art lands.
2. **Dialogue export** — all god-dialogue lines (Phase 5.5, data-driven) exported to a flat readable document (not requiring the reviewer to play the game) — e.g. a script pulling every string from the dialogue data file into a plain-text/markdown doc grouped by god and trigger context.
3. **Lore/framing summary** — a one-page explainer: Abhimanyu/Chakravyuha narrative premise, explicit confirmation that gods are allies/boon-givers only, the Phase 5.7 Yama-as-Trial reframing rationale, and specific iconographic choices made (Yama's danda/pasha/buffalo motif, Durga's weapons, etc.) so reviewers have context for *why* choices were made, not just raw images.
4. **Specific flagged-items list** — carry forward the exact concerns already logged in `STATE.md` (Agni's tilak, Indra's vajra shape, Naraka gate Gothic-vs-torana reading, etc.) so reviewers can confirm fixes landed, not just review cold.
5. **A structured response format** (a short form/checklist per asset: "approved" / "needs revision" / "hard no" + free-text note) to make sign-off collection itself the actual QA-03 gate artifact — store responses in the repo (e.g. `.planning/phases/07.../cultural-review-responses.md`) as the auditable record of the gate having passed.

## Common Pitfalls

### Pitfall: Treating "unsigned CI build" as a dead end
**What goes wrong:** Deferring all CI work until signing credentials exist, wasting the weeks before the user obtains them.
**How to avoid:** Build and merge the unsigned matrix now — it validates the packaging pipeline itself (electron-builder config, asarUnpack, file globs) well before signing is a factor, so signing-stage failures are isolated later.

### Pitfall: Capsule/screenshot sizes from stale requirements docs
**What goes wrong:** Building store assets at the old 460×215/616×353 sizes because that's what REQUIREMENTS.md says.
**How to avoid:** Use the verified table above; Valve's August 2024 size change is now 2+ years old and any asset built to old specs will need redoing.

### Pitfall: Mislabeling synthesized audio as "AI-generated" in the disclosure survey (or vice versa, missing real AI content)
**What goes wrong:** Either over-disclosing (flagging algorithmic WebAudio synthesis as AI, which it isn't) or under-disclosing (missing that capsule art reuses AI-generated sprite/background assets).
**How to avoid:** Audit every asset category against `PROVENANCE.json` before filling the survey; the project's own prior pitfalls research already flags "over-disclosing is safe, under-disclosing is the risk."

### Pitfall: First `steamcmd` login assumed to be CI-automatable
**What goes wrong:** Assuming the entire SteamPipe upload can be hands-off from day one.
**How to avoid:** Plan for one manual, interactive `steamcmd` login (Steam Guard email/mobile confirmation) on a trusted machine to generate reusable auth artifacts before CI can run unattended — this is a one-time (B)-gated setup step, not a recurring manual task.

## Open Questions

1. **Exact current Steamworks partner-site location of the AI Content Survey (Content Survey tab vs. a dedicated "AI Disclosure" section).**
   - What we know: the three-section structure (General/Mature/Generative AI Content) is confirmed across multiple 2026 sources.
   - What's unclear: Valve has reportedly reorganized where in the partner site this lives more than once since the 2025 rule rollout.
   - Recommendation: re-check the exact navigation path at actual submission time (once an AppID exists) rather than relying on this document's description of "where" — the *what* (pre-generated vs. live-generated, what counts) is stable; the UI location is not guaranteed stable.

2. **Whether EV vs OV Windows code-signing is worth the cost/lead-time difference for this project.**
   - What we know: EV certs reduce/eliminate SmartScreen warnings faster (sometimes immediate reputation vs. OV's gradual reputation build via download volume); OV is cheaper and faster to obtain.
   - What's unclear: Given this is a new, low-initial-volume indie title, OV's "reputation needs to build via downloads" tradeoff may cause early SmartScreen friction regardless.
   - Recommendation: default to OV for cost/lead-time unless early playtest/launch feedback shows SmartScreen is a significant conversion blocker; this is a judgment call for the user once pricing is in front of them, not a technical blocker.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in (`vm` + assertions), no external runner |
| Config file | none — `test/smoke.js` |
| Quick run command | `node test/smoke.js` |
| Full suite command | `node test/smoke.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QA-01 | CI produces build artifacts on tag push without crashing | smoke/manual | GitHub Actions run itself is the test; `node test/smoke.js` is the required pre-build gate inside the workflow | ❌ Wave 0 — add `.github/workflows/build.yml` |
| QA-02 | Telemetry client never throws, never blocks gameplay, respects opt-in default-false | smoke | `node test/smoke.js` — add a headless assertion that `TELEMETRY.onRunEnd()` is a no-op (no network stub throws) when `ENDPOINT` is null | ❌ Wave 0 — add `js/telemetry.js` + smoke coverage |
| QA-03 | Cultural sign-off recorded | manual-only | n/a — a human process, not automatable; the "test" is the existence of a completed response-tracking document before the store page goes live | ❌ — document as a manual gate artifact, not a unit test |
| QA-05 | Smallest rendered font ≥9px at 1280×800 | manual/visual | A full CSS/canvas font-size audit is more reliably done via a manual visual check at the exact resolution than a brittle automated pixel-measurement test | ❌ Wave 0 — add as a documented manual QA checklist step; optionally a lightweight automated CSS-rule grep (flag any `font-size` literal below 9px) as a cheap regression guard |

### Sampling Rate
- **Per task commit:** `node test/smoke.js`
- **Per wave merge:** `node test/smoke.js` + a local unsigned `npm run dist:mac`/`dist:win` dry-run before relying on CI alone
- **Phase gate:** Full suite green + CI matrix green on a real tag push before `/gsd:verify-work`; QA-03/QA-05 manual gates tracked separately since they cannot be automated.

### Wave 0 Gaps
- [ ] `.github/workflows/build.yml` — does not exist yet; needed for QA-01.
- [ ] `js/telemetry.js` + a smoke assertion that it never throws — needed for QA-02.
- [ ] `build/entitlements.mac.plist` — does not exist yet; needed before any signed macOS build attempt (not strictly required for unsigned CI, but cheap to add now).
- [ ] A font-size audit script or manual checklist doc — needed for QA-05; no existing automated check.
- [ ] A cultural-review-response tracking doc template — needed for QA-03's auditable gate artifact.

## Sources

### Primary (HIGH confidence)
- electron-builder official docs — macOS notarization, hardened runtime, `asarUnpack`, CSC env vars — https://www.electron.build/docs/features/code-signing/notarization/, https://www.electron.build/configuration.html
- Steamworks official docs — Steam Deck compatibility review criteria — https://partner.steamgames.com/doc/steamhardware/compat
- Project files read directly: `package.json`, `electron/main.js`, `js/glyphs.js`, `index.html`, `assets/sprites/AI-DISCLOSURE.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`

### Secondary (MEDIUM confidence, cross-referenced across multiple 2026 sources)
- Steam capsule/library asset current sizes (920×430 header, 462×174 small, 1232×706 main, 748×896 vertical, 600×900 library, 3840×1240 hero) — cross-verified across presskit.gg, framedrop.work, immutable.com 2026 guides — https://presskit.gg/field-guides/steam-capsule-art-guide, https://framedrop.work/guides/steam-image-sizes, https://www.immutable.com/guides/steam-capsule-sizes
- Steam Deck Verified font/glyph/resolution checklist — community + Steamworks-derived guidance, cross-referenced — https://www.steamdeck.com/en/verified
- Steam AI Content Survey structure (General/Mature/Generative AI sections, pre- vs. live-generated) — cross-referenced across multiple 2026 indie-dev blog summaries of Valve's rules — https://www.strayspark.studio/blog/steam-ai-disclosure-rules-2026-indie-developer-guide

### Tertiary (LOW confidence — flagged for validation)
- Exact current UI location of the AI Content Survey within the Steamworks partner site (has moved before; re-check at submission time).
- Whether App Store Connect API-key-based notarization vs. app-specific-password-based notarization is electron-builder 26.x's currently preferred path — both are documented across sources; confirm against the installed version's own docs when wiring secrets.

## Metadata

**Confidence breakdown:**
- CI/signing mechanics: HIGH — directly sourced from electron-builder's own documentation and well-trodden community patterns
- Store asset sizes: MEDIUM-HIGH — cross-referenced across three independent 2026 guides agreeing on the same numbers, but none is Valve's own partner-site page directly (which requires an account to view) — recommend a final visual confirmation against the actual partner-site upload form once the AppID exists
- Cultural review process: MEDIUM — grounded in the project's own existing PITFALLS.md precedent research and general best practice; the specific reviewer-sourcing channels are suggestions, not guarantees of availability

**Research date:** 2026-10-19
**Valid until:** ~30 days for CI/signing mechanics (stable); ~14 days for store asset sizes and AI disclosure survey structure (Valve has changed both within the past 2 years and could again)
