"""Render an original tropical-fortress wallpaper: a lagoon of reefs and
islets under a planetary shield gate arcing across the sky, a citadel tower
on the horizon, a beach and leaning palms framing the edges; or with --day
the same lagoon at a mid-toned noon so it still shows through the terminals.

Usage: python3 scripts/scarif.py [--day] OUT.jpg [WIDTH HEIGHT]
Needs Pillow.
"""
import math
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

DAY = "--day" in sys.argv
ARGS = [a for a in sys.argv[1:] if a != "--day"]
W, H = (int(ARGS[1]), int(ARGS[2])) if len(ARGS) > 2 else (3024, 1964)
OUT = ARGS[0]
S = W / 3024  # scale for sizes drawn in 3024-wide pixels

# Each palette: sky stops, stars, the sun (x, y, radius, colour, alpha), the
# shield gate's glow, the lagoon (horizon, near), reef shallows, islets,
# the tower and its lights, the sand (dry, wet), foam, palms, and grain.
NIGHT = dict(
    sky=[(0.0, "#050a20"), (0.30, "#0f1d44"), (0.50, "#213a6a"), (0.58, "#2e5a7c"), (1.0, "#2e5a7c")],
    stars=260,
    sun=None,
    gate=(110, 200, 255),
    sea=("#16506a", "#0c2c40"),
    reef="#1d7a80",
    isle=("#163c3a", "#0e2a2a"),
    tower=("#2c3a50", (255, 180, 100)),
    sand=("#2c3a4a", "#1c3040"),
    foam=(150, 210, 230),
    palm=("#0a1c1e", "#06100f"),
    grain=5,
)
NOON = dict(
    sky=[(0.0, "#2f78c0"), (0.30, "#5fa2d8"), (0.52, "#9cc8e0"), (0.58, "#b8dce4"), (1.0, "#b8dce4")],
    stars=0,
    sun=(0.24, 0.16, 0.026, "#fff8e6", 220),
    gate=(230, 245, 255),
    sea=("#2e8fa8", "#1f9a9c"),
    reef="#4cc0b0",
    isle=("#3f8060", "#2c6448"),
    tower=("#7c8c9e", (255, 236, 200)),
    sand=("#d2bc84", "#a89464"),
    foam=(245, 252, 250),
    palm=("#2c5a3c", "#1e3f2a"),
    grain=3,
)
P = NOON if DAY else NIGHT
rng = random.Random(51)
HZ = 0.56    # the horizon
BEACH = 0.86  # where the beach starts


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), tuple(col) + (0,))
    return lay, ImageDraw.Draw(lay)


def stops_fill(img, stops, y0=0, y1=None):
    y1 = H if y1 is None else y1
    d = ImageDraw.Draw(img)
    st = [(p, hexrgb(c)) for p, c in stops]
    for y in range(int(y0), int(y1)):
        f = y / H
        for (p0, c0), (p1, c1) in zip(st, st[1:]):
            if p0 <= f <= p1:
                d.line([(0, y), (W, y)], fill=lerp(c0, c1, (f - p0) / max(p1 - p0, 1e-6)) + (255,))
                break


def glow(img, x, y, r, c, a):
    for rr, aa, blur in ((r * 7, a // 6, 0.6), (r * 2.6, a // 2, 0.5), (r, a, 0.1)):
        g = Image.new("RGBA", (W, H), c + (0,))
        ImageDraw.Draw(g).ellipse([x - rr, y - rr, x + rr, y + rr], fill=c + (aa,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(max(1, rr * blur))))


def sky():
    img = Image.new("RGBA", (W, H))
    stops_fill(img, P["sky"])
    d = ImageDraw.Draw(img)
    for _ in range(P["stars"]):
        x, y = rng.random() * W, rng.random() ** 1.4 * H * HZ
        r = rng.choice([0.7, 1.0, 1.4]) * S * 1.4
        b = int(rng.uniform(150, 240))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(b, b, min(255, b + 15), 255))
    if P["sun"]:
        x, y, r, c, a = P["sun"]
        glow(img, x * W, y * H, r * W, hexrgb(c), a)
    return img


def gate(img):
    """The shield: a vast faint ring tilted across the sky, brighter where it meets the horizon."""
    c = P["gate"]
    cx, cy, rx, ry = W * 0.58, H * 0.78, W * 0.78, H * 0.62
    for width, a, blur in ((60, 28, 30), (16, 60, 8), (5, 120, 2)):
        lay, d = layer(c)
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=c + (a,), width=int(width * S))
        img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(blur * S)))
    # a faint shimmer filling the dome above the horizon
    lay, d = layer(c)
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=c + (14 if DAY else 10,))
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rectangle([0, 0, W, H * HZ], fill=255)
    lay.putalpha(Image.composite(lay.getchannel("A"), Image.new("L", (W, H), 0), m))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(20 * S)))


def sea(img):
    lay, d = layer()
    top, near = hexrgb(P["sea"][0]), hexrgb(P["sea"][1])
    for y in range(int(H * HZ), H):
        t = max(0.0, (y - H * HZ) / (H * (1 - HZ)))
        d.line([(0, y), (W, y)], fill=lerp(top, near, t ** 0.8) + (255,))
    img.alpha_composite(lay)
    # reef shallows: soft lighter patches, wider nearer the viewer
    lay, d = layer(hexrgb(P["reef"]))
    for _ in range(46):
        y = H * rng.uniform(HZ + 0.03, BEACH - 0.02)
        t = (y - H * HZ) / (H * (BEACH - HZ))
        rx = rng.uniform(80, 260) * S * (0.4 + t)
        x = rng.random() * W
        d.ellipse([x - rx, y - rx * 0.12, x + rx, y + rx * 0.12], fill=hexrgb(P["reef"]) + (int(90 + 60 * t),))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(18 * S)))
    # glints
    lay, d = layer()
    for _ in range(320):
        y = H * rng.uniform(HZ + 0.005, BEACH)
        t = (y - H * HZ) / (H * (BEACH - HZ))
        x = rng.random() * W
        d.line([(x, y), (x + rng.uniform(10, 60) * S * (0.4 + t), y)], fill=(255, 255, 255, int(rng.uniform(30, 90) * (1 if DAY else 0.55))), width=max(1, int((1 + t) * S)))
    img.alpha_composite(lay)
    # the horizon line: a thin haze
    lay, d = layer()
    d.rectangle([0, H * HZ - 3 * S, W, H * HZ + 6 * S], fill=hexrgb(P["sky"][-1][1]) + (150,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(4 * S)))


def islet(img, x, w, h, palms=3):
    top, bottom = hexrgb(P["isle"][0]), hexrgb(P["isle"][1])
    y = H * HZ
    lay, d = layer(top)
    d.ellipse([x, y - h, x + w, y + h * 0.5], fill=top + (255,))
    d.rectangle([x, y, x + w, y + h], fill=bottom + (255,))
    for k in range(palms):  # tiny distant palms
        px = x + w * (0.2 + 0.6 * k / max(1, palms - 1)) + rng.uniform(-8, 8) * S
        ph = rng.uniform(30, 55) * S
        d.line([(px, y - h * 0.6), (px + 6 * S, y - h * 0.6 - ph)], fill=bottom + (255,), width=max(1, int(3 * S)))
        for a in range(6):
            ang = math.pi + a * math.pi / 5
            d.line([(px + 6 * S, y - h * 0.6 - ph), (px + 6 * S + math.cos(ang) * 22 * S, y - h * 0.6 - ph - math.sin(ang) * -8 * S)], fill=bottom + (255,), width=max(1, int(3 * S)))
    img.alpha_composite(lay)
    # its reflection
    lay, d = layer(top)
    d.ellipse([x + w * 0.1, y, x + w * 0.9, y + h * 0.9], fill=bottom + (70,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(4 * S)))


def tower(img):
    """The citadel: a tapering tower on its own islet, a broad cap and a dish, lit floors."""
    col, li = hexrgb(P["tower"][0]), P["tower"][1]
    tx, base = W * 0.66, H * HZ
    islet(img, tx - 170 * S, 340 * S, 26 * S, palms=0)
    lay, d = layer(col)
    top = H * 0.20
    d.polygon([(tx - 46 * S, base - 10 * S), (tx - 18 * S, top + 40 * S), (tx + 18 * S, top + 40 * S), (tx + 46 * S, base - 10 * S)], fill=col + (255,))
    d.rectangle([tx - 26 * S, top + 10 * S, tx + 26 * S, top + 44 * S], fill=col + (255,))
    d.ellipse([tx - 110 * S, top - 6 * S, tx + 110 * S, top + 24 * S], fill=col + (255,))
    d.pieslice([tx - 40 * S, top - 46 * S, tx + 40 * S, top + 14 * S], 180, 360, fill=col + (255,))
    d.rectangle([tx - 3 * S, top - 80 * S, tx + 3 * S, top - 30 * S], fill=col + (255,))
    # shade the left flank
    d.polygon([(tx - 46 * S, base - 10 * S), (tx - 18 * S, top + 40 * S), (tx - 4 * S, top + 40 * S), (tx - 10 * S, base - 10 * S)], fill=lerp(col, (0, 0, 0), 0.25) + (255,))
    img.alpha_composite(lay)
    lay, d = layer(li)
    for _ in range(70):
        y = rng.uniform(top + 50 * S, base - 20 * S)
        half = 18 * S + (y - top) / (base - top) * 26 * S
        x = tx + rng.uniform(-half, half) * 0.8
        d.rectangle([x, y, x + 5 * S, y + 3 * S], fill=li + (int(rng.uniform(50, 220) * (0.4 if DAY else 1)),))
    d.rectangle([tx - 100 * S, top + 6 * S, tx + 100 * S, top + 10 * S], fill=li + (90 if DAY else 160,))
    img.alpha_composite(lay)
    glow(img, tx, top - 80 * S, 8 * S, li, 240)
    if not DAY:  # the tower's light laid on the water
        lay, d = layer(li)
        for _ in range(80):
            y = H * rng.uniform(HZ + 0.01, HZ + 0.18)
            x = tx + rng.uniform(-40, 40) * S * (1 + (y - H * HZ) / (H * 0.1))
            d.line([(x, y), (x + rng.uniform(10, 40) * S, y)], fill=li + (int(rng.uniform(30, 90)),), width=max(1, int(2 * S)))
        img.alpha_composite(lay)


def beach(img):
    dry, wet = hexrgb(P["sand"][0]), hexrgb(P["sand"][1])
    ph = rng.uniform(0, 6)
    pts = [(0, H)]
    for x in range(0, W + 8, 8):
        pts.append((x, H * BEACH + math.sin(x / W * 5 + ph) * 18 * S + math.sin(x / W * 13) * 6 * S))
    pts.append((W, H))
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    g = Image.new("RGBA", (W, H))
    gd = ImageDraw.Draw(g)
    for y in range(int(H * BEACH) - int(30 * S), H):
        t = min(1, max(0, (y - H * BEACH) / (H * 0.04)))
        gd.line([(0, y), (W, y)], fill=lerp(wet, dry, t) + (255,))
    img.paste(g, (0, 0), m)
    # the foam line: a wavering bright edge with a softer second wash
    lay, d = layer(P["foam"])
    edge = [(x, y - 4 * S) for x, y in pts[1:-1]]
    d.line(edge, fill=P["foam"] + (210,), width=int(6 * S))
    d.line([(x, y - 30 * S + math.sin(x / 90) * 6 * S) for x, y in pts[1:-1]], fill=P["foam"] + (90,), width=int(4 * S))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(2.5 * S)))


def palm(img, bx, lean, height, scale=1.0):
    """A leaning palm: a ringed, tapering trunk and a crown of sawtooth fronds."""
    top, dark = hexrgb(P["palm"][0]), hexrgb(P["palm"][1])
    lay, d = layer(top)
    by = H * 0.995
    tx, ty = bx + lean * height * H, H * (1 - height)
    n = 40
    prev = None
    for i in range(n + 1):
        t = i / n
        x = bx + (tx - bx) * t + math.sin(t * math.pi) * 60 * S * scale * (1 if lean > 0 else -1)
        y = by + (ty - by) * t
        if prev:
            d.line([prev, (x, y)], fill=top + (255,), width=int((26 - 14 * t) * S * scale))
            if i % 3 == 0:  # rings
                w_ = (26 - 14 * t) * S * scale / 2
                d.line([(x - w_, y), (x + w_, y + 3 * S)], fill=dark + (255,), width=max(1, int(2 * S)))
        prev = (x, y)
    cx, cy = prev
    for k in range(13):
        ang = math.pi * (0.92 + k / 12 * 1.16) + rng.uniform(-0.07, 0.07)
        up = max(0.0, -math.sin(ang))  # 1 for a frond pointing straight up
        L = rng.uniform(200, 320) * S * scale * (0.8 if up > 0.8 else 1)
        upper, lower = [], []
        for j in range(25):
            u = j / 24
            x = cx + math.cos(ang) * L * u
            y = cy + math.sin(ang) * L * u * 0.75 + L * (0.6 - 0.45 * up) * u * u
            wdt = 30 * S * scale * math.sin(math.pi * min(1, u * 1.15)) + 1
            upper.append((x, y - wdt * 0.25))
            saw = wdt * (1.0 if j % 2 else 0.45)
            lower.append((x + math.cos(ang + 1.2) * 4 * S, y + saw))
        d.polygon(upper + lower[::-1], fill=lerp(top, dark, rng.uniform(0, 0.5)) + (255,))
    d.ellipse([cx - 22 * S * scale, cy - 14 * S * scale, cx + 22 * S * scale, cy + 22 * S * scale], fill=dark + (255,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(0.8 * S)))


img = sky()
gate(img)
sea(img)
islet(img, W * 0.05, W * 0.16, 30 * S)
islet(img, W * 0.36, W * 0.09, 18 * S, palms=2)
islet(img, W * 0.84, W * 0.12, 24 * S)
tower(img)
beach(img)
palm(img, W * 0.07, 0.30, 0.56, 1.1)
palm(img, W * 0.155, 0.16, 0.42, 0.85)
palm(img, W * 0.93, -0.32, 0.60, 1.15)
palm(img, W * 0.985, 0.05, 0.40, 0.85)
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
