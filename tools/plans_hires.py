#!/usr/bin/env python3
"""Sharp 2000px plan images for zooming on phones (vector PDF -> 300 dpi raster -> panel crop -> WebP).

Usage: python3 tools/plans_hires.py   (reads public/assets/plans/pdf, writes public/assets/plans/img/apt-N-2000.webp)
Uses the same panel detection as tools/media.py so the crop matches the existing 1000px images.
"""
import os, re, subprocess, sys, tempfile
from concurrent.futures import ProcessPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, "public", "assets", "plans", "pdf")
IMG = os.path.join(ROOT, "public", "assets", "plans", "img")


def one(fn):
    n = re.search(r"apartment-(\d+)\.pdf$", fn).group(1)
    out = os.path.join(IMG, f"apt-{n}-2000.webp")
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["pdftoppm", "-r", "300", "-png", "-singlefile", os.path.join(PDF, fn), os.path.join(d, "p")], check=True)
        im = Image.open(os.path.join(d, "p.png")).convert("RGB")
    W, H = im.size
    px = im.load()
    def is_panel(c):
        return abs(c[0] - 243) < 10 and abs(c[1] - 239) < 10 and abs(c[2] - 230) < 12
    top = next(y for y in range(int(H * 0.08), H) if is_panel(px[W // 2, y]))
    bottom = next(y for y in range(H - 1, top, -1) if is_panel(px[W // 2, y]))
    left = next(x for x in range(0, W) if is_panel(px[x, (top + bottom) // 2]))
    right = next(x for x in range(W - 1, 0, -1) if is_panel(px[x, (top + bottom) // 2]))
    crop = im.crop((left, top, right + 1, bottom + 1))
    w = min(2000, crop.width)
    crop.resize((w, round(crop.height * w / crop.width)), Image.LANCZOS).save(out, "WEBP", quality=82, method=6)
    return n, crop.size


if __name__ == "__main__":
    files = sorted(f for f in os.listdir(PDF) if f.endswith(".pdf"))
    with ProcessPoolExecutor(max_workers=os.cpu_count()) as ex:
        for n, size in ex.map(one, files):
            print(n, size, flush=True)
