"""Generatori di fette sintetiche per i test."""

import numpy as np


def campiona_spezzata(V, n, rng, chiusa=True):
    V = np.asarray(V, float)
    W = np.vstack((V, V[:1])) if chiusa else V
    L = np.hypot(*np.diff(W, axis=0).T)
    cum = np.r_[0, np.cumsum(L)]
    s = rng.random(n) * cum[-1]
    k = np.clip(np.searchsorted(cum, s, side="right") - 1, 0, len(L) - 1)
    f = (s - cum[k]) / L[k]
    return W[k] + (W[k + 1] - W[k]) * f[:, None]


def segmento(a, b, densita, rng):
    a, b = np.asarray(a, float), np.asarray(b, float)
    n = max(2, int(np.hypot(*(b - a)) * densita))
    f = rng.random(n)[:, None]
    return a + (b - a) * f


def appartamento(rng, densita=2000, rumore=0.004):
    """Due stanze 5x4 e 3x4 con muri di 30 cm, una porta da 90 cm nel muro
    divisorio, una zona d'ombra di 20 cm e due mobili (gruppi di punti)."""
    segs = []
    # stanza A interna: x 0..5, y 0..4 ; stanza B: x 5.3..8.3
    A = [(0, 0), (5, 0), (5, 4), (0, 4)]
    B = [(5.3, 0), (8.3, 0), (8.3, 4), (5.3, 4)]
    for V in (A, B):
        for i in range(4):
            segs.append((V[i], V[(i + 1) % 4]))
    # perimetro esterno (muro 30 cm)
    E = [(-0.3, -0.3), (8.6, -0.3), (8.6, 4.3), (-0.3, 4.3)]
    for i in range(4):
        segs.append((E[i], E[(i + 1) % 4]))
    pts = []
    for a, b in segs:
        pts.append(segmento(a, b, densita, rng))
    P = np.vstack(pts)
    # porta nel divisorio: y 1.5..2.4 su x=5 e x=5.3, con spallette
    porta = ((P[:, 0] > 4.95) & (P[:, 0] < 5.35) & (P[:, 1] > 1.5) & (P[:, 1] < 2.4))
    P = P[~porta]
    P = np.vstack((P, segmento((5, 1.5), (5.3, 1.5), densita, rng), segmento((5, 2.4), (5.3, 2.4), densita, rng)))
    # ombra di 20 cm sul muro sud della stanza A
    ombra = (P[:, 1] > -0.05) & (P[:, 1] < 0.05) & (P[:, 0] > 2.0) & (P[:, 0] < 2.2)
    P = P[~ombra]
    P = P + rng.normal(0, rumore, P.shape)
    # mobili: piccoli gruppi lontani dai muri
    mobili = [rng.normal((2.5, 2.0), 0.15, (800, 2)), rng.normal((7.0, 3.0), 0.1, (500, 2))]
    return np.vstack([P] + mobili)


def chiesa(rng, densita=3000, rumore=0.006):
    """Aula 20x10 con abside semicircolare (r=5), muri ondulati (murature
    irregolari), 6 colonne circolari r=0.35."""
    pts = []
    # muri laterali ondulati
    x = rng.random(int(20 * densita)) * 20
    for y0 in (0.0, 10.0):
        y = y0 + 0.02 * np.sin(x * 1.3)
        pts.append(np.column_stack((x, y)))
    # facciata
    pts.append(segmento((0, 0), (0, 10), densita, rng))
    # abside: centro (20, 5), raggio 5, da -90 a +90
    a = rng.random(int(np.pi * 5 * densita)) * np.pi - np.pi / 2
    pts.append(np.column_stack((20 + 5 * np.cos(a), 5 + 5 * np.sin(a))))
    # colonne
    for cx in (4, 9, 14):
        for cy in (3, 7):
            a = rng.random(int(2 * np.pi * 0.35 * densita)) * 2 * np.pi
            pts.append(np.column_stack((cx + 0.35 * np.cos(a), cy + 0.35 * np.sin(a))))
    P = np.vstack(pts)
    return P + rng.normal(0, rumore, P.shape)


# ---------------------------------------------------------------- edificio 3D
def _rett(o, ex, ey, densita, rng):
    """Punti su un rettangolo 3D: origine o, lati ex, ey (vettori)."""
    o, ex, ey = (np.asarray(v, float) for v in (o, ex, ey))
    area = np.linalg.norm(np.cross(ex, ey))
    n = max(4, int(area * densita))
    f = rng.random((n, 2))
    return o + f[:, :1] * ex + f[:, 1:] * ey


def _parete(a, b, z0, z1, fori, densita, rng):
    """Faccia verticale da a a b (XY) con vani [(s0, s1, zf0, zf1)] lungo a->b."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    L = np.hypot(*(b - a))
    t = (b - a) / L
    P = _rett((a[0], a[1], z0), (b[0] - a[0], b[1] - a[1], 0), (0, 0, z1 - z0), densita, rng)
    s = (P[:, :2] - a) @ t
    tieni = np.ones(len(P), bool)
    for s0, s1, zf0, zf1 in fori:
        tieni &= ~((s > s0) & (s < s1) & (P[:, 2] > zf0) & (P[:, 2] < zf1))
    return P[tieni]


def _vano(a, b, s0, s1, zf0, zf1, spessore, verso, densita, rng):
    """Spallette, architrave e (se zf0 > 0) davanzale di un vano nel muro
    con faccia a-b; il muro prosegue di 'spessore' nel verso dato."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    t = (b - a) / np.hypot(*(b - a))
    n = np.array([-t[1], t[0]]) * verso * spessore
    parti = []
    for s in (s0, s1):
        p = a + t * s
        parti.append(_rett((p[0], p[1], zf0), (n[0], n[1], 0), (0, 0, zf1 - zf0), densita, rng))
    p = a + t * s0
    lato = t * (s1 - s0)
    parti.append(_rett((p[0], p[1], zf1), (lato[0], lato[1], 0), (n[0], n[1], 0), densita, rng))
    if zf0 > 0.01:
        parti.append(_rett((p[0], p[1], zf0), (lato[0], lato[1], 0), (n[0], n[1], 0), densita, rng))
    return np.vstack(parti)


def edificio3d(rng, densita=3000, rumore=0.003):
    """Due stanze (A: x 0..5, B: x 5.3..8.3; y 0..4), muri esterni 30 cm
    rilevati dentro e fuori, alte 3 m.

    - porta interna nel divisorio (y 1.5..2.4, h 2.1)
    - porta esterna a sud nella stanza B (x 6.5..7.5, h 2.2)
    - finestra a sud nella stanza A (x 1.5..2.7, z 0.9..2.1)
    - finestra a nord nella stanza A (x 2..3.2, z 0.9..2.1)
    - pilastro 30x30 in B centrato in (7.5, 2.8), inclinato di +2 cm in x su 3 m
    - faccia interna del muro est (x = 8.3) fuori piombo: +3 cm in x su 3 m
    """
    H = 3.0
    d = densita
    P = []
    # facce interne
    P.append(_parete((0, 0), (5, 0), 0, H, [(1.5, 2.7, 0.9, 2.1)], d, rng))           # sud A
    P.append(_parete((5, 0), (5, 4), 0, H, [(1.5, 2.4, 0, 2.1)], d, rng))             # divisorio lato A
    P.append(_parete((5, 4), (0, 4), 0, H, [(1.8, 3.0, 0.9, 2.1)], d, rng))           # nord A (s da x=5)
    P.append(_parete((0, 4), (0, 0), 0, H, [], d, rng))                               # ovest A
    P.append(_parete((5.3, 0), (8.3, 0), 0, H, [(1.2, 2.2, 0, 2.2)], d, rng))         # sud B
    est = _parete((8.3, 0), (8.3, 4), 0, H, [], d, rng)
    est[:, 0] += 0.03 * est[:, 2] / H                                                 # fuori piombo
    P.append(est)
    P.append(_parete((8.3, 4), (5.3, 4), 0, H, [], d, rng))                           # nord B
    P.append(_parete((5.3, 4), (5.3, 0), 0, H, [(1.6, 2.5, 0, 2.1)], d, rng))         # divisorio lato B
    # facce esterne
    P.append(_parete((-0.3, -0.3), (8.6, -0.3), 0, H, [(1.8, 3.0, 0.9, 2.1), (6.8, 7.8, 0, 2.2)], d, rng))
    P.append(_parete((8.6, -0.3), (8.6, 4.3), 0, H, [], d, rng))
    P.append(_parete((8.6, 4.3), (-0.3, 4.3), 0, H, [(5.6, 6.8, 0.9, 2.1)], d, rng))
    P.append(_parete((-0.3, 4.3), (-0.3, -0.3), 0, H, [], d, rng))
    # vani: spallette, architravi, davanzali
    P.append(_vano((0, 0), (5, 0), 1.5, 2.7, 0.9, 2.1, 0.3, -1, d, rng))
    P.append(_vano((5.3, 0), (8.3, 0), 1.2, 2.2, 0, 2.2, 0.3, -1, d, rng))
    P.append(_vano((5, 4), (0, 4), 1.8, 3.0, 0.9, 2.1, 0.3, -1, d, rng))
    P.append(_vano((5, 0), (5, 4), 1.5, 2.4, 0, 2.1, 0.3, -1, d, rng))
    # pavimenti e soffitti
    for x0, x1 in ((0, 5), (5.3, 8.3)):
        P.append(_rett((x0, 0, 0), (x1 - x0, 0, 0), (0, 4, 0), d / 3, rng))
        P.append(_rett((x0, 0, H), (x1 - x0, 0, 0), (0, 4, 0), d / 3, rng))
    # pilastro
    c = np.array([7.5, 2.8])
    for a, b in (((-0.15, -0.15), (0.15, -0.15)), ((0.15, -0.15), (0.15, 0.15)),
                 ((0.15, 0.15), (-0.15, 0.15)), ((-0.15, 0.15), (-0.15, -0.15))):
        f = _parete(c + a, c + b, 0, H, [], d, rng)
        f[:, 0] += 0.02 * f[:, 2] / H
        P.append(f)
    P = np.vstack(P)
    # il pilastro non deve avere punti di pavimento/soffitto dentro
    dentro = (np.abs(P[:, 0] - 7.5) < 0.14) & (np.abs(P[:, 1] - 2.8) < 0.14) & ((P[:, 2] < 0.01) | (P[:, 2] > H - 0.01))
    P = P[~dentro]
    return P + rng.normal(0, rumore, P.shape)


# ---------------------------------------------------------------- tabià
def _contorno(V, densita, rng):
    """Punti sul contorno chiuso del poligono V (sezione di un elemento)."""
    V = np.asarray(V, float)
    L = np.hypot(*np.diff(np.vstack((V, V[:1])), axis=0).T).sum()
    return campiona_spezzata(V, max(8, int(L * densita)), rng)


def _rett2(x0, y0, x1, y1, densita, rng):
    return _contorno([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], densita, rng)


def tabia_sezione(rng, densita=1500, rumore=0.003):
    """Sezione trasversale di un tabià di montagna.

    - basamento in pietra: muri da 50 cm (x -0.5..0 e 6..6.5), alti 3 m
    - solaio in legno a quota 3: travi 16x20 ogni 0.9 m, tavolato da 4 cm sopra
    - pareti del fienile in tavole verticali da 2.5 cm (x 0..0.025 e 5.975..6)
      da quota 3.04 a 6
    - ballatoio a sud (x 6..7.3) a quota 4: mensole 12x16, tavolato da 4 cm,
      parapetto in tavole da 2.5 cm alto 1 m sul bordo
    - tetto a due falde a 30°: puntoni 12 cm di altezza e assito da 3 cm
    """
    d = densita
    P = [_rett2(-0.5, 0, 0, 3, d, rng), _rett2(6, 0, 6.5, 3, d, rng)]
    for x in np.arange(0.2, 5.9, 0.9):
        P.append(_rett2(x, 2.8, x + 0.16, 3.0, d, rng))       # travi del solaio
    P.append(_rett2(-0.5, 3.0, 6.5, 3.04, d, rng))            # tavolato
    P.append(_rett2(0, 3.04, 0.025, 6.0, d, rng))             # parete ovest in tavole
    P.append(_rett2(5.975, 3.04, 6.0, 6.0, d, rng))           # parete est in tavole
    for y in (3.84,):
        P.append(_rett2(6.0, y, 7.3, y + 0.16, d, rng))       # mensola del ballatoio
    P.append(_rett2(6.0, 4.0, 7.3, 4.04, d, rng))             # tavolato del ballatoio
    P.append(_rett2(7.275, 4.04, 7.3, 5.04, d, rng))          # parapetto
    # falde a 30°: dall'imposta (x -0.6 e 6.6, quota 6) al colmo (x 3, quota 6 + 3.6 tan30)
    h = 3.6 * np.tan(np.radians(30))
    for xa, xb in ((-0.6, 3.0), (6.6, 3.0)):
        a, b = np.array([xa, 6.0]), np.array([xb, 6.0 + h])
        t = (b - a) / np.hypot(*(b - a))
        n = np.array([-t[1], t[0]]) * (1 if xb > xa else -1)
        P.append(_contorno([a, b, b + n * 0.12, a + n * 0.12], d, rng))              # puntone
        P.append(_contorno([a + n * 0.12, b + n * 0.12, b + n * 0.15, a + n * 0.15], d, rng))  # assito
    P = np.vstack(P)
    return P + rng.normal(0, rumore, P.shape)
