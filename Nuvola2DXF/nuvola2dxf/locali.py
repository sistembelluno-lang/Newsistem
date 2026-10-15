"""Riconoscimento degli ambienti (stanze, corridoi, locali) in pianta.

Le linee dei muri possono avere buchi; lo spazio delle stanze no. Si parte
quindi dallo spazio libero:

1. le linee della pianta (muri, chiusure, porte e finestre, pilastri; non gli
   arredi) vengono disegnate in una griglia fine;
2. per ogni cella libera si calcola la distanza dal muro più vicino: grande
   al centro delle stanze, piccola nelle porte e nei passaggi;
3. lo spazio viene diviso in bacini attorno ai centri delle stanze
   (spartiacque); due bacini restano separati solo se il passaggio tra loro è
   stretto rispetto alle stanze (una porta), altrimenti sono la stessa stanza;
4. il bacino collegato al bordo della griglia è l'esterno e viene scartato.

Ogni stanza diventa una polilinea chiusa nel layer dei locali, con nome e
superficie. Il contorno è chiuso per costruzione anche dove i muri hanno buchi.
"""

import numpy as np
from scipy import ndimage

from .geometria import Polilinea, Testo

CATEGORIE_MURO = ("muri", "chiusure", "porte", "finestre", "pilastri", "tavolati")


def _griglia(poli, cella, margine=2.0):
    pts = [p.campiona(0.02) for p in poli if p.categoria in CATEGORIE_MURO]
    if not pts:
        return None
    tutti = np.vstack(pts)
    mn = tutti.min(axis=0) - margine
    mx = tutti.max(axis=0) + margine
    n = np.ceil((mx - mn) / cella).astype(int) + 1
    muro = np.zeros((n[0], n[1]), bool)
    linee = [p for p in poli if p.categoria in CATEGORIE_MURO]
    linee += [Polilinea([a, b]) for a, b in _prolungamenti(poli)]
    for p in linee:
        c = p.campiona(cella / 2)
        if p.chiusa and p.tipo != "cerchio":
            c = np.vstack((c, c[:1]))
        for a, b in zip(c[:-1], c[1:]):
            k = max(2, int(np.ceil(np.hypot(*(b - a)) / (cella / 2))) + 1)
            s = a + (b - a) * np.linspace(0, 1, k)[:, None]
            ij = np.floor((s - mn) / cella).astype(int)
            muro[ij[:, 0], ij[:, 1]] = True
    return muro, mn


def _spartiacque(dist, libero, cella, passo=0.02, minimo=0.25):
    """Spartiacque per immersione: dal centro delle stanze (distanza dal muro
    grande) verso i muri. A ogni livello si prendono i pezzi collegati della
    zona sommersa: un pezzo che tocca un solo bacino gli appartiene tutto,
    uno che non ne tocca nessuno è un bacino nuovo, uno che ne tocca più di
    uno viene diviso facendoli crescere cella per cella (lì c'è una porta o un
    passaggio). Restituisce (etichette, numero di bacini)."""
    et = np.zeros(dist.shape, np.int32)
    n = 0
    croce = ndimage.generate_binary_structure(2, 1)
    for liv in np.arange(dist.max(), 0, -passo):
        zona = libero & (dist >= liv)
        lab, k = ndimage.label(zona, structure=croce)
        if k == 0:
            continue
        # quali bacini tocca ogni pezzo
        m = et > 0
        coppie = np.unique(np.column_stack((lab[m], et[m])), axis=0) if m.any() else np.zeros((0, 2), int)
        quanti = np.bincount(coppie[:, 0], minlength=k + 1) if len(coppie) else np.zeros(k + 1, int)
        mappa = np.zeros(k + 1, np.int32)
        for c, b in coppie:
            if quanti[c] == 1:
                mappa[c] = b
        libere = zona & (et == 0)
        # pezzi con un solo bacino
        uno = libere & (mappa[lab] > 0)
        et[uno] = mappa[lab][uno]
        # pezzi nuovi
        if liv >= minimo:
            nuovi = libere & (quanti[lab] == 0)
            if nuovi.any():
                lab2, k2 = ndimage.label(nuovi, structure=croce)
                et[nuovi] = lab2[nuovi] + n
                n += k2
        # pezzi conte: crescita a contatto
        conteso = zona & (et == 0) & (quanti[lab] > 1)
        while conteso.any():
            cresce = ndimage.grey_dilation(et, footprint=croce)
            nuovo = conteso & (cresce > 0)
            if not nuovo.any():
                break
            et[nuovo] = cresce[nuovo]
            conteso &= ~nuovo
    # le ultime celle libere vicinissime ai muri
    for _ in range(50):
        cresce = ndimage.grey_dilation(et, footprint=croce)
        nuovo = libero & (et == 0) & (cresce > 0)
        if not nuovo.any():
            break
        et[nuovo] = cresce[nuovo]
    return et, n


def _prolungamenti(poli, g_max=2.5, laterale=0.04):
    """Segmenti virtuali che prolungano un muro sulla sua linea fino al tratto
    successivo (porte, finestre, buchi della nuvola): servono solo a separare
    le stanze sul filo del muro, non vanno nel disegno."""
    E = []
    for p in poli:
        if p.categoria not in ("muri", "chiusure", "tavolati") or p.tipo == "cerchio":
            continue
        tr = [(a, b) for a, b, g in p.tratti() if not g]
        if not tr:
            continue
        for k, (a, b) in ((0, tr[0]), (1, tr[-1])):
            L = float(np.hypot(*(b - a)))
            if L < 0.2:
                continue
            d = (b - a) / L
            if p.chiusa:
                continue
            E.append((a, -d) if k == 0 else (b, d))
    out = []
    for i, (e1, o1) in enumerate(E):
        n1 = np.array([-o1[1], o1[0]])
        migliore = None
        for j, (e2, o2) in enumerate(E):
            if i == j or o1 @ o2 > -0.995:
                continue
            g = float((e2 - e1) @ o1)
            if 0.05 < g <= g_max and abs((e2 - e1) @ n1) < laterale and (migliore is None or g < migliore[0]):
                migliore = (g, e2)
        if migliore is not None:
            out.append((e1, migliore[1]))
    return out


def completa_muri(poli, info, coperto=0.04, minimo=0.10):
    """Chiusure lungo i lati dei locali che non hanno una linea di muro sotto:
    la stanza si chiude anche nel disegno, fino agli spigoli geometrici.
    Restituisce le polilinee nuove (categoria 'chiusure')."""
    from scipy.spatial import cKDTree

    campioni = []
    for p in poli:
        if p.categoria in CATEGORIE_MURO + ("arredi",):
            c = p.campiona(0.01)
            if p.chiusa and p.tipo != "cerchio":
                c = np.vstack((c, c[:1]))
            for a, b in zip(c[:-1], c[1:]):
                n = max(1, int(np.hypot(*(b - a)) / 0.01))
                campioni.append(a + (b - a) * np.linspace(0, 1, n, endpoint=False)[:, None])
    if not campioni:
        return []
    albero = cKDTree(np.vstack(campioni))
    # rette dei muri: una chiusura si aggiunge solo sul prolungamento di un muro
    rette = []
    for p in poli:
        if p.categoria in ("muri", "chiusure", "tavolati") and p.tipo != "cerchio":
            for a, b, g in p.tratti():
                L = float(np.hypot(*(b - a)))
                if not g and L > 0.3:
                    rette.append((a, (b - a) / L))

    def sul_prolungamento(p0, p1):
        d = (p1 - p0) / max(np.hypot(*(p1 - p0)), 1e-9)
        for a, t in rette:
            if abs(t[0] * d[1] - t[1] * d[0]) > np.sin(np.radians(4)):
                continue
            n = np.array([-t[1], t[0]])
            if abs((p0 - a) @ n) < 0.03 and abs((p1 - a) @ n) < 0.03:
                return a, t
        return None

    nuove = []
    for loc in info:
        V = loc["poligono"]
        for k in range(len(V)):
            a, b = V[k], V[(k + 1) % len(V)]
            L = float(np.hypot(*(b - a)))
            if L < minimo:
                continue
            n = max(2, int(L / 0.02))
            f = np.linspace(0, 1, n)
            S = a + (b - a) * f[:, None]
            d, _ = albero.query(S)
            scoperto = d > coperto
            # tratti scoperti consecutivi
            i = 0
            while i < n:
                if not scoperto[i]:
                    i += 1
                    continue
                j = i
                while j + 1 < n and scoperto[j + 1]:
                    j += 1
                p0 = S[max(i - 1, 0)]
                p1 = S[min(j + 1, n - 1)]
                r = sul_prolungamento(p0, p1) if np.hypot(*(p1 - p0)) >= minimo else None
                if r is not None:
                    a0, t = r  # la chiusura sta esattamente sulla retta del muro
                    q0 = a0 + t * ((p0 - a0) @ t)
                    q1 = a0 + t * ((p1 - a0) @ t)
                    nuove.append(Polilinea([q0, q1], categoria="chiusure"))
                i = j + 1
    return nuove


def _contorno(maschera):
    """Contorno esterno (in celle) di una regione connessa: lista di vertici
    sugli spigoli delle celle, in senso antiorario."""
    m = np.pad(maschera, 1)
    # lati di cella tra dentro e fuori, orientati con l'interno a sinistra
    lati = {}
    I, J = np.nonzero(m & ~ndimage.binary_erosion(m))
    for i, j in zip(I, J):
        if not m[i, j - 1]:
            lati[(i + 1, j)] = (i, j)
        if not m[i, j + 1]:
            lati[(i, j + 1)] = (i + 1, j + 1)
        if not m[i - 1, j]:
            lati[(i, j)] = (i, j + 1)
        if not m[i + 1, j]:
            lati[(i + 1, j + 1)] = (i + 1, j)
    if not lati:
        return None
    # il contorno più lungo (l'esterno; i buchi interni sono più corti)
    visti = set()
    migliore = []
    for inizio in list(lati):
        if inizio in visti:
            continue
        anello = [inizio]
        visti.add(inizio)
        cur = lati[inizio]
        while cur != inizio and cur in lati and cur not in visti:
            visti.add(cur)
            anello.append(cur)
            cur = lati[cur]
        if len(anello) > len(migliore):
            migliore = anello
    return np.array(migliore, float) - 1.0


def _semplifica(V, toll):
    """Douglas-Peucker su un anello chiuso."""
    if len(V) < 4:
        return V

    def dp(P):
        a, b = P[0], P[-1]
        d = b - a
        L = np.hypot(*d)
        if L < 1e-12:
            dist = np.hypot(*(P - a).T)
        else:
            dist = np.abs(d[0] * (P[:, 1] - a[1]) - d[1] * (P[:, 0] - a[0])) / L
        k = int(np.argmax(dist))
        if dist[k] > toll and 0 < k < len(P) - 1:
            return np.vstack((dp(P[: k + 1])[:-1], dp(P[k:])))
        return np.array([a, b])

    # parte dal vertice più lontano dal primo, per un taglio stabile
    k = int(np.argmax(np.hypot(*(V - V[0]).T)))
    A = dp(np.vstack((V[: k + 1],)))
    B = dp(np.vstack((V[k:], V[:1])))
    return np.vstack((A[:-1], B[:-1]))


def _aggancia(V, segmenti, d_max=0.12, gradi=6):
    """Ogni lato del contorno va sulla linea di muro parallela più vicina;
    i vertici diventano le intersezioni dei lati consecutivi."""
    if not segmenti:
        return V
    A = np.array([a for a, b in segmenti])
    B = np.array([b for a, b in segmenti])
    D = B - A
    Ls = np.hypot(*D.T)
    D = D / Ls[:, None]
    N = np.column_stack((-D[:, 1], D[:, 0]))
    cos_max = np.cos(np.radians(gradi))
    n = len(V)
    rette = []
    for k in range(n):
        p, q = V[k], V[(k + 1) % n]
        L = float(np.hypot(*(q - p)))
        d = (q - p) / max(L, 1e-12)
        retta = (p, d)
        if L > 0.12:
            par = np.abs(D @ d) >= cos_max
            m = (p + q) / 2
            dist = np.abs(np.einsum("ij,ij->i", m - A, N))
            # sovrapposizione lungo il lato
            u0 = np.einsum("ij,ij->i", p - A, D)
            u1 = np.einsum("ij,ij->i", q - A, D)
            sovr = np.minimum(np.maximum(u0, u1), Ls) - np.maximum(np.minimum(u0, u1), 0)
            ok = par & (dist < d_max) & (sovr > 0.3 * L)
            if ok.any():
                j = int(np.argmin(np.where(ok, dist, np.inf)))
                retta = (A[j], D[j])
        rette.append(retta)
    out = []
    for k in range(n):
        (p1, d1), (p2, d2) = rette[k - 1], rette[k]
        det = d1[0] * (-d2[1]) - d1[1] * (-d2[0])
        if abs(det) < 0.05:  # lati quasi allineati: si proietta il vertice
            v = V[k]
            x = p2 + d2 * ((v - p2) @ d2)
        else:
            r = p2 - p1
            t = (r[0] * (-d2[1]) - r[1] * (-d2[0])) / det
            x = p1 + t * d1
            if np.hypot(*(x - V[k])) > 0.3:  # intersezione lontana: si tiene il vertice
                x = V[k]
        out.append(x)
    out = np.array(out)
    # via i vertici doppi e quelli allineati
    tieni = [0]
    for k in range(1, len(out)):
        if np.hypot(*(out[k] - out[tieni[-1]])) > 0.01:
            tieni.append(k)
    out = out[tieni]
    if len(out) > 3 and np.hypot(*(out[0] - out[-1])) < 0.01:
        out = out[:-1]
    return out


def _area(V):
    x, y = V[:, 0], V[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def locali(poli, cella=None, area_min=1.5, rapporto_porta=0.8, toll=0.10):
    """Restituisce (polilinee dei locali, testi con nome e superficie, info)."""
    pts = [p.campiona(0.05) for p in poli if p.categoria in CATEGORIE_MURO]
    if not pts:
        return [], [], []
    est = np.ptp(np.vstack(pts), axis=0).max()
    cella = cella or float(np.clip(est / 1500, 0.04, 0.10))
    g = _griglia(poli, cella)
    if g is None:
        return [], [], []
    muro, mn = g
    # un velo di 1 cella sui muri: le linee rasterizzate non devono avere fessure in diagonale
    muro = ndimage.binary_dilation(muro, iterations=1)
    libero = ~muro
    dist = ndimage.distance_transform_edt(libero) * cella
    bacini, n = _spartiacque(dist, libero, cella, passo=cella)
    if n == 0:
        return [], [], []
    # fusione dei bacini divisi solo da un restringimento largo (stessa stanza)
    picco = ndimage.maximum(dist, labels=bacini, index=np.arange(n + 1))
    padre = list(range(n + 1))

    def radice(x):
        while padre[x] != x:
            padre[x] = padre[padre[x]]
            x = padre[x]
        return x

    # sella tra due bacini: la distanza massima lungo il loro confine
    selle = {}
    for asse in (0, 1):
        a = bacini.take(range(0, bacini.shape[asse] - 1), axis=asse)
        b = bacini.take(range(1, bacini.shape[asse]), axis=asse)
        da = dist.take(range(0, bacini.shape[asse] - 1), axis=asse)
        db = dist.take(range(1, bacini.shape[asse]), axis=asse)
        m = (a != b) & (a > 0) & (b > 0)
        for u, v, d in zip(a[m], b[m], np.minimum(da[m], db[m])):
            k = (min(u, v), max(u, v))
            if d > selle.get(k, 0):
                selle[k] = d
    # dalla sella più alta alla più bassa; il confronto è con il gruppo già
    # formato, così un bacino piccolo non fa da ponte tra stanza ed esterno
    picco_gr = list(picco)
    for (u, v), s in sorted(selle.items(), key=lambda x: -x[1]):
        ru, rv = radice(u), radice(v)
        # un passaggio largo più di 1,8 m non è una porta: stessa stanza
        if ru != rv and (s >= rapporto_porta * min(picco_gr[ru], picco_gr[rv]) or s >= 0.9):
            padre[rv] = ru
            picco_gr[ru] = max(picco_gr[ru], picco_gr[rv])
    unito = np.array([radice(k) for k in range(n + 1)])
    stanze = unito[bacini]
    stanze[bacini == 0] = 0
    # l'esterno: tutto ciò che tocca il bordo della griglia
    bordo = set(np.unique(np.r_[stanze[0], stanze[-1], stanze[:, 0], stanze[:, -1]]).tolist()) - {0}
    out_poli, out_testi, info = [], [], []
    etichette = [k for k in np.unique(stanze) if k > 0 and k not in bordo]
    # i lati delle stanze si agganciano ai muri, non alle linee di porte e finestre
    segmenti = [(a, b) for p in poli if p.categoria in ("muri", "chiusure", "pilastri", "tavolati")
                and p.tipo != "cerchio" for a, b, g in p.tratti() if not g and np.hypot(*(b - a)) > 0.05]
    regioni = []
    for k in etichette:
        mask = stanze == k
        # lo spazio fino al muro: la regione si allarga sulle celle di muro di confine
        mask = ndimage.binary_fill_holes(mask)
        # fino alla faccia del muro: la stanza si allarga sulle celle di muro vicine
        mask = mask | (ndimage.binary_dilation(mask, iterations=2) & muro)
        # niente ponticelli d'angolo (il contorno salterebbe): apertura e pezzo principale
        croce = ndimage.generate_binary_structure(2, 1)
        mask = ndimage.binary_opening(mask, structure=croce)
        lab, k_ = ndimage.label(mask, structure=croce)
        if k_ > 1:
            mask = lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)
        mask = ndimage.binary_fill_holes(mask)
        area = mask.sum() * cella * cella
        if area < area_min:
            continue
        cont = _contorno(mask)
        if cont is None:
            continue
        V = mn + cont * cella
        V = _semplifica(V, max(toll, cella))
        if len(V) < 3:
            continue
        V = _aggancia(V, segmenti)
        if len(V) < 3:
            continue
        if _area(V) < 0:
            V = V[::-1]
        # punto per l'etichetta: il più lontano dai muri dentro la stanza
        d = np.where(mask, dist, 0)
        i, j = np.unravel_index(int(np.argmax(d)), d.shape)
        centro = mn + (np.array([i, j]) + 0.5) * cella
        regioni.append((V, abs(_area(V)), centro))
    # numerazione da sinistra in alto, come si legge una pianta
    regioni.sort(key=lambda r: (-round(r[2][1] / 2.0), r[2][0]))
    for n_, (V, A, c) in enumerate(regioni, 1):
        out_poli.append(Polilinea(V, chiusa=True, categoria="locali"))
        nome = f"Locale {n_}"
        out_testi.append(Testo(tuple(c), f"{nome}", altezza=0.18, categoria="locali", allinea="centro"))
        out_testi.append(Testo((c[0], c[1] - 0.28), f"{A:.2f} m²".replace(".", ","), altezza=0.14,
                               categoria="locali", allinea="centro"))
        info.append(dict(nome=nome, area=A, centro=c, poligono=V))
    return out_poli, out_testi, info
