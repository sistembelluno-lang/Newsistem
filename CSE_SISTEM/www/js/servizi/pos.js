// POS delle imprese e verifiche di idoneità del CSE (art. 92 c. 1 lett. b).

import { CHECKLIST_POS, CONTENUTI_POS } from './normativa.js';
import { confronta, dataIt } from '../core/date.js';
import { nuovaVerificaPos } from '../core/modelli.js';

const RUOLI = { affidataria: 'impresa affidataria', esecutrice: 'impresa esecutrice', subappaltatrice: 'subappaltatrice' };

/** POS di un'impresa, dal più vecchio al più recente. */
export function posInOrdine(posTutti, impresaId) {
  return posTutti.filter((p) => p.impresa === impresaId)
    .sort((a, b) => confronta(a.dataRicezione, b.dataRicezione) || confronta(a.creato, b.creato));
}

/** Ultima verifica di un POS (o null). */
export function verificaDelPos(verificheTutte, posId) {
  return verificheTutte.filter((v) => v.pos === posId)
    .sort((a, b) => confronta(a.data, b.data) || confronta(a.creato, b.creato)).pop() || null;
}

/** Voci vuote della check list; per chi non è affidataria le voci 26-28 sono «non previsto». */
export function vociVuote(impresa = null) {
  const affidataria = impresa?.ruolo === 'affidataria';
  return CHECKLIST_POS.map((c) => (c.affidataria && impresa && !affidataria
    ? { codice: c.codice, esito: 'np', note: 'Voce relativa all’affidataria.', nascosta: false }
    : { codice: c.codice, esito: '', note: '', nascosta: false }));
}

/**
 * Verifica nuova con la check list SISTEM. Se c'è la verifica di una
 * revisione precedente dello stesso POS si riparte da quella (voci, note,
 * integrazioni, lettera), così si aggiorna solo ciò che è cambiato.
 */
export function nuovaVerifica(impresaOId, posId, { precedente = null } = {}) {
  const impresa = typeof impresaOId === 'object' ? impresaOId : null;
  const v = nuovaVerificaPos({ impresa: impresa ? impresa.id : impresaOId, pos: posId, voci: vociVuote(impresa) });
  if (precedente?.lista === 'v2') {
    const vecchie = new Map(precedente.voci.map((x) => [x.codice, x]));
    v.voci = v.voci.map((x) => ({ ...x, ...(vecchie.get(x.codice) || {}) }));
    v.integrazioni = structuredClone(precedente.integrazioni || []);
    v.adeguati = [...(precedente.adeguati || [])];
    v.idoneitaTP = precedente.idoneitaTP || '';
    v.lettera = { ...v.lettera, ...structuredClone(precedente.lettera || {}), oggetto: '' };
    v.partitaDa = precedente.id;
  }
  return v;
}

/** Porta una verifica letta da disco alla check list attuale (voci nuove aggiunte, vecchie lasciate). */
export function completaVerifica(v, impresa = null) {
  const out = { ...nuovaVerificaPos(), ...structuredClone(v) };
  out.lettera = { ...nuovaVerificaPos().lettera, ...(v.lettera || {}) };
  if (v.lista !== 'v2') {
    // verifica fatta con la lista della versione 0.3: si passa alla check list nuova
    out.lista = 'v2';
    out.vecchieVoci = v.voci;
    out.voci = vociVuote(impresa);
    if (v.prescrizioni && !out.integrazioni.length) out.integrazioni = [{ titolo: 'Prescrizioni', testo: v.prescrizioni }];
  }
  const presenti = new Set(out.voci.map((x) => x.codice));
  for (const x of vociVuote(impresa)) if (!presenti.has(x.codice)) out.voci.push(x);
  const ordine = new Map(CHECKLIST_POS.map((c, i) => [c.codice, i]));
  out.voci.sort((a, b) => (ordine.get(a.codice) ?? 999) - (ordine.get(b.codice) ?? 999));
  return out;
}

/** Sezione della check list completa: nessuna voce vuota (le nascoste non contano). */
const completa = (voci, sezioni) => {
  const sez = new Map(CHECKLIST_POS.map((c) => [c.codice, c.sezione]));
  const qui = voci.filter((v) => !v.nascosta && sezioni.includes(sez.get(v.codice)));
  return { qui, compilata: qui.length > 0 && qui.every((v) => v.esito) };
};

/**
 * Esito proposto dalla check list (il CSE può cambiarlo):
 * - voci della sezione A (contenuti del POS) con «no» -> non idoneo, oppure
 *   idoneo con prescrizioni se le mancanze sono già tra le integrazioni con
 *   condizioni (si lascia scegliere al CSE: qui -> non idoneo)
 * - con integrazioni richieste -> idoneo con prescrizioni
 * - tutto «sì» o «non previsto» -> idoneo
 * - voci non ancora compilate -> '' (verifica da completare)
 * Per le verifiche della versione 0.3 (esiti si/parziale/no/nd) vale la regola di allora.
 */
export function esitoProposto(voci, integrazioni = []) {
  if (!voci?.length) return '';
  if (voci.some((v) => v.esito === 'parziale' || v.esito === 'nd')) {
    if (voci.some((v) => !v.esito)) return '';
    if (voci.some((v) => v.esito === 'no')) return 'non_idoneo';
    if (voci.some((v) => v.esito === 'parziale')) return 'idoneo_con_prescrizioni';
    return 'idoneo';
  }
  const a = completa(voci, ['A']);
  if (!a.compilata || !completa(voci, ['B', 'C']).compilata) return '';
  if (a.qui.some((v) => v.esito === 'no')) return 'non_idoneo';
  if (integrazioni.length || voci.some((v) => !v.nascosta && v.esito === 'no')) return 'idoneo_con_prescrizioni';
  return 'idoneo';
}

/** Idoneità tecnico-professionale proposta: sezione B senza «no». */
export function idoneitaProposta(voci) {
  const b = completa(voci, ['B']);
  if (!b.compilata) return '';
  return b.qui.some((v) => v.esito === 'no') ? 'no' : 'si';
}

/** Integrazioni proposte dalle voci con «no» (quando non si usa Claude). */
export function integrazioniProposte(voci) {
  const testo = new Map(CHECKLIST_POS.map((c) => [c.codice, c.testo]));
  return voci.filter((v) => !v.nascosta && v.esito === 'no').map((v) => ({
    titolo: testo.get(v.codice) || v.codice,
    testo: v.note || 'Trasmettere quanto mancante.',
  }));
}

/** Testo delle prescrizioni proposto dalle voci incomplete o mancanti (verifiche 0.3). */
export function prescrizioniProposte(voci) {
  const testo = new Map([...CONTENUTI_POS, ...CHECKLIST_POS].map((c) => [c.codice, c.testo]));
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
    const pos = posInOrdine(posTutti, imp.id).pop() || null;
    const verifica = pos ? verificaDelPos(verificheTutte, pos.id) : null;
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

// ------------------------------------------------------------ documenti esaminati

/**
 * Documenti da esaminare per la revisione `pos`: il file del POS, i suoi
 * allegati e quelli delle revisioni precedenti (attestati, DURC, ... restano
 * validi finché non scadono), più il PSC del cantiere se c'è.
 * Percorsi relativi alla cartella dei dati.
 * @returns {Array<{ percorso, titolo, tipo: 'pos'|'allegato'|'psc', scelto: boolean }>}
 */
export function documentiDaEsaminare({ cartellaPos, posImpresa, pos, psc = null, percorsoPsc = null }) {
  const out = [{ percorso: `${cartellaPos}/${pos.file}`, titolo: `POS rev. ${pos.revisione}${pos.dataPos ? ` del ${dataIt(pos.dataPos)}` : ''}`, tipo: 'pos', scelto: true }];
  const fino = posImpresa.indexOf(pos);
  const revisioni = fino >= 0 ? posImpresa.slice(0, fino + 1) : [pos];
  for (const r of [...revisioni].reverse()) {
    for (const a of r.allegati || []) {
      out.push({
        percorso: `${cartellaPos}/${a.file}`,
        titolo: `${a.titolo || a.file.split('/').pop()}${a.data ? ` (ricevuto il ${dataIt(a.data)})` : ''}${r.id !== pos.id ? ` – con la rev. ${r.revisione}` : ''}`,
        tipo: 'allegato',
        scelto: true,
      });
    }
  }
  if (psc && percorsoPsc) out.push({ percorso: percorsoPsc, titolo: `${/^PSC\b/i.test(psc.titolo) ? '' : 'PSC '}${psc.titolo}${psc.revisione ? ` rev. ${psc.revisione}` : ''}${psc.data ? ` del ${dataIt(psc.data)}` : ''}`, tipo: 'psc', scelto: true });
  return out;
}

/** Riga «Documentazione ditta» della check list: «X – POS rev. 00 del ... + attestati del ...». */
export function descriviDocumentazione(impresa, pos) {
  const allegati = (pos.allegati || []).map((a) => a.data).filter(Boolean).sort();
  const ultimi = allegati.length ? ` + allegati del ${dataIt(allegati.at(-1))}` : '';
  const lav = impresa.lavorazioni ? ` (${impresa.lavorazioni.split('\n')[0].slice(0, 80)})` : '';
  return `${impresa.ragioneSociale}${lav} – POS rev. ${pos.revisione}${pos.dataPos ? ` del ${dataIt(pos.dataPos)}` : ''}${ultimi}`;
}

// ------------------------------------------------------------ lettera

const riga = (...parti) => parti.filter(Boolean).join(' – ');

function rigaImpresa(i, imprese) {
  let ruolo = RUOLI[i.ruolo] || '';
  if (i.ruolo === 'subappaltatrice') {
    const aff = imprese.find((x) => x.id === i.affidataria);
    if (aff) ruolo = `subappaltatrice di ${aff.ragioneSociale}`;
  }
  if (i.tipoSoggetto === 'lavoratore_autonomo') ruolo = `lavoratore autonomo${ruolo ? `, ${ruolo}` : ''}`;
  return riga(`Spett.le ${i.ragioneSociale}${ruolo ? ` (${ruolo})` : ''}`, i.sede, i.pec ? `PEC ${i.pec}` : '', i.email);
}

function rigaPersona(titolo, p) {
  if (!p?.nome) return '';
  return riga(`${titolo} ${p.nome}`, p.pec ? `PEC ${p.pec}` : '', p.email);
}

/**
 * Lettera precompilata dai dati del cantiere: mittente (CSE), destinatari
 * (l'impresa, la sua affidataria e le affidatarie del cantiere), per
 * conoscenza committente, responsabile dei lavori e DL, oggetto.
 */
export function letteraProposta(cantiere, impresa, imprese, pos, { integrazioni = [] } = {}) {
  const cse = cantiere.cse || {};
  const destinatari = [impresa];
  const aff = imprese.find((x) => x.id === impresa.affidataria);
  if (aff) destinatari.push(aff);
  for (const i of imprese) if (i.ruolo === 'affidataria' && !destinatari.includes(i)) destinatari.push(i);
  const epc = [
    ...(cantiere.committenti || []).map((c) => rigaPersona('Committente', c)),
    rigaPersona('Responsabile dei lavori', cantiere.responsabileLavori),
    rigaPersona('Direttore dei Lavori', cantiere.direttoreLavori),
  ].filter(Boolean);
  const opera = [cantiere.denominazione, cantiere.comune ? `Comune di ${cantiere.comune}` : ''].filter(Boolean).join(' – ');
  return {
    mittente: riga(cse.nome ? `${cse.nome}${cse.qualifica ? `, ${cse.qualifica}` : ''}` : '', 'Coordinatore per la sicurezza in fase di esecuzione', cse.indirizzo, cse.pec ? `PEC ${cse.pec}` : ''),
    destinatari: destinatari.map((i) => rigaImpresa(i, imprese)).join('\n'),
    epc: epc.join('\n'),
    oggetto: `${opera}. Verifica di idoneità del Piano Operativo di Sicurezza dell’impresa ${impresa.ragioneSociale} (rev. ${pos.revisione}${pos.dataPos ? ` del ${dataIt(pos.dataPos)}` : ''})${integrazioni.length ? ' – richiesta di integrazioni' : ''}.`,
    luogo: (cse.indirizzo || '').match(/\d{5}\s+([^,(–-]+)/)?.[1]?.trim() || cantiere.comune || '',
  };
}

// ------------------------------------------------------------ risposta di Claude

/**
 * Applica alla verifica la proposta di Claude (servizi/claude.js): voci,
 * esito, integrazioni, testi della lettera. Le voci che il CSE ha nascosto
 * restano nascoste; il resto si può correggere dopo.
 */
export function applicaProposta(verifica, proposta, { modello = '', documenti = [] } = {}) {
  const v = structuredClone(verifica);
  const nuove = new Map((proposta.voci || []).map((x) => [x.codice, x]));
  v.voci = v.voci.map((x) => {
    const n = nuove.get(x.codice);
    return n ? { ...x, esito: n.esito || '', note: n.nota || '' } : x;
  });
  if (proposta.documentazione) v.documentazione = proposta.documentazione;
  v.idoneitaTP = proposta.idoneitaTP || v.idoneitaTP;
  v.esito = proposta.esito || v.esito;
  v.motivo = proposta.motivo || '';
  v.daIntegrare = proposta.daIntegrare || '';
  v.adeguati = proposta.adeguati || [];
  v.integrazioni = (proposta.integrazioni || []).map((i) => ({ titolo: i.titolo, testo: i.testo }));
  v.lettera = { ...v.lettera, esitoTesto: proposta.esitoTesto || v.lettera.esitoTesto, termini: proposta.termini || v.lettera.termini };
  v.avvisiAi = proposta.avvisi || [];
  v.ai = { modello, data: new Date().toISOString().slice(0, 10), documenti: documenti.map((d) => d.titolo) };
  return v;
}
