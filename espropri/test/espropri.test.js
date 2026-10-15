const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ES = require('./carica');
const U = ES.U;
const esempi = path.join(__dirname, '..', 'esempi');

test('numeri, date e importi in lettere', () => {
  assert.strictEqual(U.num('1.234,56'), 1234.56);
  assert.strictEqual(U.num('1234.5'), 1234.5);
  assert.strictEqual(U.haAreCa(12574), '1.25.74');
  assert.strictEqual(U.euroLettere(26650), 'ventiseimilaseicentocinquanta/00');
  assert.strictEqual(U.euroLettere(182.67), 'centottantadue/67');
  assert.strictEqual(U.lettere(1001), 'milleuno');
  assert.strictEqual(U.addMesi('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(U.quota('500/1000'), 0.5);
});

test('intestatari da testo tipo visura', () => {
  const L = ES.cat.leggiIntestatari("ROSSI MARIO nato a BELLUNO (BL) il 12/03/1960 - CF: RSSMRA60C12A757X Proprieta' 1/2; ACME S.R.L. con sede in FELTRE (BL) - CF: 01234567890 Nuda proprieta' 1/1");
  assert.strictEqual(L.length, 2);
  assert.strictEqual(L[0].nome, 'ROSSI MARIO');
  assert.strictEqual(L[0].natoIl, '1960-03-12');
  assert.strictEqual(L[0].quota, '1/2');
  assert.strictEqual(L[1].sede, 'FELTRE (BL)');
  assert.strictEqual(ES.cat.saluto(L[1]), 'Spett.le');
  const R = ES.cat.leggiIntestatari('BIANCHI ANNA\nnata a FELTRE (BL) il 05/07/1962\nCF: BNCNNA62L45D530Y\nProprieta\' 1/3\nVERDI LUIGI\nnato a SEDICO (BL) il 01/01/1950\nCF: VRDLGU50A01I563Z\nUsufrutto 1/1');
  assert.deepStrictEqual(R.map(o => o.nome), ['BIANCHI ANNA', 'VERDI LUIGI']);
  assert.strictEqual(ES.cat.sessoCF('BNCNNA62L45D530Y'), 'F');
});

test('etichette di particella', () => {
  assert.deepStrictEqual(ES.analisi.etichetta('Fg.1 100'), { fg: '1', map: '100', sub: '', fr: '' });
  assert.strictEqual(ES.analisi.etichetta('100/a').map, '100');
  assert.strictEqual(ES.analisi.etichetta('strada'), null);
});

test('arco con bulge: semicerchio', () => {
  const dxf = ES.dxf.leggi(['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'A', '90', '2', '70', '1', '10', '1', '20', '0', '42', '1', '10', '-1', '20', '0', '42', '1', '0', 'ENDSEC', '0', 'EOF'].join('\n'));
  const a = Math.abs(ES.geo.areaAnello(dxf.poli[0].pts));
  assert.ok(Math.abs(a - Math.PI) < 0.02, 'area cerchio ' + a);
});

test('poligoni ricostruiti da linee sciolte', () => {
  const L = [[[0, 0], [10, 0]], [[10, 0], [20, 0]], [[20, 0], [20, 10]], [[20, 10], [10, 10]], [[10, 10], [0, 10]], [[0, 10], [0, 0]], [[10, 0], [10, 10]]].map(pts => ({ pts, chiusa: false }));
  const F = ES.geo.poligonizza(L);
  assert.strictEqual(F.length, 2);
  F.forEach(P => assert.ok(Math.abs(ES.geo.areaPoly(P) - 100) < 1e-6));
});

function pratica() {
  const dxf = ES.dxf.leggi(fs.readFileSync(path.join(esempi, 'esempio.dxf')));
  const geo = ES.analisi.importaDxf(dxf, { fg: '1' });
  const tab = ES.tab.csv(fs.readFileSync(path.join(esempi, 'ditte.csv'), 'utf8'));
  const imp = ES.cat.importaTabella(tab.fogli[0].righe, { fg: '1' });
  return { nome: 'Opera di prova', ente: { nome: 'Comune di Prova', tribunale: 'Belluno' }, impost: { procedura: 'art22', mesiOcc: 10 },
    valori: [{ id: 'sem', nome: 'Seminativo', vu: 4, vam: 30000 }, { id: 'pra', nome: 'Prato', vu: 3, vam: 20000 }, { id: 'bos', nome: 'Bosco', vu: 1.5, vam: 8000 }],
    geo, particelle: imp.particelle, ditte: imp.ditte, iter: { dpu: { data: '2026-01-15', estremi: 'Delibera G.C. n. 1' } }, _imp: imp };
}

test('DXF d\'esempio: pezzi etichettati e fasce divise per particella', () => {
  const pr = pratica();
  const S = ES.analisi.superfici(pr.geo);
  // esproprio: 40×5 nella riga 0 (mappali 100-103) e 40×7 nella riga 1 (104-107)
  assert.strictEqual(Math.round(S['1|100'].espr), 200);
  assert.strictEqual(Math.round(S['1|104'].espr), 280);
  // servitù fascia 37-43 nella riga 1 (meno il pozzetto, che va in «ingombro opere»)
  assert.strictEqual(Math.round(S['1|104'].serv), 240);
  assert.ok(S['1|105'].servop > 6 && S['1|105'].servop < 7.2);
  assert.strictEqual(Math.round(S['1|105'].serv + S['1|105'].servop), 240);
  // occupazione 43-51, da x+10 a x+150: la riga 1 (fino a 60) ha 43-60 → 8 m di fascia
  assert.strictEqual(Math.round(S['1|104'].occ), 30 * 8);
  assert.strictEqual(Math.round(S['1|105'].occ), 40 * 8);
  assert.strictEqual(pr.geo.part.length, 12);
});

test('Excel/CSV ditte: raggruppamento e numeri di piano', () => {
  const pr = pratica();
  assert.strictEqual(pr.particelle.length, 8);
  assert.strictEqual(pr.ditte.length, 5);
  const d1 = pr.ditte.find(d => d.n === '1');
  assert.strictEqual(d1.intest.length, 2);
  assert.strictEqual(pr.particelle.filter(p => p.ditta === d1.id).length, 2);
  assert.strictEqual(pr.particelle[0].sup, 1200);
});

test('stima: esproprio, servitù, occupazione art. 50', () => {
  const pr = pratica();
  const c = ES.stima.calcola(pr);
  const p104 = pr.particelle.find(p => p.map === '104'), v = c.perP.get(p104.id);
  assert.strictEqual(v.voci.espr, 280 * 4);
  assert.strictEqual(v.voci.serv, Math.round(240 * 4 * 0.25 * 100) / 100);
  assert.strictEqual(v.voci.occ, Math.round(240 * 4 / 12 * 10 / 12 * 100) / 100);
  assert.ok(c.T.tot > 0);
});

test('scadenze: DPU + 5 anni, art. 22 condivisione 30 giorni dall\'immissione', () => {
  const pr = pratica();
  pr.ditte[0].ev = { decreto: { data: '2026-02-20' }, immissione: { data: '2026-03-10' } };
  const S = ES.iter.scadenze(pr);
  assert.ok(S.some(s => s.data === '2031-01-15' && /decreto di esproprio/.test(s.cosa)));
  assert.ok(S.some(s => s.data === '2026-04-09' && s.ditta));
});

test('documenti: modello integrato → blocchi → Word', () => {
  const pr = pratica(), calc = ES.stima.calcola(pr);
  const M = ES.modelli;
  for (const k of Object.keys(M.INTEGRATI)) {
    const m = M.INTEGRATI[k];
    const ctxs = M.contesti(pr, calc, m.ambito);
    assert.ok(ctxs.length > 0, k);
    const testo = M.mustache(m.testo, ctxs[0]);
    assert.ok(!/\{\{/.test(testo), k + ': segnaposto non risolti');
    const B = M.blocchi(testo, ctxs[0]);
    assert.ok(B.length > 3, k);
    M.html(B);
  }
  const ctx = M.contesti(pr, calc, 'pratica')[0];
  const B = M.blocchi(M.mustache(M.INTEGRATI.decreto_esproprio.testo, ctx), ctx);
  const docx = ES.office.docx(B, { intestazione: ['Comune di Prova'] });
  assert.strictEqual(docx[0], 0x50); assert.strictEqual(docx[1], 0x4b);
  const testo = M.mustache(M.INTEGRATI.decreto_esproprio.testo, ctx);
  assert.ok(/Unità negoziale n° 1 – NP1/.test(testo));
  assert.ok(/diconsi euro/.test(testo));
});

test('compilazione di un modello Word con segnaposto e campi di stampa unione', async () => {
  const pr = pratica(), calc = ES.stima.calcola(pr);
  // Modello minimo: un paragrafo con {{dest.nome}} spezzato in due run, un campo MERGEFIELD e una riga di tabella ripetuta
  const doc = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'
    + '<w:p><w:r><w:t>Gentile {{dest.</w:t></w:r><w:r><w:t>nome}}</w:t></w:r></w:p>'
    + '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> MERGEFIELD Foglio1 </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>«Foglio1»</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>{{#ditta.particelle}}{{map}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{espr}}{{/ditta.particelle}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:sectPr/></w:body></w:document>';
  const z = ES.office.zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>' },
    { name: 'word/document.xml', data: doc }]);
  const ctxs = ES.modelli.contesti(pr, calc, 'intestatario').slice(0, 2).map(c => ({ ...c, _unione: ES.modelli.unione(c) }));
  const out = await ES.office.compila(z.buffer, ctxs);
  const files = await ES.tab.unzipTutto(out.buffer);
  const x = new TextDecoder().decode(files['word/document.xml']);
  assert.ok(x.includes('Gentile ROSSI MARIO'), 'nome');
  assert.ok(x.includes('Gentile BIANCHI ANNA'), 'secondo intestatario');
  assert.ok(!x.includes('{{'), 'segnaposto residui');
  assert.strictEqual((x.match(/<w:tr>/g) || []).length, 4, 'righe ripetute (2 particelle × 2 lettere)');
  assert.ok(x.includes('>1<'), 'campo Foglio1');
});

test('tavola SVG ed estratto per ditta', () => {
  const pr = pratica(), calc = ES.stima.calcola(pr);
  const svg = ES.tavola.foglio(pr, calc, { formato: 'A3' });
  assert.ok(svg.startsWith('<svg') && svg.includes('p-espr') && svg.includes('LEGENDA'));
  const e = ES.tavola.estratto(pr, calc, pr.ditte[0].id, 1000);
  assert.ok(e.includes('scala 1:1000'));
});

test('Excel: scrittura e rilettura', async () => {
  const x = ES.office.xlsx([{ nome: 'Piano', righe: [['Fg', 'Mapp', 'Sup'], [1, '100', 1200]] }]);
  const r = await ES.tab.xlsx(x.buffer);
  assert.deepStrictEqual(r.fogli[0].righe, [['Fg', 'Mapp', 'Sup'], [1, '100', 1200]]);
});

test('ditte: stessi intestatari e stesse quote = una ditta; quote diverse = ditte diverse', () => {
  const o = (nome, quota) => ({ nome, titolo: "Proprieta'", quota });
  const P = [
    { id: 'a', fg: '1', map: '10', intest: [o('ROSSI MARIO', '500/1000'), o('VERDI ELENA', '500/1000')] },
    { id: 'b', fg: '2', map: '20', intest: [o('VERDI ELENA', '1/2'), o('ROSSI MARIO', '1/2')] },
    { id: 'c', fg: '1', map: '11', intest: [o('ROSSI MARIO', '100/1000'), o('VERDI ELENA', '900/1000')] },
    { id: 'd', fg: '1', map: '12', intest: [{ nome: 'ROSSI MARIO', titolo: 'Nuda proprieta', quota: '1/1' }] },
    { id: 'e', fg: '1', map: '13', intest: [{ nome: 'ROSSI MARIO', titolo: "Proprieta'", quota: '1/1' }] }
  ];
  const D = ES.cat.raggruppa(P);
  assert.strictEqual(D.length, 4);
  assert.strictEqual(P[0].ditta, P[1].ditta);
  assert.notStrictEqual(P[0].ditta, P[2].ditta);
  assert.notStrictEqual(P[3].ditta, P[4].ditta);
  assert.deepStrictEqual(D.map(d => d.n), ['1', '2', '3', '4']);
});
