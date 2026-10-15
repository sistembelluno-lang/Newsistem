"""Modello intuitivo dell'edificio: si guarda attorno e poi disegna.

Come farebbe una persona che entra in una stanza:

1. **pavimento e soffitto** del piano, dal profilo delle quote della nuvola;
2. **i muri**: le loro linee si ricavano dalla fascia appena sotto il soffitto,
   dove quasi mai ci sono mobili e i muri si vedono continui (sopra porte e
   finestre c'è l'architrave);
3. **ogni muro guardato per intero**, dal pavimento al soffitto: i punti della
   sua faccia diventano un'immagine (lungo il muro × altezza). Un buco
   rettangolare con niente davanti è un vano (porta se parte dal pavimento,
   finestra se ha il davanzale); un buco con un oggetto davanti è muro
   nascosto, e il muro c'è;
4. **le stanze**: contorni chiusi dalle linee dei muri, con la superficie.

Solo alla fine si disegna: la pianta a una quota taglia il modello (muri, vani
che attraversano la quota, locali).
"""

import numpy as np
from scipy import ndimage

from . import elabora
from .geometria import Polilinea


def piani(nv, quota):
    """(pavimento, soffitto) del piano che contiene la quota."""
    from .classifica import _piani_orizzontali

    z = nv.anteprima[:, 2]
    z = z[(z > quota - 4) & (z < quota + 4)]
    if len(z) < 100:
        return None, None
    return tuple(_piani_orizzontali(z, quota, passo=0.02))


def muri_struttura(nv, quota, par, pav, sof, annulla=None):
    """Facce dei muri dalla fascia sotto il soffitto (o alta, se il soffitto
    non è piano). Restituisce le polilinee."""
    if sof is None or sof - quota < 0.4:
        z0, z1 = quota + 0.3, quota + 1.0
    else:
        z0, z1 = sof - 0.35, sof - 0.06
    pts = nv.fetta_pianta((z0 + z1) / 2, z1 - z0, annulla=annulla)
    if len(pts) < 50:
        return []
    from .geometria import sottocampiona

    pts = sottocampiona(pts, max(par.tolleranza / 2, 0.005))
    # lassù non ci sono mobili: si richiude con decisione
    poli = elabora.estrai(pts, par.copia(chiudi_allineati=max(par.chiudi_allineati, 6.0),
                                         chiudi_stanze=max(par.chiudi_stanze, 2.0)), annulla)
    for p in poli:
        if p.categoria == "chiusure":
            p.categoria = "muri"  # nella fascia alta una chiusura è muro (nascosto solo da travi o luci)
    return poli


def _fitti(u, raggio=0.02, minimo=5):
    from .verifica3d import _fitti as f

    return f(u, raggio, minimo)


def _stipite(u, verso, passo=0.02, minimo=8):
    """Posizione dello stipite: la fascia di 2 cm con più punti (una superficie
    perpendicolare al muro ne ha tanti su tutta l'altezza; i riflessi sparsi sul
    vetro no). verso -1: stipite a sinistra (si prende il bordo destro della
    fascia), +1: a destra (bordo sinistro)."""
    if len(u) < minimo:
        return None
    bins = np.arange(u.min(), u.max() + passo, passo)
    if len(bins) < 2:
        return float(u.max() if verso < 0 else u.min())
    cont, bordi = np.histogram(u, bins=bins)
    k = int(np.argmax(cont))
    if cont[k] < minimo or cont[k] < 3 * max(np.median(cont[cont > 0]), 1):
        return None
    sel = u[(u >= bordi[k]) & (u <= bordi[k + 1])]
    return float(sel.max() if verso < 0 else sel.min())


def _lato_stanza(P, pav):
    """Da che lato della faccia c'è la stanza (+1 o -1): quello con il
    pavimento vicino. Dall'altro lato c'è il muro (e oltre, un'altra stanza o
    l'esterno). 2: stanze da tutti e due i lati (muro interno)."""
    pv = P[(np.abs(P[:, 2] - pav) < 0.06) & (np.abs(P[:, 1]) > 0.1) & (np.abs(P[:, 1]) < 0.9)]
    if len(pv) < 10:
        return 0
    pos, neg = np.count_nonzero(pv[:, 1] > 0), np.count_nonzero(pv[:, 1] < 0)
    if min(pos, neg) > 0.25 * max(pos, neg):
        return 2
    return 1 if pos >= neg else -1


def _vani_faccia(P, L, pav, sof, cella=0.05, minimo=0.45, lato=0, griglia_out=None):
    """Vani su una faccia di muro dai punti (u, v, z) attorno ad essa.
    Restituisce [(u0, u1, z0, z1)] con u da -L/2 a L/2."""
    zlo, zhi = pav + 0.03, sof - 0.03
    if zhi - zlo < 1.0:
        return []
    nu = max(1, int(np.ceil(L / cella)))
    nz = max(1, int(np.ceil((zhi - zlo) / cella)))

    def griglia(Q, minimo=1):
        iu = np.clip(((Q[:, 0] + L / 2) / cella).astype(int), 0, nu - 1)
        iz = np.clip(((Q[:, 2] - zlo) / cella).astype(int), 0, nz - 1)
        g = np.zeros((nu, nz), np.int32)
        np.add.at(g, (iu, iz), 1)
        return g >= minimo

    dentro = (P[:, 2] > zlo) & (P[:, 2] < zhi)
    faccia_pt = P[dentro & (np.abs(P[:, 1]) < 0.035)]
    faccia = griglia(faccia_pt)
    # oggetti davanti o dietro: superfici vere (almeno 3 punti per cella), non
    # i riflessi sparsi sui vetri
    # solo dal lato della stanza: quello che si vede attraverso un vano (mobili
    # della stanza accanto, ante aperte di là) non nasconde il muro
    # da 12 cm in là: più vicino alla faccia c'è al massimo un'anta chiusa nello
    # spessore del muro, che non nasconde il vano
    v = P[:, 1] * lato if lato else np.abs(P[:, 1])
    oggetti = griglia(P[dentro & (v > 0.12) & (v < 1.0)], minimo=3)
    # un po' di tolleranza: celle vuote isolate nella faccia non sono buchi
    faccia = ndimage.binary_closing(faccia, iterations=1) | faccia
    if griglia_out is not None:
        griglia_out.update(faccia=faccia, zlo=zlo, cella=cella, L=L)
    buco = ~faccia & ~oggetti
    buco = ndimage.binary_opening(buco, iterations=2)
    lab, n = ndimage.label(buco)
    out = []
    for k, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None:
            continue
        a, b = sl
        w = (a.stop - a.start) * cella
        h = (b.stop - b.start) * cella
        if w < minimo or h < minimo:
            continue
        pieno = np.count_nonzero(lab[sl] == k) / max((a.stop - a.start) * (b.stop - b.start), 1)
        if pieno < 0.6:
            continue
        z0 = zlo + b.start * cella
        z1 = zlo + b.stop * cella
        # sotto il buco la faccia del muro è vuota fino al pavimento (qualcosa
        # davanti copriva solo la parte bassa): è una porta, non una finestra
        if b.start > 0:
            sotto = ~faccia[a.start:a.stop, :b.start]
            if sotto.size and sotto.mean() > 0.85:
                z0 = zlo
        if z1 > sof - 0.08:
            continue  # vuoto fino al soffitto: non è un vano
        u0, u1 = -L / 2 + a.start * cella, -L / 2 + a.stop * cella
        # bordi precisi: gli stipiti sono i punti della faccia più vicini al vano
        m = (faccia_pt[:, 2] > z0 + 0.1) & (faccia_pt[:, 2] < z1 - 0.1)
        uc = (u0 + u1) / 2
        sx = faccia_pt[m & (faccia_pt[:, 0] < uc) & (faccia_pt[:, 0] > u0 - 0.2), 0]
        dx = faccia_pt[m & (faccia_pt[:, 0] > uc) & (faccia_pt[:, 0] < u1 + 0.2), 0]
        if len(sx) >= 5:
            u0 = float(np.percentile(sx, 99))
        if len(dx) >= 5:
            u1 = float(np.percentile(dx, 1))
        # soglia e architrave allo stesso modo
        m = (faccia_pt[:, 0] > u0 + 0.05) & (faccia_pt[:, 0] < u1 - 0.05)
        sotto = faccia_pt[m & (faccia_pt[:, 2] < (z0 + z1) / 2) & (faccia_pt[:, 2] > z0 - 0.2), 2]
        sopra = faccia_pt[m & (faccia_pt[:, 2] > (z0 + z1) / 2) & (faccia_pt[:, 2] < z1 + 0.2), 2]
        if len(sotto) >= 5:
            z0 = float(np.percentile(sotto, 99))
        elif z0 < zlo + 0.1:
            z0 = pav
        if len(sopra) >= 5:
            z1 = float(np.percentile(sopra, 1))
        # nello spessore del muro: luce netta (punto più stretto, con le
        # spallette strombate) e spessore (fin dove arrivano le spallette)
        lu0, lu1, sp = u0, u1, 0.0
        d = (-lato * P[:, 1]) if lato else np.abs(P[:, 1])
        m = (d > 0.02) & (d < 0.95) & (P[:, 2] > z0 + 0.1) & (P[:, 2] < z1 - 0.1)
        uc = (u0 + u1) / 2
        for d0 in np.arange(0.02, 0.95, 0.05):
            mm = m & (d >= d0) & (d < d0 + 0.05)
            sx = _stipite(P[mm & (P[:, 0] < uc) & (P[:, 0] > u0 - 0.6), 0], -1)
            dx = _stipite(P[mm & (P[:, 0] > uc) & (P[:, 0] < u1 + 0.6), 0], 1)
            if sx is not None or dx is not None:
                sp = d0 + 0.05  # fin qui arriva almeno una spalletta
            if sx is not None and dx is not None:
                if dx - sx < lu1 - lu0 and dx - sx > 0.3:
                    lu0, lu1 = sx, dx
        out.append((u0, u1, z0, z1, lu0, lu1, sp))
    return out


def costruisci(nv, quota, par, annulla=None):
    """Il modello: piani, facce dei muri (con i loro vani)."""
    pav, sof = piani(nv, quota)
    if pav is None:
        pav = quota - 1.2
    if sof is None:
        sof = quota + 1.5
    poli = muri_struttura(nv, quota, par, pav, sof, annulla)
    facce = []
    for p in poli:
        if p.tipo == "cerchio":
            continue
        for a, b, g in p.tratti():
            L = float(np.hypot(*(b - a)))
            if not g and L >= 0.25:
                facce.append(dict(a=np.asarray(a, float), b=np.asarray(b, float), L=L, t=(b - a) / L, vani=[]))
    if facce:
        scatole = [dict(c=(f["a"] + f["b"]) / 2, t=f["t"], hu=f["L"] / 2, hv=1.0, z0=pav - 0.05, z1=sof + 0.05)
                   for f in facce]
        for f, P in zip(facce, nv.scatole(scatole, annulla=annulla)):
            if len(P) > 50:
                f["lato"] = _lato_stanza(P, pav)
                if f["lato"] == 2:
                    # muro interno: i vani visti da una delle due stanze
                    v1 = _vani_faccia(P, f["L"], pav, sof, lato=1, griglia_out=f.setdefault("g", {}))
                    v2 = _vani_faccia(P, f["L"], pav, sof, lato=-1)
                    f["vani"] = v1 + [v for v in v2 if not any(min(v[1], w[1]) - max(v[0], w[0]) > 0.1 for w in v1)]
                    f["lato"] = 0
                else:
                    f["vani"] = _vani_faccia(P, f["L"], pav, sof, lato=f["lato"], griglia_out=f.setdefault("g", {}))
        # se dall'altro lato dello stesso muro la faccia è piena, non c'è un vano
        # (da questo lato un armadio addossato nascondeva il muro)
        def piena(g, pa, pb, z0, z1):
            G = g.get("g")
            if not G:
                return 0.0
            ga, gb = sorted((float((pa - g["a"]) @ g["t"]), float((pb - g["a"]) @ g["t"])))
            c = G["cella"]
            i0, i1 = max(0, int(ga / c) + 1), min(G["faccia"].shape[0], int(gb / c) - 1)
            j0 = max(0, int((z0 - G["zlo"]) / c) + 1)
            j1 = min(G["faccia"].shape[1], int((z1 - G["zlo"]) / c) - 1)
            if i1 <= i0 or j1 <= j0:
                return 0.0
            return float(G["faccia"][i0:i1, j0:j1].mean())

        for f in facce:
            nf = np.array([-f["t"][1], f["t"][0]])
            tenuti = []
            for vano in f["vani"]:
                u0, u1, z0, z1 = vano[:4]
                pa = f["a"] + f["t"] * (u0 + f["L"] / 2)
                pb = f["a"] + f["t"] * (u1 + f["L"] / 2)
                smentito = False
                for g in facce:
                    if g is f or abs(f["t"] @ g["t"]) < 0.99:
                        continue
                    w = ((g["a"] + g["b"]) / 2 - f["a"]) @ nf
                    if 0.04 < abs(w) < 0.9 and piena(g, pa, pb, z0, z1) > 0.6:
                        smentito = True
                        break
                if not smentito:
                    tenuti.append(vano)
            f["vani"] = tenuti
        # un vano visto da un lato vale anche per la faccia opposta dello stesso muro
        for f in facce:
            nf = np.array([-f["t"][1], f["t"][0]])
            for g in facce:
                if g is f or abs(f["t"] @ g["t"]) < 0.99:
                    continue
                w = ((g["a"] + g["b"]) / 2 - f["a"]) @ nf
                if not (0.04 < abs(w) < 0.9):
                    continue
                for u0, u1, z0, z1, *_ in f["vani"]:
                    # il vano nelle coordinate della faccia g
                    pa = f["a"] + f["t"] * (u0 + f["L"] / 2)
                    pb = f["a"] + f["t"] * (u1 + f["L"] / 2)
                    ga, gb = sorted((float((pa - g["a"]) @ g["t"]) - g["L"] / 2,
                                     float((pb - g["a"]) @ g["t"]) - g["L"] / 2))
                    if gb < -g["L"] / 2 + 0.05 or ga > g["L"] / 2 - 0.05:
                        continue
                    if any(min(gb, v1) - max(ga, v0) > 0.2 * (gb - ga) for v0, v1, *_ in g["vani"]):
                        continue
                    ga, gb = max(ga, -g["L"] / 2), min(gb, g["L"] / 2)
                    g.setdefault("vani_altri", []).append((ga, gb, z0, z1, ga, gb, 0.0))
        for f in facce:
            f["vani"] = f["vani"] + f.pop("vani_altri", [])
    return dict(pavimento=pav, soffitto=sof, poli=poli, facce=facce)


def pianta(nv, quota, par, annulla=None):
    """Pianta dal modello: (polilinee, aperture, testi)."""
    from . import classifica, locali

    m = costruisci(nv, quota, par, annulla)
    pav = m["pavimento"]
    linee, tagli = [], []
    for f in m["facce"]:
        a, t, L = f["a"], f["t"], f["L"]
        # i vani che la quota attraversa interrompono la faccia
        buchi = sorted((u0 + L / 2, u1 + L / 2, z0, z1, l0 + L / 2, l1 + L / 2, sp)
                       for u0, u1, z0, z1, l0, l1, sp in f["vani"] if z0 < quota < z1)
        s = 0.0
        for s0, s1, z0, z1, l0, l1, sp in buchi:
            if s0 - s > 0.01:
                linee.append(Polilinea([a + t * s, a + t * s0], categoria="muri"))
            tagli.append(dict(p=a + t * s0, q=a + t * s1, t=t, z0=z0, z1=z1, faccia=f,
                              lp=a + t * l0, lq=a + t * l1, sp=sp))
            s = s1
        if L - s > 0.01:
            linee.append(Polilinea([a + t * s, a + t * L], categoria="muri"))
    # vani: due facce parallele con il buco nello stesso punto sono un vano solo
    aperture, usati = [], set()
    for i, ta in enumerate(tagli):
        if i in usati:
            continue
        ca = (ta["p"] + ta["q"]) / 2
        n = np.array([-ta["t"][1], ta["t"][0]])
        gemello = None
        for j, tb in enumerate(tagli):
            if j == i or j in usati or abs(ta["t"] @ tb["t"]) < 0.99:
                continue
            cb = (tb["p"] + tb["q"]) / 2
            w = abs((cb - ca) @ n)
            if 0.04 < w < 0.9 and abs((cb - ca) @ ta["t"]) < 0.3:
                if gemello is None or w < gemello[0]:
                    gemello = (w, j)
        usati.add(i)
        larg = float(np.hypot(*(ta["q"] - ta["p"])))
        if gemello is not None:
            tb = tagli[gemello[1]]
            usati.add(gemello[1])
            sp = gemello[0]
            # la faccia gemella: si orienta come la prima
            pb, qb = (tb["p"], tb["q"]) if (tb["q"] - tb["p"]) @ ta["t"] > 0 else (tb["q"], tb["p"])
            facce = ((ta["p"], ta["q"]), (pb, qb))
            # spallette tra le due facce
            linee.append(Polilinea([ta["p"], pb], categoria="muri"))
            linee.append(Polilinea([ta["q"], qb], categoria="muri"))
            c = (ca + (pb + qb) / 2) / 2
            nn = ((pb + qb) / 2 - ca)
            nn = nn / max(np.hypot(*nn), 1e-9)
            # se da un lato il vano arriva al pavimento è una porta (dall'altro
            # lato un mobile ne copriva la parte bassa)
            z0, z1 = min(ta["z0"], tb["z0"]), min(ta["z1"], tb["z1"])
        elif ta["sp"] > 0 and ta["faccia"].get("lato"):
            # visto da un lato solo: spallette fino alla luce netta, nello spessore
            sp = ta["sp"]
            nn = -n * ta["faccia"]["lato"]  # verso il muro
            po, qo = ta["lp"] + nn * sp, ta["lq"] + nn * sp
            facce = ((ta["p"], ta["q"]), (po, qo))
            linee.append(Polilinea([ta["p"], po], categoria="muri"))
            linee.append(Polilinea([ta["q"], qo], categoria="muri"))
            larg = float(np.hypot(*(ta["lq"] - ta["lp"])))
            c = (ca + (po + qo) / 2) / 2
            z0, z1 = ta["z0"], ta["z1"]
        else:
            sp = 0.0
            facce = ((ta["p"], ta["q"]), (ta["p"], ta["q"]))
            c, nn = ca, n
            z0, z1 = ta["z0"], ta["z1"]
        dav = max(0.0, z0 - pav)
        aperture.append(dict(c=c, t=ta["t"], n=nn, larghezza=larg, spessore=sp, facce=facce,
                             davanzale=dav, altezza=z1 - z0, categoria="finestre" if dav > 0.15 else "porte",
                             modello=True))
    from .geometria import catene, semplifica

    segmenti = [(p.punti[0], p.punti[1]) for p in linee]
    poli = semplifica(catene(segmenti, tol=1e-4))
    for p in poli:
        p.categoria = "muri"
    poli += [p for p in m["poli"] if p.tipo == "cerchio"]
    classifica.pilastri(poli)
    poli = poli + classifica.disegna_aperture(aperture)
    lp, lt, info = locali.locali(poli)
    poli = poli + locali.completa_muri(poli, info) + lp
    return poli, aperture, lt
