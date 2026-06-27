/* Dependency-free static server for the route-planner spike (serves THIS folder).
 * Mirrors web/serve.mjs's node:http approach. `node web/planner-spike/serve.mjs`
 *
 * LOCAL-ONLY curation endpoints (the deployed Pages site is static and has none of this):
 *   POST /api/flags    — write a cast's editorial flags, routed to the right file (spell_editorials.json
 *                        for spell-level attrs; the dungeon's .candidates.json for cast editorial).
 *   POST /api/rebuild  — promote --merge → build → copy the dungeon export back into this folder.
 * Used by the flag editor (?flagedit=1 in index.html). */
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const PORT = Number(process.env.PORT ?? 5174);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
};

const readBody = (req) => new Promise((resolve, reject) => {
  let data = ''; req.on('data', (c) => { data += c; if (data.length > 2e6) req.destroy(); });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  req.on('error', reject);
});
const sendJson = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const run = (cmd) => new Promise((resolve, reject) => {
  const p = spawn(cmd, { cwd: repoRoot, shell: true });
  let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(`exit ${code}: ${out.slice(-400)}`)));
});

// SpellEditorial fields live spell-level (DB2 overrides); everything else is per creature_spell candidate.
const EDITORIAL_FIELDS = new Set(['is_stoppable', 'is_channeled', 'is_interruptible', 'dispel_type', 'mechanic']);

async function applyFlags(body) {
  const { slug, npc_id, spell_id, editorial = {}, candidate = {} } = body;
  if (!slug || !Number.isInteger(npc_id) || !Number.isInteger(spell_id)) throw new Error('flags: need slug + npc_id + spell_id');
  const wrote = [];
  // 1) spell-level overrides → data/spell_editorials.json (upsert by spell_id)
  if (Object.keys(editorial).length) {
    const p = join(repoRoot, 'data', 'spell_editorials.json');
    const j = JSON.parse(await readFile(p, 'utf8'));
    let e = j.entries.find((x) => x.spell_id === spell_id);
    if (!e) { e = { spell_id }; j.entries.push(e); }
    for (const [k, v] of Object.entries(editorial)) { if (EDITORIAL_FIELDS.has(k)) e[k] = v; }
    e.source = `flag-editor:${new Date().toISOString().slice(0, 10)}`;
    await writeFile(p, JSON.stringify(j, null, 2) + '\n');
    wrote.push('spell_editorials.json');
  }
  // 2) cast editorial → data/creature_spells/<slug>.candidates.json (patch the npc+spell row, or append)
  if (Object.keys(candidate).length) {
    const p = join(repoRoot, 'data', 'creature_spells', `${slug}.candidates.json`);
    const j = JSON.parse(await readFile(p, 'utf8'));
    let row = j.entries.find((x) => x.npc_id === npc_id && x.spell_id === spell_id);
    if (!row) { row = { npc_id, spell_id }; j.entries.push(row); }
    Object.assign(row, candidate);
    if (candidate.priority == null && row.priority == null) row.priority = 'priority'; // a flagged cast must be priority for the engine to act
    row.keep = true;
    await writeFile(p, JSON.stringify(j, null, 2) + '\n');
    wrote.push(`${slug}.candidates.json`);
  }
  return wrote;
}

async function rebuild(slug) {
  if (!slug) throw new Error('rebuild: need slug');
  await run(`npm run promote -- ${slug} --merge`);
  await run(`npm run build -- --dungeons ${slug} --out ./dist-tmp`);
  const built = await readFile(join(repoRoot, 'dist-tmp', `${slug}.json`), 'utf8');
  await writeFile(join(here, `${slug}.json`), built);
}

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);

    if (req.method === 'POST' && url === '/api/flags') { const w = await applyFlags(await readBody(req)); sendJson(res, 200, { ok: true, wrote: w }); return; }
    if (req.method === 'POST' && url === '/api/rebuild') { const b = await readBody(req); await rebuild(b.slug); sendJson(res, 200, { ok: true }); return; }

    // JSON directory listing — lets the portrait framer auto-load a folder of renders.
    if (url.startsWith('/api/list/')) {
      const sub = normalize(url.slice('/api/list/'.length)).replace(/^([/\\])+/, '').replace(/[/\\]+$/, '');
      const dirPath = join(here, sub);
      if (!dirPath.startsWith(here)) { res.writeHead(403).end('forbidden'); return; }
      const names = (await readdir(dirPath)).filter((n) => n.toLowerCase().endsWith('.png')).sort();
      sendJson(res, 200, names);
      return;
    }

    const rel = url === '/' ? 'index.html' : normalize(url).replace(/^([/\\])+/, '');
    const file = join(here, rel);
    if (!file.startsWith(here)) { res.writeHead(403).end('forbidden'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    if (req.method === 'POST') { sendJson(res, 500, { ok: false, error: String(e && e.message || e) }); return; }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => console.log(`[planner-spike] http://localhost:${PORT}`));
