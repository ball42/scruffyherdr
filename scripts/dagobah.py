"""Render an original swamp-world wallpaper. The night picture is a misty
night of twisted trees, hanging moss and drifting bog lights over still water;
each tree layer fades into fog for depth, and the water mirrors what stands
above it. With --day it is a pale foggy noon from a root bank beside one giant
gnarled trunk, looking along a still channel that winds away between ranks of
trees into the fog, mid-toned so it still shows through the terminals.

Usage: python3 scripts/dagobah.py [--day] OUT.jpg [WIDTH HEIGHT]
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

# ---- Day: by a giant trunk on a still swamp channel. Runs and exits before the night code below.
DAY_SKY = [(0.0, "#9fb39f"), (0.40, "#b8c6b0"), (0.70, "#c7d0bb"), (1.0, "#b5c1a9")]
DAY_FOG = "#d2d9c6"
DAY_LAYERS = ["#a3b29a", "#8e9f86", "#798c72", "#64785f", "#50644c"]
DAY_WATER = "#8b9a84"


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


def blur(im, r):
    """Gaussian blur on premultiplied alpha, so transparent pixels don't bleed a dark fringe."""
    if im.mode != "RGBA":
        return im.filter(ImageFilter.GaussianBlur(r))
    return im.convert("RGBa").filter(ImageFilter.GaussianBlur(r)).convert("RGBA")


def day_tree(d, x, ground, top, w, col, sway, r, roots=5, crown=14):
    n = 80
    left, right = [], []
    for s in range(n):
        t = s / (n - 1)
        cx = x + sway * math.sin(t * math.pi * 1.25) + sway * 0.25 * math.sin(t * 7)
        cy = ground - (ground - top) * t
        ww = w * (1.7 - t * 0.95) * (1 + 0.6 * max(0, 0.12 - t) / 0.12)
        left.append((cx - ww / 2, cy))
        right.append((cx + ww / 2, cy))
    d.polygon(left + right[::-1], fill=col)
    for _ in range(roots):
        rx = x + r.uniform(-1, 1) * w * 2.6
        d.line([(x, ground - 30 * S), ((x + rx) / 2, ground - r.uniform(10, 40) * S), (rx, ground + r.uniform(10, 30) * S)],
               fill=col, width=max(2, int(w * 0.18)), joint="curve")
    crown_x = x + sway * math.sin(math.pi * 1.25)
    for _ in range(crown):
        bx = crown_x + r.uniform(-1, 1) * w * 5
        by = top + r.uniform(-0.6, 1.2) * w * 1.6
        br = r.uniform(0.9, 2.0) * w * 1.3
        d.ellipse([bx - br, by - br * 0.55, bx + br, by + br * 0.55], fill=col)
        for _ in range(4):
            mx = bx + r.uniform(-br, br) * 0.8
            length = r.uniform(0.6, 2.4) * w * 1.6
            d.line([(mx, by), (mx + r.uniform(-4, 4) * S, by + length)], fill=col, width=max(1, int(3 * S)))


def root(d, p0, p1, p2, w0, col, n=30, taper=0.8):
    """A tapered curving root: quadratic bezier p0->p2 via p1, width w0 -> w0*0.2."""
    left, right = [], []
    for k in range(n + 1):
        t = k / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
        dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        w = w0 * (1 - taper * t) / 2
        left.append((x + nx * w, y + ny * w)); right.append((x - nx * w, y - ny * w))
    d.polygon(left + right[::-1], fill=col)
    return right


def fogband(img, y0, y1, a, rad=60):
    lay, d = new_layer(DAY_FOG)
    d.rectangle([0, y0, W, y1], fill=rgb_of(DAY_FOG) + (a,))
    img.alpha_composite(blur(lay, rad * S))


def day_shafts(img, n, a, r, x0=0.1, x1=0.9, lean=300):
    lay, d = new_layer((255, 252, 230))
    for _ in range(n):
        x = r.uniform(x0, x1) * W
        w = r.uniform(60, 180) * S
        d.polygon([(x, 0), (x + w, 0), (x + w + lean * S, H * 0.85), (x + lean * S, H * 0.85)], fill=(255, 252, 230, a))
    img.alpha_composite(blur(lay, 40 * S))


def day():
    img = sky_gradient(DAY_SKY)
    day_shafts(img, 5, 40, random.Random(2), 0.35, 0.9)
    water_y = H * 0.66
    # ranks of trees along a channel that bends away to the right of centre
    for i, c in enumerate(DAY_LAYERS[:4]):
        r = random.Random(30 + i)
        lay, d = new_layer(c)
        col = rgb_of(c) + (255,)
        gy = water_y - (3 - i) * 12 * S
        for _ in range(5 + i * 2):
            f = r.uniform(-0.05, 1.05)
            if i <= 1 and 0.53 < f < 0.62:  # keep the channel's far end open
                continue
            w = (14 + i * 10) * S * r.uniform(0.8, 1.25)
            day_tree(d, f * W, gy, H * r.uniform(0.02, 0.2) + i * 8 * S, w, col, r.uniform(-50, 50) * S, r)
        for _ in range(60 + 40 * i):
            rx = r.random() * W
            if 0.52 * W < rx < 0.64 * W:
                continue
            d.line([(rx, gy), (rx + r.uniform(-6, 6) * S, gy - r.uniform(10, 40 + i * 18) * S)], fill=col, width=max(1, int(2 * S)))
        img.alpha_composite(lay)
        fogband(img, H * 0.12, H, [150, 115, 80, 45][i])
    # still water, mirroring the trees
    line = int(water_y)
    above = img.crop((0, line - (H - line), W, line)).transpose(Image.FLIP_TOP_BOTTOM)
    above.alpha_composite(Image.new("RGBA", above.size, rgb_of(DAY_WATER) + (120,)))
    above = blur(above, 3 * S)
    img.paste(above, (0, line))
    # the channel's open water: brighter where it catches the fog light
    lay, d = new_layer(DAY_FOG)
    d.polygon([(W * 0.53, water_y), (W * 0.63, water_y), (W * 0.95, H), (W * 0.30, H)], fill=rgb_of("#dfe4d4") + (90,))
    img.alpha_composite(blur(lay, 30 * S))
    r = random.Random(5)
    lay, d = new_layer()
    for _ in range(260):
        y = water_y + (H - water_y) * r.random() ** 1.4
        x = r.random() * W
        L = r.uniform(30, 160) * S * (0.4 + (y - water_y) / (H - water_y))
        d.line([(x, y), (x + L, y)], fill=rgb_of(DAY_FOG) + (r.randint(30, 80),), width=max(1, int(2 * S)))
    img.alpha_composite(blur(lay, 1 * S))
    # mud banks with reeds edging the channel
    for side in (-1, 1):
        lay, d = new_layer()
        if side < 0:
            bank = [(0, water_y + 8 * S), (W * 0.52, water_y + 4 * S), (W * 0.40, water_y + 60 * S), (W * 0.22, H * 0.82), (0, H * 0.86)]
        else:
            bank = [(W * 0.64, water_y + 4 * S), (W, water_y + 6 * S), (W, H * 0.76), (W * 0.86, H * 0.74), (W * 0.72, water_y + 40 * S)]
        d.polygon(bank, fill=(108, 124, 96, 230))
        for _ in range(160):
            r.random()
            bx = bank[0][0] + (bank[1][0] - bank[0][0]) * r.random() if side > 0 else r.uniform(0, W * 0.5)
            by = max(water_y, min(H * 0.84, water_y + r.uniform(0, 1) ** 2 * (H * 0.2))) if side < 0 else water_y + r.uniform(0, 1) ** 2 * H * 0.08
            if side > 0:
                bx = r.uniform(W * 0.68, W)
            hgt = (20 + 140 * (by - water_y) / (H * 0.2)) * S
            d.line([(bx, by), (bx + r.uniform(-10, 10) * S, by - hgt)], fill=(96, 114, 84, 220), width=max(1, int(3 * S)))
        img.alpha_composite(blur(lay, 1 * S))
    # lily pads drifting on the channel
    lay, d = new_layer()
    for _ in range(40):
        y = water_y + (H - water_y) * (0.15 + 0.85 * r.random() ** 0.8)
        f = (y - water_y) / (H - water_y)
        x = r.uniform(0.3, 0.95) * W
        rr = (8 + 40 * f) * S
        d.pieslice([x - rr, y - rr * 0.32, x + rr, y + rr * 0.32], r.uniform(0, 360), r.uniform(0, 360) + 320, fill=(96, 122, 84, 230))
    img.alpha_composite(lay)
    # the near giant: a gnarled trunk up the left, roots plunging into the water
    lay, d = new_layer()
    near = (70, 90, 66, 255)
    tx = W * 0.10
    pts_l, pts_r = [], []
    for k in range(90):
        t = k / 89
        y = H * 1.02 - H * 1.1 * t
        cx = tx + 70 * S * math.sin(t * 4.2) + 30 * S * math.sin(t * 11)
        ww = W * (0.17 - 0.05 * t) * (1 + 0.9 * max(0, 0.22 - t) / 0.22)
        pts_l.append((cx - ww / 2, y)); pts_r.append((cx + ww / 2, y))
    d.polygon(pts_l + pts_r[::-1], fill=near)
    for k in range(6):
        y0 = H * r.uniform(0.62, 0.80)
        x1 = tx + r.uniform(0.10, 0.30) * W
        y1 = H * r.uniform(0.80, 1.04)
        root(d, (tx + W * 0.04, y0), (x1 - W * 0.04, y0 - r.uniform(20, 80) * S), (x1, y1), r.uniform(50, 110) * S, near)
    img.alpha_composite(lay)
    # bark: long furrows, a lit edge on the side facing the channel, moss
    lay, d = new_layer()
    for _ in range(40):
        x = tx + r.uniform(-0.12, 0.12) * W
        pts = []
        y = H
        while y > 0:
            pts.append((x, y))
            y -= r.uniform(40, 90) * S
            x += r.uniform(-12, 12) * S
        d.line(pts, fill=(52, 68, 50, r.randint(80, 160)), width=int(r.uniform(3, 9) * S))
    d.line([(x + 6 * S, y) for x, y in pts_r], fill=(176, 192, 160, 160), width=int(14 * S))
    for _ in range(50):  # moss runs: short soft vertical streaks
        x = r.uniform(-0.02, 0.22) * W
        y = r.uniform(0.0, 0.85) * H
        d.line([(x, y), (x + r.uniform(-8, 8) * S, y + r.uniform(60, 220) * S)], fill=(124, 148, 100, r.randint(50, 110)),
               width=int(r.uniform(5, 12) * S))
    a = Image.new("L", (W, H), 0)
    tm = poly_mask(pts_l + pts_r[::-1])
    a.paste(lay.getchannel("A"), (0, 0), tm)
    lay.putalpha(a)
    img.alpha_composite(blur(lay, 5 * S))
    # moss curtains hanging into the top of the frame from unseen limbs
    lay, d = new_layer()
    for _ in range(140):
        x = r.uniform(0, W * 0.75)
        L = r.uniform(80, 520) * S * (1.2 - x / W)
        d.line([(x, -10), (x + r.uniform(-10, 10) * S, L)], fill=(92, 112, 84, r.randint(120, 220)), width=int(r.uniform(2, 6) * S))
    d.ellipse([-W * 0.1, -H * 0.12, W * 0.40, H * 0.06], fill=(80, 100, 74, 255))
    img.alpha_composite(blur(lay, 1.2 * S))
    # firefly-gold wisps, a few, over the water
    for x, y in ((0.58, 0.74), (0.71, 0.82), (0.47, 0.88)):
        soft_glow(img, x * W, y * H, 5 * S, (243, 225, 160), 200)
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
# Each palette: sky stops, a few stars, the fog the far layers sink into,
# five tree layers far to near, the water, bog lights (colour, count), light
# shafts, and grain.
NIGHT = dict(
    sky=[(0.0, "#04080a"), (0.35, "#0b1614"), (0.62, "#16271f"), (1.0, "#101c17")],
    stars=60,
    fog="#2e4a3c",
    fog_alpha=[120, 90, 60, 35, 0],
    layers=["#22362d", "#1a2c24", "#13221c", "#0c1712", "#060c09"],
    water="#0b1612",
    wisps=("#e9cf78", 22),
    shafts=0,
    grain=5,
)
P = NIGHT
WATER = 0.80  # where the water starts, as a frame fraction
rng = random.Random(11)


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
    img = img.convert("RGBA")
    d = ImageDraw.Draw(img)
    for _ in range(P["stars"]):
        x, y = rng.random() * W, rng.random() ** 2 * H * 0.3
        r = rng.choice([0.8, 1.1, 1.5]) * S * 1.4
        b = int(rng.uniform(90, 170))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(b, b + 8, b, 255))
    return img


def tree(d, x, ground, top, w, col, sway):
    """A twisted trunk that splits into roots, under a crown of moss-hung blobs."""
    n = 80
    left, right = [], []
    for s in range(n):
        t = s / (n - 1)
        cx = x + sway * math.sin(t * math.pi * 1.25) + sway * 0.25 * math.sin(t * 7)
        cy = ground - (ground - top) * t
        ww = w * (1.7 - t * 0.95) * (1 + 0.6 * max(0, 0.12 - t) / 0.12)  # flared base
        left.append((cx - ww / 2, cy))
        right.append((cx + ww / 2, cy))
    d.polygon(left + right[::-1], fill=col)
    # roots arching into the water
    for r in range(5):
        rx = x + rng.uniform(-1, 1) * w * 2.6
        d.line([(x, ground - 30 * S), ((x + rx) / 2, ground - rng.uniform(10, 40) * S), (rx, ground + rng.uniform(10, 30) * S)],
               fill=col, width=max(2, int(w * 0.18)), joint="curve")
    # crown: low wide blobs, with moss hanging off them
    crown_x = x + sway * math.sin(math.pi * 1.25)
    for b in range(14):
        bx = crown_x + rng.uniform(-1, 1) * w * 5
        by = top + rng.uniform(-0.6, 1.2) * w * 1.6
        br = rng.uniform(0.9, 2.0) * w * 1.3
        d.ellipse([bx - br, by - br * 0.55, bx + br, by + br * 0.55], fill=col)
        for m in range(4):
            mx = bx + rng.uniform(-br, br) * 0.8
            length = rng.uniform(0.6, 2.4) * w * 1.6
            d.line([(mx, by), (mx + rng.uniform(-4, 4) * S, by + length)], fill=col, width=max(1, int(3 * S)))


def layers(img):
    fog = hexrgb(P["fog"])
    ground = H * WATER
    for i, c in enumerate(P["layers"]):
        col = hexrgb(c) + (255,)
        lay = Image.new("RGBA", (W, H), hexrgb(c) + (0,))
        d = ImageDraw.Draw(lay)
        count = 3 + i
        slots = sorted(rng.uniform(-0.05, 1.05) for _ in range(count))
        for k, f in enumerate(slots):
            # keep the middle of the frame clear for the nearest trees
            if i >= 3 and 0.28 < f < 0.72:
                f = 0.12 if f < 0.5 else 0.9
            w = (16 + i * 11) * S * rng.uniform(0.8, 1.25)
            top = H * rng.uniform(0.04, 0.24) + i * 10 * S
            tree(d, f * W, ground + i * 6 * S, top, w, col, rng.uniform(-50, 50) * S)
        # a bank of reeds and mud along the waterline
        for _ in range(int(60 * (1 + i))):
            rx = rng.random() * W
            d.line([(rx, ground + i * 6 * S), (rx + rng.uniform(-6, 6) * S, ground - rng.uniform(10, 50 + i * 20) * S)],
                   fill=col, width=max(1, int(2 * S)))
        img.alpha_composite(lay)
        a = P["fog_alpha"][i]
        if a:
            fl = Image.new("RGBA", (W, H), fog + (0,))
            ImageDraw.Draw(fl).rectangle([0, H * 0.18, W, H], fill=fog + (a,))
            img.alpha_composite(fl.filter(ImageFilter.GaussianBlur(60 * S)))


def water(img):
    """Mirror everything above the waterline, darken and blur it, then ripple."""
    line = int(H * WATER)
    above = img.crop((0, line - (H - line), W, line)).transpose(Image.FLIP_TOP_BOTTOM)
    tint = Image.new("RGBA", above.size, hexrgb(P["water"]) + (150,))
    above.alpha_composite(tint)
    above = above.filter(ImageFilter.GaussianBlur(3 * S))
    d = ImageDraw.Draw(above)
    fog = hexrgb(P["fog"])
    for _ in range(int(220 * S * S * 4)):
        y = rng.random() * above.height
        x = rng.random() * W
        d.line([(x, y), (x + rng.uniform(30, 140) * S, y)], fill=fog + (int(rng.uniform(20, 60)),), width=max(1, int(1.5 * S)))
    img.paste(above, (0, line))


def wisps(img):
    col, n = P["wisps"]
    col = hexrgb(col)
    for _ in range(n):
        x, y = rng.uniform(0.04, 0.96) * W, rng.uniform(0.5, 0.9) * H
        r = rng.uniform(3, 6) * S
        g = Image.new("RGBA", (W, H), col + (0,))
        ImageDraw.Draw(g).ellipse([x - r * 5, y - r * 5, x + r * 5, y + r * 5], fill=col + (60,))
        g = g.filter(ImageFilter.GaussianBlur(r * 2.5))
        ImageDraw.Draw(g).ellipse([x - r, y - r, x + r, y + r], fill=col + (235,))
        img.alpha_composite(g)


def shafts(img):
    if not P["shafts"]:
        return
    lay = Image.new("RGBA", (W, H), (255, 252, 230, 0))
    d = ImageDraw.Draw(lay)
    for _ in range(6):
        x = rng.uniform(0.1, 0.9) * W
        w = rng.uniform(60, 160) * S
        d.polygon([(x, 0), (x + w, 0), (x + w + 300 * S, H * 0.8), (x + 300 * S, H * 0.8)], fill=(255, 252, 230, P["shafts"]))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(40 * S)))


img = sky()
shafts(img)
layers(img)
water(img)
wisps(img)
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
