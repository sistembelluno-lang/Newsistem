// POS delle imprese e verifiche di idoneità del CSE (art. 92 c. 1 lett. b).

import { CONTENUTI_POS } from './normativa.js';
import { confronta } from '../core/date.js';
import { nuovaVerificaPos } from '../core/modelli.js';

/** Verifica nuova con la lista di controllo dell'Allegato XV 3.2.1. */
export function nuovaVerifica(impresaId, posId) {
  return nuovaVerificaPos({
    impresa: impresaId,
    pos: posId,
    voci: CONTENUTI_POS.map((c) => ({ codice: c.codice, esito: '', note: '' })),
  });
}

/**
 * Esito proposto dalla lista di controllo (il CSE può cambiarlo):
 * - una voce mancante -> non idoneo
 * - una voce incompleta -> idoneo con prescrizioni
 * - tutto presente o non pertinente -> idoneo
 * - voci non ancora compilate -> '' (verifica da completare)
 */
export function esitoProposto(voci) {
  if (!voci?.length || voci.some((v) => !v.esito)) return '';
  if (voci.some((v) => v.esito === 'no')) return 'non_idoneo';
  if (voci.some((v) => v.esito === 'parziale')) return 'idoneo_con_prescrizioni';
  return 'idoneo';
}

/** Testo delle prescrizioni proposto dalle voci incomplete o mancanti. */
export function prescrizioniProposte(voci) {
  const testo = new Map(CONTENUTI_POS.map((c) => [c.codice, c.testo]));
  return voci
    .filter((v) => v.esito === 'no' || v.esito === 'parziale')
    .map((v) => `- ${v.esito === 'no' ? 'Integrare' : 'Completare'}: ${testo.get(v.codice) || v.codice}${v.note ? ` (${v.note})` : ''}`)
    .join('\n');
}

/**
 * Situazione dei POS per impresa: l'ultima revisione ricevuta e l'ultima
 * verifica. Un'impresa non può lavorare finché il suo POS non è idoneo.
 * @returns {Array<{ impresa, pos, verifica, puoLavorare: boolean, daFare: string }>}
 */
export function situazionePos(imprese, posTutti, verificheTutte) {
  return imprese.map((imp) => {
    const pos = posTutti.filter((p) => p.impresa === imp.id)
      .sort((a, b) => confronta(a.dataRicezione, b.dataRicezione) || confronta(a.creato, b.creato)).pop() || null;
    const verifica = pos
      ? verificheTutte.filter((v) => v.pos === pos.id).sort((a, b) => confronta(a.data, b.data) || confronta(a.creato, b.creato)).pop() || null
      : null;
    const esito = verifica?.esito || '';
    const puoLavorare = esito === 'idoneo' || esito === 'idoneo_con_prescrizioni';
    let daFare = '';
    if (!pos) daFare = 'Richiedere il POS';
    else if (!verifica || !esito) daFare = 'Verificare il POS';
    else if (esito === 'non_idoneo') daFare = 'Richiedere la revisione del POS';
    else if (verifica && !verifica.trasmessaIl) daFare = "Trasmettere l'esito della verifica all'impresa";
    return { impresa: imp, pos, verifica, puoLavorare, daFare };
  });
}
