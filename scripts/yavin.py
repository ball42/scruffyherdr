"""Render an original jungle-moon wallpaper: a banded orange gas giant rising
over a misty canopy of rounded crowns, and a plain stepped stone temple above
the trees with one lit opening. With --day, the same view at dawn: a pale
gold sky, the giant faint and washed by daylight, the canopy green.

Usage: python3 scripts/yavin.py [--day] OUT.jpg [WIDTH HEIGHT]
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
rng = random.Random(4)

P = dict(
    sky=["#7aa0c0", "#c9c6b4", "#eec9a0"] if DAY else ["#060818", "#141632", "#2d2240"],
    bands=["#f1d3b2", "#e6b892", "#f4dcc0", "#ddaa84", "#efcaa6"] if DAY else ["#c9682a", "#9a4620", "#e08844", "#7a361c", "#b85a28"],
    rim="#fff1dc" if DAY else "#ff9a50",
    canopy_far="#6f8f7e" if DAY else "#18263a",
    canopy_near="#2c4f36" if DAY else "#06100c",
    leaf_lit="#7da36a" if DAY else "#21402f",
    mist="#e8e6da" if DAY else "#36405a",
    stone=("#8e8b7c", "#6b6a5e", "#4e4e46") if DAY else ("#2a2f34", "#1c2024", "#101316"),
    lamp="#ffc88a" if DAY else "#ff9a4a",
    light=(255, 236, 200) if DAY else (255, 150, 90),
    grain=3 if DAY else 5,
)


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ramp(stops, t):
    t = max(0.0, min(1.0, t)) * (len(stops) - 1)
    i = min(int(t), len(stops) - 2)
    return lerp(rgb(stops[i]), rgb(stops[i + 1]), t - i)


def jitter(c, n):
    return tuple(max(0, min(255, v + rng.randint(-n, n))) for v in c)


def solid(c):
    return Image.new("RGB", (W, H), c)


img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)

# ---- Sky and stars.
for y in range(H):
    d.line([(0, y), (W, y)], fill=ramp(P["sky"], (y / (H * 0.75)) ** 1.1))
if not DAY:
    for _ in range(int(900 * S * S) + 300):
        x, y = rng.random() * W, (rng.random() ** 1.4) * H * 0.7
        v = rng.randint(90, 230)
        d.ellipse([x, y, x + 2 * S, y + 2 * S], fill=(v, v, min(255, v + 15)))

# ---- The gas giant: soft wavy bands, a storm oval, shading toward its
# night side, and a thin bright rim of atmosphere on the lit limb.
gx, gy, gr = W * 0.27, H * 0.66, H * 0.5
planet = Image.new("RGB", (W, H))
pd = ImageDraw.Draw(planet)
y = gy - gr
k = 0
while y < gy + gr:
    bh = gr * rng.uniform(0.05, 0.12)
    col = rgb(P["bands"][k % len(P["bands"])])
    ph, amp = rng.uniform(0, 6), bh * rng.uniform(0.08, 0.25)
    pts = [(x, y + math.sin(x / (gr * 0.35) + ph) * amp) for x in range(int(gx - gr - 10), int(gx + gr + 12), 12)]
    pd.polygon(pts + [(gx + gr + 12, y + bh * 1.6), (gx - gr - 10, y + bh * 1.6)], fill=col)
    y += bh
    k += 1
ov = (gx + gr * 0.25, gy - gr * 0.28, gr * 0.16, gr * 0.07)
pd.ellipse([ov[0] - ov[2], ov[1] - ov[3], ov[0] + ov[2], ov[1] + ov[3]], fill=lerp(rgb(P["bands"][1]), rgb(P["rim"]), 0.35))
planet = planet.filter(ImageFilter.GaussianBlur(6 * S))
disc = Image.new("L", (W, H), 0)
ImageDraw.Draw(disc).ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=255)
# Shade grows with distance from the lit point on the upper left of the disc.
lx, ly, span = gx - gr * 0.45, gy - gr * 0.5, gr * 1.45
grad = Image.radial_gradient("L").resize((int(span * 2), int(span * 2)))
shade = Image.new("L", (W, H), 0)
shade.paste(grad.point(lambda v: max(0, min(255, (v - 55) * 3))), (int(lx - span), int(ly - span)))
shade = ImageChops.multiply(shade, disc)
planet = Image.composite(Image.new("RGB", (W, H), rgb(P["sky"][0]) if DAY else (8, 6, 20)), planet, shade.point(lambda v: int(v * (0.6 if DAY else 0.97))))
img = Image.composite(planet, img, disc.point(lambda v: int(v * (0.55 if DAY else 1))))
rim = Image.new("L", (W, H), 0)
ImageDraw.Draw(rim).ellipse([gx - gr, gy - gr, gx + gr, gy + gr], outline=255, width=int(5 * S))
rim = ImageChops.multiply(rim.filter(ImageFilter.GaussianBlur(10 * S)), ImageChops.invert(shade))
img = Image.composite(solid(rgb(P["rim"])), img, rim)
halo = Image.new("L", (W, H), 0)
ImageDraw.Draw(halo).ellipse([gx - gr * 1.15, gy - gr * 1.15, gx + gr * 1.15, gy + gr * 1.15], fill=60 if DAY else 50)
img = Image.composite(solid(rgb(P["rim"])), img, ImageChops.subtract(halo.filter(ImageFilter.GaussianBlur(gr * 0.12)), disc))
d = ImageDraw.Draw(img)

# ---- The temple: a plain stepped mass, lit on its left (toward the planet),
# one opening at the top lit from inside.
tx, tb = W * 0.66, H * 0.73
tiers = [(0.25, 0.07), (0.205, 0.065), (0.16, 0.06), (0.12, 0.055), (0.085, 0.05), (0.05, 0.06)]
y = tb
for i, (tw, th) in enumerate(tiers):
    w, h = W * tw, H * th
    d.rectangle([tx - w / 2, y - h, tx + w / 2, y], fill=rgb(P["stone"][1]))
    d.rectangle([tx - w / 2, y - h, tx - w / 2 + w * 0.32, y], fill=rgb(P["stone"][0]))
    d.rectangle([tx - w / 2, y - h * 0.12, tx + w / 2, y], fill=rgb(P["stone"][2]))
    for _ in range(int(w / (40 * S))):  # block joints
        bx = tx - w / 2 + rng.random() * w
        d.line([(bx, y - h), (bx, y - h * 0.12)], fill=rgb(P["stone"][2]), width=max(1, int(2 * S)))
    y -= h
dw, dh = W * 0.014, H * 0.035
door = (tx - dw / 2, y + H * 0.06 - dh - 4 * S, tx + dw / 2, y + H * 0.06 - 4 * S)
d.rectangle(door, fill=rgb(P["lamp"]))
if not DAY:
    g = Image.new("L", (W, H), 0)
    ImageDraw.Draw(g).ellipse([tx - dw * 4, door[1] - dh * 2, tx + dw * 4, door[3] + dh * 2], fill=120)
    img = Image.composite(solid(rgb(P["lamp"])), img, g.filter(ImageFilter.GaussianBlur(40 * S)))
    d = ImageDraw.Draw(img)

# ---- Canopy: layers of rounded crowns, far and hazed to near and dark,
# each crown lit on its upper left, mist pooling between the layers.
LAYERS = 5
for L in range(LAYERS):
    t = L / (LAYERS - 1)
    base = H * (0.66 + 0.085 * L)
    col = lerp(rgb(P["canopy_far"]), rgb(P["canopy_near"]), t ** 0.8)
    lit = lerp(lerp(rgb(P["canopy_far"]), rgb(P["leaf_lit"]), 0.6), rgb(P["leaf_lit"]), t)
    d.rectangle([0, base, W, H], fill=col)
    x = -40 * S
    while x < W + 60 * S:
        r = (28 + 70 * t) * S * rng.uniform(0.7, 1.3)
        cy = base - r * rng.uniform(0.2, 0.9)
        # A crown is a cluster of leafy lobes; the upper-left lobes catch light.
        d.ellipse([x - r * 0.9, cy - r * 0.7, x + r * 0.9, cy + r], fill=jitter(col, 4))
        lobes = [(x + rng.uniform(-0.6, 0.6) * r, cy + rng.uniform(-0.65, 0.3) * r, r * rng.uniform(0.32, 0.48)) for _ in range(7)]
        for lx2, ly2, lr in sorted(lobes, key=lambda o: o[1], reverse=True):
            up = max(0.0, min(1.0, (cy - ly2) / r + 0.5 - (lx2 - x) / (2 * r)))
            d.ellipse([lx2 - lr, ly2 - lr, lx2 + lr, ly2 + lr], fill=jitter(lerp(col, lit, 0.15 + 0.5 * up), 5))
            hr = lr * 0.45
            d.ellipse([lx2 - lr * 0.3 - hr, ly2 - lr * 0.35 - hr, lx2 - lr * 0.3 + hr, ly2 - lr * 0.35 + hr], fill=jitter(lerp(col, lit, 0.3 + 0.6 * up), 5))
        x += r * rng.uniform(1.0, 1.5)
    if L < LAYERS - 1:
        mist = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mist).rectangle([0, base + 10 * S, W, base + (80 + 40 * t) * S], fill=150 if DAY else 120)
        img = Image.composite(solid(rgb(P["mist"])), img, mist.filter(ImageFilter.GaussianBlur(40 * S)).point(lambda v: int(v * (0.65 - 0.4 * t))))
        d = ImageDraw.Draw(img)

# ---- Light from the planet's side, vignette, grain.
light = Image.new("L", (W, H), 0)
ImageDraw.Draw(light).ellipse([-W * 0.3, H * 0.1, W * 0.7, H * 1.2], fill=50 if DAY else 40)
img = Image.composite(solid(P["light"]), img, light.filter(ImageFilter.GaussianBlur(260 * S)))
vig = Image.new("L", (W, H), 255)
ImageDraw.Draw(vig).ellipse([-W * 0.12, -H * 0.2, W * 1.12, H * 1.15], fill=0)
vig = vig.filter(ImageFilter.GaussianBlur(260 * S))
img = Image.composite(solid((20, 24, 18) if DAY else (0, 0, 0)), img, vig.point(lambda v: int(v * (0.4 if DAY else 0.55))))
noise = Image.effect_noise((W, H), 40).convert("RGB")
img = Image.blend(img, ImageChops.overlay(img, noise), P["grain"] / 30)

img.save(OUT, quality=90)
print(OUT)
