const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Lo stesso main.js serve tre programmi: «Controllo Lavori» (amministratore), «Ore Dipendenti» ed «Espropri».
// Ogni build include una sola delle pagine.
const PROGRAMMI = {
  'Controllo_Lavori.html': { title: 'CONTROLLO_SISTEM', userData: 'Controllo Lavori', dir: 'Controllo Lavori', file: 'dati_lavori.json', pref: 'lavori' },
  'Ore_Dipendenti.html': { title: 'INSERT_SISTEM', userData: 'Ore Dipendenti', dir: 'Controllo Lavori', file: 'dati_lavori.json', pref: 'lavori' },
  'Espropri.html': { title: 'ESPROPRI_SISTEM', userData: 'Espropri SISTEM', dir: 'ESPROPRI_SISTEM', file: 'dati_espropri.json', pref: 'espropri' },
};
// Nello sviluppo ci sono tutte le pagine: «electron . --pagina=Espropri.html» sceglie quale aprire
const ARG = (process.argv.find((a) => a.startsWith('--pagina=')) || '').slice(9);
const PAGE = PROGRAMMI[ARG] && fs.existsSync(path.join(__dirname, ARG)) ? ARG : Object.keys(PROGRAMMI).find((f) => fs.existsSync(path.join(__dirname, f))) || 'Ore_Dipendenti.html';
const PROG = PROGRAMMI[PAGE];
const ADMIN = PAGE === 'Controllo_Lavori.html';
const TITLE = PROG.title;
// I programmi si chiamavano «Controllo Lavori» e «Ore Dipendenti»: i dati e le impostazioni restano nelle cartelle di sempre.
app.setPath('userData', path.join(app.getPath('appData'), PROG.userData));

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
// con una copia al giorno in <cartella>/storico. La cartella predefinita è Documenti\Controllo Lavori (Espropri: Documenti\ESPROPRI_SISTEM, file dati_espropri.json).
const FILE = PROG.file;
const KEEP_DAYS = 60;
const settingsPath = () => path.join(app.getPath('userData'), 'impostazioni.json');
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (e) { return {}; } }
function writeSettings(s) { fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 1)); }
function dataDir() { return readSettings().dir || path.join(app.getPath('documents'), PROG.dir); }
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
      fs.copyFileSync(file, path.join(hist, `dati_${PROG.pref}_sostituito_${t}.json`));
    }
    // Scrittura sicura: file temporaneo e poi rinomina, così un'interruzione non lascia il file a metà.
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, json);
    try { fs.renameSync(tmp, file); } catch (e) { fs.writeFileSync(file, json); fs.rmSync(tmp, { force: true }); }
    fs.writeFileSync(path.join(hist, `backup_${PROG.pref}_${localDate()}.json`), json);
    const old = fs.readdirSync(hist).filter((f) => new RegExp(`^backup_${PROG.pref}_\\d{4}-\\d\\d-\\d\\d\\.json$`).test(f)).sort();
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

// ===== Fascicolo dell'esproprio (solo ESPROPRI_SISTEM) =====
// Una cartella per pratica e dentro una cartella per ditta («DITTA 1 ROSSI MARIO»): i documenti si salvano lì man mano.
// La pagina usa solo percorsi relativi alla cartella base; qui si impedisce di uscirne.
function fascBase() { return readSettings().fascicoli || path.join(app.getPath('documents'), PROG.dir, 'Pratiche'); }
function fascPath(rel) {
  const root = path.resolve(fascBase()), p = path.resolve(root, String(rel || ''));
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Percorso non valido');
  return p;
}
ipcMain.handle('fs:base', () => ({ dir: fascBase() }));
ipcMain.handle('fs:scegli', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Cartella dei fascicoli degli espropri', defaultPath: fascBase(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const s = readSettings(); s.fascicoli = r.filePaths[0]; writeSettings(s);
  return { dir: s.fascicoli };
});
ipcMain.handle('fs:scrivi', (e, rel, dati) => {
  const p = fascPath(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof dati === 'string' ? dati : Buffer.from(dati));
  return { ok: true, file: p };
});
ipcMain.handle('fs:leggi', (e, rel) => { try { return new Uint8Array(fs.readFileSync(fascPath(rel))); } catch (err) { return null; } });
ipcMain.handle('fs:elenco', (e, rel) => {
  const d = fascPath(rel);
  try {
    return fs.readdirSync(d, { withFileTypes: true }).map((x) => { const st = fs.statSync(path.join(d, x.name)); return { nome: x.name, dir: x.isDirectory(), size: st.size, mtime: st.mtimeMs }; });
  } catch (err) { return []; }
});
ipcMain.handle('fs:apri', (e, rel) => { const p = fascPath(rel); if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); return shell.openPath(p); });
// Apre un documento del fascicolo con il programma predefinito (Word, lettore PDF), solo se esiste
ipcMain.handle('fs:apriFile', async (e, rel) => { const p = fascPath(rel); if (!fs.existsSync(p)) return { ok: false }; const err = await shell.openPath(p); return { ok: !err, error: err }; });
ipcMain.handle('fs:mostra', (e, rel) => { shell.showItemInFolder(fascPath(rel)); return true; });
// PDF della stampa corrente restituito alla pagina (per salvarlo nel fascicolo senza chiedere dove)
ipcMain.handle('pdf:dati', async (e, opt) => {
  const data = await win.webContents.printToPDF({ printBackground: true, pageSize: (opt && opt.formato) || 'A4', landscape: !!(opt && opt.orizzontale), preferCSSPageSize: true });
  return new Uint8Array(data);
});

// DWG → DXF con ODA File Converter (gratuito, da installare a parte): il DWG è un formato chiuso e non si legge direttamente.
function trovaOda() {
  const s = readSettings(); if (s.oda && fs.existsSync(s.oda)) return s.oda;
  const basi = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], '/usr/bin', '/Applications'].filter(Boolean);
  for (const b of basi) {
    try {
      for (const d of fs.readdirSync(b)) {
        if (!/^ODA/i.test(d)) continue;
        const dir = path.join(b, d);
        const cand = [path.join(dir, 'ODAFileConverter.exe'), ...fs.readdirSync(dir).map((x) => path.join(dir, x, 'ODAFileConverter.exe')), path.join(dir, 'Contents', 'MacOS', 'ODAFileConverter')];
        const f = cand.find((x) => fs.existsSync(x)); if (f) return f;
      }
    } catch (e) { /* cartella non leggibile */ }
    if (fs.existsSync(path.join(b, 'ODAFileConverter'))) return path.join(b, 'ODAFileConverter');
  }
  return '';
}
ipcMain.handle('dwg:converti', async (e, nome, dati) => {
  const exe = trovaOda();
  if (!exe) return { ok: false, error: 'Per leggere i DWG installa «ODA File Converter» (gratuito, opendesign.com) oppure salva il disegno come DXF da AutoCAD/BricsCAD/QCAD.' };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'espr-')), inp = path.join(tmp, 'in'), out = path.join(tmp, 'out');
  fs.mkdirSync(inp); fs.mkdirSync(out);
  const base = String(nome || 'disegno.dwg').replace(/[\\/:*?"<>|]+/g, '_');
  fs.writeFileSync(path.join(inp, base), Buffer.from(dati));
  const { execFile } = require('child_process');
  await new Promise((res) => execFile(exe, [inp, out, 'ACAD2013', 'DXF', '0', '1', '*.DWG'], { timeout: 120000, windowsHide: true }, () => res()));
  const f = fs.readdirSync(out).find((x) => /\.dxf$/i.test(x));
  const r = f ? { ok: true, dati: new Uint8Array(fs.readFileSync(path.join(out, f))) } : { ok: false, error: 'Conversione del DWG non riuscita' };
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (err) { /* pulizia non essenziale */ }
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
