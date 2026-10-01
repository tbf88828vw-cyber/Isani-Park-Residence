#!/usr/bin/env python3
"""Round 3: refined 'Ring' marks for Mono Capitals + two new directions.
Outputs SVGs into docs/logo-concepts/round3/ and a board PNG source /tmp/board3.svg"""
import math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from logo_concepts import text_path, svg, LORA, POP_L, IVORY, INK, CH, CH_D, BG, ROOT

OUT = os.path.join(ROOT, "docs", "logo-concepts", "round3")
os.makedirs(OUT, exist_ok=True)
ST = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'


def arc(cx, cy, r, deg0, deg1, large=1, sweep=0):
    a0, a1 = math.radians(deg0), math.radians(deg1)
    return (f"M{cx + r*math.cos(a0):.2f} {cy - r*math.sin(a0):.2f}"
            f"A{r} {r} 0 {large} {sweep} {cx + r*math.cos(a1):.2f} {cy - r*math.sin(a1):.2f}")


def crescent(cx, cy, r_out, r_in, off, deg0, deg1):
    """C-shaped band thick on the left and tapering to hairlines at the opening (calligraphic contrast)."""
    pts_o, pts_i = [], []
    n = 120
    for i in range(n + 1):
        t = i / n
        a = math.radians(deg0 + (deg1 - deg0) * t)
        pts_o.append((cx + r_out * math.cos(a), cy - r_out * math.sin(a)))
        # inner circle shifted to the left → band is widest at 180°
        pts_i.append((cx + off + r_in * math.cos(a), cy - r_in * math.sin(a)))
    d = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts_o)
    d += " L" + " L".join(f"{x:.2f} {y:.2f}" for x, y in reversed(pts_i)) + "Z"
    return d


def glyph(font, ch, size, wght=None):
    d, w = text_path(font, ch, size, 0, 0, 0, {"wght": wght} if wght else None)
    return d, w


marks = {}

# R1 · Кольцо, выверенное: M касается кольца средней точкой, толщины уравновешены
def r1(col, acc):
    return (f'<path d="{arc(80, 80, 70, 40, 320)}" {ST} stroke="{acc}" stroke-width="3.4"/>'
            f'<path d="M47 116V46L80 98L113 46V116" {ST} stroke="{col}" stroke-width="3.4"/>')
marks["R1"] = ("Кольцо · выверенное", r1)

# R2 · Каллиграфическое C: контрастная «лунная» C и антиквенная M (Lora)
def r2(col, acc):
    c = crescent(80, 80, 72, 64, 5, 36, 324)
    d, w = glyph(LORA, "M", 92, 500)
    return (f'<path d="{c}" fill="{acc}"/>'
            f'<g transform="translate({80 - w/2 + 2:.2f} 114)"><path d="{d}" fill="{col}"/></g>')
marks["R2"] = ("Кольцо · антиква", r2)

# R3 · Одна линия: M и C нарисованы одним непрерывным штрихом (mono = один)
def r3(col, acc):
    r = 70
    a = math.radians(222)  # start of the ring at lower-left
    sx, sy = 80 + r*math.cos(a), 80 - r*math.sin(a)
    path = (f"M47 116V46L80 98L113 46V116"                      # M
            f"M113 116" )
    ring = arc(80, 80, 70, 42, 318)
    # continuous: M's last leg drops to the ring and follows it round
    cont = f"M47 116V46L80 98L113 46V112Q113 126 101 134A70 70 0 1 1 {80 + r*math.cos(math.radians(40)):.2f} {80 - r*math.sin(math.radians(40)):.2f}"
    return f'<path d="{cont}" {ST} stroke="{col}" stroke-width="3.4"/><circle cx="{80 + r*math.cos(math.radians(40)):.2f}" cy="{80 - r*math.sin(math.radians(40)):.2f}" r="4.2" fill="{acc}"/>'
marks["R3"] = ("Кольцо · одной линией", r3)

# R4 · Аркада: M из двух арок внутри кольца — связь с архитектурой
def r4(col, acc):
    m = "M48 116V64A16 16 0 0 1 80 64V116M80 64A16 16 0 0 1 112 64V116"
    return (f'<path d="{arc(80, 80, 70, 40, 320)}" {ST} stroke="{acc}" stroke-width="3.4"/>'
            f'<path d="{m}" {ST} stroke="{col}" stroke-width="3.4"/>')
marks["R4"] = ("Кольцо · аркада", r4)

# R5 · Двойное кольцо: тонкое внешнее + рабочее внутреннее, как клеймо
def r5(col, acc):
    return (f'<circle cx="80" cy="80" r="76" {ST} stroke="{acc}" stroke-width="1.4"/>'
            f'<path d="{arc(80, 80, 64, 38, 322)}" {ST} stroke="{acc}" stroke-width="3.4"/>'
            f'<path d="M52 108V54L80 94L108 54V108" {ST} stroke="{col}" stroke-width="3.4"/>')
marks["R5"] = ("Кольцо · клеймо", r5)

# N1 · Печать: круговая надпись MONO CAPITALS · TBILISI и M в центре
def n1(col, acc):
    parts = []
    text = "MONO CAPITALS · TBILISI · "
    rr = 60
    step = 360 / len(text)
    for i, ch in enumerate(text):
        if ch == " ":
            continue
        ang = 90 - i * step
        d, w = text_path(POP_L, ch, 12.5, 0, 0, 0)
        x = 80 + rr * math.cos(math.radians(ang))
        y = 80 - rr * math.sin(math.radians(ang))
        rot = 90 - ang
        parts.append(f'<g transform="translate({x:.2f} {y:.2f}) rotate({rot:.2f}) translate({-w/2:.2f} 4.5)"><path d="{d}" fill="{acc}"/></g>')
    md, mw = glyph(LORA, "M", 60, 500)
    return (f'<circle cx="80" cy="80" r="76" {ST} stroke="{acc}" stroke-width="1.4"/>'
            f'<circle cx="80" cy="80" r="44" {ST} stroke="{acc}" stroke-width="1"/>' + "".join(parts) +
            f'<g transform="translate({80 - mw/2:.2f} 101)"><path d="{md}" fill="{col}"/></g>')
marks["N1"] = ("Печать", n1)

# N2 · Ключевой камень: арка, в замке которой — ромб; M и C внутри
def n2(col, acc):
    arch = "M22 140V78A58 58 0 0 1 138 78V140"
    key = "M72 14L80 6L88 14L84 26H76Z"
    md, mw = glyph(LORA, "MC", 50, 450)
    return (f'<path d="{arch}" {ST} stroke="{col}" stroke-width="3"/>'
            f'<path d="{key}" fill="{acc}"/>'
            f'<path d="M14 140H146" {ST} stroke="{acc}" stroke-width="2"/>'
            f'<g transform="translate({80 - mw/2:.2f} 118)"><path d="{md}" fill="{col}"/></g>')
marks["N2"] = ("Арка с замковым камнем", n2)

# wordmarks
w_serif, ww = text_path(LORA, "MONO CAPITALS", 30, 0.24, 0, 30, {"wght": 400})
w_mono, wm = text_path(LORA, "MONO", 40, 0.2, 0, 40, {"wght": 400})
w_cap, wc = text_path(POP_L, "CAPITALS", 12.8, 0.62, 0, 66)


def lockups(key, col, acc):
    mk = marks[key][1](col, acc)
    # horizontal
    s = 0.62
    h_body = f'<g transform="scale({s})">{mk}</g><g transform="translate({160*s + 24:.1f} {80*s - 18:.1f})"><path d="{w_serif}" fill="{col}"/></g>'
    hw, hh = 160*s + 24 + ww, 160*s
    # stacked
    sx = max(ww, 160)
    st_body = (f'<g transform="translate({(sx-160)/2:.1f} 0)">{mk}</g>'
               f'<g transform="translate({(sx-ww)/2:.1f} 186)"><path d="{w_serif}" fill="{col}"/></g>')
    return (mk, (hw, hh, h_body), (sx, 226, st_body))


board = []
cell_w, cell_h = 460, 360
keys = list(marks)
for idx, k in enumerate(keys):
    for theme, col, acc, bg in [("dark", IVORY, CH, BG), ("light", INK, CH_D, "#FAF8F4")]:
        mk, (hw, hh, hb), (sw_, sh_, sb) = lockups(k, col, acc)
        open(os.path.join(OUT, f"{k}-mark-{theme}-bg.svg"), "w").write(svg(160, 160, mk, "Mono Capitals"))
        open(os.path.join(OUT, f"{k}-lockup-horizontal-{theme}-bg.svg"), "w").write(svg(hw, hh, hb, "Mono Capitals"))
        open(os.path.join(OUT, f"{k}-lockup-stacked-{theme}-bg.svg"), "w").write(svg(sw_, sh_, sb, "Mono Capitals"))
    # board cell (dark): stacked lock-up + favicon-size check + light horizontal
    mk, (hw, hh, hb), (sw_, sh_, sb) = lockups(k, IVORY, CH)
    col_i, row_i = idx % 3, idx // 3
    x0, y0 = col_i * cell_w, row_i * cell_h
    sc = min(300 / sw_, 190 / sh_)
    board.append(f'<rect x="{x0}" y="{y0}" width="{cell_w}" height="{cell_h}" fill="{BG}" stroke="#2a251f"/>')
    board.append(f'<g transform="translate({x0 + (cell_w - sw_*sc)/2:.1f} {y0 + 44:.1f}) scale({sc:.4f})">{sb}</g>')
    # tiny sizes
    for j, size in enumerate([32, 16]):
        board.append(f'<g transform="translate({x0 + 24 + j*44:.1f} {y0 + cell_h - 24 - size:.1f}) scale({size/160:.4f})">{mk}</g>')
    # light horizontal
    mkl, (hw2, hh2, hb2), _ = lockups(k, INK, CH_D)
    sc2 = min(260 / hw2, 44 / hh2)
    board.append(f'<rect x="{x0 + 120}" y="{y0 + cell_h - 76}" width="{cell_w - 136}" height="60" rx="6" fill="#FAF8F4"/>')
    board.append(f'<g transform="translate({x0 + 132:.1f} {y0 + cell_h - 46 - hh2*sc2/2:.1f}) scale({sc2:.4f})">{hb2}</g>')
    board.append(f'<text x="{x0 + 16}" y="{y0 + 26}" font-family="Poppins" font-size="15" fill="{CH}">{k} · {marks[k][0]}</text>')

W = 3 * cell_w
H = math.ceil(len(keys) / 3) * cell_h
open("/tmp/board3.svg", "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}">{"".join(board)}</svg>')
print("ok", keys)
