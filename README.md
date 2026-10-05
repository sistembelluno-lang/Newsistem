# Controllo Lavori

Gestionale a pagina singola (`Controllo_Lavori.html`) impacchettato come applicazione desktop con Electron.

## Scaricare l'eseguibile
Ogni push su GitHub avvia il workflow **Build eseguibili** (scheda *Actions*). A fine build, nella pagina del run, sezione *Artifacts*:
- `Controllo-Lavori-Windows`: `…-portable.exe` (si avvia senza installare) e `…-setup.exe` (installer);
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
