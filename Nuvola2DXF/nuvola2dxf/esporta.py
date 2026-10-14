"""Scrittura del DXF (AutoCAD 2010, unità in metri)."""

import math

import ezdxf
import numpy as np

MAX_PUNTI_DXF = 300_000


def _arco_da_bulge(a, b, g):
    """(centro, raggio, angolo iniziale, angolo finale) in gradi, antiorario."""
    c = math.dist(a, b)
    th = 4 * math.atan(g)
    r = c / (2 * math.sin(abs(th) / 2))
    m = (a + b) / 2
    d = (b - a) / c
    nrm = np.array([-d[1], d[0]])
    h = r * math.cos(abs(th) / 2)
    centro = m + nrm * h * math.copysign(1, th)
    ang = lambda p: math.degrees(math.atan2(p[1] - centro[1], p[0] - centro[0]))
    if th > 0:
        return centro, r, ang(a), ang(b)
    return centro, r, ang(b), ang(a)


def esporta(
    percorso,
    polilinee,
    tipo="pianta",
    origine=(0.0, 0.0, 0.0),
    quota=0.0,
    quota_reale=False,
    punti=None,
    polilinee_unite=True,
    note=None,
    testi=None,
    layer=None,
):
    """Scrive il DXF.

    pianta: coordinate locali + origine (coordinate reali del rilievo);
            con quota_reale le linee stanno alla quota del taglio.
    sezione / prospetto: X = distanza lungo la linea A-B, Y = quota reale.
    layer: {categoria: nome del layer} (predefiniti in parametri.CATEGORIE).
    """
    from ezdxf.enums import TextEntityAlignment

    from .parametri import CATEGORIE

    nomi = {k: v[0] for k, v in CATEGORIE.items()}
    if layer:
        nomi.update({k: v for k, v in layer.items() if v})
    origine = np.asarray(origine, dtype=np.float64)
    doc = ezdxf.new("R2010", setup=True)
    doc.header["$INSUNITS"] = 6  # metri
    doc.header["$MEASUREMENT"] = 1
    msp = doc.modelspace()
    usate = {p.categoria for p in polilinee} | {t.categoria for t in (testi or [])} | {"info"}
    if punti is not None and len(punti):
        usate.add("punti")
    for cat in CATEGORIE:
        if cat in usate and nomi[cat] not in doc.layers:
            lt = "DASHED" if cat == "piombo_rif" else "Continuous"
            doc.layers.add(nomi[cat], color=CATEGORIE[cat][1], linetype=lt)

    def lay(cat):
        return nomi.get(cat, nomi["altro"])

    if tipo == "pianta":
        sposta = origine[:2]
        elev = float(quota + origine[2]) if quota_reale else 0.0
    else:
        sposta = np.array([0.0, origine[2]])
        elev = 0.0

    for p in polilinee:
        pts = p.punti + sposta
        layer_p = lay(p.categoria)
        if p.tipo == "cerchio":
            centro = pts.mean(axis=0)
            r = float(np.hypot(*(pts[0] - pts[1]))) / 2
            msp.add_circle((centro[0], centro[1], elev), r, dxfattribs={"layer": layer_p})
            continue
        if polilinee_unite:
            dati = [(x, y, 0, 0, g) for (x, y), g in zip(pts, p.bulge)]
            msp.add_lwpolyline(
                dati, format="xyseb", close=p.chiusa,
                dxfattribs={"layer": layer_p, "elevation": elev},
            )
        else:
            n = len(pts)
            for i in range(n if p.chiusa else n - 1):
                a, b, g = pts[i], pts[(i + 1) % n], p.bulge[i]
                if abs(g) > 1e-9:
                    c, r, a0, a1 = _arco_da_bulge(a, b, g)
                    msp.add_arc((c[0], c[1], elev), r, a0, a1, dxfattribs={"layer": layer_p})
                else:
                    msp.add_line((a[0], a[1], elev), (b[0], b[1], elev), dxfattribs={"layer": layer_p})

    allinea = {"sinistra": TextEntityAlignment.MIDDLE_LEFT, "centro": TextEntityAlignment.MIDDLE_CENTER,
               "destra": TextEntityAlignment.MIDDLE_RIGHT}
    for t in testi or []:
        pos = np.asarray(t.pos, float) + sposta
        e = msp.add_text(t.testo, height=t.altezza,
                         dxfattribs={"layer": lay(t.categoria), "rotation": t.rotazione})
        e.set_placement((pos[0], pos[1], elev), align=allinea.get(t.allinea, TextEntityAlignment.MIDDLE_LEFT))

    if punti is not None and len(punti):
        q = np.asarray(punti)
        if len(q) > MAX_PUNTI_DXF:
            q = q[np.random.default_rng(0).choice(len(q), MAX_PUNTI_DXF, replace=False)]
        q = q + sposta
        for x, y in q:
            msp.add_point((x, y, elev), dxfattribs={"layer": lay("punti")})

    if note:
        if polilinee:
            tutti = np.vstack([p.punti for p in polilinee]) + sposta
            x0, y1 = tutti[:, 0].min(), tutti[:, 1].max()
        else:
            x0, y1 = sposta[0], sposta[1]
        h = 0.15
        for k, riga in enumerate(note):
            msp.add_text(
                riga, height=h,
                dxfattribs={"layer": lay("info"), "insert": (x0, y1 + 0.5 + (len(note) - k) * h * 1.6, elev)},
            )
    doc.saveas(percorso)


def esporta_report_piombo(percorso, report, intestazione=None):
    """Report CSV del fuori piombo (separatore ';', decimali con la virgola
    per aprirlo direttamente in Excel in italiano)."""
    import csv

    def num(x, cifre=1):
        return f"{x:.{cifre}f}".replace(".", ",")

    with open(percorso, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        for riga in intestazione or []:
            w.writerow([riga])
        w.writerow(["Elemento", "Altezza analizzata (m)", "Scostamento cima-base (cm)",
                    "Scostamento massimo (cm)", "Pendenza (%)"])
        for r in report:
            w.writerow([r["nome"], num(r["altezza"], 2), num(r["scostamento"] * 100),
                        num(r["massimo"] * 100), num(r["percentuale"], 2)])
        dettagli = [r for r in report if r.get("profilo")]
        if dettagli:
            w.writerow([])
            w.writerow(["Profili: scostamento (cm) dalla verticale passante per la base, per quota (m)"])
            for r in dettagli:
                w.writerow([r["nome"]] + [f"{num(z, 2)} m: {num(d * 100)}" for z, d in r["profilo"]])
