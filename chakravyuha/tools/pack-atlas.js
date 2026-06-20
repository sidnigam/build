// tools/pack-atlas.js — Free-tex-packer-core build step with animations-block injection
// Solves RESEARCH Pitfall 1: free-tex-packer's "Pixi" exporter omits the `animations` block
// that PixiJS v8's Spritesheet API requires to populate sheet.animations.
//
// Usage: node tools/pack-atlas.js <inputDir> <textureName> <outDir> [--size N]
//
// Example:
//   node tools/pack-atlas.js raw/player player-atlas assets/sprites/player
//
// Frame naming convention: {actor}_{state}_{n}.png  e.g. player_idle_0.png
// The animations block key is the "state" portion (middle segments), ordered ascending by index.
// This matches SPRITES.groupFramesByAnimation() in js/sprites.js exactly.
'use strict';

const fs = require('fs');
const path = require('path');
const texturePacker = require('free-tex-packer-core');

// ---- parse args ----
const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node tools/pack-atlas.js <inputDir> <textureName> <outDir> [--size N]');
  process.exit(1);
}

const [inputDir, textureName, outDir] = args;
let targetSize = null;
const sizeFlag = args.indexOf('--size');
if (sizeFlag !== -1 && args[sizeFlag + 1]) {
  targetSize = parseInt(args[sizeFlag + 1], 10);
}

// ---- groupFramesByAnimation ----
// Duplicate of SPRITES.groupFramesByAnimation from js/sprites.js.
// Cannot import from sprites.js — it's a browser global, not a module.
// Algorithm: strip .png, split on _, take [actor, ...mid, idx], key = mid.join('_'), sort by Number(idx) asc.
function groupFramesByAnimation(frameNames) {
  const groups = {};
  const indices = {};

  for (const name of frameNames) {
    const noExt = name.replace(/\.png$/, '');
    const parts = noExt.split('_');
    if (parts.length < 3) continue; // need at least actor + state + index

    const idx = parts[parts.length - 1];
    const mid = parts.slice(1, parts.length - 1);
    const animName = mid.join('_');
    const numIdx = Number(idx);

    if (!groups[animName]) {
      groups[animName] = [];
      indices[animName] = [];
    }
    groups[animName].push(name);
    indices[animName].push(numIdx);
  }

  // Sort each group ascending by numeric index
  const result = {};
  for (const anim of Object.keys(groups).sort()) {
    const paired = groups[anim].map((f, i) => [indices[anim][i], f]);
    paired.sort((a, b) => a[0] - b[0]);
    result[anim] = paired.map(p => p[1]);
  }
  return result;
}

// ---- main ----
async function main() {
  if (!fs.existsSync(inputDir)) {
    console.error(`Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  // Ensure output directory exists
  fs.mkdirSync(outDir, { recursive: true });

  // Read all *.png files from inputDir
  const pngFiles = fs.readdirSync(inputDir)
    .filter(f => f.toLowerCase().endsWith('.png'))
    .sort(); // deterministic order

  if (pngFiles.length === 0) {
    console.warn(`Warning: no PNG files found in ${inputDir}`);
    process.exit(0);
  }

  console.log(`Packing ${pngFiles.length} frames from ${inputDir} as ${textureName}...`);

  // Optionally resize frames using sharp
  let images;
  if (targetSize) {
    const sharp = require('sharp');
    images = await Promise.all(
      pngFiles.map(async (f) => {
        const buf = await sharp(path.join(inputDir, f))
          .resize(targetSize, targetSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        return { path: f, contents: buf };
      })
    );
  } else {
    images = pngFiles.map(f => ({
      path: f,
      contents: fs.readFileSync(path.join(inputDir, f)),
    }));
  }

  // Pack with free-tex-packer-core using Pixi exporter
  await new Promise((resolve, reject) => {
    texturePacker(images, {
      textureName,
      exporter: 'Pixi',
      width: 2048,
      height: 2048,
      padding: 2,
      allowRotation: false,
      allowTrim: true,
      removeFileExtension: false,
    }, (files, error) => {
      if (error) {
        reject(error);
        return;
      }

      for (const file of files) {
        const outPath = path.join(outDir, file.name);

        if (file.name.endsWith('.json')) {
          // INJECT animations block (Pitfall 1 fix)
          const atlas = JSON.parse(file.buffer.toString());
          atlas.animations = groupFramesByAnimation(Object.keys(atlas.frames));

          // Log the resulting animation keys + frame counts
          const animKeys = Object.keys(atlas.animations);
          console.log(`Animations injected: ${animKeys.map(k => k + '(' + atlas.animations[k].length + 'f)').join(', ')}`);

          fs.writeFileSync(outPath, JSON.stringify(atlas, null, 2));
          console.log(`Written: ${outPath}`);
        } else {
          // Write PNG buffer as-is
          fs.writeFileSync(outPath, file.buffer);
          console.log(`Written: ${outPath}`);
        }
      }

      resolve();
    });
  });

  console.log(`Done. Atlas packed to ${outDir}/${textureName}.{png,json}`);
}

main().catch(e => {
  console.error('pack-atlas error:', e.message || e);
  process.exit(1);
});
