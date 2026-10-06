// Ponte minimo tra la pagina e l'app: solo lettura dei dati, più salvataggio di CSV e PDF scelti dall'utente.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stat', {
  load: () => ipcRenderer.invoke('st:load'),
  choose: (kind) => ipcRenderer.invoke('st:choose', kind),
  files: () => ipcRenderer.invoke('st:files'),
  saveText: (name, text) => ipcRenderer.invoke('st:saveText', name, text),
  savePdf: (name) => ipcRenderer.invoke('pdf:save', name),
});
