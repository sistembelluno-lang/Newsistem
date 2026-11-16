// Verifica del POS con il supporto di Claude.
//
// Qui si prepara la richiesta (istruzioni, dati del cantiere e dell'impresa,
// check list, schema della risposta); i documenti (PDF e immagini) li legge e
// li invia il programma su Windows (electron/claude.cjs). Claude propone gli
// esiti voce per voce, le note, le integrazioni e i testi della lettera: il
// CSE li controlla e li corregge prima di stampare e firmare.

import { CHECKLIST_POS, SEZIONI_CHECKLIST } from './normativa.js';
import { dataIt, oggi } from '../core/date.js';

export const MODELLO_CLAUDE = 'claude-opus-5-5';

/** Istruzioni fisse (uguali per ogni verifica). */
export const ISTRUZIONI = `Sei l'assistente di un Coordinatore per la sicurezza in fase di esecuzione (CSE) di uno studio di ingegneria italiano. Verifichi il Piano Operativo di Sicurezza (POS) di un'impresa e la sua idoneità tecnico-professionale, secondo il D.Lgs. 81/2008 Titolo IV (art. 89, 90 c. 9, 92 c. 1 lett. b, 96, 97, 101), l'Allegato XV punto 3.2.1, l'Allegato XVII e il PSC del cantiere quando è allegato.

Come lavori:
- Leggi tutti i documenti allegati: il POS, i suoi allegati (attestati di formazione, idoneità sanitarie, DURC, visura, DVR, dichiarazioni, patente a crediti, ...) e il PSC. Valuta ciò che c'è davvero, non ciò che l'indice promette.
- Compila ogni voce della check list con: «si» (presente e adeguato), «no» (mancante, scaduto o inadeguato), «np» (non previsto o non pertinente per questa impresa o lavorazione), oppure stringa vuota se non è possibile stabilirlo dai documenti.
- La nota di ogni voce è breve e concreta, nello stile del CSE: cosa hai trovato, con nomi, date e scadenze; cosa manca. Esempi di note: «Visura 15/09/2026, ATECO 02.20.00, 9 addetti.» · «Regolare, scadenza 11/02/2027.» · «Marco ed Erwin Trettel: corso 16 ore del 07/2021, aggiornamento triennale scaduto (07/2024).» · «Allegata solo la scheda S03 del DVR (06/03/2025). Manca il DVR o la dichiarazione.» · «Patente a crediti non prodotta.» Lascia la nota vuota quando la voce è semplicemente presente e non c'è niente da dire.
- Controlla le scadenze rispetto alla data della verifica e alla durata dei lavori: formazione (aggiornamenti quinquennali dei lavoratori, triennali per primo soccorso, antincendio secondo il livello), idoneità sanitarie, DURC (validità 120 giorni). Segnala ciò che scade durante i lavori.
- Confronta il POS con il PSC: lavorazioni previste dal PSC e non trattate dal POS, procedure complementari richieste dal PSC (art. 89 c. 1 lett. h; All. XV 3.2.1 lett. h), presidi di emergenza, numeri utili, riferimenti normativi abrogati (es. DPR 547/55, 164/56, 303/56).
- Le voci 26-28 riguardano solo l'impresa affidataria: per le altre imprese sono «np» con nota «Voce relativa all'affidataria.».
- Se la check list contiene già esiti e note di una verifica precedente, aggiornali con i documenti arrivati dopo: le integrazioni che risultano ancora mancanti restano, quelle soddisfatte si tolgono.
- Esito: «idoneo» se il POS è completo; «idoneo_con_prescrizioni» se si può accettare con condizioni o integrazioni non sostanziali; «non_idoneo» se mancano contenuti sostanziali (allora spiega il motivo in poche parole). Idoneità tecnico-professionale: «si» se la documentazione dell'Allegato XVII è completa e valida, altrimenti «no».
- Integrazioni: un elenco ordinato per importanza, ognuna con un titolo breve (es. «DURC», «Primo soccorso e antincendio», «Coordinamento con F.K. Legnami») e un testo che dice esattamente cosa trasmettere o fare, con il riferimento normativo o del PSC; quando la carenza si può gestire con condizioni (es. addetti dell'ATI in attesa degli attestati), scrivi le condizioni operative. Nel testo, se servono più punti, mettili su righe che iniziano con «- ».
- «adeguati»: 3-6 aspetti risultati adeguati, una riga ciascuno, in minuscolo e con «;» finale come in un elenco di una lettera.
- «esitoTesto»: una o due frasi per la lettera, es. «Il POS di X (rev. 00 del 19/10/2026) non può ancora essere accettato: risulta da integrare secondo l'elenco che segue.»
- «termini»: un paragrafo con i termini e le modalità di trasmissione (via PEC, prima dell'inizio dei lavori o entro una data) e cosa non si può avviare finché il POS non è integrato.
- «avvisi»: documenti illeggibili o non apribili, pagine mancanti, dubbi che il CSE deve controllare di persona.
- Scrivi in italiano tecnico, asciutto, senza inventare: se un dato non c'è nei documenti, dillo.`;

/** Schema JSON della risposta (output strutturato). */
export function schemaRisposta() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['documentazione', 'voci', 'idoneitaTP', 'esito', 'motivo', 'daIntegrare', 'adeguati', 'integrazioni', 'esitoTesto', 'termini', 'avvisi'],
    properties: {
      documentazione: { type: 'string', description: 'Impresa, lavorazione e documenti esaminati, es. «TRETTEL s.r.l. (esbosco con gru a cavo) – POS rev. 00 del 09/11/2026 + attestati del 09/11/2026»' },
      voci: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['codice', 'esito', 'nota'],
          properties: {
            codice: { type: 'string', enum: CHECKLIST_POS.map((c) => c.codice) },
            esito: { type: 'string', enum: ['si', 'no', 'np', ''] },
            nota: { type: 'string' },
          },
        },
      },
      idoneitaTP: { type: 'string', enum: ['si', 'no'] },
      esito: { type: 'string', enum: ['idoneo', 'idoneo_con_prescrizioni', 'non_idoneo'] },
      motivo: { type: 'string', description: 'Se non idoneo: perché, in una riga. Altrimenti vuoto.' },
      daIntegrare: { type: 'string', description: 'Riassunto in una o due righe di ciò che va integrato' },
      adeguati: { type: 'array', items: { type: 'string' } },
      integrazioni: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['titolo', 'testo'],
          properties: { titolo: { type: 'string' }, testo: { type: 'string' } },
        },
      },
      esitoTesto: { type: 'string' },
      termini: { type: 'string' },
      avvisi: { type: 'array', items: { type: 'string' } },
    },
  };
}

const persona = (p) => (p?.nome ? `${p.nome}${p.qualifica ? ` (${p.qualifica})` : ''}` : '—');

/**
 * Testo della richiesta: dati del cantiere e dell'impresa, documenti allegati,
 * check list con gli esiti già presenti, integrazioni già chieste.
 */
export function testoRichiesta({ cantiere, impresa, imprese = [], pos, verifica, documenti, verifichePrecedenti = [] }) {
  const nomi = new Map(imprese.map((i) => [i.id, i.ragioneSociale]));
  const voce = new Map((verifica?.voci || []).map((v) => [v.codice, v]));
  const lista = CHECKLIST_POS.filter((c) => !voce.get(c.codice)?.nascosta).map((c) => ({
    codice: c.codice,
    sezione: c.sezione,
    voce: c.testo,
    rif: c.rif,
    ...(c.la ? { richiestaAncheAiLavoratoriAutonomi: true } : {}),
    esitoAttuale: voce.get(c.codice)?.esito || '',
    notaAttuale: voce.get(c.codice)?.note || '',
  }));
  const precedenti = verifichePrecedenti.filter((x) => x.integrazioni?.length || x.prescrizioni).map((x) => ({
    data: dataIt(x.data), esito: x.esito, integrazioniRichieste: x.integrazioni?.length ? x.integrazioni : x.prescrizioni,
  }));
  return `Data della verifica: ${dataIt(verifica?.data || oggi())}

CANTIERE
- Opera: ${cantiere.denominazione}${cantiere.comune ? ` – ${cantiere.comune}` : ''}${cantiere.indirizzo ? ` (${cantiere.indirizzo})` : ''}
- Natura dell'opera: ${cantiere.naturaOpera || '—'}
- Committente: ${(cantiere.committenti || []).map(persona).join('; ') || '—'} · Responsabile dei lavori: ${persona(cantiere.responsabileLavori)} · DL: ${persona(cantiere.direttoreLavori)}
- CSE: ${persona(cantiere.cse)}
- Inizio lavori: ${dataIt(cantiere.inizioLavori) || '—'} · durata: ${cantiere.durataGiorni ? `${cantiere.durataGiorni} giorni` : '—'}
- Imprese del cantiere: ${imprese.map((i) => `${i.ragioneSociale} (${i.ruolo}${i.ruolo === 'subappaltatrice' && nomi.get(i.affidataria) ? ` di ${nomi.get(i.affidataria)}` : ''})`).join('; ') || '—'}

IMPRESA VERIFICATA
- ${impresa.ragioneSociale} – ${impresa.tipoSoggetto === 'lavoratore_autonomo' ? 'lavoratore autonomo' : 'impresa'}, ruolo: ${impresa.ruolo}${impresa.ruolo === 'subappaltatrice' && nomi.get(impresa.affidataria) ? ` (affidataria: ${nomi.get(impresa.affidataria)})` : ''}
- Lavorazioni affidate: ${impresa.lavorazioni || '—'}
- POS: revisione ${pos.revisione}${pos.dataPos ? ` del ${dataIt(pos.dataPos)}` : ''}, ricevuto il ${dataIt(pos.dataRicezione)}

DOCUMENTI ALLEGATI A QUESTA RICHIESTA (nell'ordine)
${documenti.map((d, i) => `${i + 1}. ${d.titolo}`).join('\n')}

CHECK LIST (sezioni: ${Object.entries(SEZIONI_CHECKLIST).map(([k, t]) => `${k} = ${t}`).join(' | ')})
${JSON.stringify(lista, null, 1)}
${precedenti.length ? `\nINTEGRAZIONI GIÀ RICHIESTE NELLE VERIFICHE PRECEDENTI\n${JSON.stringify(precedenti, null, 1)}\n` : ''}${verifica?.integrazioni?.length ? `\nINTEGRAZIONI DELLA VERIFICA ATTUALE (da aggiornare)\n${JSON.stringify(verifica.integrazioni, null, 1)}\n` : ''}
Compila la verifica secondo le istruzioni. Restituisci un esito per ognuna delle ${lista.length} voci della check list.`;
}

/** Richiesta completa da passare al programma su Windows (servizi.claudeVerifica). */
export function richiestaVerifica(dati) {
  return {
    modello: MODELLO_CLAUDE,
    istruzioni: ISTRUZIONI,
    testo: testoRichiesta(dati),
    schema: schemaRisposta(),
    documenti: dati.documenti.map((d) => ({ percorso: d.percorso, titolo: d.titolo })),
  };
}

/** Controlla la risposta (lo schema la garantisce, ma i file vecchi o le prove no). */
export function controllaRisposta(r) {
  if (!r || typeof r !== 'object') throw new Error('Risposta di Claude vuota');
  if (!Array.isArray(r.voci)) throw new Error('Risposta di Claude senza le voci della check list');
  const codici = new Set(CHECKLIST_POS.map((c) => c.codice));
  return { ...r, voci: r.voci.filter((v) => codici.has(v.codice)) };
}
