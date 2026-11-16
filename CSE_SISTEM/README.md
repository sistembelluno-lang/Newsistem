# CSE_SISTEM

Documentazione del **Coordinatore per la sicurezza in fase di esecuzione**
(D.Lgs 81/2008), su **Windows** e **Android** con lo stesso programma.
In futuro si estenderà alla **Direzione Lavori**.

Stato: versione **0.2**: logica e dati provati, interfaccia nello **stile
SISTEM** (lo stesso di CONTROLLO_SISTEM: barra con il marchio, schede, tema
chiaro/scuro automatico), uguale su PC e telefono.

## Schermate

- **Cantieri**: una scheda per cantiere; «Nuovo cantiere» prepara la cartella.
- **Riepilogo** del cantiere: imprese operative, prescrizioni aperte/scadute,
  verbali, giornale, foto e l'elenco di **cose da fare** (POS da chiedere o
  verificare, esiti da trasmettere, PSC e notifica mancanti, ...).
- **Anagrafica** a gruppi (opera, soggetti, notifica e tempi) con le schede
  complete di committenti, responsabile dei lavori, CSP, CSE e DL.
- **Progetto, PSC, Notifica**: caricamento con titolo, revisione e data.
- **Imprese e POS**: situazione di ogni impresa; scheda impresa con i dati del
  POS (All. XV 3.2.1 lett. a), revisioni e **verifica di idoneità** voce per
  voce con esito proposto e prescrizioni proposte.
- **Giornale**: una voce al giorno, a linea del tempo.
- **Foto**: miniature raggruppate per giorno di scatto; anteprima con
  didascalia e posizione.
- **Verbali**: elenco con prescrizioni aperte; verbale completo (presenti,
  imprese, controlli per gruppo, verifica delle prescrizioni precedenti, non
  conformità, prescrizioni, sospensione, segnalazione al committente),
  stampa e **chiusura** (dopo la firma non si modifica più).

## Cosa gestisce

| Funzione | Dove sta su disco | Riferimento |
|---|---|---|
| Anagrafica di cantiere (modificabile) | `cantiere.json` | contenuti della notifica, All. XII |
| Progetto | `01_Progetto/` | |
| Piano di sicurezza e coordinamento | `02_PSC/` | art. 100, All. XV |
| Notifica preliminare | `03_Notifica_preliminare/` | art. 99, All. XII |
| Imprese e loro POS (con revisioni) | `04_Imprese_e_POS/<impresa>/POS/` | All. XV 3.2.1 |
| Verifiche di idoneità dei POS | `05_Verifiche_POS/` (.json + .pdf) | art. 92 c. 1 lett. b |
| Giornale dei lavori | `06_Giornale_lavori/` (una voce al giorno) | |
| Registro fotografico | `07_Registro_fotografico/` | |
| Verbali di sopralluogo | `08_Verbali_sopralluogo/` (.json + .pdf) | art. 92 |

Ogni cantiere è una **cartella leggibile anche senza il programma**, ordinata
come un fascicolo. Ogni registrazione (voce di giornale, verifica, verbale,
scheda di una foto) è un **file separato**: due dispositivi che lavorano sullo
stesso cantiere non si sovrascrivono.

### Cartella su Google Drive

I cantieri stanno in una cartella `CSE_SISTEM` dentro la **cartella di Google
Drive**, così PC e telefono vedono gli stessi dati:

- **Windows 10/11**: con «Google Drive per desktop» Drive diventa un disco
  (es. `G:\Il mio Drive`). In *Impostazioni* il programma trova da solo le
  cartelle di Drive del PC: basta «Usa questa». Le scritture sono sicure
  (prima un file temporaneo, poi la sostituzione), quindi Drive non carica mai
  file scritti a metà.
- **Android**: i cantieri stanno in `Documenti/CSE_SISTEM`; un'app di
  sincronizzazione (es. *Autosync per Google Drive* o *FolderSync*) tiene
  allineata quella cartella con la stessa cartella di Drive. All'app
  CSE_SISTEM va dato una volta il permesso «Accesso a tutti i file».
  Possibile sviluppo: accesso a Drive direttamente dall'app.

Ogni registrazione è un file a sé, quindi lavorare da due dispositivi non fa
perdere dati. I verbali hanno nel nome anche un identificativo: se due
dispositivi creano un verbale con lo stesso numero prima della
sincronizzazione, nessuno si perde e il programma segnala i numeri doppi.

### Verbali

Si compilano nel programma e si **stampano per la firma su carta**: righe di
firma per ogni presente (o righe vuote da compilare in cantiere) e per il CSE,
con la formula «letto, confermato e sottoscritto».

### Foto

- la **data di scatto** si legge dai dati EXIF (DateTimeOriginal); se manca si
  usa la data del file e la foto viene segnalata;
- le foto sono **ordinate per data di scatto** e raggruppate per giorno; il
  nome del file parte dalla data (`2026-11-16_10-32-05.jpg`), così anche in
  Esplora risorse sono in ordine;
- l'**originale non si tocca**; una copia in `timbrate/` porta la data di
  scatto **in basso a destra**.

## Architettura

Una sola base di codice in HTML/JavaScript (moduli ES, nessuna libreria
esterna nella logica):

- **Windows 10/11**: Electron (`electron/`), come le altre app SISTEM;
- **Android**: Capacitor, che impacchetta le stesse pagine `www/` e dà accesso
  a fotocamera e file.

```
www/js/
  app.js              avvio: piattaforma, archivio, pagine
  core/               indipendente dal dispositivo
    cartelle.js       struttura delle cartelle del cantiere
    modelli.js        com'è fatta ogni registrazione (+ versione dello schema)
    archivio.js       letture/scritture, tutte da qui
    registro.js       elenco delle funzioni per ruolo (CSE oggi, DL domani)
    date.js, id.js
  piattaforme/        il "disco" e i servizi di ogni dispositivo
    electron.js       Windows (tramite electron/preload.cjs)
    capacitor.js      Android (Filesystem, Camera, Share)
    memoria.js        prova nel browser e test
  servizi/            la logica del lavoro del CSE
    exif.js           data di scatto dalle foto
    timbro.js         data in basso a destra sulle foto
    foto.js           importazione, ordinamento, raggruppamento
    documenti.js      progetto, PSC, notifica
    pos.js            verifica di idoneità e situazione delle imprese
    giornale.js       voci del giornale
    verbali.js        numerazione, controlli, prescrizioni aperte
    normativa.js      art. 92, All. XV 3.2.1, controlli del sopralluogo
    stampa.js         HTML dei documenti stampabili (-> PDF)
  moduli/cse.js       le pagine delle funzioni del CSE
  ui/                 elementi dell'interfaccia (schede, finestre, icone)
```

**Direzione Lavori**: basterà aggiungere `moduli/dl.js` con moduli registrati
con ruolo `'dl'` e, se servono, nuove sezioni in `core/cartelle.js`.

## Sviluppo

```
npm test                    # test della logica (Node 22, nessuna installazione)
npm install && npm start    # programma su Windows/Linux/Mac (Electron)
npm run dist:win            # eseguibile per Windows (cartella dist/)
npx cap add android && node scripts/android-permessi.mjs && npm run android:apk
```

La compilazione automatica su GitHub (`.github/workflows/cse_sistem.yml`)
esegue i test e prepara l'eseguibile Windows e l'APK Android.

## Da fare

- icona dell'app Android (oggi quella standard) e stampa PDF su Android;
- elenco dei controlli del sopralluogo personalizzabile;
- (eventuale) accesso a Google Drive direttamente dall'app Android;
- modelli di stampa definitivi (verbale, verifica POS, registro fotografico);
- Direzione Lavori.
