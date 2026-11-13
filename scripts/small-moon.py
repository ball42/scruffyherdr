"""Render an original battle-station wallpaper. At night: deep space, a
dusting of stars and a faint galactic band, the grey moon-sized station in
view, half lit and turned so its dish faces away, the equatorial trench
bowing across it in an arc, its plating laid in staggered panels and broken
bands, and lights pricking its dark side. With --day: a close-up over the
station's light grey plated surface, scattered raised blocks and vents
casting shadows and a few short sunken channels that stop and turn,
mid-toned so it still shows through the terminals.

Usage: python3 scripts/small-moon.py [--day] OUT.jpg [WIDTH HEIGHT]
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
rng = random.Random(1983)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def layer(col=(0, 0, 0)):
    lay = Image.new("RGBA", (W, H), tuple(col) + (0,))
    return lay, ImageDraw.Draw(lay)


def grain(img, amount):
    noise = Image.effect_noise((W, H), 40).convert("RGB")
    return Image.blend(img.convert("RGB"), noise, amount / 100)


def h01(*k):
    """A stable pseudo-random number in [0, 1) from integer keys."""
    v = 2166136261
    for x in k:
        v = ((v ^ (x & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
    v ^= v >> 13
    v = (v * 1274126177) & 0xFFFFFFFF
    return (v ^ (v >> 16)) % 100000 / 100000


# ---------------------------------------------------------------- night: the station in space
def space():
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=lerp((4, 5, 12), (10, 12, 26), t) + (255,))
    # a faint galactic band running corner to corner, dust and haze
    band, bd = layer((90, 100, 140))
    for _ in range(140):
        u = rng.random()
        x = u * W
        y = H * (0.95 - 0.8 * u) + rng.gauss(0, 120) * S
        r = rng.uniform(80, 220) * S
        bd.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=(90, 100, 140, 10))
    img.alpha_composite(band.filter(ImageFilter.GaussianBlur(70 * S)))
    neb, nd = layer((120, 70, 110))
    nd.ellipse([W * 0.02, H * 0.55, W * 0.32, H * 0.95], fill=(120, 70, 110, 22))
    img.alpha_composite(neb.filter(ImageFilter.GaussianBlur(160 * S)))
    stars, sd = layer((255, 255, 255))
    for _ in range(1400):
        u = rng.random()
        near_band = rng.random() < 0.5
        x = u * W if near_band else rng.random() * W
        y = (H * (0.95 - 0.8 * u) + rng.gauss(0, 160) * S) if near_band else rng.random() * H
        r = rng.choice([0.6, 0.8, 1.0, 1.0, 1.4, 2.0]) * S * 1.3
        b = int(rng.uniform(110, 245))
        tint = rng.choice([(b, b, b), (b, b, min(255, b + 25)), (min(255, b + 20), b, b - 10)])
        sd.ellipse([x - r, y - r, x + r, y + r], fill=tint + (255,))
    img.alpha_composite(stars)
    for _ in range(14):  # a few bright stars with soft halos
        x, y = rng.random() * W, rng.random() * H
        g, gd = layer((220, 230, 255))
        gd.ellipse([x - 9 * S, y - 9 * S, x + 9 * S, y + 9 * S], fill=(220, 230, 255, 70))
        img.alpha_composite(g.filter(ImageFilter.GaussianBlur(6 * S)))
    return img


SECTORS = 56  # longitude sectors; each lays its bands at its own offset
BANDS = 34    # bands per unit of latitude


def plating(lat, lon):
    """(tone, seam, sector, row) of the plate at a latitude and longitude: panels whose
    rows are staggered sector to sector, so no seam runs round the station."""
    sec = int((lon + 1.6) * SECTORS / 3.2)
    off = h01(sec, 7)
    fb = (lat + 1.6) * BANDS + off
    row = int(fb)
    # each row splits its sector in two at its own point, so verticals break too
    fs = (lon + 1.6) * SECTORS / 3.2 - sec
    cut = 0.3 + 0.4 * h01(sec, row, 3)
    half = 0 if fs < cut else 1
    tone = h01(sec, row, half, 11)
    # broken bands: a darker or lighter run of a few rows in only some sectors
    strip = h01(sec, row // 3, 5)
    if strip < 0.12:
        tone -= 0.55
    elif strip > 0.93:
        tone += 0.35
    e = min(fb - row, 1 - (fb - row), abs(fs - cut) * 2.2, fs * 2.2, (1 - fs) * 2.2)
    return tone, e, sec, row


TILT = math.radians(24)   # the top leans toward us, so the equator bows into an arc
ROLL = math.radians(-14)  # and the axis leans a little to the right


def frame(nx, ny, nz):
    """A view-space normal in the station's own frame: (x, y, z), y along its axis.
    Turned this way, the dish is on the far side, out of view."""
    y1 = ny * math.cos(TILT) - nz * math.sin(TILT)
    z1 = ny * math.sin(TILT) + nz * math.cos(TILT)
    x2 = nx * math.cos(ROLL) - y1 * math.sin(ROLL)
    y2 = nx * math.sin(ROLL) + y1 * math.cos(ROLL)
    return x2, y2, z1


def station(img):
    cx, cy, R = W * 0.70, H * 0.37, 380 * S
    lx, ly = -0.62, -0.5  # light from the upper left
    ln = math.hypot(lx, ly, 0.6)
    L = (lx / ln, ly / ln, 0.6 / ln)
    body = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = body.load()
    x0, x1 = int(cx - R), int(cx + R) + 1
    y0, y1 = int(cy - R), int(cy + R) + 1
    for y in range(y0, y1):
        for x in range(x0, x1):
            nx, ny = (x - cx) / R, (y - cy) / R
            rr = nx * nx + ny * ny
            if rr > 1:
                continue
            nz = math.sqrt(1 - rr)
            lam = max(0.0, nx * L[0] + ny * L[1] + nz * L[2])
            shade = 0.05 + 0.95 * lam ** 0.9
            bx, by, bz = frame(nx, ny, nz)
            lat = math.asin(max(-1, min(1, by)))
            lon = math.atan2(bx, bz)
            tone, edge, _, _ = plating(lat, lon)
            # near the pole the sectors pinch together: the plating fades out there
            q = min(1.0, max(0.0, (abs(by) - 0.72) / 0.26))
            pole = 1 - q * q * (3 - 2 * q)
            base = 150 + 24 * (tone - 0.5) * pole
            if edge < 0.08:  # the seam between plates
                base *= 1 - 0.1 * pole
            # the trench round the equator: a dark cut with a lit lower lip
            if abs(by) < 0.011:
                base *= 0.32
            elif -0.016 < by <= -0.011:
                base *= 0.7
            elif 0.011 <= by < 0.017:
                base *= 1.12
            v_ = base * shade
            col = (int(v_ * 0.94), int(v_ * 0.97), int(v_ * 1.04))
            edge_ = max(0.0, (rr - 0.94) / 0.06) * lam  # rim glow where the light grazes the edge
            col = lerp(col, (220, 226, 236), edge_ * 0.5)
            px[x, y] = col + (255,)
    img.alpha_composite(body)
    # lights on the dark side: windows along the middle of the plate rows
    lights, ld = layer((255, 222, 170))
    for _ in range(3600):
        a = rng.uniform(0, 2 * math.pi)
        r = R * math.sqrt(rng.random()) * 0.97
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
        nx, ny = (x - cx) / R, (y - cy) / R
        nz = math.sqrt(max(0, 1 - nx * nx - ny * ny))
        lam = max(0.0, nx * L[0] + ny * L[1] + nz * L[2])
        if lam > 0.33:
            continue
        bx, by, bz = frame(nx, ny, nz)
        lat, lon = math.asin(max(-1, min(1, by))), math.atan2(bx, bz)
        sec = int((lon + 1.6) * SECTORS / 3.2)
        fb = (lat + 1.6) * BANDS + h01(sec, 7)
        if abs(fb - int(fb) - 0.5) > 0.12:
            continue
        a_ = int(rng.uniform(70, 230) * (1 - lam / 0.33))
        ld.rectangle([x, y, x + 2.4 * S, y + 1.6 * S], fill=(255, 222, 170, a_))
    img.alpha_composite(lights)
    # a faint atmosphere of light where the sun grazes the limb
    halo, hd = layer((180, 200, 240))
    hd.ellipse([cx - R * 1.03, cy - R * 1.03, cx + R * 1.03, cy + R * 1.03], outline=(180, 200, 240, 40), width=int(10 * S))
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).pieslice([cx - R * 1.1, cy - R * 1.1, cx + R * 1.1, cy + R * 1.1], 150, 300, fill=255)
    halo.putalpha(ImageChops.multiply(halo.getchannel("A"), m))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(8 * S)))


def night():
    img = space()
    station(img)
    return grain(img, 4)


# ---------------------------------------------------------------- day: low over the plating
HZ = 0.20     # the horizon
CW = 0.3      # a ground cell, across (u) and ahead (z), in camera heights
DEPTH = 0.35  # how far a channel sinks
ZMAX = 36.0   # past this the plating is lost in the haze


def proj(u, z, h=1.0):
    """Ground point (u across, z ahead) seen from height 1; h is how far below the camera it is."""
    vx, vy = W * 0.5, H * HZ
    f = (H - vy) / 1.0
    return vx + f * u / z * 0.9, vy + f * h / z


HAZE = (176, 184, 196)


def fog(col, z):
    return lerp(col, HAZE, min(1.0, max(0.0, (z - 1) / (ZMAX - 1))) ** 0.75)


def quad(u0, u1, z0, z1, h=1.0):
    return [proj(u0, z0, h), proj(u1, z0, h), proj(u1, z1, h), proj(u0, z1, h)]


def channels():
    """A few short sunken runs on the cell grid, each going ahead or across a few cells
    and then turning once or twice before it stops. Returns the set of (i, j) cells."""
    cells = set()
    starts = [(-7, 7), (3, 9), (-2, 17), (8, 20), (-13, 24), (2, 31), (-17, 36), (14, 40), (-6, 50), (19, 56)]
    for si, sj in starts:
        i, j = si, sj
        d = rng.choice([(0, 1), (1, 0), (-1, 0)])
        for _ in range(rng.randint(2, 3)):
            for _ in range(rng.randint(3, 6)):
                cells.add((i, j))
                i, j = i + d[0], j + d[1]
            d = (d[1], d[0]) if d[0] == 0 else (0, 1)
            if rng.random() < 0.5 and d[1] == 0:
                d = (-d[0], 0)
        cells.add((i, j))
    return cells


def day():
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    # space above the horizon, lit pale by the sun's glare
    for y in range(int(H * HZ) + 2):
        t = y / (H * HZ)
        d.line([(0, y), (W, y)], fill=lerp((60, 72, 98), (158, 170, 190), t ** 1.4) + (255,))
    st, sd = layer((255, 255, 255))
    for _ in range(120):
        x, y = rng.random() * W, rng.random() * H * HZ * 0.7
        r = rng.choice([0.7, 1.0, 1.3]) * S * 1.3
        sd.ellipse([x - r, y - r, x + r, y + r], fill=(240, 244, 255, int(rng.uniform(90, 200))))
    img.alpha_composite(st)
    g, gd = layer((255, 250, 235))
    gd.ellipse([W * 0.12 - 60 * S, H * 0.07 - 60 * S, W * 0.12 + 60 * S, H * 0.07 + 60 * S], fill=(255, 250, 235, 255))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(14 * S)))
    g, gd = layer((255, 250, 235))
    gd.ellipse([W * 0.12 - 500 * S, H * 0.07 - 400 * S, W * 0.12 + 500 * S, H * 0.07 + 400 * S], fill=(255, 250, 235, 60))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(180 * S)))

    # the far plating, a haze band all the way to the horizon
    d.rectangle([0, proj(0, ZMAX)[1] - 2, W, H], fill=HAZE + (255,))

    surf = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(surf)
    jmax = int((ZMAX - 1) / CW)
    # plates: cells grouped into panels of a few cells, each its own tone
    for j in range(jmax, -1, -1):
        z0, z1 = 1 + j * CW, 1 + (j + 1) * CW
        imax = int(z1 * 1.12 / CW) + 1
        for i in range(-imax, imax):
            u0, u1 = i * CW, (i + 1) * CW
            pw, ph = 2 + int(h01(j // 3, 41) * 3), 3
            pi_ = (i + int(h01(j // ph, 43) * 5)) // pw
            tone = 188 + (h01(pi_, j // ph, 47) - 0.5) * 30
            col = fog((int(tone), int(tone + 2), int(tone + 7)), z1)
            seam = fog((150, 155, 165), z1)
            sd.polygon(quad(u0, u1, z0, z1), fill=col + (255,))
            if z1 < 22:
                # panel seams on the panel's left and far edges
                if (i + int(h01(j // ph, 43) * 5)) % pw == 0:
                    sd.line([proj(u0, z0), proj(u0, z1)], fill=seam + (255,), width=max(1, int(3 * S / z0)))
                if (j + 1) % ph == 0:
                    sd.line([proj(u0, z1), proj(u1, z1)], fill=seam + (255,), width=max(1, int(3 * S / z0)))
                r_ = h01(i, j, 53)
                if r_ < 0.05:  # vent slots
                    for k in range(3):
                        q = z0 + CW * (0.25 + 0.2 * k)
                        sd.polygon(quad(u0 + CW * 0.18, u1 - CW * 0.18, q, q + CW * 0.08), fill=fog((96, 100, 110), z1) + (255,))
                elif r_ < 0.11:  # an inset plate
                    tone_ = rng.choice([-16, -9, 9])
                    c2 = tuple(max(0, min(255, v + tone_)) for v in col)
                    sd.polygon(quad(u0 + CW * 0.2, u1 - CW * 0.2, z0 + CW * 0.2, z1 - CW * 0.2), fill=c2 + (255,))
    img.alpha_composite(surf)

    # sunken channels: clipped to their openings, the far wall and the inner side wall showing
    chan = channels()
    cl, cd = layer()
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    for (i, j) in sorted(chan, key=lambda c: -c[1]):
        z0, z1 = 1 + j * CW, 1 + (j + 1) * CW
        u0, u1 = i * CW, (i + 1) * CW
        md.polygon(quad(u0, u1, z0, z1), fill=255)
        cd.polygon(quad(u0, u1, z0, z1), fill=fog((70, 76, 88), z1) + (255,))
        cd.polygon(quad(u0, u1, z0, z1, 1 + DEPTH), fill=fog((82, 88, 100), z1) + (255,))
    for (i, j) in sorted(chan, key=lambda c: -c[1]):
        z0, z1 = 1 + j * CW, 1 + (j + 1) * CW
        u0, u1 = i * CW, (i + 1) * CW
        if (i, j + 1) not in chan:  # the far wall faces us
            cd.polygon([proj(u0, z1), proj(u1, z1), proj(u1, z1, 1 + DEPTH), proj(u0, z1, 1 + DEPTH)], fill=fog((128, 134, 146), z1) + (255,))
        # the side wall we see: on the right of the view it faces left, toward the sun
        if u0 >= 0 and (i + 1, j) not in chan:
            cd.polygon([proj(u1, z0), proj(u1, z1), proj(u1, z1, 1 + DEPTH), proj(u1, z0, 1 + DEPTH)], fill=fog((204, 208, 216), z1) + (255,))
        if u1 <= 0 and (i - 1, j) not in chan:
            cd.polygon([proj(u0, z0), proj(u0, z1), proj(u0, z1, 1 + DEPTH), proj(u0, z0, 1 + DEPTH)], fill=fog((122, 128, 140), z1) + (255,))
    cl.putalpha(ImageChops.multiply(cl.getchannel("A"), mask))
    img.alpha_composite(cl)

    # raised blocks, far to near: a lit top, a front face, the side toward the middle, a shadow to the right
    bl, bd = layer()
    blocks = []
    for _ in range(160):
        z = 1.8 + (ZMAX * 0.55) * rng.random() ** 1.5
        u = rng.uniform(-1.05, 1.05) * z
        if any(abs(u - (ci + 0.5) * CW) < CW * 2.2 and abs(z - (1 + (cj + 0.5) * CW)) < CW * 2.2 for ci, cj in chan):
            continue
        tall = rng.random() < 0.15
        w = rng.uniform(0.15, 0.45) * (1.3 if tall else 1)
        dz = rng.uniform(0.15, 0.5)
        hgt = rng.uniform(0.14, 0.24) if tall else rng.uniform(0.03, 0.11)
        blocks.append((z, u, w, dz, hgt))
    # small low fittings close by: hatches and conduit boxes on the near plates
    for _ in range(40):
        z = rng.uniform(1.15, 3.2)
        u = rng.uniform(-1.0, 1.0) * z
        if any(abs(u - (ci + 0.5) * CW) < CW * 1.2 and abs(z - (1 + (cj + 0.5) * CW)) < CW * 1.2 for ci, cj in chan):
            continue
        blocks.append((z, u, rng.uniform(0.05, 0.16), rng.uniform(0.04, 0.12), rng.uniform(0.012, 0.04)))
    for z, u, w, dz, hgt in sorted(blocks, key=lambda b: -b[0]):
        a0, a1, z0, z1 = u - w / 2, u + w / 2, z, z + dz
        top = 1 - hgt
        bd.polygon(quad(a1, a1 + hgt * 1.3, z0, z1), fill=fog((132, 138, 150), z1) + (255,))
        if a0 > 0:  # its left side shows, lit
            bd.polygon([proj(a0, z0), proj(a0, z1), proj(a0, z1, top), proj(a0, z0, top)], fill=fog((206, 210, 218), z1) + (255,))
        elif a1 < 0:  # its right side shows, in shade
            bd.polygon([proj(a1, z0), proj(a1, z1), proj(a1, z1, top), proj(a1, z0, top)], fill=fog((126, 132, 144), z1) + (255,))
        bd.polygon([proj(a0, z0), proj(a1, z0), proj(a1, z0, top), proj(a0, z0, top)], fill=fog((156, 162, 174), z0) + (255,))
        bd.polygon(quad(a0, a1, z0, z1, top), fill=fog((216, 220, 228), z1) + (255,))
        if hgt > 0.14 and z < 14:  # a warm light on the tall ones
            x, y = proj(u, z0, top + hgt * 0.3)
            r = max(1.5, 8 * S / z)
            bd.ellipse([x - r, y - r, x + r, y + r], fill=(255, 220, 160, 220))
    img.alpha_composite(bl)

    # a soft haze where the surface meets the horizon
    lay, ld = layer(HAZE)
    ld.rectangle([0, H * HZ - 10 * S, W, H * (HZ + 0.06)], fill=HAZE + (200,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(26 * S)))
    return grain(img, 3)


(day() if DAY else night()).save(OUT, quality=90)
print(OUT)
