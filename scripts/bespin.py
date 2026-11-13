"""Render an original cloud-world wallpaper: a sea of billowing cloud at
sunset under a floating city on its long stalk, or with --day a rose-and-
apricot afternoon, mid-toned so it still shows through the terminals. Cloud
banks lit from above and shaded below fade into haze for depth.

Usage: python3 scripts/bespin.py [--day] OUT.jpg [WIDTH HEIGHT]
Needs Pillow.
"""
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

DAY = "--day" in sys.argv
ARGS = [a for a in sys.argv[1:] if a != "--day"]
W, H = (int(ARGS[1]), int(ARGS[2])) if len(ARGS) > 2 else (3024, 1964)
OUT = ARGS[0]
S = W / 3024  # scale for sizes drawn in 3024-wide pixels

# Each palette: sky stops, stars, the sun (x, y, radius, colour, alpha) in
# frame fractions, the haze far banks sink into, five cloud banks far to near
# as (lit top, shaded underside), the city (silhouette, lights), and grain.
DUSK = dict(
    sky=[(0.0, "#0b0a24"), (0.28, "#2a1d4f"), (0.45, "#6a3466"), (0.55, "#b4566a"), (0.62, "#e58a6c"), (1.0, "#7d3a5c")],
    stars=140,
    sun=(0.30, 0.58, 0.035, "#ffb38a", 230),
    haze="#9a4a68",
    banks=[("#b36a7e", "#7a3e62"), ("#9a5576", "#622f56"), ("#7d4268", "#4c2448"),
           ("#5e3156", "#38193a"), ("#3f2142", "#22102a")],
    city=("#2a1a3c", (255, 196, 140)),
    grain=5,
)
NOON = dict(
    sky=[(0.0, "#7f8fd0"), (0.30, "#b3a7da"), (0.48, "#e3b4c4"), (0.60, "#f6c8a6"), (1.0, "#e8b294")],
    stars=0,
    sun=(0.30, 0.42, 0.04, "#fff3dc", 220),
    haze="#efc9c4",
    banks=[("#f2cdd0", "#d8a6b4"), ("#ebbcc2", "#cc95a6"), ("#e1a9b4", "#bd8298"),
           ("#d496a6", "#ab7089"), ("#c3839a", "#985f7b")],
    city=("#8a6886", (255, 236, 200)),
    grain=3,
)
P = NOON if DAY else DUSK
FADE = [0.45, 0.3, 0.18, 0.08, 0.0]
BASES = [0.56, 0.63, 0.71, 0.81, 0.93]  # where each bank's tops sit, as frame fractions
rng = random.Random(23)


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
        x, y = rng.random() * W, rng.random() ** 1.6 * H * 0.35
        r = rng.choice([0.7, 1.0, 1.4]) * S * 1.4
        b = int(rng.uniform(150, 240))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(b, b, min(255, b + 15), 255))
    return img


def sun(img):
    x, y, r, c, a = P["sun"]
    x, y, r, c = x * W, y * H, r * W, hexrgb(c)
    for rr, aa, blur in ((r * 6, a // 5, 0.6), (r * 2.5, a // 2, 0.5), (r, a, 0.12)):
        g = Image.new("RGBA", (W, H), c + (0,))
        ImageDraw.Draw(g).ellipse([x - rr, y - rr, x + rr, y + rr], fill=c + (aa,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(rr * blur)))


def bank(img, i):
    """A bank of billows: overlapping puffs, each lit on top and shaded beneath."""
    haze = hexrgb(P["haze"])
    lit, shade = (lerp(hexrgb(c), haze, FADE[i]) for c in P["banks"][i])
    top = H * BASES[i]
    size = (60 + i * 45) * S
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    x = -size
    while x < W + size:
        r = size * rng.uniform(0.6, 1.3)
        cy = top + rng.uniform(-0.35, 0.35) * size
        md.ellipse([x - r, cy - r * 0.8, x + r, cy + r * 0.8], fill=255)
        # smaller puffs riding on top
        for _ in range(2):
            pr = r * rng.uniform(0.35, 0.6)
            px, py = x + rng.uniform(-r, r) * 0.6, cy - r * rng.uniform(0.5, 0.8)
            md.ellipse([px - pr, py - pr * 0.85, px + pr, py + pr * 0.85], fill=255)
        x += r * rng.uniform(0.7, 1.1)
    md.rectangle([0, top + size * 0.3, W, H], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2.5 * S + i * 0.6 * S))
    # lit tops grading into shaded undersides
    grad = Image.new("RGBA", (W, H))
    gd = ImageDraw.Draw(grad)
    span = size * 1.8
    y0 = int(top - size * 1.4)
    for y in range(0, H):
        t = min(1, max(0, (y - y0) / span))
        gd.line([(0, y), (W, y)], fill=lerp(lit, shade, t ** 0.8) + (255,))
    img.paste(grad, (0, 0), mask)


def city(img):
    """The floating city between the far and near banks: a disc, towers, the long stalk, lights."""
    col, lights = P["city"]
    col = lerp(hexrgb(col), hexrgb(P["haze"]), 0.25)
    lay = Image.new("RGBA", (W, H), col + (0,))
    d = ImageDraw.Draw(lay)
    cx, cy, rw = W * 0.68, H * 0.40, 230 * S
    d.ellipse([cx - rw, cy - 26 * S, cx + rw, cy + 26 * S], fill=col + (255,))
    for k in range(18):
        tx = cx - rw * 0.75 + k * rw * 1.5 / 18
        th = rng.uniform(30, 110) * S * (1 - abs(k - 8.5) / 11)
        d.rectangle([tx, cy - th, tx + 16 * S, cy], fill=col + (255,))
    d.polygon([(cx - 18 * S, cy + 22 * S), (cx + 18 * S, cy + 22 * S), (cx + 5 * S, cy + 260 * S), (cx - 5 * S, cy + 260 * S)], fill=col + (255,))
    for _ in range(110):
        lx, ly = cx + rng.uniform(-rw, rw) * 0.9, cy + rng.uniform(-90, 14) * S
        a = int(rng.uniform(80, 230) * (0.6 if DAY else 1))
        d.rectangle([lx, ly, lx + 3 * S, ly + 3 * S], fill=lights + (a,))
    img.alpha_composite(lay)


img = sky()
sun(img)
for i in range(5):
    bank(img, i)
    if i == 1:
        city(img)
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
