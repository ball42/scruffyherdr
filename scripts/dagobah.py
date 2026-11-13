"""Render an original swamp-world wallpaper: a misty night of twisted trees,
hanging moss and drifting bog lights over still water, or with --day a pale
foggy noon, mid-toned so it still shows through the terminals. Each tree
layer fades into fog for depth, and the water mirrors what stands above it.

Usage: python3 scripts/dagobah.py [--day] OUT.jpg [WIDTH HEIGHT]
Needs Pillow.
"""
import math
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

DAY = "--day" in sys.argv
ARGS = [a for a in sys.argv[1:] if a != "--day"]
W, H = (int(ARGS[1]), int(ARGS[2])) if len(ARGS) > 2 else (3024, 1964)
OUT = ARGS[0]
S = W / 3024  # scale for sizes drawn in 3024-wide pixels

# Each palette: sky stops, a few stars, the fog the far layers sink into,
# five tree layers far to near, the water, bog lights (colour, count), light
# shafts, and grain.
NIGHT = dict(
    sky=[(0.0, "#04080a"), (0.35, "#0b1614"), (0.62, "#16271f"), (1.0, "#101c17")],
    stars=60,
    fog="#2e4a3c",
    fog_alpha=[120, 90, 60, 35, 0],
    layers=["#22362d", "#1a2c24", "#13221c", "#0c1712", "#060c09"],
    water="#0b1612",
    wisps=("#e9cf78", 22),
    shafts=0,
    grain=5,
)
DAYTIME = dict(
    sky=[(0.0, "#9fb39f"), (0.40, "#b8c6b0"), (0.70, "#c7d0bb"), (1.0, "#b5c1a9")],
    stars=0,
    fog="#d2d9c6",
    fog_alpha=[150, 120, 90, 55, 15],
    layers=["#a3b29a", "#8e9f86", "#798c72", "#64785f", "#50644c"],
    water="#8b9a84",
    wisps=("#f3e1a0", 8),
    shafts=38,
    grain=3,
)
P = DAYTIME if DAY else NIGHT
WATER = 0.80  # where the water starts, as a frame fraction
rng = random.Random(11)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def sky():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    stops = [(p, hexrgb(c)) for p, c in P["sky"]]
    for y in range(H):
        f = y / H
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= f <= p1:
                d.line([(0, y), (W, y)], fill=lerp(c0, c1, (f - p0) / max(p1 - p0, 1e-6)))
                break
    img = img.convert("RGBA")
    d = ImageDraw.Draw(img)
    for _ in range(P["stars"]):
        x, y = rng.random() * W, rng.random() ** 2 * H * 0.3
        r = rng.choice([0.8, 1.1, 1.5]) * S * 1.4
        b = int(rng.uniform(90, 170))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(b, b + 8, b, 255))
    return img


def tree(d, x, ground, top, w, col, sway):
    """A twisted trunk that splits into roots, under a crown of moss-hung blobs."""
    n = 80
    left, right = [], []
    for s in range(n):
        t = s / (n - 1)
        cx = x + sway * math.sin(t * math.pi * 1.25) + sway * 0.25 * math.sin(t * 7)
        cy = ground - (ground - top) * t
        ww = w * (1.7 - t * 0.95) * (1 + 0.6 * max(0, 0.12 - t) / 0.12)  # flared base
        left.append((cx - ww / 2, cy))
        right.append((cx + ww / 2, cy))
    d.polygon(left + right[::-1], fill=col)
    # roots arching into the water
    for r in range(5):
        rx = x + rng.uniform(-1, 1) * w * 2.6
        d.line([(x, ground - 30 * S), ((x + rx) / 2, ground - rng.uniform(10, 40) * S), (rx, ground + rng.uniform(10, 30) * S)],
               fill=col, width=max(2, int(w * 0.18)), joint="curve")
    # crown: low wide blobs, with moss hanging off them
    crown_x = x + sway * math.sin(math.pi * 1.25)
    for b in range(14):
        bx = crown_x + rng.uniform(-1, 1) * w * 5
        by = top + rng.uniform(-0.6, 1.2) * w * 1.6
        br = rng.uniform(0.9, 2.0) * w * 1.3
        d.ellipse([bx - br, by - br * 0.55, bx + br, by + br * 0.55], fill=col)
        for m in range(4):
            mx = bx + rng.uniform(-br, br) * 0.8
            length = rng.uniform(0.6, 2.4) * w * 1.6
            d.line([(mx, by), (mx + rng.uniform(-4, 4) * S, by + length)], fill=col, width=max(1, int(3 * S)))


def layers(img):
    fog = hexrgb(P["fog"])
    ground = H * WATER
    for i, c in enumerate(P["layers"]):
        col = hexrgb(c) + (255,)
        lay = Image.new("RGBA", (W, H), hexrgb(c) + (0,))
        d = ImageDraw.Draw(lay)
        count = 3 + i
        slots = sorted(rng.uniform(-0.05, 1.05) for _ in range(count))
        for k, f in enumerate(slots):
            # keep the middle of the frame clear for the nearest trees
            if i >= 3 and 0.28 < f < 0.72:
                f = 0.12 if f < 0.5 else 0.9
            w = (16 + i * 11) * S * rng.uniform(0.8, 1.25)
            top = H * rng.uniform(0.04, 0.24) + i * 10 * S
            tree(d, f * W, ground + i * 6 * S, top, w, col, rng.uniform(-50, 50) * S)
        # a bank of reeds and mud along the waterline
        for _ in range(int(60 * (1 + i))):
            rx = rng.random() * W
            d.line([(rx, ground + i * 6 * S), (rx + rng.uniform(-6, 6) * S, ground - rng.uniform(10, 50 + i * 20) * S)],
                   fill=col, width=max(1, int(2 * S)))
        img.alpha_composite(lay)
        a = P["fog_alpha"][i]
        if a:
            fl = Image.new("RGBA", (W, H), fog + (0,))
            ImageDraw.Draw(fl).rectangle([0, H * 0.18, W, H], fill=fog + (a,))
            img.alpha_composite(fl.filter(ImageFilter.GaussianBlur(60 * S)))


def water(img):
    """Mirror everything above the waterline, darken and blur it, then ripple."""
    line = int(H * WATER)
    above = img.crop((0, line - (H - line), W, line)).transpose(Image.FLIP_TOP_BOTTOM)
    tint = Image.new("RGBA", above.size, hexrgb(P["water"]) + (150,))
    above.alpha_composite(tint)
    above = above.filter(ImageFilter.GaussianBlur(3 * S))
    d = ImageDraw.Draw(above)
    fog = hexrgb(P["fog"])
    for _ in range(int(220 * S * S * 4)):
        y = rng.random() * above.height
        x = rng.random() * W
        d.line([(x, y), (x + rng.uniform(30, 140) * S, y)], fill=fog + (int(rng.uniform(20, 60)),), width=max(1, int(1.5 * S)))
    img.paste(above, (0, line))


def wisps(img):
    col, n = P["wisps"]
    col = hexrgb(col)
    for _ in range(n):
        x, y = rng.uniform(0.04, 0.96) * W, rng.uniform(0.5, 0.9) * H
        r = rng.uniform(3, 6) * S
        g = Image.new("RGBA", (W, H), col + (0,))
        ImageDraw.Draw(g).ellipse([x - r * 5, y - r * 5, x + r * 5, y + r * 5], fill=col + (60,))
        g = g.filter(ImageFilter.GaussianBlur(r * 2.5))
        ImageDraw.Draw(g).ellipse([x - r, y - r, x + r, y + r], fill=col + (235,))
        img.alpha_composite(g)


def shafts(img):
    if not P["shafts"]:
        return
    lay = Image.new("RGBA", (W, H), (255, 252, 230, 0))
    d = ImageDraw.Draw(lay)
    for _ in range(6):
        x = rng.uniform(0.1, 0.9) * W
        w = rng.uniform(60, 160) * S
        d.polygon([(x, 0), (x + w, 0), (x + w + 300 * S, H * 0.8), (x + 300 * S, H * 0.8)], fill=(255, 252, 230, P["shafts"]))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(40 * S)))


img = sky()
shafts(img)
layers(img)
water(img)
wisps(img)
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
