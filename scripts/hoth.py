"""Render an original ice-world wallpaper: an aurora night over layered ice
ridges, jagged ice cliffs far back giving way to smooth drifts in front, each
layer fading into cold haze for depth. With --day the view is from just inside
an ice cave mouth at noon: faceted, cracked blue ice walls and icicles frame a
bright snowfield and far ridges, mid-toned so it still shows through the
terminals.

Usage: python3 scripts/hoth.py [--day] OUT.jpg [WIDTH HEIGHT]
Needs Pillow.
"""
import bisect
import math
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

DAY = "--day" in sys.argv
ARGS = [a for a in sys.argv[1:] if a != "--day"]
W, H = (int(ARGS[1]), int(ARGS[2])) if len(ARGS) > 2 else (3024, 1964)
OUT = ARGS[0]
S = W / 3024  # scale for sizes drawn in 3024-wide pixels

# ---- Day: the cave mouth, ice walls and icicles over the snowfield. Runs and exits before the night code below.
DAY_SKY = [(0.0, "#5f8cc8"), (0.30, "#86a9d6"), (0.50, "#aec6e3"), (0.60, "#c3d4ea"), (1.0, "#bdd0e6")]
DAY_HAZE = "#c6d6ea"
DAY_LAYERS = [("#c4d4ea", "#a9bedc"), ("#b6c9e3", "#98b1d4"), ("#a8bfdd", "#87a3ca"),
              ("#9ab4d6", "#7896c0"), ("#8ca9cf", "#6a8ab7"), ("#7f9fca", "#5d7fae")]


def d_hex(h):
    if isinstance(h, tuple):
        return h[:3]
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def d_lerp(a, b, t):
    a, b = d_hex(a), d_hex(b)
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def d_layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), d_hex(col) + (0,))
    return lay, ImageDraw.Draw(lay)


def d_blur(im, r):
    """Gaussian blur on premultiplied alpha, so transparent pixels don't bleed a dark fringe."""
    if im.mode != "RGBA":
        return im.filter(ImageFilter.GaussianBlur(r))
    return im.convert("RGBa").filter(ImageFilter.GaussianBlur(r)).convert("RGBA")


def d_sky(stops):
    """Vertical gradient from (pos, colour) stops, pos as a frame fraction."""
    img = Image.new("RGBA", (W, H))
    st = [(p, d_hex(c)) for p, c in stops]
    d = ImageDraw.Draw(img)
    for y in range(H):
        f = y / H
        col = st[-1][1]
        for (p0, c0), (p1, c1) in zip(st, st[1:]):
            if p0 <= f <= p1:
                col = d_lerp(c0, c1, (f - p0) / max(p1 - p0, 1e-6))
                break
        d.line([(0, y), (W, y)], fill=col + (255,))
    return img


def d_grad_fill(img, mask, top, bottom, y0, y1):
    """Paste a vertical gradient through mask (L image)."""
    g = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(g)
    for y in range(H):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        d.line([(0, y), (W, y)], fill=d_lerp(top, bottom, t) + (255,))
    img.paste(g, (0, 0), mask)


def d_poly_mask(pts, blur=0):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    return m


def d_glow(img, x, y, r, c, a):
    for rr, aa, bl in ((r * 7, a // 6, 0.6), (r * 2.6, a // 2, 0.5), (r, a, 0.1)):
        g = Image.new("RGBA", (W, H), c + (0,))
        ImageDraw.Draw(g).ellipse([x - rr, y - rr, x + rr, y + rr], fill=c + (aa,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(max(1, rr * bl))))


def d_vfade(img, col, y0, y1, a0, a1):
    """A haze band whose alpha runs a0 -> a1 from y0 to y1 (frame px)."""
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    for y in range(H):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        d.line([(0, y), (W, y)], fill=int(a0 + (a1 - a0) * t))
    lay = Image.new("RGBA", (W, H), d_hex(col) + (0,))
    lay.putalpha(m)
    img.alpha_composite(lay)


def d_noise_line(x0, x1, base, amps, r, step=6):
    """A wavy horizon line: list of (x, y). amps: [(amp, freq)]."""
    ph = [r.uniform(0, 6.28) for _ in amps]
    pts = []
    for x in range(int(x0), int(x1) + step, step):
        u = x / W
        pts.append((x, base + sum(a * math.sin(u * f + p) for (a, f), p in zip(amps, ph))))
    return pts


def d_jagged(x0, x1, base, hmin, hmax, r, step=(30, 110)):
    pts = [(x0, base)]
    x = x0
    while x < x1:
        x += r.uniform(*step) * S
        y = base - r.uniform(hmin, hmax) * S
        pts.append((x, y))
        if r.random() < 0.3:  # ice mesas: hold a peak level for a stretch
            x += r.uniform(30, 90) * S
            pts.append((x, y + r.uniform(-6, 6) * S))
    pts.append((x1, base))
    return pts


def d_ice_range(img, base, hmin, hmax, li, haze_k, seed):
    r = random.Random(seed)
    pts = d_jagged(0, W, base, hmin, hmax, r)
    face, shadow = d_lerp(DAY_LAYERS[li][0], DAY_HAZE, haze_k), d_lerp(DAY_LAYERS[li][1], DAY_HAZE, haze_k)
    top = min(p[1] for p in pts)
    m = d_poly_mask([(0, H)] + pts + [(W, H)], blur=1 * S)
    d_grad_fill(img, m, face, shadow, top, top + H * 0.12)
    # shaded facets: the side of each peak turned away from the sun
    lay, d = d_layer()
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        if by > ay + 4 * S:
            d.polygon([(ax, ay), (bx, by), (bx, base), (ax - (bx - ax) * 0.2, base)], fill=d_hex(shadow) + (120,))
    a = Image.new("L", (W, H), 0)
    a.paste(lay.getchannel("A"), (0, 0), m)
    lay.putalpha(a)
    img.alpha_composite(d_blur(lay, 3 * S))
    lay, d = d_layer()
    d.line(pts[1:-1], fill=(255, 255, 255, 150), width=int(3 * S))
    img.alpha_composite(d_blur(lay, 1.5 * S))


def d_drift(img, base, amp, top, bot, crest_a, seed):
    r = random.Random(seed)
    pts = d_noise_line(0, W, base, [(amp, 2.5), (amp * 0.35, 8)], r)
    m = d_poly_mask([(0, H)] + pts + [(W, H)], blur=1 * S)
    d_grad_fill(img, m, top, bot, min(p[1] for p in pts), H)
    lay, d = d_layer()
    d.line(pts, fill=(255, 255, 255, crest_a), width=int(4 * S))
    img.alpha_composite(d_blur(lay, 2.5 * S))


def d_snowfall(img, n, alpha, r, y0=0, y1=1.0):
    lay, d = d_layer((255, 255, 255))
    for _ in range(n):
        x, y = r.uniform(0, W), r.uniform(y0, y1) * H
        rad = r.uniform(1, 3.2) * S
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=(255, 255, 255, r.randint(alpha // 3, alpha)))
    img.alpha_composite(d_blur(lay, 0.8 * S))


def d_outside(img, horizon):
    d_glow(img, W * 0.62, H * 0.18, W * 0.045, (255, 252, 236), 220)
    d_ice_range(img, H * horizon, 80, 260, 0, 0.45, 3)
    d_ice_range(img, H * (horizon + 0.04), 40, 150, 2, 0.3, 4)
    d_vfade(img, DAY_HAZE, H * (horizon - 0.08), H * (horizon + 0.06), 0, 70)
    d_drift(img, H * (horizon + 0.07), 12 * S, "#d0deef", "#a6bcda", 90, 5)
    d_drift(img, H * (horizon + 0.12), 18 * S, "#c8d8ee", "#9cb4d6", 100, 6)
    d_drift(img, H * (horizon + 0.17), 22 * S, "#c0d2ea", "#94aed2", 110, 7)


def d_clip(poly, nx, ny, c):
    """Keep the part of a convex polygon where nx*x + ny*y <= c."""
    out = []
    for i, (x1, y1) in enumerate(poly):
        x2, y2 = poly[(i + 1) % len(poly)]
        s1, s2 = nx * x1 + ny * y1 - c, nx * x2 + ny * y2 - c
        if s1 <= 0:
            out.append((x1, y1))
        if (s1 < 0) != (s2 < 0):
            t = s1 / (s1 - s2)
            out.append((x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))
    return out


def d_shards(r, n):
    """Irregular, slanted Voronoi shards: cleavage planes of varied size. Returns polygons."""
    ang = math.radians(-24)
    ca, sa = math.cos(ang), math.sin(ang)

    def fwd(x, y):  # frame -> stretched space (shards come out long along the slant)
        return (x * ca + y * sa) / 1.9, -x * sa + y * ca

    def back(u, v):
        u *= 1.9
        return u * ca - v * sa, u * sa + v * ca

    seeds = []
    while len(seeds) < n:
        x, y = r.uniform(-200 * S, W + 200 * S), r.uniform(-200 * S, H * 0.95)
        u, v = fwd(x, y)
        if all(math.hypot(u - a, v - b) > r.uniform(150, 330) * S for a, b in seeds):
            seeds.append((u, v))
    big = 6000 * S
    cells = []
    for i, (u, v) in enumerate(seeds):
        poly = [(u - big, v - big), (u + big, v - big), (u + big, v + big), (u - big, v + big)]
        for j, (a, b) in enumerate(seeds):
            if i != j and poly:
                nx, ny = a - u, b - v
                poly = d_clip(poly, nx, ny, (a * a + b * b - u * u - v * v) / 2)
        cells.append([back(*q) for q in poly])
    return cells


def d_ice_wall(img, wall, near, mouth, r):
    """Make the cave wall read as glacial ice: a few big cleavage planes in
    close blue values, gentle layer bands following the vault, hairline cracks
    radiating from the mouth, dark pockets and a few glints on the lip. wall
    masks the ice; near is a soft map of how close each pixel is to the mouth
    (crisp there, soft at the frame edges)."""
    mx = max(1, near.getextrema()[1])
    wmap = near.point(lambda v: int(60 + 195 * min(1.0, v / mx) ** 0.8))
    # 1. planes: tight spread of values; ridge light on only some edges
    lay, d = d_layer()
    edges, ridges = [], []
    for poly in d_shards(r, 26):
        if len(poly) < 3:
            continue
        tone = r.uniform(-1, 1)
        if tone > 0:
            d.polygon(poly, fill=(190, 222, 252, int(18 + 26 * tone)))
        else:
            d.polygon(poly, fill=(44, 78, 144, int(18 + 30 * -tone)))
        edges.append(poly)
    lay2, d2 = d_layer()
    for poly in edges:
        for p, q in zip(poly, poly[1:] + poly[:1]):
            if r.random() < 0.5:
                d2.line([(p[0] + 2 * S, p[1] + 2 * S), (q[0] + 2 * S, q[1] + 2 * S)], fill=(40, 72, 134, 55), width=max(1, int(3 * S)))
                d2.line([p, q], fill=(226, 242, 255, r.randint(90, 150)), width=max(1, int(2 * S)))
    facets, ridges = lay, lay2
    # 2. layering: soft bands following the vault, drifting a little
    cx, cy = W * 0.54, H * 0.82
    lay, d = d_layer()
    for k in range(7):
        rad = (330 + k * 190 + r.uniform(-30, 30)) * S
        col = (205, 232, 255, r.randint(14, 24)) if k % 2 == 0 else (52, 88, 150, r.randint(14, 24))
        pts = []
        for i in range(0, 181, 3):
            a = math.radians(180 + i)
            wob = 26 * S * math.sin(i / 14 + k * 1.7) + 12 * S * math.sin(i / 5 + k)
            pts.append((cx + math.cos(a) * (rad * 1.18 + wob), cy + math.sin(a) * (rad * 0.98 + wob)))
        d.line(pts, fill=col, width=int(r.uniform(30, 70) * S))
    bands = lay
    # 3. cracks: single jagged hairlines, pale edge over a soft deep-blue shadow, radiating from the mouth
    lay, d = d_layer()
    for k in range(6):
        x, y = mouth[r.randint(14, len(mouth) - 15)]
        if y > H * 0.7:
            x, y = mouth[20 + k * 8]
        ang = math.atan2(y - cy, (x - cx) * 0.6) + r.uniform(-0.4, 0.4)
        pts = [(x, y)]
        for _ in range(r.randint(8, 13)):
            ang += r.uniform(-0.4, 0.4)
            step = r.uniform(24, 62) * S
            x += math.cos(ang) * step
            y += math.sin(ang) * step * 0.9
            pts.append((x, y))
        d.line(pts, fill=(22, 48, 108, 110), width=max(2, int(4 * S)), joint="curve")
        d.line([(px + 1.5 * S, py) for px, py in pts], fill=(232, 246, 255, 190), width=max(1, int(1.5 * S)), joint="curve")
    cracks = lay
    # 4. deep-blue pockets of denser ice
    lay, d = d_layer()
    for _ in range(16):
        x, y = r.uniform(0, W), r.uniform(0, H * 0.72)
        sz = r.uniform(50, 130) * S
        n = r.randint(6, 9)
        poly = [(x + math.cos(t * 6.283 / n + 0.4) * sz * r.uniform(0.5, 1.2) * 0.8, y + math.sin(t * 6.283 / n + 0.4) * sz * r.uniform(0.6, 1.5)) for t in range(n)]
        d.polygon(poly, fill=(34, 66, 128, r.randint(70, 110)))
    pockets = d_blur(lay, 16 * S)
    # 5. a few glints on the lip
    lay, d = d_layer()
    for _ in range(7):
        x, y = mouth[r.randint(14, len(mouth) - 15)]
        x, y = x + r.uniform(-20, 20) * S, y - r.uniform(14, 60) * S
        L = r.uniform(26, 70) * S
        d.line([(x, y), (x + math.cos(0.9) * L, y + math.sin(0.9) * L)], fill=(250, 253, 255, r.randint(110, 170)), width=max(1, int(2.5 * S)))
    glints = lay
    for part, soft in ((facets, 3.0), (ridges, 3.0), (bands, 6.0), (cracks, 2.5), (pockets, 0), (glints, 2.0)):
        part = part.convert("RGBa")
        if soft:
            sharp, mushy = part.filter(ImageFilter.GaussianBlur(0.9 * S)), part.filter(ImageFilter.GaussianBlur(soft * 3.2 * S))
            part = Image.composite(sharp, mushy, wmap)
        out = part.convert("RGBA")
        a = Image.new("L", (W, H), 0)
        a.paste(out.getchannel("A"), (0, 0), wall)
        out.putalpha(a)
        img.alpha_composite(out)


def d_cave(img):
    d_outside(img, 0.60)
    r = random.Random(9)
    # the mouth: an irregular opening, wider at the floor, leaning right
    mouth = []
    for i in range(0, 181, 2):
        a = math.radians(180 + i)
        rx = W * (0.31 + 0.03 * math.sin(i / 25))
        ry = H * (0.52 - 0.06 * (i / 180))
        jit = 22 * S * math.sin(i / 9 + 1) + 9 * S * math.sin(i / 2.7) + r.uniform(-5, 5) * S
        mouth.append((W * 0.54 + math.cos(a) * (rx + jit), H * 0.82 + math.sin(a) * (ry + jit * 0.8)))
    hole = Image.new("L", (W, H), 0)
    ImageDraw.Draw(hole).polygon(mouth, fill=255)
    m = Image.eval(d_blur(hole, 2 * S), lambda v: 255 - v)
    d_grad_fill(img, m, "#6a8fc0", "#86a8d2", 0, H * 0.8)
    # scalloped ice: long soft scallops, deeper toward the frame edges
    lay, d = d_layer()
    for _ in range(160):
        x, y = r.uniform(-50, W + 50), r.uniform(-50, H * 0.85)
        rr = r.uniform(80, 220) * S
        c = (150, 188, 232, r.randint(16, 36)) if r.random() < 0.5 else (70, 104, 166, r.randint(16, 36))
        d.ellipse([x - rr, y - rr * 0.45, x + rr, y + rr * 0.45], fill=c)
    a2 = Image.new("L", (W, H), 0)
    a2.paste(lay.getchannel("A"), (0, 0), m)
    lay.putalpha(a2)
    img.alpha_composite(d_blur(lay, 26 * S))
    vig = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vig).ellipse([W * 0.08, H * 0.05, W * 0.98, H * 1.4], fill=255)
    vig = Image.eval(d_blur(vig, 200 * S), lambda v: int((255 - v) * 0.55))
    v2 = Image.new("L", (W, H), 0)
    v2.paste(vig, (0, 0), m)
    lay = Image.new("RGBA", (W, H), (52, 84, 140, 0))
    lay.putalpha(v2)
    img.alpha_composite(lay)
    # glow: daylight through the ice brightens the walls near the mouth
    near = d_blur(hole, 120 * S)
    g2 = Image.new("L", (W, H), 0)
    g2.paste(near, (0, 0), m)
    lay = Image.new("RGBA", (W, H), (200, 230, 255, 0))
    lay.putalpha(g2.point(lambda v: int(v * 0.5)))
    img.alpha_composite(lay)
    d_ice_wall(img, m, near, mouth, random.Random(31))
    lay, d = d_layer()
    d.line(mouth, fill=(236, 246, 255, 90), width=int(16 * S))
    img.alpha_composite(d_blur(lay, 12 * S))
    lay, d = d_layer()
    d.line(mouth, fill=(250, 253, 255, 200), width=int(4 * S))
    img.alpha_composite(d_blur(lay, 2 * S))
    # icicles off the lip
    lay, d = d_layer()
    for x, y in mouth[12:-12]:
        if y > H * 0.48 or r.random() < 0.45:
            continue
        L = r.uniform(20, 110) * S
        w = r.uniform(4, 11) * S
        d.polygon([(x - w, y - 6 * S), (x + w, y - 6 * S), (x + r.uniform(-2, 2) * S, y + L)], fill=(206, 228, 250, 235))
        d.line([(x - w * 0.3, y - 2 * S), (x, y + L * 0.75)], fill=(255, 255, 255, 210), width=max(1, int(2 * S)))
    img.alpha_composite(d_blur(lay, 0.8 * S))
    # the floor: packed snow, lit where the daylight falls in, cooler at the sides
    floor = d_noise_line(0, W, H * 0.80, [(6 * S, 3), (3 * S, 9)], random.Random(17))
    fm = d_poly_mask([(0, H)] + floor + [(W, H)], blur=2 * S)
    d_grad_fill(img, fm, "#d4e2f2", "#a8c0de", H * 0.80, H)
    side = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(side)
    sd.polygon([(0, H * 0.80), (W * 0.22, H * 0.80), (0, H)], fill=150)
    sd.polygon([(W, H * 0.80), (W * 0.86, H * 0.80), (W, H)], fill=150)
    side = d_blur(side, 60 * S)
    lay = Image.new("RGBA", (W, H), d_hex("#6a8fc0") + (0,))
    a3 = Image.new("L", (W, H), 0)
    a3.paste(side, (0, 0), fm)
    lay.putalpha(a3)
    img.alpha_composite(lay)
    lay, d = d_layer()
    d.polygon([(W * 0.26, H * 0.80), (W * 0.82, H * 0.80), (W * 0.96, H), (W * 0.18, H)], fill=(246, 251, 255, 90))
    img.alpha_composite(d_blur(lay, 50 * S))
    lay, d = d_layer()
    for i in range(10):
        y = H * (0.82 + 0.018 * i)
        pts2 = d_noise_line(0, W, y, [(5 * S, 4 + i), (2 * S, 15)], random.Random(50 + i))
        d.line(pts2, fill=(150, 178, 216, 50), width=int(3 * S))
    img.alpha_composite(d_blur(lay, 2 * S))
    lay, d = d_layer()
    for x, y, sz in ((0.12, 0.93, 70), (0.86, 0.95, 90), (0.76, 0.86, 30), (0.30, 0.97, 36)):
        x, y, sz = x * W, y * H, sz * S
        d.ellipse([x - sz * 0.9, y - sz * 0.1, x + sz * 1.6, y + sz * 0.3], fill=(110, 140, 186, 90))
        d.polygon([(x - sz, y), (x - sz * 0.6, y - sz * 0.9), (x + sz * 0.4, y - sz * 1.0), (x + sz, y - sz * 0.2), (x + sz * 0.8, y + sz * 0.2)],
                  fill=(150, 184, 222, 255))
        d.polygon([(x - sz * 0.6, y - sz * 0.9), (x + sz * 0.4, y - sz * 1.0), (x + sz * 0.1, y - sz * 0.5), (x - sz * 0.5, y - sz * 0.45)],
                  fill=(226, 240, 255, 230))
    img.alpha_composite(d_blur(lay, 0.8 * S))
    d_snowfall(img, 120, 120, random.Random(18), 0.25, 0.78)


def day():
    img = d_sky(DAY_SKY)
    d_cave(img)
    return img


if DAY:
    img = day().convert("RGB")
    n = Image.effect_noise((W, H), 40).convert("L")
    n = n.point(lambda v: 128 + (v - 128) * 3 / 20)
    out = Image.merge("RGB", [Image.blend(c, n, 0.06) for c in img.split()])
    img = Image.blend(img, out, 0.5)
    img.save(OUT, quality=90)
    print(OUT)
    sys.exit(0)

# ---- Night.
# Each palette: sky stops, stars (per megapixel, brightness), aurora ribbons
# as (colour, alpha), the sun (x, y, radius, alpha) in frame fractions, the
# haze far layers fade into, six layers far to near as (face, shadow) colours,
# crest light, drifting snow alpha, and grain.
NIGHT = dict(
    sky=[(0.0, "#03060f"), (0.28, "#0a1530"), (0.48, "#16294a"), (0.58, "#223a5e"), (1.0, "#2a4468")],
    stars=(240, 245),
    aurora=[("#5fe0b8", 95), ("#6fb4ff", 70), ("#b58cff", 48)],
    sun=None,
    haze="#2c4466",
    layers=[("#4a6890", "#30486c"), ("#3f5d86", "#283f62"), ("#34507a", "#21375a"),
            ("#2b4570", "#1b2f50"), ("#223a62", "#152844"), ("#1a2f54", "#0f1f38")],
    crest=(200, 222, 255, 150),
    snow=120,
    grain=5,
)
P = NIGHT
# How much each layer, far to near, fades into the haze.
FADE = [0.45, 0.32, 0.22, 0.12, 0.05, 0.0]
# Each layer's base line and how high its peaks rise, in frame fractions.
BASES = [(0.47, 0.15), (0.53, 0.10), (0.60, 0.07), (0.70, 0.08), (0.81, 0.09), (0.94, 0.10)]
rng = random.Random(3)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def sky():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    stops = [(p, hexrgb(c)) for p, c in P["sky"]]
    for y in range(H):
        f = y / H
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= f <= p1:
                d.line([(0, y), (W, y)], fill=lerp(c0, c1, (f - p0) / max(p1 - p0, 1e-6)))
                break
    return img.convert("RGBA")


def stars(img):
    if not P["stars"]:
        return
    per_mp, bright = P["stars"]
    d = ImageDraw.Draw(img)
    for _ in range(int(per_mp * W * H / 1e6)):
        x, y = rng.random() * W, rng.random() ** 1.5 * H * 0.55
        b = int(bright * rng.uniform(0.3, 1))
        r = rng.choice([0.7, 0.9, 1.1, 1.5, 2.0]) * S * 1.4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(b, b, min(255, b + 12), 255))


def aurora(img):
    if not P["aurora"]:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    step = max(2, int(3 * S))
    for k, (c, a) in enumerate(P["aurora"]):
        col = hexrgb(c)
        ph1, ph2, ph3 = (rng.random() * 6 for _ in range(3))
        base = H * (0.09 + 0.07 * k)
        for x in range(0, W, step):
            y = base + H * 0.04 * math.sin(x / (W * 0.16) + ph1) + H * 0.012 * math.sin(x / (W * 0.045) + ph2)
            length = H * (0.07 + 0.05 * (0.5 + 0.5 * math.sin(x / (W * 0.07) + ph3)))
            bright = 0.55 + 0.45 * math.sin(x / (W * 0.03) + ph2) ** 2
            segs = 10
            for s in range(segs):
                y0 = y + length * s / segs
                al = int(a * bright * (1 - s / segs) ** 1.4)
                d.line([(x, y0), (x, y0 + length / segs)], fill=col + (al,), width=step)
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(10 * S)))


def sun(img):
    if not P["sun"]:
        return
    x, y, r, a = P["sun"]
    x, y, r = x * W, y * H, r * W
    for k, (rr, aa) in enumerate([(r * 5, a // 6), (r * 2.4, a // 3), (r, a)]):
        g = Image.new("RGBA", (W, H), (255, 252, 240, 0))
        ImageDraw.Draw(g).ellipse([x - rr, y - rr, x + rr, y + rr], fill=(255, 252, 240, aa))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(rr * (0.6 if k < 2 else 0.15))))


def ridge_points(i):
    """Far layers are jagged ice cliffs; near ones smooth wind-cut drifts."""
    b, rise = BASES[i]
    base = H * b
    pts, x = [], -200 * S
    jag = i < 3
    while x <= W + 400 * S:
        lift = rng.uniform(0.15, 1) * H * rise
        pts.append((x, base - lift))
        x += rng.uniform(30, 110) * S if jag else rng.uniform(220, 420) * S
    if jag:
        # ice mesas: hold some peaks level for a stretch
        out = []
        for px, py in pts:
            out.append((px, py))
            if rng.random() < 0.3:
                out.append((px + rng.uniform(30, 90) * S, py + rng.uniform(-6, 6) * S))
        return out
    # wind-cut drifts: a long gentle windward rise, then a short steep lee face
    smooth = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        rising = y1 < y0
        for t in range(24):
            u = t / 24
            s = u ** 0.6 if rising else u ** 2.2
            s = (1 - math.cos(s * math.pi)) / 2
            smooth.append((x0 + (x1 - x0) * u, y0 + (y1 - y0) * s))
    return smooth


def layers(img):
    haze = hexrgb(P["haze"])
    for i, (face, shadow) in enumerate(P["layers"]):
        face = lerp(hexrgb(face), haze, FADE[i])
        shadow = lerp(hexrgb(shadow), haze, FADE[i])
        pts = ridge_points(i)
        top = int(min(y for _, y in pts))
        depth = H * 0.10 + i * H * 0.01
        grad = Image.new("RGBA", (W, H))
        gd = ImageDraw.Draw(grad)
        for y in range(top, H):
            gd.line([(0, y), (W, y)], fill=lerp(face, shadow, min(1, (y - top) / depth)) + (255,))
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon(pts + [(W + 400 * S, H), (-200 * S, H)], fill=255)
        img.paste(grad, (0, 0), mask)
        if i >= 3:
            # lee faces in shadow: each column darkens by how steeply the crest
            # falls there, fading down the face, so the drifts read as dunes of snow
            xs = [x for x, _ in pts]
            ys = [y for _, y in pts]

            def crest(x):
                k = max(1, min(len(xs) - 1, bisect.bisect_left(xs, x)))
                u = (x - xs[k - 1]) / max(xs[k] - xs[k - 1], 1e-6)
                return ys[k - 1] + (ys[k] - ys[k - 1]) * u

            sh = Image.new("RGBA", (W, H), shadow + (0,))
            sd = ImageDraw.Draw(sh)
            step = max(2, int(3 * S))
            dx = 12 * S
            for x in range(0, W, step):
                y = crest(x)
                fall = (crest(x + dx) - crest(x - dx)) / (2 * dx)
                shade = max(0.0, min(1.0, fall * 3.0))
                if shade <= 0.02:
                    continue
                for s in range(8):
                    y0 = y + depth * s / 8
                    sd.line([(x, y0), (x, y0 + depth / 8)], fill=shadow + (int(190 * shade * (1 - s / 8) ** 1.3),), width=step)
            sh = sh.filter(ImageFilter.GaussianBlur(6 * S))
            clip = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            clip.paste(sh, (0, 0), mask)
            img.alpha_composite(clip)
        # crest light along the top edge
        cr = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        r, g, b, a = P["crest"]
        ImageDraw.Draw(cr).line(pts, fill=(r, g, b, int(a * (0.45 + 0.55 * i / 5))), width=max(2, int((2 + i * 0.8) * S)))
        img.alpha_composite(cr.filter(ImageFilter.GaussianBlur(1.5 * S)))
        # haze rising off each layer, thinner toward the front
        hz = Image.new("RGBA", (W, H), haze + (0,))
        ImageDraw.Draw(hz).rectangle([0, top + depth * 0.6, W, H], fill=haze + (int(70 * (1 - i / 5)),))
        img.alpha_composite(hz.filter(ImageFilter.GaussianBlur(30 * S)))


def snow(img):
    d = ImageDraw.Draw(img)
    for _ in range(int(22 * W * H / 1e6)):
        x, y = rng.random() * W, rng.random() * H
        r = rng.choice([0.8, 1.2, 1.6, 2.2]) * S * 1.4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, int(P["snow"] * rng.uniform(0.4, 1))))


def grain(img):
    n = Image.effect_noise((W, H), 40).convert("RGB")
    return Image.blend(img.convert("RGB"), n, P["grain"] / 100)


img = sky()
stars(img)
aurora(img)
sun(img)
layers(img)
snow(img)
grain(img).save(OUT, quality=90)
print(OUT)
