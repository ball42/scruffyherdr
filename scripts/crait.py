"""Render an original salt-flat wallpaper: a white crust of salt polygons
running flat to low mesas under an indigo night, broken in long wandering
scars where red mineral shows through and glows.

With --day the viewpoint changes: under a white salt cliff at midday, a
great fortress door cut into it, red trenches running across the plain to
it, and pale salt crystals in front.

Usage: python3 scripts/crait.py [--day] OUT.jpg [WIDTH HEIGHT]
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
rng = random.Random(17)

P = dict(
    sky=["#07061a", "#1c1838", "#3a3152"],
    mesa=["#1d1930", "#2a2540"],
    haze="#3e3656",
    salt_far="#7d7896",
    salt_near="#a29dba",
    crack="#6e6990",
    red="#d22a1c",
    glow="#ff4a2e",
    light=(150, 140, 210),
    grain=5,
)
HORIZON = 0.5


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ramp(stops, t):
    t = max(0.0, min(1.0, t)) * (len(stops) - 1)
    i = min(int(t), len(stops) - 2)
    return lerp(rgb(stops[i]), rgb(stops[i + 1]), t - i)


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


# ---- Day: under a salt cliff, a fortress door cut into it, red trenches
# across the plain and salt crystals in front. Runs and exits before the
# night code below.
def day():
    rng = random.Random(29)
    HZ = H * 0.5

    def poly(pts, blur=0):
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).polygon(pts, fill=255)
        return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m

    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=ramp(["#7c8aa4", "#a2a8ba", "#c4c0c6"], (y / HZ) ** 1.2))
    # Low mesas far off on the left.
    pts = [(x, HZ - 12 * S - (36 * S if 0.08 * W < x < 0.3 * W else 0) - 6 * S * math.sin(x / (W * 0.02))) for x in range(0, int(W * 0.5), 10)]
    img.paste(rgb("#a6a6b2"), mask=poly(pts + [(W * 0.5, HZ + 4 * S), (0, HZ + 4 * S)], 2 * S))
    # The plain: grey-white salt, darker toward the viewer.
    d = ImageDraw.Draw(img)
    for y in range(int(HZ), H):
        d.line([(0, y), (W, y)], fill=ramp(["#c8c4c8", "#b2acb2", "#968e96"], (y - HZ) / (H - HZ)))
    salt = Image.effect_noise((W // 6, H // 6), 50).resize((W, H), Image.BICUBIC).point(lambda v: max(0, v - 128))
    salt = ImageChops.multiply(salt, poly([(0, HZ), (W, HZ), (W, H), (0, H)]))
    img = Image.composite(solid(rgb("#e2dee2")), img, salt)
    # Red trenches: lines converging on a point near the door, widening
    # toward the viewer, each with a pale salt lip.
    vx, vy = W * 0.66, HZ + 6 * S
    for k in range(6):
        a = math.radians(rng.uniform(100, 165) if k % 2 else rng.uniform(15, 80))
        L = rng.uniform(0.7, 1.5) * W
        ph, amp = rng.uniform(0, 6), rng.uniform(140, 280) * S
        pts_l, pts_r = [], []
        for i in range(30):
            t = i / 29
            x = vx + math.cos(a) * L * t ** 1.4 + amp * t ** 1.2 * math.sin(t * 4.5 + ph)
            y = vy + math.sin(a) * L * 0.45 * t ** 1.4
            w = (1 + 30 * t ** 1.5) * S * (0.7 + 0.5 * abs(math.sin(t * 5 + ph)))
            pts_l.append((x - w * math.sin(a), y + w * math.cos(a) * 0.4 - w * 0.3))
            pts_r.append((x + w * math.sin(a), y - w * math.cos(a) * 0.4 + w * 0.3))
        m = poly(pts_l + pts_r[::-1], 1.2 * S)
        img = Image.composite(solid(rgb("#ece8ea")), img, m.filter(ImageFilter.GaussianBlur(6 * S)).point(lambda v: int(v * 0.6)))
        img = Image.composite(solid(rgb("#b0322a")), img, m)
        inner = ImageChops.multiply(m, m.filter(ImageFilter.GaussianBlur(8 * S)))
        img = Image.composite(solid(rgb("#7a1e1a")), img, inner.point(lambda v: max(0, v - 120) * 2))
    # The salt cliff on the right: one ridge rising to the right, its face
    # cut by slanting gullies, each rib lit on its left and shaded on its right.
    def ridge_y(x):
        t = max(0.0, (x - W * 0.5) / (W * 0.5))
        return HZ - H * (0.06 + 0.36 * t ** 0.6) - 18 * S * math.sin(x / (W * 0.035)) - 9 * S * math.sin(x / (W * 0.011) + 2)
    top = [(W * 0.5, HZ + 4 * S)] + [(x, ridge_y(x)) for x in range(int(W * 0.5), int(W + 12 * S), int(6 * S) or 1)]
    img.paste(rgb("#c8c2ca"), mask=poly(top + [(W, HZ + 20 * S), (W * 0.5, HZ + 20 * S)], 1 * S))
    x = W * 0.5
    while x < W:
        bw = rng.uniform(40, 120) * S
        slant = rng.uniform(30, 90) * S
        x0, x1 = x, x + bw
        lit = [(x0, ridge_y(x0)), (x0 + bw * 0.5, ridge_y(x0 + bw * 0.5)), (x0 + bw * 0.5 + slant, HZ + 20 * S), (x0 + slant, HZ + 20 * S)]
        shd = [(x0 + bw * 0.5, ridge_y(x0 + bw * 0.5)), (x1, ridge_y(x1)), (x1 + slant, HZ + 20 * S), (x0 + bw * 0.5 + slant, HZ + 20 * S)]
        face = poly(top + [(W, HZ + 20 * S), (W * 0.5, HZ + 20 * S)])
        img = Image.composite(solid(rgb("#e4e0e4")), img, ImageChops.multiply(poly(lit, 2 * S), face))
        img = Image.composite(solid(rgb("#a49eaa")), img, ImageChops.multiply(poly(shd, 2 * S), face))
        x = x1
    cliff = poly(top + [(W + 60 * S, HZ + 20 * S), (W * 0.5, HZ + 20 * S)])
    foot = Image.linear_gradient("L").resize((W, H)).point(lambda v: int(150 * max(0.0, (v / 255 - 0.25) / 0.27)))
    img = Image.composite(solid(rgb("#7c7686")), img, ImageChops.multiply(foot, cliff))
    snow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(snow).line(top[1:], fill=255, width=max(1, int(8 * S)))
    img = Image.composite(solid(rgb("#f6f4f4")), img, ImageChops.multiply(snow.filter(ImageFilter.GaussianBlur(3 * S)), cliff))
    # The fortress door: a great dark slab with a frame, set into the cliff.
    dx0, dx1, dy0, dy1 = W * 0.6, W * 0.74, HZ - H * 0.16, HZ + 18 * S
    d = ImageDraw.Draw(img)
    d.rectangle([dx0 - 14 * S, dy0 - 14 * S, dx1 + 14 * S, dy1], fill=rgb("#8a8690"))
    d.rectangle([dx0, dy0, dx1, dy1], fill=rgb("#4a4652"))
    for k in range(1, 6):
        y = dy0 + (dy1 - dy0) * k / 6
        d.line([(dx0, y), (dx1, y)], fill=rgb("#3a3640"), width=max(1, int(3 * S)))
    d.rectangle([dx0 + (dx1 - dx0) * 0.48, dy0, dx0 + (dx1 - dx0) * 0.52, dy1], fill=rgb("#36323c"))
    # Crystals in the foreground: clusters of pale shards, lit on one face,
    # their bases tinged red where the salt is broken.
    def shard(x, y, h, w, lean):
        nonlocal img
        tip = (x + lean * h, y - h)
        body = [(x - w, y), (x - w * 0.6, y - h * 0.7), tip, (x + w * 0.7, y - h * 0.6), (x + w, y)]
        img.paste(rgb("#d4d2e0"), mask=poly(body, 0.8 * S))
        img.paste(rgb("#f4f4fa"), mask=poly([(x - w, y), (x - w * 0.6, y - h * 0.7), tip, (x + lean * h * 0.2, y)], 0.8 * S))
        img.paste(rgb("#a4a0bc"), mask=poly([(x + lean * h * 0.4, y), tip, (x + w * 0.7, y - h * 0.6), (x + w, y)], 0.8 * S))
    for cx, cy, sc in [(0.06, 1.0, 2.2), (0.24, 1.03, 1.3), (0.93, 1.02, 1.9), (0.42, 0.8, 0.6)]:
        base = Image.new("L", (W, H), 0)
        ImageDraw.Draw(base).ellipse([W * cx - 220 * S * sc, H * cy - 40 * S * sc, W * cx + 220 * S * sc, H * cy + 30 * S * sc], fill=200)
        img = Image.composite(solid(rgb("#a8423a")), img, base.filter(ImageFilter.GaussianBlur(30 * S * sc)))
        for _ in range(9):
            shard(W * cx + rng.uniform(-150, 150) * S * sc, H * cy + rng.uniform(-10, 20) * S * sc, rng.uniform(80, 260) * S * sc, rng.uniform(16, 34) * S * sc, rng.uniform(-0.35, 0.35))
    vig = Image.new("L", (W, H), 255)
    ImageDraw.Draw(vig).ellipse([-W * 0.12, -H * 0.2, W * 1.12, H * 1.15], fill=0)
    img = Image.composite(solid((50, 44, 60)), img, vig.filter(ImageFilter.GaussianBlur(260 * S)).point(lambda v: int(v * 0.45)))
    noise = Image.effect_noise((W, H), 40).convert("RGB")
    Image.blend(img, ImageChops.overlay(img, noise), 3 / 30).save(OUT, quality=90)
    print(OUT)


if DAY:
    day()
    sys.exit(0)

img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)
hy = int(H * HORIZON)

# ---- Sky, stars by night, and a low glow over the horizon.
for y in range(hy + 40):
    d.line([(0, y), (W, y)], fill=ramp(P["sky"], (y / (hy + 40)) ** 1.2))
for _ in range(int(1100 * S * S) + 400):
    x, y = rng.random() * W, (rng.random() ** 1.5) * hy * 0.92
    v = rng.randint(90, 235)
    s = 1 if rng.random() < 0.92 else 2
    d.ellipse([x, y, x + s * S * 2, y + s * S * 2], fill=(v, v - 6, min(255, v + 20)))
band = Image.new("L", (W, H), 0)
ImageDraw.Draw(band).ellipse([-W * 0.2, hy - H * 0.16, W * 1.2, hy + H * 0.08], fill=70)
img = Image.composite(solid(rgb(P["haze"])), img, band.filter(ImageFilter.GaussianBlur(120 * S)))
d = ImageDraw.Draw(img)

# ---- Low mesas on the horizon: flat tops, steep sides, hazed.
for i, col in enumerate(P["mesa"]):
    nz = smooth_noise(W // 6 + 2, 40 + i, 3, base=3)
    pts = []
    for x in range(len(nz)):
        v = nz[x]
        hgt = (60 - i * 28) * S * (1 if v > 0.05 else 0.15 + v)  # flat tops, low saddles
        pts.append((x * 6, hy - max(0, hgt)))
    d.polygon(pts + [(W, hy + 4), (0, hy + 4)], fill=lerp(rgb(col), rgb(P["haze"]), 0.5 - i * 0.25))

# ---- The salt plain, drawn as a ground plane: z is distance, 1 at the frame's foot.
def proj(u, z):
    return W / 2 + u * W * 0.55 / z, hy + (H - hy) / z


for y in range(hy, H):
    t = (y - hy) / (H - hy)
    d.line([(0, y), (W, y)], fill=lerp(lerp(rgb(P["salt_far"]), rgb(P["haze"]), 0.5 * (1 - t) ** 4), rgb(P["salt_near"]), t ** 0.7))

# Salt polygons: a jittered grid on the plane, its edges as thin cracks.
grid = {}
zs = [1.0]
while zs[-1] < 60:
    zs.append(zs[-1] * 1.09)
for j, z in enumerate(zs):
    for i in range(-int(z * 1.4) - 3, int(z * 1.4) + 4):
        grid[(i, j)] = (i * 0.9 + rng.uniform(-.35, .35), z * rng.uniform(0.97, 1.03))
crack = rgb(P["crack"])
for (i, j), (u, z) in grid.items():
    for di, dj in ((1, 0), (0, 1)):
        n = grid.get((i + di, j + dj))
        if not n or rng.random() < 0.12:
            continue
        x0, y0 = proj(u, z)
        x1, y1 = proj(*n)
        if max(x0, x1) < -50 or min(x0, x1) > W + 50:
            continue
        near = 1 / z
        c = lerp(crack, rgb(P["haze"]), (1 - near) ** 2 * 0.8)
        d.line([(x0, y0), (x1, y1)], fill=c, width=max(1, int(4 * S * near ** 0.6)))

# Raised salt rims catch light along each crack's near side.
rims = Image.new("L", (W, H), 0)
rd = ImageDraw.Draw(rims)
for (i, j), (u, z) in grid.items():
    n = grid.get((i + 1, j))
    if n and rng.random() < 0.5:
        x0, y0 = proj(u, z)
        x1, y1 = proj(*n)
        rd.line([(x0, y0 + 3 * S / z), (x1, y1 + 3 * S / z)], fill=150, width=max(1, int(3 * S / z ** 0.5)))
img = Image.composite(solid((205, 200, 230)), img, rims.filter(ImageFilter.GaussianBlur(1.5 * S)))
d = ImageDraw.Draw(img)

# ---- Scars: wandering breaks in the crust, narrow far off and wide near,
# never paired or parallel. Each one glows on its own layer by night.
scar = Image.new("L", (W, H), 0)
sd = ImageDraw.Draw(scar)
srng = random.Random(91)  # its own stream, so night and day share the scars
for k in range(11):
    u = -7 + 14 * k / 10 + srng.uniform(-0.8, 0.8)
    z = srng.uniform(2.5, 14)
    head = srng.uniform(-0.6, 0.6)
    width = srng.uniform(0.025, 0.07)
    path = [(u, z)]
    while z > 1.05:
        step = srng.uniform(0.25, 0.6) * (z ** 0.5)
        head = max(-0.75, min(0.75, head * 0.9 + srng.uniform(-0.25, 0.25)))
        u, z = u + math.sin(head) * step, z - math.cos(head) * step * 0.9
        if z < 1:
            break
        path.append((u, z))
    n = len(path)
    for i in range(n - 1):
        (ua, za), (ub, zb) = path[i], path[i + 1]
        if srng.random() < 0.05:  # a break in the scar
            continue
        taper = math.sin(math.pi * (i + 0.5) / (n - 1)) ** 0.6
        w = max(1.0, width * taper * W * 0.55 / ((za + zb) / 2) * srng.uniform(0.6, 1.3))
        x0, y0 = proj(ua, za)
        x1, y1 = proj(ub, zb)
        # Ragged edges: a core and a few thinner strands beside it.
        sd.line([(x0, y0), (x1, y1)], fill=255, width=int(w))
        for _ in range(3):
            ox, oy = srng.uniform(-.5, .5) * w, srng.uniform(-.25, .25) * w
            sd.line([(x0 + ox, y0 + oy), (x1 + ox, y1 + oy)], fill=200, width=max(1, int(w * srng.uniform(0.2, 0.5))))
        if srng.random() < 0.06:  # a short branch
            bh = head + srng.choice([-1, 1]) * srng.uniform(0.6, 1.1)
            bx, by = proj(ub + math.sin(bh) * 1.2, max(1.05, zb - math.cos(bh) * 0.8))
            sd.line([(x1, y1), (bx, by)], fill=190, width=max(1, int(w * 0.4)))
scar = scar.filter(ImageFilter.GaussianBlur(1.2 * S))
glow = scar.filter(ImageFilter.GaussianBlur(26 * S)).point(lambda v: min(255, v * 2))
img = Image.composite(solid(rgb(P["glow"])), img, glow.point(lambda v: int(v * 0.45)))
img = Image.composite(solid(rgb(P["red"])), img, scar)
# Salt dust over the scars: speckle so the red reads as under the crust.
dust = Image.effect_noise((W, H), 120).point(lambda v: 255 if v > 200 else 0)
dust = ImageChops.multiply(dust, scar)
img = Image.composite(solid(rgb(P["salt_near"])), img, dust.point(lambda v: int(v * 0.5)))

# ---- Light, vignette (strong by day: a white plain must stay mid-tone), grain.
light = Image.new("L", (W, H), 0)
ImageDraw.Draw(light).ellipse([W * 0.2, -H * 0.3, W * 0.9, H * 0.7], fill=30)
img = Image.composite(solid(P["light"]), img, light.filter(ImageFilter.GaussianBlur(240 * S)))
vig = Image.new("L", (W, H), 255)
ImageDraw.Draw(vig).ellipse([-W * 0.1, -H * 0.2, W * 1.1, H * 1.15], fill=0)
vig = vig.filter(ImageFilter.GaussianBlur(280 * S))
img = Image.composite(solid((0, 0, 0)), img, vig.point(lambda v: int(v * (0.55))))
noise = Image.effect_noise((W, H), 40).convert("RGB")
img = Image.blend(img, ImageChops.overlay(img, noise), P["grain"] / 30)

img.save(OUT, quality=90)
print(OUT)
