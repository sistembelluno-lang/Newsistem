// Prova dell'app senza Claude: xvfb-run npx electron test/prova-electron.js <cartella uscita> <pdf…>
// Crea un progetto, carica i PDF, ingrandisce una tavola, genera tavola/schema/relazione/tabella e fotografa l'interfaccia.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const [out, ...pdf] = process.argv.slice(process.argv.findIndex((a) => a.endsWith('prova-electron.js')) + 1);
fs.mkdirSync(out, { recursive: true });
app.setPath('documents', path.join(out, 'documenti'));
app.setPath('userData', path.join(out, 'profilo'));
const m = require('../main');
const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  try {
    await attesa(1500);
    const p = m.progetti.crea('Casa 1 – prova');
    for (const f of pdf) await m.progetti.aggiungiFile(p, f);
    const pdfDoc0 = p.documenti.find((d) => d.tipo === 'application/pdf');
    // archivio ZIP con sottocartelle: i PDF vengono estratti e caricati
    const { zipSync } = require('fflate');
    const zip = path.join(out, 'lavoro.zip');
    fs.writeFileSync(zip, zipSync({ 'Lavoro/Strutture/': {}, 'Lavoro/Strutture/tavola.pdf': fs.readFileSync(path.join(m.progetti.cartella(p.id), pdfDoc0.file)), 'Lavoro/note.docx': new Uint8Array([1, 2]), '__MACOSX/._x.pdf': new Uint8Array([0]) }));
    const errZip = [];
    const tmp = fs.mkdtempSync(path.join(out, 'tmp-'));
    const daZip = m.espandi([zip], tmp, errZip);
    console.log('dallo ZIP:', daZip.map((f) => path.basename(f)), errZip);
    for (const f of daZip) await m.progetti.aggiungiFile(p, f);
    fs.rmSync(tmp, { recursive: true, force: true });
    p.documenti.forEach((d, i) => { d.stato = i === 1 ? 'in lettura' : 'letto'; d.scheda = i === 1 ? '' : `**Tipo**: tavola\n**Contenuto**: ${d.nome}\n**Dati chiave**: prova`; });
    console.log('documenti:', p.documenti.map((d) => `${d.id} ${d.nome} ${d.pagine}p parti=${d.parti.length}`).join(' | '));
    const file = [];
    const esegui = m.strumenti(p, (f) => file.push(...f));
    const img = async (nome, r) => { const b = r.find((x) => x.type === 'image'); fs.writeFileSync(path.join(out, nome), Buffer.from(b.source.data, 'base64')); console.log(nome, r.find((x) => x.type === 'text').text); };
    const pdfDoc = p.documenti.find((d) => d.tipo === 'application/pdf');
    await img('ingrandisci-intera.jpg', await esegui('ingrandisci', { documento: pdfDoc.id, pagina: 1 }));
    await img('ingrandisci-zona.jpg', await esegui('ingrandisci', { documento: pdfDoc.id, pagina: 1, zona: { x0: 0.3, y0: 0.3, x1: 0.5, y1: 0.5 } }));
    const tav = JSON.parse(fs.readFileSync(path.join(__dirname, 'tavola-esempio.json'), 'utf8'));
    await img('tavola-anteprima.png', await esegui('crea_tavola', tav));
    await img('tavola-viste.png', await esegui('crea_tavola', JSON.parse(fs.readFileSync(path.join(__dirname, 'tavola-viste.json'), 'utf8'))));
    for (const [d, scala] of [[pdfDoc.id, 50], ...p.documenti.slice(1).filter((x) => x.tipo === 'application/pdf' && x.pagine === 1).map((x) => [x.id, 0])]) {
      try { console.log(await esegui('converti_in_dxf', { documento: d, pagina: 1, scala: scala || undefined })); } catch (e) { console.log('converti_in_dxf', d, '→', e.message); }
    }
    console.log(await esegui('converti_in_dxf', { documento: pdfDoc.id, pagina: 1, zona: { x0: 0.3, y0: 0.3, x1: 0.5, y1: 0.5 }, scala: 50, nome_file: 'zona-pianta' }));
    await img('dettaglio-scala.png', await esegui('estrai_dettaglio', { documento: pdfDoc.id, pagina: 1, zona: { x0: 0.38, y0: 0.35, x1: 0.46, y1: 0.5 }, scala_originale: 50, scala_nuova: 20, titolo: 'Scala a chiocciola 1:20' }));
    console.log((await esegui('misura_aree', { documento: pdfDoc.id, pagina: 1, zona: { x0: 0.3, y0: 0.3, x1: 0.5, y1: 0.5 }, scala: 50, quante: 6 })).slice(0, 900));
    console.log((await esegui('cerca_testo', { testo: 'soggiorno' })).slice(0, 400));
    const altri = p.documenti.filter((x) => x.tipo === 'application/pdf' && x !== pdfDoc);
    if (altri.length) await img('confronto.png', await esegui('confronta', { documento_a: altri[0].id, documento_b: (altri[1] || altri[0]).id }));
    await img('modello-asso.png', await esegui('crea_modello_3d', JSON.parse(fs.readFileSync(path.join(__dirname, 'modello-esempio.json'), 'utf8'))));
    await img('modello-viste.png', await esegui('viste_modello', { modello: 'Casa di prova', formato: 'A2', viste: [{ tipo: 'prospetto', lato: 'sud', scala: 100 }, { tipo: 'prospetto', lato: 'ovest', scala: 100 }, { tipo: 'sezione', titolo: 'Sezione A-A', da: [2, -1], a: [2, 9], scala: 100 }, { tipo: 'pianta', quota: 1.2, scala: 100 }, { tipo: 'assonometria', scala: 100 }] }));
    try { await esegui('viste_modello', { modello: 'Inesistente', viste: [{ tipo: 'prospetto' }] }); } catch (e) { console.log('errore atteso:', e.message); }
    // DXF caricati: lettura, ingrandimento, ritaglio in scala e modifiche
    const dxfs = pdf.filter((f) => /\.dxf$/i.test(f));
    for (const f of dxfs) {
      const d = p.documenti.find((x) => x.nome === path.basename(f));
      await img(`dxf-apri-${d.id}.png`, await esegui('apri_documento', { documento: d.id }));
      await img(`dxf-zona-${d.id}.png`, await esegui('ingrandisci', { documento: d.id, zona: { x0: 0, y0: 0, x1: 0.5, y1: 1 } }));
      await img(`dxf-modifica-${d.id}.png`, await esegui('modifica_dxf', { documento: d.id, operazioni: [{ op: 'elimina_layer', layer: ['QUOTE', 'CAMPIT*'] }, { op: 'sostituisci_testo', da: 'Cls', a: 'Calcestruzzo' }, { op: 'aggiungi', entita: [{ tipo: 'testo', pos: [0, 5], testo: 'MODIFICATO CON TRITAPROJECT', altezza_mm: 4, layer: 'NOTE' }] }], stampa: { titolo: 'Disegno modificato', scala: 50 } }));
    }
    await img('pdf-modifica.png', await esegui('modifica_dxf', { documento: pdfDoc.id, scala_originale: 50, zona: { x0: 0.25, y0: 0.2, x1: 0.65, y1: 0.8 }, operazioni: [{ op: 'tieni_layer', layer: ['Strutturale*', 'Solai'] }], nome_file: 'Solo strutture', stampa: { titolo: 'Strutture piano terra', scala: 100 } }));
    await img('schema-anteprima.png', await esegui('crea_schema', { nome_file: 'Fasi', titolo: 'Fasi esecutive', svg: '<svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="120" fill="#fff"/><g font-family="Arial" font-size="12"><rect x="10" y="40" width="110" height="40" fill="#cde"/><text x="20" y="64">Fase 1: scavi</text><rect x="145" y="40" width="110" height="40" fill="#dec"/><text x="155" y="64">Fase 2: getti</text><rect x="280" y="40" width="110" height="40" fill="#edc"/><text x="290" y="64">Fase 3: finiture</text></g></svg>' }));
    console.log(await esegui('crea_relazione', { nome_file: 'Relazione prova', titolo: 'Relazione tecnica di prova', html: '<h2>1. Premessa</h2><p>Testo di prova con <b>grassetto</b>.</p><table><tr><th>Voce</th><th>Q.tà</th></tr><tr><td>Cls</td><td>12,5 m³</td></tr></table>' }));
    console.log(await esegui('crea_tabella', { nome_file: 'Computo', titolo: 'Computo di massima', colonne: ['Voce', 'U.M.', 'Quantità'], righe: [['Calcestruzzo C32/40', 'm³', 12.5], ['Acciaio B450C', 'kg', 1450]] }));
    p.vista.push({ ruolo: 'utente', testo: 'Ridisegna la sezione tipo del muro in DXF' }, { ruolo: 'claude', testo: '## Sezione tipo\nHo ricavato le quote dalla **tavola D01**:\n- spessore muro 0,40 m\n- fondazione 2,60 × 0,60 m\n\n| Elemento | Misura |\n|---|---|\n| Muro | 0,40 m |\n| Fondazione | 2,60 m |', file });
    m.progetti.salva(p);
    const w = m.finestra();
    await w.webContents.executeJavaScript(`chiudiModale('#m-imp'); apri(${JSON.stringify(p.id)})`);
    await attesa(1200);
    // anteprima con misura di un'area
    await w.webContents.executeJavaScript(`scheda('doc'); vedi(${JSON.stringify(pdfDoc.id)}, 1)`);
    await attesa(2500);
    await w.webContents.executeJavaScript(`$('#ant-scala').value = 50; modoMisura('area'); mis.punti = [[1700,1000],[2300,1000],[2300,1400],[1700,1400]]; disegnaMisura(); $('#mis-esito').textContent`).then((t) => console.log('misura UI:', t));
    fs.writeFileSync(path.join(out, 'ui-misura.png'), (await w.webContents.capturePage()).toPNG());
    await w.webContents.executeJavaScript(`chiudiModale('#m-ant')`);
    for (const s of ['chat', 'doc', 'el']) {
      await w.webContents.executeJavaScript(`scheda('${s}')`);
      await attesa(600);
      fs.writeFileSync(path.join(out, `ui-${s}.png`), (await w.webContents.capturePage()).toPNG());
    }
    // gli SVG prodotti da un lettore DXF esterno (es. ezdxf) diventano PNG per il confronto
    for (const f of fs.readdirSync(out).filter((x) => x.endsWith('-dxf.svg'))) fs.writeFileSync(path.join(out, f.replace(/\.svg$/, '.png')), Buffer.from(await m.chiama('svgPng', fs.readFileSync(path.join(out, f), 'utf8'), 1600), 'base64'));
    console.log('elaborati:', fs.readdirSync(path.join(m.progetti.cartella(p.id), 'elaborati')).join(', '));
    console.log('PROVA OK');
  } catch (e) { console.error('PROVA FALLITA', e); process.exitCode = 1; }
  app.exit();
});
