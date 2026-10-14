"""Prospetti: la facciata vista frontalmente.

Si traccia la linea A-B lungo la facciata (vista dall'alto); i punti di una
fascia davanti e dietro alla linea vengono proiettati sul piano verticale.
1. Il piano della facciata è la profondità con più punti.
2. I punti su quel piano formano un'immagine della superficie muraria.
3. I vani (buchi nella superficie) sono finestre, o porte se arrivano a terra;
   i vani rettangolari diventano rettangoli, quelli ad arco seguono la forma.
4. Il contorno esterno della superficie è il profilo del fabbricato.
5. Le parti che sporgono (balconi, cornici, pensiline) vanno nel layer aggetti.
"""

import numpy as np
from scipy import ndimage

from . import elabora
from .geometria import Polilinea, passo_medio, retta_tls


def allinea_facciata(anteprima, a, b, larghezza=1.0):
    """Porta la linea a-b (locale) sulla facciata più densa vicina."""
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    d = b - a
    L = np.hypot(*d)
    if L < 0.5:
        return a, b
    t = d / L
    n = np.array([-t[1], t[0]])
    rel = anteprima[:, :2] - a
    u = rel @ t
    v = rel @ n
    m = (u >= 0) & (u <= L) & (np.abs(v) <= larghezza)
    if np.count_nonzero(m) < 50:
        return a, b
    vv = v[m]
    cont, bordi = np.histogram(vv, bins=np.arange(-larghezza, larghezza + 0.02, 0.02))
    picco = _picco_vicino(cont, bordi, 0.0)
    sel = anteprima[m][np.abs(vv - picco) <= 0.05][:, :2]
    if len(sel) < 20:
        return a, b
    c, dirz = retta_tls(sel)
    # seconda passata più stretta: esclude spallette e serramenti vicini
    for banda in (0.03, 0.015):
        nn = np.array([-dirz[1], dirz[0]])
        stretti = sel[np.abs((sel - c) @ nn) <= banda]
        if len(stretti) < 20:
            break
        c, dirz = retta_tls(stretti)
    if dirz @ t < 0:
        dirz = -dirz
    # proiezione di a e b sulla retta trovata
    a2 = c + ((a - c) @ dirz) * dirz
    b2 = c + ((b - c) @ dirz) * dirz
    return a2, b2


def _picco_vicino(cont, bordi, rif, quota_min=0.3):
    """Centro del picco dell'istogramma più vicino a rif tra quelli alti
    almeno quota_min del massimo (la superficie più vicina alla linea, non
    necessariamente la più densa: es. faccia esterna e non interna)."""
    centri = (bordi[:-1] + bordi[1:]) / 2
    liscio = np.convolve(cont, np.ones(3) / 3, mode="same")
    massimi = np.flatnonzero((liscio >= quota_min * liscio.max())
                             & (liscio >= np.roll(liscio, 1)) & (liscio >= np.roll(liscio, -1)))
    if not len(massimi):
        return centri[np.argmax(cont)]
    return centri[massimi[np.argmin(np.abs(centri[massimi] - rif))]]


def _contorni(maschera, cella, origine):
    """Pixel di bordo di una maschera, come punti (u, z)."""
    bordo = maschera & ~ndimage.binary_erosion(maschera, structure=np.ones((3, 3), bool))
    r, c = np.nonzero(bordo)
    return np.column_stack(((c + 0.5) * cella + origine[0], (r + 0.5) * cella + origine[1]))


def estrai_prospetto(fascia_pts, par, spessore_superficie=0.06):
    """fascia_pts: (u, z, v) dalla Nuvola.fascia. Restituisce (punti2d, polilinee)."""
    if len(fascia_pts) < 100:
        return np.zeros((0, 2)), []
    u, z, v = fascia_pts.T
    cont, bordi = np.histogram(v, bins=np.arange(v.min(), v.max() + 0.02, 0.02))
    v0 = _picco_vicino(cont, bordi, 0.0)
    sup = np.abs(v - v0) <= spessore_superficie
    davanti = v < v0 - spessore_superficie  # aggetti verso chi guarda
    P = np.column_stack((u[sup], z[sup]))
    passo = passo_medio(P)
    cella = float(np.clip(1.8 * passo, 0.015, 0.08))
    mn = P.min(axis=0) - 2 * cella
    dim = np.ceil((P.max(axis=0) - mn) / cella).astype(int) + 3
    img = np.zeros((dim[1], dim[0]), bool)
    k = np.floor((P - mn) / cella).astype(int)
    img[k[:, 1], k[:, 0]] = True
    img = ndimage.binary_closing(img, structure=np.ones((5, 5), bool))
    img[[0, -1], :] = False
    img[:, [0, -1]] = False
    # riempie i fori minuscoli (mancanze di scansione)
    fori, nf = ndimage.label(~img)
    if nf:
        area = np.bincount(fori.ravel())
        piccoli = area * cella * cella < 0.03
        piccoli[fori[0, 0]] = False
        img |= piccoli[fori]
    # solo i pezzi grandi di facciata
    lab, nl = ndimage.label(img, structure=np.ones((3, 3), bool))
    if nl == 0:
        return P, []
    aree = np.bincount(lab.ravel())
    aree[0] = 0
    img = aree[lab] >= 0.05 * aree.max()
    # linea di terra: chiude in basso i vani delle porte
    colonne = np.flatnonzero(img.any(axis=0))
    r_terra = int(np.percentile(np.nonzero(img)[0], 0.5))
    img_chiusa = img.copy()
    img_chiusa[max(0, r_terra - 1) : r_terra + 2, colonne.min() : colonne.max() + 1] = True
    z_terra = mn[1] + (r_terra + 0.5) * cella

    polilinee = []
    # vani
    sfondo, ns = ndimage.label(~img_chiusa)
    bordo_ids = set(np.unique(np.concatenate((sfondo[0], sfondo[-1], sfondo[:, 0], sfondo[:, -1]))))
    pieno = img_chiusa.copy()
    for i in range(1, ns + 1):
        if i in bordo_ids:
            continue
        m = sfondo == i
        area = m.sum() * cella * cella
        rr, cc = np.nonzero(m)
        w = (cc.max() - cc.min() + 1) * cella
        h = (rr.max() - rr.min() + 1) * cella
        pieno |= m
        if area < 0.12 or min(w, h) < 0.25:
            continue
        u0, u1 = mn[0] + cc.min() * cella, mn[0] + (cc.max() + 1) * cella
        z0, z1 = mn[1] + rr.min() * cella, mn[1] + (rr.max() + 1) * cella
        cat = "porte" if z0 <= z_terra + 0.3 else "finestre"
        if area / (w * h) >= 0.9:
            if cat == "porte":
                z0 = z_terra
            polilinee.append(Polilinea([(u0, z0), (u1, z0), (u1, z1), (u0, z1)], chiusa=True, categoria=cat))
        else:
            # vano non rettangolare (ad arco): segue la forma
            q = _contorni(m, cella, mn)
            sotto = par.copia(motore="libero", archi=True, lung_min=0.05,
                              tolleranza=max(par.tolleranza, cella))
            for p in elabora.estrai(q, sotto):
                p.categoria = cat
                polilinee.append(p)
    # contorno del fabbricato (superficie con i vani riempiti)
    q = _contorni(ndimage.binary_fill_holes(pieno), cella, mn)
    contorno = par.copia(tolleranza=max(par.tolleranza, cella), lung_min=max(par.lung_min, 3 * cella))
    for p in elabora.estrai(q, contorno):
        p.categoria = "muri"
        polilinee.append(p)
    # aggetti
    if np.count_nonzero(davanti) > 200:
        A = np.column_stack((u[davanti], z[davanti]))
        k = np.floor((A - mn) / cella).astype(int)
        ok = (k[:, 0] >= 0) & (k[:, 1] >= 0) & (k[:, 0] < dim[0]) & (k[:, 1] < dim[1])
        ag = np.zeros_like(img)
        ag[k[ok, 1], k[ok, 0]] = True
        ag = ndimage.binary_closing(ag, structure=np.ones((5, 5), bool))
        lab, nl = ndimage.label(ag)
        if nl:
            aree = np.bincount(lab.ravel())
            aree[0] = 0
            ag = aree[lab] * cella * cella >= 0.1
            if ag.any():
                q = _contorni(ag, cella, mn)
                for p in elabora.estrai(q, contorno):
                    p.categoria = "aggetti"
                    polilinee.append(p)
    return P, polilinee
