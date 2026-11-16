// Verbali di sopralluogo del CSE (art. 92 D.Lgs 81/08).

import { nuovoVerbale } from '../core/modelli.js';
import { CONTROLLI_SOPRALLUOGO } from './normativa.js';
import { confronta } from '../core/date.js';

/**
 * Nome del file del verbale: numero e identificativo. Due dispositivi che
 * creano un verbale prima che Google Drive li abbia sincronizzati non si
 * sovrascrivono (al massimo i numeri risultano doppi, vedi numeriDoppi).
 */
export function nomeFileVerbale(v) {
  return `Verbale ${String(v.numero).padStart(3, '0')}_${v.id}.json`;
}

/** Numeri usati da più di un verbale (da rinumerare prima di chiuderli). */
export function numeriDoppi(verbali) {
  const visti = new Map();
  for (const v of verbali) visti.set(v.numero, (visti.get(v.numero) || 0) + 1);
  return [...visti].filter(([, n]) => n > 1).map(([numero]) => numero).sort((a, b) => a - b);
}

/** Prossimo numero progressivo dei verbali del cantiere. */
export function prossimoNumero(verbali) {
  return verbali.reduce((m, v) => Math.max(m, Number(v.numero) || 0), 0) + 1;
}

/**
 * Verbale nuovo già precompilato: numero, imprese presenti (quelle con POS
 * idoneo, se passate), lista dei controlli e prescrizioni ancora aperte dei
 * verbali precedenti, da verificare in questo sopralluogo.
 */
export function nuovoVerbaleSopralluogo(verbaliPrecedenti, { imprese = [], controlli = CONTROLLI_SOPRALLUOGO } = {}) {
  const aperte = prescrizioniAperte(verbaliPrecedenti);
  return nuovoVerbale({
    numero: prossimoNumero(verbaliPrecedenti),
    impresePresenti: imprese.map((i) => i.id),
    verifiche: controlli.map((c) => ({ codice: c.codice, esito: 'nv', note: '' })),
    prescrizioniDaVerificare: aperte.map((p) => ({ ...p, esito: '' })),
  });
}

/** Prescrizioni dei verbali precedenti non ancora risolte. */
export function prescrizioniAperte(verbali) {
  const ordinati = [...verbali].sort((a, b) => confronta(a.data, b.data) || (a.numero - b.numero));
  const aperte = new Map();
  for (const v of ordinati) {
    for (const p of v.prescrizioni || []) {
      const chiave = p.id || `${v.numero}:${p.descrizione}`;
      aperte.set(chiave, { ...p, chiave, verbale: v.numero, data: v.data });
    }
    for (const r of v.prescrizioniDaVerificare || []) {
      if (r.esito === 'risolta') aperte.delete(r.chiave);
    }
  }
  return [...aperte.values()];
}

/** Un verbale chiuso (firmato) non si modifica: si fa un nuovo verbale. */
export function chiudi(verbale) {
  if (!verbale.numero) throw new Error('Il verbale non ha un numero');
  return { ...verbale, chiuso: true };
}

export function modificabile(verbale) {
  return !verbale.chiuso;
}
