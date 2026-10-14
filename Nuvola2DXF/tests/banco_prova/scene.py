"""Edifici di prova con la loro verità a terra (pianta esatta, porte e finestre)."""

from scanner import Scena


def appartamento():
    """Appartamento 12 x 8 m: soggiorno-cucina e tre camere, muri esterni 30 cm,
    tramezzi 12 cm, porte con ante in varie posizioni, finestre con vetro,
    mobili alti contro i muri (frigorifero, armadi, libreria), una persona."""
    sc = Scena()
    H = 2.7
    sc.scatola((-0.5, -0.5, -0.2), (12.5, 8.5, 0.0), "pavimento")
    sc.scatola((-0.5, -0.5, H), (12.5, 8.5, H + 0.25), "soffitto")
    F = "finestra"
    P = "porta"
    # muri esterni (asse a 15 cm dal filo interno)
    sc.muro((-0.15, -0.15), (12.15, -0.15), 0.30, 0, H, [(1.65, 2.85, 0.9, 2.2, F), (8.15, 9.55, 0.9, 2.2, F)])
    sc.muro((12.15, -0.15), (12.15, 8.15), 0.30, 0, H, [(1.65, 2.85, 0.9, 2.2, F)])
    sc.muro((12.15, 8.15), (-0.15, 8.15), 0.30, 0, H, [(1.15, 2.35, 0.9, 2.2, F), (9.15, 10.35, 0.9, 2.2, F)])
    sc.muro((-0.15, 8.15), (-0.15, -0.15), 0.30, 0, H, [(1.65, 2.65, 0.0, 2.1, P)])
    # tramezzi
    sc.muro((5.06, 0.0), (5.06, 8.0), 0.12, 0, H, [(2.0, 2.9, 0.0, 2.1, P)])
    sc.muro((5.12, 4.56), (12.0, 4.56), 0.12, 0, H, [(0.9, 1.8, 0.0, 2.1, P), (4.9, 5.8, 0.0, 2.1, P)])
    sc.muro((8.56, 4.62), (8.56, 8.0), 0.12, 0, H, [(1.4, 2.3, 0.0, 2.1, P)])
    # ante delle porte: aperta a 90°, aperta a 30°, chiusa, socchiusa
    sc.scatola((5.0, 2.0, 0.01), (5.04, 2.9, 2.08), "anta", angolo=-90, perno=(5.0, 2.0))
    sc.scatola((6.02, 4.5, 0.01), (6.92, 4.54, 2.08), "anta", angolo=30, perno=(6.02, 4.5))
    sc.scatola((10.02, 4.54, 0.01), (10.92, 4.58, 2.08), "anta")                    # chiusa
    sc.scatola((8.62, 6.02, 0.01), (8.66, 6.92, 2.08), "anta", angolo=-60, perno=(8.62, 6.02))
    # arredi
    sc.scatola((0.0, 7.3, 0), (0.7, 8.0, 1.9), "arredo")          # frigorifero nell'angolo
    sc.scatola((0.0, 2.8, 0), (0.6, 5.2, 0.9), "arredo")          # cucina bassa
    sc.scatola((0.0, 2.8, 1.5), (0.35, 5.2, 2.2), "arredo")       # pensili
    sc.scatola((1.8, 1.2, 0.72), (3.4, 2.1, 0.76), "arredo")      # tavolo (piano)
    for x, y in ((1.85, 1.25), (3.3, 1.25), (1.85, 2.0), (3.3, 2.0)):
        sc.scatola((x, y, 0), (x + 0.05, y + 0.05, 0.72), "arredo")
    sc.scatola((2.0, 5.6, 0), (4.2, 6.5, 0.85), "arredo")         # divano
    sc.scatola((11.4, 2.8, 0), (12.0, 4.44, 2.3), "arredo")       # armadio camera 1
    sc.scatola((6.0, 0.3, 0), (7.6, 2.3, 0.55), "arredo")         # letto
    sc.scatola((8.62, 7.4, 0), (9.7, 8.0, 2.2), "arredo")         # armadio camera 3 (angolo)
    sc.scatola((5.12, 5.0, 0), (5.45, 7.5, 2.0), "arredo")        # libreria camera 2
    sc.scatola((7.0, 7.3, 0), (8.4, 8.0, 0.75), "arredo")         # scrivania
    sc.persona(3.0, 4.0, 0)
    stazioni = [(2.5, 4.0), (8.5, 2.2), (6.7, 6.3), (10.2, 6.3), (4.0, 6.8)]
    return sc, stazioni


def storico():
    """Palazzo storico: due sale 7 x 9 m alte 4,5 m, muri in pietra da 70 cm
    irregolari, finestre strombate, muro interno da 50 cm con porta, una colonna."""
    sc = Scena()
    H = 4.5
    sc.scatola((-1, -1, -0.2), (15.5, 10, 0.0), "pavimento")
    sc.scatola((-1, -1, H), (15.5, 10, H + 0.4), "soffitto")
    F, P = "finestra", "porta"
    r = 0.02
    sc.muro((-0.35, -0.35), (14.85, -0.35), 0.7, 0, H, [(2.35, 3.55, 1.0, 2.6, F), (10.35, 11.55, 1.0, 2.6, F)],
            ruvido=r, strombo=0.3)
    sc.muro((14.85, -0.35), (14.85, 9.35), 0.7, 0, H, [(3.85, 5.15, 0.0, 2.6, P)], ruvido=r)
    sc.muro((14.85, 9.35), (-0.35, 9.35), 0.7, 0, H, [(3.35, 4.55, 1.0, 2.6, F), (11.35, 12.55, 1.0, 2.6, F)],
            ruvido=r, strombo=0.3)
    sc.muro((-0.35, 9.35), (-0.35, -0.35), 0.7, 0, H, [], ruvido=r)
    sc.muro((7.25, 0.0), (7.25, 9.0), 0.5, 0, H, [(3.9, 5.1, 0.0, 2.5, P)], ruvido=r)
    sc.colonna(3.5, 4.5, 0.3, 0, H, ruvido=0.005)
    sc.scatola((0.0, 6.0, 0), (0.5, 8.5, 2.4), "arredo")           # armadio a muro antico
    sc.scatola((9.0, 3.5, 0.0), (12.0, 5.5, 0.78), "arredo")      # tavolo
    sc.persona(10.0, 7.0, 2)
    stazioni = [(2.0, 2.5), (5.0, 6.8), (10.0, 2.5), (12.0, 7.0)]
    return sc, stazioni


SCENE = {"appartamento": appartamento, "storico": storico}
