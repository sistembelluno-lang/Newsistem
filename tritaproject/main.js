const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const progetti = require('./progetti');
const ai = require('./ai');
const el = require('./elaborati');
const m3 = require('./modello3d');
const { unzipSync } = require('fflate');
const dl = require('./dxfletto');

if (!app.requestSingleInstanceLock()) app.quit();

let win, renderWin;
const MODELLI = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1'];

// ---------- Impostazioni (la chiave API è cifrata con il portachiavi di Windows) ----------
const fileImp = () => path.join(app.getPath('userData'), 'impostazioni.json');
function leggiImp() { try { return JSON.parse(fs.readFileSync(fileImp(), 'utf8')); } catch (e) { return {}; } }
function scriviImp(s) { fs.writeFileSync(fileImp(), JSON.stringify(s, null, 1)); }
function chiaveApi() {
  const s = leggiImp();
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (!s.chiave) return '';
  try { return s.cifrata ? safeStorage.decryptString(Buffer.from(s.chiave, 'base64')) : s.chiave; } catch (e) { return ''; }
}
function config() {
  const s = leggiImp();
  return { modello: MODELLI.includes(s.modello) ? s.modello : MODELLI[0], impegno: s.impegno || 'high', autore: s.autore || '', web: s.web !== false };
}
function clientAi() {
  const k = chiaveApi();
  if (!k) throw new Error('Manca la chiave API di Claude: inseriscila in ⚙ Impostazioni.');
  return { cl: ai.client(k), chiave: ai.impronta(k) };
}

// ---------- Finestre ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 800, minHeight: 560,
    title: 'TRITAPROJECT', backgroundColor: '#10151d', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
}

async function renderer() {
  if (renderWin && !renderWin.isDestroyed()) return renderWin;
  renderWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  await renderWin.loadFile(path.join(__dirname, 'ui', 'render.html'));
  return renderWin;
}
const chiama = async (fn, ...args) => (await renderer()).webContents.executeJavaScript(`${fn}(${args.map((a) => JSON.stringify(a)).join(',')})`);

// Apre il PDF nella finestra di lavoro (una volta sola) e restituisce la chiave con cui richiamarlo.
async function pdfAperto(file) {
  const chiave = file + ':' + fs.statSync(file).mtimeMs;
  if (!(await chiama('giaAperto', chiave))) await chiama('apriPdf', chiave, fs.readFileSync(file).toString('base64'));
  return chiave;
}
async function paginaPdf(file, n, zona, lato = 2000) {
  return chiama('pagina', await pdfAperto(file), n, zona || null, lato);
}

async function vettoriPdf(file, n, zona) {
  return chiama('vettori', await pdfAperto(file), n, zona || null);
}

// Testo delle pagine di un PDF, salvato accanto al progetto per non rileggerlo ogni volta.
async function testoDocumento(p, d) {
  const cache = path.join(progetti.cartella(p.id), 'allegati', '.testo', d.id + '.json');
  const file = path.join(progetti.cartella(p.id), d.file);
  try { const c = JSON.parse(fs.readFileSync(cache, 'utf8')); if (c.mtime === fs.statSync(file).mtimeMs) return c.pagine; } catch (e) { /* da leggere */ }
  const pagine = await chiama('testoPagine', await pdfAperto(file));
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify({ mtime: fs.statSync(file).mtimeMs, pagine }));
  return pagine;
}

// Aree e perimetri dei contorni chiusi (stanze campite, solai, sagome) in una zona di una tavola vettoriale.
// k: da unità del disegno a unità reali (per i PDF: punti → metri con la scala; per i DXF: 1).
function areeChiuse(v, k) {
  const out = [];
  for (const l of v.linee) {
    const n = l.p.length / 2;
    if (n < 4) continue;
    let A = 0, P = 0;
    for (let i = 0; i < n - 1; i++) { const [x1, y1, x2, y2] = [l.p[2 * i], l.p[2 * i + 1], l.p[2 * i + 2], l.p[2 * i + 3]]; A += x1 * y2 - x2 * y1; P += Math.hypot(x2 - x1, y2 - y1); }
    if (Math.hypot(l.p[0] - l.p[2 * n - 2], l.p[1] - l.p[2 * n - 1]) > P * 0.002) continue; // non chiuso
    A = Math.abs(A / 2) * k * k; P *= k;
    if (A > 0) out.push({ area: A, perimetro: P, layer: l.l || '', riempita: !!l.r, centro: [l.p.filter((_, i) => i % 2 === 0).reduce((s, x) => s + x, 0) / n * k, l.p.filter((_, i) => i % 2).reduce((s, x) => s + x, 0) / n * k] });
  }
  // contorni uguali (bordo + riempimento) contati una volta
  const visti = new Set();
  return out.sort((a, b) => b.area - a.area).filter((a) => { const c = `${a.area.toFixed(3)}|${a.centro.map((x) => x.toFixed(2)).join(',')}`; if (visti.has(c)) return false; visti.add(c); return true; });
}

// DXF caricati: letti una volta e tenuti in memoria finché il file non cambia.
const cacheDxf = new Map();
function dxfDoc(file) {
  const mt = fs.statSync(file).mtimeMs;
  const c = cacheDxf.get(file);
  if (c && c.mt === mt) return c.v;
  const buf = fs.readFileSync(file);
  let testo = buf.toString('utf8');
  if (testo.includes('\uFFFD')) testo = buf.toString('latin1'); // DXF fino al 2004: codifica di Windows
  const v = dl.leggi(testo);
  cacheDxf.set(file, { mt, v });
  if (cacheDxf.size > 8) cacheDxf.delete(cacheDxf.keys().next().value);
  return v;
}
async function immagineDxf(v, { zona, griglia = false, lato = 2000 } = {}) {
  const parte = dl.zona(v, zona);
  const E = dl.entita(parte, el.aciVicino);
  if (!E.length) throw new Error('nessun elemento in questa zona del DXF');
  return chiama('svgPng', el.svgSemplice(E, { lato, griglia }), lato);
}
const isDxf = (d) => d.tipo === 'application/dxf';

// Modifiche a un disegno (entità di tavola): ogni operazione agisce sull'elenco e restituisce una riga di resoconto.
function applicaModifiche(E, operazioni) {
  const resoconto = [];
  const mappa = (f) => { // applica una trasformazione di punti a tutte le geometrie
    for (const e of E) {
      for (const k of ['punti']) if (e[k]) e[k] = e[k].map(f);
      for (const k of ['pos', 'centro', 'da', 'a']) if (e[k]) e[k] = f(e[k]);
    }
  };
  const corrisponde = (nome, elenco) => elenco.some((x) => x.includes('*') ? new RegExp('^' + x.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i').test(nome) : x.toLowerCase() === String(nome).toLowerCase());
  for (const o of operazioni || []) {
    const n0 = E.length;
    switch (o.op) {
      case 'elimina_layer': { const l = [].concat(o.layer || []); const tieni = E.filter((e) => !corrisponde(e.layer || '0', l)); E.length = 0; E.push(...tieni); resoconto.push(`eliminati ${n0 - E.length} elementi dei layer ${l.join(', ')}`); break; }
      case 'tieni_layer': { const l = [].concat(o.layer || []); const tieni = E.filter((e) => corrisponde(e.layer || '0', l)); E.length = 0; E.push(...tieni); resoconto.push(`tenuti ${E.length} elementi dei layer ${l.join(', ')}`); break; }
      case 'rinomina_layer': { let n = 0; for (const e of E) if (corrisponde(e.layer || '0', [o.da])) { e.layer = o.a; n++; } resoconto.push(`layer ${o.da} → ${o.a} (${n} elementi)`); break; }
      case 'colore_layer': { let n = 0; for (const e of E) if (corrisponde(e.layer || '0', [].concat(o.layer || []))) { e.colore = o.colore; n++; } resoconto.push(`colore ${o.colore} a ${n} elementi`); break; }
      case 'sostituisci_testo': { let n = 0; for (const e of E) if (e.tipo === 'testo' && e.testo.includes(o.da)) { e.testo = e.testo.split(o.da).join(o.a ?? ''); n++; } resoconto.push(`testi sostituiti: ${n} («${o.da}» → «${o.a}»)`); break; }
      case 'elimina_testo': { const tieni = E.filter((e) => !(e.tipo === 'testo' && e.testo.includes(o.testo))); E.length = 0; E.push(...tieni); resoconto.push(`testi eliminati: ${n0 - E.length}`); break; }
      case 'elimina_zona': case 'ritaglia': {
        const [x0, x1] = [Math.min(o.x0, o.x1), Math.max(o.x0, o.x1)], [y0, y1] = [Math.min(o.y0, o.y1), Math.max(o.y0, o.y1)];
        const dentro = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
        const tutto = (e) => (e.punti || [e.pos || e.centro || e.da]).filter(Boolean).every(dentro);
        const qualcosa = (e) => (e.punti || [e.pos || e.centro || e.da]).filter(Boolean).some(dentro);
        const tieni = E.filter((e) => (o.op === 'ritaglia' ? qualcosa(e) : !tutto(e)));
        E.length = 0; E.push(...tieni);
        resoconto.push(o.op === 'ritaglia' ? `tenuti ${E.length} elementi nel riquadro` : `eliminati ${n0 - E.length} elementi nel riquadro`); break;
      }
      case 'sposta': mappa((p) => [p[0] + (o.dx || 0), p[1] + (o.dy || 0)]); resoconto.push(`spostato di ${o.dx || 0}, ${o.dy || 0}`); break;
      case 'scala': {
        const c = o.centro || [0, 0], f = o.fattore || 1;
        mappa((p) => [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f]);
        for (const e of E) { if (e.raggio) e.raggio *= f; if (e.altezza) e.altezza *= f; if (e.offset) e.offset *= f; }
        resoconto.push(`scalato di ${f}`); break;
      }
      case 'ruota': {
        const c = o.centro || [0, 0], a = ((o.gradi || 0) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
        mappa((p) => [c[0] + (p[0] - c[0]) * cs - (p[1] - c[1]) * sn, c[1] + (p[0] - c[0]) * sn + (p[1] - c[1]) * cs]);
        for (const e of E) { if (e.tipo === 'testo') e.rotazione = (e.rotazione || 0) + (o.gradi || 0); if (e.tipo === 'arco') { e.inizio += o.gradi || 0; e.fine += o.gradi || 0; } }
        resoconto.push(`ruotato di ${o.gradi}°`); break;
      }
      case 'aggiungi': {
        const nuovi = o.entita || [];
        const err = el.controllaTavola({ entita: nuovi });
        if (err.length) throw new Error('aggiungi: ' + err.slice(0, 8).join('; '));
        E.push(...nuovi); resoconto.push(`aggiunti ${nuovi.length} elementi`); break;
      }
      default: throw new Error(`operazione sconosciuta «${o.op}»`);
    }
  }
  return resoconto;
}

// Converte in DXF i vettori di una pagina PDF del progetto e lo salva negli elaborati.
async function convertiDxf(p, d, { pagina = 1, zona, scala, unita, nome_file } = {}) {
  if (d.tipo !== 'application/pdf') throw new Error('si possono convertire solo i PDF');
  const v = await vettoriPdf(path.join(progetti.cartella(p.id), d.file), pagina, zona);
  if (!v.linee.length && !v.testi.length) throw new Error('in questa pagina (o zona) non ci sono vettori: probabilmente è una scansione, da ridisegnare con «crea_tavola»');
  const u = unita || (scala ? 'm' : 'mm');
  const dir = path.join(progetti.cartella(p.id), 'elaborati');
  fs.mkdirSync(dir, { recursive: true });
  const f = percorsoLibero(dir, el.nomeFile(nome_file || `${path.basename(d.nome, path.extname(d.nome))}_p${pagina}${zona ? '_zona' : ''}`, 'dxf'));
  fs.writeFileSync(f, el.dxfDaVettori(v, { scala: scala || 1, unita: u }));
  const layer = [...new Set(v.linee.map((l) => l.l).filter(Boolean))];
  const k = (25.4 / 72) * (scala || 1) / { mm: 1, cm: 10, m: 1000 }[u];
  return { file: f, linee: v.linee.length, testi: v.testi.length, layer, misure: [v.larghezza * k, v.altezza * k], unita: u };
}

// Stampa HTML in PDF con una finestra nascosta (rispetta @page size del documento).
async function htmlPdf(html, out) {
  const tmp = path.join(app.getPath('temp'), `tritaproject-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await w.loadFile(tmp);
    fs.writeFileSync(out, await w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true }));
  } finally { w.destroy(); fs.rmSync(tmp, { force: true }); }
}

// ---------- Strumenti di Claude ----------
const oggi = () => new Date().toLocaleDateString('it-IT');
function percorsoLibero(dir, nome) {
  let f = path.join(dir, nome), n = 2;
  const est = path.extname(nome), base = path.basename(nome, est);
  while (fs.existsSync(f)) f = path.join(dir, `${base} (${n++})${est}`);
  return f;
}

// Salva una tavola (PDF impaginato, DXF, SVG) e restituisce il risultato per Claude con l'anteprima.
async function salvaTavola(p, t, nuovi, extra = '') {
  const errori = el.controllaTavola(t);
  if (errori.length) throw new Error(errori.slice(0, 12).join('; '));
  t.cartiglio = { redatto: config().autore, ...t.cartiglio };
  // formato «auto» (o non indicato): il foglio più piccolo in cui le viste entrano alle scale chieste
  if (!el.FOGLI[t.formato]) {
    const conScala = (t.viste || [t]).some((v) => v.scala);
    t.formato = conScala ? ['A4', 'A3', 'A2', 'A1', 'A0'].find((f) => !el.impaginazione({ ...t, formato: f }).nota) || 'A0' : 'A3';
  }
  const g = el.impaginazione(t);
  const svg = el.svgTavola(t, { progetto: p.nome, data: oggi() });
  const dir = path.join(progetti.cartella(p.id), 'elaborati');
  const fDxf = percorsoLibero(dir, el.nomeFile(t.nome_file, 'dxf'));
  const base = fDxf.replace(/\.dxf$/, '');
  fs.writeFileSync(fDxf, el.dxfTavola(t));
  fs.writeFileSync(base + '.svg', svg);
  await htmlPdf(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${g.W}mm ${g.H}mm;margin:0}html,body{margin:0}svg{display:block}</style></head><body>${svg}</body></html>`, base + '.pdf');
  const png = await chiama('svgPng', svg, 1800);
  const scale = [...new Set(g.viste.map((v) => '1:' + v.scala))].join(', ');
  return [{ type: 'text', text: `Tavola ${t.formato || 'A3'} salvata (scala ${scale}): ${nuovi([base + '.pdf', fDxf, base + '.svg'])}.${g.nota ? ` Attenzione: ${g.nota}.` : ''}${extra} Ecco l'anteprima: controllala e correggi se serve.` }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }];
}

const fileModello = (p, nome) => path.join(progetti.cartella(p.id), 'modelli', el.nomeFile(nome, 'json'));

function strumenti(p, avvisa) {
  const dirP = progetti.cartella(p.id), dirE = path.join(dirP, 'elaborati');
  const trovaDoc = (codice) => {
    const d = p.documenti.find((x) => x.id.toLowerCase() === String(codice).trim().toLowerCase()) || p.documenti.find((x) => x.nome === codice);
    if (!d) throw new Error(`documento «${codice}» non trovato. Codici disponibili: ${p.documenti.map((x) => x.id).join(', ')}`);
    return d;
  };
  const nuovi = (nomi) => { avvisa(nomi.map((f) => ({ nome: path.basename(f), percorso: f }))); return nomi.map((f) => path.basename(f)).join(', '); };

  return async (nome, inp) => {
    fs.mkdirSync(dirE, { recursive: true });
    switch (nome) {
      case 'apri_documento': {
        const d = trovaDoc(inp.documento);
        if (isDxf(d)) {
          const v = dxfDoc(path.join(dirP, d.file));
          return [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: await immagineDxf(v, { griglia: true }) } }, { type: 'text', text: dl.riepilogo(v, d.nome) + '\nPer i dettagli usa «ingrandisci» con una zona (le etichette della griglia sono le frazioni).' }];
        }
        const { cl, chiave } = clientAi();
        await ai.caricaDocumento(cl, chiave, dirP, d);
        const i = inp.parte ? inp.parte - 1 : 0;
        if (!d.parti[i]) throw new Error(`il documento ha ${d.parti.length} parti`);
        const altre = d.parti.length > 1 ? `Parte ${i + 1} di ${d.parti.length} (pagine ${d.parti[i].da}-${d.parti[i].a}).` : '';
        return [...ai.blocchiDocumento(d, [d.parti[i]]), { type: 'text', text: `${d.id} · ${d.nome}. ${altre}` }];
      }
      case 'ingrandisci': {
        const d = trovaDoc(inp.documento);
        if (isDxf(d)) {
          const v = dxfDoc(path.join(dirP, d.file));
          const z = dl.zona(v, inp.zona).estensione;
          return [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: await immagineDxf(v, { zona: inp.zona, griglia: !inp.zona }) } }, { type: 'text', text: `${d.id} (DXF), ${inp.zona ? 'zona' : 'disegno intero con griglia'}: coordinate da [${z[0].toFixed(2)}, ${z[1].toFixed(2)}] a [${z[2].toFixed(2)}, ${z[3].toFixed(2)}] ${v.unita}.` }];
        }
        if (d.tipo !== 'application/pdf') throw new Error('si possono ingrandire solo PDF e DXF');
        const r = await paginaPdf(path.join(dirP, d.file), inp.pagina || 1, inp.zona);
        const z = inp.zona ? `zona x ${inp.zona.x0}-${inp.zona.x1}, y ${inp.zona.y0}-${inp.zona.y1}` : 'pagina intera con griglia (le etichette sono le frazioni da usare in «zona»)';
        return [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: r.dati } }, { type: 'text', text: `${d.id} pag. ${inp.pagina}/${r.pagine}, ${z}. Foglio ${r.formato_pt[0]}×${r.formato_pt[1]} pt (${Math.round(r.formato_pt[0] / 2.835)}×${Math.round(r.formato_pt[1] / 2.835)} mm).` }];
      }
      case 'crea_relazione': {
        const base = el.nomeFile(inp.nome_file);
        const html = el.htmlRelazione({ titolo: inp.titolo, html: inp.html, progetto: p.nome, data: oggi() });
        const fHtml = percorsoLibero(dirE, base + '.html');
        const fPdf = fHtml.replace(/\.html$/, '.pdf');
        fs.writeFileSync(fHtml, html);
        await htmlPdf(html, fPdf);
        return `Relazione salvata: ${nuovi([fPdf, fHtml])}`;
      }
      case 'crea_tavola':
        return salvaTavola(p, inp, nuovi);
      case 'estrai_dettaglio': {
        const d = trovaDoc(inp.documento);
        if (isDxf(d)) {
          const v = dl.zona(dxfDoc(path.join(dirP, d.file)), inp.zona);
          const u = el.MM[v.unita] ? v.unita : 'mm';
          const t = { nome_file: inp.nome_file || `${d.id}_dettaglio`, titolo: inp.titolo || `Estratto da ${d.nome}`, unita: u, formato: inp.formato, orientamento: inp.orientamento, cartiglio: inp.cartiglio, viste: [{ titolo: inp.titolo_vista || inp.titolo || 'Dettaglio', scala: inp.scala_nuova || inp.scala_originale, entita: dl.entita(v, el.aciVicino) }] };
          return salvaTavola(p, t, nuovi, ` Estratto dal DXF ${d.id} (${v.linee.length} linee, ${v.testi.length} testi, unità ${v.unita || 'non dichiarate: considerate mm'}).`);
        }
        if (d.tipo !== 'application/pdf') throw new Error('si possono ritagliare solo PDF e DXF');
        const file = path.join(dirP, d.file);
        const so = inp.scala_originale || 1;
        const v = await vettoriPdf(file, inp.pagina || 1, inp.zona);
        let entita, nota = '';
        if (v.linee.length + v.testi.length > 0) entita = el.entitaDaVettori(v, { scala: so, unita: 'm' });
        else {
          // scansione: si ritaglia l'immagine e la si mette in scala (nel DXF non c'è)
          const r = await paginaPdf(file, inp.pagina || 1, inp.zona, 3000);
          const k = (el.PT_MM * so) / 1000;
          entita = [{ tipo: 'immagine', pos: [0, 0], larghezza: v.larghezza * k, altezza: v.altezza * k, dati: r.dati }];
          nota = ' La zona è una scansione: nel PDF c\'è l\'immagine in scala, il DXF resta vuoto (va ridisegnata con «crea_tavola»).';
        }
        const sn = inp.scala_nuova || so;
        const t = { nome_file: inp.nome_file || `${d.id}_dettaglio`, titolo: inp.titolo || `Estratto da ${d.nome}`, unita: 'm', formato: inp.formato, orientamento: inp.orientamento, cartiglio: inp.cartiglio, viste: [{ titolo: inp.titolo_vista || inp.titolo || 'Dettaglio', scala: sn, entita }] };
        return salvaTavola(p, t, nuovi, ` Estratto da ${d.id} pag. ${inp.pagina || 1} (originale 1:${so}, ${v.linee.length} linee, ${v.testi.length} testi).${nota}`);
      }
      case 'modifica_dxf': {
        // sorgente: un DXF caricato, un PDF vettoriale caricato (pagina e scala) o un DXF già prodotto negli elaborati
        let E, unita, origine;
        if (inp.elaborato) {
          const f = path.join(dirE, path.basename(inp.elaborato));
          if (!fs.existsSync(f) || !/\.dxf$/i.test(f)) throw new Error(`elaborato DXF «${inp.elaborato}» non trovato. DXF disponibili: ${fs.readdirSync(dirE).filter((x) => /\.dxf$/i.test(x)).join(', ') || 'nessuno'}`);
          const v = dl.zona(dxfDoc(f), inp.zona); E = dl.entita(v, el.aciVicino); unita = v.unita; origine = inp.elaborato;
        } else {
          const d = trovaDoc(inp.documento);
          if (isDxf(d)) { const v = dl.zona(dxfDoc(path.join(dirP, d.file)), inp.zona); E = dl.entita(v, el.aciVicino); unita = v.unita; }
          else if (d.tipo === 'application/pdf') {
            const v = await vettoriPdf(path.join(dirP, d.file), inp.pagina || 1, inp.zona);
            if (!v.linee.length) throw new Error('la pagina non ha vettori (scansione): ridisegnala con «crea_tavola»');
            unita = inp.scala_originale ? 'm' : 'mm';
            E = el.entitaDaVettori(v, { scala: inp.scala_originale || 1, unita });
          } else throw new Error('si modificano DXF e PDF vettoriali');
          origine = d.id;
        }
        unita = el.MM[unita] ? unita : 'mm';
        const resoconto = applicaModifiche(E, inp.operazioni);
        if (!E.length) throw new Error('dopo le modifiche il disegno è vuoto: ' + resoconto.join('; '));
        const fDxf = percorsoLibero(dirE, el.nomeFile(inp.nome_file || `${origine} modificato`, 'dxf'));
        fs.writeFileSync(fDxf, el.dxfEntita(E, { unita, scala: (inp.stampa && inp.stampa.scala) || 100 }));
        const testo = `Modifiche (${origine}): ${resoconto.join('; ')}. DXF salvato: ${nuovi([fDxf])} (coordinate originali, unità ${unita}).`;
        if (inp.stampa) {
          const t = { nome_file: path.basename(fDxf, '.dxf') + ' tavola', titolo: inp.stampa.titolo || inp.nome_file || 'Disegno modificato', unita, formato: inp.stampa.formato, cartiglio: inp.cartiglio, viste: [{ titolo: inp.stampa.titolo_vista || '', scala: inp.stampa.scala, entita: E }] };
          return salvaTavola(p, t, nuovi, ' ' + testo);
        }
        return [{ type: 'text', text: testo + ' Anteprima:' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: await chiama('svgPng', el.svgSemplice(E, { lato: 1600 }), 1600) } }];
      }
      case 'misura_aree': {
        const d = trovaDoc(inp.documento);
        let v, u, k;
        if (isDxf(d)) { v = dl.zona(dxfDoc(path.join(dirP, d.file)), inp.zona); u = v.unita || 'unità'; k = 1; v = { ...v, linee: v.linee.map((l) => ({ ...l, p: l.p.map((c, i) => c - v.estensione[i % 2]) })) }; }
        else { v = await vettoriPdf(path.join(dirP, d.file), inp.pagina || 1, inp.zona); u = inp.scala ? 'm' : 'mm'; k = (el.PT_MM * (inp.scala || 1)) / el.MM[u]; }
        const a = areeChiuse(v, k).slice(0, inp.quante || 25);
        if (!a.length) return 'Nessun contorno chiuso trovato in questa zona (o la tavola è una scansione). Ricava l\'area dalle quote o da un cartellino del locale.';
        return `Contorni chiusi nella zona (${isDxf(d) ? `DXF, unità ${u}` : inp.scala ? `scala 1:${inp.scala}, valori reali` : 'misure sulla carta'}), dal più grande. Coordinate del centro dall'angolo in basso a sinistra della zona:\n` + a.map((x, i) => `${i + 1}. area ${x.area.toFixed(u === 'm' ? 2 : 0)} ${u}², perimetro ${x.perimetro.toFixed(u === 'm' ? 2 : 0)} ${u}${x.layer ? `, layer «${x.layer}»` : ''}${x.riempita ? ', campita' : ''}, centro [${x.centro.map((c) => c.toFixed(2)).join(', ')}]`).join('\n');
      }
      case 'cerca_testo': {
        const q = String(inp.testo || '').toLowerCase().trim();
        if (!q) throw new Error('testo da cercare mancante');
        const risultati = [];
        for (const d of p.documenti.filter(isDxf)) {
          for (const t of dxfDoc(path.join(dirP, d.file)).testi) if (t.s.toLowerCase().includes(q)) risultati.push(`${d.id} (DXF) in [${t.x.toFixed(2)}, ${t.y.toFixed(2)}], layer ${t.l}: ${t.s.slice(0, 200)}`);
        }
        for (const d of p.documenti.filter((x) => x.tipo === 'application/pdf')) {
          const pagine = await testoDocumento(p, d);
          pagine.forEach((t, i) => t.split('\n').forEach((riga) => { if (riga.toLowerCase().includes(q)) risultati.push(`${d.id} pag. ${i + 1}: ${riga.trim().slice(0, 200)}`); }));
        }
        return risultati.length ? `${risultati.length} occorrenze di «${inp.testo}»:\n` + risultati.slice(0, 80).join('\n') + (risultati.length > 80 ? '\n… (altre omesse: restringi la ricerca)' : '') : `«${inp.testo}» non compare nel testo dei PDF (le tavole scansionate o con testi trasformati in linee non sono ricercabili: usa «ingrandisci»).`;
      }
      case 'confronta': {
        const a = trovaDoc(inp.documento_a), b = trovaDoc(inp.documento_b);
        const r = await chiama('confronto', await pdfAperto(path.join(dirP, a.file)), inp.pagina_a || 1, await pdfAperto(path.join(dirP, b.file)), inp.pagina_b || 1, 2200);
        const f = percorsoLibero(dirE, el.nomeFile(`Confronto ${a.id}-${b.id}`, 'png'));
        fs.writeFileSync(f, Buffer.from(r.dati, 'base64'));
        return [{ type: 'text', text: `Confronto salvato: ${nuovi([f])}. Rosso = solo in ${a.id}, blu = solo in ${b.id}, grigio = uguale. Differenze: ${(r.diversi * 100).toFixed(1)}% del disegno. Zone più cambiate (frazioni di pagina, da ingrandire): ${r.zone.map((z) => `x ${z.x0}-${z.x1} y ${z.y0}-${z.y1}`).join('; ') || 'nessuna'}.` }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: r.dati } }];
      }
      case 'crea_modello_3d': {
        const m = { nome: inp.nome, note: inp.note, elementi: inp.elementi };
        const err = m3.controlla(m);
        if (err.length) throw new Error(err.slice(0, 12).join('; '));
        const fm = fileModello(p, inp.nome);
        fs.mkdirSync(path.dirname(fm), { recursive: true });
        fs.writeFileSync(fm, JSON.stringify(m, null, 1));
        const base = path.join(dirE, el.nomeFile(inp.nome + ' 3D'));
        fs.writeFileSync(base + '.html', m3.htmlVisore(m));
        fs.writeFileSync(base + '.obj', m3.obj(m));
        fs.writeFileSync(base + '.dxf', m3.dxf3d(m));
        const svg = m3.svgAssonometria(m);
        const png = await chiama('svgPng', svg, 1600);
        fs.writeFileSync(base + ' assonometria.png', Buffer.from(png, 'base64'));
        const q = m3.quantita(m);
        return [{ type: 'text', text: `Modello «${inp.nome}» salvato (${m.elementi.length} elementi): ${nuovi([base + '.html', base + ' assonometria.png', base + '.obj', base + '.dxf'])}. Il file HTML è il visore 3D (si apre nel browser), OBJ e DXF 3D si aprono nei programmi 3D e CAD. Ora puoi ricavarne prospetti, sezioni e piante con «viste_modello».\nQuantità:\n${q.map((x) => `- ${x.voce}: ${x.n} el., volume ${x.volume_m3} m³${x.superficie_m2 ? `, superficie ${x.superficie_m2} m²` : ''}${x.lunghezza_m ? `, lunghezza ${x.lunghezza_m} m` : ''}`).join('\n')}\nAssonometria di controllo:` }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }];
      }
      case 'viste_modello': {
        let m;
        try { m = JSON.parse(fs.readFileSync(fileModello(p, inp.modello), 'utf8')); } catch (e) {
          const dir = path.join(dirP, 'modelli');
          const c = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => f.replace(/\.json$/, '')) : [];
          throw new Error(`modello «${inp.modello}» non trovato. ${c.length ? 'Modelli disponibili: ' + c.join(', ') : 'Crealo prima con «crea_modello_3d».'}`);
        }
        const viste = (inp.viste || []).map((v) => {
          if (v.tipo === 'sezione' && (!Array.isArray(v.da) || !Array.isArray(v.a))) throw new Error('per una sezione servono «da» e «a» (linea di sezione in pianta)');
          const titolo = v.titolo || (v.tipo === 'prospetto' ? `Prospetto ${v.lato || 'sud'}` : v.tipo === 'pianta' ? `Pianta a quota ${v.quota ?? 1.2}` : v.tipo === 'sezione' ? 'Sezione' : 'Assonometria');
          return { titolo, scala: v.scala, entita: m3.entitaVista(m, v) };
        });
        if (!viste.length) throw new Error('indica almeno una vista');
        const vuote = viste.filter((v) => !v.entita.length).map((v) => v.titolo);
        if (vuote.length) throw new Error(`viste vuote (la sezione non taglia il modello?): ${vuote.join(', ')}`);
        return salvaTavola(p, { nome_file: inp.nome_file || `${inp.modello} viste`, titolo: inp.titolo || `${m.nome}: viste`, unita: 'm', formato: inp.formato, orientamento: inp.orientamento, cartiglio: inp.cartiglio, viste }, nuovi);
      }
      case 'converti_in_dxf': {
        const d = trovaDoc(inp.documento);
        const r = await convertiDxf(p, d, inp);
        return `DXF salvato: ${nuovi([r.file])}. ${r.linee} linee/polilinee e ${r.testi} testi; ${r.layer.length ? `layer CAD originali: ${r.layer.slice(0, 30).join(', ')}` : 'il PDF non conserva i layer: sono raggruppati per colore'}. Ingombro ${r.misure.map((x) => x.toFixed(2)).join(' × ')} ${r.unita}${inp.scala ? ` (scala 1:${inp.scala} applicata: misure reali)` : ' (misure sulla carta, 1:1)'}. I riempimenti pieni sono su layer «…_RIEMPIMENTI».`;
      }
      case 'crea_schema': {
        const svg = el.svgSchema(inp.svg);
        const fSvg = percorsoLibero(dirE, el.nomeFile(inp.nome_file, 'svg'));
        const base = fSvg.replace(/\.svg$/, '');
        const png = await chiama('svgPng', svg, 2400);
        fs.writeFileSync(fSvg, svg);
        fs.writeFileSync(base + '.png', Buffer.from(png, 'base64'));
        await htmlPdf(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:12mm}body{margin:0;font-family:Arial}h1{font-size:14pt;margin:0 0 6mm}img{max-width:100%;max-height:170mm;display:block;margin:auto}</style></head><body><h1>${el.esc(inp.titolo)}</h1><img src="data:image/png;base64,${png}"></body></html>`, base + '.pdf');
        return [{ type: 'text', text: `Schema salvato: ${nuovi([base + '.png', base + '.pdf', fSvg])}. Anteprima:` }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: await chiama('svgPng', svg, 1400) } }];
      }
      case 'crea_tabella': {
        if (!Array.isArray(inp.colonne) || !Array.isArray(inp.righe)) throw new Error('colonne e righe devono essere elenchi');
        const f = percorsoLibero(dirE, el.nomeFile(inp.nome_file, 'csv'));
        fs.writeFileSync(f, el.csvTabella(inp));
        const fHtml = f.replace(/\.csv$/, '.html');
        fs.writeFileSync(fHtml, el.htmlRelazione({ titolo: inp.titolo, html: el.htmlTabella(inp), progetto: p.nome, data: oggi() }));
        return `Tabella salvata (${inp.righe.length} righe): ${nuovi([f, fHtml])}`;
      }
      case 'annota_progetto':
        p.note = (p.note ? p.note + '\n' : '') + `- ${oggi()}: ${String(inp.nota).trim()}`;
        return 'Nota salvata nel progetto.';
    }
    throw new Error('strumento sconosciuto');
  };
}

// ---------- Comandi dalla finestra ----------
const invia = (dati) => { if (win && !win.isDestroyed()) win.webContents.send('evento', dati); };
const attivi = new Map(); // progetto → segnale di interruzione della risposta in corso
const occupati = new Set(); // progetti con documenti in lettura

function vistaProgetto(p) {
  return { id: p.id, nome: p.nome, note: p.note, creato: p.creato, documenti: p.documenti.map(({ id, nome, tipo, pagine, parti, stato, scheda }) => ({ id, nome, tipo, pagine, parti: parti.length, stato, scheda })), vista: p.vista, elaborati: progetti.elaborati(p.id), occupato: attivi.has(p.id) || occupati.has(p.id) };
}

// Legge i documenti ancora senza scheda: li carica e ne scrive la scheda (tre alla volta).
async function leggiDocumenti(id, forza) {
  if (occupati.has(id)) return;
  occupati.add(id);
  try {
    const { cl, chiave } = clientAi();
    const p = progetti.leggi(id);
    const daFare = p.documenti.filter((d) => forza || !d.scheda);
    if (forza) daFare.forEach((d) => d.parti.forEach((x) => { x.file_id = ''; }));
    let fatti = 0;
    const lavora = async () => {
      for (let d; (d = daFare.shift());) {
        try {
          d.stato = 'in lettura'; invia({ progetto: id, tipo: 'documenti', dati: vistaProgetto(p) });
          await ai.caricaDocumento(cl, chiave, progetti.cartella(id), d);
          if (!d.scheda || forza) {
            let contenuto;
            if (isDxf(d)) {
              const v = dxfDoc(path.join(progetti.cartella(id), d.file));
              contenuto = [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: await immagineDxf(v) } }, { type: 'text', text: dl.riepilogo(v, d.nome) }];
            }
            d.scheda = await ai.schedaDocumento(cl, config(), p, d, contenuto);
          }
          d.stato = 'letto';
        } catch (e) { d.stato = 'errore: ' + ai.messaggioErrore(e); }
        fatti++;
        unisciSalva(id, p);
        invia({ progetto: id, tipo: 'documenti', dati: vistaProgetto(p), avanzamento: fatti });
      }
    };
    await Promise.all([lavora(), lavora(), lavora()]);
  } catch (e) {
    invia({ progetto: id, tipo: 'errore', testo: ai.messaggioErrore(e) });
  } finally {
    occupati.delete(id);
    try { invia({ progetto: id, tipo: 'documenti', dati: vistaProgetto(progetti.leggi(id)) }); } catch (e) { /* progetto eliminato */ }
  }
}

// Durante la lettura dei documenti l'utente può chattare: si salvano solo i documenti, senza toccare la conversazione.
function unisciSalva(id, p) {
  const ora = progetti.leggi(id);
  ora.documenti = ora.documenti.map((d) => p.documenti.find((x) => x.id === d.id && x.nome === d.nome) || d);
  progetti.salva(ora);
}

ipcMain.handle('imp:leggi', () => ({ ...config(), chiave: !!chiaveApi(), daAmbiente: !!process.env.ANTHROPIC_API_KEY, modelli: MODELLI, cartella: progetti.cartella('') }));
ipcMain.handle('imp:salva', (e, s) => {
  const cur = leggiImp();
  if (s.chiave) {
    const k = s.chiave.trim();
    if (safeStorage.isEncryptionAvailable()) { cur.chiave = safeStorage.encryptString(k).toString('base64'); cur.cifrata = true; } else { cur.chiave = k; cur.cifrata = false; }
  }
  for (const k of ['modello', 'impegno', 'autore', 'web']) if (s[k] !== undefined) cur[k] = s[k];
  scriviImp(cur);
  return true;
});
ipcMain.handle('imp:prova', async () => {
  try {
    const { cl } = clientAi();
    await cl.models.retrieve(config().modello);
    return { ok: true, testo: 'Collegamento riuscito: la chiave funziona.' };
  } catch (e) { return { ok: false, testo: ai.messaggioErrore(e) }; }
});

ipcMain.handle('prog:elenco', () => progetti.elenco());
ipcMain.handle('prog:crea', (e, nome) => vistaProgetto(progetti.crea(nome)));
ipcMain.handle('prog:apri', (e, id) => vistaProgetto(progetti.leggi(id)));
ipcMain.handle('prog:note', (e, id, note) => { const p = progetti.leggi(id); p.note = note; progetti.salva(p); return true; });
ipcMain.handle('prog:elimina', async (e, id) => {
  const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Elimina', 'Annulla'], defaultId: 1, cancelId: 1, message: 'Eliminare il progetto?', detail: 'Vengono cancellati la cartella del progetto, gli allegati copiati e gli elaborati generati.' });
  if (r.response !== 0) return false;
  progetti.elimina(id);
  return true;
});
ipcMain.handle('prog:cartella', (e, id, sotto) => shell.openPath(path.join(progetti.cartella(id), sotto || '')));

ipcMain.handle('doc:scegli', async (e, cartella) => {
  const r = await dialog.showOpenDialog(win, cartella
    ? { title: 'Cartella del lavoro (si leggono anche le sottocartelle)', properties: ['openDirectory', 'multiSelections'] }
    : { title: 'Allegati del progetto', properties: ['openFile', 'multiSelections'], filters: [{ name: 'PDF, DXF, ZIP, immagini e testo', extensions: ['pdf', 'dxf', 'dwg', 'zip', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'md', 'csv'] }] });
  return r.canceled ? [] : r.filePaths;
});

// Cartelle (con le sottocartelle) e archivi ZIP diventano l'elenco dei file da caricare; il resto si ignora.
const ESTENSIONI = /\.(pdf|dxf|dwg|png|jpe?g|webp|gif|txt|md|csv)$/i;
function espandi(files, tmp, errori) {
  const out = [];
  for (const f of files) {
    let st;
    try { st = fs.statSync(f); } catch (e) { errori.push(`${path.basename(f)}: non trovato`); continue; }
    if (st.isDirectory()) out.push(...espandi(fs.readdirSync(f).filter((x) => !x.startsWith('.') && x !== '__MACOSX').map((x) => path.join(f, x)), tmp, errori));
    else if (/\.zip$/i.test(f)) {
      try {
        const dest = fs.mkdtempSync(path.join(tmp, 'zip-'));
        const voci = unzipSync(fs.readFileSync(f), { filter: (v) => ESTENSIONI.test(v.name) && !/(^|\/)(__MACOSX|\.)/.test(v.name) });
        for (const [nome, dati] of Object.entries(voci)) {
          // le sottocartelle dello ZIP restano nel nome, così si distinguono tavole omonime
          const piatto = nome.split('/').filter(Boolean).join(' - ').replace(/[<>:"\\|?*]/g, '_');
          fs.writeFileSync(path.join(dest, piatto), dati);
          out.push(path.join(dest, piatto));
        }
        if (!Object.keys(voci).length) errori.push(`${path.basename(f)}: nessun PDF o immagine nell'archivio`);
      } catch (e) { errori.push(`${path.basename(f)}: archivio non leggibile (${e.message})`); }
    } else if (ESTENSIONI.test(f)) out.push(f);
    else if (files.length === 1) errori.push(`${path.basename(f)}: formato non supportato`);
  }
  return out;
}

ipcMain.handle('doc:aggiungi', async (e, id, files) => {
  const p = progetti.leggi(id);
  const errori = [];
  const tmp = fs.mkdtempSync(path.join(app.getPath('temp'), 'tritaproject-'));
  try {
    const elenco = espandi(files, tmp, errori);
    let n = 0;
    for (const f of elenco) {
      try { await progetti.aggiungiFile(p, f); } catch (err) { errori.push(`${path.basename(f)}: ${err.message}`); }
      if (++n % 10 === 0) invia({ progetto: id, tipo: 'avviso', testo: `Copiati ${n} file su ${elenco.length}…` });
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  progetti.salva(p);
  leggiDocumenti(id);
  return { progetto: vistaProgetto(p), errori };
});
ipcMain.handle('doc:rimuovi', (e, id, docId) => { const p = progetti.leggi(id); progetti.rimuoviFile(p, docId); progetti.salva(p); return vistaProgetto(p); });
ipcMain.handle('doc:rileggi', (e, id) => { leggiDocumenti(id, true); return true; });
ipcMain.handle('doc:anteprima', async (e, id, docId, pagina) => {
  const p = progetti.leggi(id);
  const d = p.documenti.find((x) => x.id === docId);
  if (d && isDxf(d)) return { dati: await immagineDxf(dxfDoc(path.join(progetti.cartella(id), d.file)), { lato: 2000 }), mime: 'image/png' };
  if (!d || d.tipo !== 'application/pdf') return null;
  const r = await paginaPdf(path.join(progetti.cartella(id), d.file), pagina || 1, { x0: 0, y0: 0, x1: 1, y1: 1 }, 2000);
  return { dati: r.dati, formato_pt: r.formato_pt };
});

ipcMain.handle('doc:dxf', async (e, id, docId, pagina, scala) => {
  try {
    const p = progetti.leggi(id);
    const r = await convertiDxf(p, p.documenti.find((x) => x.id === docId), { pagina, scala: scala || undefined });
    return { ok: true, testo: `Creato ${path.basename(r.file)}: ${r.linee} linee, ${r.testi} testi${r.layer.length ? `, ${r.layer.length} layer` : ''}.`, progetto: vistaProgetto(p) };
  } catch (err) { return { ok: false, testo: err.message }; }
});
ipcMain.handle('file:apri', (e, f) => shell.openPath(f));
ipcMain.handle('file:mostra', (e, f) => shell.showItemInFolder(f));

ipcMain.handle('chat:invia', async (e, id, testo) => {
  if (attivi.has(id)) return { errore: 'Sto già rispondendo in questo progetto.' };
  const segnale = { interrotto: false, stream: null };
  attivi.set(id, segnale);
  const p = progetti.leggi(id);
  const risposta = { ruolo: 'claude', testo: '', file: [] };
  p.vista.push({ ruolo: 'utente', testo, quando: Date.now() });
  try {
    const { cl } = clientAi();
    const esegui = strumenti(p, (file) => { risposta.file.push(...file); invia({ progetto: id, tipo: 'file', file }); });
    await ai.conversa({
      cl, cfg: config(), progetto: p, testo, esegui, segnale,
      salva: () => { const ora = progetti.leggi(id); p.documenti = ora.documenti; progetti.salva(p); },
      evento: (ev) => { if (ev.tipo === 'testo') risposta.testo += ev.testo; invia({ progetto: id, ...ev }); },
    });
  } catch (err) {
    risposta.errore = ai.messaggioErrore(err);
  } finally {
    attivi.delete(id);
    risposta.testo = risposta.testo.trim();
    risposta.quando = Date.now();
    p.vista.push(risposta);
    const ora = progetti.leggi(id);
    p.documenti = ora.documenti;
    progetti.salva(p);
    invia({ progetto: id, tipo: 'fine', dati: vistaProgetto(p) });
  }
  return { ok: true };
});
ipcMain.handle('chat:ferma', (e, id) => {
  const s = attivi.get(id);
  if (s) { s.interrotto = true; if (s.stream) s.stream.abort(); }
  return true;
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  progetti.imposta(path.join(app.getPath('documents'), 'TRITAPROJECT'));
  createWindow();
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());

// Per le prove automatiche (test/prova-electron.js)
module.exports = { espandi, applicaModifiche, strumenti, paginaPdf, vettoriPdf, areeChiuse, chiama, progetti, finestra: () => win };
