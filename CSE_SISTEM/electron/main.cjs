// CSE_SISTEM su Windows: finestra del programma e operazioni sui file.
//
// La pagina (www/) non tocca il disco direttamente: chiede al processo
// principale tramite il ponte in preload.cjs. Tutti i percorsi sono relativi
// alla cartella dei dati (Documenti, oppure quella scelta dall'utente: anche
// una cartella sul server o sincronizzata con il cloud) e non possono uscirne.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const FILE_IMPOSTAZIONI = () => path.join(app.getPath('userData'), 'impostazioni.json');

function impostazioni() {
  try {
    return JSON.parse(fs.readFileSync(FILE_IMPOSTAZIONI(), 'utf8'));
  } catch {
    return {};
  }
}

function salvaImpostazioni(dati) {
  fs.mkdirSync(path.dirname(FILE_IMPOSTAZIONI()), { recursive: true });
  fs.writeFileSync(FILE_IMPOSTAZIONI(), JSON.stringify(dati, null, 2));
}

/** Cartella che contiene CSE_SISTEM/ (i percorsi della pagina partono da qui). */
function base() {
  return impostazioni().cartellaDati || app.getPath('documents');
}

/** Percorso assoluto dentro la cartella dei dati; rifiuta "..", percorsi assoluti, ecc. */
function assoluto(relativo) {
  const b = path.resolve(base());
  const p = path.resolve(b, String(relativo || ''));
  if (p !== b && !p.startsWith(b + path.sep)) throw new Error(`Percorso non consentito: ${relativo}`);
  return p;
}

async function esiste(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

ipcMain.handle('cse:esiste', (_e, p) => esiste(assoluto(p)));
ipcMain.handle('cse:creaCartella', (_e, p) => fsp.mkdir(assoluto(p), { recursive: true }));
ipcMain.handle('cse:scriviByte', async (_e, p, byte) => {
  const a = assoluto(p);
  await fsp.mkdir(path.dirname(a), { recursive: true });
  // scrittura sicura: prima un file temporaneo, poi rinomina (niente file a metà)
  const tmp = `${a}.tmp`;
  await fsp.writeFile(tmp, Buffer.from(byte));
  await fsp.rename(tmp, a);
});
ipcMain.handle('cse:leggiByte', async (_e, p) => new Uint8Array(await fsp.readFile(assoluto(p))));
ipcMain.handle('cse:scriviTesto', async (_e, p, testo) => {
  const a = assoluto(p);
  await fsp.mkdir(path.dirname(a), { recursive: true });
  const tmp = `${a}.tmp`;
  await fsp.writeFile(tmp, testo, 'utf8');
  await fsp.rename(tmp, a);
});
ipcMain.handle('cse:leggiTesto', (_e, p) => fsp.readFile(assoluto(p), 'utf8'));
ipcMain.handle('cse:elenca', async (_e, p) => {
  const voci = await fsp.readdir(assoluto(p), { withFileTypes: true });
  return voci.filter((v) => !v.name.endsWith('.tmp')).map((v) => ({ nome: v.name, cartella: v.isDirectory() }));
});
ipcMain.handle('cse:elimina', (_e, p) => fsp.rm(assoluto(p), { recursive: true, force: true }));
ipcMain.handle('cse:apri', async (_e, p) => {
  const errore = await shell.openPath(assoluto(p));
  if (errore) throw new Error(errore);
});

ipcMain.handle('cse:scegliFile', async (e, opzioni = {}) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const filtri = opzioni.accetta && opzioni.accetta !== '*'
    ? [{ name: 'File', extensions: opzioni.accetta.split(',').map((s) => s.trim().replace(/^\./, '').replace('image/jpeg', 'jpg')) }]
    : [];
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', ...(opzioni.multipli === false ? [] : ['multiSelections'])],
    filters: filtri,
  });
  if (r.canceled) return [];
  return Promise.all(r.filePaths.map(async (f) => ({
    nome: path.basename(f),
    byte: new Uint8Array(await fsp.readFile(f)),
    modificato: (await fsp.stat(f)).mtimeMs,
  })));
});

ipcMain.handle('cse:pdfDaHtml', async (_e, html, p) => {
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    const a = assoluto(p);
    await fsp.mkdir(path.dirname(a), { recursive: true });
    await fsp.writeFile(a, pdf);
    return p;
  } finally {
    win.destroy();
  }
});

ipcMain.handle('cse:cartellaDati', () => base());
ipcMain.handle('cse:scegliCartellaDati', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return null;
  salvaImpostazioni({ ...impostazioni(), cartellaDati: r.filePaths[0] });
  return r.filePaths[0];
});

function creaFinestra() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'CSE_SISTEM',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
}

app.whenReady().then(creaFinestra);
app.on('window-all-closed', () => app.quit());
