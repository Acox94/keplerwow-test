// MDT-vs-dist roster/duality gap audit — generalize the pattern that surfaced Pit of Saron's gaps.
//
// MDT (the addon) ships a COMPLETE, curated enemy roster per dungeon. Our roster comes from a Wowhead
// scrape, which misses mobs (location-untagged) and, for REWORKED dungeons, curated kits sometimes sit
// on a legacy/fallback npc_id while the live (Midnight) id MDT/logs use carries none. This script diffs
// each MDT dungeon's enemies against our built dist and reports two gap classes:
//
//   MISSING  — an MDT enemy id absent from our dist (a roster gap, e.g. Rotting Ghoul 252558).
//   DUALITY  — an MDT enemy whose dist entry has 0 spells (or is missing) while a SAME-NAME dist
//              creature under a DIFFERENT id carries the curated kit (the kit is on the wrong id,
//              e.g. Ick — MDT 252625 / kit on WotLK 36476). These are the high-value fixes: the kit
//              already exists, it just needs to move to the live id.
//
// (KNOWN-UNCURATED — id in dist but 0 spells AND no same-name kit anywhere — is reported as a count
//  only: that's genuine "needs in-game curation", not a pipeline gap.)
//
// Read-only. Downloads each MDT Lua to cache/mdt/ (gitignored) if absent. Writes cache/mdt/mdt-gaps.json.
//
// Usage:  node web/planner-spike/mdt-gap-audit.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MDT_DIR = join(ROOT, 'cache', 'mdt');
const MDT_RAW = 'https://raw.githubusercontent.com/Nnoggie/MythicDungeonTools/master/Midnight';

// our slug -> { MDT lua basename, season dir, expansion (returning if != Midnight) }
const DUNGEONS = [
  ['pit-of-saron',            'PitOfSaron',           'midnight-s1', 'WotLK'],
  ['skyreach',                'Skyreach',             'midnight-s1', 'WoD'],
  ['seat-of-the-triumvirate', 'SeatoftheTriumvirate', 'midnight-s1', 'Legion'],
  ['algethar-academy',        'AlgetharAcademy',      'midnight-s1', 'Dragonflight'],
  ['magisters-terrace',       'MagistersTerrace',     'midnight-s1', 'Midnight(TBC rework)'],
  ['maisara-caverns',         'MaisaraCaverns',       'midnight-s1', 'Midnight(new)'],
  ['nexus-point-xenas',       'NexusPointXenas',      'midnight-s1', 'Midnight(new)'],
  ['windrunner-spire',        'WindrunnerSpire',      'midnight-s1', 'Midnight(new)'],
  ['murder-row',              'MurderRow',            'midnight-s2', 'Midnight(new)'],
];

// ---- parse MDT.dungeonEnemies[...] enemies (id, name, isBoss, creatureType, #clones) -------------
function parseEnemies(lua) {
  const lines = lua.split(/\r?\n/);
  let inEnemies = false, cur = null, inClones = false;
  const enemies = [];
  for (const line of lines) {
    if (!inEnemies) { if (/MDT\.dungeonEnemies\[dungeonIndex\]\s*=\s*\{/.test(line)) inEnemies = true; continue; }
    const eMatch = line.match(/^\s{2}\[(\d+)\]\s*=\s*\{/);
    if (eMatch && !inClones) { cur = { idx: +eMatch[1], clones: 0 }; enemies.push(cur); continue; }
    if (!cur) { if (/^\};?\s*$/.test(line)) break; continue; }
    if (/\["clones"\]\s*=\s*\{/.test(line)) { inClones = true; continue; }
    if (inClones) {
      if (/^\s{6}\[(\d+)\]\s*=\s*\{/.test(line)) cur.clones++;
      else if (/^\s{4}\},?\s*$/.test(line)) inClones = false;
      continue;
    }
    let m;
    if ((m = line.match(/\["name"\]\s*=\s*"([^"]*)"/))) cur.name = m[1];
    else if ((m = line.match(/\["id"\]\s*=\s*(\d+)/))) cur.id = +m[1];
    else if ((m = line.match(/\["creatureType"\]\s*=\s*"([^"]*)"/))) cur.creatureType = m[1];
    else if (/\["isBoss"\]\s*=\s*true/.test(line)) cur.isBoss = true;
  }
  return enemies.filter((e) => e.id);
}

// likely RP / non-combat mob names — MDT only models combat enemies, so these never appear there and
// need MANUAL placement in the planner. A hint flag, not authoritative (the human confirms).
const RP_RE = /captive|prisoner|slave|civilian|rescued|freed|villager|adventurer|survivor|hostage|caged|spirit|soul|champion|martin|gorkun|koreln|kalira|loralen|elandra|sylvanas|jaina|darion|thoras/i;

if (!existsSync(MDT_DIR)) mkdirSync(MDT_DIR, { recursive: true });
const out = [];

for (const [slug, mdtBase, season, expansion] of DUNGEONS) {
  const luaPath = join(MDT_DIR, `${mdtBase}.lua`);
  if (!existsSync(luaPath)) {
    try { execSync(`curl -sL "${MDT_RAW}/${mdtBase}.lua" -o "${luaPath}"`, { stdio: 'ignore' }); } catch {}
  }
  const distPath = join(ROOT, 'dist', season, `${slug}.json`);
  if (!existsSync(luaPath) || !existsSync(distPath)) {
    out.push({ slug, expansion, error: !existsSync(luaPath) ? 'no MDT lua' : 'no dist' });
    continue;
  }
  const enemies = parseEnemies(readFileSync(luaPath, 'utf8'));
  const dist = JSON.parse(readFileSync(distPath, 'utf8'));
  const byId = new Map(dist.creatures.map((c) => [c.npc_id, c]));
  const byName = new Map();
  for (const c of dist.creatures) {
    const k = (c.name || '').toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push({ id: c.npc_id, spells: c.spells ? c.spells.length : 0 });
  }
  const spellsOf = (c) => (c && c.spells ? c.spells.length : 0);

  const missing = [], duality = [];
  let knownUncurated = 0, ok = 0;
  for (const e of enemies) {
    const here = byId.get(e.id);
    const sameName = (byName.get((e.name || '').toLowerCase()) || []).filter((x) => x.id !== e.id);
    const kitElsewhere = sameName.find((x) => x.spells > 0);
    if (!here) {
      missing.push({ id: e.id, name: e.name, type: e.creatureType, boss: !!e.isBoss, clones: e.clones,
        kit_on: kitElsewhere ? kitElsewhere.id : null, kit_spells: kitElsewhere ? kitElsewhere.spells : 0 });
    } else if (spellsOf(here) === 0 && kitElsewhere) {
      duality.push({ name: e.name, mdt_id: e.id, kit_id: kitElsewhere.id, kit_spells: kitElsewhere.spells, boss: !!e.isBoss });
    } else if (spellsOf(here) === 0) {
      knownUncurated++;
    } else ok++;
  }
  // INVERSE diff: our roster mobs that DON'T appear in MDT at all (RP/non-combat, objects, legacy
  // ghosts, id-variants). These need MANUAL placement in the planner — MDT supplies no position.
  const mdtIds = new Set(enemies.map((e) => e.id));
  const notInMdt = dist.creatures.filter((c) => !mdtIds.has(c.npc_id)).map((c) => ({
    npc_id: c.npc_id, name: c.name, creature_type: c.creature_type ?? null,
    classification: c.classification ?? null, is_boss: !!c.is_boss,
    rp_candidate: RP_RE.test(c.name || ''),
  }));

  out.push({ slug, expansion, mdt_enemies: enemies.length, dist_creatures: dist.creatures.length,
    ok, known_uncurated: knownUncurated, missing, duality, not_in_mdt: notInMdt });
}

writeFileSync(join(MDT_DIR, 'mdt-gaps.json'), JSON.stringify(out, null, 2));

// committed reference: per-dungeon roster mobs absent from MDT (for manual/RP placement). Only
// dungeons MDT actually covers (mdt_enemies > 0) — a stub dungeon would list its whole roster.
const absent = out.filter((d) => !d.error && d.mdt_enemies > 0)
  .map((d) => ({ slug: d.slug, expansion: d.expansion, count: d.not_in_mdt.length,
    rp_candidates: d.not_in_mdt.filter((m) => m.rp_candidate).map((m) => `${m.npc_id} ${m.name}`),
    mobs: d.not_in_mdt }));
writeFileSync(join(ROOT, 'data', 'roster-not-in-mdt.json'), JSON.stringify({
  _doc: 'Roster mobs (built dist) that do NOT appear in MDT — need MANUAL placement in the planner (MDT gives no position). rp_candidate is a name heuristic for RP/non-combat mobs (prisoners, civilians, named NPCs). Generated by web/planner-spike/mdt-gap-audit.mjs.',
  generated: new Date().toISOString().slice(0, 10), dungeons: absent,
}, null, 2) + '\n');

// ---- report ------------------------------------------------------------------------
for (const d of out) {
  if (d.error) { console.log(`\n### ${d.slug}  — SKIPPED (${d.error})`); continue; }
  console.log(`\n### ${d.slug}  [${d.expansion}]  — MDT ${d.mdt_enemies} · dist ${d.dist_creatures} · ok ${d.ok} · known-uncurated ${d.known_uncurated}`);
  console.log(`  MISSING (roster gap): ${d.missing.length}`);
  for (const m of d.missing) console.log(`    ${String(m.id).padEnd(7)} ${m.boss ? '[boss] ' : ''}${(m.name || '').padEnd(26)} ${String(m.clones).padStart(2)}× ${m.type || ''}${m.kit_on ? `   ⟂ kit on ${m.kit_on} (${m.kit_spells}sp) → add+move` : ''}`);
  console.log(`  DUALITY (kit on wrong id): ${d.duality.length}`);
  for (const x of d.duality) console.log(`    ${x.name.padEnd(26)} MDT ${x.mdt_id}  ⟂ kit on ${x.kit_id} (${x.kit_spells}sp)${x.boss ? '  [boss]' : ''}`);
  const rp = d.not_in_mdt.filter((m) => m.rp_candidate);
  console.log(`  NOT IN MDT (manual placement; → data/roster-not-in-mdt.json): ${d.not_in_mdt.length}  · RP-name candidates: ${rp.length}`);
}
const tot = (k) => out.reduce((n, d) => n + (d[k] ? d[k].length : 0), 0);
console.log(`\n=== TOTAL across ${out.filter((d) => !d.error).length} dungeons: ${tot('missing')} missing, ${tot('duality')} duality ===`);
console.log(`(wrote cache/mdt/mdt-gaps.json)`);
