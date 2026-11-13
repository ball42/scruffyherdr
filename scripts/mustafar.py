"""Render an original volcanic wallpaper: ranks of jagged black basalt ridges
under a smoky red sky, lava running in the valleys between them and pouring
down one face, a far cone breathing ash, and ash and embers drifting across;
or with --day the same land under a mid-toned ash-grey haze, the rock cooled
and the lava dim, so it still shows through the terminals.

The lava is kept to orange and red, with only a thin hot thread: the scene's
needs-you colour is a white-hot yellow, and it must stay the brightest
yellow on screen.

Usage: python3 scripts/mustafar.py [--day] OUT.jpg [WIDTH HEIGHT]
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

# Each palette: sky stops; smoke (dark, lit underside); the far cone; ridge
# tones far to near (crest, foot) and the haze between them; the lava's light
# on the rock; the lava (halo, body, thread) and how strongly it shows; ash,
# embers, grain.
NIGHT = dict(
    sky=[(0.0, "#060304"), (0.22, "#130708"), (0.42, "#30100b"), (0.54, "#64220f"), (0.62, "#7a2c12"), (1.0, "#7a2c12")],
    smoke=("#0c0707", "#6a2614"),
    plume=("#140b0a", "#5e2a1c"),
    cone="#2e120c",
    ridges=[("#220c08", "#3a150b"), ("#1a0b08", "#34130b"), ("#120807", "#28100a"), ("#0a0505", "#1c0b07"), ("#050303", "#100605")],
    glow=(255, 92, 30),
    lava=((200, 44, 12), (255, 96, 24), (255, 170, 70)),
    lava_alpha=1.0,
    crust=(22, 10, 8),
    ash=(170, 150, 144),
    embers=(255, 132, 44),
    grain=5,
)
NOON = dict(
    sky=[(0.0, "#8e8884"), (0.22, "#a29b96"), (0.42, "#b6aea8"), (0.54, "#c6bcb2"), (0.62, "#ccc1b5"), (1.0, "#ccc1b5")],
    smoke=("#7a726e", "#bcb0a6"),
    plume=("#7c7470", "#9e8f86"),
    cone="#aca39b",
    ridges=[("#9a918a", "#a49a92"), ("#8c847e", "#9a908a"), ("#78706c", "#88807b"), ("#605956", "#736a66"), ("#4a4442", "#5c5452")],
    glow=(206, 140, 104),
    lava=((170, 96, 66), (196, 116, 76), (214, 150, 110)),
    lava_alpha=0.6,
    crust=(70, 62, 58),
    ash=(226, 222, 218),
    embers=(214, 150, 112),
    grain=3,
)
P = NOON if DAY else NIGHT
rng = random.Random(1138)


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), tuple(col) + (0,))
    return lay, ImageDraw.Draw(lay)


def jag(n, rough, seed, decay=0.58):
    """A jagged profile of n+1 points (about -1..1) by midpoint displacement."""
    r = random.Random(seed)
    pts = [r.uniform(-1, 1), r.uniform(-1, 1)]
    amp = 1.0
    while len(pts) < n + 1:
        nxt = []
        for a, b in zip(pts, pts[1:]):
            nxt += [a, (a + b) / 2 + r.uniform(-amp, amp) * rough]
        pts = nxt + [pts[-1]]
        amp *= decay
    return pts[: n + 1]


def gradient(stops):
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    st = [(p, hexrgb(c)) for p, c in stops]
    for y in range(H):
        f = y / H
        for (p0, c0), (p1, c1) in zip(st, st[1:]):
            if p0 <= f <= p1:
                d.line([(0, y), (W, y)], fill=lerp(c0, c1, (f - p0) / max(p1 - p0, 1e-6)) + (255,))
                break
    return img


def smoke(img, y0, y1, n, size, alpha, blur, lean=0.0):
    """A bank of smoke: dark billows, their undersides lit red by the lava below."""
    dark, lit = hexrgb(P["smoke"][0]), hexrgb(P["smoke"][1])
    lay, d = layer(dark)
    for _ in range(n):
        x = rng.uniform(-0.1, 1.1) * W
        y = rng.uniform(y0, y1) * H
        r = rng.uniform(0.5, 1.4) * size * S
        t = (y / H - y0) / max(1e-6, y1 - y0)
        c = lerp(dark, lit, max(0.0, t * rng.uniform(0.5, 1.0) - 0.1))
        d.ellipse([x - r * 1.7, y - r * 0.55, x + r * 1.7, y + r * 0.55], fill=c + (alpha,))
        # a darker crown on top of each billow
        d.ellipse([x - r * 1.2, y - r * 0.75, x + r * 1.0, y - r * 0.05], fill=dark + (int(alpha * 0.8),))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(blur * S)))


def value_noise(seed, n=256):
    r = random.Random(seed)
    lat = [r.random() for _ in range(n + 1)]

    def at(x):
        i = int(math.floor(x)) % n
        t = x - math.floor(x)
        t = t * t * (3 - 2 * t)
        return lat[i] + (lat[i + 1] - lat[i]) * t
    return at


def crest(base, amp, seed, freq, gorge=None):
    """A ridge crest across the width: ridged noise, so the peaks come sharp and
    the valleys round. `gorge` (x, half-width, as fractions of W) cuts a notch
    down to the base for the river to come through."""
    octs = [value_noise(seed * 10 + o) for o in range(5)]
    n = 900
    hs = []
    for i in range(n + 1):
        x = i / n * freq
        h, norm = 0.0, 0.0
        for o, nz in enumerate(octs):
            a, f = 0.5 ** o, 2 ** o
            v = 1 - abs(2 * nz(x * f + o * 17.3) - 1)
            h += a * v ** 2
            norm += a
        hs.append(h / norm)
    lo, hi = min(hs), max(hs)
    out = []
    for i, h in enumerate(hs):
        f = (h - lo) / (hi - lo)
        if gorge:
            g = math.exp(-(((i / n) - gorge[0]) / gorge[1]) ** 2)
            f *= 1 - 0.97 * g
        out.append((i / n * W, base - amp * f))
    return out


def cone(img):
    """The far cone: a dark silhouette on the glowing sky, its crater lit, a plume leaning off it."""
    cx, top, base = W * 0.66, H * 0.31, H * 0.67
    col = hexrgb(P["cone"])
    lay, d = layer(col)
    prof = jag(128, 0.5, 7)
    left, right = [], []
    for i in range(65):
        f = i / 64
        y = top + (base - top) * f
        spread = (70 + 1000 * f ** 1.9) * S
        left.append((cx - spread + prof[i] * 14 * S * f, y))
        right.append((cx + spread * 1.15 + prof[64 + i] * 14 * S * f, y))
    d.polygon(left[::-1] + [(cx - 40 * S, top + 10 * S), (cx, top + 22 * S), (cx + 40 * S, top + 8 * S)] + right, fill=col + (255,))
    img.alpha_composite(lay)
    a = P["lava_alpha"]
    halo, body, core = P["lava"]
    g, gd = layer(body)
    gd.ellipse([cx - 200 * S, top - 110 * S, cx + 200 * S, top + 70 * S], fill=body + (int(120 * a),))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(60 * S)))
    g, gd = layer(body)
    gd.ellipse([cx - 60 * S, top - 2 * S, cx + 60 * S, top + 22 * S], fill=body + (int(200 * a),))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(14 * S)))
    # two flows down the flanks, curving with the slope and cooling as they go
    for flow in ([(-30, 14), (-40, 90), (-62, 170), (-70, 250), (-120, 360), (-150, 440), (-240, 540)],
                 [(34, 14), (52, 100), (80, 170), (96, 250), (150, 340), (200, 420)],
                 [(10, 18), (4, 80), (18, 150)]):
        pts = [(cx + dx * S, top + dy * S) for dx, dy in flow]
        lava_line(img, path(pts, 200), 5 * S, 0.8)
    # the plume: puffs rising and leaning left on the wind, lit from below
    dark, lit = hexrgb(P["plume"][0]), hexrgb(P["plume"][1])
    lay, d = layer(dark)
    x, y = cx, top - 30 * S
    for k in range(110):
        t = k / 109
        r = (60 + 330 * t) * S * rng.uniform(0.7, 1.15)
        c = lerp(lit, dark, min(1.0, t * 2.0))
        d.ellipse([x - r, y - r * 0.75, x + r, y + r * 0.75], fill=c + (int(220 * (1 - t * 0.5)),))
        x -= rng.uniform(4, 24) * S
        y -= rng.uniform(4, 10) * S
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(22 * S)))


def path(points, n=200):
    """A smooth curve through control points (Catmull-Rom), as n samples."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(n + 1):
        u = i / n * (len(points) - 1)
        k = min(int(u), len(points) - 2)
        t = u - k
        p0, p1, p2, p3 = pts[k], pts[k + 1], pts[k + 2], pts[k + 3]
        out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                               + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in range(2)))
    return out


def lava_line(img, pts, width, alpha=1.0, taper=True):
    """A lava flow along pts: a wide halo on the rock, the flow, and a thin hot
    thread. `width` is one width, tapered at both ends, or a width per point."""
    halo, body, core = P["lava"]
    a = P["lava_alpha"] * alpha
    n = len(pts)
    if isinstance(width, list):
        ws = width
    else:
        ws = [width * (math.sin(math.pi * min(0.999, max(0.001, i / max(1, n - 1)))) ** 0.5 if taper else 1.0) for i in range(n)]
    width = max(ws)
    for col, wk, al, bk in ((halo, 7, 55, 4), (halo, 1.7, 210, 0.4), (body, 1.0, 255, 0.2), (core, 0.3, 190, 0.15)):
        lay, d = layer(col)
        for i in range(n - 1):
            w = max(1.0, ws[i + 1] * wk if wk < 2 else min(ws[i + 1] * wk, ws[i + 1] * 2.5 + 160 * S))
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            d.line([(x0, y0), (x1, y1)], fill=col + (int(al * a),), width=int(round(w)))
            r = w / 2
            d.ellipse([x1 - r, y1 - r, x1 + r, y1 + r], fill=col + (int(al * a),))
        img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(max(0.6, width * bk))))


def crusts(img, pts, widths, n):
    """Dark crust plates riding a wide flow, `widths` its width at each point."""
    crust = P["crust"]
    lay, d = layer(crust)
    for _ in range(n):
        i = rng.randint(int(len(pts) * 0.1), int(len(pts) * 0.95))
        x, y = pts[i]
        w = widths[i] / 2
        x += rng.uniform(-0.6, 0.6) * w
        y += rng.uniform(-0.3, 0.3) * w
        r = rng.uniform(0.18, 0.4) * w
        poly = [(x + math.cos(q) * r * rng.uniform(0.6, 1.2), y + math.sin(q) * r * 0.4 * rng.uniform(0.6, 1.2))
                for q in [k * math.pi / 3 + rng.uniform(-0.3, 0.3) for k in range(6)]]
        d.polygon(poly, fill=crust + (rng.randint(150, 230),))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(0.8 * S)))


def wander(x0, x1, y, amp, seed, step=8):
    """A flow's course across a valley floor, from x0 to x1 (fractions of W)."""
    r = random.Random(seed)
    ph, ph2 = r.uniform(0, 6), r.uniform(0, 6)
    pts = []
    x = x0 * W
    while x <= x1 * W:
        f = (x - x0 * W) / max(1, (x1 - x0) * W)
        pts.append((x, y + amp * (math.sin(f * 7 + ph) * 0.6 + math.sin(f * 17 + ph2) * 0.4)))
        x += step * S
    return pts


def ridge(img, k, line):
    """One rank of ridges filled from its crest down, its crest rimmed by the light of the lava beyond."""
    top, foot = (hexrgb(c) for c in P["ridges"][k])
    lo = min(y for _, y in line)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(line + [(W, H + 10), (0, H + 10)], fill=255)
    fill = Image.new("RGBA", (W, H))
    fd = ImageDraw.Draw(fill)
    span = max(1.0, H - lo)
    for y in range(max(0, int(lo)), H):
        t = max(0.0, (y - lo) / span)
        fd.line([(0, y), (W, y)], fill=lerp(top, foot, min(1.0, t * 1.4)) + (255,))
    # broken faces: soft lighter and darker planes, so the rock reads as rock
    face = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(face)
    for _ in range(140 + 60 * k):
        i = rng.randint(0, len(line) - 1)
        x, y = line[i]
        L = rng.uniform(30, 160) * S * (0.5 + k * 0.4)
        shade = (255, 200, 170) if rng.random() < 0.4 else (0, 0, 0)
        dx = rng.uniform(-0.6, 0.6) * L
        cd.polygon([(x, y + 2 * S), (x + dx, y + L), (x + dx + rng.uniform(10, 50) * S, y + L * 0.9)], fill=shade + (rng.randint(4, 10),))
    fill.alpha_composite(face.filter(ImageFilter.GaussianBlur(1.5 * S)))
    fill.putalpha(mask)
    img.alpha_composite(fill)
    a = P["lava_alpha"]
    rim, rd = layer(P["glow"])
    rd.line(line, fill=P["glow"] + (int((16 + 10 * k) * a),), width=max(1, int((2 + k) * S)))
    img.alpha_composite(rim.filter(ImageFilter.GaussianBlur((2 + k * 0.8) * S)))


def lavafall(img, line, x0, x1, drop, width):
    """Lava pouring down a rank's face from the lowest notch between x0 and x1."""
    seg = [p for p in line if x0 * W <= p[0] <= x1 * W]
    x, y = max(seg, key=lambda p: p[1])
    pts = path([(x, y + 4 * S), (x + 10 * S, y + drop * 0.3), (x - 6 * S, y + drop * 0.65), (x + 24 * S, y + drop)], 80)
    lava_line(img, pts, width, 0.9)


def ash(img, n, size, alpha, blur):
    c = P["ash"]
    lay, d = layer(c)
    for _ in range(n):
        x, y = rng.random() * W, rng.random() * H
        r = rng.uniform(*size) * S
        L = r * rng.uniform(1.5, 4)
        d.line([(x, y), (x - L, y + L * 0.35)], fill=c + (int(alpha * rng.uniform(0.3, 1)),), width=max(1, int(r)))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(blur * S)) if blur else lay)


def embers(img, n, near):
    """Sparks rising off the lava, only near the valleys."""
    c = P["embers"]
    lay, d = layer(c)
    for _ in range(n):
        x, y0 = rng.choice(near)
        x += rng.uniform(-200, 200) * S
        y = y0 - rng.random() ** 1.5 * 360 * S
        r = rng.uniform(1, 2.6) * S
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (int(rng.uniform(80, 230)),))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(0.7 * S)))


img = gradient(P["sky"])
smoke(img, 0.0, 0.26, 70, 260, 210, 60)
smoke(img, 0.14, 0.46, 70, 200, 150, 44)
cone(img)
smoke(img, 0.40, 0.60, 30, 180, 90, 60)  # haze low on the horizon

# Ranks of ridges, far to near: (base y, crest height, seed, peaks across,
# the gorge the river comes through: x and half-width, as fractions of W)
RANKS = [(0.635, 110, 11, 9, (0.44, 0.025)), (0.70, 190, 12, 6, (0.40, 0.04)), (0.78, 250, 13, 5, (0.45, 0.06)),
         (0.88, 330, 14, 4, (0.37, 0.085)), (1.02, 440, 15, 3, (0.43, 0.13))]
# The river's width where it leaves each rank's gorge, and where it runs off the bottom.
RIVER_W = [6, 14, 30, 64, 130, 200]
# Side flows along a valley, in front of a rank: (rank, x0, x1, width)
SIDE = [(0, 0.02, 0.36, 4), (0, 0.56, 0.98, 4), (1, 0.58, 0.96, 7), (2, -0.02, 0.36, 12)]
lines = [crest(H * b, amp * S, seed, f, g) for b, amp, seed, f, g in RANKS]
glow_spots = []
for k, (b, amp, seed, f, g) in enumerate(RANKS):
    ridge(img, k, lines[k])
    if k == 1:
        lavafall(img, lines[k], 0.16, 0.30, 110 * S, 6 * S)
    if k == 2:
        lavafall(img, lines[k], 0.72, 0.86, 150 * S, 8 * S)
    for rk, x0, x1, w in SIDE:
        if rk == k:
            nb, namp = RANKS[k + 1][0], RANKS[k + 1][1]
            pts = wander(x0, x1, H * nb - namp * S * 0.3, (14 + 14 * k) * S, seed * 7 + int(x0 * 10))
            lava_line(img, pts, w * S)
            glow_spots += pts[::15]
    # the river: out of this rank's gorge, down across its foot, into the next one's (or off the bottom)
    gx, y0 = g[0] * W, b * H
    if k + 1 < len(RANKS):
        nx, y1 = RANKS[k + 1][4][0] * W, RANKS[k + 1][0] * H
    else:
        nx, y1 = W * 0.36, H * 1.06
    mid = (gx + nx) / 2 + (1 if k % 2 else -1) * (40 + 60 * k) * S
    pts = path([(gx, y0 - 6 * S), (mid, (y0 + y1) / 2), (nx, y1 + 4 * S)], 120)
    ws = [(RIVER_W[k] + (RIVER_W[k + 1] - RIVER_W[k]) * i / 120) * S for i in range(121)]
    lava_line(img, pts, ws)
    if k >= 2:
        crusts(img, pts, ws, 14 * (k - 1))
    glow_spots += pts[::10]

if not DAY:
    embers(img, 260, glow_spots)
ash(img, 1600, (0.8, 2.0), 70 if DAY else 80, 1.0)  # fine ash, soft
ash(img, 220, (2.4, 4.6), 60 if DAY else 60, 2.5)  # near flakes, larger and blurred
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
