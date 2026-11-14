"""Render an original city-world wallpaper: a violet night of layered towers,
lit windows and streams of sky traffic, the far towers sinking into haze and
the nearest standing at the edges of the frame.

With --day the viewpoint changes: a high observation deck looking out and
down over the rooftops of the tower city in a hazy slate-and-gold afternoon,
lanes of traffic threading between the blocks.

Usage: python3 scripts/coruscant.py [--day] OUT.jpg [WIDTH HEIGHT]
Needs Pillow.
"""
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

DAY = "--day" in sys.argv
ARGS = [a for a in sys.argv[1:] if a != "--day"]
W, H = (int(ARGS[1]), int(ARGS[2])) if len(ARGS) > 2 else (3024, 1964)
OUT = ARGS[0]
S = W / 3024  # scale for sizes drawn in 3024-wide pixels


# ---- Day: overlook, a high observation deck over the rooftops of the tower city. Runs and exits before the night code below.
HAZE = "#d8cfc8"
LAYERS = [("#a8b0c4", "#c8cede"), ("#9099b2", "#b5bdd2"), ("#7a84a2", "#a2abc6"), ("#646f90", "#8f99b8"), ("#4f5a7c", "#7c87a8")]
WIN = (255, 248, 226)
TRAFFIC = (255, 246, 224)


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


def blur(im, r):
    """Gaussian blur on premultiplied alpha, so transparent pixels don't bleed a dark fringe."""
    if im.mode != "RGBA":
        return im.filter(ImageFilter.GaussianBlur(r))
    return im.convert("RGBa").filter(ImageFilter.GaussianBlur(r)).convert("RGBA")


def day():
    img = day_sky([(0.0, "#5f80b8"), (0.18, "#8ea6cf"), (0.29, "#dcc8b6"), (0.36, "#d8cfc8"), (1.0, "#b8b4bc")])
    lay, d = day_layer((255, 217, 168))
    d.rectangle([0, H * 0.22, W, H * 0.36], fill=(255, 217, 168, 90))
    img.alpha_composite(blur(lay, 80 * S))
    hz, f, cam = H * 0.30, W * 0.55, 70.0  # horizon, focal length, eye height
    vx = W * 0.5
    haze = day_hexrgb("#cfc6c2")

    def proj(X, Y, Z):
        return (vx + X / Z * f, hz + (cam - Y) / Z * f)

    r = random.Random(44)
    boxes = []
    Z = 22.0
    while Z < 260:
        dz = r.uniform(2.6, 4.2) * (1 + Z / 60)
        X = -Z * 1.0
        while X < Z * 1.0:
            w = r.uniform(2.0, 4.0) * (1 + Z / 80)
            h = r.uniform(6, 34) if r.random() < 0.85 else r.uniform(34, 52)
            boxes.append((X, X + w, Z, Z + dz * 0.8, h))
            X += w + r.uniform(0.6, 1.6)
        Z += dz
    boxes.sort(key=lambda b: (-b[2], -abs((b[0] + b[1]) / 2)))
    lay, d = day_layer()
    for x0, x1, z0, z1, h in boxes:
        k = min(1.0, ((z0 - 20) / 220) ** 0.7)  # haze with distance
        li = 4 - min(4, int((z0 - 20) / 25))
        face = day_lerp(LAYERS[li][0], haze, 0.02 + 0.85 * k)
        top = day_lerp(LAYERS[li][1], (236, 228, 216), 0.35)
        top = day_lerp(top, haze, 0.05 + 0.85 * k)
        side = day_lerp(face, (40, 46, 70), 0.30 * (1 - k))
        # the side facing the centre line
        if x0 > 0:
            d.polygon([proj(x0, 0, z0), proj(x0, h, z0), proj(x0, h, z1), proj(x0, 0, z1)], fill=side + (255,))
        elif x1 < 0:
            d.polygon([proj(x1, 0, z0), proj(x1, h, z0), proj(x1, h, z1), proj(x1, 0, z1)], fill=side + (255,))
        d.polygon([proj(x0, 0, z0), proj(x1, 0, z0), proj(x1, h, z0), proj(x0, h, z0)], fill=face + (255,))
        d.polygon([proj(x0, h, z0), proj(x1, h, z0), proj(x1, h, z1), proj(x0, h, z1)], fill=top + (255,))
        if z0 < 70:  # window rows on the near face
            rows = int(h / 1.5)
            for j in range(1, rows):
                if r.random() < 0.35:
                    y = h * j / rows
                    a, b = proj(x0 + 0.3, y, z0), proj(x1 - 0.3, y, z0)
                    d.line([a, b], fill=WIN + (int(90 * (1 - k)),), width=max(1, int(4 * S * 25 / z0)))
        if h > 30 and r.random() < 0.2:  # spire on the tall ones
            cx = (x0 + x1) / 2
            d.polygon([proj(cx - 0.4, h, z0 + 0.5), proj(cx + 0.4, h, z0 + 0.5), proj(cx, h + r.uniform(4, 10), z0 + 0.5)], fill=face + (255,))
    img.alpha_composite(lay)
    vfade(img, HAZE, hz - H * 0.02, hz + H * 0.12, 140, 0)
    # traffic lanes: dashes of light running away between the rooftops
    lay, d = day_layer(TRAFFIC)
    for X, Y in ((-14, 44), (-5, 50), (6, 47), (15, 42), (-26, 53), (28, 55)):
        z = 22.0
        while z < 240:
            z2 = z + 0.35 + z * 0.02
            d.line([proj(X, Y, z), proj(X, Y, z2)], fill=TRAFFIC + (240,), width=max(2, int(30 * S / z ** 0.6)))
            z = z2 + r.uniform(0.6, 4.0) * (1 + z / 30)
    for Y, Z0 in ((46, 30), (52, 60)):  # cross lanes
        x = -60.0
        while x < 60:
            x2 = x + r.uniform(0.6, 1.4)
            d.line([proj(x, Y, Z0), proj(x2, Y, Z0)], fill=TRAFFIC + (200,), width=max(1, int(10 * S / Z0 ** 0.5)))
            x = x2 + r.uniform(1, 5)
    img.alpha_composite(blur(lay, 6 * S))
    img.alpha_composite(lay)
    # the deck's window: a slim frame and a broad sill at the bottom
    lay, d = day_layer()
    d.rectangle([0, H * 0.90, W, H], fill=(132, 126, 130, 255))
    d.rectangle([0, H * 0.90, W, H * 0.905], fill=(236, 230, 220, 255))
    d.rectangle([0, H * 0.82, W, H * 0.90], fill=(98, 104, 126, 255))
    d.rectangle([0, H * 0.82, W, H * 0.826], fill=(200, 204, 218, 255))
    for x in (W * 0.32, W * 0.68):
        d.rectangle([x - 12 * S, 0, x + 12 * S, H * 0.82], fill=(120, 126, 146, 255))
        d.rectangle([x - 12 * S, 0, x - 6 * S, H * 0.82], fill=(196, 202, 220, 255))
    img.alpha_composite(lay)
    lay, d = day_layer()
    for k in range(6):  # faint reflections on the glass
        x0 = W * (0.04 + k * 0.17)
        d.polygon([(x0, 0), (x0 + 90 * S, 0), (x0 - 160 * S, H * 0.82), (x0 - 250 * S, H * 0.82)], fill=(255, 255, 255, 9))
    img.alpha_composite(blur(lay, 10 * S))
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
# Each palette: sky stops, stars, the haze far towers sink into, five tower
# layers far to near as (face, lit edge), windows (colour, density, alpha),
# traffic (colour, alpha), the glow along the skyline, and grain.
NIGHT = dict(
    sky=[(0.0, "#06051a"), (0.30, "#171236"), (0.55, "#36214f"), (0.75, "#5a2f5c"), (1.0, "#3a2147")],
    stars=40,
    haze="#4a2f62",
    fade=[0.55, 0.38, 0.24, 0.1, 0.0],
    layers=[("#3a2d58", "#5a4a80"), ("#2c2248", "#4a3c70"), ("#211a3a", "#3c3060"),
            ("#17122c", "#2e2450"), ("#0d0a1d", "#221a3c")],
    windows=((255, 196, 120), 0.55, 230),
    traffic=("#ffd27a", 230),
    glow=("#ff8a5c", 110),
    grain=5,
)
P = NIGHT
rng = random.Random(5)


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
        x, y = rng.random() * W, rng.random() ** 2 * H * 0.25
        r = rng.choice([0.8, 1.1]) * S * 1.4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(200, 190, 230, 200))
    return img


def tower(d, x, w, top, face, edge, win, layer):
    d.rectangle([x, top, x + w, H], fill=face + (255,))
    d.rectangle([x, top, x + max(2, w * 0.08), H], fill=edge + (255,))  # the lit edge
    kind = rng.random()
    if kind < 0.25:  # spire
        d.polygon([(x + w * 0.35, top), (x + w * 0.5, top - rng.uniform(60, 180) * S), (x + w * 0.65, top)], fill=face + (255,))
    elif kind < 0.45:  # stepped crown
        d.rectangle([x + w * 0.15, top - 30 * S, x + w * 0.85, top], fill=face + (255,))
        d.rectangle([x + w * 0.3, top - 55 * S, x + w * 0.7, top - 30 * S], fill=face + (255,))
    col, density, alpha = win
    gap_y, gap_x = (10 + layer * 2.5) * S, (8 + layer * 2.2) * S
    lit = rng.uniform(0.3, 1.0) * density  # some towers are busier than others
    y = top + 10 * S
    run = 0
    while y < H:
        if run <= 0:
            on = rng.random() < 0.5
            run = rng.randint(2, 9)
        run -= 1
        if on:
            xx = x + 6 * S
            while xx < x + w - 6 * S:
                if rng.random() < lit:
                    a = int(alpha * rng.uniform(0.5, 1))
                    d.rectangle([xx, y, xx + (2.5 + layer) * S, y + (3 + layer * 0.5) * S], fill=col + (a,))
                xx += gap_x
        y += gap_y


def layers(img):
    haze = hexrgb(P["haze"])
    for i, (face, edge) in enumerate(P["layers"]):
        face = lerp(hexrgb(face), haze, P["fade"][i])
        edge = lerp(hexrgb(edge), haze, P["fade"][i])
        col, density, alpha = P["windows"]
        win = (col, density, int(alpha * (1 - P["fade"][i] * 0.8)))
        lay = Image.new("RGBA", (W, H), face + (0,))
        d = ImageDraw.Draw(lay)
        base = H * (0.40 + i * 0.09)
        x = -40 * S
        while x < W:
            f = (x + 60 * S) / W
            w = (rng.uniform(40, 100) + i * 30) * S
            h = rng.uniform(120, 420) * S * (1.3 - i * 0.1)
            # the nearest two layers stand at the sides, leaving the middle open
            if i >= 3 and 0.26 < f < 0.74:
                x += w + rng.uniform(4, 24) * S
                continue
            tower(d, x, w, base - h, face, edge, win, i)
            x += w + rng.uniform(4, 24) * S
        img.alpha_composite(lay)
        if i in (0, 2):
            traffic(img, i)


def traffic(img, i):
    """Lanes of sky traffic: dashes of light along gently sloped lines, with a soft glow."""
    col, alpha = P["traffic"]
    col = hexrgb(col)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for lane in range(3 if i == 0 else 2):
        y0 = rng.uniform(0.12, 0.42) * H
        slope = rng.uniform(-0.05, 0.05)
        x = rng.uniform(0, 60) * S
        while x < W:
            y = y0 + slope * x
            ln = rng.uniform(8, 26) * S
            d.line([(x, y), (x + ln, y + slope * ln)], fill=col + (alpha,), width=max(2, int(3 * S)))
            x += ln + rng.uniform(14, 90) * S
    glow_layer = lay.filter(ImageFilter.GaussianBlur(8 * S))
    img.alpha_composite(glow_layer)
    img.alpha_composite(lay)


def glow(img):
    col, a = P["glow"]
    col = hexrgb(col)
    lay = Image.new("RGBA", (W, H), col + (0,))
    ImageDraw.Draw(lay).rectangle([0, H * 0.38, W, H * 0.62], fill=col + (a,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(120 * S)))


img = sky()
glow(img)
layers(img)
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
