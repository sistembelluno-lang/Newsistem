// Guida dei processi di ESPROPRI_SISTEM, generata dai dati del programma (percorsi, passi, termini, modelli):
// guida/Guida_Processi_Espropri.md e .html. Si rigenera con npm run build:espropri e si pubblica a ogni release.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
globalThis.polygonClipping = require('polygon-clipping');
for (const f of require('../espropri/src/ordine.json')) require('../espropri/src/' + f);
const ES = globalThis.ES, I = ES.iter, cat = ES.modelli.catalogo(), PROC = ES.stima.PROCEDURE;
const versione = require('../package.json').version;

const doc = k => cat[k] ? cat[k].nome : k;
const L = [];
const h = (n, t) => L.push('', '#'.repeat(n) + ' ' + t, '');
const p = t => L.push(t, '');
const ul = arr => { arr.forEach(x => L.push('- ' + x)); L.push(''); };
const tab = (head, rows) => { L.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'); rows.forEach(r => L.push('| ' + r.map(c => String(c).replace(/\|/g, '/')).join(' | ') + ' |')); L.push(''); };

L.push('# ESPROPRI_SISTEM – Guida dei processi', '', `Versione ${versione}. Guida generata dal programma: percorsi, passi, termini e documenti sono quelli che il programma usa. I termini sono promemoria del D.P.R. 327/2001 (TUES) e della L. 241/1990: vanno sempre verificati sul testo vigente e sugli atti della pratica.`);

h(2, '1. Il lavoro in breve');
ul([
  '**Nuova pratica** → dati dell\'ente, del progetto, del responsabile; **cartella di lavoro** (es. `L:\\…\\05-Espropri`): dentro il programma crea `ESPROPRI_SISTEM` con `00 GENERALE` e una cartella per ditta (`DITTA 1 COGNOME NOME`).',
  '**Importa** il disegno (DXF, DWG o tavola PDF) e l\'**Excel delle visure**: le ditte si formano dalle particelle con gli stessi intestatari e le stesse quote.',
  '**Piano particellare**: superfici per particella e per tipo (esproprio, servitù, occupazione); si correggono a mano quelle misurate.',
  '**Ditte e iter**: per ogni ditta intestatari, indirizzi di residenza, note, percorso della procedura e date dei passi.',
  '**Indennità**: valori unitari e criteri; quadro per ditta.',
  '**Documenti**: per ogni passo il documento generale (tutte le ditte, «stampa unione») e quello della singola ditta nella sua cartella; il testo base si modifica per tutte le pratiche o solo per quella aperta.',
  '**Scadenze**: termini calcolati dalle date registrate; **stati di consistenza** con foto e scansione firmata → PDF finale.'
]);

h(2, '2. Dal disegno alle ditte');
h(3, 'Disegno');
ul([
  '**DXF/DWG**: aree d\'intervento già tagliate sulle particelle con il numero dentro, oppure layer delle particelle + aree intere (il programma taglia da solo). Si sceglie l\'uso di ogni layer; le sovrapposizioni si tolgono per priorità esproprio > servitù ingombro opere > servitù fascia > occupazione.',
  '**Tavola PDF** (esportata dal CAD, non scansionata): lettura «a occhio» di legenda, simboli (colori, tratteggi), aree, confini, numeri di particella, scala e fogli. Si controllano tipo delle voci di legenda, colori non spiegati e scala (anche stimata dalle superfici catastali). Le superfici sono marcate «dal PDF – da verificare».',
  'Mappa catastale a immagine (numeri disegnati, non scritti): il programma legge i numeri con il riconoscimento dei caratteri (OCR) e da ogni numero ricostruisce la particella seguendo le linee della mappa, anche sotto le aree colorate. Il confronto con il PDF originale mostra sopra la tavola i contorni riconosciuti.',
  'Legende con i nomi delle ditte o colori senza legenda: si dice al programma il tipo di ogni colore. Se una campitura copre tutta la particella e dentro c\'è una fascia, di solito la campitura indica solo la particella interessata e l\'area è la fascia: il programma lo segnala.',
  'Scala: quella letta nel cartiglio si vede e si cambia prima della lettura; dopo l\'importazione si corregge dalla Tavola grafica (scala giusta, unità del DXF o taratura su una particella di superficie nota).',
  'Aree senza numero di particella: si assegnano a mano nella scheda Importa.'
]);

h(2, '2-bis. Tavola grafica e schemi delle ditte');
ul([
  '**Tavola generale** in scala vera (stampa al 100%): particelle con i numeri, aree con i retini, cerchietto della ditta con i richiami alle sue particelle, legenda, quadro d\'unione, elenco ditte, cartiglio; a scelta quote dei lati e superfici.',
  '**Estratto** di una ditta e **taglio** mappale per mappale con quote e superfici: sono lo **schema del piano particellare** allegato alla convocazione per lo stato di consistenza e allo stato di consistenza stesso (comandi [[planimetria]] e [[tagli]] nei modelli).',
  'Dalla scheda della ditta, **🗺️ Mostra aree** apre estratto e tagli da scorrere e li salva in PDF nella cartella della ditta.'
]);
h(3, 'Excel delle ditte');
ul([
  'Formato a blocchi del riepilogo visure (N., Ditta Catastale, Comune, Catasto, Foglio, Mappale, Qualità/Classe, Superficie, Rd, Ra) o una riga per particella.',
  'Ditta = stessi intestatari **e** stesse quote (ROSSI 500/1000 + VERDI 500/1000 ≠ ROSSI 100/1000 + VERDI 900/1000).',
  'Codice fiscale mancante o errato: la ditta si crea lo stesso e viene segnalata; il codice si inserisce nella scheda della ditta.',
  'Indirizzi di residenza: nella scheda della ditta o nella scheda Indirizzi (import/export Excel).'
]);

h(2, '3. Fasi della pratica (una data per pratica)');
p('Si registrano nella scheda Pratica; dalle date nascono i termini dello scadenzario.');
tab(['Fase', 'Articolo', 'Termini che ne derivano'], I.FASI.map(f => [f.nome, f.art || '—', f.t.length ? f.t.map(t => t.nome).join('; ') : '—']));

h(2, '4. Percorsi per ditta');
p('Ogni ditta segue il percorso della pratica o uno proprio (es. una ditta in cessione volontaria). Per ogni passo: documenti che il programma genera e termini per la ditta («dalla notifica» = dalla data di notifica registrata).');
const quando = {
  art20: 'procedura ordinaria: offerta e indennità provvisoria prima del decreto.',
  art22: 'urgenza (art. 22 c.2) o oltre 50 destinatari: decreto con indennità determinata in via urgente, poi condivisione entro 30 giorni dall\'immissione.',
  art22bis: 'avvio lavori urgente: occupazione d\'urgenza preordinata all\'esproprio, acconto 80% a chi condivide, decreto di esproprio entro il termine della DPU.',
  cessione: 'il proprietario accetta l\'indennità: atto di cessione volontaria al posto del decreto.',
  art42bis: 'opera già realizzata senza valido titolo espropriativo: acquisizione sanante con indennizzo (pregiudizio patrimoniale + 10% non patrimoniale + 5% annuo per l\'occupazione).',
  art49: 'aree che servono solo per il cantiere: occupazione temporanea non preordinata all\'esproprio e restituzione.'
};
Object.keys(I.PASSI).forEach(k => {
  h(3, (PROC[k] ? PROC[k].nome : k));
  if (quando[k]) p('Quando: ' + quando[k]);
  tab(['N.', 'Passo', 'Articolo', 'Documenti', 'Termini'], I.PASSI[k].map((s, i) => [i + 1, s.nome, s.art, s.modelli.map(doc).join('; ') || '—', s.t.map(t => t.nome).join('; ') || '—']));
});

h(2, '5. Documenti');
p('Per ogni documento il programma produce il file generale (tutte le ditte) in `00 GENERALE` e il file della ditta nella sua cartella, in Word e/o PDF; ogni documento prodotto compare nella scheda della ditta.');
const gruppi = {};
Object.entries(cat).forEach(([k, v]) => { (gruppi[v.fase || 'Altro'] = gruppi[v.fase || 'Altro'] || []).push(v); });
tab(['Fase', 'Documento', 'Riferimento'], [].concat(...Object.keys(gruppi).map(g => gruppi[g].map(v => [g, v.nome, v.art || '—']))));
ul([
  'Testo base: modificabile per tutte le pratiche (livello «base») o solo per la pratica aperta; si torna sempre all\'originale.',
  'Dati specifici della pratica (progetto approvato, premesse, visti, finanziamento…) e campi aggiunti: si inseriscono una volta e compaiono nei documenti.',
  'Modelli Word dello studio: si caricano con i segnaposto {{…}} o i campi unione.'
]);

h(2, '6. Stato di consistenza e immissione in possesso');
ul([
  'Si genera il verbale per la ditta, si stampa e si compila e firma sul posto.',
  'Si caricano le foto (con didascalia e particella) e la scansione PDF firmata: il programma crea il PDF finale con verbale firmato e pagine delle foto nella cartella della ditta.',
  'La data del verbale di immissione fa partire i termini «dall\'immissione» (condivisione dell\'indennità negli artt. 22 e 22-bis).'
]);

h(2, '6-bis. Ricerca sul web');
ul([
  'Per i casi difficili: una domanda in italiano (es. «cosa succede se la particella da espropriare è edificabile?»); il programma cerca in rete norme, sentenze e prassi e dà una risposta di sintesi con l\'elenco delle fonti da aprire e verificare. Usa il servizio Claude di Anthropic con una chiave API dell\'ufficio; non si inviano dati personali delle ditte. Non sostituisce il parere legale.'
]);

h(2, '7. Controlli prima dell\'invio');
ul([
  '**⚠️ Problemi da risolvere**: tutto quello che il programma non ha capito o che manca (dati dell\'ente, aree senza particella, particelle senza superfici o senza categoria di stima, codici fiscali, quote, indirizzi, termini scaduti), con il collegamento alla schermata dove si corregge; l\'elenco si esporta in Excel.',
  '**Area d\'intervento più grande della superficie catastale** (es. 210 mq su una particella di 200 mq, per gli errori della mappa): il programma lo segnala e l\'operatore sceglie, d\'accordo con la committenza, se usare la superficie catastale (le superfici dal disegno si riducono in proporzione) o tenere la misura.',
  'Banner dei controlli sulle ditte: codice fiscale mancante o errato, quote che non tornano o non indicate, indirizzo mancante.',
  'Particelle del disegno non presenti nell\'elenco ditte e particelle dell\'elenco senza superfici: segnalate nella scheda Importa.',
  'Scadenze: in rosso i termini scaduti, in arancio quelli entro 15 giorni.'
]);

const md = L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';

// Markdown → HTML (quello che usano le guide: titoli, paragrafi su più righe, elenchi puntati e numerati con righe
// di continuazione, tabelle, grassetto, corsivo, codice)
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,;:)]|$)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
const mdHtml = testo => {
  const R = testo.split('\n'); let out = '', i = 0;
  const vuota = r => !r.trim(), titolo = r => /^#{1,4} /.test(r), voce = r => /^(- |\d+\. )/.test(r), tabella = r => r.startsWith('|');
  while (i < R.length) {
    const r = R[i];
    if (vuota(r)) { i++; continue; }
    let m;
    if ((m = /^(#{1,4}) (.*)$/.exec(r))) { out += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>\n`; i++; continue; }
    if (tabella(r)) {
      const cel = x => x.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      out += '<table><thead><tr>' + cel(r).map(c => `<th>${inl(c)}</th>`).join('') + '</tr></thead><tbody>'; i += 2;
      while (i < R.length && tabella(R[i])) out += '<tr>' + cel(R[i++]).map(c => `<td>${inl(c)}</td>`).join('') + '</tr>';
      out += '</tbody></table>\n'; continue;
    }
    if (voce(r)) {
      const num = /^\d+\. /.test(r), tag = num ? 'ol' : 'ul'; out += `<${tag}>`;
      while (i < R.length && voce(R[i]) && /^\d+\. /.test(R[i]) === num) {
        let t = R[i++].replace(/^(- |\d+\. )/, '');
        while (i < R.length && /^\s+\S/.test(R[i]) && !voce(R[i].trim())) t += ' ' + R[i++].trim();
        out += `<li>${inl(t)}</li>`;
      }
      out += `</${tag}>\n`; continue;
    }
    let t = r; i++;
    while (i < R.length && !vuota(R[i]) && !titolo(R[i]) && !voce(R[i]) && !tabella(R[i])) t += ' ' + R[i++].trim();
    out += `<p>${inl(t)}</p>\n`;
  }
  return out;
};
const pagina = (titolo, corpo) => `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titolo)}</title>
<style>body{font:15px/1.5 Segoe UI,Arial,sans-serif;max-width:1000px;margin:24px auto;padding:0 16px;color:#1d2433;background:#fff}h1{color:#1e3a8a}h2{color:#1e3a8a;border-bottom:2px solid #c7d2fe;padding-bottom:4px;margin-top:32px}h3{margin-top:22px}
table{border-collapse:collapse;width:100%;margin:8px 0 16px;font-size:13.5px}th,td{border:1px solid #cbd5e1;padding:5px 8px;vertical-align:top;text-align:left}th{background:#eef2ff}code{background:#f1f5f9;padding:1px 4px;border-radius:3px}li{margin:3px 0}
@page{size:A4;margin:16mm 14mm}@media print{body{margin:0;max-width:none;font-size:11pt}h2,h3{break-after:avoid}tr,li{break-inside:avoid}thead{display:table-header-group}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
${corpo}</body></html>
`;
const dir = path.join(root, 'guida');
fs.writeFileSync(path.join(dir, 'Guida_Processi_Espropri.md'), md);
fs.writeFileSync(path.join(dir, 'Guida_Processi_Espropri.html'), pagina('ESPROPRI_SISTEM – Guida dei processi', mdHtml(md)));
// La guida della normativa (scritta a mano) esce anche in HTML
const norm = fs.readFileSync(path.join(dir, 'Normativa_Espropri.md'), 'utf8');
fs.writeFileSync(path.join(dir, 'Normativa_Espropri.html'), pagina('ESPROPRI_SISTEM – Normativa', mdHtml(norm)));
console.log('scritte le guide (processi e normativa)', versione);
