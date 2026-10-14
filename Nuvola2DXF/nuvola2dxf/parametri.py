"""Parametri di ricostruzione e profili per tipo di edificio."""

from dataclasses import dataclass, asdict, replace


@dataclass
class Parametri:
    motore: str = "dritto"       # dritto | libero
    tolleranza: float = 0.02     # m: scostamento massimo dei punti dalle linee
    lung_min: float = 0.10       # m: tratti più corti vengono scartati
    chiudi_buchi: float = 0.20   # m: interruzioni (ombre, arredi) da richiudere
    unisci_spigoli: float = 0.30 # m: distanza entro cui allungare le linee fino all'angolo
    squadra: bool = True         # angoli quasi retti portati a 90°
    allinea: bool = True         # linee quasi parallele rese parallele
    tol_angolo: float = 6.0      # gradi
    archi: bool = True           # (motore libero) riconosce archi e cerchi
    raggio: float = 0.01         # m: punti a questa distanza da un punto della linea ne fanno parte
    chiudi_stanze: float = 1.0   # m: buchi e angoli nascosti (mobili, ombre) richiusi fino a qui
    buco_visibile: float = 0.10  # m: le chiusure più lunghe vanno nel layer «chiusure da verificare»

    def copia(self, **kw):
        return replace(self, **kw)

    def come_dict(self):
        return asdict(self)


PROFILI = {
    "Squadrato (edificio moderno)": Parametri(
        motore="dritto", tolleranza=0.02, lung_min=0.10, chiudi_buchi=0.20,
        unisci_spigoli=0.30, squadra=True, allinea=True, tol_angolo=6.0,
    ),
    "Prevalentemente dritto (angoli non sempre a 90°)": Parametri(
        motore="dritto", tolleranza=0.02, lung_min=0.10, chiudi_buchi=0.20,
        unisci_spigoli=0.30, squadra=False, allinea=True, tol_angolo=2.5,
    ),
    "Storico / irregolare (chiese, archi, murature)": Parametri(
        motore="libero", tolleranza=0.015, lung_min=0.08, chiudi_buchi=0.15,
        unisci_spigoli=0.20, squadra=False, allinea=False, tol_angolo=0.0, archi=True,
    ),
}

DESCRIZIONI = {
    "Squadrato (edificio moderno)":
        "Muri dritti e angoli a 90°: le linee vengono raddrizzate, squadrate e "
        "unite negli spigoli. Una stanza rilevata con migliaia di punti diventa "
        "un rettangolo di 4 linee.",
    "Prevalentemente dritto (angoli non sempre a 90°)":
        "Muri dritti ma con angoli qualsiasi: le linee vengono raddrizzate e "
        "unite negli spigoli senza forzare l'angolo retto.",
    "Storico / irregolare (chiese, archi, murature)":
        "Segue fedelmente il contorno rilevato: tratti dritti dove la muratura è "
        "dritta, archi per absidi, colonne, volte e nicchie, spezzate per le "
        "parti irregolari.",
}


# Categorie degli elementi riconosciuti: nome del layer predefinito e colore
# AutoCAD (ACI). I nomi si possono cambiare dal programma («Nomi dei layer…»).
CATEGORIE = {
    "muri": ("00_muri", 7),
    "pilastri": ("00_pilastri", 4),
    "porte": ("00_porte", 3),
    "finestre": ("00_finestre", 5),
    "pavimenti": ("00_pavimenti", 8),
    "soffitti": ("00_soffitti", 9),
    "solai": ("00_solai", 8),
    "coperture": ("00_coperture", 30),
    "volte": ("00_volte_archi", 6),
    "aggetti": ("00_aggetti", 40),
    "altro": ("00_altro", 252),
    "chiusure": ("00_chiusure_da_verificare", 211),
    "piombo": ("00_fuori_piombo", 1),
    "piombo_rif": ("00_fuori_piombo_riferimento", 2),
    "punti": ("00_punti_nuvola", 253),
    "info": ("00_info", 3),
}

NOMI_CATEGORIE = {
    "muri": "Muri e pareti",
    "pilastri": "Pilastri e colonne",
    "porte": "Porte",
    "finestre": "Finestre",
    "pavimenti": "Pavimenti (base)",
    "soffitti": "Soffitti",
    "solai": "Solai / orizzontamenti",
    "coperture": "Coperture e falde",
    "volte": "Volte e archi",
    "aggetti": "Aggetti (balconi, cornici, pensiline)",
    "altro": "Altro (non riconosciuto)",
    "chiusure": "Chiusure di buchi e angoli nascosti (da verificare)",
    "piombo": "Fuori piombo: profilo e valori",
    "piombo_rif": "Fuori piombo: verticale teorica",
    "punti": "Punti della nuvola",
    "info": "Informazioni",
}
