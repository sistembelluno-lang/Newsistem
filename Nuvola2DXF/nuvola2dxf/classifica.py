"""Riconoscimento automatico degli elementi (muri, porte, finestre, pilastri,
pavimenti, soffitti, coperture, volte) nelle piante e nelle sezioni.

Le regole sono geometriche e volutamente semplici: il risultato è un DXF già
diviso in layer, che si corregge in CAD dove il riconoscimento sbaglia.
"""

import numpy as np

from .geometria import Polilinea

ORIZZ = np.sin(np.radians(10))   # entro 10° dall'orizzontale
VERT = np.cos(np.radians(10))    # entro 10° dalla verticale


def _tratti(poli):
    """Tutti i tratti (a, b, bulge, indice polilinea, indice tratto)."""
    out = []
    for k, p in enumerate(poli):
        if p.tipo == "cerchio":
            continue
        for i, (a, b, g) in enumerate(p.tratti()):
            out.append((np.asarray(a, float), np.asarray(b, float), float(g), k, i))
    return out


def _chiave(p, passo=1e-3):
    return (int(round(p[0] / passo)), int(round(p[1] / passo)))


def _grado_estremi(tratti):
    grado = {}
    for a, b, *_ in tratti:
        for e in (a, b):
            grado[_chiave(e)] = grado.get(_chiave(e), 0) + 1
    return grado


def _linea(a, b, categoria):
    return Polilinea([a, b], categoria=categoria)


# ---------------------------------------------------------------- pianta
def pilastri(poli):
    for p in poli:
        dim = np.ptp(p.punti, axis=0)
        if p.tipo == "cerchio":
            r = np.hypot(*(p.punti[0] - p.punti[1])) / 2
            if r <= 0.8:
                p.categoria = "pilastri"
        elif p.chiusa and 0.1 <= dim.max() <= 1.2:
            p.categoria = "pilastri"


def aperture_pianta(poli, punti2d):
    """Trova i vani (porte o finestre) dalle coppie di spallette: due tratti
    corti paralleli, lunghi quanto lo spessore del muro, uno di fronte
    all'altro. Restituisce dict con c, t, larghezza, spessore e le spallette."""
    tratti = [t for t in _tratti(poli) if t[2] == 0 and poli[t[3]].categoria == "muri"]
    grado = _grado_estremi(tratti)
    spallette = []
    for a, b, _, _, _ in tratti:
        L = float(np.hypot(*(b - a)))
        if 0.05 <= L <= 1.0 and grado[_chiave(a)] >= 2 and grado[_chiave(b)] >= 2:
            spallette.append((a, b, L, (b - a) / L, (a + b) / 2))
    lung_tot = sum(p.lunghezza() for p in poli) or 1.0
    densita = len(punti2d) / lung_tot  # punti per metro di contorno
    coppie = []
    for i in range(len(spallette)):
        a1, b1, L1, d1, m1 = spallette[i]
        for j in range(i + 1, len(spallette)):
            a2, b2, L2, d2, m2 = spallette[j]
            if abs(d1[0] * d2[1] - d1[1] * d2[0]) > np.sin(np.radians(5)):
                continue
            if abs(L1 - L2) > max(0.05, 0.25 * max(L1, L2)):
                continue
            v = m2 - m1
            w = abs(v[0] * d1[1] - v[1] * d1[0])  # distanza tra le spallette
            sfalsamento = abs(v @ d1)
            if not (0.45 <= w <= 3.5) or sfalsamento > 0.5 * min(L1, L2):
                continue
            coppie.append((w, i, j))
    coppie.sort()
    usate = set()
    aperture = []
    for w, i, j in coppie:
        if i in usate or j in usate:
            continue
        a1, b1, L1, d1, m1 = spallette[i]
        a2, b2, L2, d2, m2 = spallette[j]
        c = (m1 + m2) / 2
        t = (m2 - m1) - ((m2 - m1) @ d1) * d1
        t = t / np.hypot(*t)
        spessore = (L1 + L2) / 2
        # il vano non deve essere attraversato da un muro pieno
        if len(punti2d):
            rel = punti2d - c
            dentro = (np.abs(rel @ t) < w / 2 - 0.03) & (np.abs(rel @ d1) < spessore / 2)
            if np.count_nonzero(dentro) > 3 * densita * w + 10:
                continue
        usate.update((i, j))
        # facce del muro attraverso il vano: estremi delle spallette accoppiati
        s2 = (b2, a2) if np.hypot(*(a1 - a2)) > np.hypot(*(a1 - b2)) else (a2, b2)
        aperture.append(dict(c=c, t=t, n=d1, larghezza=w, spessore=spessore,
                             facce=((a1, s2[0]), (b1, s2[1])), categoria="porte"))
    return aperture


def tipo_aperture(aperture, nv, quota):
    """Porta o finestra guardando i punti 3D sotto il piano di taglio: se c'è
    il davanzale (muro pieno sotto il vano) è una finestra."""
    if not aperture or nv is None:
        return
    scatole = [dict(c=ap["c"], t=ap["t"], hu=max(0.05, ap["larghezza"] / 2 - 0.08),
                    hv=ap["spessore"] / 2 + 0.03, z0=quota - 3.0, z1=quota - 0.05)
               for ap in aperture]
    for ap, pts in zip(aperture, nv.scatole(scatole)):
        if len(pts) < 20:
            ap["categoria"] = "porte"
            continue
        z = pts[:, 2]
        pavimento = np.percentile(z, 2)
        z_alti = z[z > pavimento + 0.15]
        if len(z_alti) < 10 or quota - pavimento < 0.4:
            ap["categoria"] = "porte"
            continue
        fasce = np.arange(pavimento + 0.15, quota - 0.1, 0.05)
        if len(fasce) < 2:
            ap["categoria"] = "porte"
            continue
        cont, _ = np.histogram(z_alti, bins=fasce)
        piene = np.count_nonzero(cont >= 3) / len(cont)
        ap["categoria"] = "finestre" if piene > 0.4 else "porte"


def disegna_aperture(aperture):
    out = []
    for ap in aperture:
        cat = ap["categoria"]
        (p1, q1), (p2, q2) = ap["facce"]
        out.append(_linea(p1, q1, cat))
        out.append(_linea(p2, q2, cat))
        if cat == "finestre":
            out.append(_linea((p1 + p2) / 2, (q1 + q2) / 2, cat))  # vetro
    return out


def classifica_pianta(poli, punti2d, nv=None, quota=None):
    pilastri(poli)
    aperture = aperture_pianta(poli, punti2d)
    tipo_aperture(aperture, nv, quota)
    return poli + disegna_aperture(aperture), aperture


# ---------------------------------------------------------------- sezione
def _categoria_tratto(a, b, g):
    if g:
        return "volte"
    d = b - a
    L = np.hypot(*d)
    if L == 0:
        return "muri"
    s = abs(d[1]) / L
    if s <= ORIZZ:
        return "orizz"
    if s >= VERT:
        return "muri"
    return "coperture"


def _dividi(poli, categorie):
    """Spezza le polilinee in tratti consecutivi della stessa categoria."""
    out = []
    for k, p in enumerate(poli):
        if p.tipo == "cerchio":
            out.append(p)
            continue
        cat = categorie[k]
        n = len(p.punti)
        m = len(cat)
        if len(set(cat)) == 1:
            p.categoria = cat[0]
            out.append(p)
            continue
        # con le polilinee chiuse parte da un cambio di categoria
        inizio = 0
        if p.chiusa:
            for i in range(m):
                if cat[i] != cat[i - 1]:
                    inizio = i
                    break
        ordine = [(inizio + i) % m for i in range(m)]
        gruppo = [ordine[0]]
        for i in ordine[1:]:
            if cat[i] == cat[gruppo[-1]]:
                gruppo.append(i)
            else:
                out.append(_pezzo(p, gruppo, cat[gruppo[0]], n))
                gruppo = [i]
        out.append(_pezzo(p, gruppo, cat[gruppo[0]], n))
    return out


def _pezzo(p, idx, cat, n):
    vert = [p.punti[idx[0]]] + [p.punti[(i + 1) % n] for i in idx]
    bulge = [p.bulge[i] for i in idx] + [0.0]
    tipo = "curva" if any(bulge) else "linea"
    return Polilinea(np.array(vert), np.array(bulge), tipo=tipo, categoria=cat)


def classifica_sezione(poli, punti2d=None):
    # le chiusure di buchi restano nel loro layer, da verificare
    tratti = [t for t in _tratti(poli) if poli[t[3]].categoria != "chiusure"]
    cat_poli = {k: [p.categoria if p.categoria == "chiusure" else "muri"] * (len(p.punti) if p.chiusa else len(p.punti) - 1)
                for k, p in enumerate(poli) if p.tipo != "cerchio"}
    for a, b, g, k, i in tratti:
        cat_poli[k][i] = _categoria_tratto(a, b, g)
    # orizzontali: pavimento se sopra c'è un ambiente, soffitto se è sotto
    orizz = [(a, b, k, i) for a, b, g, k, i in tratti if cat_poli[k][i] == "orizz"]
    altri = [(a, b) for a, b, g, k, i in tratti if cat_poli[k][i] in ("coperture", "volte")]

    def sovrapposti(a, b, lista, sopra):
        u0, u1 = sorted((a[0], b[0]))
        z = (a[1] + b[1]) / 2
        dist = []
        for p, q, *_ in lista:
            v0, v1 = sorted((p[0], q[0]))
            if min(u1, v1) - max(u0, v0) < 0.2 * min(u1 - u0, v1 - v0, 1.0):
                continue
            zq = (p[1] + q[1]) / 2 if abs(p[1] - q[1]) < 0.01 else max(p[1], q[1]) if not sopra else min(p[1], q[1])
            dz = (zq - z) if sopra else (z - zq)
            if dz > 0.05:
                dist.append(dz)
        return min(dist) if dist else None

    # architravi (dagli estremi i muri salgono) e davanzali (scendono):
    # tratti orizzontali corti, lunghi quanto lo spessore del muro
    estremi = {}
    for a, b, g, k, i in tratti:
        for e, f in ((a, b), (b, a)):
            estremi.setdefault(_chiave(e), []).append(f)

    def verso(e):
        """+1 se dall'estremo partono muri verso l'alto, -1 verso il basso."""
        segni = [np.sign(f[1] - e[1]) for f in estremi.get(_chiave(e), [])
                 if abs(f[0] - e[0]) < 0.05 and abs(f[1] - e[1]) > 0.1]
        return int(np.sign(sum(segni))) if segni else 0

    architravi, davanzali, resto = [], [], []
    for a, b, k, i in orizz:
        L = abs(b[0] - a[0])
        va, vb = (verso(a), verso(b)) if 0.05 <= L <= 1.0 else (0, 0)
        if va == vb == 1:
            architravi.append((a, b, k, i))
            cat_poli[k][i] = "muri"
        elif va == vb == -1:
            davanzali.append((a, b, k, i))
            cat_poli[k][i] = "muri"
        else:
            resto.append((a, b, k, i))
    for a, b, k, i in resto:
        su = sovrapposti(a, b, resto + [(p, q, -1, -1) for p, q in altri], True)
        giu = sovrapposti(a, b, resto, False)
        ambiente_sopra = su is not None and su >= 1.8
        ambiente_sotto = giu is not None and giu >= 1.8
        if su is None and giu is None:
            ambiente_sopra = True  # linea isolata: la si considera base
        if ambiente_sopra and not ambiente_sotto:
            cat_poli[k][i] = "pavimenti"
        elif ambiente_sotto and not ambiente_sopra:
            cat_poli[k][i] = "soffitti"
        else:
            cat_poli[k][i] = "solai"
    extra = []
    pavimenti = [(a, b) for a, b, k, i in orizz if cat_poli[k][i] == "pavimenti"]
    for a, b, k, i in architravi:
        um = (a[0] + b[0]) / 2
        z = a[1]
        sotto = [d for d in davanzali if abs((d[0][0] + d[1][0]) / 2 - um) < 0.15 and 0.3 <= z - d[0][1] <= 3.0]
        if sotto:
            d = max(sotto, key=lambda d: d[0][1])
            cat_poli[k][i] = "finestre"
            cat_poli[d[2]][d[3]] = "finestre"
            extra.append(_linea((um, d[0][1]), (um, z), "finestre"))
            continue
        # il pavimento può interrompersi sotto la soglia: basta che arrivi vicino
        base = [p for p, q in pavimenti if min(p[0], q[0]) - 0.6 <= um <= max(p[0], q[0]) + 0.6 and 1.5 <= z - p[1] <= 3.5]
        if base:
            zp = max(p[1] for p in base)
            cat_poli[k][i] = "porte"
            extra.append(_linea((um, zp), (um, z), "porte"))
    nuove = [cat_poli.get(k) for k in range(len(poli))]
    return _dividi(poli, nuove) + extra


# ---------------------------------------------------------------- legenda
def conta(poli):
    out = {}
    for p in poli:
        out[p.categoria] = out.get(p.categoria, 0) + 1
    return out
