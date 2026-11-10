# Feature Research

**Domain:** Commercial action roguelite (Hades-like) for Steam
**Researched:** 2026-06-17
**Confidence:** HIGH (Steam Deck/Steamworks reqs from official docs; roguelite design patterns from player/critic consensus across multiple sources)

## Scope Note

This research covers what a paid action-roguelite needs to *ship* on Steam in 2024-2025 without tanking its review score, and where Hades-likes win or lose. Chakravyuha already has the core loop (4 biomes, 4 bosses, 3 weapons, 6 gods, meta progression, audio). The gaps that move the needle are: **platform/QA table stakes** (controller, settings, achievements, cloud, Steam Deck), **game feel**, and **build/content depth**. The existing PROJECT.md "Active" list already aligns well with the table stakes below — this document confirms, prioritizes, and flags what's commonly under-scoped.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these draws explicit negative reviews ("no controller support," "couldn't rebind keys," "tiny text on Deck"). Users give zero credit for having them but punish their absence.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Full gamepad support (no setup required) | Roguelite audience plays on controller/Deck; Steam Deck Verified *requires* controller works with zero in-game config changes | HIGH | Must drive 100% of UI + combat from pad. Use SteamInput API for glyphs. This is the single biggest engineering lift for a vanilla-JS game with no input abstraction. |
| Correct on-screen button glyphs | Steam Deck Verified: glyphs must match active input (Deck/Xbox names); K&M glyphs must hide when pad is active | MEDIUM | SteamInput API auto-manages this. Hardcoded "Press E" prompts fail verification. |
| Settings menu: resolution, fullscreen, vsync | Baseline PC expectation; verified default config must hit playable framerate at 1280x800 | MEDIUM | Electron/Tauri window control. |
| Volume sliders (master/SFX/music separate) | Universal expectation; absence is a common review ding | LOW | Game already has WebAudio; wire to sliders. |
| Full control rebinding (keyboard + pad) | Accessibility baseline; "can't rebind" is a recurring complaint | MEDIUM | Needs an input-mapping layer the vanilla codebase likely lacks today. |
| Text legible at 1280x800 / 12" away | Steam Deck Verified: smallest font >= 9px at 1280x800 | LOW-MEDIUM | Audit all HUD/menu/boon-card text. Canvas-drawn text often too small. |
| 15+ Steam achievements | Standard for paid titles; drives engagement + completionist reviews | MEDIUM | Steamworks SDK via Electron/Tauri bridge. Already scoped (15+). |
| Steam Cloud saves | Expected; "lost my save" / "no cloud" tanks reviews. Deck + desktop users assume sync | MEDIUM | Map localStorage to a save file Steam Cloud syncs. Test cross-machine + local-delete restore. |
| Steam Overlay support | Shift+Tab must not crash/freeze/lose audio | LOW-MEDIUM | Electron needs overlay-compatible config; test explicitly. |
| Pause + quit-to-menu mid-run, save-and-quit | Roguelite runs are long; players must stop safely | MEDIUM | "Save anytime / play at your own pace" now an expected accessibility courtesy. |
| Screen-shake toggle | Now a Steam-tagged accessibility expectation; juice without an off-switch generates motion-sickness complaints | LOW | Critical *because* you're adding heavy juice this milestone. |
| Colorblind-safe design / option | Increasingly expected; Steam surfaces accessibility tags on store pages (2025+) | LOW-MEDIUM | At minimum don't encode critical info in color alone (boon rarity, hazard warnings). |
| Run summary / death screen | Players expect feedback on what happened (depth reached, boons, time) | LOW | Reinforces meta-progress signal; cheap, high value. |
| Clear meta-progression UI | Players must see what unlocks exist and what they're spending on | MEDIUM | "Path of Dharma" exists; needs readable, controller-navigable UI. |

### Differentiators (Competitive Advantage)

Where a Hades-like actually wins. These align with PROJECT.md Core Value ("builds players want to talk about"). Hades' moat is **narrative accessibility + mechanical depth + reactive polish** — not any single feature.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Strong cohesive art direction | #1 wishlist/store-page driver; the visual leap from canvas primitives to illustrated sprites is what makes it *look* commercial | HIGH | Hades/Dead Cells target. AI-art pipeline is the project's biggest quality risk — consistency across sprites is hard. |
| Combat juice (hit sparks, screen shake, freeze-frames, camera punch, impact SFX) | The difference between "tech demo" and "feels good." Hollow Hades-clones fail *here* most visibly | MEDIUM | Layer incrementally: hitstop > particles > shake > camera. Cheap to add, enormous perceived-quality return. Always pair with toggles. |
| Build variety via boon synergies / Duo Boons | The talked-about-builds engine. Hades' core strength; clones that copy surface but lack synergy "feel hollow" | HIGH | PROJECT scopes 24 boons + 3 duos. More named synergies = more replay. This is the highest-leverage *gameplay* differentiator. |
| Multi-phase, telegraphed bosses | Boss fights are the memory players carry; phases + clear tells = "fair but hard" praise | MEDIUM-HIGH | Telegraphing is what separates "fair" from "unfair death" complaints. |
| Indian-mythology IP + narrative framing | Unique positioning vs Greek/generic-fantasy saturation; novelty is a genuine wishlist hook | MEDIUM | Cultural-reverence constraint is also a differentiator if done well. Light narrative beats between runs (Hades-style) deepen retention cheaply. |
| Enemy + room variety | Repeatedly cited gap even *in Hades*; fresh enemies/traps/layouts keep run N feeling different from run 1 | MEDIUM | PROJECT scopes 3 layouts/biome + hazards. Variety is the antidote to "wears thin after a few runs." |
| Difficulty modifiers (Hades "Pact of Punishment" style) | Lets players self-select challenge; extends endgame, aids accessibility | MEDIUM | Optional escalating modifiers > a flat difficulty slider for this genre. Defer-able to v1.x. |
| Distinct weapon feel + weapon aspects/variants | Replay through playstyle, not just stats | MEDIUM | 3 weapons exist; aspect-style variants are a strong v1.x expansion. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Mandatory grind-to-be-viable meta progression | "Reward for losing" feels motivating on paper | #1 cited roguelite complaint: "paying the farm tax to actually play is bad design." Runs feel like mindless grind before you're effective | Make run-skill the primary path to victory; keep meta as *option breadth* (new boons/weapons) not raw required stat walls. Player should be able to win on skill before maxing meta. |
| Unfair / unreadable deaths | Hard = hardcore appeal | Top driver of negative reviews. Off-screen shots, untelegraphed boss moves, hazards blending into background read as "cheap" | Telegraph every attack; readable hazards (color + shape + audio); generous i-frames on dash (already exists). |
| Over-juiced screen with no toggles | Juice = polish | Late-game particle/enemy density tanks framerate (cited complaint) and causes motion sickness; can hide threats | Performance budget for VFX; LOD/particle caps; mandatory screen-shake + flash toggles. |
| Excessive RNG that trivializes or bricks runs | "Builds" appeal | Some combos "trivialize difficulty, removing challenge"; others brick a run | Bound the variance: guarantee build-enabling choices, cap stacking, avoid dead-end boon pools. |
| Procedurally generated room layouts | "Infinite variety" | Procgen "feels unfair," needs heavy tuning, fragile to balance — already correctly out-of-scope in PROJECT.md | Hand-crafted layout templates + shuffled spawns/hazards. Faster to ship, easier to balance. |
| Full engine migration for "real" polish | "JS can't ship a commercial game" | Massive risk/time sink; correctly out-of-scope | Juice + art direction deliver 90% of perceived polish on the existing stack. |
| Heavy story gating progression | Narrative depth is a differentiator | Forcing long story to access gameplay frustrates the action audience | Hades model: story is *optional flavor* between runs, never a wall. |

## Visual Upgrade: Prototype → Ship (Specifically Requested)

How successful indie roguelites cross the "looks like a prototype" → "looks commercial" gap:

- **Art direction > fidelity.** A *cohesive* style beats high-detail inconsistency. The #1 risk for AI-generated assets is style drift across sprites — establish a locked style reference (palette, line weight, lighting direction, silhouette rules) before generating the full set. Strong silhouettes (the stated Hades/Dead Cells target) read better than detail.
- **Juice carries the perceived leap.** Hitstop/freeze-frames, hit sparks, screen shake, squash-and-stretch, and impact SFX make even modest art "feel" expensive. This is the highest ROI polish work and is largely engine-side (no new art needed). Prototype the juice layer early, then refine.
- **Layered VFX, gated by performance + toggles.** Add particles for hits, astra casts, dash trails, ambient biome motion — but budget them; the recurring shipped-game complaint is late-game particle density killing framerate.
- **Silhouette/readability first, decoration second.** Player, enemies, hazards, and projectiles must each be instantly distinguishable. AI art often over-renders backgrounds, making gameplay-critical elements blend in — enforce contrast between actors and environment.
- **UI is part of the art.** Styled overlays, boon-card art, and HUD with consistent motifs (the Indian design language here) signal "commercial." Cohesive UI is disproportionately responsible for the "this is a real product" impression.
- **Store-page art is a feature.** Capsule art + 6 screenshots + trailer are what convert wishlists; budget the *best* sprite output toward marketing-visible moments.

## Feature Dependencies

```
Sprite/renderer system
    └──requires──> Asset pipeline (AI gen -> cleanup -> frame extraction)
                       └──requires──> Locked style reference (consistency gate)

VFX/particle system ──enhances──> Sprite system
Combat juice (hitstop/shake/camera) ──enhances──> Sprite system + VFX
    └──requires──> Screen-shake toggle (accessibility) before ship

Gamepad support
    └──requires──> Input-abstraction layer (decouple key codes from actions)
                       └──enables──> Control rebinding
                       └──enables──> SteamInput glyphs
                       └──required-by──> Steam Deck Verified

Steam integration (achievements/cloud/overlay)
    └──requires──> Electron/Tauri desktop wrapper + Steamworks bridge
        Cloud saves ──requires──> localStorage -> save-file migration

Boss phases + telegraphing ──requires──> Boss sprite phase variants (art)
Duo/synergy boons ──requires──> Boon system depth (24 boons) first
Difficulty modifiers ──enhances──> replay; independent, defer-able
```

### Dependency Notes

- **Gamepad blocks Steam Deck Verified AND rebinding AND glyphs.** Build the input-abstraction layer first; it's the keystone for three table-stakes items. The vanilla codebase likely reads key codes directly — this refactor is the riskiest plumbing work.
- **Style reference gates the entire art pipeline.** Generating sprites before locking style guarantees rework. Consistency is the make-or-break of the AI-art approach.
- **Cloud saves require the save format to be a syncable file**, not just localStorage — plan the migration when adding the Electron/Tauri wrapper, not after.
- **Boss phase art depends on the sprite pipeline**; sequence boss-art generation after the player/enemy style is proven.
- **Screen-shake/flash toggles must land in the same phase as the juice**, or you ship an accessibility/QA gap.

## MVP Definition

### Launch With (v1) — required to not tank reviews

- [ ] Full gamepad support, zero-config — Steam Deck Verified + genre expectation
- [ ] Control rebinding (KB + pad) — recurring review ding if absent
- [ ] SteamInput glyphs matching active device — Verified requirement
- [ ] Settings: resolution, fullscreen, vsync, separate volume sliders — baseline
- [ ] Text legible (>=9px @ 1280x800) — Verified requirement
- [ ] 15+ achievements — paid-title standard
- [ ] Steam Cloud saves (tested cross-machine + restore) — "lost save" prevention
- [ ] Steam Overlay non-breaking — Verified seamlessness
- [ ] Pause + save-and-quit mid-run — long-run safety
- [ ] Screen-shake / flash toggles — accessibility + you're adding heavy juice
- [ ] Cohesive sprite art across player/enemies/bosses/biomes — the commercial-look threshold
- [ ] Combat juice (hitstop, sparks, shake, camera, impact SFX) — "feels good" threshold
- [ ] Multi-phase telegraphed bosses — avoids "unfair death" reviews
- [ ] 24 boons + 3+ named synergies — the talked-about-builds engine (Core Value)
- [ ] Room/layout/hazard variety per biome — anti "wears thin"
- [ ] Run-summary / death screen — meta-progress feedback
- [ ] Store-page assets (capsule, 6+ screenshots, trailer) — wishlist conversion

### Add After Validation (v1.x)

- [ ] Difficulty modifiers (Pact-style) — add once base balance is proven; extends endgame
- [ ] Weapon aspects/variants — when core weapons feel good; multiplies replay
- [ ] More duo/synergy boons + boon rarities — expand on positive reception
- [ ] Additional enemy types / movesets — directly answers the "variety wears thin" critique
- [ ] Colorblind preset modes (beyond color-safe design) — when accessibility tags are populated

### Future Consideration (v2+)

- [ ] Linux/Proton-tuned build — already deferred; add on wishlist demand
- [ ] Switch port — separate project per PROJECT.md
- [ ] New biome/boss content drops — post-launch retention, per reception

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Gamepad + input-abstraction layer | HIGH | HIGH | P1 |
| Steam integration (achievements/cloud/overlay) | HIGH | MEDIUM | P1 |
| Settings menu + rebinding + volume | HIGH | MEDIUM | P1 |
| Combat juice + toggles | HIGH | MEDIUM | P1 |
| Cohesive sprite art (consistency-gated) | HIGH | HIGH | P1 |
| Boon depth + synergies (Core Value) | HIGH | HIGH | P1 |
| Boss phases + telegraphing | HIGH | MEDIUM | P1 |
| Room/hazard variety | MEDIUM-HIGH | MEDIUM | P1 |
| Text legibility / Deck readability pass | MEDIUM | LOW | P1 |
| Run summary / death screen | MEDIUM | LOW | P1 |
| Difficulty modifiers | MEDIUM | MEDIUM | P2 |
| Weapon aspects/variants | MEDIUM | MEDIUM | P2 |
| Additional enemy variety | MEDIUM | MEDIUM | P2 |
| Colorblind preset modes | LOW-MEDIUM | LOW-MEDIUM | P2 |
| Linux build / Switch | LOW (now) | HIGH | P3 |

## Competitor Feature Analysis

| Feature | Hades | Dead Cells | Our Approach |
|---------|-------|------------|--------------|
| Build variety engine | Boons + Duo Boons + weapon aspects | Mutations + weapon synergies | 24 god boons + 3+ named Duo Boons + weapon feel; expand aspects in v1.x |
| Narrative integration | Deep, between-run dialogue, central to identity | Light, environmental | Light Indian-mythology beats between runs; optional, never gating |
| Art direction | Illustrated, strong silhouettes | Pixel + fluid animation | Illustrated/stylized (Hades-adjacent), AI-generated, consistency-gated |
| Combat feel/juice | Industry benchmark | Industry benchmark | Hitstop + sparks + shake + camera + impact SFX, all toggleable |
| Difficulty scaling | Pact of Punishment (player-chosen) | Boss Cells (unlocked tiers) | Difficulty modifiers in v1.x |
| Enemy/level variety | Good early, criticized as thin late | Strong | Hand-crafted layout templates + hazards + enemy variety as ongoing focus |
| Accessibility | God Mode (escalating damage resist) | Assist mode | Screen-shake/flash toggles + difficulty modifiers + color-safe design |

## Sources

- [Steam Deck Compatibility Review Process — Steamworks (official)](https://partner.steamgames.com/doc/steamdeck/compat) — Verified checklist: zero-config controller, glyph matching, 9px text @ 1280x800, playable default config, overlay seamlessness
- [Accessibility Features — Steamworks (official)](https://partner.steamgames.com/doc/accessibility_features) — colorblind modes, screen-shake toggle, granular difficulty
- [Steam Cloud — Steam Support (official)](https://help.steampowered.com/en/faqs/view/68D2-35AB-09A9-7678) — cloud save expectations
- [Steam Launch QA Checklist — Bugnet](https://bugnet.io/blog/steam-launch-qa-checklist) — achievement/cloud/overlay test procedures
- [Hades is a great rogue-lite with disappointing Enemy and Level Variety — ResetEra](https://www.resetera.com/threads/hades-is-a-great-rogue-lite-with-a-disappointing-enemy-and-level-variety.799041/) — variety-wears-thin critique
- [Roguelike vs Roguelite (Hades 2 / Slay the Spire 2) — Switchblade Gaming](https://www.switchbladegaming.com/strategy-games/roguelike-vs-roguelite-explained/) — meta-progression signal value
- [HADES Proves Roguelikes Don't Have To Be About Getting Good — Merry Go Round Magazine](https://merrygoroundmagazine.com/hades-proves-roguelikes-dont-have-to-be-about-getting-good/) — narrative-accessibility moat
- ["I HATE roguelite designed around unlock to feel good" — Hades II Steam Discussions](https://steamcommunity.com/app/1145350/discussions/0/4358999171576511867/) — grind/farm-tax anti-pattern
- [Squeezing more juice out of your game design — GameAnalytics](https://www.gameanalytics.com/blog/squeezing-more-juice-out-of-your-game-design) and [Game Developer](https://www.gamedeveloper.com/design/squeezing-more-juice-out-of-your-game-design-) — juice as core design layer
- [The Seductive Squeeze: When 'Juice' Becomes a Crutch — Wayline](https://www.wayline.io/blog/the-seductive-squeeze-when-juice-in-game-development-becomes-a-crutch) — over-juice/performance caution
- [New roguelite-RPG lands "Very Positive" — Notebookcheck](https://www.notebookcheck.net/Steam-New-roguelite-RPG-lands-with-Very-Positive-reviews-and-launch-discount.1301095.0.html) — late-game particle/perf and balance complaints

---
*Feature research for: Commercial action roguelite (Hades-like) on Steam*
*Researched: 2026-06-17*
