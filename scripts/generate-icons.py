#!/usr/bin/env python3
"""Regenerate full-bleed PWA icons from the existing Tohab glyph.

Requires Pillow. The platform applies its own circle/squircle mask; no device
corner or highlight is baked into these source assets.
"""
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "app/static/icons"
SOURCE = ICONS / "icon-512-maskable.png"
SIZE = 512

source = Image.open(SOURCE).convert("RGBA")
mask = Image.new("L", (SIZE, SIZE), 0)
source_pixels = source.load()
mask_pixels = mask.load()
for y in range(SIZE):
    for x in range(SIZE):
        red, green, blue, alpha = source_pixels[x, y]
        # Keep the central white task glyph, excluding the old lower mask highlight.
        if 70 < x < 445 and 70 < y < 440 and alpha and max(red, green, blue) - min(red, green, blue) < 28:
            mask_pixels[x, y] = max(0, min(255, round((min(red, green, blue) - 180) * 3.4)))

background = Image.new("RGBA", (SIZE, SIZE))
bg = background.load()
for y in range(SIZE):
    t = y / (SIZE - 1)
    for x in range(SIZE):
        # Subtle warm vertical/radial gradient, full bleed to every edge.
        radial = max(0.0, 1.0 - (((x - 256) / 360) ** 2 + ((y - 220) / 400) ** 2))
        red = round((255 * (1 - t) + 229 * t) + 4 * radial)
        green = round((79 * (1 - t) + 38 * t) + 2 * radial)
        blue = round((66 * (1 - t) + 36 * t) + 2 * radial)
        bg[x, y] = (min(255, red), min(255, green), min(255, blue), 255)

shadow_mask = Image.new("L", (SIZE, SIZE), 0)
shadow_mask.paste(mask, (0, 8))
shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(10)).point(lambda value: round(value * 0.22))
shadow = Image.new("RGBA", (SIZE, SIZE), (70, 0, 0, 0))
shadow.putalpha(shadow_mask)
background.alpha_composite(shadow)
white = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
white.putalpha(mask)
background.alpha_composite(white)

for name, size in [
    ("icon-512.png", 512),
    ("icon-512-maskable.png", 512),
    ("icon-192.png", 192),
    ("apple-touch-icon.png", 180),
]:
    image = background if size == SIZE else background.resize((size, size), Image.Resampling.LANCZOS)
    image.save(ICONS / name, optimize=True, compress_level=9)
    print(f"wrote {name}")
