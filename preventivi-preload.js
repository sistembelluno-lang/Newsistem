// Ponte minimo tra la pagina PREVENTIVI_SISTEM e l'app: file dati, esportazione PDF/Word, cartella condivisa sul server.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  init: () => ipcRenderer.invoke('dati:init'),
  save: (json) => ipcRenderer.invoke('dati:save', json),
  choose: () => ipcRenderer.invoke('dati:choose'),
  open: () => ipcRenderer.invoke('dati:open'),
  pdf: (doc, preview) => ipcRenderer.invoke('doc:pdf', doc, preview),
  docx: (doc) => ipcRenderer.invoke('doc:docx', doc),
  expFolder: () => ipcRenderer.invoke('doc:folder'),
  shGet: () => ipcRenderer.invoke('sh:get'),
  shChoose: () => ipcRenderer.invoke('sh:choose'),
  shRead: (rel) => ipcRenderer.invoke('sh:read', rel),
  shWrite: (rel, text) => ipcRenderer.invoke('sh:write', rel, text),
});
