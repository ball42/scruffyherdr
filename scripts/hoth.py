"""Render an original ice-world wallpaper: an aurora night over layered ice
ridges, or with --day a bright cold noon, mid-toned so it still shows through
the terminals. Jagged ice cliffs far back give way to smooth drifts in front,
each layer fading into cold haze for depth.

Usage: python3 scripts/hoth.py [--day] OUT.jpg [WIDTH HEIGHT]
Needs Pillow.
"""
import bisect
import math
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

DAY = "--day" in sys.argv
ARGS = [a for a in sys.argv[1:] if a != "--day"]
W, H = (int(ARGS[1]), int(ARGS[2])) if len(ARGS) > 2 else (3024, 1964)
OUT = ARGS[0]
S = W / 3024  # scale for sizes drawn in 3024-wide pixels

# Each palette: sky stops, stars (per megapixel, brightness), aurora ribbons
# as (colour, alpha), the sun (x, y, radius, alpha) in frame fractions, the
# haze far layers fade into, six layers far to near as (face, shadow) colours,
# crest light, drifting snow alpha, and grain.
NIGHT = dict(
    sky=[(0.0, "#03060f"), (0.28, "#0a1530"), (0.48, "#16294a"), (0.58, "#223a5e"), (1.0, "#2a4468")],
    stars=(240, 245),
    aurora=[("#5fe0b8", 95), ("#6fb4ff", 70), ("#b58cff", 48)],
    sun=None,
    haze="#2c4466",
    layers=[("#4a6890", "#30486c"), ("#3f5d86", "#283f62"), ("#34507a", "#21375a"),
            ("#2b4570", "#1b2f50"), ("#223a62", "#152844"), ("#1a2f54", "#0f1f38")],
    crest=(200, 222, 255, 150),
    snow=120,
    grain=5,
)
DAYTIME = dict(
    sky=[(0.0, "#5f8cc8"), (0.30, "#86a9d6"), (0.50, "#aec6e3"), (0.60, "#c3d4ea"), (1.0, "#bdd0e6")],
    stars=None,
    aurora=None,
    sun=(0.70, 0.16, 0.05, 220),
    haze="#c6d6ea",
    layers=[("#c4d4ea", "#a9bedc"), ("#b6c9e3", "#98b1d4"), ("#a8bfdd", "#87a3ca"),
            ("#9ab4d6", "#7896c0"), ("#8ca9cf", "#6a8ab7"), ("#7f9fca", "#5d7fae")],
    crest=(255, 255, 255, 170),
    snow=150,
    grain=3,
)
P = DAYTIME if DAY else NIGHT
# How much each layer, far to near, fades into the haze.
FADE = [0.45, 0.32, 0.22, 0.12, 0.05, 0.0]
# Each layer's base line and how high its peaks rise, in frame fractions.
BASES = [(0.47, 0.15), (0.53, 0.10), (0.60, 0.07), (0.70, 0.08), (0.81, 0.09), (0.94, 0.10)]
rng = random.Random(3)


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
    return img.convert("RGBA")


def stars(img):
    if not P["stars"]:
        return
    per_mp, bright = P["stars"]
    d = ImageDraw.Draw(img)
    for _ in range(int(per_mp * W * H / 1e6)):
        x, y = rng.random() * W, rng.random() ** 1.5 * H * 0.55
        b = int(bright * rng.uniform(0.3, 1))
        r = rng.choice([0.7, 0.9, 1.1, 1.5, 2.0]) * S * 1.4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(b, b, min(255, b + 12), 255))


def aurora(img):
    if not P["aurora"]:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    step = max(2, int(3 * S))
    for k, (c, a) in enumerate(P["aurora"]):
        col = hexrgb(c)
        ph1, ph2, ph3 = (rng.random() * 6 for _ in range(3))
        base = H * (0.09 + 0.07 * k)
        for x in range(0, W, step):
            y = base + H * 0.04 * math.sin(x / (W * 0.16) + ph1) + H * 0.012 * math.sin(x / (W * 0.045) + ph2)
            length = H * (0.07 + 0.05 * (0.5 + 0.5 * math.sin(x / (W * 0.07) + ph3)))
            bright = 0.55 + 0.45 * math.sin(x / (W * 0.03) + ph2) ** 2
            segs = 10
            for s in range(segs):
                y0 = y + length * s / segs
                al = int(a * bright * (1 - s / segs) ** 1.4)
                d.line([(x, y0), (x, y0 + length / segs)], fill=col + (al,), width=step)
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(10 * S)))


def sun(img):
    if not P["sun"]:
        return
    x, y, r, a = P["sun"]
    x, y, r = x * W, y * H, r * W
    for k, (rr, aa) in enumerate([(r * 5, a // 6), (r * 2.4, a // 3), (r, a)]):
        g = Image.new("RGBA", (W, H), (255, 252, 240, 0))
        ImageDraw.Draw(g).ellipse([x - rr, y - rr, x + rr, y + rr], fill=(255, 252, 240, aa))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(rr * (0.6 if k < 2 else 0.15))))


def ridge_points(i):
    """Far layers are jagged ice cliffs; near ones smooth wind-cut drifts."""
    b, rise = BASES[i]
    base = H * b
    pts, x = [], -200 * S
    jag = i < 3
    while x <= W + 400 * S:
        lift = rng.uniform(0.15, 1) * H * rise
        pts.append((x, base - lift))
        x += rng.uniform(30, 110) * S if jag else rng.uniform(220, 420) * S
    if jag:
        # ice mesas: hold some peaks level for a stretch
        out = []
        for px, py in pts:
            out.append((px, py))
            if rng.random() < 0.3:
                out.append((px + rng.uniform(30, 90) * S, py + rng.uniform(-6, 6) * S))
        return out
    # wind-cut drifts: a long gentle windward rise, then a short steep lee face
    smooth = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        rising = y1 < y0
        for t in range(24):
            u = t / 24
            s = u ** 0.6 if rising else u ** 2.2
            s = (1 - math.cos(s * math.pi)) / 2
            smooth.append((x0 + (x1 - x0) * u, y0 + (y1 - y0) * s))
    return smooth


def layers(img):
    haze = hexrgb(P["haze"])
    for i, (face, shadow) in enumerate(P["layers"]):
        face = lerp(hexrgb(face), haze, FADE[i])
        shadow = lerp(hexrgb(shadow), haze, FADE[i])
        pts = ridge_points(i)
        top = int(min(y for _, y in pts))
        depth = H * 0.10 + i * H * 0.01
        grad = Image.new("RGBA", (W, H))
        gd = ImageDraw.Draw(grad)
        for y in range(top, H):
            gd.line([(0, y), (W, y)], fill=lerp(face, shadow, min(1, (y - top) / depth)) + (255,))
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon(pts + [(W + 400 * S, H), (-200 * S, H)], fill=255)
        img.paste(grad, (0, 0), mask)
        if i >= 3:
            # lee faces in shadow: each column darkens by how steeply the crest
            # falls there, fading down the face, so the drifts read as dunes of snow
            xs = [x for x, _ in pts]
            ys = [y for _, y in pts]

            def crest(x):
                k = max(1, min(len(xs) - 1, bisect.bisect_left(xs, x)))
                u = (x - xs[k - 1]) / max(xs[k] - xs[k - 1], 1e-6)
                return ys[k - 1] + (ys[k] - ys[k - 1]) * u

            sh = Image.new("RGBA", (W, H), shadow + (0,))
            sd = ImageDraw.Draw(sh)
            step = max(2, int(3 * S))
            dx = 12 * S
            for x in range(0, W, step):
                y = crest(x)
                fall = (crest(x + dx) - crest(x - dx)) / (2 * dx)
                shade = max(0.0, min(1.0, fall * 3.0))
                if shade <= 0.02:
                    continue
                for s in range(8):
                    y0 = y + depth * s / 8
                    sd.line([(x, y0), (x, y0 + depth / 8)], fill=shadow + (int(190 * shade * (1 - s / 8) ** 1.3),), width=step)
            sh = sh.filter(ImageFilter.GaussianBlur(6 * S))
            clip = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            clip.paste(sh, (0, 0), mask)
            img.alpha_composite(clip)
        # crest light along the top edge
        cr = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        r, g, b, a = P["crest"]
        ImageDraw.Draw(cr).line(pts, fill=(r, g, b, int(a * (0.45 + 0.55 * i / 5))), width=max(2, int((2 + i * 0.8) * S)))
        img.alpha_composite(cr.filter(ImageFilter.GaussianBlur(1.5 * S)))
        # haze rising off each layer, thinner toward the front
        hz = Image.new("RGBA", (W, H), haze + (0,))
        ImageDraw.Draw(hz).rectangle([0, top + depth * 0.6, W, H], fill=haze + (int(70 * (1 - i / 5)),))
        img.alpha_composite(hz.filter(ImageFilter.GaussianBlur(30 * S)))


def snow(img):
    d = ImageDraw.Draw(img)
    for _ in range(int((55 if DAY else 22) * W * H / 1e6)):
        x, y = rng.random() * W, rng.random() * H
        r = rng.choice([0.8, 1.2, 1.6, 2.2]) * S * 1.4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, int(P["snow"] * rng.uniform(0.4, 1))))


def grain(img):
    n = Image.effect_noise((W, H), 40).convert("RGB")
    return Image.blend(img.convert("RGB"), n, P["grain"] / 100)


img = sky()
stars(img)
aurora(img)
sun(img)
layers(img)
snow(img)
grain(img).save(OUT, quality=90)
print(OUT)
