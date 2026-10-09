// Ponte minimo tra la pagina e l'app: file dati locale e cartella condivisa sul server.
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
  saveFile: (name, text) => ipcRenderer.invoke('file:save', name, text),
  rsRead: () => ipcRenderer.invoke('rs:read'),
  rsWrite: (text) => ipcRenderer.invoke('rs:write', text),
});
