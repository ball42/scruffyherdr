"""Render an original cloud-world wallpaper: a sea of billowing cloud at
sunset under a floating city on its long stalk. Cloud banks lit from above
and shaded below fade into haze for depth.

With --day, the view is from the rail on the rim of an open deck high above
a pink cloud sea, the sun low at the left in haze, towering cumulus rising
out of the sea, lit on the sun side and shaded in their creases.

Usage: python3 scripts/bespin.py [--day] OUT.jpg [WIDTH HEIGHT]
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
S = W / 3024  # scale for sizes drawn in 3024-wide pixels

# ---- Day: deck edge, at the rail on the rim of an open deck. Runs and exits before the night code below.
# The sun hangs low at the left in haze; great cumulus towers, built from
# sunlit lobes with shaded sides and dark creases, rise out of a sea of puffs.
DAY_SKY = [(0.0, "#5f6eb0"), (0.30, "#9a8cc4"), (0.48, "#d29fb4"), (0.60, "#eab59c"), (1.0, "#e0a88c")]
DAY_HAZE = "#efc9c4"
DAY_BANKS = [("#f2cdd0", "#c797a8"), ("#ebbcc2", "#b8869a"), ("#e1a9b4", "#a77088"), ("#d496a6", "#a06a84"), ("#c3839a", "#905f7c")]
DAY_FADE = [0.45, 0.3, 0.18, 0.08, 0.0]
LIGHT = (-0.78, -0.62)  # unit vector towards the sun, in screen space


def day_hex(h):
    if isinstance(h, tuple):
        return h
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def day_lerp(a, b, t):
    a, b = (day_hex(c) if isinstance(c, str) else c for c in (a, b))
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def day_layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), col + (0,))
    return lay, ImageDraw.Draw(lay)


def day_blur(im, r):
    """Gaussian blur on premultiplied alpha, so transparent pixels don't bleed a dark fringe."""
    return im.convert("RGBa").filter(ImageFilter.GaussianBlur(r)).convert("RGBA")


def day_sky(stops):
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    st = [(p, day_hex(c)) for p, c in stops]
    for y in range(H):
        f = y / H
        col = st[-1][1]
        for (p0, c0), (p1, c1) in zip(st, st[1:]):
            if p0 <= f <= p1:
                col = day_lerp(c0, c1, (f - p0) / max(p1 - p0, 1e-6))
                break
        d.line([(0, y), (W, y)], fill=col + (255,))
    return img


def day_glow(img, x, y, r, c, a):
    c = day_hex(c)
    for rr, aa, bl in ((r * 7, a // 6, 0.6), (r * 2.6, a // 2, 0.5), (r, a, 0.1)):
        g = Image.new("RGBA", (W, H), c + (0,))
        ImageDraw.Draw(g).ellipse([x - rr, y - rr, x + rr, y + rr], fill=c + (aa,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(max(1, rr * bl))))


def day_vfade(img, col, y0, y1, a0, a1):
    """A haze band whose alpha runs a0 to a1 from y0 to y1."""
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    for y in range(H):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        d.line([(0, y), (W, y)], fill=int(a0 + (a1 - a0) * t))
    lay = Image.new("RGBA", (W, H), day_hex(col) + (0,))
    lay.putalpha(m)
    img.alpha_composite(lay)


def hump(hf, am, cx, cy, rx, ry, hs, add, power=0.5):
    """Raise a dome (crown height hs, in half-pixel 8-bit units) on the height
    field hf and mark its footprint in am. add stacks it on what is there,
    else the higher wins."""
    x0, y0 = int(cx - rx), int(cy - ry)
    tw, th = max(2, int(2 * rx)), max(2, int(2 * ry))
    box = (max(0, x0), max(0, y0), min(W, x0 + tw), min(H, y0 + th))
    if box[2] <= box[0] or box[3] <= box[1]:
        return
    dome = Image.radial_gradient("L").resize((tw, th), Image.BILINEAR)
    dome = dome.point([int(min(255, hs * 0.5 * (1 - dn * dn) ** power)) if dn < 1 else 0 for dn in (v / 255 * math.sqrt(2) for v in range(256))])
    sub = dome.crop((box[0] - x0, box[1] - y0, box[2] - x0, box[3] - y0))
    cur = hf.crop(box)
    hf.paste(ImageChops.add(cur, sub) if add else ImageChops.lighter(cur, sub), box[:2])
    foot = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(foot).ellipse([0, 0, tw - 1, th - 1], fill=255)
    foot = foot.crop((box[0] - x0, box[1] - y0, box[2] - x0, box[3] - y0))
    am.paste(ImageChops.lighter(am.crop(box), foot), box[:2])


def lit_cloud(img, hf, am, dark, mid, lit, dusk=None, k=6, gain=2.4, ao=2.0, soften=3):
    """Light a height field from the sun: slopes facing it go to lit, slopes
    away from it to dark, flat to mid, and the valleys between domes darker still.
    dark, mid and lit are colours or full-frame images. Softening the field
    first turns the seams between domes into soft creases."""
    k = max(1, int(k * S))
    hf = hf.filter(ImageFilter.GaussianBlur(soften * S))
    dx, dy = LIGHT[0] * k, LIGHT[1] * k
    ahead = ImageChops.offset(hf, round(dx), round(dy))
    behind = ImageChops.offset(hf, -round(dx), -round(dy))
    v = ImageChops.subtract(ahead, behind, 1 / gain, 128).filter(ImageFilter.GaussianBlur(1.3 * S))
    crease = ImageChops.subtract(hf.filter(ImageFilter.GaussianBlur(16 * S)), hf, 1 / ao)
    v = ImageChops.subtract(v, crease)
    if dusk is not None:
        v = ImageChops.subtract(v, dusk)
    up = v.point(lambda x: max(0, (x - 128) * 2))
    down = v.point(lambda x: max(0, (128 - x) * 2))
    ims = [c if isinstance(c, Image.Image) else Image.new("RGB", (W, H), c) for c in (dark, mid, lit)]
    col = Image.composite(ims[0], Image.composite(ims[2], ims[1], up), down).convert("RGBA")
    col.putalpha(am.filter(ImageFilter.GaussianBlur(1.1 * S)))
    img.alpha_composite(col)


def ramp_image(top, bottom, y0, span, ease=0.8):
    """A full-frame vertical gradient from top colour to bottom colour."""
    g = Image.new("RGB", (W, H))
    gd = ImageDraw.Draw(g)
    for y in range(H):
        gd.line([(0, y), (W, y)], fill=day_lerp(top, bottom, min(1, max(0, (y - y0) / span)) ** ease))
    return g


def hramp_image(left, right, x0, x1):
    """A full-frame horizontal gradient from left colour to right colour."""
    g = Image.new("RGB", (W, H))
    gd = ImageDraw.Draw(g)
    for x in range(W):
        gd.line([(x, 0), (x, H)], fill=day_lerp(left, right, min(1, max(0, (x - x0) / (x1 - x0)))))
    return g


def day_bank(img, i, top, size, rng, x0=None, x1=None, fade=None):
    """A bank of a few large, low domes with a lit top edge and a soft shaded trough."""
    fd = DAY_FADE[i] if fade is None else fade
    lit, shade = (day_lerp(c, DAY_HAZE, fd) for c in DAY_BANKS[i])
    x0 = -size if x0 is None else x0
    x1 = W + size if x1 is None else x1
    hf = Image.new("L", (W, H), 0)
    am = Image.new("L", (W, H), 0)
    pd = ImageDraw.Draw(hf)
    for y in range(max(0, int(top - size * 0.2)), H):  # the body's own height, rising under the domes
        f = min(1, max(0, (y - (top - size * 0.2)) / (size * 0.6))) ** 0.8
        pd.line([(x0, y), (x1, y)], fill=int(min(255, size * 0.8) * f))
    x = x0
    while x < x1:
        r = size * rng.uniform(1.0, 1.5)
        hump(hf, am, x, top + rng.uniform(-0.25, 0.25) * size, r, r * 0.6, r * 0.55, False)
        x += r * rng.uniform(0.8, 1.15)
    ImageDraw.Draw(am).rectangle([x0, top + size * 0.3, x1, H], fill=255)
    y0, span = int(top - size * 1.4), size * 1.8
    mid = ramp_image(day_lerp(lit, "#fff1e0", 0.5 * (1 - fd)), shade, y0, span, 1.0)
    dark = ramp_image(day_lerp(lit, shade, 0.6), day_lerp(shade, "#6a4a80", 0.5), y0, span)
    bright = ramp_image(day_lerp(lit, "#fff6ea", 0.8 * (1 - fd)), day_lerp(lit, shade, 0.4), y0, span)
    lit_cloud(img, hf, am, dark, mid, bright, gain=2.4, ao=1.0, soften=4)


# tower plan: (height fraction, half width, lobe radius, lobes), all but the fraction in units of wid
TOWER = [(0.10, 0.95, 0.40, 3), (0.34, 0.76, 0.37, 2), (0.57, 0.68, 0.36, 2), (0.76, 0.74, 0.38, 3), (0.91, 0.40, 0.46, 1)]


def day_tower(img, cx, base, top, wid, i, rng):
    """A cumulus tower: a few tiers of large lobes merged into one mass, a
    broad billowing crown on a narrower column, a few small buds on the
    sunward crown, a flat base. Lit cream on the left, shading to violet on
    the right and underneath."""
    fd = DAY_FADE[i]
    lit, shade = (day_lerp(c, DAY_HAZE, fd) for c in DAY_BANKS[i])
    ht = base - top
    hf = Image.new("L", (W, H), 0)
    am = Image.new("L", (W, H), 0)
    lobes = []
    lumps = []
    buds = []
    for t, hw, rr, n in TOWER:
        shift = rng.uniform(-0.1, 0.1) * wid * (0.3 if t > 0.9 else 1)
        hw *= rng.uniform(0.88, 1.1)
        r0 = rr * wid
        span = max(0, hw * wid - r0)
        n = 1 if n == 1 else max(2, int(math.ceil(2 * span / (1.5 * r0))) + 1)
        for k in range(n):
            u = k / (n - 1) * 2 - 1 if n > 1 else 0
            r = r0 * rng.uniform(0.8, 1.2) * (1.12 if n > 1 and k in (0, n - 1) and t > 0.7 else 1)
            px = cx + shift + u * span + rng.uniform(-0.1, 0.1) * r
            py = min(base - r * 0.35, base - t * ht + rng.uniform(-0.3, 0.25) * r)
            ImageDraw.Draw(am).ellipse([px - r, py - r, px + r, py + r], fill=255)
            lumps.append((px, py, r))
            lobes.append((px, py, r, t))
    for px, py, r, t in lobes:  # bumps along the outline only, never in the interior
        for _ in range(5 if t > 0.7 else 4):
            a = math.radians(rng.uniform(-215, 35 if t > 0.7 else -10))
            br = r * rng.uniform(0.2, 0.34)
            bx, by = px + math.cos(a) * r * 0.88, py + math.sin(a) * r * 0.88
            if all(math.hypot(bx - qx, by - qy) > qr * 0.92 + br * 0.3 for qx, qy, qr, _ in lobes if (qx, qy) != (px, py)) and by < base - br:
                buds.append((bx, by, br))
    # one inflated mass: the footprint of all the lobes, blurred into a smooth swell,
    # with soft round lumps on it. No edges inside, so no outlines inside.
    hf = am.filter(ImageFilter.GaussianBlur(0.16 * wid)).point(lambda v: v // 2)
    for px, py, r in lumps:
        hump(hf, am, px, py, r * 0.85, r * 0.85, r * 1.0, True, 1.5)
    for bx, by, br in buds:
        hump(hf, am, bx, by, br, br, br * 0.8, True)
    cut = Image.new("L", (W, H), 0)  # a flat base
    ImageDraw.Draw(cut).rectangle([0, 0, W, base], fill=255)
    am = ImageChops.multiply(am, cut.filter(ImageFilter.GaussianBlur(2 * S)))
    dusk = Image.new("L", (W, H), 0)  # darker low down, most of all under the base
    dd = ImageDraw.Draw(dusk)
    for y in range(int(top - wid), int(base) + 1):
        dd.line([(0, y), (W, y)], fill=int(max(0, (y - top) / ht - 0.3) ** 1.5 * 80))
    bright = day_lerp(lit, "#fff8ee", 0.95 * (1 - fd))
    x0, x1 = cx - wid, cx + wid  # the broad gradient: lit left, shaded right
    mid = hramp_image(day_lerp(bright, day_lerp(lit, shade, 0.3), 0.4), day_lerp(shade, "#9a78b0", 0.4), x0, x1)
    dark = hramp_image(day_lerp(shade, "#a88ac0", 0.5), day_lerp(shade, "#6a4e8c", 0.55), x0, x1)
    lit_cloud(img, hf, am, dark, mid, bright, dusk, gain=3.0, ao=2.0, soften=0.5)


def day():
    img = day_sky(DAY_SKY)
    day_glow(img, W * 0.24, H * 0.36, W * 0.04, "#fff3dc", 210)
    r = random.Random(3)
    day_bank(img, 0, H * 0.58, 55 * S, r)
    day_tower(img, W * 0.68, H * 0.60, H * 0.20, 380 * S, 0, r)
    day_tower(img, W * 0.93, H * 0.62, H * 0.34, 260 * S, 1, r)
    day_bank(img, 1, H * 0.63, 90 * S, r)
    day_tower(img, W * 0.08, H * 0.70, H * 0.40, 300 * S, 1, r)
    day_bank(img, 2, H * 0.70, 140 * S, r)
    day_bank(img, 3, H * 0.78, 190 * S, r)
    day_bank(img, 4, H * 0.88, 220 * S, r)
    day_vfade(img, DAY_HAZE, H * 0.5, H * 0.66, 60, 0)
    # the deck's rim: a curved lip sweeping across, a slim rail with posts on it
    lay, d = day_layer()
    cx, cy, rx, ry = W * 0.5, H * 1.55, W * 0.95, H * 0.72
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(132, 94, 118, 255))
    d.ellipse([cx - rx + 30 * S, cy - ry + 26 * S, cx + rx - 30 * S, cy + ry], fill=(156, 118, 134, 255))
    img.alpha_composite(lay)
    lay, d = day_layer()
    for k in range(40):  # deck plating, radial seams
        a = math.radians(200 + k * 3.6)
        d.line([(cx + math.cos(a) * rx * 0.2, cy + math.sin(a) * ry * 0.2), (cx + math.cos(a) * rx, cy + math.sin(a) * ry)],
               fill=(126, 92, 114, 120), width=int(3 * S))
    img.alpha_composite(lay)
    lay, d = day_layer()
    rail_h = 150 * S
    pts = []
    for k in range(0, 181, 2):
        a = math.radians(180 + k)
        pts.append((cx + math.cos(a) * (rx - 15 * S), cy + math.sin(a) * (ry - 13 * S)))
    for k in range(0, len(pts), 6):
        x, y = pts[k]
        d.rectangle([x - 5 * S, y - rail_h, x + 5 * S, y], fill=(122, 90, 112, 255))
    d.line([(x, y - rail_h) for x, y in pts], fill=(232, 212, 206, 255), width=int(12 * S))
    d.line([(x, y - rail_h * 0.5) for x, y in pts], fill=(122, 90, 112, 255), width=int(5 * S))
    img.alpha_composite(lay)
    # the sun's warmth across the deck
    lay, d = day_layer()
    d.ellipse([W * 0.05, H * 0.84, W * 0.55, H * 1.05], fill=(255, 232, 206, 70))
    img.alpha_composite(day_blur(lay, 60 * S))
    return img


if DAY:
    noise = Image.effect_noise((W, H), 40).convert("RGB")
    Image.blend(day().convert("RGB"), noise, 0.03).save(OUT, quality=90)
    print(OUT)
    sys.exit(0)

# ---- Night.
# Each palette: sky stops, stars, the sun (x, y, radius, colour, alpha) in
# frame fractions, the haze far banks sink into, five cloud banks far to near
# as (lit top, shaded underside), the city (silhouette, lights), and grain.
DUSK = dict(
    sky=[(0.0, "#0b0a24"), (0.28, "#2a1d4f"), (0.45, "#6a3466"), (0.55, "#b4566a"), (0.62, "#e58a6c"), (1.0, "#7d3a5c")],
    stars=140,
    sun=(0.30, 0.58, 0.035, "#ffb38a", 230),
    haze="#9a4a68",
    banks=[("#b36a7e", "#7a3e62"), ("#9a5576", "#622f56"), ("#7d4268", "#4c2448"),
           ("#5e3156", "#38193a"), ("#3f2142", "#22102a")],
    city=("#2a1a3c", (255, 196, 140)),
    grain=5,
)
P = DUSK
FADE = [0.45, 0.3, 0.18, 0.08, 0.0]
BASES = [0.56, 0.63, 0.71, 0.81, 0.93]  # where each bank's tops sit, as frame fractions
rng = random.Random(23)


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
        x, y = rng.random() * W, rng.random() ** 1.6 * H * 0.35
        r = rng.choice([0.7, 1.0, 1.4]) * S * 1.4
        b = int(rng.uniform(150, 240))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(b, b, min(255, b + 15), 255))
    return img


def sun(img):
    x, y, r, c, a = P["sun"]
    x, y, r, c = x * W, y * H, r * W, hexrgb(c)
    for rr, aa, blur in ((r * 6, a // 5, 0.6), (r * 2.5, a // 2, 0.5), (r, a, 0.12)):
        g = Image.new("RGBA", (W, H), c + (0,))
        ImageDraw.Draw(g).ellipse([x - rr, y - rr, x + rr, y + rr], fill=c + (aa,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(rr * blur)))


def bank(img, i):
    """A bank of billows: overlapping puffs, each lit on top and shaded beneath."""
    haze = hexrgb(P["haze"])
    lit, shade = (lerp(hexrgb(c), haze, FADE[i]) for c in P["banks"][i])
    top = H * BASES[i]
    size = (60 + i * 45) * S
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    x = -size
    while x < W + size:
        r = size * rng.uniform(0.6, 1.3)
        cy = top + rng.uniform(-0.35, 0.35) * size
        md.ellipse([x - r, cy - r * 0.8, x + r, cy + r * 0.8], fill=255)
        # smaller puffs riding on top
        for _ in range(2):
            pr = r * rng.uniform(0.35, 0.6)
            px, py = x + rng.uniform(-r, r) * 0.6, cy - r * rng.uniform(0.5, 0.8)
            md.ellipse([px - pr, py - pr * 0.85, px + pr, py + pr * 0.85], fill=255)
        x += r * rng.uniform(0.7, 1.1)
    md.rectangle([0, top + size * 0.3, W, H], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2.5 * S + i * 0.6 * S))
    # lit tops grading into shaded undersides
    grad = Image.new("RGBA", (W, H))
    gd = ImageDraw.Draw(grad)
    span = size * 1.8
    y0 = int(top - size * 1.4)
    for y in range(0, H):
        t = min(1, max(0, (y - y0) / span))
        gd.line([(0, y), (W, y)], fill=lerp(lit, shade, t ** 0.8) + (255,))
    img.paste(grad, (0, 0), mask)


def city(img):
    """The floating city between the far and near banks: a disc, towers, the long stalk, lights."""
    col, lights = P["city"]
    col = lerp(hexrgb(col), hexrgb(P["haze"]), 0.25)
    lay = Image.new("RGBA", (W, H), col + (0,))
    d = ImageDraw.Draw(lay)
    cx, cy, rw = W * 0.68, H * 0.40, 230 * S
    d.ellipse([cx - rw, cy - 26 * S, cx + rw, cy + 26 * S], fill=col + (255,))
    for k in range(18):
        tx = cx - rw * 0.75 + k * rw * 1.5 / 18
        th = rng.uniform(30, 110) * S * (1 - abs(k - 8.5) / 11)
        d.rectangle([tx, cy - th, tx + 16 * S, cy], fill=col + (255,))
    d.polygon([(cx - 18 * S, cy + 22 * S), (cx + 18 * S, cy + 22 * S), (cx + 5 * S, cy + 260 * S), (cx - 5 * S, cy + 260 * S)], fill=col + (255,))
    for _ in range(110):
        lx, ly = cx + rng.uniform(-rw, rw) * 0.9, cy + rng.uniform(-90, 14) * S
        a = int(rng.uniform(80, 230) )
        d.rectangle([lx, ly, lx + 3 * S, ly + 3 * S], fill=lights + (a,))
    img.alpha_composite(lay)


img = sky()
sun(img)
for i in range(5):
    bank(img, i)
    if i == 1:
        city(img)
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
