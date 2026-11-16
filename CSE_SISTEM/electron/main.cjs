// CSE_SISTEM su Windows: finestra del programma e operazioni sui file.
//
// La pagina (www/) non tocca il disco direttamente: chiede al processo
// principale tramite il ponte in preload.cjs. Tutti i percorsi sono relativi
// alla cartella dei dati (Documenti, oppure quella scelta dall'utente: anche
// una cartella sul server o sincronizzata con il cloud) e non possono uscirne.

const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { creaClaude } = require('./claude.cjs');

// date, numeri e calendario sempre in italiano (gg/mm/aaaa), qualunque sia la lingua di Windows
app.commandLine.appendSwitch('lang', 'it-IT');

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

// ------------------------------------------------------------ sincronizzazione
// Google Drive per desktop scrive nella cartella dei dati i file cambiati sul
// telefono o su un altro PC: la cartella si osserva e la pagina viene
// avvisata (si ridisegna da sola se non si sta scrivendo). Le scritture del
// programma stesso non contano.
const scrittureRecenti = new Map(); // percorso assoluto -> ora
const segnaScrittura = (a) => scrittureRecenti.set(path.resolve(a), Date.now());
let osservatore = null;
let inAttesa = new Set();
let timerCambi = null;

function osservaCartella() {
  try { osservatore?.close(); } catch { /* già chiuso */ }
  osservatore = null;
  const radice = path.join(base(), 'CSE_SISTEM');
  try {
    fs.mkdirSync(radice, { recursive: true });
    osservatore = fs.watch(radice, { recursive: true }, (_ev, nome) => {
      if (!nome || /\.tmp$|~\$|\.~|desktop\.ini$/i.test(nome)) return;
      const a = path.resolve(radice, nome);
      // scritture del programma (anche le cartelle create per contenerle)
      const ora = Date.now();
      for (const [p, t] of scrittureRecenti) {
        if (ora - t > 4000) { scrittureRecenti.delete(p); continue; }
        if (p === a || p.startsWith(a + path.sep) || a.startsWith(p + '.')) return;
      }
      inAttesa.add(String(nome).split(path.sep).join('/'));
      clearTimeout(timerCambi);
      timerCambi = setTimeout(() => {
        const cambiati = [...inAttesa];
        inAttesa = new Set();
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('cse:cambiato', cambiati);
      }, 1500);
    });
    osservatore.on('error', () => {});
  } catch { /* cartella non osservabile (es. disco di rete): resta il pulsante Aggiorna */ }
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
ipcMain.handle('cse:creaCartella', (_e, p) => { segnaScrittura(assoluto(p)); return fsp.mkdir(assoluto(p), { recursive: true }); });
ipcMain.handle('cse:scriviByte', async (_e, p, byte) => {
  const a = assoluto(p);
  segnaScrittura(a);
  await fsp.mkdir(path.dirname(a), { recursive: true });
  // scrittura sicura: prima un file temporaneo, poi rinomina (niente file a metà)
  const tmp = `${a}.tmp`;
  await fsp.writeFile(tmp, Buffer.from(byte));
  await fsp.rename(tmp, a);
});
ipcMain.handle('cse:leggiByte', async (_e, p) => new Uint8Array(await fsp.readFile(assoluto(p))));
ipcMain.handle('cse:scriviTesto', async (_e, p, testo) => {
  const a = assoluto(p);
  segnaScrittura(a);
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
ipcMain.handle('cse:elimina', (_e, p) => { segnaScrittura(assoluto(p)); return fsp.rm(assoluto(p), { recursive: true, force: true }); });
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

// ------------------------------------------------------------ Claude (verifica dei POS)
let claude = null;
const conClaude = () => (claude ||= creaClaude({ cartellaUtente: app.getPath('userData'), safeStorage }));
ipcMain.handle('cse:claudeStato', () => conClaude().stato());
ipcMain.handle('cse:claudeSalvaChiave', (_e, k) => conClaude().salvaChiave(k));
ipcMain.handle('cse:claudeProva', (_e, modello) => conClaude().prova(modello));
ipcMain.handle('cse:claudeAnnulla', () => conClaude().annulla());
ipcMain.handle('cse:claudeVerifica', (e, richiesta) => conClaude().verifica(richiesta, {
  assoluto,
  avanzamento: (testo) => { if (!e.sender.isDestroyed()) e.sender.send('cse:claudeAvanzamento', testo); },
}));

// cartella intera con le sottocartelle: [{ nome, percorso: 'Cartella/sotto/file.pdf', byte, modificato }]
ipcMain.handle('cse:scegliCartellaFile', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Cartella da copiare (con le sottocartelle)', properties: ['openDirectory'] });
  if (r.canceled) return [];
  const radice = r.filePaths[0];
  const out = [];
  const giro = async (dir) => {
    for (const v of await fsp.readdir(dir, { withFileTypes: true })) {
      if (v.name.startsWith('.') || /^(desktop\.ini|thumbs\.db)$/i.test(v.name)) continue;
      const a = path.join(dir, v.name);
      if (v.isDirectory()) await giro(a);
      else if (v.isFile()) {
        out.push({
          nome: v.name,
          percorso: path.relative(path.dirname(radice), a).split(path.sep).join('/'),
          byte: new Uint8Array(await fsp.readFile(a)),
          modificato: (await fsp.stat(a)).mtimeMs,
        });
      }
    }
  };
  await giro(radice);
  return out;
});

ipcMain.handle('cse:pdfDaHtml', async (_e, html, p) => {
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  // file temporaneo invece di un indirizzo data: (che non regge le pagine con le foto, oltre 2 MB)
  const tmp = path.join(app.getPath('temp'), `cse-stampa-${process.pid}-${Date.now()}.html`);
  try {
    await fsp.writeFile(tmp, html, 'utf8');
    await win.loadFile(tmp);
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    const a = assoluto(p);
    segnaScrittura(a);
    await fsp.mkdir(path.dirname(a), { recursive: true });
    await fsp.writeFile(a, pdf);
    return p;
  } finally {
    win.destroy();
    fsp.rm(tmp, { force: true }).catch(() => {});
  }
});

/**
 * Cartelle di Google Drive per desktop presenti sul PC: di solito un disco
 * virtuale "G:\\Il mio Drive" (o "My Drive"), nelle versioni vecchie una
 * cartella "Google Drive" nella cartella dell'utente.
 */
function cartelleGoogleDrive() {
  const candidati = [];
  for (const l of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const nome of ['Il mio Drive', 'My Drive', 'Mein Ablage', 'Mi unidad']) candidati.push(`${l}:\\${nome}`);
  }
  const casa = app.getPath('home');
  candidati.push(path.join(casa, 'Google Drive'), path.join(casa, 'Google Drive', 'Il mio Drive'), path.join(casa, 'Il mio Drive'));
  return candidati.filter((c) => {
    try {
      return fs.statSync(c).isDirectory();
    } catch {
      return false;
    }
  });
}

function usaCartella(p) {
  if (!fs.statSync(p).isDirectory()) throw new Error(`Cartella non trovata: ${p}`);
  salvaImpostazioni({ ...impostazioni(), cartellaDati: p });
  osservaCartella();
  return p;
}

ipcMain.handle('cse:cartellaDati', () => base());
ipcMain.handle('cse:cartelleGoogleDrive', () => cartelleGoogleDrive());
ipcMain.handle('cse:usaCartellaDati', (_e, p) => usaCartella(String(p)));
ipcMain.handle('cse:scegliCartellaDati', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Cartella in cui tenere i cantieri (es. la cartella di Google Drive)',
    defaultPath: cartelleGoogleDrive()[0] || base(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled) return null;
  return usaCartella(r.filePaths[0]);
});

function creaFinestra() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 500,
    title: 'CSE_SISTEM',
    backgroundColor: '#eef2f8',
    icon: path.join(__dirname, '..', 'www', 'img', 'icona.png'),
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

app.whenReady().then(() => {
  creaFinestra();
  osservaCartella();
});
app.on('window-all-closed', () => app.quit());
