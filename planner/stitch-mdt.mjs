// Stitch MDT's per-dungeon map tiles into one base image for the planner spike.
//
// MDT ships the painted UiMap art as a 15×10 grid of 128px tiles named `<sublevel>_<n>.png`, where
// n = (row-1)*15 + col (row 1..10 top→bottom, col 1..15 left→right) — see MythicDungeonTools.lua's
// UpdateMap loop. Stitched native size = 1920×1280. Using MDT's OWN texture as the base guarantees
// the enemy clones (authored against this exact art) align with NO per-landmark fitting — only a
// uniform scale + y-flip from MDT's 840-wide canvas. (Our wow.export UiMap raster turned out to be a
// different crop, which is why the first pass was offset.)
//
// Input  (gitignored): cache/mdt/tiles/1_1.png … 1_150.png — re-fetch the public MDT source if absent:
//   base=https://raw.githubusercontent.com/Nnoggie/MythicDungeonTools/master/Midnight/Textures/PitOfSaron
//   for n in $(seq 1 150); do curl -sL "$base/1_$n.png" -o cache/mdt/tiles/1_$n.png; done
// Output (committed): web/planner-spike/pit-of-saron-mdt.png — the spike's base map.
//
// Uses the existing playwright dep (no image library) to composite via a headless <canvas>.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const TILES = join(ROOT, 'cache', 'mdt', 'tiles');
const OUT = join(HERE, 'pit-of-saron-mdt.png');

const COLS = 15, ROWS = 10, T = 128;   // MDT's large-map grid (15×10 × 128px = 1920×1280)

const tiles = [];
for (let n = 1; n <= COLS * ROWS; n++) {
  const b = readFileSync(join(TILES, `1_${n}.png`));
  tiles.push('data:image/png;base64,' + b.toString('base64'));
}

const browser = await chromium.launch();
const page = await browser.newPage();
const dataUrl = await page.evaluate(async ({ tiles, COLS, ROWS, T }) => {
  const cv = document.createElement('canvas');
  cv.width = COLS * T; cv.height = ROWS * T;
  const ctx = cv.getContext('2d');
  const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  for (let n = 0; n < tiles.length; n++) {
    const im = await load(tiles[n]);
    const i = Math.floor(n / COLS), j = n % COLS;   // n is 0-based: row i, col j
    ctx.drawImage(im, j * T, i * T, T, T);
  }
  return cv.toDataURL('image/png');
}, { tiles, COLS, ROWS, T });
await browser.close();

writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`wrote ${OUT} (${COLS * T}×${ROWS * T}, from ${tiles.length} tiles)`);
