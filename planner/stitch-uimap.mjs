// Stitch wow.export's painted UiMap art tiles into one base image per floor for the planner.
//
// Altar of Fangs ships its painted dungeon map as the UiMapArtTile texture set "ulatek_dungeon"
// (ulatek = Atal'Utek). Each floor (UiMapArt) is a 4-col × 3-row grid of 256px tiles, exported by
// wow.export under listfile names ulatek_dungeon_<set><n> (set a/b/c = the three floors, n = 1..12).
// Tiles are placed ROW-MAJOR: n -> row = (n-1)//4, col = (n-1)%4 (the standard WoW tile convention;
// verify the result against the in-game map). Stitched native size per floor = 1024×768.
//
// UiMap↔art (from wago.tools UiMapXMapArt): 2588->art2094, 2589->art2092, 2590->art2093.
//
// Input  (gitignored): cache/uimap/altar-of-fangs/ulatek_dungeon_<a|b|c><1..12>.png  (wow.export PNG)
// Output (committed):  web/planner-spike/altar-of-fangs-<uiMapID>.png  (one per floor present)
//
// Uses the existing playwright dep (no image library) to composite via a headless <canvas>.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const TILES = join(ROOT, 'cache', 'uimap', 'altar-of-fangs');
const PREFIX = 'ulatek_dungeon_';
const COLS = 4, ROWS = 3, T = 256;   // 4×3 grid of 256px tiles = 1024×768

const FLOORS = [
  { set: 'a', uiMapID: 2588, name: 'Sacrificial Approach' },
  { set: 'b', uiMapID: 2589, name: 'floor 2' },
  { set: 'c', uiMapID: 2590, name: 'floor 3' },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const floor of FLOORS) {
  const paths = [];
  let missing = false;
  for (let n = 1; n <= COLS * ROWS; n++) {
    const p = join(TILES, `${PREFIX}${floor.set}${n}.png`);
    if (!existsSync(p)) { missing = true; break; }
    paths.push(p);
  }
  if (missing) { console.log(`skip ${floor.uiMapID} (${floor.name}) — tiles ${PREFIX}${floor.set}* not all present`); continue; }

  const tiles = paths.map((p) => 'data:image/png;base64,' + readFileSync(p).toString('base64'));
  const dataUrl = await page.evaluate(async ({ tiles, COLS, T, ROWS }) => {
    const cv = document.createElement('canvas');
    cv.width = COLS * T; cv.height = ROWS * T;
    const ctx = cv.getContext('2d');
    const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    for (let n = 0; n < tiles.length; n++) {
      const im = await load(tiles[n]);
      const i = Math.floor(n / COLS), j = n % COLS;   // n 0-based: row i, col j (row-major)
      ctx.drawImage(im, j * T, i * T, T, T);
    }
    return cv.toDataURL('image/png');
  }, { tiles, COLS, T, ROWS });

  const out = join(HERE, `altar-of-fangs-${floor.uiMapID}.png`);
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`wrote ${out} (${COLS * T}×${ROWS * T}, from ${tiles.length} tiles, set ${floor.set})`);
}

await browser.close();
