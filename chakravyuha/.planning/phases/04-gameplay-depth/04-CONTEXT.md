# Phase 4: Gameplay Depth - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning (decisions delegated by user; recommended defaults locked below)
**Executes:** AFTER Phase 3 (VFX + Combat Juice) merges. Phases 2/3/5 run in parallel with planning.

<domain>
## Phase Boundary

Deliver the Core Value content: deep boon pool with named Duo synergies, multi-phase
telegraphed bosses, and per-biome room layouts + environmental hazards.

**In scope:** GAME-01..GAME-06 — boon audit + Duo Boons, boss phase-2 movesets + universal
telegraphing, data-driven room layout templates with obstacle collision, one hazard per biome,
smoke-test coverage for all of it.

**Out of scope:** Sprites/VFX for new content (Phases 2/3 — new content draws with existing
Canvas primitives on the bridge ctx), input/settings/gamepad (Phase 5), Steam (Phase 6),
SEED-001 masked stance (deferred, see below), boss phase-art variants.
</domain>

<audit>
## Codebase Audit (2026-09-25, against HEAD a837fe5)

### GAME-01 — Boon pool: ALREADY MET (verify-only)
`DATA.BOONS` in js/data.js holds **27 boons**:

| God | Count | Boon ids |
|-----|-------|----------|
| Hanuman | 5 | han_attack, han_special, han_cast, han_hp, han_bhakti |
| Agni | 4 | agni_attack, agni_special, agni_cast, agni_ghee |
| Indra | 4 | indra_attack, indra_special, indra_cast, indra_tribute |
| Vayu | 5 | vayu_dash, vayu_attack, vayu_cast, vayu_speed, vayu_gust |
| Krishna | 4 | kri_attack, kri_special, kri_cast, kri_lila |
| Durga | 5 | dur_kavacha, dur_special, dur_dash, dur_cast, dur_thorns |

27 >= 24 and every god >= 4. No new single-god boons required. Phase 4 only adds a smoke
assertion locking the count (>= 24 total, >= 4 per god) so it cannot regress.

### GAME-02 — Duo Boons: GAP (none exist)
No duo concept anywhere. `Player.val(id)` looks up `DATA.BOONS` only; `UI.offerableBoons`
filters `DATA.BOONS` by `b.god`. Duos must live in a separate `DATA.DUO_BOONS` array so the
single-god offer logic and data-integrity checks (`DATA.GODS[b.god]`) are untouched.

### GAME-03 — Room layouts: GAP
`ROOMS.buildArena()` scatters 0-3 random circle pillars. No templates, no rects, no pits, no
per-biome identity. Collision: `clampToArena()` (entities.js) pushes out of circle pillars;
game.js projectile loops kill projectiles on circle pillars. Enemy spawns in `spawnWave()` do
not check pillars. Player spawn = (arena.x+90, arena.y+h/2); doors at x = arena.x+w-36,
y = h*(i+1)/(n+1) for n in {1,2}.

### GAME-04 — Hazards: GAP
No environmental hazards. Existing reusable pieces: `GAME.zones` (player-owned fire pools /
cyclones — damages enemies only), `GAME.dangerZones` (boss slam telegraph circles, drawn in
renderBackground), `Enemy.slowT/slowF`.

### GAME-05 — Multi-phase bosses: PARTIAL
`Boss` has `phase` 1->2 at 50% HP, but phase 2 only changes numbers: speedMul 1.3,
radial 10->16 shots, spiral 2->3 arms, slam 2->4 circles, summon 2->3. **No boss gains a new
attack in phase 2** — fails "changed behavior (new attacks, not just speed)". Kumbhakarna has
an extra sleep "phase 0" (wakes at 78% HP). Move tables live in `Boss.pickMove()`.

### GAME-06 — Telegraphs: PARTIAL
| Boss state | Damages? | Wind-up today | Verdict |
|------------|----------|---------------|---------|
| radialWind | yes (shots at end) | circle telegraph 0.7s | OK |
| chargeWind -> charging | yes (contact) | line telegraph 0.6-0.7s | OK |
| slamWind | yes (AoE) | dangerZones circles 1.1s | OK |
| spiral | yes (shots immediately) | **none** | GAP |
| noose (Yama) | yes (pull + contact) | **none** (pull starts instantly) | GAP |
| chase | yes (`touchAttack` contact) | **none** | GAP |
| summon | no direct dmg | none (minions have 0.6s spawn mandala) | add marker for readability |
| teleport | no | none | add destination marker |

Telegraph rendering: `Enemy.draw`/`Boss.draw` support `telegraph.type` 'line' | 'circle' only.
`SPRITES.animForEntity` (js/sprites.js, NOT editable) maps any state matching `/Wind$/` or in
ATTACK_STATES to the 'attack' anim — so **all new wind-up states MUST be named `<moveId>Wind`**
to animate correctly for free.

### Smoke baseline
`node test/smoke.js` green at audit time (boot, sprite helpers, data integrity, god-mode full
run to victory, weak-player death, all-boons stress 4000 frames, meta, gandiva/gada runs,
provenance). Run 3 label says "all 25+ boons" and iterates `DATA.BOONS` only.
</audit>

<decisions>
## Implementation Decisions (LOCKED — user delegated, recommended defaults)

### Boons & Duos
- **D-01:** No new single-god boons (27 already satisfy GAME-01). Add a smoke assertion:
  total >= 24 and each of the 6 gods >= 4.
- **D-02:** Add **6 Duo Boons** in a new `DATA.DUO_BOONS` array (one per god pair below; each god
  appears exactly twice). Shape: `{ id, duo: true, gods: [godA, godB], god: godA, slot: 'passive',
  name, base, desc: v => string, req: { [godA]: [boonIds], [godB]: [boonIds] }, lore }`.
  - `duo_pavanaputra` — **Pavanaputra** (Hanuman + Vayu; Hanuman is the son of Vayu)
  - `duo_khandava` — **Khandava Firestorm** (Agni + Indra)
  - `duo_yogamaya` — **Yogamaya's Veil** (Krishna + Durga; Yogamaya/Durga is Krishna's sister)
  - `duo_marut` — **Marut Gana** (Indra + Vayu; the storm-host that rides with Indra)
  - `duo_jwalamukhi` — **Jwalamukhi** (Agni + Durga; the Mother as flame)
  - `duo_kapidhvaja` — **Kapidhvaja** (Hanuman + Krishna; Hanuman on the banner of the chariot
    Krishna drove — Abhimanyu's father's chariot)
- **D-03:** Gating = owning **at least one boon from each god's `req` list** (the req lists are
  subsets of that god's boons chosen so the duo effect is always meaningful). This refines the
  user default "one boon from each of two gods" without breaking it.
- **D-04:** Duo is surfaced as a special offer: when `UI.offerBoon` rolls a god that belongs to
  at least one eligible, un-owned duo, the duo card is **placed first** in the choice list
  (replacing one regular card when the list is full). Card carries a `duo: true` flag rendered
  as class `duo`, a two-color border/gradient (both god colors, inline style — no CSS file edit),
  and a header `DUO · <GodA> + <GodB>`. Duos are passives (never displace slot boons), roll
  rarity like normal boons, and are Amrit-upgradable.
- **D-05:** `Player.val(id)` must resolve both arrays via a lookup helper
  (`DATA.findBoon(id)`), not `DATA.BOONS.find` directly.

### Bosses
- **D-06:** **Telegraph invariant:** every damaging boss action goes through two Boss helpers —
  `this.hurtPlayer(amount)` and `this.shoot(vx, vy, dmg, r)` — which are only legal while
  `this.armed` is set. `armed` is set exclusively when a wind-up completes (`this.arm(move)`)
  and cleared on `pickMove()/startMove()/phaseShift/rest`. Any unarmed damage call is recorded
  in a module-level `BOSS_TG.violations` array (and still applied, so gameplay never breaks).
  Smoke asserts the array is empty.
- **D-07:** Minimum visible wind-up = **0.4s** for every damaging boss move (0.45s for the
  melee swipe). Wind-up state name = `<moveId>Wind` (sprite anim mapping, see audit).
- **D-08:** Bosses deal **no passive contact damage**. `chase` becomes pure movement; when the
  player is within reach it transitions to a telegraphed `swipe` (cone). `charging` contact
  damage stays (it is armed by `chargeWind`).
- **D-09:** New telegraph shapes: `cone` (a, arc, r) and `ring` (r0, r1) drawn in `Boss.draw`,
  plus world-anchored `this.marks[]` (lines/circles not centered on the boss) for multi-marker
  attacks. Keep existing `line`/`circle` and `GAME.dangerZones` for slam-style circles.
- **D-10:** Move tables become data: `const BOSS_MOVESETS` in **js/entities.js** (not data.js,
  to keep data.js out of the boss plan) keyed `[bossId][phase]`, entries
  `{ id, w, wind, active, dmg: bool }`. Phase 2 table MUST contain >= 2 move ids absent from
  phase 1 (the "new attacks"). Speed multiplier 1.3 in phase 2 is kept.
- **D-11:** Phase transition at 50% HP enters a `phaseShift` state (1.2s, no damage, clears
  telegraphs/dangerZones/noose, `UI.banner` with a phase-2 title, `burst()` + `GAME.shake`),
  then **deterministically** opens with that boss's signature phase-2 move (first entry flagged
  `opener: true`), then weighted-random.
- **D-12:** Phase-2 new moves (2 per boss):
  - Tataka ("THE FOREST HUNGERS"): `leap` (circle marker at player's position, 0.9s, lands with
    AoE + 8-shot ring) — opener; `maw` (cone 110deg, r 240, 0.7s wind).
  - Ahiravana ("THE FIVE LAMPS BURN"): `lamps` (5 world markers around arena center, 1.0s wind,
    each emits a 6-shot ring) — opener; `crossBeams` (two perpendicular full-arena line marks
    crossing at the player, 0.9s wind, band damage).
  - Kumbhakarna ("THE MOUNTAIN RISES"): `quake` (ring telegraph 0.8s, then an expanding
    shockwave ring 380px/s that hits once when its front crosses the player; dash i-frames
    dodge it) — opener; `roar` (cone 80deg, r 320, 0.8s wind, damage + knockback).
  - Yama ("THE LEDGER IS OPENED"): `ledger` (3 full-width horizontal line marks at the player's
    y and y +/- 140, 1.0s wind) — opener; `danda` (cone 300deg with a 60deg safe wedge behind
    him, r 200, 0.8s wind).
- **D-13:** Yama framing — **mechanics unchanged in this phase.** See Flagged for User below.
  Do not add any new hostile framing/text for Yama; new Yama move names use judgment/ledger
  vocabulary ("ledger", "danda of judgment"), never "attack of the god".

### Rooms & Hazards
- **D-14:** Room templates are data: `DATA.LAYOUTS[biomeId] = [ { id, name, obstacles: [...] } ]`
  with **normalized coordinates** (fractions of arena w/h; circle `r` in px). Obstacle kinds:
  `pillar` (circle, blocks movement + projectiles), `wall` (rect, blocks movement + projectiles),
  `pit` (circle or rect, blocks movement for player AND enemies, projectiles pass over).
  >= 3 templates per biome (plan ships 3 each = 12 new templates). Chosen randomly per non-boss
  room, never the same template twice in a row. Boss arenas stay open.
- **D-15:** Spawn/door clearance and reachability are enforced by smoke: no obstacle within
  80px of the player spawn point or within (door.r + 24)px of any possible door position; all
  obstacles inside the arena; grid flood-fill (player radius inflation) from spawn reaches every
  possible door position. `spawnWave` rejects enemy spawn points inside/near obstacles.
- **D-16:** Collision stays in the shared helper `clampToArena()` (entities.js) generalized to
  circle + rect + pit; projectile blocking goes through `ROOMS.blocksProjectile(p)` called from
  the game.js projectile loops. `GAME.pillars` remains the obstacle array name (entries gain
  `shape` and `kind`) so nothing else breaks.
- **D-17:** One hazard per biome, data in `DATA.HAZARDS` + `biome.hazard` id:
  - Naraka `fireVent` — vents cycle dormant -> warn (0.9s pulsing marker) -> erupt (0.6s); hurts
    player and enemies once per eruption.
  - Patala `venomPool` — always-visible bubbling pools; player slowed 40% + 6 dmg/s tick while
    inside; enemies slowed (nagas immune).
  - Ranabhoomi `arrowVolley` — periodic ground marker (1.1s shrinking fill) at the player's
    position +/- jitter, then arrows land; hurts player and enemies inside.
  - Vaitarani `riverCurrent` — a horizontal current band with animated chevrons; constant push
    (120px/s) on player and enemies, telegraphed surges (0.8s brighten -> 1.5s at 260px/s).
  Damaging hazards follow the same telegraph-before-damage rule (>= 0.6s warn), logged to
  `GAME.hazardViolations` and asserted empty by smoke. Hazards are active only in
  `state === 'combat'` of non-boss combat rooms (go dormant on room clear; none in boss,
  sarovar or kubera rooms).
- **D-18:** New content renders with existing Canvas primitives on the bridge ctx. game.js edits
  are confined to clearly delimited functions: `renderObstacles(ctx)`, `updateHazards(dt)`,
  `renderHazards(ctx)` (+ the one-line call sites and the projectile-loop helper calls).
- **D-19:** Damage/kill feedback for new content calls existing helpers only (`burst()`,
  `GAME.shake`, `GAME.rings`, `dmgText`, `AUDIO.sfx`) — Phase 3 routes these into its VFX system.

### SEED-001 (masked stance) — DEFERRED
- **D-20:** Evaluated and **not included**. It is not cheap: it needs a stance toggle input
  (Phase 5 owns input/gamepad bindings), a second stat block, UI, and a masked animation set in
  the art pipeline (Phase 2 is paused on pose consistency). Seed stays dormant; re-surface at
  v1.x content planning or after Phase 5 input abstraction lands.

### Claude's Discretion
- Exact numeric tuning (damage, radii, timers) — plans give starting values; feel is a
  non-blocking note for the user's playtest.
- Obstacle coordinates within the clearance rules.
- Colors of new telegraphs/hazards (must stay readable: red/orange warn for damage, distinct
  from player-owned green/blue zones).
</decisions>

<flagged_for_user>
## Flagged for User Decision (non-blocking — execution proceeds without it)

**Yama framing vs. "gods are allies only, never enemies" (CLAUDE.md hard constraint).**
Yama Dharmaraja is a deity and is currently the final boss (biome 4). His existing intro and
the victory lines already lean toward a *test* rather than hostility ("The ledger says you died
well... Why is that not enough?"; "Death lowers his danda... almost smiling").

**Recommendation:** Reframe the Yama fight explicitly as a **Trial of Dharma** — Yama is not an
enemy but the judge testing whether Abhimanyu may leave; mechanics unchanged. Flavor-only
changes in js/data.js `DATA.BOSSES.yama` (`sub`, `intro`) and possibly the boss-door name, e.g.
`sub: 'Lord of Dharma — The Final Judgment'`,
`intro: '"Abhimanyu. Sixteen rings you have broken to stand here. No soul leaves my realm
untested. Show me your dharma holds when death itself weighs it."'`, and a phase-2 banner
"THE LEDGER IS OPENED". Also consider renaming the boss bar label from "THE WARDEN" framing to
"THE TRIAL" for the Yama room only.

**Not implemented in Phase 4 plans** beyond using judgment vocabulary for Yama's new phase-2
moves (D-13). Needs the user's call before a quick task applies the text change.
</flagged_for_user>

<file_ownership>
## File Ownership (parallel phases)

Phase 4 MAY edit: js/data.js, js/rooms.js, js/entities.js (boss/enemy AI, boon effects,
obstacle collision, player hazard slow), js/game.js (ONLY delimited obstacle/hazard
update+draw functions and their call sites + projectile-loop obstacle helper calls),
js/ui.js (ONLY duo offer placement + duo card rendering in `offerBoon`), test/smoke.js
(append-only: new blocks inserted before the final `console.log(failures === 0 ...)` summary).

Phase 4 MUST NOT edit: js/sprites.js, js/renderer.js, js/vfx.js, js/settings.js,
js/gamepad.js, js/storage.js, electron/**, assets/**, index.html, CSS, ROADMAP.md, STATE.md.

Because every plan touches js/entities.js and test/smoke.js, the 4 plans run in 4 sequential
waves. Executors MUST re-read current file contents first — Phase 3 will have changed
entities.js/game.js (e.g. burst/shake routing, hitstop) since this audit; line numbers in plans
are approximate anchors, function names are authoritative.
</file_ownership>

<deferred>
## Deferred Ideas
- SEED-001 masked stance (D-20).
- Boss phase-2 sprite/art variants (Phase 2 art pipeline).
- Hazards in boss arenas; additional hazard types per biome.
- Enemy pathfinding around walls (enemies currently slide along obstacles).
- Duo-specific VFX (Phase 3 owns VFX).
- Yama reframing text (pending user decision above).
</deferred>

<balance_notes>
## Non-blocking Balance / Feel Notes (for the user's playtest)
- Phase-2 openers fire right after the 1.2s phaseShift — verify it reads as a dramatic beat,
  not a cheap follow-up.
- Removing boss contact damage (D-08) makes bosses safer to hug; the telegraphed swipe
  cadence (~every 1.2s in range) is the compensator — tune swipe cd if hugging is too safe.
- Venom pool damage ticks through `takeDamage` (i-frames 0.5s + hurt flash each tick) — may
  feel noisy; consider a quieter tick later.
- River current may push enemies into pits/walls; they are pushed out by clampToArena.
</balance_notes>
