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
  pdfDaHtml: chiama('pdfDaHtml'),
  cartellaDati: chiama('cartellaDati'),
  scegliCartellaDati: chiama('scegliCartellaDati'),
});
