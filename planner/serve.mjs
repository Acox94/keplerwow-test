/* Dependency-free static server for the route-planner spike (serves THIS folder).
 * Mirrors web/serve.mjs's node:http approach. `node web/planner-spike/serve.mjs` */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 5174);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);

    // JSON directory listing — lets the portrait framer auto-load a folder of renders.
    // e.g. GET /api/list/fullbody  ->  ["137211.png","137230.png", ...]  (match raw url; normalize() is \-separated on Windows)
    if (url.startsWith('/api/list/')) {
      const sub = normalize(url.slice('/api/list/'.length)).replace(/^([/\\])+/, '').replace(/[/\\]+$/, '');
      const dirPath = join(here, sub);
      if (!dirPath.startsWith(here)) { res.writeHead(403).end('forbidden'); return; }
      const names = (await readdir(dirPath)).filter((n) => n.toLowerCase().endsWith('.png')).sort();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(names));
      return;
    }

    const rel = url === '/' ? 'index.html' : normalize(url).replace(/^([/\\])+/, '');
    const file = join(here, rel);
    if (!file.startsWith(here)) { res.writeHead(403).end('forbidden'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => console.log(`[planner-spike] http://localhost:${PORT}`));
