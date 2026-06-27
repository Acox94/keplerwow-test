/* Bundle the pure engine + schema into a self-contained browser global for the spike.
 *   node web/planner-spike/build-engine.mjs   ->  web/planner-spike/engine.bundle.js
 * Reads ../../src and node_modules READ-ONLY; writes only engine.bundle.js. */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(here, 'engine-entry.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'KeplerEngine',     // -> window.KeplerEngine.{ analyzePull, DungeonExport }
  platform: 'browser',
  target: 'es2020',
  outfile: join(here, 'engine.bundle.js'),
  logLevel: 'info',
});
console.log('[planner-spike] engine.bundle.js built');
