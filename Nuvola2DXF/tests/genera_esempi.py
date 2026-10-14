"""Crea nuvole di prova 3D (LAS, PTS, E57) per provare il programma.

    python tests/genera_esempi.py cartella_destinazione
"""

import os
import sys

import numpy as np


def muro(a, b, z0, z1, densita, rng):
    a, b = np.asarray(a, float), np.asarray(b, float)
    L = np.hypot(*(b - a))
    n = int(L * (z1 - z0) * densita)
    f = rng.random(n)[:, None]
    xy = a + (b - a) * f
    return np.column_stack((xy, z0 + rng.random(n) * (z1 - z0)))


def piano(x0, y0, x1, y1, z, densita, rng):
    n = int((x1 - x0) * (y1 - y0) * densita)
    return np.column_stack((x0 + rng.random(n) * (x1 - x0), y0 + rng.random(n) * (y1 - y0), np.full(n, z)))


def edificio(rng, densita=4000):
    """Due stanze con muri da 30 cm, porta e finestra, pavimento e soffitto."""
    parti = []
    for V in ([(0, 0), (5, 0), (5, 4), (0, 4)], [(5.3, 0), (8.3, 0), (8.3, 4), (5.3, 4)],
              [(-0.3, -0.3), (8.6, -0.3), (8.6, 4.3), (-0.3, 4.3)]):
        for i in range(4):
            parti.append(muro(V[i], V[(i + 1) % 4], 0, 3, densita, rng))
    P = np.vstack(parti)
    # porta 0.9 x 2.1 nel divisorio, finestra 1.2 x 1.2 (davanzale 0.9) nel muro nord della stanza A
    porta = (P[:, 0] > 4.95) & (P[:, 0] < 5.35) & (P[:, 1] > 1.5) & (P[:, 1] < 2.4) & (P[:, 2] < 2.1)
    fin = (P[:, 1] > 3.95) & (P[:, 0] > 1.9) & (P[:, 0] < 3.1) & (P[:, 2] > 0.9) & (P[:, 2] < 2.1)
    P = P[~porta & ~fin]
    parti = [P,
             muro((5, 1.5), (5.3, 1.5), 0, 2.1, densita, rng), muro((5, 2.4), (5.3, 2.4), 0, 2.1, densita, rng),
             piano(0, 0, 5, 4, 0, densita / 4, rng), piano(5.3, 0, 8.3, 4, 0, densita / 4, rng),
             piano(0, 0, 5, 4, 3, densita / 4, rng), piano(5.3, 0, 8.3, 4, 3, densita / 4, rng)]
    P = np.vstack(parti)
    P += rng.normal(0, 0.003, P.shape)
    # coordinate "georeferenziate" come in un rilievo reale
    return P + np.array([512340.0, 4987650.0, 152.30])


def chiesa(rng, densita=2500):
    """Aula 20x10 con abside semicircolare e 6 colonne, muri ondulati, alta 8 m."""
    parti = []
    h = 8.0
    n = int(20 * h * densita)
    for y0 in (0.0, 10.0):
        x = rng.random(n) * 20
        parti.append(np.column_stack((x, y0 + 0.02 * np.sin(x * 1.3), rng.random(n) * h)))
    parti.append(muro((0, 0), (0, 10), 0, h, densita, rng))
    n = int(np.pi * 5 * h * densita)
    a = rng.random(n) * np.pi - np.pi / 2
    parti.append(np.column_stack((20 + 5 * np.cos(a), 5 + 5 * np.sin(a), rng.random(n) * h)))
    for cx in (4, 9, 14):
        for cy in (3, 7):
            n = int(2 * np.pi * 0.35 * 6 * densita)
            a = rng.random(n) * 2 * np.pi
            parti.append(np.column_stack((cx + 0.35 * np.cos(a), cy + 0.35 * np.sin(a), rng.random(n) * 6)))
    parti.append(piano(0, 0, 20, 10, 0, densita / 4, rng))
    P = np.vstack(parti)
    P += rng.normal(0, 0.004, P.shape)
    return P + np.array([600100.0, 5000200.0, 85.0])


def scrivi_las(percorso, P):
    import laspy

    h = laspy.LasHeader(point_format=3, version="1.2")
    h.offsets = np.floor(P.min(axis=0))
    h.scales = np.array([0.001, 0.001, 0.001])
    las = laspy.LasData(h)
    las.x, las.y, las.z = P[:, 0], P[:, 1], P[:, 2]
    las.write(percorso)


def scrivi_pts(percorso, P):
    with open(percorso, "w") as f:
        f.write(f"{len(P)}\n")
        np.savetxt(f, np.column_stack((P, np.full(len(P), -500), np.full((len(P), 3), 128))),
                   fmt="%.4f %.4f %.4f %d %d %d %d")


if __name__ == "__main__":
    dest = sys.argv[1] if len(sys.argv) > 1 else "esempi"
    os.makedirs(dest, exist_ok=True)
    rng = np.random.default_rng(3)
    E = edificio(rng)
    scrivi_las(os.path.join(dest, "edificio.las"), E)
    scrivi_pts(os.path.join(dest, "edificio.pts"), E[::4])
    C = chiesa(rng)
    scrivi_las(os.path.join(dest, "chiesa.laz"), C)
    print(f"edificio: {len(E):,} punti, chiesa: {len(C):,} punti -> {dest}")
