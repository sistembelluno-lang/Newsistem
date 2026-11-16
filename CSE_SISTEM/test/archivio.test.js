import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Archivio } from '../www/js/core/archivio.js';
import { nomeSicuro, cartelleIniziali } from '../www/js/core/cartelle.js';
import { nuovoCantiere, nuovaImpresa, nuovaVoceGiornale, aggiorna, controlla, VERSIONE_SCHEMA } from '../www/js/core/modelli.js';
import { daExif, dataIt, dataOraIt } from '../www/js/core/date.js';
import { nuovoId } from '../www/js/core/id.js';
import { discoInMemoria } from '../www/js/piattaforme/memoria.js';
import { caricaDocumento, elencoDocumenti } from '../www/js/servizi/documenti.js';

const nuovo = () => new Archivio(discoInMemoria());

test('nomi di file sicuri su Windows', () => {
  assert.equal(nomeSicuro('Rossi S.r.l. / Edile: "Nord"'), 'Rossi S.r.l. _ Edile_ _Nord_');
  assert.equal(nomeSicuro('Città  Società'), 'Citta Societa');
  assert.equal(nomeSicuro('  '), 'senza_nome');
  assert.equal(nomeSicuro('fine...'), 'fine');
});

test('date in italiano', () => {
  assert.equal(dataIt('2026-11-16'), '16/11/2026');
  assert.equal(dataOraIt('2026-11-16T10:32:05'), '16/11/2026 10:32');
  assert.equal(daExif('2026:11:16 10:32:05'), '2026-11-16T10:32:05');
  assert.equal(daExif('nessuna'), null);
});

test('identificativi diversi e ordinati nel tempo', () => {
  const t = new Date(2026, 10, 16);
  const a = nuovoId(t);
  const b = nuovoId(t);
  assert.notEqual(a, b);
  assert.ok(nuovoId(new Date(2027, 0, 1)) > a);
});

test('nuovo cantiere: cartelle del fascicolo e anagrafica', async () => {
  const a = nuovo();
  await a.creaCantiere(nuovoCantiere({ codice: '2026-015', denominazione: 'Scuola' }));
  for (const c of cartelleIniziali('2026-015')) assert.ok(await a.disco.esiste(c), c);
  assert.ok(await a.disco.esiste('CSE_SISTEM/2026-015/02_PSC'));
  const c = await a.leggiCantiere('2026-015');
  assert.equal(c.denominazione, 'Scuola');
  assert.equal(c.versione, VERSIONE_SCHEMA);
  await assert.rejects(a.creaCantiere(nuovoCantiere({ codice: '2026-015', denominazione: 'Doppio' })), /Esiste già/);
  assert.deepEqual((await a.elencoCantieri()).map((x) => x.codice), ['2026-015']);
});

test('controlli: campi obbligatori e schema più recente', async () => {
  assert.ok(controlla(nuovoCantiere({ codice: '', denominazione: 'X' })).length > 0);
  await assert.rejects(nuovo().creaCantiere(nuovoCantiere({ codice: 'C', denominazione: '' })), /obbligatorio/);
  assert.throws(() => aggiorna({ tipo: 'cantiere', versione: VERSIONE_SCHEMA + 1 }), /più recente/);
});

test('registrazioni: una per file, nome ricordato, campi "_" non salvati', async () => {
  const a = nuovo();
  await a.creaCantiere(nuovoCantiere({ codice: 'C', denominazione: 'X' }));
  const v = await a.salvaRegistrazione('C', 'giornale', nuovaVoceGiornale({ data: '2026-11-16' }), '2026-11-16_x.json');
  assert.equal(v._file, '2026-11-16_x.json');
  const lette = await a.registrazioni('C', 'giornale');
  assert.equal(lette.length, 1);
  const testo = await a.disco.leggiTesto('CSE_SISTEM/C/06_Giornale_lavori/2026-11-16_x.json');
  assert.ok(!testo.includes('_file'));
  await a.eliminaRegistrazione('C', 'giornale', lette[0]);
  assert.equal((await a.registrazioni('C', 'giornale')).length, 0);
});

test('file caricati: nessuna sovrascrittura', async () => {
  const a = nuovo();
  const c = 'CSE_SISTEM/C/01_Progetto';
  assert.equal(await a.salvaFile(c, 'Tav 01.PDF', new Uint8Array([1])), 'Tav 01.pdf');
  assert.equal(await a.salvaFile(c, 'Tav 01.pdf', new Uint8Array([2])), 'Tav 01 (2).pdf');
});

test('documenti e imprese', async () => {
  const a = nuovo();
  await a.creaCantiere(nuovoCantiere({ codice: 'C', denominazione: 'X' }));
  await caricaDocumento(a, 'C', 'psc', { nome: 'PSC.pdf', byte: new Uint8Array([1]) }, { revisione: '1', data: '2026-10-01' });
  await caricaDocumento(a, 'C', 'psc', { nome: 'PSC.pdf', byte: new Uint8Array([2]) }, { revisione: '2', data: '2026-11-01' });
  const docs = await elencoDocumenti(a, 'C', 'psc');
  assert.deepEqual(docs.map((d) => d.revisione), ['2', '1'], 'dal più recente, le revisioni superate restano');
  await assert.rejects(caricaDocumento(a, 'C', 'giornale', { nome: 'x', byte: new Uint8Array() }), /non documentale/);

  await a.salvaImpresa('C', nuovaImpresa({ ragioneSociale: 'Edil Rossi S.r.l.' }));
  const imp = await a.elencoImprese('C');
  assert.equal(imp[0].ragioneSociale, 'Edil Rossi S.r.l.');
  assert.ok(await a.disco.esiste(a.cartellaPos('C', imp[0])));
});
