"""Render an original lake-country wallpaper: a domed palace on a green
cliff plateau, waterfalls pouring into a still lake under a moon, rolling
hills fading into haze. With --day, the view turns to a palace terrace in
bright noon: a balustrade and a great dome frame the lake and the blue hills.

Usage: python3 scripts/naboo.py [--day] OUT.jpg [WIDTH HEIGHT]
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

# ---- Day: terrace, a palace balustrade and dome over the lake. Runs and exits before the night code below.
DP = dict(
    orb=(0.80, 0.13, 0.03, "#fff6dc", 210),
    haze="#b6cfd8",
    ridges=["#86a6c0", "#6f9aa4", "#5e8f78"],
    lake=("#5f9fc8", "#3a76a0"),
    cliff=("#6f9070", "#3c5c46"),
    green=("#64a052", "#3f7a3c"),
    dome=("#f4ead6", "#c2b49a"),
    grain=3,
)
drng = random.Random(29)


def day_hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def day_lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def day_layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), tuple(col) + (0,))
    return lay, ImageDraw.Draw(lay)


def day_vgrad(img, mask, top, bottom, y0, y1, ease=1.0):
    g = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(g)
    for y in range(H):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0))) ** ease
        d.line([(0, y), (W, y)], fill=day_lerp(top, bottom, t) + (255,))
    img.paste(g, (0, 0), mask)


def day_sky(stops):
    img = Image.new("RGBA", (W, H))
    stops = [(p, day_hexrgb(c)) for p, c in stops]
    d = ImageDraw.Draw(img)
    for y in range(H):
        f = y / H
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= f <= p1:
                d.line([(0, y), (W, y)], fill=day_lerp(c0, c1, (f - p0) / max(p1 - p0, 1e-6)) + (255,))
                break
    return img


def day_glow(img, x, y, r, c, a):
    for rr, aa, blur in ((r * 7, a // 6, 0.6), (r * 2.6, a // 2, 0.5), (r, a, 0.1)):
        g = Image.new("RGBA", (W, H), c + (0,))
        ImageDraw.Draw(g).ellipse([x - rr, y - rr, x + rr, y + rr], fill=c + (aa,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(max(1, rr * blur))))


def clouds(img, n, y0, y1, alpha=70):
    """Soft fair-weather clouds: flat-bottomed clusters of blurred puffs."""
    lay, d = day_layer((255, 255, 255))
    for _ in range(n):
        cx, cy = drng.uniform(0, W), drng.uniform(y0, y1) * H
        w = drng.uniform(160, 420) * S
        for k in range(9):
            px = cx + drng.uniform(-w, w)
            pr = drng.uniform(0.25, 0.5) * w * (1 - abs(px - cx) / (w * 1.3))
            d.ellipse([px - pr, cy - pr, px + pr, cy + pr * 0.35], fill=(255, 255, 255, alpha))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(26 * S)))


def day_ridge(img, i, base, amp, x_from=0.0, haze_k=None):
    col = day_lerp(day_hexrgb(DP["ridges"][i]), day_hexrgb(DP["haze"]), haze_k if haze_k is not None else [0.35, 0.18, 0.0][i])
    ph = [drng.uniform(0, 6) for _ in range(3)]
    pts = [(W * x_from, H)]
    for x in range(int(W * x_from), W + 8, 8):
        u = x / W
        y = base * H - amp * S * (0.6 * math.sin(u * 5 + ph[0]) + 0.3 * math.sin(u * 13 + ph[1]) + 0.1 * math.sin(u * 31 + ph[2]))
        pts.append((x, y))
    pts.append((W, H))
    lay, d = day_layer(col)
    d.polygon(pts, fill=col + (255,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur((6 - i * 2) * S)))
    return pts, col


def treeline(img, pts, col, x_min=0.0, size=(8, 18)):
    lay, d = day_layer()
    for x, y in pts[1:-1:3]:
        if x < W * x_min:
            continue
        r = drng.uniform(*size) * S
        d.ellipse([x - r, y - r * 1.6, x + r, y + r * 0.4], fill=day_lerp(col, (0, 0, 0), 0.12) + (255,))
    img.alpha_composite(lay)


def ripples(img, y0, y1, n=300, a=30):
    lay, d = day_layer()
    for _ in range(n):
        y = H * drng.uniform(y0, y1)
        x = drng.random() * W
        ln = drng.uniform(40, 200) * S * (0.4 + (y / H - y0) / (y1 - y0))
        d.line([(x, y), (x + ln, y)], fill=(255, 255, 255, a), width=max(1, int(1.5 * S)))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(0.8 * S)))




def day():
    LAKE = 0.50
    img = day_sky([(0.0, "#3a76c0"), (0.30, "#76a6d8"), (0.46, "#b4ccd8"), (0.52, "#c8d8c6"), (1.0, "#9cbcc8")])
    day_glow(img, 0.62 * W, 0.10 * H, DP["orb"][2] * W, day_hexrgb(DP["orb"][3]), DP["orb"][4])
    clouds(img, 8, 0.12, 0.34, 70)
    p0, c0 = day_ridge(img, 0, LAKE - 0.07, 60, haze_k=0.5)
    p1, c1 = day_ridge(img, 1, LAKE - 0.035, 36, haze_k=0.3)
    p2, c2 = day_ridge(img, 2, LAKE - 0.008, 12, haze_k=0.1)
    treeline(img, p2, c2, size=(5, 10))
    # the lake, seen from high: long, flat, the sun's glitter farther out
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rectangle([0, H * LAKE, W, H], fill=255)
    day_vgrad(img, m, day_lerp(day_hexrgb(DP["lake"][0]), day_hexrgb(DP["haze"]), 0.35), day_hexrgb(DP["lake"][1]), H * LAKE, H * 0.9)
    lay, d = day_layer()
    for _ in range(200):
        y = H * drng.uniform(LAKE + 0.01, 0.80)
        spread = (y - H * LAKE) / H * 500 * S + 30 * S
        x = 0.62 * W + drng.uniform(-spread, spread)
        d.line([(x, y), (x + drng.uniform(14, 60) * S, y)], fill=(255, 248, 226, int(drng.uniform(40, 120))), width=max(1, int(2 * S)))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(0.8 * S)))
    ripples(img, LAKE + 0.01, 0.85, n=200, a=22)
    # little islands with round trees, out on the water
    lay, d = day_layer()
    for ix, iy, iw in ((0.36, LAKE + 0.06, 120), (0.80, LAKE + 0.10, 200), (0.55, LAKE + 0.035, 60)):
        x, y, w = W * ix, H * iy, iw * S
        col = day_hexrgb("#5e8f60")
        d.ellipse([x - w, y - w * 0.12, x + w, y + w * 0.1], fill=col + (255,))
        for _ in range(int(iw / 20)):
            tx = x + drng.uniform(-w * 0.7, w * 0.7)
            r = drng.uniform(0.08, 0.16) * w
            d.ellipse([tx - r, y - r * 2.2, tx + r, y - r * 0.1], fill=day_lerp(col, (30, 60, 40), drng.uniform(0, 0.4)) + (255,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.0 * S)))
    # the cliff edge falling away below the terrace, greenery on its lip
    lay, d = day_layer()
    g0, g1 = day_hexrgb(DP["green"][0]), day_hexrgb(DP["green"][1])
    edge_y = 0.80
    pts = [(0, H)] + [(x, H * edge_y + math.sin(x / W * 7) * 10 * S + drng.uniform(-4, 4) * S) for x in range(0, W + 20, 20)] + [(W, H)]
    d.polygon(pts, fill=day_hexrgb(DP["cliff"][0]) + (255,))
    for _ in range(300):
        x = drng.uniform(0, W)
        y = H * edge_y + drng.uniform(-18, 30) * S
        r = drng.uniform(16, 40) * S
        d.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.6], fill=day_lerp(g0, g1, drng.random()) + (255,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.2 * S)))
    # spray rising from the falls below the lip
    mist = (242, 247, 250)
    lay, d = day_layer(mist)
    for _ in range(60):
        x = drng.uniform(0.05, 0.75) * W
        y = H * edge_y - drng.uniform(0, 1) ** 1.6 * H * 0.12
        r = drng.uniform(50, 150) * S
        d.ellipse([x - r * 1.5, y - r, x + r * 1.5, y + r * 0.6], fill=mist + (int(drng.uniform(30, 70)),))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(34 * S)))

    lit, shade = day_hexrgb(DP["dome"][0]), day_hexrgb(DP["dome"][1])
    # the terrace floor and balustrade along the bottom
    lay, d = day_layer()
    floor = 0.90
    d.rectangle([0, H * floor, W, H], fill=day_lerp(shade, lit, 0.5) + (255,))
    for k in range(0, 40):  # paving joints, converging a little
        x = k / 39 * W
        d.line([(x, H * floor), (W / 2 + (x - W / 2) * 1.4, H)], fill=shade + (120,), width=max(1, int(2 * S)))
    rail_top, rail_bot = 0.80, floor
    d.rectangle([0, H * rail_top, W, H * (rail_top + 0.022)], fill=lit + (255,))
    d.rectangle([0, H * (rail_top + 0.022), W, H * (rail_top + 0.03)], fill=shade + (255,))
    d.rectangle([0, H * (rail_bot - 0.016), W, H * rail_bot], fill=lit + (255,))
    n = 64
    for k in range(n):  # turned balusters, lit on the right
        x = (k + 0.5) / n * W
        bw = W / n * 0.34
        top, bot = H * (rail_top + 0.03), H * (rail_bot - 0.016)
        mid = (top + bot) / 2
        d.polygon([(x - bw * 0.5, top), (x + bw * 0.5, top), (x + bw * 0.8, mid + (bot - top) * 0.12), (x + bw * 0.45, bot), (x - bw * 0.45, bot),
                   (x - bw * 0.8, mid + (bot - top) * 0.12)], fill=day_lerp(shade, lit, 0.3) + (255,))
        d.polygon([(x, top), (x + bw * 0.5, top), (x + bw * 0.8, mid + (bot - top) * 0.12), (x + bw * 0.45, bot), (x, bot)], fill=lit + (255,))
    for px in (0.0, 0.30, 0.70, 1.0):  # posts with urns of greenery
        x = px * W
        pw = 38 * S
        d.rectangle([x - pw, H * (rail_top - 0.012), x + pw, H * rail_bot], fill=lit + (255,))
        d.rectangle([x - pw * 0.15, H * (rail_top - 0.012), x + pw, H * rail_bot], fill=day_lerp(shade, lit, 0.6) + (255,))
        d.rectangle([x - pw * 1.15, H * (rail_top - 0.02), x + pw * 1.15, H * (rail_top - 0.008)], fill=lit + (255,))
        ux, uy = x, H * (rail_top - 0.02)
        d.polygon([(ux - pw * 0.7, uy - 50 * S), (ux + pw * 0.7, uy - 50 * S), (ux + pw * 0.4, uy), (ux - pw * 0.4, uy)], fill=shade + (255,))
        for _ in range(14):
            r = drng.uniform(14, 26) * S
            gx, gy = ux + drng.uniform(-pw, pw), uy - 50 * S - drng.uniform(0, 50) * S
            d.ellipse([gx - r, gy - r, gx + r, gy + r], fill=day_lerp(g0, g1, drng.random()) + (255,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(0.7 * S)))
    # soft shadow under the rail onto the floor
    lay, d = day_layer()
    d.rectangle([0, H * floor, W, H * (floor + 0.03)], fill=(40, 40, 30, 70))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(10 * S)))

    # a great dome on the left, cropped by the frame, with a colonnade below
    lay, d = day_layer()
    cx, R = -0.02 * W, 0.20 * W
    base = H * 0.62
    d.chord([cx - R, base - R * 0.95, cx + R, base + R * 0.95], 180, 360, fill=lit + (255,))
    for k in range(1, 6):  # ribs on the dome
        t = k / 6
        d.arc([cx - R * t, base - R * 0.95, cx + R * t, base + R * 0.95], 270, 360, fill=day_lerp(shade, lit, 0.55) + (255,), width=max(2, int(3 * S)))
    lay.putalpha(lay.getchannel("A"))
    # shade the dome's far side: a soft dark sweep from the right limb inward
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).ellipse([cx - R * 0.6, base - R * 0.7, cx + R * 1.5, base + R * 1.1], fill=0)
    dm = Image.new("L", (W, H), 0)
    ImageDraw.Draw(dm).chord([cx - R, base - R * 0.95, cx + R, base + R * 0.95], 180, 360, fill=255)
    grad = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(grad)
    for k in range(60):
        t = k / 59
        rr = R * (1 - t * 0.5)
        gd.ellipse([cx - rr * 0.6 - R * 0.35, base - rr * 0.95, cx + rr * 0.6 - R * 0.35, base + rr * 0.95], fill=int(80 * (1 - t)))
    img.alpha_composite(lay)
    img.paste(Image.new("RGBA", (W, H), shade + (255,)), (0, 0), Image.composite(Image.eval(grad, lambda v: 80 - v if v else 0).filter(ImageFilter.GaussianBlur(30 * S)), Image.new("L", (W, H), 0), dm))
    lay, d = day_layer()
    d.rectangle([cx - R, base, cx + R, H * rail_top], fill=shade + (255,))
    d.rectangle([cx + R * 0.05, base, cx + R, H * rail_top], fill=day_lerp(shade, lit, 0.7) + (255,))
    for k in range(7):  # columns of the drum with dark openings between
        x = cx + R * (0.12 + k * 0.13)
        d.rectangle([x + R * 0.05, base + 40 * S, x + R * 0.13, H * rail_top], fill=day_lerp(shade, (60, 60, 50), 0.3) + (255,))
        d.rectangle([x, base + 30 * S, x + R * 0.05, H * rail_top], fill=lit + (255,))
    d.rectangle([cx - R * 1.04, base - 4 * S, cx + R * 1.04, base + 30 * S], fill=lit + (255,))
    d.rectangle([cx - R * 1.04, base + 22 * S, cx + R * 1.04, base + 30 * S], fill=shade + (255,))
    img.alpha_composite(lay)
    rim, rd = day_layer((255, 255, 255))
    rd.arc([cx - R * 0.85, base - R * 0.82, cx + R * 0.85, base + R * 0.82], -70, -20, fill=(255, 255, 255, 120), width=int(10 * S))
    img.alpha_composite(rim.filter(ImageFilter.GaussianBlur(6 * S)))
    # a slender column and arch springing on the right edge
    lay, d = day_layer()
    cx2 = 0.965 * W
    d.rectangle([cx2 - 36 * S, H * 0.0, cx2 + 36 * S, H * rail_top], fill=lit + (255,))
    d.rectangle([cx2 - 36 * S, H * 0.0, cx2 - 6 * S, H * rail_top], fill=day_lerp(shade, lit, 0.4) + (255,))
    d.rectangle([cx2 - 54 * S, H * 0.0, cx2 + 54 * S, H * 0.035], fill=lit + (255,))
    # a vine trailing down it
    for k in range(260):
        t = drng.random() ** 1.3
        x = cx2 + math.sin(t * 14) * 30 * S + drng.uniform(-22, 22) * S * (1 - t * 0.6)
        y = H * (0.02 + t * 0.62)
        r = (11 - t * 6) * S * drng.uniform(0.6, 1.2)
        d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=day_lerp(g0, g1, drng.random()) + (255,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(0.8 * S)))
    return img


if DAY:
    noise = Image.effect_noise((W, H), 40).convert("RGB")
    Image.blend(day().convert("RGB"), noise, DP["grain"] / 100).save(OUT, quality=90)
    print(OUT)
    sys.exit(0)


# ---- Night.
# Night palette: sky stops, stars, the moon (x, y, radius, colour,
# alpha) in frame fractions, the haze far layers sink into, three ridges far
# to near, the lake (top, bottom), the cliff (lit, shaded), its greenery,
# the domes (lit, shaded), window lights, the near hills, and grain.
NIGHT = dict(
    sky=[(0.0, "#070e24"), (0.30, "#132449"), (0.48, "#26406c"), (0.58, "#4a5f88"), (1.0, "#2a3c62")],
    stars=220,
    orb=(0.76, 0.17, 0.022, "#f2eedc", 235),
    haze="#4a5f88",
    ridges=["#33476e", "#28405a", "#1f3a44"],
    lake=("#2c4a78", "#122440"),
    cliff=("#2a4446", "#0f1d22"),
    green=("#2f5a44", "#1c3a30"),
    dome=("#aab0c6", "#5c6280"),
    lights=(255, 196, 120),
    near=("#0f2420", "#081614"),
    grain=5,
)
P = NIGHT
rng = random.Random(29)
LAKE = 0.66   # where the lake's far shore sits
TOP = 0.42    # the cliff plateau
CL, CR = 0.04, 0.50  # the cliff's left and right edges


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), tuple(col) + (0,))
    return lay, ImageDraw.Draw(lay)


def vgrad(img, mask, top, bottom, y0, y1, ease=1.0):
    """Paint a vertical gradient through a mask."""
    g = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(g)
    for y in range(H):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0))) ** ease
        d.line([(0, y), (W, y)], fill=lerp(top, bottom, t) + (255,))
    img.paste(g, (0, 0), mask)


def sky():
    img = Image.new("RGBA", (W, H))
    stops = [(p, hexrgb(c)) for p, c in P["sky"]]
    d = ImageDraw.Draw(img)
    for y in range(H):
        f = y / H
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= f <= p1:
                d.line([(0, y), (W, y)], fill=lerp(c0, c1, (f - p0) / max(p1 - p0, 1e-6)) + (255,))
                break
    for _ in range(P["stars"]):
        x, y = rng.random() * W, rng.random() ** 1.5 * H * 0.5
        r = rng.choice([0.7, 1.0, 1.4]) * S * 1.4
        b = int(rng.uniform(150, 240))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(b, b, min(255, b + 15), 255))
    return img


def glow(img, x, y, r, c, a):
    for rr, aa, blur in ((r * 7, a // 6, 0.6), (r * 2.6, a // 2, 0.5), (r, a, 0.1)):
        g = Image.new("RGBA", (W, H), c + (0,))
        ImageDraw.Draw(g).ellipse([x - rr, y - rr, x + rr, y + rr], fill=c + (aa,))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(max(1, rr * blur))))


def ridge(img, i):
    """A far range of hills; nearer ones darker and less hazy."""
    col = lerp(hexrgb(P["ridges"][i]), hexrgb(P["haze"]), [0.35, 0.18, 0.0][i])
    base = H * [0.50, 0.57, 0.63][i]
    amp = [80, 50, 34][i] * S
    ph = [rng.uniform(0, 6) for _ in range(3)]
    pts = [(0, H)]
    for x in range(0, W + 8, 8):
        u = x / W
        y = base - amp * (0.6 * math.sin(u * 5 + ph[0]) + 0.3 * math.sin(u * 13 + ph[1]) + 0.1 * math.sin(u * 31 + ph[2]))
        pts.append((x, y))
    pts.append((W, H))
    lay, d = layer(col)
    d.polygon(pts, fill=col + (255,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur((6 - i * 2) * S)))
    if i == 2:  # a fringe of trees along the nearest ridge
        lay, d = layer()
        for x, y in pts[1:-1:3]:
            if x < W * CR:
                continue
            r = rng.uniform(8, 18) * S
            d.ellipse([x - r, y - r * 1.6, x + r, y + r * 0.4], fill=lerp(col, (0, 0, 0), 0.12) + (255,))
        img.alpha_composite(lay)


def lake(img):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rectangle([0, H * LAKE, W, H], fill=255)
    vgrad(img, m, hexrgb(P["lake"][0]), hexrgb(P["lake"][1]), H * LAKE, H)
    # a soft band of sky colour where the far shore meets the water
    lay, d = layer()
    d.rectangle([0, H * LAKE, W, H * (LAKE + 0.012)], fill=hexrgb(P["haze"]) + (90,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(6 * S)))


def cliff_shape():
    """The plateau: a rough top, ragged sides, sitting in the lake."""
    pts = []
    x = W * CL
    for k in range(40):  # left face, bottom to top
        t = k / 39
        pts.append((x + math.sin(t * 5) * 40 * S + math.sin(t * 17) * 12 * S + rng.uniform(-8, 8) * S + t * 60 * S, H * (LAKE + 0.05) - t * (H * (LAKE + 0.05 - TOP))))
    for k in range(1, 80):  # the top edge
        t = k / 80
        pts.append((W * CL + 40 * S + t * (W * (CR - CL) - 80 * S), H * TOP + rng.uniform(-5, 5) * S + math.sin(t * 17) * 4 * S))
    for k in range(40):  # right face, top to bottom
        t = k / 39
        pts.append((W * CR - 60 * S + t * 70 * S + math.sin(t * 4 + 1) * 46 * S + math.sin(t * 19) * 12 * S + rng.uniform(-8, 8) * S, H * TOP + t * (H * (LAKE + 0.05 - TOP))))
    return pts


def cliff(img):
    pts = cliff_shape()
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    vgrad(img, m, hexrgb(P["cliff"][0]), hexrgb(P["cliff"][1]), H * TOP, H * (LAKE + 0.05), 0.8)
    # strata: soft vertical streaks of light and shadow down the face
    lay, d = layer()
    for _ in range(140):
        x = W * rng.uniform(CL, CR)
        y = H * rng.uniform(TOP + 0.02, LAKE)
        ln = rng.uniform(40, 220) * S
        light = rng.random() < 0.5
        d.line([(x, y), (x + rng.uniform(-6, 6) * S, y + ln)], fill=(255, 255, 255, 18) if light else (0, 0, 0, 40), width=int(rng.uniform(3, 9) * S))
    lay = lay.filter(ImageFilter.GaussianBlur(3 * S))
    img.paste(Image.alpha_composite(img, lay), (0, 0), m)
    # greenery spilling over the top edge and clinging to the face
    lay, d = layer()
    g0, g1 = hexrgb(P["green"][0]), hexrgb(P["green"][1])
    for _ in range(220):
        x = W * rng.uniform(CL + 0.01, CR - 0.01)
        y = H * TOP + rng.uniform(-14, 30) * S
        r = rng.uniform(14, 36) * S
        d.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.6], fill=lerp(g0, g1, rng.random()) + (255,))
    for _ in range(90):  # hanging moss on the face
        x = W * rng.uniform(CL + 0.01, CR - 0.01)
        y = H * TOP + rng.uniform(20, 160) * S
        d.ellipse([x - 10 * S, y - 6 * S, x + 10 * S, y + rng.uniform(16, 50) * S], fill=g1 + (200,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.2 * S)))


def dome(d, cx, base, r, h, lit, shade):
    """A drum with a dome, lit on the right (toward the moon or sun)."""
    d.rectangle([cx - r, base - h, cx + r, base], fill=shade + (255,))
    d.rectangle([cx - r * 0.1, base - h, cx + r, base], fill=lit + (255,))
    d.ellipse([cx - r, base - h - r * 0.95, cx + r, base - h + r * 0.95], fill=shade + (255,))
    d.chord([cx - r, base - h - r * 0.95, cx + r, base - h + r * 0.95], -90, 90, fill=lit + (255,))
    d.rectangle([cx - 5 * S, base - h - r * 0.95 - 34 * S, cx + 5 * S, base - h - r * 0.9], fill=lit + (255,))


def palace(img):
    lit, shade = hexrgb(P["dome"][0]), hexrgb(P["dome"][1])
    base = H * TOP - 6 * S
    lay, d = layer()
    # the long colonnaded hall
    d.rectangle([W * 0.11, base - 60 * S, W * 0.45, base], fill=lerp(shade, lit, 0.35) + (255,))
    d.rectangle([W * 0.11, base - 66 * S, W * 0.45, base - 58 * S], fill=lit + (255,))
    for k in range(52):
        x = W * 0.115 + k * W * 0.33 / 52
        d.rectangle([x, base - 56 * S, x + 6 * S, base], fill=lit + (255,))
    for cx, r, h in ((0.15, 70, 80), (0.235, 92, 110), (0.30, 150, 150), (0.385, 86, 100), (0.44, 60, 70)):
        dome(d, W * cx, base, r * S, h * S, lit, shade)
    img.alpha_composite(lay)
    rim, rd = layer((255, 255, 255))
    for cx, r, h in ((0.15, 70, 80), (0.235, 92, 110), (0.30, 150, 150), (0.385, 86, 100), (0.44, 60, 70)):
        x, y, r, h = W * cx, base, r * S, h * S
        rd.arc([x - r * 0.8, y - h - r * 0.8, x + r * 0.8, y - h + r * 0.8], -80, -10, fill=(255, 255, 255, 70), width=int(5 * S))
    img.alpha_composite(rim.filter(ImageFilter.GaussianBlur(2 * S)))
    # windows: arched, warm, more of them lit at night
    lay, d = layer()
    li = P["lights"]
    for _ in range(170):
        x = W * rng.uniform(0.12, 0.45)
        y = base - rng.uniform(10, 240) * S
        a = int(rng.uniform(70, 230))
        d.rounded_rectangle([x, y, x + 6 * S, y + 11 * S], radius=3 * S, fill=li + (a,))
    pal = Image.new("L", (W, H), 0)
    pd = ImageDraw.Draw(pal)
    pd.rectangle([W * 0.11, base - 66 * S, W * 0.45, base], fill=255)
    for cx, r, h in ((0.15, 70, 80), (0.235, 92, 110), (0.30, 150, 150), (0.385, 86, 100), (0.44, 60, 70)):
        pd.rectangle([W * cx - r * S, base - h * S, W * cx + r * S, base], fill=255)
    img.paste(Image.alpha_composite(img, lay.filter(ImageFilter.GaussianBlur(0.6 * S))), (0, 0), pal)
    glow(img, W * 0.30, base - 60 * S, 120 * S, li, 40)


def falls(img):
    """Ribbons of water off the cliff, brightest at the lip, misting at the lake."""
    lay, d = layer()
    xs = [0.07, 0.12, 0.17, 0.24, 0.31, 0.36, 0.42, 0.47]
    for x0 in xs:
        x = W * x0 + rng.uniform(-10, 10) * S
        w = rng.uniform(20, 46) * S
        top = H * TOP + 24 * S
        for k in range(8):  # strands
            sx = x + rng.uniform(0, w)
            pts = []
            for j in range(30):
                t = j / 29
                pts.append((sx + math.sin(t * 4 + k) * 3 * S + t * t * 10 * S, top + t * (H * (LAKE + 0.03) - top)))
            d.line(pts, fill=(236, 244, 255, int(rng.uniform(120, 200) * 0.75)), width=int(rng.uniform(4, 9) * S))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(2.6 * S)))
    mist = hexrgb("#8a9ec0")
    lay, d = layer(mist)
    for x0 in xs:
        x, y = W * x0 + 20 * S, H * (LAKE + 0.035)
        d.ellipse([x - 110 * S, y - 26 * S, x + 110 * S, y + 22 * S], fill=mist + (60,))
    d.rectangle([W * CL, H * (LAKE + 0.02), W * CR + 20 * S, H * (LAKE + 0.05)], fill=mist + (35,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(28 * S)))


def reflections(img):
    lay, d = layer()
    # the moon or sun's path on the water
    ox = P["orb"][0] * W
    for _ in range(160):
        y = H * rng.uniform(LAKE + 0.02, 0.98)
        spread = (y - H * LAKE) / H * 260 * S + 20 * S
        x = ox + rng.uniform(-spread, spread)
        d.line([(x, y), (x + rng.uniform(20, 90) * S, y)], fill=hexrgb(P["orb"][3]) + (int(rng.uniform(40, 120)),), width=max(1, int(2 * S)))
    # palace lights and the white falls mirrored as broken streaks
    li = P["lights"]
    for _ in range(140):
        x = W * rng.uniform(0.08, 0.48)
        y = H * rng.uniform(LAKE + 0.06, LAKE + 0.22)
        d.line([(x, y), (x + rng.uniform(10, 50) * S, y)], fill=li + (int(rng.uniform(20, 70)),), width=max(1, int(2 * S)))
    # ripples everywhere
    for _ in range(260):
        y = H * rng.uniform(LAKE + 0.01, 0.99)
        x = rng.random() * W
        d.line([(x, y), (x + rng.uniform(40, 200) * S, y)], fill=(255, 255, 255, 18), width=max(1, int(1.5 * S)))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(0.8 * S)))


def near(img):
    """Hills in the bottom corners with round-crowned trees; the middle stays open."""
    top, bottom = hexrgb(P["near"][0]), hexrgb(P["near"][1])
    lay, d = layer()
    d.ellipse([W * 0.62, H * 0.84, W * 1.3, H * 1.5], fill=top + (255,))
    d.ellipse([-W * 0.25, H * 0.90, W * 0.30, H * 1.5], fill=top + (255,))
    for cx, cy, n in ((0.86, 0.85, 9), (0.05, 0.91, 5)):
        for _ in range(n):
            x = W * cx + rng.uniform(-200, 200) * S
            y = H * cy + rng.uniform(-10, 20) * S
            r = rng.uniform(40, 80) * S
            d.rectangle([x - 5 * S, y - r * 0.4, x + 5 * S, y + 40 * S], fill=bottom + (255,))
            d.ellipse([x - r, y - r * 1.9, x + r, y - r * 0.2], fill=lerp(top, bottom, rng.uniform(0, 0.6)) + (255,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.5 * S)))


def mirror(img):
    y0 = int(H * (LAKE + 0.05))
    top = int(H * TOP) - int(330 * S)
    band = img.crop((0, top, W, y0)).transpose(Image.FLIP_TOP_BOTTOM)
    band = Image.blend(band.convert("RGB"), Image.new("RGB", band.size, hexrgb(P["lake"][1])), 0.55).convert("RGBA")
    a = Image.new("L", band.size, 0)
    ad = ImageDraw.Draw(a)
    for y in range(band.size[1]):
        ad.line([(0, y), (W, y)], fill=int(170 * (1 - y / band.size[1]) ** 1.3))
    m = Image.new("L", band.size, 0)
    ImageDraw.Draw(m).rectangle([int(W * CL) - int(60 * S), 0, int(W * CR) + int(80 * S), band.size[1]], fill=255)
    a = Image.composite(a, Image.new("L", band.size, 0), m.filter(ImageFilter.GaussianBlur(30 * S)))
    band.putalpha(a)
    # ripple: shift thin rows sideways
    out = Image.new("RGBA", band.size, (0, 0, 0, 0))
    for y in range(0, band.size[1], max(2, int(4 * S))):
        row = band.crop((0, y, W, y + max(2, int(4 * S))))
        out.paste(row, (int(math.sin(y * 0.09) * 6 * S + rng.uniform(-3, 3) * S), y))
    img.alpha_composite(out.filter(ImageFilter.GaussianBlur(1.5 * S)), (0, y0))


img = sky()
glow(img, P["orb"][0] * W, P["orb"][1] * H, P["orb"][2] * W, hexrgb(P["orb"][3]), P["orb"][4])
for i in range(3):
    ridge(img, i)
lake(img)
reflections(img)
cliff(img)
palace(img)
falls(img)
mirror(img)
near(img)
noise = Image.effect_noise((W, H), 40).convert("RGB")
Image.blend(img.convert("RGB"), noise, P["grain"] / 100).save(OUT, quality=90)
print(OUT)
