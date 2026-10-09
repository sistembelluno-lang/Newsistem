const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Lo stesso main.js serve tre programmi: «Controllo Lavori» (amministratore), «Ore Dipendenti» e «Report Servizi».
// Ogni build include una sola delle pagine; in sviluppo «npm run start:report» apre il report.
const PAGE = process.argv.includes('--report') && fs.existsSync(path.join(__dirname, 'Report_Servizi.html')) ? 'Report_Servizi.html'
  : ['Controllo_Lavori.html', 'Ore_Dipendenti.html', 'Report_Servizi.html'].find((p) => fs.existsSync(path.join(__dirname, p))) || 'Ore_Dipendenti.html';
const ADMIN = PAGE === 'Controllo_Lavori.html';
const REPORT = PAGE === 'Report_Servizi.html';
const TITLE = ADMIN ? 'CONTROLLO_SISTEM' : REPORT ? 'REPORT_SISTEM' : 'INSERT_SISTEM';
// I programmi si chiamavano «Controllo Lavori» e «Ore Dipendenti»: i dati e le impostazioni restano nelle cartelle di sempre.
app.setPath('userData', path.join(app.getPath('appData'), ADMIN ? 'Controllo Lavori' : REPORT ? 'Report Servizi' : 'Ore Dipendenti'));
// Il report legge i dati di CONTROLLO_SISTEM: se non si è scelta un'altra cartella usa quelle impostate in CONTROLLO_SISTEM sullo stesso PC.
function ctrlSettings() { if (!REPORT) return {}; try { return JSON.parse(fs.readFileSync(path.join(app.getPath('appData'), 'Controllo Lavori', 'impostazioni.json'), 'utf8')); } catch (e) { return {}; } }

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
function dataDir() { return readSettings().dir || ctrlSettings().dir || path.join(app.getPath('documents'), 'Controllo Lavori'); }
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
// Il report non scrive mai il file dati di CONTROLLO_SISTEM
ipcMain.handle('dati:save', (e, json, opt) => REPORT ? { ok: false, error: 'Il report legge soltanto i dati' } : saveData(String(json), opt));
// Report servizi: a chi è assegnato ogni servizio aperto, in servizi_assegnati.json accanto a dati_lavori.json (unico scrittore: il report)
const RS_FILE = 'servizi_assegnati.json';
ipcMain.handle('rs:read', () => { try { return fs.readFileSync(path.join(dataDir(), RS_FILE), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } });
ipcMain.handle('rs:write', (e, text) => {
  if (!REPORT) throw new Error('Non permesso');
  const p = path.join(dataDir(), RS_FILE), tmp = p + '.tmp';
  fs.mkdirSync(dataDir(), { recursive: true });
  try { fs.writeFileSync(tmp, String(text)); fs.renameSync(tmp, p); } catch (err) { fs.writeFileSync(p, String(text)); fs.rmSync(tmp, { force: true }); }
  return true;
});
// Salva un file di testo (es. il .csv per Excel) dove sceglie l'utente
ipcMain.handle('file:save', async (e, name, text) => {
  const safe = String(name || 'export.csv').replace(/[\\/:*?"<>|]+/g, '_');
  const r = await dialog.showSaveDialog(win, { title: 'Salva il file', defaultPath: path.join(app.getPath('documents'), safe) });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(r.filePath, String(text)); return { ok: true, file: r.filePath }; } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
ipcMain.handle('dati:choose', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: REPORT ? 'Scegli la cartella dei dati di CONTROLLO_SISTEM (quella con dati_lavori.json)' : 'Scegli la cartella dove salvare i dati',
    defaultPath: dataDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const s = readSettings(); s.dir = r.filePaths[0]; writeSettings(s);
  return info(s.dir);
});
ipcMain.handle('dati:open', () => { const d = dataDir(); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });

// Cartella condivisa sul server (scambio con il programma Ore Dipendenti): percorsi relativi, mai fuori dalla cartella.
function sharedDir() { return readSettings().shared || ctrlSettings().shared || ''; }
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
// Errori della cartella condivisa spiegati in italiano (il codice tecnico resta tra parentesi quadre)
const SH_ERR = { EPERM: 'accesso negato: manca il permesso di scrittura', EACCES: 'accesso negato: manca il permesso', ENOENT: 'percorso non trovato', EBUSY: 'file in uso da un altro programma',
  ETIMEDOUT: 'il server non risponde', EHOSTUNREACH: 'server non raggiungibile', ENETUNREACH: 'rete non raggiungibile', EIO: 'errore di rete', UNKNOWN: 'errore di rete o percorso non valido', ENOTDIR: 'il percorso non è una cartella', EROFS: 'cartella in sola lettura' };
const shMsg = err => (SH_ERR[err.code] || err.message) + (err.code ? ` [${err.code}]` : '');
ipcMain.handle('sh:read', (e, rel) => {
  try { return fs.readFileSync(sharedPath(rel), 'utf8'); }
  catch (err) { if (err.code === 'ENOENT' && fs.existsSync(sharedDir())) return null; throw new Error(`Lettura di ${rel}: ${shMsg(err)}`); }
});
// Scrittura sicura: file temporaneo e poi sostituzione; se il server non permette la sostituzione si scrive direttamente.
// Un errore nel togliere il temporaneo non fa fallire il salvataggio.
ipcMain.handle('sh:write', (e, rel, text) => {
  const p = sharedPath(rel), t = String(text), dir = path.dirname(p);
  if (!fs.existsSync(dir)) { try { fs.mkdirSync(dir, { recursive: true }); } catch (err) { throw new Error(`Impossibile creare la cartella ${path.relative(sharedDir(), dir) || dir}: ${shMsg(err)}`); } }
  const tmp = `${p}.${os.hostname().replace(/[^\w-]/g, '')}.tmp`;
  try { fs.writeFileSync(tmp, t); fs.renameSync(tmp, p); return true; }
  catch (err) { try { fs.rmSync(tmp, { force: true }); } catch (_) { } }
  try { fs.writeFileSync(p, t); return true; }
  catch (err) { throw new Error(`Scrittura di ${rel}: ${shMsg(err)}`); }
});
// «Verifica collegamento»: prove di lettura e scrittura sulla cartella condivisa, con l'elenco dei file e la loro data
ipcMain.handle('sh:test', () => {
  const r = { dir: sharedDir(), ver: app.getVersion(), admin: ADMIN, pc: os.hostname(), utente: (() => { try { return os.userInfo().username } catch (_) { return '' } })(), prove: [], file: [], ore: [] };
  if (!r.dir) return r;
  const prova = (nome, fn, avviso) => { try { const x = fn(); r.prove.push({ nome, ok: true, info: x || '' }); return true }
    catch (err) { r.prove.push({ nome, ok: false, avviso: !!avviso, info: shMsg(err) }); return false } };
  if (!prova('Cartella condivisa raggiungibile', () => { if (!fs.statSync(r.dir).isDirectory()) throw Object.assign(new Error(''), { code: 'ENOTDIR' }) })) return r;
  const stat = n => { try { const s = fs.statSync(sharedPath(n)); return { n, t: s.mtimeMs, b: s.size } } catch (err) { return { n, err: err.code === 'ENOENT' ? 'manca' : shMsg(err) } } };
  r.file = ['dipendenti.json', 'codici.json', 'ferie.json', 'attivita.json', 'messaggi.json'].map(stat);
  prova('Lettura dell\'elenco dipendenti', () => { JSON.parse(fs.readFileSync(sharedPath('dipendenti.json'), 'utf8').replace(/^﻿/, '')); });
  if (prova('Cartella «ore» presente', () => { if (!fs.statSync(sharedPath('ore')).isDirectory()) throw Object.assign(new Error(''), { code: 'ENOTDIR' }) })) {
    try { r.ore = fs.readdirSync(sharedPath('ore')).filter(n => /\.json$/i.test(n)).map(n => stat('ore/' + n)); } catch (err) { r.prove.push({ nome: 'Elenco dei file nella cartella «ore»', ok: false, info: shMsg(err) }); }
    const f = sharedPath(`ore/_prova_${r.pc.replace(/[^\w-]/g, '')}.tmp`), g = f + '2';
    prova('Scrittura nella cartella «ore»', () => { fs.writeFileSync(f, 'prova'); });
    prova('Sostituzione e cancellazione di file nella cartella «ore» (permesso «Modifica»)', () => { fs.writeFileSync(g, 'prova'); fs.renameSync(g, f); fs.rmSync(f); });
  }
  if (ADMIN) prova('Scrittura nella cartella principale', () => { const h = sharedPath(`_prova_${r.pc.replace(/[^\w-]/g, '')}.tmp`); fs.writeFileSync(h, 'prova'); fs.rmSync(h); });
  return r;
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
