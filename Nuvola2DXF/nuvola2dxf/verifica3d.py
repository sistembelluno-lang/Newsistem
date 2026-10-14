"""Controlli della pianta con la nuvola 3D.

La fetta della pianta vede solo pochi centimetri attorno alla quota di taglio;
guardando sopra e sotto si capisce di più:

- **arredi**: la faccia di un armadio, di un frigorifero o di una libreria
  finisce sotto il soffitto e dietro c'è un muro che invece arriva al
  soffitto. Vanno nel layer degli arredi e il muro dietro si richiude;
- **vani su una sola faccia**: un muro esterno rilevato solo da dentro ha il
  buco della finestra o della porta solo sulla faccia interna; sopra c'è
  l'architrave, sotto il davanzale o il pavimento;
- **chiusure**: un buco richiuso dove davanti c'era un mobile (il muro è solo
  nascosto) è giusto; se il buco è libero da terra all'architrave è una porta.
"""

import numpy as np


def _tratti_cat(poli, categorie):
    out = []
    for k, p in enumerate(poli):
        if p.tipo == "cerchio" or p.categoria not in categorie:
            continue
        for i, (a, b, g) in enumerate(p.tratti()):
            if not g:
                out.append((np.asarray(a, float), np.asarray(b, float), k, i))
    return out


def _copertura(u, L, passo=0.1, minimo=2):
    """Frazione della lunghezza L coperta da punti (in fasce da 'passo')."""
    if L <= 0:
        return 0.0
    n = max(1, int(np.ceil(L / passo)))
    cont = np.bincount(np.clip(((u + L / 2) / passo).astype(int), 0, n - 1), minlength=n)
    return float(np.mean(cont >= minimo))


def _soffitto(z, quota):
    """Quota del soffitto locale: la fascia orizzontale più piena sopra il taglio."""
    zz = z[z > quota + 0.5]
    if len(zz) < 30:
        return None
    cont, bordi = np.histogram(zz, bins=np.arange(zz.min(), zz.max() + 0.04, 0.02))
    if not len(cont):
        return None
    k = int(np.argmax(cont))
    return float(bordi[k] + 0.01)


def arredi(poli, nv, quota, lung_min=0.3):
    """Indici (k, i) dei tratti che sono arredi e non muri."""
    tratti = [t for t in _tratti_cat(poli, ("muri",)) if np.hypot(*(t[1] - t[0])) >= 0.1]
    if not tratti or nv is None:
        return set()
    scatole = []
    for a, b, _, _ in tratti:
        L = float(np.hypot(*(b - a)))
        scatole.append(dict(c=(a + b) / 2, t=(b - a) / L, hu=max(L / 2 - 0.03, 0.02), hv=1.0,
                            z0=quota - 0.5, z1=quota + 6.0))
    pts = nv.scatole(scatole)
    esito = {}
    for (a, b, k, i), P in zip(tratti, pts):
        L = float(np.hypot(*(b - a)))
        if len(P) < 20:
            continue
        sof = _soffitto(P[:, 2], quota)
        if sof is None:
            continue
        # fascia appena sotto il soffitto: un muro ci arriva, un armadio no
        banda = (P[:, 2] > sof - 0.25) & (P[:, 2] < sof - 0.04)
        piano = np.abs(P[:, 1]) < 0.035
        alto = _copertura(P[piano & banda, 0], 2 * max(L / 2 - 0.03, 0.02))
        sotto = P[piano & (P[:, 2] > quota - 0.3) & (P[:, 2] < sof - 0.06), 2]
        cima = float(np.percentile(sotto, 98)) if len(sotto) > 10 else quota
        if alto >= 0.3 or cima > sof - 0.2:
            esito[(k, i)] = "muro"
            continue
        # dietro (da uno dei due lati) un muro che arriva al soffitto
        dietro = False
        for verso in (1, -1):
            v = verso * P[:, 1]
            m = (v > 0.12) & (v < 1.0) & banda
            if not m.any():
                continue
            # il piano parallelo più pieno
            w = v[m]
            cont, bordi = np.histogram(w, bins=np.arange(0.12, 1.02, 0.03))
            j = int(np.argmax(cont))
            vicino = m & (np.abs(v - (bordi[j] + 0.015)) < 0.04)
            if _copertura(P[vicino, 0], 2 * max(L / 2 - 0.03, 0.02)) >= 0.5:
                dietro = True
                break
        esito[(k, i)] = "arredo" if dietro and L >= lung_min else "?"
    # i fianchi degli arredi (perpendicolari, senza punti in alto) seguono il fronte
    arr = {ki for ki, e in esito.items() if e == "arredo"}
    estremi_arr = [e for (a, b, k, i) in tratti if (k, i) in arr for e in (a, b)]
    if not estremi_arr:
        return arr
    E = np.array(estremi_arr)
    cambiato = True
    while cambiato:
        cambiato = False
        for a, b, k, i in tratti:
            if (k, i) in arr or esito.get((k, i)) != "?" or np.hypot(*(b - a)) > 1.2:
                continue
            if min(np.hypot(*(E - a).T).min(), np.hypot(*(E - b).T).min()) < 0.05:
                arr.add((k, i))
                E = np.vstack((E, a, b))
                cambiato = True
    return arr


def separa_arredi(poli, arr):
    """Mette nella categoria 'arredi' i tratti indicati (spezzando le polilinee)."""
    from .classifica import _dividi

    if not arr:
        return poli
    cat = []
    for k, p in enumerate(poli):
        if p.tipo == "cerchio":
            cat.append(None)
            continue
        n = len(p.punti) if p.chiusa else len(p.punti) - 1
        cat.append(["arredi" if (k, i) in arr else p.categoria for i in range(n)])
    return _dividi(poli, cat)


def punti_fuori_arredi(punti2d, poli, toll=0.04):
    """Punti della fetta che non stanno sulle linee degli arredi."""
    from scipy.spatial import cKDTree

    campioni = []
    for p in poli:
        if p.categoria != "arredi":
            continue
        c = p.campiona(0.01)
        if p.chiusa:
            c = np.vstack((c, c[:1]))
        for a, b in zip(c[:-1], c[1:]):
            n = max(1, int(np.hypot(*(b - a)) / 0.01))
            campioni.append(a + (b - a) * np.linspace(0, 1, n, endpoint=False)[:, None])
    if not campioni:
        return punti2d
    d, _ = cKDTree(np.vstack(campioni)).query(punti2d)
    return punti2d[d > toll]


def _fitti(u, raggio=0.02, minimo=5):
    """Valori con almeno 'minimo' vicini entro 'raggio' (scarta i riflessi sparsi)."""
    if len(u) < minimo:
        return u[:0]
    u = np.sort(u)
    n = np.searchsorted(u, u + raggio) - np.searchsorted(u, u - raggio)
    return u[n >= minimo]


def vani_una_faccia(poli, nv, quota, aperture, g_min=0.45, g_max=3.5):
    """Vani visti da un solo lato (muri esterni rilevati solo da dentro): un
    buco in una linea di muro, o una chiusura, dove nella nuvola 3D sopra c'è
    l'architrave e sotto il davanzale o il pavimento, e davanti non c'è un
    mobile che nasconda il muro. Restituisce (nuove aperture, chiusure da
    togliere come insieme di indici di polilinea)."""
    from .classifica import profilo_vano

    if nv is None:
        return [], set()
    tratti = _tratti_cat(poli, ("muri",))
    chius = [(a, b, k) for a, b, k, i in _tratti_cat(poli, ("chiusure",))]
    gia = [np.asarray(ap["c"]) for ap in aperture]
    candidati = []
    # buchi tra due tratti allineati che si guardano
    E = []
    for n, (a, b, k, i) in enumerate(tratti):
        L = float(np.hypot(*(b - a)))
        if L < 0.05:
            continue
        d = (b - a) / L
        E.append((a, -d, n))
        E.append((b, d, n))
    for x in range(len(E)):
        e1, o1, n1 = E[x]
        nrm = np.array([-o1[1], o1[0]])
        migliore = None
        for y in range(len(E)):
            e2, o2, n2 = E[y]
            if n2 == n1 or o1 @ o2 > -0.999:
                continue
            g = float((e2 - e1) @ o1)
            if g_min <= g <= g_max and abs((e2 - e1) @ nrm) < 0.03 and (migliore is None or g < migliore[0]):
                migliore = (g, e2)
        if migliore is not None and x < len(E):
            candidati.append((e1, migliore[1], None))
    for a, b, k in chius:
        if g_min <= np.hypot(*(b - a)) <= g_max:
            candidati.append((a, b, k))
    # tolti i doppioni e i vani già trovati
    unici = []
    for p, q, k in candidati:
        c = (p + q) / 2
        if any(np.hypot(*(c - g)) < 0.3 for g in gia) or any(np.hypot(*(c - (u[0] + u[1]) / 2)) < 0.1 for u in unici):
            continue
        unici.append((p, q, k))
    if not unici:
        return [], set()
    scatole = []
    for p, q, _ in unici:
        g = float(np.hypot(*(q - p)))
        t = (q - p) / g
        scatole.append(dict(c=(p + q) / 2, t=t, hu=max(0.05, g / 2 - 0.04), hv=1.0, z0=quota - 4, z1=quota + 4))
        scatole.append(dict(c=(p + q) / 2, t=t, hu=g / 2 + 0.6, hv=1.8, z0=quota - 4, z1=quota + 4))
    pts = nv.scatole(scatole)
    nuove, togliere = [], set()
    for n, (p, q, k) in enumerate(unici):
        vano, intorno = pts[2 * n], pts[2 * n + 1]
        g = float(np.hypot(*(q - p)))
        t = (q - p) / g
        if len(vano) < 20:
            continue
        # da che parte sta il muro: dove ci sono i punti sopra il buco (architrave)
        sopra = vano[(vano[:, 2] > quota + 0.3) & (vano[:, 2] < quota + 2.0) & (np.abs(vano[:, 1]) < 0.9)]
        if len(sopra) < 10:
            continue
        lato = 1.0 if np.median(sopra[:, 1]) >= 0 else -1.0
        # un mobile davanti al buco (dal lato della stanza): punti alla quota di taglio
        davanti = vano[(np.abs(vano[:, 2] - quota) < 0.25) & (lato * vano[:, 1] < -0.06)]
        if len(davanti) > 0.5 * g / 0.01:
            continue
        # profilo: solo lo spessore del muro e la parte centrale del buco (le
        # spallette strombate stanno ai lati)
        vano_tutto = vano
        vano = vano[(lato * vano[:, 1] > -0.05) & (lato * vano[:, 1] < 0.9) & (np.abs(vano[:, 0]) < max(0.1, 0.3 * g))]
        intorno = intorno[np.abs(intorno[:, 1]) > 0.7]
        pr = profilo_vano(vano, intorno, quota)
        if pr is None:
            continue
        sof = pr["soffitto"]
        if sof is not None and pr["superiore"] > sof - 0.08:
            continue  # vuoto fino al soffitto: non è un vano
        if pr["superiore"] - quota < 0.15 or quota - pr["inferiore"] < 0.15:
            continue
        # spessore e lato del muro dai punti dell'architrave (sotto la sua faccia)
        arch = vano[np.abs(vano[:, 2] - pr["superiore"]) < 0.04]
        if len(arch) < 10:
            continue
        v = arch[:, 1]
        sp = float(np.clip(np.percentile(np.abs(v), 95), 0.1, 0.9))
        nrm = np.array([-t[1], t[0]]) * lato
        c = (p + q) / 2 + nrm * sp / 2
        terra = pr["pavimento"] if pr["pavimento"] is not None else pr["base"]
        dav = max(0.0, pr["inferiore"] - terra)
        # luce netta: il punto più stretto del vano nello spessore del muro
        # (con le spallette strombate è più stretta dell'apertura interna)
        luce, u0, u1 = g, -g / 2, g / 2
        fetta = vano_tutto[(np.abs(vano_tutto[:, 2] - quota) < 0.15)]
        fetta = fetta[(lato * fetta[:, 1] > 0.02) & (lato * fetta[:, 1] < sp)]
        for v0 in np.arange(0.02, sp, 0.05):
            m = (lato * fetta[:, 1] >= v0) & (lato * fetta[:, 1] < v0 + 0.05)
            sx, dx = _fitti(fetta[m & (fetta[:, 0] < 0), 0]), _fitti(fetta[m & (fetta[:, 0] > 0), 0])
            if len(sx) and len(dx) and dx.min() - sx.max() < luce:
                luce, u0, u1 = float(dx.min() - sx.max()), float(sx.max()), float(dx.min())
        mid = (p + q) / 2
        pe, qe = mid + t * u0 + nrm * sp, mid + t * u1 + nrm * sp
        # spallette: solo se nella pianta non c'è già un muro che parte dallo stipite
        spall = []
        for x, y in ((p, pe), (q, qe)):
            if not any(min(np.hypot(*(a - x)), np.hypot(*(b - x))) < 0.05 and
                       abs(((b - a) / max(np.hypot(*(b - a)), 1e-9)) @ nrm) > 0.3 for a, b, _, _ in tratti):
                spall.append((x, y))
        ap = dict(c=c, t=t, n=nrm, larghezza=luce, larghezza_interna=g, spessore=sp, una_faccia=True,
                  facce=((p, q), (pe, qe)), profilo=pr, spallette=tuple(spall),
                  davanzale=dav, altezza=pr["superiore"] - pr["inferiore"],
                  categoria="finestre" if dav > 0.15 else "porte")
        nuove.append(ap)
        if k is not None:
            togliere.add(k)
    return nuove, togliere


def oggetti_isolati(poli, nv, quota, lato_max=0.8):
    """Piccoli contorni isolati che non arrivano in alto (persone di
    passaggio, sedie, piante): vanno nella categoria 'altro'."""
    if nv is None:
        return poli
    cand = []
    estremi = [(k, e) for k, p in enumerate(poli) if p.tipo != "cerchio" for e in p.punti]
    for k, p in enumerate(poli):
        if p.categoria != "muri" or p.tipo == "cerchio" or np.ptp(p.punti, axis=0).max() > lato_max:
            continue
        vicino = any(k2 != k and np.min(np.hypot(*(p.punti - e).T)) < 0.05 for k2, e in estremi)
        if not vicino:
            cand.append(k)
    if not cand:
        return poli
    scatole = []
    for k in cand:
        P = poli[k].punti
        c = (P.min(axis=0) + P.max(axis=0)) / 2
        scatole.append(dict(c=c, t=(1.0, 0.0), hu=np.ptp(P[:, 0]) / 2 + 0.05, hv=np.ptp(P[:, 1]) / 2 + 0.05,
                            z0=quota - 3, z1=quota + 6))
    for k, P in zip(cand, nv.scatole(scatole)):
        sof = _soffitto(P[:, 2], quota) if len(P) else None
        alto = P[(P[:, 2] > quota) & (P[:, 2] < (sof - 0.1 if sof else quota + 6))] if len(P) else P
        cima = float(np.percentile(alto[:, 2], 98)) if len(alto) > 10 else quota
        if sof is not None and cima < sof - 0.5:
            poli[k].categoria = "altro"
    return poli
