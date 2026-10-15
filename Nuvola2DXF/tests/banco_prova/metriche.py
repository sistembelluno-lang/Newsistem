"""Confronto tra la pianta estratta e la verità della scena."""

from collections import Counter

import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import MultiPoint, Polygon
from shapely.ops import unary_union


def impronte(scena, zc, etichette):
    """Poligoni in pianta degli oggetti (con le etichette date) tagliati a zc."""
    pol = []
    for m, et, _ in scena.mesh:
        if et not in etichette:
            continue
        V = np.asarray(m.vertices)
        if not (V[:, 2].min() < zc < V[:, 2].max()):
            continue
        h = MultiPoint([tuple(p) for p in V[:, :2]]).convex_hull
        if isinstance(h, Polygon) and h.area > 1e-6:
            pol.append(h)
    return unary_union(pol) if pol else None


def campiona_bordo(geom, passo=0.01):
    """Punti ogni 'passo' sul contorno di un (multi)poligono."""
    if geom is None:
        return np.zeros((0, 2))
    out = []
    for g in getattr(geom, "geoms", [geom]):
        for anello in [g.exterior] + list(g.interiors):
            L = anello.length
            n = max(2, int(L / passo))
            out.append(np.array([anello.interpolate(t).coords[0] for t in np.linspace(0, L, n, endpoint=False)]))
    return np.vstack(out)


def campiona_poli(poli, passo=0.01):
    pts, cat = [], []
    for p in poli:
        c = p.campiona(passo)
        if p.chiusa and p.tipo != "cerchio":
            c = np.vstack((c, c[:1]))
        for a, b in zip(c[:-1], c[1:]):
            n = max(1, int(np.hypot(*(b - a)) / passo))
            f = np.linspace(0, 1, n, endpoint=False)[:, None]
            pts.append(a + (b - a) * f)
            cat += [p.categoria] * n
    return (np.vstack(pts) if pts else np.zeros((0, 2))), np.array(cat)


def estremi_liberi(poli):
    g = Counter()
    for p in poli:
        if p.chiusa or p.tipo == "cerchio" or p.categoria in ("porte", "finestre"):
            continue
        for e in (p.punti[0], p.punti[-1]):
            g[(round(e[0], 3), round(e[1], 3))] += 1
    # un estremo che tocca il vertice di un'altra polilinea non è libero
    vert = Counter()
    for p in poli:
        for v in p.punti:
            vert[(round(v[0], 3), round(v[1], 3))] += 1
    return sum(1 for k, v in g.items() if v == 1 and vert[k] == 1)


def valuta_pianta(poli, muri, arredi, fetta=None, tol=0.03):
    """Completezza, correttezza, linee sugli arredi, chiusure.

    La completezza conta solo il contorno dei muri visto dallo scanner (con
    punti della fetta entro 2 cm): le facce mai rilevate non si possono
    disegnare. La correttezza usa tutto il contorno vero."""
    G = campiona_bordo(muri)
    Gtutto = G
    if fetta is not None and len(fetta):
        d, _ = cKDTree(fetta).query(G)
        G = G[d < 0.02]
    A = campiona_bordo(arredi)
    E, cat = campiona_poli([p for p in poli if p.categoria not in ("porte", "finestre", "info", "arredi", "ante", "altro")])
    r = {"arredi_riconosciuti_m": float(sum(p.lunghezza() for p in poli if p.categoria == "arredi"))}
    if len(E):
        dE, _ = cKDTree(E).query(G)
        r["contorno_visto_m"] = float(len(G) * 0.01)
        r["completezza_2cm"] = float(np.mean(dE < 0.02))
        r["completezza_5cm"] = float(np.mean(dE < 0.05))
        dG, _ = cKDTree(Gtutto).query(E)
        dA = cKDTree(A).query(E)[0] if len(A) else np.full(len(E), np.inf)
        r["correttezza_3cm"] = float(np.mean(dG < tol))
        r["linee_su_arredi_m"] = float(np.sum((dA < tol) & (dG >= tol)) * 0.01)
        r["linee_errate_m"] = float(np.sum((dA >= tol) & (dG >= tol)) * 0.01)
        ch = cat == "chiusure"
        r["chiusure_m"] = float(ch.sum() * 0.01)
        r["chiusure_giuste"] = float(np.mean(dG[ch] < 0.05)) if ch.any() else float("nan")
        # scostamento medio delle linee giuste
        r["errore_medio_mm"] = float(np.mean(dG[dG < tol]) * 1000)
    else:
        r.update(completezza_2cm=0, completezza_5cm=0, correttezza_3cm=0)
    r["estremi_liberi"] = estremi_liberi(poli)
    return r


def valuta_vani(aperture, vani, origine_z=0.0):
    """Abbina i vani trovati a quelli veri (centro entro 40 cm)."""
    righe = []
    usati = set()
    for v in vani:
        c = np.array(v["c"])
        migliore = None
        for k, ap in enumerate(aperture):
            d = float(np.hypot(*(ap["c"] - c)))
            if k not in usati and d < 0.4 and (migliore is None or d < migliore[0]):
                migliore = (d, k)
        if migliore is None:
            righe.append(dict(vero=v, trovato=None))
            continue
        usati.add(migliore[1])
        ap = aperture[migliore[1]]
        righe.append(dict(vero=v, trovato=ap, dist=migliore[0]))
    falsi = [ap for k, ap in enumerate(aperture) if k not in usati]
    trovati = [r for r in righe if r["trovato"] is not None]
    tipo_ok = [r for r in trovati if r["trovato"]["categoria"] == r["vero"]["tipo"]]
    err_l = [abs(r["trovato"]["larghezza"] - r["vero"]["l"]) for r in trovati]
    err_h = [abs(r["trovato"]["altezza"] - r["vero"]["h"]) for r in trovati if "altezza" in r["trovato"]]
    err_d = [abs(r["trovato"]["davanzale"] - r["vero"]["dav"]) for r in trovati if "davanzale" in r["trovato"]]
    return dict(veri=len(vani), trovati=len(trovati), tipo_giusto=len(tipo_ok), falsi=len(falsi),
                err_larghezza_cm=float(np.mean(err_l) * 100) if err_l else float("nan"),
                err_altezza_cm=float(np.mean(err_h) * 100) if err_h else float("nan"),
                err_davanzale_cm=float(np.mean(err_d) * 100) if err_d else float("nan"),
                righe=righe, falsi_lista=falsi)


def stanze_vere(scena, z_alto):
    """Stanze vere: lo spazio tra i muri tagliati sopra porte e finestre
    (z_alto), senza la parte esterna."""
    from shapely.geometry import box

    muri = impronte(scena, z_alto, {"muro", "pilastro"})
    if muri is None:
        return []
    muri = muri.buffer(0.001)  # i muri ruotati si toccano con fessure microscopiche
    x0, y0, x1, y1 = muri.bounds
    vuoto = box(x0 - 1, y0 - 1, x1 + 1, y1 + 1).difference(muri)
    out = []
    for g in getattr(vuoto, "geoms", [vuoto]):
        if g.area > 1.0 and g.bounds[0] > x0 - 0.5 and g.bounds[2] < x1 + 0.5 \
                and g.bounds[1] > y0 - 0.5 and g.bounds[3] < y1 + 0.5:
            out.append(g)
    return out


def valuta_locali(info, vere):
    """Per ogni stanza vera la stanza trovata che si sovrappone di più (IoU)."""
    trovate = [Polygon(i["poligono"]).buffer(0) for i in info]
    righe, usate = [], set()
    for v in vere:
        migliore = (0.0, None)
        for k, t in enumerate(trovate):
            if k in usate or not t.intersects(v):
                continue
            iou = t.intersection(v).area / t.union(v).area
            if iou > migliore[0]:
                migliore = (iou, k)
        if migliore[1] is not None:
            usate.add(migliore[1])
        righe.append(dict(area_vera=v.area, iou=migliore[0],
                          area_trovata=trovate[migliore[1]].area if migliore[1] is not None else 0.0))
    giuste = [r for r in righe if r["iou"] >= 0.9]
    return dict(stanze_vere=len(vere), stanze_trovate=len(trovate), stanze_giuste=len(giuste),
                iou_medio=float(np.mean([r["iou"] for r in righe])) if righe else float("nan"),
                err_area_pct=float(np.mean([abs(r["area_trovata"] - r["area_vera"]) / r["area_vera"] * 100
                                            for r in giuste])) if giuste else float("nan"),
                stanze_in_piu=len(trovate) - len(usate))
