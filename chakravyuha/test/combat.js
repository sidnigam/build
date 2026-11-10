// ============================================================
// CHAKRAVYUHA — test/combat.js : fast combat suite runner (05.7.1-01)
// Runs every test/combat/*.test.js suite in a FRESH headless sandbox.
// Each suite exports a synchronous function receiving
//   { R, sandbox, h, check, section, harness, fs, path, root }.
// Run: node test/combat.js [--only <substring>]
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const harness = require('./harness.js');

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? args[oi + 1] : null;

const dir = path.join(__dirname, 'combat');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);
const suites = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort()
  .filter(f => !only || f.includes(only));

const { check, section, failures } = harness.makeChecker();
const t0 = Date.now();
if (!suites.length) check('combat suite: at least one suite matched' + (only ? ' --only ' + only : ''), false);
for (const name of suites) {
  section('combat: ' + name);
  try {
    const h = harness.createSandbox();
    const suite = require(path.join(dir, name));
    suite({ R: h.R, sandbox: h.sandbox, h, check, section, harness, fs, path, root: harness.ROOT });
  } catch (e) {
    check(name + ': suite threw — ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '), false);
  }
}
console.log(`\ncombat suite: ${suites.length} suite(s) in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
const n = failures();
console.log(n === 0 ? 'COMBAT SUITE PASSED' : `${n} FAILURE(S)`);
process.exit(n ? 1 : 0);
