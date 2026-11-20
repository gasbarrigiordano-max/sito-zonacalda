"""Lanyard ANDA 20 mm: area stampabile 425 x 20 mm, abbondanza 2 mm. Unita' = mm."""
import re, pathlib, sys
A = pathlib.Path('/home/user/sito-zonacalda/assets')
L = float(sys.argv[1]) if len(sys.argv) > 1 else 425.0   # lunghezza area stampabile
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
CU_W = 40.0; CU_H = CU_W*cu_vb[3]/cu_vb[2]
DV_H = 14.0; DV_W = DV_H*dv_vb[2]/dv_vb[3]
cy = B + H/2
parti = []
x = B + DIAV_DAL_GANCIO
# lo spessore s e' in unita' locali: serve a scalare il bagliore
parti.append(istanza('dv', x, cy-DV_H/2, DV_W, DV_H, dv_vb, dv_g, 5.0))
x += DV_W + DIAV_DAL_GANCIO
fine = B + L - FINE
seq = ['cu','zc','cu','zc','cu','zc']
larg = {'cu': CU_W, 'zc': ZC_W}
tot = sum(larg[t] for t in seq)
gap = (fine - x - tot)/(len(seq)-1) if len(seq) > 1 else GAP
n = 0
for t in seq:
    n += 1
    if t == 'zc':
        parti.append(istanza('z%d' % n, x, cy-ZC_H/2, ZC_W, ZC_H, zc_vb, zc_g, SW_Z))
    else:
        parti.append(istanza('u%d' % n, x, cy-CU_H/2, CU_W, CU_H, cu_vb, cu_g, 13.23*1.2/4))
    x += larg[t] + gap
W = L + 2*B; Ht = H + 2*B
defsx = ''.join(righe[k] for k in lettere+ventagli+['zs-u'])
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%gmm" height="%gmm" viewBox="0 0 %g %g"><defs>%s</defs>'
       '<rect width="%g" height="%g" fill="#070405"/>%s</svg>') % (W, Ht, W, Ht, defsx, W, Ht, ''.join(parti))
pathlib.Path('lanyard.svg').write_text(svg)
print('gap tra scritte: %.1f mm; DV %.1f x %.1f, ZC %.1f x %.1f, CU %.1f x %.1f' % (gap, DV_W, DV_H, ZC_W, ZC_H, CU_W, CU_H))
