// Archivio dei progetti: ogni progetto è una cartella in Documenti\TRITAPROJECT\<nome>
//   progetto.json  dati del progetto, schede dei documenti e conversazione
//   allegati\      copie dei file caricati
//   elaborati\     relazioni, tavole, schemi e tabelle generate
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const PAGINE_PARTE = 90; // i PDF lunghi si dividono in parti: Claude legge fino a 600 pagine per richiesta
const TIPI = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain', '.md': 'text/plain', '.csv': 'text/plain', '.dxf': 'application/dxf' };

let radice = '';
const imposta = (dir) => { radice = dir; fs.mkdirSync(radice, { recursive: true }); };
const cartella = (id) => path.join(radice, id);
const fileDati = (id) => path.join(cartella(id), 'progetto.json');

function elenco() {
  return fs.readdirSync(radice, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
    try {
      const p = JSON.parse(fs.readFileSync(fileDati(d.name), 'utf8'));
      return { id: d.name, nome: p.nome, creato: p.creato, documenti: p.documenti.length, modificato: fs.statSync(fileDati(d.name)).mtimeMs };
    } catch (e) { return null; }
  }).filter(Boolean).sort((a, b) => b.modificato - a.modificato);
}

function leggi(id) {
  const p = JSON.parse(fs.readFileSync(fileDati(id), 'utf8'));
  p.id = id;
  return p;
}

function salva(p) {
  const file = fileDati(p.id);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(p));
  fs.renameSync(tmp, file);
}

function crea(nome) {
  const base = String(nome).replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').trim().slice(0, 60) || 'Progetto';
  let id = base, n = 2;
  while (fs.existsSync(cartella(id))) id = `${base} (${n++})`;
  fs.mkdirSync(path.join(cartella(id), 'allegati'), { recursive: true });
  fs.mkdirSync(path.join(cartella(id), 'elaborati'), { recursive: true });
  const p = { id, nome: String(nome).trim() || id, creato: new Date().toISOString(), note: '', documenti: [], messaggi: [], vista: [] };
  salva(p);
  return p;
}

function elimina(id) { fs.rmSync(cartella(id), { recursive: true, force: true }); }

// Copia un file nel progetto e lo prepara: i PDF lunghi vengono divisi in parti da PAGINE_PARTE pagine.
async function aggiungiFile(p, sorgente) {
  const est = path.extname(sorgente).toLowerCase();
  const tipo = TIPI[est];
  if (est === '.dwg') throw new Error('i DWG sono un formato chiuso: salvali come DXF dal CAD (Salva con nome → DXF) e carica il DXF');
  if (!tipo) throw new Error(`formato non supportato (${est || 'senza estensione'}): carica PDF, DXF, immagini (PNG/JPG) o testo`);
  let nome = path.basename(sorgente), dest = path.join(cartella(p.id), 'allegati', nome), n = 2;
  while (fs.existsSync(dest)) { nome = `${path.basename(sorgente, est)} (${n++})${est}`; dest = path.join(cartella(p.id), 'allegati', nome); }
  fs.copyFileSync(sorgente, dest);
  const doc = { id: 'D' + String((p.documenti.reduce((m, d) => Math.max(m, +d.id.slice(1) || 0), 0)) + 1).padStart(2, '0'), nome, file: `allegati/${nome}`, tipo, pagine: 1, parti: [], stato: 'da leggere', scheda: '' };
  if (tipo === 'application/pdf') {
    const pdf = await PDFDocument.load(fs.readFileSync(dest), { ignoreEncryption: true, updateMetadata: false });
    doc.pagine = pdf.getPageCount();
    for (let da = 1; da <= doc.pagine; da += PAGINE_PARTE) {
      const a = Math.min(doc.pagine, da + PAGINE_PARTE - 1);
      const parte = { da, a, file_id: '' };
      if (doc.pagine > PAGINE_PARTE) {
        const out = await PDFDocument.create();
        const pagine = await out.copyPages(pdf, Array.from({ length: a - da + 1 }, (_, i) => da - 1 + i));
        pagine.forEach((pg) => out.addPage(pg));
        parte.file = `allegati/.parti/${path.basename(nome, est)}_p${da}-${a}.pdf`;
        fs.mkdirSync(path.join(cartella(p.id), 'allegati', '.parti'), { recursive: true });
        fs.writeFileSync(path.join(cartella(p.id), parte.file), await out.save());
      }
      doc.parti.push(parte);
    }
  } else {
    doc.parti.push({ da: 1, a: 1, file_id: '' });
  }
  p.documenti.push(doc);
  return doc;
}

function rimuoviFile(p, docId) {
  const doc = p.documenti.find((d) => d.id === docId);
  if (!doc) return null;
  for (const f of [doc.file, ...doc.parti.map((x) => x.file).filter(Boolean)]) fs.rmSync(path.join(cartella(p.id), f), { force: true });
  p.documenti = p.documenti.filter((d) => d !== doc);
  return doc;
}

function elaborati(id) {
  const dir = path.join(cartella(id), 'elaborati');
  try {
    return fs.readdirSync(dir).filter((f) => !f.startsWith('.')).map((f) => ({ nome: f, percorso: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
  } catch (e) { return []; }
}

module.exports = { imposta, cartella, elenco, leggi, salva, crea, elimina, aggiungiFile, rimuoviFile, elaborati };
