# CHAKRAVYUHA — चक्रव्यूह

*You learned the way in before you were born. Now learn the way out.*

A **Hades-inspired action roguelite** built on Indian mythology. You are
**Abhimanyu**, the sixteen-year-old prince of the Mahabharata who was slain
inside the Chakravyuha — the spiral battle formation he knew how to enter
but never learned to escape. Refusing death, you fight your way up from
**Yama's realm**, ring by ring, run after run, until the wheel breaks.

100% open source. No engine, no build step, no assets to download —
pure HTML5 Canvas + vanilla JavaScript + WebAudio (even the music is a
synthesized tanpura drone). Runs in any modern browser.

## Play it

```bash
cd chakravyuha
python3 -m http.server 8000     # or: npx serve .
# open http://localhost:8000
```

Or just open `index.html` directly — there are no module imports, so
`file://` works too. For a public URL, enable **GitHub Pages** on this
repo and the game is served at `/chakravyuha/`.

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Move |
| Mouse | Aim |
| Left click | Attack (hold to draw the Gandiva bow) |
| E / Right click | Special |
| Q | Astra (cast — shaped by whichever god's boon you carry) |
| Space | Dash (i-frames) |
| Esc | Pause · M mute |

## The run (20–30 minutes)

1. **NARAKA** — the Iron City of Yama → boss: **Tataka**
2. **PATALA** — Realm of the Serpent Kings → boss: **Ahiravana**
3. **RANABHOOMI** — Field of the Fallen Warriors → boss: **Kumbhakarna**
4. **VAITARANI** — the River Between Worlds → final boss: **Yama Dharmaraja**

Clear a chamber, choose your gate (each previews its reward), collect
**boons** from Hanuman, Krishna, Agni, Indra, Vayu and Durga, spend
**mudra** at Kubera's shop, and carry **punya** (merit) back through death
to the **Path of Dharma** — the permanent upgrade shrine under the banyan
at the edge of the worlds. The **Sanjeevani Blessing** is your death
defiance; the **Pothi** codex holds the real mythology behind everything
you meet.

Three weapons: the **Khanda** (sword), **Gandiva** (Arjuna's bow, charge
to pierce), and the **Gada of Bhima** (slow, devastating).

## Code layout

```
index.html      shell, overlay panels, styles
js/utils.js     math / RNG helpers
js/audio.js     synthesized SFX + tanpura drone (WebAudio)
js/data.js      ALL content: gods, boons, enemies, bosses, biomes, meta, codex
js/meta.js      persistent progression (localStorage)
js/entities.js  player, enemy AI archetypes, bosses, damage pipeline
js/rooms.js     run structure, encounter budgets, door rewards
js/ui.js        DOM overlays: boon picks, shop, shrine, armory, codex
js/game.js      core loop, input, rendering, HUD
test/smoke.js   headless full-run simulation tests (node test/smoke.js)
```

Balance lives almost entirely in `data.js` — tweak numbers there.

## Tests

```bash
node test/smoke.js
```

Stubs the DOM and simulates complete runs: every boss, every weapon,
all boons stacked at once, the death path, and save/load round-trips.

See [PLAN.md](PLAN.md) for the testing, marketing, pricing and
improvement roadmap.
