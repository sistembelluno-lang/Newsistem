# CONTROLLO_SISTEM, INSERT_SISTEM e PREVENTIVI_SISTEM

Tre programmi a pagina singola, impacchettati come applicazioni desktop con Electron:
- **CONTROLLO_SISTEM** (`Controllo_Lavori.html`, ex Controllo Lavori): il gestionale dell'amministratore;
- **INSERT_SISTEM** (`Ore_Dipendenti.html`, ex Ore Dipendenti): ogni dipendente, entrando con il proprio PIN, inserisce ore (ufficio / cantiere / trasferta), km (auto aziendale o propria), spese per tipologia (generiche, pasti, hotel, minuteria), ferie, permessi, malattia e note; nella sezione «Ferie e permessi» chiede giorni di ferie o permessi a ore, che l'amministratore approva.
- **PREVENTIVI_SISTEM** (`Preventivi.html`, `preventivi-main.js`): crea le offerte («Offerta per servizi tecnici professionali») sulla carta intestata SISTEM SRL STP e le esporta in **PDF** e **Word (.docx)**; archivio delle offerte con esito e codice commessa.

Novità 1.11: nuovo programma **PREVENTIVI_SISTEM**.
- Offerta divisa nelle sezioni fisse SPETTABILE CLIENTE, PREMESSA, OFFERTA TECNICA, OFFERTA ECONOMICA, VALIDITA’ OFFERTA, FORO COMPETENTE, CONDIZIONI DI PAGAMENTO (i titoli non si modificano); anteprima dal vivo accanto ai campi.
- Numero automatico come nelle offerte tipo (`OFFTO` + giorno + mese + anno + progressivo, es. `OFFTO910261`), modificabile; voci con «Euro … + cont prev 4,61% + iva 22%», riepilogo con contributo, IVA e totale a scelta; timbro e firma.
- Modelli di partenza (rilievo As Built, collaudo notturno, monitoraggio) e modelli propri («Salva come modello»); duplica, ricerca, esito (bozza / inviata / accettata / rifiutata), export Excel.
- Carta intestata su ogni pagina: logo, indirizzo, telefono, e-mail, PEC, sito; nel piè di pagina C.F./P.IVA e «Pag. X di Y». Dati dell'intestazione, contributo, IVA, coordinate bancarie e firma in ⚙ Impostazioni.
- Dati in `Documenti\Preventivi SISTEM\preventivi.json` (cartella cambiabile, copia giornaliera in `storico\`); i PDF e i Word vanno in `Documenti\Preventivi SISTEM\Offerte`.
- **Collegamento con CONTROLLO_SISTEM**: scegliendo in PREVENTIVI_SISTEM la stessa cartella condivisa sul server, il programma scrive `offerte.json`. Quando un'offerta diventa «accettata» le si assegna il **codice commessa** (il primo libero, letto da `codici.json`). In CONTROLLO_SISTEM il pulsante **📄 Offerte** elenca le offerte, segnala quelle accettate senza lavoro e con «+ Crea lavoro» apre il nuovo lavoro già compilato (codice = commessa, nome = oggetto, cliente, Rif. offerta, Preventivo €, esito); nel campo «Rif. offerta» di un lavoro si può anche scegliere l'offerta dall'elenco.

Novità 1.10.1: pulsante «🔌 Verifica collegamento» in entrambi i programmi (prove di lettura e scrittura sul server, con il motivo degli errori e cosa fare); errori di permesso spiegati al dipendente; un file illeggibile non blocca più la lettura delle ore degli altri.

Novità 1.10: messaggi personali dall'amministratore ai dipendenti (legati a una commessa, con scadenza, stato letto/fatto e risposta) e tabella aperta delle attività della settimana (data, codice lavoro, chi, strumentazione, auto), compilabile da amministratore e dipendenti.

Novità 1.8: esito dell'offerta con scheda contratto (rif. offerta approvata, contratto n. e data, ente, tempistiche, note); «Esporta PDF» su tutti i report; colori dei giorni (rosso festivi e festività nazionali, viola ferie programmate, blu ferie fatte, giallo malattia); file `ferie.json` nella cartella condivisa con esiti e ferie assegnate dall'amministratore. I dati restano nelle cartelle di prima (`%APPDATA%\Controllo Lavori`, `%APPDATA%\Ore Dipendenti`).

## Ore dipendenti: come funziona
I due programmi si scambiano i dati attraverso una **cartella condivisa sul server** (es. `\\SERVER\ControlloLavori`), scelta una volta su ogni PC:

| File | Chi lo scrive | Contenuto |
|---|---|---|
| `dipendenti.json` | amministratore | dipendenti, permessi, impronta (SHA-256) dei PIN |
| `codici.json` | amministratore (in automatico) | lavori attivi: codice, nome, cliente, cantiere sì/no (niente importi) e il codice più alto usato |
| `ore/<id>.json` | il dipendente | le sue registrazioni |
| `offerte.json` | PREVENTIVI_SISTEM | offerte: numero, data, cliente, oggetto, importo, esito, codice commessa |

Ogni file ha un solo scrittore, quindi non ci sono sovrascritture. Se il server non risponde, il programma dipendente conserva le registrazioni sul PC e le invia appena possibile.
**Niente approvazione**: quello che il dipendente inserisce entra da solo nel lavoro appena Controllo Lavori rilegge la cartella (all'avvio, ogni minuto e quando si torna sul programma). Le ore si sommano a **Ore totali** (e anche a **Ore trasferta** se il dipendente spunta «Ore in trasferta»), i km a **Km**, le spese a **Extra €**; se il dipendente modifica o cancella, il lavoro si corregge da solo. Nei cantieri la registrazione compare anche tra gli interventi Worksite; negli altri lavori nel registro «Ore registrate dai dipendenti» della scheda. Mentre una scheda è aperta non si tocca nulla, e un file dipendente illeggibile non toglie mai ore.
Nel pannello **👥 Ore dipendenti** l'amministratore vede tutte le registrazioni, crea dipendenti e PIN, vede ferie/permessi/note e stampa il **report mensile** per dipendente (per giorno e per lavoro, con trasferta e firme) o lo esporta in Excel.
Controllo Lavori può chiedere un **PIN di apertura** (👥 Ore dipendenti → Impostazioni), anche dopo 20 minuti di inattività.
Il codice comune ai due HTML sta in `src/` e si copia nei file con `npm run sync`.

## Scaricare l'eseguibile
**Windows 7 a 32 bit**: usare i file `…-Windows7-32bit-…` (artifact `Programmi-Windows7-32bit`), costruiti con Electron 22, l'ultima versione che supporta Windows 7; funzionano anche su Windows 10/11.

Ogni push su GitHub avvia il workflow **Build eseguibili** (scheda *Actions*). A fine build, nella pagina del run, sezione *Artifacts*:
- `Controllo-Lavori-Windows`: `Controllo-Lavori-…` e `Ore-Dipendenti-…`, ciascuno in versione `-portable.exe` (si avvia senza installare) e `-setup.exe` (installer);
- `Controllo-Lavori-macOS`: `.dmg`;
- `Controllo-Lavori-Linux`: `.AppImage`.

Creando un tag `v1.0.0` (es. `git tag v1.0.0 && git push --tags`) i file vengono allegati anche a una *Release*.

Gli eseguibili non sono firmati: al primo avvio Windows (SmartScreen) chiede "Ulteriori informazioni → Esegui comunque", macOS richiede clic destro → Apri.

## I dati
- L'app salva da sola ogni modifica nel file `Documenti\Controllo Lavori\dati_lavori.json` (cartella cambiabile con **Cambia cartella**, anche OneDrive/Google Drive), con una copia al giorno in `storico\` (ultimi 60 giorni). Il file ha lo stesso formato del backup e si può reimportare ovunque.
- All'avvio, se il file nella cartella è più recente (es. salvato da un altro PC), l'app carica quello.
- **Importa dati** accetta i backup `.json` creati da qualsiasi versione (anche il vecchio formato con `rates`), da file o incollando il testo, e può *sostituire* o *aggiungere* i lavori (quelli già presenti, stesso codice+nome+cliente, vengono saltati).
- **Esporta Excel** crea un `.csv` (separatore `;`, virgola decimale) con tutti i campi e i costi calcolati.
- **Worksite**: la spunta nella colonna *Worksite* segna un lavoro come cantiere e apre la tabella degli interventi (data, ore, km, operatore, note, *contabilizzato*). Le righe contabilizzate diventano verdi; il totale da contabilizzare compare nella finestra, in tabella e nei KPI. Gli interventi stanno nel campo `iv` del lavoro: i backup senza questo campo restano validi.
- I riquadri **Servizi aperti** e **Interventi da contab.** sono cliccabili: aprono l'elenco di tutti i servizi aperti (per scadenza, scaduti in rosso) o di tutti gli interventi da contabilizzare, con spunta per chiuderli ed export Excel.
- Nella versione web compare un promemoria se l'ultimo backup ha più di 7 giorni e ci sono modifiche.

## Sviluppo
```
npm install
npm start          # avvia l'app
npm run start:preventivi   # avvia PREVENTIVI_SISTEM
npm run dist:win   # crea gli .exe in dist/ (funziona anche da Linux)
```
Il file HTML resta l'unica fonte: modificarlo e ricompilare.
Logo e timbro di PREVENTIVI_SISTEM stanno in `assets/` e si copiano in `Preventivi.html` con `node scripts/immagini-preventivi.js`.
