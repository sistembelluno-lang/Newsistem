"""Lettura delle nuvole di punti a blocchi.

Ogni lettore restituisce le coordinate XYZ (float64, metri) a pezzi, così anche
file da molti GB si leggono senza caricarli interi in memoria.

Formati: LAS, LAZ, E57, PTS, PTX, XYZ/TXT/ASC/CSV, PLY.
"""

import os
import re
from itertools import islice

import numpy as np

CHUNK = 5_000_000

FORMATI = {
    ".las": "LAS",
    ".laz": "LAZ (LAS compresso)",
    ".e57": "E57",
    ".pts": "PTS (Leica / Trimble RealWorks)",
    ".ptx": "PTX (scansioni strutturate)",
    ".xyz": "XYZ testo",
    ".txt": "Testo XYZ",
    ".asc": "ASCII XYZ",
    ".csv": "CSV XYZ",
    ".ply": "PLY",
}

FILTRO_FILE = (
    "Nuvole di punti (" + " ".join("*" + e for e in FORMATI) + ");;"
    + ";;".join(f"{d} (*{e})" for e, d in FORMATI.items())
    + ";;Tutti i file (*.*)"
)


class ErroreLettura(Exception):
    pass


def apri(percorso):
    """Restituisce il lettore adatto all'estensione del file."""
    est = os.path.splitext(percorso)[1].lower()
    if est in (".las", ".laz"):
        return LettoreLAS(percorso)
    if est == ".e57":
        return LettoreE57(percorso)
    if est == ".ptx":
        return LettorePTX(percorso)
    if est == ".ply":
        return LettorePLY(percorso)
    if est in (".pts", ".xyz", ".txt", ".asc", ".csv"):
        return LettoreTesto(percorso)
    raise ErroreLettura(f"Formato non supportato: {est or 'senza estensione'}")


class Lettore:
    def __init__(self, percorso):
        self.percorso = percorso
        self.dimensione = os.path.getsize(percorso)

    def stima_punti(self):
        """Numero di punti (anche approssimato) per la barra di avanzamento."""
        raise NotImplementedError

    def blocchi(self):
        """Generatore di array (n, 3) float64."""
        raise NotImplementedError


class LettoreLAS(Lettore):
    def __init__(self, percorso):
        super().__init__(percorso)
        import laspy

        self._laspy = laspy
        try:
            with laspy.open(percorso) as f:
                self._n = int(f.header.point_count)
        except Exception as e:  # file rovinato o LAZ senza decompressore
            raise ErroreLettura(f"File LAS/LAZ non leggibile: {e}") from e

    def stima_punti(self):
        return self._n

    def blocchi(self):
        with self._laspy.open(self.percorso) as f:
            for pts in f.chunk_iterator(CHUNK):
                yield np.column_stack(
                    (np.asarray(pts.x), np.asarray(pts.y), np.asarray(pts.z))
                ).astype(np.float64, copy=False)


class LettoreE57(Lettore):
    def __init__(self, percorso):
        super().__init__(percorso)
        import pye57

        try:
            self._e57 = pye57.E57(percorso)
            self._n_scan = self._e57.scan_count
            self._n = sum(
                int(self._e57.get_header(i).point_count) for i in range(self._n_scan)
            )
        except Exception as e:
            raise ErroreLettura(f"File E57 non leggibile: {e}") from e

    def stima_punti(self):
        return self._n

    def blocchi(self):
        for i in range(self._n_scan):
            h = self._e57.get_header(i)
            raw = self._e57.read_scan_raw(i)
            if "cartesianX" in raw:
                xyz = np.column_stack(
                    (raw["cartesianX"], raw["cartesianY"], raw["cartesianZ"])
                ).astype(np.float64)
                invalido = raw.get("cartesianInvalidState")
            elif "sphericalRange" in raw:
                r = np.asarray(raw["sphericalRange"], dtype=np.float64)
                az = np.asarray(raw["sphericalAzimuth"], dtype=np.float64)
                el = np.asarray(raw["sphericalElevation"], dtype=np.float64)
                ce = np.cos(el)
                xyz = np.column_stack((r * ce * np.cos(az), r * ce * np.sin(az), r * np.sin(el)))
                invalido = raw.get("sphericalInvalidState")
            else:
                continue
            del raw
            if invalido is not None:
                xyz = xyz[np.asarray(invalido) == 0]
            if h.has_pose():
                xyz = xyz @ np.asarray(h.rotation_matrix, dtype=np.float64).T + np.asarray(
                    h.translation, dtype=np.float64
                )
            for k in range(0, len(xyz), CHUNK):
                yield xyz[k : k + CHUNK]


_NUMERO = re.compile(rb"^\s*[-+]?(\d|\.\d)")


class LettoreTesto(Lettore):
    """XYZ, TXT, ASC, CSV e PTS: prime tre colonne numeriche = X Y Z.

    Le righe che non iniziano con un numero (intestazioni) sono ignorate, così
    come le righe con un solo valore (il conteggio dei punti nei file PTS).
    """

    def __init__(self, percorso):
        super().__init__(percorso)
        self._sep, self._salta, self._byte_riga = self._analizza()

    def _analizza(self):
        with open(self.percorso, "rb") as f:
            campione = list(islice(f, 2000))
        if not campione:
            raise ErroreLettura("Il file è vuoto")
        salta = 0
        for riga in campione:
            if _NUMERO.match(riga) and len(re.split(rb"[\s,;]+", riga.strip())) >= 3:
                break
            salta += 1
        else:
            raise ErroreLettura("Nel file non ci sono righe con almeno tre numeri (X Y Z)")
        dati = campione[salta]
        if b";" in dati:
            sep = ";"
        elif b"," in dati:
            sep = ","
        else:
            sep = r"\s+"
        utili = campione[salta:] or campione
        byte_riga = max(1.0, sum(len(r) for r in utili) / len(utili))
        divisore = rb"[\s,;]+" if sep != ";" else rb"\s*;\s*"
        self._colonne = max(len(re.split(divisore, r.strip())) for r in utili)
        return sep, salta, byte_riga

    def stima_punti(self):
        return int(self.dimensione / self._byte_riga)

    def blocchi(self):
        import pandas as pd

        lettore = pd.read_csv(
            self.percorso,
            sep=self._sep,
            header=None,
            names=list(range(self._colonne)),
            skiprows=self._salta,
            chunksize=CHUNK,
            engine="c",
            skipinitialspace=True,
            on_bad_lines="skip",
            low_memory=True,
        )
        for df in lettore:
            df = df.iloc[:, :3]
            arr = df.apply(pd.to_numeric, errors="coerce").to_numpy(dtype=np.float64)
            arr = arr[np.isfinite(arr).all(axis=1)]
            if len(arr):
                yield arr


class LettorePTX(Lettore):
    """PTX: per ogni scansione 10 righe di intestazione (colonne, righe,
    posizione e assi dello scanner, matrice 4x4) seguite dai punti locali."""

    def stima_punti(self):
        return int(self.dimensione / 40)

    def blocchi(self):
        with open(self.percorso, "rb") as f:
            while True:
                intest = list(islice(f, 10))
                if len(intest) < 10:
                    return
                try:
                    colonne = int(intest[0].split()[0])
                    righe = int(intest[1].split()[0])
                    m = np.array([[float(v) for v in r.split()[:4]] for r in intest[6:10]])
                except (ValueError, IndexError) as e:
                    raise ErroreLettura("Intestazione PTX non valida") from e
                rot, trasl = m[:3, :3], m[3, :3]
                restanti = colonne * righe
                while restanti > 0:
                    n = min(restanti, CHUNK)
                    righe_testo = list(islice(f, n))
                    if not righe_testo:
                        return
                    restanti -= len(righe_testo)
                    ncol = len(righe_testo[0].split())
                    valori = np.array(b" ".join(r.strip() for r in righe_testo).split(), dtype=np.float64)
                    if ncol < 3 or valori.size % ncol:
                        valori = np.array(
                            [r.split()[:3] for r in righe_testo if len(r.split()) >= 3],
                            dtype=np.float64,
                        )
                        ncol = 3
                    xyz = valori.reshape(-1, ncol)[:, :3]
                    xyz = xyz[np.any(xyz != 0, axis=1)]  # 0 0 0 = punto mancante
                    if len(xyz):
                        yield xyz @ rot + trasl


_TIPI_PLY = {
    "char": "i1", "int8": "i1", "uchar": "u1", "uint8": "u1",
    "short": "i2", "int16": "i2", "ushort": "u2", "uint16": "u2",
    "int": "i4", "int32": "i4", "uint": "u4", "uint32": "u4",
    "float": "f4", "float32": "f4", "double": "f8", "float64": "f8",
}


class LettorePLY(Lettore):
    def __init__(self, percorso):
        super().__init__(percorso)
        with open(percorso, "rb") as f:
            if f.readline().strip() != b"ply":
                raise ErroreLettura("Non è un file PLY")
            self._formato, elementi, corrente = None, [], None
            while True:
                riga = f.readline()
                if not riga:
                    raise ErroreLettura("Intestazione PLY incompleta")
                p = riga.decode("ascii", "replace").split()
                if not p:
                    continue
                if p[0] == "format":
                    self._formato = p[1]
                elif p[0] == "element":
                    corrente = [p[1], int(p[2]), []]
                    elementi.append(corrente)
                elif p[0] == "property" and corrente is not None:
                    if p[1] == "list":
                        corrente[2].append((p[-1], None))
                    else:
                        corrente[2].append((p[2], _TIPI_PLY.get(p[1], "f4")))
                elif p[0] == "end_header":
                    self._inizio = f.tell()
                    break
        if not elementi or elementi[0][0] != "vertex":
            raise ErroreLettura("Il PLY non inizia con i vertici")
        self._n = elementi[0][1]
        self._prop = elementi[0][2]
        if any(t is None for _, t in self._prop):
            raise ErroreLettura("PLY con liste nei vertici non supportato")
        nomi = [n for n, _ in self._prop]
        if not {"x", "y", "z"} <= set(nomi):
            raise ErroreLettura("Il PLY non contiene x, y, z")

    def stima_punti(self):
        return self._n

    def blocchi(self):
        if self._formato == "ascii":
            nomi = [n for n, _ in self._prop]
            ix = [nomi.index(c) for c in "xyz"]
            with open(self.percorso, "rb") as f:
                f.seek(self._inizio)
                restanti = self._n
                while restanti > 0:
                    righe = list(islice(f, min(restanti, CHUNK)))
                    if not righe:
                        return
                    restanti -= len(righe)
                    arr = np.array([r.split() for r in righe], dtype=np.float64)
                    yield arr[:, ix]
            return
        ordine = "<" if self._formato == "binary_little_endian" else ">"
        dt = np.dtype([(n, ordine + t) for n, t in self._prop])
        mm = np.memmap(self.percorso, dtype=dt, mode="r", offset=self._inizio, shape=(self._n,))
        for k in range(0, self._n, CHUNK):
            b = mm[k : k + CHUNK]
            yield np.column_stack((b["x"], b["y"], b["z"])).astype(np.float64)
