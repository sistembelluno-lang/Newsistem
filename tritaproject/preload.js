// Ponte tra l'interfaccia e l'app: progetti, documenti, chat con Claude, elaborati.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('tp', {
  impostazioni: () => ipcRenderer.invoke('imp:leggi'),
  salvaImpostazioni: (s) => ipcRenderer.invoke('imp:salva', s),
  provaChiave: () => ipcRenderer.invoke('imp:prova'),
  progetti: () => ipcRenderer.invoke('prog:elenco'),
  crea: (nome) => ipcRenderer.invoke('prog:crea', nome),
  apri: (id) => ipcRenderer.invoke('prog:apri', id),
  note: (id, note) => ipcRenderer.invoke('prog:note', id, note),
  elimina: (id) => ipcRenderer.invoke('prog:elimina', id),
  cartella: (id, sotto) => ipcRenderer.invoke('prog:cartella', id, sotto),
  scegliFile: (cartella) => ipcRenderer.invoke('doc:scegli', cartella),
  aggiungi: (id, files) => ipcRenderer.invoke('doc:aggiungi', id, files),
  // webUtils c'è da Electron 29; nella versione per Windows 7 (Electron 22) il percorso è in file.path
  percorso: (file) => (webUtils ? webUtils.getPathForFile(file) : file.path),
  rimuovi: (id, docId) => ipcRenderer.invoke('doc:rimuovi', id, docId),
  rileggi: (id) => ipcRenderer.invoke('doc:rileggi', id),
  anteprima: (id, docId, pagina) => ipcRenderer.invoke('doc:anteprima', id, docId, pagina),
  dxf: (id, docId, pagina, scala) => ipcRenderer.invoke('doc:dxf', id, docId, pagina, scala),
  apriFile: (f) => ipcRenderer.invoke('file:apri', f),
  mostraFile: (f) => ipcRenderer.invoke('file:mostra', f),
  invia: (id, testo) => ipcRenderer.invoke('chat:invia', id, testo),
  ferma: (id) => ipcRenderer.invoke('chat:ferma', id),
  eventi: (fn) => ipcRenderer.on('evento', (e, dati) => fn(dati)),
});
