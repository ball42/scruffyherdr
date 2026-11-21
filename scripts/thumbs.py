#!/usr/bin/env python3
"""Writes 480x270 JPEG thumbnails (quality 80) of every scene picture named in
herdr/mods/herdr-signals/scenes.js, into herdr/backgrounds/thumbs/. The scene
picker (kit-scenes) shows them. It also writes each picture's mean luma (Pillow
"L" at 302x196) and sha256 to herdr/backgrounds/luma.json, which tests/luma.test.js holds
day pictures to (130 to 171, mid-tone). Run by hand after a picture changes,
then commit the output:  python3 scripts/thumbs.py   (needs Pillow)"""
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parent.parent
SIZE = (480, 270)

scenes = (ROOT / "herdr/mods/herdr-signals/scenes.js").read_text()
pictures = sorted(set(re.findall(r'"backgrounds/([\w.-]+\.jpg)"', scenes)))
out = ROOT / "herdr/backgrounds/thumbs"
out.mkdir(exist_ok=True)
luma = {}
for name in pictures:
    img = Image.open(ROOT / "herdr/backgrounds" / name).convert("RGB")
    luma[name] = {
        "luma": round(ImageStat.Stat(img.convert("L").resize((302, 196))).mean[0], 1),
        "sha256": hashlib.sha256((ROOT / "herdr/backgrounds" / name).read_bytes()).hexdigest(),
    }
    # Cover-crop to 16:9 so a different source ratio doesn't stretch.
    w, h = img.size
    want = SIZE[0] / SIZE[1]
    if w / h > want:
        nw = round(h * want)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = round(w / want)
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    img.resize(SIZE, Image.LANCZOS).save(out / name, "JPEG", quality=80, optimize=True)
    print(f"wrote {out / name}")
(ROOT / "herdr/backgrounds/luma.json").write_text(json.dumps(luma, indent=2, sort_keys=True) + "\n")
print("wrote herdr/backgrounds/luma.json")
