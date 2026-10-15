"""Vista 3D assonometrica della nuvola con il piano di taglio.

Disegno in software (niente OpenGL, che su Windows 7 e sui PC senza scheda
grafica dà problemi): i punti dell'anteprima vengono proiettati e
rasterizzati in un'immagine, colorati per quota, con i più vicini davanti.
Sopra: il piano di taglio semitrasparente e, in rosso, i punti che il taglio
prende. Trascinando con il mouse la vista ruota; la rotella ingrandisce.
"""

import numpy as np

try:
    from PySide6 import QtCore, QtGui, QtWidgets
except ImportError:  # Windows 7: Qt5
    from PySide2 import QtCore, QtGui, QtWidgets
import pyqtgraph as pg

MAX_PUNTI = 400_000
MAX_EVIDENZIATI = 60_000


def _colori_quota(z):
    """Colore per quota: dal blu (basso) al verde al giallo al rosso mattone (alto)."""
    t = (z - z.min()) / max(np.ptp(z), 1e-6)
    tappe = np.array([[40, 70, 160], [40, 150, 170], [120, 180, 90], [230, 190, 60], [190, 90, 50]], float)
    pos = t * (len(tappe) - 1)
    i = np.clip(pos.astype(int), 0, len(tappe) - 2)
    f = (pos - i)[:, None]
    return (tappe[i] * (1 - f) + tappe[i + 1] * f).astype(np.uint8)


def matrice(azimut, elevazione):
    """Rotazione: azimut attorno a z, poi inclinazione verso chi guarda."""
    a, e = np.radians(azimut), np.radians(elevazione)
    Rz = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    # x a destra, y verso l'alto dello schermo, profondità verso chi guarda
    Rx = np.array([[1, 0, 0], [0, np.sin(e), np.cos(e)], [0, -np.cos(e), np.sin(e)]])
    return Rx @ Rz


def rasterizza(P, colori, R, larghezza=1100):
    """Immagine RGB (h, w, 3) dei punti proiettati e rettangolo (x0, y0, lx, ly)
    in coordinate di schermo."""
    Q = P @ R.T
    x, y, d = Q[:, 0], Q[:, 1], Q[:, 2]
    x0, x1 = x.min(), x.max()
    y0, y1 = y.min(), y.max()
    lx, ly = max(x1 - x0, 1e-6), max(y1 - y0, 1e-6)
    w = larghezza
    h = int(np.clip(w * ly / lx, 50, 2000))
    px = np.clip(((x - x0) / lx * (w - 1)).astype(int), 0, w - 1)
    py = np.clip(((y - y0) / ly * (h - 1)).astype(int), 0, h - 1)
    img = np.full((w, h, 3), 255, np.uint8)  # pyqtgraph: asse 0 = x
    ordine = np.argsort(-d)  # i più lontani prima, i vicini sovrascrivono
    # ombreggiatura leggera con la profondità
    dn = (d - d.min()) / max(np.ptp(d), 1e-6)
    luce = (0.65 + 0.35 * dn)[:, None]
    col = (colori * luce).astype(np.uint8)
    img[px[ordine], py[ordine]] = col[ordine]
    return img, (x0, y0, lx, ly)


class _Vista(pg.PlotWidget):
    ruota = QtCore.Signal(float, float)

    def __init__(self):
        super().__init__()
        self.setAspectLocked(True)
        self.hideAxis("left")
        self.hideAxis("bottom")
        self.setMenuEnabled(False)
        self.getPlotItem().getViewBox().setMouseEnabled(x=False, y=False)
        self._ultimo = None

    def mousePressEvent(self, ev):
        if ev.button() == QtCore.Qt.MouseButton.LeftButton:
            self._ultimo = ev.pos()
            ev.accept()
        else:
            super().mousePressEvent(ev)

    def mouseMoveEvent(self, ev):
        if self._ultimo is not None:
            d = ev.pos() - self._ultimo
            self._ultimo = ev.pos()
            self.ruota.emit(-d.x() * 0.4, d.y() * 0.3)
            ev.accept()
        else:
            super().mouseMoveEvent(ev)

    def mouseReleaseEvent(self, ev):
        self._ultimo = None
        super().mouseReleaseEvent(ev)

    def wheelEvent(self, ev):
        passi = ev.angleDelta().y() / 120.0
        self.getPlotItem().getViewBox().scaleBy((0.87 ** passi, 0.87 ** passi))
        ev.accept()


class Vista3D(QtWidgets.QWidget):
    """Nuvola in assonometria con il piano di taglio."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.az, self.el = 35.0, 30.0
        self.P = None
        self.colori = None
        self.taglio = None
        lay = QtWidgets.QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        riga = QtWidgets.QHBoxLayout()
        riga.setContentsMargins(8, 6, 8, 0)
        self.lbl = QtWidgets.QLabel("Trascina per ruotare, rotella per ingrandire. In rosso i punti presi dal taglio.")
        self.lbl.setStyleSheet("color:#555")
        riga.addWidget(self.lbl, 1)
        for testo, az, el in (("Assonometria", 35, 30), ("Dall'alto", 0, 89.9), ("Di fronte", 0, 0.1),
                              ("Di lato", 90, 0.1)):
            b = QtWidgets.QPushButton(testo)
            b.clicked.connect(lambda _=False, a=az, e=el: self.imposta_vista(a, e))
            riga.addWidget(b)
        lay.addLayout(riga)
        self.vista = _Vista()
        self.vista.ruota.connect(self._ruota)
        lay.addWidget(self.vista, 1)
        self.img = pg.ImageItem()
        self.vista.addItem(self.img)
        self.piano = QtWidgets.QGraphicsPolygonItem()
        self.piano.setBrush(QtGui.QBrush(QtGui.QColor(255, 146, 28, 70)))
        self.piano.setPen(pg.mkPen((255, 120, 0), width=2))
        self.vista.addItem(self.piano)
        self.presi = pg.ScatterPlotItem(pxMode=True, size=2.5, pen=None, brush=pg.mkBrush(220, 20, 30))
        self.vista.addItem(self.presi)
        self.etichetta = pg.TextItem("", color=(200, 90, 0), anchor=(0, 1))
        self.vista.addItem(self.etichetta)
        self._timer = QtCore.QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.setInterval(30)
        self._timer.timeout.connect(self._disegna)

    # ------------------------------------------------------------ dati
    def imposta_nuvola(self, P):
        P = np.asarray(P, np.float64)
        if len(P) > MAX_PUNTI:
            P = P[np.random.default_rng(0).choice(len(P), MAX_PUNTI, replace=False)]
        self.P = P
        self.centro = (P.min(axis=0) + P.max(axis=0)) / 2
        self.colori = _colori_quota(P[:, 2])
        self._disegna(adatta=True)

    def imposta_taglio(self, taglio):
        """taglio: None, dict(tipo='pianta', quota, spessore) oppure
        dict(tipo='sezione'|'prospetto', a, b, spessore | davanti, dietro)."""
        self.taglio = taglio
        self._aggiorna_taglio()

    def imposta_vista(self, az, el):
        self.az, self.el = az % 360, float(np.clip(el, 0.1, 89.9))
        self._disegna(adatta=True)

    def _ruota(self, daz, del_):
        self.az = (self.az + daz) % 360
        self.el = float(np.clip(self.el + del_, 0.1, 89.9))
        if not self._timer.isActive():
            self._timer.start()

    # ------------------------------------------------------------ disegno
    def _R(self):
        return matrice(self.az, self.el)

    def _disegna(self, adatta=False):
        if self.P is None:
            return
        R = self._R()
        img, (x0, y0, lx, ly) = rasterizza(self.P - self.centro, self.colori, R)
        self.img.setImage(img, levels=(0, 255))
        self.img.setRect(QtCore.QRectF(x0, y0, lx, ly))
        self._aggiorna_taglio()
        if adatta:
            self.vista.getPlotItem().getViewBox().autoRange(padding=0.04)

    def _proietta(self, pts):
        Q = (np.asarray(pts, float) - self.centro) @ self._R().T
        return Q[:, 0], Q[:, 1]

    def _aggiorna_taglio(self):
        if self.P is None:
            return
        t = self.taglio
        if not t:
            self.piano.setPolygon(QtGui.QPolygonF())
            self.presi.clear()
            self.etichetta.setText("")
            return
        P = self.P
        mn, mx = P.min(axis=0), P.max(axis=0)
        margine = 0.05 * np.ptp(P[:, :2], axis=0).max()
        if t["tipo"] == "pianta":
            q, s = t["quota"], t["spessore"]
            angoli = [(mn[0] - margine, mn[1] - margine, q), (mx[0] + margine, mn[1] - margine, q),
                      (mx[0] + margine, mx[1] + margine, q), (mn[0] - margine, mx[1] + margine, q)]
            sel = np.abs(P[:, 2] - q) <= max(s / 2, 0.01)
            testo = "Pianta"
        else:
            a, b = np.asarray(t["a"], float), np.asarray(t["b"], float)
            L = float(np.hypot(*(b - a)))
            if L < 1e-6:
                return
            d = (b - a) / L
            n = np.array([-d[1], d[0]])
            z0, z1 = mn[2] - 0.2, mx[2] + 0.2
            angoli = [(*a, z0), (*b, z0), (*b, z1), (*a, z1)]
            rel = P[:, :2] - a
            u, v = rel @ d, rel @ n
            if t["tipo"] == "prospetto":
                # chi guarda sta a destra della linea A -> B (v negativo)
                sel = (u >= 0) & (u <= L) & (v >= -t["davanti"]) & (v <= t["dietro"])
                testo = "Prospetto"
            else:
                sel = (u >= 0) & (u <= L) & (np.abs(v) <= max(t["spessore"] / 2, 0.01))
                testo = "Sezione"
        x, y = self._proietta(angoli)
        self.piano.setPolygon(QtGui.QPolygonF([QtCore.QPointF(float(i), float(j)) for i, j in zip(x, y)]))
        idx = np.flatnonzero(sel)
        if len(idx) > MAX_EVIDENZIATI:
            idx = idx[np.random.default_rng(1).choice(len(idx), MAX_EVIDENZIATI, replace=False)]
        if len(idx):
            px, py = self._proietta(P[idx])
            self.presi.setData(px, py)
        else:
            self.presi.clear()
        self.etichetta.setText(testo)
        self.etichetta.setPos(float(x[3]), float(y[3]))
