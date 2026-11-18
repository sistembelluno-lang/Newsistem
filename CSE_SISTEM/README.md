# CSE_SISTEM

Documentazione del **Coordinatore per la sicurezza in fase di esecuzione**
(D.Lgs 81/2008), su **Windows** e **Android** con lo stesso programma.
In futuro si estenderà alla **Direzione Lavori**.

Stato: versione **0.9.3** (di prova): logica e dati provati, interfaccia nello **stile
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
- **Imprese e POS**: situazione di ogni impresa; scheda impresa con le
  **revisioni del POS**, ognuna con i suoi **elaborati** (cartella `POS rev N`)
  e i suoi **allegati** (cartella `Allegati rev N`, anche con sottocartelle;
  i file copiati a mano nelle cartelle si trovano da soli) e la
  **verifica di idoneità** con la check list SISTEM (A contenuti minimi del POS,
  B idoneità tecnico-professionale All. XVII, C adempimenti del Titolo IV):
  Sì / No / Non previsto, note, voci nascondibili, esito proposto,
  integrazioni. Su Windows la verifica si può far compilare a **Claude**, che
  legge POS, allegati e PSC. Stampe: **check list** con l'allegato delle
  integrazioni mancanti e **lettera** di richiesta integrazioni / esito.
- **Giornale**: una voce al giorno, a linea del tempo.
- **Foto**: miniature raggruppate per giorno di scatto; anteprima con
  didascalia, posizione e data di scatto nascondibile (si usa l'originale
  senza la data stampata, anche nei verbali).
- **Verbali di sopralluogo e coordinamento** (si spunta l’uno, l’altro o entrambi): elenco con prescrizioni aperte; verbale completo (presenti,
  imprese, controlli per gruppo, verifica delle prescrizioni precedenti, non
  conformità, prescrizioni, sospensione, segnalazione al committente),
  **foto scelte dal registro** (o scattate al momento) stampate dopo le firme,
  controlli **nascondibili** (non stampati e ripresi nascosti nel verbale
  dopo), esiti *conforme / non conforme / da adeguare*, stampa come una
  lettera (destinatari a sinistra, logo dello studio a destra), due foto per
  pagina, PDF in `09_PDF_in_uscita`, e **chiusura** (dopo la firma non si modifica più).

## Cosa gestisce

| Funzione | Dove sta su disco | Riferimento |
|---|---|---|
| Anagrafica di cantiere (modificabile) | `cantiere.json` | contenuti della notifica, All. XII |
| Progetto | `01_Progetto/` | |
| Piano di sicurezza e coordinamento | `02_PSC/` | art. 100, All. XV |
| Notifica preliminare | `03_Notifica_preliminare/` | art. 99, All. XII |
| Imprese e loro POS (con revisioni) | `04_Imprese_e_POS/<impresa>/POS/` | All. XV 3.2.1 |
| Verifiche di idoneità dei POS | `05_Verifiche_POS/` (.json); PDF e verifiche esterne in `04_Imprese_e_POS/<impresa>/Verifica POS_<data>/` | art. 92 c. 1 lett. b |
| Giornale dei lavori | `06_Giornale_lavori/` (una voce al giorno) | |
| Registro fotografico | `07_Registro_fotografico/` | |
| Verbali di sopralluogo e coordinamento | `08_Verbali_sopralluogo/` (.json) | art. 92 |
| PDF in uscita (verbali, check list e lettere dei POS) | `09_PDF_in_uscita/` (le check list anche nella cartella dell'impresa) | |
| Documenti ricevuti (verbali tra imprese, disegni, ...) | `10_Documenti_ricevuti/` | |
| Logo per le stampe | `logo.png` nella cartella `CSE_SISTEM` | |

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

### Sincronizzazione

- **Windows**: la cartella dei dati è osservata (`fs.watch`); quando Google
  Drive porta file cambiati altrove la pagina si ridisegna, o mostra l'avviso
  «Dati nuovi» se si sta scrivendo. Le scritture del programma non contano.
- **Android**: collegamento **diretto con Google Drive** (API REST v3,
  `www/js/servizi/drive.js`): il token arriva dal plugin nativo
  (`DispositivoPlugin.tokenDrive`, Google Identity AuthorizationClient, libreria
  `play-services-auth`), la sincronizzazione nei due sensi è in
  `www/js/servizi/sincro.js` (stato in `CSE_SISTEM/.sincro-drive.json`,
  confronto con dimensione/data locali e MD5 di Drive, eliminazioni nel cestino,
  copie di conflitto, blocco se una delle due cartelle risulta vuota). Parte
  all'avvio, al rientro nell'app, dopo ogni salvataggio e ogni 3 minuti.
  Serve un client OAuth **Android** nel progetto Google Cloud dello studio:
  pacchetto `it.sistembelluno.csesistem`, SHA-1 della chiave
  `android-extra/debug.keystore`
  `F0:74:47:B0:72:6C:56:0C:16:81:AB:FB:31:9B:42:26:67:F1:33:C4`, ambito
  `https://www.googleapis.com/auth/drive`, Drive API abilitata.
- **Android senza collegamento**: al rientro nell'app si rilegge (stesso avviso se si scrive).
- Copie di conflitto di Drive («nome (1).json», stesso id): si usa la più
  recente (`unisciCopie` in `core/archivio.js`).

### Verbali

Si compilano nel programma e si **stampano per la firma su carta**: righe di
firma per ogni presente (o righe vuote da compilare in cantiere) e per il CSE,
con la formula «letto, confermato e sottoscritto».

### Stampa e PDF

- **Windows**: verbali e verifiche dei POS diventano PDF nella cartella del
  cantiere e si aprono subito per la stampa;
- **Android**: si apre la finestra di stampa del telefono (stampante oppure
  «Salva come PDF»), con il plugin nativo `android-extra/DispositivoPlugin.java`
  che dà anche il permesso «Accesso a tutti i file».

### Verifica del POS con Claude (Windows)

- la chiave API di Anthropic si inserisce in *Impostazioni* ed è conservata
  cifrata con il portachiavi di Windows (`electron/claude.cjs`, safeStorage);
- `www/js/servizi/claude.js` prepara istruzioni, dati del cantiere e
  dell'impresa, check list e schema JSON della risposta; il processo
  principale carica i documenti con la Files API (una volta sola, poi li
  riusa) e chiama `claude-opus-5-5` con output strutturato;
- la risposta è una **proposta**: si vede evidenziata, si corregge e si salva;
  con `fallbacks: 'default'` l'API ripete la richiesta su un altro modello se
  un filtro la blocca per errore.

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

- **Windows 10/11**: Electron (`electron/`), come le altre app SISTEM; il
  collegamento con Claude è in `electron/claude.cjs` (SDK `@anthropic-ai/sdk`);
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
    pos.js            check list, esito, documenti da esaminare, lettera
    claude.js         richiesta e schema della verifica con Claude
    giornale.js       voci del giornale
    verbali.js        numerazione, controlli, prescrizioni aperte
    normativa.js      art. 92, check list POS (All. XV, XVII), controlli del sopralluogo
    stampa.js         HTML dei documenti stampabili (-> PDF)
    p7m.js            file firmati .p7m: documento contenuto e firmatari
    anteprime.js      anteprima della prima pagina (pdf.js in www/vendor/pdfjs)
    drive.js, sincro.js  Google Drive (app Android)
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
npx cap add android && node scripts/android-permessi.mjs && node scripts/android-prepara.mjs && npm run android:apk
```

La compilazione automatica su GitHub (`.github/workflows/cse_sistem.yml`)
esegue i test, prepara l'eseguibile Windows e l'APK Android e pubblica la
versione da scaricare (`cse-sistem-v<versione>`) con la guida
`guida/Guida_CSE_SISTEM.pdf`. Il progetto Android si genera ogni volta
(`npx cap add android`) e si completa con `scripts/android-permessi.mjs` e
`scripts/android-prepara.mjs` (plugin nativo, icone, versione); l'APK è firmato
con la chiave di prova `android-extra/debug.keystore`, sempre la stessa, così
le nuove versioni si installano sopra le vecchie.

## Da fare

- elenco dei controlli del sopralluogo personalizzabile;
- modelli di stampa definitivi (verbale, registro fotografico);
- verifica con Claude anche da Android;
- Direzione Lavori.
