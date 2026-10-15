"""Interfaccia grafica di Nuvola2DXF."""

import os
import sys
import time
import traceback

import numpy as np

try:
    from PySide6 import QtCore, QtGui, QtWidgets
except ImportError:  # versione per Windows 7: Qt5
    from PySide2 import QtCore, QtGui, QtWidgets
import pyqtgraph as pg

from . import __version__, classifica, elabora, esporta, nuvola, piombo, prospetto, readers, vista3d
from .parametri import CATEGORIE, DESCRIZIONI, NOMI_CATEGORIE, PROFILI, Parametri

pg.setConfigOptions(antialias=True, background="w", foreground="k")

COLORE_LINEE = (220, 30, 30)
COLORE_PUNTI = (90, 90, 90, 110)
MAX_PUNTI_SCHERMO = 250_000
COLORI_CAT = {
    "muri": (20, 20, 20), "pilastri": (0, 160, 190), "porte": (0, 150, 0), "finestre": (30, 80, 230),
    "pavimenti": (140, 80, 30), "soffitti": (110, 70, 190), "solai": (130, 130, 0), "coperture": (230, 120, 0),
    "volte": (130, 50, 200), "aggetti": (200, 160, 0), "altro": (150, 150, 150),
    "piombo": (220, 30, 30), "piombo_rif": (255, 140, 0),
    "chiusure": (255, 0, 150), "arredi": (192, 138, 42), "locali": (150, 80, 210), "ante": (0, 150, 0), "tavolati": (224, 123, 0), "travi": (31, 111, 209), "ballatoi": (26, 154, 58),
}


def esegui(oggetto):
    """exec() di Qt6, exec_() di Qt5."""
    return oggetto.exec() if hasattr(oggetto, "exec") else oggetto.exec_()


# ---------------------------------------------------------------- lavori in background
class Lavoro(QtCore.QThread):
    avanzamento = QtCore.Signal(float, str)
    finito = QtCore.Signal(object)
    errore = QtCore.Signal(str)

    def __init__(self, funzione, parent=None):
        super().__init__(parent)
        self._funzione = funzione
        self._annulla = False

    def annulla(self):
        self._annulla = True

    def run(self):
        try:
            ris = self._funzione(
                lambda f, m: self.avanzamento.emit(float(f), m), lambda: self._annulla
            )
            self.finito.emit(ris)
        except nuvola.Annullato:
            self.errore.emit("Operazione annullata.")
        except readers.ErroreLettura as e:
            self.errore.emit(str(e))
        except MemoryError:
            self.errore.emit(
                "Memoria insufficiente. Riduci lo spessore della fetta o limita l'area di lavoro."
            )
        except Exception:
            self.errore.emit("Errore imprevisto:\n\n" + traceback.format_exc(limit=6))


def _spin(minimo, massimo, valore, decimali=2, passo=1.0, suffisso=""):
    s = QtWidgets.QDoubleSpinBox()
    s.setRange(minimo, massimo)
    s.setDecimals(decimali)
    s.setSingleStep(passo)
    s.setValue(valore)
    if suffisso:
        s.setSuffix(" " + suffisso)
    s.setKeyboardTracking(False)
    return s


class VistaPiana(pg.PlotWidget):
    """PlotWidget a scala 1:1 con assi in metri."""

    cliccato = QtCore.Signal(float, float)

    def __init__(self):
        super().__init__()
        self.setAspectLocked(True)
        self.showGrid(x=True, y=True, alpha=0.15)
        self.getPlotItem().getViewBox().setMouseMode(pg.ViewBox.PanMode)
        self.scene().sigMouseClicked.connect(self._click)

    def _click(self, ev):
        if ev.button() != QtCore.Qt.MouseButton.LeftButton:
            return
        vb = self.getPlotItem().getViewBox()
        if not vb.sceneBoundingRect().contains(ev.scenePos()):
            return
        p = vb.mapSceneToView(ev.scenePos())
        self.cliccato.emit(p.x(), p.y())


ARANCIO = "#ff921c"
BLU = "#1862c4"
STILE = """
QMainWindow, #pannello { background: #f3f5f8; }
#testata { background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0c2244, stop:1 #1862c4); color: white; }
#testata QLabel { color: white; }
QPushButton { padding: 6px 10px; border: 1px solid #c4ccd8; border-radius: 6px; background: white; }
QPushButton:hover { border-color: #1862c4; }
QPushButton:checked { background: #dce8fa; border-color: #1862c4; }
QPushButton:disabled { color: #a0a0a0; background: #f0f0f0; }
QPushButton#primario { background: #1862c4; color: white; border: none; font-weight: 600; }
QPushButton#primario:hover { background: #1d72e0; }
QPushButton#primario:disabled { background: #9db6d8; }
QPushButton#azione { background: #ff921c; color: white; border: none; font-size: 12pt; font-weight: 700; }
QPushButton#azione:hover { background: #ffa340; }
QPushButton#azione:disabled { background: #f3c99a; }
QPushButton#leggero { background: transparent; color: white; border: 1px solid rgba(255,255,255,0.5); }
QPushButton#leggero:hover { background: rgba(255,255,255,0.15); }
QPushButton#leggero::menu-indicator { image: none; }
QFrame#passo { background: white; border: 1px solid #dde3ea; border-radius: 10px; }
QLabel#numero { background: #1862c4; color: white; border-radius: 11px; font-weight: 700; qproperty-alignment: AlignCenter; }
QLabel#titolo_passo { font-size: 11pt; font-weight: 700; color: #0c2244; }
QToolButton#modo { border: 1px solid #c4ccd8; border-radius: 8px; background: white; padding: 6px; font-weight: 600; }
QToolButton#modo:checked { background: #dce8fa; border: 2px solid #1862c4; color: #0c2244; }
QToolButton#ripiega { border: none; color: #1862c4; font-weight: 600; padding: 2px 0; }
QListWidget { border: 1px solid #dde3ea; border-radius: 6px; background: #fbfcfe; }
QListWidget::item { padding: 5px; }
QListWidget::item:selected { background: #dce8fa; color: #0c2244; }
QTabWidget::pane { border: none; }
QTabBar::tab { padding: 8px 18px; font-weight: 600; }
QGroupBox { font-weight: 600; color: #1862c4; border: none; margin-top: 6px; }
QGroupBox::title { subcontrol-origin: margin; left: 0; }
"""


def _risorsa(nome):
    """File accanto al programma (o dentro l'eseguibile)."""
    return os.path.join(getattr(sys, "_MEIPASS", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), nome)


def _passo(layout, numero, titolo):
    """Riquadro numerato di un passo; restituisce il layout interno."""
    box = QtWidgets.QFrame()
    box.setObjectName("passo")
    v = QtWidgets.QVBoxLayout(box)
    v.setContentsMargins(12, 10, 12, 12)
    riga = QtWidgets.QHBoxLayout()
    n = QtWidgets.QLabel(str(numero))
    n.setObjectName("numero")
    n.setFixedSize(22, 22)
    t = QtWidgets.QLabel(titolo)
    t.setObjectName("titolo_passo")
    riga.addWidget(n)
    riga.addWidget(t, 1)
    v.addLayout(riga)
    layout.addWidget(box)
    return v


def _sezione_ripiegabile(layout, titolo, spunta=False):
    """Parte di pannello nascosta finché non serve. Con spunta=True è una
    casella che attiva anche la funzione (isChecked)."""
    corpo = QtWidgets.QWidget()
    f = QtWidgets.QFormLayout(corpo)
    f.setContentsMargins(4, 2, 0, 2)
    corpo.setVisible(False)
    if spunta:
        g = QtWidgets.QGroupBox(titolo)
        g.setCheckable(True)
        g.setChecked(False)
        gl = QtWidgets.QVBoxLayout(g)
        gl.setContentsMargins(0, 4, 0, 0)
        gl.addWidget(corpo)
        g.toggled.connect(corpo.setVisible)
        layout.addWidget(g)
        return g, f
    bt = QtWidgets.QToolButton()
    bt.setObjectName("ripiega")
    bt.setText(titolo)
    bt.setCheckable(True)
    bt.setArrowType(QtCore.Qt.ArrowType.RightArrow)
    bt.setToolButtonStyle(QtCore.Qt.ToolButtonStyle.ToolButtonTextBesideIcon)

    def apri(on):
        corpo.setVisible(on)
        bt.setArrowType(QtCore.Qt.ArrowType.DownArrow if on else QtCore.Qt.ArrowType.RightArrow)

    bt.toggled.connect(apri)
    layout.addWidget(bt)
    layout.addWidget(corpo)
    return bt, f


def _icona_modo(tipo, lato=64):
    """Piccolo disegno per i pulsanti Pianta / Sezione / Prospetto."""
    pix = QtGui.QPixmap(lato, lato)
    pix.fill(QtCore.Qt.GlobalColor.transparent)
    p = QtGui.QPainter(pix)
    p.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
    blu, arancio = QtGui.QColor(BLU), QtGui.QColor(ARANCIO)
    p.setPen(QtGui.QPen(blu, 4))
    s = lato / 64
    linee = []
    if tipo == "pianta":
        linee = [(10, 12, 54, 12), (54, 12, 54, 52), (54, 52, 36, 52), (24, 52, 10, 52), (10, 52, 10, 12),
                 (32, 12, 32, 30)]
    elif tipo == "sezione":
        linee = [(12, 54, 12, 26), (52, 54, 52, 26), (8, 28, 32, 10), (32, 10, 56, 28), (8, 54, 56, 54),
                 (12, 38, 52, 38)]
    else:
        linee = [(10, 54, 10, 22), (54, 54, 54, 22), (6, 24, 32, 8), (32, 8, 58, 24), (6, 54, 58, 54)]
    for x0, y0, x1, y1 in linee:
        p.drawLine(QtCore.QPointF(x0 * s, y0 * s), QtCore.QPointF(x1 * s, y1 * s))
    p.setPen(QtGui.QPen(arancio, 3))
    if tipo == "pianta":
        p.drawLine(QtCore.QPointF(24 * s, 52 * s), QtCore.QPointF(24 * s, 40 * s))  # porta
    elif tipo == "sezione":
        p.setPen(QtGui.QPen(arancio, 3, QtCore.Qt.PenStyle.DashLine))
        p.drawLine(QtCore.QPointF(4 * s, 46 * s), QtCore.QPointF(60 * s, 46 * s))
    else:
        p.setBrush(arancio)
        for x in (16, 36):
            p.drawRect(QtCore.QRectF(x * s, 30 * s, 12 * s, 10 * s))
        p.drawRect(QtCore.QRectF(27 * s, 42 * s, 10 * s, 12 * s))
    p.end()
    return QtGui.QIcon(pix)


def _bottone_modo(testo, tipo, suggerimento):
    b = QtWidgets.QToolButton()
    b.setObjectName("modo")
    b.setText(testo)
    b.setToolTip(suggerimento)
    b.setCheckable(True)
    b.setIcon(_icona_modo(tipo))
    b.setIconSize(QtCore.QSize(40, 40))
    b.setToolButtonStyle(QtCore.Qt.ToolButtonStyle.ToolButtonTextUnderIcon)
    b.setSizePolicy(QtWidgets.QSizePolicy.Policy.Expanding, QtWidgets.QSizePolicy.Policy.Fixed)
    b.setMinimumHeight(76)
    return b


def _nome_file(testo):
    """Nome di file sicuro su Windows."""
    out = "".join(c if c.isalnum() or c in " -_.,()+" else "_" for c in testo).strip(" .")
    return out or "taglio"


def orientamento_prospetto(a, b):
    """Nord / est / sud / ovest: dove guarda la facciata (chi la osserva sta
    a destra della linea A -> B). Si assume l'asse Y verso nord."""
    t = np.asarray(b, float) - np.asarray(a, float)
    n = np.array([t[1], -t[0]])  # verso chi guarda
    ang = np.degrees(np.arctan2(n[0], n[1])) % 360  # 0 = nord, 90 = est
    return ["nord", "nord-est", "est", "sud-est", "sud", "sud-ovest", "ovest", "nord-ovest"][int((ang + 22.5) // 45) % 8]


# ---------------------------------------------------------------- finestra
class Finestra(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"Nuvola2DXF (NDXF) {__version__} – piante, sezioni e prospetti da nuvole di punti")
        self.resize(1440, 900)
        self.tagli = []  # risultati salvati: dict con "nome"
        self.nuvola = None
        self.lavoro = None
        self.risultato = None  # dict: tipo, punti, polilinee, quota, a, b, spessore
        self.a = self.b = None
        self._traccia = False
        self._costruisci()
        self._aggiorna_stato()

    # ------------------------------------------------------------ interfaccia
    def _costruisci(self):
        self.setStyleSheet(STILE)
        # ---- testata: logo, nome, comandi secondari
        testata = QtWidgets.QFrame()
        testata.setObjectName("testata")
        th = QtWidgets.QHBoxLayout(testata)
        th.setContentsMargins(14, 8, 14, 8)
        lg = QtWidgets.QLabel()
        pix = QtGui.QPixmap(_risorsa("logo.png"))
        if not pix.isNull():
            lg.setPixmap(pix.scaled(44, 44, QtCore.Qt.AspectRatioMode.KeepAspectRatio,
                                    QtCore.Qt.TransformationMode.SmoothTransformation))
        th.addWidget(lg)
        tit = QtWidgets.QLabel(f"<span style='font-size:17pt;font-weight:700'>Nuvola<span style='color:{ARANCIO}'>"
                               f"2DXF</span></span>&nbsp;&nbsp;<span style='color:#c9d6ea'>v{__version__} · piante, "
                               "sezioni e prospetti DXF da nuvole di punti</span>")
        th.addWidget(tit, 1)
        bt_guida = QtWidgets.QPushButton("Guida")
        bt_guida.setObjectName("leggero")
        bt_guida.clicked.connect(self.guida)
        th.addWidget(bt_guida)
        bt_altro = QtWidgets.QPushButton("Altro ▾")
        bt_altro.setObjectName("leggero")
        menu = QtWidgets.QMenu(bt_altro)
        menu.addAction("Nomi dei layer…", self.modifica_layer)
        menu.addAction("Svuota archivio temporaneo…", self.svuota_cache)
        bt_altro.setMenu(menu)
        th.addWidget(bt_altro)

        # ---- pannello sinistro a passi
        pannello = QtWidgets.QWidget()
        pannello.setObjectName("pannello")
        lay = QtWidgets.QVBoxLayout(pannello)
        lay.setContentsMargins(10, 10, 10, 10)
        lay.setSpacing(10)

        v = _passo(lay, 1, "Apri la nuvola di punti")
        self.bt_apri = QtWidgets.QPushButton("Apri nuvola…")
        self.bt_apri.setObjectName("primario")
        self.bt_apri.clicked.connect(lambda: self.apri())
        v.addWidget(self.bt_apri)
        self.lbl_info = QtWidgets.QLabel("oppure trascina qui il file<br><span style='color:#777'>LAS, LAZ, E57, PTS, PTX, "
                                         "XYZ, TXT, ASC, CSV, PLY</span>")
        self.lbl_info.setWordWrap(True)
        v.addWidget(self.lbl_info)

        v = _passo(lay, 2, "Scegli il taglio")
        riga = QtWidgets.QHBoxLayout()
        riga.setSpacing(6)
        self.gruppo_modo = QtWidgets.QButtonGroup(self)
        self.rb_pianta = _bottone_modo("Pianta", "pianta", "Taglio orizzontale a una quota")
        self.rb_sezione = _bottone_modo("Sezione", "sezione", "Taglio verticale lungo una linea A-B")
        self.rb_prospetto = _bottone_modo("Prospetto", "prospetto",
                                          "Facciata vista di fronte: traccia A-B lungo la facciata, da sinistra a "
                                          "destra come la vede chi la guarda")
        self.rb_pianta.setChecked(True)
        for rb in (self.rb_pianta, self.rb_sezione, self.rb_prospetto):
            self.gruppo_modo.addButton(rb)
            riga.addWidget(rb)
            rb.toggled.connect(self._cambia_modo)
        v.addLayout(riga)

        # --- pianta
        self.box_pianta = QtWidgets.QWidget()
        f = QtWidgets.QFormLayout(self.box_pianta)
        f.setContentsMargins(0, 4, 0, 0)
        self.sp_quota = _spin(-10000, 10000, 1.0, 3, 0.05, "m")
        self.sp_quota.setToolTip("Quota reale del piano di taglio (o trascina la linea rossa nel grafico)")
        self.sp_spessore_p = _spin(0.5, 100, 5, 1, 0.5, "cm")
        self.sp_spessore_p.setToolTip("Spessore della fetta di punti attorno alla quota di taglio")
        f.addRow("Quota di taglio:", self.sp_quota)
        f.addRow("Spessore fetta:", self.sp_spessore_p)
        self.isto = pg.PlotWidget()
        self.isto.setMinimumHeight(240)
        self.isto.setLabel("left", "Quota (m)")
        self.isto.getPlotItem().hideAxis("bottom")
        self.isto.setMouseEnabled(x=False, y=True)
        self.isto.setToolTip("Quanti punti ci sono a ogni quota: i picchi sono pavimenti e soffitti.\n"
                             "Trascina la linea rossa per scegliere la quota di taglio.")
        self.linea_quota = pg.InfiniteLine(angle=0, movable=True, pen=pg.mkPen(COLORE_LINEE, width=2))
        self.linea_quota.sigPositionChangeFinished.connect(lambda l: self.sp_quota.setValue(l.value()))
        self.isto.addItem(self.linea_quota)
        self.sp_quota.valueChanged.connect(lambda val: self.linea_quota.setValue(val))
        f.addRow(self.isto)
        self.chk_riquadro = QtWidgets.QCheckBox("Solo l'area nel riquadro verde")
        self.chk_riquadro.setToolTip("Mostra un riquadro sulla vista dall'alto: i punti fuori vengono ignorati")
        self.chk_riquadro.toggled.connect(self._mostra_riquadro)
        f.addRow(self.chk_riquadro)
        v.addWidget(self.box_pianta)

        # --- sezione / prospetto
        self.box_sezione = QtWidgets.QWidget()
        f = QtWidgets.QFormLayout(self.box_sezione)
        f.setContentsMargins(0, 4, 0, 0)
        self.bt_traccia = QtWidgets.QPushButton("Traccia la linea di sezione")
        self.bt_traccia.setCheckable(True)
        self.bt_traccia.setToolTip("Poi clicca due punti sulla vista dall'alto: inizio (A) e fine (B)")
        self.bt_traccia.toggled.connect(self._inizia_traccia)
        bt_inv = QtWidgets.QPushButton("A ↔ B")
        bt_inv.setToolTip("Inverti il verso della linea (cambia il lato da cui si guarda)")
        bt_inv.clicked.connect(self._inverti)
        r = QtWidgets.QHBoxLayout()
        r.addWidget(self.bt_traccia, 1)
        r.addWidget(bt_inv)
        f.addRow(r)
        self.lbl_ab = QtWidgets.QLabel("A e B non ancora definiti")
        self.lbl_ab.setWordWrap(True)
        self.lbl_ab.setStyleSheet("color:#555")
        f.addRow(self.lbl_ab)
        self.sp_spessore_s = _spin(0.5, 200, 5, 1, 0.5, "cm")
        self.sp_spessore_s.setToolTip("Spessore della fetta di punti attorno al piano di sezione")
        self.lbl_spessore_s = QtWidgets.QLabel("Spessore fetta:")
        f.addRow(self.lbl_spessore_s, self.sp_spessore_s)
        self.chk_allinea_facciata = QtWidgets.QCheckBox("Allinea la linea alla facciata più vicina")
        self.chk_allinea_facciata.setChecked(True)
        self.sp_davanti = _spin(0, 20, 0.5, 2, 0.1, "m")
        self.sp_davanti.setToolTip("Quanto prendere davanti alla facciata (balconi, cornici, pensiline)")
        self.sp_dietro = _spin(0, 20, 1.0, 2, 0.1, "m")
        self.sp_dietro.setToolTip("Quanto prendere dietro la linea (rientranze, serramenti)")
        self.lbl_davanti = QtWidgets.QLabel("Profondità davanti:")
        self.lbl_dietro = QtWidgets.QLabel("Profondità dietro:")
        f.addRow(self.chk_allinea_facciata)
        f.addRow(self.lbl_davanti, self.sp_davanti)
        f.addRow(self.lbl_dietro, self.sp_dietro)
        v.addWidget(self.box_sezione)
        self.box_sezione.hide()

        v = _passo(lay, 3, "Tipo di edificio")
        self.cb_profilo = QtWidgets.QComboBox()
        self.cb_profilo.addItems(list(PROFILI))
        self.cb_profilo.currentTextChanged.connect(self._applica_profilo)
        v.addWidget(self.cb_profilo)
        self.lbl_profilo = QtWidgets.QLabel()
        self.lbl_profilo.setWordWrap(True)
        self.lbl_profilo.setStyleSheet("color:#555")
        v.addWidget(self.lbl_profilo)
        # metodo di ricostruzione
        self.lbl_metodo = QtWidgets.QLabel("<b>Ricostruzione</b>")
        v.addWidget(self.lbl_metodo)
        self.rb_matematico = QtWidgets.QRadioButton("Matematica: fedele ai punti del taglio")
        self.rb_matematico.setToolTip("Disegna quello che c'è nella fetta della quota di taglio: linee molto fedeli,\n"
                                      "ma dove armadi e oggetti nascondono i muri restano buchi da completare.")
        self.rb_intuitivo = QtWidgets.QRadioButton("Intuitiva: guarda tutta la nuvola e immagina la struttura")
        self.rb_intuitivo.setToolTip(
            "Come una persona che si guarda attorno: trova pavimento e soffitto, ricava i muri\n"
            "dalla fascia sotto il soffitto (dove non ci sono mobili), guarda ogni muro per intero\n"
            "per trovare porte e finestre (un oggetto davanti non è un vano) e chiude le stanze.\n"
            "Serve un soffitto rilevato. Per ora solo in pianta.")
        self.rb_matematico.setChecked(True)
        self.gruppo_metodo = QtWidgets.QButtonGroup(self)
        for rb in (self.rb_matematico, self.rb_intuitivo):
            self.gruppo_metodo.addButton(rb)
            v.addWidget(rb)
        self.chk_classifica = QtWidgets.QCheckBox("Riconosci muri, porte, finestre, pilastri, legno…")
        self.chk_classifica.setChecked(True)
        self.chk_classifica.setToolTip("Divide il disegno in layer: 00_muri, 00_porte, 00_finestre, 00_pilastri, "
                                       "00_pavimenti, 00_soffitti, 00_legno_tavolati, …")
        v.addWidget(self.chk_classifica)

        # regolazioni fini (chiuse)
        self.gr_avanzati, f = _sezione_ripiegabile(v, "Regolazioni fini")
        self.cb_motore = QtWidgets.QComboBox()
        self.cb_motore.addItem("Linee dritte (squadra e unisce)", "dritto")
        self.cb_motore.addItem("Contorno libero (archi e irregolarità)", "libero")
        self.sp_tol = _spin(0.2, 20, 2, 1, 0.5, "cm")
        self.sp_tol.setToolTip("Quanto possono scostarsi i punti dalla linea disegnata (fascia)")
        self.sp_raggio = _spin(0.2, 10, 1, 1, 0.5, "cm")
        self.sp_raggio.setToolTip("Oltre alla fascia, fanno parte della linea anche i punti entro questa distanza\n"
                                  "da un punto già preso (il rumore attorno al muro)")
        self.sp_min = _spin(1, 500, 10, 0, 5, "cm")
        self.sp_min.setToolTip("I tratti più corti vengono ignorati (riduce il disturbo)")
        self.sp_buchi = _spin(0, 300, 30, 0, 5, "cm")
        self.sp_buchi.setToolTip("Interruzioni dei punti più corte di così vengono unite nella stessa linea")
        self.sp_stanze = _spin(0, 500, 100, 0, 10, "cm")
        self.sp_stanze.setToolTip("Angoli nascosti e buchi lungo i muri (mobili, ombre) vengono richiusi fino a\n"
                                  "questa lunghezza, così le stanze si chiudono. 0 = non richiudere.")
        self.sp_allineati = _spin(0, 1000, 300, 0, 10, "cm")
        self.sp_allineati.setToolTip("Buchi lungo uno stesso muro (dietro armadi, piante, oggetti) richiusi fino a\n"
                                     "questa lunghezza: il muro continua anche dove la nuvola ha un buco.")
        self.sp_visibile = _spin(0, 200, 10, 0, 1, "cm")
        self.sp_visibile.setToolTip("Le chiusure più lunghe di così vanno nel layer «chiusure da verificare»\n"
                                    "(colore diverso), per controllarle in CAD")
        self.sp_spigoli = _spin(0, 300, 30, 0, 5, "cm")
        self.sp_spigoli.setToolTip("Le linee vengono allungate fino a incontrarsi negli angoli entro questa distanza")
        self.chk_squadra = QtWidgets.QCheckBox("Angoli quasi retti → 90°")
        self.chk_allinea = QtWidgets.QCheckBox("Linee quasi parallele → parallele")
        self.sp_angolo = _spin(0, 20, 6, 1, 0.5, "°")
        self.chk_archi = QtWidgets.QCheckBox("Riconosci archi e cerchi")
        self.chk_legno = QtWidgets.QCheckBox("Riconosci tavolati, travi e ballatoi in legno")
        f.addRow("Metodo:", self.cb_motore)
        f.addRow("Fascia (tolleranza):", self.sp_tol)
        f.addRow("Punti vicini entro:", self.sp_raggio)
        f.addRow("Lunghezza minima:", self.sp_min)
        f.addRow("Unisci interruzioni fino a:", self.sp_buchi)
        f.addRow("Angoli nascosti: richiudi fino a:", self.sp_stanze)
        f.addRow("Muri allineati: richiudi fino a:", self.sp_allineati)
        f.addRow("Segnala chiusure oltre:", self.sp_visibile)
        f.addRow("Unisci spigoli entro:", self.sp_spigoli)
        f.addRow(self.chk_squadra)
        f.addRow(self.chk_allinea)
        f.addRow("Tolleranza angoli:", self.sp_angolo)
        f.addRow(self.chk_archi)
        f.addRow(self.chk_legno)

        # fuori piombo (chiuso)
        self.gr_piombo, f = _sezione_ripiegabile(v, "Analisi fuori piombo", spunta=True)
        self.gr_piombo.setToolTip("Misura quanto pareti e pilastri si scostano dalla verticale.\n"
                                  "Sezione: pareti tagliate. Pianta: facce dei muri e pilastri (dai punti 3D).")
        self.sp_pb_passo = _spin(5, 200, 25, 0, 5, "cm")
        self.sp_pb_passo.setToolTip("Ogni quanto misurare la posizione della parete in altezza")
        self.sp_pb_esagera = _spin(1, 100, 10, 0, 1, "×")
        self.sp_pb_esagera.setToolTip("Ingrandimento grafico degli scostamenti nel disegno (i valori scritti sono reali)")
        self.sp_pb_soglia = _spin(0, 50, 0.5, 1, 0.5, "cm")
        self.sp_pb_soglia.setToolTip("In pianta disegna solo gli scostamenti oltre questo valore (il report li elenca tutti)")
        self.sp_pb_banda = _spin(2, 100, 15, 0, 1, "cm")
        self.sp_pb_banda.setToolTip("Scostamento massimo cercato attorno alla parete")
        f.addRow("Misura ogni:", self.sp_pb_passo)
        f.addRow("Ingrandimento grafico:", self.sp_pb_esagera)
        f.addRow("In pianta mostra oltre:", self.sp_pb_soglia)
        f.addRow("Cerca entro:", self.sp_pb_banda)

        self.bt_estrai = QtWidgets.QPushButton("▶  Taglia ed estrai le linee")
        self.bt_estrai.setObjectName("azione")
        self.bt_estrai.setMinimumHeight(46)
        self.bt_estrai.clicked.connect(self.estrai)
        lay.addWidget(self.bt_estrai)

        destra = QtWidgets.QWidget()
        destra.setObjectName("pannello")
        dl = QtWidgets.QVBoxLayout(destra)
        dl.setContentsMargins(10, 10, 10, 10)
        v = _passo(dl, 4, "Tagli e DXF")
        aiuto = QtWidgets.QLabel("Ogni taglio estratto si aggiunge qui: fai tutte le piante, sezioni e prospetti "
                                 "che servono. <b>Doppio clic per rinominare</b> (es. «Sezione A-A», "
                                 "«Prospetto nord»). Clic per rivederlo.")
        aiuto.setWordWrap(True)
        aiuto.setStyleSheet("color:#555")
        v.addWidget(aiuto)
        self.lista_tagli = QtWidgets.QListWidget()
        self.lista_tagli.setMinimumHeight(260)
        self.lista_tagli.setEditTriggers(QtWidgets.QAbstractItemView.EditTrigger.DoubleClicked
                                         | QtWidgets.QAbstractItemView.EditTrigger.EditKeyPressed)
        self.lista_tagli.currentRowChanged.connect(self._scegli_taglio)
        self.lista_tagli.itemChanged.connect(self._rinominato)
        v.addWidget(self.lista_tagli)
        r = QtWidgets.QVBoxLayout()
        self.bt_esporta = QtWidgets.QPushButton("Esporta selezionato…")
        self.bt_esporta.setToolTip("Salva il taglio selezionato in un DXF")
        self.bt_esporta.clicked.connect(self.esporta_dxf)
        self.bt_esporta_tutti = QtWidgets.QPushButton("Esporta tutti…")
        self.bt_esporta_tutti.setObjectName("primario")
        self.bt_esporta_tutti.setToolTip("Un file DXF per ogni taglio, con il suo nome, nella cartella scelta")
        self.bt_esporta_tutti.clicked.connect(self.esporta_tutti)
        self.bt_elimina = QtWidgets.QPushButton("Elimina selezionato")
        self.bt_elimina.clicked.connect(self._elimina_taglio)
        r.addWidget(self.bt_esporta_tutti)
        r.addWidget(self.bt_esporta)
        r.addWidget(self.bt_elimina)
        v.addLayout(r)
        _, f = _sezione_ripiegabile(v, "Opzioni del DXF")
        self.chk_unite = QtWidgets.QCheckBox("Polilinee unite (altrimenti linee e archi separati)")
        self.chk_unite.setChecked(True)
        self.chk_punti = QtWidgets.QCheckBox("Includi i punti della fetta (layer a parte)")
        self.chk_quota = QtWidgets.QCheckBox("Pianta alla quota reale (altrimenti a quota 0)")
        f.addRow(self.chk_unite)
        f.addRow(self.chk_punti)
        f.addRow(self.chk_quota)
        dl.addStretch(1)
        destra.setMinimumWidth(280)
        destra.setMaximumWidth(360)
        lay.addStretch(1)

        scorri = QtWidgets.QScrollArea()
        scorri.setWidget(pannello)
        scorri.setWidgetResizable(True)
        scorri.setMinimumWidth(400)
        scorri.setMaximumWidth(480)
        scorri.setFrameShape(QtWidgets.QFrame.Shape.NoFrame)

        # ---- area centrale
        self.schede = QtWidgets.QTabWidget()
        self.vista = VistaPiana()
        self.vista.setLabel("bottom", "X (m)")
        self.vista.setLabel("left", "Y (m)")
        self.vista.cliccato.connect(self._click_vista)
        self.img = pg.ImageItem()
        self.vista.addItem(self.img)
        # i punti che il taglio prenderà ("grigetto" sopra la nuvola sbiadita)
        self.sel_mappa = pg.ScatterPlotItem(pxMode=True, size=2, pen=None, brush=pg.mkBrush(55, 55, 60, 220))
        self.vista.addItem(self.sel_mappa)
        self.linee_tagli = pg.PlotDataItem(pen=pg.mkPen((120, 150, 200), width=2, style=QtCore.Qt.PenStyle.DashLine),
                                           connect="finite")
        self.vista.addItem(self.linee_tagli)
        self.nomi_tagli = []
        self.linea_sez = pg.PlotDataItem(pen=pg.mkPen((0, 120, 255), width=3), symbol="o",
                                         symbolSize=9, symbolBrush=(0, 120, 255))
        self.vista.addItem(self.linea_sez)
        self.txt_a = pg.TextItem("A", color=(0, 80, 200), anchor=(1.2, 1.2))
        self.txt_b = pg.TextItem("B", color=(0, 80, 200), anchor=(-0.2, 1.2))
        self.vista.addItem(self.txt_a)
        self.vista.addItem(self.txt_b)
        self.txt_a.hide()
        self.txt_b.hide()
        self.riquadro = pg.RectROI([0, 0], [1, 1], pen=pg.mkPen((0, 160, 0), width=2))
        self.riquadro.addScaleHandle([0, 0], [1, 1])
        self.riquadro.addScaleHandle([1, 0], [0, 1])
        self.riquadro.addScaleHandle([0, 1], [1, 0])
        self.vista.addItem(self.riquadro)
        self.riquadro.hide()
        self.riquadro.sigRegionChanged.connect(self._aggiorna_taglio3d)

        self.vista_ris = VistaPiana()
        self.scatter = pg.ScatterPlotItem(pxMode=True, size=2, pen=None, brush=pg.mkBrush(*COLORE_PUNTI))
        self.vista_ris.addItem(self.scatter)
        self.curve_cat = {}
        self.vertici = pg.ScatterPlotItem(pxMode=True, size=4, pen=None, brush=pg.mkBrush(60, 60, 60))
        self.vista_ris.addItem(self.vertici)
        self.etichette = []
        contenitore = QtWidgets.QWidget()
        cv = QtWidgets.QVBoxLayout(contenitore)
        cv.setContentsMargins(0, 0, 0, 0)
        riga = QtWidgets.QHBoxLayout()
        riga.setContentsMargins(8, 6, 8, 0)
        self.lbl_ris = QtWidgets.QLabel("Nessun risultato: scegli il taglio e premi «Taglia ed estrai le linee».")
        self.lbl_ris.setWordWrap(True)
        riga.addWidget(self.lbl_ris, 1)
        self.chk_mostra_punti = QtWidgets.QCheckBox("Mostra punti")
        self.chk_mostra_punti.setChecked(True)
        self.chk_mostra_punti.toggled.connect(self.scatter.setVisible)
        riga.addWidget(self.chk_mostra_punti)
        cv.addLayout(riga)
        cv.addWidget(self.vista_ris)

        self.vista3d = vista3d.Vista3D()
        self.contenitore_ris = contenitore
        pan_sel = QtWidgets.QWidget()
        ps = QtWidgets.QVBoxLayout(pan_sel)
        ps.setContentsMargins(0, 0, 0, 0)
        r = QtWidgets.QHBoxLayout()
        r.setContentsMargins(8, 4, 8, 0)
        self.lbl_sel = QtWidgets.QLabel("<b>Anteprima del taglio</b>: qui vedi solo i punti che il taglio prenderà.")
        self.lbl_sel.setWordWrap(True)
        r.addWidget(self.lbl_sel, 1)
        self.bt_precisa = QtWidgets.QPushButton("Anteprima precisa")
        self.bt_precisa.setToolTip("Legge la fetta vera a piena risoluzione (qualche secondo sui file grandi).\n"
                                   "Se poi estrai le linee con le stesse impostazioni, non viene riletta.")
        self.bt_precisa.clicked.connect(self.anteprima_precisa)
        r.addWidget(self.bt_precisa)
        ps.addLayout(r)
        self.vista_sel = VistaPiana()
        self.sel_punti = pg.ScatterPlotItem(pxMode=True, size=2, pen=None, brush=pg.mkBrush(55, 55, 60, 200))
        self.vista_sel.addItem(self.sel_punti)
        ps.addWidget(self.vista_sel, 1)
        self.split_mappa = QtWidgets.QSplitter(QtCore.Qt.Orientation.Vertical)
        self.split_mappa.addWidget(self.vista)
        self.split_mappa.addWidget(pan_sel)
        self.split_mappa.setStretchFactor(0, 3)
        self.split_mappa.setStretchFactor(1, 2)
        self._fetta_precisa = None  # (chiave, punti) dell'ultima anteprima precisa
        self._timer_sel = QtCore.QTimer(self)
        self._timer_sel.setSingleShot(True)
        self._timer_sel.setInterval(60)
        self._timer_sel.timeout.connect(self._aggiorna_selezione)
        self.schede.addTab(self.split_mappa, "Vista dall'alto")
        self.schede.addTab(self.vista3d, "Vista 3D (taglio)")
        self.schede.addTab(contenitore, "Risultato")
        # il piano di taglio nella vista 3D segue quota, spessori e linea A-B
        for sp in (self.sp_quota, self.sp_spessore_p, self.sp_spessore_s, self.sp_davanti, self.sp_dietro):
            sp.valueChanged.connect(self._aggiorna_taglio3d)
        self.fascia_quota = None
        self.sp_quota.valueChanged.connect(self._aggiorna_fascia_quota)
        self.sp_spessore_p.valueChanged.connect(self._aggiorna_fascia_quota)
        # trascinando la linea rossa l'anteprima segue subito (non solo al rilascio)
        self.linea_quota.sigPositionChanged.connect(lambda l: self.sp_quota.setValue(l.value()))

        # schermata iniziale, finché non c'è una nuvola
        benvenuto = QtWidgets.QLabel()
        benvenuto.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        benvenuto.setStyleSheet("background:white; color:#33445c;")
        logo = _risorsa("logo.png")
        benvenuto.setText(
            f"<div style='text-align:center'><img src='{logo}' width='150' height='150'><br><br>"
            "<span style='font-size:18pt;font-weight:700;color:#0c2244'>Benvenuto in Nuvola2DXF</span><br><br>"
            "<span style='font-size:11pt'>Apri una nuvola di punti oppure <b>trascinala qui</b>.<br><br>"
            "1 · apri la nuvola<br>2 · scegli pianta, sezione o prospetto<br>"
            "3 · scegli il tipo di edificio<br>4 · estrai le linee, rinomina i tagli ed esporta i DXF</span></div>")
        self.centro = QtWidgets.QStackedWidget()
        self.centro.addWidget(benvenuto)
        self.centro.addWidget(self.schede)

        split = QtWidgets.QSplitter()
        split.addWidget(scorri)
        split.addWidget(self.centro)
        split.addWidget(destra)
        split.setStretchFactor(1, 1)
        centro = QtWidgets.QWidget()
        cl = QtWidgets.QVBoxLayout(centro)
        cl.setContentsMargins(0, 0, 0, 0)
        cl.setSpacing(0)
        cl.addWidget(testata)
        cl.addWidget(split, 1)
        self.setCentralWidget(centro)

        sb = self.statusBar()
        self.lbl_stato = QtWidgets.QLabel("Pronto. Apri una nuvola di punti per cominciare.")
        self.barra = QtWidgets.QProgressBar()
        self.barra.setMaximumWidth(320)
        self.barra.setRange(0, 1000)
        self.barra.hide()
        self.bt_annulla = QtWidgets.QPushButton("Annulla")
        self.bt_annulla.hide()
        self.bt_annulla.clicked.connect(lambda: self.lavoro and self.lavoro.annulla())
        sb.addWidget(self.lbl_stato, 1)
        sb.addPermanentWidget(self.barra)
        sb.addPermanentWidget(self.bt_annulla)

        self._applica_profilo(self.cb_profilo.currentText())
        self.setAcceptDrops(True)

    # ------------------------------------------------------------ parametri
    def _applica_profilo(self, nome):
        p = PROFILI[nome]
        self.lbl_profilo.setText(DESCRIZIONI[nome])
        self.cb_motore.setCurrentIndex(0 if p.motore == "dritto" else 1)
        self.sp_tol.setValue(p.tolleranza * 100)
        self.sp_raggio.setValue(p.raggio * 100)
        self.sp_min.setValue(p.lung_min * 100)
        self.sp_buchi.setValue(p.chiudi_buchi * 100)
        self.sp_stanze.setValue(p.chiudi_stanze * 100)
        self.sp_visibile.setValue(p.buco_visibile * 100)
        self.sp_allineati.setValue(p.chiudi_allineati * 100)
        self.sp_spigoli.setValue(p.unisci_spigoli * 100)
        self.chk_squadra.setChecked(p.squadra)
        self.chk_allinea.setChecked(p.allinea)
        self.sp_angolo.setValue(p.tol_angolo)
        self.chk_archi.setChecked(p.archi)
        self.chk_legno.setChecked(p.legno)

    def parametri(self):
        return Parametri(
            motore=self.cb_motore.currentData(),
            tolleranza=self.sp_tol.value() / 100,
            raggio=self.sp_raggio.value() / 100,
            lung_min=self.sp_min.value() / 100,
            chiudi_buchi=self.sp_buchi.value() / 100,
            chiudi_stanze=self.sp_stanze.value() / 100,
            buco_visibile=self.sp_visibile.value() / 100,
            chiudi_allineati=self.sp_allineati.value() / 100,
            unisci_spigoli=self.sp_spigoli.value() / 100,
            squadra=self.chk_squadra.isChecked(),
            allinea=self.chk_allinea.isChecked(),
            tol_angolo=self.sp_angolo.value(),
            archi=self.chk_archi.isChecked(),
            legno=self.chk_legno.isChecked(),
            metodo="intuitivo" if self.rb_intuitivo.isChecked() else "matematico",
        )

    # ------------------------------------------------------------ stato
    def _aggiorna_stato(self):
        occupato = self.lavoro is not None
        ha = self.nuvola is not None
        self.bt_apri.setEnabled(not occupato)
        self.bt_estrai.setEnabled(ha and not occupato)
        pronto = self.risultato is not None and not occupato
        self.bt_esporta.setEnabled(pronto)
        self.bt_esporta_tutti.setEnabled(bool(self.tagli) and not occupato)
        self.bt_elimina.setEnabled(pronto)

    def _cambia_modo(self):
        pianta = self.rb_pianta.isChecked()
        prospetto = self.rb_prospetto.isChecked()
        self.box_pianta.setVisible(pianta)
        self.box_sezione.setVisible(not pianta)
        for w in (self.chk_allinea_facciata, self.sp_davanti, self.sp_dietro, self.lbl_davanti, self.lbl_dietro):
            w.setVisible(prospetto)
        for w in (self.sp_spessore_s, self.lbl_spessore_s):
            w.setVisible(not prospetto)
        self.bt_traccia.setText("Traccia la facciata (A → B, da sinistra a destra)" if prospetto
                                else "Traccia la linea di sezione")
        if pianta:
            self.bt_traccia.setChecked(False)
        self.schede.setCurrentIndex(0)
        self._aggiorna_taglio3d()

    def _avvia(self, funzione, alla_fine, messaggio):
        self.lavoro = Lavoro(funzione, self)
        self.lavoro.avanzamento.connect(self._avanza)
        self.lavoro.finito.connect(lambda r: self._fine(alla_fine, r))
        self.lavoro.errore.connect(self._errore)
        self.lbl_stato.setText(messaggio)
        self.barra.setValue(0)
        self.barra.show()
        self.bt_annulla.show()
        QtWidgets.QApplication.setOverrideCursor(QtCore.Qt.CursorShape.BusyCursor)
        self._aggiorna_stato()
        self.lavoro.start()

    def _avanza(self, frazione, messaggio):
        self.barra.setValue(int(frazione * 1000))
        if messaggio:
            self.lbl_stato.setText(messaggio)

    def _chiudi_lavoro(self):
        if self.lavoro:
            self.lavoro.wait()
            self.lavoro.deleteLater()
        self.lavoro = None
        self.barra.hide()
        self.bt_annulla.hide()
        QtWidgets.QApplication.restoreOverrideCursor()
        self._aggiorna_stato()

    def _fine(self, alla_fine, ris):
        self._chiudi_lavoro()
        alla_fine(ris)

    def _errore(self, testo):
        self._chiudi_lavoro()
        self.lbl_stato.setText("Operazione non completata")
        QtWidgets.QMessageBox.warning(self, "Nuvola2DXF", testo)

    # ------------------------------------------------------------ apertura
    def dragEnterEvent(self, e):
        if e.mimeData().hasUrls():
            e.acceptProposedAction()

    def dropEvent(self, e):
        urls = e.mimeData().urls()
        if urls and self.lavoro is None:
            self.apri(urls[0].toLocalFile())

    def apri(self, percorso=None):
        if not percorso:
            percorso, _ = QtWidgets.QFileDialog.getOpenFileName(
                self, "Apri nuvola di punti", "", readers.FILTRO_FILE
            )
        if not percorso:
            return

        def lavoro(av, ann):
            return nuvola.Nuvola.carica(percorso, av, ann)

        self._avvia(lavoro, self._nuvola_aperta, f"Apertura di {os.path.basename(percorso)}…")

    def _nuvola_aperta(self, nv):
        if self.nuvola is not None and self.nuvola is not nv:
            self.nuvola.chiudi()
        self.nuvola = nv
        self.risultato = None
        self.a = self.b = None
        self.tagli = []
        self.lista_tagli.clear()
        self._aggiorna_linee_tagli()
        self.centro.setCurrentIndex(1)
        o = nv.origine
        dim = nv.max - nv.min
        self.lbl_info.setText(
            f"<b>{nv.nome}</b><br>{nv.n:,} punti<br>".replace(",", ".")
            + f"Dimensioni: {dim[0]:.2f} × {dim[1]:.2f} m, altezza {dim[2]:.2f} m<br>"
            + f"Quote da {nv.min[2] + o[2]:.2f} a {nv.max[2] + o[2]:.2f} m"
        )
        self._disegna_vista()
        self._disegna_istogramma()
        self.vista3d.imposta_nuvola(nv.anteprima)
        self._fetta_precisa = None
        self._aggiorna_taglio3d()
        self._aggiorna_sezione()
        r = self.riquadro
        r.setPos(nv.min[:2])
        r.setSize(dim[:2])
        self.scatter.clear()
        for item in self.curve_cat.values():
            item.setData([], [])
        self.vertici.clear()
        self.lbl_ris.setText("Nessun risultato: scegli il taglio e premi «Taglia ed estrai le linee».")
        self.schede.setCurrentIndex(0)
        self.lbl_stato.setText("Nuvola pronta. Scegli pianta, sezione o prospetto e premi «Taglia ed estrai le linee».")
        self._aggiorna_stato()

    def _disegna_vista(self):
        nv = self.nuvola
        ant = nv.anteprima
        mn, mx = nv.min[:2], nv.max[:2]
        est = np.maximum(mx - mn, 1e-3)
        lato = max(est) / 1600
        nx = max(2, int(est[0] / lato))
        ny = max(2, int(est[1] / lato))
        h, _, _ = np.histogram2d(ant[:, 0], ant[:, 1], bins=(nx, ny), range=((mn[0], mx[0]), (mn[1], mx[1])))
        img = np.log1p(h)
        if img.max() > 0:
            img = img / img.max()
        img = 1.0 - img  # punti scuri su fondo bianco
        self.img.setImage((img * 255).astype(np.uint8), levels=(0, 255))
        self.img.setRect(QtCore.QRectF(mn[0], mn[1], est[0], est[1]))
        self.vista.getPlotItem().getViewBox().autoRange()

    def _disegna_istogramma(self):
        """Profilo dei punti per quota (scala logaritmica, così si vedono anche
        i muri e non solo i picchi di pavimenti e soffitti), con la fascia del
        taglio evidenziata e i livelli principali scritti accanto."""
        nv = self.nuvola
        cont, bordi = nv.istogramma_z(400)
        z = bordi + nv.origine[2]
        self.isto.clear()
        centri = (z[:-1] + z[1:]) / 2
        larg = np.log1p(cont)
        larg = larg / max(larg.max(), 1e-9)
        curva = pg.PlotDataItem(np.r_[0, larg, 0], np.r_[centri[0], centri, centri[-1]],
                                pen=pg.mkPen((90, 100, 120), width=1), fillLevel=0,
                                fillBrush=pg.mkBrush(150, 165, 190, 150))
        curva.setFillLevel(0)
        self.isto.addItem(curva)
        self.isto.setXRange(0, 1.35, padding=0)
        # livelli principali: i picchi più netti (pavimenti, soffitti, solai)
        ordine = np.argsort(cont)[::-1]
        livelli = []
        for k in ordine:
            if cont[k] < 0.15 * cont[ordine[0]] or len(livelli) >= 6:
                break
            if all(abs(centri[k] - l) > 0.4 for l in livelli):
                livelli.append(centri[k])
        livelli.sort()
        for n, l in enumerate(livelli):
            nome = "pavimento" if n == 0 else ("soffitto" if n == len(livelli) - 1 else "livello")
            self.isto.addItem(pg.InfiniteLine(pos=l, angle=0, pen=pg.mkPen((150, 150, 150), style=QtCore.Qt.PenStyle.DotLine)))
            t = pg.TextItem(f"{nome} {l:.2f}", color=(80, 90, 110), anchor=(1, 1))
            t.setPos(1.33, l)
            self.isto.addItem(t)
        # fascia del taglio (spessore della fetta) attorno alla linea rossa
        self.fascia_quota = pg.LinearRegionItem(orientation="horizontal", movable=False,
                                                brush=pg.mkBrush(255, 146, 28, 70), pen=pg.mkPen(None))
        self.isto.addItem(self.fascia_quota)
        self.isto.addItem(self.linea_quota)
        self.sp_quota.setRange(z[0], z[-1])
        pavimento = livelli[0] if livelli else centri[0]
        proposta = float(np.clip(pavimento + 1.0, z[0], z[-1]))
        self.sp_quota.setValue(round(proposta, 2))
        self.linea_quota.setValue(self.sp_quota.value())
        self._aggiorna_fascia_quota()
        self.isto.getPlotItem().getViewBox().setYRange(z[0], z[-1], padding=0.02)

    def _aggiorna_fascia_quota(self, *_):
        if getattr(self, "fascia_quota", None) is not None:
            q, s = self.sp_quota.value(), max(self.sp_spessore_p.value() / 200, 0.005)
            self.fascia_quota.setRegion((q - s, q + s))

    def _mostra_riquadro(self, on):
        self.riquadro.setVisible(on)
        if on:
            self.schede.setCurrentIndex(0)

    # ------------------------------------------------------------ sezione
    def _inizia_traccia(self, on):
        self._traccia = on
        if on:
            self.a = self.b = None
            self._aggiorna_sezione()
            self.schede.setCurrentIndex(0)
            self.lbl_stato.setText("Clicca il punto di inizio (A) sulla vista dall'alto")

    def _click_vista(self, x, y):
        if not self._traccia:
            return
        if self.a is None:
            self.a = np.array([x, y])
            self.lbl_stato.setText("Clicca il punto di fine (B)")
        else:
            self.b = np.array([x, y])
            self.bt_traccia.setChecked(False)
            if self.rb_prospetto.isChecked() and self.chk_allinea_facciata.isChecked() and self.nuvola is not None:
                self.a, self.b = prospetto.allinea_facciata(self.nuvola.anteprima, self.a, self.b)
                self.lbl_stato.setText("Linea allineata alla facciata. Premi «Taglia ed estrai le linee».")
            else:
                self.lbl_stato.setText("Linea definita. Premi «Taglia ed estrai le linee».")
        self._aggiorna_sezione()

    def _inverti(self):
        if self.a is not None and self.b is not None:
            self.a, self.b = self.b, self.a
            self._aggiorna_sezione()

    def _aggiorna_sezione(self):
        pts = [p for p in (self.a, self.b) if p is not None]
        if pts:
            arr = np.array(pts)
            self.linea_sez.setData(arr[:, 0], arr[:, 1])
        else:
            self.linea_sez.setData([], [])
        for t, p in ((self.txt_a, self.a), (self.txt_b, self.b)):
            if p is None:
                t.hide()
            else:
                t.setPos(p[0], p[1])
                t.show()
        if self.a is not None and self.b is not None and self.nuvola is not None:
            o = self.nuvola.origine
            L = float(np.hypot(*(self.b - self.a)))
            self.lbl_ab.setText(
                f"A: {self.a[0] + o[0]:.2f}, {self.a[1] + o[1]:.2f}<br>"
                f"B: {self.b[0] + o[0]:.2f}, {self.b[1] + o[1]:.2f}<br>Lunghezza: {L:.2f} m"
            )
        else:
            self.lbl_ab.setText("A e B non ancora definiti")
        self._aggiorna_taglio3d()

    def _aggiorna_taglio3d(self, *_):
        """Piano di taglio nella vista 3D (coordinate locali della nuvola)."""
        if not hasattr(self, "vista3d") or self.nuvola is None:
            return
        o = self.nuvola.origine
        if self.rb_pianta.isChecked():
            t = dict(tipo="pianta", quota=self.sp_quota.value() - o[2], spessore=self.sp_spessore_p.value() / 100)
        elif self.a is not None and self.b is not None:
            if self.rb_prospetto.isChecked():
                t = dict(tipo="prospetto", a=self.a, b=self.b, davanti=self.sp_davanti.value(),
                         dietro=self.sp_dietro.value())
            else:
                t = dict(tipo="sezione", a=self.a, b=self.b, spessore=self.sp_spessore_s.value() / 100)
        else:
            t = None
        self.vista3d.imposta_taglio(t)
        if not self._timer_sel.isActive():
            self._timer_sel.start()

    def _chiave_taglio(self):
        """Impostazioni del taglio attuale (per riusare l'anteprima precisa)."""
        if self.nuvola is None:
            return None
        if self.rb_pianta.isChecked():
            rq = None
            if self.chk_riquadro.isChecked():
                pos, dim = self.riquadro.pos(), self.riquadro.size()
                rq = (round(pos.x(), 3), round(pos.y(), 3), round(pos.x() + dim.x(), 3), round(pos.y() + dim.y(), 3))
            return ("pianta", round(self.sp_quota.value(), 4), round(self.sp_spessore_p.value(), 3), rq)
        if self.a is None or self.b is None:
            return None
        ab = tuple(np.round(np.r_[self.a, self.b], 4))
        if self.rb_prospetto.isChecked():
            return ("prospetto", ab, round(self.sp_davanti.value(), 3), round(self.sp_dietro.value(), 3))
        return ("sezione", ab, round(self.sp_spessore_s.value(), 3))

    def _aggiorna_selezione(self):
        """Il "grigetto": i punti dell'anteprima che il taglio prenderà, sulla
        mappa (sopra la nuvola sbiadita) e da soli nel riquadro sotto."""
        nv = self.nuvola
        if nv is None:
            return
        P = nv.anteprima
        chiave = self._chiave_taglio()
        if chiave is None:
            self.sel_mappa.clear()
            self.sel_punti.clear()
            self.img.setOpacity(1.0)
            self.lbl_sel.setText("<b>Anteprima del taglio</b>: traccia la linea A-B sulla vista dall'alto.")
            return
        o = nv.origine
        if chiave[0] == "pianta":
            q = self.sp_quota.value() - o[2]
            s = max(self.sp_spessore_p.value() / 200, 0.005)
            m = np.abs(P[:, 2] - q) <= s
            if chiave[3] is not None:
                x0, y0, x1, y1 = chiave[3]
                m &= (P[:, 0] >= x0) & (P[:, 0] <= x1) & (P[:, 1] >= y0) & (P[:, 1] <= y1)
            mappa = P[m][:, :2]
            vista = mappa
            assi = ("X locale (m)", "Y locale (m)")
            cosa = f"pianta a quota {self.sp_quota.value():.2f} m, fetta {self.sp_spessore_p.value():.1f} cm"
        else:
            a, b = self.a, self.b
            L = float(np.hypot(*(b - a)))
            d = (b - a) / max(L, 1e-9)
            n = np.array([-d[1], d[0]])
            rel = P[:, :2] - a
            u, v = rel @ d, rel @ n
            if chiave[0] == "prospetto":
                m = (u >= 0) & (u <= L) & (v >= -self.sp_davanti.value()) & (v <= self.sp_dietro.value())
                cosa = "prospetto: tutto quello che sta nella fascia davanti e dietro la linea"
            else:
                m = (u >= 0) & (u <= L) & (np.abs(v) <= max(self.sp_spessore_s.value() / 200, 0.005))
                cosa = f"sezione lunga {L:.2f} m, fetta {self.sp_spessore_s.value():.1f} cm"
            mappa = P[m][:, :2]
            vista = np.column_stack((u[m], P[m, 2] + o[2]))
            assi = ("Distanza da A (m)", "Quota (m)")
        stima = int(m.sum() / max(len(P), 1) * nv.n)
        if len(mappa) > 150_000:
            k = np.random.default_rng(0).choice(len(mappa), 150_000, replace=False)
            mappa, vista = mappa[k], vista[k]
        self.img.setOpacity(0.35)  # nuvola sbiadita, selezione in evidenza
        self.sel_mappa.setData(pos=mappa) if len(mappa) else self.sel_mappa.clear()
        precisa = self._fetta_precisa is not None and self._fetta_precisa[0] == chiave
        if precisa:
            pts = self._fetta_precisa[1]
            vis = pts if len(pts) <= 300_000 else pts[np.random.default_rng(0).choice(len(pts), 300_000, replace=False)]
            if chiave[0] != "pianta":
                vis = vis + np.array([0.0, o[2]])
            self.sel_punti.setData(pos=vis) if len(vis) else self.sel_punti.clear()
            self.lbl_sel.setText(f"<b>Anteprima precisa</b> ({cosa}): {len(pts):,} punti veri.".replace(",", "."))
        else:
            self.sel_punti.setData(pos=vista) if len(vista) else self.sel_punti.clear()
            self.lbl_sel.setText(f"<b>Anteprima del taglio</b> ({cosa}): circa {stima:,} punti."
                                 .replace(",", ".") + (" <span style='color:#c00'>Nessun punto: cambia quota o "
                                                       "linea.</span>" if stima == 0 else ""))
        self.vista_sel.setLabel("bottom", assi[0])
        self.vista_sel.setLabel("left", assi[1])
        if getattr(self, "_chiave_vista_sel", None) != (chiave[0], chiave[1] if chiave[0] != "pianta" else None):
            self._chiave_vista_sel = (chiave[0], chiave[1] if chiave[0] != "pianta" else None)
            self.vista_sel.getPlotItem().getViewBox().autoRange()

    def anteprima_precisa(self):
        """Legge la fetta vera a piena risoluzione e la mostra."""
        nv = self.nuvola
        chiave = self._chiave_taglio()
        if nv is None or chiave is None:
            return
        o = nv.origine
        if chiave[0] == "pianta":
            q, s, rq = self.sp_quota.value() - o[2], self.sp_spessore_p.value() / 100, chiave[3]

            def lavoro(av, ann):
                return chiave, nv.fetta_pianta(q, s, rq, av, ann)
        elif chiave[0] == "sezione":
            a, b, s = self.a.copy(), self.b.copy(), self.sp_spessore_s.value() / 100

            def lavoro(av, ann):
                return chiave, nv.fetta_sezione(a, b, s, av, ann)
        else:
            a, b = self.a.copy(), self.b.copy()
            dav, die = self.sp_davanti.value(), self.sp_dietro.value()

            def lavoro(av, ann):
                fa = nv.fascia(a, b, -dav, die, av, ann)
                return chiave, (fa[:, [0, 2]] if len(fa) else np.zeros((0, 2)), fa)

        def fatto(r):
            k, pts = r
            if k[0] == "prospetto":
                self._fascia_precisa = (k, pts[1])
                pts = pts[0]
            self._fetta_precisa = (k, pts)
            self._aggiorna_selezione()
            self.lbl_stato.setText("Anteprima precisa pronta: estraendo le linee con le stesse impostazioni "
                                   "la fetta non viene riletta.")

        self._avvia(lavoro, fatto, "Lettura della fetta a piena risoluzione…")

    def _fetta_riusabile(self):
        """La fetta dell'anteprima precisa, se corrisponde al taglio attuale."""
        if self._fetta_precisa is not None and self._fetta_precisa[0] == self._chiave_taglio():
            return self._fetta_precisa[1]
        return None

    # ------------------------------------------------------------ estrazione

    def _opzioni_piombo(self):
        if not self.gr_piombo.isChecked():
            return None
        return dict(passo=self.sp_pb_passo.value() / 100, esagera=self.sp_pb_esagera.value(),
                    soglia=self.sp_pb_soglia.value() / 100, banda=self.sp_pb_banda.value() / 100)

    def estrai(self):
        nv = self.nuvola
        if nv is None:
            return
        par = self.parametri()
        riconosci = self.chk_classifica.isChecked()
        pb = self._opzioni_piombo()
        if self.rb_pianta.isChecked():
            quota = self.sp_quota.value() - nv.origine[2]
            spessore = self.sp_spessore_p.value() / 100
            riquadro = None
            if self.chk_riquadro.isChecked():
                pos, dim = self.riquadro.pos(), self.riquadro.size()
                riquadro = (pos.x(), pos.y(), pos.x() + dim.x(), pos.y() + dim.y())

            gia = self._fetta_riusabile()

            def lavoro(av, ann):
                t0 = time.time()
                pts = gia if gia is not None else nv.fetta_pianta(quota, spessore, riquadro,
                                                                   lambda f, m: av(f * 0.3, m), ann)
                av(0.3, f"Ricostruzione delle linee da {len(pts):,} punti…".replace(",", "."))
                if riconosci:
                    # linee, arredi, vani e pilastri con l'aiuto della nuvola 3D
                    poli, aperture, testi_locali = classifica.pianta(pts, par, nv, quota, ann)
                    if par.legno:
                        poli = classifica.classifica_legno(poli, "pianta")
                else:
                    poli = elabora.estrai(pts, par, ann)
                testi, report = [], []
                if riconosci:
                    testi += classifica.testi_aperture(aperture) + testi_locali
                if pb:
                    av(0.7, "Analisi del fuori piombo…")
                    if not riconosci:
                        classifica.pilastri(poli)
                    l, testi_pb, report = piombo.piombo_pianta(
                        nv, poli, quota, passo=pb["passo"], banda=pb["banda"], esagera=pb["esagera"],
                        soglia=pb["soglia"], avanzamento=lambda f, m: av(0.7 + 0.3 * f, m), annulla=ann)
                    poli = poli + l
                    testi += testi_pb
                return dict(tipo="pianta", punti=pts, polilinee=poli, quota=quota, testi=testi, report=report,
                            spessore=spessore, durata=time.time() - t0, par=par, profilo=self.cb_profilo.currentText())
        else:
            if self.a is None or self.b is None:
                QtWidgets.QMessageBox.information(
                    self, "Linea A-B", "Traccia prima la linea: premi il pulsante «Traccia…» "
                    "e clicca due punti sulla vista dall'alto."
                )
                return
            a, b = self.a.copy(), self.b.copy()
            if self.rb_prospetto.isChecked():
                davanti, dietro = self.sp_davanti.value(), self.sp_dietro.value()

                gia = self._fetta_riusabile()
                gia = self._fascia_precisa[1] if gia is not None and getattr(self, "_fascia_precisa", None) else None

                def lavoro(av, ann):
                    t0 = time.time()
                    # chi guarda la facciata sta a destra della linea A -> B
                    fa = gia if gia is not None else nv.fascia(a, b, -davanti, dietro, lambda f, m: av(f * 0.5, m), ann)
                    av(0.5, f"Ricostruzione del prospetto da {len(fa):,} punti…".replace(",", "."))
                    pts, poli = prospetto.estrai_prospetto(fa, par)
                    if not riconosci:
                        for p in poli:
                            p.categoria = "muri"
                    return dict(tipo="prospetto", punti=pts, polilinee=poli, a=a, b=b, testi=[], report=[],
                                spessore=davanti + dietro, durata=time.time() - t0, par=par, profilo=self.cb_profilo.currentText())
            else:
                spessore = self.sp_spessore_s.value() / 100
                gia = self._fetta_riusabile()

                def lavoro(av, ann):
                    t0 = time.time()
                    pts = gia if gia is not None else nv.fetta_sezione(a, b, spessore,
                                                                         lambda f, m: av(f * 0.5, m), ann)
                    av(0.5, f"Ricostruzione delle linee da {len(pts):,} punti…".replace(",", "."))
                    poli = elabora.estrai(pts, par, ann)
                    if riconosci:
                        poli = classifica.classifica_sezione(poli, pts)
                        if par.legno:
                            poli = classifica.classifica_legno(poli, "sezione")
                    testi, report = [], []
                    if pb:
                        l, testi, report = piombo.piombo_sezione(
                            poli, pts, passo=pb["passo"], banda=pb["banda"], esagera=pb["esagera"])
                        poli = poli + l
                    return dict(tipo="sezione", punti=pts, polilinee=poli, a=a, b=b, testi=testi, report=report,
                                spessore=spessore, durata=time.time() - t0, par=par, profilo=self.cb_profilo.currentText())

        self._avvia(lavoro, self._mostra_risultato, "Taglio della nuvola…")

    def _mostra_risultato(self, ris):
        self._aggiungi_taglio(ris)

    def _visualizza(self, ris):
        self.risultato = ris
        pts = ris["punti"]
        sposta = np.zeros(2) if ris["tipo"] == "pianta" else np.array([0.0, self.nuvola.origine[2]])
        vis = pts
        if len(vis) > MAX_PUNTI_SCHERMO:
            vis = vis[np.random.default_rng(0).choice(len(vis), MAX_PUNTI_SCHERMO, replace=False)]
        vis = vis + sposta if len(vis) else vis
        self.scatter.setData(pos=vis) if len(vis) else self.scatter.clear()
        per_cat = {}
        vx, vy = [], []
        for p in ris["polilinee"]:
            c = p.campiona(0.02) + sposta
            if p.chiusa and p.tipo != "cerchio":
                c = np.vstack((c, c[:1]))
            xs, ys = per_cat.setdefault(p.categoria, ([], []))
            xs.extend(c[:, 0].tolist() + [np.nan])
            ys.extend(c[:, 1].tolist() + [np.nan])
            if p.tipo != "cerchio" and not p.categoria.startswith("piombo"):
                vx.extend((p.punti[:, 0] + sposta[0]).tolist())
                vy.extend((p.punti[:, 1] + sposta[1]).tolist())
        for item in self.curve_cat.values():
            item.setData([], [])
        for cat, (xs, ys) in per_cat.items():
            if cat not in self.curve_cat:
                stile = QtCore.Qt.PenStyle.DashLine if cat in ("piombo_rif", "chiusure") else QtCore.Qt.PenStyle.SolidLine
                item = pg.PlotDataItem(pen=pg.mkPen(COLORI_CAT.get(cat, (120, 120, 120)), width=3 if cat == "chiusure" else 2,
                                                    style=stile),
                                       connect="finite")
                self.vista_ris.addItem(item)
                self.curve_cat[cat] = item
            self.curve_cat[cat].setData(np.array(xs, float), np.array(ys, float), connect="finite")
        self.vertici.setData(vx, vy)
        for t in self.etichette:
            self.vista_ris.removeItem(t)
        self.etichette = []
        for t in ris.get("testi") or []:
            if t.categoria not in ("porte", "finestre", "locali"):
                continue
            col = COLORI_CAT.get(t.categoria, (60, 60, 60))
            et = pg.TextItem(t.testo, color=col, anchor=(0.5, 0.5))
            et.setPos(t.pos[0] + sposta[0], t.pos[1] + sposta[1])
            self.vista_ris.addItem(et)
            self.etichette.append(et)
        if ris["tipo"] == "pianta":
            self.vista_ris.setLabel("bottom", "X locale (m)")
            self.vista_ris.setLabel("left", "Y locale (m)")
        else:
            self.vista_ris.setLabel("bottom", "Distanza da A (m)")
            self.vista_ris.setLabel("left", "Quota (m)")
        self.vista_ris.getPlotItem().getViewBox().autoRange()
        conteggio = classifica.conta(ris["polilinee"])
        legenda = "  ".join(
            f"<span style='color:rgb{COLORI_CAT.get(c, (120, 120, 120))}'>■</span> {NOMI_CATEGORIE.get(c, c)}: {n}"
            for c, n in conteggio.items() if not c.startswith("piombo")
        )
        testo = (
            f"{len(pts):,} punti".replace(",", ".")
            + f" → {sum(n for c, n in conteggio.items() if not c.startswith('piombo'))} elementi"
            + f" in {ris['durata']:.1f} s<br>{legenda}"
        )
        if ris.get("report"):
            peggiori = sorted(ris["report"], key=lambda r: -abs(r["massimo"]))[:4]
            testo += "<br><span style='color:rgb(220,30,30)'>Fuori piombo</span> (" + str(len(ris["report"])) + \
                " elementi; i maggiori): " + ", ".join(
                    f"{r['nome']} {r['scostamento'] * 100:+.1f} cm su {r['altezza']:.2f} m" for r in peggiori)
        if len(pts) == 0:
            testo = "Nessun punto: controlla quota, spessore o la linea A-B."
        self.lbl_ris.setText(testo)
        self.lbl_stato.setText(f"Fatto: «{ris.get('nome', '')}». Controlla il risultato; puoi rinominarlo ed "
                               "esportarlo dal riquadro 4.")
        self.schede.setCurrentWidget(self.contenitore_ris)
        self._aggiorna_stato()

    # ------------------------------------------------------------ esportazione
    def nomi_layer(self):
        imp = QtCore.QSettings("Nuvola2DXF", "Nuvola2DXF")
        return {c: imp.value(f"layer/{c}", CATEGORIE[c][0]) for c in CATEGORIE}

    def modifica_layer(self):
        dlg = QtWidgets.QDialog(self)
        dlg.setWindowTitle("Nomi dei layer")
        f = QtWidgets.QFormLayout(dlg)
        f.addRow(QtWidgets.QLabel("Nomi dei layer nel DXF (per adattarli al vostro standard CAD):"))
        attuali = self.nomi_layer()
        campi = {}
        for c in CATEGORIE:
            e = QtWidgets.QLineEdit(attuali[c])
            campi[c] = e
            f.addRow(NOMI_CATEGORIE.get(c, c) + ":", e)
        pulsanti = QtWidgets.QDialogButtonBox(
            QtWidgets.QDialogButtonBox.StandardButton.Ok | QtWidgets.QDialogButtonBox.StandardButton.Cancel
            | QtWidgets.QDialogButtonBox.StandardButton.RestoreDefaults)
        pulsanti.accepted.connect(dlg.accept)
        pulsanti.rejected.connect(dlg.reject)
        pulsanti.button(QtWidgets.QDialogButtonBox.StandardButton.RestoreDefaults).clicked.connect(
            lambda: [campi[c].setText(CATEGORIE[c][0]) for c in CATEGORIE])
        f.addRow(pulsanti)
        if esegui(dlg) == QtWidgets.QDialog.DialogCode.Accepted:
            imp = QtCore.QSettings("Nuvola2DXF", "Nuvola2DXF")
            for c, e in campi.items():
                nome = e.text().strip() or CATEGORIE[c][0]
                imp.setValue(f"layer/{c}", nome)

    def esporta_dxf(self):
        ris = self.risultato
        if ris is None:
            return
        nv = self.nuvola
        base = os.path.splitext(nv.nome)[0]
        cartella = os.path.dirname(nv.info["file"])
        nome = _nome_file(f"{base}_{ris['nome']}") + ".dxf"
        percorso, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Esporta DXF", os.path.join(cartella, nome), "DXF (*.dxf)"
        )
        if not percorso:
            return
        if not percorso.lower().endswith(".dxf"):
            percorso += ".dxf"
        try:
            extra = self._scrivi_dxf(ris, percorso)
        except Exception as e:
            QtWidgets.QMessageBox.warning(self, "Esporta DXF", f"Impossibile salvare il file:\n{e}")
            return
        self.lbl_stato.setText(f"Salvato: {percorso}")
        QtWidgets.QMessageBox.information(self, "Esporta DXF", f"DXF salvato:\n{percorso}{extra}")

    def esporta_tutti(self):
        if not self.tagli:
            return
        nv = self.nuvola
        cartella = QtWidgets.QFileDialog.getExistingDirectory(
            self, "Cartella in cui salvare un DXF per ogni taglio", os.path.dirname(nv.info["file"]))
        if not cartella:
            return
        base = os.path.splitext(nv.nome)[0]
        salvati, errori = [], []
        for ris in self.tagli:
            percorso = os.path.join(cartella, _nome_file(f"{base}_{ris['nome']}") + ".dxf")
            try:
                self._scrivi_dxf(ris, percorso)
                salvati.append(os.path.basename(percorso))
            except Exception as e:
                errori.append(f"{ris['nome']}: {e}")
        testo = f"Salvati {len(salvati)} file in\n{cartella}:\n\n" + "\n".join(salvati)
        if errori:
            testo += "\n\nNon salvati:\n" + "\n".join(errori)
        self.lbl_stato.setText(f"Salvati {len(salvati)} DXF in {cartella}")
        QtWidgets.QMessageBox.information(self, "Esporta tutti", testo)

    def _scrivi_dxf(self, ris, percorso):
        """Scrive il DXF di un taglio (e il report del fuori piombo)."""
        nv = self.nuvola
        o = nv.origine
        par = ris["par"]
        note = [f"Nuvola2DXF {__version__} - {nv.nome} - {ris['nome']}"]
        if ris["tipo"] == "pianta":
            note.append(f"Pianta - quota di taglio {ris['quota'] + o[2]:.3f} m - fetta {ris['spessore'] * 100:.1f} cm")
        else:
            a, b = ris["a"] + o[:2], ris["b"] + o[:2]
            titolo = "Sezione" if ris["tipo"] == "sezione" else "Prospetto"
            note.append(f"{titolo} A-B - A ({a[0]:.3f}; {a[1]:.3f}) - B ({b[0]:.3f}; {b[1]:.3f})"
                        f" - fascia {ris['spessore'] * 100:.0f} cm")
            note.append("X = distanza da A, Y = quota reale")
        note.append(f"Tolleranza {par.tolleranza * 100:.1f} cm - {ris.get('profilo', '')}")
        if any(p.categoria == "chiusure" for p in ris["polilinee"]):
            note.append(f"Layer chiusure da verificare: buchi e angoli nascosti richiusi oltre "
                        f"{par.buco_visibile * 100:.0f} cm")
        if ris.get("report"):
            note.append(f"Fuori piombo: scostamenti ingranditi {self.sp_pb_esagera.value():.0f} volte nel disegno, "
                        "valori scritti in cm reali (positivi verso B in sezione)")
        esporta.esporta(
            percorso,
            ris["polilinee"],
            tipo=ris["tipo"],
            origine=o,
            quota=ris.get("quota", 0.0),
            quota_reale=self.chk_quota.isChecked(),
            punti=ris["punti"] if self.chk_punti.isChecked() else None,
            polilinee_unite=self.chk_unite.isChecked(),
            note=note,
            testi=ris.get("testi"),
            layer=self.nomi_layer(),
        )
        if ris.get("report"):
            csv = os.path.splitext(percorso)[0] + "_fuori_piombo.csv"
            esporta.esporta_report_piombo(csv, ris["report"], note)
            return f"\n\nReport del fuori piombo:\n{csv}"
        return ""

    # ------------------------------------------------------------ elenco dei tagli
    def _nome_proposto(self, ris):
        if ris["tipo"] == "pianta":
            nome = f"Pianta quota {ris['quota'] + self.nuvola.origine[2]:+.2f}"
            if getattr(ris.get("par"), "metodo", "") == "intuitivo":
                nome += " intuitiva"
        elif ris["tipo"] == "sezione":
            n = 1 + sum(t["tipo"] == "sezione" for t in self.tagli)
            nome = f"Sezione {n}"
        else:
            nome = f"Prospetto {orientamento_prospetto(ris['a'], ris['b'])}"
        esistenti = {t["nome"] for t in self.tagli}
        base, k = nome, 2
        while nome in esistenti:
            nome = f"{base} ({k})"
            k += 1
        return nome

    def _aggiungi_taglio(self, ris):
        ris["nome"] = self._nome_proposto(ris)
        self.tagli.append(ris)
        item = QtWidgets.QListWidgetItem(ris["nome"])
        item.setFlags(item.flags() | QtCore.Qt.ItemFlag.ItemIsEditable)
        item.setToolTip("Doppio clic per rinominare")
        self.lista_tagli.blockSignals(True)
        self.lista_tagli.addItem(item)
        self.lista_tagli.blockSignals(False)
        self.lista_tagli.setCurrentRow(len(self.tagli) - 1)  # mostra il risultato
        self._aggiorna_linee_tagli()

    def _scegli_taglio(self, riga):
        if 0 <= riga < len(self.tagli):
            self._visualizza(self.tagli[riga])
        else:
            self.risultato = None
            self._aggiorna_stato()

    def _rinominato(self, item):
        riga = self.lista_tagli.row(item)
        if not 0 <= riga < len(self.tagli):
            return
        nome = item.text().strip()
        if not nome:
            self.lista_tagli.blockSignals(True)
            item.setText(self.tagli[riga]["nome"])
            self.lista_tagli.blockSignals(False)
            return
        self.tagli[riga]["nome"] = nome
        self._aggiorna_linee_tagli()

    def _elimina_taglio(self):
        riga = self.lista_tagli.currentRow()
        if not 0 <= riga < len(self.tagli):
            return
        del self.tagli[riga]
        self.lista_tagli.takeItem(riga)
        if not self.tagli:
            self.risultato = None
            self.scatter.clear()
            for item in self.curve_cat.values():
                item.setData([], [])
            self.vertici.clear()
            self.lbl_ris.setText("Nessun risultato.")
        self._aggiorna_linee_tagli()
        self._aggiorna_stato()

    def _aggiorna_linee_tagli(self):
        """Disegna sulla vista dall'alto le linee delle sezioni e dei prospetti
        salvati, con il loro nome."""
        for t in self.nomi_tagli:
            self.vista.removeItem(t)
        self.nomi_tagli = []
        xs, ys = [], []
        for ris in self.tagli:
            if ris["tipo"] == "pianta":
                continue
            a, b = ris["a"], ris["b"]
            xs += [a[0], b[0], np.nan]
            ys += [a[1], b[1], np.nan]
            t = pg.TextItem(ris["nome"], color=(40, 70, 130), anchor=(0.5, 1.2))
            t.setPos((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            self.vista.addItem(t)
            self.nomi_tagli.append(t)
        self.linee_tagli.setData(np.array(xs, float), np.array(ys, float), connect="finite")

    # ------------------------------------------------------------ varie
    def svuota_cache(self):
        mb = nuvola.dimensione_cache() / 1e6
        r = QtWidgets.QMessageBox.question(
            self, "Archivio temporaneo",
            f"Le nuvole già aperte sono conservate in forma veloce ({mb:,.0f} MB) in\n{nuvola.cartella_cache()}\n\n"
            "Svuotarlo? Le nuvole andranno riconvertite alla prossima apertura.",
        )
        if r == QtWidgets.QMessageBox.StandardButton.Yes:
            if self.nuvola is not None:
                self.nuvola.chiudi()
            self.nuvola = None
            self.risultato = None
            self.tagli = []
            self.lista_tagli.clear()
            self._aggiorna_linee_tagli()
            nuvola.svuota_cache()
            self.lbl_info.setText("Nessuna nuvola aperta.")
            self.img.clear()
            self._aggiorna_stato()

    def guida(self):
        QtWidgets.QMessageBox.information(self, "Guida rapida", GUIDA)

    def closeEvent(self, e):
        if self.lavoro:
            self.lavoro.annulla()
            self.lavoro.wait(5000)
        super().closeEvent(e)


GUIDA = """<h3>Nuvola2DXF (NDXF) – guida rapida</h3>
<ol>
<li><b>Apri la nuvola</b> (o trascina il file nella finestra): LAS, LAZ, E57, PTS, PTX, XYZ/TXT/ASC/CSV, PLY.
La prima apertura di un file grande richiede qualche minuto; le volte successive è immediata.</li>
<li><b>Scegli il taglio</b>:<br>
<b>Pianta</b>: quota di taglio (o trascina la linea rossa sul grafico delle quote) e spessore della fetta
(3–10 cm).<br>
<b>Sezione</b>: «Traccia la linea di sezione» e clicca A e B sulla vista dall'alto.<br>
<b>Prospetto</b>: traccia A → B lungo la facciata, da sinistra a destra come la vede chi la guarda.</li>
<li><b>Tipo di edificio</b>: <i>Squadrato</i>, <i>Prevalentemente dritto</i>, <i>Storico / irregolare</i>
(archi, volte, colonne) oppure <i>Tabià / strutture in legno</i> (tavolati, travi, puntoni, ballatoi).
Le stanze vengono richiuse dove mobili e ombre nascondono i muri: le chiusure oltre 10 cm vanno nel
layer <i>00_chiusure_da_verificare</i> (colore diverso) per controllarle in CAD.<br>
Porte e finestre: per ogni vano il programma fa da solo una sezione verticale nella nuvola e misura
soglia o davanzale e architrave (es. «P 90×210», «F 120×120 dav. 90»).</li>
<li>Premi <b>Taglia ed estrai le linee</b>. Ogni taglio si aggiunge all'elenco del riquadro 4: puoi farne
quanti vuoi (più sezioni, più prospetti) e <b>rinominarli</b> con un doppio clic (es. «Sezione A-A»,
«Prospetto nord»; per i prospetti il nome con l'orientamento è proposto in automatico).</li>
<li><b>Esporta questo…</b> salva il taglio selezionato; <b>Esporta tutti…</b> salva un DXF per ogni taglio,
con il suo nome, nella cartella scelta. Le piante mantengono le coordinate reali del rilievo; sezioni e
prospetti hanno X = distanza da A e Y = quota reale.</li>
</ol>
<p>Consigli: se le porte vengono chiuse riduci «Richiudi stanze»; se le linee sono spezzettate aumenta la
fascia o i punti vicini; se compaiono trattini su arredi o vegetazione aumenta la «Lunghezza minima».
I nomi dei layer si cambiano da «Altro ▾ → Nomi dei layer…».</p>"""


def main():
    QtCore.QCoreApplication.setAttribute(QtCore.Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    app = QtWidgets.QApplication(sys.argv)
    app.setApplicationName("Nuvola2DXF")
    app.setStyle("Fusion")
    icona = os.path.join(getattr(sys, "_MEIPASS", os.path.dirname(os.path.dirname(__file__))), "icona.png")
    if os.path.exists(icona):
        app.setWindowIcon(QtGui.QIcon(icona))
    w = Finestra()
    w.show()
    if len(sys.argv) > 1 and os.path.isfile(sys.argv[1]):
        w.apri(sys.argv[1])
    return esegui(app)
