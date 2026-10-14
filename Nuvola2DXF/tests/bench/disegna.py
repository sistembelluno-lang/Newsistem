import sys, os
sys.path.insert(0, os.getcwd()); sys.path.insert(0, os.path.dirname(__file__))
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from nuvola2dxf import elabora
from nuvola2dxf.parametri import PROFILI
import difficili
seme = int(sys.argv[2]) if len(sys.argv) > 2 else 0
P = difficili.pianta(np.random.default_rng(seme))
out = elabora.estrai(P, list(PROFILI.values())[0])
fig, ax = plt.subplots(figsize=(14, 12))
ax.scatter(P[:, 0], P[:, 1], s=0.3, c="#bbb")
for p in out:
    c = p.campiona(0.02)
    if p.chiusa: c = np.vstack((c, c[:1]))
    ax.plot(c[:, 0], c[:, 1], "-", lw=1.5, c="m" if p.categoria=="chiusure" else ("g" if p.chiusa else "r"))
    ax.plot(p.punti[:, 0], p.punti[:, 1], "k.", ms=4)
ax.set_aspect("equal"); fig.tight_layout(); fig.savefig(sys.argv[1], dpi=80)
