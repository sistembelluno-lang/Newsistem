"""Analisi del fuori piombo di pareti e pilastri.

Per ogni superficie verticale si segue la posizione reale della faccia,
fascia per fascia di quota (passo regolabile), e la si confronta con la
verticale teorica passante per la base. Il DXF riporta:
- la verticale teorica (layer «fuori piombo riferimento»);
- il profilo reale, con gli scostamenti ingranditi del fattore scelto;
- i valori in cm a ogni fascia e il riepilogo (scostamento totale e %).
"""

import numpy as np

from .geometria import Polilinea, Testo


def _profilo(coord, z, partenza, passo, z_inizio, z_fine, banda):
    """Posizione della faccia per fasce di quota.

    coord: coordinata perpendicolare alla faccia dei punti; z: quote.
    Si parte dalla fascia che contiene z_inizio con la stima 'partenza' e si
    procede verso l'alto e verso il basso seguendo il picco di densità più
    vicino (così una seconda faccia vicina non disturba).
    """
    fasce = np.arange(z_inizio, z_fine + passo / 2, passo)
    if len(fasce) < 2:
        return []
    ris = {}

    def stima(k, prima):
        z0, z1 = fasce[k] - passo / 2, fasce[k] + passo / 2
        m = (z >= z0) & (z < z1) & (np.abs(coord - prima) <= banda)
        c = coord[m]
        if len(c) < 8:
            return None
        lati = np.arange(prima - banda, prima + banda + 0.005, 0.005)
        cont, bordi = np.histogram(c, bins=lati)
        if cont.max() < 4:
            return None
        centri = (bordi[:-1] + bordi[1:]) / 2
        # picchi significativi: il più vicino alla stima precedente
        forti = np.flatnonzero(cont >= 0.5 * cont.max())
        k_best = forti[np.argmin(np.abs(centri[forti] - prima))]
        pic = centri[k_best]
        vicini = c[np.abs(c - pic) <= 0.015]
        return float(np.mean(vicini)) if len(vicini) else float(pic)

    k0 = int(np.argmin(np.abs(fasce - partenza[1])))
    for direzione in (1, -1):
        prima = partenza[0]
        vuote = 0
        k = k0 if direzione == 1 else k0 - 1
        while 0 <= k < len(fasce):
            s = stima(k, prima)
            if s is None:
                vuote += 1
                if vuote * passo > 0.5:
                    break
            else:
                ris[k] = s
                prima = s
                vuote = 0
            k += direzione
    return [(fasce[k], ris[k]) for k in sorted(ris)]


def _disegna(profilo, verso_u, verso_n, base_xy, esagera, nome, altezza_testo, verticale_sezione,
             lato=None, riga=0):
    """Linee e testi per un profilo.

    verticale_sezione=True: disegno nel piano della sezione (u = ascissa,
    z = ordinata). Altrimenti (pianta) si disegna una freccia orizzontale.
    """
    linee, testi = [], []
    z = np.array([p[0] for p in profilo])
    c = np.array([p[1] for p in profilo])
    rif = c[0]
    dev = c - rif
    h = z[-1] - z[0]
    tot = dev[-1]
    perc = 100 * tot / h if h > 0 else 0.0
    if verticale_sezione:
        u0 = base_xy
        linee.append(Polilinea([(u0, z[0]), (u0, z[-1])], categoria="piombo_rif"))
        linee.append(Polilinea(np.column_stack((u0 + dev * esagera, z)), categoria="piombo"))
        if lato is None:
            lato = 1 if tot >= 0 else -1
        # al massimo una scritta ogni 50 cm circa, sempre la prima e l'ultima
        ogni = max(1, int(round(0.5 / max(z[1] - z[0], 1e-6)))) if len(z) > 1 else 1
        for k, (zi, di) in enumerate(zip(z, dev)):
            if k % ogni and k != len(z) - 1:
                continue
            testi.append(Testo((u0 + di * esagera + lato * 0.05, zi), f"{di * 100:+.1f}",
                               altezza_testo, allinea="sinistra" if lato > 0 else "destra"))
        testi.append(Testo((u0 + lato * 0.05, z[-1] + (2 + 2 * riga) * altezza_testo * 1.3),
                           f"{nome}: {tot * 100:+.1f} cm su {h:.2f} m ({perc:+.2f}%)",
                           altezza_testo * 1.3, allinea="sinistra" if lato > 0 else "destra"))
    else:
        p0 = np.asarray(base_xy, float)
        p1 = p0 + verso_n * tot * esagera
        linee.append(Polilinea([p0, p1], categoria="piombo"))
        # punta della freccia
        if abs(tot) > 1e-4:
            d = (p1 - p0) / np.hypot(*(p1 - p0))
            q = np.array([-d[1], d[0]])
            L = min(0.08, 0.3 * np.hypot(*(p1 - p0)))
            linee.append(Polilinea([p1 - d * L + q * L / 2, p1, p1 - d * L - q * L / 2], categoria="piombo"))
        ang = np.degrees(np.arctan2(verso_u[1], verso_u[0]))
        if ang > 90 or ang < -90:
            ang -= 180 * np.sign(ang)
        testi.append(Testo(tuple(p0 - verso_n * 0.06), f"fp {abs(tot) * 100:.1f} cm / h {h:.2f} m",
                           altezza_testo, rotazione=float(ang), allinea="centro"))
    return linee, testi, dict(nome=nome, scostamento=float(tot), altezza=float(h), percentuale=float(perc),
                              massimo=float(dev[np.argmax(np.abs(dev))]))


def piombo_sezione(poli, punti2d, passo=0.25, banda=0.15, altezza_min=1.0, esagera=10.0, testo=0.06):
    """Fuori piombo delle pareti verticali tagliate da una sezione.
    punti2d: (u, z) della fetta. Scostamento positivo = verso B."""
    linee, testi, report = [], [], []
    if len(punti2d) == 0:
        return linee, testi, report
    u, z = punti2d[:, 0], punti2d[:, 1]
    facce = []
    for p in poli:
        if p.categoria != "muri" or p.tipo == "cerchio":
            continue
        for a, b, g in p.tratti():
            if g:
                continue
            d = b - a
            L = np.hypot(*d)
            if L < altezza_min or abs(d[1]) / L < np.cos(np.radians(10)):
                continue
            facce.append((a, b))
    centri = np.array([(a[0] + b[0]) / 2 for a, b in facce])
    n = 0
    for k, (a, b) in enumerate(facce):
        z_lo, z_hi = sorted((a[1], b[1]))
        um = centri[k]
        prof = _profilo(u, z, (um, z_lo + 0.1), passo, z_lo + 0.05, z_hi - 0.05, banda)
        if len(prof) < 3:
            continue
        # scritte dal lato opposto alla faccia vicina (l'altra faccia del muro)
        altre = np.delete(centri, k)
        lato = 1
        if len(altre):
            vicina = altre[np.argmin(np.abs(altre - um))]
            lato = -1 if vicina > um else 1
        n += 1
        l, t, r = _disegna(prof, None, None, prof[0][1], esagera, f"P{n}", testo, True, lato, n % 2)
        r["profilo"] = [(float(zz), float(cc - prof[0][1])) for zz, cc in prof]
        linee += l
        testi += t
        report.append(r)
    return linee, testi, report


def piombo_pianta(nv, poli, quota, passo=0.25, banda=0.15, lung_min=0.6, esagera=10.0, testo=0.06,
                  soglia=0.005, avanzamento=None, annulla=None):
    """Fuori piombo in pianta, dai punti 3D: facce dei muri (perpendicolare
    alla parete) e pilastri (vettore di inclinazione)."""
    elementi = []
    for p in poli:
        if p.tipo == "cerchio":
            if p.categoria == "pilastri":
                c = p.punti.mean(axis=0)
                r = np.hypot(*(p.punti[0] - p.punti[1])) / 2
                elementi.append(("colonna", c, r))
            continue
        if p.categoria not in ("muri", "pilastri"):
            continue
        for a, b, g in p.tratti():
            if g:
                continue
            L = np.hypot(*(b - a))
            if L >= (0.15 if p.categoria == "pilastri" else lung_min):
                elementi.append(("faccia", a, b, p.categoria, id(p)))
    scatole = []
    for e in elementi:
        if e[0] == "colonna":
            _, c, r = e
            scatole.append(dict(c=c, t=(1.0, 0.0), hu=r + banda, hv=r + banda, z0=quota - 6, z1=quota + 6))
        else:
            _, a, b, *_ = e
            L = np.hypot(*(b - a))
            scatole.append(dict(c=(a + b) / 2, t=(b - a) / L, hu=max(0.05, L / 2 - 0.08), hv=banda,
                                z0=quota - 6, z1=quota + 6))
    if not scatole:
        return [], [], []
    punti = nv.scatole(scatole, avanzamento, annulla)
    linee, testi, report = [], [], []
    pilastri = {}
    n = 0
    for e, s, pts in zip(elementi, scatole, punti):
        if len(pts) < 30:
            continue
        if e[0] == "colonna":
            _, c, r = e
            prof = _profilo_colonna(pts, r, passo, quota)
            if len(prof) < 3:
                continue
            base = prof[0][1]
            cima = prof[-1][1]
            vett = cima - base
            h = prof[-1][0] - prof[0][0]
            tot = float(np.hypot(*vett))
            n += 1
            verso = vett / tot if tot > 0 else np.array([1.0, 0.0])
            l, t, r_ = _disegna([(prof[0][0], 0.0), (prof[-1][0], tot)], np.array([1.0, 0.0]), verso,
                                np.asarray(c) + base, esagera, f"C{n}", testo, False)
            linee += l
            testi += t
            report.append(r_)
            continue
        _, a, b, cat, chiave = e
        prof = _profilo(pts[:, 1], pts[:, 2], (0.0, quota), passo, quota - 6, quota + 6, banda)
        if len(prof) < 3:
            continue
        t = np.asarray(s["t"])
        nrm = np.array([-t[1], t[0]])
        if cat == "pilastri":
            pilastri.setdefault(chiave, []).append((nrm, prof, (a + b) / 2))
            continue
        n += 1
        l, tt, r_ = _disegna(prof, t, nrm, (a + b) / 2, esagera, f"M{n}", testo, False)
        r_["profilo"] = [(float(zz), float(cc - prof[0][1])) for zz, cc in prof]
        report.append(r_)
        if abs(r_["massimo"]) >= soglia:  # in disegno solo gli scostamenti rilevanti
            linee += l
            testi += tt
    # pilastri poligonali: vettore di inclinazione dalle facce
    for facce in pilastri.values():
        somma = np.zeros(2)
        hs = []
        for nrm, prof, _ in facce:
            dev = prof[-1][1] - prof[0][1]
            somma += nrm * dev
            hs.append(prof[-1][0] - prof[0][0])
        # due facce opposte vedono la stessa inclinazione: media
        vett = somma / max(1, len(facce) / 2)
        tot = float(np.hypot(*vett))
        h = float(np.median(hs))
        centro = np.mean([m for *_, m in facce], axis=0)
        n += 1
        verso = vett / tot if tot > 0 else np.array([1.0, 0.0])
        l, tt, r_ = _disegna([(0.0, 0.0), (h, tot)], np.array([1.0, 0.0]), verso, centro, esagera,
                             f"PL{n}", testo, False)
        linee += l
        testi += tt
        report.append(r_)
    return linee, testi, report


def _profilo_colonna(pts, r, passo, quota):
    """Centro della colonna (raggio noto) fascia per fascia."""
    u, v, z = pts[:, 0], pts[:, 1], pts[:, 2]
    fasce = np.arange(z.min() + passo / 2, z.max(), passo)
    out = []
    c = np.zeros(2)
    for zc in fasce:
        m = np.abs(z - zc) < passo / 2
        q = np.column_stack((u[m], v[m]))
        q = q[np.abs(np.hypot(*(q - c).T) - r) < 0.08] if len(q) else q
        if len(q) < 15:
            continue
        cc = c.copy()
        for _ in range(10):  # Gauss-Newton con raggio fisso
            d = q - cc
            dist = np.hypot(*d.T)
            ok = dist > 1e-6
            J = -(d[ok] / dist[ok, None])
            res = dist[ok] - r
            try:
                step, *_ = np.linalg.lstsq(J, -res, rcond=None)
            except np.linalg.LinAlgError:
                break
            cc = cc + step
            if np.hypot(*step) < 1e-5:
                break
        if np.hypot(*(cc - c)) < 0.1:
            out.append((zc, cc))
            c = cc
    return out
