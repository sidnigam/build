// 05.7.1-01: seedable U + harness/script-order parity.
'use strict';
module.exports = function ({ R, check, harness, fs, path, root }) {
  // --- determinism of U.rand under a seed ---
  const ok = R(`(() => {
    U.seed(42); const a = []; for (let i = 0; i < 10; i++) a.push(U.rand());
    U.seed(42); const b = []; for (let i = 0; i < 10; i++) b.push(U.rand());
    return { same: JSON.stringify(a) === JSON.stringify(b), inRange: a.every(v => v >= 0 && v < 1), distinct: new Set(a).size > 5 };
  })()`);
  check('U.seed(42): ten U.rand() values repeat exactly after re-seeding', ok.same);
  check('U.seed(42): every value is in [0, 1)', ok.inRange);
  check('U.seed(42): values are not degenerate', ok.distinct);

  const seq = R(`(() => {
    const run = () => { U.seed(7); const arr = [1,2,3,4,5,6,7,8,9,10]; const out = [];
      for (let i = 0; i < 5; i++) {
        out.push(U.choice(arr)); out.push(U.shuffle(arr).join(','));
        out.push(U.weightedChoice([{ w: 1, id: 'a' }, { w: 3, id: 'b' }]).id);
        out.push(U.chance(0.5)); out.push(U.randInt(1, 6));
      }
      return JSON.stringify(out); };
    const a = run(), b = run();
    return { same: a === b, a };
  })()`);
  check('U.seed(7): choice/shuffle/weightedChoice/chance/randInt sequences repeat exactly', seq.same);

  const st = R(`(() => {
    U.seed(3); const s1 = U.seeded === true && U._r !== Math.random;
    U.unseed(); const s2 = U.seeded === false && U._r === Math.random;
    return { s1, s2 };
  })()`);
  check('U.seed sets U.seeded === true and replaces U._r', st.s1);
  check('U.unseed() restores U._r === Math.random and U.seeded === false', st.s2);

  const usrc = fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
  check('js/utils.js has zero Math.random( calls', (usrc.match(/Math\.random\(/g) || []).length === 0);

  // --- GAME_FILES parity with smoke.js and index.html ---
  const smoke = fs.readFileSync(path.join(root, 'test', 'smoke.js'), 'utf8');
  const m = smoke.match(/const files = \[([^\]]+)\]/);
  const smokeFiles = m ? m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
  check('harness.GAME_FILES deep-equals the smoke.js files array',
    smokeFiles.length > 0 && JSON.stringify(smokeFiles) === JSON.stringify(harness.GAME_FILES));

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const htmlFiles = []; let mm; const re = /<script src="js\/([^"]+)"/g;
  while ((mm = re.exec(html))) htmlFiles.push(mm[1]);
  const idx = smokeFiles.map(f => htmlFiles.indexOf(f));
  check('every smoke file is in index.html, in the same relative order',
    idx.every(i => i >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]));
  const lazy = ['dialogue.js', 'environment.js'];
  const missing = htmlFiles.filter(f => !smokeFiles.includes(f) && !lazy.includes(f));
  check('every index.html js/*.js script is in the smoke list (except dialogue.js, environment.js)'
    + (missing.length ? ' — missing: ' + missing.join(', ') : ''), missing.length === 0);

  // --- runner contract ---
  const cp = require('child_process');
  const tmp = path.join(root, 'test', 'combat', '__throws_probe.test.js');
  // Probe in a child runner with --only so a throwing suite is reported, not a crash.
  fs.writeFileSync(tmp, "module.exports = () => { throw new Error('probe'); };\n");
  let r;
  try { r = cp.spawnSync(process.execPath, [path.join(root, 'test', 'combat.js'), '--only', '__throws_probe'], { encoding: 'utf8' }); }
  finally { fs.unlinkSync(tmp); }
  const out = (r.stdout || '') + (r.stderr || '');
  check('a suite that throws is reported as a FAIL line (exit 1), not a crash',
    r.status === 1 && /FAIL\s+__throws_probe\.test\.js: suite threw/.test(out) && /1 FAILURE/.test(out));

  R('U.unseed()');
};
