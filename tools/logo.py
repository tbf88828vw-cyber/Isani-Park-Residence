#!/usr/bin/env python3
"""Generate the Mono Capitals / Isani Park Residence identity (concept) as clean SVG.

The letterforms are drawn from one idea: the arch and the column. Tall, narrow
glyphs (1 : 3) built from vertical strokes and half-circle arches, like an arcade
seen from the street. Everything is a single stroke path so the marks stay crisp
from favicon size to a full-width hero.

Outputs to public/assets/logo/ and src/data/logo.json (paths reused inline by the build).
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "logo")
os.makedirs(OUT, exist_ok=True)

H = 120  # cap height
R = 20   # arch radius (letter width 40)

G = {  # glyph: (width, path)
    "A": (40, "M0 120V20A20 20 0 0 1 40 20V120M0 68H40"),
    "B": (40, "M0 120V0H18A18 18 0 0 1 36 18V38A18 18 0 0 1 18 56H0M18 56H20A20 20 0 0 1 40 76V100A20 20 0 0 1 20 120H0"),
    "Y": (40, "M0 0V28A20 20 0 0 0 40 28V0M20 48V120"),
    "C": (40, "M40 22A20 20 0 0 0 0 20V100A20 20 0 0 0 40 98"),
    "D": (40, "M0 0H20A20 20 0 0 1 40 20V100A20 20 0 0 1 20 120H0Z"),
    "E": (38, "M38 0H0V120H38M0 58H30"),
    "I": (0, "M0 0V120"),
    "K": (38, "M0 0V120M38 0L4 60M16 48L38 120"),
    "L": (36, "M0 0V120H36"),
    "M": (44, "M0 120V11A11 11 0 0 1 22 11V120M22 11A11 11 0 0 1 44 11V120"),
    "N": (40, "M0 120V0L40 120V0"),
    "O": (40, "M0 20A20 20 0 0 1 40 20V100A20 20 0 0 1 0 100Z"),
    "P": (40, "M0 120V0H20A20 20 0 0 1 40 20V38A20 20 0 0 1 20 58H0"),
    "R": (40, "M0 120V0H20A20 20 0 0 1 40 20V38A20 20 0 0 1 20 58H0M22 58L40 120"),
    "S": (40, "M40 22A20 20 0 0 0 0 20V34A20 20 0 0 0 10 52L30 68A20 20 0 0 1 40 86V100A20 20 0 0 1 0 98"),
    "T": (40, "M0 0H40M20 0V120"),
}
TRACK = 20
SPACE = 76


def translate(path, dx, dy=0):
    """Shift absolute path commands by dx,dy (supports M L H V A Z as used above)."""
    out, i, toks = [], 0, []
    import re
    for m in re.finditer(r"[MLHVAZ]|-?\d+(?:\.\d+)?", path):
        toks.append(m.group(0))
    cmd = None
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t; out.append(t); i += 1
            if cmd == "Z":
                continue
            continue
        if cmd in ("M", "L"):
            x, y = float(toks[i]), float(toks[i+1]); out.append(f"{x+dx:g} {y+dy:g}"); i += 2
        elif cmd == "H":
            out.append(f"{float(t)+dx:g}"); i += 1
        elif cmd == "V":
            out.append(f"{float(t)+dy:g}"); i += 1
        elif cmd == "A":
            rx, ry, rot, la, sw, x, y = toks[i:i+7]
            out.append(f"{rx} {ry} {rot} {la} {sw} {float(x)+dx:g} {float(y)+dy:g}"); i += 7
    s = ""
    for o in out:
        if o.isalpha():
            s += o
        else:
            s += (" " if s and not s[-1].isalpha() else "") + o
    return s


def word(text, track=TRACK, space=SPACE):
    x, parts = 0, []
    for ch in text:
        if ch == " ":
            x += space - track
            continue
        w, p = G[ch]
        parts.append(translate(p, x))
        x += w + track
    return " ".join(parts), x - track


def svg(w, h, body, title, pad=0, extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {w+2*pad:g} {h+2*pad:g}" '
            f'role="img" aria-label="{title}"{extra}><title>{title}</title>{body}</svg>\n')


def stroke(d, color, sw):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'


IVORY, INK, CHAMPAGNE = "#EFE6D8", "#1B1814", "#CDB48A"
data = {}

# 1. Mono Capitals wordmark
d_mc, w_mc = word("MONO CAPITALS")
data["monoCapitals"] = {"d": d_mc, "w": w_mc, "h": H}
for name, col in [("mono-capitals-wordmark-dark-bg", IVORY), ("mono-capitals-wordmark-light-bg", INK)]:
    open(os.path.join(OUT, name + ".svg"), "w").write(svg(w_mc, H, stroke(d_mc, col, 4), "Mono Capitals", pad=4))

# 2. Monogram: an arched window holding the M (double arch) and C (open arch)
#    Frame: 150 x 220, arch top radius 75.
mono_frame = "M4 216V79A71 71 0 0 1 146 79V216Z"
m_path = translate(G["M"][1], 34, 70)
c_path = translate(G["C"][1], 86, 70)
data["monogram"] = {"frame": mono_frame, "m": m_path, "c": c_path, "w": 150, "h": 220}
for name, col, acc in [("mono-capitals-monogram-dark-bg", IVORY, CHAMPAGNE), ("mono-capitals-monogram-light-bg", INK, "#8A6D3F")]:
    body = stroke(mono_frame, col, 3) + stroke(m_path, col, 6) + stroke(c_path, acc, 6)
    open(os.path.join(OUT, name + ".svg"), "w").write(svg(150, 220, body, "Mono Capitals", pad=3))

# favicon: heavier strokes, dark tile
fav_m = translate(G["M"][1], 18, 20)
fav_c = translate(G["C"][1], 72, 20)
fav = ('<rect x="0" y="0" width="130" height="160" rx="26" fill="#0E0C0A"/>' +
       stroke(fav_m, IVORY, 13) + stroke(fav_c, CHAMPAGNE, 13))
open(os.path.join(OUT, "favicon.svg"), "w").write(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 0 160 160"><title>Isani Park Residence</title>' + fav + '</svg>\n')
data["byMono"] = dict(zip(("d", "w"), word("BY MONO CAPITALS")))

# 3. Isani Park Residence lock-up
d_ipr, w_ipr = word("ISANI PARK RESIDENCE")
data["isaniPark"] = {"d": d_ipr, "w": w_ipr, "h": H}
# two-line lock-up: ISANI PARK / RESIDENCE, plus "by Mono Capitals" set in the small wordmark
d_l1, w_l1 = word("ISANI PARK")
d_l2, w_l2 = word("RESIDENCE")
data["isaniPark2"] = {"l1": d_l1, "w1": w_l1, "l2": d_l2, "w2": w_l2, "h": H}
for name, col, acc in [("isani-park-residence-lockup-dark-bg", IVORY, CHAMPAGNE), ("isani-park-residence-lockup-light-bg", INK, "#8A6D3F")]:
    small_scale = 0.26
    by_y = H + 60
    d_by, w_by = word("BY MONO CAPITALS")
    small = f'<g transform="translate({(w_ipr - w_by*small_scale)/2:g} {by_y}) scale({small_scale})">{stroke(d_by, acc, 9)}</g>'
    line = f'<path d="M{w_ipr/2-60:g} {H+30}H{w_ipr/2+60:g}" stroke="{acc}" stroke-width="1.5"/>'
    body = stroke(d_ipr, col, 4) + line + small
    open(os.path.join(OUT, name + ".svg"), "w").write(svg(w_ipr, by_y + H*small_scale, body, "Isani Park Residence by Mono Capitals", pad=6))

# 4. Pattern tile: MONO CAPITALS set large, two rows offset by half a word
tile_w = w_mc + 120
rows = []
for r, dx in enumerate([0, -tile_w/2]):
    for k in range(-1, 3):
        rows.append(translate(d_mc, dx + k*tile_w, r*(H+80)))
pattern_d = " ".join(rows)
data["pattern"] = {"w": tile_w, "h": 2*(H+80)}
open(os.path.join(OUT, "pattern-mono-capitals.svg"), "w").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {tile_w:g} {2*(H+80)}" width="{tile_w:g}" height="{2*(H+80)}">'
    f'<path d="{pattern_d}" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>\n')

json.dump(data, open(os.path.join(ROOT, "src", "data", "logo.json"), "w"), indent=1)
print("ok", w_mc, w_ipr)
