// Registro fotografico: importazione, data di scatto, timbro, ordinamento.
//
// Per ogni foto (scattata dal telefono o caricata dal PC):
//   1. si legge la data di scatto dai dati EXIF; se manca si usa la data del
//      file (e la scheda lo segnala: fonteData = 'file');
//   2. si salva l'originale in originali/ con un nome che parte dalla data
//      ("2026-11-16_10-32-05.jpg"), così anche in Esplora risorse le foto sono
//      in ordine cronologico;
//   3. si salva la copia con la data in basso a destra in timbrate/;
//   4. si scrive la scheda (.json) in schede/.

import { cartellaSezione, percorso } from '../core/cartelle.js';
import { isoLocale, confronta } from '../core/date.js';
import { nuovaFoto } from '../core/modelli.js';
import { leggiExif } from './exif.js';

/** Data di scatto: EXIF se c'è, altrimenti la data del file. */
export function dataDiScatto(byte, modificatoMs = null) {
  const exif = leggiExif(byte);
  if (exif.scattata) return { scattata: exif.scattata, fonteData: 'exif', orientamento: exif.orientamento || 1 };
  if (modificatoMs) return { scattata: isoLocale(new Date(modificatoMs)), fonteData: 'file', orientamento: exif.orientamento || 1 };
  return { scattata: isoLocale(), fonteData: 'manuale', orientamento: 1 };
}

/** Nome di file ordinabile dalla data: "AAAA-MM-GG_HH-MM-SS.jpg". */
export function nomeDaData(iso, estensione = '.jpg') {
  return `${String(iso).slice(0, 19).replace('T', '_').replace(/:/g, '-')}${estensione}`;
}

/** Ordina le foto per data di scatto (dalla più vecchia). */
export function ordinaFoto(foto, piuRecentiPrima = false) {
  const out = [...foto].sort((a, b) => confronta(a.scattata, b.scattata) || confronta(a.creato, b.creato));
  return piuRecentiPrima ? out.reverse() : out;
}

/** Raggruppa le foto per giorno di scatto: [{ giorno, foto: [...] }]. */
export function perGiorno(foto) {
  const gruppi = new Map();
  for (const f of ordinaFoto(foto)) {
    const g = String(f.scattata).slice(0, 10);
    if (!gruppi.has(g)) gruppi.set(g, []);
    gruppi.get(g).push(f);
  }
  return [...gruppi].map(([giorno, lista]) => ({ giorno, foto: lista }));
}

/**
 * Importa una foto nel registro del cantiere.
 * @param {import('../core/archivio.js').Archivio} archivio
 * @param {string} codice codice del cantiere
 * @param {{ nome: string, byte: Uint8Array, modificato?: number }} file
 * @param {(byte, iso) => Promise<{byte, larghezza, altezza}>} timbra funzione di timbratura (servizi/timbro.js)
 */
export async function importaFoto(archivio, codice, file, timbra, extra = {}) {
  const { scattata, fonteData } = dataDiScatto(file.byte, file.modificato);
  const cart = cartellaSezione(codice, 'foto');
  const est = (/\.[a-z0-9]+$/i.exec(file.nome)?.[0] || '.jpg').toLowerCase();
  const originale = await archivio.salvaFile(percorso(cart, 'originali'), nomeDaData(scattata, est), file.byte);
  const t = await timbra(file.byte, scattata);
  const timbrata = await archivio.salvaFile(percorso(cart, 'timbrate'), originale.replace(/\.[^.]+$/, '.jpg'), t.byte);
  const scheda = nuovaFoto({
    scattata, fonteData, originale, timbrata, larghezza: t.larghezza, altezza: t.altezza, nomeOriginale: file.nome, ...extra,
  });
  return archivio.salvaRegistrazione(codice, 'foto', scheda);
}
