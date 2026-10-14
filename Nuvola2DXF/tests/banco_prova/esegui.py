"""Banco di prova: scansione simulata, estrazione della pianta, confronto.

Uso (dalla cartella Nuvola2DXF):
    python tests/banco_prova/esegui.py CARTELLA_USCITA [scena ...]

Per ogni scena scrive la nuvola LAS (una volta sola), estrae la pianta con i
profili indicati e salva un'immagine di confronto e un riepilogo JSON.
"""

import json
import os
import sys
import time

QUI = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [QUI, os.path.dirname(os.path.dirname(QUI))]

import numpy as np  # noqa: E402

import metriche  # noqa: E402
import scanner  # noqa: E402
import scene  # noqa: E402

SPOSTA = np.array([700000.0, 5100000.0, 1000.0])  # coordinate "georeferenziate"
QUOTE = {"appartamento": 1.2, "storico": 1.5}
PROFILI_SCENA = {"appartamento": ["Squadrato", "Prevalentemente"], "storico": ["Prevalentemente", "Storico"]}


def nuvola_scena(nome, cartella):
    import laspy

    f = os.path.join(cartella, nome + ".las")
    sc, stazioni = scene.SCENE[nome]()
    if not os.path.exists(f):
        t = time.time()
        P, _ = scanner.scansiona(sc, stazioni)
        P = P + SPOSTA
        h = laspy.LasHeader(point_format=3, version="1.2")
        h.offsets = np.floor(P.min(axis=0))
        h.scales = np.array([0.001] * 3)
        las = laspy.LasData(h)
        las.x, las.y, las.z = P.T
        las.write(f)
        print(f"{nome}: {len(P):,} punti simulati in {time.time() - t:.0f} s")
    return f, sc, stazioni


def esegui(nome, cartella, profili=None):
    os.environ["LOCALAPPDATA"] = os.path.join(cartella, "cache")
    from nuvola2dxf import classifica, nuvola
    from nuvola2dxf.parametri import PROFILI

    f, sc, stazioni = nuvola_scena(nome, cartella)
    nv = nuvola.Nuvola.carica(f)
    zc = QUOTE[nome]
    muri = metriche.impronte(sc, zc, {"muro", "pilastro"})
    arredi = metriche.impronte(sc, zc, {"arredo", "anta", "persona"})
    q = zc + SPOSTA[2] - nv.origine[2]
    fet = nv.fetta_pianta(q, 0.05)
    loc = SPOSTA[:2] - nv.origine[:2]  # dalla scena alle coordinate locali
    risultati = {}
    for nome_p in profili or PROFILI_SCENA[nome]:
        k = [p for p in PROFILI if p.startswith(nome_p)][0]
        par = PROFILI[k]
        t = time.time()
        poli, aperture = classifica.pianta(fet, par, nv, q)
        durata = time.time() - t
        for p in poli:
            p.punti = p.punti - loc
        for ap in aperture:
            ap["c"] = ap["c"] - loc
        r = metriche.valuta_pianta(poli, muri, arredi, fet - loc)
        v = metriche.valuta_vani(aperture, sc.vani)
        r.update({k2: v[k2] for k2 in v if k2 not in ("righe", "falsi_lista")})
        r["secondi"] = durata
        r["punti_fetta"] = int(len(fet))
        risultati[nome_p] = r
        disegna(os.path.join(cartella, f"{nome}_{nome_p}.png"), fet - loc, poli, muri, arredi, v, stazioni,
                f"{nome} – {k}")
    nv.chiudi()
    with open(os.path.join(cartella, nome + ".json"), "w") as fp:
        json.dump(risultati, fp, indent=1)
    return risultati


def disegna(percorso, fet, poli, muri, arredi, v, stazioni, titolo):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    col = dict(arredi="#c08a2a", muri="#111", porte="#1a9a3a", finestre="#1f6fd1", pilastri="#00a0be", chiusure="#ff0096")
    fig, ax = plt.subplots(figsize=(15, 10))
    for geom, c in ((arredi, "#f4d9a8"), (muri, "#d6dbe3")):
        for g in getattr(geom, "geoms", [geom]) if geom is not None else []:
            x, y = g.exterior.xy
            ax.fill(x, y, color=c, zorder=0)
    ax.scatter(fet[:, 0], fet[:, 1], s=0.05, c="#999", zorder=1)
    for p in poli:
        c = p.campiona(0.02)
        if p.chiusa and p.tipo != "cerchio":
            c = np.vstack((c, c[:1]))
        ax.plot(c[:, 0], c[:, 1], lw=1.6, c=col.get(p.categoria, "#c00"), zorder=3,
                ls="--" if p.categoria == "chiusure" else "-")
    for r in v["righe"]:
        x, y = r["vero"]["c"]
        ok = r["trovato"] is not None and r["trovato"]["categoria"] == r["vero"]["tipo"]
        ax.plot(x, y, "o", ms=14, mfc="none", mec="#1a9a3a" if ok else "#d00", mew=2, zorder=4)
        if r["trovato"] is not None and "altezza" in r["trovato"]:
            t = r["trovato"]
            ax.annotate(f"{t['categoria'][0].upper()} {t['larghezza'] * 100:.0f}x{t['altezza'] * 100:.0f}"
                        f" d{t['davanzale'] * 100:.0f}", (x, y), xytext=(8, 8), textcoords="offset points",
                        fontsize=8, color="#333")
    for ap in v["falsi_lista"]:
        ax.plot(*ap["c"], "x", ms=12, c="#d00", mew=2, zorder=4)
    for s in stazioni:
        ax.plot(s[0], s[1], "^", ms=9, c="#6a3fb0", zorder=4)
    ax.set_aspect("equal")
    ax.set_title(titolo)
    fig.tight_layout()
    fig.savefig(percorso, dpi=70)
    plt.close(fig)


if __name__ == "__main__":
    cartella = sys.argv[1]
    os.makedirs(cartella, exist_ok=True)
    nomi = sys.argv[2:] or list(scene.SCENE)
    tutti = {n: esegui(n, cartella) for n in nomi}
    for n, rr in tutti.items():
        for p, r in rr.items():
            print(f"{n:12s} {p:15s} " + " ".join(f"{k}={v:.3g}" if isinstance(v, float) else f"{k}={v}"
                                                  for k, v in r.items()))
