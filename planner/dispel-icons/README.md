# Dispel / answer icons for the v2 card header

The card loads `dispel-icons/<key>.png` next to the solution label. A missing file
falls back to the blank placeholder square, so naming is the only thing that matters.

## Filenames the renderer looks up (`<key>.png`)

**Dispel answers** key on the dispel TYPE:
- `magic.png` · `curse.png` · `poison.png` · `disease.png` · `bleed.png`
- `dispel.png` — generic fallback if a dispel has no specific type

**Other answers** key on the resolution:
- `interrupt.png` (Kick) · `cc.png` (Crowd Control) · `freedom.png` · `enrage.png` (Soothe) · `displace.png` (Knock / Grip)

## Adding a new answer icon (`fit-icon.py`)

A NEW icon (interrupt / cc / freedom / displace) comes as a single high-res PNG.
Run it through `fit-icon.py` to match the set's format — crop to the art, scale to
~85% of a square canvas, centre, transparent background:

    python fit-icon.py <source.png> interrupt.png

The set sits at content ≈ 85% of a 72×72 canvas (the renderer scales it with
`object-fit:contain` at 17px, so what keeps icons consistent is that fill ratio,
not the pixel size). Pass `[size] [fill]` to override.

## Status
- ✅ all answer icons in place: `magic` · `curse` · `poison` · `disease` · `bleed` · `enrage` (soothe) ·
  `interrupt` (kick) · `cc` · `freedom` · `displace` (knock/grip)
