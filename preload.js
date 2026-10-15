// Ponte minimo tra la pagina e l'app: file dati locale, cartella condivisa sul server e (Espropri) fascicoli su disco.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  init: () => ipcRenderer.invoke('dati:init'),
  save: (json, opt) => ipcRenderer.invoke('dati:save', json, opt),
  choose: () => ipcRenderer.invoke('dati:choose'),
  open: () => ipcRenderer.invoke('dati:open'),
  shGet: () => ipcRenderer.invoke('sh:get'),
  shChoose: () => ipcRenderer.invoke('sh:choose'),
  shRead: (rel) => ipcRenderer.invoke('sh:read', rel),
  shWrite: (rel, text) => ipcRenderer.invoke('sh:write', rel, text),
  shTest: () => ipcRenderer.invoke('sh:test'),
  savePdf: (name) => ipcRenderer.invoke('pdf:save', name),
  // ESPROPRI_SISTEM: fascicolo su disco e PDF in memoria
  fsBase: () => ipcRenderer.invoke('fs:base'),
  fsScegli: () => ipcRenderer.invoke('fs:scegli'),
  fsScrivi: (rel, dati) => ipcRenderer.invoke('fs:scrivi', rel, dati),
  fsLeggi: (rel) => ipcRenderer.invoke('fs:leggi', rel),
  fsElenco: (rel) => ipcRenderer.invoke('fs:elenco', rel),
  fsApri: (rel) => ipcRenderer.invoke('fs:apri', rel),
  fsMostra: (rel) => ipcRenderer.invoke('fs:mostra', rel),
  pdfDati: (opt) => ipcRenderer.invoke('pdf:dati', opt),
  dwg: (nome, dati) => ipcRenderer.invoke('dwg:converti', nome, dati),
});
