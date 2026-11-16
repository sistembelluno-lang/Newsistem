import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiExif } from '../www/js/servizi/exif.js';
import { dataDiScatto, nomeDaData, ordinaFoto, perGiorno, importaFoto } from '../www/js/servizi/foto.js';
import { layoutTimbro } from '../www/js/servizi/timbro.js';
import { Archivio } from '../www/js/core/archivio.js';
import { nuovoCantiere } from '../www/js/core/modelli.js';
import { discoInMemoria } from '../www/js/piattaforme/memoria.js';
import { jpegConExif } from './aiuti.js';

test('EXIF: data di scatto originale, ordine Intel e Motorola', () => {
  for (const little of [true, false]) {
    const b = jpegConExif({ dataOriginale: '2026:11:16 10:32:05', data: '2026:11:20 08:00:00', orientamento: 6, little });
    const e = leggiExif(b);
    assert.equal(e.scattata, '2026-11-16T10:32:05', `little=${little}`);
    assert.equal(e.orientamento, 6);
  }
});

test('EXIF: senza data originale si usa DateTime; dati assenti o non JPEG', () => {
  assert.equal(leggiExif(jpegConExif({ data: '2025:03:01 07:15:00' })).scattata, '2025-03-01T07:15:00');
  assert.equal(leggiExif(jpegConExif({ dataOriginale: '0000:00:00 00:00:00' })).scattata, null);
  assert.equal(leggiExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47])).scattata, null);
  assert.equal(leggiExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])).scattata, null);
});

test('data di scatto: EXIF, poi data del file', () => {
  assert.deepEqual(dataDiScatto(jpegConExif({ dataOriginale: '2026:01:02 03:04:05' })).fonteData, 'exif');
  const d = dataDiScatto(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), new Date(2026, 4, 6, 7, 8, 9).getTime());
  assert.equal(d.scattata, '2026-05-06T07:08:09');
  assert.equal(d.fonteData, 'file');
});

test('foto ordinate per data di scatto e raggruppate per giorno', () => {
  const foto = [
    { id: 'c', scattata: '2026-11-16T15:00:00' },
    { id: 'a', scattata: '2026-11-15T09:00:00' },
    { id: 'b', scattata: '2026-11-16T08:30:00' },
  ];
  assert.deepEqual(ordinaFoto(foto).map((f) => f.id), ['a', 'b', 'c']);
  assert.deepEqual(ordinaFoto(foto, true).map((f) => f.id), ['c', 'b', 'a']);
  assert.deepEqual(perGiorno(foto).map((g) => [g.giorno, g.foto.map((f) => f.id)]),
    [['2026-11-15', ['a']], ['2026-11-16', ['b', 'c']]]);
  assert.equal(nomeDaData('2026-11-16T10:32:05'), '2026-11-16_10-32-05.jpg');
});

test('timbro: data in basso a destra, proporzionata alla foto', () => {
  const l = layoutTimbro(4000, 3000, '2026-11-16T10:32:05');
  assert.equal(l.testo, '16/11/2026 10:32');
  assert.ok(l.x < 4000 && l.x > 3800, 'vicino al bordo destro');
  assert.ok(l.y < 3000 && l.y > 2800, 'vicino al bordo inferiore');
  assert.ok(l.riquadro.x + l.riquadro.w <= 4000 && l.riquadro.y + l.riquadro.h <= 3000, 'dentro la foto');
  assert.ok(l.fontPx >= 90 && l.fontPx <= 120, 'leggibile su una foto da 12 Mpx');
  assert.equal(layoutTimbro(320, 240, '2026-11-16T10:32:05').fontPx, 14, 'minimo leggibile');
});

test('importazione: originale e timbrata con nome dalla data, scheda nel registro', async () => {
  const a = new Archivio(discoInMemoria());
  await a.creaCantiere(nuovoCantiere({ codice: 'C1', denominazione: 'Prova' }));
  const finto = async (byte) => ({ byte: new Uint8Array([...byte, 1]), larghezza: 10, altezza: 8 });
  const f1 = await importaFoto(a, 'C1', { nome: 'IMG_1.JPG', byte: jpegConExif({ dataOriginale: '2026:11:16 10:32:05' }) }, finto);
  const f2 = await importaFoto(a, 'C1', { nome: 'IMG_2.jpg', byte: jpegConExif({ dataOriginale: '2026:11:16 10:32:05' }) }, finto);
  assert.equal(f1.originale, '2026-11-16_10-32-05.jpg');
  assert.equal(f2.originale, '2026-11-16_10-32-05 (2).jpg', 'stessa data: non sovrascrive');
  assert.ok(await a.disco.esiste('CSE_SISTEM/C1/07_Registro_fotografico/timbrate/2026-11-16_10-32-05.jpg'));
  const schede = await a.registrazioni('C1', 'foto');
  assert.equal(schede.length, 2);
  assert.equal(schede[0].fonteData, 'exif');
});
