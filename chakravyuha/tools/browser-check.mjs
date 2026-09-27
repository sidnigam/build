// tools/browser-check.mjs — Phase 05.1 committed browser verification tool.
//
// Boots the game in headless Chrome via CDP, drives a real run, and numerically proves the
// camera/bridge alignment (CAM-03), world-space mouse + gamepad aim (CAM-04), and off-screen
// indicators (CAM-06) match what a real Pixi + bridge-canvas render produces — plus screenshots
// for visual review.
//
// Usage:
//   cd chakravyuha && python3 -m http.server <port>       # serve this checkout, e.g. 8091
//   node tools/browser-check.mjs <outdir> [port]          # port defaults to 8091
//
// Writes <outdir>/01-spawn.png, 02-moved.png, 03-align.png, 04-indicators.png and report.txt.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2];
const PORT = process.argv[3] || '8091';
const URL = `http://localhost:${PORT}/index.html`;
mkdirSync(OUT, { recursive: true });

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9333', '--window-size=1280,720',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(4000);

const report = [];

// NOTE: every eval below is wrapped in an IIFE — Runtime.evaluate top-level `const`/`let` bindings
// persist in the page's global lexical environment across separate calls (REPL-like semantics), so
// unwrapped repeats of `const P = GAME.player` etc. across steps throw "already been declared".

// 1. Boot + begin a run.
await evalJs(`(function() { (document.getElementById('btn-begin')||{click(){}}).click(); return GAME.state; })()`);
await sleep(2500);
await shot('01-spawn.png');

// 2. Move the player far from spawn (toward the far corner of the current room's arena).
await evalJs(`(function() {
  const A = GAME.arena;
  const P = GAME.player;
  P.x = A.x + A.w - 260; P.y = A.y + A.h - 180;
  INPUT.device = 'kbm';
  return 1;
})()`);
await sleep(1500);
await shot('02-moved.png');

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
report.push('ALIGN ' + align);
await shot('03-align.png');

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
report.push('AIM ' + aim);

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
report.push('PAD ' + pad);
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
report.push('INDICATORS ' + ind);
await shot('04-indicators.png');

// 7. Final counts + FPS.
const final = await evalJs(`
  JSON.stringify({
    alive: (GAME.enemies || []).filter(e => !e.dead).length,
    spawnQueue: (GAME.spawnQueue || []).length,
    fps: SPRITES.app ? Math.round(SPRITES.app.ticker.FPS) : null,
  })
`);
report.push('ENEMIES ' + final);

writeFileSync(join(OUT, 'report.txt'), report.join('\n') + '\n--- console ---\n' + logs.join('\n') + '\n');
ws.close(); chrome.kill();
process.exit(0);
