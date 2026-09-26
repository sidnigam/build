// tools/check-provenance.js — ART-06 provenance completeness gate
// Verifies every *-atlas.png / *-bg.png under assets/sprites/ has a complete entry in
// PROVENANCE.json.
//
// Usage (CI / smoke hook):
//   node tools/check-provenance.js
//
// Exported for use in test/smoke.js:
//   const { checkProvenance } = require('../tools/check-provenance.js');
//   const { ok, missing, incomplete } = checkProvenance('assets/sprites');
'use strict';

const fs = require('fs');
const path = require('path');

// Fields every generated (kind: biome|boss|enemy) entry must have to count as complete.
const REQUIRED_FIELDS = ['prompt', 'seed', 'checkpoint', 'post_processing', 'review_status'];

/**
 * checkProvenance(rootDir)
 * Recursively finds every *-atlas.png / *-bg.png under rootDir.
 * Loads <rootDir>/PROVENANCE.json -> assets[] and checks:
 *   - every tracked file has a matching entry (by filename)          -> missing[]
 *   - every entry with kind in {biome, boss, enemy} has all of
 *     REQUIRED_FIELDS populated (non-empty)                          -> incomplete[]
 * Entries with no `kind` (e.g. the legacy player-atlas.png entry) are exempt from the
 * completeness check.
 * Vacuously true (ok=true, missing=[], incomplete=[]) when no tracked files exist.
 *
 * @param {string} rootDir - Root sprites directory (default: 'assets/sprites')
 * @returns {{ ok: boolean, missing: string[], incomplete: string[], atlases: string[] }}
 */
function checkProvenance(rootDir = 'assets/sprites') {
  // Find all *-atlas.png / *-bg.png files recursively
  const atlases = findAtlases(rootDir);

  // Load PROVENANCE.json
  const provenancePath = path.join(rootDir, 'PROVENANCE.json');
  let provenance = { assets: [] };
  if (fs.existsSync(provenancePath)) {
    try {
      provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
    } catch (e) {
      // Malformed JSON — treat as empty (all tracked files will be flagged as missing)
      provenance = { assets: [] };
    }
  }

  const byFilename = new Map(
    (provenance.assets || []).map(entry => [entry.filename, entry])
  );

  // Check each tracked file has a provenance entry
  const missing = atlases
    .map(p => path.basename(p))
    .filter(basename => !byFilename.has(basename));

  // Check completeness for generated entries (kind in {biome, boss, enemy})
  const incomplete = [];
  for (const entry of provenance.assets || []) {
    if (!entry.kind || !['biome', 'boss', 'enemy'].includes(entry.kind)) continue; // exempt (e.g. player)
    const missingFields = REQUIRED_FIELDS.filter(field => {
      const v = entry[field];
      if (Array.isArray(v)) return v.length === 0 && field === 'post_processing';
      return v === undefined || v === null || v === '';
    });
    if (missingFields.length > 0) {
      incomplete.push(`${entry.filename}: missing ${missingFields.join(', ')}`);
    }
  }

  return {
    ok: missing.length === 0 && incomplete.length === 0,
    missing,
    incomplete,
    atlases: atlases.map(p => path.basename(p)),
  };
}

/**
 * findAtlases(dir) — recursively collect all *-atlas.png / *-bg.png paths
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
      } else if (entry.isFile() && /-(atlas|bg)\.png$/.test(entry.name)) {
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
    console.log(`provenance ok (${count} atlases/backgrounds)`);
    process.exit(0);
  } else {
    console.error(`provenance FAIL:`);
    if (result.missing.length) {
      console.error(`  missing PROVENANCE.json entries:`);
      for (const name of result.missing) console.error(`    - ${name}`);
    }
    if (result.incomplete.length) {
      console.error(`  incomplete entries:`);
      for (const line of result.incomplete) console.error(`    - ${line}`);
    }
    process.exit(1);
  }
}
