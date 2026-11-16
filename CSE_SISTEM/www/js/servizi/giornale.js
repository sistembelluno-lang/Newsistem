// Giornale dei lavori del CSE: una voce per ogni giorno di presenza.

import { confronta } from '../core/date.js';
import { nuovaVoceGiornale } from '../core/modelli.js';

/** Nome del file della voce: data davanti, così in cartella sono in ordine. */
export function nomeFileVoce(voce) {
  return `${voce.data}_${voce.id}.json`;
}

export function ordinaVoci(voci, piuRecentiPrima = true) {
  const out = [...voci].sort((a, b) => confronta(a.data, b.data) || confronta(a.creato, b.creato));
  return piuRecentiPrima ? out.reverse() : out;
}

/** La voce del giorno, se esiste già (una sola voce per giorno). */
export function voceDelGiorno(voci, data) {
  return voci.find((v) => v.data === data) || null;
}

/**
 * Voce nuova per la data indicata, con le imprese presenti nell'ultima voce
 * (in cantiere di solito sono le stesse del giorno prima).
 */
export function nuovaVoce(voci, data) {
  if (voceDelGiorno(voci, data)) throw new Error(`Esiste già una voce del giornale per il ${data}`);
  const ultima = ordinaVoci(voci.filter((v) => v.data < data))[0];
  return nuovaVoceGiornale({
    data,
    imprese: (ultima?.imprese || []).map((i) => ({ impresa: i.impresa, addetti: i.addetti, lavorazioni: '' })),
  });
}

/** Collega al giorno le foto scattate in quella data. */
export function fotoDelGiorno(foto, data) {
  return foto.filter((f) => String(f.scattata).startsWith(data)).map((f) => f.id);
}
