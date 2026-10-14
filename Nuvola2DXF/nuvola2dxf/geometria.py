"""Strutture e funzioni geometriche comuni ai motori di vettorializzazione."""

from dataclasses import dataclass

import numpy as np


@dataclass
class Polilinea:
    """Polilinea 2D. bulge[i] descrive il tratto dal vertice i al successivo
    (0 = retta, altrimenti arco con bulge = tan(angolo/4), come nel DXF)."""

    punti: np.ndarray
    bulge: np.ndarray = None
    chiusa: bool = False
    tipo: str = "linea"  # linea | curva | cerchio
    categoria: str = "muri"  # vedi parametri.CATEGORIE

    def __post_init__(self):
        self.punti = np.asarray(self.punti, dtype=np.float64).reshape(-1, 2)
        if self.bulge is None:
            self.bulge = np.zeros(len(self.punti))
        self.bulge = np.asarray(self.bulge, dtype=np.float64)

    def tratti(self):
        n = len(self.punti)
        m = n if self.chiusa else n - 1
        for i in range(m):
            yield self.punti[i], self.punti[(i + 1) % n], self.bulge[i]

    def lunghezza(self):
        tot = 0.0
        for a, b, g in self.tratti():
            c = float(np.hypot(*(b - a)))
            if g:
                th = 4 * np.arctan(abs(g))
                r = c / (2 * np.sin(th / 2))
                tot += r * th
            else:
                tot += c
        return tot

    def campiona(self, passo=0.02):
        """Coordinate per il disegno a schermo (archi spezzati in segmenti)."""
        out = [self.punti[0]]
        for a, b, g in self.tratti():
            if g:
                out.extend(punti_arco(a, b, g, passo)[1:])
            else:
                out.append(b)
        return np.array(out)


@dataclass
class Testo:
    """Scritta da riportare nel DXF (quote di fuori piombo, etichette)."""

    pos: tuple
    testo: str
    altezza: float = 0.05
    categoria: str = "piombo"
    rotazione: float = 0.0  # gradi
    allinea: str = "sinistra"  # sinistra | centro | destra


def punti_arco(a, b, bulge, passo=0.02):
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    c = float(np.hypot(*(b - a)))
    if c == 0 or bulge == 0:
        return np.array([a, b])
    th = 4 * np.arctan(bulge)  # con segno: positivo = antiorario
    r = c / (2 * np.sin(abs(th) / 2))
    m = (a + b) / 2
    d = (b - a) / c
    nrm = np.array([-d[1], d[0]])
    # distanza (con segno) del centro dalla corda: negativa per archi oltre 180°
    h = r * np.cos(abs(th) / 2)
    centro = m + nrm * h * np.sign(th)
    a0 = np.arctan2(a[1] - centro[1], a[0] - centro[0])
    n = max(2, int(np.ceil(abs(th) * r / passo)) + 1)
    ang = a0 + np.linspace(0, th, n)
    return np.column_stack((centro[0] + r * np.cos(ang), centro[1] + r * np.sin(ang)))


def bulge_da_cerchio(a, b, centro, medio):
    """Bulge dell'arco da a a b sul cerchio di centro dato, passante vicino a medio."""
    ang = lambda p: np.arctan2(p[1] - centro[1], p[0] - centro[0])
    a0, am, a1 = ang(a), ang(medio), ang(b)
    giro = 2 * np.pi
    ccw = (a1 - a0) % giro
    if (am - a0) % giro <= ccw:
        th = ccw
    else:
        th = -(giro - ccw)
    return float(np.tan(th / 4))


def retta_tls(p):
    """Retta ai minimi quadrati totali: (baricentro, direzione unitaria)."""
    c = p.mean(axis=0)
    if len(p) < 2:
        return c, np.array([1.0, 0.0])
    _, _, vt = np.linalg.svd(p - c, full_matrices=False)
    return c, vt[0]


def cerchio_ls(p):
    """Cerchio ai minimi quadrati (metodo algebrico). (centro, raggio) o None."""
    if len(p) < 3:
        return None
    m = p.mean(axis=0)
    q = p - m
    A = np.column_stack((2 * q[:, 0], 2 * q[:, 1], np.ones(len(q))))
    bb = (q ** 2).sum(axis=1)
    try:
        sol, *_ = np.linalg.lstsq(A, bb, rcond=None)
    except np.linalg.LinAlgError:
        return None
    cx, cy, k = sol
    r2 = k + cx * cx + cy * cy
    if not np.isfinite(r2) or r2 <= 0:
        return None
    return np.array([cx, cy]) + m, float(np.sqrt(r2))


def intersezione(p1, d1, p2, d2):
    """Intersezione delle rette p1 + t d1 e p2 + s d2 (None se parallele)."""
    det = d1[0] * (-d2[1]) - d1[1] * (-d2[0])
    if abs(det) < 1e-12:
        return None
    r = p2 - p1
    t = (r[0] * (-d2[1]) - r[1] * (-d2[0])) / det
    return p1 + t * d1


def sottocampiona(p, cella):
    """Un punto (la media) per ogni cella quadrata di lato 'cella'."""
    if len(p) == 0:
        return p
    k = np.floor((p - p.min(axis=0)) / cella).astype(np.int64)
    chiave = k[:, 0] * (int(k[:, 1].max()) + 1) + k[:, 1]
    _, inv, cont = np.unique(chiave, return_inverse=True, return_counts=True)
    sx = np.bincount(inv, weights=p[:, 0]) / cont
    sy = np.bincount(inv, weights=p[:, 1]) / cont
    return np.column_stack((sx, sy))


def passo_medio(p, campione=20000, percentile=50):
    """Distanza tipica tra punti consecutivi lungo un contorno.

    Metà della distanza dal quarto vicino: lungo una linea i quattro vicini
    stanno due per parte, quindi è circa il passo tra i punti.
    """
    from scipy.spatial import cKDTree

    if len(p) < 6:
        return 0.0
    q = p if len(p) <= campione else p[np.random.default_rng(0).choice(len(p), campione, replace=False)]
    d, _ = cKDTree(p).query(q, k=5)
    return float(np.percentile(d[:, 4], percentile)) / 2


def catene(segmenti, tol=1e-6):
    """Unisce segmenti [(a, b), ...] che condividono gli estremi in polilinee."""
    nodi = {}
    coord = []

    def nodo(p):
        k = (round(p[0] / tol), round(p[1] / tol))
        if k not in nodi:
            nodi[k] = len(coord)
            coord.append(np.asarray(p, float))
        return nodi[k]

    archi = []
    adiac = {}
    for a, b in segmenti:
        i, j = nodo(a), nodo(b)
        if i == j:
            continue
        e = len(archi)
        archi.append((i, j))
        adiac.setdefault(i, []).append(e)
        adiac.setdefault(j, []).append(e)
    usato = [False] * len(archi)
    out = []

    def cammina(inizio, e):
        seq = [inizio]
        cur = inizio
        while True:
            usato[e] = True
            i, j = archi[e]
            cur = j if i == cur else i
            seq.append(cur)
            if len(adiac[cur]) != 2:
                return seq, False
            prossimi = [x for x in adiac[cur] if not usato[x]]
            if not prossimi:
                return seq, seq[0] == cur
            e = prossimi[0]

    for n, lista in adiac.items():
        if len(lista) != 2:
            for e in lista:
                if not usato[e]:
                    seq, _ = cammina(n, e)
                    out.append(Polilinea([coord[k] for k in seq]))
    for e in range(len(archi)):
        if not usato[e]:
            seq, chiusa = cammina(archi[e][0], e)
            if chiusa:
                seq = seq[:-1]
            out.append(Polilinea([coord[k] for k in seq], chiusa=chiusa))
    return out
