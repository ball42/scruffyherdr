"""Render an original city-world wallpaper: a violet night of layered towers,
lit windows and streams of sky traffic, or with --day a hazy slate-and-gold
afternoon, mid-toned so it still shows through the terminals. Far towers
sink into haze for depth; the nearest stand at the edges of the frame.

Usage: python3 scripts/coruscant.py [--day] OUT.jpg [WIDTH HEIGHT]
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

# Each palette: sky stops, stars, the haze far towers sink into, five tower
# layers far to near as (face, lit edge), windows (colour, density, alpha),
# traffic (colour, alpha), the glow along the skyline, and grain.
NIGHT = dict(
    sky=[(0.0, "#06051a"), (0.30, "#171236"), (0.55, "#36214f"), (0.75, "#5a2f5c"), (1.0, "#3a2147")],
    stars=40,
    haze="#4a2f62",
    fade=[0.55, 0.38, 0.24, 0.1, 0.0],
    layers=[("#3a2d58", "#5a4a80"), ("#2c2248", "#4a3c70"), ("#211a3a", "#3c3060"),
            ("#17122c", "#2e2450"), ("#0d0a1d", "#221a3c")],
    windows=((255, 196, 120), 0.55, 230),
    traffic=("#ffd27a", 230),
    glow=("#ff8a5c", 110),
    grain=5,
)
DAYTIME = dict(
    sky=[(0.0, "#6f8fc0"), (0.35, "#9fb4d6"), (0.62, "#d9cdc4"), (0.78, "#e8c7a6"), (1.0, "#cdb39a")],
    stars=0,
    haze="#d8cfc8",
    fade=[0.6, 0.42, 0.26, 0.12, 0.0],
    layers=[("#a8b0c4", "#c8cede"), ("#9099b2", "#b5bdd2"), ("#7a84a2", "#a2abc6"),
            ("#646f90", "#8f99b8"), ("#4f5a7c", "#7c87a8")],
    windows=((255, 248, 226), 0.3, 150),
    traffic=("#fff6e0", 200),
    glow=("#ffd9a8", 60),
    grain=3,
)
P = DAYTIME if DAY else NIGHT
rng = random.Random(5)


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
        x, y = rng.random() * W, rng.random() ** 2 * H * 0.25
        r = rng.choice([0.8, 1.1]) * S * 1.4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(200, 190, 230, 200))
    return img


def tower(d, x, w, top, face, edge, win, layer):
    d.rectangle([x, top, x + w, H], fill=face + (255,))
    d.rectangle([x, top, x + max(2, w * 0.08), H], fill=edge + (255,))  # the lit edge
    kind = rng.random()
    if kind < 0.25:  # spire
        d.polygon([(x + w * 0.35, top), (x + w * 0.5, top - rng.uniform(60, 180) * S), (x + w * 0.65, top)], fill=face + (255,))
    elif kind < 0.45:  # stepped crown
        d.rectangle([x + w * 0.15, top - 30 * S, x + w * 0.85, top], fill=face + (255,))
        d.rectangle([x + w * 0.3, top - 55 * S, x + w * 0.7, top - 30 * S], fill=face + (255,))
    col, density, alpha = win
    gap_y, gap_x = (10 + layer * 2.5) * S, (8 + layer * 2.2) * S
    lit = rng.uniform(0.3, 1.0) * density  # some towers are busier than others
    y = top + 10 * S
    run = 0
    while y < H:
        if run <= 0:
            on = rng.random() < 0.5
            run = rng.randint(2, 9)
        run -= 1
        if on:
            xx = x + 6 * S
            while xx < x + w - 6 * S:
                if rng.random() < lit:
                    a = int(alpha * rng.uniform(0.5, 1))
                    d.rectangle([xx, y, xx + (2.5 + layer) * S, y + (3 + layer * 0.5) * S], fill=col + (a,))
                xx += gap_x
        y += gap_y


def layers(img):
    haze = hexrgb(P["haze"])
    for i, (face, edge) in enumerate(P["layers"]):
        face = lerp(hexrgb(face), haze, P["fade"][i])
        edge = lerp(hexrgb(edge), haze, P["fade"][i])
        col, density, alpha = P["windows"]
        win = (col, density, int(alpha * (1 - P["fade"][i] * 0.8)))
        lay = Image.new("RGBA", (W, H), face + (0,))
        d = ImageDraw.Draw(lay)
        base = H * (0.40 + i * 0.09)
        x = -40 * S
        while x < W:
            f = (x + 60 * S) / W
            w = (rng.uniform(40, 100) + i * 30) * S
            h = rng.uniform(120, 420) * S * (1.3 - i * 0.1)
            # the nearest two layers stand at the sides, leaving the middle open
            if i >= 3 and 0.26 < f < 0.74:
                x += w + rng.uniform(4, 24) * S
                continue
            tower(d, x, w, base - h, face, edge, win, i)
            x += w + rng.uniform(4, 24) * S
        img.alpha_composite(lay)
        if i in (0, 2):
            traffic(img, i)


def traffic(img, i):
    """Lanes of sky traffic: dashes of light along gently sloped lines, with a soft glow."""
    col, alpha = P["traffic"]
    col = hexrgb(col)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for lane in range(3 if i == 0 else 2):
        y0 = rng.uniform(0.12, 0.42) * H
        slope = rng.uniform(-0.05, 0.05)
        x = rng.uniform(0, 60) * S
        while x < W:
            y = y0 + slope * x
            ln = rng.uniform(8, 26) * S
            d.line([(x, y), (x + ln, y + slope * ln)], fill=col + (alpha,), width=max(2, int(3 * S)))
            x += ln + rng.uniform(14, 90) * S
    glow_layer = lay.filter(ImageFilter.GaussianBlur(8 * S))
    img.alpha_composite(glow_layer)
    img.alpha_composite(lay)


def glow(img):
    col, a = P["glow"]
    col = hexrgb(col)
    lay = Image.new("RGBA", (W, H), col + (0,))
    ImageDraw.Draw(lay).rectangle([0, H * 0.38, W, H * 0.62], fill=col + (a,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(120 * S)))


img = sky()
glow(img)
layers(img)
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
