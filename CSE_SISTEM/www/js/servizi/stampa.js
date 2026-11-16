// Documenti stampabili (verbale di sopralluogo, verifica del POS, registro
// fotografico): si compone l'HTML qui, la piattaforma lo trasforma in PDF
// (Windows: Electron printToPDF; Android: stampa/condivisione di sistema).
// La grafica definitiva dei modelli verrà dopo: qui c'è la struttura.

import { dataIt, dataOraIt } from '../core/date.js';
import { CONTROLLI_SOPRALLUOGO, CONTENUTI_POS, ESITI_CONTROLLO, ESITI_VERIFICA_POS, ESITI_VOCE_POS, OBBLIGHI_CSE } from './normativa.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const persona = (p) => (p?.nome ? `${esc(p.nome)}${p.qualifica ? `, ${esc(p.qualifica)}` : ''}` : '—');

function pagina(titolo, corpo) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font: 10.5pt/1.4 Arial, sans-serif; color: #111; }
  h1 { font-size: 15pt; margin: 0 0 4mm; } h2 { font-size: 11.5pt; margin: 6mm 0 2mm; border-bottom: 1px solid #999; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #bbb; padding: 3px 5px; vertical-align: top; text-align: left; }
  th { background: #eee; } .intest td { border: none; padding: 1px 0; } .firme td { border: none; padding-top: 18mm; width: 50%; }
  .rif { color: #555; font-size: 9pt; }
  .blocco-firme { page-break-inside: avoid; break-inside: avoid; }
  .righe-firma td { height: 11mm; }
  tr { page-break-inside: avoid; }
</style></head><body>${corpo}</body></html>`;
}

function intestazione(cantiere) {
  return `<table class="intest">
<tr><td><b>Cantiere</b>: ${esc(cantiere.codice)} – ${esc(cantiere.denominazione)}</td></tr>
<tr><td><b>Indirizzo</b>: ${esc(cantiere.indirizzo)} ${esc(cantiere.comune)}</td></tr>
<tr><td><b>Committente</b>: ${(cantiere.committenti || []).map(persona).join('; ') || '—'}</td></tr>
<tr><td><b>CSE</b>: ${persona(cantiere.cse)} &nbsp; <b>Responsabile dei lavori</b>: ${persona(cantiere.responsabileLavori)}</td></tr>
</table>`;
}

/** HTML del verbale di sopralluogo. */
export function htmlVerbale(cantiere, verbale, { imprese = [], controlli = CONTROLLI_SOPRALLUOGO } = {}) {
  const nomeImpresa = (id) => esc(imprese.find((i) => i.id === id)?.ragioneSociale || id);
  const testoControllo = new Map(controlli.map((c) => [c.codice, c.testo]));
  const righe = (lista, f) => (lista?.length ? lista.map(f).join('') : '<tr><td colspan="9">Nessuna</td></tr>');
  const corpo = `
<h1>Verbale di sopralluogo n. ${esc(verbale.numero)} del ${dataIt(verbale.data)}</h1>
<p class="rif">Coordinatore per la sicurezza in fase di esecuzione – art. 92 D.Lgs 81/2008</p>
${intestazione(cantiere)}
<p>Sopralluogo dalle ore ${esc(verbale.oraInizio) || '—'} alle ore ${esc(verbale.oraFine) || '—'}.</p>
<h2>Presenti</h2>
<table><tr><th>Nome</th><th>Qualifica</th><th>Impresa</th></tr>
${righe(verbale.presenti, (p) => `<tr><td>${esc(p.nome)}</td><td>${esc(p.qualifica)}</td><td>${esc(p.impresa)}</td></tr>`)}</table>
<h2>Imprese presenti in cantiere</h2>
<p>${(verbale.impresePresenti || []).map(nomeImpresa).join(', ') || '—'}</p>
<h2>Lavorazioni in corso</h2><p>${esc(verbale.lavorazioniInCorso) || '—'}</p>
<h2>Verifiche effettuate</h2>
<table><tr><th>Controllo</th><th>Esito</th><th>Note</th></tr>
${righe(verbale.verifiche, (v) => `<tr><td>${esc(testoControllo.get(v.codice) || v.codice)}</td><td>${ESITI_CONTROLLO[v.esito] || ''}</td><td>${esc(v.note)}</td></tr>`)}</table>
${verbale.prescrizioniDaVerificare?.length ? `<h2>Verifica delle prescrizioni dei verbali precedenti</h2>
<table><tr><th>Prescrizione</th><th>Verbale</th><th>Esito</th></tr>
${verbale.prescrizioniDaVerificare.map((p) => `<tr><td>${esc(p.descrizione)}</td><td>n. ${esc(p.verbale)}</td><td>${{ risolta: 'Risolta', non_risolta: 'Non risolta' }[p.esito] || 'Non verificata'}</td></tr>`).join('')}</table>` : ''}
<h2>Non conformità rilevate</h2>
<table><tr><th>Descrizione</th><th>Impresa</th><th>Gravità</th></tr>
${righe(verbale.nonConformita, (n) => `<tr><td>${esc(n.descrizione)}</td><td>${nomeImpresa(n.impresa)}</td><td>${esc(n.gravita)}</td></tr>`)}</table>
<h2>Prescrizioni</h2>
<table><tr><th>Prescrizione</th><th>Impresa</th><th>Entro il</th></tr>
${righe(verbale.prescrizioni, (p) => `<tr><td>${esc(p.descrizione)}</td><td>${nomeImpresa(p.impresa)}</td><td>${dataIt(p.entro)}</td></tr>`)}</table>
${verbale.sospensione ? `<h2>Sospensione delle lavorazioni (art. 92 c. 1 lett. f)</h2>
<p>Lavorazioni sospese: ${esc(verbale.sospensione.lavorazioni)}<br>Motivo: ${esc(verbale.sospensione.motivo)}<br>Dal: ${dataOraIt(verbale.sospensione.dal)}</p>` : ''}
${verbale.segnalazioneCommittente ? `<p><b>Segnalazione al committente / responsabile dei lavori (art. 92 c. 1 lett. e)</b> delle inosservanze riscontrate.</p>` : ''}
${verbale.note ? `<h2>Note</h2><p>${esc(verbale.note)}</p>` : ''}
${firmeVerbale(cantiere, verbale)}`;
  return pagina(`Verbale ${verbale.numero}`, corpo);
}

/**
 * Firme del verbale, da apporre a mano sulla copia stampata: una riga per
 * ogni presente (con spazio sufficiente) e il CSE. Se l'elenco dei presenti è
 * vuoto si lasciano righe in bianco da compilare in cantiere.
 */
function firmeVerbale(cantiere, verbale) {
  const presenti = verbale.presenti?.length ? verbale.presenti : Array.from({ length: 5 }, () => ({}));
  return `<div class="blocco-firme">
<h2>Letto, confermato e sottoscritto</h2>
<p>${dataIt(verbale.data)}, ${esc(cantiere.comune) || '__________'}</p>
<table class="righe-firma"><tr><th style="width:30%">Nome e cognome</th><th style="width:20%">Qualifica</th><th style="width:20%">Impresa</th><th>Firma</th></tr>
${presenti.map((p) => `<tr><td>${esc(p.nome)}</td><td>${esc(p.qualifica)}</td><td>${esc(p.impresa)}</td><td></td></tr>`).join('')}
</table>
<table class="firme"><tr><td></td><td>Il Coordinatore per l'esecuzione<br>${persona(cantiere.cse)}<br><br>______________________________</td></tr></table>
</div>`;
}

/** HTML della verifica di idoneità del POS. */
export function htmlVerificaPos(cantiere, impresa, pos, verifica) {
  const voce = new Map((verifica.voci || []).map((v) => [v.codice, v]));
  const corpo = `
<h1>Verifica di idoneità del POS</h1>
<p class="rif">Art. 92 c. 1 lett. b D.Lgs 81/2008 – contenuti minimi Allegato XV punto 3.2.1</p>
${intestazione(cantiere)}
<p><b>Impresa</b>: ${esc(impresa.ragioneSociale)} &nbsp; <b>POS</b> rev. ${esc(pos.revisione)} del ${dataIt(pos.dataPos)}, ricevuto il ${dataIt(pos.dataRicezione)}</p>
<table><tr><th>Contenuto (All. XV 3.2.1)</th><th>Esito</th><th>Note</th></tr>
${CONTENUTI_POS.map((c) => `<tr><td>${esc(c.codice)}) ${esc(c.testo)}</td><td>${ESITI_VOCE_POS[voce.get(c.codice)?.esito] || ''}</td><td>${esc(voce.get(c.codice)?.note)}</td></tr>`).join('')}
</table>
<h2>Esito</h2><p><b>${ESITI_VERIFICA_POS[verifica.esito] || 'Da completare'}</b></p>
${verifica.prescrizioni ? `<h2>Prescrizioni</h2><p style="white-space:pre-line">${esc(verifica.prescrizioni)}</p>` : ''}
<table class="firme"><tr><td>Data: ${dataIt(verifica.data)}</td><td>Il Coordinatore per l'esecuzione<br>${persona(cantiere.cse)}</td></tr></table>`;
  return pagina(`Verifica POS ${impresa.ragioneSociale}`, corpo);
}

/** Testo degli obblighi del CSE, per l'intestazione dei verbali o la guida. */
export function elencoObblighi() {
  return OBBLIGHI_CSE.map((o) => `${o.codice}: ${o.testo}`).join('\n');
}
