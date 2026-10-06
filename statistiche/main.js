const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// STATISTICHE_SISTEM: tabelle e grafici dai dati di CONTROLLO_SISTEM e INSERT_SISTEM.
// Programma a parte e in sola lettura: legge i file .json, non scrive mai nelle cartelle dei dati.
const TITLE = 'STATISTICHE_SISTEM';
app.setPath('userData', path.join(app.getPath('appData'), 'Statistiche Sistem'));
if (!app.requestSingleInstanceLock()) app.quit();

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 360,
    minHeight: 500,
    title: TITLE,
    backgroundColor: '#f6f7f9',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });
  win.loadFile(path.join(__dirname, 'Statistiche.html'));
}

const settingsPath = () => path.join(app.getPath('userData'), 'impostazioni.json');
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } }
function readSettings() { return readJson(settingsPath()) || {}; }
function writeSettings(s) { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 1)); }
// Se il programma è installato sul PC dell'amministratore, le cartelle si prendono da CONTROLLO_SISTEM finché non se ne sceglie un'altra
function adminSettings() { return readJson(path.join(app.getPath('appData'), 'Controllo Lavori', 'impostazioni.json')) || {}; }
function folders() {
  const s = readSettings(), a = adminSettings();
  return {
    dati: s.dati || a.dir || path.join(app.getPath('documents'), 'Controllo Lavori'),
    condivisa: s.condivisa || a.shared || '',
    daAdmin: { dati: !s.dati && !!a.dir, condivisa: !s.condivisa && !!a.shared },
  };
}

const ERR = { EPERM: 'accesso negato', EACCES: 'accesso negato', ENOENT: 'non trovato', EBUSY: 'file in uso', ETIMEDOUT: 'il server non risponde', EHOSTUNREACH: 'server non raggiungibile', ENETUNREACH: 'rete non raggiungibile' };
const msg = (err) => (ERR[err.code] || err.message) + (err.code ? ` [${err.code}]` : '');
function readText(p) { return fs.readFileSync(p, 'utf8'); }

// Legge tutto quello che serve: dati_lavori.json dalla cartella dei dati, dipendenti.json e ore/*.json dalla cartella condivisa
ipcMain.handle('st:load', () => {
  const f = folders(), out = { ...f, file: [], errori: [] };
  const prova = (nome, p) => { try { out.file.push({ nome, testo: readText(p), t: fs.statSync(p).mtimeMs }); } catch (err) { if (err.code !== 'ENOENT') out.errori.push(`${nome}: ${msg(err)}`); else out.errori.push(`${nome}: non trovato in ${path.dirname(p)}`); } };
  prova('dati_lavori.json', path.join(f.dati, 'dati_lavori.json'));
  if (f.condivisa) {
    if (!fs.existsSync(f.condivisa)) out.errori.push(`Cartella condivisa non raggiungibile da questo PC: ${f.condivisa}`);
    else {
      prova('dipendenti.json', path.join(f.condivisa, 'dipendenti.json'));
      const od = path.join(f.condivisa, 'ore');
      try { fs.readdirSync(od).filter((n) => /\.json$/i.test(n)).forEach((n) => prova('ore/' + n, path.join(od, n))); }
      catch (err) { out.errori.push(`Cartella «ore»: ${msg(err)}`); }
    }
  }
  return out;
});
ipcMain.handle('st:choose', async (e, kind) => {
  const f = folders();
  const r = await dialog.showOpenDialog(win, {
    title: kind === 'dati' ? 'Scegli la cartella dei dati di CONTROLLO_SISTEM (quella con dati_lavori.json)' : 'Scegli la cartella condivisa sul server (CONDIVISA)',
    defaultPath: (kind === 'dati' ? f.dati : f.condivisa) || undefined,
    properties: ['openDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const s = readSettings(); s[kind === 'dati' ? 'dati' : 'condivisa'] = r.filePaths[0]; writeSettings(s);
  return folders();
});
// Carica file .json scelti a mano (backup, file presi da un altro PC…)
ipcMain.handle('st:files', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Carica file .json', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Dati JSON', extensions: ['json'] }] });
  if (r.canceled) return [];
  return r.filePaths.map((p) => { try { return { nome: path.basename(p), testo: readText(p), t: fs.statSync(p).mtimeMs }; } catch (err) { return { nome: path.basename(p), errore: msg(err) }; } });
});
ipcMain.handle('st:saveText', async (e, name, text) => {
  const safe = String(name || 'statistiche.csv').replace(/[\\/:*?"<>|]+/g, '_');
  const r = await dialog.showSaveDialog(win, { title: 'Salva per Excel', defaultPath: path.join(app.getPath('documents'), safe), filters: [{ name: 'Excel (CSV)', extensions: ['csv'] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(r.filePath, String(text)); shell.openPath(r.filePath); return { ok: true, file: r.filePath }; }
  catch (err) { return { ok: false, error: msg(err) }; }
});
ipcMain.handle('pdf:save', async (e, name) => {
  const safe = String(name || 'statistiche.pdf').replace(/[\\/:*?"<>|]+/g, '_');
  const r = await dialog.showSaveDialog(win, { title: 'Salva il PDF', defaultPath: path.join(app.getPath('documents'), safe.endsWith('.pdf') ? safe : safe + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape: true });
    fs.writeFileSync(r.filePath, data);
    shell.openPath(r.filePath);
    return { ok: true, file: r.filePath };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit', label: 'Esci' }] },
    { label: 'Modifica', submenu: [{ role: 'copy', label: 'Copia' }, { role: 'selectAll', label: 'Seleziona tutto' }] },
    { label: 'Visualizza', submenu: [
      { role: 'reload', label: 'Ricarica' }, { type: 'separator' },
      { role: 'zoomIn', label: 'Ingrandisci' }, { role: 'zoomOut', label: 'Riduci' },
      { role: 'resetZoom', label: 'Dimensione reale' }, { type: 'separator' },
      { role: 'togglefullscreen', label: 'Schermo intero' } ] },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
