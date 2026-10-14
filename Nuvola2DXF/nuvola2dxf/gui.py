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

from . import __version__, classifica, elabora, esporta, nuvola, piombo, prospetto, readers
from .parametri import CATEGORIE, DESCRIZIONI, NOMI_CATEGORIE, PROFILI, Parametri

pg.setConfigOptions(antialias=True, background="w", foreground="k")

COLORE_LINEE = (220, 30, 30)
COLORE_PUNTI = (90, 90, 90, 110)
MAX_PUNTI_SCHERMO = 250_000
COLORI_CAT = {
    "muri": (20, 20, 20), "pilastri": (0, 160, 190), "porte": (0, 150, 0), "finestre": (30, 80, 230),
    "pavimenti": (140, 80, 30), "soffitti": (190, 0, 190), "solai": (130, 130, 0), "coperture": (230, 120, 0),
    "volte": (130, 50, 200), "aggetti": (200, 160, 0), "altro": (150, 150, 150),
    "piombo": (220, 30, 30), "piombo_rif": (255, 140, 0),
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


# ---------------------------------------------------------------- finestra
class Finestra(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"Nuvola2DXF {__version__} – piante e sezioni da nuvole di punti")
        self.resize(1400, 880)
        self.nuvola = None
        self.lavoro = None
        self.risultato = None  # dict: tipo, punti, polilinee, quota, a, b, spessore
        self.a = self.b = None
        self._traccia = False
        self._costruisci()
        self._aggiorna_stato()

    # ------------------------------------------------------------ interfaccia
    def _costruisci(self):
        bar = self.addToolBar("Principale")
        bar.setMovable(False)
        bar.setToolButtonStyle(QtCore.Qt.ToolButtonStyle.ToolButtonTextBesideIcon)
        stile = self.style()
        self.az_apri = bar.addAction(
            stile.standardIcon(QtWidgets.QStyle.StandardPixmap.SP_DialogOpenButton), "Apri nuvola…", self.apri
        )
        self.az_esporta = bar.addAction(
            stile.standardIcon(QtWidgets.QStyle.StandardPixmap.SP_DialogSaveButton), "Esporta DXF…", self.esporta_dxf
        )
        bar.addSeparator()
        bar.addAction("Guida", self.guida)
        bar.addAction("Svuota archivio temporaneo", self.svuota_cache)

        # pannello sinistro
        pannello = QtWidgets.QWidget()
        lay = QtWidgets.QVBoxLayout(pannello)
        lay.setContentsMargins(8, 8, 8, 8)

        g = QtWidgets.QGroupBox("1. Nuvola di punti")
        v = QtWidgets.QVBoxLayout(g)
        self.lbl_info = QtWidgets.QLabel("Nessuna nuvola aperta.\nFormati: LAS, LAZ, E57, PTS, PTX, XYZ, TXT, ASC, CSV, PLY")
        self.lbl_info.setWordWrap(True)
        v.addWidget(self.lbl_info)
        lay.addWidget(g)

        g = QtWidgets.QGroupBox("2. Cosa vuoi ottenere")
        v = QtWidgets.QVBoxLayout(g)
        riga = QtWidgets.QHBoxLayout()
        self.rb_pianta = QtWidgets.QRadioButton("Pianta")
        self.rb_sezione = QtWidgets.QRadioButton("Sezione")
        self.rb_prospetto = QtWidgets.QRadioButton("Prospetto")
        self.rb_pianta.setToolTip("Taglio orizzontale a una quota")
        self.rb_sezione.setToolTip("Taglio verticale lungo una linea A-B")
        self.rb_prospetto.setToolTip("Facciata vista di fronte: traccia A-B lungo la facciata, da sinistra a destra "
                                     "come la vede chi la guarda")
        self.rb_pianta.setChecked(True)
        for rb in (self.rb_pianta, self.rb_sezione, self.rb_prospetto):
            riga.addWidget(rb)
            rb.toggled.connect(self._cambia_modo)
        v.addLayout(riga)

        # --- pianta
        self.box_pianta = QtWidgets.QWidget()
        f = QtWidgets.QFormLayout(self.box_pianta)
        f.setContentsMargins(0, 0, 0, 0)
        self.sp_quota = _spin(-10000, 10000, 1.0, 3, 0.05, "m")
        self.sp_quota.setToolTip("Quota reale del piano di taglio (trascina anche la linea rossa nel grafico)")
        self.sp_spessore_p = _spin(0.5, 100, 5, 1, 0.5, "cm")
        self.sp_spessore_p.setToolTip("Spessore della fetta di punti attorno alla quota di taglio")
        f.addRow("Quota di taglio:", self.sp_quota)
        f.addRow("Spessore fetta:", self.sp_spessore_p)
        self.chk_riquadro = QtWidgets.QCheckBox("Usa solo l'area nel riquadro verde")
        self.chk_riquadro.setToolTip("Mostra un riquadro sulla vista dall'alto: i punti fuori vengono ignorati")
        self.chk_riquadro.toggled.connect(self._mostra_riquadro)
        f.addRow(self.chk_riquadro)
        self.isto = pg.PlotWidget()
        self.isto.setFixedHeight(170)
        self.isto.setLabel("left", "Quota (m)")
        self.isto.getPlotItem().hideAxis("bottom")
        self.isto.setMouseEnabled(x=False, y=True)
        self.linea_quota = pg.InfiniteLine(angle=0, movable=True, pen=pg.mkPen(COLORE_LINEE, width=2))
        self.linea_quota.sigPositionChangeFinished.connect(lambda l: self.sp_quota.setValue(l.value()))
        self.isto.addItem(self.linea_quota)
        self.sp_quota.valueChanged.connect(lambda val: self.linea_quota.setValue(val))
        lbl = QtWidgets.QLabel("Distribuzione dei punti per quota (i picchi sono pavimenti e soffitti):")
        lbl.setWordWrap(True)
        f.addRow(lbl)
        f.addRow(self.isto)
        v.addWidget(self.box_pianta)

        # --- sezione
        self.box_sezione = QtWidgets.QWidget()
        f = QtWidgets.QFormLayout(self.box_sezione)
        f.setContentsMargins(0, 0, 0, 0)
        self.bt_traccia = QtWidgets.QPushButton("Traccia la linea di sezione")
        self.bt_traccia.setCheckable(True)
        self.bt_traccia.setToolTip("Poi clicca due punti sulla vista dall'alto: inizio (A) e fine (B)")
        self.bt_traccia.toggled.connect(self._inizia_traccia)
        f.addRow(self.bt_traccia)
        self.lbl_ab = QtWidgets.QLabel("A e B non ancora definiti")
        self.lbl_ab.setWordWrap(True)
        f.addRow(self.lbl_ab)
        bt_inv = QtWidgets.QPushButton("Inverti verso (A ↔ B)")
        bt_inv.clicked.connect(self._inverti)
        f.addRow(bt_inv)
        self.sp_spessore_s = _spin(0.5, 200, 5, 1, 0.5, "cm")
        self.sp_spessore_s.setToolTip("Spessore della fetta di punti attorno al piano di sezione")
        self.lbl_spessore_s = QtWidgets.QLabel("Spessore fetta:")
        f.addRow(self.lbl_spessore_s, self.sp_spessore_s)
        # --- solo prospetto
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
        self.chk_classifica = QtWidgets.QCheckBox("Riconosci gli elementi (muri, porte, finestre, pilastri, …)")
        self.chk_classifica.setChecked(True)
        self.chk_classifica.setToolTip("Divide il disegno nei layer 00_muri, 00_porte, 00_finestre, 00_pilastri, "
                                       "00_pavimenti, 00_soffitti, …")
        v.addWidget(self.chk_classifica)
        lay.addWidget(g)

        g = QtWidgets.QGroupBox("3. Tipo di edificio")
        v = QtWidgets.QVBoxLayout(g)
        self.cb_profilo = QtWidgets.QComboBox()
        self.cb_profilo.addItems(list(PROFILI))
        self.cb_profilo.currentTextChanged.connect(self._applica_profilo)
        v.addWidget(self.cb_profilo)
        self.lbl_profilo = QtWidgets.QLabel()
        self.lbl_profilo.setWordWrap(True)
        self.lbl_profilo.setStyleSheet("color:#555")
        v.addWidget(self.lbl_profilo)
        self.gr_avanzati = QtWidgets.QGroupBox("Regolazioni fini")
        self.gr_avanzati.setCheckable(True)
        self.gr_avanzati.setChecked(False)
        f = QtWidgets.QFormLayout(self.gr_avanzati)
        self.cb_motore = QtWidgets.QComboBox()
        self.cb_motore.addItem("Linee dritte (squadra e unisce)", "dritto")
        self.cb_motore.addItem("Contorno libero (archi e irregolarità)", "libero")
        self.sp_tol = _spin(0.2, 20, 2, 1, 0.5, "cm")
        self.sp_tol.setToolTip("Quanto possono scostarsi i punti dalla linea disegnata")
        self.sp_min = _spin(1, 500, 10, 0, 5, "cm")
        self.sp_min.setToolTip("I tratti più corti vengono ignorati (riduce il disturbo)")
        self.sp_buchi = _spin(0, 300, 30, 0, 5, "cm")
        self.sp_buchi.setToolTip("Interruzioni dei punti (ombre, oggetti davanti) più corte di così vengono richiuse.\nTenerlo più piccolo della larghezza delle porte.")
        self.sp_spigoli = _spin(0, 300, 30, 0, 5, "cm")
        self.sp_spigoli.setToolTip("Le linee vengono allungate fino a incontrarsi negli angoli entro questa distanza")
        self.chk_squadra = QtWidgets.QCheckBox("Angoli quasi retti → 90°")
        self.chk_allinea = QtWidgets.QCheckBox("Linee quasi parallele → parallele")
        self.sp_angolo = _spin(0, 20, 6, 1, 0.5, "°")
        self.chk_archi = QtWidgets.QCheckBox("Riconosci archi e cerchi")
        f.addRow("Metodo:", self.cb_motore)
        f.addRow("Tolleranza:", self.sp_tol)
        f.addRow("Lunghezza minima:", self.sp_min)
        f.addRow("Chiudi buchi fino a:", self.sp_buchi)
        f.addRow("Unisci spigoli entro:", self.sp_spigoli)
        f.addRow(self.chk_squadra)
        f.addRow(self.chk_allinea)
        f.addRow("Tolleranza angoli:", self.sp_angolo)
        f.addRow(self.chk_archi)
        for w in self.gr_avanzati.findChildren(QtWidgets.QWidget):
            w.setVisible(False)
        self.gr_avanzati.toggled.connect(
            lambda on: [w.setVisible(on) for w in self.gr_avanzati.findChildren(QtWidgets.QWidget)]
        )
        v.addWidget(self.gr_avanzati)
        lay.addWidget(g)

        self.gr_piombo = QtWidgets.QGroupBox("Analisi fuori piombo (facoltativa)")
        self.gr_piombo.setCheckable(True)
        self.gr_piombo.setChecked(False)
        self.gr_piombo.setToolTip("Misura quanto pareti e pilastri si scostano dalla verticale.\n"
                                  "Sezione: pareti tagliate. Pianta: facce dei muri e pilastri (dai punti 3D).")
        f = QtWidgets.QFormLayout(self.gr_piombo)
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
        for w in self.gr_piombo.findChildren(QtWidgets.QWidget):
            w.setVisible(False)
        self.gr_piombo.toggled.connect(
            lambda on: [w.setVisible(on) for w in self.gr_piombo.findChildren(QtWidgets.QWidget)]
        )
        lay.addWidget(self.gr_piombo)

        self.bt_estrai = QtWidgets.QPushButton("Taglia ed estrai le linee")
        self.bt_estrai.setMinimumHeight(42)
        f_ = self.bt_estrai.font()
        f_.setPointSize(f_.pointSize() + 2)
        f_.setBold(True)
        self.bt_estrai.setFont(f_)
        self.bt_estrai.clicked.connect(self.estrai)
        lay.addWidget(self.bt_estrai)

        g = QtWidgets.QGroupBox("4. Esporta")
        v = QtWidgets.QVBoxLayout(g)
        self.chk_unite = QtWidgets.QCheckBox("Polilinee unite (altrimenti linee e archi separati)")
        self.chk_unite.setChecked(True)
        self.chk_punti = QtWidgets.QCheckBox("Includi i punti della fetta (layer a parte)")
        self.chk_quota = QtWidgets.QCheckBox("Pianta alla quota reale (altrimenti a quota 0)")
        v.addWidget(self.chk_unite)
        v.addWidget(self.chk_punti)
        v.addWidget(self.chk_quota)
        bt = QtWidgets.QPushButton("Esporta DXF…")
        bt.clicked.connect(self.esporta_dxf)
        v.addWidget(bt)
        self.bt_esporta = bt
        bt_layer = QtWidgets.QPushButton("Nomi dei layer…")
        bt_layer.clicked.connect(self.modifica_layer)
        v.addWidget(bt_layer)
        lay.addWidget(g)
        lay.addStretch(1)

        scorri = QtWidgets.QScrollArea()
        scorri.setWidget(pannello)
        scorri.setWidgetResizable(True)
        scorri.setMinimumWidth(390)
        scorri.setMaximumWidth(470)

        # area centrale
        self.schede = QtWidgets.QTabWidget()
        self.vista = VistaPiana()
        self.vista.setLabel("bottom", "X (m)")
        self.vista.setLabel("left", "Y (m)")
        self.vista.cliccato.connect(self._click_vista)
        self.img = pg.ImageItem()
        self.vista.addItem(self.img)
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

        self.vista_ris = VistaPiana()
        self.scatter = pg.ScatterPlotItem(pxMode=True, size=2, pen=None, brush=pg.mkBrush(*COLORE_PUNTI))
        self.vista_ris.addItem(self.scatter)
        self.curve_cat = {}
        self.vertici = pg.ScatterPlotItem(pxMode=True, size=4, pen=None, brush=pg.mkBrush(60, 60, 60))
        self.vista_ris.addItem(self.vertici)
        contenitore = QtWidgets.QWidget()
        cv = QtWidgets.QVBoxLayout(contenitore)
        cv.setContentsMargins(0, 0, 0, 0)
        riga = QtWidgets.QHBoxLayout()
        self.lbl_ris = QtWidgets.QLabel("Nessun risultato: scegli il taglio e premi «Taglia ed estrai le linee».")
        self.lbl_ris.setWordWrap(True)
        riga.addWidget(self.lbl_ris, 1)
        self.chk_mostra_punti = QtWidgets.QCheckBox("Mostra punti")
        self.chk_mostra_punti.setChecked(True)
        self.chk_mostra_punti.toggled.connect(self.scatter.setVisible)
        riga.addWidget(self.chk_mostra_punti)
        cv.addLayout(riga)
        cv.addWidget(self.vista_ris)

        self.schede.addTab(self.vista, "Vista dall'alto")
        self.schede.addTab(contenitore, "Risultato (linee estratte)")

        split = QtWidgets.QSplitter()
        split.addWidget(scorri)
        split.addWidget(self.schede)
        split.setStretchFactor(1, 1)
        self.setCentralWidget(split)

        sb = self.statusBar()
        self.lbl_stato = QtWidgets.QLabel("Pronto")
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
        self.sp_min.setValue(p.lung_min * 100)
        self.sp_buchi.setValue(p.chiudi_buchi * 100)
        self.sp_spigoli.setValue(p.unisci_spigoli * 100)
        self.chk_squadra.setChecked(p.squadra)
        self.chk_allinea.setChecked(p.allinea)
        self.sp_angolo.setValue(p.tol_angolo)
        self.chk_archi.setChecked(p.archi)

    def parametri(self):
        return Parametri(
            motore=self.cb_motore.currentData(),
            tolleranza=self.sp_tol.value() / 100,
            lung_min=self.sp_min.value() / 100,
            chiudi_buchi=self.sp_buchi.value() / 100,
            unisci_spigoli=self.sp_spigoli.value() / 100,
            squadra=self.chk_squadra.isChecked(),
            allinea=self.chk_allinea.isChecked(),
            tol_angolo=self.sp_angolo.value(),
            archi=self.chk_archi.isChecked(),
        )

    # ------------------------------------------------------------ stato
    def _aggiorna_stato(self):
        occupato = self.lavoro is not None
        ha = self.nuvola is not None
        self.az_apri.setEnabled(not occupato)
        self.bt_estrai.setEnabled(ha and not occupato)
        pronto = self.risultato is not None and not occupato
        self.az_esporta.setEnabled(pronto)
        self.bt_esporta.setEnabled(pronto)

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
        o = nv.origine
        dim = nv.max - nv.min
        self.lbl_info.setText(
            f"<b>{nv.nome}</b><br>{nv.n:,} punti<br>".replace(",", ".")
            + f"Dimensioni: {dim[0]:.2f} × {dim[1]:.2f} m, altezza {dim[2]:.2f} m<br>"
            + f"Quote da {nv.min[2] + o[2]:.2f} a {nv.max[2] + o[2]:.2f} m"
        )
        self._disegna_vista()
        self._disegna_istogramma()
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
        self.lbl_stato.setText("Nuvola pronta. Scegli pianta o sezione.")
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
        nv = self.nuvola
        cont, bordi = nv.istogramma_z(300)
        z = bordi + nv.origine[2]
        self.isto.clear()
        self.isto.addItem(self.linea_quota)
        centri = (z[:-1] + z[1:]) / 2
        barre = pg.BarGraphItem(x0=0, y=centri, height=np.diff(z), width=cont,
                                brush=(150, 150, 150), pen=pg.mkPen(None))
        self.isto.addItem(barre)
        self.sp_quota.setRange(z[0], z[-1])
        # quota proposta: 1 m sopra il pavimento principale (picco più basso tra i più alti)
        picchi = np.argsort(cont)[::-1][:5]
        pavimento = centri[min(picchi)] if len(picchi) else centri[0]
        proposta = float(np.clip(pavimento + 1.0, z[0], z[-1]))
        self.sp_quota.setValue(round(proposta, 2))
        self.linea_quota.setValue(self.sp_quota.value())
        self.isto.getPlotItem().getViewBox().autoRange()

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

            def lavoro(av, ann):
                t0 = time.time()
                pts = nv.fetta_pianta(quota, spessore, riquadro, lambda f, m: av(f * 0.3, m), ann)
                av(0.3, f"Ricostruzione delle linee da {len(pts):,} punti…".replace(",", "."))
                poli = elabora.estrai(pts, par, ann)
                if riconosci:
                    av(0.5, "Riconoscimento di porte, finestre e pilastri…")
                    poli, _ = classifica.classifica_pianta(
                        poli, pts, nv, quota)
                testi, report = [], []
                if pb:
                    av(0.7, "Analisi del fuori piombo…")
                    if not riconosci:
                        classifica.pilastri(poli)
                    l, testi, report = piombo.piombo_pianta(
                        nv, poli, quota, passo=pb["passo"], banda=pb["banda"], esagera=pb["esagera"],
                        soglia=pb["soglia"], avanzamento=lambda f, m: av(0.7 + 0.3 * f, m), annulla=ann)
                    poli = poli + l
                return dict(tipo="pianta", punti=pts, polilinee=poli, quota=quota, testi=testi, report=report,
                            spessore=spessore, durata=time.time() - t0, par=par)
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

                def lavoro(av, ann):
                    t0 = time.time()
                    # chi guarda la facciata sta a destra della linea A -> B
                    fa = nv.fascia(a, b, -davanti, dietro, lambda f, m: av(f * 0.5, m), ann)
                    av(0.5, f"Ricostruzione del prospetto da {len(fa):,} punti…".replace(",", "."))
                    pts, poli = prospetto.estrai_prospetto(fa, par)
                    if not riconosci:
                        for p in poli:
                            p.categoria = "muri"
                    return dict(tipo="prospetto", punti=pts, polilinee=poli, a=a, b=b, testi=[], report=[],
                                spessore=davanti + dietro, durata=time.time() - t0, par=par)
            else:
                spessore = self.sp_spessore_s.value() / 100

                def lavoro(av, ann):
                    t0 = time.time()
                    pts = nv.fetta_sezione(a, b, spessore, lambda f, m: av(f * 0.5, m), ann)
                    av(0.5, f"Ricostruzione delle linee da {len(pts):,} punti…".replace(",", "."))
                    poli = elabora.estrai(pts, par, ann)
                    if riconosci:
                        poli = classifica.classifica_sezione(poli, pts)
                    testi, report = [], []
                    if pb:
                        l, testi, report = piombo.piombo_sezione(
                            poli, pts, passo=pb["passo"], banda=pb["banda"], esagera=pb["esagera"])
                        poli = poli + l
                    return dict(tipo="sezione", punti=pts, polilinee=poli, a=a, b=b, testi=testi, report=report,
                                spessore=spessore, durata=time.time() - t0, par=par)

        self._avvia(lavoro, self._mostra_risultato, "Taglio della nuvola…")

    def _mostra_risultato(self, ris):
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
                stile = QtCore.Qt.PenStyle.DashLine if cat == "piombo_rif" else QtCore.Qt.PenStyle.SolidLine
                item = pg.PlotDataItem(pen=pg.mkPen(COLORI_CAT.get(cat, (120, 120, 120)), width=2, style=stile),
                                       connect="finite")
                self.vista_ris.addItem(item)
                self.curve_cat[cat] = item
            self.curve_cat[cat].setData(np.array(xs, float), np.array(ys, float), connect="finite")
        self.vertici.setData(vx, vy)
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
        self.lbl_stato.setText("Fatto. Controlla il risultato ed esporta il DXF.")
        self.schede.setCurrentIndex(1)
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
        o = nv.origine
        if ris["tipo"] == "pianta":
            q = ris["quota"] + o[2]
            nome = f"{base}_pianta_quota_{q:+.2f}.dxf".replace("+", "p").replace("-", "m")
        else:
            nome = f"{base}_{ris['tipo']}.dxf"
        cartella = os.path.dirname(nv.info["file"])
        percorso, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Esporta DXF", os.path.join(cartella, nome), "DXF (*.dxf)"
        )
        if not percorso:
            return
        if not percorso.lower().endswith(".dxf"):
            percorso += ".dxf"
        par = ris["par"]
        note = [f"Nuvola2DXF {__version__} - {nv.nome}"]
        if ris["tipo"] == "pianta":
            note.append(f"Pianta - quota di taglio {ris['quota'] + o[2]:.3f} m - fetta {ris['spessore'] * 100:.1f} cm")
        else:
            a, b = ris["a"] + o[:2], ris["b"] + o[:2]
            titolo = "Sezione" if ris["tipo"] == "sezione" else "Prospetto"
            note.append(f"{titolo} A-B - A ({a[0]:.3f}; {a[1]:.3f}) - B ({b[0]:.3f}; {b[1]:.3f})"
                        f" - fascia {ris['spessore'] * 100:.0f} cm")
            note.append("X = distanza da A, Y = quota reale")
        note.append(f"Tolleranza {par.tolleranza * 100:.1f} cm - {self.cb_profilo.currentText()}")
        if ris.get("report"):
            note.append(f"Fuori piombo: scostamenti ingranditi {self.sp_pb_esagera.value():.0f} volte nel disegno, "
                        "valori scritti in cm reali (positivi verso B in sezione)")
        try:
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
            extra = ""
            if ris.get("report"):
                csv = os.path.splitext(percorso)[0] + "_fuori_piombo.csv"
                esporta.esporta_report_piombo(csv, ris["report"], note)
                extra = f"\n\nReport del fuori piombo:\n{csv}"
        except Exception as e:
            QtWidgets.QMessageBox.warning(self, "Esporta DXF", f"Impossibile salvare il file:\n{e}")
            return
        self.lbl_stato.setText(f"Salvato: {percorso}")
        QtWidgets.QMessageBox.information(self, "Esporta DXF", f"DXF salvato:\n{percorso}{extra}")

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


GUIDA = """<h3>Nuvola2DXF – guida rapida</h3>
<ol>
<li><b>Apri nuvola</b> (o trascina il file nella finestra). Formati: LAS, LAZ, E57, PTS, PTX, XYZ/TXT/ASC/CSV, PLY.
La prima apertura di un file grande richiede qualche minuto (viene convertito in un formato veloce);
le volte successive è immediata.</li>
<li>Scegli cosa ottenere:<br>
<b>Pianta</b>: quota di taglio (o trascina la linea rossa sul grafico delle quote) e spessore della fetta
(3–10 cm). Puoi limitare l'area con il riquadro verde.<br>
<b>Sezione</b>: «Traccia la linea di sezione» e clicca A e B sulla vista dall'alto.<br>
<b>Prospetto</b>: traccia A → B lungo la facciata, da sinistra a destra come la vede chi la guarda;
la linea viene allineata da sola alla facciata.</li>
<li><b>Riconosci gli elementi</b>: il disegno viene diviso nei layer 00_muri, 00_porte, 00_finestre,
00_pilastri, 00_pavimenti, 00_soffitti, 00_solai, 00_coperture, 00_volte_archi, 00_aggetti.
In pianta porta o finestra si decide guardando nella nuvola se sotto il vano c'è il davanzale.
I nomi dei layer si cambiano con «Nomi dei layer…». Gli errori di riconoscimento si correggono in CAD.</li>
<li><b>Tipo di edificio</b>: <i>Squadrato</i> per muri dritti e angoli retti, <i>Prevalentemente dritto</i>
per angoli qualsiasi, <i>Storico / irregolare</i> per chiese, archi, volte, colonne e murature irregolari.</li>
<li><b>Analisi fuori piombo</b> (facoltativa): in sezione misura le pareti tagliate, in pianta le facce dei
muri e i pilastri usando i punti 3D su tutta l'altezza. Nel DXF: verticale teorica tratteggiata, profilo reale
(ingrandito del fattore scelto), valori in cm; accanto al DXF un report CSV per Excel.</li>
<li><b>Taglia ed estrai le linee</b>, controlla il risultato ed <b>esporta il DXF</b>. Le piante mantengono le
coordinate reali del rilievo; sezioni e prospetti hanno X = distanza da A e Y = quota reale.</li>
</ol>
<p>Consigli: se le porte vengono chiuse riduci «Chiudi buchi»; se le linee sono spezzettate aumenta la
tolleranza; se compaiono trattini su arredi o vegetazione aumenta la «Lunghezza minima».</p>"""


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
