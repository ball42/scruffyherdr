"""Render an original jump-to-lightspeed wallpaper: star streaks pouring out
of a bright point just off centre, faint and fine near it and long and bright
toward the edges, in a blue tunnel of haze.

With --day the viewpoint changes: just out of the jump, above a bright
cloudy world whose limb fills the lower frame, the last short streaks
shrinking back into stars.

Usage: python3 scripts/hyperspace.py [--day] OUT.jpg [WIDTH HEIGHT]
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
rng = random.Random(12)

P = dict(
    centre="#ccd2e2" if DAY else "#1c2a66",
    edge="#6c7591" if DAY else "#020309",
    haze="#a3acc8" if DAY else "#2a3f8f",
    streaks=["#26326e", "#3e4c90", "#5a68a8"] if DAY else ["#ffffff", "#cfdcff", "#9fb8ff"],
    core="#f4f6fc" if DAY else "#f0f4ff",
    grain=3 if DAY else 4,
)
CX, CY = W * 0.53, H * 0.46


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def solid(c):
    return Image.new("RGB", (W, H), c)


# ---- Day: dropping out of the jump above a bright world, its limb filling
# the lower frame, the last streaks shrinking back into stars. Runs and exits
# before the night code below.
def day():
    rng = random.Random(31)

    def lerp(a, b, t):
        t = max(0.0, min(1.0, t))
        return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

    # Space, lit by the world below: deep blue at the top, paling to the limb.
    PX, PY, PR = W * 0.42, H * 2.05, H * 1.5    # the planet's centre and radius
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=lerp(rgb("#4a5e98"), rgb("#c4d4ea"), t ** 1.2))
    for _ in range(500):
        x, y = rng.random() * W, rng.random() * H * 0.45
        v = rng.randint(150, 240)
        d.ellipse([x, y, x + 2 * S, y + 2 * S], fill=(v, v, 255))
    # The last streaks: short, fading, all aimed back at the jump point.
    jx, jy = W * 0.62, H * 0.2
    st = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(st)
    for _ in range(160):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.08, 0.7) * H
        L = rng.uniform(0.02, 0.09) * H * (r / H + 0.3)
        x0, y0 = jx + math.cos(a) * r * 1.4, jy + math.sin(a) * r
        x1, y1 = jx + math.cos(a) * (r + L) * 1.4, jy + math.sin(a) * (r + L)
        if y1 > H * 0.6:
            continue
        for i in range(6):
            t0, t1 = i / 6, (i + 1) / 6
            sd.line([(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0), (x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1)], fill=int(200 * (1 - t1) + 30), width=max(1, int(2 * S)))
    img = Image.composite(solid((230, 238, 255)), img, st.filter(ImageFilter.GaussianBlur(0.8 * S)))
    # The world: a cloudy blue-white disc, its atmosphere a bright band at the limb.
    disc = Image.new("L", (W, H), 0)
    ImageDraw.Draw(disc).ellipse([PX - PR * 1.6, PY - PR, PX + PR * 1.6, PY + PR], fill=255)
    # Cloud cover is drawn flat, as if seen from straight above, then each
    # row is pulled from a texture row that runs faster toward the limb, so
    # the clouds foreshorten into thin bands near the horizon.
    flat = Image.new("RGB", (W, H * 2), rgb("#88acd4"))
    for scale, blur, col, k in [((24, 60), 30, "#dfe8f2", 2.2), ((60, 160), 10, "#f4f8fc", 2.6), ((10, 30), 60, "#3e6a98", 1.6)]:
        n = Image.effect_noise(scale, 60).resize((W, H * 2), Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur * S))
        flat = Image.composite(solid(rgb(col)).resize((W, H * 2)), flat, n.point(lambda v, k=k: max(0, min(255, int((v - 128) * k + 40)))))
    top = PY - PR
    world = Image.new("RGB", (W, H))
    for y in range(max(0, int(top)), H):
        u = max(0.0, (y - top) / (H - top))
        v = int((H * 2 - 1) * u ** 0.45)
        world.paste(flat.crop((0, v, W, v + 1)), (0, y))
    shade = Image.linear_gradient("L").resize((W, H)).point(lambda v: int(50 * (v / 255) ** 2))
    world = Image.composite(solid(rgb("#2e4c78")), world, shade)
    img = Image.composite(world, img, disc.filter(ImageFilter.GaussianBlur(1.5 * S)))
    limb = Image.new("L", (W, H), 0)
    ImageDraw.Draw(limb).ellipse([PX - PR * 1.6, PY - PR, PX + PR * 1.6, PY + PR], outline=255, width=max(1, int(26 * S)))
    img = Image.composite(solid(rgb("#d8ecff")), img, limb.filter(ImageFilter.GaussianBlur(26 * S)))
    img = Image.composite(solid(rgb("#f4faff")), img, limb.filter(ImageFilter.GaussianBlur(5 * S)).point(lambda v: int(v * 0.8)))
    # The jump point: a soft white flare where the streaks converge.
    flare = Image.new("L", (W, H), 0)
    ImageDraw.Draw(flare).ellipse([jx - 70 * S, jy - 50 * S, jx + 70 * S, jy + 50 * S], fill=255)
    img = Image.composite(solid((240, 246, 255)), img, flare.filter(ImageFilter.GaussianBlur(50 * S)).point(lambda v: int(v * 0.7)))
    vig = Image.new("L", (W, H), 255)
    ImageDraw.Draw(vig).ellipse([-W * 0.1, -H * 0.15, W * 1.1, H * 1.15], fill=0)
    img = Image.composite(solid((20, 26, 50)), img, vig.filter(ImageFilter.GaussianBlur(260 * S)).point(lambda v: int(v * 0.22)))
    noise = Image.effect_noise((W, H), 40).convert("RGB")
    Image.blend(img, ImageChops.overlay(img, noise), 3 / 30).save(OUT, quality=90)
    print(OUT)


if DAY:
    day()
    sys.exit(0)

# ---- Ground: a radial fall from the centre to the edges.
reach = math.hypot(W, H) * 0.62
g = Image.radial_gradient("L").resize((int(reach * 2), int(reach * 2)))
fall = Image.new("L", (W, H), 255)
fall.paste(g.point(lambda v: min(255, int(v * 1.45))), (int(CX - reach), int(CY - reach)))
img = Image.composite(solid(rgb(P["edge"])), solid(rgb(P["centre"])), fall)

# A tunnel of haze: a soft ring around the centre, uneven, so the streaks
# seem to run down a tube.
ring = Image.new("L", (W, H), 0)
rd = ImageDraw.Draw(ring)
for _ in range(220):
    a = rng.uniform(0, 2 * math.pi)
    r = rng.uniform(0.18, 0.42) * H
    x, y = CX + math.cos(a) * r * 1.35, CY + math.sin(a) * r
    s = rng.uniform(40, 140) * S
    rd.ellipse([x - s, y - s * 0.6, x + s, y + s * 0.6], fill=rng.randint(30, 90))
img = Image.composite(solid(rgb(P["haze"])), img, ring.filter(ImageFilter.GaussianBlur(70 * S)))

# ---- Streaks: each runs outward along its angle, a wedge that widens and
# brightens with distance. Drawn as masks per colour, glowing by night.
layers = [Image.new("L", (W, H), 0) for _ in P["streaks"]]
draws = [ImageDraw.Draw(m) for m in layers]
for _ in range(int(1100 * S) + 200):
    a = rng.uniform(0, 2 * math.pi)
    d0 = rng.uniform(0.02, 0.35) ** 1.3 * H
    d1 = d0 + rng.uniform(0.15, 0.9) * H * (0.4 + d0 / H)
    w = rng.uniform(0.5, 2.6) * S * (0.6 + d1 / H)
    k = rng.choices(range(len(layers)), weights=[5, 3, 2])[0]
    segs = 6
    for i in range(segs):
        t0, t1 = i / segs, (i + 1) / segs
        r0, r1 = d0 + (d1 - d0) * t0, d0 + (d1 - d0) * t1
        x0, y0 = CX + math.cos(a) * r0 * 1.3, CY + math.sin(a) * r0
        x1, y1 = CX + math.cos(a) * r1 * 1.3, CY + math.sin(a) * r1
        draws[k].line([(x0, y0), (x1, y1)], fill=int(255 * (0.15 + 0.85 * t1) * rng.uniform(0.6, 1)), width=max(1, int(w * (0.4 + t1))))
for m, col in zip(layers, P["streaks"]):
    if not DAY:
        img = Image.composite(solid(rgb(col)), img, m.filter(ImageFilter.GaussianBlur(9 * S)).point(lambda v: int(v * 0.45)))
    img = Image.composite(solid(rgb(col)), img, m.filter(ImageFilter.GaussianBlur(0.8 * S)).point(lambda v: int(v * (0.75 if DAY else 1))))

# ---- The bright point the streaks leave from.
core = Image.new("L", (W, H), 0)
ImageDraw.Draw(core).ellipse([CX - 90 * S, CY - 70 * S, CX + 90 * S, CY + 70 * S], fill=255)
img = Image.composite(solid(rgb(P["core"])), img, core.filter(ImageFilter.GaussianBlur(60 * S)).point(lambda v: int(v * 0.9)))

# ---- Vignette and grain.
vig = Image.new("L", (W, H), 255)
ImageDraw.Draw(vig).ellipse([-W * 0.1, -H * 0.15, W * 1.1, H * 1.15], fill=0)
vig = vig.filter(ImageFilter.GaussianBlur(260 * S))
img = Image.composite(solid((40, 46, 70) if DAY else (0, 0, 0)), img, vig.point(lambda v: int(v * (0.45 if DAY else 0.6))))
noise = Image.effect_noise((W, H), 40).convert("RGB")
img = Image.blend(img, ImageChops.overlay(img, noise), P["grain"] / 30)

img.save(OUT, quality=90)
print(OUT)
