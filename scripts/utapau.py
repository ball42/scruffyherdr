"""Render an original sinkhole-city wallpaper: at night, looking across a
deep sinkhole from part-way down its wall. Cliffs frame both sides and a far
wall fades into haze; buildings cling to the rock in stacks, their windows
lit amber, platforms jut out and thin bridges span the gap. A strip of night
sky and a moon show at the top.

With --day the viewpoint changes: up on the plateau at noon, looking over
wind-carved sandstone to more sinkhole mouths cut into the plain, rock
pinnacles and a pale sky.

Usage: python3 scripts/utapau.py [--day] OUT.jpg [WIDTH HEIGHT]
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


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ramp(stops, t):
    t = max(0.0, min(1.0, t)) * (len(stops) - 1)
    i = min(int(t), len(stops) - 2)
    return lerp(rgb(stops[i]), rgb(stops[i + 1]), t - i)


def solid(c):
    return Image.new("RGB", (W, H), c)


def mask_poly(pts, blur=0):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def rough_line(rng, x0, x1, base, amps, step=8):
    """A ragged edge from x0 to x1: base plus a few sine octaves and jitter."""
    ph = [rng.uniform(0, 6) for _ in amps]
    pts = []
    x = x0
    while x <= x1 + step:
        y = base + sum(a * math.sin(x / (W * f) + p) for (a, f), p in zip(amps, ph)) + rng.uniform(-1, 1) * S
        pts.append((x, y))
        x += step * S
    return pts


def grain(img, k):
    noise = Image.effect_noise((W, H), 40).convert("RGB")
    return Image.blend(img, ImageChops.overlay(img, noise), k / 30)


# ---- Day: the plateau at noon, sinkhole mouths in the plain. Runs and
# exits before the night code below.
def day():
    rng = random.Random(7)
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    HZ = H * 0.36
    for y in range(int(HZ) + 2):
        d.line([(0, y), (W, y)], fill=ramp(["#8fb0c8", "#bcccd2", "#e2dccb"], (y / HZ) ** 1.3))
    # Far mesas on the horizon, hazed toward the sky.
    for col, base, amp in [("#c9bfa8", HZ, 26), ("#bba98a", HZ + 8 * S, 16)]:
        pts = rough_line(rng, 0, W, base - amp * S * 2, [(amp * S, 0.05), (amp * 0.5 * S, 0.013)])
        for _ in range(3):  # flat-topped mesas: lift a few spans
            c0 = rng.uniform(0.05, 0.85) * W
            c1 = c0 + rng.uniform(0.06, 0.16) * W
            pts = [(x, y - 40 * S if c0 < x < c1 else y) for x, y in pts]
        img.paste(rgb(col), mask=mask_poly(pts + [(W, base + 4 * S), (0, base + 4 * S)], 1.5 * S))
    d = ImageDraw.Draw(img)
    # The plain: warm sandstone with long wind-scoured streaks.
    for y in range(int(HZ), H):
        d.line([(0, y), (W, y)], fill=ramp(["#b8a27c", "#c6b08a", "#bea67e"], (y - HZ) / (H - HZ)))
    streak = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(streak)
    for _ in range(int(500 * S) + 200):
        y = HZ + (rng.random() ** 1.6) * (H - HZ)
        t = (y - HZ) / (H - HZ)
        x = rng.uniform(-0.1, 1.0) * W
        sd.line([(x, y), (x + rng.uniform(0.05, 0.3) * W * (0.3 + t), y + rng.uniform(-2, 2) * S)], fill=rng.randint(30, 90), width=max(1, int((1 + 5 * t) * S)))
    img = Image.composite(solid(rgb("#a8906a")), img, streak.filter(ImageFilter.GaussianBlur(2.5 * S)))

    def mouth(img, cx, cy, rx, ry):
        """A sinkhole mouth at a low angle: a pale lip, the far wall lit and
        banded down into the dark, the near rim overhanging in shadow, and a
        few landing platforms catching the sun."""
        lip = Image.new("L", (W, H), 0)
        ImageDraw.Draw(lip).ellipse([cx - rx * 1.12, cy - ry * 1.25, cx + rx * 1.12, cy + ry * 1.15], fill=255)
        img = Image.composite(solid(rgb("#e6d6b4")), img, lip.filter(ImageFilter.GaussianBlur(ry * 0.12)).point(lambda v: int(v * 0.8)))
        hole = Image.new("L", (W, H), 0)
        ImageDraw.Draw(hole).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
        wall = Image.new("RGB", (W, H))
        wd = ImageDraw.Draw(wall)
        for i in range(int(ry * 2)):
            t = i / (ry * 2)
            band = 0.5 + 0.5 * math.sin(i / max(1.0, ry * 0.09))
            wd.line([(cx - rx, cy - ry + i), (cx + rx, cy - ry + i)], fill=lerp(lerp(rgb("#c49a68"), rgb("#9a7650"), band * 0.4), rgb("#2c2016"), t ** 0.9))
        img = Image.composite(wall, img, hole.filter(ImageFilter.GaussianBlur(1.2 * S)))
        near = Image.new("L", (W, H), 0)
        ImageDraw.Draw(near).ellipse([cx - rx * 1.02, cy - ry * 0.15, cx + rx * 1.02, cy + ry * 1.5], fill=255)
        near = ImageChops.multiply(near, hole)
        img = Image.composite(solid(rgb("#1c140e")), img, near.filter(ImageFilter.GaussianBlur(ry * 0.08)).point(lambda v: int(v * 0.85)))
        dd = ImageDraw.Draw(img)
        for _ in range(int(3 + rx / (120 * S))):
            px = cx + rng.uniform(-0.65, 0.65) * rx
            py = cy - ry * rng.uniform(0.25, 0.85)
            pw = rx * rng.uniform(0.05, 0.11)
            dd.polygon([(px - pw * 0.5, py), (px + pw * 0.5, py), (px + pw * 0.15, py + pw * 0.35), (px - pw * 0.15, py + pw * 0.35)], fill=rgb("#6e5a44"))
            dd.ellipse([px - pw, py - pw * 0.16, px + pw, py + pw * 0.16], fill=rgb("#d8ccb2"))
            dd.ellipse([px - pw * 0.8, py - pw * 0.16, px + pw * 0.6, py + pw * 0.06], fill=rgb("#f0e8d6"))
        return img

    # Mouths far to near; each nearer one draws over the plain in front.
    for cx, cy, rx in [(0.80, 0.42, 0.06), (0.22, 0.45, 0.09), (0.56, 0.55, 0.16), (0.12, 0.8, 0.22)]:
        img = mouth(img, W * cx, H * cy, W * rx, W * rx * (0.17 + 0.2 * (cy - 0.36)))
    # Rock pinnacles: wind-cut columns, lit on the left, a shadow to the right.
    for px, base, ph, pw in [(0.40, 0.47, 0.17, 0.018), (0.43, 0.46, 0.11, 0.012), (0.93, 0.66, 0.32, 0.03), (0.86, 0.6, 0.18, 0.016)]:
        x, b, h, w = W * px, H * base, H * ph, W * pw
        sh = Image.new("L", (W, H), 0)
        ImageDraw.Draw(sh).ellipse([x - w * 0.6, b - h * 0.02, x + w * 4, b + h * 0.06], fill=110)
        img = Image.composite(solid(rgb("#7a6244")), img, sh.filter(ImageFilter.GaussianBlur(6 * S)))
        pts = [(x - w, b), (x - w * 0.7, b - h * 0.55), (x - w * 1.05, b - h * 0.8), (x - w * 0.55, b - h), (x + w * 0.6, b - h * 0.97), (x + w * 0.9, b - h * 0.7), (x + w * 0.65, b - h * 0.4), (x + w, b)]
        img.paste(rgb("#9a7c58"), mask=mask_poly(pts, 1 * S))
        lit = [(x - w, b), (x - w * 0.7, b - h * 0.55), (x - w * 1.05, b - h * 0.8), (x - w * 0.55, b - h), (x - w * 0.05, b - h * 0.98), (x - w * 0.15, b)]
        img.paste(rgb("#dcc49a"), mask=mask_poly(lit, 1 * S))
    vig = Image.new("L", (W, H), 255)
    ImageDraw.Draw(vig).ellipse([-W * 0.12, -H * 0.2, W * 1.12, H * 1.15], fill=0)
    img = Image.composite(solid((60, 46, 30)), img, vig.filter(ImageFilter.GaussianBlur(260 * S)).point(lambda v: int(v * 0.3)))
    grain(img, 3).save(OUT, quality=90)
    print(OUT)


if DAY:
    day()
    sys.exit(0)

# ---- Night: across the sinkhole from part-way down its wall.
rng = random.Random(33)
P = dict(sky=["#0a0d1c", "#18203a", "#2c3450"], far="#2a3040", near="#151821", lamp="#ffb347", window="#ffd38a")
img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)
for y in range(H):
    d.line([(0, y), (W, y)], fill=ramp(P["sky"], (y / (H * 0.4)) ** 0.9))
for _ in range(int(500 * S * S) + 150):
    x, y = rng.random() * W, rng.random() * H * 0.3
    v = rng.randint(100, 230)
    d.ellipse([x, y, x + 2 * S, y + 2 * S], fill=(v, v, min(255, v + 15)))
mx, my, mr = W * 0.62, H * 0.08, 40 * S
mg = Image.new("L", (W, H), 0)
ImageDraw.Draw(mg).ellipse([mx - mr * 5, my - mr * 5, mx + mr * 5, my + mr * 5], fill=70)
img = Image.composite(solid((190, 200, 230)), img, mg.filter(ImageFilter.GaussianBlur(mr * 2)))
ImageDraw.Draw(img).ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=(232, 236, 246))

# Walls are stacked layers: the far wall across the gap, mid walls slanting
# in from each side, near cliffs framing the picture; each nearer layer is
# darker and less hazed. Window and lamp glows collect in one mask.
glows = Image.new("L", (W, H), 0)
gd = ImageDraw.Draw(glows)


def wall(img, pts, col, haze, strata_col):
    m = mask_poly(pts, 1.2 * S)
    img = Image.composite(solid(col), img, m)
    st = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(st)
    y = 0
    while y < H:
        y += rng.uniform(14, 40) * S
        sd.line(rough_line(rng, 0, W, y, [(4 * S, 0.02)], 24), fill=rng.randint(40, 110), width=max(1, int(rng.uniform(2, 6) * S)))
    img = Image.composite(solid(strata_col), img, ImageChops.multiply(st.filter(ImageFilter.GaussianBlur(2 * S)), m))
    rim = Image.new("L", (W, H), 0)
    ImageDraw.Draw(rim).line(pts, fill=255, width=max(1, int(10 * S)))
    rim = ImageChops.multiply(rim.filter(ImageFilter.GaussianBlur(14 * S)), m)
    img = Image.composite(lerp(col, rgb("#8a7a6a"), 0.6), img, rim.point(lambda v: int(v * 0.5)))
    if haze:
        hz = Image.linear_gradient("L").resize((W, H)).point(lambda v: int(haze * 255 * (1 - v / 255) ** 0.6))
        img = Image.composite(solid(rgb("#3a4466")), img, ImageChops.multiply(hz, m))
    return img


def building_stack(img, x, y, w, depth, count):
    """Buildings clinging to the rock: boxes stacked upward, domed roofs,
    rows of lit windows, sometimes a round platform with a lamp."""
    dd = ImageDraw.Draw(img)
    shade = lerp(rgb("#4a5266"), rgb("#1c202a"), depth)
    lit_side = lerp(rgb("#6a7286"), rgb("#2a2f3c"), depth)
    for _ in range(count):
        bw = w * rng.uniform(0.6, 1.0)
        bh = w * rng.uniform(0.35, 0.6)
        bx = x + rng.uniform(-0.2, 0.2) * w
        dd.rectangle([bx - bw / 2, y - bh, bx + bw / 2, y], fill=shade)
        dd.rectangle([bx - bw / 2, y - bh, bx - bw / 2 + bw * 0.25, y], fill=lit_side)
        dd.pieslice([bx - bw / 2, y - bh - bw * 0.18, bx + bw / 2, y - bh + bw * 0.18], 180, 360, fill=lit_side)
        rows = max(1, int(bh / (12 * S * (1.2 - depth))))
        n = max(2, int(bw / (16 * S * (1.2 - depth))))
        for r in range(rows):
            wy = y - bh + (r + 0.6) * bh / (rows + 0.3)
            for c in range(n):
                if rng.random() < 0.62:
                    wx = bx - bw / 2 + (c + 0.5) * bw / n
                    ww, wh = max(1, 3.5 * S * (1.1 - depth)), max(1, 2.5 * S * (1.1 - depth))
                    dd.rectangle([wx - ww, wy - wh, wx + ww, wy + wh], fill=lerp(rgb(P["window"]), shade, depth * 0.4))
                    gd.ellipse([wx - ww * 5, wy - wh * 6, wx + ww * 5, wy + wh * 6], fill=int(60 * (1 - depth) + 30))
        if rng.random() < 0.5:
            px = bx + rng.choice([-1, 1]) * bw * 0.55
            dd.ellipse([px - bw * 0.35, y - bh * 0.15, px + bw * 0.35, y + bh * 0.08], fill=lit_side)
            gd.ellipse([px - 3 * S, y - bh * 0.15 - 3 * S, px + 3 * S, y - bh * 0.15 + 3 * S], fill=200)
            dd.ellipse([px - 2 * S, y - bh * 0.15 - 2 * S, px + 2 * S, y - bh * 0.15 + 2 * S], fill=rgb(P["lamp"]))
        y -= bh + w * rng.uniform(0.04, 0.12)
    return img


def flush(img, k=0.55):
    """Lay down the glows gathered so far, then start an empty mask, so the
    next wall in front covers them."""
    global glows, gd
    img = Image.composite(solid(rgb(P["lamp"])), img, glows.filter(ImageFilter.GaussianBlur(12 * S)).point(lambda v: int(v * k)))
    glows = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glows)
    return img


def edge(x0, dx, y0, amp, seed):
    """A wall's inner edge from (x0, y0) down to the bottom: it slants by dx
    and juts in and out in ledges, so it reads as rock, not card."""
    r = random.Random(seed)
    pts = []
    for i in range(61):
        t = i / 60
        jut = amp * (0.6 * math.sin(t * 11 + seed) + 0.4 * math.sin(t * 29 + seed * 2)) + r.uniform(-0.3, 0.3) * amp
        pts.append((x0 + dx * t ** 1.3 + jut * W, y0 + (H - y0) * t))
    return pts


def at_edge(pts, y):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if y0 <= y <= y1:
            return x0 + (x1 - x0) * (y - y0) / max(1e-6, y1 - y0)
    return pts[-1][0]


mid = lerp(rgb(P["far"]), rgb(P["near"]), 0.45)
far = rough_line(rng, 0, W, H * 0.22, [(20 * S, 0.04), (8 * S, 0.011)])
img = wall(img, far + [(W, H), (0, H)], rgb(P["far"]), 0.45, rgb("#20263a"))
for _ in range(24):
    img = building_stack(img, rng.uniform(0.3, 0.7) * W, H * rng.uniform(0.36, 0.95), 55 * S, 0.75, rng.randint(1, 4))
img = flush(img, 0.45)

lm = rough_line(rng, 0, W * 0.34, H * 0.16, [(14 * S, 0.03)])
lm_edge = edge(W * 0.34, -W * 0.08, H * 0.16, 0.012, 3)
img = wall(img, lm + lm_edge + [(0, H)], mid, 0.22, rgb("#1a1f2e"))
rm = rough_line(rng, W * 0.7, W, H * 0.14, [(14 * S, 0.03)])
rm_edge = edge(W * 0.7, W * 0.07, H * 0.14, 0.012, 5)
img = wall(img, rm_edge[::-1] + rm + [(W, H)], mid, 0.22, rgb("#1a1f2e"))
# Mid-wall buildings hug each wall's inner edge, some jutting past it.
for _ in range(13):
    y = H * rng.uniform(0.3, 0.97)
    img = building_stack(img, at_edge(lm_edge, y) - rng.uniform(-0.01, 0.07) * W, y, 90 * S, 0.45, rng.randint(2, 4))
    y = H * rng.uniform(0.3, 0.97)
    img = building_stack(img, at_edge(rm_edge, y) + rng.uniform(-0.01, 0.07) * W, y, 90 * S, 0.45, rng.randint(2, 4))

# Bridges: thin sagging spans across the gap, lamps along them.
d = ImageDraw.Draw(img)
for by, x0, x1 in [(0.48, 0.25, 0.75), (0.63, 0.22, 0.78), (0.8, 0.2, 0.8)]:
    pts = [(W * (x0 + (x1 - x0) * t), H * by + H * 0.012 * math.sin(math.pi * t)) for t in [i / 40 for i in range(41)]]
    d.line(pts, fill=rgb("#4a5266"), width=max(1, int(5 * S)))
    d.line([(x, y - 4 * S) for x, y in pts], fill=rgb("#2a2f3c"), width=max(1, int(2 * S)))
    for x, y in pts[::5]:
        gd.ellipse([x - 6 * S, y - 6 * S, x + 6 * S, y + 6 * S], fill=170)
        d.ellipse([x - 2 * S, y - 2 * S, x + 2 * S, y + 2 * S], fill=rgb(P["lamp"]))

img = flush(img)
ln_edge = edge(W * 0.11, W * 0.04, 0, 0.018, 7)
ln = [(0, 0)] + ln_edge + [(0, H)]
img = wall(img, ln, rgb(P["near"]), 0, rgb("#0c0e14"))
rn_edge = edge(W * 0.92, -W * 0.03, 0, 0.018, 11)
rn = [(W, 0)] + rn_edge + [(W, H)]
img = wall(img, rn, rgb(P["near"]), 0, rgb("#0c0e14"))
for _ in range(5):
    y = H * rng.uniform(0.35, 1.05)
    img = building_stack(img, at_edge(ln_edge, min(y, H - 1)) - rng.uniform(0.0, 0.04) * W, y, 150 * S, 0.15, rng.randint(1, 3))
    y = H * rng.uniform(0.35, 1.05)
    img = building_stack(img, at_edge(rn_edge, min(y, H - 1)) + rng.uniform(0.0, 0.04) * W, y, 150 * S, 0.15, rng.randint(1, 3))
img = flush(img)
deep = Image.linear_gradient("L").resize((W, H)).point(lambda v: int(200 * max(0.0, (v / 255 - 0.72) / 0.28) ** 1.5))
img = Image.composite(solid((4, 5, 8)), img, deep)
vig = Image.new("L", (W, H), 255)
ImageDraw.Draw(vig).ellipse([-W * 0.08, -H * 0.12, W * 1.08, H * 1.12], fill=0)
img = Image.composite(solid((0, 0, 0)), img, vig.filter(ImageFilter.GaussianBlur(240 * S)).point(lambda v: int(v * 0.5)))
grain(img, 5).save(OUT, quality=90)
print(OUT)
