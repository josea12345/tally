"""Generate TALLY icons: dark rounded square + acid-lime tally marks."""
from PIL import Image, ImageDraw

INK = (10, 10, 11, 255)
LIME = (200, 243, 29, 255)

def rounded_square(size, radius_frac=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_frac), fill=INK)
    return img, d

def draw_tally(d, size):
    # four vertical marks + diagonal slash, like a tally "5"
    w = max(6, size // 18)
    cx, cy = size / 2, size / 2
    gap = size / 9
    top, bot = cy - size * 0.20, cy + size * 0.20
    for i in (-1.5, -0.5, 0.5, 1.5):
        x = cx + i * gap
        d.line([x, top, x, bot], fill=LIME, width=w, joint="round")
    # diagonal
    d.line([cx - 2.4 * gap, bot - size * 0.05, cx + 2.4 * gap, top + size * 0.05],
           fill=LIME, width=w, joint="round")

def make(size, out, maskable=False):
    img, d = rounded_square(size)
    if maskable:
        # maskable: keep art inside the central 80% safe zone
        d2 = ImageDraw.Draw(img)
        draw_tally(d2, int(size * 0.8))
    else:
        draw_tally(d, size)
    img.save(out)
    print("wrote", out)

import os
os.makedirs("/home/hatch/workspace/tally/public/icons", exist_ok=True)
make(192, "/home/hatch/workspace/tally/public/icons/icon-192.png")
make(512, "/home/hatch/workspace/tally/public/icons/icon-512.png")
make(512, "/home/hatch/workspace/tally/public/icons/icon-maskable-512.png", maskable=True)
make(180, "/home/hatch/workspace/tally/public/icons/apple-touch-icon.png")
