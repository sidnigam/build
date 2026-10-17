// tools/art/god_panel_shots.mjs — headless-Chrome boon-panel screenshot driver (05.5-04 Task 3).
//
// Drives a real run in headless Chrome via CDP (same approach as tools/browser-check.mjs /
// tools/art/env_shots.mjs) and, for each requested god, forces UI.offerBoon(god), skips the
// typewriter dialogue, screenshots the boon panel, and records whether #boonpick ended up with
// the `has-portrait` class. Uses its own ports (http 8095, CDP 9335) so it never collides with
// Phase 05.4's env_shots.mjs (8091/9333).
//
// Starts its own `python3 -m http.server 8095` from the project root when nothing already
// answers there, and kills it (and Chrome) on exit.
//
// Usage:
//   node tools/art/god_panel_shots.mjs OUT_DIR --gods hanuman,agni,... [--expect portrait|fallback] [--port 8095]
//
// Writes OUT_DIR/<id>-panel.png per god and OUT_DIR/report.json:
//   { shots: [{ god, portraitOk, hasPortrait, exceptions: [] }, ...], ok: bool }
// Exit code 1 if any god's hasPortrait mismatches --expect, or if any page exception fired.
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
  console.error('usage: node tools/art/god_panel_shots.mjs OUT_DIR --gods hanuman,agni,... [--expect portrait|fallback] [--port 8095]');
  process.exit(1);
}
let PORT = '8095';
const CDP_PORT = '9335';
let GODS = [];
let EXPECT = null; // 'portrait' | 'fallback' | null (no assertion, just record)
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--gods') GODS = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (args[i] === '--expect') EXPECT = args[++i];
  else if (args[i] === '--port') PORT = args[++i];
}
if (!GODS.length) {
  console.error('ERROR: --gods is required (comma-separated god ids)');
  process.exit(1);
}
if (EXPECT && !['portrait', 'fallback'].includes(EXPECT)) {
  console.error(`ERROR: --expect must be "portrait" or "fallback", got ${JSON.stringify(EXPECT)}`);
  process.exit(1);
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
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--window-size=1280,720',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'god-panel-shots-'))}`, 'about:blank',
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

  await evalJs(`(function(){ GAME.startRun(); return GAME.state; })()`);
  await sleep(500);
  await evalJs(`(function(){ UI.preloadGodPortraits(); return 1; })()`);

  const shots = [];
  let errPtr = 0;

  for (const god of GODS) {
    let portraitOk = undefined;
    for (let i = 0; i < 20; i++) {
      const v = await evalJs(`(function(){ var v = UI._portraitOk[${JSON.stringify(god)}]; return v === undefined ? null : v; })()`);
      if (v !== null) { portraitOk = v; break; }
      await sleep(250);
    }

    await evalJs(`(function(){ UI.offerBoon(${JSON.stringify(god)}); return 1; })()`);
    await sleep(2500);
    await evalJs(`(function(){ UI.skipGodDialogue(); return 1; })()`);
    await sleep(300);

    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${god}-panel.png`), Buffer.from(r.result.data, 'base64'));

    const hasPortrait = await evalJs(`(function(){ var el = document.getElementById('boonpick'); return !!(el && el.classList.contains('has-portrait')); })()`);

    const errs = exceptions.slice(errPtr);
    errPtr = exceptions.length;
    shots.push({ god, portraitOk: portraitOk === undefined ? null : portraitOk, hasPortrait: !!hasPortrait, exceptions: errs });

    await evalJs(`(function(){ UI.hide('boonpick'); return 1; })()`);
    await sleep(150);
  }

  ws.close();
  cleanup();

  let mismatch = false;
  if (EXPECT) {
    const wantHasPortrait = EXPECT === 'portrait';
    for (const s of shots) {
      if (s.hasPortrait !== wantHasPortrait) mismatch = true;
    }
  }
  const anyErr = shots.some(s => s.exceptions && s.exceptions.length);
  const ok = !mismatch && !anyErr;

  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ shots, expect: EXPECT, ok }, null, 2));

  console.log(`wrote ${shots.length} shots to ${OUT} (expect=${EXPECT || 'none'}, ${ok ? 'OK' : 'MISMATCH-OR-EXCEPTIONS'})`);
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
