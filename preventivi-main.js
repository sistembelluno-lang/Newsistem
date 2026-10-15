const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');

// PREVENTIVI_SISTEM: offerte con la carta intestata SISTEM SRL STP, esportate in PDF e Word (.docx).
// Le offerte stanno in <cartella dati>/preventivi.json; il riepilogo (offerte.json) va nella cartella condivisa
// sul server, da dove CONTROLLO_SISTEM lo legge per collegare offerta e commessa.
const TITLE = 'PREVENTIVI_SISTEM';
app.setPath('userData', path.join(app.getPath('appData'), 'Preventivi SISTEM'));
if (!app.requestSingleInstanceLock()) app.quit();

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 360, minHeight: 500, title: TITLE, backgroundColor: '#eef2f8', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preventivi-preload.js') },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadFile(path.join(__dirname, 'Preventivi.html'));
}

// ===== Dati: <cartella>/preventivi.json con una copia al giorno in <cartella>/storico =====
const FILE = 'preventivi.json';
const KEEP_DAYS = 60;
const settingsPath = () => path.join(app.getPath('userData'), 'impostazioni.json');
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (e) { return {}; } }
function writeSettings(s) { fs.mkdirSync(path.dirname(settingsPath()), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 1)); }
function dataDir() { return readSettings().dir || path.join(app.getPath('documents'), 'Preventivi SISTEM'); }
function localDate(d = new Date()) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function info(dir) {
  const file = path.join(dir, FILE);
  try { const st = fs.statSync(file); return { dir, file, exists: true, mtime: st.mtimeMs, data: fs.readFileSync(file, 'utf8') }; }
  catch (e) { return { dir, file, exists: false }; }
}
function saveData(json) {
  const dir = dataDir(), file = path.join(dir, FILE);
  try {
    const hist = path.join(dir, 'storico');
    fs.mkdirSync(hist, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, json);
    try { fs.renameSync(tmp, file); } catch (e) { fs.writeFileSync(file, json); fs.rmSync(tmp, { force: true }); }
    fs.writeFileSync(path.join(hist, `preventivi_${localDate()}.json`), json);
    const old = fs.readdirSync(hist).filter((f) => /^preventivi_\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
    old.slice(0, Math.max(0, old.length - KEEP_DAYS)).forEach((f) => fs.rmSync(path.join(hist, f), { force: true }));
    return { ok: true, file, at: Date.now() };
  } catch (e) { return { ok: false, file, error: String((e && e.message) || e) }; }
}
ipcMain.handle('dati:init', () => ({ ...info(dataDir()), ver: app.getVersion() }));
ipcMain.handle('dati:save', (e, json) => saveData(String(json)));
ipcMain.handle('dati:choose', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Scegli la cartella dove salvare le offerte', defaultPath: dataDir(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const s = readSettings(); s.dir = r.filePaths[0]; writeSettings(s);
  return info(s.dir);
});
ipcMain.handle('dati:open', () => { const d = dataDir(); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });

// ===== Esportazione: PDF (stampa di una finestra nascosta) e Word (.docx: file XML compressi in uno zip) =====
const safeName = (n, ext) => { const s = String(n || 'offerta').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 140) || 'offerta'; return s.toLowerCase().endsWith(ext) ? s : s + ext; };
function exportDir() { const s = readSettings(); return s.exp && fs.existsSync(s.exp) ? s.exp : path.join(dataDir(), 'Offerte'); }
async function askSave(name, ext, label) {
  const dir = exportDir(); try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { }
  const r = await dialog.showSaveDialog(win, { title: `Salva l'offerta in ${label}`, defaultPath: path.join(dir, safeName(name, ext)), filters: [{ name: label, extensions: [ext.slice(1)] }] });
  if (r.canceled || !r.filePath) return null;
  const s = readSettings(); s.exp = path.dirname(r.filePath); writeSettings(s);
  return r.filePath;
}
const mm = (v) => v / 25.4;
async function makePdf(doc) {
  const tmp = path.join(os.tmpdir(), `preventivo_${process.pid}_${Date.now()}.html`);
  fs.writeFileSync(tmp, doc.html);
  const w = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true, javascript: false, contextIsolation: true } });
  try {
    await w.loadFile(tmp);
    const m = doc.margins || {};
    // Il Chromium di Electron 22 (versione per Windows 7) disegna intestazione e piè di pagina ingranditi di 4/3: si riducono
    const old = parseInt(process.versions.chrome, 10) < 110;
    const fit = (t) => (old ? `<div style="zoom:.75;width:133.34%">${t}</div>` : t);
    return await w.webContents.printToPDF({
      pageSize: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: fit(doc.header), footerTemplate: fit(doc.footer),
      margins: { top: mm(m.top || 38), bottom: mm(m.bottom || 20), left: mm(m.left || 18), right: mm(m.right || 18) },
    });
  } finally { w.destroy(); fs.rmSync(tmp, { force: true }); }
}
ipcMain.handle('doc:pdf', async (e, doc, preview) => {
  try {
    const file = preview ? path.join(os.tmpdir(), safeName('Anteprima ' + (doc.name || ''), '.pdf')) : await askSave(doc.name, '.pdf', 'PDF');
    if (!file) return { ok: false, canceled: true };
    fs.writeFileSync(file, await makePdf(doc));
    shell.openPath(file);
    return { ok: true, file };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
ipcMain.handle('doc:docx', async (e, doc) => {
  try {
    const file = await askSave(doc.name, '.docx', 'Word');
    if (!file) return { ok: false, canceled: true };
    fs.writeFileSync(file, zip(doc.files.map((f) => ({ name: f.name, data: f.b64 ? Buffer.from(f.data, 'base64') : Buffer.from(f.data, 'utf8') }))));
    shell.openPath(file);
    return { ok: true, file };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
ipcMain.handle('doc:folder', () => { const d = exportDir(); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });

// Zip minimo (deflate) per il .docx: niente librerie esterne, funziona anche con l'Electron di Windows 7
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function zip(files) {
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), raw = f.data, comp = zlib.deflateRawSync(raw), crc = crc32(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, name, comp); central.push(c, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

// ===== Cartella condivisa sul server (la stessa di CONTROLLO_SISTEM): si scrive offerte.json e si legge codici.json =====
function sharedDir() { return readSettings().shared || ''; }
// Sullo stesso PC di CONTROLLO_SISTEM si usa da sola la cartella condivisa già scelta lì
function adoptShared() {
  if (sharedDir()) return '';
  try {
    const d = JSON.parse(fs.readFileSync(path.join(app.getPath('appData'), 'Controllo Lavori', 'impostazioni.json'), 'utf8')).shared;
    if (d && fs.statSync(d).isDirectory()) { const s = readSettings(); s.shared = d; writeSettings(s); return d; }
  } catch (e) { }
  return '';
}
function sharedPath(rel) {
  const base = sharedDir();
  if (!base) throw new Error('Cartella condivisa non impostata');
  const root = path.resolve(base), p = path.resolve(root, String(rel || ''));
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('Percorso non valido');
  return p;
}
const SH_ERR = { EPERM: 'accesso negato: manca il permesso di scrittura', EACCES: 'accesso negato: manca il permesso', ENOENT: 'percorso non trovato', EBUSY: 'file in uso da un altro programma',
  ETIMEDOUT: 'il server non risponde', EHOSTUNREACH: 'server non raggiungibile', ENETUNREACH: 'rete non raggiungibile', EIO: 'errore di rete', UNKNOWN: 'errore di rete o percorso non valido', ENOTDIR: 'il percorso non è una cartella', EROFS: 'cartella in sola lettura' };
const shMsg = (err) => (SH_ERR[err.code] || err.message) + (err.code ? ` [${err.code}]` : '');
ipcMain.handle('sh:get', () => { const auto = adoptShared(); return { dir: sharedDir(), auto: !!auto }; });
// Percorso scritto a mano (es. \\SERVER\ControlloLavori), in alternativa alla finestra di scelta
ipcMain.handle('sh:set', (e, p) => {
  const d = String(p || '').trim().replace(/^"|"$/g, '').replace(/[\\/]+$/, '');
  if (!d) return { ok: false, error: 'Scrivi il percorso della cartella' };
  try { if (!fs.statSync(d).isDirectory()) return { ok: false, error: 'Il percorso non è una cartella' }; }
  catch (err) { return { ok: false, error: 'Cartella non raggiungibile: ' + shMsg(err) }; }
  const s = readSettings(); s.shared = d; writeSettings(s);
  return { ok: true, dir: d };
});
ipcMain.handle('sh:choose', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Scegli la cartella condivisa sul server (la stessa di CONTROLLO_SISTEM)', defaultPath: sharedDir() || undefined, properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const s = readSettings(); s.shared = r.filePaths[0]; writeSettings(s);
  return { dir: s.shared };
});
ipcMain.handle('sh:read', (e, rel) => {
  try { return fs.readFileSync(sharedPath(rel), 'utf8'); }
  catch (err) { if (err.code === 'ENOENT' && fs.existsSync(sharedDir())) return null; throw new Error(`Lettura di ${rel}: ${shMsg(err)}`); }
});
ipcMain.handle('sh:write', (e, rel, text) => {
  const p = sharedPath(rel), t = String(text);
  const tmp = `${p}.${os.hostname().replace(/[^\w-]/g, '')}.tmp`;
  try { fs.writeFileSync(tmp, t); fs.renameSync(tmp, p); return true; }
  catch (err) { try { fs.rmSync(tmp, { force: true }); } catch (_) { } }
  try { fs.writeFileSync(p, t); return true; }
  catch (err) { throw new Error(`Scrittura di ${rel}: ${shMsg(err)}`); }
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
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
