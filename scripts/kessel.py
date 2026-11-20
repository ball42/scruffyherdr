"""Render an original maelstrom wallpaper: a slow spiral of violet and teal
gas wound round a dark well, gold dust strung along its arms and a thin gold
ring at the well's lip, stars behind. With --day, the spiral in ochre and
slate on warm grey paper, kept mid-tone.

Usage: python3 scripts/kessel.py [--day] OUT.jpg [WIDTH HEIGHT]
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
rng = random.Random(21)

P = dict(
    ground=("#b9b0a2", "#8a8070") if DAY else ("#120c1e", "#05030a"),
    gas=["#7d6a98", "#5f8a86", "#a48a5a"] if DAY else ["#4e3290", "#17716c", "#7a3c9c"],
    dust="#6e5214" if DAY else "#ffcf5c",
    well="#2e261e" if DAY else "#000000",
    ring="#8a6a20" if DAY else "#ffd27a",
    grain=3 if DAY else 5,
)
CX, CY = W * 0.56, H * 0.47
TILT = 0.58           # the disc seen at a slant
ROT = -0.22           # and turned a little


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def solid(c):
    return Image.new("RGB", (W, H), c)


def at(angle, radius):
    """A point on the tilted, turned disc."""
    x, y = math.cos(angle) * radius, math.sin(angle) * radius * TILT
    return CX + x * math.cos(ROT) - y * math.sin(ROT), CY + x * math.sin(ROT) + y * math.cos(ROT)


# ---- Ground: dark at the edges, a little lighter round the spiral.
reach = math.hypot(W, H) * 0.6
g = Image.radial_gradient("L").resize((int(reach * 2), int(reach * 2)))
fall = Image.new("L", (W, H), 255)
fall.paste(g.point(lambda v: min(255, int(v * 1.5))), (int(CX - reach), int(CY - reach)))
img = Image.composite(solid(rgb(P["ground"][1])), solid(rgb(P["ground"][0])), fall)
d = ImageDraw.Draw(img)
if not DAY:
    for _ in range(int(1000 * S * S) + 300):
        x, y = rng.random() * W, rng.random() * H
        v = rng.randint(80, 220)
        d.ellipse([x, y, x + 2 * S, y + 2 * S], fill=(v, v - 10, min(255, v + 25)))

# ---- Gas: soft blobs along three log-spiral arms, one mask per colour,
# blurred at two scales so the arms have both body and wisps.
ARMS, R0, GROW, TURNS = 3, 70 * S, 0.82, 2.0
masks = [Image.new("L", (W, H), 0) for _ in P["gas"]]
draws = [ImageDraw.Draw(m) for m in masks]
for arm in range(ARMS):
    for _ in range(int(5200 * S) + 600):
        t = rng.random() ** 0.8 * TURNS * 2 * math.pi
        a = t + arm * 2 * math.pi / ARMS + rng.gauss(0, 0.11)
        r = R0 * math.exp(GROW * t / math.pi) * rng.uniform(0.9, 1.12)
        x, y = at(a, r)
        s = (10 + r * 0.08) * rng.uniform(0.5, 1.6)
        k = (arm + (1 if t > TURNS * math.pi else 0) + (2 if rng.random() < 0.12 else 0)) % len(masks)
        draws[k].ellipse([x - s, y - s * TILT, x + s, y + s * TILT], fill=rng.randint(20, 70))
for m, col in zip(masks, P["gas"]):
    wide = m.filter(ImageFilter.GaussianBlur(60 * S))
    fine = m.filter(ImageFilter.GaussianBlur(10 * S))
    img = Image.composite(solid(rgb(col)), img, wide.point(lambda v: min(255, int(v * 1.7))))
    img = Image.composite(solid(rgb(col)), img, fine.point(lambda v: min(255, int(v * 1.1))))

# ---- Dust: fine gold specks strung along the arms, thicker toward the well.
dust = Image.new("L", (W, H), 0)
dd = ImageDraw.Draw(dust)
for _ in range(int(16000 * S) + 3000):
    arm = rng.randrange(ARMS)
    t = rng.random() ** 1.2 * TURNS * 2 * math.pi
    a = t + arm * 2 * math.pi / ARMS + rng.gauss(0, 0.1)
    r = R0 * math.exp(GROW * t / math.pi) * rng.uniform(0.95, 1.06)
    x, y = at(a, r)
    s = rng.uniform(0.8, 2.6) * S
    dd.ellipse([x - s, y - s, x + s, y + s], fill=rng.randint(120, 255))
img = Image.composite(solid(rgb(P["dust"])), img, dust.filter(ImageFilter.GaussianBlur(0.7 * S)))
if not DAY:
    img = Image.composite(solid(rgb(P["dust"])), img, dust.filter(ImageFilter.GaussianBlur(6 * S)).point(lambda v: int(v * 0.5)))

# ---- The well: a dark lens with a thin gold ring at its lip.
wr = 70 * S
well = Image.new("L", (W, H), 0)
ImageDraw.Draw(well).ellipse([CX - wr * 1.4, CY - wr * 0.85, CX + wr * 1.4, CY + wr * 0.85], fill=255)
img = Image.composite(solid(rgb(P["ring"])), img, well.filter(ImageFilter.GaussianBlur(26 * S)).point(lambda v: int(v * 0.55)))
img = Image.composite(solid(rgb(P["well"])), img, well.filter(ImageFilter.GaussianBlur(5 * S)))
ring = Image.new("L", (W, H), 0)
ImageDraw.Draw(ring).ellipse([CX - wr * 1.75, CY - wr * 1.0, CX + wr * 1.75, CY + wr * 1.0], outline=255, width=max(1, int(3 * S)))
img = Image.composite(solid(rgb(P["ring"])), img, ring.filter(ImageFilter.GaussianBlur(1.5 * S)))

# ---- Vignette and grain.
vig = Image.new("L", (W, H), 255)
ImageDraw.Draw(vig).ellipse([-W * 0.1, -H * 0.15, W * 1.1, H * 1.15], fill=0)
vig = vig.filter(ImageFilter.GaussianBlur(260 * S))
img = Image.composite(solid((60, 50, 40) if DAY else (0, 0, 0)), img, vig.point(lambda v: int(v * (0.4 if DAY else 0.6))))
noise = Image.effect_noise((W, H), 40).convert("RGB")
img = Image.blend(img, ImageChops.overlay(img, noise), P["grain"] / 30)

img.save(OUT, quality=90)
print(OUT)
