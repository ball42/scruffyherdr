"""Render an original jungle-moon wallpaper: a banded orange gas giant rising
over a misty canopy of rounded crowns, and a plain stepped stone temple above
the trees with one lit opening.

With --day the viewpoint changes: up on the temple's top terrace at midday,
looking over a river winding through the jungle valley, mist in the far
reaches and the gas giant pale and low in the sky.

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
    sky=["#060818", "#141632", "#2d2240"],
    bands=["#c9682a", "#9a4620", "#e08844", "#7a361c", "#b85a28"],
    rim="#ff9a50",
    canopy_far="#18263a",
    canopy_near="#06100c",
    leaf_lit="#21402f",
    mist="#36405a",
    stone=("#2a2f34", "#1c2024", "#101316"),
    lamp="#ff9a4a",
    light=(255, 150, 90),
    grain=5,
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


# ---- Day: from the temple's top terrace, over a jungle river valley, the
# gas giant pale and low. Runs and exits before the night code below.
def day():
    rng = random.Random(14)
    HZ = H * 0.42

    def poly(pts, blur=0):
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).polygon(pts, fill=255)
        return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m

    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=ramp(["#6f9cc4", "#a8c4d4", "#e4e2cc"], (y / HZ) ** 1.15))
    # The gas giant: a pale banded disc low on the left, washed by daylight.
    gx, gy, gr = W * 0.2, HZ - H * 0.02, H * 0.3
    disc = Image.new("L", (W, H), 0)
    ImageDraw.Draw(disc).ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=255)
    bands = Image.new("RGB", (W, H), rgb("#ecd4b8"))
    bd = ImageDraw.Draw(bands)
    y, k = gy - gr, 0
    while y < gy + gr:
        bh = gr * rng.uniform(0.06, 0.13)
        bd.rectangle([gx - gr, y, gx + gr, y + bh], fill=rgb(["#ecd4b8", "#dcb898", "#f2e0c8", "#d4a888"][k % 4]))
        y += bh
        k += 1
    bands = bands.filter(ImageFilter.GaussianBlur(5 * S))
    img = Image.composite(bands, img, disc.point(lambda v: int(v * 0.55)))
    # Far ridges, blue with distance.
    for col, base, amp, f in [("#9cb2bc", HZ - 10 * S, 40, 0.07), ("#86a49e", HZ + 6 * S, 24, 0.045)]:
        pts = [(x, base - amp * S * (0.6 + 0.4 * math.sin(x / (W * f) + base))) for x in range(0, W + 10, 10)]
        img.paste(rgb(col), mask=poly(pts + [(W, H), (0, H)], 2 * S))
    # The valley floor: canopy, receding into haze.
    d = ImageDraw.Draw(img)
    for y in range(int(HZ + 10 * S), H):
        t = (y - HZ) / (H - HZ)
        d.line([(0, y), (W, y)], fill=ramp(["#8eab94", "#5f8a5e", "#3e6a3e"], t))
    # The river: winding from the horizon toward the viewer, catching the sky.
    left, right = [], []
    for i in range(61):
        t = i / 60
        y = HZ + 12 * S + (H * 0.8 - HZ) * t ** 1.6
        x = W * 0.55 + W * 0.22 * math.sin(t * 5.2 + 0.6) * t ** 0.7
        w = (4 + 150 * t ** 1.6) * S
        left.append((x - w, y))
        right.append((x + w, y))
    river = poly(left + right[::-1], 1.5 * S)
    sheen = Image.new("RGB", (W, H))
    sd = ImageDraw.Draw(sheen)
    for y in range(H):
        sd.line([(0, y), (W, y)], fill=ramp(["#c8dae0", "#9cbcc8", "#7aa0ac"], (y - HZ) / (H - HZ)))
    img = Image.composite(sheen, img, river)
    # Canopy crowns: lobed clusters, small and dense far off, larger near,
    # leaving the river clear; each lit on its upper left.
    crowns = []
    for _ in range(int(2600 * S) + 600):
        t = rng.random() ** 0.9
        y = HZ + 14 * S + (H - HZ) * t
        r = (5 + 70 * t ** 1.6) * S * rng.uniform(0.7, 1.3)
        x = rng.uniform(-0.03, 1.03) * W
        if river.getpixel((int(min(W - 1, max(0, x))), int(min(H - 1, y)))) > 0:
            continue
        crowns.append((y, x, r, t))
    crowns.sort()
    d = ImageDraw.Draw(img)
    for y, x, r, t in crowns:
        base = lerp(rgb("#86a68c"), rgb("#2e5a30"), t ** 0.7)
        lit = lerp(rgb("#b4c8a8"), rgb("#86b062"), t)
        d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.6], fill=jitter(base, 5))
        for _ in range(4 if r > 12 * S else 1):
            lx, ly, lr = x + rng.uniform(-0.5, 0.3) * r, y - rng.uniform(0.1, 0.6) * r, r * rng.uniform(0.3, 0.5)
            d.ellipse([lx - lr, ly - lr, lx + lr, ly + lr], fill=jitter(lerp(base, lit, 0.6), 6))
    # Mist lying in the valley, thickest at the far end.
    mist = Image.linear_gradient("L").resize((W, H)).point(lambda v: int(150 * max(0.0, 1 - abs(v / 255 - 0.47) / 0.12)))
    img = Image.composite(solid(rgb("#e6eadc")), img, mist)
    # The terrace: the temple's stone parapet along the bottom, blocks lit on
    # top, and one stepped corner rising on the right.
    d = ImageDraw.Draw(img)
    py = H * 0.86
    d.rectangle([0, py, W, H], fill=rgb("#7a7868"))
    d.rectangle([0, py, W, py + 14 * S], fill=rgb("#b4b09a"))
    x = 0
    while x < W:
        bw = rng.uniform(160, 300) * S
        d.line([(x, py + 14 * S), (x, H)], fill=rgb("#5a584c"), width=max(1, int(3 * S)))
        d.line([(x, py + H * 0.07), (x + bw, py + H * 0.07)], fill=rgb("#5a584c"), width=max(1, int(3 * S)))
        x += bw
    for i, (w, h) in enumerate([(0.2, 0.18), (0.14, 0.26), (0.08, 0.34)]):
        x0 = W * (1 - w)
        y0 = H * (1 - h)
        d.rectangle([x0, y0, W, H], fill=rgb("#6e6c5e"))
        d.rectangle([x0, y0, W, y0 + 12 * S], fill=rgb("#aca890"))
        d.rectangle([x0, y0, x0 + 18 * S, H], fill=rgb("#8a8874"))
    moss = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(moss)
    for _ in range(140):
        # Moss sits on a top edge: the parapet, or one of the corner's steps.
        my, x0 = rng.choice([(py, 0.0), (H * 0.82, 0.8), (H * 0.74, 0.86), (H * 0.66, 0.92)])
        mx = rng.uniform(x0, 1.0) * W
        my += rng.uniform(0, 10) * S
        mr = rng.uniform(6, 22) * S
        md.ellipse([mx - mr, my - mr * 0.5, mx + mr, my + mr * 0.5], fill=200)
    img = Image.composite(solid(rgb("#5e7a44")), img, moss.filter(ImageFilter.GaussianBlur(3 * S)))
    vig = Image.new("L", (W, H), 255)
    ImageDraw.Draw(vig).ellipse([-W * 0.12, -H * 0.2, W * 1.12, H * 1.15], fill=0)
    img = Image.composite(solid((20, 26, 18)), img, vig.filter(ImageFilter.GaussianBlur(260 * S)).point(lambda v: int(v * 0.35)))
    noise = Image.effect_noise((W, H), 40).convert("RGB")
    Image.blend(img, ImageChops.overlay(img, noise), 3 / 30).save(OUT, quality=90)
    print(OUT)


if DAY:
    day()
    sys.exit(0)

img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)

# ---- Sky and stars.
for y in range(H):
    d.line([(0, y), (W, y)], fill=ramp(P["sky"], (y / (H * 0.75)) ** 1.1))
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
planet = Image.composite(Image.new("RGB", (W, H), (8, 6, 20)), planet, shade.point(lambda v: int(v * (0.97))))
img = Image.composite(planet, img, disc.point(lambda v: int(v * (1))))
rim = Image.new("L", (W, H), 0)
ImageDraw.Draw(rim).ellipse([gx - gr, gy - gr, gx + gr, gy + gr], outline=255, width=int(5 * S))
rim = ImageChops.multiply(rim.filter(ImageFilter.GaussianBlur(10 * S)), ImageChops.invert(shade))
img = Image.composite(solid(rgb(P["rim"])), img, rim)
halo = Image.new("L", (W, H), 0)
ImageDraw.Draw(halo).ellipse([gx - gr * 1.15, gy - gr * 1.15, gx + gr * 1.15, gy + gr * 1.15], fill=50)
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
        ImageDraw.Draw(mist).rectangle([0, base + 10 * S, W, base + (80 + 40 * t) * S], fill=120)
        img = Image.composite(solid(rgb(P["mist"])), img, mist.filter(ImageFilter.GaussianBlur(40 * S)).point(lambda v: int(v * (0.65 - 0.4 * t))))
        d = ImageDraw.Draw(img)

# ---- Light from the planet's side, vignette, grain.
light = Image.new("L", (W, H), 0)
ImageDraw.Draw(light).ellipse([-W * 0.3, H * 0.1, W * 0.7, H * 1.2], fill=40)
img = Image.composite(solid(P["light"]), img, light.filter(ImageFilter.GaussianBlur(260 * S)))
vig = Image.new("L", (W, H), 255)
ImageDraw.Draw(vig).ellipse([-W * 0.12, -H * 0.2, W * 1.12, H * 1.15], fill=0)
vig = vig.filter(ImageFilter.GaussianBlur(260 * S))
img = Image.composite(solid((0, 0, 0)), img, vig.point(lambda v: int(v * (0.55))))
noise = Image.effect_noise((W, H), 40).convert("RGB")
img = Image.blend(img, ImageChops.overlay(img, noise), P["grain"] / 30)

img.save(OUT, quality=90)
print(OUT)
