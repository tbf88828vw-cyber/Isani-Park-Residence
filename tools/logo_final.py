#!/usr/bin/env python3
"""Final Mono Capitals mark (approved variant R2 «Антиква»): a calligraphic C that
tapers to hairlines around a serif M, plus the serif wordmark MONO CAPITALS.
Writes the production SVGs into public/assets/logo/ and path data into src/data/logo.json."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from logo_concepts2 import crescent, glyph, text_path, svg, LORA, IVORY, INK, CH, CH_D, BG, ROOT

LOGO = os.path.join(ROOT, "public", "assets", "logo")
c_d = crescent(80, 80, 72, 64, 5, 36, 324)
m_d, m_w = glyph(LORA, "M", 92, 500)
m_tx = round(80 - m_w / 2 + 2, 2)
word_d, word_w = text_path(LORA, "MONO CAPITALS", 30, 0.24, 0, 30, {"wght": 400})
by_d, by_w = text_path(LORA, "by", 30, 0.02, 0, 30, {"wght": 400})
word_h = 40


def mark(col, acc):
    return f'<path d="{c_d}" fill="{acc}"/><g transform="translate({m_tx} 114)"><path d="{m_d}" fill="{col}"/></g>'


for theme, col, acc in [("dark", IVORY, CH), ("light", INK, CH_D)]:
    mk = mark(col, acc)
    open(os.path.join(LOGO, f"mono-capitals-monogram-{theme}-bg.svg"), "w").write(svg(160, 160, mk, "Mono Capitals"))
    s = 0.62
    hb = f'<g transform="scale({s})">{mk}</g><g transform="translate({160*s + 24:.1f} {80*s - 18:.1f})"><path d="{word_d}" fill="{col}"/></g>'
    open(os.path.join(LOGO, f"mono-capitals-wordmark-{theme}-bg.svg"), "w").write(svg(160*s + 24 + word_w, 160*s, hb, "Mono Capitals"))
    sx = max(word_w, 160)
    sb = f'<g transform="translate({(sx-160)/2:.1f} 0)">{mk}</g><g transform="translate({(sx-word_w)/2:.1f} 186)"><path d="{word_d}" fill="{col}"/></g>'
    open(os.path.join(LOGO, f"mono-capitals-lockup-stacked-{theme}-bg.svg"), "w").write(svg(sx, 226, sb, "Mono Capitals"))

fav = f'<rect width="160" height="160" rx="30" fill="{BG}"/><g transform="translate(8 8) scale(0.9)">{mark(IVORY, CH)}</g>'
open(os.path.join(LOGO, "favicon.svg"), "w").write(svg(160, 160, fav, "Isani Park Residence"))

# Isani Park Residence lock-up: the arcade wordmark (unchanged) + "by MONO CAPITALS" in the new serif
lj = os.path.join(ROOT, "src", "data", "logo.json")
data = json.load(open(lj))
ipr = data["isaniPark"]
for theme, col, acc in [("dark", IVORY, CH), ("light", INK, CH_D)]:
    sc = 0.5
    by_line_w = (by_w + 14 + word_w) * sc
    x0 = (ipr["w"] - by_line_w) / 2
    body = (f'<path d="{ipr["d"]}" fill="none" stroke="{col}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="M{ipr["w"]/2-60:g} 150H{ipr["w"]/2+60:g}" stroke="{acc}" stroke-width="1.5"/>'
            f'<g transform="translate({x0:.1f} 172) scale({sc})"><path d="{by_d}" fill="{acc}" transform="skewX(-8)"/>'
            f'<g transform="translate({by_w + 14:.1f} 0)"><path d="{word_d}" fill="{acc}"/></g></g>')
    open(os.path.join(LOGO, f"isani-park-residence-lockup-{theme}-bg.svg"), "w").write(
        svg(ipr["w"] + 12, 196, f'<g transform="translate(6 6)">{body}</g>', "Isani Park Residence by Mono Capitals"))

data["mc"] = {"c": c_d, "m": m_d, "mtx": m_tx, "word": word_d, "wordW": round(word_w, 2), "wordH": word_h, "by": by_d, "byW": round(by_w, 2)}
for k in ("ring", "mcWord", "byWord"):
    data.pop(k, None)
json.dump(data, open(lj, "w"), indent=1)
print("final logo written")
