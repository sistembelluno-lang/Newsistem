# TRITAPROJECT

Lettore ed elaboratore di progetti. Si caricano tutti gli allegati di un lavoro (PDF di tavole e relazioni, DXF, immagini, anche dentro uno ZIP o una cartella con sottocartelle). TRITAPROJECT li legge con Claude (l'intelligenza artificiale di Anthropic), fa una scheda per ciascuno e poi permette di:

- **interrogare il progetto**: misure, quote, materiali, quantità, fasi, normativa, sempre con il riferimento all'elaborato;
- **descrivere a parole** una tavola o l'intero progetto sotto il profilo tecnico, trovare **incongruenze** e preparare **richieste di chiarimenti**;
- **produrre tavole in PDF e DXF**: tavole nuove, dettagli costruttivi, ridisegni, più viste per foglio, campiture, quote, cartiglio;
- **tagliare** una zona di una tavola ed **estrapolarla in un'altra scala**, convertire un PDF vettoriale in **DXF in scala reale** (con i layer CAD originali quando il PDF li conserva);
- **modificare disegni esistenti** (DXF o PDF vettoriali): togliere o tenere layer, sostituire testi, spostare, ruotare, scalare, aggiungere elementi;
- **costruire il modello 3D** dell'opera e ricavarne **prospetti, sezioni, piante e assonometrie** con le linee nascoste eliminate, più le quantità;
- **misurare aree e distanze** (con lo strumento di misura nell'anteprima o chiedendolo in chat);
- **cercare** un testo in tutti gli allegati e **confrontare** due revisioni di una tavola;
- generare **relazioni** (generale, paesaggistica, tecnica, lettere), **tabelle e computi** (CSV per Excel), **schemi, fasi e cronoprogrammi** (PNG, PDF), con ricerca sul web della normativa (D.Lgs. 36/2023 e Allegato I.7, NTC 2018, D.P.R. 380/2001, D.Lgs. 42/2004…).

Gli elaborati prodotti sono bozze da far verificare e firmare da un tecnico abilitato.

## Installazione

Dalla pagina *Releases* del repository (o dagli *Artifacts* del workflow **Build eseguibili**) scaricare:
- `TRITAPROJECT-<versione>-setup.exe`: installazione normale;
- `TRITAPROJECT-<versione>-portable.exe`: si avvia senza installare.

| PC | File |
|---|---|
| Windows 10 / 11 a 64 bit | `TRITAPROJECT-<versione>-setup.exe` o `-portable.exe` |
| Windows 7 / 8 (anche 32 bit) | `TRITAPROJECT-<versione>-Windows7-32bit-setup.exe` o `-portable.exe` |

La versione per Windows 7 usa Electron 22, l'ultimo che supporta Windows 7. Ha le stesse funzioni, ma sulle tavole molto grandi e su PC vecchi è più lenta, e può usare al massimo 2-4 GB di memoria. Il visore 3D si apre nel browser predefinito: su Windows 7 conviene Chrome 109 o Firefox ESR 115.

Gli eseguibili non sono firmati: al primo avvio Windows può dire «Ulteriori informazioni → Esegui comunque».

## Primo avvio: la chiave di Claude

TRITAPROJECT usa Claude tramite l'API di Anthropic:
1. creare una chiave su [console.anthropic.com](https://console.anthropic.com/settings/keys) e caricare del credito;
2. in TRITAPROJECT aprire **⚙ Impostazioni**, incollare la chiave, poi **🔌 Prova collegamento**.

La chiave viene salvata cifrata sul PC (portachiavi di Windows). Nelle impostazioni si scelgono anche:
- il **modello**: Claude Opus 5.5, consigliato; Sonnet 5.5, più rapido ed economico; Fable 5.1, il più capace;
- l'**accuratezza**;
- la **ricerca sul web**;
- la **firma** da mettere nei cartigli.

L'uso si paga a consumo sul proprio account Anthropic. Cosa costa:
- **la lettura iniziale**: ogni allegato si legge una volta sola, per farne la scheda;
- **le domande**: aprono soltanto i documenti che servono.

## Come si usa

1. **＋ Nuovo progetto**, con il nome del lavoro.
2. Nella scheda **📄 Documenti**: **＋ Aggiungi file o ZIP**, **📂 Aggiungi cartella**, oppure trascinare file, cartelle o archivi nella finestra. TRITAPROJECT copia i file nel progetto e prepara le schede (in parallelo).
3. Nella scheda **💬 Chat** si scrive la domanda o si usa un comando rapido, diviso in gruppi:
   - **Leggi**: riassunto, descrizione tecnica, elenco elaborati, incongruenze, chiarimenti, normativa, cerca, interroga area, confronta;
   - **Tavole**: nuova tavola, ridisegna, dettaglio 1:20, taglia, scala diversa, PDF → DXF, modifica disegno;
   - **3D**: modello 3D, prospetti, seziona, pianta dal modello;
   - **Relazioni**: relazione generale, relazione paesaggistica, relazione tecnica, computo, fasi, spunti.
4. Gli elaborati compaiono nella chat e nella scheda **📐 Elaborati**: clic per aprirli. Il modello 3D è un file HTML che si apre nel browser e si ruota con il mouse; i file OBJ e DXF 3D si aprono nei programmi 3D e CAD.
5. **📝 Note**: informazioni che TRITAPROJECT tiene sempre presenti per quel progetto (committente, decisioni, dati verificati). Claude ci aggiunge da solo ciò che va ricordato.

Su ogni documento:
- **👁 Vedi** apre l'anteprima, con:
  - **📏 Distanza** e **▭ Area**: indicare la scala e cliccare i punti;
  - **⇩ DXF**: converte la pagina in DXF;
  - **↳ In chat**: copia la misura nella chat;
- **📝 Descrivi** chiede la descrizione tecnica a parole di quell'elaborato.

### Quante tavole si possono caricare?

Non c'è un limite fisso: un progetto può avere centinaia di elaborati.
- TRITAPROJECT conserva una scheda per ciascuno e, a ogni domanda, apre soltanto quelli che servono.
- I PDF lunghi vengono divisi da soli in parti da 90 pagine.
- Ogni file viene caricato sui server di Anthropic una sola volta (massimo 500 MB per file).
- Sul PC i file vengono copiati nella cartella del progetto. Così il progetto resta completo anche se gli originali si spostano, e si può caricare tutto insieme da uno ZIP o da una cartella del server.

### Formati

| Ingresso | Cosa ne fa |
|---|---|
| PDF vettoriali (esportati da CAD) | lettura, ingrandimenti, vettori e layer originali per DXF, ritagli, misure, modifiche |
| PDF scansionati | lettura e ingrandimenti; i ritagli usano l'immagine; per il DXF vanno ridisegnati |
| DXF (qualsiasi versione) | lettura (blocchi e quote esplosi, testi, layer), ritagli in scala, misure, modifiche |
| DWG | non leggibile direttamente (formato chiuso): salvarlo come DXF dal CAD |
| ZIP, cartelle | vengono estratti e letti tutti i PDF, DXF e immagini, anche nelle sottocartelle |
| PNG, JPG, TXT | lettura |

| Uscita | Formati |
|---|---|
| Tavole, dettagli, ritagli, prospetti e sezioni | PDF impaginato con cartiglio, DXF (R12, si apre in tutti i CAD), SVG |
| Modello 3D | visore HTML, OBJ, DXF 3D, assonometria PNG |
| Relazioni | PDF e HTML (si apre e si modifica in Word) |
| Tabelle e computi | CSV per Excel e HTML |
| Schemi, fasi, cronoprogrammi | PNG, PDF, SVG |

## Dove stanno i dati

`Documenti\TRITAPROJECT\<nome progetto>\`:
- `allegati\`: copie dei file caricati;
- `elaborati\`: tutto ciò che viene prodotto;
- `modelli\`: modelli 3D in formato JSON;
- `progetto.json`: schede, note e conversazione.

Si apre con **📁 Cartella**.

## Sviluppo

```
cd tritaproject
npm install
npm start                    # avvia l'app
npm test                     # prove di tavole/DXF e del collegamento con Claude (finto server locale)
xvfb-run -a npx electron --no-sandbox test/prova-electron.js <cartella uscita> <pdf o dxf…>
                             # prova completa senza Claude: carica i file, usa tutti gli strumenti, fotografa l'interfaccia
```

| File | Contenuto |
|---|---|
| `main.js` | finestre, archivio, esecuzione degli strumenti di Claude |
| `ai.js` | prompt, strumenti e ciclo di conversazione con Claude (SDK `@anthropic-ai/sdk`) |
| `elaborati.js` | tavole (impaginazione, SVG, DXF), relazioni, tabelle |
| `modello3d.js` | modello 3D: viste con linee nascoste, sezioni, quantità, OBJ/DXF 3D, visore |
| `dxfletto.js` | lettura dei DXF |
| `progetti.js` | progetti e allegati |
| `ui/` | interfaccia; `render.html` è la finestra nascosta con pdf.js (pagine, vettori, testi, confronti) |

Il workflow **Build eseguibili** compila l'exe a ogni push (job `tritaproject`) e lo allega alla Release insieme agli altri programmi.
