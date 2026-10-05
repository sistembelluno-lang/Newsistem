const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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
    title: 'Controllo Lavori',
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

  win.loadFile(path.join(__dirname, 'Controllo_Lavori.html'));
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
