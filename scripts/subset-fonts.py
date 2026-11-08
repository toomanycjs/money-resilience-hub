"""Subset the two typefaces (Newsreader for display, Public Sans for text) (Newsreader for display, Public Sans for text) to the characters the site uses and write woff2 files.

Run with: pnpm fonts:subset
Reads the TTFs in design/fonts and writes public/fonts/*.woff2. Needs fontTools and brotli
(pip install fonttools brotli). The subset keeps Latin-1, the pound sign, the minus sign,
the en dash, curly quotes and the OpenType features the CSS relies on (tnum, lnum, kern).
"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# The display face is used at one weight and one optical size, so the variable
# font is instanced to a static one first: a fraction of the size, same glyphs.
STATIC = "design/fonts/newsreader-static-600.ttf"
var = TTFont("design/fonts/newsreader.ttf")
instancer.instantiateVariableFont(var, {"wght": 600, "opsz": 72}, inplace=True)
var.save(STATIC)

UNICODES = "U+0000-00FF,U+2013,U+2014,U+2018-201A,U+201C-201E,U+2026,U+2212,U+20AC"
FEATURES = ["kern", "liga", "tnum", "lnum", "pnum", "onum", "ss01", "calt", "case", "frac", "numr", "dnom"]

JOBS = [
    (STATIC, "public/fonts/newsreader-600.woff2", None),
    ("design/fonts/publicsans-regular.ttf", "public/fonts/public-sans-400.woff2", None),
    ("design/fonts/publicsans-semibold.ttf", "public/fonts/public-sans-600.woff2", None),
]

for src, out, _ in JOBS:
    args = [src, f"--output-file={out}", "--flavor=woff2", f"--unicodes={UNICODES}",
            "--layout-features=" + ",".join(FEATURES), "--no-hinting", "--desubroutinize"]
    subset.main(args)
    font = TTFont(out)
    axes = [a.axisTag for a in font["fvar"].axes] if "fvar" in font else []
    print(f"{out}: {len(font.getGlyphOrder())} glyphs, axes {axes}")
