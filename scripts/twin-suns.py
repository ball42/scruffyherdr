"""Render an original twin-suns desert wallpaper: a starry dusk, or with --day
a dusty-rose morning-coloured day under high suns for light mode. Layered mesas
and dunes fade into dust haze for depth.

Original artwork, drawn in code. Needs Pillow.
Usage: python3 scripts/twin-suns.py [--day] OUT.jpg [WIDTH HEIGHT]
"""

import math
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

DAY = "--day" in sys.argv
ARGS = [a for a in sys.argv[1:] if a != "--day"]
W, H = (int(ARGS[1]), int(ARGS[2])) if len(ARGS) > 2 else (3024, 1964)
OUT = ARGS[0]

# Each palette: sky stops, stars (count per megapixel, brightness), the
# galaxy band (colour, strength), suns as (x, y, radius, colour) in frame
# fractions, glow strength, the haze far layers fade into, six layers far to
# near as (top, bottom) colours, the crest light on dunes, and grain.
DUSK = dict(
    sky=[(0.0, "#03050d"), (0.30, "#0a1128"), (0.44, "#1a1c3e"), (0.50, "#43305a"),
         (0.535, "#a4573f"), (0.56, "#e39a58"), (1.0, "#e39a58")],
    stars=(260, 255), galaxy=("#9a94cc", 0.9),
    suns=[(0.615, 0.505, 0.022, (255, 214, 140)), (0.655, 0.52, 0.014, (255, 160, 90))], glow=0.16,
    haze="#7c4452",
    layers=[("#7a4458", "#6a3a4c"), ("#9a5442", "#5e3236"), ("#6a3836", "#4a2830"),
            ("#7a3e34", "#3a2028"), ("#43262a", "#1e131c"), ("#160e16", "#08060a")],
    crest=(255, 176, 116, 90),
    grain=6,
)
# Mid-tone, so it still shows through 45% near-white terminals; dark text stays readable.
MORNING = dict(
    sky=[(0.0, "#7f93d6"), (0.30, "#a5a6e0"), (0.45, "#d0acd2"), (0.52, "#eab1a4"),
         (0.56, "#eda77c"), (1.0, "#e89e70")],
    stars=None, galaxy=None,
    suns=[(0.335, 0.19, 0.024, (255, 246, 228)), (0.39, 0.225, 0.015, (255, 241, 218))], glow=0.14,
    haze="#e2b9b4",
    layers=[("#b98fb4", "#b087ab"), ("#d0927a", "#c4846e"), ("#b4747a", "#a6686e"),
            ("#b06e58", "#9f604c"), ("#8e5650", "#7e4a45"), ("#6c403f", "#5e3636")],
    crest=(255, 232, 210, 80),
    grain=3,
)
P = MORNING if DAY else DUSK
# How much each layer, far to near, fades into the haze.
FADE = [0.62, 0.48, 0.34, 0.2, 0.08, 0.0]
rng = random.Random(42)


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


# Sky
sky = Image.new("RGB", (1, H))
for y, c in enumerate(gradient(P["sky"], H)):
    sky.putpixel((0, y), c)
img = sky.resize((W, H))

# The galaxy: a soft diagonal band, thick with faint stars.
BAND_ANGLE = math.radians(-20)


def band_dist(x, y):
    """Distance from the galaxy's centre line, as a fraction of the height."""
    cx, cy = 0.5 * W, 0.2 * H
    return abs(-(x - cx) * math.sin(BAND_ANGLE) + (y - cy) * math.cos(BAND_ANGLE)) / H


if P["galaxy"]:
    col, strength = P["galaxy"]
    band = Image.new("L", (W, H))
    bd = ImageDraw.Draw(band)
    r = random.Random(9)
    for _ in range(int(W * H / 2500)):
        x, y = r.uniform(0, W), r.uniform(0, 0.5 * H)
        d = band_dist(x, y)
        if d < 0.12 and r.random() < 1 - d / 0.12:
            rr = r.uniform(0.004, 0.02) * W
            bd.ellipse([x - rr, y - rr, x + rr, y + rr], fill=int(255 * strength * r.uniform(0.1, 0.35)))
    band = band.filter(ImageFilter.GaussianBlur(W * 0.012))
    img = Image.composite(Image.new("RGB", (W, H), hexrgb(col)), img, band)

# Stars, denser along the galaxy, fading toward the horizon; the brightest glow.
if P["stars"]:
    per_mp, peak = P["stars"]
    stars = Image.new("RGB", (W, H))
    glow = Image.new("RGB", (W, H))
    sd, gd = ImageDraw.Draw(stars), ImageDraw.Draw(glow)
    horizon = 0.53 * H
    for _ in range(int(W * H / 1e6 * per_mp * 7)):
        x, y = rng.uniform(0, W), rng.uniform(0, horizon)
        d = band_dist(x, y)
        if d > 0.1 and rng.random() < 0.55:
            continue
        fade = (1 - y / horizon) ** 0.6
        b = int(peak * fade * rng.uniform(0.3, 1) ** 1.6)
        r = rng.choice([1, 1.2, 1.4, 1.8, 2.4, 3.2]) * W / 3024
        tint = rng.choice([(1, 1, 1.05), (1, 0.95, 0.85), (0.9, 0.95, 1.1)])
        c = tuple(min(255, int(b * t)) for t in tint)
        sd.ellipse([x - r, y - r, x + r, y + r], fill=c)
        if b > peak * 0.7 and r > 1.5:
            gr = r * 5
            gd.ellipse([x - gr, y - gr, x + gr, y + gr], fill=tuple(v // 3 for v in c))
    img = ImageChops.add(img, glow.filter(ImageFilter.GaussianBlur(W * 0.0025)))
    img = ImageChops.lighter(img, stars)

# Twin suns with soft glow
glow = Image.new("RGB", (W, H))
gd = ImageDraw.Draw(glow)
for cx, cy, r, col in P["suns"]:
    x, y, rr = cx * W, cy * H, r * W
    gd.ellipse([x - rr * 7, y - rr * 7, x + rr * 7, y + rr * 7], fill=tuple(int(c * P["glow"]) for c in col))
img = ImageChops.add(img, glow.filter(ImageFilter.GaussianBlur(W * 0.05)))
for cx, cy, r, col in P["suns"]:
    x, y, rr = cx * W, cy * H, r * W
    mask = Image.new("L", (W, H))
    ImageDraw.Draw(mask).ellipse([x - rr, y - rr, x + rr, y + rr], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(W * 0.003))
    img = Image.composite(Image.new("RGB", (W, H), col), img, mask)


def ridge(base, amp, seed):
    r = random.Random(seed)
    phases = [(r.uniform(0, 6.28), r.uniform(0.6, 1.5)) for _ in range(3)]
    pts = []
    for x in range(0, W + 8, 8):
        y = base
        for i, (ph, k) in enumerate(phases):
            y += amp / (i + 1) * math.sin(x / W * math.pi * (i + 1) * k + ph)
        pts.append((x, y * H))
    return pts


def mesas(base, specs, seed):
    """A flat horizon with table-top mesas: (x, width, height) in frame fractions."""
    r = random.Random(seed)
    pts = []
    for x in range(0, W + 8, 8):
        y = base + 0.002 * math.sin(x / W * 40 + seed)
        for mx, mw, mh in specs:
            d = abs(x / W - mx)
            slope = mw * 0.18
            if d < mw - slope:
                y = min(y, base - mh + 0.002 * r.uniform(-1, 1))
            elif d < mw:
                y = min(y, base - mh * (1 - (d - (mw - slope)) / slope) ** 0.7)
        pts.append((x, y * H))
    return pts


def layer(points, top, bottom, fade, strata=False, crest=False):
    top = lerp(hexrgb(top), hexrgb(P["haze"]), fade)
    bottom = lerp(hexrgb(bottom), hexrgb(P["haze"]), fade)
    mask = Image.new("L", (W, H))
    ImageDraw.Draw(mask).polygon(points + [(W, H), (0, H)], fill=255)
    y0 = int(min(p[1] for p in points))
    fill = Image.new("RGB", (1, H))
    for y in range(H):
        t = max(0.0, (y - y0) / max(1, H - y0))
        fill.putpixel((0, y), lerp(top, bottom, min(1.0, t * 1.6)))
    fill = fill.resize((W, H))
    if strata:
        # Rock layers: faint darker bands across the mesa faces.
        sd = ImageDraw.Draw(fill)
        r = random.Random(y0)
        for k in range(14):
            yy = y0 + k * H * 0.006 + r.uniform(-2, 2)
            sd.line([(0, yy), (W, yy)], fill=lerp(top, bottom, 0.6), width=max(1, int(H * 0.0015)))
    img.paste(fill, (0, 0), mask)
    if crest:
        # Light catching the dune crests.
        cr = Image.new("RGBA", (W, H))
        ImageDraw.Draw(cr).line(points, fill=P["crest"], width=max(2, int(H * 0.003)))
        cr = cr.filter(ImageFilter.GaussianBlur(H * 0.002))
        img.paste(cr, (0, 0), cr)


def haze_band(y, height, alpha):
    """A soft band of dust hanging over a layer's base."""
    m = Image.new("L", (W, H))
    md = ImageDraw.Draw(m)
    for yy in range(int(y - height), min(H, int(y + height * 0.3))):
        t = 1 - abs(yy - y) / height
        md.line([(0, yy), (W, yy)], fill=int(max(0.0, t) * alpha))
    return Image.composite(Image.new("RGB", (W, H), hexrgb(P["haze"])), img, m)


L = P["layers"]
layer(mesas(0.53, [(0.08, 0.075, 0.07), (0.42, 0.05, 0.045), (0.86, 0.09, 0.085)], 1), *L[0], FADE[0], strata=True)
img = haze_band(0.535 * H, 0.05 * H, 110)
layer(ridge(0.585, 0.018, 1), *L[1], FADE[1], crest=True)
layer(mesas(0.625, [(0.2, 0.06, 0.05), (0.71, 0.045, 0.035)], 2), *L[2], FADE[2], strata=True)
img = haze_band(0.63 * H, 0.05 * H, 80)
layer(ridge(0.70, 0.03, 2), *L[3], FADE[3], crest=True)
layer(ridge(0.81, 0.04, 3), *L[4], FADE[4], crest=True)
layer(ridge(0.92, 0.035, 4), *L[5], FADE[5])

# Film grain
noise = Image.effect_noise((W, H), P["grain"]).convert("RGB")
img = ImageChops.add(img, noise, scale=1.0, offset=-128)
img.save(OUT, quality=88, optimize=True, progressive=True)
print(OUT)
