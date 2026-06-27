// Extract real mob positions from MDT's open-source Lua → the planner spike's mob list.
//
// MDT (Nnoggie/MythicDungeonTools, Midnight/PitOfSaron.lua) authors each enemy's clones
// in MDT's canvas coordinate space: x ∈ [0, sizex], y ∈ [0, -sizey], anchored at the map
// frame's TOP-LEFT (MythicDungeonTools.lua: `local sizex = 840`; the native texture is a
// 15×10 grid of 128px tiles = 1920×1280, the 840-wide canvas scaled ×(128/56)=2.2857).
//
// We base the spike on MDT's OWN stitched texture (pit-of-saron-mdt.png, 1920×1280, built by
// stitch-mdt.mjs) — the exact art the clones were authored against — so alignment needs only a
// uniform scale + a y-flip, no per-landmark fitting:
//
//     px = x * (PNG_W / 840) ,  py = -y * (PNG_H / 560)        // both factors = 2.285714
//
// (560 = the 10 square-tile rows of the 840-wide canvas; the texture spans [0,840]×[0,-560].
// An earlier pass used a wow.export UiMap raster — a DIFFERENT crop — and the mobs were offset.)
//
// Input (gitignored cache, like cache/db2 — re-fetch the public MDT source if absent):
//   curl -sL https://raw.githubusercontent.com/Nnoggie/MythicDungeonTools/master/Midnight/PitOfSaron.lua \
//        -o cache/mdt/PitOfSaron.lua
//
// Usage:  node web/planner-spike/extract-mdt.mjs            # inspect: print enemies + dist-join report
//         node web/planner-spike/extract-mdt.mjs --write    # write pit-of-saron.mobs.json for the spike
//
// Read-only on MDT input (cache/mdt/PitOfSaron.lua) and the built dist; nothing in src/ is touched.
// The committed output (pit-of-saron.mobs.json) is what the spike loads, so it runs without the cache.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const LUA = join(ROOT, 'cache', 'mdt', 'PitOfSaron.lua');
const DIST = join(ROOT, 'dist', 'midnight-s1', 'pit-of-saron.json');
const OUT = join(HERE, 'pit-of-saron.mobs.json');

const PNG_W = 1920, PNG_H = 1280;      // MDT's stitched native texture (pit-of-saron-mdt.png)
const MDT_W = 840,  MDT_H = 560;       // MDT canvas (sizex; the square-tile extent for y)
const SX = PNG_W / MDT_W, SY = PNG_H / MDT_H;   // 2.285714 each

// Legacy (WotLK) display-id fallback, keyed by creature NAME. The render CDN doesn't carry most
// reworked-Midnight trash models yet (they 403), but the WotLK portraits DO render — for the few
// creatures that genuinely CARRIED OVER from the original Pit of Saron. The Midnight rework replaced
// most trash with NEW creatures that have no legacy equivalent, so this map is deliberately small
// (faithful, not approximate). Each value is verified to return HTTP 200 on the render CDN.
//   Resolve a new one: its WotLK npc page on Wowhead → the modelviewer displayId, then confirm it
//   renders at render.worldofwarcraft.com/us/npcs/zoom/creature-display-<id>.jpg.
const LEGACY_DISPLAY = {
  'Deathwhisper Necrolyte': 22196,   // WotLK npc 36788; confirmed 200
  // 'Iceborn Proto-Drake': <TBD>    // WotLK npc 36891 — legacy display id unresolved (lets it letter-fall back)
};

// ---- parse MDT.dungeonEnemies[...] = { [n] = { ...clones... }, ... } ----------------
// A line-oriented walk: the file is machine-generated and regular, so we don't need a full
// Lua parser. Track the current enemy and whether we're inside its `clones` sub-table.
function parseEnemies(lua) {
  const lines = lua.split(/\r?\n/);
  let inEnemies = false, depthAtEnemies = 0;
  const enemies = [];
  let cur = null, inClones = false, clone = null;

  const num = (s) => Number(s);
  for (const raw of lines) {
    const line = raw;
    if (!inEnemies) {
      if (/MDT\.dungeonEnemies\[dungeonIndex\]\s*=\s*\{/.test(line)) inEnemies = true;
      continue;
    }
    // a new enemy: `  [N] = {`  at the enemies level (2 leading spaces)
    const eMatch = line.match(/^\s{2}\[(\d+)\]\s*=\s*\{/);
    if (eMatch && !inClones) {
      cur = { idx: num(eMatch[1]), clones: [] };
      enemies.push(cur);
      continue;
    }
    if (!cur) {
      // top-level close `};` ends the table
      if (/^\};?\s*$/.test(line)) break;
      continue;
    }
    if (/\["clones"\]\s*=\s*\{/.test(line)) { inClones = true; continue; }
    if (inClones) {
      const cMatch = line.match(/^\s{6}\[(\d+)\]\s*=\s*\{/);
      if (cMatch) { clone = {}; cur.clones.push(clone); continue; }
      let m;
      if ((m = line.match(/\["x"\]\s*=\s*([-0-9.]+)/))) { clone.x = num(m[1]); continue; }
      if ((m = line.match(/\["y"\]\s*=\s*([-0-9.]+)/))) { clone.y = num(m[1]); continue; }
      if ((m = line.match(/\["sublevel"\]\s*=\s*([-0-9.]+)/))) { clone.sublevel = num(m[1]); continue; }
      // `    },` at 4-space indent closes the clones table for this enemy
      if (/^\s{4}\},?\s*$/.test(line)) { inClones = false; clone = null; continue; }
      continue;
    }
    // scalar fields on the enemy
    let m;
    if ((m = line.match(/\["name"\]\s*=\s*"([^"]*)"/))) cur.name = m[1];
    else if ((m = line.match(/\["id"\]\s*=\s*(\d+)/))) cur.id = num(m[1]);
    else if ((m = line.match(/\["count"\]\s*=\s*(\d+)/))) cur.count = num(m[1]);
    else if ((m = line.match(/\["displayId"\]\s*=\s*(\d+)/))) cur.displayId = num(m[1]);
    else if ((m = line.match(/\["creatureType"\]\s*=\s*"([^"]*)"/))) cur.creatureType = m[1];
    else if (/\["isBoss"\]\s*=\s*true/.test(line)) cur.isBoss = true;
  }
  return enemies;
}

const lua = readFileSync(LUA, 'utf8');
const enemies = parseEnemies(lua);
const dist = JSON.parse(readFileSync(DIST, 'utf8'));
const distById = new Map(dist.creatures.map((c) => [c.npc_id, c]));

// ---- build the flat mob-instance list (one per clone) -------------------------------
const mobs = [];
let unjoined = [];
for (const e of enemies) {
  const known = distById.get(e.id);
  if (!known) unjoined.push(e);
  e.clones.forEach((c, i) => {
    if (c.sublevel !== 1) return;   // Pit of Saron is a single sublevel; guard anyway
    mobs.push({
      iid: `${e.id}_${i + 1}`,
      npc_id: e.id,
      name: e.name,
      boss: !!(e.isBoss || (known && known.is_boss)),
      did: e.displayId ?? null,
      legacyDid: LEGACY_DISPLAY[e.name] ?? null,  // WotLK portrait to try if the Midnight render 403s
      type: e.creatureType ?? null,   // creature-type letter blip if neither render exists
      forces: e.count ?? 0,
      known: !!known,                 // false = MDT mob absent from our dist (engine won't know it)
      x: +(c.x * SX).toFixed(1),
      y: +(-c.y * SY).toFixed(1),
    });
  });
}

// ---- report ------------------------------------------------------------------------
console.log(`MDT enemies: ${enemies.length} · clones→mob instances (sublevel 1): ${mobs.length}`);
console.log(`transform: px = x*${SX.toFixed(4)}, py = -y*${SY.toFixed(4)}  (MDT 840×560 → PNG ${PNG_W}×${PNG_H})\n`);
console.log('id'.padEnd(8), 'boss'.padEnd(5), 'clones'.padEnd(7), 'forces'.padEnd(7), 'display'.padEnd(8), 'dist?  name');
for (const e of enemies) {
  const known = distById.get(e.id);
  const tag = known ? `✓(${known.spells ? known.spells.length : 0}sp)` : '✗MISS';
  console.log(
    String(e.id).padEnd(8),
    (e.isBoss ? 'BOSS' : '').padEnd(5),
    String(e.clones.length).padEnd(7),
    String(e.count ?? 0).padEnd(7),
    String(e.displayId ?? '-').padEnd(8),
    tag.padEnd(7), e.name,
  );
}
if (unjoined.length) {
  console.log(`\n⚠ ${unjoined.length} MDT enemy id(s) not in dist (engine won't recognize): ` +
    unjoined.map((e) => `${e.id} ${e.name}`).join(', '));
}
const totalForces = enemies.reduce((n, e) => n + (e.count ?? 0) * e.clones.length, 0);
console.log(`\nΣ enemy forces (count×clones): ${totalForces}  (MDT dungeonTotalCount.normal = 643)`);

if (process.argv.includes('--write')) {
  writeFileSync(OUT, JSON.stringify({
    _source: 'MDT Nnoggie/MythicDungeonTools Midnight/PitOfSaron.lua (dungeonIndex 150)',
    _transform: `px = x*${SX.toFixed(6)}, py = -y*${SY.toFixed(6)} (MDT 840×560 canvas → ${PNG_W}×${PNG_H} px)`,
    forces_total: 643,
    mobs,
  }, null, 2));
  console.log(`\nwrote ${OUT} (${mobs.length} mob instances)`);
}
