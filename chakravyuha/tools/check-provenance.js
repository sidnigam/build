// tools/check-provenance.js — ART-06 provenance completeness gate
// Verifies every *-atlas.png under assets/sprites/ has an entry in PROVENANCE.json.
//
// Usage (CI / smoke hook):
//   node tools/check-provenance.js
//
// Exported for use in test/smoke.js:
//   const { checkProvenance } = require('../tools/check-provenance.js');
//   const { ok, missing } = checkProvenance('assets/sprites');
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * checkProvenance(rootDir)
 * Recursively finds every *-atlas.png under rootDir.
 * Loads <rootDir>/PROVENANCE.json -> assets[] and checks each atlas has a matching entry.
 * Returns { ok: boolean, missing: string[] } where missing[] contains basenames without entries.
 * Vacuously true (ok=true, missing=[]) when no atlases exist.
 *
 * @param {string} rootDir - Root sprites directory (default: 'assets/sprites')
 * @returns {{ ok: boolean, missing: string[], atlases: string[] }}
 */
function checkProvenance(rootDir = 'assets/sprites') {
  // Find all *-atlas.png files recursively
  const atlases = findAtlases(rootDir);

  // Load PROVENANCE.json
  const provenancePath = path.join(rootDir, 'PROVENANCE.json');
  let provenance = { assets: [] };
  if (fs.existsSync(provenancePath)) {
    try {
      provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
    } catch (e) {
      // Malformed JSON — treat as empty (all atlases will be flagged as missing)
      provenance = { assets: [] };
    }
  }

  const knownFilenames = new Set(
    (provenance.assets || []).map(entry => entry.filename)
  );

  // Check each atlas has a provenance entry
  const missing = atlases
    .map(p => path.basename(p))
    .filter(basename => !knownFilenames.has(basename));

  return {
    ok: missing.length === 0,
    missing,
    atlases: atlases.map(p => path.basename(p)),
  };
}

/**
 * findAtlases(dir) — recursively collect all *-atlas.png paths
 */
function findAtlases(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('-atlas.png')) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

module.exports = { checkProvenance };

// Run directly: node tools/check-provenance.js
if (require.main === module) {
  const result = checkProvenance();
  if (result.ok) {
    const count = result.atlases.length;
    console.log(`provenance ok (${count} atlases)`);
    process.exit(0);
  } else {
    console.error(`provenance FAIL — atlases missing PROVENANCE.json entries:`);
    for (const name of result.missing) {
      console.error(`  - ${name}`);
    }
    process.exit(1);
  }
}
