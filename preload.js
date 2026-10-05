// Ponte minimo tra la pagina e l'app: solo le operazioni sul file dati.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  init: () => ipcRenderer.invoke('dati:init'),
  save: (json, opt) => ipcRenderer.invoke('dati:save', json, opt),
  choose: () => ipcRenderer.invoke('dati:choose'),
  open: () => ipcRenderer.invoke('dati:open'),
});
