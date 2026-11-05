"""Genera lo SVG neon animabile del logo a partire da assets/zonacalda-logo-linee.svg.

I tracciati vengono copiati identici; vengono solo raggruppati per lettera
(Z, diavolo, N, A, C, A, L, D, A, ventagli, CLUB USE) e sovrapposti negli
strati della luce neon (4 aloni, tubo, nucleo, bagliore del nucleo).
Uso: python3 tools/build-logo.py   (aggiorna il logo dentro index.html)
"""
import re, sys, pathlib

src = pathlib.Path(__file__).resolve().parent.parent / "assets" / "zonacalda-logo-linee.svg"
txt = src.read_text()

def paths(group_id):
    body = re.search(r'<g id="%s"[^>]*>(.*?)</g>' % group_id, txt, re.S).group(1)
    return re.findall(r'd="([^"]+)"', body)

s, v, u = paths("scritta"), paths("ventagli"), paths("sottotitolo")
assert (len(s), len(v), len(u)) == (29, 16, 13)

# ordine dei tracciati nel file: Z N A C A L D A, poi il diavolo (la O)
groups = [
    ("o", s[20:29], "s"), ("z", s[0:3], "s"), ("n", s[3:6], "s"),
    ("a1", s[6:9], "s"), ("c", s[9:10], "s"), ("a2", s[10:13], "s"),
    ("l", s[13:15], "s"), ("d", s[15:17], "s"), ("a3", s[17:20], "s"),
    ("vl", v[0:8], "v"), ("vr", v[8:16], "v"), ("u", u, "u"),
]
assert sum(len(g[1]) for g in groups) == 58
assert s[20].startswith("M220 197")  # primo tracciato del diavolo

def defs_group(gid, ds, kind):
    p = "".join('<path d="%s"%s/>' % (d, ' pathLength="1"' if gid == "o" else "") for d in ds)
    if kind != "s":
        p = '<g transform="scale(.25)">%s</g>' % p
    return '<g id="zc-%s">%s</g>' % (gid, p)

layers = [  # classe, colore, filtro, opacità, spessore relativo
    ("h0", "#ff0f19", "zb0", ".5", "tube"),
    ("h1", "#ff141e", "zb1", ".6", "tube"),
    ("h2", "#ff1923", "zb2", ".75", "tube"),
    ("h3", "#ff2d37", "zb3", ".8", "tube"),
    ("tb", "#ff2634", None, None, "tube"),
    ("cr", "#ffc8cd", None, None, "core"),
    ("cg", "#ff96a0", "zb4", ".8", "core"),
]
VB = (-75, -74, 1344, 544)
blur = {"zb0": 45, "zb1": 20, "zb2": 8, "zb3": 3, "zb4": 1.2}

out = []
out.append('<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="%d %d %d %d" '
           'fill="none" stroke-linecap="round" stroke-linejoin="round" role="img" aria-labelledby="logo-t">' % VB)
out.append('<title id="logo-t">ZONACALDA, club use. Insegna neon rossa: la O è un diavoletto con le corna.</title>')
out.append("<defs>")
for f, sd in blur.items():
    out.append('<filter id="%s" filterUnits="userSpaceOnUse" x="%d" y="%d" width="%d" height="%d">'
               '<feGaussianBlur stdDeviation="%s"/></filter>' % ((f,) + VB + (sd,)))
for gid, ds, kind in groups:
    out.append(defs_group(gid, ds, kind))
out.append("</defs>")
for cls, col, flt, op, w in layers:
    attrs = 'class="ly %s %s" stroke="%s"' % (cls, w, col)
    if flt:
        attrs += ' filter="url(#%s)" opacity="%s"' % (flt, op)
    out.append("<g %s>" % attrs)
    for gid, ds, kind in groups:
        out.append('<use href="#zc-%s" class="g g-%s k-%s"/>' % (gid, gid, kind))
    out.append("</g>")
out.append("</svg>")
svg = "\n".join(out)
html = src.parent.parent / "index.html"
page = html.read_text()
a, b = "<!-- LOGO -->", "<!-- /LOGO -->"
i, j = page.index(a) + len(a), page.index(b)
html.write_text(page[:i] + "\n" + svg + "\n" + page[j:])
print("logo aggiornato in", html.name)
