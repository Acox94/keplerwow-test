/* =============================================================================
 * web/planner-spike/deploy.mjs — publish the route-planner spike to a /planner
 * SUBPATH of the GitHub Pages repo, leaving the advisor UI (web/deploy.mjs's
 * root deploy) untouched.
 *
 * The spike is fully static (all asset/data paths are relative `./…`). The only
 * non-static piece is serve.mjs's `/api/list/<dir>` endpoint, used solely by the
 * portrait framer's "Load full-body / Load portraits" buttons — those won't work
 * on Pages, but the MAP + advisor (the test target) are 100% static. Drag-drop
 * framing still works.
 *
 * SHIPS the spike folder EXCEPT: portraits-borrowed/ (ThreeChest renders — must
 * NOT ship). fullbody/ IS shipped now — the creature detail card (ctrl/⌘+click a
 * marker) uses the full-body render as its hero image. No .env/secrets/logs live
 * under web/planner-spike, so nothing sensitive ships.
 *
 * Usage:  node web/planner-spike/deploy.mjs
 *           → https://acox94.github.io/keplerwow-test/planner/?d=altar-of-fangs
 *         PAGES_REPO=<git-url> node web/planner-spike/deploy.mjs   (override repo)
 * ===========================================================================*/
import { execSync } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.PAGES_REPO ?? 'https://github.com/Acox94/keplerwow-test.git';
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const q = (s) => JSON.stringify(s);

// skip borrowed/dev-only paths anywhere in the tree (fullbody/ now SHIPS — it's the detail-card hero)
const EXCLUDE = /[\\/](portraits-borrowed|node_modules|\.git)([\\/]|$)/;

console.log(`[planner-deploy] target: ${REPO}  (subpath: /planner)`);
const work = mkdtempSync(join(tmpdir(), 'kepler-planner-'));
try {
  run(`git clone ${q(REPO)} ${q(work)}`);

  // replace ONLY the /planner subfolder (preserve the advisor at root)
  const dest = join(work, 'planner');
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(here, dest, { recursive: true, filter: (src) => !EXCLUDE.test(src) });
  console.log(`[planner-deploy] staged ${readdirSync(dest).length} top-level entries → /planner`);

  run('git add -A', { cwd: work });
  try {
    run('git commit -m "Deploy planner spike (web/planner-spike -> /planner)"', { cwd: work });
  } catch {
    console.log('[planner-deploy] nothing changed — already up to date.');
    process.exit(0);
  }
  run('git branch -M main', { cwd: work });
  run('git push -u origin main', { cwd: work });
  console.log('[planner-deploy] published → https://acox94.github.io/keplerwow-test/planner/?d=altar-of-fangs  (first load ~1 min)');
} finally {
  rmSync(work, { recursive: true, force: true });
}
