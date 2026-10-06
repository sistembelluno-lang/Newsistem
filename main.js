const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Lo stesso main.js serve due programmi: «Controllo Lavori» (amministratore) e «Ore Dipendenti».
// Ogni build include una sola delle due pagine.
const PAGE = fs.existsSync(path.join(__dirname, 'Controllo_Lavori.html')) ? 'Controllo_Lavori.html' : 'Ore_Dipendenti.html';
const ADMIN = PAGE === 'Controllo_Lavori.html';
const TITLE = ADMIN ? 'CONTROLLO_SISTEM' : 'INSERT_SISTEM';
// I programmi si chiamavano «Controllo Lavori» e «Ore Dipendenti»: i dati e le impostazioni restano nelle cartelle di sempre.
app.setPath('userData', path.join(app.getPath('appData'), ADMIN ? 'Controllo Lavori' : 'Ore Dipendenti'));

// Una sola istanza: i dati stanno nel localStorage del profilo dell'app,
// due finestre aperte insieme si sovrascriverebbero a vicenda.
if (!app.requestSingleInstanceLock()) app.quit();

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 500,
    title: TITLE,
    backgroundColor: '#eef2f8',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });

  // I link esterni (es. "Apri in Google Maps") si aprono nel browser predefinito.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });

  win.loadFile(path.join(__dirname, PAGE));
}

// Salvataggio automatico: i dati vanno anche in <cartella>/dati_lavori.json (stesso formato del backup),
// con una copia al giorno in <cartella>/storico. La cartella predefinita è Documenti\Controllo Lavori.
const FILE = 'dati_lavori.json';
const KEEP_DAYS = 60;
const settingsPath = () => path.join(app.getPath('userData'), 'impostazioni.json');
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (e) { return {}; } }
function writeSettings(s) { fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 1)); }
function dataDir() { return readSettings().dir || path.join(app.getPath('documents'), 'Controllo Lavori'); }
function localDate(d = new Date()) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

function info(dir) {
  const file = path.join(dir, FILE);
  try {
    const st = fs.statSync(file);
    return { dir, file, exists: true, mtime: st.mtimeMs, data: fs.readFileSync(file, 'utf8') };
  } catch (e) {
    return { dir, file, exists: false };
  }
}

function saveData(json, opt) {
  const dir = dataDir();
  const file = path.join(dir, FILE);
  try {
    const hist = path.join(dir, 'storico');
    fs.mkdirSync(hist, { recursive: true });
    if (opt && opt.keepOld && fs.existsSync(file)) {
      const t = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(file, path.join(hist, `dati_lavori_sostituito_${t}.json`));
    }
    // Scrittura sicura: file temporaneo e poi rinomina, così un'interruzione non lascia il file a metà.
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, json);
    try { fs.renameSync(tmp, file); } catch (e) { fs.writeFileSync(file, json); fs.rmSync(tmp, { force: true }); }
    fs.writeFileSync(path.join(hist, `backup_lavori_${localDate()}.json`), json);
    const old = fs.readdirSync(hist).filter((f) => /^backup_lavori_\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
    old.slice(0, Math.max(0, old.length - KEEP_DAYS)).forEach((f) => fs.rmSync(path.join(hist, f), { force: true }));
    return { ok: true, file, at: Date.now() };
  } catch (e) {
    return { ok: false, file, error: String((e && e.message) || e) };
  }
}

// Esporta PDF: la pagina mette il report nel riquadro di stampa, qui si sceglie dove salvarlo e si crea il PDF
ipcMain.handle('pdf:save', async (e, name) => {
  const safe = String(name || 'report.pdf').replace(/[\\/:*?"<>|]+/g, '_');
  const r = await dialog.showSaveDialog(win, { title: 'Salva il PDF', defaultPath: path.join(app.getPath('documents'), safe.endsWith('.pdf') ? safe : safe + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true });
    fs.writeFileSync(r.filePath, data);
    shell.openPath(r.filePath);
    return { ok: true, file: r.filePath };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('dati:init', () => info(dataDir()));
ipcMain.handle('dati:save', (e, json, opt) => saveData(String(json), opt));
ipcMain.handle('dati:choose', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Scegli la cartella dove salvare i dati',
    defaultPath: dataDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const s = readSettings(); s.dir = r.filePaths[0]; writeSettings(s);
  return info(s.dir);
});
ipcMain.handle('dati:open', () => { const d = dataDir(); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });

// Cartella condivisa sul server (scambio con il programma Ore Dipendenti): percorsi relativi, mai fuori dalla cartella.
function sharedDir() { return readSettings().shared || ''; }
function sharedPath(rel) {
  const base = sharedDir();
  if (!base) throw new Error('Cartella condivisa non impostata');
  const root = path.resolve(base), p = path.resolve(root, String(rel || ''));
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Percorso non valido');
  return p;
}
ipcMain.handle('sh:get', () => ({ dir: sharedDir() }));
ipcMain.handle('sh:choose', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Scegli la cartella condivisa sul server',
    defaultPath: sharedDir() || undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const s = readSettings(); s.shared = r.filePaths[0]; writeSettings(s);
  return { dir: s.shared };
});
ipcMain.handle('sh:read', (e, rel) => {
  try { return fs.readFileSync(sharedPath(rel), 'utf8'); }
  catch (err) { if (err.code === 'ENOENT') return null; throw err; }
});
ipcMain.handle('sh:write', (e, rel, text) => {
  const p = sharedPath(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, String(text));
  try { fs.renameSync(tmp, p); } catch (err) { fs.writeFileSync(p, String(text)); fs.rmSync(tmp, { force: true }); }
  return true;
});

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit', label: 'Esci' }] },
    { label: 'Modifica', submenu: [
      { role: 'undo', label: 'Annulla' }, { role: 'redo', label: 'Ripeti' }, { type: 'separator' },
      { role: 'cut', label: 'Taglia' }, { role: 'copy', label: 'Copia' }, { role: 'paste', label: 'Incolla' },
      { role: 'selectAll', label: 'Seleziona tutto' } ] },
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
