"""Autoverifica dell'eseguibile (usata dalla compilazione automatica):

    Nuvola2DXF.exe --verifica risultato.txt

Crea una piccola nuvola, la scrive in LAS, LAZ ed E57, la rilegge, estrae
pianta, sezione e prospetto, scrive i DXF e annota l'esito nel file.
"""

import os
import tempfile
import traceback

import numpy as np


def _stanza(rng, n=80_000):
    s = rng.random(n) * 14
    xy = np.zeros((n, 2))
    lati = [((0, 0), (4, 0)), ((4, 0), (4, 3)), ((4, 3), (0, 3)), ((0, 3), (0, 0))]
    cum = [0, 4, 7, 11, 14]
    for (a, b), c0, c1 in zip(lati, cum[:-1], cum[1:]):
        m = (s >= c0) & (s < c1)
        f = ((s[m] - c0) / (c1 - c0))[:, None]
        xy[m] = np.asarray(a) + (np.asarray(b) - np.asarray(a)) * f
    P = np.column_stack((xy, rng.random(n) * 3)) + rng.normal(0, 0.002, (n, 3))
    return P + (100.0, 200.0, 50.0)


def esegui(log):
    righe = []
    ok = True
    try:
        import ezdxf
        import laspy
        import pye57

        from . import classifica, elabora, esporta, nuvola, piombo, prospetto
        from .parametri import PROFILI

        par = list(PROFILI.values())[0]
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            os.environ["LOCALAPPDATA"] = os.path.join(tmp, "cache")
            P = _stanza(np.random.default_rng(0))
            for est in ("las", "laz", "e57"):
                f = os.path.join(tmp, "stanza." + est)
                if est == "e57":
                    e = pye57.E57(f, mode="w")
                    e.write_scan_raw({"cartesianX": P[:, 0], "cartesianY": P[:, 1], "cartesianZ": P[:, 2]})
                    e.close()
                else:
                    h = laspy.LasHeader(point_format=3, version="1.2")
                    h.offsets = np.floor(P.min(axis=0))
                    h.scales = np.array([0.001] * 3)
                    las = laspy.LasData(h)
                    las.x, las.y, las.z = P.T
                    las.write(f)
                nv = nuvola.Nuvola.carica(f)
                q = 51.5 - nv.origine[2]
                fet = nv.fetta_pianta(q, 0.05)
                poli, _ = classifica.classifica_pianta(elabora.estrai(fet, par), fet, nv, q)
                l, t, _ = piombo.piombo_pianta(nv, poli, q)
                esito = len(poli) == 1 and poli[0].chiusa and len(poli[0].punti) == 4
                righe.append(f"{est}: {nv.n} punti, pianta {'OK' if esito else 'ERRATA'}")
                ok &= esito
                dxf = os.path.join(tmp, est + ".dxf")
                esporta.esporta(dxf, poli + l, "pianta", nv.origine, q, testi=t)
                ok &= len(list(ezdxf.readfile(dxf).modelspace())) > 0
                if est != "e57":
                    nv.chiudi()
            a = np.array([2.0, -1.0]) + (100, 200) - nv.origine[:2]
            b = np.array([2.0, 4.0]) + (100, 200) - nv.origine[:2]
            sez = nv.fetta_sezione(a, b, 0.05)
            ps = classifica.classifica_sezione(elabora.estrai(sez, par), sez)
            righe.append(f"sezione: {len(ps)} elementi")
            ok &= len(ps) >= 2
            a = np.array([-1.0, -0.2]) + (100, 200) - nv.origine[:2]
            b = np.array([5.0, -0.2]) + (100, 200) - nv.origine[:2]
            a, b = prospetto.allinea_facciata(nv.anteprima, a, b)
            _, pp = prospetto.estrai_prospetto(nv.fascia(a, b, -0.5, 1.0), par)
            righe.append(f"prospetto: {len(pp)} elementi")
            ok &= len(pp) >= 1
            nv.chiudi()
        from PySide6 import QtWidgets  # noqa: F401  (verifica che le librerie Qt ci siano)
        import pyqtgraph  # noqa: F401
    except Exception:
        ok = False
        righe.append(traceback.format_exc())
    righe.append("ESITO: " + ("OK" if ok else "ERRORE"))
    with open(log, "w", encoding="utf-8") as f:
        f.write("\n".join(righe) + "\n")
    return 0 if ok else 1
