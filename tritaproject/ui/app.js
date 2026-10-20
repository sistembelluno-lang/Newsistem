const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
const ICONE = { pdf: '📕', dxf: '📐', svg: '🖼', png: '🖼', csv: '📊', html: '📝', obj: '🧊' };

let cur = null; // progetto aperto
const inCorso = {}; // id progetto → { testo, stato, file } della risposta in arrivo

// Comandi rapidi, a gruppi. Quelli che finiscono con uno spazio vanno completati da chi scrive (es. quale zona, quale tavola).
const GRUPPI = [
  ['Leggi', [
    ['🧭 Riassunto', 'Fammi un riassunto tecnico completo del progetto: oggetto, luogo, committente, livello di progettazione, opere previste, dati dimensionali principali, materiali, fasi e tempi. Indica per ogni dato l\'elaborato da cui l\'hai preso.'],
    ['📝 Descrizione tecnica', 'Descrivi il progetto sotto il profilo tecnico, come in una relazione illustrativa: inquadramento e oggetto, stato di fatto, opere previste, sistema strutturale e materiali, dimensioni e quote principali, impianti e finiture se presenti, fasi realizzative, vincoli e interferenze, punti critici. Cita gli elaborati.'],
    ['📋 Elenco elaborati', 'Crea una tabella con l\'elenco degli elaborati del progetto: codice, titolo, tipo, livello di progettazione, scala, revisione, contenuto in breve.'],
    ['⚠️ Incongruenze', 'Controlla la coerenza tra gli elaborati (misure, quote, materiali, revisioni, riferimenti tra tavole e relazioni) e fammi l\'elenco delle incongruenze, delle informazioni mancanti e dei punti da chiarire, in ordine di importanza.'],
    ['❓ Chiarimenti', 'Scrivi una richiesta di chiarimenti al progettista (relazione in formato lettera) con i punti dubbi o mancanti che hai trovato negli elaborati.'],
    ['⚖️ Normativa', 'In base al livello di progettazione di questi elaborati (D.Lgs. 36/2023, art. 41 e Allegato I.7, o regime precedente se il progetto è anteriore), verifica quali elaborati obbligatori ci sono e quali mancano, consultando il testo vigente sui siti ufficiali.'],
    ['🔎 Cerca', 'Cerca nel progetto dove compare: '],
    ['▭ Interroga area', 'Calcola area e perimetro (misura_aree, verificando con quote e cartellini) di: '],
    ['⇄ Confronta', 'Confronta le due revisioni/tavole e descrivi le modifiche: '],
  ]],
  ['Tavole', [
    ['📐 Nuova tavola', 'Crea una tavola (PDF + DXF) con '],
    ['✏️ Ridisegna', 'Ridisegna in DXF e PDF '],
    ['🔍 Dettaglio', 'Sviluppa il dettaglio costruttivo in scala 1:20 (PDF + DXF) di '],
    ['✂️ Taglia', 'Taglia dalla tavola la zona indicata e salvala come nuova tavola PDF + DXF alla stessa scala: '],
    ['⤢ Scala diversa', 'Estrapola alla scala 1:20 (nuova tavola PDF + DXF) la zona: '],
    ['⇩ PDF → DXF', 'Converti in DXF, in scala reale, la tavola '],
    ['🛠 Modifica disegno', 'Modifica il disegno (DXF o tavola PDF) e salva DXF + PDF: '],
  ]],
  ['3D', [
    ['🧊 Modello 3D', 'Costruisci il modello 3D dell\'opera leggendo piante, sezioni e prospetti (muri con aperture, solai, pilastri, fondazioni, copertura), dichiarando fonti e ipotesi, e mostrami assonometria e quantità.'],
    ['🏠 Prospetti', 'Genera i prospetti nord, sud, est e ovest dal modello 3D (se non c\'è ancora, crealo prima dalle tavole), in una tavola PDF + DXF in scala 1:100.'],
    ['🔪 Seziona', 'Genera dal modello 3D (se non c\'è, crealo prima) la sezione passante per '],
    ['🗺 Pianta dal modello', 'Genera dal modello 3D la pianta a quota +1,20 m di ogni piano, in scala 1:100, PDF + DXF.'],
  ]],
  ['Relazioni', [
    ['📘 Relazione generale', 'Redigi la relazione generale del progetto con i contenuti previsti per il suo livello di progettazione (D.Lgs. 36/2023, Allegato I.7, per le opere pubbliche; per le opere private una relazione tecnica generale): inquadramento, stato di fatto, obiettivi, descrizione dell\'intervento, scelte progettuali, materiali, aspetti strutturali e impiantistici, interferenze, espropri, sicurezza, tempi e costi se disponibili. Basati sugli elaborati citandoli; dove mancano dati lascia [DA COMPLETARE].'],
    ['🌄 Relazione paesaggistica', 'Redigi la relazione paesaggistica secondo il D.Lgs. 42/2004 (art. 146) e il D.P.C.M. 12 dicembre 2005 (valuta se si applica la procedura semplificata del D.P.R. 31/2017): stato attuale del bene e del contesto paesaggistico, vincoli e livelli di tutela (verifica anche il piano paesaggistico regionale), descrizione dell\'intervento, elementi per la valutazione di compatibilità, effetti sul paesaggio, mitigazioni e compensazioni, elenco di documentazione fotografica e fotoinserimenti da produrre. Usa gli elaborati (vincoli, planimetrie, prospetti) e controlla sul web la normativa vigente; dove mancano dati lascia [DA COMPLETARE].'],
    ['📝 Relazione tecnica', 'Prepara una relazione tecnica illustrativa del progetto basata sugli allegati, con descrizione dello stato di fatto, degli interventi, dei materiali e delle fasi esecutive.'],
    ['📊 Computo', 'Fai un computo metrico di massima delle principali lavorazioni ricavando le quantità dagli elaborati (e dal modello 3D se c\'è), in tabella (voce, unità, quantità, come è stata ricavata).'],
    ['🗓 Fasi', 'Crea uno schema grafico delle fasi esecutive / cronoprogramma dei lavori.'],
    ['💡 Spunti', 'Dammi spunti e proposte di miglioramento per questo progetto (soluzioni tecniche alternative, ottimizzazione di costi e tempi, sicurezza di cantiere, durabilità, sostenibilità), con vantaggi, svantaggi e cosa verificare.'],
  ]],
];
const RAPIDE = GRUPPI.flatMap(([, l]) => l);

function avviso(t, ms = 5000) {
  const a = $('#avviso');
  a.textContent = t; a.style.display = 'block';
  clearTimeout(avviso.t); avviso.t = setTimeout(() => { a.style.display = 'none'; }, ms);
}
const apriModale = (id) => $(id).classList.add('aperta');
const chiudiModale = (id) => $(id).classList.remove('aperta');

// ---------- Progetti ----------
async function caricaElenco() {
  const l = await tp.progetti();
  $('#elenco').innerHTML = l.length ? l.map((p) => `<div class="voce${cur && cur.id === p.id ? ' attiva' : ''}" data-id="${esc(p.id)}"><b>${esc(p.nome)}</b><small>${p.documenti} allegati · ${new Date(p.modificato).toLocaleDateString('it-IT')}</small></div>`).join('') : '<p class="aiuto" style="padding:0 8px">Nessun progetto. Creane uno con «Nuovo progetto».</p>';
}
$('#elenco').addEventListener('click', (e) => { const v = e.target.closest('.voce'); if (v) apri(v.dataset.id); });

async function apri(id) {
  cur = await tp.apri(id);
  $('#benvenuto').classList.remove('attivo');
  $('#progetto').style.display = 'flex';
  $('#titolo').textContent = cur.nome;
  $('#note').value = cur.note || '';
  disegnaTutto();
  caricaElenco();
  if (!cur.documenti.length) scheda('doc');
}
function disegnaTutto() { disegnaChat(); disegnaDoc(); disegnaEl(); }

$('#nuovo').onclick = () => { $('#nuovo-nome').value = ''; apriModale('#m-nuovo'); $('#nuovo-nome').focus(); };
$('#nuovo-annulla').onclick = () => chiudiModale('#m-nuovo');
$('#nuovo-nome').onkeydown = (e) => { if (e.key === 'Enter') $('#nuovo-ok').click(); };
$('#nuovo-ok').onclick = async () => {
  const n = $('#nuovo-nome').value.trim();
  if (!n) return;
  chiudiModale('#m-nuovo');
  const p = await tp.crea(n);
  await apri(p.id);
};
$('#b-elimina').onclick = async () => {
  if (!cur || !(await tp.elimina(cur.id))) return;
  cur = null;
  $('#progetto').style.display = 'none';
  $('#benvenuto').classList.add('attivo');
  caricaElenco();
};
$('#b-cartella').onclick = () => tp.cartella(cur.id);
$('#b-cartella-el').onclick = () => tp.cartella(cur.id, 'elaborati');
$('#note').addEventListener('input', () => { clearTimeout(window.tNote); window.tNote = setTimeout(() => tp.note(cur.id, $('#note').value), 600); });

function scheda(n) {
  document.querySelectorAll('#schede button').forEach((b) => b.classList.toggle('attiva', b.dataset.p === n));
  document.querySelectorAll('#progetto .pannello').forEach((p) => p.classList.toggle('attivo', p.id === 'p-' + n));
}
$('#schede').onclick = (e) => { const b = e.target.closest('button'); if (b) scheda(b.dataset.p); };

// ---------- Chat ----------
function htmlFile(files) {
  if (!files || !files.length) return '';
  return '<div class="files">' + files.map((f) => {
    const est = f.nome.split('.').pop().toLowerCase();
    const ant = ['png', 'svg'].includes(est) ? `<img src="${fileUrl(f.percorso)}" alt="">` : `<span style="font-size:22px">${ICONE[est] || '📄'}</span>`;
    return `<div class="file" data-f="${esc(f.percorso)}" title="Apri">${ant}<span>${esc(f.nome)}</span></div>`;
  }).join('') + '</div>';
}

function htmlMsg(m) {
  if (m.ruolo === 'utente') return `<div class="msg utente"><div class="av">Tu</div><div class="corpo">${esc(m.testo)}</div></div>`;
  return `<div class="msg claude"><div class="av">TP</div><div class="corpo">${md(m.testo)}${m.stato ? `<div class="stato">${esc(m.stato)}</div>` : ''}${m.errore ? `<div class="errore">⚠ ${esc(m.errore)}</div>` : ''}${htmlFile(m.file)}</div></div>`;
}

function disegnaChat() {
  const vista = cur.vista || [];
  const c = inCorso[cur.id];
  let h = vista.map(htmlMsg).join('');
  if (c) h += htmlMsg({ ruolo: 'claude', ...c });
  if (!vista.length && !c) {
    h = `<div id="vuoto"><h2>${esc(cur.nome)}</h2><p>${cur.documenti.length ? `${cur.documenti.length} allegati caricati. Fai una domanda o usa i pulsanti rapidi qui sotto.` : 'Carica gli allegati nella scheda 📄 Documenti (o trascinali qui), poi fai le tue domande.'}</p></div>`;
  }
  const box = $('#messaggi');
  const inFondo = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = h;
  if (inFondo || c) box.scrollTop = box.scrollHeight;
  $('#b-invia').style.display = c ? 'none' : '';
  $('#b-ferma').style.display = c ? '' : 'none';
}
$('#messaggi').addEventListener('click', (e) => { const f = e.target.closest('.file'); if (f) tp.apriFile(f.dataset.f); });

let n = 0;
$('#rapide').innerHTML = GRUPPI.map(([g, l]) => `<div class="gruppo"><span>${g}</span>${l.map(([t]) => `<button data-i="${n++}">${t}</button>`).join('')}</div>`).join('');
$('#rapide').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const [, testo] = RAPIDE[b.dataset.i];
  if (testo.endsWith(' ')) { $('#testo').value = testo; $('#testo').focus(); return; } // da completare
  invia(testo);
};

async function invia(testo) {
  testo = (testo ?? $('#testo').value).trim();
  if (!cur || !testo || inCorso[cur.id]) return;
  const id = cur.id;
  $('#testo').value = '';
  cur.vista.push({ ruolo: 'utente', testo });
  inCorso[id] = { testo: '', stato: 'Invio…', file: [] };
  scheda('chat');
  disegnaChat();
  const r = await tp.invia(id, testo);
  if (r && r.errore) { delete inCorso[id]; avviso(r.errore); if (cur && cur.id === id) disegnaChat(); }
}
$('#b-invia').onclick = () => invia();
$('#b-ferma').onclick = () => tp.ferma(cur.id);
$('#testo').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(); } };

let tDisegna = 0;
tp.eventi((ev) => {
  const c = inCorso[ev.progetto];
  if (ev.tipo === 'testo' && c) { c.testo += ev.testo; c.stato = ''; }
  else if (ev.tipo === 'stato' && c) c.stato = ev.testo;
  else if (ev.tipo === 'file' && c) { c.file.push(...ev.file); }
  else if (ev.tipo === 'fine') {
    delete inCorso[ev.progetto];
    if (cur && cur.id === ev.progetto) { cur = ev.dati; disegnaTutto(); }
    caricaElenco();
    return;
  } else if (ev.tipo === 'documenti') {
    if (cur && cur.id === ev.progetto) { cur.documenti = ev.dati.documenti; disegnaDoc(); }
    return;
  } else if (ev.tipo === 'errore' || ev.tipo === 'avviso') { avviso(ev.testo, 9000); return; }
  if (cur && cur.id === ev.progetto && !tDisegna) tDisegna = requestAnimationFrame(() => { tDisegna = 0; if (cur) disegnaChat(); });
});

// ---------- Documenti ----------
function disegnaDoc() {
  $('#n-doc').textContent = cur.documenti.length ? `(${cur.documenti.length})` : '';
  const badge = (s) => s === 'letto' ? '<span class="badge letto">✓ letto</span>' : s === 'in lettura' ? '<span class="badge lettura">… in lettura</span>' : /^errore/.test(s) ? `<span class="badge err" title="${esc(s)}">⚠ errore</span>` : `<span class="badge">${esc(s)}</span>`;
  $('#docs').innerHTML = cur.documenti.length ? cur.documenti.map((d) => `<div class="doc" data-id="${d.id}">
    <div class="riga"><span class="cod">${d.id}</span><span class="nome" title="${esc(d.nome)}">${esc(d.nome)}</span><span class="info">${d.tipo === 'application/pdf' ? `${d.pagine} pag.` : d.tipo.split('/')[0]}</span>${badge(d.stato)}
    ${/pdf|dxf/.test(d.tipo) ? '<button class="piccolo" data-az="vedi">👁 Vedi</button>' : ''}<button class="piccolo" data-az="descrivi" title="Descrizione tecnica a parole di questo elaborato">📝 Descrivi</button><button class="piccolo" data-az="via" title="Togli dal progetto">✕</button></div>
    <div class="scheda corpo">${d.scheda ? md(d.scheda) : /^errore/.test(d.stato) ? `<p class="errore">${esc(d.stato)}</p>` : '<p class="aiuto">Scheda in preparazione…</p>'}</div></div>`).join('')
    : '<p class="aiuto">Nessun allegato. Aggiungi i PDF delle tavole e delle relazioni: TRITAPROJECT li legge e prepara una scheda per ognuno.</p>';
}
$('#docs').addEventListener('click', async (e) => {
  const d = e.target.closest('.doc');
  if (!d) return;
  const az = e.target.dataset.az;
  if (az === 'via') {
    if (confirm('Togliere questo documento dal progetto?')) { cur = { ...cur, ...(await tp.rimuovi(cur.id, d.dataset.id)) }; disegnaDoc(); }
  } else if (az === 'vedi') vedi(d.dataset.id, 1);
  else if (az === 'descrivi') invia(`Descrivi a parole, sotto il profilo tecnico, l'elaborato ${d.dataset.id}: che cos'è (tipo, livello di progettazione, scala, revisione), cosa rappresenta vista per vista, le dimensioni e le quote principali, i materiali e le soluzioni costruttive, le note e i riferimenti ad altri elaborati, e cosa manca o non è chiaro. Aprilo e ingrandisci le parti necessarie.`);
  else d.classList.toggle('aperto');
});

async function aggiungi(files) {
  if (!cur || !files.length) return;
  avviso(`Copio ${files.length} file nel progetto…`);
  const r = await tp.aggiungi(cur.id, files);
  cur.documenti = r.progetto.documenti;
  disegnaDoc();
  if (r.errori.length) avviso('Non caricati:\n' + r.errori.join('\n'), 10000);
  else avviso('Allegati aggiunti: ora TRITAPROJECT li legge e prepara le schede.');
  caricaElenco();
}
$('#b-aggiungi').onclick = async () => aggiungi(await tp.scegliFile());
$('#b-cartella-lavoro').onclick = async () => aggiungi(await tp.scegliFile(true));
$('#b-rileggi').onclick = () => { if (confirm('Rileggere tutti i documenti e rifare le schede? (Usa questa funzione anche se hai cambiato chiave API.)')) tp.rileggi(cur.id); };

let ant = null;
async function vedi(docId, pag) {
  const d = cur.documenti.find((x) => x.id === docId);
  ant = { docId, pag: Math.max(1, Math.min(pag, d.pagine)), tot: d.pagine };
  $('#ant-titolo').textContent = `${d.id} · ${d.nome}`;
  $('#ant-pag').textContent = `${ant.pag} / ${ant.tot}`;
  apriModale('#m-ant');
  $('#ant-img').src = '';
  azzeraMisura();
  const r = await tp.anteprima(cur.id, docId, ant.pag);
  if (r) { $('#ant-img').src = `data:${r.mime || 'image/jpeg'};base64,` + r.dati; ant.pt = r.formato_pt; if (ant.pt) $('#ant-sopra').setAttribute('viewBox', `0 0 ${ant.pt[0]} ${ant.pt[1]}`); }
  const pdf = d.tipo === 'application/pdf';
  ['#ant-dxf', '#mis-dist', '#mis-area', '#ant-scala'].forEach((s) => { $(s).style.display = pdf ? '' : 'none'; });
}

// Misure sull'anteprima: i punti si tengono in punti tipografici della pagina, poi si passa ai metri con la scala.
let mis = { modo: '', punti: [] };
function azzeraMisura() { mis.punti = []; disegnaMisura(); }
function modoMisura(m) {
  mis.modo = mis.modo === m ? '' : m; mis.punti = [];
  $('#mis-dist').classList.toggle('on', mis.modo === 'dist'); $('#mis-area').classList.toggle('on', mis.modo === 'area');
  $('#ant-box').classList.toggle('misura', !!mis.modo);
  disegnaMisura();
}
function testoMisura() {
  const p = mis.punti;
  if (p.length < 2) return '';
  const scala = +$('#ant-scala').value || 0;
  const k = (25.4 / 72) * (scala || 1) / (scala ? 1000 : 1), u = scala ? 'm' : 'mm (carta)';
  const chiuso = mis.modo === 'area' && p.length >= 3;
  let L = 0;
  for (let i = 1; i < p.length + (chiuso ? 1 : 0); i++) { const a = p[i - 1], b = p[i % p.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const fmt = (v) => v.toLocaleString('it-IT', { maximumFractionDigits: scala ? 2 : 1 });
  if (!chiuso) return `Lunghezza ${fmt(L * k)} ${u}`;
  let A = 0;
  p.forEach((a, i) => { const b = p[(i + 1) % p.length]; A += a[0] * b[1] - b[0] * a[1]; });
  return `Area ${fmt(Math.abs(A / 2) * k * k)} ${scala ? 'm²' : 'mm² (carta)'} · perimetro ${fmt(L * k)} ${u}`;
}
function disegnaMisura() {
  const p = mis.punti, w = ant && ant.pt ? Math.max(...ant.pt) / 400 : 2;
  const pts = p.map((q) => q.join(',')).join(' ');
  $('#ant-sopra').innerHTML = p.length ? `<${mis.modo === 'area' ? 'polygon' : 'polyline'} points="${pts}" fill="${mis.modo === 'area' ? 'rgba(240,160,32,.25)' : 'none'}" stroke="#e8590c" stroke-width="${w}"/>` + p.map((q) => `<circle cx="${q[0]}" cy="${q[1]}" r="${w * 1.8}" fill="#e8590c"/>`).join('') : '';
  $('#mis-esito').textContent = testoMisura();
}
$('#ant-img').addEventListener('click', (e) => {
  if (!mis.modo || !ant || !ant.pt) return;
  const r = e.target.getBoundingClientRect();
  mis.punti.push([((e.clientX - r.left) / r.width) * ant.pt[0], ((e.clientY - r.top) / r.height) * ant.pt[1]]);
  disegnaMisura();
});
$('#mis-dist').onclick = () => modoMisura('dist');
$('#mis-area').onclick = () => modoMisura('area');
$('#mis-zero').onclick = azzeraMisura;
$('#ant-scala').addEventListener('input', disegnaMisura);
$('#mis-chat').onclick = () => {
  const t = testoMisura();
  if (!t) return;
  const d = cur.documenti.find((x) => x.id === ant.docId);
  $('#testo').value += `${$('#testo').value ? '\n' : ''}Misura su ${d.id} pag. ${ant.pag}${$('#ant-scala').value ? ` (scala 1:${$('#ant-scala').value})` : ''}: ${t}. `;
  chiudiModale('#m-ant'); scheda('chat'); $('#testo').focus();
};
$('#ant-prec').onclick = () => ant && ant.pag > 1 && vedi(ant.docId, ant.pag - 1);
$('#ant-succ').onclick = () => ant && ant.pag < ant.tot && vedi(ant.docId, ant.pag + 1);
$('#ant-dxf').onclick = async () => {
  if (!ant) return;
  avviso('Converto la pagina in DXF…');
  const r = await tp.dxf(cur.id, ant.docId, ant.pag, +$('#ant-scala').value || 0);
  avviso((r.ok ? '✓ ' : '⚠ ') + r.testo, 8000);
  if (r.ok) { cur.elaborati = r.progetto.elaborati; disegnaEl(); }
};
$('#ant-chiudi').onclick = () => chiudiModale('#m-ant');

// Trascinamento di file e cartelle
let dentro = 0;
const main = $('#main');
main.addEventListener('dragenter', (e) => { e.preventDefault(); if (cur) { dentro++; $('#trascina').classList.add('su'); } });
main.addEventListener('dragleave', () => { if (--dentro <= 0) { dentro = 0; $('#trascina').classList.remove('su'); } });
main.addEventListener('dragover', (e) => e.preventDefault());
main.addEventListener('drop', (e) => {
  e.preventDefault(); dentro = 0; $('#trascina').classList.remove('su');
  aggiungi([...e.dataTransfer.files].map((f) => tp.percorso(f)).filter(Boolean));
});

// ---------- Elaborati ----------
function disegnaEl() {
  const l = cur.elaborati || [];
  $('#n-el').textContent = l.length ? `(${l.length})` : '';
  $('#els').innerHTML = l.length ? l.map((f) => {
    const est = f.nome.split('.').pop().toLowerCase();
    const ant = ['png', 'svg'].includes(est) ? `<img src="${fileUrl(f.percorso)}" alt="">` : ICONE[est] || '📄';
    return `<div class="el"><div class="ant" data-f="${esc(f.percorso)}">${ant}</div><div class="n">${esc(f.nome)}</div><div class="az"><button class="piccolo" data-f="${esc(f.percorso)}">Apri</button><button class="piccolo" data-m="${esc(f.percorso)}">Mostra nella cartella</button></div></div>`;
  }).join('') : '<p class="aiuto">Ancora nessun elaborato. Chiedi in chat, ad esempio: «crea una relazione sulle fasi di cantiere», «ridisegna la sezione A-A in DXF», «fai lo schema delle fasi esecutive».</p>';
}
$('#els').addEventListener('click', (e) => {
  const t = e.target.closest('[data-f],[data-m]');
  if (!t) return;
  if (t.dataset.m) tp.mostraFile(t.dataset.m); else tp.apriFile(t.dataset.f);
});

// ---------- Impostazioni ----------
async function apriImp() {
  const s = await tp.impostazioni();
  $('#imp-chiave').value = '';
  $('#imp-stato').textContent = s.daAmbiente ? '(presa da ANTHROPIC_API_KEY)' : s.chiave ? '✓ impostata' : '✕ mancante';
  $('#imp-modello').innerHTML = s.modelli.map((m) => `<option value="${m}"${m === s.modello ? ' selected' : ''}>${{ 'claude-opus-5-5': 'Claude Opus 5.5 (consigliato)', 'claude-sonnet-5-5': 'Claude Sonnet 5.5 (più rapido ed economico)', 'claude-fable-5-1': 'Claude Fable 5.1 (il più capace, costa di più)' }[m] || m}</option>`).join('');
  $('#imp-impegno').value = s.impegno;
  $('#imp-autore').value = s.autore;
  $('#imp-web').checked = s.web;
  $('#imp-cartella').textContent = 'I progetti sono salvati in: ' + s.cartella;
  apriModale('#m-imp');
}
const salvaImp = () => tp.salvaImpostazioni({ chiave: $('#imp-chiave').value, modello: $('#imp-modello').value, impegno: $('#imp-impegno').value, autore: $('#imp-autore').value, web: $('#imp-web').checked });
$('#b-imp').onclick = apriImp;
$('#imp-annulla').onclick = () => chiudiModale('#m-imp');
$('#imp-salva').onclick = async () => { await salvaImp(); chiudiModale('#m-imp'); avviso('Impostazioni salvate.'); };
$('#imp-prova').onclick = async () => {
  await salvaImp();
  $('#imp-chiave').value = '';
  avviso('Provo il collegamento…');
  const r = await tp.provaChiave();
  avviso((r.ok ? '✓ ' : '⚠ ') + r.testo, 8000);
  apriImp();
};

(async () => {
  await caricaElenco();
  const s = await tp.impostazioni();
  if (!s.chiave) apriImp();
  else { const l = await tp.progetti(); if (l.length) apri(l[0].id); }
})();
