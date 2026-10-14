"""Punto unico per trasformare i punti di una fetta in polilinee."""

from . import motore_dritto, motore_libero


def estrai(punti2d, par, annulla=None):
    motore = motore_libero if par.motore == "libero" else motore_dritto
    return motore.estrai(punti2d, par, annulla)
