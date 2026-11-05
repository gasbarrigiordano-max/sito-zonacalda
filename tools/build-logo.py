"""Genera gli SVG neon animabili (logo e codice 00053) dentro index.html.

I tracciati vengono copiati identici dai file in assets/; vengono solo raggruppati
(per lettera / per cifra) e sovrapposti negli strati della luce neon:
4 aloni sfocati, tubo di vetro, nucleo caldo e bagliore del nucleo.

Uso: python3 tools/build-logo.py
"""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

LAYERS = [  # classe, colore, sfocatura, opacità, spessore (tubo ×1.15 / nucleo ×.42)
    ("h0", "#ff0f19", 45, ".5", "tube"),
    ("h1", "#ff141e", 20, ".6", "tube"),
    ("h2", "#ff1923", 8, ".75", "tube"),
    ("h3", "#ff2d37", 3, ".8", "tube"),
    ("tb", "#ff2634", None, None, "tube"),
    ("cr", "#ffc8cd", None, None, "core"),
    ("cg", "#ff96a0", 1.2, ".8", "core"),
]


def paths(txt, group_id):
    body = re.search(r'<g id="%s"[^>]*>(.*?)</g>' % group_id, txt, re.S).group(1)
    return re.findall(r'd="([^"]+)"', body)


def neon_svg(prefix, vb, groups, cls, title, title_id, draw=(), view=None, standalone=False):
    """groups: lista di (id, tracciati, tipo). tipo s = scala 1, v/u = scala .25.
    vb = area degli aloni (filtri); view = parte mostrata (di default tutta)."""
    view = view or vb
    out = ['<svg class="%s" xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" '
           'fill="none" stroke-linecap="round" stroke-linejoin="round" role="img" aria-labelledby="%s">'
           % ((cls,) + view + (title_id,)),
           '<title id="%s">%s</title>' % (title_id, title), "<defs>"]
    if standalone:
        # spessori dei tubi (nel sito li dà style.css; qui servono dentro il file)
        out.append("<style>.tube .k-s{stroke-width:8.85}.tube .k-v{stroke-width:20.24}.tube .k-u{stroke-width:13.23}"
                   ".core .k-s{stroke-width:3.23}.core .k-v{stroke-width:7.39}.core .k-u{stroke-width:4.87}</style>")
    for name, color, sd, op, w in LAYERS:
        if sd:
            out.append('<filter id="%s-%s" filterUnits="userSpaceOnUse" x="%s" y="%s" width="%s" height="%s">'
                       '<feGaussianBlur stdDeviation="%s"/></filter>' % ((prefix, name) + vb + (sd,)))
    for gid, ds, kind in groups:
        extra = ' pathLength="1"' if gid in draw else ""
        p = "".join('<path d="%s"%s/>' % (d, extra) for d in ds)
        if kind != "s":
            p = '<g transform="scale(.25)">%s</g>' % p
        out.append('<g id="%s-%s">%s</g>' % (prefix, gid, p))
    out.append("</defs>")
    for name, color, sd, op, w in LAYERS:
        attrs = 'class="ly %s %s" stroke="%s"' % (name, w, color)
        if sd:
            attrs += ' filter="url(#%s-%s)" opacity="%s"' % (prefix, name, op)
        out.append("<g %s>" % attrs)
        for gid, ds, kind in groups:
            out.append('<use href="#%s-%s" class="g g-%s k-%s"/>' % (prefix, gid, gid, kind))
        out.append("</g>")
    out.append("</svg>")
    return "\n".join(out)


def inject(page, marker, svg):
    a, b = "<!-- %s -->" % marker, "<!-- /%s -->" % marker
    i, j = page.index(a) + len(a), page.index(b)
    return page[:i] + "\n" + svg + "\n" + page[j:]


# ---------- logo ----------
logo = (ASSETS / "zonacalda-logo-linee.svg").read_text()
s, v, u = paths(logo, "scritta"), paths(logo, "ventagli"), paths(logo, "sottotitolo")
assert (len(s), len(v), len(u)) == (29, 16, 13)
assert s[20].startswith("M220 197")  # primo tracciato del diavolo
# ordine dei tracciati nel file: Z N A C A L D A, poi il diavolo (la O)
logo_groups = [
    ("o", s[20:29], "s"), ("z", s[0:3], "s"), ("n", s[3:6], "s"),
    ("a1", s[6:9], "s"), ("c", s[9:10], "s"), ("a2", s[10:13], "s"),
    ("l", s[13:15], "s"), ("d", s[15:17], "s"), ("a3", s[17:20], "s"),
    ("vl", v[0:8], "v"), ("vr", v[8:16], "v"), ("u", u, "u"),
]
logo_svg = neon_svg("zc", (-75, -74, 1344, 544), logo_groups, "logo",
                    "ZONACALDA, club use. Insegna neon rossa: la O è un diavoletto con le corna.",
                    "logo-t", draw=("o",),
                    # vista più stretta: sul telefono il logo riempie lo schermo senza sbordare
                    view=(-25, -74, 1244, 544))

# ---------- codice 00053 ----------
cod = paths((ASSETS / "zonacalda-00053-linee.svg").read_text(), "codice")
assert len(cod) == 8
cod_groups = [("k1", cod[0:1], "s"), ("k2", cod[1:2], "s"), ("k3", cod[2:3], "s"),
              ("k4", cod[3:6], "s"), ("k5", cod[6:8], "s")]
# inclinazione: stessa rotazione del file sorgente, applicata da CSS (.codice)
cod_svg = neon_svg("zk", (-60, -70, 550, 250), cod_groups, "codice", "00053", "codice-t")

# versione statica per l'intestazione delle altre pagine
statico = neon_svg("zs", (-75, -74, 1344, 544), logo_groups, "logo", "ZONACALDA, club use", "logo-s",
                   view=(-25, -74, 1244, 544), standalone=True)
(ASSETS / "zonacalda-logo-sito.svg").write_text(statico.replace(' role="img" aria-labelledby="logo-s"', '') + "\n")

html = ROOT / "index.html"
page = inject(inject(html.read_text(), "LOGO", logo_svg), "CODICE", cod_svg)
html.write_text(page)
print("logo e codice aggiornati in", html.name)
