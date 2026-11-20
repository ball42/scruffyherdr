"""Render an original grass-sea wallpaper: a moonlit plain of wind-bent grass
rolling in swells to the horizon, a cloud field receding over it and a lone
needle spire on a far rise, its tip lit. With --day, the same view at late
afternoon: gold grass, a cumulus field and the spire hazed by distance.

Usage: python3 scripts/lothal.py [--day] OUT.jpg [WIDTH HEIGHT]
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
rng = random.Random(7)

P = dict(
    sky=["#4b7ba6", "#7fa3bf", "#cdbf9f"] if DAY else ["#060a18", "#10203d", "#283a5a"],
    cloud_lit="#f7ecd6" if DAY else "#52648a",
    cloud_mid="#d9d4c8" if DAY else "#34446a",
    cloud_shade="#98a0aa" if DAY else "#1a2442",
    hills=["#9ea6a2", "#8f927e", "#82805e"] if DAY else ["#1e2c47", "#1b263a", "#192232"],
    haze="#cfc4a8" if DAY else "#24344f",
    crest="#e8cc84" if DAY else "#7d91b4",
    grass_far="#b89c5c" if DAY else "#2b3550",
    grass_near="#6e5020" if DAY else "#111827",
    blade_lo="#62451a" if DAY else "#0d1420",
    blade_hi="#e6c77e" if DAY else "#93a7c8",
    spire="#77736a" if DAY else "#0b101b",
    rock=("#8a8476", "#5a554a", "#34302a") if DAY else ("#3c4a64", "#232d40", "#0c111a"),
    shadow=(60, 40, 15) if DAY else (5, 8, 15),
    light=(255, 228, 175) if DAY else (140, 165, 210),
    grain=4 if DAY else 5,
)
HORIZON = 0.55


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


def smooth_noise(n, seed, octaves=4, base=4):
    r = random.Random(seed)
    out = [0.0] * n
    amp, total = 1.0, 0.0
    for o in range(octaves):
        step = max(2, n // (base * 2 ** o))
        pts = [r.uniform(-1, 1) for _ in range(n // step + 3)]
        for x in range(n):
            k, f = divmod(x, step)
            f = f / step
            f = f * f * (3 - 2 * f)
            out[x] += amp * (pts[k] * (1 - f) + pts[k + 1] * f)
        total += amp
        amp *= 0.5
    return [v / total for v in out]


def solid(c):
    return Image.new("RGB", (W, H), c)


img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)
hy = int(H * HORIZON)

# ---- Sky.
for y in range(hy + 60):
    d.line([(0, y), (W, y)], fill=ramp(P["sky"], (y / (hy + 60)) ** 1.3))

if not DAY:
    for _ in range(int(900 * S * S) + 400):
        x, y = rng.random() * W, (rng.random() ** 1.6) * hy * 0.9
        v = rng.randint(90, 230)
        s = 1 if rng.random() < 0.93 else 2
        d.ellipse([x, y, x + s * S * 2, y + s * S * 2], fill=(v, v, min(255, v + 15)))
    mx, my, mr = W * 0.8, H * 0.12, 44 * S
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([mx - mr * 7, my - mr * 7, mx + mr * 7, my + mr * 7], fill=75)
    img = Image.composite(solid((150, 175, 215)), img, glow.filter(ImageFilter.GaussianBlur(mr * 3)))
    d = ImageDraw.Draw(img)
    d.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=(232, 238, 246))
    for _ in range(9):
        cx, cy, cr = mx + rng.uniform(-.6, .6) * mr, my + rng.uniform(-.6, .6) * mr, rng.uniform(.08, .22) * mr
        d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(212, 220, 232))

# ---- Cloud field in perspective: big near the top, small and flat toward the
# horizon. Three masks per cloud: body, a lit cap (toward the light) and a belly.
body = Image.new("L", (W, H), 0)
cap = Image.new("L", (W, H), 0)
belly = Image.new("L", (W, H), 0)
bd, cd, ld = ImageDraw.Draw(body), ImageDraw.Draw(cap), ImageDraw.Draw(belly)
n_clouds = 34 if DAY else 20
for _ in range(n_clouds):
    depth = rng.random() ** 0.8           # 0 near (high in the sky), 1 at the horizon
    cy = H * 0.1 + (hy - H * 0.13 - H * 0.1) * depth
    size = W * (0.12 - 0.095 * depth) * rng.uniform(0.6, 1.2)
    squash = 1 - 0.55 * depth
    cx = rng.uniform(-0.05, 1.05) * W
    if not DAY and abs(cx - W * 0.8) < size * 1.6 + 80 * S and abs(cy - H * 0.12) < size * 0.6 + 80 * S:
        continue
    for _ in range(int(26 + 30 * (1 - depth))):
        px = cx + rng.gauss(0, size * 0.45)
        fall = max(0.15, 1 - abs(px - cx) / (size * 1.3))
        pr = size * rng.uniform(0.08, 0.2) * fall
        py = cy - abs(rng.gauss(0, size * 0.22)) * fall * squash
        flat = cy + size * 0.04 * squash
        bd.ellipse([px - pr, py - pr * squash, px + pr, min(py + pr * squash, flat)], fill=255)
        cd.ellipse([px - pr * 0.8 + pr * 0.25, py - pr * squash, px + pr * 0.8 + pr * 0.25, py + pr * squash * 0.1], fill=255)
        ld.ellipse([px - pr * 1.1, py + pr * squash * 0.2, px + pr * 1.1, min(py + pr * squash * 1.5, flat + 2)], fill=255)
    if rng.random() < 0.6:
        wy = cy + size * 0.06 * squash
        bd.ellipse([cx - size * 1.4, wy - 5 * S, cx + size * 0.9, wy + 5 * S], fill=110)
body = body.filter(ImageFilter.GaussianBlur(5 * S))
cap = ImageChops.multiply(cap.filter(ImageFilter.GaussianBlur(9 * S)), body)
belly = ImageChops.multiply(belly.filter(ImageFilter.GaussianBlur(18 * S)), body)
# Clouds near the horizon take on the haze.
fade = Image.linear_gradient("L").resize((W, H))
fade = fade.point(lambda v: 255 if v < int(255 * 0.25) else max(80, 255 - int((v - 64) * 1.6)))
body = ImageChops.multiply(body, fade)
img = Image.composite(solid(rgb(P["cloud_mid"])), img, body.point(lambda v: int(v * 0.95)))
img = Image.composite(solid(rgb(P["cloud_shade"])), img, belly.point(lambda v: int(v * 0.7)))
img = Image.composite(solid(rgb(P["cloud_lit"])), img, cap.point(lambda v: int(v * 0.9)))
d = ImageDraw.Draw(img)

# ---- Far hills, hazed with distance.
for i, col in enumerate(P["hills"]):
    base = hy - (3 - i) * 22 * S
    amp = (80 - i * 20) * S
    nz = smooth_noise(W // 4 + 2, 100 + i, 5)
    pts = [(x * 4, base - (nz[x] * 0.5 + 0.5) * amp) for x in range(len(nz))]
    d.polygon(pts + [(W, H), (0, H)], fill=lerp(rgb(col), rgb(P["haze"]), 0.6 - i * 0.18))

# ---- Swells: ridge lines from the horizon to the front, painted back to front.
SWELLS = 6
swells = []
for k in range(SWELLS):
    t = (k / (SWELLS - 1)) ** 1.7               # 0 far, 1 near
    base = hy + 8 * S + (H * 0.93 - hy) * t
    amp = (30 + 230 * t) * S
    nz = smooth_noise(W // 8 + 2, 300 + k, 3, base=1 + k % 2)
    tilt = rng.uniform(-1, 1) * amp * 1.4
    ridge = [base - (nz[x] * 0.5 + 0.5) * amp + tilt * (x * 8 / W - 0.5) for x in range(len(nz))]
    swells.append((t, ridge))


def ridge_y(ridge, x):
    i = min(len(ridge) - 2, max(0, int(x / 8)))
    f = x / 8 - i
    return ridge[i] * (1 - f) + ridge[i + 1] * f


# The spire stands on the second swell's crest.
sx = W * 0.64
sb = ridge_y(swells[1][1], sx) + 4 * S
lo, hi = rgb(P["blade_lo"]), rgb(P["blade_hi"])
lean = 0.35

for k, (t, ridge) in enumerate(swells):
    nxt = swells[k + 1][1] if k + 1 < SWELLS else [H + 40] * len(ridge)
    # Fill: the swell's own colour, then light along its crest (following the
    # ridge, not the row) and shade in the trough above the next swell.
    mask = Image.new("L", (W, H), 0)
    line = [(x * 8, y) for x, y in enumerate(ridge)]
    ImageDraw.Draw(mask).polygon(line + [(W, H), (0, H)], fill=255)
    near = lerp(lerp(rgb(P["grass_far"]), rgb(P["grass_near"]), t ** 0.7), rgb(P["haze"]), 0.45 * (1 - t) ** 3)
    img = Image.composite(solid(near), img, mask)
    gap = max(8 * S, sum(ridge_y(nxt, x * 8) - y for x, y in enumerate(ridge)) / len(ridge)) if k + 1 < SWELLS else (H - min(ridge))
    lit = Image.new("L", (W, H), 0)
    ImageDraw.Draw(lit).line([(x, y + gap * 0.18) for x, y in line], fill=255, width=max(2, int(gap * 0.36)))
    lit = ImageChops.multiply(lit.filter(ImageFilter.GaussianBlur(gap * 0.2 + 2)), mask)
    img = Image.composite(solid(rgb(P["crest"])), img, lit.point(lambda v: int(v * (0.55 - 0.25 * t))))
    rim = Image.new("L", (W, H), 0)
    ImageDraw.Draw(rim).line(line, fill=255, width=max(1, int((1.5 + 3 * t) * S)))
    img = Image.composite(solid(rgb(P["crest"])), img, rim.filter(ImageFilter.GaussianBlur(1.5 * S)).point(lambda v: int(v * 0.6)))
    if k + 1 < SWELLS:
        trough = Image.new("L", (W, H), 0)
        ImageDraw.Draw(trough).line([(x * 8, y - gap * 0.2) for x, y in enumerate(nxt)], fill=255, width=max(2, int(gap * 0.4)))
        trough = ImageChops.multiply(trough.filter(ImageFilter.GaussianBlur(gap * 0.22 + 2)), mask)
        img = Image.composite(solid(lerp(near, (0, 0, 0), 0.5)), img, trough.point(lambda v: int(v * 0.5)))
    d = ImageDraw.Draw(img)
    if k == 1:  # the spire, hazed, on this crest
        sp = lerp(rgb(P["spire"]), rgb(P["haze"]), 0.4 if DAY else 0.1)
        d.polygon([(sx - 10 * S, sb), (sx - 2.5 * S, sb - 330 * S), (sx, sb - 380 * S), (sx + 2.5 * S, sb - 330 * S), (sx + 10 * S, sb)], fill=sp)
        for bx, bw, bh in [(-64, 36, 18), (-28, 22, 32), (14, 42, 22), (54, 26, 14), (-96, 22, 10)]:
            d.rectangle([sx + bx * S, sb - bh * S, sx + (bx + bw) * S, sb + 6 * S], fill=sp)
        if not DAY:
            d.ellipse([sx - 3.5 * S, sb - 386 * S, sx + 3.5 * S, sb - 379 * S], fill=(255, 211, 107))
    # Blades on this swell, between its ridge and the next.
    n = int((20000 + 30000 * t) * S * S)
    for _ in range(n):
        x = rng.random() * W
        y0 = ridge_y(ridge, x)
        y1 = ridge_y(nxt, x) if k + 1 < SWELLS else H + 20
        y = y0 + (y1 - y0 + 30 * S) * rng.random() ** 0.9
        u = (y - y0) / max(1, y1 - y0)
        u = max(0.0, min(1.0, u))
        tt = min(1.0, t + (u * 0.2 if k + 1 < SWELLS else u * 0.1))
        length = (5 + 170 * tt ** 2.1) * S * rng.uniform(0.6, 1.3)
        width = max(1, int((0.7 + 4.5 * tt ** 2) * S))
        sway = lean + 0.25 * math.sin(x / (W * 0.07) + y / 90) + rng.uniform(-.15, .15)
        tip = (x + sway * length, y - length)
        mid = (x + sway * length * 0.35, y - length * 0.55)
        shade = rng.random() ** (1.3 if DAY else 2.2) * (1 - 0.5 * u)
        c = jitter(lerp(lo, hi, shade * (0.6 + 0.4 * (1 - tt))), 10)
        c = lerp(c, rgb(P["haze"]), 0.5 * (1 - tt) ** 4)
        d.line([(x, y), mid, tip], fill=c, width=width)

# ---- Foreground framing: tall dark blades in the bottom corners.
for _ in range(int(260 * S)):
    side = rng.random() < 0.5
    x = (rng.random() ** 2.5 * 0.16) * W
    x = x if side else W - x
    y = H + rng.uniform(0, 40) * S
    L = rng.uniform(180, 420) * S
    sway = lean + rng.uniform(-.2, .25)
    d.line([(x, y), (x + sway * L * 0.3, y - L * 0.6), (x + sway * L * 0.8, y - L)],
           fill=jitter(lerp(lo, hi, rng.random() ** 2.4 * 0.7), 8), width=max(1, int(rng.uniform(3, 6) * S)))

# ---- Rocks on the nearest swells: a cast shadow, a rounded body lit from the
# upper right, mottled lichen, and grass growing up in front.
def rock(cx, cy, r):
    global img
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).ellipse([cx - r * 1.7, cy - r * 0.05, cx + r * 0.5, cy + r * 0.4], fill=150)
    img = Image.composite(solid(P["shadow"]), img, sh.filter(ImageFilter.GaussianBlur(22 * S)))
    x0, y0, x1, y1 = int(cx - r * 1.3), int(cy - r * 0.9), int(cx + r * 1.3), int(cy + r * 0.5)
    w, h = x1 - x0, y1 - y0
    m = Image.new("L", (w, h), 0)
    pts = [(cx - x0 + math.cos(a) * r * rng.uniform(.88, 1.04), cy - y0 + math.sin(a) * r * 0.66 * rng.uniform(.85, 1.05))
           for a in [math.pi + i * math.pi / 23 for i in range(24)]]
    ImageDraw.Draw(m).polygon(pts + [(cx - x0 + r, cy - y0 + r * 0.25), (cx - x0 - r, cy - y0 + r * 0.25)], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(2.5 * S))
    body = Image.new("RGB", (w, h), rgb(P["rock"][2]))
    for frac, col, blur in [(1.0, P["rock"][1], 0.4), (0.6, P["rock"][0], 0.28), (0.25, lerp(rgb(P["rock"][0]), rgb(P["crest"]), 0.35), 0.2)]:
        g = Image.new("L", (w, h), 0)
        lx, ly = cx - x0 + r * 0.35, cy - y0 - r * 0.3
        ImageDraw.Draw(g).ellipse([lx - r * frac, ly - r * frac * 0.7, lx + r * frac, ly + r * frac * 0.7], fill=255)
        body = Image.composite(Image.new("RGB", (w, h), col if isinstance(col, tuple) else rgb(col)), body, g.filter(ImageFilter.GaussianBlur(r * blur)))
    spots = Image.new("L", (w, h), 0)
    sd = ImageDraw.Draw(spots)
    for _ in range(int(90 * S)):
        px, py, pr = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(2, 9) * S
        sd.ellipse([px - pr, py - pr * 0.7, px + pr, py + pr * 0.7], fill=rng.choice([60, 100]))
    spots = spots.filter(ImageFilter.GaussianBlur(2 * S))
    body = Image.composite(Image.new("RGB", (w, h), lerp(rgb(P["rock"][0]), rgb(P["crest"]), 0.3)), body, spots)
    img.paste(body, (x0, y0), m)
    dd = ImageDraw.Draw(img)
    for _ in range(int(70 * S)):
        x = cx + rng.uniform(-1.2, 1.2) * r
        y = cy + r * 0.22 + rng.uniform(-0.05, 0.25) * r
        L = rng.uniform(30, 120) * S
        dd.line([(x, y), (x + lean * L * 0.4, y - L * 0.55), (x + lean * L, y - L)], fill=jitter(lerp(lo, hi, rng.random() ** 1.4), 10), width=max(1, int(3 * S)))


for rx, ry, rs in [(0.13, 0.86, 260), (0.25, 0.92, 140), (0.82, 0.89, 210)]:
    rock(W * rx, H * ry, rs * S)

# ---- Light wash from the upper right; vignette; grain.
light = Image.new("L", (W, H), 0)
ImageDraw.Draw(light).ellipse([W * 0.45, -H * 0.4, W * 1.4, H * 0.9], fill=60 if DAY else 35)
img = Image.composite(solid(P["light"]), img, light.filter(ImageFilter.GaussianBlur(220 * S)))
vig = Image.new("L", (W, H), 255)
ImageDraw.Draw(vig).ellipse([-W * 0.15, -H * 0.25, W * 1.15, H * 1.2], fill=0)
vig = vig.filter(ImageFilter.GaussianBlur(260 * S))
img = Image.composite(solid((0, 0, 0)), img, vig.point(lambda v: int(v * (0.35 if DAY else 0.55))))
noise = Image.effect_noise((W, H), 40).convert("RGB")
img = Image.blend(img, ImageChops.overlay(img, noise), P["grain"] / 30)

img.save(OUT, quality=90)
print(OUT)
