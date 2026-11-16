// Ponte tra la pagina e il processo principale (solo le operazioni previste).
const { contextBridge, ipcRenderer } = require('electron');

const chiama = (nome) => (...argomenti) => ipcRenderer.invoke(`cse:${nome}`, ...argomenti);

contextBridge.exposeInMainWorld('cseNative', {
  esiste: chiama('esiste'),
  creaCartella: chiama('creaCartella'),
  scriviByte: chiama('scriviByte'),
  leggiByte: chiama('leggiByte'),
  scriviTesto: chiama('scriviTesto'),
  leggiTesto: chiama('leggiTesto'),
  elenca: chiama('elenca'),
  elimina: chiama('elimina'),
  apri: chiama('apri'),
  scegliFile: chiama('scegliFile'),
  scegliCartellaFile: chiama('scegliCartellaFile'),
  pdfDaHtml: chiama('pdfDaHtml'),
  cartellaDati: chiama('cartellaDati'),
  scegliCartellaDati: chiama('scegliCartellaDati'),
  cartelleGoogleDrive: chiama('cartelleGoogleDrive'),
  usaCartellaDati: chiama('usaCartellaDati'),
  /** File cambiati nella cartella dei dati da fuori (Google Drive): f(percorsi). */
  suCambiamenti: (f) => {
    const ascolta = (_e, percorsi) => f(percorsi);
    ipcRenderer.on('cse:cambiato', ascolta);
    return () => ipcRenderer.removeListener('cse:cambiato', ascolta);
  },
  claudeStato: chiama('claudeStato'),
  claudeSalvaChiave: chiama('claudeSalvaChiave'),
  claudeProva: chiama('claudeProva'),
  claudeAnnulla: chiama('claudeAnnulla'),
  claudeVerifica: chiama('claudeVerifica'),
  /** Messaggi di avanzamento della verifica con Claude: restituisce la funzione per smettere di ascoltarli. */
  suClaudeAvanzamento: (f) => {
    const ascolta = (_e, testo) => f(testo);
    ipcRenderer.on('cse:claudeAvanzamento', ascolta);
    return () => ipcRenderer.removeListener('cse:claudeAvanzamento', ascolta);
  },
});
