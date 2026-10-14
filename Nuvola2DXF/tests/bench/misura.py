import sys, os, time
sys.path.insert(0, os.getcwd()); sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from nuvola2dxf import elabora
from nuvola2dxf.parametri import PROFILI
import difficili

def valuta(poli):
    from collections import Counter
    g = Counter()
    for p in poli:
        if p.chiusa: continue
        for i in range(len(p.punti) - 1):
            for e in (p.punti[i], p.punti[i + 1]):
                g[(round(e[0], 4), round(e[1], 4))] += 1
    liberi = sum(1 for v in g.values() if v == 1)
    ch = sum(p.lunghezza() for p in poli if p.categoria == "chiusure")
    return liberi, ch, sum(len(p.punti) for p in poli)

for nome, par in list(PROFILI.items())[:2]:
    for seme in range(4):
        rng = np.random.default_rng(seme)
        P = difficili.pianta(rng)
        t = time.time()
        out = elabora.estrai(P, par)
        l, ch, v = valuta(out)
        print(f"{nome[:10]} seme {seme}: estremi liberi {l}, chiusure {ch:.2f} m, vertici {v}, {time.time()-t:.1f}s")
