"""Render an original jump-to-lightspeed wallpaper: star streaks pouring out
of a bright point just off centre, faint and fine near it and long and bright
toward the edges, in a blue tunnel of haze. With --day, ink-blue streaks on
blue-grey paper, darkening toward the edges so the picture stays mid-tone.

Usage: python3 scripts/hyperspace.py [--day] OUT.jpg [WIDTH HEIGHT]
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
rng = random.Random(12)

P = dict(
    centre="#ccd2e2" if DAY else "#1c2a66",
    edge="#6c7591" if DAY else "#020309",
    haze="#a3acc8" if DAY else "#2a3f8f",
    streaks=["#26326e", "#3e4c90", "#5a68a8"] if DAY else ["#ffffff", "#cfdcff", "#9fb8ff"],
    core="#f4f6fc" if DAY else "#f0f4ff",
    grain=3 if DAY else 4,
)
CX, CY = W * 0.53, H * 0.46


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def solid(c):
    return Image.new("RGB", (W, H), c)


# ---- Ground: a radial fall from the centre to the edges.
reach = math.hypot(W, H) * 0.62
g = Image.radial_gradient("L").resize((int(reach * 2), int(reach * 2)))
fall = Image.new("L", (W, H), 255)
fall.paste(g.point(lambda v: min(255, int(v * 1.45))), (int(CX - reach), int(CY - reach)))
img = Image.composite(solid(rgb(P["edge"])), solid(rgb(P["centre"])), fall)

# A tunnel of haze: a soft ring around the centre, uneven, so the streaks
# seem to run down a tube.
ring = Image.new("L", (W, H), 0)
rd = ImageDraw.Draw(ring)
for _ in range(220):
    a = rng.uniform(0, 2 * math.pi)
    r = rng.uniform(0.18, 0.42) * H
    x, y = CX + math.cos(a) * r * 1.35, CY + math.sin(a) * r
    s = rng.uniform(40, 140) * S
    rd.ellipse([x - s, y - s * 0.6, x + s, y + s * 0.6], fill=rng.randint(30, 90))
img = Image.composite(solid(rgb(P["haze"])), img, ring.filter(ImageFilter.GaussianBlur(70 * S)))

# ---- Streaks: each runs outward along its angle, a wedge that widens and
# brightens with distance. Drawn as masks per colour, glowing by night.
layers = [Image.new("L", (W, H), 0) for _ in P["streaks"]]
draws = [ImageDraw.Draw(m) for m in layers]
for _ in range(int(1100 * S) + 200):
    a = rng.uniform(0, 2 * math.pi)
    d0 = rng.uniform(0.02, 0.35) ** 1.3 * H
    d1 = d0 + rng.uniform(0.15, 0.9) * H * (0.4 + d0 / H)
    w = rng.uniform(0.5, 2.6) * S * (0.6 + d1 / H)
    k = rng.choices(range(len(layers)), weights=[5, 3, 2])[0]
    segs = 6
    for i in range(segs):
        t0, t1 = i / segs, (i + 1) / segs
        r0, r1 = d0 + (d1 - d0) * t0, d0 + (d1 - d0) * t1
        x0, y0 = CX + math.cos(a) * r0 * 1.3, CY + math.sin(a) * r0
        x1, y1 = CX + math.cos(a) * r1 * 1.3, CY + math.sin(a) * r1
        draws[k].line([(x0, y0), (x1, y1)], fill=int(255 * (0.15 + 0.85 * t1) * rng.uniform(0.6, 1)), width=max(1, int(w * (0.4 + t1))))
for m, col in zip(layers, P["streaks"]):
    if not DAY:
        img = Image.composite(solid(rgb(col)), img, m.filter(ImageFilter.GaussianBlur(9 * S)).point(lambda v: int(v * 0.45)))
    img = Image.composite(solid(rgb(col)), img, m.filter(ImageFilter.GaussianBlur(0.8 * S)).point(lambda v: int(v * (0.75 if DAY else 1))))

# ---- The bright point the streaks leave from.
core = Image.new("L", (W, H), 0)
ImageDraw.Draw(core).ellipse([CX - 90 * S, CY - 70 * S, CX + 90 * S, CY + 70 * S], fill=255)
img = Image.composite(solid(rgb(P["core"])), img, core.filter(ImageFilter.GaussianBlur(60 * S)).point(lambda v: int(v * 0.9)))

# ---- Vignette and grain.
vig = Image.new("L", (W, H), 255)
ImageDraw.Draw(vig).ellipse([-W * 0.1, -H * 0.15, W * 1.1, H * 1.15], fill=0)
vig = vig.filter(ImageFilter.GaussianBlur(260 * S))
img = Image.composite(solid((40, 46, 70) if DAY else (0, 0, 0)), img, vig.point(lambda v: int(v * (0.45 if DAY else 0.6))))
noise = Image.effect_noise((W, H), 40).convert("RGB")
img = Image.blend(img, ImageChops.overlay(img, noise), P["grain"] / 30)

img.save(OUT, quality=90)
print(OUT)
