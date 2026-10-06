# CONTROLLO_SISTEM e INSERT_SISTEM

Due programmi a pagina singola, impacchettati come applicazioni desktop con Electron:
- **CONTROLLO_SISTEM** (`Controllo_Lavori.html`, ex Controllo Lavori): il gestionale dell'amministratore;
- **INSERT_SISTEM** (`Ore_Dipendenti.html`, ex Ore Dipendenti): ogni dipendente, entrando con il proprio PIN, inserisce ore (ufficio / cantiere / trasferta), km (auto aziendale o propria), spese per tipologia (generiche, pasti, hotel, minuteria), ferie, permessi, malattia e note; nella sezione «Ferie e permessi» chiede giorni di ferie o permessi a ore, che l'amministratore approva.

Novità 1.10.3: se la cartella condivisa scelta non esiste da quel PC (es. unità L: non collegata) INSERT_SISTEM lo dice chiaramente, con il percorso.

Novità 1.10.2: il PIN di un dipendente si salva subito sul server quando l'amministratore lo imposta; INSERT_SISTEM rilegge l'elenco dei dipendenti quando si inserisce il PIN, ogni minuto e quando si torna sul programma (nuovi dipendenti e PIN cambiati valgono subito); «Salva dipendenti» non cancella più dipendenti già presenti sul server; «Verifica collegamento» segnala se su un PC è scelta la cartella sbagliata e ricorda che la lettera di unità (es. L:) deve essere uguale su tutti i PC.

Novità 1.10.1: pulsante «🔌 Verifica collegamento» in entrambi i programmi (prove di lettura e scrittura sul server, con il motivo degli errori e cosa fare); errori di permesso spiegati al dipendente; un file illeggibile non blocca più la lettura delle ore degli altri.

Novità 1.10: messaggi personali dall'amministratore ai dipendenti (legati a una commessa, con scadenza, stato letto/fatto e risposta) e tabella aperta delle attività della settimana (data, codice lavoro, chi, strumentazione, auto), compilabile da amministratore e dipendenti.

Novità 1.8: esito dell'offerta con scheda contratto (rif. offerta approvata, contratto n. e data, ente, tempistiche, note); «Esporta PDF» su tutti i report; colori dei giorni (rosso festivi e festività nazionali, viola ferie programmate, blu ferie fatte, giallo malattia); file `ferie.json` nella cartella condivisa con esiti e ferie assegnate dall'amministratore. I dati restano nelle cartelle di prima (`%APPDATA%\Controllo Lavori`, `%APPDATA%\Ore Dipendenti`).

## Ore dipendenti: come funziona
I due programmi si scambiano i dati attraverso una **cartella condivisa sul server** (es. `\\SERVER\ControlloLavori`), scelta una volta su ogni PC:

| File | Chi lo scrive | Contenuto |
|---|---|---|
| `dipendenti.json` | amministratore | dipendenti, permessi, impronta (SHA-256) dei PIN |
| `codici.json` | amministratore (in automatico) | lavori attivi: codice, nome, cliente, cantiere sì/no (niente importi) |
| `ore/<id>.json` | il dipendente | le sue registrazioni |

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
npm run dist:win   # crea gli .exe in dist/ (funziona anche da Linux)
```
Il file HTML resta l'unica fonte: modificarlo e ricompilare.
