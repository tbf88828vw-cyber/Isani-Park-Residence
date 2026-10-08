#!/usr/bin/env python3
"""Exterior renders -> high-quality responsive web images (October 2026 refresh).

Usage: python3 tools/media_gallery.py "<ISANI PARK RESIDENCE folder>"
Source: 3840x2160 (portrait 3072x3840) PNG/JPG renders from the developer.
Output: public/assets/img/gallery/<id>-<w>.{avif,webp} for w in 640, 1280, 1920, 2560, 3840
and public/assets/img/og-image.jpg; updates src/data/media.json (gallery list).
Quality is chosen for architectural detail (brick texture, railings): WebP q86, AVIF q64, 4:4:4 chroma.
"""
import json, os, sys
from PIL import Image

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "img", "gallery")
WIDTHS = [640, 1280, 1920, 2560, 3840]
EXT, CITY = "Рендеры экстерьера", "Рендеры экстерьера для мэрии"

# id, source. Newer renders prepared for the city hall replace the two most saturated older ones
# (park-facade = 3.png, street-view = 9.png).
GALLERY = [
    ("front", f"{CITY}/02.png"),
    ("corner-west", f"{CITY}/01.png"),
    ("corner-east", f"{CITY}/04.png"),
    ("aerial-courtyard", f"{EXT}/11.png"),
    ("aerial-paths", f"{EXT}/10.png"),
    ("corner-tower", f"{EXT}/1.png"),
    ("garden-walk", f"{EXT}/5.png"),
    ("evening-light", f"{EXT}/8.png"),
    ("front-trees", f"{EXT}/4.png"),
    ("garden-front", f"{CITY}/03.jpg"),
    ("portrait-corner", f"{EXT}/7.png"),
    ("east-facade", f"{CITY}/06.jpg"),
]


def load_rgb(path):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)
    keep = set()
    gal = []
    for gid, rel in GALLERY:
        im = load_rgb(os.path.join(SRC, rel))
        ws = []
        for w in WIDTHS:
            w = min(w, im.width)
            if w in ws:
                continue
            h = round(im.height * w / im.width)
            r = im if w == im.width else im.resize((w, h), Image.LANCZOS)
            base = os.path.join(OUT, f"{gid}-{w}")
            r.save(base + ".webp", "WEBP", quality=86, method=6)
            r.save(base + ".avif", "AVIF", quality=64, speed=5, subsampling="4:4:4")
            keep.update({f"{gid}-{w}.webp", f"{gid}-{w}.avif"})
            ws.append(w)
        gal.append({"id": gid, "w": im.width, "h": im.height, "sizes": ws})
        print("gallery", gid, im.size, ws, flush=True)
    for f in os.listdir(OUT):  # drop files of renders no longer used
        if f not in keep:
            os.remove(os.path.join(OUT, f))
    # Open Graph 1200x630 from the corner view
    im = load_rgb(os.path.join(SRC, GALLERY[1][1]))
    tw, th = 1200, 630
    s = max(tw / im.width, th / im.height)
    r = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    l, t = (r.width - tw) // 2, (r.height - th) // 2
    r.crop((l, t, l + tw, t + th)).save(os.path.join(ROOT, "public", "assets", "img", "og-image.jpg"), "JPEG", quality=88, optimize=True, progressive=True)
    mp = os.path.join(ROOT, "src", "data", "media.json")
    m = json.load(open(mp))
    m["gallery"] = gal
    json.dump(m, open(mp, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
