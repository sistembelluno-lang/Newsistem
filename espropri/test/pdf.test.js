// Lettura «intuitiva» di una tavola PDF: PDF sintetico (pdf-lib) con legenda, particelle, aree e scala
const test = require('node:test');
const assert = require('node:assert');
const ES = require('./carica');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

let pdfjs = null;
try { pdfjs = require('pdfjs-dist/legacy/build/pdf.js'); } catch (e) { /* senza pdf.js il test si salta */ }

// 1 pt = 0,3528 mm; a scala 1:1000 1 pt² = 0,12446 m²
const PT2 = (25.4 / 72) ** 2;

async function tavola(opt = {}) {
  const doc = await PDFDocument.create(), pg = doc.addPage([600, 400]), font = await doc.embedFont(StandardFonts.Helvetica);
  const nero = rgb(0, 0, 0), rosso = rgb(1, 0, 0), verde = rgb(0, 0.8, 0), arancio = rgb(1, 0.5, 0);
  // Particelle 10 e 11: un rettangolo con una linea divisoria (linee sciolte, come nei PDF dei CAD)
  pg.drawRectangle({ x: 20, y: 20, width: 200, height: 100, borderColor: nero, borderWidth: 0.5 });
  pg.drawLine({ start: { x: 120, y: 20 }, end: { x: 120, y: 120 }, thickness: 0.5, color: nero });
  pg.drawText('10', { x: 30, y: 28, size: 8, font }); pg.drawText('11', { x: 200, y: 28, size: 8, font });
  // Esproprio a cavallo delle due particelle, occupazione sopra
  pg.drawRectangle({ x: 70, y: 45, width: 100, height: 50, color: rosso });
  pg.drawRectangle({ x: 70, y: 95, width: 100, height: 15, color: verde });
  // Servitù tratteggiata sotto l'esproprio (linee parallele a passo 10, la prima a mezzo passo dal bordo come nei CAD)
  for (let i = 0; i < 10; i++) pg.drawLine({ start: { x: 75 + i * 10, y: 30 }, end: { x: 75 + i * 10, y: 45 }, thickness: 0.3, color: arancio });
  // Numero di ditta cerchiato dentro la particella 10: non deve diventare un mappale
  pg.drawCircle({ x: 40, y: 100, size: 9, borderColor: rosso, borderWidth: 0.5 }); pg.drawText('7', { x: 37.5, y: 97, size: 8, font });
  // Legenda: simbolo a sinistra, descrizione a destra
  pg.drawText('LEGENDA', { x: 380, y: 360, size: 10, font });
  pg.drawRectangle({ x: 350, y: 330, width: 24, height: 10, color: rosso }); pg.drawText('Aree da espropriare', { x: 380, y: 332, size: 8, font });
  pg.drawRectangle({ x: 350, y: 310, width: 24, height: 10, color: verde }); pg.drawText('Occupazione temporanea', { x: 380, y: 312, size: 8, font });
  for (let i = 0; i <= 6; i++) pg.drawLine({ start: { x: 350 + i * 4, y: 290 }, end: { x: 350 + i * 4, y: 300 }, thickness: 0.3, color: arancio });
  pg.drawText('Fascia di asservimento', { x: 380, y: 292, size: 8, font });
  pg.drawRectangle({ x: 350, y: 270, width: 24, height: 10, color: rgb(0.6, 0.6, 0.6) }); pg.drawText('Aree non piu\' interessate', { x: 380, y: 272, size: 8, font });
  if (opt.scala !== false) pg.drawText('Scala 1:1000', { x: 380, y: 200, size: 8, font });
  pg.drawText('Foglio 12', { x: 230, y: 130, size: 8, font });
  return new Uint8Array(await doc.save());
}

test('PDF: legenda letta da simboli e parole (anche «non più interessate» e tratteggi)', { skip: !pdfjs }, async () => {
  const r = await ES.pdfv.leggi(pdfjs, await tavola());
  assert.strictEqual(r.scala, 1000);
  const L = ES.pdfv.legenda(r.pagine[0]);
  const per = Object.fromEntries(L.voci.map(v => [v.testo, v]));
  assert.strictEqual(per['Aree da espropriare'].ruolo, 'espr');
  assert.strictEqual(per['Aree da espropriare'].simbolo.colore, '#ff0000');
  assert.strictEqual(per['Occupazione temporanea'].ruolo, 'occ');
  assert.strictEqual(per['Fascia di asservimento'].ruolo, 'serv');
  assert.strictEqual(per['Fascia di asservimento'].simbolo.tipo, 'tratteggio');
  assert.strictEqual(per["Aree non piu' interessate"].ruolo, null);
});

test('PDF: superfici per particella alla scala del cartiglio, foglio dalla scritta, richiami cerchiati ignorati', { skip: !pdfjs }, async () => {
  const r = await ES.pdfv.leggi(pdfjs, await tavola());
  const I = ES.pdfv.interpreta(r.pagine[0], r.scala);
  const geo = ES.analisi.importaDxf(I.dxf, { ruoli: I.ruoli, fgDa: I.fgDa });
  const S = ES.analisi.superfici(geo);
  assert.deepStrictEqual(Object.keys(S).filter(k => S[k].espr + S[k].occ + S[k].serv > 0).sort(), ['12|10', '12|11']);
  const vicino = (a, b) => assert.ok(Math.abs(a - b) < b * 0.02 + 0.5, a + ' ≠ ' + b);
  vicino(S['12|10'].espr, 50 * 50 * PT2); vicino(S['12|11'].espr, 50 * 50 * PT2);
  vicino(S['12|10'].occ, 50 * 15 * PT2); vicino(S['12|11'].occ, 50 * 15 * PT2);
  vicino(S['12|10'].serv + S['12|11'].serv, 100 * 15 * PT2);
  assert.ok(!Object.keys(S).some(k => /\|7$/.test(k)), 'il richiamo cerchiato non è una particella');
});

test('PDF: scala stimata dalle superfici catastali; correzione dei tipi dalla legenda', { skip: !pdfjs }, async () => {
  const r = await ES.pdfv.leggi(pdfjs, await tavola({ scala: false }));
  assert.strictEqual(r.scala, 0);
  const pg = r.pagine[0];
  const I = ES.pdfv.interpreta(pg, r.scala);
  assert.ok(I.avvisi.some(a => /Scala non trovata/.test(a)));
  // superfici catastali vere a 1:500 → la stima deve tornare 500
  const g = ES.analisi.importaDxf(I.dxf, { ruoli: I.ruoli, fgDa: I.fgDa });
  const vera = 100 * 100 * PT2 / 4;
  assert.strictEqual(ES.pdfv.scalaDaSuperfici(g.part.filter(p => p.k).map(p => [p.a, vera])), 500);
  // l'utente dice che il verde è servitù: l'occupazione sparisce e diventa servitù
  const voci = ES.pdfv.legenda(pg).voci.map(v => ({ ...v, ruolo: v.testo === 'Occupazione temporanea' ? 'serv' : v.ruolo }));
  const I2 = ES.pdfv.interpreta(pg, 500, { voci });
  const S = ES.analisi.superfici(ES.analisi.importaDxf(I2.dxf, { ruoli: I2.ruoli, fgDa: I2.fgDa }));
  assert.strictEqual(Math.round(S['12|10'].occ), 0);
  assert.ok(S['12|10'].serv > 0);
});
