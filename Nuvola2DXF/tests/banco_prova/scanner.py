"""Simulatore di laser scanner terrestre (tipo Trimble X7 / X9) per il banco di prova.

Non fa parte del programma: serve a creare nuvole realistiche di edifici di cui
si conosce la geometria esatta, per misurare dove Nuvola2DXF sbaglia.

Caratteristiche simulate:
- più stazioni; da ogni stazione raggi su una griglia angolare fissa, quindi la
  densità cala con la distanza (come uno scanner vero);
- rumore di distanza che cresce con la distanza e con l'angolo di incidenza
  radente; perdita di punti oltre la portata o con incidenza molto radente;
- vetri: nessun ritorno (il raggio passa), qualche riflesso sparso;
- punti misti sugli spigoli (raggi a cavallo di due superfici);
- superfici irregolari (pietra) con rugosità di qualche centimetro;
- persone di passaggio visibili da una sola stazione.

Richiede open3d (solo per il banco di prova: pip install open3d shapely).
"""

import numpy as np
import open3d as o3d


# ---------------------------------------------------------------- scena
class Scena:
    """Insieme di parallelepipedi (muri, solai, mobili…) con un'etichetta."""

    def __init__(self):
        self.mesh = []      # (TriangleMesh, etichetta, ruvido_m)
        self.vetri = []     # rettangoli verticali (a, b, z0, z1): trasparenti
        self.persone = []   # (x, y, indice stazione che le vede)
        self.vani = []      # verità: dict(c, l, dav, h, tipo, spessore)

    def scatola(self, p0, p1, etichetta, ruvido=0.0, angolo=0.0, perno=None):
        """Parallelepipedo con spigoli p0-p1 (prima della rotazione attorno a z
        di 'angolo' gradi con centro 'perno')."""
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        d = np.maximum(p1 - p0, 1e-4)
        m = o3d.geometry.TriangleMesh.create_box(*d)
        m.translate(p0)
        if angolo:
            c = np.array([*(perno if perno is not None else p0[:2]), 0.0])
            R = o3d.geometry.get_rotation_matrix_from_xyz((0, 0, np.radians(angolo)))
            m.rotate(R, center=c)
        self.mesh.append((m, etichetta, ruvido))

    def muro(self, a, b, spessore, z0, z1, vani=(), etichetta="muro", ruvido=0.0, strombo=0.0):
        """Muro dall'asse a-b, con vani [(s0, s1, zb, zt, tipo)] lungo l'asse
        (s dalla a). strombo: allargamento del vano sul lato interno (m)."""
        a, b = np.asarray(a, float), np.asarray(b, float)
        L = float(np.hypot(*(b - a)))
        ang = np.degrees(np.arctan2(*(b - a)[::-1]))
        h = spessore / 2

        def pezzo(s0, s1, za, zb, y0=-h, y1=h):
            if s1 - s0 < 1e-4 or zb - za < 1e-4:
                return
            self.scatola((a[0] + s0, a[1] + y0, za), (a[0] + s1, a[1] + y1, zb), etichetta, ruvido, ang, a)

        tagli = sorted(vani)
        # con lo strombo il muro è fatto a strati nello spessore: verso il lato
        # interno (y > 0) il vano si allarga
        strati = 4 if strombo > 0 else 1
        for k in range(strati):
            y0 = -h + spessore * k / strati
            y1 = -h + spessore * (k + 1) / strati
            e = strombo * (k + 0.5) / strati if strombo > 0 else 0.0
            s = 0.0
            for s0, s1, zb, zt, tipo in tagli:
                a0, a1 = s0 - e, s1 + e
                pezzo(s, a0, z0, z1, y0, y1)
                pezzo(a0, a1, z0, zb, y0, y1)   # sotto (davanzale; niente per le porte)
                pezzo(a0, a1, zt, z1, y0, y1)   # sopra (architrave)
                s = a1
            pezzo(s, L, z0, z1, y0, y1)
        for s0, s1, zb, zt, tipo in tagli:
            self.vani.append(dict(c=tuple(a + (b - a) / L * (s0 + s1) / 2), l=s1 - s0, dav=zb - z0, h=zt - zb,
                                  tipo="finestre" if tipo == "finestra" else "porte", spessore=spessore))
            if tipo == "finestra":
                pa = a + (b - a) / L * s0
                pb = a + (b - a) / L * s1
                self.vetri.append((pa, pb, zb, zt))

    def colonna(self, x, y, raggio, z0, z1, etichetta="pilastro", ruvido=0.0):
        m = o3d.geometry.TriangleMesh.create_cylinder(raggio, z1 - z0, resolution=48)
        m.translate((x, y, (z0 + z1) / 2))
        self.mesh.append((m, etichetta, ruvido))

    def persona(self, x, y, stazione):
        self.persone.append((x, y, stazione))


def _scena_raycast(scena, stazione_attiva):
    rs = o3d.t.geometry.RaycastingScene()
    info = []
    for m, et, ruv in scena.mesh:
        gid = rs.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(m))
        info.append((gid, et, ruv))
    for x, y, st in scena.persone:
        if st == stazione_attiva:
            c = o3d.geometry.TriangleMesh.create_cylinder(0.22, 1.75)
            c.translate((x, y, 0.875))
            gid = rs.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(c))
            info.append((gid, "persona", 0.0))
    return rs, {g: (e, r) for g, e, r in info}


def _ruvidita(p, ampiezza):
    """Spostamento liscio (pietra, intonaco grezzo) in funzione della posizione."""
    x, y, z = p.T
    return ampiezza * (0.5 * np.sin(7.3 * x + 3.1 * z) * np.cos(5.7 * y - 2.3 * z)
                       + 0.35 * np.sin(17.0 * (x + y) + 11.0 * z) + 0.15 * np.sin(41.0 * z + 29.0 * x))


def scansiona(scena, stazioni, passo_mrad=2.5, portata=80.0, altezza_strumento=1.5,
              rumore_base=0.002, rumore_dist=0.00015, seme=0):
    """Restituisce (punti (n,3), etichette (n,)) unendo tutte le stazioni."""
    rng = np.random.default_rng(seme)
    tutti, etich = [], []
    passo = passo_mrad / 1000.0
    az = np.arange(0, 2 * np.pi, passo)
    el = np.arange(np.radians(-55), np.radians(90), passo)
    A, E = np.meshgrid(az, el, indexing="xy")
    dirs = np.stack((np.cos(E) * np.cos(A), np.cos(E) * np.sin(A), np.sin(E)), axis=-1).reshape(-1, 3)
    for k, st in enumerate(stazioni):
        o = np.array([st[0], st[1], st[2] if len(st) > 2 else altezza_strumento])
        rs, info = _scena_raycast(scena, k)
        raggi = np.hstack((np.broadcast_to(o, dirs.shape), dirs)).astype(np.float32)
        ans = rs.cast_rays(o3d.core.Tensor(raggi))
        t = ans["t_hit"].numpy().astype(np.float64)
        gid = ans["geometry_ids"].numpy()
        nrm = ans["primitive_normals"].numpy().astype(np.float64)
        ok = np.isfinite(t) & (t < portata) & (t > 0.6)
        # vetri: il raggio che li attraversa continua (nessun ritorno dal vetro),
        # ma qualche riflesso resta sul piano del vetro
        cosi = np.abs(np.einsum("ij,ij->i", nrm, dirs))
        ok &= cosi > 0.08  # incidenza troppo radente: nessun ritorno
        ok &= rng.random(len(t)) > np.clip((0.25 - cosi) * 2, 0, 0.5)  # perdite radenti
        idx = np.flatnonzero(ok)
        r = t[idx]
        sigma = (rumore_base + rumore_dist * r) / np.clip(cosi[idx], 0.25, 1)
        r = r + rng.normal(0, 1, len(r)) * sigma
        # punti misti sugli spigoli: dove la distanza salta tra raggi vicini
        img = np.full(t.shape, np.nan)
        img[idx] = t[idx]
        img = img.reshape(A.shape)
        salto = np.zeros(A.shape, bool)
        dif = np.abs(np.diff(img, axis=1))
        salto[:, 1:] |= dif > 0.05
        salto[:, :-1] |= dif > 0.05
        salto = salto.reshape(-1)[idx]
        misti = salto & (rng.random(len(idx)) < 0.25)
        if misti.any():
            ii = np.flatnonzero(misti)
            vicino = np.clip(idx[ii] + 1, 0, len(t) - 1)
            t2 = np.where(np.isfinite(t[vicino]), t[vicino], t[idx[ii]])
            f = rng.random(len(ii))
            r[ii] = t[idx[ii]] * f + t2 * (1 - f)
        P = o + dirs[idx] * r[:, None]
        et = np.array([info.get(int(g), ("?", 0))[0] for g in gid[idx]]) if len(idx) else np.array([])
        ruv = np.array([info.get(int(g), ("?", 0))[1] for g in gid[idx]]) if len(idx) else np.array([])
        if np.any(ruv > 0):
            m = ruv > 0
            P[m] += nrm[idx][m] * _ruvidita(P[m], ruv[m])[:, None]
        tutti.append(P)
        etich.append(et)
        # riflessi sui vetri: pochi punti sparsi sul piano della finestra
        for pa, pb, z0, z1 in scena.vetri:
            n = int(rng.integers(0, 40))
            f = rng.random((n, 2))
            V = np.column_stack((pa + (pb - pa) * f[:, :1], z0 + (z1 - z0) * f[:, 1]))
            tutti.append(V + rng.normal(0, 0.01, V.shape))
            etich.append(np.full(n, "riflesso"))
    return np.vstack(tutti), np.concatenate(etich)
