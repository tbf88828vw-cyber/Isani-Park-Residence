#!/usr/bin/env python3
"""Interactive selector data.
1) Apartment hotspots on the floor top-view renders. Coordinates were read from the architect's
   floor-plan PDF (Archicad zone fills, balcony outlines and apartment labels, pages 3-4) in PDF points
   and mapped onto the 2400x580 renders (same drawing frame).
2) Transparent 3D (axonometric) renders -> webp with alpha, keyed by layout type.
Writes src/data/floormap.json and public/assets/img/3d/*.webp
Usage: python3 tools/floormap.py "<developer folder>"   (or --no-images to rebuild only the hotspot data)"""
import json, os, sys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = next((a for a in sys.argv[1:] if not a.startswith("--")), "")  # developer's media folder
X0, XW, Y0, YH = 21.5, 1148.0, 281.1, 266.1   # building frame in PDF points
W, H = 2400, 580                              # render frame


def P(*pts):
    return [[round((x - X0) / XW * W, 1), round((y - Y0) / YH * H, 1)] for x, y in pts]


def rect(x0, x1, y0=281.1, y1=398.0):
    return P((x0, y0), (x1, y0), (x1, y1), (x0, y1))


def rectb(x0, x1):
    return rect(x0, x1, 421.0, 547.2)


CORNER_TL = P((21.7, 281.1), (139.2, 281.1), (139.2, 398), (117, 398), (117, 411), (21.7, 411))
CORNER_TR = P((1051.8, 281.1), (1169.3, 281.1), (1169.3, 411), (1070, 411), (1070, 398), (1051.8, 398))
CORNER_BL = P((21.7, 412.4), (117, 412.4), (117, 421), (182.8, 421), (182.8, 547.2), (21.7, 547.2))
CORNER_BR = P((1008.9, 421), (1070, 421), (1070, 412.4), (1169.3, 412.4), (1169.3, 547.2), (1008.9, 547.2))
L_LEFT = P((176.5, 281.1), (310.5, 281.1), (310.5, 398), (222.4, 398), (222.4, 341), (176.5, 341))
L_RIGHT = P((876.9, 281.1), (1014.5, 281.1), (1014.5, 347), (963.8, 347), (963.8, 398), (876.9, 398))
BOTTOM = [(877.6, 1008.9), (790.5, 876.9), (703.4, 789.8), (616.2, 702.7), (529.1, 615.5), (442.0, 528.4), (354.9, 441.3), (267.8, 354.2), (183.4, 267.1)]
TOP_1R = [(441.3, 500.8), (500.8, 560.2), (560.2, 615.5)]
TOP_2R = [(615.5, 702.7), (702.7, 789.8), (789.8, 876.9)]

# typical floor (2-10): 22 positions in the order of apartment numbers
typical = [CORNER_TL, L_LEFT, rect(311.3, 440.6)] + [rect(*r) for r in TOP_1R] + [rect(*r) for r in TOP_2R] + \
          [L_RIGHT, CORNER_TR, CORNER_BR] + [rectb(*r) for r in BOTTOM] + [CORNER_BL]
# 3D type per position (None = no 3D render supplied for this layout)
typical_3d = ['71-8', '64-2', '75-9', '30-2', '30-2', '30-2', '52-3', '52-3', '52-3', '64-2', '71-8', '101-9', None] + ['52-3'] * 8 + ['101-9']

# floor 1: 21 positions
floor1 = [CORNER_TL, rect(266.4, 440.6)] + [rect(*r) for r in TOP_1R] + [rect(*r) for r in TOP_2R] + \
         [L_RIGHT, CORNER_TR, P((1052, 412.4), (1169.3, 412.4), (1169.3, 547.2), (1052, 547.2))] + [rectb(*r) for r in BOTTOM] + [CORNER_BL]
floor1_3d = ['60-8', '101-1', '30-2', '30-2', '30-2', '52-3', '52-3', '52-3', '64-2', '71-8', '73-2', None] + ['52-3'] * 8 + ['101-9']

apts = json.load(open(os.path.join(ROOT, "src/data/apartments.source.json")))
by_floor = {}
for a in apts:
    by_floor.setdefault(a["floor"], []).append(a)
out = {"w": W, "h": H, "shapes": {"floor-1": floor1, "floor-typical": typical}, "apartments": {}}
for f, lst in by_floor.items():
    lst.sort(key=lambda a: a["id"])
    ref3d = floor1_3d if f == 1 else typical_3d
    assert len(lst) == len(ref3d), (f, len(lst))
    for pos, a in enumerate(lst):
        out["apartments"][a["id"]] = {"pos": pos, "t3d": ref3d[pos]}

# facade (gallery image 'front', 2000x1125 frame, normalised 0..1): floor bands, floor 10 on top
bands = {}
for f in range(1, 11):
    top = 230 + 72 + 63.6 * (10 - f)
    bands[f] = [round(138 / 2000, 4), round(top / 1125, 4), round(1827 / 2000, 4), round((top + 63.6) / 1125, 4)]
out["facade"] = {"image": "front", "bands": bands}

# 3D renders with alpha
R3 = os.path.join(SRC, "ბინის აქსონომეტრული რენდერები")
names = {"32.5": "30-2", "52.2": "52-3", "63": "60-8", "66.4": "64-2", "74.3": "71-8", "75.5": "73-2", "78.6": "75-9", "104": "101-1", "105.7": "101-9"}
dst = os.path.join(ROOT, "public/assets/img/3d")
os.makedirs(dst, exist_ok=True)
out["renders"] = {}
if "--no-images" not in sys.argv and SRC:
    for fn in os.listdir(R3):
        key = fn.split(" - ")[1].split(" ")[0]
        t = names[key]
        im = Image.open(os.path.join(R3, fn)).convert("RGBA")
        bb = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        im = im.crop(bb)
        for w in (800, 1600):
            x = im.copy(); x.thumbnail((w, w * 2), Image.LANCZOS)
            x.save(os.path.join(dst, f"apt3d-{t}-{w}.webp"), "WEBP", quality=82, method=6)
        out["renders"][t] = {"w": im.width, "h": im.height}
        print(t, im.size)
else:
    out["renders"] = json.load(open(os.path.join(ROOT, "src/data/floormap.json")))["renders"]
json.dump(out, open(os.path.join(ROOT, "src/data/floormap.json"), "w"), ensure_ascii=False)
print("ok", len(out["apartments"]))
