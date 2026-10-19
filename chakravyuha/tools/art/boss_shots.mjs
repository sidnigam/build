// tools/art/boss_shots.mjs — headless-Chrome boss intro/fight/phase-2 screenshot driver
// (05.7-01 Task 3; reused by 05.7-02 for the regenerated Yama/Kumbhakarna sprites).
//
// Drives a real run in headless Chrome via CDP (same approach as tools/browser-check.mjs /
// tools/art/env_shots.mjs / tools/art/god_panel_shots.mjs). For each requested boss: enters its
// biome, forces the boss room, screenshots the intro overlay, waits (player made invulnerable),
// screenshots mid-fight, forces phase 2 by dropping hp below the phase-2 threshold, and
// screenshots that too. Records GAME.roomLabel() and whether the boss's atlas loaded, so the
// Trial HUD label ('THE TRIAL' for yama, 'THE WARDEN' for the rest) and sprite presence can be
// asserted without a human looking at every PNG.
//
// Starts its own `python3 -m http.server PORT` from the project root when nothing already
// answers there, and kills it (and Chrome) on exit.
//
// Usage:
//   node tools/art/boss_shots.mjs OUT_DIR [--bosses yama,kumbhakarna,tataka,ahiravana] [--gpu] [--port 8097]
//
// Writes OUT_DIR/<id>-intro.png, <id>-fight.png, <id>-phase2.png per boss, and OUT_DIR/report.json:
//   { shots: [{ boss, label, introHtmlHasTitle, spriteLoaded, exceptions: [] }, ...], ok: bool }
// Exit code 1 if any page exception fired, or if yama's label is not 'THE TRIAL'.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- args ----------------
const args = process.argv.slice(2);
const OUT = args[0];
if (!OUT) {
  console.error('usage: node tools/art/boss_shots.mjs OUT_DIR [--bosses yama,kumbhakarna,...] [--gpu] [--port 8097]');
  process.exit(1);
}
let PORT = '8097';
const CDP_PORT = '9337';
let BOSSES = ['tataka', 'ahiravana', 'kumbhakarna', 'yama'];
let GPU = false;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--bosses') BOSSES = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (args[i] === '--gpu') GPU = true;
  else if (args[i] === '--port') PORT = args[++i];
}
mkdirSync(OUT, { recursive: true });

async function main() {
  // ---------------- http server (start our own only if nothing is already serving) ----------------
  let startedServer = null;
  const base = `http://127.0.0.1:${PORT}`;
  const alreadyUp = await fetch(`${base}/index.html`, { signal: AbortSignal.timeout(800) }).then(r => r.ok).catch(() => false);
  if (!alreadyUp) {
    startedServer = spawn('python3', ['-m', 'http.server', PORT], { cwd: ROOT, stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      up = await fetch(`${base}/index.html`).then(r => r.ok).catch(() => false);
      if (!up) await sleep(150);
    }
    if (!up) throw new Error(`failed to start python3 -m http.server ${PORT}`);
  }

  // ---------------- headless Chrome + CDP (tools/browser-check.mjs pattern) ----------------
  const gpuArgs = GPU
    ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--window-size=1280,720',
    ...gpuArgs, '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'boss-shots-'))}`, 'about:blank',
  ], { stdio: 'ignore' });

  const cleanup = () => { try { chrome.kill(); } catch (e) {} if (startedServer) { try { startedServer.kill(); } catch (e) {} } };

  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
  if (!targets) { cleanup(); throw new Error('could not reach Chrome DevTools endpoint'); }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });

  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  // Every eval is IIFE-wrapped — Runtime.evaluate's top-level const/let leak into the page's
  // shared global lexical environment across separate calls and collide on repeat
  // (tools/browser-check.mjs Deviation 1); returnByValue + awaitPromise so plain values and
  // rejected exceptions surface here.
  const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${base}/index.html` });
  await sleep(2500);

  async function captureShot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64'));
  }

  await evalJs(`(function(){ (document.getElementById('btn-begin')||{click(){}}).click(); return GAME.state; })()`);
  await sleep(1000);

  const shots = [];
  let errPtr = 0;

  for (const bossId of BOSSES) {
    const idx = await evalJs(`DATA.BIOMES.findIndex(function(b){ return b.boss === ${JSON.stringify(bossId)}; })`);
    if (idx == null || idx < 0) { console.warn('unknown boss, skipping:', bossId); continue; }

    await evalJs(`(function(){ ROOMS.enterBiome(${idx}); GAME.enemies = []; ROOMS.enterRoom('boss'); return 1; })()`);
    await sleep(1000);

    await captureShot(`${bossId}-intro.png`);
    const label = await evalJs('GAME.roomLabel()');
    const introHtmlHasTitle = await evalJs(`(function(){
      var html = document.getElementById('boss-intro').innerHTML;
      return ${JSON.stringify(bossId)} === 'yama' ? html.indexOf('THE TRIAL OF DHARMA') !== -1 : true;
    })()`);
    const spriteLoaded = await evalJs(`(typeof SPRITES !== 'undefined' && SPRITES.has(${JSON.stringify(bossId)})) || false`);

    // make the player invulnerable so the fight shot isn't cut short by a death
    await evalJs(`(function(){ var P = GAME.player; P.maxhp = P.hp = 1e9; return 1; })()`);
    await sleep(2500);
    await captureShot(`${bossId}-fight.png`);

    // force phase 2
    await evalJs(`(function(){
      var b = GAME.bossRef;
      if (b) b.hp = b.maxhp * 0.45;
      return 1;
    })()`);
    await sleep(1500);
    await captureShot(`${bossId}-phase2.png`);

    const errs = exceptions.slice(errPtr);
    errPtr = exceptions.length;
    shots.push({ boss: bossId, label, introHtmlHasTitle: !!introHtmlHasTitle, spriteLoaded: !!spriteLoaded, exceptions: errs });
  }

  ws.close();
  cleanup();

  const yamaShot = shots.find(s => s.boss === 'yama');
  const yamaLabelOk = !yamaShot || yamaShot.label === 'THE TRIAL';
  const anyErr = shots.some(s => s.exceptions && s.exceptions.length);
  const ok = yamaLabelOk && !anyErr;

  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ shots, ok }, null, 2));

  console.log(`wrote ${shots.length * 3} shots to ${OUT} (${ok ? 'OK' : 'MISMATCH-OR-EXCEPTIONS'})`);
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
