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
  const L = ES.cat.leggiIntestatari("ROSSI MARIO nato a BELLUNO (BL) il 12/03/1960 - CF: RSSMRA60C12A757T Proprieta' 1/2; ACME S.R.L. con sede in FELTRE (BL) - CF: 01234567897 Nuda proprieta' 1/1");
  assert.strictEqual(L.length, 2);
  assert.strictEqual(L[0].nome, 'ROSSI MARIO');
  assert.strictEqual(L[0].natoIl, '1960-03-12');
  assert.strictEqual(L[0].quota, '1/2');
  assert.strictEqual(L[1].sede, 'FELTRE (BL)');
  assert.strictEqual(ES.cat.saluto(L[1]), 'Spett.le');
  const R = ES.cat.leggiIntestatari('BIANCHI ANNA\nnata a FELTRE (BL) il 05/07/1962\nCF: BNCNNA62L45D530F\nProprieta\' 1/3\nVERDI LUIGI\nnato a SEDICO (BL) il 01/01/1950\nCF: VRDLGU50A01I563Y\nUsufrutto 1/1');
  assert.deepStrictEqual(R.map(o => o.nome), ['BIANCHI ANNA', 'VERDI LUIGI']);
  assert.strictEqual(ES.cat.sessoCF('BNCNNA62L45D530F'), 'F');
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
  assert.ok(/dicons[iì] euro/.test(testo));
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

test('dati specifici della pratica e livelli del testo dei modelli', () => {
  const pr = pratica(), calc = ES.stima.calcola(pr), M = ES.modelli;
  pr.dati = { progetto: 'PFTE redatto dallo Studio Alfa, prot. 99', visti: 'il D.Lgs. 267/2000;\nla L.R. 11/2004;', finanziamento: 'fondi regionali', lettere: 'Si allega informativa privacy.' };
  pr.campi = [{ k: 'soprintendenza', nome: 'Parere Soprintendenza' }]; pr.dati.soprintendenza = 'parere n. 5';
  const ctx = M.contesti(pr, calc, 'pratica')[0];
  assert.strictEqual(ctx.dati.vistiElenco, '- il D.Lgs. 267/2000;\n- la L.R. 11/2004;');
  assert.ok(ctx.dati.premesseElenco.includes('finanziata con fondi regionali'));
  const dec = M.mustache(M.INTEGRATI.decreto_esproprio.testo, ctx);
  assert.ok(dec.includes('**VISTI:**') && dec.includes('- la L.R. 11/2004;'));
  assert.ok(dec.includes('(PFTE redatto dallo Studio Alfa, prot. 99)'));
  const lett = M.mustache(M.INTEGRATI.com_17.testo, M.contesti(pr, calc, 'intestatario')[0]);
  assert.ok(lett.includes('Si allega informativa privacy.'));
  // senza dati le sezioni spariscono
  pr.dati = {}; const vuoto = M.mustache(M.INTEGRATI.decreto_esproprio.testo, M.contesti(pr, calc, 'pratica')[0]);
  assert.ok(!vuoto.includes('VISTI') && !vuoto.includes('()'));
  // livelli: originale → base (tutte le pratiche) → pratica
  const lib = { base: {}, custom: [{ k: 'u_1', nome: 'Mio modello', ambito: 'ditta', testo: 'Ditta {{ditta.n}} – {{dati.soprintendenza}}' }] };
  assert.strictEqual(M.livello('com_17', pr, lib), 'originale');
  lib.base.com_17 = 'BASE'; assert.strictEqual(M.testo('com_17', pr, lib), 'BASE'); assert.strictEqual(M.livello('com_17', pr, lib), 'base');
  pr.modelli = { com_17: 'PRATICA' }; assert.strictEqual(M.testo('com_17', pr, lib), 'PRATICA');
  assert.strictEqual(M.livello('u_1', pr, lib), 'nuovo');
  assert.strictEqual(M.catalogo(lib).u_1.nome, 'Mio modello');
  pr.dati = { soprintendenza: 'parere n. 5' };
  assert.strictEqual(M.mustache(M.testo('u_1', pr, lib), M.contesti(pr, calc, 'ditta')[0]), 'Ditta 1 – parere n. 5');
});

test('Excel a blocchi tipo riepilogo visure (ditta su più righe, mappali con la barra)', () => {
  const R = [
    ['N.', 'Ditta Catastale', 'Comune', 'Catasto', 'Foglio', 'Mappale', 'Qualità/Classe', 'Superficie\r(mq)', 'Rd (€)', 'Ra (€)'],
    [1, 'ENTE ESEMPIO con sede in ROMA (RM)', 'COMUNE A', 'Terreni', '66', '8611/16', 'IMPRODUTT/', 2860348],
    ['', 'CF:97000000006', 'COMUNE A', 'Terreni', '66', '8611/9', 'IMPRODUTT/', 1665],
    ['', "Proprieta': 1/1", 'COMUNE A', 'Terreni', '66', '8611/11', 'IMPRODUTT/', 4020],
    [2, 'ROSSI MARIO nato a BELLUNO (BL) il 12/03/1960', 'COMUNE A', 'Terreni', '66', '8612/5', 'ALPI/6', 490, 0.08, 0.08],
    ['', 'CF:RSSMRA60C12A757T', 'COMUNE A', 'Terreni', '66', '8612/4', 'ALPI/6', 850, 0.13, 0.13],
    ['', "Proprieta': 500/1000"],
    ['', 'BIANCHI ANNA nata a FELTRE (BL) il 05/07/1962'],
    ['', 'CF:BNCNNA62L45D530F'],
    ['', "Proprieta': 500/1000"],
    [3, 'REGOLA UNO con sede in COMUNE A (BL)', 'COMUNE A', 'Terreni', '66', '8589/10', 'BOSCHI/6', 90, 0.03, 0.01],
    ['', 'CF:'],
    ['', 'REGOLA DUE con sede in COMUNE A (BL)'],
    ['', 'CF:90000330259']
  ];
  const r = ES.cat.importaTabella(R, {});
  assert.strictEqual(r.ditte.length, 3);
  assert.strictEqual(r.particelle.length, 6);
  const d1 = r.ditte.find(d => d.n === '1'), d2 = r.ditte.find(d => d.n === '2'), d3 = r.ditte.find(d => d.n === '3');
  assert.strictEqual(d1.intest.length, 1); assert.strictEqual(d1.intest[0].cf, '97000000006'); assert.strictEqual(d1.intest[0].quota, '1/1'); assert.strictEqual(d1.intest[0].sede, 'ROMA (RM)');
  assert.strictEqual(r.particelle.filter(p => p.ditta === d1.id).length, 3);
  assert.deepStrictEqual(d2.intest.map(o => o.nome + ' ' + o.quota), ['ROSSI MARIO 500/1000', 'BIANCHI ANNA 500/1000']);
  assert.deepStrictEqual(d3.intest.map(o => o.nome), ['REGOLA UNO', 'REGOLA DUE']);
  const p = r.particelle.find(x => x.map === '8611/16');
  assert.strictEqual(p.sup, 2860348); assert.strictEqual(p.qual, 'IMPRODUTT'); assert.strictEqual(p.fg, '66');
  assert.strictEqual(r.particelle.find(x => x.map === '8612/5').rd, '0.08');
  assert.strictEqual(ES.analisi.etichetta('8611/16').map, '8611/16');
  assert.strictEqual(ES.analisi.etichetta('Fg.66 8611/16').map, '8611/16');
  assert.strictEqual(ES.analisi.etichetta('1/100', { fgMap: true }).fg, '1');
});

test('categorie di stima riconosciute dalla qualità della visura', () => {
  const V = ES.stima.VALORI, c = q => (ES.stima.categoria({ qual: q }, V) || {}).id;
  assert.strictEqual(c('BOSCHI'), 'bos'); assert.strictEqual(c('BOSCO CEDUO'), 'bos'); assert.strictEqual(c('ALPI'), 'pas');
  assert.strictEqual(c('IMPRODUTT'), 'inc'); assert.strictEqual(c('SEMIN ARBOR'), 'sem'); assert.strictEqual(c('PRATO'), 'pra');
  assert.strictEqual(c('ENTE URBANO'), 'eu'); assert.strictEqual(c('REL ENTE UR'), 'eu'); assert.strictEqual(c('XYZ'), undefined);
  assert.strictEqual(ES.stima.categoria({ qual: 'Prato' }, [{ id: 'x', nome: 'Prati stabili' }]).id, 'x');
});

test('decreto di esproprio sul modello dello studio: note, osservazioni, frazionamento, certificato', () => {
  const pr = pratica(), M = ES.modelli;
  pr.ente = { nome: 'Comune di Prova', provincia: 'Belluno', ruolo: "Il Responsabile dell'Area Tecnica", responsabile: 'ing. Esempio', beneficiario: 'Comune di Prova', cfBeneficiario: '00000000000', sedeBeneficiario: 'piazza 1', studio: 'SISTEM srl stp', sedeStudio: 'Belluno (BL)', tar: 'Veneto', tribunale: 'Belluno', bur: 'BUR Veneto' };
  pr.urgenza = 'necessità di aggiudicare i lavori';
  pr.dati = { servitu: 'di condotta' };
  pr.ditte[0].ev = { avvio: { data: '2024-04-11', prot: '8997' }, immissione: { data: '2026-03-10' } };
  pr.ditte[1].ev = { avvio: { data: '2024-04-17', prot: '9443' }, immissione: { data: '2026-03-10' } };
  pr.ditte[2].ev = { avvio: { data: '2024-04-17', prot: '9446' } };
  pr.ditte[1].oss = 'acquisizione del mappale 102 nella sua totalità';
  const p100 = pr.particelle.find(x => x.map === '100'); p100.nuovo = { espr: '1706' }; p100.fraz = { espr: { rd: '4.01', ra: '2.19' } };
  const calc = ES.stima.calcola(pr), ctx = M.contesti(pr, calc, 'pratica')[0];
  assert.strictEqual(ctx.comunicazioni.avvio, 'in data 11/04/2024 con Nota n° 8997 e in data 17/04/2024 con Note n° 9443, 9446');
  const t = M.mustache(M.INTEGRATI.decreto_esproprio.testo, ctx);
  assert.ok(t.includes("DECRETO del Responsabile dell'Area Tecnica"));
  assert.ok(t.includes("IL RESPONSABILE DELL'AREA TECNICA"));
  assert.ok(t.includes('in data 11/04/2024 con Nota n° 8997 e in data 17/04/2024 con Note n° 9443, 9446 Comune di Prova ha provveduto'));
  assert.ok(t.includes('Ditta 2 – acquisizione del mappale 102 nella sua totalità;'));
  assert.ok(/Unità negoziale n° 1 – NP1:\*\* C\.T\. Comune di COMUNE DI PROVA - Fg 1 Mapp 1706 ex 100, Seminativo\/2 di mq 200, R\.D\. 4\.01 – R\.A\. 2\.19 con superficie di esproprio pari a mq 200;/.test(t), 'unità negoziale con mappale derivato');
  assert.ok(t.includes('e per una indennità di esproprio complessiva di'));
  assert.ok(t.includes('la costituzione di una servitù di condotta'));
  assert.ok(t.includes('studio SISTEM srl stp con sede in Belluno (BL)'));
  assert.ok(t.includes('CERTIFICATO DI PUBBLICAZIONE'));
  assert.ok(!t.includes('{{'));
  const v = M.mustache(M.INTEGRATI.decreto_23.testo, ctx);
  assert.ok(!v.includes('## INVITA') && v.includes('è stata determinata l\'indennità di esproprio'));
});

test('controlli della ditta: codice fiscale mancante o errato, quote', () => {
  const C = ES.cat;
  assert.ok(C.cfValido('RSSMRA80A01H501U')); assert.ok(!C.cfValido('RSSMRA80A01H501X')); assert.ok(C.cfValido('00176800258'));
  const L = C.controlli({ intest: [{ nome: 'ROSSI MARIO', titolo: "Proprieta'", quota: '500/1000' }, { nome: 'VERDI ELENA', cf: 'RSSMRA80A01H501X', titolo: "Proprieta'", quota: '400/1000' }] }, [{}]);
  assert.ok(L.some(x => x.livello === 'manca' && /codice fiscale di ROSSI MARIO/.test(x.msg)));
  assert.ok(L.some(x => x.livello === 'errore' && /non valido per VERDI ELENA/.test(x.msg)));
  assert.ok(L.some(x => /quote di proprietà sommano a 0.9/.test(x.msg)));
  assert.ok(!C.controlli({ intest: [{ nome: 'A', cf: 'RSSMRA80A01H501U', via: 'x', titolo: 'Usufrutto', quota: '1/1' }, { nome: 'B', cf: '00176800258', via: 'y', titolo: 'Nuda proprieta', quota: '1/1' }] }, [{}]).length);
  // stessa persona con due diritti diversi nella stessa particella: due righe, non una
  const r = C.importaTabella([['Foglio', 'Mappale', 'Intestatari'], ['1', '5', "ROSSI MARIO Usufrutto 1/2; ROSSI MARIO Nuda proprieta' 1/2; BIANCHI ANNA Proprieta' 1/2"]]);
  assert.strictEqual(r.ditte[0].intest.length, 3);
});

test('Excel con celle «xml:space=preserve» (nomi delle persone) e quote mancanti in visura', async () => {
  const sheet = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    + '<row r="1"><c r="A1" t="str"><v>N.</v></c><c r="B1" t="str"><v>Ditta Catastale</v></c><c r="C1" t="str"><v>Foglio</v></c><c r="D1" t="str"><v>Mappale</v></c></row>'
    + '<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="str"><v xml:space="preserve">ROSSI MARIO  </v></c><c r="C2" t="str"><v>28</v></c><c r="D2" t="str"><v>136</v></c></row>'
    + '<row r="3"><c r="B3" t="str"><v>nato a AGORDO (BL) il 30/05/1965</v></c></row>'
    + '<row r="4"><c r="B4" t="str"><v>CF:RSSMRA80A01H501U</v></c></row>'
    + '<row r="5"><c r="B5" t="str"><v>Proprieta&apos;: 1/2</v></c></row>'
    + '<row r="6"><c r="B6" t="str"><v xml:space="preserve">BIANCHI ANNA  </v></c></row>'
    + '<row r="7"><c r="B7" t="str"><v>CF:BNCNNA62L45D530F</v></c></row>'
    + '<row r="8"><c r="B8" t="str"><v>Comproprietario: </v></c></row>'
    + '</sheetData></worksheet>';
  const z = ES.office.zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Test" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: sheet }]);
  const t = await ES.tab.xlsx(z.buffer);
  assert.strictEqual(t.fogli[0].righe[1][1], 'ROSSI MARIO  ');
  const r = ES.cat.importaTabella(t.fogli[0].righe);
  assert.deepStrictEqual(r.ditte[0].intest.map(o => o.nome), ['ROSSI MARIO', 'BIANCHI ANNA']);
  const L = ES.cat.controlli(r.ditte[0], [{}]);
  assert.ok(L.some(x => /Quota non indicata per BIANCHI ANNA \(Comproprietario\)/.test(x.msg)));
  assert.ok(!L.some(x => /sommano/.test(x.msg)));
});

test('correzione della scala del disegno e taglio di una particella', () => {
  const dxf = ES.dxf.leggi(fs.readFileSync(path.join(esempi, 'esempio.dxf')));
  const geo = ES.analisi.importaDxf(dxf, { fg: '1' });
  const prima = geo.pezzi.reduce((s, z) => s + z.a, 0), bb = geo.bbox.slice();
  ES.analisi.scalaGeo(geo, 0.1);
  assert.ok(Math.abs(geo.pezzi.reduce((s, z) => s + z.a, 0) - prima / 100) < 1e-6);
  assert.ok(Math.abs(geo.bbox[2] - bb[2] * 0.1) < 1e-9);
  ES.analisi.scalaGeo(geo, 10);
  const pr = { geo, particelle: [], ditte: [], ente: {} };
  const k = geo.pezzi.find(z => z.k).k, svg = ES.tavola.taglio(pr, null, k);
  assert.ok(svg.startsWith('<svg') && svg.includes('Mappale ' + k.split('|')[1]) && /scala 1:\d+/.test(svg));
  assert.ok(/\d,\d\d<\/text>/.test(svg), 'quote dei lati nel taglio');
});

test('area d\'intervento più grande della superficie catastale: segnalata, e l\'operatore sceglie', () => {
  const S = { '1|5': { espr: 150, servop: 0, serv: 60, occ: 0, graf: 200 } };
  const x = { fg: '1', map: '5', sub: '', sup: 200, man: {} };
  let a = ES.analisi.aree(x, S, {});
  assert.strictEqual(a.eccede, 10);
  x.limite = 'catasto'; a = ES.analisi.aree(x, S, {});
  assert.strictEqual(a.espr + a.serv, 200); assert.ok(a.espr > a.serv);
  x.limite = 'disegno'; a = ES.analisi.aree(x, S, {});
  assert.strictEqual(a.espr + a.serv, 210);
});

test('DXF della planimetria ricostruita: si reimporta con le stesse superfici e i fogli corretti', () => {
  const pr = pratica();
  // particella spostata su un altro foglio (correzione dell'operatore) prima dell'esportazione
  pr.geo.part.filter(q => q.k === '1|100').forEach(q => { q.fg = '22'; q.k = '22|100'; });
  pr.geo.pezzi.filter(z => z.k === '1|100').forEach(z => { z.fg = '22'; z.k = '22|100'; });
  const S0 = ES.analisi.superfici(pr.geo);
  const r = ES.analisi.esportaDxf(pr.geo);
  const dxf = ES.dxf.leggi(r.dxf);
  assert.ok(dxf.layers.PARTICELLE && dxf.layers.ESPROPRIO && dxf.layers.PARTICELLE_NUMERI);
  const g2 = ES.analisi.importaDxf(dxf, { fg: '1' });
  const S1 = ES.analisi.superfici(g2);
  for (const k of Object.keys(S0)) for (const t of ['espr', 'servop', 'serv', 'occ']) {
    assert.ok(Math.abs((S0[k][t] || 0) - ((S1[k] || {})[t] || 0)) < 0.5, `${k} ${t}: ${S0[k][t]} → ${(S1[k] || {})[t]}`);
  }
  assert.ok(S1['22|100'] && !S1['1|100']);
});

test('Mother File System: esporta, rilegge senza modifiche, accetta una correzione e rifiuta i file manomessi', async () => {
  const pr = pratica(); pr.id = 'pr1'; pr.campi = []; pr.dati = {};
  pr.ditte.forEach(d => { d.ev = d.ev || {}; });
  const MF = ES.mother;
  const leggi = async fogli => ES.tab.xlsx(ES.office.xlsx(fogli).buffer);
  const F = MF.esporta(pr);
  // rilettura identica: nessuna modifica
  let r = MF.leggi(pr, await leggi(F));
  assert.ok(r.ok, r.errori.join('\n')); assert.strictEqual(r.modifiche.length, 0, JSON.stringify(r.modifiche.slice(0, 3).map(m => [m.foglio, m.campo, m.prima, m.dopo])));
  // correzione di un codice fiscale, di una data dell'iter e di una superficie di progetto
  const G = JSON.parse(JSON.stringify(F));
  const fi = G.find(f => f.nome === 'INTESTATARI'), cCf = fi.righe[0].indexOf('CODICE FISCALE / P.IVA'); fi.righe[1][cCf] = 'rssmra80a01h501u';
  const fp = G.find(f => f.nome === 'PARTICELLE'), cE = fp.righe[0].indexOf('ESPROPRIO MQ'); fp.righe[1][cE] = 999;
  const ft = G.find(f => f.nome === 'ITER'), cD = ft.righe[0].indexOf('DATA'); ft.righe[1][cD] = '05/03/2026';
  r = MF.leggi(pr, await leggi(G));
  assert.ok(r.ok, r.errori.join('\n')); assert.strictEqual(r.modifiche.length, 3);
  r.modifiche.forEach(m => m.applica());
  assert.strictEqual(pr.ditte[0].intest[0].cf, 'RSSMRA80A01H501U');
  assert.strictEqual(pr.particelle[0].man.espr, 999);
  assert.ok(Object.values(pr.ditte[0].ev).some(e => e.data === '2026-03-05'));
  // riga aggiunta, intestazione cambiata, valore non valido, pratica sbagliata: rifiutati
  const H = JSON.parse(JSON.stringify(MF.esporta(pr)));
  H.find(f => f.nome === 'DITTE').righe.push(['nuova', '99']);
  assert.ok(!MF.leggi(pr, await leggi(H)).ok);
  const K = JSON.parse(JSON.stringify(MF.esporta(pr))); K.find(f => f.nome === 'PARTICELLE').righe[0][3] = 'Altro';
  assert.ok(!MF.leggi(pr, await leggi(K)).ok);
  const V = JSON.parse(JSON.stringify(MF.esporta(pr))); V.find(f => f.nome === 'PARTICELLE').righe[1][cE] = 'tanti';
  const rv = MF.leggi(pr, await leggi(V)); assert.ok(!rv.ok && /numero non valido/.test(rv.errori.join(' ')));
  const Z = JSON.parse(JSON.stringify(MF.esporta(pr))); Z[0].righe[3][1] = 'altra';
  assert.ok(/pratica/.test(MF.leggi(pr, await leggi(Z)).errori[0]));
  const O = JSON.parse(JSON.stringify(MF.esporta(pr))); const fo = O.find(f => f.nome === 'INTESTATARI'); [fo.righe[1], fo.righe[2]] = [fo.righe[2], fo.righe[1]];
  assert.ok(!MF.leggi(pr, await leggi(O)).ok);
});
