# Self-rendered creature portraits

The spike's `loadPortrait` tries `./portraits/<displayId>.png` **first**, before the Blizzard render
CDN and zamimg webthumb. New Midnight models 403/404 on those public sources, so we self-render them
from the client via wow.export and drop the PNGs here (keyed by **displayId**, like the CDN URLs).

Drop a `<displayId>.png` (square-ish head-and-shoulders crop reads best in the round marker) and the
spike picks it up on reload. Missing files just fall through to CDN → zamimg → creature-type blip.

## Framing — use the round-icon framer (not a crop script)

Render **loose** in wow.export (front view, slight high angle, No Animation, Texture Alpha on, transparent
bg, head-and-shoulders with margin), then frame precisely in **`portrait-framer.html`**
(`http://localhost:5174/portrait-framer.html`): **drag-drop the PNGs, or one-click `Load full-body`** (pulls
every render from `../fullbody/`) / **`Load portraits`** (reloads finished `../portraits/` to re-edit) — both
via the server's `/api/list/<dir>` endpoint. Then **pan = drag, zoom = wheel**, line each creature's eyes up on
the guide line and head in the inner ring at the same size for a consistent set, and **Export** a square PNG
(**`Export all`** is staggered so the browser doesn't drop past ~10). The dark overlay + guides are preview-only —
only the model exports (alpha kept). Save the full-body source in `../fullbody/<displayId>.png` and the framed
headshot as `<displayId>.png` here. Works for **re-framing existing/CDN icons too** (e.g. off-looking Pit of
Saron ones): download the CDN render, re-frame, save the local `<displayId>.png` — the loader prefers it.

## Where the displayIds come from

The **`display_id`** lives per creature in **`data/membership/<slug>.json`** (the source of truth),
datamined from Wowhead PTR by `src/tools/datamine-npcs.ts` (`g_npcs[id]` + the model-viewer displayId).
From there it flows through the build into `dist/<slug>.json` (`creatures[].display_id`) and into the
spike's `<slug>.mobs.json` (each mob's `did`). To re-list them: `jq '.creatures[] | {name, display_id}'
dist/altar-of-fangs.json`.

## Altar of Fangs — render checklist (✅ DONE 2026-06-27 — 14 committed + live on the map)

**Already covered by a public CDN — no render needed:** Venom Leech `125502`, Bloodletter `104480`,
Living Venom `58535` (all old reused models).

**No displayId at all → always a name blip:** Blade of the Altar (271453, no Wowhead page), the
scrape-id Zul'jan (267797). The real Zul'jan (combat id 259447) is `145435` below.

**Self-rendered (14 committed; full-body sources in `../fullbody/`):**

- [x] `137211.png` — Ritual Chieftain
- [x] `137230.png` — Primal Serpent
- [x] `137231.png` — Rattling Writhe
- [x] `142320.png` — High Evolutionist *(green skin via `base (137210)` — texture-collapsed model; build-drift verified)*
- [x] `142327.png` — Ula'tek's Chosen *(via `base (137216)`)*
- [x] `142340.png` — Ravenous Descendant
- [x] `142361.png` — Uncoiled Writhe (covers npc 262398 + 270417)
- [x] `142375.png` — Hatchling
- [x] `142386.png` — Twinfang Harrower
- [x] `144110.png` — Rav'i (boss)
- [x] `144156.png` — The Writhing Coil (boss)
- [x] `144271.png` — Infused Eggs
- [x] `145435.png` — Zul'jan (boss)
- [x] `146299.png` — Ascendant Serpent
- [ ] `146372.png` — Ritual Spirit — **optional** (summoned add, not map-placed; exact copy of `137211` — duplicate if wanted)

## Rendering in wow.export

The Creatures browser is the easy path WHEN it lists the creature — but for brand-new Midnight creatures
it often doesn't (wow.export's creature name/list data lags the build; this is wow.export-side, NOT your
local DB2 and NOT our datamine — both are current). The browser's bracket `[id]` is also the **npc_id**,
not the displayId, so searching our displayIds there finds nothing.

**Robust method — load the model file directly in the Models tab.** A displayId fixes THREE axes (the
displayIds ARE valid — verified against this build):

```
displayId → CreatureDisplayInfo.ModelID → CreatureModelData.FileDataID   (the .m2 to load)
displayId → CreatureDisplayInfo.TextureVariationFileDataID_*             (the skin, for shared models)
displayId → CreatureDisplayInfoGeosetData (CreatureDisplayInfoID)        (which SUBMESHES show)
```

**Don't eyeball the geosets — wow.export applies them for you via the Skins list.** When you load the M2 by
FileDataID, the **Skins** panel lists every CreatureDisplayInfo on that model, labeled by **displayId**
(`base (137211)`, `base (142340)`, …). **Click the displayId you want and wow.export applies that creature's
texture AND its geosets together** — that's the whole job. The geoset config is a combination of named groups
(`Geoset0/1/2`, `FacialA1/A2`…), NOT a single "submesh 103" checkbox, so there's nothing to tick by hand;
selecting the skin moves the right boxes. (Verify on shared M2 `7133443`: click `base (137211)` then
`base (142340)` and watch the FacialA boxes change — they diverge on every geoset group.)

**The base skin id is ALWAYS the displayId** (`base (<displayId>)`). The catch: a reused model lists *dozens*
of `base (…)` entries (the Altar troll model `7133443` has 35; the serpent `7224879` has 72), so **pick by the
exact id, not by position** — and ignore the foreign siblings from other dungeons. `--skins` reports the list
size so you know when the picker will be crowded.

**The recipe tool is the cross-check / inventory** — which displayIds share an M2, and what each one resolves
to (handy when a render looks off, or to confirm the Skins pick matched the DB2 data):
```bash
npm run render-recipe -- --slug altar-of-fangs     # every creature, build auto-pinned from the season
npm run render-recipe -- --slug altar-of-fangs --skins   # also print the base-skin pick + how many skins share the model
npm run render-recipe -- 137211 142340             # ad-hoc displayId(s);  --json for machine output
```
It pulls filtered wago.tools CSV (`src/tools/render-recipe.ts`): `CreatureDisplayInfo` (ModelID + textures),
`CreatureModelData` (FileDataID), and `CreatureDisplayInfoGeosetData` — the `(GeosetIndex, GeosetValue)` pairs,
M2 submesh `(idx+1)*100+val`. Those numbers are a **verification key**, not panel labels (wow.export shows
named geoset groups, not raw ids); a displayId with NO rows just uses the model default.

Then in the **Models** tab: load the M2 by FileDataID → in **Skins**, click `base (<displayId>)` → render a
head-and-shoulders framing → export as `<displayId>.png` here. ⚠ = creatures sharing one M2 — the Skins pick
is what disambiguates them (same model, different texture and/or geosets). The loader checks this local file
first; PNGs are git-tracked.

### Altar of Fangs — resolved FileDataIDs (build-verified 2026-06-26; geosets + tool-regenerated 2026-06-27)

Regenerate any time with `npm run render-recipe -- --slug altar-of-fangs`. The **geosets** column is the DB2
recipe the `base (<displayId>)` Skins pick applies for you (`(idx+1)*100+val`) — a verification key, not a
manual tick-list, since wow.export shows named geoset groups rather than raw submesh ids. "default" = no rows.

| save as | M2 FileDataID | skin texture(s) | geosets | creature |
|---|---|---|---|---|
| `137211.png` | `7133443` ⚠ | 7521613, 7521623, 7521620 | 103, 202, 303 | Ritual Chieftain |
| `137230.png` | `7109496` | 7667915 | default | Primal Serpent |
| `137231.png` | `7133447` ⚠ | 7537080 | default | Rattling Writhe |
| `142320.png` | `7224879` ⚠ | 7322083, 7322087, 7322094 | 102, 201, 301 | High Evolutionist |
| `142327.png` | `7224879` ⚠ | 7322090, 7322084, 7322091 | 102, 203, 303 | Ula'tek's Chosen |
| `142340.png` | `7133443` ⚠ | 7521612, 7521619, 7521618 | 101, 201, 301 | Ravenous Descendant |
| `142361.png` | `1670968` ⚠ | 7454979 | default | Uncoiled Writhe (shares M2 with Bloodletter `104480`) |
| `142375.png` | `801469` | 7454973 | default | Hatchling |
| `142386.png` | `7133445` | 7569647, 7569644, 7569643 | default | Twinfang Harrower |
| `144110.png` | `7133449` | 7745446, 7745497, 7745506, 7745576 | default | Rav'i |
| `144156.png` | `7133447` ⚠ | 7537128 | default | The Writhing Coil |
| `144271.png` | `7277181` | (embedded) | default | Infused Eggs |
| `145435.png` | `6225159` | 6983472, 6983474 | default | Zul'jan |
| `146299.png` | `7545081` | 7670355, 7672353, 7670352, 7672356 | default | Ascendant Serpent |
| `146372.png` | (copy of 137211) | 7521613, 7521623, 7521620 | 103, 202, 303 | Ritual Spirit — identical to Ritual Chieftain; render once, copy |
