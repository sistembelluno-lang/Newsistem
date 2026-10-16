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
  'Aree senza numero di particella: si assegnano a mano nella scheda Importa.'
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

h(2, '7. Controlli prima dell\'invio');
ul([
  'Banner dei controlli sulle ditte: codice fiscale mancante o errato, quote che non tornano o non indicate, indirizzo mancante.',
  'Particelle del disegno non presenti nell\'elenco ditte e particelle dell\'elenco senza superfici: segnalate nella scheda Importa.',
  'Scadenze: in rosso i termini scaduti, in arancio quelli entro 15 giorni.'
]);

const md = L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';

// Markdown → HTML (solo quello che usa la guida: titoli, paragrafi, elenchi, tabelle, grassetto, codice)
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
let html = '', righe = md.split('\n');
for (let i = 0; i < righe.length; i++) {
  const r = righe[i];
  if (!r.trim()) continue;
  let m;
  if ((m = /^(#{1,3}) (.*)$/.exec(r))) { html += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>\n`; continue; }
  if (r.startsWith('- ')) { html += '<ul>'; while (i < righe.length && righe[i].startsWith('- ')) html += `<li>${inl(righe[i++].slice(2))}</li>`; i--; html += '</ul>\n'; continue; }
  if (r.startsWith('|')) {
    const cel = x => x.slice(1, -1).split(' | ').map(c => c.trim());
    html += '<table><thead><tr>' + cel(righe[i]).map(c => `<th>${inl(c)}</th>`).join('') + '</tr></thead><tbody>'; i += 2;
    while (i < righe.length && righe[i].startsWith('|')) html += '<tr>' + cel(righe[i++]).map(c => `<td>${inl(c)}</td>`).join('') + '</tr>'; i--;
    html += '</tbody></table>\n'; continue;
  }
  html += `<p>${inl(r)}</p>\n`;
}
const pagina = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESPROPRI_SISTEM – Guida dei processi</title>
<style>body{font:15px/1.5 Segoe UI,Arial,sans-serif;max-width:1000px;margin:24px auto;padding:0 16px;color:#1d2433;background:#fff}h1{color:#1e3a8a}h2{color:#1e3a8a;border-bottom:2px solid #c7d2fe;padding-bottom:4px;margin-top:32px}
table{border-collapse:collapse;width:100%;margin:8px 0 16px;font-size:13.5px}th,td{border:1px solid #cbd5e1;padding:5px 8px;vertical-align:top;text-align:left}th{background:#eef2ff}code{background:#f1f5f9;padding:1px 4px;border-radius:3px}
@media print{body{margin:0;max-width:none}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>
${html}</body></html>
`;
const dir = path.join(root, 'guida');
fs.writeFileSync(path.join(dir, 'Guida_Processi_Espropri.md'), md);
fs.writeFileSync(path.join(dir, 'Guida_Processi_Espropri.html'), pagina);
console.log('scritta la guida dei processi', versione);
