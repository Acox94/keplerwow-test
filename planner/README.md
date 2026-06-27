# Route Planner — Prototype (spike)

> A self-contained prototype of the KeplerWoW **map route planner**. It proves the map + markers +
> pull-building + annotation surface end-to-end against one dungeon (Pit of Saron), with every behavior
> verified in-browser. **Design + how this links to the rest of the project:**
> [../../planner.md](../../planner.md). **Asset sourcing:** [../../planner-map-assets.md](../../planner-map-assets.md).

This is a **spike** — deliberately dependency-light and hand-rolled, to validate the UX and the engine
contract cheaply before committing to a framework. See "Productionizing" below.

---

## Run it

```bash
node web/planner-spike/build-engine.mjs   # one-time: bundle the engine → engine.bundle.js (re-run if src/engine changes)
node web/planner-spike/serve.mjs          # → http://localhost:5174
```

(serving via the `planner-spike` entry in `.claude/launch.json` also works.) Leaflet is vendored and the
engine is bundled **read-only** from `src/` — **nothing in the main app or pipeline is modified.**

### Deploy it live (for testers)

```bash
npm run planner:deploy        # web/planner-spike/deploy.mjs
```

Publishes the spike to a **`/planner` subpath** of the GitHub Pages repo (leaving the advisor at root) →
**https://acox94.github.io/keplerwow-test/planner/?d=altar-of-fangs**. Fully static — excludes `fullbody/`
(big source renders) + `portraits-borrowed/` (must-not-ship). The framer's one-click **Load** buttons need the
local `/api/list` endpoint so they're inert on Pages; the **map + advisor are 100% static**. Re-deploy after
curation: build → `cp dist/<season>/<slug>.json web/planner-spike/` → `npm run planner:deploy`.

**Comp + route persist** to `localStorage` (comp global; route per dungeon + floor, keyed on the stable mob
`iid`s) — a reload keeps each tester's work. **Clear all** resets the route; re-picking comp slots overwrites it.

### Manual placement editor — `?edit=1`

For dungeons where the combat-log capture can't be cleanly de-duplicated (a cumulative log's re-pull drift
overlaps real pack spacing — see `BUILD.md`), place packs **by hand** on the painted UiMap art:

```
http://localhost:5174/?d=<slug>&edit=1        (add &f=<n> for a floor)
```

- A **palette** (roster from the dungeon's `dist` json) appears top-left. **Click a creature to arm it, click
  the map to drop one.** **Click a placed mob to select it** (it is NOT draggable — so a shaky click can't nudge
  it); move it only via arrow-keys / the coordinate fields. **Right-click** to delete. Counts update live.
- On first open the editor **auto-loads the captured `mobs.json`** for the floor (so you can clean it up); **Clear
  floor** gives a blank canvas (stays blank), **↧ Import capture** re-adds it.
- A **live coordinate readout** (in the **Developer tab**, auto-shown in edit mode) gives the cursor's `x y` (PNG
  pixels) + `u v` (0..1). **Click a marker to select it** (it turns cyan internally — no outer ring obscuring
  where it sits) — the readout pins to it with **editable `x`/`y` (pixels) and `u`/`v` (0..1 fraction) fields**
  (type a value + **Enter** to jump there). All four drive the same point — use pixels to place, or `u`/`v` to match
  an exact fraction (e.g. to align two mobs perfectly). **Arrow keys nudge it 1px** (**Shift = 10px**); **Esc**
  deselects, **Del** removes.
- Positions are stored as **image fractions (0..1 of the floor PNG)** per floor in `localStorage` (autosaved), so
  reloading or switching floors keeps your work.
- **⬇ Export** downloads `<slug>.mobs.json` with `_placement:"manual"`. Commit it over the captured file — the
  normal view detects that flag and renders with an **identity fit** (no centroid/`fit` transform), so what you
  placed is exactly what shows. **Clear floor** wipes the current floor.

### Flag editor — `?flagedit=1`

A visual curation back-up for when the engine derivation hasn't caught a mechanic yet: hand-flag the cast and
watch the advice correct itself instantly, instead of editing JSON. **ctrl/⌘-click a mob** to open its inspector,
then edit per-ability flags under the description.

```
http://localhost:5174/?d=<slug>&flagedit=1
```

- **All editorial fields**, grouped Answer / Avoidance / Danger / Advanced — checkboxes, dropdowns
  (`priority` / `dispel_type` / `mechanic`), chip multi-selects (`positioning` — frontal/spread/stack/LoS/soak —
  and `displacement`), and JSON fields for the structured ones (`vulnerability`, `high_risk`).
- **Live preview**: flipping a flag re-runs the engine in-browser and re-renders the cast's card right there.
- **💾 Save** writes to the right file automatically — fields marked **✳** (`dispel_type`, `mechanic`,
  `is_stoppable`/`is_interruptible`/`is_channeled`) → `data/spell_editorials.json`; everything else → the
  dungeon's `data/creature_spells/<slug>.candidates.json`. **⟳ Rebuild** runs promote → build → copy → reload to
  bake the flags into the export.
- **Local only** — the `POST /api/flags` + `/api/rebuild` endpoints live in `serve.mjs`; the deployed Pages site
  is static and has neither (the buttons are inert there).

## What's in the folder

| File | What |
|---|---|
| `index.html` | the whole app — plain JS + Leaflet (`L.CRS.Simple`), one file |
| `serve.mjs` | dependency-free `node:http` static host (port 5174, `PORT` env to override); also serves `GET /api/list/<dir>` → a folder's PNG names, for the framer's one-click load |
| `portrait-framer.html` | round-icon framer — **Load full-body** / **Load portraits** pull a whole folder in one click, pan/zoom in the round mask with eye-line guides, **Export all** (staggered, so Chrome doesn't drop >10) → `portraits/<displayId>.png` |
| `portraits/` · `fullbody/` | committed round headshots (loaded by displayId) + their full-body wow.export source renders. Self-render method + the build-verified recipe table in [`portraits/README.md`](portraits/README.md) (`npm run render-recipe`) |
| `vendor/leaflet.{js,css}` | pinned **Leaflet 1.9.4**, vendored so the spike runs offline |
| `pit-of-saron-mdt.png` | the **map base** — MDT's painted art stitched from its 150 tiles (1920×1280) |
| `pit-of-saron.json` | a real dungeon export (copied from `dist`/`web/public/data`) — the engine's input |
| `pit-of-saron.mobs.json` | **real mob positions + enemy forces**, MDT-derived (the spike loads this) |
| `extract-mdt.mjs` | regenerates `pit-of-saron.mobs.json` from MDT's open-source Lua (see "Real positions" below) |
| `stitch-mdt.mjs` | regenerates `pit-of-saron-mdt.png` by stitching MDT's map tiles (see "Real positions" below) |
| `engine-entry.ts` · `build-engine.mjs` | esbuild glue: bundle `src/engine` + `src/schema` **read-only** into a browser global |
| `engine.bundle.js` | the bundled **pure engine** (`KeplerEngine.analyzePull` + `DungeonExport`) — build artifact |

## Features (all verified in-browser)

| Feature | Behavior | Status |
|---|---|---|
| **Map** | painted in-game/UiMap art via `L.CRS.Simple`; pan + pinch-zoom | ✅ |
| **Mob positions** | **real**, MDT-derived (230 instances) — clones mapped onto the art with a single uniform scale + y-flip, no per-landmark fitting | ✅ |
| **Mob markers** | creature **portraits** — self-rendered local PNG (`portraits/<displayId>.png`) preferred, then Blizzard render CDN → zamimg → creature-type-letter fallback. **Scale gently with zoom** (`applyMarkerScale`: grow zooming IN to show off the art, anchored to the fit zoom so the default view is unchanged, clamped so they never overlap) | ✅ |
| **Enemy forces** | **real** running `Σ count / 643` (%) from MDT's `count` + `dungeonTotalCount` | ✅ |
| **Pull building** | tap a mob → adds to the current pull; tap again → removes; "+ New pull" | ✅ |
| **Bosses** | clickable like trash (a boss is a route step); red ring when unassigned, pull-color when in a pull | ✅ |
| **Pull list** | Pull 1 → 2 → 3 … with per-pull mob rollup + a running cumulative total | ✅ |
| **Creature detail card** | **ctrl/⌘-click a marker** → a read-only modal: full-height fullbody hero + name + badges (`Boss/Elite · creature_type · Mythic-+0 HP`) + a deduped ability list + a description box (verbatim, from `spell-descriptions.json`). Reads `dungeon.creatures` by npc_id; plain click still toggles the pull. **`?frame=1`** = a hero-framing dev tool (drag-pan / wheel-zoom / save / export → `hero-framing.json`) | ✅ |
| **Engine payload** | live `Pull[] → {npc_id, count}[]` — the exact `analyzePull` input (on the **Developer** tab, with the dungeon's **Data source** provenance) | ✅ |
| **Comp + live analysis** | a 5-slot comp picker supplies the engine's `group`; the **real `analyzePull`** runs into a **persistent "Live Analysis" pane** (bottom half of the side panel) → ranked warnings + stop budget | ✅ |
| **Tab-split analysis** | the pane filters on the active tab — **Comp** = composition warnings (lust / battle rez / raid buffs); **Route** = boss/trash mechanics + the stop budget | ✅ |
| **Comp gaps with no pull** | the Comp tab runs the engine with an *empty* pull, so "No lust / No battle rez" surface the moment you pick specs and clear as you add a luster/rez — before any mob is selected | ✅ |
| **Pull outlines** | selecting a pull's mobs draws a padded, Chaikin-smoothed convex-hull boundary in the pull color | ✅ |
| **Live Route** | a pull-by-pull stepper (▶ Live route → floating `◀ Pull N/Y ▶ ✕` bar + ←/→/Esc); current pull lit, earlier faded, later hidden; the analysis pane follows each step | ✅ |
| **Warning cards** | severity is a slim full-width bar across the card top (full-width message below); each card framed in a darker shade of its own severity color | ✅ |
| **Arrows** | transformable: drag endpoints to rotate/scale, drag midpoint to move; **handles hidden until the arrow is clicked** | ✅ |
| **Notes** | collapse to a pin; **hover (desktop) / tap (mobile)** reveals text; double-click edits in place; render **above** mob markers; **click-outside closes**; **shift-click removes** (undoable) | ✅ |
| **Freehand paint** | toggle, drag to draw; **drops the brush** when you click another tool or any element; no page-selection highlight | ✅ |
| **Undo / redo** | command history over add / paint / **note removal** / clear; ↶ ↷ buttons + `Ctrl+Z` / `Ctrl+Shift+Z` (`Ctrl+Y`) | ✅ |
| **Theme (arcane)** | the refined arcane direction from `C:\dev\Alpha\kepler-arcane.html` — `--kw-*`/refined palette hoisted to `:root`, legacy vars remapped onto it (cascades, no markup touched), Rajdhani + Inter fonts. Chrome ported to the mock: brand header, styled select, floor pills, segmented tabs, stats + Enemy-forces meter, gradient pull cards, teal buttons, themed Leaflet zoom control | ✅ |

## Interaction reference

- **Pulls:** tap mobs (incl. bosses) to fill the current pull; "+ New pull" starts the next; "Clear all" resets pulls.
- **Creature card:** **ctrl/⌘-click a marker** opens its read-only detail (hero / health / abilities / verbatim descriptions); Esc / click-outside / ✕ closes. Plain click still adds to the pull.
- **Arrow:** adds selected (handles up); click empty map to deselect (clean line); click the arrow to re-select.
- **Note:** adds a pin; hover or tap to read; double-click to edit (inline, Enter to commit); drag the pin to move; click off it to collapse; **shift-click to remove** (undoable).
- **Paint:** toggles freehand; clicking any tool/element releases it.
- **History:** ↶ / ↷ or keyboard.
- **Tabs:** the side panel carries **Comp**, **Route**, and **Developer** tabs above a persistent bottom-half "Live Analysis" pane.
- **Comp + analysis:** fill the 5 spec slots → composition warnings (lust / rez / buffs) appear immediately on the **Comp** tab (no pull needed); the **Route** tab shows the active pull's boss/trash mechanics + stop budget. Both re-run the real engine live.
- **Live route:** ▶ Live route steps through the pulls (`◀ / ▶`, arrow keys, `Esc` to exit) — the map lights the current pull and the analysis pane follows it.

## Real positions (MDT-derived)

`pit-of-saron.mobs.json` is generated by `extract-mdt.mjs` from MDT's open-source Lua
(`Nnoggie/MythicDungeonTools` → `Midnight/PitOfSaron.lua`, dungeonIndex 150 — MDT already tracks the
Midnight PTR). Each enemy carries `id` (the **Midnight npc_id**, which joins our engine's curated
creatures), `clones[].{x,y}`, `displayId`, `creatureType`, and `count` (enemy-forces value).

**The base map is MDT's OWN texture, and that's what makes the transform trivial.** MDT authors clones
in its canvas space (`MythicDungeonTools.lua`: `sizex 840`; the native texture is a 15×10 grid of 128px
tiles = 1920×1280, the 840-wide canvas ×2.2857), anchored at the map's TOP-LEFT. By basing the spike on
MDT's stitched texture — the exact art the clones were authored against — alignment needs only a uniform
scale + a y-flip, **no per-landmark fitting**:

```
px = x * (1920/840)    py = -y * (1280/560)        # both factors = 2.285714
```

> ⚠ A first pass used our **wow.export UiMap raster** (1002×668) as the base and the mobs came out
> offset — that raster is a **different crop** of the UiMap than MDT's texture, so MDT's coords don't
> land on it without solving an affine. Using MDT's own art sidesteps that entirely.

Regenerate (after re-fetching the gitignored MDT source — see each script's header):

```bash
node web/planner-spike/stitch-mdt.mjs             # rebuild pit-of-saron-mdt.png from MDT's 150 tiles
node web/planner-spike/extract-mdt.mjs            # inspect: enemies + dist-join report
node web/planner-spike/extract-mdt.mjs --write    # rewrite pit-of-saron.mobs.json
```

The inspect report flags **MDT enemies absent from our roster** — exactly the Wowhead-scrape weakness
the [S2 log-first plan](../../s2-ingestion-plan.md) targets. Pit of Saron had 5 (Quarry Tormentor,
Rotting Ghoul, Plungetalon Gargoyle, Iceborn Proto-Drake, and Ick `252625` — whose curated kit our data
still has on the WotLK id `36476`); they were **added to the roster (2026-06-26)** so they no longer read
"— not in dataset" (spells still need in-game curation). **Why roster-audit hadn't caught them:** 4 it
*does* surface (they cast in our logs) but its read-only output was never `--apply`'d + merged here;
**Rotting Ghoul is a true blind spot** — it's in `observed-danger`/`-debuffs`/`-cast-spread` but NOT
`observed-targeting`, and roster-audit seeds its candidate set only from `observed-targeting` (damage
streams are enrichment-only). MDT, a complete third-party roster, caught all 5 — corroborating the plan.

## Portrait curation (the method)

A repeatable, per-dungeon process to give every mob a real portrait — with agents doing the
parallelizable legwork and a human gating the result ("agents gather, human gates"):

1. **`resolve-portraits.mjs` (deterministic)** probes each creature's sources in priority order and
   writes `portrait-manifest.json` + prints the missing-ID list bucketed by what resolved it.
2. **Agent verification pass** for anything not on the official CDN: read-only agents hunt for a
   non-borrowed render and visually QC each candidate against the creature (name/type). On Pit of Saron
   this is what surfaced the zamimg source below + confirmed every portrait matches.
3. **Human gate**, then the loader (`loadPortrait` in `index.html`) tries the sources live per marker.

**Source priority (most→least preferred):**

| tier | source | notes |
|---|---|---|
| 1 | Blizzard render CDN, Midnight `displayId` | official, head-&-shoulders "zoom" crop (best framing). 403s for unpublished new models |
| 2 | **Wowhead `zamimg` webthumb**, Midnight `displayId` | `…/modelviewer/live/webthumbs/npc/{displayId%256}/{displayId}.png` — 300×300 with alpha, keyed by **displayId**. Has the exact Midnight model the CDN lacks; full-BODY, so markers add `.mk-fullbody` (a head-crop). The standard fan-tool model CDN |
| 3 | Blizzard CDN, legacy WotLK `displayId` | own carried-over fallback (`LEGACY_DISPLAY` in `extract-mdt.mjs`) |
| 4 | self-render PNG `portraits/<displayId>.png` | wow.export, committable, exact model. **REALIZED for Altar of Fangs (14 portraits, 2026-06-27)** — `loadPortrait` prefers it over every CDN; full method + the `render-recipe` recipe table in [`portraits/README.md`](portraits/README.md). The path to full independence from third-party CDNs |
| 5 | ThreeChest `npc_portraits/<npcId>.png` | **LAST RESORT, borrowed** — `resolve-portraits.mjs --fetch` downloads into the gitignored `portraits-borrowed/`. Superseded by tier 2; kept documented only |
| — | creature-type letter blip | floor, if nothing renders |

**Pit of Saron result: 23/23 creatures get a real portrait** — 9 official (Blizzard CDN), 14 zamimg —
**0 letters, 0 borrowed.** Tiers 1–2 cover the whole pool, so the ThreeChest borrow is never triggered.
Production still wants tier 4 (self-render) for full independence from third-party CDNs.

## Placeholder / not real yet

- **Portraits depend on third-party CDNs** — every marker resolves today (see "Portrait curation"),
  but via Blizzard's render CDN + Wowhead's zamimg. Full independence needs tier-4 self-rendered PNGs.
  Framing is mixed: official renders are head-&-shoulders; zamimg ones are full-body with a CSS head-crop.
- **Single image overlay, not tiled** — fine at this size; production tiles the art for graceful zoom
  (ThreeChest does this — `/maps/<dungeon>/{x}_{y}.jpg`).
- **Single dungeon wired** — `pit-of-saron.{json,mobs.json}` are the only exports loaded; a dungeon
  picker + multi-dungeon loading are TODO. (The rollup → `analyzePull` loop itself is **done**.)
- **One dungeon** (Pit of Saron), painted art only.

## Productionizing (when the spike graduates)

The hand-rolled pieces here — shape selection, click-outside, undo/redo, the drawing editor — are
exactly what a framework + a real drawing library would provide structurally. The likely path
([../../planner.md](../../planner.md) §5–6): **React + Vite + Leaflet-Geoman**, tiled map art, the
route document as the source of truth, and the still-open **collaboration-mode** decision (which, if it
lands on **Yjs**, hands you undo/redo and offline for free). The pure engine (`src/engine`) stays
unchanged under any of it.
