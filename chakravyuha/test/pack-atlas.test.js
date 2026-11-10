// test/pack-atlas.test.js — TDD tests for tools/pack-atlas.js
// Run: node test/pack-atlas.test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

// Use sharp to create a valid PNG for testing (same dep as pack-atlas.js)
const sharp = require('sharp');

let passed = 0;
let failed = 0;

function check(label, cond, detail) {
  if (cond) {
    console.log(`  ok  ${label}`);
    passed++;
  } else {
    console.error(`FAIL  ${label}` + (detail ? ' — ' + detail : ''));
    failed++;
  }
}

async function makeInputDir(frameNames) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-test-'));
  const png = await sharp({
    create: { width: 128, height: 128, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 255 } }
  }).png().toBuffer();
  for (const name of frameNames) {
    fs.writeFileSync(path.join(dir, name), png);
  }
  return dir;
}

async function runTests() {
  // Test 1: Packing produces player-atlas.png and player-atlas.json
  console.log('\n— Test 1: pack produces atlas PNG + JSON —');
  const inp1 = await makeInputDir(['player_idle_0.png', 'player_idle_1.png', 'player_run_0.png', 'player_run_1.png']);
  const out1 = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-out-'));
  try {
    cp.execSync(
      `node ${path.join(__dirname, '..', 'tools', 'pack-atlas.js')} ${inp1} player-atlas ${out1}`,
      { stdio: 'pipe', cwd: path.join(__dirname, '..') }
    );
    check('player-atlas.png exists', fs.existsSync(path.join(out1, 'player-atlas.png')));
    check('player-atlas.json exists', fs.existsSync(path.join(out1, 'player-atlas.json')));
  } catch (e) {
    check('pack-atlas.js ran without error', false, e.stderr ? e.stderr.toString().slice(0, 200) : e.message);
    check('player-atlas.png exists', false, 'not reached');
    check('player-atlas.json exists', false, 'not reached');
  }

  // Test 2: Output JSON contains an animations object with keys idle and run
  console.log('\n— Test 2: animations block has idle and run keys —');
  try {
    const atlasPath = path.join(out1, 'player-atlas.json');
    if (fs.existsSync(atlasPath)) {
      const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
      check('atlas.animations is an object', atlas.animations && typeof atlas.animations === 'object');
      check('animations.idle exists', !!atlas.animations.idle, JSON.stringify(Object.keys(atlas.animations || {})));
      check('animations.run exists', !!atlas.animations.run, JSON.stringify(Object.keys(atlas.animations || {})));
    } else {
      check('atlas.json readable for animations', false, 'file not found');
      check('animations.idle exists', false, 'not reached');
      check('animations.run exists', false, 'not reached');
    }
  } catch (e) {
    check('animations block parse', false, e.message);
    check('animations.idle exists', false, 'not reached');
    check('animations.run exists', false, 'not reached');
  }

  // Test 3: animations.idle ordered ascending; animations.run ordered ascending
  console.log('\n— Test 3: frame ordering within animation groups —');
  try {
    const atlasPath = path.join(out1, 'player-atlas.json');
    if (fs.existsSync(atlasPath)) {
      const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
      const idle = atlas.animations && atlas.animations.idle;
      const run = atlas.animations && atlas.animations.run;
      check(
        'animations.idle == [player_idle_0.png, player_idle_1.png]',
        JSON.stringify(idle) === JSON.stringify(['player_idle_0.png', 'player_idle_1.png']),
        JSON.stringify(idle)
      );
      check(
        'animations.run == [player_run_0.png, player_run_1.png]',
        JSON.stringify(run) === JSON.stringify(['player_run_0.png', 'player_run_1.png']),
        JSON.stringify(run)
      );
    } else {
      check('atlas.json readable for ordering', false, 'file not found');
      check('animations.run ordering', false, 'not reached');
    }
  } catch (e) {
    check('animations ordering parse', false, e.message);
    check('animations.run ordering', false, 'not reached');
  }

  // Test 4: frames and meta blocks are preserved (injection is additive)
  console.log('\n— Test 4: frames + meta preserved after injection —');
  try {
    const atlasPath = path.join(out1, 'player-atlas.json');
    if (fs.existsSync(atlasPath)) {
      const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
      check('atlas.frames exists', atlas.frames && typeof atlas.frames === 'object', JSON.stringify(Object.keys(atlas)));
      check('atlas.meta exists', atlas.meta && typeof atlas.meta === 'object', JSON.stringify(Object.keys(atlas)));
    } else {
      check('atlas.frames exists', false, 'file not found');
      check('atlas.meta exists', false, 'not reached');
    }
  } catch (e) {
    check('frames+meta parse', false, e.message);
    check('atlas.meta exists', false, 'not reached');
  }

  console.log(`\n${failed === 0 ? 'ALL TESTS PASSED' : failed + ' FAILURE(S)'} (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test runner error:', e.message);
  process.exit(1);
});
