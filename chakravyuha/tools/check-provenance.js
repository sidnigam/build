// tools/check-provenance.js — ART-06 provenance completeness gate
// Verifies every *-atlas.png / *-bg.png / *-portrait.png / *-tile.png under assets/sprites/
// has a complete entry in PROVENANCE.json.
//
// Usage (CI / smoke hook):
//   node tools/check-provenance.js
//
// Exported for use in test/smoke.js:
//   const { checkProvenance } = require('../tools/check-provenance.js');
//   const { ok, missing, incomplete, mismatched } = checkProvenance('assets/sprites');
'use strict';

const fs = require('fs');
const path = require('path');

// Fields every generated (kind: biome|boss|enemy|god) entry must have to count as complete.
const REQUIRED_FIELDS = ['prompt', 'seed', 'checkpoint', 'post_processing', 'review_status'];

// Fields every env-tile / env-prop entry must have (Phase 05.4 D-10), plus a ground_safe
// boolean checked separately below.
const REQUIRED_ENV_ASSET_FIELDS = [
  'prompt', 'seed', 'checkpoint', 'post_processing', 'review_status',
  'role', 'biome', 'cultural_check',
];

// Ground-plane roles: assets on the walkable floor plane, which must be cultural-guard-clean
// (no deity/sacred imagery) and are marked ground_safe: true once verified (D-09/D-10).
const GROUND_ROLES = ['floor', 'water', 'decal', 'hazard-skin'];

/**
 * checkProvenance(rootDir)
 * Recursively finds every *-atlas.png / *-bg.png / *-portrait.png / *-tile.png under rootDir.
 * Loads <rootDir>/PROVENANCE.json -> assets[] and checks:
 *   - every tracked file has a matching entry (by filename)                    -> missing[]
 *   - every entry with kind in {biome, boss, enemy, god} has all of
 *     REQUIRED_FIELDS populated (non-empty)                                   -> incomplete[]
 *   - every entry with kind in {env-tile, env-prop} has all of
 *     REQUIRED_ENV_ASSET_FIELDS populated plus a boolean ground_safe, and a
 *     ground role (floor/water/decal/hazard-skin) requires ground_safe===true -> incomplete[]
 *   - every entry with kind env-atlas has a non-empty components[], review_status
 *     and biome, and its sibling atlas JSON's frame keys equal components[],
 *     and every component has its own complete env-prop entry                 -> incomplete[] / mismatched[]
 * Entries with no `kind` (e.g. the legacy player-atlas.png entry) are exempt from the
 * completeness check.
 * Vacuously true (ok=true, missing=[], incomplete=[], mismatched=[]) when no tracked files
 * and no env-* entries exist.
 *
 * @param {string} rootDir - Root sprites directory (default: 'assets/sprites')
 * @returns {{ ok: boolean, missing: string[], incomplete: string[], atlases: string[], mismatched: string[] }}
 */
function checkProvenance(rootDir = 'assets/sprites') {
  // Find all *-atlas.png / *-bg.png / *-portrait.png / *-tile.png files recursively
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

  // repoRoot: entry.path values are stored relative to the repo root (e.g.
  // "assets/sprites/env/naraka/naraka-env-atlas.png"), while rootDir is the sprites dir.
  const repoRoot = path.resolve(rootDir, '..', '..');

  const incomplete = [];
  const mismatched = [];

  for (const entry of provenance.assets || []) {
    const kind = entry.kind;
    if (!kind) continue; // exempt (e.g. player)

    if (['biome', 'boss', 'enemy', 'god'].includes(kind)) {
      const missingFields = REQUIRED_FIELDS.filter(field => {
        const v = entry[field];
        if (Array.isArray(v)) return v.length === 0 && field === 'post_processing';
        return v === undefined || v === null || v === '';
      });
      if (missingFields.length > 0) {
        incomplete.push(`${entry.filename}: missing ${missingFields.join(', ')}`);
      }
      continue;
    }

    if (kind === 'env-tile' || kind === 'env-prop') {
      const missingFields = REQUIRED_ENV_ASSET_FIELDS.filter(field => {
        const v = entry[field];
        if (Array.isArray(v)) return v.length === 0 && field === 'post_processing';
        return v === undefined || v === null || v === '';
      });
      if (typeof entry.ground_safe !== 'boolean') missingFields.push('ground_safe');
      if (missingFields.length > 0) {
        incomplete.push(`${entry.filename}: missing ${missingFields.join(', ')}`);
      }
      if (GROUND_ROLES.includes(entry.role) && entry.ground_safe !== true) {
        incomplete.push(`${entry.filename}: ground-plane asset not ground_safe`);
      }
      continue;
    }

    if (kind === 'env-atlas') {
      const missingFields = [];
      if (!Array.isArray(entry.components) || entry.components.length === 0) missingFields.push('components');
      if (!entry.review_status) missingFields.push('review_status');
      if (!entry.biome) missingFields.push('biome');
      if (missingFields.length > 0) {
        incomplete.push(`${entry.filename}: missing ${missingFields.join(', ')}`);
      }

      if (Array.isArray(entry.components) && entry.components.length > 0 && entry.path) {
        const atlasJsonPath = path.join(repoRoot, entry.path.replace(/\.png$/, '.json'));
        if (!fs.existsSync(atlasJsonPath)) {
          mismatched.push(`${entry.filename}: sibling atlas JSON not found at ${atlasJsonPath}`);
        } else {
          let atlasJson;
          try {
            atlasJson = JSON.parse(fs.readFileSync(atlasJsonPath, 'utf8'));
          } catch (e) {
            mismatched.push(`${entry.filename}: sibling atlas JSON is malformed (${atlasJsonPath})`);
            atlasJson = null;
          }
          if (atlasJson) {
            const frameNames = Object.keys(atlasJson.frames || {}).sort();
            const componentNames = entry.components.slice().sort();
            const sameSet = frameNames.length === componentNames.length &&
              frameNames.every((f, i) => f === componentNames[i]);
            if (!sameSet) {
              mismatched.push(`${entry.filename}: components ${JSON.stringify(componentNames)} != atlas frames ${JSON.stringify(frameNames)}`);
            }
            for (const component of entry.components) {
              const compEntry = byFilename.get(component);
              if (!compEntry || compEntry.kind !== 'env-prop') {
                mismatched.push(`${entry.filename}: component ${component} has no complete env-prop entry`);
                continue;
              }
              const compMissing = REQUIRED_ENV_ASSET_FIELDS.filter(field => {
                const v = compEntry[field];
                if (Array.isArray(v)) return v.length === 0 && field === 'post_processing';
                return v === undefined || v === null || v === '';
              });
              if (typeof compEntry.ground_safe !== 'boolean') compMissing.push('ground_safe');
              if (compMissing.length > 0) {
                mismatched.push(`${entry.filename}: component ${component} incomplete (missing ${compMissing.join(', ')})`);
              }
            }
          }
        }
      }
      continue;
    }
  }

  return {
    ok: missing.length === 0 && incomplete.length === 0 && mismatched.length === 0,
    missing,
    incomplete,
    atlases: atlases.map(p => path.basename(p)),
    mismatched,
  };
}

/**
 * findAtlases(dir) — recursively collect all *-atlas.png / *-bg.png / *-portrait.png /
 * *-tile.png paths. Skips `_gen` (scratch generations, never provenance-tracked); `_raw`
 * is walked but its files don't match these suffixes, so it contributes nothing here.
 */
function findAtlases(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === '_gen') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /-(atlas|bg|portrait|tile)\.png$/.test(entry.name)) {
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
    console.log(`provenance ok (${count} atlases/backgrounds/portraits)`);
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
    if (result.mismatched.length) {
      console.error(`  mismatched atlas components:`);
      for (const line of result.mismatched) console.error(`    - ${line}`);
    }
    process.exit(1);
  }
}
