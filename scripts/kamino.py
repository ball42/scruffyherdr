"""Render an original storm-ocean wallpaper: a city of ribbed domed pods on
tall piers standing out of a heaving sea, rain slanting through layers of low
cloud, lightning in the distance.

With --day the viewpoint changes: out on a pier walkway between the pods on
a bright overcast day, the wet deck and rail in the foreground, the nearest
pod looming on its piers and the rest receding into the rain.

Usage: python3 scripts/kamino.py [--day] OUT.jpg [WIDTH HEIGHT]
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


# ---- Day: walkway, a pier deck in the rain between the pods. Runs and exits before the night code below.
SKY = [(0.0, "#5c6e82"), (0.35, "#8c9eb0"), (0.55, "#b4c2cc"), (0.60, "#c2ccd2"), (1.0, "#c2ccd2")]
CLOUD = ("#6c7c8e", "#b0bcc8")
SEA = ("#6c8494", "#3e5a6c")
SWELL = "#2e4858"
FOAM = (232, 240, 244)
CITY = ("#e4e8ec", "#a4aeb8")
LIGHTS = (255, 240, 210)
HAZE = "#c2ccd2"


def day_hexrgb(h):
    if isinstance(h, tuple):
        return h[:3]
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def day_lerp(a, b, t):
    a, b = day_hexrgb(a), day_hexrgb(b)
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def day_layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), day_hexrgb(col) + (0,))
    return lay, ImageDraw.Draw(lay)


def day_sky(stops, horizontal=False):
    """Vertical gradient from (pos, colour) stops, pos as a frame fraction."""
    img = Image.new("RGBA", (W, H))
    st = [(p, day_hexrgb(c)) for p, c in stops]
    d = ImageDraw.Draw(img)
    n = W if horizontal else H
    for i in range(n):
        f = i / n
        col = st[-1][1]
        for (p0, c0), (p1, c1) in zip(st, st[1:]):
            if p0 <= f <= p1:
                col = day_lerp(c0, c1, (f - p0) / max(p1 - p0, 1e-6))
                break
        if f < st[0][0]:
            col = st[0][1]
        if horizontal:
            d.line([(i, 0), (i, H)], fill=col + (255,))
        else:
            d.line([(0, i), (W, i)], fill=col + (255,))
    return img


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
    lay = Image.new("RGBA", (W, H), day_hexrgb(col) + (0,))
    lay.putalpha(m)
    img.alpha_composite(lay)


def poly_mask(pts, blur=0):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    return m


def blur(im, r):
    """Gaussian blur on premultiplied alpha, so transparent pixels don't bleed a dark fringe."""
    if im.mode != "RGBA":
        return im.filter(ImageFilter.GaussianBlur(r))
    return im.convert("RGBa").filter(ImageFilter.GaussianBlur(r)).convert("RGBA")


def day_pod(d, cx, top, r, lit, shade, legs_to, rr):
    lit, shade = day_hexrgb(lit), day_hexrgb(shade)
    for lx in (-0.62, -0.2, 0.2, 0.62):
        x = cx + lx * r
        d.rectangle([x - r * 0.025, top + r * 0.42, x + r * 0.025, legs_to], fill=day_lerp(shade, (0, 0, 0), 0.15) + (255,))
    d.chord([cx - r, top - r * 0.55, cx + r, top + r * 0.55], 180, 360, fill=lit + (255,))
    d.chord([cx - r, top - r * 0.55, cx + r, top + r * 0.55], 180, 270, fill=day_lerp(lit, shade, 0.45) + (255,))
    for k in range(1, 16):  # ribs follow the dome's curve, meridians seen from the side
        u = -1 + k / 8
        pts = []
        for j in range(21):
            v = j / 20 * math.pi / 2
            pts.append((cx + u * r * math.cos(v), top - r * 0.55 * math.sin(v)))
        d.line(pts, fill=day_lerp(lit, shade, 0.30) + (90,), width=max(1, int(r / 160)))
    d.rectangle([cx - r, top, cx + r, top + r * 0.30], fill=shade + (255,))
    d.polygon([(cx - r, top + r * 0.30), (cx + r, top + r * 0.30), (cx + r * 0.8, top + r * 0.44), (cx - r * 0.8, top + r * 0.44)], fill=day_lerp(shade, (0, 0, 0), 0.2) + (255,))
    n = max(3, int(r / (14 * S)))
    for k in range(n):
        x = cx - r * 0.9 + k * r * 1.8 / n
        d.rectangle([x, top + r * 0.10, x + r * 1.8 / n * 0.55, top + r * 0.19], fill=LIGHTS + (int(rr.uniform(80, 200) * 0.45),))


def day_clouds(img, y0, y1, n, size, alpha, rr):
    lay, d = day_layer(CLOUD[0])
    for _ in range(n):
        x, y = rr.uniform(-0.1, 1.1) * W, rr.uniform(y0, y1) * H
        w = rr.uniform(0.6, 1.4) * size * S
        d.ellipse([x - w, y - w * 0.25, x + w, y + w * 0.25], fill=day_hexrgb(rr.choice(CLOUD)) + (alpha,))
    img.alpha_composite(blur(lay, size * 0.3 * S))


def day_swells(img, hz, rr, near=1.0):
    lay = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(lay)
    for y in range(int(hz), H):
        t = max(0.0, (y - hz) / (H - hz))
        d.line([(0, y), (W, y)], fill=day_lerp(SEA[0], SEA[1], t ** 0.8) + (255,))
    img.paste(lay, (0, 0), poly_mask([(0, hz), (W, hz), (W, H), (0, H)]))
    lay, d = day_layer()
    rows = 34
    for i in range(rows):
        f = (i / rows) ** 1.9
        y = hz + (H - hz) * f
        amp = (2 + 26 * f) * S * near
        wl = (40 + 420 * f) * S
        ph = rr.uniform(0, 6)
        pts = [(x, y - amp * abs(math.sin(x / wl + ph))) for x in range(0, W + 8, 8)]
        d.polygon(pts + [(W, y + amp * 1.5), (0, y + amp * 1.5)], fill=day_hexrgb(SWELL) + (int(40 + 70 * f),))
        d.line(pts, fill=FOAM + (int(40 + 120 * f),), width=max(1, int((1 + 3 * f) * S)))
    img.alpha_composite(blur(lay, 1.5 * S))


def day_rain(img, n, length, alpha, rr, angle=0.25, width=2):
    lay, d = day_layer((235, 242, 248))
    for _ in range(n):
        x, y = rr.uniform(-0.2, 1.1) * W, rr.uniform(-0.1, 1.0) * H
        L = length * rr.uniform(0.6, 1.3) * S
        d.line([(x, y), (x + L * angle, y + L)], fill=(235, 242, 248, alpha), width=max(1, int(width * S)))
    img.alpha_composite(blur(lay, 0.8 * S))


def day():
    hz = H * 0.56
    img = day_sky(SKY[:3] + [(0.56, "#c2ccd2"), (1.0, "#c2ccd2")])
    rr = random.Random(6)
    day_clouds(img, 0.0, 0.30, 40, 420, 110, rr)
    day_clouds(img, 0.25, 0.48, 30, 300, 80, rr)
    day_swells(img, hz, rr)
    # pods receding left along the line of the walkway
    lay, d = day_layer()
    for k, (x, r, fade) in enumerate(((0.06, 40, 0.65), (0.16, 60, 0.55), (0.29, 90, 0.45), (0.46, 140, 0.32))):
        lit, shade = day_lerp(CITY[0], HAZE, fade), day_lerp(CITY[1], HAZE, fade)
        day_pod(d, W * x, hz - r * S * 1.3, r * S, lit, shade, hz + 10 * S, rr)
    img.alpha_composite(lay)
    vfade(img, HAZE, hz - H * 0.15, hz + H * 0.02, 0, 60)
    # the nearest pod, big on the right, its piers plunging past the deck
    lay, d = day_layer()
    day_pod(d, W * 0.84, H * 0.20, 620 * S, CITY[0], CITY[1], H * 1.0, rr)
    img.alpha_composite(lay)
    # the walkway: a deck running from us toward the near pod's underside; wet, reflective
    deck_y = H * 0.82
    lay, d = day_layer()
    d.polygon([(0, deck_y), (W, deck_y - 60 * S), (W, H), (0, H)], fill=(150, 162, 174, 255))
    img.alpha_composite(lay)
    # reflections of sky and pod in the wet deck
    refl = img.crop((0, int(deck_y - (H - deck_y) * 1.2), W, int(deck_y))).transpose(Image.FLIP_TOP_BOTTOM)
    refl = blur(refl.resize((W, int(H - deck_y + 60 * S))), 8 * S)
    rl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rl.paste(refl, (0, int(deck_y - 60 * S)))
    m = poly_mask([(0, deck_y), (W, deck_y - 60 * S), (W, H), (0, H)])
    rl.putalpha(m.point(lambda v: int(v * 0.45)))
    img.alpha_composite(rl)
    lay, d = day_layer()
    for k in range(30):  # deck plating seams
        x = -W * 0.2 + k * W * 0.05
        d.line([(x + W * 0.3, deck_y - 30 * S), (x * 1.6, H)], fill=(110, 124, 138, 90), width=int(3 * S))
    for _ in range(90):  # puddle ripples
        x, y = rr.uniform(0, W), rr.uniform(deck_y + 20 * S, H)
        w = rr.uniform(10, 40) * S * (y / H)
        d.ellipse([x - w, y - w * 0.25, x + w, y + w * 0.25], outline=(220, 228, 236, 90), width=max(1, int(2 * S)))
    img.alpha_composite(blur(lay, 1 * S))
    # the rail: posts and two bars along the near edge
    lay, d = day_layer()
    y0, y1 = deck_y - 230 * S, deck_y - 60 * S - 230 * S
    for k in range(9):
        t = k / 8
        x = t * W
        yb = deck_y - 60 * S * t
        yt = yb - 230 * S
        d.rectangle([x - 8 * S, yt, x + 8 * S, yb], fill=(96, 110, 124, 255))
    d.line([(0, y0), (W, y1)], fill=(214, 222, 230, 255), width=int(14 * S))
    d.line([(0, y0 + 110 * S), (W, y1 + 110 * S)], fill=(110, 124, 138, 255), width=int(8 * S))
    for k in range(40):  # drips hanging from the top bar
        t = rr.random()
        x = t * W
        y = y0 + (y1 - y0) * t + 8 * S
        d.ellipse([x - 3 * S, y, x + 3 * S, y + 8 * S], fill=(236, 242, 248, 200))
    img.alpha_composite(lay)
    day_rain(img, 1100, 70, 60, rr)
    day_rain(img, 200, 160, 80, rr, width=3)
    return img


def day_grain(img, k=3):
    """A light film grain, blended over the finished day picture."""
    n = Image.effect_noise((W, H), 40).convert("L").point(lambda v: 128 + (v - 128) * k / 20)
    rgb = img.convert("RGB")
    out = Image.merge("RGB", [Image.blend(c, n, 0.06) for c in rgb.split()])
    return Image.blend(rgb, out, 0.5)


if DAY:
    day_grain(day()).save(OUT, quality=90)
    print(OUT)
    sys.exit(0)


# ---- Night.
# Each palette: sky stops, cloud (dark, light), the sea (horizon, near), swell
# shade, foam, the city (lit, shaded), window lights, the rain, lightning, grain.
NIGHT = dict(
    sky=[(0.0, "#060c14"), (0.35, "#122030"), (0.55, "#1f3244"), (0.60, "#2a3e50"), (1.0, "#2a3e50")],
    cloud=("#0c1622", "#2a3c50"),
    sea=("#1c2e3e", "#08121c"),
    swell="#050c14",
    foam=(150, 180, 200),
    city=("#5a6a7c", "#2c3644"),
    lights=(255, 206, 140),
    rain=(190, 210, 230, 46),
    bolt=True,
    grain=5,
)
P = NIGHT
rng = random.Random(77)
HZ = 0.60


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), tuple(col) + (0,))
    return lay, ImageDraw.Draw(lay)


def sky():
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    st = [(p, hexrgb(c)) for p, c in P["sky"]]
    for y in range(H):
        f = y / H
        for (p0, c0), (p1, c1) in zip(st, st[1:]):
            if p0 <= f <= p1:
                d.line([(0, y), (W, y)], fill=lerp(c0, c1, (f - p0) / max(p1 - p0, 1e-6)) + (255,))
                break
    return img


def clouds(img, y0, y1, n, size, alpha, blur):
    """A band of storm cloud: dark undersides, lighter tops, smeared by wind."""
    dark, light = hexrgb(P["cloud"][0]), hexrgb(P["cloud"][1])
    lay, d = layer(dark)
    for _ in range(n):
        x = rng.uniform(-0.1, 1.1) * W
        y = rng.uniform(y0, y1) * H
        r = rng.uniform(0.6, 1.4) * size * S
        t = (y / H - y0) / max(1e-6, y1 - y0)
        c = lerp(light, dark, 0.3 + 0.7 * t * rng.uniform(0.6, 1))
        d.ellipse([x - r * 1.8, y - r * 0.5, x + r * 1.8, y + r * 0.5], fill=c + (alpha,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(blur * S)))


def bolt(img):
    lay, d = layer((220, 235, 255))
    x, y = W * 0.18, H * 0.16
    pts = [(x, y)]
    while y < H * HZ - 4 * S:
        x += rng.uniform(-40, 30) * S
        y += rng.uniform(26, 60) * S
        pts.append((x, min(y, H * HZ)))
        if rng.random() < 0.25:  # a fork
            fx, fy = x, y
            fork = [(fx, fy)]
            for _ in range(3):
                fx += rng.uniform(10, 50) * S * rng.choice([-1, 1])
                fy += rng.uniform(20, 40) * S
                fork.append((fx, fy))
            d.line(fork, fill=(220, 235, 255, 150), width=int(2 * S))
    d.line(pts, fill=(235, 244, 255, 255), width=int(4 * S))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.0 * S)))
    halo, hd = layer((160, 190, 255))
    hd.ellipse([W * 0.18 - 400 * S, H * 0.05, W * 0.18 + 400 * S, H * 0.35], fill=(160, 190, 255, 50))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(120 * S)))


def sea(img):
    lay, d = layer()
    top, near = hexrgb(P["sea"][0]), hexrgb(P["sea"][1])
    for y in range(int(H * HZ), H):
        t = max(0.0, (y - H * HZ) / (H * (1 - HZ)))
        d.line([(0, y), (W, y)], fill=lerp(top, near, t ** 0.7) + (255,))
    img.alpha_composite(lay)
    lay, d = layer()
    d.rectangle([0, H * HZ - 4 * S, W, H * HZ + 10 * S], fill=hexrgb(P["sky"][-1][1]) + (170,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(6 * S)))


def swells(img):
    """Rows of swells, taller nearer the viewer: a lit face under each crest, a dark trough behind, foam on the peaks."""
    shade = hexrgb(P["swell"])
    face = lerp(hexrgb(P["sea"][0]), (255, 255, 255), 0.08)
    foam = P["foam"]
    rows = 26
    for r in range(rows):
        f = r / (rows - 1)
        y = H * (HZ + 0.01 + (1 - HZ - 0.01) * f ** 1.7)
        amp = (4 + 70 * f ** 1.4) * S
        wl = (140 + 900 * f) * S
        ph = rng.uniform(0, 6)
        crest = []
        for x in range(0, W + 6, 6):
            crest.append((x, y - amp * (0.5 + 0.5 * math.sin(x / wl * 6.28 + ph + math.sin(x / wl * 2.1) * 0.8)) ** 2.0))
        lay, d = layer(shade)
        # the face: from the crest down, lit at the top fading to trough shade
        depth = amp * 2.4 + 6 * S
        for k in range(8):
            t = k / 7
            band = [(x, cy + depth * t) for x, cy in crest]
            col = lerp(face, shade, t)
            d.line(band, fill=col + (int(200 * (0.35 + 0.65 * f)),), width=max(2, int(depth / 7 + 2)))
        peaks = [(x, cy) for x, cy in crest if (y - cy) / max(1, amp) > 0.72]
        for x, cy in peaks:
            if rng.random() < 0.8:
                d.line([(x - 3 * S, cy), (x + 3 * S, cy - 0.5 * S)], fill=foam + (int(80 + 150 * f),), width=max(1, int((1 + 5 * f) * S)))
        img.alpha_composite(lay.filter(ImageFilter.GaussianBlur((0.8 + 2.5 * f) * S)))
    # a little spray off the nearest crests
    lay, d = layer(foam)
    for _ in range(140):
        x = rng.random() * W
        y = H * rng.uniform(0.86, 0.97)
        r = rng.uniform(1.5, 4) * S
        d.ellipse([x - r, y - r, x + r, y + r], fill=foam + (int(rng.uniform(30, 90)),))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(2 * S)))


def pod(d, cx, top, r, lit, shade, li, legs_to):
    """A domed pod: a ribbed cap, a band of windows, a skirt, and piers into the sea."""
    for lx in (-0.62, -0.2, 0.2, 0.62):
        x = cx + lx * r
        d.rectangle([x - 6 * S, top + r * 0.42, x + 6 * S, legs_to], fill=lerp(shade, (0, 0, 0), 0.15) + (255,))
    d.chord([cx - r, top - r * 0.55, cx + r, top + r * 0.55], 180, 360, fill=lit + (255,))
    d.chord([cx - r, top - r * 0.55, cx + r, top + r * 0.55], 180, 270, fill=lerp(lit, shade, 0.45) + (255,))
    for k in range(1, 8):  # ribs
        a = math.pi + k * math.pi / 8
        d.line([(cx, top - r * 0.55), (cx + math.cos(a) * r, top + math.sin(a) * r * 0.55 + r * 0.55 * 0.0)], fill=lerp(lit, shade, 0.35) + (120,), width=max(1, int(2 * S)))
    d.rectangle([cx - r, top, cx + r, top + r * 0.30], fill=shade + (255,))
    d.polygon([(cx - r, top + r * 0.30), (cx + r, top + r * 0.30), (cx + r * 0.8, top + r * 0.44), (cx - r * 0.8, top + r * 0.44)], fill=lerp(shade, (0, 0, 0), 0.2) + (255,))
    n = int(r / (14 * S))
    for k in range(n):
        x = cx - r * 0.9 + k * r * 1.8 / n
        a = int(rng.uniform(80, 240))
        d.rectangle([x, top + r * 0.10, x + 8 * S, top + r * 0.19], fill=li + (a,))


def city(img):
    lit, shade = hexrgb(P["city"][0]), hexrgb(P["city"][1])
    haze = hexrgb(P["sky"][-1][1])
    li = P["lights"]
    # far pods first, hazier; near pods bigger
    specs = [(0.36, 70, 0.55), (0.44, 90, 0.5), (0.52, 80, 0.5), (0.95, 70, 0.55),
             (0.60, 130, 0.25), (0.72, 170, 0.15), (0.86, 140, 0.2), (0.80, 210, 0.0)]
    for cx, r, fade in specs:
        lay, d = layer(lit)
        rr = r * S
        top = H * HZ - rr * 0.95 - (rr * 0.6)
        pod(d, W * cx, top, rr, lerp(lit, haze, fade), lerp(shade, haze, fade), li, H * HZ + 6 * S)
        img.alpha_composite(lay)
    # a landing platform on a slender mast, beacon on top
    lay, d = layer(lit)
    mx, mtop = W * 0.665, H * 0.30
    d.rectangle([mx - 7 * S, mtop, mx + 7 * S, H * HZ + 4 * S], fill=shade + (255,))
    d.ellipse([mx - 120 * S, mtop - 12 * S, mx + 120 * S, mtop + 12 * S], fill=lit + (255,))
    d.rectangle([mx - 120 * S, mtop, mx + 120 * S, mtop + 6 * S], fill=shade + (255,))
    img.alpha_composite(lay)
    from_glow = (255, 190, 120)
    for gx in (-100, 100):
        g, gd = layer(from_glow)
        x = mx + gx * S
        gd.ellipse([x - 30 * S, mtop - 30 * S, x + 30 * S, mtop + 30 * S], fill=from_glow + (120,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(14 * S)))
        g, gd = layer(from_glow)
        gd.ellipse([x - 5 * S, mtop - 5 * S, x + 5 * S, mtop + 5 * S], fill=from_glow + (255,))
        img.alpha_composite(g)
    # the city's lights on the water
    lay, d = layer(li)
    for _ in range(140):
        x = W * rng.uniform(0.55, 0.98)
        y = H * rng.uniform(HZ + 0.01, HZ + 0.12)
        d.line([(x, y), (x + rng.uniform(10, 40) * S, y)], fill=li + (int(rng.uniform(20, 70)),), width=max(1, int(2 * S)))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1 * S)))


def rain(img, n, length, alpha_scale, blur):
    c = P["rain"]
    lay, d = layer(c[:3])
    for _ in range(n):
        x, y = rng.uniform(-0.1, 1.2) * W, rng.random() * H
        L = rng.uniform(*length) * S
        d.line([(x, y), (x - L * 0.32, y + L)], fill=c[:3] + (int(c[3] * alpha_scale * rng.uniform(0.6, 1.2)),), width=max(1, int(1.4 * S)))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(blur * S)) if blur else lay)


img = sky()
clouds(img, 0.0, 0.25, 50, 260, 160, 60)
if P["bolt"]:
    bolt(img)
clouds(img, 0.18, 0.45, 60, 200, 120, 40)
rain(img, 900, (60, 120), 0.6, 2)  # far rain, soft
sea(img)
city(img)
clouds(img, 0.40, 0.56, 30, 160, 90, 50)  # low scud drifting past the pods
swells(img)
rain(img, 1100, (40, 90), 1.0, 0)  # near rain, crisp
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
