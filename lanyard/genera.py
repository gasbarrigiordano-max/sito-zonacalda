"""Lanyard ANDA 20 mm: area stampabile 425 x 20 mm, abbondanza 2 mm. Unita' = mm."""
import re, pathlib, sys
A = pathlib.Path('/home/user/sito-zonacalda/assets')
MODO = sys.argv[1] if len(sys.argv) > 1 else 'misto'
L = 425.0
VETT = len(sys.argv) > 2 and sys.argv[2] == 'vett'   # lunghezza area stampabile
H = 20.0; B = 2.0                                          # larghezza e abbondanza
DIAV_DAL_GANCIO = 10.0; GAP = 25.0; FINE = 10.0
logo = (A/'zonacalda-logo-sito.svg').read_text()
defs = {m.group(1): m.group(0) for m in re.finditer(r'<g id="(zs-[a-z0-9]+)">.*?</g>(?=\n<(?:g id|/defs))', logo, re.S)}
for k, v in defs.items():   # le <g id> di vl/vr/u hanno un <g> annidato: ripesca per riga
    pass
righe = {re.match(r'<g id="(zs-[a-z0-9]+)"', l).group(1): l for l in logo.split('\n') if re.match(r'<g id="zs-[a-z0-9]+"', l)}
lettere = ['zs-o','zs-z','zs-n','zs-a1','zs-c','zs-a2','zs-l','zs-d','zs-a3']
ventagli = ['zs-vl','zs-vr']
diav = re.findall(r'<path d="[^"]+"/>', (A/'zonacalda-diavolo-linee.svg').read_text())

def neon(idp, gruppi, s):
    """gruppi: [(markup, stroke_width_in_unita)] ; s: spessore di riferimento (unita' locali)."""
    out = ''
    if VETT:
        # bagliore vettoriale: strati di tratto sempre piu' larghi e trasparenti (niente filtri)
        N = 14
        for k in range(N, 0, -1):
            f = 1 + 3.0*k/N          # larghezza del tratto in multipli di s
            op = 0.05 + 0.07*(1-k/N)
            out += '<g stroke="#ff1420" opacity="%.3f" stroke-linejoin="round">%s</g>' % (op, ''.join('<g stroke-width="%g">%s</g>' % (w*f, m) for m, w in gruppi))
        out += '<g stroke="#ff2634">%s</g>' % ''.join('<g stroke-width="%g">%s</g>' % (w, m) for m, w in gruppi)
        out += '<g stroke="#ffc8cd">%s</g>' % ''.join('<g stroke-width="%g">%s</g>' % (w*.365, m) for m, w in gruppi)
        return out
    for n, (bl, op, col) in enumerate([(4, .5, '#ff0f19'), (1.8, .6, '#ff141e'), (.74, .75, '#ff1923'), (.3, .8, '#ff2d37')]):
        out += '<g stroke="%s" filter="url(#%s%d)" opacity="%s">%s</g>' % (col, idp, n, op, ''.join('<g stroke-width="%g">%s</g>' % (w, m) for m, w in gruppi))
    out += '<g stroke="#ff2634">%s</g>' % ''.join('<g stroke-width="%g">%s</g>' % (w, m) for m, w in gruppi)
    out += '<g stroke="#ffc8cd">%s</g>' % ''.join('<g stroke-width="%g">%s</g>' % (w*.365, m) for m, w in gruppi)
    return out

def istanza(idp, x, y, w, h, vb, gruppi, s):
    vx, vy, vw, vh = vb; mar = 6*s
    filtri = ''.join('<filter id="%s%d" filterUnits="userSpaceOnUse" x="%g" y="%g" width="%g" height="%g"><feGaussianBlur stdDeviation="%g"/></filter>' %
                     (idp, n, vx-mar, vy-mar, vw+2*mar, vh+2*mar, b*s) for n, b in enumerate([4, 1.8, .74, .3]))
    return ('<svg x="%g" y="%g" width="%g" height="%g" viewBox="%g %g %g %g" overflow="visible" fill="none" stroke-linecap="round" stroke-linejoin="round">'
            '<defs>%s</defs>%s</svg>') % (x, y, w, h, vx, vy, vw, vh, filtri, neon(idp, gruppi, s))

def usa(ids): return ''.join('<use href="#%s"/>' % i for i in ids)
SW_Z = 12.0   # spessore lettere ZONA CALDA (unita' del logo) -> ~0,58 mm
# ZONA CALDA: lettere + ventagli (senza CLUB USE)
zc_vb = (59, 55, 1076, 246)
zc_g = [(usa(lettere), SW_Z), (usa(ventagli), 20.24*1.0)]
# CLUB USE
cu_vb = (525, 312, 150, 27)
cu_g = [(usa(['zs-u']), 13.23*1.2)]
dv_vb = (172, 154, 124, 150)
dv_g = [(''.join(diav), 5.0)]

ZC_H = 12.0; ZC_W = ZC_H*zc_vb[2]/zc_vb[3]
DV_H = 14.0; DV_W = DV_H*dv_vb[2]/dv_vb[3]
cy = B + H/2
parti = []
x = B + DIAV_DAL_GANCIO
fine = B + L - FINE

def diavolo(n, x):
    # ruotato di 90 gradi in senso orario: a lanyard indossato (gancio in basso) sta dritto
    ww, hh = DV_H, DV_W            # ingombro dopo la rotazione
    inner = istanza('dv%d' % n, 0, 0, DV_W, DV_H, dv_vb, dv_g, 5.0)
    return '<g transform="translate(%g %g) rotate(90) translate(%g %g)">%s</g>' % (x+ww/2, cy, -DV_W/2, -DV_H/2, inner), ww

def testo(t, n, x, w):
    if t == 'zc':
        h = w*zc_vb[3]/zc_vb[2]
        return istanza('z%d' % n, x, cy-h/2, w, h, zc_vb, zc_g, SW_Z)
    h = w*cu_vb[3]/cu_vb[2]
    return istanza('u%d' % n, x, cy-h/2, w, h, cu_vb, cu_g, 13.23*1.2/4)

if MODO == 'misto':
    CU_W = 40.0
    p, dw = diavolo(0, x); parti.append(p); x += dw + DIAV_DAL_GANCIO
    seq = ['cu','zc','cu','zc','cu','zc']; larg = {'cu': CU_W, 'zc': ZC_W}
    gap = (fine - x - sum(larg[t] for t in seq))/(len(seq)-1)
    for n, t in enumerate(seq):
        parti.append(testo(t, n, x, larg[t])); x += larg[t] + gap
else:
    # solo CLUB USE (o solo ZONA CALDA), diavoletto tra una scritta e l'altra, ~3 cm di spazio
    tw = {'cu': 55.0, 'zc': ZC_W}[MODO]
    seq = ['d','t','d','t','d','t','d']
    gap = (fine - x - 4*DV_H - 3*tw)/6
    for n, e in enumerate(seq):
        if e == 'd':
            p, dw = diavolo(n, x); parti.append(p); x += dw + gap
        else:
            parti.append(testo(MODO, n, x, tw)); x += tw + gap
print(MODO, 'spazio %.1f mm' % gap)
W = L + 2*B; Ht = H + 2*B
defsx = ''.join(righe[k] for k in lettere+ventagli+['zs-u'])
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%gmm" height="%gmm" viewBox="0 0 %g %g"><defs>%s</defs>'
       '<rect width="%g" height="%g" fill="#070405"/>%s</svg>') % (W, Ht, W, Ht, defsx, W, Ht, ''.join(parti))
pathlib.Path('lanyard-%s%s.svg' % (MODO, '-vett' if VETT else '')).write_text(svg)
