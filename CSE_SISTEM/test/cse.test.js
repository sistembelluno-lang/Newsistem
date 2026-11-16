import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuovaVerifica, esitoProposto, prescrizioniProposte, situazionePos } from '../www/js/servizi/pos.js';
import { prossimoNumero, nuovoVerbaleSopralluogo, prescrizioniAperte, chiudi, modificabile } from '../www/js/servizi/verbali.js';
import { nuovaVoce, ordinaVoci, voceDelGiorno, fotoDelGiorno } from '../www/js/servizi/giornale.js';
import { htmlVerbale, htmlVerificaPos } from '../www/js/servizi/stampa.js';
import { CONTENUTI_POS, OBBLIGHI_CSE } from '../www/js/servizi/normativa.js';
import { nuovoCantiere, nuovaImpresa, nuovoPos, nuovaVoceGiornale } from '../www/js/core/modelli.js';
import { registra, moduliDelRuolo, _svuota } from '../www/js/core/registro.js';

test('normativa: contenuti minimi del POS (All. XV 3.2.1) e obblighi del CSE (art. 92)', () => {
  assert.deepEqual([...new Set(CONTENUTI_POS.map((c) => c.lettera))], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'l']);
  assert.equal(CONTENUTI_POS.filter((c) => c.lettera === 'a').length, 7);
  assert.deepEqual(OBBLIGHI_CSE.map((o) => o.codice.at(-1)), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('verifica POS: lista di controllo ed esito proposto', () => {
  const v = nuovaVerifica('imp', 'pos');
  assert.equal(v.voci.length, CONTENUTI_POS.length);
  assert.equal(esitoProposto(v.voci), '', 'da completare');
  v.voci.forEach((x) => { x.esito = 'si'; });
  assert.equal(esitoProposto(v.voci), 'idoneo');
  v.voci[11].esito = 'parziale';
  assert.equal(esitoProposto(v.voci), 'idoneo_con_prescrizioni');
  v.voci[3].esito = 'no';
  assert.equal(esitoProposto(v.voci), 'non_idoneo');
  assert.match(prescrizioniProposte(v.voci), /Integrare: Nominativo del medico competente/);
  assert.match(prescrizioniProposte(v.voci), /Completare: Esito del rapporto di valutazione del rumore/);
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
  const ver = { ...nuovaVerifica(imp.id, pos.id), esito: 'idoneo' };
  assert.match(htmlVerificaPos(cant, imp, pos, ver), /Idoneo/);
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
