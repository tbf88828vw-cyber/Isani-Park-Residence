#!/usr/bin/env python3
"""Alternative Mono Capitals logo concepts (round 2). Text is converted to outlines,
so the SVGs need no fonts. Output: docs/logo-concepts/*.svg"""
import math, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "logo-concepts")
os.makedirs(OUT, exist_ok=True)
FONTS = "/usr/share/fonts/truetype/google-fonts/"
IVORY, INK, CH, CH_D, BG = "#EFE6D8", "#1B1814", "#D6BD92", "#8A6D3F", "#0E0C0A"


def text_path(font_file, text, size, tracking=0.0, x=0, y=0, variation=None):
    f = TTFont(font_file)
    if variation:
        from fontTools.varLib.instancer import instantiateVariableFont
        f = instantiateVariableFont(f, variation)
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
    upm = f["head"].unitsPerEm
    s = size / upm
    pen = SVGPathPen(gs)
    cx = 0
    for ch in text:
        if ch == " ":
            cx += hmtx[cmap[32]][0] * s + tracking * size
            continue
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (s, 0, 0, -s, x + cx, y))
        gs[g].draw(tp)
        cx += hmtx[g][0] * s + tracking * size
    return pen.getCommands(), cx - tracking * size


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')


def spiral(cx, cy, r0, turns, direction=1):
    pts = []
    n = 90
    for i in range(n + 1):
        t = i / n
        a = direction * (t * turns * 2 * math.pi) + (math.pi if direction > 0 else 0)
        r = r0 * (1 - t * 0.82)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts)


# ---------- A. «Капитель»: one column with an Ionic capital (Mono + Capital) ----------
def mark_capital(col, acc, sw=3.2):
    # abacus, two volutes, echinus, a single shaft with flutes
    d_abacus = "M10 20H110"
    d_echinus = "M26 34Q60 52 94 34"
    v_l = spiral(26, 36, 15, 1.6, direction=1)
    v_r = spiral(94, 36, 15, 1.6, direction=-1)
    shaft = "M40 56V160M80 56V160M53 64V154M67 64V154"
    base = "M30 166H90"
    st = f'fill="none" stroke-linecap="round" stroke-linejoin="round"'
    return (f'<path d="{d_abacus} {base}" {st} stroke="{col}" stroke-width="{sw}"/>'
            f'<path d="{shaft}" {st} stroke="{col}" stroke-width="{sw*0.8:g}"/>'
            f'<path d="{v_l} {v_r} {d_echinus}" {st} stroke="{acc}" stroke-width="{sw}"/>'), 120, 176


# ---------- B. «Арка-C»: the circle opens into a C, one line draws the M ----------
def mark_ring(col, acc, sw=3.2):
    r = 70
    a0, a1 = math.radians(38), math.radians(322)
    x0, y0 = 80 + r * math.cos(a0), 80 - r * math.sin(a0)
    x1, y1 = 80 + r * math.cos(a1), 80 - r * math.sin(a1)
    c = f"M{x0:.2f} {y0:.2f}A{r} {r} 0 1 0 {x1:.2f} {y1:.2f}"
    m = "M46 112V48L80 92L114 48V112"
    st = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'
    return f'<path d="{c}" {st} stroke="{acc}" stroke-width="{sw}"/><path d="{m}" {st} stroke="{col}" stroke-width="{sw}"/>', 160, 160


# ---------- C. «Монолит»: solid tile, letters cut out ----------
def mark_block(tile, ink):
    d_m, w_m = text_path(FONTS + "Poppins-Bold.ttf", "MC", 72, -0.02)
    ox = (140 - w_m) / 2
    body = f'<rect x="0" y="0" width="140" height="140" rx="10" fill="{tile}"/>'
    body += f'<g transform="translate({ox:.2f} 96)"><path d="{d_m}" fill="{ink}"/></g>'
    return body, 140, 140


POP_L = FONTS + "Poppins-Light.ttf"
POP_B = FONTS + "Poppins-Bold.ttf"
LORA = FONTS + "Lora-Variable.ttf"


def lockup(mark, mw, mh, word_body, ww, wh, gap=36, scale=1.0, title="Mono Capitals"):
    """horizontal lock-up: mark on the left, words on the right, vertically centred"""
    s = wh / mh * scale
    W = mw * s + gap + ww
    H = max(wh, mh * s)
    body = f'<g transform="scale({s:.4f})">{mark}</g><g transform="translate({mw*s+gap:.2f} {(H-wh)/2:.2f})">{word_body}</g>'
    return W, H, body


variants = {}
for theme, col, acc, bg in [("dark", IVORY, CH, BG), ("light", INK, CH_D, "#FAF8F4")]:
    # A
    m, mw, mh = mark_capital(col, acc)
    d1, w1 = text_path(POP_L, "MONO", 40, 0.34, 0, 40)
    d2, w2 = text_path(POP_L, "CAPITALS", 17.3, 0.5, 0, 74)
    wb = f'<path d="{d1}" fill="{col}"/><path d="{d2}" fill="{acc}"/>'
    W, H, body = lockup(m, mw, mh, wb, max(w1, w2), 80, gap=30, scale=1.35)
    variants[f"A-capital-{theme}"] = (W, H, body, bg)
    open(os.path.join(OUT, f"A-capital-mark-{theme}-bg.svg"), "w").write(svg(mw, mh, m, "Mono Capitals"))
    open(os.path.join(OUT, f"A-capital-lockup-{theme}-bg.svg"), "w").write(svg(W, H, body, "Mono Capitals"))
    # B
    m, mw, mh = mark_ring(col, acc)
    d1, w1 = text_path(LORA, "MONO CAPITALS", 34, 0.22, 0, 44, {"wght": 400})
    wb = f'<path d="{d1}" fill="{col}"/>'
    W, H, body = lockup(m, mw, mh, wb, w1, 56, gap=28, scale=1.55)
    variants[f"B-ring-{theme}"] = (W, H, body, bg)
    open(os.path.join(OUT, f"B-ring-mark-{theme}-bg.svg"), "w").write(svg(mw, mh, m, "Mono Capitals"))
    open(os.path.join(OUT, f"B-ring-lockup-{theme}-bg.svg"), "w").write(svg(W, H, body, "Mono Capitals"))
    # C
    m, mw, mh = mark_block(acc if theme == "dark" else INK, BG if theme == "dark" else "#FAF8F4")
    d1, w1 = text_path(POP_B, "MONO", 44, 0.06, 0, 46)
    d2, w2 = text_path(POP_L, "CAPITALS", 44, 0.06, w1 + 12, 46)
    wb = f'<path d="{d1}" fill="{col}"/><path d="{d2}" fill="{col}"/>'
    W, H, body = lockup(m, mw, mh, wb, w1 + 12 + w2, 58, gap=26, scale=1.25)
    variants[f"C-block-{theme}"] = (W, H, body, bg)
    open(os.path.join(OUT, f"C-block-mark-{theme}-bg.svg"), "w").write(svg(mw, mh, m, "Mono Capitals"))
    open(os.path.join(OUT, f"C-block-lockup-{theme}-bg.svg"), "w").write(svg(W, H, body, "Mono Capitals"))

# presentation board
rows = []
y = 60
names = {"A": "A · Капитель", "B": "B · Кольцо", "C": "C · Монолит"}
board = ""
for k in ["A", "B", "C"]:
    key = [n for n in variants if n.startswith(k) and n.endswith("dark")][0]
    keyl = key.replace("dark", "light")
    for i, kk in enumerate([key, keyl]):
        W, H, body, bg = variants[kk]
        x0 = i * 700
        sc = min(560 / W, 120 / H)
        board += f'<rect x="{x0}" y="{y-40}" width="700" height="220" fill="{bg}"/>'
        board += f'<g transform="translate({x0 + (700 - W*sc)/2:.1f} {y + (140 - H*sc)/2 - 10:.1f}) scale({sc:.4f})">{body}</g>'
    board += f'<text x="24" y="{y-14}" font-family="Poppins" font-size="15" fill="{CH}">{names[k]}</text>'
    y += 220
open("/tmp/concepts-board.svg", "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 20 1400 {y-40}" width="1400">{board}</svg>')
print("ok")

# ---------- chosen direction B: export final files + data for the build ----------
import json
r = 70
a0, a1 = math.radians(38), math.radians(322)
ring_c = f"M{80 + r*math.cos(a0):.2f} {80 - r*math.sin(a0):.2f}A{r} {r} 0 1 0 {80 + r*math.cos(a1):.2f} {80 - r*math.sin(a1):.2f}"
ring_m = "M46 112V48L80 92L114 48V112"
word_d, word_w = text_path(LORA, "MONO CAPITALS", 34, 0.22, 0, 34, {"wght": 400})
by_d, by_w = text_path(LORA, "by", 30, 0.02, 0, 34, {"wght": 400})
LOGO = os.path.join(ROOT, "public", "assets", "logo")
st = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'
for theme, col, acc in [("dark", IVORY, CH), ("light", INK, CH_D)]:
    mark = f'<path d="{ring_c}" {st} stroke="{acc}" stroke-width="4"/><path d="{ring_m}" {st} stroke="{col}" stroke-width="4"/>'
    open(os.path.join(LOGO, f"mono-capitals-monogram-{theme}-bg.svg"), "w").write(svg(160, 160, mark, "Mono Capitals"))
    W, H, body = lockup(mark, 160, 160, f'<path d="{word_d}" fill="{col}"/>', word_w, 44, gap=26, scale=1.9)
    open(os.path.join(LOGO, f"mono-capitals-wordmark-{theme}-bg.svg"), "w").write(svg(W, H, body, "Mono Capitals"))
fav = (f'<rect width="160" height="160" rx="30" fill="{BG}"/>'
       f'<path d="{ring_c}" {st} stroke="{CH}" stroke-width="11"/><path d="{ring_m}" {st} stroke="{IVORY}" stroke-width="11"/>')
open(os.path.join(LOGO, "favicon.svg"), "w").write(svg(160, 160, fav, "Isani Park Residence"))
lj = os.path.join(ROOT, "src", "data", "logo.json")
data = json.load(open(lj))
data["ring"] = {"c": ring_c, "m": ring_m, "w": 160, "h": 160}
data["mcWord"] = {"d": word_d, "w": round(word_w, 2), "h": 44}
data["byWord"] = {"d": by_d, "w": round(by_w, 2)}
json.dump(data, open(lj, "w"), indent=1)
print("final B exported")
