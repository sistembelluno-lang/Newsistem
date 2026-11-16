import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applicaProposta, completaVerifica, descriviDocumentazione, documentiDaEsaminare, esitoProposto, idoneitaProposta, integrazioniProposte,
  letteraProposta, nuovaVerifica, situazionePos,
} from '../www/js/servizi/pos.js';
import { controllaRisposta, richiestaVerifica } from '../www/js/servizi/claude.js';
import { prossimoNumero, nuovoVerbaleSopralluogo, prescrizioniAperte, chiudi, modificabile, controlliNascosti } from '../www/js/servizi/verbali.js';
import { nuovaVoce, ordinaVoci, voceDelGiorno, fotoDelGiorno } from '../www/js/servizi/giornale.js';
import { htmlChecklistPos, htmlLetteraPos, htmlVerbale, htmlVerificaPos } from '../www/js/servizi/stampa.js';
import { CHECKLIST_POS, CONTENUTI_POS, OBBLIGHI_CSE } from '../www/js/servizi/normativa.js';
import { nuovoCantiere, nuovaImpresa, nuovoPos, nuovaVoceGiornale } from '../www/js/core/modelli.js';
import { registra, moduliDelRuolo, _svuota } from '../www/js/core/registro.js';

test('normativa: contenuti minimi del POS (All. XV 3.2.1) e obblighi del CSE (art. 92)', () => {
  assert.deepEqual([...new Set(CONTENUTI_POS.map((c) => c.lettera))], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'l']);
  assert.equal(CONTENUTI_POS.filter((c) => c.lettera === 'a').length, 7);
  assert.deepEqual(OBBLIGHI_CSE.map((o) => o.codice.at(-1)), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('verifica POS: check list SISTEM ed esito proposto', () => {
  const imp = nuovaImpresa({ ragioneSociale: 'Trettel', ruolo: 'subappaltatrice' });
  const v = nuovaVerifica(imp, 'pos');
  assert.equal(v.lista, 'v2');
  assert.equal(v.voci.length, CHECKLIST_POS.length);
  assert.equal(CHECKLIST_POS.length, 38, '30 voci più le 8 sotto-voci dei nominativi');
  assert.deepEqual(v.voci.filter((x) => x.esito === 'np').map((x) => x.codice), ['26', '27', '28'], 'voci dell’affidataria: non previste');
  assert.equal(esitoProposto(v.voci), '', 'da completare');
  v.voci.forEach((x) => { if (!x.esito) x.esito = 'si'; });
  assert.equal(esitoProposto(v.voci), 'idoneo');
  assert.equal(idoneitaProposta(v.voci), 'si');
  v.voci.find((x) => x.codice === '19').esito = 'no'; // DURC
  assert.equal(idoneitaProposta(v.voci), 'no');
  assert.equal(esitoProposto(v.voci), 'idoneo_con_prescrizioni', 'mancanza nella sezione B: integrazione');
  v.voci.find((x) => x.codice === '9').esito = 'no'; // rumore
  assert.equal(esitoProposto(v.voci), 'non_idoneo', 'mancanza nei contenuti minimi del POS');
  // una voce nascosta non conta e non si stampa
  v.voci.find((x) => x.codice === '9').nascosta = true;
  assert.equal(esitoProposto(v.voci), 'idoneo_con_prescrizioni');
  v.voci.find((x) => x.codice === '19').note = 'Scaduto il 28/10/2026';
  assert.deepEqual(integrazioniProposte(v.voci), [{ titolo: 'DURC documento unico di regolarità contributiva', testo: 'Scaduto il 28/10/2026' }]);
  // l'impresa affidataria compila anche le voci 26-28
  assert.ok(nuovaVerifica(nuovaImpresa({ ruolo: 'affidataria' }), 'p').voci.every((x) => !x.esito));
});

test('verifica POS: la nuova revisione riparte dalla verifica precedente', () => {
  const imp = nuovaImpresa({ ragioneSociale: 'Ceconi', ruolo: 'esecutrice' });
  const prima = nuovaVerifica(imp, 'pos0');
  prima.voci[0] = { ...prima.voci[0], esito: 'si', note: 'ok' };
  prima.integrazioni = [{ titolo: 'DURC', testo: 'Trasmettere il DURC aggiornato' }];
  prima.lettera.destinatari = 'Spett.le Ceconi';
  const dopo = nuovaVerifica(imp, 'pos1', { precedente: prima });
  assert.equal(dopo.pos, 'pos1');
  assert.notEqual(dopo.id, prima.id);
  assert.equal(dopo.voci[0].note, 'ok');
  assert.deepEqual(dopo.integrazioni, prima.integrazioni);
  assert.notEqual(dopo.integrazioni, prima.integrazioni, 'copia, non lo stesso elenco');
  assert.equal(dopo.lettera.destinatari, 'Spett.le Ceconi');
  // una verifica della versione 0.3 passa alla check list nuova
  const vecchia = { tipo: 'verifica_pos', id: 'x', voci: [{ codice: 'a.1', esito: 'si' }], esito: 'idoneo', prescrizioni: '- Integrare: DURC' };
  const c = completaVerifica(vecchia, imp);
  assert.equal(c.lista, 'v2');
  assert.equal(c.voci.length, CHECKLIST_POS.length);
  assert.equal(c.integrazioni[0].testo, '- Integrare: DURC');
});

test('verifica POS: documenti da esaminare (POS, allegati di tutte le revisioni, PSC)', () => {
  const p0 = nuovoPos({ revisione: '0', file: 'POS rev0.pdf', allegati: [{ file: 'Allegati rev 0/DURC.pdf', titolo: 'DURC', data: '2026-10-19' }] });
  const p1 = nuovoPos({ revisione: '1', file: 'POS rev1.pdf', dataPos: '2026-11-09', allegati: [{ file: 'Allegati rev 1/attestati.pdf', titolo: 'attestati', data: '2026-11-09' }] });
  const docs = documentiDaEsaminare({ cartellaPos: 'X/POS', posImpresa: [p0, p1], pos: p1, psc: { titolo: 'PSC', revisione: '01', data: '2026-07-23' }, percorsoPsc: 'X/02_PSC/psc.pdf' });
  assert.deepEqual(docs.map((d) => [d.tipo, d.percorso]), [
    ['pos', 'X/POS/POS rev1.pdf'],
    ['allegato', 'X/POS/Allegati rev 1/attestati.pdf'],
    ['allegato', 'X/POS/Allegati rev 0/DURC.pdf'],
    ['psc', 'X/02_PSC/psc.pdf'],
  ]);
  assert.match(docs[2].titolo, /DURC \(ricevuto il 19\/10\/2026\) – con la rev\. 0/);
  // la revisione 0 non vede gli allegati della 1
  assert.equal(documentiDaEsaminare({ cartellaPos: 'X/POS', posImpresa: [p0, p1], pos: p0 }).length, 2);
  assert.equal(descriviDocumentazione(nuovaImpresa({ ragioneSociale: 'TRETTEL s.r.l.', lavorazioni: 'esbosco con gru a cavo' }), p1),
    'TRETTEL s.r.l. (esbosco con gru a cavo) – POS rev. 1 del 09/11/2026 + allegati del 09/11/2026');
});

test('lettera: destinatari, per conoscenza, oggetto dai dati del cantiere', () => {
  const cant = nuovoCantiere({
    denominazione: 'Variante pista Pian dei Nidi', comune: 'Sappada',
    cse: { nome: 'Dott. Ing. Omar Rech', indirizzo: 'Via Agordo 1, 32100 Belluno', pec: 'sistembl@pec.it' },
    responsabileLavori: { nome: 'ing. Claudio Degano', email: 'claudio.degano@regione.fvg.it' },
    direttoreLavori: { nome: 'ing. Monica Borsatto' },
  });
  const spiga = nuovaImpresa({ ragioneSociale: 'SPIGA S.r.l.', ruolo: 'affidataria', pec: 'spigasrl1@legalmail.it' });
  const trettel = nuovaImpresa({ ragioneSociale: 'TRETTEL srl', ruolo: 'subappaltatrice', affidataria: spiga.id, sede: 'Via Cavada 32/a – Tesero (TN)' });
  const l = letteraProposta(cant, trettel, [spiga, trettel], nuovoPos({ revisione: '00', dataPos: '2026-11-09' }), { integrazioni: [{}] });
  assert.deepEqual(l.destinatari.split('\n'), [
    'Spett.le TRETTEL srl (subappaltatrice di SPIGA S.r.l.) – Via Cavada 32/a – Tesero (TN)',
    'Spett.le SPIGA S.r.l. (impresa affidataria) – PEC spigasrl1@legalmail.it',
  ]);
  assert.match(l.epc, /Responsabile dei lavori ing\. Claudio Degano – claudio\.degano@regione\.fvg\.it\nDirettore dei Lavori ing\. Monica Borsatto/);
  assert.match(l.oggetto, /Sappada\. Verifica di idoneità del Piano Operativo di Sicurezza dell’impresa TRETTEL srl \(rev\. 00 del 09\/11\/2026\) – richiesta di integrazioni\./);
  assert.match(l.mittente, /Dott\. Ing\. Omar Rech – Coordinatore/);
  assert.equal(l.luogo, 'Belluno');
});

test('Claude: richiesta, schema della risposta e proposta applicata alla verifica', () => {
  const cant = nuovoCantiere({ codice: 'C', denominazione: 'Pista' });
  const imp = nuovaImpresa({ ragioneSociale: 'Trettel', ruolo: 'subappaltatrice' });
  const pos = nuovoPos({ impresa: imp.id, revisione: '00' });
  const v = nuovaVerifica(imp, pos.id);
  v.voci.find((x) => x.codice === '30').nascosta = true;
  const r = richiestaVerifica({ cantiere: cant, impresa: imp, imprese: [imp], pos, verifica: v, documenti: [{ percorso: 'a/POS.pdf', titolo: 'POS rev. 00' }] });
  assert.equal(r.modello, 'claude-opus-5-5');
  assert.deepEqual(r.documenti, [{ percorso: 'a/POS.pdf', titolo: 'POS rev. 00' }]);
  assert.match(r.testo, /1\. POS rev\. 00/);
  assert.ok(!r.testo.includes('"codice": "30"'), 'le voci nascoste non si chiedono');
  assert.match(r.testo, /ognuna delle 37 voci/);
  // schema: ogni oggetto chiuso e con tutti i campi obbligatori (requisito dell'output strutturato)
  const controlla = (o) => {
    if (o.type === 'object') {
      assert.equal(o.additionalProperties, false);
      assert.deepEqual([...o.required].sort(), Object.keys(o.properties).sort());
      Object.values(o.properties).forEach(controlla);
    }
    if (o.type === 'array') controlla(o.items);
  };
  controlla(r.schema);
  const risposta = controllaRisposta({
    documentazione: 'Trettel – POS rev. 00', voci: [{ codice: '19', esito: 'no', nota: 'DURC scaduto' }, { codice: '99', esito: 'si', nota: '' }],
    idoneitaTP: 'no', esito: 'idoneo_con_prescrizioni', motivo: '', daIntegrare: 'DURC', adeguati: ['dati dell’impresa;'],
    integrazioni: [{ titolo: 'DURC', testo: 'Trasmettere il DURC aggiornato.' }], esitoTesto: 'Il POS è idoneo con prescrizioni.', termini: 'Entro 7 giorni.', avvisi: ['pagina 12 illeggibile'],
  });
  assert.equal(risposta.voci.length, 1, 'codici sconosciuti scartati');
  const nv = applicaProposta(v, risposta, { modello: 'claude-opus-5-5', documenti: [{ titolo: 'POS rev. 00' }] });
  assert.equal(nv.voci.find((x) => x.codice === '19').note, 'DURC scaduto');
  assert.equal(nv.voci.find((x) => x.codice === '30').nascosta, true, 'resta nascosta');
  assert.equal(nv.esito, 'idoneo_con_prescrizioni');
  assert.equal(nv.lettera.termini, 'Entro 7 giorni.');
  assert.deepEqual(nv.ai.documenti, ['POS rev. 00']);
  assert.equal(v.esito, '', 'la verifica di partenza non cambia');
});

test('situazione dei POS: chi può lavorare e cosa resta da fare', () => {
  const a = nuovaImpresa({ ragioneSociale: 'A' });
  const b = nuovaImpresa({ ragioneSociale: 'B' });
  const c = nuovaImpresa({ ragioneSociale: 'C' });
  const posB = nuovoPos({ impresa: b.id, dataRicezione: '2026-11-01' });
  const posC = nuovoPos({ impresa: c.id, dataRicezione: '2026-11-02' });
  const verC = { ...nuovaVerifica(c.id, posC.id), esito: 'idoneo', data: '2026-11-03' };
  const s = situazionePos([a, b, c], [posB, posC], [verC]);
  assert.deepEqual(s.map((x) => [x.impresa.ragioneSociale, x.puoLavorare, x.daFare]), [
    ['A', false, 'Richiedere il POS'],
    ['B', false, 'Verificare il POS'],
    ['C', true, "Trasmettere l'esito della verifica all'impresa"],
  ]);
});

test('verbali: numerazione, controlli, prescrizioni aperte, chiusura', () => {
  assert.equal(prossimoNumero([]), 1);
  const v1 = { ...nuovoVerbaleSopralluogo([]), data: '2026-11-01', prescrizioni: [{ id: 'p1', descrizione: 'Parapetto al 2° solaio' }] };
  assert.equal(v1.numero, 1);
  assert.ok(v1.verifiche.length > 10);
  const v2 = nuovoVerbaleSopralluogo([v1]);
  assert.equal(v2.numero, 2);
  assert.equal(v2.prescrizioniDaVerificare.length, 1, 'la prescrizione del verbale 1 va verificata');
  v2.data = '2026-11-08';
  v2.prescrizioniDaVerificare[0].esito = 'risolta';
  assert.equal(prescrizioniAperte([v1, v2]).length, 0);
  assert.ok(!modificabile(chiudi(v2)));
});

test('giornale: una voce per giorno, imprese riprese dal giorno prima, foto del giorno', () => {
  const ieri = nuovaVoceGiornale({ data: '2026-11-15', imprese: [{ impresa: 'x', addetti: 3, lavorazioni: 'getti' }] });
  const v = nuovaVoce([ieri], '2026-11-16');
  assert.deepEqual(v.imprese, [{ impresa: 'x', addetti: 3, lavorazioni: '' }]);
  assert.throws(() => nuovaVoce([ieri], '2026-11-15'), /Esiste già/);
  assert.equal(voceDelGiorno([ieri, v], '2026-11-16'), v);
  assert.deepEqual(ordinaVoci([ieri, v]).map((x) => x.data), ['2026-11-16', '2026-11-15']);
  assert.deepEqual(fotoDelGiorno([{ id: 'f1', scattata: '2026-11-16T09:00:00' }, { id: 'f2', scattata: '2026-11-15T09:00:00' }], '2026-11-16'), ['f1']);
});

test('stampe: verbale e verifica POS', () => {
  const cant = nuovoCantiere({ codice: 'C', denominazione: 'Scuola <media>', cse: { nome: 'Ing. Bianchi' } });
  const imp = nuovaImpresa({ ragioneSociale: 'Edil Rossi' });
  const verb = { ...nuovoVerbaleSopralluogo([], { imprese: [imp] }), sospensione: { lavorazioni: 'Ponteggio lato nord', motivo: 'Parapetti assenti', dal: '2026-11-16T10:00:00' } };
  const html = htmlVerbale(cant, verb, { imprese: [imp] });
  assert.match(html, /Verbale di sopralluogo n\. 1/);
  assert.match(html, /Scuola &lt;media&gt;/, 'testo protetto');
  assert.match(html, /Edil Rossi/);
  assert.match(html, /art\. 92 c\. 1 lett\. f/);
  const pos = nuovoPos({ impresa: imp.id, revisione: '1' });
  const ver = { ...nuovaVerifica(imp, pos.id), esito: 'idoneo' };
  assert.match(htmlVerificaPos(cant, imp, pos, ver), /POS idoneo \(art\. 92 c\. 1 lett\. b\)<\/td><td><span class="box">X<\/span>si/);
});

test('stampe: check list POS con note, voci nascoste e allegato delle integrazioni', () => {
  const cant = nuovoCantiere({ codice: 'C', denominazione: 'Variante pista Pian dei Nidi', cse: { nome: 'Ing. Omar Rech' } });
  const imp = nuovaImpresa({ ragioneSociale: 'TRETTEL s.r.l.' });
  const pos = nuovoPos({ revisione: '00', dataPos: '2026-11-09' });
  const v = { ...nuovaVerifica(imp, pos.id), data: '2026-11-13', esito: 'non_idoneo', motivo: 'manca la valutazione del rumore', idoneitaTP: 'no' };
  v.voci.find((x) => x.codice === '19').esito = 'si';
  v.voci.find((x) => x.codice === '19').note = 'Regolare, scadenza 11/02/2027.';
  v.voci.find((x) => x.codice === '24').nascosta = true;
  v.integrazioni = [{ titolo: 'Primo soccorso e antincendio', testo: 'Attestati scaduti.\n- trasmettere gli aggiornamenti\n- nel frattempo addetti dell’ATI' }];
  v.lettera.destinatari = 'Spett.le CECONI S.r.l. (impresa mandante)';
  v.lettera.epc = 'PROMOTURISMO FVG';
  const html = htmlChecklistPos(cant, imp, pos, v);
  assert.match(html, /<thead><tr><td><table class="testa"><tr><td><b>Lavori di:<\/b><\/td><td>Variante pista Pian dei Nidi/, 'testata ripetuta su ogni pagina');
  assert.match(html, /CSE:<\/b><\/td><td>ING\. OMAR RECH/);
  assert.match(html, /<p>e p\.c\. PROMOTURISMO FVG<\/p>/);
  assert.match(html, /DURC documento unico di regolarità contributiva \(LA\)<span class="rif">Rif\.: All\. XVII p\. 1 lett\. c\) e p\. 2 lett\. e\); art\. 90 c\. 9<\/span><span class="nota">▸ Regolare, scadenza 11\/02\/2027\.<\/span><\/td>\n<td class="x">X<\/td><td class="x"><\/td><td class="x"><\/td>/);
  assert.ok(!html.includes('Ponteggi: copia'), 'voce nascosta non stampata');
  assert.match(html, /<span class="box">X<\/span>no perché:<\/td><\/tr>\n<\/table>\n<div class="linea">manca la valutazione del rumore<\/div>/);
  assert.match(html, /ALLEGATO – INTEGRAZIONI ANCORA MANCANTI AL POS TRETTEL S\.R\.L\. \(aggiornato al 13\/11\/2026\)/);
  assert.match(html, /<li><b>Primo soccorso e antincendio:<\/b> <p>Attestati scaduti\.<\/p><ul><li>trasmettere gli aggiornamenti<\/li><li>nel frattempo addetti dell’ATI<\/li><\/ul><\/li>/);
  const lettera = htmlLetteraPos(cant, imp, pos, v);
  assert.match(lettera, /<h1>Richiesta integrazioni POS – TRETTEL s\.r\.l\.<\/h1>/);
  assert.match(lettera, /<p><b>Spett\.le<\/b> CECONI S\.r\.l\. \(impresa mandante\)<\/p>/);
  assert.match(lettera, /non può ancora essere accettato/);
  assert.match(lettera, /<h2>Integrazioni richieste<\/h2><ol><li><b>Primo soccorso e antincendio\.<\/b>/);
  assert.match(htmlLetteraPos(cant, imp, pos, { ...v, esito: 'idoneo', integrazioni: [] }), /<h1>Esito della verifica del POS – TRETTEL s\.r\.l\.<\/h1>[\s\S]*è stato verificato idoneo\./);
});

test('verbale: controlli nascosti non stampati e ripresi nel verbale dopo; foto in fondo', () => {
  const cant = nuovoCantiere({ codice: 'C', denominazione: 'X' });
  const v1 = { ...nuovoVerbaleSopralluogo([]), data: '2026-11-01' };
  v1.verifiche.find((x) => x.codice === 'S05').nascosta = true; // ponteggi: non ci sono
  const html = htmlVerbale(cant, v1);
  assert.ok(!html.includes('Ponteggi: montaggio conforme'), 'controllo nascosto non stampato');
  assert.match(html, /Recinzione, accessi e segnaletica/);
  assert.deepEqual([...controlliNascosti([v1])], ['S05']);
  const v2 = nuovoVerbaleSopralluogo([v1]);
  assert.equal(v2.verifiche.find((x) => x.codice === 'S05').nascosta, true, 'resta nascosto nel verbale nuovo');
  const conFoto = htmlVerbale(cant, v2, { foto: [{ src: 'data:image/jpeg;base64,AAA', scattata: '2026-11-08T10:15:00', didascalia: 'Parapetto <lato nord>' }] });
  assert.match(conFoto, /Documentazione fotografica[\s\S]*<img src="data:image\/jpeg;base64,AAA"[\s\S]*<b>Foto 1<\/b> – 08\/11\/2026 10:15<br>Parapetto &lt;lato nord&gt;/);
  assert.ok(conFoto.indexOf('Letto, confermato e sottoscritto') < conFoto.indexOf('Documentazione fotografica'), 'le foto dopo le firme');
  assert.ok(!htmlVerbale(cant, v2).includes('Documentazione fotografica'));
});

test('registro dei moduli: ruoli e ordine (pronto per la Direzione Lavori)', () => {
  _svuota();
  const disegna = async () => '';
  registra({ id: 'b', titolo: 'B', ruolo: 'cse', ordine: 20, disegna });
  registra({ id: 'a', titolo: 'A', ruolo: 'cse', ordine: 10, disegna });
  registra({ id: 'dl1', titolo: 'Contabilità', ruolo: 'dl', disegna });
  assert.deepEqual(moduliDelRuolo('cse').map((m) => m.id), ['a', 'b']);
  assert.deepEqual(moduliDelRuolo('dl').map((m) => m.id), ['dl1']);
  assert.throws(() => registra({ id: 'a', titolo: 'A', ruolo: 'cse', disegna }), /già registrato/);
  assert.throws(() => registra({ id: 'z', titolo: 'Z', ruolo: 'boh', disegna }), /Ruolo sconosciuto/);
});

test('verbali creati su due dispositivi: file diversi e numeri doppi segnalati', async () => {
  const { nomeFileVerbale, numeriDoppi } = await import('../www/js/servizi/verbali.js');
  const a = nuovoVerbaleSopralluogo([]);
  const b = nuovoVerbaleSopralluogo([]);
  assert.equal(a.numero, b.numero);
  assert.notEqual(nomeFileVerbale(a), nomeFileVerbale(b));
  assert.match(nomeFileVerbale(a), /^Verbale 001_/);
  assert.deepEqual(numeriDoppi([a, b, { numero: 2 }]), [1]);
});

test('verbale stampato: righe di firma per i presenti e per il CSE', () => {
  const cant = nuovoCantiere({ codice: 'C', denominazione: 'X', comune: 'Belluno', cse: { nome: 'Ing. Bianchi' } });
  const v = { ...nuovoVerbaleSopralluogo([]), presenti: [{ nome: 'Mario Rossi', qualifica: 'Capocantiere', impresa: 'Edil Rossi' }] };
  const html = htmlVerbale(cant, v);
  assert.match(html, /Letto, confermato e sottoscritto/);
  assert.match(html, /Mario Rossi<\/td><td>Capocantiere<\/td><td>Edil Rossi<\/td><td><\/td>/);
  assert.match(html, /Coordinatore per l'esecuzione<br>Ing\. Bianchi/);
  // senza presenti: righe vuote da compilare in cantiere
  assert.equal((htmlVerbale(cant, nuovoVerbaleSopralluogo([])).match(/<tr><td><\/td><td><\/td><td><\/td><td><\/td><\/tr>/g) || []).length, 5);
});

test('verbale stampato: esito delle prescrizioni dei verbali precedenti', () => {
  const cant = nuovoCantiere({ codice: 'C', denominazione: 'X' });
  const v1 = { ...nuovoVerbaleSopralluogo([]), data: '2026-11-01', prescrizioni: [{ id: 'p1', descrizione: 'Parapetto vano scala' }] };
  const v2 = nuovoVerbaleSopralluogo([v1]);
  v2.prescrizioniDaVerificare[0].esito = 'risolta';
  const html = htmlVerbale(cant, v2);
  assert.match(html, /Verifica delle prescrizioni dei verbali precedenti/);
  assert.match(html, /Parapetto vano scala<\/td><td>n\. 1<\/td><td>Risolta/);
});
