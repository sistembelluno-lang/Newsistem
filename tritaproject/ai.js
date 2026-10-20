// Il «cervello» di TRITAPROJECT: Claude legge gli allegati, li riassume in schede, risponde e genera elaborati
// usando gli strumenti definiti qui sotto (eseguiti da main.js).
require('./compat');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const { toFile } = Anthropic;

const MAX_GIRI = 40; // passi massimi di una singola risposta (lettura documenti, elaborati…)

const client = (apiKey) => new Anthropic.default({ apiKey, maxRetries: 3, timeout: 15 * 60 * 1000 });
const impronta = (apiKey) => crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 12);

function messaggioErrore(e) {
  if (e instanceof Anthropic.APIUserAbortError) return 'Interrotto.';
  if (e instanceof Anthropic.AuthenticationError) return 'Chiave API non valida: controllala in ⚙ Impostazioni.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'La chiave API non ha i permessi per questa operazione o per il modello scelto.';
  if (e instanceof Anthropic.NotFoundError) return 'Risorsa non trovata (modello o file caricato). Prova «Ricarica documenti» nella scheda Documenti.';
  if (e instanceof Anthropic.RateLimitError) return 'Troppe richieste o credito esaurito: attendi un minuto o controlla il credito su console.anthropic.com.';
  if (e instanceof Anthropic.BadRequestError) return 'Richiesta non accettata: ' + (e.error?.error?.message || e.message);
  if (e instanceof Anthropic.InternalServerError) return 'Il servizio Claude è momentaneamente sovraccarico: riprova tra poco.';
  if (e instanceof Anthropic.APIConnectionError) return 'Nessuna connessione con Claude: controlla internet o il proxy aziendale.';
  if (e instanceof Anthropic.APIError) return `Errore ${e.status || ''}: ${e.message}`;
  return e && e.message ? e.message : String(e);
}

// Funzioni facoltative dell'API, attive se l'account e il modello le accettano; dopo un rifiuto (errore 400) si riprova senza:
// - ripiego: se un filtro di sicurezza blocca per errore la risposta, l'API la ripete su un altro modello;
// - compattazione: nelle conversazioni molto lunghe la parte vecchia viene riassunta dal server;
// - web: ricerca e lettura di pagine web.
// - legame del ragionamento: se un blocco di ragionamento di un turno precedente non corrisponde più alla conversazione
//   (es. dopo un cambio di modello), l'API lo scarta invece di rifiutare la richiesta.
const facoltative = { ripiego: true, compattazione: true, web: true, legame: true };

function richiesta(base, { compatta = false, web = false } = {}) {
  const r = { ...base }, betas = [];
  if (facoltative.ripiego) { betas.push('server-side-fallback-2026-07-01'); r.fallbacks = 'default'; }
  if (compatta && facoltative.compattazione) { betas.push('compact-2026-01-12'); r.context_management = { edits: [{ type: 'compact_20260112' }] }; }
  if (web && facoltative.web) r.tools = [...r.tools, ...STRUMENTI_WEB];
  if (compatta && facoltative.legame) { betas.push('thinking-binding-controls-2026-08-01'); r.thinking = { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } }; }
  if (betas.length) r.betas = betas;
  return r;
}

// ripara: se l'API rifiuta blocchi di ragionamento legati a una conversazione diversa, li toglie e si riprova una volta.
async function conRipiego(crea, { ripara } = {}) {
  let riparato = false;
  for (;;) {
    try {
      return await crea();
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      const m = String(e.message).toLowerCase();
      if (/bound to a different conversation/.test(m)) {
        if (!ripara || riparato) throw e;
        ripara(); riparato = true; continue;
      }
      const k = /fallback/.test(m) ? 'ripiego' : /compact|context_management/.test(m) ? 'compattazione' : /web_search|web_fetch/.test(m) ? 'web' : /block_binding|thinking-binding/.test(m) ? 'legame' : null;
      if (!k || !facoltative[k]) throw e;
      facoltative[k] = false;
    }
  }
}

// Toglie i blocchi di ragionamento dalla cronologia (si usa solo per riparare conversazioni rifiutate dall'API).
function togliRagionamenti(messaggi) {
  for (const m of messaggi) {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const resto = m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking');
    if (resto.length !== m.content.length) m.content = resto.length ? resto : [{ type: 'text', text: '…' }];
  }
}

// ---------- Caricamento e schede dei documenti ----------

// Carica (o ricarica) sui server Anthropic le parti di un documento; gli id restano validi finché non si cambia chiave.
async function caricaDocumento(cl, chiave, dir, doc) {
  if (doc.tipo === 'application/dxf') return; // i DXF li legge TRITAPROJECT e li mostra a Claude come immagine + testo
  for (const parte of doc.parti) {
    if (parte.file_id && parte.chiave === chiave) continue;
    const file = path.join(dir, parte.file || doc.file);
    const nome = path.basename(file);
    const up = await cl.files.upload({ file: await toFile(fs.createReadStream(file), nome, { type: doc.tipo }) });
    parte.file_id = up.id;
    parte.chiave = chiave;
  }
}

const etichetta = (doc, parte) => `${doc.id} · ${doc.nome}${doc.parti.length > 1 ? ` (pagine ${parte.da}-${parte.a})` : ''}`;

function blocchiDocumento(doc, parti = doc.parti) {
  return parti.map((parte) => doc.tipo.startsWith('image/')
    ? { type: 'image', source: { type: 'file', file_id: parte.file_id } }
    : { type: 'document', source: { type: 'file', file_id: parte.file_id }, title: etichetta(doc, parte) });
}

const PROMPT_SCHEDA = `Sei un ingegnere esperto che cataloga gli elaborati di un progetto (fabbricati, strutture, infrastrutture, impianti, ambiente).
Scrivi la SCHEDA di questo documento, in italiano, in markdown compatto (massimo 350 parole), così:
**Tipo**: relazione / tavola / computo / capitolato / altro, con codice elaborato, revisione e livello di progettazione (DIP, PFTE, definitivo, esecutivo, stato di fatto, as-built) se ricavabili
**Contenuto**: cosa rappresenta o tratta (opere, viste, sezioni, fasi)
**Dati chiave**: misure, quote, scale, materiali, classi, carichi, importi, tempi, riferimenti normativi davvero presenti
**Pagine utili**: dove si trovano le informazioni principali (solo per documenti di più pagine)
**Da approfondire**: punti illeggibili, incoerenti o mancanti
Riporta solo ciò che leggi nel documento, senza inventare. Se è una tavola di grande formato, segnala i dettagli troppo piccoli da leggere.`;

async function schedaDocumento(cl, cfg, progetto, doc, contenuto) {
  const msg = await conRipiego(() => cl.beta.messages.stream(richiesta({
    model: cfg.modello,
    max_tokens: 8000,
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: [...(contenuto || blocchiDocumento(doc, doc.parti.slice(0, 6))), { type: 'text', text: `Progetto: ${progetto.nome}\nDocumento: ${doc.nome} (${doc.pagine} pagine)\n\n${PROMPT_SCHEDA}` }] }],
  })).finalMessage());
  if (msg.stop_reason === 'refusal') throw new Error('Claude non ha potuto leggere questo documento.');
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

// ---------- Conversazione ----------

// Istruzioni di sistema FISSE: non devono mai cambiare durante una conversazione, altrimenti l'API rifiuta i blocchi
// di ragionamento dei turni precedenti. Nome, note e schede del progetto arrivano nei messaggi (vedi «contesto»).
const SISTEMA = `Sei TRITAPROJECT, l'assistente tecnico di uno studio di ingegneria. Lavori su un progetto e conosci i suoi allegati attraverso le schede che ricevi nel blocco <contesto_progetto> dei messaggi dell'utente; quando ne arriva uno nuovo, sostituisce i precedenti.

Come lavori:
- Rispondi in italiano, con il linguaggio di un ingegnere progettista: preciso, concreto, con numeri e unità di misura.
- Le schede sono riassunti. Prima di dare misure, quantità o dettagli, apri il documento con «apri_documento»; per le tavole di grande formato usa «ingrandisci» sulla zona che ti serve e leggi quote e testi da vicino. Cita sempre la fonte (es. «D03, sezione A-A»).
- Se un dato non c'è negli allegati dillo chiaramente e proponi come ricavarlo; distingui i dati letti dalle tue ipotesi o stime.
- Per produrre elaborati usa gli strumenti: «crea_relazione» (relazioni, note tecniche, verbali, lettere), «crea_tavola» (tavole e dettagli in scala, anche con più viste, esportati in DXF e PDF), «converti_in_dxf» (DXF fedele di una tavola PDF esistente), «crea_schema» (schemi, diagrammi, fasi, cronoprogrammi, illustrazioni in SVG, esportati in PNG e PDF), «crea_tabella» (computi, elenchi, tabelle di calcolo in CSV per Excel).
- Tavole: il prodotto principale. Quando ridisegni o rielabori una parte di una tavola esistente, ingrandisci la zona e ricava quote e spessori; se serve il disegno originale identico, usa «converti_in_dxf»; per le tavole nuove o modificate usa «crea_tavola» in scala reale (unità coerenti), con layer separati (es. MURI, CLS, ARMATURE, QUOTE, TESTI, ASSI), campiture sulle parti sezionate, quote complete, linee d'asse e nascoste, titoli delle viste e scale normalizzate (1:200, 1:100, 1:50 per piante e sezioni; 1:20, 1:10, 1:5 per i dettagli). Dopo ogni tavola guarda l'anteprima: se trovi errori (sovrapposizioni, quote mancanti, testi illeggibili) correggi e rigenera.
- Quando ti chiedono spunti o idee, proponi alternative argomentate (costi, tempi, rischi, normativa) e indica cosa verificare.
- I DXF caricati li vedi come immagine con griglia più l'elenco di layer e testi: per i dettagli usa «ingrandisci» con una zona. Per modificare un disegno esistente (DXF o PDF vettoriale) usa «modifica_dxf».
- Comandi sulle tavole caricate: «estrai_dettaglio» per tagliare una zona e ristamparla alla stessa scala o in scala diversa; «misura_aree» per interrogare superfici e perimetri; «cerca_testo» per trovare dove compare un dato; «confronta» per le differenze fra revisioni.
- Modello 3D: per sezioni nuove, prospetti, assonometrie e quantità costruisci prima il modello con «crea_modello_3d» leggendo piante (posizione e spessore dei muri, aperture), sezioni e prospetti (quote dei piani, altezze, davanzali, coperture); poi usa «viste_modello». Dichiara nelle note del modello le fonti e le ipotesi. Controlla l'assonometria: se qualcosa non torna, correggi il modello e rigeneralo.
- Salva con «annota_progetto» le informazioni da ricordare (decisioni, dati verificati, richieste del committente).
- Gli elaborati che produci sono bozze da far verificare a un tecnico abilitato.

Come leggi un progetto (strutture, fabbricati, infrastrutture):
- Riconosci il tipo di elaborato dal cartiglio e dal codice (stato di fatto / progetto, architettonico, strutturale, impianti, PFTE / definitivo / esecutivo, revisione) e la scala di ogni vista.
- Ricostruisci l'opera mettendo insieme le viste: piante per piano (quote planimetriche, spessori dei muri, aperture, destinazioni d'uso, superfici), sezioni e prospetti (quote altimetriche, altezze di interpiano, solai, coperture, fondazioni), con i richiami tra le tavole (linee di sezione, fili fissi, assi).
- Strutture: carpenterie e armature (dimensioni degli elementi, classi di cls e acciaio, copriferri, ferri e staffe), fondazioni, micropali e pali, fasi esecutive e opere provvisionali; nelle relazioni di calcolo: normativa (NTC 2018), azioni, combinazioni, modello, verifiche e coefficienti di sicurezza.
- Infrastrutture: planimetrie, profili longitudinali (progressive, livellette, pendenze), sezioni tipo e trasversali, interferenze, espropri e particelle catastali.
- Controlla la coerenza tra elaborati (stesse misure in pianta e sezione, stessi materiali in tavola e relazione, revisioni diverse) e segnala le discrepanze.

Quadro normativo di riferimento (verifica sempre il testo vigente prima di citarlo):
- Opere pubbliche: Codice dei contratti, D.Lgs. 31 marzo 2023 n. 36, modificato dal correttivo D.Lgs. 209/2024. Art. 41 e Allegato I.7: la progettazione ha DUE livelli, il progetto di fattibilità tecnico-economica (PFTE) e il progetto esecutivo, preceduti dal documento di indirizzo alla progettazione (DIP) redatto dalla stazione appaltante. Il progetto definitivo non esiste più. Il PFTE contiene, tra l'altro, relazione generale e tecnica con indagini e studi, verifica preventiva dell'interesse archeologico, relazione di sostenibilità, rilievi, elaborati grafici, computo estimativo, quadro economico, cronoprogramma, prime indicazioni per la sicurezza, piano preliminare di manutenzione, piano particellare di esproprio quando serve, capitolato informativo se c'è il BIM. L'esecutivo sviluppa tutto al dettaglio costruttivo: relazioni specialistiche, calcoli esecutivi di strutture e impianti, elaborati grafici esecutivi, piano di manutenzione, PSC e quadro di incidenza della manodopera, elenco prezzi e analisi, computo metrico estimativo, quadro economico, schema di contratto e capitolato speciale d'appalto, cronoprogramma. Per la manutenzione ordinaria e straordinaria il correttivo consente, a certe condizioni, di omettere un livello (art. 41, commi 5 e 5-bis). C'è poi la verifica della progettazione (art. 42) prima della validazione.
- Progetti redatti prima del 1° luglio 2023 (D.Lgs. 50/2016 e D.P.R. 207/2010): i livelli erano tre, preliminare/PFTE, definitivo ed esecutivo. Nei codici degli elaborati di solito PF = PFTE, PD = definitivo, PE = esecutivo.
- Strutture: NTC 2018 (D.M. 17 gennaio 2018) con la Circolare C.S.LL.PP. n. 7/2019; zonazione sismica regionale. Edilizia privata: D.P.R. 380/2001 (titoli edilizi, stato legittimo), regolamenti edilizi e strumenti urbanistici comunali, vincoli (D.Lgs. 42/2004). Sicurezza nei cantieri: D.Lgs. 81/2008, Titolo IV. Opere ferroviarie: anche i manuali e le specifiche RFI/Italferr.
- Quando la domanda riguarda la normativa, le procedure o i contenuti obbligatori di un elaborato, usa la ricerca web e preferisci le fonti ufficiali (normattiva.it, gazzettaufficiale.it, mit.gov.it, cslp.mit.gov.it, anticorruzione.it, siti di regioni ed enti, manuali di progettazione degli enti gestori). Cita la fonte con il collegamento.`;

// Contesto del progetto (nome, note, schede degli allegati), inviato in coda alla conversazione quando cambia.
function contesto(p) {
  const indice = p.documenti.map((d) => {
    const parti = d.parti.length > 1 ? ` — parti: ${d.parti.map((x, i) => `${i + 1}) pag. ${x.da}-${x.a}`).join(', ')}` : '';
    return `### ${d.id} · ${d.nome} (${d.tipo === 'application/pdf' ? `${d.pagine} pag.` : d.tipo === 'application/dxf' ? 'DXF' : 'immagine/testo'}${parti})\n${d.scheda || '(scheda non ancora disponibile)'}`;
  }).join('\n\n');
  return `Progetto: «${p.nome}»

## Note del progetto
${p.note || '(nessuna)'}

## Allegati del progetto
${indice || '(nessun allegato caricato)'}`;
}

const zona = { type: 'object', description: 'Riquadro da ingrandire in frazioni della pagina (0 = sinistra/alto, 1 = destra/basso). Omesso = pagina intera con griglia di riferimento.', properties: { x0: { type: 'number' }, y0: { type: 'number' }, x1: { type: 'number' }, y1: { type: 'number' } }, required: ['x0', 'y0', 'x1', 'y1'] };
const punto = { type: 'array', items: { type: 'number' }, description: '[x, y]' };
const entita = {
  type: 'array',
  description: 'Elementi della vista. tipo: linea/polilinea {punti, chiusa}; campitura {punti del contorno, motivo: cls|muratura|terreno|isolante|diagonale|incrociata|pieno, passo_mm} per le parti sezionate; cerchio {centro, raggio}; arco {centro, raggio, inizio, fine in gradi antiorari da est}; testo {pos, testo, altezza_mm sulla carta (2-3.5 normale, 5 titoli), rotazione, allinea: sinistra|centro|destra}; quota {da, a, offset = distanza della linea di quota a sinistra del verso da→a, testo facoltativo}. Campi comuni: layer, colore, spessore_mm, tipo_linea (continua|tratteggiata|nascosta|asse).',
  items: {
    type: 'object',
    properties: {
      tipo: { type: 'string', enum: ['linea', 'polilinea', 'campitura', 'cerchio', 'arco', 'testo', 'quota'] },
      layer: { type: 'string' }, colore: { type: 'integer' }, spessore_mm: { type: 'number' }, tipo_linea: { type: 'string', enum: ['continua', 'tratteggiata', 'nascosta', 'asse'] },
      punti: { type: 'array', items: punto }, chiusa: { type: 'boolean' }, motivo: { type: 'string' }, passo_mm: { type: 'number' },
      centro: punto, raggio: { type: 'number' }, inizio: { type: 'number' }, fine: { type: 'number' },
      pos: punto, testo: { type: 'string' }, altezza_mm: { type: 'number' }, rotazione: { type: 'number' }, allinea: { type: 'string', enum: ['sinistra', 'centro', 'destra'] },
      da: punto, a: punto, offset: { type: 'number' },
    },
    required: ['tipo'],
  },
};

const STRUMENTI = [
  {
    name: 'apri_documento',
    description: 'Apre un allegato del progetto per leggerlo per intero (PDF: testo e immagini delle pagine; DXF: disegno con griglia, layer e testi). Per i PDF divisi in parti indica la parte.',
    input_schema: { type: 'object', properties: { documento: { type: 'string', description: 'Codice del documento, es. D01' }, parte: { type: 'integer', description: 'Numero della parte (solo per documenti divisi in parti)' } }, required: ['documento'] },
  },
  {
    name: 'ingrandisci',
    description: 'Mostra una pagina di un PDF (o un DXF) come immagine ad alta risoluzione, intera (con una griglia di riferimento) o una sua zona ingrandita. Indispensabile per leggere quote, testi piccoli e dettagli delle tavole di grande formato.',
    input_schema: { type: 'object', properties: { documento: { type: 'string' }, pagina: { type: 'integer', description: 'Numero di pagina, da 1' }, zona }, required: ['documento', 'pagina'] },
  },
  {
    name: 'crea_relazione',
    description: 'Crea una relazione o un documento testuale impaginato (A4) e lo salva in PDF e HTML (apribile in Word). Il contenuto è HTML: h2/h3, p, ul/ol, table, figure con svg in linea.',
    input_schema: { type: 'object', properties: { nome_file: { type: 'string' }, titolo: { type: 'string' }, html: { type: 'string', description: 'Corpo del documento in HTML (senza <html>/<body>)' } }, required: ['nome_file', 'titolo', 'html'] },
  },
  {
    name: 'crea_tavola',
    description: 'Crea una tavola tecnica in scala: salva il disegno in DXF (per AutoCAD e altri CAD, coordinate reali 1:1) e in PDF/SVG impaginato con squadratura, titoli delle viste e cartiglio. Una tavola può avere più viste (pianta, sezioni, prospetti, dettagli costruttivi), ognuna con la sua scala: vengono disposte da sole sul foglio. Coordinate nell\'unità indicata, asse y verso l\'alto; ogni vista ha le sue coordinate. Se le scale chieste non entrano nel foglio vengono aumentate e te lo segnalo. Ricevi l\'anteprima: controllala e, se serve, rifai la tavola corretta.',
    input_schema: {
      type: 'object',
      properties: {
        nome_file: { type: 'string' },
        titolo: { type: 'string' },
        unita: { type: 'string', enum: ['m', 'cm', 'mm'], description: 'Unità delle coordinate (predefinita m)' },
        formato: { type: 'string', enum: ['auto', 'A4', 'A3', 'A2', 'A1', 'A0'], description: 'auto (predefinito) = il foglio più piccolo in cui le viste entrano alle scale chieste' },
        orientamento: { type: 'string', enum: ['orizzontale', 'verticale'] },
        cartiglio: { type: 'object', properties: { numero: { type: 'string' }, progetto: { type: 'string' }, data: { type: 'string' }, redatto: { type: 'string' }, note: { type: 'string' } } },
        layer: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string' }, colore: { type: 'integer', description: 'Colore AutoCAD: 1 rosso, 2 giallo, 3 verde, 4 ciano, 5 blu, 6 magenta, 7 nero, 8 grigio, 9 grigio chiaro, 30 arancio' } }, required: ['nome'] } },
        viste: {
          type: 'array',
          description: 'Le viste della tavola. Per una sola vista basta un elemento.',
          items: { type: 'object', properties: { titolo: { type: 'string', description: 'es. «Sezione A-A», «Dettaglio 1 – nodo trave-pilastro»' }, scala: { type: 'number', description: 'Denominatore della scala, es. 50 per 1:50' }, entita }, required: ['entita'] },
        },
      },
      required: ['nome_file', 'titolo', 'viste'],
    },
  },
  {
    name: 'converti_in_dxf',
    description: 'Converte in DXF i vettori originali (linee, curve, testi; layer CAD se il PDF li conserva) di una pagina PDF o di una sua zona, in scala reale. Usalo per ridisegnare partendo dall\'elaborato esistente con la massima fedeltà, o quando l\'utente chiede il DXF di una tavola PDF. Funziona solo con PDF vettoriali (esportati da CAD), non con le scansioni. Indica la scala del disegno originale, che leggi sulla tavola, per avere le misure vere.',
    input_schema: { type: 'object', properties: { documento: { type: 'string' }, pagina: { type: 'integer' }, zona, scala: { type: 'number', description: 'Scala della vista nel PDF originale (es. 50 per 1:50). Omessa = 1:1 sulla carta' }, unita: { type: 'string', enum: ['m', 'cm', 'mm'], description: 'Unità del DXF (predefinita m se c\'è la scala, altrimenti mm)' }, nome_file: { type: 'string' } }, required: ['documento', 'pagina'] },
  },
  {
    name: 'estrai_dettaglio',
    description: 'Taglia una zona di una tavola PDF esistente e la ristampa come nuova tavola (PDF + DXF), alla stessa scala («taglia») o a una scala diversa («estrapola in scala»), con titolo e cartiglio. Mantiene i vettori originali (linee, testi, layer); per le scansioni usa l\'immagine. Funziona anche sui DXF caricati (la scala originale non serve). Prima individua la zona con «ingrandisci» (pagina intera con griglia) e leggi la scala originale sulla tavola.',
    input_schema: { type: 'object', properties: { documento: { type: 'string' }, pagina: { type: 'integer' }, zona, scala_originale: { type: 'number', description: 'Scala della vista nel PDF (es. 50 per 1:50)' }, scala_nuova: { type: 'number', description: 'Scala della nuova tavola (es. 20 per ingrandire a 1:20). Omessa = stessa scala' }, titolo: { type: 'string' }, titolo_vista: { type: 'string' }, formato: { type: 'string', enum: ['auto', 'A4', 'A3', 'A2', 'A1', 'A0'], description: 'auto (predefinito) = il foglio più piccolo in cui le viste entrano alle scale chieste' }, orientamento: { type: 'string', enum: ['orizzontale', 'verticale'] }, nome_file: { type: 'string' } }, required: ['documento', 'zona'] },
  },
  {
    name: 'modifica_dxf',
    description: 'Modifica un disegno esistente e salva il nuovo DXF (e, se chiesto, la tavola PDF impaginata): parte da un DXF caricato (documento), da una tavola PDF vettoriale caricata (documento + pagina + scala_originale) o da un DXF già prodotto negli elaborati (elaborato). Operazioni in ordine: elimina_layer / tieni_layer {layer: [nomi, anche con *]}, rinomina_layer {da, a}, colore_layer {layer, colore}, sostituisci_testo {da, a}, elimina_testo {testo}, elimina_zona / ritaglia {x0, y0, x1, y1 in coordinate del disegno}, sposta {dx, dy}, ruota {gradi, centro}, scala {fattore, centro}, aggiungi {entita: elementi come in crea_tavola, nelle coordinate del disegno}. Per sapere coordinate, layer e testi apri prima il documento.',
    input_schema: {
      type: 'object',
      properties: {
        documento: { type: 'string' }, elaborato: { type: 'string', description: 'Nome di un file .dxf negli elaborati' }, pagina: { type: 'integer' }, zona, scala_originale: { type: 'number', description: 'Solo per i PDF: scala del disegno, per lavorare in metri reali' },
        operazioni: { type: 'array', items: { type: 'object', properties: { op: { type: 'string', enum: ['elimina_layer', 'tieni_layer', 'rinomina_layer', 'colore_layer', 'sostituisci_testo', 'elimina_testo', 'elimina_zona', 'ritaglia', 'sposta', 'ruota', 'scala', 'aggiungi'] }, layer: { type: 'array', items: { type: 'string' } }, da: { type: 'string' }, a: { type: 'string' }, testo: { type: 'string' }, colore: { type: 'integer' }, x0: { type: 'number' }, y0: { type: 'number' }, x1: { type: 'number' }, y1: { type: 'number' }, dx: { type: 'number' }, dy: { type: 'number' }, gradi: { type: 'number' }, fattore: { type: 'number' }, centro: punto, entita }, required: ['op'] } },
        nome_file: { type: 'string' },
        stampa: { type: 'object', description: 'Se presente, crea anche la tavola PDF impaginata', properties: { formato: { type: 'string', enum: ['auto', 'A4', 'A3', 'A2', 'A1', 'A0'] }, scala: { type: 'number' }, titolo: { type: 'string' }, titolo_vista: { type: 'string' } } },
        cartiglio: { type: 'object', properties: { numero: { type: 'string' }, progetto: { type: 'string' }, data: { type: 'string' }, redatto: { type: 'string' }, note: { type: 'string' } } },
      },
      required: ['operazioni'],
    },
  },
  {
    name: 'misura_aree',
    description: 'Interroga le aree: trova i contorni chiusi (locali campiti, sagome, solai, lotti) nella zona di una tavola PDF vettoriale e ne calcola area e perimetro reali in base alla scala. Utile per superfici utili, SUL, superfici da computare; verifica con i cartellini dei locali quando ci sono.',
    input_schema: { type: 'object', properties: { documento: { type: 'string' }, pagina: { type: 'integer' }, zona, scala: { type: 'number', description: 'Scala della vista (es. 100 per 1:100)' }, quante: { type: 'integer', description: 'Quanti contorni elencare (predefinito 25)' } }, required: ['documento', 'pagina'] },
  },
  {
    name: 'cerca_testo',
    description: 'Cerca una parola o una frase nel testo di tutti i PDF del progetto (codici, materiali, quote, riferimenti normativi, nomi di locali) e restituisce documento, pagina e riga. Usalo per trovare in fretta dove sta un\'informazione prima di aprire o ingrandire.',
    input_schema: { type: 'object', properties: { testo: { type: 'string' } }, required: ['testo'] },
  },
  {
    name: 'confronta',
    description: 'Confronta due tavole o due revisioni della stessa tavola e produce un\'immagine delle differenze (rosso = solo nella prima, blu = solo nella seconda) con l\'elenco delle zone cambiate, da ingrandire poi per descrivere le modifiche.',
    input_schema: { type: 'object', properties: { documento_a: { type: 'string' }, pagina_a: { type: 'integer' }, documento_b: { type: 'string' }, pagina_b: { type: 'integer' } }, required: ['documento_a', 'documento_b'] },
  },
  {
    name: 'crea_modello_3d',
    description: 'Crea (o aggiorna, con lo stesso nome) il modello 3D semplificato dell\'opera ricostruito dalle tavole: muri con aperture, solai, pilastri, blocchi (fondazioni, scale, volumi) e falde di copertura, in metri, con z = 0 al piano di riferimento (di solito il piano terra finito). Salva il visore 3D (HTML), OBJ, DXF 3D, un\'assonometria e le quantità. Da questo modello «viste_modello» ricava prospetti, sezioni e piante in automatico. Prima ricava con cura dimensioni, spessori, quote dei piani, aperture e coperture da piante, sezioni e prospetti.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        note: { type: 'string', description: 'Fonti e ipotesi (quali tavole, cosa è stimato)' },
        elementi: {
          type: 'array',
          items: {
            type: 'object',
            description: 'muro {da, a, spessore, z0, altezza, aperture:[{da (distanza dall\'inizio del muro), larghezza, davanzale (da z0), altezza}]}; solaio {contorno, quota (estradosso), spessore}; pilastro {centro, lati:[bx,by], z0, z1}; blocco {contorno, z0, z1}; falda {punti:[[x,y,z]…] piano inclinato, spessore}. Campo comune: materiale (cls, muratura, laterizio, legno, acciaio, terreno, isolante), colore (#rrggbb).',
            properties: {
              tipo: { type: 'string', enum: ['muro', 'solaio', 'pilastro', 'blocco', 'falda'] },
              da: punto, a: punto, spessore: { type: 'number' }, z0: { type: 'number' }, z1: { type: 'number' }, altezza: { type: 'number' },
              aperture: { type: 'array', items: { type: 'object', properties: { da: { type: 'number' }, larghezza: { type: 'number' }, davanzale: { type: 'number' }, altezza: { type: 'number' } }, required: ['da', 'larghezza', 'altezza'] } },
              contorno: { type: 'array', items: punto }, quota: { type: 'number' },
              centro: punto, lati: punto,
              punti: { type: 'array', items: { type: 'array', items: { type: 'number' }, description: '[x, y, z]' } },
              materiale: { type: 'string' }, colore: { type: 'string' },
            },
            required: ['tipo'],
          },
        },
      },
      required: ['nome', 'elementi'],
    },
  },
  {
    name: 'viste_modello',
    description: 'Genera da un modello 3D una tavola (PDF + DXF) con prospetti, sezioni, piante e assonometrie, con linee nascoste eliminate, campiture delle parti sezionate, linea di terra e quote di livello. Sezione: linea «da»→«a» in pianta, si guarda verso la sinistra della linea. Pianta: piano di taglio a «quota» (predefinita 1,20 m), vista dall\'alto. Prospetto: lato da cui si guarda (sud = guardando verso nord).',
    input_schema: {
      type: 'object',
      properties: {
        modello: { type: 'string', description: 'Nome del modello creato con crea_modello_3d' },
        viste: { type: 'array', items: { type: 'object', properties: { tipo: { type: 'string', enum: ['prospetto', 'sezione', 'pianta', 'assonometria'] }, titolo: { type: 'string' }, scala: { type: 'number' }, lato: { type: 'string', enum: ['nord', 'sud', 'est', 'ovest'] }, da: punto, a: punto, quota: { type: 'number' }, quota_terreno: { type: 'number' } }, required: ['tipo'] } },
        titolo: { type: 'string' }, nome_file: { type: 'string' }, formato: { type: 'string', enum: ['auto', 'A4', 'A3', 'A2', 'A1', 'A0'], description: 'auto (predefinito) = il foglio più piccolo in cui le viste entrano alle scale chieste' }, orientamento: { type: 'string', enum: ['orizzontale', 'verticale'] },
        cartiglio: { type: 'object', properties: { numero: { type: 'string' }, progetto: { type: 'string' }, data: { type: 'string' }, redatto: { type: 'string' }, note: { type: 'string' } } },
      },
      required: ['modello', 'viste'],
    },
  },
  {
    name: 'crea_schema',
    description: 'Salva uno schema, diagramma, cronoprogramma, schema di fasi o illustrazione disegnata in SVG, esportandolo anche in PNG e PDF.',
    input_schema: { type: 'object', properties: { nome_file: { type: 'string' }, titolo: { type: 'string' }, svg: { type: 'string', description: 'Documento SVG completo con viewBox, testi leggibili, sfondo bianco' } }, required: ['nome_file', 'titolo', 'svg'] },
  },
  {
    name: 'crea_tabella',
    description: 'Salva una tabella (computo metrico, elenco elaborati, quantità, verifiche) in CSV per Excel e la mostra nella chat. Usa numeri veri, non stringhe, per i valori numerici.',
    input_schema: { type: 'object', properties: { nome_file: { type: 'string' }, titolo: { type: 'string' }, colonne: { type: 'array', items: { type: 'string' } }, righe: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'null'] } } } }, required: ['nome_file', 'titolo', 'colonne', 'righe'] },
  },
  {
    name: 'annota_progetto',
    description: 'Aggiunge una nota permanente al progetto (decisioni, dati verificati, richieste): resterà disponibile in tutte le conversazioni future.',
    input_schema: { type: 'object', properties: { nota: { type: 'string' } }, required: ['nota'] },
  },
].map((t) => ({ ...t, eager_input_streaming: true }));

// Ricerca e lettura di pagine web (normativa, enti, manuali): eseguite dai server Anthropic.
const STRUMENTI_WEB = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'IT', timezone: 'Europe/Rome' } },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
];

// Con eager_input_streaming l'input arriva senza validazione dell'API: si controllano qui i campi obbligatori.
function controllaInput(nome, input) {
  const def = STRUMENTI.find((t) => t.name === nome);
  if (!def) return `strumento sconosciuto: ${nome}`;
  if (!input || typeof input !== 'object') return 'input mancante o non valido';
  const manca = def.input_schema.required.filter((k) => input[k] === undefined || input[k] === null || input[k] === '');
  return manca.length ? `campi obbligatori mancanti: ${manca.join(', ')}` : '';
}

// Una risposta completa: Claude ragiona, usa gli strumenti quante volte serve e alla fine risponde.
// p.messaggi si allunga soltanto (mai modificato a ritroso), così il ragionamento e la cache restano validi.
async function conversa({ cl, cfg, progetto: p, testo, esegui, evento, salva, segnale }) {
  // la conversazione cresce solo in coda: se note o schede sono cambiate, il nuovo contesto va in questo messaggio
  const ctx = contesto(p);
  if (ctx !== p.contestoInviato) {
    p.messaggi.push({ role: 'user', content: [{ type: 'text', text: `<contesto_progetto>\n${ctx}\n</contesto_progetto>` }, { type: 'text', text: testo }] });
    p.contestoInviato = ctx;
  } else p.messaggi.push({ role: 'user', content: testo });
  salva();
  for (let giro = 0; giro < MAX_GIRI; giro++) {
    if (segnale.interrotto) throw new Anthropic.APIUserAbortError();
    evento({ tipo: 'stato', testo: giro ? 'Continuo…' : 'Sto leggendo il progetto…' });
    const msg = await conRipiego(() => {
      const stream = cl.beta.messages.stream(richiesta({
        model: cfg.modello,
        max_tokens: 64000,
        output_config: { effort: cfg.impegno || 'high' },
        cache_control: { type: 'ephemeral' },
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        tools: STRUMENTI,
        messages: p.messaggi,
      }, { compatta: true, web: cfg.web !== false }));
      segnale.stream = stream;
      stream.on('text', (t) => evento({ tipo: 'testo', testo: t }));
      stream.on('streamEvent', (ev) => {
        if (ev.type !== 'content_block_start') return;
        const b = ev.content_block;
        if (b.type === 'thinking') evento({ tipo: 'stato', testo: 'Sto ragionando…' });
        else if (b.type === 'tool_use' || b.type === 'server_tool_use') evento({ tipo: 'stato', testo: DESCRIZIONE[b.name] || b.name });
        else if (b.type === 'compaction') evento({ tipo: 'stato', testo: 'Riassumo la conversazione per fare spazio…' });
      });
      return stream.finalMessage();
    }, { ripara: () => { togliRagionamenti(p.messaggi); salva(); } });
    segnale.stream = null;
    p.messaggi.push({ role: 'assistant', content: msg.content });
    // dopo una compattazione il contesto del progetto può essere finito nel riassunto: al prossimo turno si rimanda
    if (msg.content.some((b) => b.type === 'compaction')) p.contestoInviato = '';
    salva();
    if (msg.stop_reason === 'refusal') { evento({ tipo: 'testo', testo: '\n\n_(Claude non può rispondere a questa richiesta.)_' }); return; }
    if (msg.stop_reason === 'pause_turn') continue;
    const usi = msg.content.filter((b) => b.type === 'tool_use');
    if (!usi.length) {
      if (msg.stop_reason === 'max_tokens') evento({ tipo: 'testo', testo: '\n\n_(Risposta troncata: chiedi «continua».)_' });
      return;
    }
    const risultati = [];
    for (const u of usi) {
      let err = msg.stop_reason === 'max_tokens' ? 'la richiesta è stata troncata perché troppo lunga: dividi il lavoro in più parti' : controllaInput(u.name, u.input);
      let content;
      if (!err) {
        try { content = await esegui(u.name, u.input); } catch (e) { err = messaggioErrore(e); }
      }
      risultati.push(err ? { type: 'tool_result', tool_use_id: u.id, content: `Errore: ${err}`, is_error: true } : { type: 'tool_result', tool_use_id: u.id, content });
    }
    p.messaggi.push({ role: 'user', content: risultati });
    salva();
    evento({ tipo: 'testo', testo: '\n\n' });
  }
  evento({ tipo: 'testo', testo: '\n\n_(Mi fermo qui: scrivi «continua» per proseguire.)_' });
}

const DESCRIZIONE = {
  apri_documento: 'Apro un documento…',
  ingrandisci: 'Ingrandisco la tavola…',
  crea_relazione: 'Scrivo la relazione…',
  crea_tavola: 'Disegno la tavola…',
  converti_in_dxf: 'Converto la tavola in DXF…',
  estrai_dettaglio: 'Ritaglio e rimetto in scala…',
  misura_aree: 'Misuro le aree…',
  modifica_dxf: 'Modifico il disegno…',
  cerca_testo: 'Cerco nel progetto…',
  confronta: 'Confronto le tavole…',
  crea_modello_3d: 'Costruisco il modello 3D…',
  viste_modello: 'Genero prospetti e sezioni dal modello…',
  crea_schema: 'Disegno lo schema…',
  crea_tabella: 'Preparo la tabella…',
  annota_progetto: 'Annoto nel progetto…',
  web_search: 'Cerco sul web (normativa, enti, manuali)…',
  web_fetch: 'Leggo una pagina web…',
};

module.exports = { client, impronta, messaggioErrore, caricaDocumento, schedaDocumento, blocchiDocumento, conversa, STRUMENTI };
