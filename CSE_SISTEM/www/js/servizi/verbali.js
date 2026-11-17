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
export function nuovoVerbaleSopralluogo(verbaliPrecedenti, { imprese = [], controlli = CONTROLLI_SOPRALLUOGO, cantiere = null } = {}) {
  const aperte = prescrizioniAperte(verbaliPrecedenti);
  const nascoste = controlliNascosti(verbaliPrecedenti);
  return nuovoVerbale({
    numero: prossimoNumero(verbaliPrecedenti),
    impresePresenti: imprese.map((i) => i.id),
    destinatari: cantiere ? destinatariVerbale(cantiere, imprese) : '',
    verifiche: controlli.map((c) => ({ codice: c.codice, esito: '', note: '', nascosta: nascoste.has(c.codice) })),
    prescrizioniDaVerificare: aperte.map((p) => ({ ...p, esito: '' })),
  });
}

/**
 * Controlli nascosti nell'ultimo verbale: nel verbale nuovo restano nascosti
 * (sono i controlli che in questo cantiere non interessano).
 */
export function controlliNascosti(verbali) {
  const ultimo = [...verbali].sort((a, b) => confronta(a.data, b.data) || (a.numero - b.numero)).pop();
  return new Set((ultimo?.verifiche || []).filter((v) => v.nascosta).map((v) => v.codice));
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

/**
 * Tipo del verbale: sopralluogo, coordinamento o entrambi (un verbale senza
 * spunte vale come sopralluogo, come quelli delle versioni precedenti).
 */
export function tipoVerbale(v) {
  const coordinamento = !!v.coordinamento;
  const sopralluogo = v.sopralluogo !== false || !coordinamento;
  return { sopralluogo, coordinamento };
}

/** «Verbale di sopralluogo», «Verbale di coordinamento», «Verbale di sopralluogo e coordinamento». */
export function titoloVerbale(v) {
  const t = tipoVerbale(v);
  return `Verbale di ${[t.sopralluogo ? 'sopralluogo' : '', t.coordinamento ? 'coordinamento' : ''].filter(Boolean).join(' e ')}`;
}

/** Responsabile dei lavori per le stampe: nome, «non nominato» o vuoto. */
export function responsabileLavori(cantiere) {
  if (cantiere.responsabileLavoriNonNominato) return 'non nominato';
  const p = cantiere.responsabileLavori;
  return p?.nome ? `${p.nome}${p.qualifica ? `, ${p.qualifica}` : ''}` : '';
}

/**
 * Destinatari proposti per il verbale (come in una lettera): committente,
 * responsabile dei lavori (se nominato), direttore dei lavori, CSP e le
 * imprese presenti. Uno per riga; nel verbale si possono correggere.
 */
export function destinatariVerbale(cantiere, imprese = []) {
  const p = (titolo, x) => (x?.nome ? `${titolo} ${x.nome}${x.pec ? ` – PEC ${x.pec}` : x.email ? ` – ${x.email}` : ''}` : '');
  return [
    ...(cantiere.committenti || []).map((c) => p('Committente', c)),
    cantiere.responsabileLavoriNonNominato ? '' : p('Responsabile dei lavori', cantiere.responsabileLavori),
    p('Direttore dei lavori', cantiere.direttoreLavori),
    ...imprese.map((i) => `Impresa ${i.ragioneSociale}${i.pec ? ` – PEC ${i.pec}` : i.email ? ` – ${i.email}` : ''}`),
  ].filter(Boolean).join('\n');
}

/** Un verbale chiuso (firmato) non si modifica: si fa un nuovo verbale. */
export function chiudi(verbale) {
  if (!verbale.numero) throw new Error('Il verbale non ha un numero');
  return { ...verbale, chiuso: true };
}

export function modificabile(verbale) {
  return !verbale.chiuso;
}
