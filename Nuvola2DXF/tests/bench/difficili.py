"""Fette di pianta realistiche e difficili per misurare la chiusura delle stanze."""
import numpy as np

def seg(a, b, dens, rng, rum):
    a, b = np.asarray(a, float), np.asarray(b, float)
    L = np.hypot(*(b - a)); n = max(2, int(L * dens))
    f = rng.random(n)[:, None]
    P = a + (b - a) * f
    return P + rng.normal(0, rum, P.shape)

def pianta(rng, dens=1500, rum=0.006, ostacoli=True, densita_var=True):
    """Appartamento: 3 stanze + corridoio, muri 12-30 cm, porte con spallette,
    mobili che nascondono angoli e tratti di muro, densità variabile."""
    # contorni interni delle stanze (rettangoli), con porte (gap) sui lati
    stanze = {
        "A": [(0, 0), (4.5, 0), (4.5, 3.8), (0, 3.8)],
        "B": [(4.62, 0), (8.0, 0), (8.0, 3.8), (4.62, 3.8)],
        "C": [(0, 3.92), (3.2, 3.92), (3.2, 7.0), (0, 7.0)],
        "D": [(3.32, 3.92), (8.0, 3.92), (8.0, 7.0), (3.32, 7.0)],
    }
    # porte: (stanza, lato idx, s0, s1) lungo il lato
    # lati: 0 sud (da ovest), 1 est (da sud), 2 nord (da est), 3 ovest (da nord)
    porte = {("A", 1): [(1.4, 2.3)], ("B", 3): [(3.8 - 2.3, 3.8 - 1.4)],
             ("A", 2): [(4.5 - 1.9, 4.5 - 1.0)], ("C", 0): [(1.0, 1.9)],
             ("B", 2): [(8.0 - 6.22, 8.0 - 5.32)], ("D", 0): [(5.32 - 3.32, 6.22 - 3.32)],
             ("D", 2): [(2.5, 3.4)]}
    pts = []
    for k, V in stanze.items():
        for i in range(4):
            a, b = np.array(V[i], float), np.array(V[(i + 1) % 4], float)
            L = np.hypot(*(b - a)); t = (b - a) / L
            tagli = [0.0]
            for s0, s1 in porte.get((k, i), []):
                tagli += [s0, s1]
            tagli.append(L)
            d = dens * (rng.uniform(0.3, 1.5) if densita_var else 1)
            for j in range(0, len(tagli), 2):
                pts.append(seg(a + t * tagli[j], a + t * tagli[j + 1], d, rng, rum))
    # spallette (spessore 12 cm tra stanze adiacenti, rilevate da entrambi i lati)
    sp = [((4.5, 1.4), (4.62, 1.4)), ((4.5, 2.3), (4.62, 2.3)),
          ((1.0, 3.8), (1.0, 3.92)), ((1.9, 3.8), (1.9, 3.92)),
          ((5.32, 3.8), (5.32, 3.92)), ((6.22, 3.8), (6.22, 3.92))]
    for a, b in sp:
        pts.append(seg(a, b, dens, rng, rum))
    # perimetro esterno (30 cm) rilevato solo in parte
    E = [(-0.3, -0.3), (8.3, -0.3), (8.3, 7.3), (-0.3, 7.3)]
    for i in range(4):
        pts.append(seg(E[i], E[(i + 1) % 4], dens * 0.7, rng, rum))
    P = np.vstack(pts)
    if ostacoli:
        # armadi/mobili addossati che nascondono angoli e tratti (60-90 cm)
        nasc = [((-0.1, 3.0), (0.6, 3.9)),      # angolo NO di A
                ((7.3, -0.1), (8.1, 0.6)),      # angolo SE di B
                ((2.5, 6.4), (3.3, 7.1)),       # angolo NE di C
                ((5.0, 6.9), (6.0, 7.1)),       # tratto muro nord D (1 m)
                ((-0.1, 5.0), (0.1, 5.7)),      # tratto muro ovest C
                ]
        for (x0, y0), (x1, y1) in nasc:
            dentro = (P[:, 0] > x0) & (P[:, 0] < x1) & (P[:, 1] > y0) & (P[:, 1] < y1)
            P = P[~dentro]
        # fronti dei mobili (punti davanti, non allineati ai muri)
        P = np.vstack([P, seg((0.6, 3.0), (0.6, 3.8), dens, rng, rum), seg((0.0, 3.0), (0.6, 3.0), dens, rng, rum),
                       seg((7.3, 0.6), (8.0, 0.6), dens, rng, rum), seg((7.3, 0.0), (7.3, 0.6), dens, rng, rum),
                       rng.normal((2.0, 1.5), 0.2, (600, 2)), rng.normal((6.0, 5.5), 0.25, (900, 2))])
        # punti sparsi di rumore (riflessi, persone)
        P = np.vstack([P, rng.uniform((-0.3, -0.3), (8.3, 7.3), (400, 2))])
    return P
