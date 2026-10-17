// tools/browser-check.mjs — Phase 05.1 committed browser verification tool.
//
// Boots the game in headless Chrome via CDP, drives a real run, and numerically proves the
// camera/bridge alignment (CAM-03), world-space mouse + gamepad aim (CAM-04), and off-screen
// indicators (CAM-06) match what a real Pixi + bridge-canvas render produces — plus screenshots
// for visual review.
//
// Phase 05.6 Plan 01 (D-24) adds GFX-related flags, additive only — the original flow (no flags)
// is byte-for-byte unchanged in behavior:
//   --quality <tier>   navigate to index.html?gfx=<tier>; prefix screenshot filenames and
//                      report lines with "<tier> ".
//   --gpu              try real-GPU Chrome flags (--use-angle=metal --enable-gpu
//                      --ignore-gpu-blocklist) instead of the SwiftShader flags.
//   --size WxH@dpr     e.g. --size 1920x1080@1 — overrides the default 1280x720@1
//                      Emulation.setDeviceMetricsOverride.
//   --gfx-only         skip the 05.1 alignment/aim/pad/indicator probes; just boot → begin →
//                      settle (the combat room entered by startRun() is already 'combat').
// Every run (flagged or not) always appends GPU/GFX/RES/ISOLATION/MIP lines to report.txt.
//
// Usage:
//   cd chakravyuha && python3 -m http.server <port>       # serve this checkout, e.g. 8091
//   node tools/browser-check.mjs <outdir> [port] [flags]   # port defaults to 8091
//
// Writes <outdir>/[tier-]01-spawn.png, [tier-]02-moved.png, [tier-]03-align.png,
// [tier-]04-indicators.png (02-04 skipped under --gfx-only) and report.txt.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------- argv parsing (additive — positional args behave exactly as before) ----------------
const argv = process.argv.slice(2);
const flags = { quality: null, gpu: false, size: null, gfxOnly: false };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--quality') flags.quality = argv[++i];
  else if (a === '--gpu') flags.gpu = true;
  else if (a === '--size') flags.size = argv[++i];
  else if (a === '--gfx-only') flags.gfxOnly = true;
  else positional.push(a);
}
const OUT = positional[0];
const PORT = positional[1] || '8091';
const TAG = flags.quality ? flags.quality + ' ' : '';
const FILE_PREFIX = flags.quality ? flags.quality + '-' : '';
const URL = `http://localhost:${PORT}/index.html` + (flags.quality ? `?gfx=${flags.quality}` : '');
mkdirSync(OUT, { recursive: true });

let devW = 1280, devH = 720, devDpr = 1;
if (flags.size) {
  const m = /^(\d+)x(\d+)@([\d.]+)$/.exec(flags.size);
  if (m) { devW = Number(m[1]); devH = Number(m[2]); devDpr = Number(m[3]); }
}

const baseArgs = ['--headless=new', '--remote-debugging-port=9333', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required'];
const gpuArgs = flags.gpu
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  ...baseArgs, ...gpuArgs,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); break; } catch { await sleep(250); } }
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded') logs.push(`[log:${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url || ''}`);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64')); };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: devW, height: devH, deviceScaleFactor: devDpr, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(4000);

const report = [];

// NOTE: every eval below is wrapped in an IIFE — Runtime.evaluate top-level `const`/`let` bindings
// persist in the page's global lexical environment across separate calls (REPL-like semantics), so
// unwrapped repeats of `const P = GAME.player` etc. across steps throw "already been declared".

// 1. Boot + begin a run. startRun() -> ROOMS.enterBiome(0) already lands in a combat room.
await evalJs(`(function() { (document.getElementById('btn-begin')||{click(){}}).click(); return GAME.state; })()`);
await sleep(2500);
await shot(FILE_PREFIX + '01-spawn.png');

if (!flags.gfxOnly) {
  // 2. Move the player far from spawn (toward the far corner of the current room's arena).
  await evalJs(`(function() {
    const A = GAME.arena;
    const P = GAME.player;
    P.x = A.x + A.w - 260; P.y = A.y + A.h - 180;
    INPUT.device = 'kbm';
    return 1;
  })()`);
  await sleep(1500);
  await shot(FILE_PREFIX + '02-moved.png');

  // 3. Alignment probe: teleport an enemy near the player, ring it, compare Pixi vs bridge mapping.
  await evalJs(`(function() {
    const P = GAME.player;
    let e = (GAME.enemies || []).find(x => !x.dead && x._pixiSprite);
    if (!e) e = (GAME.enemies || []).find(x => !x.dead);
    if (e) { e.x = P.x - 160; e.y = P.y - 60; e.spawnT = 0; e.stun = 5; }
    globalThis.__alignEnemy = e || null;
    GAME.dangerZones.push({ x: (e ? e.x : P.x - 160), y: (e ? e.y : P.y - 60), r: 40, frac: 0.5 });
    return 1;
  })()`);
  await sleep(300);
  const align = await evalJs(`
    JSON.stringify((function() {
      const e = globalThis.__alignEnemy;
      const A = GAME.arena;
      if (!e || e.dead || !SPRITES.worldContainer || !SPRITES.bridgeSprite) {
        return { ok: false, hasEnemy: !!e && !e.dead, hasWC: !!SPRITES.worldContainer, hasBS: !!SPRITES.bridgeSprite };
      }
      const w = SPRITES.worldContainer.toGlobal({ x: e.x, y: e.y });
      const c = { x: e.x * CAMERA.tz + CAMERA.tx, y: e.y * CAMERA.tz + CAMERA.ty };
      const b = SPRITES.bridgeSprite.toGlobal(c);
      return {
        ok: true, dx: Math.abs(w.x - b.x), dy: Math.abs(w.y - b.y),
        sx: CAMERA.sx, sy: CAMERA.sy, tx: CAMERA.tx, ty: CAMERA.ty, tz: CAMERA.tz,
        A: { x: A.x, y: A.y, w: A.w, h: A.h },
      };
    })())
  `);
  report.push(TAG + 'ALIGN ' + align);
  await shot(FILE_PREFIX + '03-align.png');

  // 4. Aim probe (mouse, world-space).
  await evalJs(`(function() { INPUT.mx = 1000; INPUT.my = 200; return 1; })()`);
  await sleep(100);
  const aim = await evalJs(`
    JSON.stringify((function() {
      const P = GAME.player;
      const w = CAMERA.screenToWorld(1000, 200);
      const expected = Math.atan2(w.y - P.y, w.x - P.x);
      return { aim: P.aim, expected, diff: Math.abs(Math.atan2(Math.sin(P.aim - expected), Math.cos(P.aim - expected))) };
    })())
  `);
  report.push(TAG + 'AIM ' + aim);

  // 5. Pad aim probe (right stick, world-space target held).
  await evalJs(`(function() { globalThis.__origGetGamepads = navigator.getGamepads.bind(navigator); return 1; })()`);
  await evalJs(`(function() {
    navigator.getGamepads = () => [{ axes: [0, 0, 1, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) }];
    return 1;
  })()`);
  await sleep(400);   // headless rAF can be slow under load — give PAD.poll() a few real frames
  const pad = await evalJs(`
    JSON.stringify((function() {
      const P = GAME.player;
      return { dwx: INPUT.wx - P.x, dwy: INPUT.wy - P.y, device: INPUT.device };
    })())
  `);
  report.push(TAG + 'PAD ' + pad);
  await evalJs(`(function() { navigator.getGamepads = globalThis.__origGetGamepads; INPUT.device = 'kbm'; return 1; })()`);

  // 6. Indicators: move the player to the arena's far left; report off-screen alive enemies + arrows.
  await evalJs(`(function() {
    const A = GAME.arena;
    GAME.player.x = A.x + 120;
    return 1;
  })()`);
  await sleep(1500);
  const ind = await evalJs(`
    JSON.stringify((function() {
      const offscreen = (GAME.enemies || []).filter(e => !e.dead && !CAMERA.visible(e.x, e.y, e.r * 3, 96)).length;
      const arrows = CAMERA.clusterIndicators(GAME.indicatorItems()).length;
      return { offscreenAlive: offscreen, arrows };
    })())
  `);
  report.push(TAG + 'INDICATORS ' + ind);
  await shot(FILE_PREFIX + '04-indicators.png');
} else {
  // --gfx-only: boot -> begin -> settle. No alignment/aim/pad/indicator probes.
  await sleep(1500);
}

// 7. Final counts + FPS (always).
const final = await evalJs(`
  JSON.stringify({
    alive: (GAME.enemies || []).filter(e => !e.dead).length,
    spawnQueue: (GAME.spawnQueue || []).length,
    fps: SPRITES.app ? Math.round(SPRITES.app.ticker.FPS) : null,
  })
`);
report.push(TAG + 'ENEMIES ' + final);

// 8. GFX gate lines (05.6-01 D-24) — always appended, every run.
const gpuStr = await evalJs(`
  (function() {
    try {
      const gl = SPRITES.app && SPRITES.app.renderer && SPRITES.app.renderer.gl;
      if (!gl) return '';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    } catch (e) { return ''; }
  })()
`);
report.push(TAG + 'GPU ' + (gpuStr || '(unavailable)'));

const gfxStatsStr = await evalJs(`JSON.stringify(typeof GFX !== 'undefined' ? GFX.stats() : null)`);
report.push(TAG + 'GFX ' + gfxStatsStr);

const resLine = await evalJs(`
  JSON.stringify((function() {
    const canvas = SPRITES.app && (SPRITES.app.canvas || SPRITES.app.view);
    const rect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 0 };
    return {
      res: (SPRITES.app && SPRITES.app.renderer) ? SPRITES.app.renderer.resolution : null,
      cssW: rect.width,
    };
  })())
`);
const resObj = JSON.parse(resLine);
report.push(TAG + 'RES ' + resObj.res + ' css=' + resObj.cssW);

const isoLine = await evalJs(`
  JSON.stringify((function() {
    const stage = SPRITES.app && SPRITES.app.stage;
    const hud = SPRITES.hudContainer;
    const world = SPRITES.worldContainer;
    const vign = (typeof ENV !== 'undefined' && ENV.vignette) ? ENV.vignette : (typeof GFX !== 'undefined' ? GFX._vignette : null);
    let vignettes = 0, vignetteAboveWorld = false, vignetteBelowHud = false;
    if (vign && stage && stage.children) {
      const idx = stage.children.indexOf(vign);
      vignettes = idx !== -1 ? 1 : 0;
      const worldIdx = stage.children.indexOf(world);
      const hudIdx = stage.children.indexOf(hud);
      vignetteAboveWorld = idx !== -1 && idx > worldIdx;
      vignetteBelowHud = idx !== -1 && hudIdx !== -1 && idx < hudIdx;
    }
    return {
      stage: (stage && stage.filters) ? 1 : 0,
      hud: (hud && hud.filters) ? 1 : 0,
      vignettes, vignetteAboveWorld, vignetteBelowHud,
    };
  })())
`);
const iso = JSON.parse(isoLine);
report.push(TAG + 'ISOLATION stage=' + iso.stage + ' hud=' + iso.hud + ' vignettes=' + iso.vignettes
  + ' vignetteAboveWorld=' + iso.vignetteAboveWorld + ' vignetteBelowHud=' + iso.vignetteBelowHud);

const mipLine = await evalJs(`
  JSON.stringify((function() {
    const sheet = SPRITES.sheets && SPRITES.sheets.player;
    const src = sheet && sheet.textureSource;
    return { auto: !!(src && src.autoGenerateMipmaps), levels: src ? (src.mipLevelCount || 0) : 0 };
  })())
`);
const mip = JSON.parse(mipLine);
report.push(TAG + 'MIP player=' + mip.auto + ' levels=' + mip.levels);

writeFileSync(join(OUT, 'report.txt'), report.join('\n') + '\n--- console ---\n' + logs.join('\n') + '\n');
ws.close(); chrome.kill();
process.exit(0);
