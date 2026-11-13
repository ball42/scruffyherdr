"""Render an original asteroid-field wallpaper: big cratered rocks at several
depths, all lit from the left by a distant star, with drifts of dust and
gravel between them; or with --day the same field close in to the star, a
bright washed-out grey-brown, mid-toned so it still shows through the
terminals.

Usage: python3 scripts/asteroid-belt.py [--day] OUT.jpg [WIDTH HEIGHT]
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

# Each palette: the space behind (centre, edge), the star (core, glow, how
# wide), the dust band, rock (shadow, lit) far to near, the haze laid over
# far rocks, stars in the background, grain.
NIGHT = dict(
    space=("#0d0f14", "#040507"),
    star=((255, 246, 226), (255, 214, 160), 1.0),
    dust=(150, 128, 104),
    dust_alpha=34,
    rock=[("#14130f", "#545046"), ("#110f0d", "#78705e"), ("#0c0b09", "#a09078"), ("#090807", "#bcaa8a")],
    haze=(26, 24, 22),
    stars=True,
    grain=4,
)
NOON = dict(
    space=("#a8a196", "#7c756c"),
    star=((255, 252, 244), (246, 232, 206), 2.6),
    dust=(214, 200, 180),
    dust_alpha=50,
    rock=[("#8a8278", "#b4a99a"), ("#766e64", "#beb2a0"), ("#635b52", "#c8baa4"), ("#544c44", "#d0c0a6")],
    haze=(176, 168, 156),
    stars=False,
    grain=3,
)
P = NOON if DAY else NIGHT
rng = random.Random(3720)
STAR = (0.015, 0.44)  # off the left edge, a third of the way down
LIGHT = (-0.94, -0.33)  # roughly where the light comes from, for the gravel


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), tuple(col) + (0,))
    return lay, ImageDraw.Draw(lay)


def space():
    """The dark behind: brighter toward the star, a radial falloff drawn in rings."""
    centre, edge = hexrgb(P["space"][0]), hexrgb(P["space"][1])
    img = Image.new("RGBA", (W, H), edge + (255,))
    d = ImageDraw.Draw(img)
    sx, sy = STAR[0] * W, STAR[1] * H
    R = math.hypot(W, H) * 1.05
    for k in range(120, 0, -1):
        r = R * k / 120
        d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=lerp(centre, edge, (k / 120) ** 0.8) + (255,))
    return img.filter(ImageFilter.GaussianBlur(20 * S))


def starfield(img):
    lay, d = layer((255, 255, 255))
    for _ in range(1400):
        x, y = rng.random() * W, rng.random() * H
        r = rng.choice([0.6, 0.8, 1.0, 1.0, 1.4, 2.0]) * S
        a = int(rng.uniform(40, 200) * (r / (2 * S)) ** 0.5)
        tint = rng.choice([(255, 255, 255), (220, 230, 255), (255, 236, 210)])
        d.ellipse([x - r, y - r, x + r, y + r], fill=tint + (a,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(0.4 * S)))


def star(img):
    core, glow, spread = P["star"]
    sx, sy = STAR[0] * W, STAR[1] * H
    for r, a, blur in ((900, 40, 300), (420, 90, 160), (180, 170, 60), (70, 255, 14)):
        lay, d = layer(glow if r > 100 else core)
        rr = r * S * spread ** 0.5
        d.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], fill=(glow if r > 100 else core) + (a,))
        img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(blur * S * spread ** 0.5)))


def dust(img):
    """A broad band of dust and gravel crossing the field on a slant, thicker at its middle."""
    c = P["dust"]
    lay, d = layer(c)
    for _ in range(320):
        t = rng.random()
        x = t * W * 1.2 - W * 0.1
        y = H * (0.30 + 0.38 * t) + rng.gauss(0, 0.11) * H
        r = rng.uniform(80, 320) * S
        d.ellipse([x - r * 1.8, y - r * 0.5, x + r * 1.8, y + r * 0.5], fill=c + (int(P["dust_alpha"] * rng.uniform(0.3, 1)),))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(90 * S)))


def shape(r, seed, lumps=1.0):
    """A rock's form: harmonics that push a circle in and out, a squash and a tilt."""
    rr = random.Random(seed)
    harm = [(k, rr.uniform(0, 6.28), rr.uniform(0.02, 0.12) * lumps / (k ** 0.6)) for k in range(2, 9)]
    return dict(r=r, harm=harm, squash=rr.uniform(0.62, 0.9), tilt=rr.uniform(0, math.pi))


def radius(sh, a):
    return sh["r"] * (1 + sum(amp * math.sin(k * a + ph) for k, ph, amp in sh["harm"]))


def outline(cx, cy, r, seed, lumps=1.0):
    """An irregular rock outline, as polygon points."""
    sh = shape(r, seed, lumps)
    c, s_ = math.cos(sh["tilt"]), math.sin(sh["tilt"])
    pts = []
    for i in range(160):
        a = i / 160 * 2 * math.pi
        m = radius(sh, a)
        x, y = math.cos(a) * m, math.sin(a) * m * sh["squash"]
        pts.append((cx + x * c - y * s_, cy + x * s_ + y * c))
    return pts


def rock(img, cx, cy, r, depth, seed):
    """A cratered rock, shaded pixel by pixel as a lumpy sphere lit from the
    star: a crisp terminator, craters whose far walls catch the light, bumps,
    and a haze over far ones. `depth` 0 is the farthest rank."""
    shadow, lit = (hexrgb(c) for c in P["rock"][depth])
    sh = shape(r, seed)
    co, si = math.cos(sh["tilt"]), math.sin(sh["tilt"])
    sq = sh["squash"]
    # light: toward the star, from a little in front
    lx, ly = STAR[0] * W - cx, STAR[1] * H - cy
    n = math.hypot(lx, ly) or 1
    L = (lx / n * 0.97, ly / n * 0.97, 0.22)
    rmax = r * 1.4
    x0, y0 = int(cx - rmax), int(cy - rmax)
    bw = bh = int(2 * rmax) + 1
    if x0 >= W or y0 >= H or x0 + bw <= 0 or y0 + bh <= 0:
        return
    rr = random.Random(seed + 5)
    # craters in the rock's own frame: (x, y, radius) as fractions of r
    craters = []
    for _ in range(int(3 + r / (18 * S)) if r > 14 * S else 0):
        a, dist = rr.uniform(0, 6.28), rr.random() ** 0.7 * 0.8
        c = (math.cos(a) * dist, math.sin(a) * dist, rr.uniform(0.04, 0.2) * (1 - dist * 0.4), rr.uniform(0, 6.28), rr.uniform(0.06, 0.16))
        # a few may nest, but none overlaps another's wall
        if all(math.hypot(c[0] - o[0], c[1] - o[1]) > (c[2] + o[2]) * 1.25 or math.hypot(c[0] - o[0], c[1] - o[1]) < o[2] - c[2] * 1.3
               for o in craters):
            craters.append(c)
    bumps = Image.effect_noise((12, 12), 60).resize((bw, bh), Image.BICUBIC)
    bump = bumps.load()
    fine = Image.effect_noise((max(2, bw // 6), max(2, bh // 6)), 50).resize((bw, bh), Image.BICUBIC)
    fn = fine.load()
    out = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    px = out.load()
    haze = P["haze"]
    fade = [0.55, 0.32, 0.12, 0.0][depth]
    for j in range(bh):
        dy = y0 + j - cy
        for i in range(bw):
            dx = x0 + i - cx
            # into the rock's frame: untilt, unsquash
            u = (dx * co + dy * si) / r
            v = (-dx * si + dy * co) / (r * sq)
            rho = math.hypot(u, v)
            a = math.atan2(v, u)
            R = radius(sh, a) / r
            if rho > R:
                continue
            q = rho / R
            nx, ny = u / R, v / R
            nz = math.sqrt(max(0.0, 1 - q * q))
            for (ccx, ccy, cr, cph, cwob) in craters:
                ex, ey = (u - ccx) / cr, (v - ccy) / cr
                d2 = ex * ex + ey * ey
                if d2 >= 1.7:
                    continue
                d2 /= (1 + cwob * math.sin(3 * math.atan2(ey, ex) + cph)) ** 2  # not quite round
                if d2 < 1.0:  # the bowl: its normal leans inward, softening toward the lip
                    k = 0.9 * (1 - max(0.0, d2 - 0.75) / 0.25 * 0.6)
                    nx -= ex * k
                    ny -= ey * k
                elif d2 < 1.5:  # the raised rim leans outward
                    k = (1.5 - d2) / 0.5
                    nx += ex * 0.2 * k
                    ny += ey * 0.2 * k
            # back to screen: retilt the normal
            sx = nx * co - ny * si
            sy = nx * si + ny * co
            nl = math.sqrt(sx * sx + sy * sy + nz * nz) or 1
            lam = (sx * L[0] + sy * L[1] + nz * L[2]) / nl
            b = (bump[i, j] - 128) / 128 * 0.22 + (fn[i, j] - 128) / 128 * 0.10
            t = max(0.0, lam + b * max(0.2, lam)) ** 0.9
            c = lerp(shadow, lit, t)
            if fade:
                c = lerp(c, haze, fade)
            edge = min(1.0, (R - rho) * r / (1.2 * S + 0.5))
            px[i, j] = c + (int(255 * edge),)
    img.alpha_composite(out, (max(0, x0), max(0, y0)), (max(0, -x0), max(0, -y0)))


def gravel(img, n, size, depth):
    """Small rocks between the big ones, scattered along the dust band."""
    for _ in range(n):
        t = rng.random()
        x = t * W * 1.2 - W * 0.1
        y = H * (0.30 + 0.38 * t) + rng.gauss(0, 0.16) * H
        rock(img, x, y, rng.uniform(*size) * S, depth, rng.randint(0, 10 ** 6))


img = space()
if P["stars"]:
    starfield(img)
star(img)
dust(img)
gravel(img, 240, (2, 6), 0)
# Ranks of rocks, far to near: (x, y, radius) in fractions of W and H, radius in 3024-px
FIELD = [
    [(0.20, 0.18, 70), (0.52, 0.40, 54), (0.70, 0.16, 80), (0.88, 0.48, 60), (0.36, 0.62, 48), (0.62, 0.70, 66), (0.08, 0.52, 42)],
    [(0.32, 0.30, 130), (0.80, 0.30, 150), (0.56, 0.58, 110), (0.16, 0.80, 120), (0.94, 0.80, 100)],
    gravel,
    [(0.62, 0.22, 260), (0.40, 0.80, 230), (1.02, 0.62, 300)],
    [(0.30, -0.04, 400), (0.84, 1.06, 480)],
]
seed = 1
for k, rank in enumerate(FIELD):
    if rank is gravel:
        gravel(img, 120, (6, 18), 1)
        dust(img)
        continue
    depth = min(k, 3) if k < 2 else k - 1
    for x, y, r in rank:
        rock(img, x * W, y * H, r * S, depth, seed)
        seed += 1
    if k == 1:
        gravel(img, 160, (3, 10), 1)
gravel(img, 30, (14, 36), 3)
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
