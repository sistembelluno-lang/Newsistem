# CSE_SISTEM

Documentazione del **Coordinatore per la sicurezza in fase di esecuzione**
(D.Lgs 81/2008), su **Windows** e **Android** con lo stesso programma.
In futuro si estenderà alla **Direzione Lavori**.

Stato: **ossatura** (versione 0.1). La logica e la struttura dei dati sono
pronte e provate; l'interfaccia è essenziale, la grafica verrà dopo.

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

- **Windows**: Electron (`electron/`), come le altre app SISTEM;
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
  ui/                 aiuti per l'interfaccia (da rifare con la grafica)
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

- grafica definitiva e moduli completi (persone, imprese, presenti, firme);
- sincronizzazione tra telefono e PC (cartella condivisa o server);
- modelli di stampa definitivi (verbale, verifica POS, registro fotografico);
- versione Windows 7 (Electron 22), se serve;
- Direzione Lavori.
