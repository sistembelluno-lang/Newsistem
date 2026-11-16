// Documenti caricati: progetto, PSC, notifica preliminare, POS.
// Il file va nella cartella della sezione, la scheda (.json) accanto con lo
// stesso nome: "PSC rev 1.pdf" + "PSC rev 1.pdf.json".

import { cartellaSezione, percorso, SEZIONI_DOCUMENTI } from '../core/cartelle.js';
import { confronta } from '../core/date.js';
import { nuovoDocumento } from '../core/modelli.js';

/** Carica un file in una sezione documentale e ne scrive la scheda. */
export async function caricaDocumento(archivio, codice, sezione, file, scheda = {}) {
  if (!SEZIONI_DOCUMENTI.includes(sezione)) throw new Error(`Sezione non documentale: ${sezione}`);
  const cart = cartellaSezione(codice, sezione);
  const nome = await archivio.salvaFile(cart, file.nome, file.byte);
  const doc = nuovoDocumento({ sezione, titolo: nome.replace(/\.[^.]+$/, ''), ...scheda, file: nome });
  await archivio.scriviJson(percorso(cart, `${nome}.json`), doc);
  return doc;
}

/** Documenti di una sezione, dal più recente; le revisioni superate restano visibili. */
export async function elencoDocumenti(archivio, codice, sezione) {
  const docs = await archivio.leggiTutti(cartellaSezione(codice, sezione));
  return docs.filter((d) => d.tipo === 'documento')
    .sort((a, b) => confronta(b.data, a.data) || confronta(b.creato, a.creato));
}

/** Percorso del file di un documento (per aprirlo con il programma del sistema). */
export function percorsoDocumento(codice, doc) {
  return percorso(cartellaSezione(codice, doc.sezione), doc.file);
}
