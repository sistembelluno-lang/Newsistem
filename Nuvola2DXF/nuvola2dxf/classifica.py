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


def _piani_orizzontali(z, quota, passo=0.02):
    """Pavimento e soffitto: le quote con più punti sotto e sopra il taglio
    (le superfici orizzontali concentrano i punti in una fascia sottile)."""
    out = []
    for sel, verso in ((z < quota - 0.3, -1), (z > quota + 0.3, 1)):
        zz = z[sel]
        if len(zz) < 30:
            out.append(None)
            continue
        bins = np.arange(zz.min(), zz.max() + 2 * passo, passo)
        if len(bins) < 2:
            out.append(None)
            continue
        cont, bordi = np.histogram(zz, bins=bins)
        k = int(np.argmax(cont))
        # serve un picco netto rispetto alle fasce dei muri verticali
        if cont[k] < 20 or cont[k] < 3 * max(np.median(cont), 1):
            out.append(None)
            continue
        out.append(float(bordi[k] + passo / 2))
    return out


def profilo_vano(vano, intorno, quota, passo=0.02):
    """Sezione verticale automatica attraverso un vano.

    vano: punti (u, v, z) dentro il vano (spessore del muro); intorno: punti
    della zona attorno, per trovare pavimento e soffitto. Restituisce dict con
    pavimento, soffitto, inferiore (soglia o davanzale) e superiore
    (architrave) del vuoto che contiene la quota di taglio.
    """
    pav, sof = _piani_orizzontali(intorno[:, 2], quota) if len(intorno) else (None, None)
    z = vano[:, 2]
    basso = pav if pav is not None else (float(np.percentile(intorno[:, 2], 1)) if len(intorno) else quota - 3)
    alto = sof if sof is not None else (float(np.percentile(intorno[:, 2], 99)) if len(intorno) else quota + 3)
    bins = np.arange(basso - passo, alto + 2 * passo, passo)
    cont, bordi = np.histogram(z, bins=bins)
    # fascia "piena": abbastanza punti (muro sotto il davanzale, sopra l'architrave)
    soglia = max(3, 0.15 * np.percentile(cont[cont > 0], 75)) if np.any(cont) else 3
    piena = cont >= soglia
    k0 = int(np.clip(np.searchsorted(bordi, quota) - 1, 0, len(cont) - 1))
    if piena[k0]:
        return None  # il taglio non passa nel vuoto
    i = k0
    while i > 0 and not piena[i - 1]:
        i -= 1
    j = k0
    while j < len(cont) - 1 and not piena[j + 1]:
        j += 1
    inferiore = float(bordi[i]) if i > 0 else basso
    superiore = float(bordi[j + 1]) if j < len(cont) - 1 else alto
    # base del muro sotto il vuoto (se il pavimento non si vede)
    pieni_sotto = np.flatnonzero(piena[:i])
    base = float(bordi[pieni_sotto[0]]) if len(pieni_sotto) else inferiore
    return dict(pavimento=pav, soffitto=sof, inferiore=inferiore, superiore=superiore, base=base)


def tipo_aperture(aperture, nv, quota):
    """Porta o finestra con una sezione verticale automatica in ogni vano:
    una porta parte dal pavimento e finisce sotto il soffitto, una finestra
    ha il davanzale sopra il pavimento."""
    if not aperture or nv is None:
        return
    scatole = []
    for ap in aperture:
        scatole.append(dict(c=ap["c"], t=ap["t"], hu=max(0.05, ap["larghezza"] / 2 - 0.06),
                            hv=ap["spessore"] / 2 + 0.03, z0=quota - 4.0, z1=quota + 4.0))
        scatole.append(dict(c=ap["c"], t=ap["t"], hu=ap["larghezza"] / 2 + 0.6,
                            hv=ap["spessore"] / 2 + 1.2, z0=quota - 4.0, z1=quota + 4.0))
    pts = nv.scatole(scatole)
    for k, ap in enumerate(aperture):
        vano, intorno = pts[2 * k], pts[2 * k + 1]
        # attorno: solo fuori dallo spessore del muro (pavimento e soffitto delle stanze)
        intorno = intorno[np.abs(intorno[:, 1]) > ap["spessore"] / 2 + 0.1]
        pr = profilo_vano(vano, intorno, quota)
        ap["profilo"] = pr
        if pr is None:
            ap["categoria"] = "porte"
            continue
        terra = pr["pavimento"] if pr["pavimento"] is not None else pr["base"]
        ap["davanzale"] = max(0.0, pr["inferiore"] - terra)
        ap["altezza"] = pr["superiore"] - pr["inferiore"]
        ap["categoria"] = "finestre" if ap["davanzale"] > 0.15 else "porte"


def testi_aperture(aperture):
    """Etichette con le misure del vano: «P 90×210», «F 120×120 dav. 90»."""
    from .geometria import Testo

    out = []
    for ap in aperture:
        larg = round(ap["larghezza"] * 100)
        if "altezza" in ap:
            h = round(ap["altezza"] * 100)
            if ap["categoria"] == "finestre":
                testo = f"F {larg}×{h} dav. {round(ap['davanzale'] * 100)}"
            else:
                testo = f"P {larg}×{h}"
        else:
            testo = ("F " if ap["categoria"] == "finestre" else "P ") + str(larg)
        t = ap["t"]
        ang = float(np.degrees(np.arctan2(t[1], t[0])))
        if ang > 90 or ang <= -90:
            ang -= 180 * np.sign(ang)
        pos = ap["c"] + ap["n"] * (ap["spessore"] / 2 + 0.12)
        out.append(Testo(tuple(pos), testo, altezza=0.08, categoria=ap["categoria"], rotazione=ang, allinea="centro"))
    return out


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

    # tratti orizzontali allineati e contigui (un'anta chiusa o un innesto
    # spezzano l'architrave) valutati insieme
    catena_di = {}
    gruppi = []
    for a, b, k, i in sorted(orizz, key=lambda t: (round(t[0][1], 2), min(t[0][0], t[1][0]))):
        x0, x1 = sorted((a[0], b[0]))
        z = (a[1] + b[1]) / 2
        g = gruppi[-1] if gruppi else None
        if g and abs(g["z"] - z) < 0.01 and abs(g["x1"] - x0) < 0.005:
            g["x1"] = x1
            g["membri"].append((a, b, k, i))
        else:
            gruppi.append(dict(z=z, x0=x0, x1=x1, membri=[(a, b, k, i)]))
    architravi, davanzali, resto = [], [], []
    for g in gruppi:
        a, b = np.array([g["x0"], g["z"]]), np.array([g["x1"], g["z"]])
        L = g["x1"] - g["x0"]
        # fino a 2 m: muri antichi spessi o tagliati di sbieco
        va, vb = (verso(a), verso(b)) if 0.05 <= L <= 2.0 else (0, 0)
        if va == vb == 1:
            architravi.append((a, b, g["membri"]))
        elif va == vb == -1:
            davanzali.append((a, b, g["membri"]))
        else:
            resto.extend(g["membri"])
            continue
        for _, _, k, i in g["membri"]:
            cat_poli[k][i] = "muri"
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
    for a, b, membri in architravi:
        um = (a[0] + b[0]) / 2
        z = a[1]
        sotto = [d for d in davanzali if abs((d[0][0] + d[1][0]) / 2 - um) < 0.15 and 0.3 <= z - d[0][1] <= 3.0]
        if sotto:
            d = max(sotto, key=lambda d: d[0][1])
            for _, _, k, i in membri + d[2]:
                cat_poli[k][i] = "finestre"
            extra.append(_linea((um, d[0][1]), (um, z), "finestre"))
            continue
        # il pavimento può interrompersi sotto la soglia: basta che arrivi vicino
        base = [p for p, q in pavimenti if min(p[0], q[0]) - 0.6 <= um <= max(p[0], q[0]) + 0.6 and 1.5 <= z - p[1] <= 3.5]
        if base:
            zp = max(p[1] for p in base)
            for _, _, k, i in membri:
                cat_poli[k][i] = "porte"
            # anta chiusa: tratti verticali dentro il vano, sotto l'architrave
            u0, u1 = sorted((a[0], b[0]))
            anta = False
            for p_, q_, g_, k2, i2 in tratti:
                if cat_poli[k2][i2] != "muri":
                    continue
                if u0 + 0.01 < p_[0] < u1 - 0.01 and u0 + 0.01 < q_[0] < u1 - 0.01 \
                        and max(p_[1], q_[1]) <= z + 0.02 and min(p_[1], q_[1]) >= zp - 0.05:
                    cat_poli[k2][i2] = "porte"
                    anta = True
            if not anta:
                extra.append(_linea((um, zp), (um, z), "porte"))
    nuove = [cat_poli.get(k) for k in range(len(poli))]
    return _dividi(poli, nuove) + extra


# ---------------------------------------------------------------- legenda
def conta(poli):
    out = {}
    for p in poli:
        out[p.categoria] = out.get(p.categoria, 0) + 1
    return out
