"""Render an original twin-suns desert wallpaper. The night picture is a
starry dusk over layered mesas and dunes that fade into dust haze, with two low
suns and a galaxy band. With --day it is a bright morning looking down a dry
canyon wash: banded rock walls either side, rippled sand running to the viewer
and pale dunes under high twin suns at the far mouth, for light mode.

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
S = W / 3024  # scale for sizes drawn in 3024-wide pixels

# ---- Day: down a dry canyon wash toward the dunes. Runs and exits before the night code below.
DAY_SKY = [(0.0, "#7f93d6"), (0.30, "#a5a6e0"), (0.45, "#d0acd2"), (0.52, "#eab1a4"), (0.56, "#eda77c"), (1.0, "#e89e70")]
DAY_HAZE = "#e2b9b4"
DAY_LAYERS = [("#b98fb4", "#b087ab"), ("#d0927a", "#c4846e"), ("#b4747a", "#a6686e"),
              ("#b06e58", "#9f604c"), ("#8e5650", "#7e4a45"), ("#6c403f", "#5e3636")]
DAY_SUNS = [(255, 246, 228), (255, 241, 218)]
drng = random.Random(41)


def rgb_of(h):
    if isinstance(h, tuple):
        return h[:3]
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    a, b = rgb_of(a), rgb_of(b)
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def new_layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), rgb_of(col) + (0,))
    return lay, ImageDraw.Draw(lay)


def sky_gradient(stops, horizontal=False):
    """Vertical gradient from (pos, colour) stops, pos as a frame fraction."""
    img = Image.new("RGBA", (W, H))
    st = [(p, rgb_of(c)) for p, c in stops]
    d = ImageDraw.Draw(img)
    n = W if horizontal else H
    for i in range(n):
        f = i / n
        col = st[-1][1]
        for (p0, c0), (p1, c1) in zip(st, st[1:]):
            if p0 <= f <= p1:
                col = mix(c0, c1, (f - p0) / max(p1 - p0, 1e-6))
                break
        if f < st[0][0]:
            col = st[0][1]
        if horizontal:
            d.line([(i, 0), (i, H)], fill=col + (255,))
        else:
            d.line([(0, i), (W, i)], fill=col + (255,))
    return img


def grad_fill(img, mask, top, bottom, y0, y1, ease=1.0):
    """Paste a vertical gradient through mask (L image)."""
    g = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(g)
    top, bottom = rgb_of(top), rgb_of(bottom)
    for y in range(H):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0))) ** ease
        d.line([(0, y), (W, y)], fill=mix(top, bottom, t) + (255,))
    img.paste(g, (0, 0), mask)


def poly_mask(pts, blur=0):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    return m


def soft_glow(img, x, y, r, c, a):
    c = rgb_of(c)
    for rr, aa, blur in ((r * 7, a // 6, 0.6), (r * 2.6, a // 2, 0.5), (r, a, 0.1)):
        g = Image.new("RGBA", (W, H), c + (0,))
        ImageDraw.Draw(g).ellipse([x - rr, y - rr, x + rr, y + rr], fill=c + (aa,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(max(1, rr * blur))))


def wash(img, col, alpha, mask=None):
    """Flat colour veil over the frame (or through a mask)."""
    lay = Image.new("RGBA", (W, H), rgb_of(col) + (alpha,))
    if mask is not None:
        a = Image.new("L", (W, H), 0)
        a.paste(alpha, (0, 0), mask)
        lay.putalpha(a)
    img.alpha_composite(lay)


def vfade(img, col, y0, y1, a0, a1):
    """A haze band whose alpha runs a0 -> a1 from y0 to y1 (frame px)."""
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    for y in range(H):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        if y < y0:
            t = 0
        a = a0 + (a1 - a0) * t if y0 <= y <= y1 else (a0 if y < y0 else a1)
        d.line([(0, y), (W, y)], fill=int(a))
    lay = Image.new("RGBA", (W, H), rgb_of(col) + (0,))
    lay.putalpha(m)
    img.alpha_composite(lay)


def noise_line(x0, x1, base, amps, drng, step=6):
    """A wavy horizon line: list of (x, y). amps: [(amp, freq)]."""
    ph = [drng.uniform(0, 6.28) for _ in amps]
    pts = []
    for x in range(int(x0), int(x1) + step, step):
        u = x / W
        y = base + sum(a * math.sin(u * f + p) for (a, f), p in zip(amps, ph))
        pts.append((x, y))
    return pts


def blur(im, r):
    """Gaussian blur on premultiplied alpha, so transparent pixels don't bleed a dark fringe."""
    if im.mode != "RGBA":
        return im.filter(ImageFilter.GaussianBlur(r))
    return im.convert("RGBa").filter(ImageFilter.GaussianBlur(r)).convert("RGBA")


def suns(img, x, y):
    soft_glow(img, x * W, y * H, 0.024 * W, DAY_SUNS[0], 230)
    soft_glow(img, (x + 0.055) * W, (y + 0.035) * H, 0.015 * W, DAY_SUNS[1], 220)


def mesa(d, cx, base, w, h, col, drng):
    top = base - h
    slope = w * 0.12
    pts = [(cx - w / 2 - slope, base)]
    x = cx - w / 2
    pts.append((x, top + h * 0.15))
    while x < cx + w / 2:
        x += drng.uniform(8, 30) * S
        pts.append((min(x, cx + w / 2), top + drng.uniform(-3, 3) * S))
    pts += [(cx + w / 2, top + h * 0.15), (cx + w / 2 + slope, base)]
    d.polygon(pts, fill=col + (255,))


def dune_band(img, base, amp, top, bot, crest_a, freq=(3.0, 7.0), haze_k=0.0, shade=0):
    pts = noise_line(0, W, base, [(amp, freq[0]), (amp * 0.4, freq[1]), (amp * 0.12, 23)], drng)
    m = poly_mask([(0, H)] + pts + [(W, H)], blur=1.5 * S)
    t, b = mix(top, DAY_HAZE, haze_k), mix(bot, DAY_HAZE, haze_k)
    grad_fill(img, m, t, b, min(p[1] for p in pts), H * 0.95)
    if shade:
        lay, d = new_layer((90, 50, 60))
        for k in range(6):
            dy = shade * (k + 1) / 6
            d.polygon(pts + [(x, y + dy) for x, y in reversed(pts)], fill=(110, 60, 70, int(26)))
        img.alpha_composite(blur(lay, shade * 0.35))
    if crest_a:
        lay, d = new_layer((255, 236, 214))
        d.line(pts, fill=(255, 236, 214, crest_a), width=int(4 * S))
        img.alpha_composite(blur(lay, 3 * S))
    return pts


def ripples(img, y0, y1, col, alpha, n, persp=True):
    lay, d = new_layer(col)
    for i in range(n):
        f = (i / n) ** (2.0 if persp else 1.0)
        y = y0 + (y1 - y0) * f
        amp = (2 + 18 * f) * S
        ph = drng.uniform(0, 6)
        pts = [(x, y + amp * math.sin(x / (90 + 400 * f) / S + ph)) for x in range(0, W + 10, 10)]
        d.line(pts, fill=rgb_of(col) + (int(alpha * (0.3 + 0.7 * f)),), width=max(1, int((1 + 4 * f) * S)))
    img.alpha_composite(blur(lay, 1.2 * S))


def rock(d, x, y, r, base, lit, drng, shadow=(100, 56, 48, 90)):
    n = drng.randint(6, 9)
    pts = []
    for i in range(n):
        a = math.pi + math.pi * i / (n - 1)
        rr = r * drng.uniform(0.7, 1.1)
        pts.append((x + math.cos(a) * rr * 1.2, y + math.sin(a) * rr * 0.9))
    d.ellipse([x - r * 0.4, y - r * 0.15, x + r * 2.6, y + r * 0.4], fill=shadow)
    d.polygon(pts + [(x + r * 1.2, y + r * 0.15), (x - r * 1.2, y + r * 0.15)], fill=rgb_of(base) + (255,))
    top = [p for p in pts if p[1] < y - r * 0.35] or pts[2:5]
    d.polygon(top + [(x + r * 0.2, y - r * 0.3), (x - r * 0.5, y - r * 0.25)], fill=rgb_of(lit) + (220,))


def strata(img, mask, y0, y1, cols, drng, slope=0.0, alpha=70):
    lay, d = new_layer()
    y = y0
    while y < y1:
        h = drng.uniform(14, 60) * S
        c = rgb_of(drng.choice(cols))
        pts = [(0, y), (W, y + slope * W), (W, y + slope * W + h), (0, y + h)]
        d.polygon(pts, fill=c + (drng.randint(alpha // 2, alpha),))
        y += h
    a = Image.new("L", (W, H), 0)
    a.paste(lay.getchannel("A"), (0, 0), mask)
    lay.putalpha(a)
    img.alpha_composite(blur(lay, 1.5 * S))


def day():
    img = sky_gradient(DAY_SKY[:3] + [(0.55, "#eab1a4"), (1.0, "#eda77c")])
    suns(img, 0.42, 0.13)
    # through the canyon mouth: bright dunes far off
    lay, d = new_layer()
    mesa(d, W * 0.52, H * 0.53, 260 * S, 70 * S, mix(DAY_LAYERS[0][0], DAY_HAZE, 0.4), drng)
    img.alpha_composite(blur(lay, 2 * S))
    for base, amp, li, hk in ((0.53, 8, 0, 0.5), (0.56, 12, 1, 0.35), (0.60, 16, 1, 0.2)):
        dune_band(img, H * base, amp * S, DAY_LAYERS[li][0], DAY_LAYERS[li][1], 80, freq=(5, 12), haze_k=hk)
    vfade(img, DAY_HAZE, H * 0.46, H * 0.56, 0, 60)
    # the wash floor: pale sand, rippled, running to us
    floor = noise_line(0, W, H * 0.62, [(6 * S, 3), (3 * S, 11)], drng)
    m = poly_mask([(0, H)] + floor + [(W, H)])
    grad_fill(img, m, "#e8b48e", "#d09070", H * 0.62, H)
    ripples(img, H * 0.63, H * 1.0, "#fbe0c4", 70, 34)
    ripples(img, H * 0.64, H * 1.0, "#a86a52", 40, 30)

    # canyon walls, banded; left wall in sun, right wall in shade
    def jag(xs, r):
        out = []
        for (x0, y0), (x1, y1) in zip(xs, xs[1:]):
            for k in range(8):
                t = k / 8
                j = r.uniform(-14, 14) * S if 0 < k else 0
                step = (r.uniform(0, 1) < 0.25) * r.uniform(10, 30) * S
                out.append((W * (x0 + (x1 - x0) * t) + j + step, H * (y0 + (y1 - y0) * t)))
        out.append((W * xs[-1][0], H * xs[-1][1]))
        return out

    def wall(side):
        rngw = random.Random(7 if side < 0 else 8)
        if side < 0:
            xs = [(0.0, -0.02), (0.20, 0.0), (0.27, 0.10), (0.29, 0.28), (0.34, 0.36), (0.36, 0.52), (0.40, 0.60),
                  (0.43, 0.64), (0.30, 0.82), (0.16, 1.02)]
            poly = [(0, 0)] + jag(xs, rngw) + [(0, H)]
        else:
            xs = [(1.0, -0.02), (0.84, 0.0), (0.78, 0.14), (0.76, 0.30), (0.70, 0.40), (0.68, 0.55), (0.62, 0.62),
                  (0.585, 0.645), (0.70, 0.84), (0.86, 1.02)]
            poly = [(W, 0)] + jag(xs, rngw) + [(W, H)]
        return poly
    for side, top, bot, cols, lit in ((-1, "#d4906e", "#a8644e", ["#e0a682", "#b8745a", "#c8866a", "#eab894"], True),
                                       (1, "#9e6464", "#7c4c4e", ["#a86e68", "#8a5656", "#b47a6e", "#946060"], False)):
        poly = wall(side)
        m = poly_mask(poly, blur=1 * S)
        grad_fill(img, m, top, bot, 0, H)
        strata(img, m, 0, H, cols, random.Random(3 if lit else 4), slope=0.03 * side * -1, alpha=80)
        # reflected light glows up from the sand onto the wall bases
        lay = Image.new("RGBA", (W, H), (255, 200, 160, 0))
        g = Image.new("L", (W, H), 0)
        gd = ImageDraw.Draw(g)
        for y in range(int(H * 0.5), H):
            gd.line([(0, y), (W, y)], fill=int(60 * (y - H * 0.5) / (H * 0.5)))
        a = Image.new("L", (W, H), 0)
        a.paste(g, (0, 0), m)
        lay.putalpha(a)
        img.alpha_composite(lay)
        # sunlit lip along the inner edge of the left wall
        if lit:
            lay, d = new_layer()
            d.line(poly[1:-1], fill=(255, 230, 200, 120), width=int(6 * S))
            img.alpha_composite(blur(lay, 3 * S))
    # a band of shade across the floor from the right wall
    sh = poly_mask([(W * 0.585, H * 0.645), (W * 0.70, H * 0.84), (W * 0.86, H), (W * 0.62, H), (W * 0.52, H * 0.80),
                    (W * 0.50, H * 0.66)], blur=30 * S)
    wash(img, "#8a5a5a", 70, sh)
    # boulders on the floor
    lay, d = new_layer()
    for x, y, r in ((0.40, 0.78, 50), (0.47, 0.70, 22), (0.62, 0.88, 70), (0.33, 0.93, 34), (0.55, 0.74, 16)):
        x, y, r = x * W, y * H, r * S
        rock(d, x, y, r, "#b47058", "#e8ae8c", drng, shadow=(130, 80, 70, 90))
    img.alpha_composite(blur(lay, 0.8 * S))
    return img


if DAY:
    final = day().convert("RGB")
    # Fine grain: a light blend of noise into the picture.
    noise = Image.effect_noise((W, H), 40).convert("L")
    noise = noise.point(lambda v: 128 + (v - 128) * 3 / 20)
    grained = Image.merge("RGB", [Image.blend(c, noise, 0.06) for c in final.split()])
    final = Image.blend(final, grained, 0.5)
    final.save(OUT, quality=90)
    print(OUT)
    sys.exit(0)

# ---- Night.
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
P = DUSK
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
