# Pitfalls Research

**Domain:** Indie action roguelite (vanilla JS/HTML5 Canvas) commercial Steam release with AI-generated art, desktop wrapper, Steamworks integration, and Hindu mythology theme
**Researched:** 2026-06-17
**Confidence:** HIGH (Steamworks, Electron/Tauri, Canvas perf — verified against official docs and developer post-mortems); MEDIUM-HIGH (Steam AI disclosure 2026 rules, cultural sensitivity — verified across multiple credible sources)

---

## Critical Pitfalls

### Pitfall 1: Hindu gods used as enemies / sacred figures trivialized

**What goes wrong:**
The game depicts Hindu deities in combat as opponents, as "demons," or as casually-reskinned avatars stripped of religious context. This triggers organized backlash (petitions, press campaigns, review-bombing) that can sink a small indie launch and permanently brand the studio as disrespectful. SMITE, SEGA/Atlus (Shin Megami Tensei), and Capcom's Asura's Wrath all drew sustained criticism from Hindu organizations for exactly this — deities reduced to "mere game avatars" or "degraded as demons in a virtual battleground."

**Why it happens:**
Western/secular dev instinct treats a pantheon like a roster (any god can be a boss or a unit). In a living religion with active worship, that instinct is offensive. The line between "drawing on mythology" and "trivializing the sacred" is invisible to outsiders until it's crossed publicly.

**How to avoid:**
The PROJECT.md constraint is the correct guardrail and must be enforced as a hard rule, not a guideline: **gods are allies/boon-givers only, never enemies; asuras/rakshasas (already antagonists in the source texts) are the opposition.** Abhimanyu (a revered but human/heroic figure) as protagonist is defensible; making a player "kill" Krishna or Durga is not. Run the planned cultural review (2-3 reviewers with genuine knowledge of the Mahabharata and Hindu practice) *before* art is finalized and *before* the Steam page goes live — fixing tone after launch is far costlier. Avoid depicting deities' faces/forms in death/defeat animations even in cutscenes. Frame the Chakravyuha narrative reverently (Abhimanyu's story is tragic and honored, not a power fantasy over the divine).

**Warning signs:**
Any design doc or boon card where a deity is a damage target, a "corrupted" version of a god appears as a miniboss, or marketing copy reads as flippant ("smite the gods!"). A reviewer flinching at a sprite is a launch-saving signal.

**Phase to address:**
Cultural review phase (gate before art finalization AND before store-page submission). Also a standing constraint enforced in the boss/enemy design phase and the boon design phase.

---

### Pitfall 2: AI-generated art has no IP protection and risky training-data provenance

**What goes wrong:**
Two distinct failure modes: (a) Art generated with no substantial human creative input may have **no copyright protection** — anyone can copy your capsule art, sprites, or trailer and you have limited recourse. (b) Valve has used **questionable training-data provenance as an independent ground for rejection**, separate from disclosure. If a generator was trained on scraped copyrighted art and that's demonstrable, the store listing is at risk, and so is your exposure to infringement claims.

**Why it happens:**
"No art budget → AI art" (the project's stated constraint) is reasonable, but teams assume generated output is automatically "theirs" and that disclosure alone makes them safe. Neither is true. The legal and platform landscape shifted hard in 2025-2026.

**How to avoid:**
- Add **substantial human creative input** to every asset: this is also good craft. The planned post-processing (cleanup, recomposition, palette unification, animation frame work, manual paint-over) both improves quality and strengthens any IP claim. Document the human editing pipeline.
- Use generators with **clean/licensed training data and commercial-use terms** (read the ToS of Midjourney/SD/whatever model — verify commercial rights and indemnification, if offered). Prefer models that grant broad commercial use to paying subscribers.
- Keep **provenance records**: prompts, base generations, edit history, source-model and license. If Valve or a claimant asks, you can show the pipeline.
- Treat capsule/key art (the most-copied, highest-value assets) with the most human work — these are your brand.

**Warning signs:**
Assets that are "prompt → drop into game" with no editing. Inability to answer "which model, what license, what human work?" for any shipped asset. A generator whose ToS is silent on commercial use or training data.

**Phase to address:**
Art pipeline / sprite system phase (establish the human-in-the-loop editing + provenance-logging discipline at the start, before producing hundreds of frames).

---

### Pitfall 3: Inaccurate or incomplete Steam AI content disclosure

**What goes wrong:**
Steam (as of the 2026 rules) requires disclosing AI-generated player-facing content via Valve's **Content Survey / AI disclosure** in the Steamworks partner portal, separating **pre-generated** (made during development — your case) from **live-generated** (at runtime — not your case). Valve is hands-off about *whether* you used AI, but **incomplete or inaccurate disclosure can get the game removed from the storefront.** Getting this wrong delays or kills the launch.

**Why it happens:**
Devs either don't know the survey exists, under-disclose (only mention "some" AI art), or treat it as optional. By H1 2025, ~1 in 5 new Steam releases carried an AI disclosure — it's now routine, and skipping it is conspicuous.

**How to avoid:**
Complete the AI Content Survey honestly and completely during store-page setup. Since this game's art, and possibly UI/SFX, are AI-assisted, disclose **pre-generated AI graphics** (and audio if synthesized via AI vs. WebAudio synthesis — note: algorithmic WebAudio synthesis is *not* AI-generated and shouldn't be mislabeled). Be specific and accurate; over-disclosing is safe, under-disclosing is the risk. Keep the provenance records from Pitfall 2 to back up the disclosure.

**Warning signs:**
Store page submitted without touching the AI survey. Ambiguity about which assets are AI vs. hand-made vs. algorithmic. Treating disclosure as a marketing liability to minimize rather than a compliance checkbox.

**Phase to address:**
Steam page / store submission phase (explicit checklist item, blocking).

---

### Pitfall 4: Steam Overlay fails to inject (Electron/Tauri renderer timing)

**What goes wrong:**
The Steam Overlay (Shift+Tab, screenshots, friends, purchase flows) **must be injected before the renderer initializes** and is hooked via `SteamAPI.Init()`. In a Chromium/WebView wrapper, the GPU/renderer process spins up on its own schedule, so the overlay frequently fails to appear or renders incorrectly. Achievements may still fire, but the missing overlay is a visible "this game is janky" signal and can affect Steam Deck verification.

**Why it happens:**
Steamworks was designed for native DirectX/OpenGL engines where the dev controls init order. Electron/Tauri abstract the renderer away. Overlay injection into the Chromium GPU process is finicky and platform-dependent (it's a known pain point even in Unity).

**How to avoid:**
- Initialize Steam (via the native node addon, e.g. a `steamworks.js`-style FFI binding) **as early as possible** in the main process, before the BrowserWindow's renderer is created.
- Launch through Steam (not the raw exe) for testing; ensure `steam_appid.txt` sits next to the executable for direct-launch/debug runs.
- Test the overlay explicitly on both Windows and macOS early — don't assume it works because achievements unlock.
- Electron is the safer wrapper here specifically because `steamworks.js` / steam node bindings exist and the Chromium renderer is uniform across platforms; Tauri's per-platform WebViews + Rust-only native integration make Steamworks "a deal breaker" per developer reports.

**Warning signs:**
Shift+Tab does nothing in-game. Overlay renders black or distorted. Screenshots (F12) don't save to Steam. Works in dev but not in the Steam-launched build.

**Phase to address:**
Desktop wrapper phase (wrapper choice + init ordering) and Steam integration phase (overlay verification on Win + macOS).

---

### Pitfall 5: Steamworks API key handling, offline mode, and DRM mistakes

**What goes wrong:**
Several related failures: (a) committing the Steam Web API publisher key or building DRM that calls home and **locks out offline/legitimate players**; (b) wrapping the build in Steam DRM and then having it fail to launch outside Steam during review; (c) achievements that never persist because `StoreStats()` isn't called or `RunCallbacks()` isn't pumped.

**Why it happens:**
Confusion between the **client SDK** (ships with the game, app-id based, safe) and the **Web API publisher key** (server-side secret, must never ship). Devs also bolt on aggressive always-online DRM for a single-player roguelite that doesn't need it, creating support nightmares and review failures.

**How to avoid:**
- Never embed the Web API publisher key in the client. The shipped game only needs the app ID and the client Steamworks API.
- For a single-player roguelite, **skip custom DRM**; rely on Steam's account ownership. Steam DRM wrapper is optional and often counterproductive for indies — players value offline play, and the roguelite already uses localStorage saves.
- Ensure the game runs fully offline (Steam can be offline). Don't gate core gameplay behind a Steam call that can fail.
- For achievements: pump `RunCallbacks()` every frame/tick and call `StoreStats()` after every `SetAchievement()`. This is the single most common achievement bug.

**Warning signs:**
A publisher key string anywhere in the repo or bundle. Game won't start without internet. Achievements unlock visually but don't persist after restart. Offline launch hangs.

**Phase to address:**
Steam integration phase (achievement plumbing, key hygiene, offline-launch test).

---

### Pitfall 6: AI sprite inconsistency across animation frames

**What goes wrong:**
The single hardest problem with AI art for animation: **frame 1 vs. frame 30 drift** — inconsistent colors, line thickness, proportions, and character identity. Generic Midjourney/SD output produces beautiful standalone images that don't form coherent animation cycles. The result is a flickery, "AI smell" character that breaks the Hades/Dead Cells stylized-illustration target.

**Why it happens:**
Diffusion models don't natively maintain character identity across generations. Each frame is an independent sample. Without a consistency strategy, attack/dash/death animations look like different characters wearing the same costume.

**How to avoid:**
- Use a **consistency pipeline**, not raw generation: lock a reference sheet (single canonical character image), then use img2img / ControlNet / pose-conditioned tools or purpose-built sprite generators (e.g. Spritesheets.AI, PixelLab-style tools) that preserve palette/proportions across frames.
- Establish a **fixed palette and silhouette** per character first; enforce it in post (manual recolor/cleanup). Strong silhouettes are the project's stated art goal and are also what survive AI inconsistency best.
- Animate with **fewer, cleaner frames** (Hades-style limited animation) rather than many drifting frames. Pre-render finalized frames to sprite sheets; never generate at runtime.
- Build a small **review gate**: flip through each cycle at speed before integration. Inconsistency is obvious in motion, invisible in stills.

**Warning signs:**
Character "boils" or shimmers in motion. Color/proportion shifts between frames. Reviewers can't tell two animation states are the same character. Spending more time fixing frames than generating them (a sign the base pipeline lacks consistency conditioning).

**Phase to address:**
Sprite system / character art phase (establish consistency pipeline before mass-producing enemy + boss + player frames).

---

### Pitfall 7: Canvas 2D drops below 60fps with sprites + particles

**What goes wrong:**
The MVP renders primitives fine, but adding illustrated sprite sheets + particle VFX (hit sparks, dash trails, astra casts, screen shake) on a single 2D canvas can blow the 16.6ms frame budget — especially during boss phases with many particles. Frame drops on a roguelite ruin combat feel and tank Steam Deck verification.

**Why it happens:**
Naive approaches: clearing/redrawing the whole canvas every frame, drawing each particle with strokes/gradients procedurally, re-decoding images, no batching, and per-particle object churn triggering GC stutters. Canvas 2D has no automatic batching — every `drawImage` is a call.

**How to avoid:**
- **Pre-render static content** (backgrounds, tiles, decorative biome art) to offscreen canvases once; blit them rather than redrawing.
- **Use image sprites, not procedural strokes/gradients**, for anything detailed (web.dev explicitly calls this out as a major win).
- **Particle systems:** object-pool particles (no per-frame allocation → no GC spikes), draw simple sprite/quad particles via cached offscreen images, cap particle counts, and consider `OffscreenCanvas` + a Web Worker for heavy particle math to keep the main thread free.
- Limit redraw region where possible; integer-align sprite positions; avoid sub-pixel `drawImage` and shadow/blur in hot paths.
- Profile with Chrome DevTools FPS meter under worst case (boss phase 2 + max particles), not the title screen.
- Keep the headless smoke test green, but add a **visual perf budget test** — smoke tests won't catch frame drops.

**Warning signs:**
FPS meter dips during boss fights or heavy VFX. Stutter that correlates with particle bursts (GC). Frame time climbing as biomes get more decorated. Fine on dev desktop, janky on Steam Deck (weaker GPU, the real target).

**Phase to address:**
Sprite renderer phase (offscreen pre-rendering architecture) and VFX/combat-juice phase (particle pooling + perf budget). Verify on Steam Deck hardware in the Steam integration phase.

---

### Pitfall 8: Electron bloat — memory, startup time, bundle size

**What goes wrong:**
Electron ships ~150MB baseline (vs. Tauri ~5MB), uses hundreds of MB of RAM, and has slow cold-start. For a small 2D roguelite, a 200MB+ download and sluggish launch invite the "it's just a web page" criticism and hurt on Steam Deck's constrained memory.

**Why it happens:**
Electron bundles a full Chromium + Node runtime regardless of app size. Default configs don't trim. Loading all assets eagerly on boot worsens startup.

**How to avoid:**
- Accept Electron's size as the **deliberate tradeoff for working Steamworks + uniform rendering** (the right call for this project), but mitigate: enable build compression, prune unused locales/modules, and use a current Electron with a single window.
- **Lazy-load assets**: don't decode every sprite sheet at startup; load per-biome.
- Keep the renderer lean (vanilla JS already helps — no framework overhead). Disable Node integration in the renderer where not needed for security and startup.
- Measure RAM and cold-start on Steam Deck early; set a budget (e.g. <400MB RAM, <5s cold start) and hold to it.
- Reconsider Tauri only if you're willing to write Rust for Steamworks — for this milestone, the consensus is Electron, with bloat managed rather than eliminated.

**Warning signs:**
Multi-hundred-MB installer for a tiny game. Long black screen on launch. High idle RAM. Steam Deck users reporting slow boot.

**Phase to address:**
Desktop wrapper phase (Electron config, lazy-loading, budget) — verify on Steam Deck during Steam integration.

---

### Pitfall 9: macOS code signing + notarization blocks the build

**What goes wrong:**
Unsigned/un-notarized macOS builds get Gatekeeper-blocked ("can't be opened, unidentified developer"), and the Steamworks SDK loads dylibs that require **hardened-runtime entitlement exceptions** that are poorly documented. This commonly stalls the macOS build at the eleventh hour.

**Why it happens:**
Apple now effectively mandates Developer ID signing + notarization for distributed apps. Steamworks' dylib loading conflicts with the hardened runtime unless specific entitlements are granted — and "good luck figuring out which ones" per developer reports.

**How to avoid:**
- Get an Apple Developer ID and set up signing + notarization **early**, not at launch. Use `electron-builder`/`electron-updater` (industry standard for macOS notarization + Windows signing).
- Pre-research the exact hardened-runtime entitlements needed for Steamworks dylib loading; bake them into the build config and test a notarized build through Gatekeeper before relying on it.
- CI/CD (the planned GitHub Actions on tag) should perform signing/notarization so it's reproducible, not a manual scramble.

**Warning signs:**
macOS build only tested unsigned on the dev's own machine (Gatekeeper allows local builds, hiding the problem). Notarization first attempted the week of launch. Steam dylib load failures with cryptic entitlement errors.

**Phase to address:**
CI/CD pipeline phase (signing/notarization automation) and desktop wrapper phase (entitlements).

---

### Pitfall 10: Boon power creep and "solved" builds (roguelite depth)

**What goes wrong:**
With only 6 gods and a minimum of 4 boons each (24+) plus duo boons, it's easy to create a few obviously-dominant boons/synergies that every player gravitates to, collapsing build variety. Conversely, stat-based meta-progression (Path of Dharma) can over-power the player so the game becomes trivial, OR become a mandatory grind wall. Both kill the core value ("every death feels different").

**Why it happens:**
Balancing 24 boons × 3 weapons × meta upgrades is combinatorially hard. Designers under-test interactions; the strongest synergy emerges in playtesting, not on paper. Meta-progression that just adds flat stats (vs. options) is a known roguelite anti-pattern that "ruins" build diversity.

**How to avoid:**
- Lean on the data-driven design (all balance in `data.js`) — make boons easy to retune. Build a **headless balance harness** (extend the smoke test) that simulates many runs per build to surface outlier win-rates/DPS.
- Favor **meta-progression that adds options/variety over flat power** (Hades-style: new weapons, boons, modifiers) rather than pure stat creep — and ensure the player can't fully out-stat the game.
- Design **duo/synergy boons** intentionally for build identity, but cap their ceiling; playtest specifically for "the one build everyone picks."
- Give players knobs for self-challenge (Hades' Heat / Pact-of-Punishment analog) to extend depth without rebalancing the base.

**Warning signs:**
Telemetry (planned anonymous opt-in) shows one boon/weapon picked far above others, or one biome win-rate near 100%. Playtesters converge on identical builds. Meta upgrades make early biomes trivial.

**Phase to address:**
Boon depth phase (synergy design + balance harness) — validated with telemetry post-launch.

---

### Pitfall 11: Room sameness and content thinness (roguelite variety)

**What goes wrong:**
A consistent criticism of Hades is limited enemy/level variety (4 areas, ~half Dead Cells' enemy count). With 4 biomes and hand-crafted layouts (procedural is explicitly out of scope), rooms can feel repetitive within ~2-3 hours, undermining the "runs feel different" promise that justifies a paid release.

**Why it happens:**
Hand-crafted variety is labor-intensive; teams ship too few layout templates and reuse enemy compositions. Without enough permutations, the run structure feels scripted.

**How to avoid:**
- The PROJECT target (≥3 layout templates per biome + per-biome hazards) is the right floor — treat it as a minimum, and vary **enemy composition and hazard placement** within templates to multiply perceived variety cheaply.
- Mix encounter *types* (combat, elite, reward/choice rooms) so pacing varies even when layouts repeat.
- Use the boon/weapon system as the primary variety driver (it's cheaper than new rooms) — but don't let it fully mask thin level content.
- Playtest for the "I've seen this room" moment and add layouts/compositions where it hits earliest.

**Warning signs:**
Playtesters say "this feels the same" before clearing a biome twice. A biome has only one viable path/layout. Enemy compositions identical across rooms.

**Phase to address:**
Room variety phase (layout templates + hazards + composition variation).

---

### Pitfall 12: Poor boss telegraphing and phase transitions

**What goes wrong:**
Bosses with unclear attack windups feel "cheap" — deaths read as unfair rather than earned, the cardinal sin in a death-driven roguelite. Phase transitions that aren't readable (or that spike difficulty without warning) frustrate. The PROJECT calls for 2+ phases with "clearly telegraphed" patterns — meeting that bar is harder than it sounds.

**Why it happens:**
Telegraphs require deliberate windup animations + audio cues + sometimes ground markers, all of which must survive the AI-art animation pipeline (Pitfall 6). Designers tune bosses against their own expert play, missing how opaque patterns feel to new players.

**How to avoid:**
- Every boss attack needs a **distinct, readable windup** (anticipation frame + audio cue + optional telegraph VFX). Reserve animation/VFX budget for telegraphs specifically — they're gameplay, not polish.
- Make **phase transitions explicit** (brief cinematic/invuln window per the PROJECT plan) so players re-read the threat.
- Playtest with **non-expert players** and watch for "that felt unfair" deaths; those are telegraph failures.
- Keep boss attacks i-frame/dash-counterable (the combat system has dash i-frames) so mastery is expressible.

**Warning signs:**
Playtesters die to the same attack repeatedly without learning it (telegraph too short/unclear). Phase 2 surprises players into instant death. Boss deaths feel random, not skill-based.

**Phase to address:**
Boss encounters phase (telegraph design + phase transitions), dependent on the VFX/animation pipeline being in place.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Raw AI generations with minimal editing | Fast asset throughput | Weak/no IP protection, "AI smell," frame inconsistency, possible Steam provenance issue | Never for shipped player-facing art; OK for throwaway prototyping/placeholder |
| Redraw whole canvas + procedural particle drawing | Simple to code | Frame drops under VFX load, GC stutter | Only pre-VFX; must be replaced before combat-juice phase |
| Tauri to shrink bundle | 25x smaller, less RAM | Steamworks requires Rust, per-platform WebView rendering bugs | Only if team commits to Rust Steamworks work — not this milestone |
| Skip macOS notarization until launch | Faster early iteration | Gatekeeper block + Steamworks entitlement scramble at the worst time | Never — set up early in CI |
| Flat-stat meta-progression | Easy to implement/tune | Collapses build variety, becomes grind wall or trivializes game | Limited use; prefer option-adding upgrades |
| Steam Auto-Cloud instead of Cloud API | Quick to enable, no API code | Less control; localStorage path/sync edge cases across platforms | Acceptable for a single-save localStorage game IF save path is configured carefully and tested cross-platform |
| Reuse layouts with identical enemy comps | Ship variety target faster | Room sameness, "runs feel same" | Never as the only variety; must vary compositions/hazards |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Steamworks init | Init after renderer starts → overlay fails | Call Steam init in main process before BrowserWindow renderer; ship `steam_appid.txt` for direct launch |
| Steam achievements | Set achievement but never `StoreStats()`; don't pump `RunCallbacks()` | Pump `RunCallbacks()` per tick; `StoreStats()` after every `SetAchievement()` |
| Steam Cloud saves | Platform-specific save sub-folders (per-app-name dirs) don't sync; wrong path roots | Configure consistent cloud paths; test save sync Win↔macOS; map localStorage to a stable cloud-synced file |
| Steam Web API key | Embedding publisher key in the shipped client | Client uses app ID + client SDK only; publisher key stays server-side / never ships |
| Steam DRM | Wrapping single-player game in always-online DRM | Skip custom DRM; rely on account ownership; ensure full offline play |
| Steam Input / gamepad | Supporting mouse OR gamepad but not simultaneously | Allow simultaneous mouse + gamepad; implement Steam Input or a clean default controller config so ALL functionality is reachable on Deck |
| macOS Steamworks dylib | Hardened runtime blocks dylib load | Add required entitlement exceptions; sign + notarize via electron-builder |
| AI Content Survey | Skipping/under-disclosing AI art | Complete Valve's AI disclosure for pre-generated content accurately before launch |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-canvas clear+redraw every frame | FPS dips as scene complexity grows | Pre-render statics to offscreen; limit redraw region | Adding detailed backgrounds + many sprites |
| Procedural particle drawing (strokes/gradients) | Stutter on VFX bursts | Cached sprite-image particles, batched | Boss phase 2 + dash/astra spam |
| Per-frame particle allocation | GC pause spikes (micro-freezes) | Object-pool particles | Sustained particle systems |
| Eager asset decode on startup | Long black launch screen, high RAM | Lazy-load per biome | More/larger sprite sheets added |
| Heavy particle math on main thread | Main thread blocked, input lag | OffscreenCanvas + Web Worker for particle sim | Dense effects on weak GPU (Steam Deck) |
| Electron baseline bloat | 200MB+ download, slow cold start, high RAM | Compress build, prune locales, single window, lazy assets | Always present; worst on Steam Deck |
| Testing only on dev desktop | "Works for me," janky for players | Profile worst case on Steam Deck hardware | At verification / launch |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Steam Web API publisher key in client bundle | Key theft, account/store abuse | Never ship it; client uses app ID + client SDK only |
| Electron renderer with Node integration + remote/untrusted content | RCE surface | Disable nodeIntegration in renderer where unneeded; context isolation on; the game is local content so keep it that way (no loading remote URLs) |
| localStorage save tampering treated as "cheating exploit" | Player edits saves | Accept it for single-player (low stakes); don't build anti-tamper that breaks legit offline play; just validate save schema to avoid crashes |
| Telemetry collected without consent | Privacy/legal exposure, store policy | Keep telemetry anonymous + opt-in (as planned); disclose in store/privacy text |
| Shipping AI art with unverified training-data license | Infringement claim, Steam rejection on provenance | Use commercially-licensed models; keep provenance records |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No control rebinding / accessibility options | Players can't play comfortably; Deck verification risk | Full rebind + settings menu (already planned) — verify all functionality reachable on gamepad |
| Gamepad as afterthought | Roguelite/Deck audience bounces | Design combat for gamepad-first; test on Deck; simultaneous mouse+pad |
| Unfair-feeling boss deaths | Frustration, refunds, negative reviews | Clear telegraphs + readable phases |
| Meta-grind wall before fun | Players quit before "builds" emerge | Front-load variety; option-based meta over stat walls |
| Flickery AI animations | "Cheap/AI" perception | Consistency pipeline + limited clean frames |
| No "exit run" / pause clarity | Confusion, lost progress fear | Clear pause, run-abandon, and save-state messaging |

---

## "Looks Done But Isn't" Checklist

- [ ] **Steam Overlay:** Often missing — verify Shift+Tab, screenshots (F12), and friend invites work in the *Steam-launched* build on **both Windows and macOS**, not just achievements firing.
- [ ] **Achievements:** Often missing persistence — verify they survive an app restart (i.e., `StoreStats()` is actually called), not just that the toast appears.
- [ ] **Cloud saves:** Often missing cross-platform sync — verify a save made on Windows loads on macOS and vice versa; check the cloud path config.
- [ ] **Offline play:** Often missing — verify the game fully launches and plays with Steam in offline mode / no internet.
- [ ] **macOS build:** Often missing notarization — verify a *notarized* build opens on a clean Mac through Gatekeeper, not just the dev's machine.
- [ ] **Gamepad coverage:** Often missing menus/settings/run-end screens — verify **every** screen is fully navigable by controller (Deck verification requires it).
- [ ] **AI disclosure:** Often missing/incomplete — verify Valve's AI Content Survey is submitted and matches what actually ships.
- [ ] **AI art consistency:** Often missing in motion — verify each animation cycle in motion at speed, not as stills.
- [ ] **60fps under load:** Often missing worst-case testing — verify FPS holds during boss phase 2 with max particles on **Steam Deck**, not just title screen on desktop.
- [ ] **Cultural review:** Often skipped — verify reviewers signed off on tone/depiction BEFORE store page and final art.
- [ ] **Smoke tests:** Verify `node test/smoke.js` still green after every phase (project constraint).
- [ ] **Store page assets:** Often low quality — verify capsule/screenshots/trailer meet Steam quality bar (poor promo materials hurt visibility and can draw review friction).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cultural backlash post-launch | HIGH | Public apology + patch removing offending depictions; re-do affected art/cutscenes; long reputation damage. Far cheaper to prevent via pre-launch review. |
| Steam removal for bad AI disclosure | HIGH | Correct the AI survey, possibly re-submit; storefront downtime during a launch window is severe. |
| AI art with no IP protection | MEDIUM-HIGH | Re-edit assets with substantial human work retroactively; can't fully recover already-copied assets. |
| Overlay injection failure | MEDIUM | Move Steam init earlier in main process; may require wrapper-config changes and re-testing per platform. |
| 60fps drops under VFX | MEDIUM | Add offscreen pre-render + particle pooling + caps; architectural if renderer wasn't built for it — cheaper if planned upfront. |
| macOS notarization block | MEDIUM | Set up Developer ID + entitlements + notarization in CI; delays launch if discovered late. |
| Dominant "solved" build | LOW-MEDIUM | Retune boon values in data.js (data-driven design makes this cheap); validate via balance harness/telemetry. |
| Room sameness | MEDIUM | Add layout templates + composition/hazard variation; content work, but incremental. |
| Achievement non-persistence | LOW | Add `StoreStats()` after sets; pump `RunCallbacks()`. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Gods-as-enemies / trivialization | Cultural review (gate before art + store page); enforced in boss/boon design | 2-3 qualified reviewers sign off; no deity is a damage target anywhere |
| AI art no-IP / provenance | Art pipeline / sprite system | Human-edit pipeline + provenance log exists for every shipped asset |
| Steam AI disclosure | Store submission | AI Content Survey submitted, accurate, matches build |
| Overlay injection | Desktop wrapper + Steam integration | Overlay + screenshots work in Steam-launched build on Win + macOS |
| API key / offline / DRM | Steam integration | No publisher key in bundle; full offline launch; achievements persist |
| AI sprite inconsistency | Sprite system / character art | Each animation cycle reviewed in motion; consistent across frames |
| Canvas 60fps under load | Sprite renderer + VFX/combat-juice | FPS held during boss phase 2 + max particles on Steam Deck |
| Electron bloat | Desktop wrapper | RAM/cold-start budget met on Steam Deck; lazy asset loading |
| macOS signing/notarization | CI/CD + desktop wrapper | Notarized build opens via Gatekeeper on clean Mac |
| Boon power creep | Boon depth | Balance harness + telemetry show no dominant build/biome |
| Room sameness | Room variety | ≥3 templates/biome + hazards; composition variation; playtest "feels same" gate |
| Boss telegraphing | Boss encounters | Non-expert playtesters learn patterns; deaths feel earned |
| Gamepad/Deck coverage | Gamepad support phase | Every screen navigable by controller; Deck-verified default config |

---

## Sources

**Steamworks (HIGH — official + developer post-mortem):**
- Steam Cloud — https://partner.steamgames.com/doc/features/cloud
- Steamworks.NET FAQ (overlay injection, achievements, steam_appid.txt) — https://steamworks.github.io/faq/
- Achievements guide — https://partner.steamgames.com/doc/features/achievements/ach_guide
- "One Game, By One Man, On Six Platforms" (macOS dylib entitlements, overlay pain) — https://ruoyusun.com/2023/10/12/one-game-six-platforms.html
- steamworks-ffi-node (JS Steamworks bindings) — https://dev.to/arty_prof/steamworks-ffi-node-a-steamworks-sdk-library-for-javascript-game-frameworks-15h1
- Steam Deck recommendations — https://partner.steamgames.com/doc/steamdeck/recommendations
- Steam Input best practices — https://partner.steamgames.com/doc/features/steam_controller/steam_input_gamepad_emulation_bestpractices

**Steam AI disclosure / AI art legal (MEDIUM-HIGH — multiple credible sources):**
- Steam AI Policy (legal overview) — https://legalmoveslawfirm.com/steam-ai-policy/
- AI-generated game assets: copyright, contracts, platform rules — https://blog.promise.legal/ai-generated-game-assets-legal-guide/
- AI-generated assets: IP & disclosure — https://blog.promise.legal/ai-generated-assets-game-ip-disclosure/
- Steam 2026 AI disclosure indie guide — https://www.strayspark.studio/blog/steam-ai-disclosure-rules-2026-indie-developer-guide
- Steam AI disclosure 2026 update — https://everydayaiblog.com/steam-ai-disclosure-rules-2026-update/

**Electron/Tauri wrapping (HIGH — official + developer reports):**
- Tauri vs Electron for JS games (Steamworks "deal breaker", WebView rendering) — https://jslegenddev.substack.com/p/the-struggle-of-wrapping-a-javascript
- Tauri vs Electron 2026 (bundle/RAM benchmarks) — https://www.pkgpulse.com/blog/best-desktop-app-frameworks-2026
- Tauri macOS code signing — https://v2.tauri.app/distribute/sign/macos/
- Electron performance — https://www.electronjs.org/docs/latest/tutorial/performance

**Canvas 2D performance (HIGH — official):**
- web.dev: Improving HTML5 Canvas performance — https://web.dev/articles/canvas-performance
- web.dev: OffscreenCanvas + Web Worker — https://web.dev/articles/offscreen-canvas
- MDN: Optimizing canvas — https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas

**Roguelite design (MEDIUM — community/critical analysis):**
- Hades vs Dead Cells (variety, power creep) — https://fullsync.co.uk/roguelite-rumble-hades-vs-dead-cells/
- Roguelike power creep analysis — https://gamerant.com/roguelike-roguelite-games-best-power-creep/
- Stat-based meta-progression criticism — https://www.resetera.com/threads/im-starting-to-feel-that-stat-based-meta-progression-is-starting-to-ruin-roguelites-generally-speaking.1509337/

**Cultural sensitivity (MEDIUM-HIGH — documented controversies):**
- SMITE Hindu gods backlash — https://www.rtsguru.com/game/451/article/3419/controversy-over-hindu-gods-in-smite-not-over.html
- Hindus urge SEGA re: deities-as-demons — https://hindupost.in/dharma-religion/hindus-urge-sega-to-discontinue-depicting-hindu-deities-as-demons-in-its-japanese-video-game-series/
- Hindu Gods in Video Gaming (HuffPost) — https://www.huffpost.com/entry/hindu-gods-in-video-gaming_b_2092715

**AI sprite consistency (MEDIUM — vendor + dev community):**
- Spritesheets.AI (consistency problem statement) — https://www.spritesheets.ai/ai-sprite-generator
- PixelLab (pose/keyframe consistency) — https://www.pixellab.ai/

**Steam submission process (MEDIUM):**
- Indie Steam submission tips — https://grimwoodteam.com/indie-game-publishing-steam-submission-process-developer-insights-and-tips/
- Build review timeframes — https://steamcommunity.com/discussions/forum/1/601903025193271417/

---
*Pitfalls research for: indie JS/Canvas roguelite Steam release (Indian mythology theme)*
*Researched: 2026-06-17*
