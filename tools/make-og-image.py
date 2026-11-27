#!/usr/bin/env python3
"""Generate a 1200x630 OG image for WebIDLpedia (dontcallmedom/webidlpedia). Portable, Pillow-only: python3 tools/make-og-image.py

Palette from the site's style.css: light ground #fafafa, W3C-blue accent
#005a9c, near-black text #111. Motif: web-platform spec cards / IDL tree.
Pillow-only, portable.
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
GROUND = (250, 250, 250)
ACCENT = (0, 90, 156)
INK = (17, 17, 17)
MUTED = (102, 102, 102)
CARD = (255, 255, 255)

img = Image.new("RGB", (W, H), GROUND)
d = ImageDraw.Draw(img)

# Top-left brand bar
d.rectangle([0, 0, W, 14], fill=ACCENT)

# Try DejaVu fonts (present on most systems)
def font(sz, bold=False):
    for name in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ):
        try:
            return ImageFont.truetype(name, sz)
        except OSError:
            continue
    return ImageFont.load_default()

f_title = font(76, bold=True)
f_sub = font(40)
f_meta = font(30)
f_tag = font(26, bold=True)

# Title
d.text((80, 120), "WebIDLpedia", font=f_title, fill=INK)
d.text((80, 225), "Every IDL definition used by Web Platform specs", font=f_sub, fill=MUTED)

# Spec "cards" motif below the fold
cards = [
    ("fetch", "11 members"),
    ("dom", "938 members"),
    ("html", "2,104 members"),
    ("webgpu", "489 members"),
]
x0 = 80
y0 = 340
cw, ch = 245, 150
gap = 20
for i, (name, meta) in enumerate(cards):
    x = x0 + i * (cw + gap)
    d.rounded_rectangle([x, y0, x + cw, y0 + ch], radius=14, fill=CARD, outline=(221, 221, 221), width=2)
    d.rectangle([x, y0, x + cw, y0 + 10], fill=ACCENT)
    d.text((x + 22, y0 + 34), name, font=f_tag, fill=ACCENT)
    d.text((x + 22, y0 + 82), meta, font=f_meta, fill=MUTED)

# Footer: URL
d.text((80, 545), "dontcallmedom.github.io/webidlpedia", font=f_meta, fill=MUTED)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "og-image.png")
img.save(OUT, "PNG")
print("saved", OUT, img.size)
print("saved /home/paperclip/scratch/webidlpedia-og.png", img.size)