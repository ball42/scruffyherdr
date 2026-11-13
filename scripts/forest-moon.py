"""Render an original forest-moon wallpaper: misty night, or with --day a mid-tone
hazy daytime for light mode. Giant trees fade back into blue-green fog under
a banded gas giant.

Original artwork, drawn in code. Needs Pillow.
Usage: python3 scripts/forest-moon.py [--day] OUT.jpg [WIDTH HEIGHT]
"""

import math
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

DAY = "--day" in sys.argv
ARGS = [a for a in sys.argv[1:] if a != "--day"]
W, H = (int(ARGS[1]), int(ARGS[2])) if len(ARGS) > 2 else (3024, 1964)
OUT = ARGS[0]

# Each palette: sky stops, star brightness, the planet (lit, shadow, bands,
# halo strength, opacity), forest layers far to near as (trunk, shade) colors,
# the fog between them, the ground mist, fireflies, light shafts, and grain.
NIGHT = dict(
    sky=[(0.0, "#03100f"), (0.30, "#082221"), (0.55, "#15403b"), (0.78, "#2a5e53"), (1.0, "#2f6656")],
    stars=210,
    planet=dict(lit="#e9dcb4", dark="#24433c", bands=["#b9b48e", "#d8cfa6", "#9da583", "#cbbf98"],
                halo=0.22, alpha=235),
    layers=[("#2c5a50", "#244c44"), ("#1f463f", "#183a34"), ("#143430", "#0f2926"),
            ("#0c2320", "#081a18"), ("#06120f", "#040c0a")],
    fog="#3d7a69", fog_alpha=[150, 110, 70, 30, 0],
    mist=("#4f8d7a", 120),
    fireflies=("#e9f5a6", 44),
    shafts=0,
    grain=6,
)
# Mid-tone, so it still shows through 45% near-white terminals; dark text stays readable.
DAYTIME = dict(
    sky=[(0.0, "#8fc2b2"), (0.40, "#a9d2c2"), (0.75, "#c4ddcd"), (1.0, "#b2d0bb")],
    stars=0,
    planet=dict(lit="#f7e3b0", dark="#94b5a3", bands=["#cdb27a", "#e0c995", "#b3b98a", "#d3bd86"],
                halo=0.0, alpha=245),
    layers=[("#8fb8a3", "#84ae98"), ("#719f88", "#66957d"), ("#57866e", "#4c7b63"),
            ("#3f6d55", "#35614a"), ("#2a5440", "#214834")],
    fog="#cfe3d7", fog_alpha=[120, 85, 50, 20, 0],
    mist=("#dcebe1", 100),
    fireflies=None,
    shafts=46,
    grain=3,
)
P = DAYTIME if DAY else NIGHT
rng = random.Random(7)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def hexrgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def gradient(stops, height):
    """Vertical gradient column from (offset, hex) stops."""
    col = []
    stops = [(o, hexrgb(c)) for o, c in stops]
    for y in range(height):
        t = y / max(1, height - 1)
        for (o0, c0), (o1, c1) in zip(stops, stops[1:]):
            if o0 <= t <= o1:
                col.append(lerp(c0, c1, (t - o0) / max(1e-6, o1 - o0)))
                break
        else:
            col.append(stops[-1][1])
    return col


def vfill(stops):
    col = Image.new("RGB", (1, H))
    for y, c in enumerate(gradient(stops, H)):
        col.putpixel((0, y), c)
    return col.resize((W, H))


def wash(img, color, alpha):
    """Lay a flat colour over everything at `alpha` (0..255)."""
    if alpha <= 0:
        return img
    return Image.blend(img, Image.new("RGB", (W, H), hexrgb(color)), alpha / 255)


# Sky
img = vfill(P["sky"])

# Stars, fading toward the treeline
if P["stars"]:
    stars = Image.new("RGB", (W, H))
    sd = ImageDraw.Draw(stars)
    for _ in range(int(W * H / 8000)):
        x, y = rng.randrange(W), rng.randrange(int(H * 0.6))
        b = int(P["stars"] * (1 - y / (H * 0.6)) * rng.uniform(0.25, 1))
        r = rng.choice([1, 1, 1, 2])
        sd.ellipse([x - r, y - r, x + r, y + r], fill=(int(b * 0.92), b, int(b * 0.96)))
    img = ImageChops.add(img, stars)

# The gas giant: banded disc, lit from the upper left, with a soft halo.
pl = P["planet"]
cx, cy, R = 0.69 * W, 0.27 * H, 0.165 * W
if pl["halo"]:
    halo = Image.new("RGB", (W, H))
    hc = tuple(int(c * pl["halo"]) for c in hexrgb(pl["lit"]))
    ImageDraw.Draw(halo).ellipse([cx - R * 1.5, cy - R * 1.5, cx + R * 1.5, cy + R * 1.5], fill=hc)
    img = ImageChops.add(img, halo.filter(ImageFilter.GaussianBlur(W * 0.04)))

S = int(R * 2.4)
disc = Image.new("RGB", (S, S), hexrgb(pl["lit"]))
dd = ImageDraw.Draw(disc)
y = 0
br = random.Random(3)
while y < S:
    h = br.uniform(0.012, 0.05) * S
    dd.rectangle([0, y, S, y + h], fill=hexrgb(br.choice(pl["bands"])))
    y += h + br.uniform(0.004, 0.03) * S
disc = disc.filter(ImageFilter.GaussianBlur(S * 0.006)).rotate(-14, resample=Image.BICUBIC)
# Night side: a shadow disc offset to the lower right, softened.
shadow = Image.new("L", (S, S))
off = R * 0.42
c0 = S / 2
ImageDraw.Draw(shadow).ellipse([c0 - R + off, c0 - R + off * 0.7, c0 + R + off * 1.6, c0 + R + off * 1.4], fill=200)
shadow = shadow.filter(ImageFilter.GaussianBlur(R * 0.22))
disc = Image.composite(Image.new("RGB", (S, S), hexrgb(pl["dark"])), disc, shadow)
mask = Image.new("L", (S, S))
ImageDraw.Draw(mask).ellipse([c0 - R, c0 - R, c0 + R, c0 + R], fill=pl["alpha"])
mask = mask.filter(ImageFilter.GaussianBlur(R * 0.012))
img.paste(disc, (int(cx - S / 2), int(cy - S / 2)), mask)


def conifer(d, x, top, w, ground, color, r):
    """A tall tree: straight trunk under a narrow spire of drooping tiers."""
    d.rectangle([x - w * 0.09, top + w * 0.6, x + w * 0.09, ground], fill=color)
    tiers = r.randint(9, 15)
    for i in range(tiers):
        t = i / tiers
        ty = top + t * w * 6
        half = w * (0.12 + 0.55 * t) * r.uniform(0.85, 1.1)
        drop = w * 0.5
        d.polygon([(x, ty), (x + half, ty + drop), (x - half, ty + drop)], fill=color)


def giant(d, x, w, ground, color, shade, r):
    """A near trunk too tall to fit: flared base, bark grooves, a shaded side."""
    lean = r.uniform(-0.01, 0.01) * W
    top_w, base_w = w * 0.82, w * 1.35
    d.polygon([(x - top_w / 2 + lean, -10), (x + top_w / 2 + lean, -10),
               (x + base_w / 2, ground), (x - base_w / 2, ground)], fill=color)
    d.polygon([(x + top_w * 0.12 + lean, -10), (x + top_w / 2 + lean, -10),
               (x + base_w / 2, ground), (x + base_w * 0.12, ground)], fill=shade)
    for _ in range(r.randint(3, 6)):
        gx = r.uniform(-0.35, 0.3)
        d.line([(x + gx * top_w + lean, -10), (x + gx * base_w, ground)], fill=shade, width=max(1, int(w * 0.03)))
    # Buttress roots
    for side in (-1, 1):
        d.polygon([(x + side * base_w * 0.45, ground - w * 0.9), (x + side * base_w * 0.95, ground),
                   (x + side * base_w * 0.3, ground)], fill=color if side < 0 else shade)


def spray(d, x, y, w, side, color, r):
    """A drooping fan of needles off one side of a trunk."""
    for k in range(r.randint(5, 8)):
        ox = side * w * (0.4 + k * 0.32)
        oy = y + w * 0.08 * k * k * 0.25
        rx, ry = w * r.uniform(0.5, 0.8), w * r.uniform(0.18, 0.3)
        d.ellipse([x + ox - rx, oy - ry, x + ox + rx, oy + ry], fill=color)


def fern(d, x, ground, size, color, r):
    """A low fern: arching fronds fanned out from one root."""
    for k in range(r.randint(6, 9)):
        a = math.pi * (0.12 + 0.76 * k / 8) + r.uniform(-0.08, 0.08)
        length = size * r.uniform(0.7, 1.1)
        pts = []
        for t in range(0, 11):
            u = t / 10
            px = x + math.cos(a) * length * u * (1 + 0.25 * u)
            py = ground - math.sin(a) * length * u + size * 0.55 * u * u
            pts.append((px, py))
        d.line(pts, fill=color, width=max(2, int(size * 0.05)))
        for t in range(2, 10):
            px, py = pts[t]
            leaf = size * 0.13 * (1 - t / 12)
            d.ellipse([px - leaf, py - leaf * 0.45, px + leaf, py + leaf * 0.45], fill=color)


# Forest, far to near; fog settles over everything behind each layer. Near
# trunks have set places: clear of the middle, where the terminals sit, and
# mostly clear of the planet.
rnd = random.Random(21)
layers = [
    dict(kind="conifer", xs=[(k + rnd.uniform(0.1, 0.9)) / 40 for k in range(40)], w=(0.014, 0.022), top=(0.36, 0.52), ground=0.84),
    dict(kind="conifer", xs=[(k + rnd.uniform(0.1, 0.9)) / 24 for k in range(24)], w=(0.02, 0.032), top=(0.26, 0.44), ground=0.87),
    dict(kind="trunk", xs=[0.04, 0.16, 0.27, 0.41, 0.55, 0.83, 0.95], w=(0.011, 0.016), ground=0.9),
    dict(kind="trunk", xs=[0.09, 0.62, 0.89], w=(0.024, 0.032), ground=0.95),
    dict(kind="trunk", xs=[0.015, 0.975], w=(0.06, 0.075), ground=1.02),
]
for i, (spec, (col, shade)) in enumerate(zip(layers, P["layers"])):
    r = random.Random(100 + i)
    # Clear pixels carry the layer colour, so the blur below leaves no dark fringe.
    lay = Image.new("RGBA", (W, H), hexrgb(col) + (0,))
    d = ImageDraw.Draw(lay)
    ground = spec["ground"] * H
    fill, dark = hexrgb(col) + (255,), hexrgb(shade) + (255,)
    for fx in spec["xs"]:
        x = fx * W
        w = r.uniform(*spec["w"]) * W
        if spec["kind"] == "conifer":
            conifer(d, x, r.uniform(*spec["top"]) * H, w, ground, fill, r)
            continue
        giant(d, x, w, ground, fill, dark, r)
        if i < 4:
            for _ in range(r.randint(2, 3)):
                spray(d, x, r.uniform(0.04, 0.42) * H, w * 0.9, r.choice([-1, 1]), fill, r)
    if i >= 2:
        for _ in range(3 + 3 * (i - 2)):
            fern(d, r.uniform(0, 1) * W, min(ground, H) + 4, (0.03 + 0.025 * (i - 2)) * H, dark, r)
    if ground < H:
        d.rectangle([0, ground - 2, W, H], fill=dark)
    if i < 2:
        lay = lay.filter(ImageFilter.GaussianBlur(W * 0.0012 * (2 - i)))
    img.paste(lay, (0, 0), lay)
    img = wash(img, P["fog"], P["fog_alpha"][i] // 3)
    # A band of mist hugging this layer's ground.
    mist = Image.new("L", (W, H))
    md = ImageDraw.Draw(mist)
    band = 0.16 * H
    for yy in range(int(ground - band), min(H, int(ground + band * 0.4))):
        t = 1 - abs(yy - ground) / band
        md.line([(0, yy), (W, yy)], fill=int(max(0, t) * P["fog_alpha"][i]))
    img = Image.composite(Image.new("RGB", (W, H), hexrgb(P["fog"])), img, mist)

# Daylight: soft shafts slanting down through the canopy.
if P["shafts"]:
    sh = Image.new("L", (W, H))
    sd = ImageDraw.Draw(sh)
    r = random.Random(11)
    for _ in range(9):
        x = r.uniform(-0.1, 1.0) * W
        w = r.uniform(0.02, 0.06) * W
        sd.polygon([(x, 0), (x + w, 0), (x + w + 0.35 * W, H), (x + 0.35 * W, H)], fill=int(P["shafts"] * r.uniform(0.5, 1)))
    sh = sh.filter(ImageFilter.GaussianBlur(W * 0.02))
    img = Image.composite(Image.new("RGB", (W, H), (255, 252, 240)), img, sh)

# Ground mist over the forest floor
gm = Image.new("L", (W, H))
gd = ImageDraw.Draw(gm)
mcol, malpha = P["mist"]
for yy in range(int(0.78 * H), H):
    t = (yy - 0.78 * H) / (0.22 * H)
    gd.line([(0, yy), (W, yy)], fill=int(malpha * math.sin(min(1.0, t * 1.4) * math.pi / 2) * 0.8))
img = Image.composite(Image.new("RGB", (W, H), hexrgb(mcol)), img, gm.filter(ImageFilter.GaussianBlur(H * 0.02)))

# Fireflies: small glows drifting low between the trunks.
if P["fireflies"]:
    fcol, n = P["fireflies"]
    glow = Image.new("RGB", (W, H))
    dots = Image.new("RGB", (W, H))
    g, dt = ImageDraw.Draw(glow), ImageDraw.Draw(dots)
    r = random.Random(5)
    for _ in range(n):
        x, y = r.uniform(0, W), r.uniform(0.6, 0.97) * H
        rr = W * r.uniform(0.0012, 0.0024)
        b = r.uniform(0.4, 1)
        c = tuple(int(v * b) for v in hexrgb(fcol))
        g.ellipse([x - rr * 4, y - rr * 4, x + rr * 4, y + rr * 4], fill=tuple(int(v * 0.35) for v in c))
        dt.ellipse([x - rr, y - rr, x + rr, y + rr], fill=c)
    img = ImageChops.add(img, glow.filter(ImageFilter.GaussianBlur(W * 0.004)))
    img = ImageChops.lighter(img, dots.filter(ImageFilter.GaussianBlur(W * 0.0006)))

# Film grain
noise = Image.effect_noise((W, H), P["grain"]).convert("RGB")
img = ImageChops.add(img, noise, scale=1.0, offset=-128)
img.save(OUT, quality=88, optimize=True, progressive=True)
print(OUT)
