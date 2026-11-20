"""Render an original maelstrom wallpaper: a slow spiral of violet and teal
gas wound round a dark well, gold dust strung along its arms and a thin gold
ring at the well's lip, stars behind. With --day, the spiral in ochre and
slate on warm grey paper, kept mid-tone.

Usage: python3 scripts/kessel.py [--day] OUT.jpg [WIDTH HEIGHT]
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
rng = random.Random(21)

P = dict(
    ground=("#b9b0a2", "#8a8070") if DAY else ("#120c1e", "#05030a"),
    gas=["#7d6a98", "#5f8a86", "#a48a5a"] if DAY else ["#4e3290", "#17716c", "#7a3c9c"],
    dust="#6e5214" if DAY else "#ffcf5c",
    well="#2e261e" if DAY else "#000000",
    ring="#8a6a20" if DAY else "#ffd27a",
    grain=3 if DAY else 5,
)
CX, CY = W * 0.56, H * 0.47
TILT = 0.58           # the disc seen at a slant
ROT = -0.22           # and turned a little


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def solid(c):
    return Image.new("RGB", (W, H), c)


def at(angle, radius):
    """A point on the tilted, turned disc."""
    x, y = math.cos(angle) * radius, math.sin(angle) * radius * TILT
    return CX + x * math.cos(ROT) - y * math.sin(ROT), CY + x * math.sin(ROT) + y * math.cos(ROT)


# ---- Day: jagged ridges under a hazy sky, the maelstrom wide overhead, a
# spice refinery venting plumes. Runs and exits before the night code below.
def day():
    rng = random.Random(8)

    def lerp(a, b, t):
        t = max(0.0, min(1.0, t))
        return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

    def ramp(stops, t):
        t = max(0.0, min(1.0, t)) * (len(stops) - 1)
        i = min(int(t), len(stops) - 2)
        return lerp(rgb(stops[i]), rgb(stops[i + 1]), t - i)

    def poly(pts, blur=0):
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).polygon(pts, fill=255)
        return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m

    def ridge(base, rough, n=9):
        """A jagged ridge line by midpoint displacement."""
        pts = [(-20 * S, base + rng.uniform(-1, 1) * rough), (W + 20 * S, base + rng.uniform(-1, 1) * rough)]
        r = rough
        for _ in range(n):
            out = []
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                out += [(x0, y0), ((x0 + x1) / 2, (y0 + y1) / 2 + rng.uniform(-r, r))]
            pts = out + [pts[-1]]
            r *= 0.6
        return pts

    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=ramp(["#8a8ab0", "#b4a8bc", "#dcc2a8"], (y / (H * 0.62)) ** 1.1))
    # The maelstrom across the upper sky: soft violet and teal arms round a
    # dark eye with a thin gold rim.
    sx, sy = W * 0.66, H * 0.2
    for k, col in enumerate(["#7462a0", "#5a8a8a"]):
        arms = Image.new("L", (W, H), 0)
        ad = ImageDraw.Draw(arms)
        for arm in range(3):
            if arm % 2 != k and arm != 2:
                continue
            for _ in range(4200):
                t = rng.random() ** 0.85 * 3.2 * math.pi
                a = t + arm * 2 * math.pi / 3 + rng.gauss(0, 0.09)
                r = 40 * S * math.exp(0.98 * t / math.pi)
                x, y = sx + math.cos(a) * r, sy + math.sin(a) * r * 0.42
                s = (8 + r * 0.09) * rng.uniform(0.6, 1.4)
                ad.ellipse([x - s, y - s * 0.45, x + s, y + s * 0.45], fill=rng.randint(14, 34))
        img = Image.composite(solid(rgb(col)), img, arms.filter(ImageFilter.GaussianBlur(16 * S)).point(lambda v: min(190, int(v * 2.2))))
    eye = Image.new("L", (W, H), 0)
    ImageDraw.Draw(eye).ellipse([sx - 50 * S, sy - 21 * S, sx + 50 * S, sy + 21 * S], fill=255)
    img = Image.composite(solid(rgb("#e6c070")), img, eye.filter(ImageFilter.GaussianBlur(14 * S)).point(lambda v: int(v * 0.6)))
    img = Image.composite(solid(rgb("#2e2840")), img, eye.filter(ImageFilter.GaussianBlur(3 * S)).point(lambda v: int(v * 0.9)))

    # Ridges, far and hazed to near and dark, each lit along its crest.
    layers = [(0.6, 90, "#b29a9e"), (0.67, 120, "#987876"), (0.78, 150, "#7a5650"), (0.92, 170, "#5a3a32")]
    for i, (base, rough, col) in enumerate(layers):
        pts = ridge(H * base, rough * S)
        img.paste(rgb(col), mask=poly(pts + [(W + 20 * S, H), (-20 * S, H)], 1 * S))
        crest = Image.new("L", (W, H), 0)
        ImageDraw.Draw(crest).line(pts, fill=255, width=max(1, int((3 + 3 * i) * S)))
        crest = ImageChops.multiply(crest.filter(ImageFilter.GaussianBlur((3 + 2 * i) * S)), poly(pts + [(W + 20 * S, H), (-20 * S, H)]))
        img = Image.composite(solid(lerp(rgb(col), rgb("#f0d0a8"), 0.55)), img, crest)
        if i == 1:
            # The refinery on the mid ridge: blocks, stacks, plumes, gold lamps.
            near = [y for x, y in pts if W * 0.22 < x < W * 0.42]
            rx, ry = W * 0.3, max(near) + 6 * S
            dd = ImageDraw.Draw(img)
            dark = rgb("#5a4648")
            for bx, bw, bh in [(-0.06, 0.05, 0.05), (-0.01, 0.07, 0.08), (0.06, 0.04, 0.045), (0.1, 0.06, 0.06)]:
                dd.rectangle([rx + bx * W, ry - bh * H, rx + (bx + bw) * W, ry + 90 * S], fill=dark)
                dd.rectangle([rx + bx * W, ry - bh * H, rx + (bx + bw * 0.3) * W, ry + 90 * S], fill=rgb("#8a6e68"))
                dd.rectangle([rx + bx * W, ry - bh * H, rx + (bx + bw) * W, ry - bh * H + 4 * S], fill=rgb("#b8968a"))
            plumes = Image.new("L", (W, H), 0)
            pd = ImageDraw.Draw(plumes)
            for kx, kh in [(0.0, 0.17), (0.025, 0.21), (0.085, 0.15)]:
                x0 = rx + kx * W
                top = ry - kh * H
                dd.rectangle([x0, top, x0 + 14 * S, ry], fill=rgb("#4a3a3e"))
                for j in range(22):
                    f = j / 21
                    px, py = x0 + 7 * S + (f ** 1.6) * W * 0.07 + rng.uniform(-12, 12) * S * (1 + 4 * f), top - f * H * 0.2
                    pr = (12 + 75 * f) * S * rng.uniform(0.8, 1.2)
                    pd.ellipse([px - pr, py - pr * 0.7, px + pr, py + pr * 0.7], fill=int(120 * (1 - f) + 30))
            img = Image.composite(solid(rgb("#e8dcd0")), img, plumes.filter(ImageFilter.GaussianBlur(14 * S)).point(lambda v: int(v * 0.7)))
            dd = ImageDraw.Draw(img)
            for _ in range(26):
                lx, ly = rx + rng.uniform(-0.06, 0.16) * W, ry - rng.uniform(0.0, 0.07) * H
                dd.rectangle([lx, ly, lx + 4 * S, ly + 3 * S], fill=rgb("#ffcf5c"))
        if i < len(layers) - 1:
            haze = Image.linear_gradient("L").resize((W, H)).point(lambda v: int(70 * max(0.0, 1 - abs(v / 255 - base - 0.04) / 0.08)))
            img = Image.composite(solid(rgb("#d8c4b8")), img, haze)
    # Foreground boulders on the near slope, lit on top.
    dd = ImageDraw.Draw(img)
    for _ in range(9):
        bx, by = rng.uniform(0, 1) * W, H * rng.uniform(0.93, 1.02)
        br = rng.uniform(30, 90) * S
        dd.ellipse([bx - br, by - br * 0.6, bx + br, by + br * 0.5], fill=rgb("#4a2e28"))
        dd.ellipse([bx - br * 0.8, by - br * 0.6, bx + br * 0.4, by - br * 0.2], fill=rgb("#7a5248"))
    vig = Image.new("L", (W, H), 255)
    ImageDraw.Draw(vig).ellipse([-W * 0.12, -H * 0.2, W * 1.12, H * 1.15], fill=0)
    img = Image.composite(solid((50, 32, 28)), img, vig.filter(ImageFilter.GaussianBlur(260 * S)).point(lambda v: int(v * 0.3)))
    noise = Image.effect_noise((W, H), 40).convert("RGB")
    Image.blend(img, ImageChops.overlay(img, noise), 3 / 30).save(OUT, quality=90)
    print(OUT)


if DAY:
    day()
    sys.exit(0)

# ---- Ground: dark at the edges, a little lighter round the spiral.
reach = math.hypot(W, H) * 0.6
g = Image.radial_gradient("L").resize((int(reach * 2), int(reach * 2)))
fall = Image.new("L", (W, H), 255)
fall.paste(g.point(lambda v: min(255, int(v * 1.5))), (int(CX - reach), int(CY - reach)))
img = Image.composite(solid(rgb(P["ground"][1])), solid(rgb(P["ground"][0])), fall)
d = ImageDraw.Draw(img)
if not DAY:
    for _ in range(int(1000 * S * S) + 300):
        x, y = rng.random() * W, rng.random() * H
        v = rng.randint(80, 220)
        d.ellipse([x, y, x + 2 * S, y + 2 * S], fill=(v, v - 10, min(255, v + 25)))

# ---- Gas: soft blobs along three log-spiral arms, one mask per colour,
# blurred at two scales so the arms have both body and wisps.
ARMS, R0, GROW, TURNS = 3, 70 * S, 0.82, 2.0
masks = [Image.new("L", (W, H), 0) for _ in P["gas"]]
draws = [ImageDraw.Draw(m) for m in masks]
for arm in range(ARMS):
    for _ in range(int(5200 * S) + 600):
        t = rng.random() ** 0.8 * TURNS * 2 * math.pi
        a = t + arm * 2 * math.pi / ARMS + rng.gauss(0, 0.11)
        r = R0 * math.exp(GROW * t / math.pi) * rng.uniform(0.9, 1.12)
        x, y = at(a, r)
        s = (10 + r * 0.08) * rng.uniform(0.5, 1.6)
        k = (arm + (1 if t > TURNS * math.pi else 0) + (2 if rng.random() < 0.12 else 0)) % len(masks)
        draws[k].ellipse([x - s, y - s * TILT, x + s, y + s * TILT], fill=rng.randint(20, 70))
for m, col in zip(masks, P["gas"]):
    wide = m.filter(ImageFilter.GaussianBlur(60 * S))
    fine = m.filter(ImageFilter.GaussianBlur(10 * S))
    img = Image.composite(solid(rgb(col)), img, wide.point(lambda v: min(255, int(v * 1.7))))
    img = Image.composite(solid(rgb(col)), img, fine.point(lambda v: min(255, int(v * 1.1))))

# ---- Dust: fine gold specks strung along the arms, thicker toward the well.
dust = Image.new("L", (W, H), 0)
dd = ImageDraw.Draw(dust)
for _ in range(int(16000 * S) + 3000):
    arm = rng.randrange(ARMS)
    t = rng.random() ** 1.2 * TURNS * 2 * math.pi
    a = t + arm * 2 * math.pi / ARMS + rng.gauss(0, 0.1)
    r = R0 * math.exp(GROW * t / math.pi) * rng.uniform(0.95, 1.06)
    x, y = at(a, r)
    s = rng.uniform(0.8, 2.6) * S
    dd.ellipse([x - s, y - s, x + s, y + s], fill=rng.randint(120, 255))
img = Image.composite(solid(rgb(P["dust"])), img, dust.filter(ImageFilter.GaussianBlur(0.7 * S)))
if not DAY:
    img = Image.composite(solid(rgb(P["dust"])), img, dust.filter(ImageFilter.GaussianBlur(6 * S)).point(lambda v: int(v * 0.5)))

# ---- The well: a dark lens with a thin gold ring at its lip.
wr = 70 * S
well = Image.new("L", (W, H), 0)
ImageDraw.Draw(well).ellipse([CX - wr * 1.4, CY - wr * 0.85, CX + wr * 1.4, CY + wr * 0.85], fill=255)
img = Image.composite(solid(rgb(P["ring"])), img, well.filter(ImageFilter.GaussianBlur(26 * S)).point(lambda v: int(v * 0.55)))
img = Image.composite(solid(rgb(P["well"])), img, well.filter(ImageFilter.GaussianBlur(5 * S)))
ring = Image.new("L", (W, H), 0)
ImageDraw.Draw(ring).ellipse([CX - wr * 1.75, CY - wr * 1.0, CX + wr * 1.75, CY + wr * 1.0], outline=255, width=max(1, int(3 * S)))
img = Image.composite(solid(rgb(P["ring"])), img, ring.filter(ImageFilter.GaussianBlur(1.5 * S)))

# ---- Vignette and grain.
vig = Image.new("L", (W, H), 255)
ImageDraw.Draw(vig).ellipse([-W * 0.1, -H * 0.15, W * 1.1, H * 1.15], fill=0)
vig = vig.filter(ImageFilter.GaussianBlur(260 * S))
img = Image.composite(solid((60, 50, 40) if DAY else (0, 0, 0)), img, vig.point(lambda v: int(v * (0.4 if DAY else 0.6))))
noise = Image.effect_noise((W, H), 40).convert("RGB")
img = Image.blend(img, ImageChops.overlay(img, noise), P["grain"] / 30)

img.save(OUT, quality=90)
print(OUT)
