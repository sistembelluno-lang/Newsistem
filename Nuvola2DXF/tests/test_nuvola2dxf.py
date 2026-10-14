import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sintetici  # noqa: E402
from nuvola2dxf import elabora, esporta, nuvola, readers  # noqa: E402
from nuvola2dxf.geometria import Polilinea, punti_arco  # noqa: E402
from nuvola2dxf.parametri import PROFILI  # noqa: E402

SQUADRATO, DRITTO, STORICO = (PROFILI[k] for k in list(PROFILI)[:3])


def _ruota(P, gradi, spost=(0, 0)):
    a = np.radians(gradi)
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    return P @ R.T + spost, R


def _stanza(rng, n=10000):
    return sintetici.campiona_spezzata([(0, 0), (5, 0), (5, 4), (0, 4)], n, rng) + rng.normal(0, 0.004, (n, 2))


@pytest.mark.parametrize("profilo", [SQUADRATO, DRITTO, STORICO])
def test_stanza_diventa_quattro_linee(profilo):
    """10.000 punti di una stanza 5x4 ruotata: una polilinea chiusa di 4 lati
    con gli spigoli al posto giusto."""
    rng = np.random.default_rng(0)
    P, R = _ruota(_stanza(rng), 17, (512340.0, 4987650.0))
    out = elabora.estrai(P, profilo)
    assert len(out) == 1
    p = out[0]
    assert p.chiusa and len(p.punti) == 4
    assert not np.any(p.bulge)
    loc = (p.punti - (512340.0, 4987650.0)) @ R
    attesi = np.array([(0, 0), (5, 0), (5, 4), (0, 4)])
    for v in attesi:
        assert np.min(np.hypot(*(loc - v).T)) < 0.01


def test_appartamento_muri_porte_e_arredi():
    rng = np.random.default_rng(1)
    P = sintetici.appartamento(rng)
    out = elabora.estrai(P, SQUADRATO)
    # perimetro esterno + contorno interno delle due stanze unite dalla porta
    assert len(out) == 2
    assert all(p.chiusa for p in out)
    # l'esterno è quello che racchiude l'area maggiore
    area = lambda p: np.ptp(p.punti[:, 0]) * np.ptp(p.punti[:, 1])
    esterno = max(out, key=area)
    assert len(esterno.punti) == 4
    interno = min(out, key=area)
    # 4+4 angoli delle stanze + 4 angoli delle spallette della porta
    assert len(interno.punti) == 12
    # la porta resta aperta: nessun vertice dentro il vano (y tra 1.6 e 2.3)
    assert not np.any((interno.punti[:, 1] > 1.6) & (interno.punti[:, 1] < 2.3))


def test_colonna_diventa_cerchio():
    rng = np.random.default_rng(2)
    a = rng.random(3000) * 2 * np.pi
    P = np.column_stack((10 + 0.4 * np.cos(a), 3 + 0.4 * np.sin(a))) + rng.normal(0, 0.003, (3000, 2))
    out = elabora.estrai(P, STORICO)
    assert len(out) == 1 and out[0].tipo == "cerchio"
    c = out[0].punti.mean(axis=0)
    r = np.hypot(*(out[0].punti[0] - out[0].punti[1])) / 2
    assert np.hypot(*(c - (10, 3))) < 0.01 and abs(r - 0.4) < 0.01


def test_chiesa_abside_e_colonne():
    rng = np.random.default_rng(3)
    P = sintetici.chiesa(rng)
    out = elabora.estrai(P, STORICO)
    cerchi = [p for p in out if p.tipo == "cerchio"]
    assert len(cerchi) == 6
    perimetro = max(out, key=lambda p: p.lunghezza())
    assert perimetro.chiusa
    # l'abside è un arco quasi semicircolare (bulge vicino a 1)
    assert np.max(np.abs(perimetro.bulge)) > 0.9
    # lunghezza attesa: 2*20 + 10 + pi*5 ≈ 65.7 m
    assert abs(perimetro.lunghezza() - (50 + np.pi * 5)) < 1.0


def test_punti_arco_semicerchio():
    pts = punti_arco(np.array([1.0, 0.0]), np.array([-1.0, 0.0]), 1.0, 0.01)
    assert np.allclose(np.hypot(*pts.T), 1.0, atol=1e-9)
    assert pts[:, 1].max() > 0.99  # antiorario: passa per (0, 1)


# ---------------------------------------------------------------- lettura e taglio
@pytest.fixture
def cartella(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "cache"))
    return tmp_path


BASE = np.array([600000.0, 5000000.0, 100.0])


def _scatola(rng, n=200_000, base=BASE):
    """Stanza 4x3 alta 3 m (solo muri) con coordinate georeferenziate."""
    s = rng.random(n) * 14
    xy = np.zeros((n, 2))
    xy[s < 4] = np.column_stack((s[s < 4], np.zeros((s < 4).sum())))
    m = (s >= 4) & (s < 7)
    xy[m] = np.column_stack((np.full(m.sum(), 4.0), s[m] - 4))
    m = (s >= 7) & (s < 11)
    xy[m] = np.column_stack((11 - s[m], np.full(m.sum(), 3.0)))
    m = s >= 11
    xy[m] = np.column_stack((np.zeros(m.sum()), 14 - s[m]))
    P = np.column_stack((xy, rng.random(n) * 3)) + rng.normal(0, 0.002, (n, 3))
    return P + base


def _scrivi(formato, percorso, P):
    if formato in ("las", "laz"):
        import laspy

        h = laspy.LasHeader(point_format=3, version="1.2")
        h.offsets = np.floor(P.min(axis=0))
        h.scales = np.array([0.001] * 3)
        las = laspy.LasData(h)
        las.x, las.y, las.z = P.T
        las.write(percorso)
    elif formato == "pts":
        with open(percorso, "w") as f:
            f.write(f"{len(P)}\n")
            np.savetxt(f, np.column_stack((P, np.zeros((len(P), 4)))), fmt="%.4f")
    elif formato == "xyz":
        np.savetxt(percorso, P, fmt="%.4f")
    elif formato == "csv":
        with open(percorso, "w") as f:
            f.write("X,Y,Z\n")
            np.savetxt(f, P, fmt="%.4f", delimiter=",")
    elif formato == "ptx":
        with open(percorso, "w") as f:
            f.write(f"{len(P)}\n1\n0 0 0\n1 0 0\n0 1 0\n0 0 1\n")
            f.write("1 0 0 0\n0 1 0 0\n0 0 1 0\n")
            f.write(f"{P[0, 0] - 1:.4f} {P[0, 1] - 1:.4f} {P[0, 2] - 1:.4f} 1\n")
            np.savetxt(f, np.column_stack((P - (P[0] - 1), np.full(len(P), 0.5))), fmt="%.4f")
    elif formato == "ply":
        with open(percorso, "wb") as f:
            f.write(f"ply\nformat binary_little_endian 1.0\nelement vertex {len(P)}\n"
                    "property double x\nproperty double y\nproperty double z\nend_header\n".encode())
            f.write(P.astype("<f8").tobytes())
    elif formato == "e57":
        import pye57

        e = pye57.E57(percorso, mode="w")
        e.write_scan_raw({"cartesianX": P[:, 0], "cartesianY": P[:, 1], "cartesianZ": P[:, 2]})
        e.close()


@pytest.mark.parametrize("formato", ["las", "laz", "pts", "xyz", "csv", "ptx", "ply", "e57"])
def test_formati_e_pianta(cartella, formato):
    rng = np.random.default_rng(4)
    # pye57 scrive le coordinate in float32: per il file di prova servono
    # coordinate piccole (i rilievi veri usano la doppia precisione)
    base = np.array([100.0, 200.0, 100.0]) if formato == "e57" else BASE
    P = _scatola(rng, 60_000, base)
    f = cartella / f"stanza.{formato}"
    _scrivi(formato, str(f), P)
    nv = nuvola.Nuvola.carica(str(f))
    assert nv.n == len(P)
    assert np.allclose(nv.min + nv.origine, P.min(axis=0), atol=0.002)
    q = 101.5 - nv.origine[2]
    fetta = nv.fetta_pianta(q, 0.05)
    assert 0 < len(fetta) < len(P) * 0.05
    out = elabora.estrai(fetta, SQUADRATO)
    assert len(out) == 1 and out[0].chiusa and len(out[0].punti) == 4
    reali = out[0].punti + nv.origine[:2] - base[:2]
    for v in [(0, 0), (4, 0), (4, 3), (0, 3)]:
        assert np.min(np.hypot(*(reali - v).T)) < 0.01


def test_sezione_e_dxf(cartella):
    import ezdxf

    rng = np.random.default_rng(5)
    P = _scatola(rng)
    f = cartella / "stanza.las"
    _scrivi("las", str(f), P)
    nv = nuvola.Nuvola.carica(str(f))
    # la seconda apertura usa l'archivio (stessa cartella)
    assert nuvola.Nuvola.carica(str(f)).cartella == nv.cartella
    a = np.array([600002.0, 4999999.0]) - nv.origine[:2]
    b = np.array([600002.0, 5000004.0]) - nv.origine[:2]
    sez = nv.fetta_sezione(a, b, 0.05)
    assert len(sez) > 100
    # i muri tagliati sono a 1 m e 4 m da A
    u = sez[:, 0]
    assert np.all((np.abs(u - 1) < 0.05) | (np.abs(u - 4) < 0.05))
    out = elabora.estrai(sez, SQUADRATO)
    assert len(out) == 2
    dxf = cartella / "sezione.dxf"
    esporta.esporta(str(dxf), out, "sezione", nv.origine, polilinee_unite=False, note=["prova"])
    doc = ezdxf.readfile(str(dxf))
    linee = [e for e in doc.modelspace() if e.dxftype() == "LINE"]
    assert len(linee) == 2
    for e in linee:
        assert abs(e.dxf.start.x - e.dxf.end.x) < 0.01  # verticali
        assert min(e.dxf.start.y, e.dxf.end.y) < 100.05 and max(e.dxf.start.y, e.dxf.end.y) > 102.95


def test_dxf_pianta_coordinate_reali_e_archi(tmp_path):
    import ezdxf

    poli = [
        Polilinea([(0, 0), (4, 0), (4, 3), (0, 3)], chiusa=True),
        Polilinea([(10, 0), (10, 2)], [1.0, 0.0], tipo="curva"),
        Polilinea([(20.5, 1), (19.5, 1)], [1.0, 1.0], chiusa=True, tipo="cerchio"),
    ]
    origine = (512000.0, 4987000.0, 150.0)
    for unite in (True, False):
        f = tmp_path / f"p{unite}.dxf"
        esporta.esporta(str(f), poli, "pianta", origine, quota=1.0, quota_reale=True,
                        punti=np.zeros((10, 2)), polilinee_unite=unite)
        doc = ezdxf.readfile(str(f))
        tipi = [e.dxftype() for e in doc.modelspace()]
        assert tipi.count("CIRCLE") == 1 and tipi.count("POINT") == 10
        if unite:
            pl = [e for e in doc.modelspace() if e.dxftype() == "LWPOLYLINE"]
            assert len(pl) == 2 and pl[0].closed
            x, y = pl[0].get_points("xy")[1]
            assert (x, y) == (512004.0, 4987000.0)
            assert abs(pl[0].dxf.elevation - 151.0) < 1e-9
        else:
            assert tipi.count("LINE") == 4 and tipi.count("ARC") == 1
            arco = next(e for e in doc.modelspace() if e.dxftype() == "ARC")
            assert abs(arco.dxf.radius - 1.0) < 1e-9


def test_formato_sconosciuto(tmp_path):
    f = tmp_path / "a.doc"
    f.write_text("x")
    with pytest.raises(readers.ErroreLettura):
        readers.apri(str(f))


# ---------------------------------------------------------------- riconoscimento, piombo, prospetto
@pytest.fixture(scope="module")
def edificio(tmp_path_factory):
    cart = tmp_path_factory.mktemp("edificio")
    os.environ["LOCALAPPDATA"] = str(cart / "cache")
    rng = np.random.default_rng(5)
    P = sintetici.edificio3d(rng, densita=2000) + (700000.0, 4000000.0, 50.0)
    f = cart / "edificio.las"
    _scrivi("las", str(f), P)
    return nuvola.Nuvola.carica(str(f))


BASE_E = np.array([700000.0, 4000000.0])


def test_pianta_porte_finestre_pilastri(edificio):
    from nuvola2dxf import classifica

    nv = edificio
    q = 51.2 - nv.origine[2]
    fet = nv.fetta_pianta(q, 0.05)
    poli = elabora.estrai(fet, SQUADRATO)
    poli, aperture = classifica.classifica_pianta(poli, fet, nv, q)
    trovate = {(ap["categoria"], tuple(np.round(ap["c"] + nv.origine[:2] - BASE_E, 1))) for ap in aperture}
    assert trovate == {
        ("porte", (5.2, 2.0)),      # divisorio (5.15, 1.95)
        ("porte", (7.0, -0.2)),     # ingresso a sud
        ("finestre", (2.1, -0.2)),  # finestra sud
        ("finestre", (2.6, 4.2)),   # finestra nord
    } or len(aperture) == 4 and sorted(a["categoria"] for a in aperture) == ["finestre", "finestre", "porte", "porte"]
    assert sum(p.categoria == "pilastri" for p in poli) == 1


def test_fuori_piombo_pianta(edificio):
    from nuvola2dxf import classifica, piombo

    nv = edificio
    q = 51.2 - nv.origine[2]
    fet = nv.fetta_pianta(q, 0.05)
    poli, _ = classifica.classifica_pianta(elabora.estrai(fet, SQUADRATO), fet, nv, q)
    linee, testi, report = piombo.piombo_pianta(nv, poli, q)
    grandi = sorted((abs(r["scostamento"]) for r in report), reverse=True)
    # parete est inclinata di 3 cm e pilastro di 2 cm su 3 m; le altre a piombo
    assert abs(grandi[0] - 0.03) < 0.004
    assert abs(grandi[1] - 0.02) < 0.004
    assert grandi[2] < 0.004
    assert len(testi) == 2  # solo gli scostamenti oltre la soglia sono disegnati


def test_sezione_pavimento_soffitto_porta_piombo(edificio):
    from nuvola2dxf import classifica, piombo

    nv = edificio
    a = np.array([-1.0, 2.0]) + BASE_E - nv.origine[:2]
    b = np.array([9.5, 2.0]) + BASE_E - nv.origine[:2]
    sez = nv.fetta_sezione(a, b, 0.05)
    poli = classifica.classifica_sezione(elabora.estrai(sez, SQUADRATO), sez)
    lung = {}
    for p in poli:
        lung[p.categoria] = lung.get(p.categoria, 0) + p.lunghezza()
    # pavimento e soffitto delle due stanze (5 + 3 m, meno eventuali buchi)
    assert 7.0 < lung.get("pavimenti", 0) <= 8.1 and 7.0 < lung.get("soffitti", 0) <= 8.1
    assert lung.get("solai", 0) == 0
    porte = [p for p in poli if p.categoria == "porte"]
    assert porte and all(5.9 < p.punti[:, 0].mean() < 6.4 for p in porte)  # nel divisorio
    _, _, report = piombo.piombo_sezione(poli, sez)
    massimo = max(report, key=lambda r: abs(r["scostamento"]))
    assert abs(massimo["scostamento"] - 0.03) < 0.004  # verso B (est)


def test_sezione_finestre(edificio):
    from nuvola2dxf import classifica

    nv = edificio
    a = np.array([2.1, -1.0]) + BASE_E - nv.origine[:2]
    b = np.array([2.1, 5.0]) + BASE_E - nv.origine[:2]
    sez = nv.fetta_sezione(a, b, 0.05)
    poli = classifica.classifica_sezione(elabora.estrai(sez, SQUADRATO), sez)
    vetri = [p for p in poli if p.categoria == "finestre" and abs(p.punti[0, 0] - p.punti[1, 0]) < 0.01]
    assert len(vetri) == 2
    for p in vetri:  # vano da 0.9 a 2.1 m sul pavimento
        z0, z1 = sorted(p.punti[:, 1] + nv.origine[2] - 50.0)
        assert abs(z0 - 0.9) < 0.03 and abs(z1 - 2.1) < 0.03


def test_prospetto_sud(edificio):
    from nuvola2dxf import prospetto

    nv = edificio
    a = np.array([-1.0, -0.6]) + BASE_E - nv.origine[:2]
    b = np.array([9.5, -0.45]) + BASE_E - nv.origine[:2]
    a, b = prospetto.allinea_facciata(nv.anteprima, a, b)
    assert abs((a + nv.origine[:2] - BASE_E)[1] + 0.3) < 0.01
    assert abs((b + nv.origine[:2] - BASE_E)[1] + 0.3) < 0.01
    fa = nv.fascia(a, b, -0.5, 1.0)
    _, poli = prospetto.estrai_prospetto(fa, SQUADRATO)
    cat = {p.categoria: p for p in poli}
    assert set(cat) == {"muri", "porte", "finestre"}
    x0 = (a + nv.origine[:2] - BASE_E)[0]  # u = 0 in A
    fin = cat["finestre"].punti
    assert abs(fin[:, 0].min() + x0 - 1.5) < 0.05 and abs(fin[:, 0].max() + x0 - 2.7) < 0.05
    assert abs(fin[:, 1].min() + nv.origine[2] - 50.9) < 0.05 and abs(fin[:, 1].max() + nv.origine[2] - 52.1) < 0.05
    porta = cat["porte"].punti
    assert abs(porta[:, 0].min() + x0 - 6.5) < 0.05 and abs(porta[:, 1].max() + nv.origine[2] - 52.2) < 0.05


def test_stanze_chiuse_con_mobili_e_ombre():
    """Appartamento con armadi che nascondono angoli e tratti di muro, rumore
    e densità variabile: le stanze si chiudono e le chiusure lunghe vanno nel
    layer da verificare."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "bench"))
    import difficili
    from collections import Counter

    for seme in range(2):
        out = elabora.estrai(difficili.pianta(np.random.default_rng(seme)), SQUADRATO)
        estremi = Counter()
        for p in out:
            if not p.chiusa:
                for e in (p.punti[0], p.punti[-1]):
                    estremi[(round(e[0], 4), round(e[1], 4))] += 1
        assert sum(1 for v in estremi.values() if v == 1) <= 4
        chiusure = [p for p in out if p.categoria == "chiusure"]
        assert chiusure and all(p.lunghezza() > 0.1 for p in chiusure)


def test_pianta_misure_dei_vani(edificio):
    """La sezione automatica in ogni vano dà davanzale e altezza."""
    from nuvola2dxf import classifica

    nv = edificio
    q = 51.2 - nv.origine[2]
    fet = nv.fetta_pianta(q, 0.05)
    _, aperture = classifica.classifica_pianta(elabora.estrai(fet, SQUADRATO), fet, nv, q)
    for ap in aperture:
        if ap["categoria"] == "finestre":  # vano da 0.9 a 2.1 m
            assert abs(ap["davanzale"] - 0.9) < 0.05 and abs(ap["altezza"] - 1.2) < 0.08
        else:  # porte alte 2.1 e 2.2 m
            assert ap["davanzale"] < 0.1 and 2.0 < ap["altezza"] < 2.3
    testi = [t.testo for t in classifica.testi_aperture(aperture)]
    assert sum(t.startswith("F ") and "dav." in t for t in testi) == 2
    assert sum(t.startswith("P ") for t in testi) == 2


def test_sezione_porta_con_anta_chiusa():
    from nuvola2dxf import classifica

    rng = np.random.default_rng(3)
    s = lambda a, b: sintetici.segmento(a, b, 1500, rng)
    P = np.vstack([
        s((0, 0), (4, 0)), s((4.3, 0), (8, 0)),            # pavimenti
        s((0, 3), (4, 3)), s((4.3, 3), (8, 3)),            # soffitti
        s((4, 2.1), (4, 3)), s((4.3, 2.1), (4.3, 3)),      # muro sopra la porta
        s((4, 2.1), (4.3, 2.1)),                           # architrave
        s((4.15, 0.01), (4.15, 2.08)),                     # anta chiusa
        s((0, 0), (0, 3)), s((8, 0), (8, 3)),
    ])
    P = P + rng.normal(0, 0.003, P.shape)
    poli = classifica.classifica_sezione(elabora.estrai(P, SQUADRATO), P)
    porte = [p for p in poli if p.categoria == "porte"]
    assert porte
    anta = [p for p in porte if abs(p.punti[:, 0].mean() - 4.15) < 0.03 and p.lunghezza() > 1.5]
    assert anta


TABIA = PROFILI[[k for k in PROFILI if k.startswith("Tabià")][0]]


def test_tabia_sezione_legno():
    from nuvola2dxf import classifica

    P = sintetici.tabia_sezione(np.random.default_rng(1))
    poli = classifica.classifica_legno(classifica.classifica_sezione(elabora.estrai(P, TABIA), P), "sezione")
    lung = {}
    for p in poli:
        lung[p.categoria] = lung.get(p.categoria, 0) + p.lunghezza()
    # tavolato del solaio (2 facce da 7 m) e pareti in tavole (4 facce da ~3 m)
    assert lung.get("tavolati", 0) > 20
    # 7 travi del solaio (U da ~0.5 m) e 2 puntoni da ~4 m
    assert lung.get("travi", 0) > 10
    # ballatoio: tavolato e mensola (4 facce da 1.3 m) e parapetto
    assert lung.get("ballatoi", 0) > 5
    # il basamento in pietra resta muro
    muri = [p for p in poli if p.categoria == "muri"]
    assert sum(p.lunghezza() for p in muri) > 8
    # i ballatoi stanno fuori dal filo dei muri
    for p in poli:
        if p.categoria == "ballatoi":
            assert p.punti[:, 0].min() >= 5.95


def test_tabia_pianta_pareti_in_tavole():
    from nuvola2dxf import classifica

    rng = np.random.default_rng(2)
    # stanza 5x4 con pareti in tavole da 3 cm: due facce per lato
    P = np.vstack([sintetici.campiona_spezzata([(0, 0), (5, 0), (5, 4), (0, 4)], 20000, rng),
                   sintetici.campiona_spezzata([(-0.03, -0.03), (5.03, -0.03), (5.03, 4.03), (-0.03, 4.03)], 20000, rng)])
    P = P + rng.normal(0, 0.002, P.shape)
    poli = classifica.classifica_legno(elabora.estrai(P, TABIA), "pianta")
    assert {p.categoria for p in poli} == {"tavolati"}
    assert sum(p.lunghezza() for p in poli) > 34
