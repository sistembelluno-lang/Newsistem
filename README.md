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
L'app salva i dati nel proprio profilo (localStorage di Electron, in `%APPDATA%\Controllo Lavori` su Windows), separato da quello del browser o di claude.ai. Per portare i dati esistenti: **Esporta backup** dalla versione web, poi **Importa dati** nell'app.

## Sviluppo
```
npm install
npm start          # avvia l'app
npm run dist:win   # crea gli .exe in dist/ (funziona anche da Linux)
```
Il file HTML resta l'unica fonte: modificarlo e ricompilare.
