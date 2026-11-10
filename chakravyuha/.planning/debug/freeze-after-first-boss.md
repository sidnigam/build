---
status: resolved
trigger: "In the Electron desktop build (env -u ELECTRON_RUN_AS_NODE npm run start:desktop), the game froze after the first boss during a user playtest on 2026-11-07."
created: 2026-11-07T15:05:00Z
updated: 2026-11-07T16:10:00Z
---

## Current Focus

hypothesis: CONFIRMED — post-boss door color '#fff' + 'cc' = '#fffcc' makes CanvasGradient.addColorStop throw in renderBackground once the door is on screen; frame() dies before re-arming rAF.
test: DONE — smoke regression fails pre-fix / passes post-fix; Electron targeted repro + 144-scenario fuzz clean post-fix
expecting: user confirms in a real playtest that defeating Tataka, walking to the gate and entering Patala no longer freezes
next_action: await human verification; on "confirmed fixed" archive session, commit js/rooms.js + test/smoke.js (fix: ...) and planning docs, append knowledge base entry. Changes are NOT committed yet.

## Symptoms

expected: after defeating the first boss (biome 1, Naraka), the boss-defeated flow completes (banner, reward/boon, door) and the run continues into the next room/biome (Patala).
actual: game froze after the first boss. Exact freeze moment unknown (during death anim / banner / boon panel / biome transition). Main-process stdout shows no errors (renderer console is not forwarded).
errors: none visible in main process log.
reproduction: play a run, defeat the first boss. User may have had F4 god mode on (GAME.godMode, commit b8b46b5).
started: recent changes 2026-11-06/07 (05.4-05 env renderer, 05.7-01 Trial-of-Dharma wiring, 05.7-02 atlases, F4 god mode)

## Eliminated

- hypothesis: renderer process crash / OOM (user's Electron had no --type=renderer child)
  evidence: CGWindowList shows the user's instance has no game window — the window was closed (macOS keeps main alive), which is why the renderer was gone. Natural Electron run: renderer RSS 200-250MB flat, JS heap 14MB flat.
  timestamp: 2026-11-07T15:35:00Z

- hypothesis: infinite loop in MUSIC scheduler (leadStream.eventsAt / fitTihai / bossDefeated stinger) or ENV layout loops
  evidence: all loops guarded or strictly advancing (planned += cs, cs = tala.matras*STEPS_PER_MATRA > 0); eval never timed out in any repro; actual failure is an exception, not a hang.
  timestamp: 2026-11-07T15:45:00Z

- hypothesis: 05.4 env biome loading (fetch over file://) / 05.7 boss atlases / F4 god mode
  evidence: Patala/Ranabhoomi/Vaitarani env go loading->ready in Electron file:// and Chrome http; god mode only short-circuits Player.takeDamage; failure reproduces with or without it.
  timestamp: 2026-11-07T15:45:00Z

## Evidence

- timestamp: 2026-11-07T00:05:00Z
  checked: user follow-up (via coordinator)
  found: picture stopped moving entirely, no animation, input did nothing -> full frame-loop stop or main-thread hang, not a stuck UI panel.
  implication: prioritize (a) exception inside GAME.frame (requestAnimationFrame is re-armed only at the END of frame(), so any throw in update()/render() permanently stops the loop) and (b) infinite loop / blocking work at boss defeat or next room/biome build.

- timestamp: 2026-11-07T00:06:00Z
  checked: js/game.js frame() lines 207-221
  found: requestAnimationFrame(tt => this.frame(tt)) is the LAST statement; no try/catch around update()/render().
  implication: a single exception anywhere in update/render = permanent freeze with no main-process log (renderer console not forwarded). Matches the symptom.

- timestamp: 2026-11-07T15:15:00Z
  checked: scratchpad boss_repro.mjs (headless Chrome swiftshader, http://) — enterRoom('boss') x4, hp=1 kill, walk into nextbiome door, biomes 0..3
  found: no exceptions, frame counter keeps advancing through every boss death, banner, door, enterBiome(1..3), env 'loading'->'ready'; Yama -> victory works.
  implication: synthetic boss-defeat/biome-transition path is not deterministically broken in Chrome.

- timestamp: 2026-11-07T15:25:00Z
  checked: the user's still-open Electron instance (pid 28770, started 09:10) process tree
  found: children are only gpu-process (22 min CPU), network utility, audio utility — NO --type=renderer process exists. The renderer is gone.
  implication: the "freeze" is a RENDERER PROCESS DEATH (crash / OOM / killed), not a JS exception or JS infinite loop. The BrowserWindow keeps showing the last composited frame; input goes nowhere. electron/main.js has no 'render-process-gone' / 'unresponsive' handler, so nothing is logged to stdout. Hypothesis space changes: memory growth (JS heap OOM or GPU/texture leak) or a native crash.

- timestamp: 2026-11-07T15:26:00Z
  checked: ~/Library/Application Support/chakravyuha/saves/chakravyuha_save_v1.json (mtime 15:08)
  found: runs:5, bestBiome:0, lastRun = run 4 death at tataka. enterBiome(1) would set bestBiome=1 and save first thing.
  implication: renderer died before entering Patala (during/after the Tataka fight, before the nextbiome door). No macOS DiagnosticReports crash file for Electron Helper; unified log shows nothing.

- timestamp: 2026-11-07T15:35:00Z
  checked: CGWindowListCopyWindowInfo for pid 28770 (user) vs 45005 (my isolated repro instance)
  found: my instance owns an on-screen 1280x720 window; the user's instance owns NO game window (only 1512x33 menu-bar entries).
  implication: CORRECTION — the user closed the frozen window; on macOS window-all-closed does not quit, so main/gpu/audio stay alive and the renderer exits. The missing renderer is NOT evidence of a crash/OOM. Back to: JS exception in frame() or a main-thread hang. Session Storage LOG shows a (re)load at 14:58:18 and last write 15:09, save at 15:08 with bestBiome 0 -> freeze happened ~10 min into run 5, during/after Tataka, before entering Patala.

- timestamp: 2026-11-07T15:33:00Z
  checked: natural-play bot (scratchpad/natural.mjs) in a real isolated Electron 42 instance (file://, 120 fps, god mode on): rooms 1-5 of Naraka with boon picks, Tataka (950hp) fought + killed, nextbiome door, Patala rooms 1-5
  found: no exceptions, frame counter continuous, renderer RSS ~200-250MB stable, JS heap 14MB flat.
  implication: the common path works in Electron too; the trigger is condition-specific (something the user's fight had that the bot's did not).

- timestamp: 2026-11-07T15:40:00Z
  checked: GAME.time / frame counter in the isolated Electron instance after the bot + fuzz
  found: frame loop DEAD, GAME.time frozen; captured frame error: "SyntaxError: Failed to execute 'addColorStop' on 'CanvasGradient': The value provided ('#fffcc') could not be parsed as a color. at renderBackground (js/game.js:784) <- render (629) <- frame (219)".
  implication: ROOT CAUSE candidate — the post-boss "nextbiome" door has reward.color '#fff' (3-digit hex, js/rooms.js:557); renderBackground's door glow does addColorStop(0, d.reward.color + 'cc') -> '#fffcc' (invalid 5-digit hex) -> canvas throws SyntaxError -> frame() aborts before requestAnimationFrame -> permanent freeze.

- timestamp: 2026-11-07T15:42:00Z
  checked: scratchpad/targeted.mjs in Electron: reload, begin, enterRoom('boss'), kill boss, place player 220px left of the door (not on it)
  found: after kill doorVisible=false (door culled by CAMERA.visible at arena right edge, t=8.35); the moment the door is on screen (doorVisible=true) GAME.time stops at 8.46 forever, exception '#fffcc' at game.js:784. 100% reproducible.
  implication: CONFIRMED (see also post-fix entries below). Explains why earlier repros passed (they teleported the player ONTO the door, so the door was never rendered on-screen — Phase 05.1 scrolling camera culls it off-screen until the player walks toward it). Explains user's save (bestBiome 0: never reached Patala). Independent of god mode / Electron (pure canvas behavior). Bug present since MVP (cdfa38b, 2026-06-12); smoke never caught it because test/smoke.js ctxStub gradients have addColorStop: noop.

- timestamp: 2026-11-07T16:05:00Z
  checked: post-fix in-page fuzz (scratchpad/fuzz_inpage.js) in real Electron: 144 scenarios — all 4 bosses (tataka/ahiravana/kumbhakarna/yama) killed via every damage source (attack/special/cast/chain/zone/burn/dash/hazard/orbit) with all boons granted, killed in every move/wind/phaseShift state, with summons alive, with pause during the kill, then nextbiome door -> enterBiome(1..3) / Yama -> victory, each followed by fighting in the next biome's first room; frame() wrapped to record any throw and re-arm rAF
  found: 0 frame errors, loop alive throughout (GAME.time 1008s at end, state victory).
  implication: no other frame-killing exception in the boss-defeat -> next-room/biome flow.

- timestamp: 2026-11-07T16:06:00Z
  checked: data colors used with alpha suffixes (DATA.ENEMIES/BOSSES/HAZARDS/REWARDS/GODS .color; entities.js:1464 this.color + '55')
  found: all #rrggbb; the nextbiome door was the only 3-digit color reaching an addColorStop concatenation. Strict-stub smoke run surfaced no other invalid gradient color anywhere in existing render coverage.
  implication: fix is complete for this bug class within current data.

- timestamp: 2026-11-07T16:07:00Z
  checked: SEPARATE finding (not the freeze) — AUDIO.init() in real Electron (48 kHz context)
  found: "NotSupportedError: Failed to set the 'buffer' property on 'ConvolverNode': The buffer sample rate of 32000 does not match the context rate of 48000 Hz." at MUSIC._buildGraph (js/music.js:1755; MUSIC.sr = min(ctx.sampleRate, RENDER_SR_MAX=32000) used for the reverb IR buffer). MUSIC.ctx is assigned before the throw, so attach never retries: MUSIC.running=false permanently -> the 05.3 adaptive score never plays on real 44.1/48 kHz hardware; SFX unaffected. Thrown inside the first-input handler / PAD try-catch, not the frame loop, so it does not freeze the game.
  implication: separate bug for its own fix (render the IR at ctx.sampleRate, or wrap convolver.buffer assignment); not addressed in this session.

## Resolution

root_cause: ROOMS.onBossDefeated() (js/rooms.js) creates the post-boss 'nextbiome' door with reward.color '#fff' (3-digit hex). GAME.renderBackground() (js/game.js:784-785) draws every door's glow with grad.addColorStop(0, d.reward.color + 'cc') / (1, color + '00'), producing '#fffcc' / '#fff00' — invalid CSS colors — so CanvasGradient.addColorStop throws SyntaxError. The throw propagates out of GAME.render() -> GAME.frame() before its trailing requestAnimationFrame(), so the rAF loop stops permanently: the picture freezes and input does nothing. Because of the Phase 05.1 scrolling camera, the door (arena right edge) is culled by CAMERA.visible() until the player walks toward it, so the freeze hits shortly after the boss dies, the first frame the door is on screen. Present since the MVP (cdfa38b); never caught because test/smoke.js's ctx stub made addColorStop a no-op, and earlier browser checks teleported onto the door (never rendering it). Not related to god mode, Electron, 05.4 env or 05.7 changes.
fix: js/rooms.js — nextbiome door color '#fff' -> '#ffffff' (one-token change + comment). test/smoke.js — ctx stub gradients now use a browser-faithful addColorStop (throws SyntaxError on unparseable colors and IndexSizeError on offsets outside [0,1]) so every headless render pass catches this bug class; new regression section drives a real boss defeat in every non-final biome, brings the nextbiome door on screen (asserts CAMERA.visible), renders it, and asserts every door reward color is #rrggbb.
verification: (1) smoke regression FAILED pre-fix with the exact production error ('#fffcc') for biomes 0/1/2 + bad color nextbiome=#fff; PASSES post-fix; full `node test/smoke.js` ALL SMOKE TESTS PASSED (exit 0); `node tools/check-provenance.js` ok. (2) real Electron 42 (file://, isolated userData), scratchpad/targeted.mjs: pre-fix GAME.time froze at 8.46 the moment the door became visible; post-fix GAME.time keeps advancing with the door on screen (9.94 -> 11.44), walking into the door enters Patala (biomeIdx 1, state combat), zero exceptions.
files_changed: [js/rooms.js, test/smoke.js]
