"""Motore per murature dritte.

1. Ricerca dei segmenti con RANSAC (campionamento locale, ogni retta viene
   divisa dove i punti si interrompono).
2. Regolarizzazione delle direzioni: linee quasi parallele rese parallele e,
   se richiesto, angoli quasi retti portati a 90°.
3. Fusione dei tratti allineati separati da piccoli buchi.
4. Unione negli spigoli: le linee vengono allungate o accorciate fino
   all'intersezione con quella vicina (angoli a L e innesti a T).
5. Concatenazione in polilinee (chiuse quando formano un perimetro).
"""

import numpy as np
from scipy.spatial import cKDTree

from .geometria import catene, intersezione, passo_medio, retta_tls, sottocampiona


class _Seg:
    __slots__ = ("idx", "c", "t", "a", "b")

    def __init__(self, idx, c, t, Q):
        self.idx = idx
        self.imposta(c, t, Q)

    def imposta(self, c, t, Q):
        t = t / np.hypot(*t)
        if t[0] < 0 or (t[0] == 0 and t[1] < 0):
            t = -t
        self.c, self.t = c, t
        s = (Q[self.idx] - c) @ t
        self.a = c + s.min() * t
        self.b = c + s.max() * t

    @property
    def n(self):
        return np.array([-self.t[1], self.t[0]])

    def lung(self):
        return float(np.hypot(*(self.b - self.a)))

    def angolo(self):
        return float(np.arctan2(self.t[1], self.t[0]) % np.pi)


def _gruppi_contigui(s, buco):
    """Indici (in ordine di s) dei gruppi separati da salti > buco."""
    ordine = np.argsort(s)
    ss = s[ordine]
    tagli = np.flatnonzero(np.diff(ss) > buco) + 1
    return np.split(ordine, tagli)


def _e_superficie(seg, Q, tol):
    """Vero se i punti stanno su una linea netta e non in una macchia
    (arredi, persone, vegetazione): accanto a un muro, appena fuori dalla
    tolleranza, ci sono pochi punti."""
    rel = Q - seg.a
    L = seg.lung()
    u = rel @ seg.t * (1 if (seg.b - seg.a) @ seg.t >= 0 else -1)
    v = np.abs(rel @ seg.n)
    lungo = (u > 0) & (u < L)
    dentro = np.count_nonzero(lungo & (v < tol))
    fascia = np.count_nonzero(lungo & (v > 1.5 * tol) & (v < 3 * tol))
    return fascia < 0.5 * max(dentro, 1)


def _ransac(Q, par, annulla):
    tol = par.tolleranza
    # passo reale tra i punti (dopo il sottocampionamento): con nuvole rade
    # servono meno punti per riconoscere un tratto
    passo = passo_medio(Q)
    cella = max(tol / 2, 0.003, passo)
    min_pt = max(5, int(0.4 * par.lung_min / cella))
    # nelle nuvole rade anche le interruzioni casuali sono più lunghe
    buco = max(par.chiudi_buchi, 8 * passo)
    raggio = max(0.25, 2 * par.lung_min)
    albero = cKDTree(Q)
    attivo = np.ones(len(Q), bool)
    rng = np.random.default_rng(7)
    segmenti = []
    falliti = 0
    while attivo.sum() >= min_pt and len(segmenti) < 5000 and falliti < 30:
        if annulla and annulla():
            from .nuvola import Annullato
            raise Annullato()
        idx_att = np.flatnonzero(attivo)
        Qa = Q[idx_att]
        # i candidati si valutano su al massimo 40.000 punti: con fette da
        # milioni di punti il costo resta contenuto
        if len(idx_att) > 40_000:
            sub = rng.choice(len(idx_att), 40_000, replace=False)
            frazione = 40_000 / len(idx_att)
        else:
            sub = np.arange(len(idx_att))
            frazione = 1.0
        Qs = Qa[sub]
        buco_s = max(buco, 4 * cella / frazione)
        soglia_s = (min_pt - 1) * frazione
        miglior, miglior_pt = None, soglia_s
        iterazioni = 150 if len(idx_att) > 2000 else 80
        for _ in range(iterazioni):
            i = idx_att[rng.integers(len(idx_att))]
            vicini = [j for j in albero.query_ball_point(Q[i], raggio) if attivo[j] and j != i]
            if not vicini:
                continue
            j = vicini[rng.integers(len(vicini))]
            d = Q[j] - Q[i]
            ln = np.hypot(*d)
            if ln < 2 * cella:
                continue
            d = d / ln
            nrm = np.array([-d[1], d[0]])
            dentro = np.abs((Qs - Q[i]) @ nrm) < tol
            if dentro.sum() <= miglior_pt:
                continue
            s = (Qs[dentro] - Q[i]) @ d
            gruppi = _gruppi_contigui(s, buco_s)
            g = max(gruppi, key=len)
            if len(g) > miglior_pt:
                miglior_pt = len(g)
                miglior = idx_att[sub[np.flatnonzero(dentro)[g]]]
        if miglior is None or len(miglior) < 2:
            break
        # raffinamento: retta ai minimi quadrati e nuovo calcolo dei punti
        for _ in range(2):
            c, t = retta_tls(Q[miglior])
            nrm = np.array([-t[1], t[0]])
            dentro = np.abs((Qa - c) @ nrm) < tol
            if dentro.sum() < min_pt:
                break
            s = (Qa[dentro] - c) @ t
            gruppi = _gruppi_contigui(s, buco)
            sel = [idx_att[np.flatnonzero(dentro)[g]] for g in gruppi]
            # il gruppo che contiene la maggior parte del candidato iniziale
            insieme = set(miglior.tolist())
            miglior = max(sel, key=lambda x: len(insieme.intersection(x.tolist())))
        accettato = False
        c, t = retta_tls(Q[miglior])
        seg = _Seg(miglior, c, t, Q)
        if seg.lung() >= par.lung_min and len(miglior) >= min_pt and _e_superficie(seg, Q, tol):
            segmenti.append(seg)
            accettato = True
        attivo[miglior] = False
        falliti = 0 if accettato else falliti + 1
    return segmenti, buco


def _regolarizza(segmenti, Q, par):
    if not segmenti or not (par.allinea or par.squadra):
        return
    periodo = np.pi / 2 if par.squadra else np.pi
    tol = np.radians(max(par.tol_angolo, 0.1))
    ordinati = sorted(segmenti, key=lambda s: -s.lung())
    ang = np.array([s.angolo() for s in ordinati])
    lun = np.array([s.lung() for s in ordinati])
    libero = np.ones(len(ordinati), bool)
    for k in range(len(ordinati)):
        if not libero[k]:
            continue
        diff = (ang - ang[k] + periodo / 2) % periodo - periodo / 2
        gruppo = np.flatnonzero(libero & (np.abs(diff) <= tol))
        libero[gruppo] = False
        # direzione media pesata sulle lunghezze
        media = float(np.sum(lun[gruppo] * diff[gruppo]) / lun[gruppo].sum())
        for g in gruppo:
            s = ordinati[g]
            nuovo = ang[g] - diff[g] + media
            s.imposta(Q[s.idx].mean(axis=0), np.array([np.cos(nuovo), np.sin(nuovo)]), Q)


def _campioni(segmenti, passo):
    """Punti lungo i segmenti (per cercare i vicini con un albero KD)."""
    pts, quale = [], []
    for i, s in enumerate(segmenti):
        n = max(2, int(np.ceil(s.lung() / passo)) + 1)
        f = np.linspace(0, 1, n)[:, None]
        pts.append(s.a + (s.b - s.a) * f)
        quale.append(np.full(n, i))
    return np.vstack(pts), np.concatenate(quale)


def _fondi(segmenti, Q, par, buco):
    """Unisce tratti sulla stessa retta separati da buchi piccoli."""
    tol = par.tolleranza
    for _ in range(3):
        if len(segmenti) < 2:
            return segmenti
        pts, quale = _campioni(segmenti, max(buco, 0.05))
        albero = cKDTree(pts)
        padre = list(range(len(segmenti)))

        def radice(x):
            while padre[x] != x:
                padre[x] = padre[padre[x]]
                x = padre[x]
            return x

        unito = False
        raggio = buco + max(buco, 0.05)
        for i, si in enumerate(segmenti):
            vicini = set()
            for e in (si.a, si.b):
                vicini.update(quale[albero.query_ball_point(e, raggio)].tolist())
            for j in vicini:
                if j <= i:
                    continue
                sj = segmenti[j]
                if abs(si.t @ sj.n) > np.sin(np.radians(1.0)):
                    continue
                if abs((sj.c - si.c) @ si.n) > tol or abs((si.c - sj.c) @ sj.n) > tol:
                    continue
                ai, bi = sorted(((si.a - si.c) @ si.t, (si.b - si.c) @ si.t))
                aj, bj = sorted(((sj.a - si.c) @ si.t, (sj.b - si.c) @ si.t))
                if max(aj - bi, ai - bj) > buco:
                    continue
                ri, rj = radice(i), radice(j)
                if ri != rj:
                    padre[rj] = ri
                    unito = True
        if not unito:
            return segmenti
        gruppi = {}
        for i in range(len(segmenti)):
            gruppi.setdefault(radice(i), []).append(segmenti[i])
        nuovi = []
        for g in gruppi.values():
            if len(g) == 1:
                nuovi.append(g[0])
                continue
            capo = max(g, key=lambda s: s.lung())
            idx = np.concatenate([s.idx for s in g])
            t = capo.t if (par.allinea or par.squadra) else retta_tls(Q[idx])[1]
            capo.idx = idx
            capo.imposta(Q[idx].mean(axis=0), t, Q)
            nuovi.append(capo)
        segmenti = nuovi
    return segmenti


def _unisci_spigoli(segmenti, par):
    d_max = par.unisci_spigoli
    min_sin = np.sin(np.radians(15))
    candidati = []
    if len(segmenti) < 2:
        return
    passo = max(d_max, 0.05)
    pts, quale = _campioni(segmenti, passo)
    albero = cKDTree(pts)
    for i, s in enumerate(segmenti):
        for k, e in enumerate((s.a, s.b)):
            vicini = set(quale[albero.query_ball_point(e, d_max + passo)].tolist())
            for j in vicini:
                t = segmenti[j]
                if i == j or abs(s.t[0] * t.t[1] - s.t[1] * t.t[0]) < min_sin:
                    continue
                x = intersezione(s.c, s.t, t.c, t.t)
                if x is None:
                    continue
                dist = float(np.hypot(*(x - e)))
                if dist > d_max:
                    continue
                # x deve stare sul segmento t o poco oltre i suoi estremi
                ta = (t.a - t.c) @ t.t
                tb = (t.b - t.c) @ t.t
                tx = (x - t.c) @ t.t
                if tx < min(ta, tb) - d_max or tx > max(ta, tb) + d_max:
                    continue
                # non deve "rovesciare" il segmento s
                altro = s.b if k == 0 else s.a
                if np.hypot(*(x - altro)) < 0.5 * s.lung():
                    continue
                candidati.append((dist, i, k, j, x))
    candidati.sort(key=lambda c: c[0])
    fisso = set()
    for dist, i, k, j, x in candidati:
        if (i, k) in fisso:
            continue
        s, t = segmenti[i], segmenti[j]
        if k == 0:
            s.a = x
        else:
            s.b = x
        fisso.add((i, k))
        # se x è vicino a un estremo libero di t, chiude l'angolo a L
        for kt, et in enumerate((t.a, t.b)):
            if (j, kt) not in fisso and np.hypot(*(et - x)) <= d_max:
                altro = t.b if kt == 0 else t.a
                if np.hypot(*(x - altro)) >= 0.5 * t.lung():
                    if kt == 0:
                        t.a = x
                    else:
                        t.b = x
                    fisso.add((j, kt))
                break


def _innesti_a_t(segmenti):
    """Spezza le linee nei punti dove arriva un'altra linea (innesto a T),
    così nel DXF i tratti si toccano esattamente."""
    if not segmenti:
        return []
    estremi = np.array([e for s in segmenti for e in (s.a, s.b)])
    out = []
    for s in segmenti:
        L = s.lung()
        if L <= 0:
            continue
        d = (s.b - s.a) / L
        rel = estremi - s.a
        u = rel @ d
        v = rel @ np.array([-d[1], d[0]])
        sel = (u > 1e-6) & (u < L - 1e-6) & (np.abs(v) < 1e-6)
        punti = [s.a] + [s.a + x * d for x in np.unique(u[sel])] + [s.b]
        for p, q in zip(punti[:-1], punti[1:]):
            out.append((p, q))
    return out


def estrai(P, par, annulla=None):
    """Da punti 2D (n, 2) a lista di Polilinea."""
    if len(P) < 10:
        return []
    Q = sottocampiona(P, max(par.tolleranza / 2, 0.003))
    segmenti, buco = _ransac(Q, par, annulla)
    _regolarizza(segmenti, Q, par)
    segmenti = _fondi(segmenti, Q, par, buco)
    _unisci_spigoli(segmenti, par)
    segmenti = [s for s in segmenti if s.lung() >= par.lung_min * 0.5]
    linee = _innesti_a_t(segmenti)
    poli = catene(linee)
    for p in poli:
        p.tipo = "linea"
    return poli
