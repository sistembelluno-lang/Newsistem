"""Nuvola di punti su disco.

Al primo caricamento il file originale (anche 10 GB) viene letto una sola volta
e convertito in un file binario compatto (3 float32 per punto, coordinate
relative a un'origine locale). Le volte successive lo stesso file si apre
subito. Le fette per piante e sezioni scorrono il file binario a blocchi,
quindi la memoria usata resta bassa qualunque sia la dimensione della nuvola.
"""

import hashlib
import json
import os
import shutil
import time

import numpy as np

from . import readers

VERSIONE_CACHE = 1
PUNTI_ANTEPRIMA = 3_000_000
BLOCCO_FETTA = 8_000_000


def cartella_cache():
    base = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), ".cache")
    return os.path.join(base, "Nuvola2DXF", "cache")


def _chiave(percorso):
    st = os.stat(percorso)
    testo = f"{os.path.abspath(percorso)}|{st.st_size}|{int(st.st_mtime)}|{VERSIONE_CACHE}"
    return hashlib.sha1(testo.encode("utf-8")).hexdigest()[:16]


class Annullato(Exception):
    pass


class Nuvola:
    def __init__(self, cartella):
        self.cartella = cartella
        with open(os.path.join(cartella, "info.json"), encoding="utf-8") as f:
            self.info = json.load(f)
        self.origine = np.array(self.info["origine"], dtype=np.float64)
        self.n = int(self.info["punti"])
        self.min = np.array(self.info["min"], dtype=np.float64)  # locali
        self.max = np.array(self.info["max"], dtype=np.float64)
        self.punti = np.memmap(
            os.path.join(cartella, "punti.f32"), dtype=np.float32, mode="r", shape=(self.n, 3)
        )
        self.anteprima = np.load(os.path.join(cartella, "anteprima.npy"))

    @property
    def nome(self):
        return os.path.basename(self.info["file"])

    # ------------------------------------------------------------------ import
    @classmethod
    def carica(cls, percorso, avanzamento=None, annulla=None, cache=None):
        """Apre la nuvola, convertendola nella cache se serve.

        avanzamento(frazione 0..1, messaggio); annulla() -> True per fermare.
        """
        cache = cache or cartella_cache()
        dest = os.path.join(cache, _chiave(percorso))
        if os.path.isfile(os.path.join(dest, "info.json")):
            return cls(dest)
        lettore = readers.apri(percorso)
        tmp = dest + ".tmp"
        shutil.rmtree(tmp, ignore_errors=True)
        os.makedirs(tmp, exist_ok=True)
        try:
            cls._converti(lettore, tmp, avanzamento, annulla)
            shutil.rmtree(dest, ignore_errors=True)
            os.replace(tmp, dest)
        except BaseException:
            shutil.rmtree(tmp, ignore_errors=True)
            raise
        return cls(dest)

    @staticmethod
    def _converti(lettore, tmp, avanzamento, annulla):
        stima = max(1, lettore.stima_punti())
        prob = min(1.0, PUNTI_ANTEPRIMA / stima)
        rng = np.random.default_rng(1)
        origine = None
        n = 0
        mn = np.full(3, np.inf)
        mx = np.full(3, -np.inf)
        anteprima = []
        t0 = time.time()
        with open(os.path.join(tmp, "punti.f32"), "wb") as out:
            for blocco in lettore.blocchi():
                if annulla and annulla():
                    raise Annullato()
                blocco = blocco[np.isfinite(blocco).all(axis=1)]
                if not len(blocco):
                    continue
                if origine is None:
                    # origine arrotondata al metro: le coordinate locali in float32
                    # restano precise al decimo di millimetro su chilometri
                    origine = np.floor(blocco.min(axis=0))
                loc = (blocco - origine).astype(np.float32)
                out.write(loc.tobytes())
                n += len(loc)
                mn = np.minimum(mn, loc.min(axis=0))
                mx = np.maximum(mx, loc.max(axis=0))
                if prob < 1.0:
                    anteprima.append(loc[rng.random(len(loc)) < prob])
                else:
                    anteprima.append(loc)
                if avanzamento:
                    fr = min(0.99, n / stima)
                    vel = n / max(0.1, time.time() - t0)
                    avanzamento(fr, f"Conversione: {n:,} punti ({vel / 1e6:.1f} milioni/s)".replace(",", "."))
        if n == 0:
            raise readers.ErroreLettura("Il file non contiene punti validi")
        ant = np.concatenate(anteprima)
        if len(ant) > PUNTI_ANTEPRIMA * 1.5:
            ant = ant[rng.choice(len(ant), PUNTI_ANTEPRIMA, replace=False)]
        np.save(os.path.join(tmp, "anteprima.npy"), ant)
        info = {
            "file": os.path.abspath(lettore.percorso),
            "punti": int(n),
            "origine": origine.tolist(),
            "min": mn.tolist(),
            "max": mx.tolist(),
            "versione": VERSIONE_CACHE,
        }
        with open(os.path.join(tmp, "info.json"), "w", encoding="utf-8") as f:
            json.dump(info, f, indent=1)

    # ------------------------------------------------------------------ fette
    def _scorri(self, filtro, avanzamento=None, annulla=None):
        parti = []
        for k in range(0, self.n, BLOCCO_FETTA):
            if annulla and annulla():
                raise Annullato()
            b = np.asarray(self.punti[k : k + BLOCCO_FETTA])
            sel = filtro(b)
            if sel is not None and len(sel):
                parti.append(sel)
            if avanzamento:
                avanzamento(min(1.0, (k + BLOCCO_FETTA) / self.n), "Taglio della nuvola…")
        if not parti:
            return np.zeros((0, 2))
        return np.concatenate(parti).astype(np.float64)

    def fetta_pianta(self, quota, spessore, riquadro=None, avanzamento=None, annulla=None):
        """Punti con quota (locale) in [quota - s/2, quota + s/2], proiettati in XY.

        riquadro = (xmin, ymin, xmax, ymax) locali per limitare l'area.
        """
        z1, z2 = np.float32(quota - spessore / 2), np.float32(quota + spessore / 2)
        r = None if riquadro is None else np.asarray(riquadro, dtype=np.float32)

        def filtro(b):
            z = b[:, 2]
            m = (z >= z1) & (z <= z2)
            if r is not None:
                x, y = b[:, 0], b[:, 1]
                m &= (x >= r[0]) & (x <= r[2]) & (y >= r[1]) & (y <= r[3])
            return b[m, :2]

        return self._scorri(filtro, avanzamento, annulla)

    def fetta_sezione(self, a, b, spessore, avanzamento=None, annulla=None):
        """Sezione verticale lungo il segmento a-b (XY locali).

        Restituisce coordinate (u, z): u = distanza da a lungo la linea,
        z = quota locale.
        """
        a = np.asarray(a, dtype=np.float64)
        b = np.asarray(b, dtype=np.float64)
        d = b - a
        lung = float(np.hypot(*d))
        if lung <= 0:
            return np.zeros((0, 2))
        t = (d / lung).astype(np.float32)
        nrm = np.array([-t[1], t[0]], dtype=np.float32)
        a32 = a.astype(np.float32)
        mezzo = np.float32(spessore / 2)

        def filtro(blk):
            rel = blk[:, :2] - a32
            v = rel @ nrm
            m = np.abs(v) <= mezzo
            if not m.any():
                return None
            u = rel[m] @ t
            k = (u >= 0) & (u <= lung)
            return np.column_stack((u[k], blk[m][k, 2]))

        return self._scorri(filtro, avanzamento, annulla)

    def fascia(self, a, b, v_min, v_max, avanzamento=None, annulla=None):
        """Punti in una fascia verticale lungo a-b (per i prospetti).

        Restituisce (u, z, v): u = distanza da a lungo la linea, z = quota
        locale, v = distanza dal piano verticale per a-b (positiva a sinistra
        guardando da a verso b).
        """
        a = np.asarray(a, dtype=np.float64)
        b = np.asarray(b, dtype=np.float64)
        d = b - a
        lung = float(np.hypot(*d))
        if lung <= 0:
            return np.zeros((0, 3))
        t = (d / lung).astype(np.float32)
        nrm = np.array([-t[1], t[0]], dtype=np.float32)
        a32 = a.astype(np.float32)
        v1, v2 = np.float32(v_min), np.float32(v_max)

        def filtro(blk):
            rel = blk[:, :2] - a32
            v = rel @ nrm
            m = (v >= v1) & (v <= v2)
            if not m.any():
                return None
            u = rel[m] @ t
            k = (u >= 0) & (u <= lung)
            return np.column_stack((u[k], blk[m][k, 2], v[m][k]))

        out = self._scorri(filtro, avanzamento, annulla)
        return out if out.size else np.zeros((0, 3))

    def scatole(self, scatole, avanzamento=None, annulla=None):
        """Punti dentro più parallelepipedi orientati, in un solo passaggio.

        Ogni scatola: dict(c=(x, y), t=(tx, ty) unitario, hu, hv, z0, z1)
        in coordinate locali. Restituisce per ogni scatola un array (n, 3) con
        (u, v, z): u lungo t, v perpendicolare, z quota locale.
        """
        prep = []
        for s in scatole:
            c = np.asarray(s["c"], dtype=np.float64)
            t = np.asarray(s["t"], dtype=np.float64)
            t = t / np.hypot(*t)
            n = np.array([-t[1], t[0]])
            ang = np.array([c + su * s["hu"] * t + sv * s["hv"] * n for su in (-1, 1) for sv in (-1, 1)])
            prep.append((c, t, n, ang.min(axis=0), ang.max(axis=0), s))
        risultati = [[] for _ in scatole]
        for k in range(0, self.n, BLOCCO_FETTA):
            if annulla and annulla():
                raise Annullato()
            blk = np.asarray(self.punti[k : k + BLOCCO_FETTA], dtype=np.float64)
            ordine = np.argsort(blk[:, 0], kind="stable")
            blk = blk[ordine]
            xs = blk[:, 0]
            for i, (c, t, n, mn, mx, s) in enumerate(prep):
                i0, i1 = np.searchsorted(xs, [mn[0], mx[0]])
                if i1 <= i0:
                    continue
                sub = blk[i0:i1]
                m = (sub[:, 1] >= mn[1]) & (sub[:, 1] <= mx[1]) & (sub[:, 2] >= s["z0"]) & (sub[:, 2] <= s["z1"])
                if not m.any():
                    continue
                sub = sub[m]
                rel = sub[:, :2] - c
                u = rel @ t
                v = rel @ n
                m = (np.abs(u) <= s["hu"]) & (np.abs(v) <= s["hv"])
                if m.any():
                    risultati[i].append(np.column_stack((u[m], v[m], sub[m, 2])))
            if avanzamento:
                avanzamento(min(1.0, (k + BLOCCO_FETTA) / self.n), "Lettura dei punti 3D…")
        return [np.concatenate(r) if r else np.zeros((0, 3)) for r in risultati]

    def istogramma_z(self, bins=400):
        z = self.anteprima[:, 2]
        cont, bordi = np.histogram(z, bins=bins, range=(self.min[2], self.max[2]))
        return cont, bordi


def svuota_cache():
    shutil.rmtree(cartella_cache(), ignore_errors=True)


def dimensione_cache():
    tot = 0
    for radice, _, files in os.walk(cartella_cache()):
        for f in files:
            try:
                tot += os.path.getsize(os.path.join(radice, f))
            except OSError:
                pass
    return tot
