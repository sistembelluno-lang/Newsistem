"""Motore per murature irregolari e storiche (chiese, archi, volte, colonne).

1. I punti della fetta vengono rasterizzati in una griglia fine; i piccoli
   buchi vengono chiusi e i puntini isolati eliminati.
2. Lo scheletro (assottigliamento Zhang-Suen) dà la linea centrale di ogni
   contorno rilevato.
3. Lo scheletro viene percorso e trasformato in percorsi ordinati; le
   piccole diramazioni dovute al rumore vengono potate.
4. Ogni percorso viene suddiviso nei tratti più lunghi possibile che restano
   entro la tolleranza: segmenti dove la muratura è dritta, archi dove è
   curva. Gli spigoli tra due segmenti vengono ricalcolati come intersezione.
"""

import numpy as np
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import minimum_spanning_tree
from scipy.spatial import cKDTree

from .geometria import Polilinea, bulge_da_cerchio, cerchio_ls, intersezione, passo_medio, retta_tls

MAX_CELLE = 40_000_000


# ---------------------------------------------------------------- raster
def _griglia(P, par):
    # la griglia non può essere più fine della distanza tra i punti,
    # altrimenti i contorni risultano bucherellati
    cella = max(par.tolleranza / 2, 0.004, 1.5 * passo_medio(P))
    mn = P.min(axis=0)
    est = P.max(axis=0) - mn
    while (est[0] / cella + 3) * (est[1] / cella + 3) > MAX_CELLE:
        cella *= 1.25
    k = np.floor((P - mn) / cella).astype(np.int64) + 1
    forma = (int(k[:, 1].max()) + 2, int(k[:, 0].max()) + 2)
    occ = np.zeros(forma, bool)
    occ[k[:, 1], k[:, 0]] = True
    # raggio di chiusura: copre anche le zone più rade (90° percentile del passo)
    raggio = int(np.clip(np.ceil(2 * passo_medio(P, percentile=90) / cella) + 1, 2, 8))
    return occ, mn, cella, raggio


def _pulisci(occ, cella, par, raggio=1):
    img = occ
    # chiude le piccole interruzioni tra i punti
    yy, xx = np.mgrid[-raggio : raggio + 1, -raggio : raggio + 1]
    disco = xx * xx + yy * yy <= raggio * raggio + raggio
    pad = raggio + 1
    img = np.pad(img, pad)
    img = ndimage.binary_closing(img, structure=disco)[pad:-pad, pad:-pad]
    img[0, :] = img[-1, :] = img[:, 0] = img[:, -1] = False
    # riempie i piccoli fori interni alle bande (non le stanze!)
    fori, n = ndimage.label(~img)
    if n:
        area = np.bincount(fori.ravel())
        lato = max(2.0, 2.5 * par.tolleranza / cella)
        piccoli = area < lato * lato
        piccoli[0] = False
        img |= piccoli[fori]
    # elimina i gruppi di punti troppo piccoli (rumore, oggetti isolati)
    lab, n = ndimage.label(img, structure=np.ones((3, 3), bool))
    if n:
        area = np.bincount(lab.ravel())
        minimo = max(4, int(par.lung_min / cella))
        tieni = area >= minimo
        tieni[0] = False
        img = tieni[lab]
    return img


def _solo_contorni(img, sk, cella, par):
    """Le zone piene (macchie di punti: arredi, vegetazione, superfici
    orizzontali tagliate dalla fetta) vengono sostituite dal loro contorno."""
    lab, n = ndimage.label(img, structure=np.ones((3, 3), bool))
    if not n:
        return img, False
    area = np.bincount(lab.ravel(), minlength=n + 1)
    lung = np.bincount(lab[sk], minlength=n + 1)
    spessore = area / np.maximum(lung, 1)
    massimo = max(6.0, 4 * par.tolleranza / cella)
    spessi = spessore > massimo
    spessi[0] = False
    if not spessi.any():
        return img, False
    zona = spessi[lab]
    bordo = zona & ~ndimage.binary_erosion(zona, structure=np.ones((3, 3), bool))
    return (img & ~zona) | bordo, True


def _scheletro(img):
    """Assottigliamento Zhang-Suen calcolato solo sui pixel accesi."""
    img = img.copy()
    while True:
        cambiato = False
        for passo in (0, 1):
            r, c = np.nonzero(img)
            if not len(r):
                return img
            p2 = img[r - 1, c]
            p3 = img[r - 1, c + 1]
            p4 = img[r, c + 1]
            p5 = img[r + 1, c + 1]
            p6 = img[r + 1, c]
            p7 = img[r + 1, c - 1]
            p8 = img[r, c - 1]
            p9 = img[r - 1, c - 1]
            vic = [p2, p3, p4, p5, p6, p7, p8, p9]
            B = sum(v.astype(np.uint8) for v in vic)
            A = sum(((~vic[i]) & vic[(i + 1) % 8]).astype(np.uint8) for i in range(8))
            if passo == 0:
                cond = ~(p2 & p4 & p6) & ~(p4 & p6 & p8)
            else:
                cond = ~(p2 & p4 & p8) & ~(p2 & p6 & p8)
            togli = (B >= 2) & (B <= 6) & (A == 1) & cond
            if togli.any():
                img[r[togli], c[togli]] = False
                cambiato = True
        if not cambiato:
            return img


# ---------------------------------------------------------------- grafo
def _percorsi(sk, lung_spina):
    """Percorsi ordinati (liste di indici di pixel) dallo scheletro.

    Albero ricoprente minimo sui pixel adiacenti (toglie i piccoli triangoli
    dello scheletro), potatura delle spine corte e ricucitura degli anelli.
    """
    r, c = np.nonzero(sk)
    n = len(r)
    if n < 2:
        return [], np.zeros((0, 2))
    xy = np.column_stack((c, r)).astype(np.float64)
    coppie = cKDTree(xy).query_pairs(1.5, output_type="ndarray")
    if not len(coppie):
        return [], xy
    w = np.hypot(*(xy[coppie[:, 0]] - xy[coppie[:, 1]]).T)
    g = coo_matrix((w, (coppie[:, 0], coppie[:, 1])), shape=(n, n))
    mst = minimum_spanning_tree(g).tocoo()
    adiac = [set() for _ in range(n)]
    for a, b in zip(mst.row, mst.col):
        adiac[a].add(b)
        adiac[b].add(a)

    def traccia():
        visti = set()
        out = []
        for v in range(n):
            if len(adiac[v]) in (0, 2):
                continue
            for u in adiac[v]:
                if (v, u) in visti:
                    continue
                seq = [v, u]
                visti.add((v, u))
                prec, cur = v, u
                while len(adiac[cur]) == 2:
                    nx = next(x for x in adiac[cur] if x != prec)
                    prec, cur = cur, nx
                    seq.append(cur)
                visti.add((cur, prec))
                out.append(seq)
        return out

    # ricuce subito gli anelli che l'albero ricoprente ha aperto (due foglie
    # adiacenti), prima della potatura che altrimenti allargherebbe il taglio
    foglie = [v for v in range(n) if len(adiac[v]) == 1]
    if len(foglie) > 1:
        for a, b in cKDTree(xy[foglie]).query_pairs(1.5):
            va, vb = foglie[a], foglie[b]
            adiac[va].add(vb)
            adiac[vb].add(va)

    # potatura delle spine (rami corti che finiscono nel vuoto)
    for _ in range(3):
        tolto = False
        for seq in traccia():
            a, b = seq[0], seq[-1]
            foglia_a, foglia_b = len(adiac[a]) == 1, len(adiac[b]) == 1
            if foglia_a == foglia_b:  # due foglie (tratto isolato) o due nodi
                continue
            if len(seq) - 1 < lung_spina:
                da_togliere = seq[:-1] if foglia_a else seq[1:]
                for v in da_togliere:
                    for u in list(adiac[v]):
                        adiac[u].discard(v)
                    adiac[v].clear()
                tolto = True
        if not tolto:
            break

    percorsi = traccia()
    # anelli senza nodi di diramazione
    coperti = {v for s in percorsi for v in s}
    for v in range(n):
        if v in coperti or len(adiac[v]) != 2:
            continue
        seq = [v]
        prec, cur = v, next(iter(adiac[v]))
        while cur != v:
            seq.append(cur)
            coperti.add(cur)
            nx = [x for x in adiac[cur] if x != prec]
            if not nx:
                break
            prec, cur = cur, nx[0]
        coperti.add(v)
        if cur == v:
            seq.append(v)
        percorsi.append(seq)
    return percorsi, xy


# ---------------------------------------------------------------- adattamento
def _scarto_retta(p):
    a, b = p[0], p[-1]
    d = b - a
    L = np.hypot(*d)
    if L < 1e-9:
        return float(np.max(np.hypot(*(p - a).T)))
    return float(np.max(np.abs((p - a) @ np.array([-d[1], d[0]]) / L)))


def _arco(p, tol):
    """Cerchio che passa per p entro tol, o None."""
    fit = cerchio_ls(p)
    if fit is None:
        return None
    centro, r = fit
    # raggi troppo piccoli sono spigoli arrotondati dal rilievo, non archi
    if r > 200 or r < max(0.08, 5 * tol):
        return None
    # l'arco deve essere lungo almeno quanto un tratto minimo
    if np.sum(np.hypot(*np.diff(p, axis=0).T)) < max(0.1, 6 * tol):
        return None
    if np.max(np.abs(np.hypot(*(p - centro).T) - r)) > tol:
        return None
    return centro, r


def _piu_lungo(i, n, ok):
    """Massimo j > i con ok(i, j) (ricerca per raddoppio e bisezione)."""
    lo, passo = i + 1, 1
    while True:
        j = min(n - 1, i + passo)
        if not ok(i, j):
            hi = j
            break
        lo = j
        if j == n - 1:
            return lo
        passo *= 2
    while hi - lo > 1:
        m = (lo + hi) // 2
        if ok(i, m):
            lo = m
        else:
            hi = m
    return lo


def _modello(q, tol, archi):
    """Miglior modello per i punti q entro tol: ('retta', None) o ('arco', centro) o None."""
    if _scarto_retta(q) <= tol:
        return "retta", None
    if archi and len(q) >= 5:
        fit = _arco(q, tol)
        if fit is not None:
            return "arco", fit[0]
    return None


def _residuo(q, tipo):
    if len(q) < 3:
        return 0.0
    if tipo == "retta":
        c, t = retta_tls(q)
        return float(np.sum(((q - c) @ np.array([-t[1], t[0]])) ** 2))
    fit = cerchio_ls(q)
    if fit is None:
        return np.inf
    c, r = fit
    return float(np.sum((np.hypot(*(q - c).T) - r) ** 2))


def _segmenta(p, par):
    tol = par.tolleranza
    n = len(p)
    # 1) suddivisione fitta (metà tolleranza): i punti di rottura cadono
    #    vicino ai veri cambi di forma
    stretta = tol / 2
    tagli = [0]
    i = 0
    while i < n - 1:
        jl = _piu_lungo(i, n, lambda a, b: _scarto_retta(p[a : b + 1]) <= stretta)
        j = jl
        if par.archi and jl < n - 1:
            ja = _piu_lungo(i, n, lambda a, b: b - a < 4 or _arco(p[a : b + 1], stretta) is not None)
            if ja > jl + 2:
                j = ja
        tagli.append(j)
        i = j
    # 2) fusione dei pezzi vicini finché il risultato resta entro tolleranza
    cambiato = True
    while cambiato and len(tagli) > 2:
        cambiato = False
        migliore = None
        for k in range(1, len(tagli) - 1):
            q = p[tagli[k - 1] : tagli[k + 1] + 1]
            m = _modello(q, tol, par.archi)
            if m is None:
                continue
            costo = (0 if m[0] == "retta" else 1, len(q))
            if migliore is None or costo < migliore[0]:
                migliore = (costo, k)
        if migliore:
            del tagli[migliore[1]]
            cambiato = True
    # 3) modello di ogni pezzo e spostamento fine dei punti di rottura
    tipi = []
    for a, b in zip(tagli[:-1], tagli[1:]):
        m = _modello(p[a : b + 1], tol, par.archi)
        tipi.append(m[0] if m else "retta")
    for k in range(1, len(tagli) - 1):
        a, m0, b = tagli[k - 1], tagli[k], tagli[k + 1]
        if tipi[k - 1] == tipi[k] == "retta":
            continue  # lo spigolo viene ricalcolato per intersezione
        w = max(1, min(m0 - a, b - m0) // 2)
        meglio, best = m0, np.inf
        for m in range(m0 - w, m0 + w + 1):
            if m - a < 2 or b - m < 2:
                continue
            r = _residuo(p[a : m + 1], tipi[k - 1]) + _residuo(p[m : b + 1], tipi[k])
            if r < best:
                meglio, best = m, r
        tagli[k] = meglio
    pezzi = []
    for (a, b), tipo in zip(zip(tagli[:-1], tagli[1:]), tipi):
        centro = None
        if tipo == "arco":
            fit = cerchio_ls(p[a : b + 1])
            if fit is None:
                tipo = "retta"
            else:
                centro = fit[0]
        pezzi.append((a, b, tipo, centro))
    return pezzi


def _ruota_inizio(q, passo):
    """Per un percorso chiuso: inizia dal punto di massima svolta (uno spigolo)."""
    n = len(q)
    w = max(2, min(n // 6, passo))
    a = q - np.roll(q, w, axis=0)
    b = np.roll(q, -w, axis=0) - q
    cos = np.einsum("ij,ij->i", a, b) / (np.hypot(*a.T) * np.hypot(*b.T) + 1e-12)
    return np.roll(q, -int(np.argmin(cos)), axis=0)


def _a_polilinea(p, pezzi, par, chiusa):
    el = []
    for (i, j, tipo, centro) in pezzi:
        if tipo == "retta":
            retta = retta_tls(p[i + 2 : j - 1]) if j - i >= 6 else None
            if retta is None:
                d = p[j] - p[i]
                retta = (p[i].copy(), d / max(np.hypot(*d), 1e-12))
        else:
            retta = None
        el.append({"a": p[i].copy(), "b": p[j].copy(), "tipo": tipo, "centro": centro,
                   "medio": p[(i + j) // 2].copy(), "retta": retta})

    def lung(e):
        return float(np.hypot(*(e["b"] - e["a"])))

    def vicini(k):
        m = len(el)
        if chiusa and m >= 3:
            return (k - 1) % m, (k + 1) % m
        if 0 < k < m - 1:
            return k - 1, k + 1
        return None

    soglia = max(par.unisci_spigoli, 4 * par.tolleranza)
    min_sin = np.sin(np.radians(20))
    # tratti cortissimi tra due rette: smussi dovuti al rilievo sullo spigolo
    cambiato = True
    while cambiato:
        cambiato = False
        for k, e in enumerate(el):
            v = vicini(k)
            if v is None or e["tipo"] != "retta" or lung(e) > soglia:
                continue
            ep, en = el[v[0]], el[v[1]]
            if ep["tipo"] != "retta" or en["tipo"] != "retta":
                continue
            (c1, d1), (c2, d2) = ep["retta"], en["retta"]
            seno = abs(d1[0] * d2[1] - d1[1] * d2[0])
            if seno >= min_sin:
                x = intersezione(c1, d1, c2, d2)
                if x is None or np.hypot(*(x - e["a"])) > soglia or np.hypot(*(x - e["b"])) > soglia:
                    continue
                ep["b"] = x
                en["a"] = x
            elif abs((c2 - c1) @ np.array([-d1[1], d1[0]])) <= par.tolleranza and seno < np.sin(np.radians(3)):
                # due tratti allineati separati da un gradino minimo
                ep["b"] = en["a"] = (e["a"] + e["b"]) / 2
            else:
                continue
            del el[k]
            cambiato = True
            break
    # spigoli tra due rette: intersezione delle rette ai minimi quadrati
    m = len(el)
    for k in (range(m) if chiusa and m >= 3 else range(1, m)):
        e1, e2 = el[k - 1], el[k]
        if e1["tipo"] != "retta" or e2["tipo"] != "retta":
            continue
        (c1, d1), (c2, d2) = e1["retta"], e2["retta"]
        if abs(d1[0] * d2[1] - d1[1] * d2[0]) < min_sin:
            continue
        x = intersezione(c1, d1, c2, d2)
        if x is not None and np.hypot(*(x - e2["a"])) <= soglia:
            e1["b"] = x
            e2["a"] = x
    vert = [el[0]["a"]] + [e["b"] for e in el]
    bulge = [bulge_da_cerchio(e["a"], e["b"], e["centro"], e["medio"]) if e["tipo"] == "arco" else 0.0
             for e in el]
    if chiusa:
        vert = vert[:-1]
    else:
        bulge.append(0.0)
    tipo = "curva" if any(bulge) else "linea"
    return Polilinea(np.array(vert), np.array(bulge), chiusa=chiusa, tipo=tipo)


def _liscia(p, chiusa, finestra=5):
    if len(p) < finestra + 2:
        return p
    k = np.ones(finestra) / finestra
    h = finestra // 2
    if chiusa:
        est = np.vstack((p[-h:], p, p[:h]))
        return np.column_stack([np.convolve(est[:, d], k, "valid") for d in range(2)])
    out = p.copy()
    for d in range(2):
        out[h:-h, d] = np.convolve(p[:, d], k, "valid")
    return out


def _unisci_estremi(percorsi, d_max):
    """Collega le estremità libere vicine (interruzioni del rilievo)."""
    aperti = [i for i, (q, ch) in enumerate(percorsi) if not ch and len(q) >= 2]
    if not aperti:
        return percorsi
    est = np.array([percorsi[i][0][k] for i in aperti for k in (0, -1)])
    coppie = cKDTree(est).query_pairs(d_max, output_type="ndarray")
    if not len(coppie):
        return percorsi
    dist = np.hypot(*(est[coppie[:, 0]] - est[coppie[:, 1]]).T)
    legame = {}
    for o in np.argsort(dist):
        a, b = map(int, coppie[o])
        if a // 2 == b // 2 and len(percorsi[aperti[a // 2]][0]) < 4:
            continue
        if a in legame or b in legame:
            continue
        legame[a] = b
        legame[b] = a
    # ricompone le catene: ogni percorso aperto ha estremi 2i e 2i+1
    visto = set()
    nuovi = [percorsi[i] for i in range(len(percorsi)) if i not in set(aperti)]
    for start in range(len(aperti)):
        if start in visto:
            continue
        # risale fino a un capo libero (o fa il giro di un anello)
        cur, capo = start, 2 * start
        giri = 0
        while (capo in legame) and giri <= len(aperti):
            altro = legame[capo]
            cur = altro // 2
            capo = altro ^ 1
            giri += 1
            if cur == start:
                break
        # ora capo è l'estremo libero (o l'anello): percorre in avanti
        anello = cur == start and giri > 0 and (2 * start) in legame
        inizio = start if anello else cur
        ingresso = (2 * start) if anello else capo
        pezzi = []
        cur, entrata = inizio, ingresso
        while True:
            visto.add(cur)
            q = percorsi[aperti[cur]][0]
            pezzi.append(q if entrata % 2 == 0 else q[::-1])
            uscita = entrata ^ 1
            if uscita not in legame:
                break
            nxt = legame[uscita]
            if nxt // 2 in visto:
                break
            cur, entrata = nxt // 2, nxt
        nuovi.append((np.vstack(pezzi), anello))
    return nuovi


def estrai(P, par, annulla=None):
    if len(P) < 10:
        return []
    occ, mn, cella, raggio = _griglia(P, par)
    img = _pulisci(occ, cella, par, raggio)
    sk = _scheletro(img)
    img, cambiato = _solo_contorni(img, sk, cella, par)
    if cambiato:
        sk = _scheletro(img)
    if annulla and annulla():
        from .nuvola import Annullato
        raise Annullato()
    # le spine (rametti laterali dello scheletro) nascono dallo spessore della
    # banda di punti: vanno potate fino a qualche volta il raggio di chiusura
    spina = max(3, int(round(max(par.lung_min, 3 * par.tolleranza) / cella)), 3 * raggio)
    percorsi, xy = _percorsi(sk, spina)
    # coordinate reali al centro delle celle
    reali = []
    for seq in percorsi:
        chiusa = len(seq) > 3 and seq[0] == seq[-1]
        q = xy[seq[:-1] if chiusa else seq]
        q = (q - 1 + 0.5) * cella + mn
        reali.append((q, chiusa))
    reali = _unisci_estremi(reali, par.chiudi_buchi)
    out = []
    for q, chiusa in reali:
        if len(q) < 2:
            continue
        q = _liscia(q, chiusa)
        lung = float(np.sum(np.hypot(*np.diff(q, axis=0).T)))
        if lung < par.lung_min:
            continue
        if chiusa and par.archi:
            fit = _arco(q, par.tolleranza)
            if fit is not None:
                c, r = fit
                out.append(Polilinea([c + (r, 0), c - (r, 0)], [1.0, 1.0], chiusa=True, tipo="cerchio"))
                continue
        if chiusa:
            passo = int(max(0.15, 5 * par.tolleranza) / cella)
            q = _ruota_inizio(q, passo)
            q = np.vstack((q, q[:1]))
        pezzi = _segmenta(q, par)
        if pezzi:
            out.append(_a_polilinea(q, pezzi, par, chiusa))
    return out
