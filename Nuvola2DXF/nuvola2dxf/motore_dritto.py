"""Motore per murature dritte.

1. Ricerca dei segmenti con RANSAC (campionamento locale, ogni retta viene
   divisa dove i punti si interrompono).
2. Regolarizzazione delle direzioni: linee quasi parallele rese parallele e,
   se richiesto, angoli quasi retti portati a 90°.
3. Fusione dei tratti allineati separati da piccoli buchi.
4. Unione negli spigoli: le linee vengono allungate o accorciate fino
   all'intersezione con quella vicina (angoli a L e innesti a T).
5. Chiusura di ciò che resta aperto: spallette e testate dei muri (le due
   facce che finiscono alla stessa altezza), angoli nascosti da mobili,
   buchi lungo i muri e innesti mancanti. Le chiusure oltre i 10 cm vanno
   in un layer a parte, da verificare.
6. Concatenazione in polilinee (chiuse quando formano un perimetro).
"""

import numpy as np
from scipy.spatial import cKDTree

from .geometria import catene, intersezione, passo_medio, retta_tls, semplifica, sottocampiona


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
    (arredi, persone, vegetazione): accanto alla linea, appena fuori dalla
    tolleranza, ci sono pochi punti. Se quei punti formano a loro volta una
    linea parallela (l'altra faccia di una tavola o di un tavolato) quel
    lato conta come libero."""
    rel = Q - seg.a
    L = seg.lung()
    u = rel @ seg.t * (1 if (seg.b - seg.a) @ seg.t >= 0 else -1)
    v = rel @ seg.n
    lungo = (u > 0) & (u < L)
    dentro = np.count_nonzero(lungo & (np.abs(v) < tol))
    sporco = 0
    for verso in (1, -1):
        w = verso * v[lungo]
        w = w[(w > 1.5 * tol) & (w < 3 * tol)]
        if len(w) < 10:
            sporco += len(w)
            continue
        cont, _ = np.histogram(w, bins=np.arange(1.5 * tol, 3 * tol + tol / 4, tol / 4))
        # faccia parallela: i punti stanno quasi tutti in una fascia sottile
        # e coprono il tratto per buona parte della lunghezza
        if cont.max() + max(np.partition(cont, -2)[-2], 0) >= 0.7 * len(w) and len(w) > 0.3 * dentro:
            continue
        sporco += len(w)
    return sporco < 0.5 * max(dentro, 1)


def _cresci(Q, attivo, idx, tol, raggio, buco):
    """Allarga il gruppo di punti di una linea: oltre a quelli nella fascia
    di tolleranza prende anche quelli appena fuori (fino a 2 volte la
    tolleranza) che stanno entro 'raggio' da un punto già preso, cioè il
    rumore attorno al muro, che altrimenti genera trattini spuri."""
    c, t = retta_tls(Q[idx])
    nrm = np.array([-t[1], t[0]])
    s_idx = (Q[idx] - c) @ t
    s0, s1 = s_idx.min() - raggio, s_idx.max() + raggio
    rel = Q - c
    s = rel @ t
    cand = attivo & (np.abs(rel @ nrm) < 2 * tol) & (s > s0) & (s < s1)
    cand[idx] = False
    cand = np.flatnonzero(cand)
    preso = idx
    for _ in range(6):
        if not len(cand):
            break
        d, _ = cKDTree(Q[preso]).query(Q[cand], distance_upper_bound=raggio)
        nuovi = d <= raggio
        if not nuovi.any():
            break
        preso = np.concatenate((preso, cand[nuovi]))
        cand = cand[~nuovi]
    return preso


def _togli_isolati(Q, cella):
    """Elimina i punti isolati (riflessi, polvere, persone di passaggio).
    Il raggio segue la densità della fetta: nelle nuvole rade i punti di un
    muro sono distanti tra loro e non vanno scambiati per rumore."""
    if len(Q) < 50:
        return Q
    r = max(3 * cella, 4 * passo_medio(Q), 0.05)
    vicini = cKDTree(Q).query_ball_point(Q, r, return_length=True)
    tieni = vicini >= 2  # il punto stesso più almeno un vicino
    return Q[tieni] if tieni.sum() > 0.5 * len(Q) else Q


def _rifila(seg, Q, tol):
    """Toglie dagli estremi i gruppetti di punti staccati dal resto: sono
    la faccia perpendicolare che attraversa la fascia della linea (spigoli
    di tavole e muri sottili) e allungherebbero la linea oltre lo spigolo."""
    if len(seg.idx) < 20:
        return
    s = (Q[seg.idx] - seg.c) @ seg.t
    o = np.argsort(s)
    ss = s[o]
    passo = float(np.median(np.diff(ss))) if len(ss) > 1 else 0.0
    salto = max(8 * passo, 0.01)
    tieni = np.ones(len(ss), bool)
    for verso in (1, -1):
        d = np.diff(ss) if verso == 1 else -np.diff(ss[::-1])
        lim = np.flatnonzero(np.abs(ss - (ss[0] if verso == 1 else ss[-1])) <= 2.5 * tol)
        n = len(lim)
        if n and n < len(ss) - 1 and d[n - 1] > salto and n < 0.1 * len(ss):
            if verso == 1:
                tieni[:n] = False
            else:
                tieni[len(ss) - n:] = False
    if not tieni.all():
        seg.idx = seg.idx[o[tieni]]
        seg.imposta(seg.c, seg.t, Q)


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
    # punti vicini: entro questo raggio da un punto della linea ne fanno parte
    raggio_vicini = max(par.raggio, 1.5 * cella)
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
        miglior = _cresci(Q, attivo, miglior, tol, raggio_vicini, buco)
        accettato = False
        c, t = retta_tls(Q[miglior])
        seg = _Seg(miglior, c, t, Q)
        _rifila(seg, Q, tol)
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
                # a parità di distanza vince lo spigolo vero (a L): x vicino a
                # un estremo di t. Con le tavole sottili la faccia opposta è
                # a pochi centimetri e non deve "rubare" l'angolo
                fuori_t = max(0.0, min(abs(tx - ta), abs(tx - tb)))
                candidati.append((dist + fuori_t, i, k, j, x))
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


class _Tratto:
    """Tratto finale: estremi, categoria e se i punti lo confermano."""

    __slots__ = ("a", "b", "cat", "passo")

    def __init__(self, a, b, cat="muri", passo=0.0):
        self.a, self.b, self.cat = np.asarray(a, float).copy(), np.asarray(b, float).copy(), cat
        self.passo = passo  # distanza media tra i punti che lo sostengono

    def estremo(self, k):
        return self.a if k == 0 else self.b

    def sposta(self, k, x):
        if k == 0:
            self.a = np.asarray(x, float).copy()
        else:
            self.b = np.asarray(x, float).copy()

    def lung(self):
        return float(np.hypot(*(self.b - self.a)))

    def dir(self):
        L = self.lung()
        return (self.b - self.a) / L if L > 0 else np.array([1.0, 0.0])

    def fuori(self, k):
        """Direzione verso l'esterno dall'estremo k."""
        return self.dir() if k == 1 else -self.dir()


def _dist_punti_tratti(E, tratti):
    """Distanza di ogni punto di E da ogni tratto (matrice)."""
    A = np.array([t.a for t in tratti])
    B = np.array([t.b for t in tratti])
    AB = B - A
    L2 = np.maximum((AB ** 2).sum(axis=1), 1e-18)
    out = np.empty((len(E), len(tratti)))
    for i0 in range(0, len(E), 2000):
        P = E[i0:i0 + 2000, None, :]
        f = np.clip(((P - A) * AB).sum(axis=2) / L2, 0, 1)
        out[i0:i0 + 2000] = np.hypot(*(P - (A + f[..., None] * AB)).transpose(2, 0, 1))
    return out


def _liberi(tratti, eps=1e-4):
    """Estremi che non toccano nessun altro tratto: (indice tratto, 0|1)."""
    if not tratti:
        return []
    E = np.array([e for t in tratti for e in (t.a, t.b)])
    d = _dist_punti_tratti(E, tratti)
    propri = np.repeat(np.arange(len(tratti)), 2)
    d[np.arange(len(E)), propri] = np.inf
    return [(int(i // 2), int(i % 2)) for i in np.flatnonzero(d.min(axis=1) > eps)]


def _copertura(Q, albero, a, b, tol, passo=0.02):
    """Frazione del tratto a-b sostenuta da punti della nuvola."""
    L = float(np.hypot(*(b - a)))
    n = max(2, int(np.ceil(L / passo)))
    f = (np.arange(n) + 0.5) / n
    campioni = a + (b - a) * f[:, None]
    d, _ = albero.query(campioni, distance_upper_bound=max(tol, passo))
    return float(np.mean(np.isfinite(d)))


def _solido(t, allungamento):
    """Un tratto si allunga al massimo di quanto è lungo: i trattini (arredi,
    rumore) non devono chiudere niente."""
    return t.lung() >= 0.25 and allungamento <= max(t.lung(), 0.3)


def _vani_gemelli(tratti, tol, g_min=0.45, g_max=3.5, w_min=0.05, w_max=0.8):
    """Trova i vani (porte, finestre, passaggi) come buchi nello stesso punto
    su due facce parallele di un muro e li sistema: estremi allineati sugli
    stipiti e spallette tra le facce. Modifica 'tratti' sul posto."""
    sin_par = np.sin(np.radians(3))
    # stretto: un'anta chiusa (4 cm dentro il filo del muro) non deve
    # sembrare la prosecuzione della faccia
    allineato = max(1.5 * tol, 0.02)
    n0 = len(tratti)
    fatti = set()
    for i in range(n0):
        ti = tratti[i]
        if ti.lung() < 0.2:
            continue
        d = ti.dir()
        nrm = np.array([-d[1], d[0]])
        for ki in (0, 1):
            if (i, ki) in fatti:
                continue
            e = ti.estremo(ki)
            o = ti.fuori(ki)
            # tratti paralleli: posizione lungo o (u) e di lato (v) rispetto a e
            info = []
            for j in range(n0):
                tj = tratti[j]
                if j == i or tj.lung() < 0.1:
                    continue
                dj = tj.dir()
                if abs(d[0] * dj[1] - d[1] * dj[0]) > sin_par:
                    continue
                ua, ub = sorted(((tj.a - e) @ o, (tj.b - e) @ o))
                v = float(((tj.a + tj.b) / 2 - e) @ nrm)
                info.append((j, ua, ub, v))
            # prosecuzione sulla stessa linea oltre il buco
            avanti = [(ua, j) for j, ua, ub, v in info if abs(v) < allineato and ua > -0.02]
            if not avanti:
                continue
            g, j = min(avanti)
            if not (g_min <= g <= g_max) or (j, 0) in fatti or (j, 1) in fatti:
                continue
            # faccia gemella: tratti alla stessa distanza w, con il buco nello stesso punto
            for lato in (1, -1):
                gem = [(j2, ua, ub, v) for j2, ua, ub, v in info if w_min <= lato * v <= w_max]
                if not gem:
                    continue
                w = min(lato * v for _, _, _, v in gem)
                gem = [t for t in gem if abs(lato * t[3] - w) < allineato]
                prima = [t for t in gem if -0.3 <= t[2] <= 0.3 and t[1] < t[2] - 0.1]
                dopo = [t for t in gem if g - 0.3 <= t[1] <= g + 0.3 and t[2] > t[1] + 0.1]
                dentro = sum(max(0.0, min(t[2], g - 0.15) - max(t[1], 0.15)) for t in gem)
                if not prima or not dopo or dentro > 0.2 * max(g - 0.3, 0.1):
                    continue
                p_ = max(prima, key=lambda t: t[2])
                d_ = min(dopo, key=lambda t: t[1])
                u0 = (0.0 + p_[2]) / 2
                u1 = (g + d_[1]) / 2
                if u1 - u0 < g_min:
                    continue
                tj = tratti[j]
                kj = 0 if (tj.a - e) @ o < (tj.b - e) @ o else 1
                tp, td = tratti[p_[0]], tratti[d_[0]]
                kp = 0 if (tp.a - e) @ o > (tp.b - e) @ o else 1
                kd = 0 if (td.a - e) @ o < (td.b - e) @ o else 1

                def su(t, k, u):
                    """Punto del tratto t alla posizione u lungo o."""
                    a0 = t.estremo(k)
                    return a0 + o * (u - (a0 - e) @ o)

                a_i, a_j = su(ti, ki, u0), su(tj, kj, u1)
                a_p, a_d = su(tp, kp, u0), su(td, kd, u1)
                ti.sposta(ki, a_i)
                tj.sposta(kj, a_j)
                tp.sposta(kp, a_p)
                td.sposta(kd, a_d)
                for x, y in ((a_i, a_p), (a_j, a_d)):
                    _spalletta(tratti, x, y)
                fatti.update({(i, ki), (j, kj), (p_[0], kp), (d_[0], kd)})
                break


def _spalletta(tratti, x, y, toll=0.05):
    """Aggiunge la spalletta x-y, o riallinea quella già rilevata."""
    for t in tratti:
        for k in (0, 1):
            if np.hypot(*(t.estremo(k) - x)) < toll and np.hypot(*(t.estremo(1 - k) - y)) < toll:
                t.sposta(k, x)
                t.sposta(1 - k, y)
                return
    tratti.append(_Tratto(x, y))


def _chiudi(segmenti, Q, par):
    """Richiude stanze, muri e solai dove i punti mancano.

    Ordine: (A) spallette e testate, (B) angoli nascosti, (C) buchi lungo
    una stessa linea, (D) innesti a T, (E) estremi vicinissimi. Le chiusure
    più lunghe di par.buco_visibile vanno nella categoria «chiusure».
    """
    tratti = [_Tratto(s.a, s.b, passo=s.lung() / max(len(s.idx), 1)) for s in segmenti if s.lung() > 0]
    if len(tratti) < 2 or par.chiudi_stanze <= 0:
        return tratti
    D = par.chiudi_stanze
    vis = par.buco_visibile
    tol = par.tolleranza
    albero = cKDTree(Q)
    sin_par = np.sin(np.radians(8))

    def aggiungi(p, q, sicuro=False):
        L = float(np.hypot(*(q - p)))
        if L < 1e-9:
            return
        tratti.append(_Tratto(p, q, "muri" if sicuro or L <= vis else "chiusure"))

    def estendi(i, k, x):
        e = tratti[i].estremo(k).copy()
        if np.hypot(*(x - e)) <= vis:
            tratti[i].sposta(k, x)
            # un tratto che arriva qui va spostato con lui
        else:
            aggiungi(e, x)

    def coppie(liberi, d_max):
        if len(liberi) < 2:
            return []
        E = np.array([tratti[i].estremo(k) for i, k in liberi])
        alb = cKDTree(E)
        return [(liberi[u], liberi[v]) for u, v in sorted(alb.query_pairs(d_max))]

    def applica(candidati, azione):
        fatti = set()
        for _, u, v, *resto in sorted(candidati, key=lambda c: c[0]):
            if u in fatti or (v is not None and v in fatti):
                continue
            azione(u, v, *resto)
            fatti.add(u)
            if v is not None:
                fatti.add(v)

    # (0) vani: le due facce di un muro interrotte nello stesso punto. Il
    #     buco non va richiuso; si disegnano le spallette anche se un'anta
    #     aperta tocca lo stipite e gli ha "rubato" l'estremo
    _vani_gemelli(tratti, tol)

    # (A) spallette e testate: due facce parallele che finiscono insieme
    cand = []
    for (i, ki), (j, kj) in coppie(_liberi(tratti), 0.9):
        ti, tj = tratti[i], tratti[j]
        di, dj = ti.dir(), tj.dir()
        if abs(di[0] * dj[1] - di[1] * dj[0]) > sin_par:
            continue
        oi, oj = ti.fuori(ki), tj.fuori(kj)
        if oi @ oj < 0.9:
            continue
        ei, ej = ti.estremo(ki), tj.estremo(kj)
        v = ej - ei
        w = abs(v[0] * oi[1] - v[1] * oi[0])  # distanza tra le facce
        if not (0.03 <= w <= 0.8) or abs(v @ oi) > max(0.15, 0.3 * w):
            continue
        cand.append((w, (i, ki), (j, kj)))

    def spalletta(u, v):
        ti, tj = tratti[u[0]], tratti[v[0]]
        a, b = ti.estremo(u[1]).copy(), tj.estremo(v[1]).copy()
        # le due facce finiscono alla stessa altezza: spalletta perpendicolare
        o = ti.fuori(u[1])
        m = ((a @ o) + (b @ o)) / 2
        a = a + (m - a @ o) * ti.dir() * np.sign(ti.dir() @ o)
        b = b + (m - b @ o) * tj.dir() * np.sign(tj.dir() @ o)
        ti.sposta(u[1], a)
        tj.sposta(v[1], b)
        sostenuta = _copertura(Q, albero, a, b, tol) >= 0.4
        aggiungi(a, b, sicuro=sostenuta or np.hypot(*(b - a)) <= 0.35)

    applica(cand, spalletta)

    # (B) angoli nascosti: due linee libere non parallele che si incontrano davanti
    cand = []
    for (i, ki), (j, kj) in coppie(_liberi(tratti), 2 * D):
        ti, tj = tratti[i], tratti[j]
        di, dj = ti.dir(), tj.dir()
        if abs(di[0] * dj[1] - di[1] * dj[0]) < np.sin(np.radians(20)):
            continue
        ei, ej = ti.estremo(ki), tj.estremo(kj)
        x = intersezione(ei, di, ej, dj)
        if x is None:
            continue
        oi, oj = ti.fuori(ki), tj.fuori(kj)
        if (x - ei) @ oi < -tol or (x - ej) @ oj < -tol:
            continue
        d1, d2 = float(np.hypot(*(x - ei))), float(np.hypot(*(x - ej)))
        if max(d1, d2) > D or not (_solido(ti, d1) and _solido(tj, d2)):
            continue
        cand.append((max(d1, d2), (i, ki), (j, kj), x))

    def angolo(u, v, x):
        estendi(u[0], u[1], x)
        estendi(v[0], v[1], x)

    applica(cand, angolo)

    # (C) buchi lungo la stessa linea (ombre, arredi, solai interrotti)
    cand = []
    # lungo la stessa linea si richiude anche di più: dietro un armadio o una
    # pianta il muro continua (un buco della nuvola non è un buco del muro)
    D_lin = max(D, par.chiudi_allineati)
    for (i, ki), (j, kj) in coppie(_liberi(tratti), D_lin):
        ti, tj = tratti[i], tratti[j]
        oi, oj = ti.fuori(ki), tj.fuori(kj)
        if oi @ oj > -np.cos(np.radians(5)):
            continue
        ei, ej = ti.estremo(ki), tj.estremo(kj)
        v = ej - ei
        if v @ oi <= 0:
            continue
        if abs(v[0] * oi[1] - v[1] * oi[0]) > max(3 * tol, 0.04):
            continue
        g = float(np.hypot(*v))
        if not (_solido(ti, g / 2) and _solido(tj, g / 2)):
            continue
        cand.append((float(np.hypot(*v)), (i, ki), (j, kj)))
    def buco(u, v):
        ti, tj = tratti[u[0]], tratti[v[0]]
        a, b = ti.estremo(u[1]).copy(), tj.estremo(v[1]).copy()
        # un vuoto di pochi passi tra i punti (superfici rilevate rade, come
        # pavimenti e soffitti visti di striscio) non è un buco vero
        rado = np.hypot(*(b - a)) <= 8 * max(ti.passo, tj.passo)
        aggiungi(a, b, sicuro=rado)

    applica(cand, buco)

    # (D) innesti a T: la linea libera prosegue fino a incontrarne un'altra
    liberi = _liberi(tratti)
    cand = []
    for i, ki in liberi:
        ti = tratti[i]
        e, o = ti.estremo(ki), ti.fuori(ki)
        migliore = None
        if ti.lung() < 0.25:
            continue
        for j, tj in enumerate(tratti):
            if j == i or tj.lung() <= 0:
                continue
            dj = tj.dir()
            if abs(o[0] * dj[1] - o[1] * dj[0]) < np.sin(np.radians(30)):
                continue
            x = intersezione(e, o, tj.a, dj)
            if x is None:
                continue
            dist = (x - e) @ o
            if dist < -tol or dist > min(D, max(ti.lung(), 0.5 * D)):
                continue
            f = (x - tj.a) @ dj
            if f < -tol or f > tj.lung() + tol:
                continue
            if migliore is None or dist < migliore[0]:
                migliore = (dist, j, x)
        if migliore is not None:
            dist, j, x = migliore
            tj = tratti[j]
            # se cade appena oltre un estremo del tratto colpito, usa l'estremo
            f = (x - tj.a) @ tj.dir()
            if f < 0:
                x = tj.a.copy()
            elif f > tj.lung():
                x = tj.b.copy()
            cand.append((max(dist, 0.0), (i, ki), None, x))
    applica(cand, lambda u, v, x: estendi(u[0], u[1], x))

    # (E) estremi rimasti vicinissimi
    cand = [(float(np.hypot(*(tratti[i].estremo(ki) - tratti[j].estremo(kj)))), (i, ki), (j, kj))
            for (i, ki), (j, kj) in coppie(_liberi(tratti), vis)]
    applica(cand, lambda u, v: aggiungi(tratti[u[0]].estremo(u[1]).copy(), tratti[v[0]].estremo(v[1]).copy(),
                                        sicuro=True))
    return [t for t in tratti if t.lung() > 1e-9]


def _innesti_a_t(tratti):
    """Spezza le linee nei punti dove arriva un'altra linea (innesto a T),
    così nel DXF i tratti si toccano esattamente."""
    if not tratti:
        return []
    estremi = np.array([e for s in tratti for e in (s.a, s.b)])
    out = []
    for s in tratti:
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
            out.append((p, q, s.cat))
    return out


def estrai(P, par, annulla=None):
    """Da punti 2D (n, 2) a lista di Polilinea."""
    if len(P) < 10:
        return []
    cella = max(par.tolleranza / 2, 0.003)
    Q = _togli_isolati(sottocampiona(P, cella), cella)
    segmenti, buco = _ransac(Q, par, annulla)
    _regolarizza(segmenti, Q, par)
    segmenti = _fondi(segmenti, Q, par, buco)
    _unisci_spigoli(segmenti, par)
    segmenti = [s for s in segmenti if s.lung() >= par.lung_min * 0.5]
    tratti = _chiudi(segmenti, Q, par)
    linee = _innesti_a_t(tratti)
    poli = []
    for cat in ("muri", "chiusure"):
        for p in semplifica(catene([(a, b) for a, b, c in linee if c == cat])):
            p.tipo = "linea"
            p.categoria = cat
            poli.append(p)
    return poli
