# CHAKRAVYUHA — Testing, Marketing, Pricing & Improvement Plan

This document covers what comes after the MVP: how to test it, how to grow
it, what to charge for it, when to leave the browser, and which tools to
use (open source first, proprietary where it genuinely pays for itself).

---

## 1. Testing plan

### 1.1 Automated (already in place, extend it)
- `test/smoke.js` simulates full runs headlessly: all bosses, all weapons,
  all boons stacked, death and victory paths, save/load. Run it on every
  change: `node test/smoke.js`.
- **Add a GitHub Action** that runs `node --check js/*.js && node test/smoke.js`
  on every push — free CI for a zero-dependency project.
- **Balance harness next**: extend the simulator to play 500 "average skill"
  runs (probabilistic dodge rates) and report clear rate, time-to-clear, and
  damage share per boon. Target: ~15–25% clear rate for a practiced player,
  runs of 20–30 min, no single boon contributing >35% of total damage.
- **Determinism**: add a seeded RNG mode so bug reports can include a seed
  that reproduces the exact run.

### 1.2 Human playtesting (the part that actually matters for "addicting")
- **Phase 1 — friends & family (now, 5–10 people):** watch them play over
  a screen share, say nothing. Note where they die, what they never use
  (if nobody presses Q, the cast needs better onboarding), and whether they
  immediately hit "Begin Ascent" again after dying. That last one is the
  only metric that matters for a roguelite.
- **Phase 2 — public web demo (itch.io, 100–1,000 players):** add a tiny
  anonymous telemetry ping (a single POST on run end: weapon, biome reached,
  time, boons taken — use an open-source stack like Plausible/self-hosted
  endpoint; show a clear opt-out). Funnel to watch: % of players who finish
  run 1 → start run 2 → reach Patala → beat Tataka. The run-2 start rate is
  your north star; under 50% means the first death isn't motivating enough.
- **Phase 3 — structured playtests:** Steam Playtest feature (free) once a
  Steam page exists; Discord community testers get build access in exchange
  for filling a 5-question form (fun 1–10, fairness of deaths, favorite god,
  least-read UI element, would-you-pay).
- **Cultural review:** before any paid release, have 2–3 reviewers with deep
  Ramayana/Mahabharata knowledge (academics or practitioners) review names,
  iconography, and tone. Hindu mythology is living religion, not just lore —
  reverence in the codex and avoiding gods as *enemies* (only asuras/rakshasas
  oppose you; the devas help) is already the right structure. Keep that line.

### 1.3 Technical QA matrix
- Browsers: Chrome, Firefox, Safari (WebAudio quirks live here), Edge; one
  low-end laptop (integrated GPU) — target 60fps with 60+ entities.
- Input: 60%-keyboard, trackpad (dash usability!), and add gamepad support
  early — roguelite players expect it.
- Save integrity: corrupt-localStorage test, private-browsing fallback.

---

## 2. Marketing plan

### 2.1 Positioning
One sentence that sells itself: **"Hades meets the Mahabharata."**
The hook is genuinely novel — there is no prominent Indian-mythology
roguelite, while Hades proved the formula and *Raji: An Ancient Epic*
proved Western audiences want Indian settings. Two audiences:
1. Global roguelite players (Hades, Dead Cells, Slay the Spire fans).
2. The Indian gaming market — fast-growing, underserved by premium games
   about its own stories, and intensely shareable when done respectfully.

### 2.2 Channel sequence (cheap → paid)
1. **Now (web MVP):** itch.io page + GitHub Pages link. Post devlogs on
   itch and r/roguelites, r/IndianGaming, r/incremental_gamedev. The
   "Abhimanyu never learned the way out — so death is a tutorial" pitch is
   a great first devlog title.
2. **Build in public:** short clips (boss intros, a Sudarshana build melting
   a room) on X/Twitter, YouTube Shorts, Instagram Reels. Hindi + English
   captions. Mythology context threads ("the real story of Ahiravana")
   perform disproportionately well — the lore IS the marketing.
3. **Steam page as early as possible** (even before the Steam build):
   wishlists compound. Target 7–10k wishlists before launch consideration.
4. **Steam Next Fest** with a polished demo (first biome free).
5. **Creators:** Indian gaming YouTubers (huge reach, hungry for Indian-made
   premium games) + roguelite streamers (Northernlion-tier is the dream;
   mid-size variety streamers are the realistic, high-ROI tier). Press kit
   with GIFs, key art, and the one-liner.
6. **Festivals/grants:** IGF, Day of the Devs, India GDC; consider publishers
   specializing in indies (Devolver, Annapurna-tier is a lottery ticket;
   smaller ones like Akupara are realistic).

### 2.3 Community
Discord from day one of the public demo. Channels: build-sharing, lore,
speedruns (the 20–30 min run length makes speedrunning natural), and a
feedback forum that you visibly act on. Roguelite communities are retention
engines — daily-run leaderboards later will keep it alive between updates.

---

## 3. Pricing plan

| Stage | Price | Why |
|---|---|---|
| Web demo (now) | **Free, forever** | Funnel + goodwill. First biome only in later builds; today the full MVP is the demo. |
| itch.io full build | **Pay-what-you-want, $5 suggested** | Validates willingness to pay with zero friction. |
| Steam Early Access | **$14.99** | Roguelite sweet spot (Hades launched EA at $19.99 with far more content; Dead Cells EA at $16.99). Underpricing signals low quality; over $15 demands more content than an MVP+. |
| 1.0 launch | **$19.99** with a 10–15% launch discount | Raise at 1.0 — EA buyers feel rewarded, reviewers note the value. |
| India / regional | **Aggressive regional pricing** (₹399–₹499 tier) | Critical for the home market; Steam's recommended regional tiers are too high for India. |
| DLC later | Free content updates through 1.0, paid expansion only after | The Hades playbook: free updates build the review score that sells the game. |

No ads, no microtransactions, no gacha — they would poison both the genre
audience and the cultural positioning.

---

## 4. Improvement roadmap

### 4.1 Near term (in this codebase, weeks)
- **Gamepad support** and key rebinding.
- **Juice pass:** hitstop on heavy hits, better death animations, boss
  intro slow-mo, per-biome parallax backdrops.
- **Duo boons** (Hanuman+Vayu "Son of the Wind", Krishna+Arjuna-themed
  Gandiva synergies) and **legendary boons** — the build-variety engine.
- **Keepsakes** (Subhadra's locket, Uttara's ribbon, Krishna's feather —
  equip one per run for a passive) and **NPC gifting** for story beats.
- **Heat system** ("Yama's Decree") for post-victory difficulty scaling.
- **More story:** dialogue between Abhimanyu and each god on first boon;
  Yama's post-victory negotiations (the Savitri precedent is the natural
  story engine for repeated escapes).
- Daily seeded run + local leaderboard.

### 4.2 Medium term (months)
- Weapon aspects (each weapon ×3 mythological aspects, e.g. Khanda of
  Abhimanyu / of Rama / of Kalki).
- 2 more gods (Surya for crits — Karna's father, delicious dramatic irony
  against the Pandava hero; Saraswati for astra/utility builds).
- Real art pass: commissioned 2D sprites in a Madhubani/Pattachitra-inspired
  style would be a unique visual identity no other roguelite has. Music:
  recorded tanpura/tabla/bansuri layers replacing the synth drone.
- Mobile-web touch controls (twin-stick) — India is mobile-first.

### 4.3 Engine decision: when to leave the browser
**Stay open source as long as possible — and you can, all the way.**

- **Now (prototype/MVP): vanilla Canvas — correct choice.** Zero friction,
  instant web distribution, trivially testable, everything you learn
  transfers.
- **For the commercial build: Godot 4 (MIT license, open source).**
  This is the recommendation. It gives you: real 2D engine features
  (particles, lighting, shaders, tilemaps), C#/GDScript, gamepad support,
  and one-click export to **Windows/Mac/Linux/Steam Deck, mobile, AND
  HTML5** — so you keep the free web demo from the same codebase. Hades
  itself ran on a small custom 2D engine; Godot is more engine than
  Supergiant had.
- **Unity (proprietary):** only if you need its asset-store ecosystem or
  hire developers who know it. Post-2023 pricing drama makes Godot the
  safer bet at indie scale.
- **Unreal (proprietary): not recommended for this game.** Unreal earns its
  5% royalty for 3D, AAA lighting, and large teams. For a stylized 2D
  top-down roguelite it adds build complexity, huge binaries, weak 2D
  tooling, and no advantage. The only scenario to consider it: a sequel
  pivoting to full 3D isometric with high-end VFX *and* a funded team.
- Proprietary tools that ARE worth paying for, when revenue justifies:
  **Aseprite** (~$20, sprite art, source-available), **FMOD/Wwise**
  (free at indie revenue tiers, for adaptive music — the tanpura drone
  shifting ragas per biome and intensifying in boss fights is an audio
  identity worth investing in), and **Steamworks** ($100 app fee).

### 4.4 Sequencing
1. Weeks 1–4: playtest loop on the web MVP, juice pass, gamepad, telemetry.
2. Months 2–4: port to Godot once design is validated (port the *design*,
   `data.js` is the spec); commission art test pieces; Steam page live.
3. Months 4–8: content depth (aspects, duos, keepsakes, heat), demo at
   Next Fest, build wishlists.
4. Month 8+: Early Access at $14.99 when the run has ~3 builds per weapon
   worth chasing and 10+ hours of meta progression.

---

*The MVP in this folder is the playable argument for all of the above.
If the run-2 start rate is high, everything else is execution.*
