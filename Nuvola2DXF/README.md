# Nuvola2DXF

Programma per Windows che trasforma le nuvole di punti dei laser scanner in
**piante, sezioni e prospetti in DXF**, con le linee ricostruite in modo da
seguire il più possibile i limiti rilevati e gli elementi già divisi per layer.

Esempio: 10.000 punti che descrivono il perimetro di una stanza diventano
**una polilinea chiusa di 4 lati**, con gli spigoli uniti esattamente negli angoli.

## Cosa fa

- **Formati**: LAS, LAZ, E57, PTS, PTX, XYZ / TXT / ASC / CSV, PLY (quelli
  esportati da Trimble RealWorks, Leica Cyclone, Faro Scene, ecc.).
- **File grandi (1–10 GB e oltre)**: alla prima apertura la nuvola viene
  convertita una volta sola in un formato veloce su disco; poi ogni taglio
  legge solo i punti che servono, con poca memoria. Riaprire lo stesso file è
  immediato.
- **Pianta**: taglio orizzontale a una quota (il grafico delle quote propone
  pavimento + 1 m).
- **Sezione**: taglio verticale lungo una linea A-B tracciata sulla vista
  dall'alto.
- **Prospetto**: facciata vista di fronte; la linea si allinea da sola alla
  facciata, i vani nella superficie diventano finestre e porte, le parti
  sporgenti (balconi, cornici) vanno negli aggetti.
- **Tre modi di ricostruire le linee** secondo il tipo di edificio:
  - *Squadrato*: linee dritte, angoli quasi retti portati a 90°, spigoli uniti;
  - *Prevalentemente dritto*: linee dritte e parallele, angoli liberi;
  - *Storico / irregolare*: segue il contorno con tratti dritti, archi e
    cerchi (absidi, colonne, volte, nicchie, murature irregolari).
- **Riconoscimento degli elementi** (layer modificabili):
  `00_muri`, `00_porte`, `00_finestre`, `00_pilastri`, `00_pavimenti`,
  `00_soffitti`, `00_solai`, `00_coperture`, `00_volte_archi`, `00_aggetti`.
  In pianta porta o finestra si decide guardando nella nuvola 3D se sotto il
  vano c'è il davanzale; in sezione si riconoscono pavimento (base), soffitto,
  architravi e davanzali.
- **Analisi del fuori piombo** (facoltativa): per pareti e pilastri misura la
  posizione reale della superficie ogni 25 cm di altezza (regolabile) rispetto
  alla verticale passante per la base. Nel DXF: verticale teorica tratteggiata,
  profilo reale ingrandito (es. 10×), valori in cm e riepilogo; in più un
  report CSV apribile in Excel.
- **DXF** (AutoCAD 2010, metri): le piante hanno le coordinate reali del
  rilievo; sezioni e prospetti hanno X = distanza da A e Y = quota reale.
  Polilinee unite (con archi) oppure linee/archi separati; facoltativamente i
  punti della fetta su un layer a parte.

Gli errori di riconoscimento si correggono nel programma CAD: il DXF è già
diviso per layer.

## Scaricare il programma

Le versioni pronte (`Nuvola2DXF.exe`, un solo file, nessuna installazione)
sono nella pagina **Releases** del repository (voce *Nuvola2DXF*), oppure tra
gli *Artifacts* della compilazione automatica "Nuvola2DXF" (scheda Actions).

Requisiti: `Nuvola2DXF.exe` per Windows 10 o 11 a 64 bit;
`Nuvola2DXF-Windows7.exe` per Windows 7 e 8.1 a 64 bit (Python 3.8 e Qt5, stesse
funzioni; va bene anche su Windows 10/11). Al primo avvio Windows può mostrare un
avviso: «Ulteriori informazioni» → «Esegui comunque».

Le nuvole convertite sono conservate in `%LOCALAPPDATA%\Nuvola2DXF\cache`
(circa 12 byte per punto: 300 milioni di punti ≈ 3,6 GB); si svuota dal
pulsante «Svuota archivio temporaneo».

## Uso

1. **Apri nuvola** (o trascina il file nella finestra).
2. Scegli **Pianta**, **Sezione** o **Prospetto**; per sezione e prospetto
   traccia A e B sulla vista dall'alto.
3. Scegli il **tipo di edificio** (eventualmente le «Regolazioni fini»).
4. Se serve, attiva l'**analisi fuori piombo**.
5. **Taglia ed estrai le linee**, controlla il risultato, **Esporta DXF**.

## Per sviluppatori

```
pip install -r requirements.txt
python Nuvola2DXF.py                 # avvia il programma
pip install pytest && pytest tests   # test automatici
python tests/genera_esempi.py esempi # nuvole di prova (LAS, LAZ, PTS)
pyinstaller --noconfirm Nuvola2DXF.spec   # crea dist/Nuvola2DXF.exe
dist/Nuvola2DXF.exe --verifica esito.txt  # autoverifica dell'eseguibile
```

Struttura:

| File | Contenuto |
|---|---|
| `nuvola2dxf/readers.py` | lettura a blocchi dei formati |
| `nuvola2dxf/nuvola.py` | conversione su disco, fette per pianta/sezione/prospetto, punti 3D in scatole |
| `nuvola2dxf/motore_dritto.py` | linee dritte: RANSAC, squadratura, unione degli spigoli |
| `nuvola2dxf/motore_libero.py` | contorni liberi: scheletro, tratti dritti e archi |
| `nuvola2dxf/classifica.py` | riconoscimento di muri, porte, finestre, pilastri, pavimenti, soffitti… |
| `nuvola2dxf/prospetto.py` | prospetti |
| `nuvola2dxf/piombo.py` | analisi del fuori piombo |
| `nuvola2dxf/esporta.py` | DXF e report CSV |
| `nuvola2dxf/gui.py` | interfaccia (PySide6 + pyqtgraph) |
