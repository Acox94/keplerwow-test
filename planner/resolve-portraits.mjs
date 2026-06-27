// Portrait curation resolver — decide the best portrait source for each mob, and emit a manifest.
//
// THE METHOD (per dungeon, repeatable):
//   1. resolve-portraits.mjs (this) — DETERMINISTIC probe of each npc's portrait sources, in priority
//      order, writing portrait-manifest.json + printing the missing-ID list marked by fallback status.
//   2. agent verification pass — for the UNRESOLVED creatures, read-only agents hunt for a non-ThreeChest
//      official/hotlinkable render and visually QC any borrowed portrait; they produce dossiers, a human
//      gates the manifest (the project's "agents gather, human gates" rule).
//   3. resolve-portraits.mjs --fetch — LAST RESORT: download ThreeChest's self-hosted renders for the
//      creatures with no other source into portraits-borrowed/ (GITIGNORED — borrowed, must not ship).
//
// Source priority (most→least preferred):
//   a. Blizzard render CDN, Midnight displayId   (official, exact model)  — loaded LIVE, no download
//   b. Blizzard render CDN, legacy WotLK displayId (own, carried-over creatures) — loaded LIVE
//   c. self-rendered PNG in portraits/<npc_id>.png (wow.export, future)   — committable, exact model
//   d. ThreeChest npc_portraits/<npc_id>.png       (BORROWED, last resort) — portraits-borrowed/, gitignored
//   e. none → creature-type letter blip
//
// Usage:  node web/planner-spike/resolve-portraits.mjs            # probe + write manifest + print list
//         node web/planner-spike/resolve-portraits.mjs --fetch    # also download the last-resort borrowed set

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBS = join(HERE, 'pit-of-saron.mobs.json');
const MANIFEST = join(HERE, 'portrait-manifest.json');
const BORROWED = join(HERE, 'portraits-borrowed');     // gitignored; ThreeChest last-resort renders
const SELF = join(HERE, 'portraits');                  // committable; our own wow.export renders (future)

const cdnUrl = (did) => `https://render.worldofwarcraft.com/us/npcs/zoom/creature-display-${did}.jpg`;
const zamUrl = (did) => `https://wow.zamimg.com/modelviewer/live/webthumbs/npc/${did % 256}/${did}.png`;
const tcUrl = (npc) => `https://threechest.io/npc_portraits/${npc}.png`;

async function head(url) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const r = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    return r.status;
  } catch { return 0; }
}

const { mobs } = JSON.parse(readFileSync(MOBS, 'utf8'));
const fetchMode = process.argv.includes('--fetch');

// unique creatures (one portrait per npc_id)
const byNpc = new Map();
for (const m of mobs) {
  if (!byNpc.has(m.npc_id)) byNpc.set(m.npc_id, { ...m, count_instances: 0 });
  byNpc.get(m.npc_id).count_instances++;
}

const rows = [];
for (const c of byNpc.values()) {
  const cdn = c.did ? await head(cdnUrl(c.did)) : 0;
  const zam = c.did ? await head(zamUrl(c.did)) : 0;
  const legacyCdn = c.legacyDid ? await head(cdnUrl(c.legacyDid)) : 0;
  const self = existsSync(join(SELF, `${c.npc_id}.png`));
  const tc = await head(tcUrl(c.npc_id));            // probe availability (download is opt-in, last resort)
  const resolved =
    cdn === 200 ? 'cdn-midnight'
    : self ? 'self-render'
    : zam === 200 ? 'zamimg'
    : legacyCdn === 200 ? 'cdn-legacy'
    : tc === 200 ? 'threechest-borrowed'
    : 'none';
  rows.push({
    npc_id: c.npc_id, name: c.name, type: c.type, boss: c.boss,
    instances: c.count_instances, did: c.did, legacyDid: c.legacyDid ?? null,
    cdn_midnight: cdn, zamimg: zam, cdn_legacy: legacyCdn, threechest: tc, self_render: self,
    resolved,
  });
}
rows.sort((a, b) => Number(b.boss) - Number(a.boss) || b.instances - a.instances);

writeFileSync(MANIFEST, JSON.stringify({
  _doc: 'Portrait source per npc. resolved = chosen tier; threechest-borrowed = LAST RESORT (gitignored, do not ship).',
  generated: new Date().toISOString().slice(0, 10),
  rows,
}, null, 2));

// ---- the marked missing-ID list ----------------------------------------------------
const official = rows.filter((r) => r.resolved === 'cdn-midnight');
const selfr = rows.filter((r) => r.resolved === 'self-render');
const zam = rows.filter((r) => r.resolved === 'zamimg');
const legacy = rows.filter((r) => r.resolved === 'cdn-legacy');
const borrowed = rows.filter((r) => r.resolved === 'threechest-borrowed');
const none = rows.filter((r) => r.resolved === 'none');
const pr = (r) => `    ${String(r.npc_id).padEnd(7)} ${String(r.did).padEnd(7)} ${String(r.instances).padStart(3)}x  ${r.boss ? '[boss] ' : ''}${r.name}`;

console.log(`\nPortrait manifest: ${rows.length} creatures (${mobs.length} instances) → ${MANIFEST}\n`);
console.log(`✅ OFFICIAL — Blizzard CDN, Midnight model (${official.length}):`); official.forEach((r) => console.log(pr(r)));
if (selfr.length) { console.log(`\n🖼 SELF-RENDER present (${selfr.length}):`); selfr.forEach((r) => console.log(pr(r))); }
console.log(`\n🌐 zamimg webthumb — exact Midnight model, covers the CDN gaps (${zam.length}):`); zam.forEach((r) => console.log(pr(r)));
console.log(`\n♻ OWN FALLBACK — legacy WotLK render, carried-over creature (${legacy.length}):`); legacy.forEach((r) => console.log(pr(r)));
console.log(`\n⚠ THREECHEST last-resort borrow (only if all above fail) (${borrowed.length}):`); borrowed.forEach((r) => console.log(pr(r)));
console.log(`\n⛔ NO PORTRAIT ANYWHERE — letter blip only (${none.length}):`); none.forEach((r) => console.log(pr(r)));

// ---- --fetch: download ONLY the last-resort borrowed set ----------------------------
if (fetchMode) {
  if (!existsSync(BORROWED)) mkdirSync(BORROWED, { recursive: true });
  let n = 0;
  for (const r of borrowed) {
    const res = await fetch(tcUrl(r.npc_id));
    if (!res.ok) { console.log(`  ✗ ${r.npc_id} ${r.name}: HTTP ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(BORROWED, `${r.npc_id}.png`), buf);
    n++;
  }
  console.log(`\n[--fetch] downloaded ${n} BORROWED portraits → portraits-borrowed/ (gitignored, temporary).`);
}
