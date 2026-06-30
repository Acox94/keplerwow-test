#!/usr/bin/env python
"""Crop a single source icon to its content and centre it on a square transparent
canvas, matching the dispel-icon set (content scaled to ~85% of the canvas, centred,
~5px margins). Use this to bring a NEW answer icon (interrupt / cc / freedom /
displace) into the same format as magic/poison/curse/... so it renders at a
consistent visual size in the v2 card header.

    python fit-icon.py <src.png> <dest.png> [size=72] [fill=0.85]

The renderer scales the result with object-fit:contain at 17px, so `size` is just
the internal resolution; what keeps icons consistent is the `fill` ratio (how much
of the square the art occupies). The set sits at ~0.85.
"""
import sys
from PIL import Image


def fit(src, dest, size=72, fill=0.85, wcap=0.92):
    im = Image.open(src).convert('RGBA')
    bbox = im.getbbox()  # tight box around the non-transparent art
    if not bbox:
        raise SystemExit(f'{src}: image is fully transparent')
    icon = im.crop(bbox)
    cw, ch = icon.size
    # fit the art to `fill` of the canvas HEIGHT (the set's consistent axis), but clamp
    # the WIDTH to `wcap` so a wide icon can't overflow the square.
    scale = (fill * size) / ch
    if cw * scale > wcap * size:
        scale = (wcap * size) / cw
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    icon = icon.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(icon, ((size - nw) // 2, (size - nh) // 2), icon)
    canvas.save(dest)
    print(f'{src} -> {dest}  content {cw}x{ch} -> {nw}x{nh} centred on {size}x{size}')


if __name__ == '__main__':
    a = sys.argv
    if len(a) < 3:
        raise SystemExit(__doc__)
    fit(a[1], a[2], int(a[3]) if len(a) > 3 else 72, float(a[4]) if len(a) > 4 else 0.85)
