# Dispel / answer icons for the v2 card header

The card loads `dispel-icons/<key>.png` next to the solution label. A missing file
falls back to the blank placeholder square, so naming is the only thing that matters.

## Filenames the renderer looks up (`<key>.png`)

**Dispel answers** key on the dispel TYPE:
- `magic.png` · `curse.png` · `poison.png` · `disease.png` · `bleed.png`
- `dispel.png` — generic fallback if a dispel has no specific type

**Other answers** key on the resolution:
- `interrupt.png` (Kick) · `cc.png` (Crowd Control) · `freedom.png` · `enrage.png` (Soothe) · `displace.png` (Knock / Grip)

## What's here now (rename these)
The 12 cropped source icons are dropped in as `dispel-01.png`..`dispel-12.png`
(best-guess of what each depicts — rename to the keys above):

01 red blood drop · 02 red demon skull · 03 green cross · 04 blue swirl
05 purple swirl · 06 orange skull · 07 orange warning triangle · 08 green leaf-drop
09 sword · 10 red angry mask · 11 silver ring · 12 gold shield
