"""Render an original sinkhole-city wallpaper: looking down into a deep round
sinkhole from its rim, rough rings of cliff stepping down and darkening to a
black centre, warm lights strung along the ledges. With --day, warm
sandstone rings in daylight, the centre in shadow and only a few lights on.

Usage: python3 scripts/utapau.py [--day] OUT.jpg [WIDTH HEIGHT]
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
S = W / 3024
rng = random.Random(33)

P = dict(
    plateau=("#c2b293", "#a8987a") if DAY else ("#2a2d36", "#1c1e25"),
    rock_top="#d2c09c" if DAY else "#30333d",
    rock_deep="#7a6650" if DAY else "#050608",
    lip="#e4d6b8" if DAY else "#5a6070",
    shadow="#4e4030" if DAY else "#000000",
    lamp="#ffd9a0" if DAY else "#ffb347",
    lit_share=0.12 if DAY else 0.7,
    grain=4 if DAY else 5,
)
CX, CY = W * 0.5, H * 0.56
RX, RY = W * 0.58, H * 0.62     # the rim
RINGS = 13


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def jitter(c, n):
    return tuple(max(0, min(255, v + rng.randint(-n, n))) for v in c)


def solid(c):
    return Image.new("RGB", (W, H), c)


def ring_pts(k, rough):
    """Ring k's outline: an ellipse that shrinks with depth and rises a little
    (we look in at a slant, so the far wall shows more), roughened."""
    t = k / RINGS
    sx, sy = RX * (1 - t) ** 1.15, RY * (1 - t) ** 1.15
    cy = CY - t * H * 0.06
    n = 180
    ph = rng.uniform(0, 6)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        wob = 1 + rough * (0.6 * math.sin(3 * a + ph) + 0.4 * math.sin(7 * a + ph * 2) + rng.uniform(-0.25, 0.25))
        pts.append((CX + math.cos(a) * sx * wob, cy + math.sin(a) * sy * wob))
    return pts, (CX, cy, sx, sy)


# ---- Plateau: mottled ground round the rim.
img = solid(rgb(P["plateau"][0]))
mott = Image.effect_noise((W // 8, H // 8), 60).resize((W, H), Image.BICUBIC)
img = Image.composite(solid(rgb(P["plateau"][1])), img, mott.point(lambda v: max(0, min(255, (v - 100) * 2))))
d = ImageDraw.Draw(img)

# ---- Rings, outermost first. Each is a ledge: its own tone (darker with
# depth), a lit lip on the near side, and shadow cast by the ring above on
# the far side.
lamps = []
for k in range(RINGS):
    t = k / RINGS
    pts, (cx, cy, sx, sy) = ring_pts(k, 0.025 + 0.02 * t)
    tone = lerp(rgb(P["rock_top"]), rgb(P["rock_deep"]), t ** 0.75)
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    img = Image.composite(solid(tone), img, m)
    # Lit lip along the near (lower) edge.
    lip = Image.new("L", (W, H), 0)
    ImageDraw.Draw(lip).line([p for p in pts if p[1] > cy] , fill=255, width=max(1, int((3 + 5 * (1 - t)) * S)))
    img = Image.composite(solid(lerp(rgb(P["lip"]), tone, t)), img, lip.filter(ImageFilter.GaussianBlur(2 * S)).point(lambda v: int(v * (0.8 - 0.5 * t))))
    # Shadow inside the far (upper) wall.
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).ellipse([cx - sx * 0.95, cy - sy * 1.0, cx + sx * 0.95, cy - sy * 0.55], fill=255)
    sh = ImageChops.multiply(sh.filter(ImageFilter.GaussianBlur(sy * 0.15 + 4)), m)
    img = Image.composite(solid(rgb(P["shadow"])), img, sh.point(lambda v: int(v * (0.3 if DAY else 0.45))))
    # Strata: thin lines following the ring.
    d = ImageDraw.Draw(img)
    for f in (0.97, 0.94):
        d.line([(CX + (x - CX) * f, cy + (y - cy) * f) for x, y in pts] + [(CX + (pts[0][0] - CX) * f, cy + (pts[0][1] - cy) * f)],
               fill=lerp(tone, (0, 0, 0), 0.25), width=max(1, int(2 * S * (1 - t))))
    # Lamps strung along this ledge, in small clusters.
    for _ in range(int(5 + 9 * (1 - t))):
        a0 = rng.uniform(0, 2 * math.pi)
        for j in range(rng.randint(2, 6)):
            a = a0 + j * rng.uniform(0.012, 0.03)
            f = rng.uniform(0.9, 0.99)
            lamps.append((CX + math.cos(a) * sx * f, cy + math.sin(a) * sy * f, (1 - t) ** 0.8, rng.random() < P["lit_share"]))

# ---- The bottom: black, soft-edged.
pts, (cx, cy, sx, sy) = ring_pts(RINGS, 0.04)
m = Image.new("L", (W, H), 0)
ImageDraw.Draw(m).polygon(pts, fill=255)
img = Image.composite(solid(rgb(P["shadow"])), img, m.filter(ImageFilter.GaussianBlur(12 * S)))

# ---- Lamps: small warm windows, lit ones glowing.
d = ImageDraw.Draw(img)
glow = Image.new("L", (W, H), 0)
gd = ImageDraw.Draw(glow)
lamp = rgb(P["lamp"])
for x, y, size, lit in lamps:
    w, h = (2 + 5 * size) * S, (1.5 + 3 * size) * S
    if lit:
        d.rectangle([x - w / 2, y - h / 2, x + w / 2, y + h / 2], fill=jitter(lamp, 12))
        gd.ellipse([x - w * 3, y - h * 3, x + w * 3, y + h * 3], fill=int(110 * size + 40))
    else:
        d.rectangle([x - w / 2, y - h / 2, x + w / 2, y + h / 2], fill=lerp(lamp, (0, 0, 0), 0.45 if DAY else 0.75))
if not DAY:
    img = Image.composite(solid(lamp), img, glow.filter(ImageFilter.GaussianBlur(10 * S)).point(lambda v: int(v * 0.6)))

# ---- Vignette and grain.
vig = Image.new("L", (W, H), 255)
ImageDraw.Draw(vig).ellipse([-W * 0.08, -H * 0.12, W * 1.08, H * 1.12], fill=0)
vig = vig.filter(ImageFilter.GaussianBlur(240 * S))
img = Image.composite(solid((50, 40, 28) if DAY else (0, 0, 0)), img, vig.point(lambda v: int(v * (0.28 if DAY else 0.55))))
noise = Image.effect_noise((W, H), 40).convert("RGB")
img = Image.blend(img, ImageChops.overlay(img, noise), P["grain"] / 30)

img.save(OUT, quality=90)
print(OUT)
