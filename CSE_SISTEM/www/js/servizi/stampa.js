// Documenti stampabili (verbale di sopralluogo, verifica del POS, registro
// fotografico): si compone l'HTML qui, la piattaforma lo trasforma in PDF
// (Windows: Electron printToPDF; Android: stampa/condivisione di sistema).
// La grafica definitiva dei modelli verrà dopo: qui c'è la struttura.

import { dataIt, dataOraIt } from '../core/date.js';
import { tipoVerbale, titoloVerbale } from './verbali.js';
import {
  CHECKLIST_POS, CONTROLLI_SOPRALLUOGO, CONTENUTI_POS, ESITI_CONTROLLO, ESITI_VERIFICA_POS, ESITI_VOCE_POS, OBBLIGHI_CSE, SEZIONI_CHECKLIST,
} from './normativa.js';

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
  .note-v { margin-top: 6mm; font-size: 8.5pt; font-weight: bold; font-style: italic; }
  .note-v p { margin: 0 0 1mm; }
  .note-v .tit { text-align: center; text-decoration: underline; font-style: italic; font-size: 9.5pt; }
  tr { page-break-inside: avoid; }
  /* verbale: intestazione come una lettera, destinatari a sinistra e logo a destra */
  .tipo-v { margin: 0 0 3mm; } .box-v { display: inline-block; width: 3.5mm; height: 3.5mm; border: 1px solid #222; text-align: center; line-height: 3.5mm; font-size: 8.5pt; font-weight: bold; vertical-align: -0.6mm; }
  .testa-v { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; margin-bottom: 6mm; }
  .testa-v .dest { font-size: 9pt; line-height: 1.35; max-width: 58%; margin-left: auto; }
  .testa-v .dest p { margin: 0 0 1mm; }
  .testa-v .logo { width: 55mm; height: 24mm; display: flex; align-items: flex-start; justify-content: flex-start; flex: none; }
  .testa-v .logo img { max-width: 55mm; max-height: 24mm; object-fit: contain; }
  table.controlli td, table.controlli th { font-size: 8.5pt; padding: 2px 4px; }
  table.controlli .c { width: 40%; } table.controlli .e { width: 13%; white-space: nowrap; } table.controlli .n { width: 47%; font-size: 9.5pt; }
  /* foto: due per pagina, centrate */
  .foto-p { break-before: page; page-break-before: always; height: 262mm; display: flex; flex-direction: column; justify-content: space-around; align-items: center; }
  .foto-p h2 { align-self: stretch; margin-top: 0; }
  .foto-p figure { margin: 0; width: 100%; display: flex; flex-direction: column; align-items: center; break-inside: avoid; page-break-inside: avoid; }
  .foto-p img { max-width: 170mm; max-height: 105mm; object-fit: contain; display: block; }
  .foto-p figcaption { font-size: 9.5pt; margin-top: 2mm; text-align: center; max-width: 170mm; }
  .foto-p figure.doc img { border: 1px solid #888; box-shadow: 1.5mm 1.5mm 0 #ddd; max-height: 112mm; }
  .foto-p .senza { width: 80mm; height: 105mm; border: 1px dashed #888; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 9pt; color: #555; padding: 4mm; }
</style></head><body>${corpo}</body></html>`;
}

const responsabile = (c) => (c.responsabileLavoriNonNominato ? 'non nominato' : persona(c.responsabileLavori));

function intestazione(cantiere) {
  return `<table class="intest">
<tr><td><b>Cantiere</b>: ${esc(cantiere.codice)} – ${esc(cantiere.denominazione)}</td></tr>
<tr><td><b>Indirizzo</b>: ${esc(cantiere.indirizzo)} ${esc(cantiere.comune)}</td></tr>
<tr><td><b>Committente</b>: ${(cantiere.committenti || []).map(persona).join('; ') || '—'}</td></tr>
<tr><td><b>CSE</b>: ${persona(cantiere.cse)} &nbsp; <b>Responsabile dei lavori</b>: ${responsabile(cantiere)}</td></tr>
</table>`;
}

/** Testata del verbale: a sinistra lo spazio del logo, a destra «Spett.li» e i destinatari (come una lettera). */
function testaVerbale(verbale, logo) {
  const dest = String(verbale.destinatari || '').split('\n').map((x) => x.trim()).filter(Boolean);
  return `<div class="testa-v">
<div class="logo">${logo ? `<img src="${esc(logo)}" alt="">` : ''}</div>
<div class="dest">${dest.length ? `<p><b>Spett.li</b></p>${dest.map((d) => `<p>${esc(d)}</p>`).join('')}` : ''}</div>
</div>`;
}

/** HTML del verbale di sopralluogo. */
export function htmlVerbale(cantiere, verbale, { imprese = [], controlli = CONTROLLI_SOPRALLUOGO, foto = [], documenti = [], logo = '' } = {}) {
  const nomeImpresa = (id) => esc(imprese.find((i) => i.id === id)?.ragioneSociale || id);
  const testoControllo = new Map(controlli.map((c) => [c.codice, c.testo]));
  const righe = (lista, f) => (lista?.length ? lista.map(f).join('') : '<tr><td colspan="9">Nessuna</td></tr>');
  const tipo = tipoVerbale(verbale);
  const corpo = `
${testaVerbale(verbale, logo)}
<h1>${titoloVerbale(verbale)} n. ${esc(verbale.numero)} del ${dataIt(verbale.data)}</h1>
<p class="rif">Coordinatore per la sicurezza in fase di esecuzione – art. 92 D.Lgs 81/2008</p>
<p class="tipo-v"><span class="box-v">${tipo.sopralluogo ? 'X' : ''}</span> Sopralluogo <span class="rif">(art. 92 c. 1 lett. a)</span> &nbsp;&nbsp;&nbsp; <span class="box-v">${tipo.coordinamento ? 'X' : ''}</span> Coordinamento <span class="rif">(art. 92 c. 1 lett. c)</span></p>
${intestazione(cantiere)}
<p>Dalle ore ${esc(verbale.oraInizio) || '—'} alle ore ${esc(verbale.oraFine) || '—'}.</p>
<h2>Presenti</h2>
<table><tr><th>Nome</th><th>Qualifica</th><th>Impresa/Ente</th></tr>
${righe(verbale.presenti, (p) => `<tr><td>${esc(p.nome)}</td><td>${esc(p.qualifica)}</td><td>${esc(p.impresa)}</td></tr>`)}</table>
<h2>Imprese presenti in cantiere</h2>
<p>${(verbale.impresePresenti || []).map(nomeImpresa).join(', ') || '—'}</p>
<h2>Lavorazioni in corso</h2><p>${esc(verbale.lavorazioniInCorso) || '—'}</p>
${tipo.coordinamento ? `<h2>Coordinamento (art. 92 c. 1 lett. c)</h2>
<p style="white-space:pre-line">${esc(verbale.argomentiCoordinamento) || '—'}</p>` : ''}
${tipo.sopralluogo ? `<h2>Verifiche effettuate</h2>
<table class="controlli"><tr><th class="c">Controllo</th><th class="e">Esito</th><th class="n">Note</th></tr>
${righe((verbale.verifiche || []).filter((v) => !v.nascosta), (v) => `<tr><td class="c">${esc(testoControllo.get(v.codice) || v.codice)}</td><td class="e">${ESITI_CONTROLLO[v.esito] || ''}</td><td class="n">${esc(v.note)}</td></tr>`)}</table>` : ''}
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
${firmeVerbale(cantiere, verbale)}
${fotoVerbale(foto)}
${documentiVerbale(documenti)}`;
  return pagina(`${titoloVerbale(verbale)} ${verbale.numero}`, corpo);
}

/**
 * Documentazione fotografica del verbale: due foto per pagina, centrate, con numero,
 * data e ora di scatto (se non è nascosta: scattata vuota) e didascalia. foto: [{ src (data URL), scattata, didascalia, luogo }]
 */
function fotoVerbale(foto) {
  if (!foto?.length) return '';
  const figura = (f, i) => `<figure><img src="${esc(f.src)}" alt=""><figcaption>${[`<b>Foto ${i + 1}</b>`, f.scattata ? dataOraIt(f.scattata) : '', f.luogo ? esc(f.luogo) : ''].filter(Boolean).join(' – ')}${f.didascalia ? `<br>${esc(f.didascalia)}` : ''}</figcaption></figure>`;
  const pagine = [];
  for (let i = 0; i < foto.length; i += 2) pagine.push(foto.slice(i, i + 2));
  return pagine.map((coppia, k) => `<div class="foto-p">
${k === 0 ? '<h2>Documentazione fotografica</h2>' : ''}
${coppia.map((f, j) => figura(f, k * 2 + j)).join('\n')}
</div>`).join('\n');
}

/**
 * Documenti allegati al verbale: anteprima della prima pagina, due per
 * foglio, con titolo e dettagli. documenti: [{ src (data URL o ''), titolo, file, dettagli }]
 */
function documentiVerbale(documenti) {
  if (!documenti?.length) return '';
  const figura = (d, i) => `<figure class="doc">${d.src ? `<img src="${esc(d.src)}" alt="">` : `<div class="senza">Anteprima non disponibile<br>${esc(d.file)}</div>`}<figcaption><b>Allegato ${i + 1}</b> – ${esc(d.titolo)}${d.dettagli ? `<br>${esc(d.dettagli)}` : ''}</figcaption></figure>`;
  const pagine = [];
  for (let i = 0; i < documenti.length; i += 2) pagine.push(documenti.slice(i, i + 2));
  return pagine.map((coppia, k) => `<div class="foto-p">
${k === 0 ? '<h2>Documenti allegati</h2>' : ''}
${coppia.map((d, j) => figura(d, k * 2 + j)).join('\n')}
</div>`).join('\n');
}

/**
 * Firme del verbale, da apporre a mano sulla copia stampata: una riga per
 * ogni presente (con spazio sufficiente) e il CSE. Se l'elenco dei presenti è
 * vuoto si lasciano righe in bianco da compilare in cantiere.
 */
/** Note finali del verbale, sotto la firma del coordinatore. */
export const NOTE_VERBALE = 'Le imprese si impegnano a trasmettere copia del presente verbale al proprio rappresentante dei lavoratori per la sicurezza, se lo stesso è stato redatto ai sensi del D. Lgs. 81/2008 e s.m.i. In assenza di eventuali osservazioni e/o comunicazioni fatte pervenire al sottoscritto (Dl e/o Cse) entro 48 ore dal ricevimento del presente verbale, lo stesso si intende letto ed approvato.';

function firmeVerbale(cantiere, verbale) {
  // firmano solo i presenti con la spunta «Firma» (senza elenco: righe vuote da compilare in cantiere)
  const presenti = verbale.presenti?.length ? verbale.presenti.filter((p) => p.firma !== false) : Array.from({ length: 5 }, () => ({}));
  return `<div class="blocco-firme">
<h2>Letto, confermato e sottoscritto</h2>
<p>${dataIt(verbale.data)}, ${esc(cantiere.comune) || '__________'}</p>
${presenti.length ? `<table class="righe-firma"><tr><th style="width:30%">Nome e cognome</th><th style="width:20%">Qualifica</th><th style="width:20%">Impresa/Ente</th><th>Firma</th></tr>
${presenti.map((p) => `<tr><td>${esc(p.nome)}</td><td>${esc(p.qualifica)}</td><td>${esc(p.impresa)}</td><td></td></tr>`).join('')}
</table>` : ''}
<table class="firme"><tr><td></td><td>Il Coordinatore per l'esecuzione<br>${persona(cantiere.cse)}<br><br>______________________________</td></tr></table>
<div class="note-v"><p class="tit">NOTE:</p><p>${esc(NOTE_VERBALE)}</p></div>
</div>`;
}

/** HTML della verifica di idoneità del POS (check list SISTEM; per le verifiche della 0.3 la lista di allora). */
export function htmlVerificaPos(cantiere, impresa, pos, verifica) {
  if (verifica.lista === 'v2') return htmlChecklistPos(cantiere, impresa, pos, verifica);
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

// ------------------------------------------------------------ check list e lettera del POS

const righeTesto = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);

/** Testo con righe «- ...» trasformate in elenco puntato. */
function paragrafi(t) {
  const out = [];
  let elenco = [];
  const chiudi = () => { if (elenco.length) out.push(`<ul>${elenco.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`); elenco = []; };
  for (const r of righeTesto(t)) {
    if (/^[-•▸]\s+/.test(r)) elenco.push(r.replace(/^[-•▸]\s+/, ''));
    else { chiudi(); out.push(`<p>${esc(r)}</p>`); }
  }
  chiudi();
  return out.join('');
}

const STILE_POS = `
  @page { size: A4; margin: 12mm 14mm; }
  body { font: 9.5pt/1.35 Arial, sans-serif; color: #111; margin: 0; }
  table.pag { width: 100%; border-collapse: collapse; }
  table.pag > thead td { padding: 0 0 4mm; }
  .testa { border-bottom: 1.5px solid #222; padding-bottom: 2mm; font-size: 9pt; }
  .testa td { padding: 0 8px 0 0; vertical-align: top; border: none; }
  .dest { margin: 4mm 0 4mm 46%; font-size: 9pt; }
  .dest p { margin: 0 0 1.5mm; }
  h1 { font-size: 11pt; text-align: center; margin: 3mm 0 1mm; }
  .norma { text-align: center; font-size: 8.5pt; margin: 0 0 3mm; }
  table.cl { width: 100%; border-collapse: collapse; }
  table.cl td, table.cl th { border: 1px solid #777; padding: 2px 4px; vertical-align: top; }
  table.cl th { background: #e8e8e8; font-size: 8.5pt; }
  table.cl .n { width: 9mm; text-align: left; white-space: nowrap; }
  table.cl .x { width: 11mm; text-align: center; font-weight: bold; vertical-align: middle; }
  table.cl tr.sez td { background: #dfe7f5; font-weight: bold; font-size: 8.5pt; }
  table.cl tr.doc td { background: #f3f3f3; }
  table.cl tr { page-break-inside: avoid; break-inside: avoid; }
  .rif { color: #555; font-size: 7.5pt; display: block; }
  .nota { display: block; font-style: italic; margin-top: 1px; }
  .sotto { padding-left: 6mm; }
  .legenda { font-size: 7.5pt; color: #444; margin: 2mm 0 4mm; }
  table.esito { border-collapse: collapse; margin: 2mm 0; }
  table.esito td { padding: 2px 10px 2px 0; border: none; vertical-align: top; }
  .box { display: inline-block; width: 3.2mm; height: 3.2mm; border: 1px solid #222; text-align: center; line-height: 3.2mm; font-size: 8pt; font-weight: bold; margin-right: 1.5mm; vertical-align: -0.5mm; }
  .linea { border-bottom: 1px solid #444; min-height: 5mm; margin: 1mm 0 3mm; white-space: pre-line; }
  .firma { display: flex; justify-content: space-between; margin-top: 8mm; break-inside: avoid; page-break-inside: avoid; }
  .firma .cse { text-align: center; min-width: 70mm; }
  .firma .cse span { display: block; border-bottom: 1px solid #444; height: 12mm; }
  .chiusura { break-inside: avoid; page-break-inside: avoid; }
  .allegato { break-before: page; page-break-before: always; }
  .allegato h2, .lettera h2 { font-size: 10.5pt; margin: 4mm 0 2mm; }
  .allegato ol, .lettera ol { padding-left: 6mm; margin: 0; }
  .allegato li, .lettera li { margin-bottom: 2mm; }
  .allegato p, .lettera p { margin: 0 0 1.5mm; }
  ul { margin: 0.5mm 0 1.5mm; padding-left: 5mm; }
  .lettera { font-size: 10pt; line-height: 1.45; }
  .lettera .blocco p { margin: 0 0 1mm; }
  .lettera h1 { text-align: left; font-size: 12pt; }
`;

function paginaPos(titolo, testa, corpo) {
  // la testata sta nel <thead>: il browser la ripete su ogni pagina stampata
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title><style>${STILE_POS}</style></head>
<body><table class="pag"><thead><tr><td>${testa}</td></tr></thead><tbody><tr><td>${corpo}</td></tr></tbody></table></body></html>`;
}

function testaPos(cantiere) {
  return `<table class="testa"><tr><td><b>Lavori di:</b></td><td>${esc(cantiere.denominazione)}${cantiere.comune ? ` – ${esc(cantiere.comune)}` : ''}</td></tr>
<tr><td><b>CSE:</b></td><td>${esc((cantiere.cse?.nome || '').toUpperCase())}</td></tr></table>`;
}

const X = (cond) => (cond ? 'X' : '');
const box = (cond) => `<span class="box">${cond ? 'X' : ''}</span>`;

/**
 * Check list di verifica del POS e dell'idoneità tecnico-professionale
 * (modello SISTEM), con l'esito e l'allegato delle integrazioni mancanti.
 * Le voci nascoste non si stampano.
 */
export function htmlChecklistPos(cantiere, impresa, pos, verifica) {
  const voce = new Map((verifica.voci || []).map((v) => [v.codice, v]));
  const lettera = verifica.lettera || {};
  const destinatari = [...righeTesto(lettera.destinatari), ...righeTesto(lettera.epc).map((r, i) => (i === 0 && !/^e p\.?c\.?/i.test(r) ? `e p.c. ${r}` : r))];
  const righe = [];
  let sezione = '';
  for (const c of CHECKLIST_POS) {
    const v = voce.get(c.codice) || {};
    if (v.nascosta) continue;
    if (c.sezione !== sezione) {
      sezione = c.sezione;
      righe.push(`<tr class="sez"><td colspan="5">${esc(SEZIONI_CHECKLIST[sezione])}</td></tr>`);
    }
    righe.push(`<tr><td class="n">${esc(c.codice)}</td><td${c.sotto ? ' class="sotto"' : ''}>${c.sotto ? '- ' : ''}${esc(c.testo)}${c.la ? ' (LA)' : ''}${c.rif ? `<span class="rif">Rif.: ${esc(c.rif)}</span>` : ''}${v.note ? `<span class="nota">▸ ${esc(v.note)}</span>` : ''}</td>
<td class="x">${X(v.esito === 'si')}</td><td class="x">${X(v.esito === 'no')}</td><td class="x">${X(v.esito === 'np')}</td></tr>`);
  }
  const posOk = verifica.esito === 'idoneo' || verifica.esito === 'idoneo_con_prescrizioni';
  const posNo = verifica.esito === 'non_idoneo';
  const integrazioni = verifica.integrazioni || [];
  const corpo = `
${destinatari.length ? `<div class="dest">${destinatari.map((d) => `<p>${esc(d)}</p>`).join('')}</div>` : ''}
<h1>VERIFICA IDONEITA’ TECNICO PROFESSIONALE:<br>IMPRESE AFFIDATARIE, SUBAPPALTATRICI E SUBAFFIDATARIE CHE ESEGUONO LAVORI IN CANTIERE</h1>
<p class="norma">D.lgs. 9 aprile 2008 n. 81 “testo unico della tutela della salute e della sicurezza nei luoghi di lavoro”</p>
<table class="cl">
<thead><tr><th colspan="2" style="text-align:left">DOCUMENTAZIONE DITTA:</th><th class="x">SI</th><th class="x">NO</th><th class="x">NON PREVISTO</th></tr></thead>
<tbody>
<tr class="doc"><td colspan="5">${esc(verifica.documentazione || `${impresa.ragioneSociale} – POS rev. ${pos.revisione}${pos.dataPos ? ` del ${dataIt(pos.dataPos)}` : ''}`)}</td></tr>
${righe.join('\n')}
</tbody></table>
<p class="legenda">LA = richiesta anche ai lavoratori autonomi (All. XVII p. 2).</p>
<div class="chiusura">
<table class="esito">
<tr><td>Idoneità tecnico-professionale (All. XVII)</td><td>${box(verifica.idoneitaTP === 'si')}si</td><td>${box(verifica.idoneitaTP === 'no')}no</td></tr>
<tr><td>POS idoneo (art. 92 c. 1 lett. b)</td><td>${box(posOk)}si${verifica.esito === 'idoneo_con_prescrizioni' ? ' (con prescrizioni)' : ''}</td><td>${box(posNo)}no perché:</td></tr>
</table>
<div class="linea">${esc(posNo ? verifica.motivo : '')}</div>
<div>da integrare:</div>
<div class="linea">${esc(verifica.daIntegrare || (integrazioni.length ? 'vedi allegato' : ''))}</div>
<div class="firma"><div>Data ${dataIt(verifica.data)}</div><div class="cse">Il C.S.E. ${esc(cantiere.cse?.nome || '')}<span></span></div></div>
</div>
${integrazioni.length ? `<div class="allegato">
<h2>ALLEGATO – INTEGRAZIONI ANCORA MANCANTI AL POS ${esc(impresa.ragioneSociale.toUpperCase())} (aggiornato al ${dataIt(verifica.data)})</h2>
<ol>${integrazioni.map((i) => `<li><b>${esc(i.titolo)}:</b> ${paragrafi(i.testo)}</li>`).join('')}</ol>
<div class="firma"><div>Data ${dataIt(verifica.data)}</div><div class="cse">Il C.S.E. ${esc(cantiere.cse?.nome || '')}<span></span></div></div>
</div>` : ''}`;
  return paginaPos(`Check list POS ${impresa.ragioneSociale}`, testaPos(cantiere), corpo);
}

/**
 * Lettera all'impresa: richiesta di integrazioni (se ce ne sono) o
 * trasmissione dell'esito, con la check list in allegato.
 */
export function htmlLetteraPos(cantiere, impresa, pos, verifica) {
  const l = verifica.lettera || {};
  const integrazioni = verifica.integrazioni || [];
  const titolo = `${integrazioni.length ? 'Richiesta integrazioni POS' : 'Esito della verifica del POS'} – ${impresa.ragioneSociale}`;
  const esitoBase = {
    idoneo: `Il POS di ${impresa.ragioneSociale} (rev. ${pos.revisione}${pos.dataPos ? ` del ${dataIt(pos.dataPos)}` : ''}) è stato verificato idoneo.`,
    idoneo_con_prescrizioni: `Il POS di ${impresa.ragioneSociale} (rev. ${pos.revisione}${pos.dataPos ? ` del ${dataIt(pos.dataPos)}` : ''}) è stato verificato idoneo, con le prescrizioni e le integrazioni che seguono.`,
    non_idoneo: `Il POS di ${impresa.ragioneSociale} (rev. ${pos.revisione}${pos.dataPos ? ` del ${dataIt(pos.dataPos)}` : ''}) non può ancora essere accettato: risulta da integrare secondo l’elenco che segue.`,
  }[verifica.esito] || '';
  const corpo = `<div class="lettera">
<h1>${esc(titolo)}</h1>
<div class="blocco">
${l.mittente ? `<p><b>Mittente:</b> ${esc(l.mittente)}</p>` : ''}
${righeTesto(l.destinatari).map((d) => `<p>${/^spett/i.test(d) ? esc(d).replace(/^(Spett\.le)/i, '<b>$1</b>') : `<b>Spett.le</b> ${esc(d)}`}</p>`).join('')}
${righeTesto(l.epc).length ? `<p><b>E p.c.</b> ${righeTesto(l.epc).map(esc).join('; ')}</p>` : ''}
<p><b>Oggetto:</b> ${esc(l.oggetto)}</p>
</div>
<h2>Esito della verifica</h2>
${paragrafi(l.esitoTesto || esitoBase)}
<p>Il sottoscritto, in qualità di CSE, ha verificato il piano ai sensi dell’art. 92, c. 1, lett. b) del D.Lgs. 81/2008. Riferimenti della verifica: contenuti minimi dell’Allegato XV p. 3.2.1, Allegato XVII${verifica.ai?.documenti?.some((d) => /^PSC/.test(d)) ? ', prescrizioni del PSC' : ''}.</p>
${verifica.adeguati?.length ? `<p>Risultano adeguati:</p><ul>${verifica.adeguati.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
${integrazioni.length ? `<h2>Integrazioni richieste</h2><ol>${integrazioni.map((i) => `<li><b>${esc(i.titolo)}.</b> ${paragrafi(i.testo)}</li>`).join('')}</ol>` : ''}
${l.termini ? `<h2>Termini e modalità</h2>${paragrafi(l.termini)}` : ''}
<p>Si allega la check list di verifica compilata.</p>
<div class="chiusura">
<p>Restando a disposizione per eventuali chiarimenti, si porgono distinti saluti.</p>
<p>${esc(l.luogo || cantiere.comune || '')}${l.luogo || cantiere.comune ? ', ' : ''}${dataIt(verifica.data)}</p>
<div class="firma"><div></div><div class="cse">Il Coordinatore per la sicurezza in fase di esecuzione<br>${esc(cantiere.cse?.nome || '')}<span></span></div></div>
</div>
</div>`;
  return paginaPos(titolo, testaPos(cantiere), corpo);
}

/** Testo degli obblighi del CSE, per l'intestazione dei verbali o la guida. */
export function elencoObblighi() {
  return OBBLIGHI_CSE.map((o) => `${o.codice}: ${o.testo}`).join('\n');
}
