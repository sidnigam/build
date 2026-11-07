// tools/art/env_shots.mjs — Phase 05.4 headless-Chrome screenshot matrix driver (ENV-07/ENV-09).
//
// Drives a real run in headless Chrome via CDP (same approach as tools/browser-check.mjs — that
// file is a standalone script with no exported helpers, so this reimplements the pattern) and
// captures, per biome: 3 camera positions (nw/center/se, doors open for se) on the first layout
// template, center-only on the other two templates, one boss-arena shot, and one combat-readability
// shot (spawned wave + a forced hazard telegraph). Also writes OUT_DIR/stats.json with ENV.stats()
// per shot, any page exceptions since the previous shot, and the Pixi renderer name.
//
// Starts its own `python3 -m http.server PORT` from the project root when nothing already answers
// there, and kills it on exit.
//
// Usage:
//   node tools/art/env_shots.mjs OUT_DIR [--biomes naraka,patala,ranabhoomi,vaitarani] [--port 8091] [--seed N|--random] [--gfx low|medium|high]
//
// 05.4-05: layouts use a fixed ENV.CFG.FIXED_SEED (default 5405) so before/after tuning shots are
// comparable (--random restores per-room random seeds); the biome/boss title-card DOM overlays are
// hidden before every capture (they covered the arena centre); the combat shot centres the camera
// on the forced telegraph so it is actually in frame.
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
  console.error('usage: node tools/art/env_shots.mjs OUT_DIR [--biomes naraka,patala,ranabhoomi,vaitarani] [--port 8091]');
  process.exit(1);
}
let PORT = '8091';
let SEED = 5405;
let GFX_TIER = null;   // --gfx low|medium|high -> index.html?gfx=TIER (05.6 session override)
let BIOMES = ['naraka', 'patala', 'ranabhoomi', 'vaitarani'];
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--port') PORT = args[++i];
  else if (args[i] === '--biomes') BIOMES = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (args[i] === '--seed') SEED = parseInt(args[++i], 10);
  else if (args[i] === '--random') SEED = null;
  else if (args[i] === '--gfx') GFX_TIER = args[++i];
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
    '--headless=new', '--remote-debugging-port=9334', '--window-size=1280,720',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'env-shots-'))}`, 'about:blank',
  ], { stdio: 'ignore' });

  const cleanup = () => { try { chrome.kill(); } catch (e) {} if (startedServer) { try { startedServer.kill(); } catch (e) {} } };

  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9334/json')).json(); break; } catch { await sleep(250); } }
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
  // Every eval is IIFE-wrapped — Runtime.evaluate's top-level const/let leak into the page's shared
  // global lexical environment across separate calls and collide on repeat (tools/browser-check.mjs
  // Deviation 1); returnByValue + awaitPromise so plain values and rejected exceptions surface here.
  const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${base}/index.html${GFX_TIER ? '?gfx=' + encodeURIComponent(GFX_TIER) : ''}` });
  await sleep(4000);

  const shots = [];
  let errPtr = 0;
  async function captureShot(name) {
    await evalJs(`(function(){ ['biome-title','boss-intro'].forEach(function(id){ var e = document.getElementById(id); if (e) e.classList.add('hidden'); }); return 1; })()`);
    await sleep(60);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64'));
    const envJson = await evalJs(`JSON.stringify((typeof ENV !== 'undefined' && ENV.isActive()) ? ENV.stats() : null)`);
    const errs = exceptions.slice(errPtr);
    errPtr = exceptions.length;
    const gfxTier = await evalJs(`(typeof GFX !== 'undefined' && GFX.tier) || null`);
    shots.push({ name, env: envJson ? JSON.parse(envJson) : null, gfx: gfxTier, errors: errs });
  }
  const snapTo = (x, y) => evalJs(`(function(){ GAME.player.x = ${x}; GAME.player.y = ${y}; if (typeof CAMERA !== 'undefined') CAMERA.snap(); return 1; })()`);

  await evalJs(`(function(){ if (typeof ENV !== 'undefined') ENV.CFG.FIXED_SEED = ${SEED == null ? 'null' : SEED}; return 1; })()`);
  await evalJs(`(function(){ (document.getElementById('btn-begin')||{click(){}}).click(); return GAME.state; })()`);
  await sleep(2000);

  for (const biome of BIOMES) {
    const idx = await evalJs(`DATA.BIOMES.findIndex(function(b){ return b.id === ${JSON.stringify(biome)}; })`);
    if (idx == null || idx < 0) { console.warn('unknown biome, skipping:', biome); continue; }

    await evalJs(`(function(){ ROOMS.enterBiome(${idx}); GAME.enemies = []; return 1; })()`);
    await sleep(300);

    const templatesJson = await evalJs(`JSON.stringify(ROOMS.layoutsFor(${JSON.stringify(biome)}).map(function(t){ return t.id; }))`);
    const templates = JSON.parse(templatesJson || '[]');

    for (let ti = 0; ti < templates.length; ti++) {
      const tpl = templates[ti];
      await evalJs(`(function(){ GAME.doors = []; ROOMS.buildArena(false, ${JSON.stringify(tpl)}); ROOMS.spawnHazards(); return 1; })()`);
      await sleep(200);

      const A = JSON.parse(await evalJs(`JSON.stringify(GAME.arena)`));
      await snapTo(A.x + A.w / 2, A.y + A.h / 2);
      await sleep(150);
      await captureShot(`${biome}-${tpl}-center.png`);

      if (ti === 0) {
        await snapTo(A.x + 150, A.y + 150);
        await sleep(150);
        await captureShot(`${biome}-${tpl}-nw.png`);

        await evalJs('(function(){ ROOMS.openDoors(); return 1; })()');
        await snapTo(A.x + A.w - 150, A.y + A.h - 150);
        await sleep(150);
        await captureShot(`${biome}-${tpl}-se.png`);
      }
    }

    // boss arena
    await evalJs(`(function(){ ROOMS.enterRoom('boss'); return 1; })()`);
    await sleep(500);
    const AB = JSON.parse(await evalJs(`JSON.stringify(GAME.arena)`));
    await snapTo(AB.x + AB.w / 2, AB.y + AB.h / 2);
    await sleep(200);
    await captureShot(`${biome}-boss.png`);

    // combat readability: a fresh normal room, a topped-up wave, one forced hazard telegraph
    await evalJs(`(function(){ ROOMS.enterRoom('boon'); return 1; })()`);
    await sleep(300);
    await evalJs('(function(){ ROOMS.spawnWave(4); return 1; })()');
    const focus = JSON.parse(await evalJs(`(function(){
      var A = GAME.arena, f = { x: A.x + A.w / 2, y: A.y + A.h / 2 };
      var h = (GAME.hazards || [])[0];
      if (h) {
        if (h.type === 'fireVent') { h.phase = 'warn'; h.t = 999; h.warnShown = 0.5; f = { x: h.x, y: h.y }; }
        else if (h.type === 'arrowVolley') { h.markers.push({ x: f.x, y: f.y, r: DATA.HAZARDS.arrowVolley.r, t: 0.6, shown: 0.3 }); }
        else if (h.type === 'riverCurrent') { h.phase = 'surgeWarn'; h.t = 999; f = { x: Math.min(Math.max(f.x, h.x), h.x + h.w), y: h.y + h.h / 2 }; }
        else if (h.type === 'venomPool') { f = { x: h.x, y: h.y }; }
      }
      // pull the wave towards the telegraph so enemies + telegraph share the frame
      (GAME.enemies || []).forEach(function(e, i){ var a = i * 2.399; e.x = f.x + Math.cos(a) * (160 + 30 * (i % 4)); e.y = f.y + Math.sin(a) * (120 + 20 * (i % 3)); });
      return JSON.stringify(f);
    })()`));
    // telegraph in the left third of the frame (not the centre 60% that shot_stats samples as
    // "floor" — a translucent venom/fire fill there would be scored as floor, not as a telegraph)
    await snapTo(focus.x + 420, focus.y);
    await sleep(150);
    await captureShot(`${biome}-combat.png`);
  }

  const rendererJson = await evalJs(`JSON.stringify(SPRITES.app && SPRITES.app.renderer ? SPRITES.app.renderer.name : null)`);
  writeFileSync(join(OUT, 'stats.json'), JSON.stringify({ shots, renderer: JSON.parse(rendererJson || 'null') }, null, 2));

  ws.close();
  cleanup();

  const anyErr = shots.some(s => s.errors && s.errors.length);
  if (anyErr) {
    console.error('page exceptions recorded during the run:', JSON.stringify(shots.filter(s => s.errors.length), null, 2));
  }
  console.log(`wrote ${shots.length} shots to ${OUT} (${anyErr ? 'WITH page exceptions' : 'no page exceptions'})`);
  process.exit(anyErr ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
