// Moduli del Coordinatore per la sicurezza in fase di esecuzione.
// Ogni modulo riceve ctx = { archivio, servizi, piattaforma, cantiere, resto, ricarica }
// e restituisce l'elemento della pagina. I dati si leggono una volta per
// pagina con stato(ctx).

import { registra } from '../core/registro.js';
import { CAMPI_ANAGRAFICA, GRUPPI_ANAGRAFICA, nuovaImpresa, nuovoPos } from '../core/modelli.js';
import { SEZIONI, cartellaSezione, nomeSicuro, percorso } from '../core/cartelle.js';
import { confronta, dataIt, dataOraIt, isoLocale, oggi } from '../core/date.js';
import { nuovoId } from '../core/id.js';
import { h, avviso, bottone, campi, chiedi, conferma, finestra, nota, pill, scheda, tabella, testata, vuoto } from '../ui/dom.js';
import { icona } from '../ui/icone.js';
import { indirizzo, vai } from '../ui/router.js';
import { caricaDocumento, elencoDocumenti, percorsoDocumento } from '../servizi/documenti.js';
import { importaFoto, ordinaFoto, perGiorno } from '../servizi/foto.js';
import { timbraFoto } from '../servizi/timbro.js';
import {
  applicaProposta, completaVerifica, descriviDocumentazione, documentiDaEsaminare, esitoProposto, idoneitaProposta, integrazioniProposte,
  letteraProposta, nuovaVerifica, posInOrdine, situazionePos, verificaDelPos,
} from '../servizi/pos.js';
import { controllaRisposta, MODELLO_CLAUDE, richiestaVerifica } from '../servizi/claude.js';
import { fotoDelGiorno, nomeFileVoce, nuovaVoce, ordinaVoci } from '../servizi/giornale.js';
import { chiudi, nomeFileVerbale, numeriDoppi, nuovoVerbaleSopralluogo, prescrizioniAperte } from '../servizi/verbali.js';
import { htmlChecklistPos, htmlLetteraPos, htmlVerbale } from '../servizi/stampa.js';
import { CHECKLIST_POS, CONTROLLI_SOPRALLUOGO, ESITI_CHECKLIST, ESITI_CONTROLLO, ESITI_VERIFICA_POS, SEZIONI_CHECKLIST } from '../servizi/normativa.js';

// ================================================================== aiuti

/** Tutti i dati del cantiere che servono alle pagine (letti una volta per pagina). */
function stato(ctx) {
  if (!ctx._stato) {
    ctx._stato = (async () => {
      const cod = ctx.cantiere.codice;
      const a = ctx.archivio;
      const imprese = await a.elencoImprese(cod);
      const pos = [];
      for (const imp of imprese) pos.push(...(await a.leggiTutti(a.cartellaPos(cod, imp))).filter((x) => x.tipo === 'pos'));
      const verifiche = await a.registrazioni(cod, 'verifichePos');
      const verbali = (await a.registrazioni(cod, 'verbali')).sort((x, y) => (y.numero - x.numero) || confronta(y.data, x.data));
      const documenti = {};
      for (const s of ['progetto', 'psc', 'notifica']) documenti[s] = await elencoDocumenti(a, cod, s);
      return {
        imprese, pos, verifiche, verbali, documenti,
        situazione: situazionePos(imprese, pos, verifiche),
        aperte: prescrizioniAperte(verbali),
        voci: ordinaVoci(await a.registrazioni(cod, 'giornale')),
        foto: await a.registrazioni(cod, 'foto'),
      };
    })();
  }
  return ctx._stato;
}

/** Fa scegliere file dal dispositivo: [{ nome, byte, modificato }]. */
async function scegliFile(ctx, { accetta = '*', multipli = true } = {}) {
  if (ctx.servizi.scegliFile) return ctx.servizi.scegliFile({ accetta, multipli });
  return new Promise((ok) => {
    const inp = h('input', { type: 'file', accept: accetta, multiple: multipli });
    inp.addEventListener('change', async () => {
      const out = [];
      for (const f of inp.files) out.push({ nome: f.name, byte: new Uint8Array(await f.arrayBuffer()), modificato: f.lastModified });
      ok(out);
    });
    inp.click();
  });
}

async function apri(ctx, p) {
  try {
    await ctx.archivio.apri(p);
  } catch (e) {
    avviso(e.message, 'errore');
  }
}

/** Salva l'HTML in PDF nella cartella indicata (dove la piattaforma lo permette). */
async function salvaPdf(ctx, html, p) {
  if (ctx.servizi.pdfDaHtml) {
    await ctx.servizi.pdfDaHtml(html, p);
    avviso(`PDF salvato: ${p.split('/').pop()}`);
    await apri(ctx, p);
  } else if (ctx.servizi.stampa) {
    // Android: finestra di stampa del telefono (stampante o «Salva come PDF»)
    await ctx.servizi.stampa(html, p.split('/').pop().replace(/\.pdf$/i, ''));
  } else {
    const w = window.open('', '_blank');
    if (!w) return avviso('Stampa non disponibile su questo dispositivo', 'errore');
    w.document.write(html);
    w.document.close();
    w.print();
  }
}

/** Esegue un'azione mostrando l'errore, se c'è. */
const prova = (f) => async (...a) => {
  try {
    await f(...a);
  } catch (e) {
    console.error(e);
    avviso(e.message, 'errore');
  }
};

const TIPO_ESITO_POS = { idoneo: 'ok', idoneo_con_prescrizioni: 'at', non_idoneo: 'ko' };
const TIPO_VOCE_POS = { si: 'ok', no: 'ko', np: '' };
const TIPO_CONTROLLO = { conforme: 'ok', non_conforme: 'ko', nv: '' };
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const giorno = (data) => GIORNI[new Date(`${data}T12:00`).getDay()];

/** Scelta a segmenti: seg({ si: 'Presente', ... }, valore, onCambia, tipi) */
function seg(opzioni, valore, onCambia, tipi = {}, bloccato = false) {
  const el = h('div', { class: 'seg', role: 'group' });
  const disegna = (v) => el.replaceChildren(...Object.entries(opzioni).map(([k, t]) =>
    h('button', { type: 'button', disabled: bloccato, class: `${k === v ? 'on' : ''} ${tipi[k] || ''}`, onclick: () => { onCambia(k); disegna(k); } }, t)));
  disegna(valore);
  return el;
}

/**
 * Elenco modificabile di righe (presenti, non conformità, prescrizioni).
 * colonne: [{ chiave, etichetta, tipo: 'testo'|'data'|'scelta', opzioni, elenco }]
 * Modifica `lista` sul posto.
 */
function righe(lista, colonne, { nuova = () => ({}), testoAggiungi = 'Aggiungi', bloccato = false, vuota = 'Nessuna' } = {}) {
  const corpo = h('tbody');
  const cella = (r, c) => {
    const aggiorna = (e) => { r[c.chiave] = e.target.value; };
    if (c.tipo === 'scelta') {
      return h('select', { disabled: bloccato, onchange: aggiorna }, h('option', { value: '' }, '—'),
        Object.entries(c.opzioni).map(([k, t]) => h('option', { value: k, selected: r[c.chiave] === k }, t)));
    }
    return h('input', { type: c.tipo === 'data' ? 'date' : 'text', value: r[c.chiave] || '', readonly: bloccato, list: c.elenco, oninput: aggiorna, placeholder: c.suggerimento });
  };
  const disegna = () => corpo.replaceChildren(...(lista.length
    ? lista.map((r, i) => h('tr', {}, colonne.map((c) => h('td', { style: c.larghezza ? `width:${c.larghezza}` : null }, cella(r, c))),
      h('td', { class: 'stretta' }, bloccato ? null : bottone('cestino', '', () => { lista.splice(i, 1); disegna(); }, 'q sm icona', { title: 'Togli' }))))
    : [h('tr', {}, h('td', { colspan: colonne.length + 1, class: 'mu' }, vuota))]));
  disegna();
  return {
    tabella: tabella([...colonne.map((c) => c.etichetta), ''], corpo),
    aggiungi: bloccato ? null : bottone('piu', testoAggiungi, () => { lista.push(nuova()); disegna(); corpo.querySelector('tr:last-child input')?.focus(); }, 'sm'),
  };
}

function barraSalva(stato, ...pulsanti) {
  return h('div', { class: 'barra-salva' }, h('span', { class: 'stato' }, stato), pulsanti);
}

// ================================================================== riepilogo
registra({
  id: 'riepilogo', titolo: 'Riepilogo', ruolo: 'cse', ordine: 5, icona: 'riepilogo',
  async disegna(ctx) {
    const c = ctx.cantiere;
    const cod = c.codice;
    const s = await stato(ctx);
    const operative = s.situazione.filter((x) => x.puoLavorare).length;
    const scadute = s.aperte.filter((p) => p.entro && p.entro < oggi());
    const ultimo = s.verbali[0];
    const ultimaVoce = s.voci[0];
    const kpi = (classe, href, titolo, valore, sotto) => h('a', { class: classe, href }, h('small', {}, titolo), h('b', {}, valore), h('span', {}, sotto));

    // cose da fare, dalle più urgenti
    const dafare = [];
    for (const p of scadute) dafare.push(['ko', `Prescrizione scaduta il ${dataIt(p.entro)}: ${p.descrizione}`, indirizzo(cod, 'verbali')]);
    for (const x of s.situazione) if (x.daFare) dafare.push([x.puoLavorare ? 'at' : 'ko', `${x.impresa.ragioneSociale}: ${x.daFare}`, indirizzo(cod, 'impresa', x.impresa.id)]);
    if (numeriDoppi(s.verbali).length) dafare.push(['ko', `Verbali con lo stesso numero: ${numeriDoppi(s.verbali).join(', ')}`, indirizzo(cod, 'verbali')]);
    if (!s.documenti.notifica.length) dafare.push(['at', 'Caricare la notifica preliminare', indirizzo(cod, 'notifica')]);
    if (!s.documenti.psc.length) dafare.push(['at', 'Caricare il PSC', indirizzo(cod, 'psc')]);
    if (!c.cse?.nome) dafare.push(['at', 'Completare l’anagrafica: nome del CSE', indirizzo(cod, 'anagrafica')]);

    const fine = c.inizioLavori && c.durataGiorni ? new Date(new Date(`${c.inizioLavori}T12:00`).getTime() + c.durataGiorni * 864e5) : null;
    const dati = [
      ['Opera', c.denominazione], ['Indirizzo', [c.indirizzo, c.comune].filter(Boolean).join(', ')],
      ['Committente', (c.committenti || []).map((p) => p.nome).join('; ')], ['Responsabile dei lavori', c.responsabileLavori?.nome],
      ['CSP', c.csp?.nome], ['CSE', c.cse?.nome], ['Direttore dei lavori', c.direttoreLavori?.nome],
      ['Notifica preliminare', dataIt(c.dataNotifica)], ['Inizio lavori', dataIt(c.inizioLavori)],
      ['Fine presunta', fine ? dataIt(oggi(fine)) : ''],
    ].filter(([, v]) => v);

    return h('div', {},
      testata(c.denominazione, `${c.codice}${c.comune ? ` · ${c.comune}` : ''}`,
        ctx.servizi.scatta ? bottone('scatta', 'Foto', () => vai(indirizzo(cod, 'foto'))) : null,
        bottone('verbali', 'Nuovo verbale', prova(() => nuovoVerbaleDa(ctx)), 'p')),
      h('div', { class: 'kpi' },
        kpi(s.imprese.length && operative === s.imprese.length ? 'ok' : 'at', indirizzo(cod, 'imprese'), 'Imprese operative', `${operative}/${s.imprese.length}`, 'con POS idoneo'),
        kpi(scadute.length ? 'ko' : s.aperte.length ? 'at' : 'ok', indirizzo(cod, 'verbali'), 'Prescrizioni aperte', s.aperte.length, scadute.length ? `${scadute.length} scadut${scadute.length === 1 ? 'a' : 'e'}` : 'nessuna scaduta'),
        kpi('', indirizzo(cod, 'verbali'), 'Verbali', s.verbali.length, ultimo ? `ultimo n. ${ultimo.numero} del ${dataIt(ultimo.data)}` : 'nessuno'),
        kpi('', indirizzo(cod, 'giornale'), 'Giornale', s.voci.length, ultimaVoce ? `ultima voce ${dataIt(ultimaVoce.data)}` : 'nessuna voce'),
        kpi('', indirizzo(cod, 'foto'), 'Foto', s.foto.length, s.foto.length ? `ultima ${dataIt(ordinaFoto(s.foto).at(-1).scattata)}` : 'nessuna')),
      h('div', { class: 'colonne' },
        scheda({
          titolo: 'Da fare', ico: 'attenzione',
          corpo: h('ul', { class: 'dafare' }, dafare.length
            ? dafare.map(([t, testo, href]) => h('li', { class: t }, icona(t === 'ko' ? 'attenzione' : 'info'), h('a', { href }, testo)))
            : h('li', { class: 'ok' }, icona('ok'), 'Tutto in ordine')),
        }),
        scheda({
          titolo: 'Cantiere', ico: 'anagrafica', azioni: [bottone('matita', 'Modifica', () => vai(indirizzo(cod, 'anagrafica')), 'q sm')],
          tabella: h('table', { class: 't' }, h('tbody', {}, dati.map(([k, v]) => h('tr', {}, h('td', { class: 'mu stretta' }, k), h('td', {}, v))))),
        })));
  },
});

// ================================================================== anagrafica
registra({
  id: 'anagrafica', titolo: 'Anagrafica di cantiere', titoloBreve: 'Anagrafica', ruolo: 'cse', ordine: 10, icona: 'anagrafica',
  async disegna(ctx) {
    const c = ctx.cantiere;
    const statoCantiere = { chiave: 'stato', etichetta: 'Stato del cantiere', tipo: 'scelta', vuota: false, gruppo: 'opera', opzioni: { in_corso: 'In corso', sospeso: 'Sospeso', concluso: 'Concluso' } };
    const elenco = [...CAMPI_ANAGRAFICA, statoCantiere].map((x) => (x.chiave === 'codice' ? { ...x, solaLettura: true, rif: 'nome della cartella' } : x));
    const gruppi = Object.entries(GRUPPI_ANAGRAFICA).map(([g, titolo]) => ({ titolo, f: campi(elenco.filter((x) => x.gruppo === g), c) }));
    const salva = prova(async () => {
      const dati = Object.assign({}, ...gruppi.map((g) => g.f.leggi()));
      await ctx.archivio.salvaCantiere({ ...c, ...dati, codice: c.codice });
      avviso('Anagrafica salvata');
      ctx.ricarica();
    });
    return h('div', {},
      testata('Anagrafica di cantiere', 'Contenuti della notifica preliminare (art. 99 e Allegato XII D.Lgs 81/08) e soggetti del cantiere'),
      h('div', { class: 'pila' }, gruppi.map((g) => scheda({ titolo: g.titolo, corpo: g.f.el }))),
      barraSalva(`Ultima modifica ${dataOraIt(c.modificato)}`, bottone('salva', 'Salva', salva, 'p')));
  },
});

// ================================================================== documenti
const ICONE_DOC = { progetto: 'progetto', psc: 'psc', notifica: 'notifica' };
const TITOLI_BREVI = { progetto: 'Progetto', psc: 'PSC', notifica: 'Notifica preliminare' };
const SPIEGAZIONI = {
  progetto: 'Elaborati di progetto: tavole, relazioni, computo. Ogni revisione resta in archivio.',
  psc: 'Piano di sicurezza e coordinamento (art. 100 e Allegato XV) con i suoi aggiornamenti.',
  notifica: 'Notifica preliminare (art. 99) e suoi aggiornamenti; copia da affiggere in cantiere.',
};

for (const [i, sezione] of ['progetto', 'psc', 'notifica'].entries()) {
  registra({
    id: sezione, titolo: SEZIONI[sezione].titolo, titoloBreve: TITOLI_BREVI[sezione], ruolo: 'cse', ordine: 20 + i, sezione, icona: ICONE_DOC[sezione],
    async disegna(ctx) {
      const cod = ctx.cantiere.codice;
      const docs = (await stato(ctx)).documenti[sezione];
      const carica = prova(async () => {
        let n = 0;
        for (const f of await scegliFile(ctx)) {
          const dati = await chiedi({
            titolo: 'Carica documento', testo: f.nome, ok: 'Carica',
            campi: [
              { chiave: 'titolo', etichetta: 'Titolo', tipo: 'testo', obbligatorio: true, largo: true },
              { chiave: 'revisione', etichetta: 'Revisione', tipo: 'testo' },
              { chiave: 'data', etichetta: 'Data del documento', tipo: 'data' },
              { chiave: 'autore', etichetta: 'Redatto da', tipo: 'testo', largo: true },
            ],
            valori: { titolo: f.nome.replace(/\.[^.]+$/, ''), revisione: '0', data: oggi() },
          });
          if (!dati) continue;
          await caricaDocumento(ctx.archivio, cod, sezione, f, dati);
          n++;
        }
        if (n) avviso(n === 1 ? 'Documento caricato' : `${n} documenti caricati`);
        ctx.ricarica();
      });
      return h('div', {},
        testata(SEZIONI[sezione].titolo, SPIEGAZIONI[sezione], bottone('carica', 'Carica documenti', carica, 'p')),
        docs.length
          ? h('div', { class: 'tw' }, tabella(['Documento', 'Rev.', 'Data', ''], docs.map((d) => h('tr', { class: 'cliccabile', onclick: () => apri(ctx, percorsoDocumento(cod, d)) },
            h('td', {}, h('b', {}, d.titolo), h('span', { class: 'sotto' }, d.file, d.autore ? ` · ${d.autore}` : '')),
            h('td', { class: 'stretta' }, d.revisione), h('td', { class: 'stretta' }, dataIt(d.data)),
            h('td', { class: 'az' }, bottone('apri', 'Apri', (e) => { e.stopPropagation(); apri(ctx, percorsoDocumento(cod, d)); }, 'sm'))))))
          : scheda({ corpo: vuoto(ICONE_DOC[sezione], 'Nessun documento', 'I file vengono copiati nella cartella del cantiere; l’originale resta dov’è.', bottone('carica', 'Carica documenti', carica, 'p')) }));
    },
  });
}

// ================================================================== imprese e POS
const RUOLI_IMPRESA = { affidataria: 'Affidataria', esecutrice: 'Esecutrice', subappaltatrice: 'Subappaltatrice' };
const CAMPI_IMPRESA = (altre) => [
  { chiave: 'ragioneSociale', etichetta: 'Ragione sociale', tipo: 'testo', obbligatorio: true, largo: true },
  { chiave: 'tipoSoggetto', etichetta: 'Soggetto', tipo: 'scelta', vuota: false, opzioni: { impresa: 'Impresa', lavoratore_autonomo: 'Lavoratore autonomo' } },
  { chiave: 'ruolo', etichetta: 'Ruolo', tipo: 'scelta', vuota: false, opzioni: RUOLI_IMPRESA },
  { chiave: 'affidataria', etichetta: 'Impresa affidataria (per i subappalti)', tipo: 'scelta', opzioni: Object.fromEntries(altre.map((i) => [i.id, i.ragioneSociale])) },
  { chiave: 'partitaIva', etichetta: 'Partita IVA', tipo: 'testo' },
  { chiave: 'codiceFiscale', etichetta: 'Codice fiscale', tipo: 'testo' },
  { chiave: 'sede', etichetta: 'Sede', tipo: 'testo', largo: true },
  { chiave: 'telefono', etichetta: 'Telefono', tipo: 'testo' },
  { chiave: 'pec', etichetta: 'PEC', tipo: 'testo' },
  { chiave: 'email', etichetta: 'E-mail', tipo: 'testo' },
  { chiave: 'datoreLavoro', etichetta: 'Datore di lavoro', tipo: 'testo', rif: 'All. XV 3.2.1 a.1' },
  { chiave: 'direttoreTecnico', etichetta: 'Direttore tecnico di cantiere', tipo: 'testo', rif: 'a.6' },
  { chiave: 'capocantiere', etichetta: 'Capocantiere / preposto', tipo: 'testo', rif: 'a.6' },
  { chiave: 'rspp', etichetta: 'RSPP', tipo: 'testo', rif: 'a.5' },
  { chiave: 'medicoCompetente', etichetta: 'Medico competente', tipo: 'testo', rif: 'a.5' },
  { chiave: 'rls', etichetta: 'RLS', tipo: 'testo', rif: 'a.5' },
  { chiave: 'lavorazioni', etichetta: 'Lavorazioni affidate', tipo: 'testo_lungo' },
  { chiave: 'ingresso', etichetta: 'Ingresso in cantiere', tipo: 'data' },
  { chiave: 'uscita', etichetta: 'Uscita dal cantiere', tipo: 'data' },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo_lungo' },
];

function pillSituazione(x) {
  if (x.puoLavorare) return pill(ESITI_VERIFICA_POS[x.verifica.esito], TIPO_ESITO_POS[x.verifica.esito]);
  if (x.verifica?.esito === 'non_idoneo') return pill('POS non idoneo', 'ko');
  if (x.pos) return pill('POS da verificare', 'at');
  return pill('POS mancante', 'ko');
}

const ACCETTA_DOC = '.pdf,application/pdf,image/jpeg,image/png,.jpg,.jpeg,.png';

async function caricaPos(ctx, impresa, posImpresa) {
  const [f] = await scegliFile(ctx, { accetta: '.pdf,application/pdf', multipli: false });
  if (!f) return false;
  const dati = await chiedi({
    titolo: `POS di ${impresa.ragioneSociale}`, testo: f.nome, ok: 'Carica',
    campi: [
      { chiave: 'revisione', etichetta: 'Revisione', tipo: 'testo' },
      { chiave: 'dataPos', etichetta: 'Data del POS', tipo: 'data' },
      { chiave: 'dataRicezione', etichetta: 'Ricevuto il', tipo: 'data', obbligatorio: true },
    ],
    valori: { revisione: String(posImpresa.length), dataRicezione: oggi() },
  });
  if (!dati) return false;
  const cart = ctx.archivio.cartellaPos(ctx.cantiere.codice, impresa);
  const nome = await ctx.archivio.salvaFile(cart, f.nome, f.byte);
  const pos = { ...nuovoPos({ impresa: impresa.id, file: nome, ...dati }), _file: `${nome}.json` };
  await ctx.archivio.scriviJson(percorso(cart, pos._file), pos);
  if (await conferma('Allegati del POS', 'Sono arrivati anche allegati (attestati di formazione, idoneità sanitarie, DURC, visura, DVR, dichiarazioni, ...)? Puoi aggiungerli anche dopo, dalla scheda dell’impresa.', 'Carica gli allegati')) {
    await caricaAllegati(ctx, impresa, pos);
  }
  avviso('POS caricato: ora va verificato');
  return true;
}

/** Aggiunge allegati a una revisione del POS (nella cartella «Allegati rev N»). */
async function caricaAllegati(ctx, impresa, pos) {
  const files = await scegliFile(ctx, { accetta: ACCETTA_DOC, multipli: true });
  if (!files.length) return 0;
  const dati = await chiedi({
    titolo: `Allegati al POS rev. ${pos.revisione}`,
    testo: files.length === 1 ? files[0].nome : `${files.length} file`,
    ok: 'Carica',
    campi: [{ chiave: 'data', etichetta: 'Ricevuti il', tipo: 'data', obbligatorio: true }],
    valori: { data: oggi() },
  });
  if (!dati) return 0;
  const cartPos = ctx.archivio.cartellaPos(ctx.cantiere.codice, impresa);
  const sotto = `Allegati rev ${nomeSicuro(pos.revisione, '0')}`;
  pos.allegati = pos.allegati || [];
  for (const f of files) {
    const nome = await ctx.archivio.salvaFile(percorso(cartPos, sotto), f.nome, f.byte);
    pos.allegati.push({ file: `${sotto}/${nome}`, titolo: nome.replace(/\.[^.]+$/, ''), data: dati.data });
  }
  await ctx.archivio.scriviJson(percorso(cartPos, pos._file || `${pos.file}.json`), pos);
  avviso(files.length === 1 ? 'Allegato caricato' : `${files.length} allegati caricati`);
  return files.length;
}

/** Finestra con gli allegati di una revisione: apri, togli, aggiungi. */
function finestraAllegati(ctx, impresa, pos) {
  const cartPos = ctx.archivio.cartellaPos(ctx.cantiere.codice, impresa);
  const corpo = h('div');
  let cambiato = false;
  const disegna = () => corpo.replaceChildren(pos.allegati?.length
    ? h('div', { class: 'tw', style: 'box-shadow:none' }, tabella(['Allegato', 'Ricevuto', ''], pos.allegati.map((a, i) => h('tr', {},
      h('td', {}, h('b', {}, a.titolo), h('span', { class: 'sotto' }, a.file.split('/').pop())),
      h('td', { class: 'stretta' }, dataIt(a.data)),
      h('td', { class: 'az' },
        bottone('apri', 'Apri', () => apri(ctx, percorso(cartPos, a.file)), 'sm'),
        bottone('cestino', '', prova(async () => {
          if (!(await conferma('Togliere l’allegato?', `${a.titolo}: il file viene eliminato dalla cartella del cantiere.`, 'Togli', true))) return;
          await ctx.archivio.disco.elimina(percorso(cartPos, a.file));
          pos.allegati.splice(i, 1);
          await ctx.archivio.scriviJson(percorso(cartPos, pos._file || `${pos.file}.json`), pos);
          cambiato = true;
          disegna();
        }), 'q sm icona', { title: 'Togli' }))))))
    : vuoto('carica', 'Nessun allegato', 'Attestati di formazione, idoneità sanitarie, DURC, visura camerale, DVR, dichiarazioni: quello che l’impresa ha mandato con il POS o dopo.'));
  disegna();
  const { dlg } = finestra(`Allegati al POS rev. ${pos.revisione} – ${impresa.ragioneSociale}`, corpo, [
    bottone('carica', 'Aggiungi allegati', prova(async () => { if (await caricaAllegati(ctx, impresa, pos)) { cambiato = true; disegna(); } }), 'p'),
  ], 'grande');
  dlg.addEventListener('close', () => { if (cambiato) ctx.ricarica(); });
}

registra({
  id: 'imprese', titolo: 'Imprese, POS e verifiche', titoloBreve: 'Imprese e POS', ruolo: 'cse', ordine: 30, sezione: 'imprese', icona: 'imprese',
  conta: async (ctx) => (await stato(ctx)).situazione.filter((x) => !x.puoLavorare).length,
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const s = await stato(ctx);
    const nuova = prova(async () => {
      const dati = await chiedi({
        titolo: 'Nuova impresa', ok: 'Aggiungi',
        campi: [...CAMPI_IMPRESA(s.imprese).slice(0, 4), { chiave: 'ingresso', etichetta: 'Ingresso in cantiere', tipo: 'data' }],
        valori: { tipoSoggetto: 'impresa', ruolo: 'esecutrice', ingresso: oggi() },
      });
      if (!dati) return;
      const imp = await ctx.archivio.salvaImpresa(cod, nuovaImpresa(dati));
      vai(indirizzo(cod, 'impresa', imp.id));
    });
    const nomi = new Map(s.imprese.map((i) => [i.id, i.ragioneSociale]));
    const ruolo = (i) => (i.ruolo === 'subappaltatrice' && nomi.get(i.affidataria) ? `Subappaltatrice di ${nomi.get(i.affidataria)}` : RUOLI_IMPRESA[i.ruolo] || '')
      + (i.tipoSoggetto === 'lavoratore_autonomo' ? ' · lavoratore autonomo' : '');
    return h('div', {},
      testata('Imprese, POS e verifiche', 'Un’impresa lavora solo con il POS verificato idoneo (art. 92 c. 1 lett. b)', bottone('piu', 'Nuova impresa', nuova, 'p')),
      s.situazione.length
        ? h('div', { class: 'tw' }, tabella(['Impresa', 'POS', 'Verifica', 'Da fare'], s.situazione.map((x) => h('tr', { class: 'cliccabile', onclick: () => vai(indirizzo(cod, 'impresa', x.impresa.id)) },
          h('td', {}, h('b', {}, x.impresa.ragioneSociale), h('span', { class: 'sotto' }, ruolo(x.impresa))),
          h('td', {}, x.pos ? `rev. ${x.pos.revisione}` : '—', x.pos ? h('span', { class: 'sotto' }, `ricevuto il ${dataIt(x.pos.dataRicezione)}${x.pos.allegati?.length ? ` · ${x.pos.allegati.length} allegati` : ''}`) : null),
          h('td', {}, pillSituazione(x), x.verifica?.data ? h('span', { class: 'sotto' }, dataIt(x.verifica.data)) : null),
          h('td', {}, x.daFare || h('span', { class: 'mu' }, '—'))))))
        : scheda({ corpo: vuoto('imprese', 'Nessuna impresa', 'Aggiungi le imprese affidatarie, esecutrici e i lavoratori autonomi: per ognuna si caricano il POS e la verifica.', bottone('piu', 'Nuova impresa', nuova, 'p')) }));
  },
});

// scheda di un'impresa (aperta da "Imprese")
registra({
  id: 'impresa', titolo: 'Impresa', ruolo: 'cse', ordine: 998, nascosto: true, menu: 'imprese',
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const s = await stato(ctx);
    const imp = s.imprese.find((i) => i.id === ctx.resto[0]);
    if (!imp) throw new Error('Impresa non trovata');
    const f = campi(CAMPI_IMPRESA(s.imprese.filter((i) => i.id !== imp.id)), imp);
    const posImpresa = posInOrdine(s.pos, imp.id).reverse();
    const x = s.situazione.find((y) => y.impresa.id === imp.id);
    const salva = prova(async () => {
      await ctx.archivio.salvaImpresa(cod, { ...imp, ...f.leggi() });
      avviso('Impresa salvata');
      ctx.ricarica();
    });
    const caricaBtn = bottone('carica', posImpresa.length ? 'Nuova revisione' : 'Carica POS', prova(async () => { if (await caricaPos(ctx, imp, posImpresa)) ctx.ricarica(); }), posImpresa.length ? 'sm' : 'p sm');
    return h('div', {},
      testata(imp.ragioneSociale, x.daFare ? `Da fare: ${x.daFare}` : 'POS verificato e trasmesso', pillSituazione(x),
        h('a', { class: 'bottone', href: indirizzo(cod, 'imprese') }, icona('indietro'), 'Imprese')),
      h('div', { class: 'pila' },
        scheda({
          titolo: 'Piano operativo di sicurezza: revisioni e allegati', ico: 'psc', azioni: [caricaBtn],
          tabella: posImpresa.length ? tabella(['Revisione', 'Ricevuto', 'Allegati', 'Verifica', ''], posImpresa.map((p, i) => {
            const v = verificaDelPos(s.verifiche, p.id);
            return h('tr', { class: i ? 'superata' : '' },
              h('td', {}, h('b', {}, `rev. ${p.revisione}`), i ? [' ', pill('superata')] : null, h('span', { class: 'sotto' }, p.file, p.dataPos ? ` · del ${dataIt(p.dataPos)}` : '')),
              h('td', {}, dataIt(p.dataRicezione)),
              h('td', {}, bottone('carica', p.allegati?.length ? `${p.allegati.length}` : 'Aggiungi', () => finestraAllegati(ctx, imp, p), 'q sm', { title: 'Allegati di questa revisione' }),
                p.allegati?.length ? h('span', { class: 'sotto' }, `ultimo ${dataIt(p.allegati.map((a) => a.data).sort().at(-1))}`) : null),
              h('td', {}, v?.esito ? pill(ESITI_VERIFICA_POS[v.esito], TIPO_ESITO_POS[v.esito]) : pill('Da verificare', 'at'),
                v?.trasmessaIl ? h('span', { class: 'sotto' }, `trasmessa il ${dataIt(v.trasmessaIl)}`) : v?.data ? h('span', { class: 'sotto' }, dataIt(v.data)) : null),
              h('td', { class: 'az' },
                bottone('apri', 'Apri', () => apri(ctx, percorso(ctx.archivio.cartellaPos(cod, imp), p.file)), 'sm'),
                bottone('psc', v ? 'Verifica' : 'Verifica ora', () => vai(indirizzo(cod, 'verifica', imp.id, p.id)), v || i ? 'sm' : 'p sm')));
          })) : null,
          corpo: posImpresa.length ? null : vuoto('psc', 'POS non ancora ricevuto', 'Carica il PDF del POS ricevuto dall’impresa e i suoi allegati: poi si fa la verifica di idoneità. Gli aggiornamenti si caricano come nuove revisioni.'),
        }),
        scheda({ titolo: 'Dati dell’impresa', ico: 'imprese', corpo: f.el })),
      barraSalva(`Ultima modifica ${dataOraIt(imp.modificato)}`, bottone('salva', 'Salva', salva, 'p')));
  },
});

// ------------------------------------------------------------------ verifica del POS
const bozzeVerifica = new Map(); // id del POS -> verifica proposta da Claude, non ancora salvata

/** Campo di testo legato a una proprietà di un oggetto. */
function testoLegato(obj, chiave, { righe = 0, suggerimento = '', bloccato = false } = {}) {
  const aggiorna = (e) => { obj[chiave] = e.target.value; };
  return righe
    ? h('textarea', { rows: righe, placeholder: suggerimento, readonly: bloccato, oninput: aggiorna }, obj[chiave] || '')
    : h('input', { type: 'text', value: obj[chiave] || '', placeholder: suggerimento, readonly: bloccato, oninput: aggiorna });
}

/** Editor delle integrazioni richieste: titolo e testo, aggiungi e togli. */
function editorIntegrazioni(v, onCambia = () => {}) {
  const el = h('div', { class: 'integrazioni' });
  const disegna = () => el.replaceChildren(
    v.integrazioni.length ? h('ol', {}, v.integrazioni.map((it, i) => h('li', {},
      h('div', { class: 'riga-int' }, testoLegato(it, 'titolo', { suggerimento: 'Titolo (es. DURC, Primo soccorso e antincendio)' }),
        bottone('cestino', '', () => { v.integrazioni.splice(i, 1); disegna(); onCambia(); }, 'q sm icona', { title: 'Togli' })),
      testoLegato(it, 'testo', { righe: 3, suggerimento: 'Cosa trasmettere o fare; righe che iniziano con «- » diventano un elenco' }))))
      : h('p', { class: 'mu', style: 'margin:0' }, 'Nessuna integrazione: il POS è completo.'),
    h('div', { class: 'azioni', style: 'margin-top:10px;justify-content:flex-start' },
      bottone('piu', 'Aggiungi', () => { v.integrazioni.push({ titolo: '', testo: '' }); disegna(); onCambia(); el.querySelector('li:last-child input')?.focus(); }, 'sm'),
      bottone('', 'Proponi dalle voci «No»', () => { v.integrazioni.push(...integrazioniProposte(v.voci)); disegna(); onCambia(); }, 'q sm')));
  disegna();
  return el;
}

/** Foto ridotte e lette come data URL per la stampa. */
async function immagineStampa(ctx, p, lato = 1400) {
  const byte = await ctx.archivio.disco.leggiByte(p);
  const img = await createImageBitmap(new Blob([byte], { type: 'image/jpeg' }));
  const k = Math.min(1, lato / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  return c.toDataURL('image/jpeg', 0.82);
}

/** Verifica con Claude: scelta dei documenti, invio, proposta da controllare. */
async function verificaConClaude(ctx, { s, impresa, pos, posImpresa, v }) {
  const claude = ctx.servizi.claude;
  if (!(await claude.stato()).chiave) {
    if (await conferma('Manca la chiave API di Claude', 'Per la verifica con Claude serve una chiave API di Anthropic (console.anthropic.com). Si inserisce una volta sola in Impostazioni.', 'Vai alle Impostazioni')) vai('#/impostazioni');
    return;
  }
  const cod = ctx.cantiere.codice;
  const psc = s.documenti.psc[0] || null;
  const docs = documentiDaEsaminare({
    cartellaPos: ctx.archivio.cartellaPos(cod, impresa), posImpresa, pos, psc, percorsoPsc: psc ? percorsoDocumento(cod, psc) : null,
  });
  const elenco = h('div', { class: 'pila', style: 'gap:6px' }, docs.map((d) => h('label', { class: 'spunta' },
    h('input', { type: 'checkbox', checked: d.scelto, onchange: (e) => { d.scelto = e.target.checked; } }),
    h('span', {}, d.titolo, h('span', { class: 'rif' }, ` · ${{ pos: 'POS', allegato: 'allegato', psc: 'piano di sicurezza e coordinamento' }[d.tipo]}`)))));
  const ok = await chiedi({
    titolo: 'Verifica con Claude',
    testo: 'Claude legge i documenti scelti, compila la check list voce per voce, propone l’esito, le integrazioni e i testi della lettera. Controlla tutto prima di firmare: la responsabilità della verifica resta del CSE.',
    ok: 'Avvia la verifica',
    contenuto: [elenco, nota(psc ? 'Con il PSC la verifica è più completa ma più lunga e costosa (fino a 600 pagine in tutto per richiesta).' : 'Nessun PSC caricato nel cantiere: Claude non potrà controllare la coerenza con il PSC.', 'info')],
  });
  if (!ok) return;
  const scelti = docs.filter((d) => d.scelto);
  if (!scelti.some((d) => d.tipo === 'pos')) return avviso('Scegli almeno il POS', 'errore');

  const testo = h('p', { style: 'margin:0' }, 'Preparazione…');
  const inizio = Date.now();
  const orologio = h('p', { class: 'mu piccolo' });
  const timer = setInterval(() => { orologio.textContent = `${Math.round((Date.now() - inizio) / 1000)} secondi`; }, 1000);
  const { dlg, chiudi: chiudiF } = finestra('Verifica con Claude in corso', [h('div', { class: 'caricamento', style: 'min-height:60px' }), testo, orologio],
    [bottone('chiudi', 'Interrompi', () => claude.annulla(), 'q d')]);
  dlg.addEventListener('cancel', (e) => e.preventDefault());
  try {
    const verifichePrecedenti = posImpresa.filter((p) => p.id !== pos.id).map((p) => verificaDelPos(s.verifiche, p.id)).filter(Boolean);
    const r = await claude.verifica(richiestaVerifica({ cantiere: ctx.cantiere, impresa, imprese: s.imprese, pos, verifica: v, documenti: scelti, verifichePrecedenti }),
      (t) => { testo.textContent = t; });
    const proposta = applicaProposta(v, controllaRisposta(r.dati), { modello: r.modello || MODELLO_CLAUDE, documenti: scelti });
    // oggetto della lettera: si aggiorna se non è stato scritto a mano
    const auto = [letteraProposta(ctx.cantiere, impresa, s.imprese, pos).oggetto, letteraProposta(ctx.cantiere, impresa, s.imprese, pos, { integrazioni: [1] }).oggetto];
    if (!proposta.lettera.oggetto || auto.includes(proposta.lettera.oggetto)) proposta.lettera.oggetto = letteraProposta(ctx.cantiere, impresa, s.imprese, pos, proposta).oggetto;
    bozzeVerifica.set(pos.id, proposta);
    chiudiF();
    avviso('Verifica compilata da Claude: controllala e salva');
    ctx.ricarica();
  } catch (e) {
    chiudiF();
    avviso(e.message, 'errore');
  } finally {
    clearInterval(timer);
  }
}

// verifica di un POS (aperta dalla scheda dell'impresa)
registra({
  id: 'verifica', titolo: 'Verifica POS', ruolo: 'cse', ordine: 999, nascosto: true, menu: 'imprese',
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const [impresaId, posId] = ctx.resto;
    const s = await stato(ctx);
    const impresa = s.imprese.find((i) => i.id === impresaId);
    const posImpresa = posInOrdine(s.pos, impresaId);
    const pos = posImpresa.find((p) => p.id === posId);
    if (!impresa || !pos) throw new Error('POS non trovato');
    const salvata = verificaDelPos(s.verifiche, posId);
    const indice = posImpresa.indexOf(pos);
    const revPrecedente = posImpresa.slice(0, indice).reverse().map((p) => verificaDelPos(s.verifiche, p.id)).find(Boolean) || null;
    const bozza = bozzeVerifica.get(posId);
    const v = bozza ? structuredClone(bozza) : salvata ? completaVerifica(salvata, impresa) : nuovaVerifica(impresa, posId, { precedente: revPrecedente });
    // campi della lettera ancora vuoti: si propongono dai dati del cantiere
    const proposta = letteraProposta(ctx.cantiere, impresa, s.imprese, pos, v);
    for (const [k, val] of Object.entries(proposta)) if (!v.lettera[k]) v.lettera[k] = val;
    if (!v.documentazione) v.documentazione = descriviDocumentazione(impresa, pos);

    // ---- check list
    const testi = new Map(CHECKLIST_POS.map((c) => [c.codice, c]));
    const proposto = h('span');
    let mostraNascoste = false;
    const sceltaEsito = h('select', { onchange: (e) => { v.esito = e.target.value; sceltoAMano = true; } }, h('option', { value: '' }, 'Da completare'),
      Object.entries(ESITI_VERIFICA_POS).map(([k, t]) => h('option', { value: k, selected: v.esito === k }, t)));
    const sceltaTP = h('select', { onchange: (e) => { v.idoneitaTP = e.target.value; tpAMano = true; } }, h('option', { value: '' }, 'Da stabilire'),
      h('option', { value: 'si', selected: v.idoneitaTP === 'si' }, 'Sì'), h('option', { value: 'no', selected: v.idoneitaTP === 'no' }, 'No'));
    let sceltoAMano = !!v.esito;
    let tpAMano = !!v.idoneitaTP;
    const aggiornaProposto = () => {
      const e = esitoProposto(v.voci, v.integrazioni);
      const daFare = v.voci.filter((x) => !x.esito && !x.nascosta).length;
      proposto.replaceChildren(e ? pill(`Proposto: ${ESITI_VERIFICA_POS[e]}`, TIPO_ESITO_POS[e]) : pill(`${daFare} voci da compilare`));
      if (e && !sceltoAMano) { v.esito = e; sceltaEsito.value = e; }
      const tp = idoneitaProposta(v.voci);
      if (tp && !tpAMano) { v.idoneitaTP = tp; sceltaTP.value = tp; }
    };
    const corpoTab = h('tbody');
    const contaNascoste = h('span');
    const disegnaVoci = () => {
      const righe = [];
      let sezione = '';
      for (const voce of v.voci) {
        const c = testi.get(voce.codice);
        if (!c || (voce.nascosta && !mostraNascoste)) continue;
        if (c.sezione !== sezione) { sezione = c.sezione; righe.push(h('tr', { class: 'gr' }, h('td', { colspan: 3 }, SEZIONI_CHECKLIST[sezione]))); }
        righe.push(h('tr', { class: voce.nascosta ? 'nascosta' : '' },
          h('td', { class: 'stretta', style: 'vertical-align:top;padding-top:14px' }, h('b', {}, c.codice)),
          h('td', {},
            h('div', { class: 'controllo' },
              h('div', { style: `padding-top:5px${c.sotto ? ';padding-left:14px' : ''}` }, c.testo, c.la ? h('span', { class: 'rif' }, ' · LA') : null, c.rif ? h('span', { class: 'rif', style: 'display:block' }, c.rif) : null),
              seg(ESITI_CHECKLIST, voce.esito, (k) => { voce.esito = k; aggiornaProposto(); }, TIPO_VOCE_POS)),
            h('textarea', { rows: 1, class: 'nota-voce', placeholder: 'Nota (stampata sotto la voce)', oninput: (e) => { voce.note = e.target.value; } }, voce.note || '')),
          h('td', { class: 'stretta', style: 'vertical-align:top;padding-top:10px' },
            bottone(voce.nascosta ? 'occhio' : 'nascosto', '', () => { voce.nascosta = !voce.nascosta; disegnaVoci(); aggiornaProposto(); }, 'q sm icona',
              { title: voce.nascosta ? 'Mostra di nuovo la voce (e stampala)' : 'Nascondi la voce: non compare nella stampa' }))));
      }
      corpoTab.replaceChildren(...righe);
      const n = v.voci.filter((x) => x.nascosta).length;
      contaNascoste.replaceChildren(n ? bottone(mostraNascoste ? 'nascosto' : 'occhio', mostraNascoste ? 'Togli le nascoste' : `Mostra nascoste (${n})`, () => { mostraNascoste = !mostraNascoste; disegnaVoci(); }, 'q sm') : '');
    };
    disegnaVoci();
    aggiornaProposto();

    const f = campi([
      { chiave: 'data', etichetta: 'Data della verifica', tipo: 'data' },
      { chiave: 'trasmessaIl', etichetta: 'Esito trasmesso all’impresa il', tipo: 'data' },
    ], v);
    const adeguati = h('textarea', { rows: 4, placeholder: 'Un aspetto per riga, es. «dati dell’impresa e organigramma della sicurezza;»', oninput: (e) => { v.adeguati = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); } }, (v.adeguati || []).join('\n'));
    const l = v.lettera;
    const campoL = (etichetta, chiave, righe = 0, largo = true) => h('label', { class: largo ? 'largo' : '' }, etichetta, testoLegato(l, chiave, { righe }));

    const salva = async () => {
      Object.assign(v, f.leggi());
      const { partitaDa, avvisiAi, vecchieVoci, ...dati } = v;
      const ok = await ctx.archivio.salvaRegistrazione(cod, 'verifichePos', { ...dati, _file: salvata?._file });
      bozzeVerifica.delete(posId);
      return ok;
    };
    const nomeBase = `${nomeSicuro(impresa.ragioneSociale)} rev ${nomeSicuro(pos.revisione, '0')} del ${v.data || oggi()}`;
    const pdf = (tipo) => prova(async () => {
      const ok = await salva();
      avviso('Verifica salvata');
      const html = tipo === 'lettera' ? htmlLetteraPos(ctx.cantiere, impresa, pos, ok) : htmlChecklistPos(ctx.cantiere, impresa, pos, ok);
      await salvaPdf(ctx, html, percorso(cartellaSezione(cod, 'verifichePos'), `${tipo === 'lettera' ? (ok.integrazioni?.length ? 'Richiesta integrazioni POS' : 'Esito verifica POS') : 'Check list POS'} ${nomeBase}.pdf`));
      ctx.ricarica();
    });

    const claudeBtn = ctx.servizi.claude
      ? bottone('claude', 'Verifica con Claude', prova(() => verificaConClaude(ctx, { s, impresa, pos, posImpresa, v })), 'p')
      : null;
    const docAllegati = (pos.allegati || []).length;
    return h('div', {},
      testata(`Verifica del POS – ${impresa.ragioneSociale}`,
        `Revisione ${pos.revisione} ricevuta il ${dataIt(pos.dataRicezione)}${docAllegati ? ` · ${docAllegati} allegati` : ''} · check list POS e idoneità tecnico-professionale`,
        bottone('apri', 'Apri il POS', () => apri(ctx, percorso(ctx.archivio.cartellaPos(cod, impresa), pos.file))),
        bottone('carica', 'Allegati', () => finestraAllegati(ctx, impresa, pos)),
        claudeBtn),
      bozza ? nota(h('span', {}, h('b', {}, 'Proposta di Claude non ancora salvata. '), `Compilata il ${dataIt(bozza.ai?.data)} leggendo: ${(bozza.ai?.documenti || []).join('; ')}. Controlla ogni voce, correggi dove serve e salva.`), 'info') : null,
      bozza?.avvisiAi?.length ? nota(h('div', {}, h('b', {}, 'Da controllare di persona:'), h('ul', { style: 'margin:4px 0 0' }, bozza.avvisiAi.map((a) => h('li', {}, a))))) : null,
      !bozza && v.ai ? nota(`Compilata con il supporto di Claude il ${dataIt(v.ai.data)} e controllata dal CSE.`, 'info') : null,
      !salvata && !bozza && v.partitaDa ? nota('Verifica nuova partita dalla verifica della revisione precedente: aggiorna le voci con i documenti nuovi.', 'info') : null,
      !ctx.servizi.claude ? nota('La verifica con il supporto di Claude si fa dal PC (Windows).', 'info') : null,
      h('div', { class: 'pila' },
        scheda({ titolo: 'Documentazione ditta', ico: 'notifica', corpo: h('label', { class: 'campo' }, 'Come compare in testa alla check list', testoLegato(v, 'documentazione')) }),
        scheda({ titolo: 'Check list', ico: 'psc', azioni: [contaNascoste, proposto], tabella: h('table', { class: 't' }, corpoTab) }),
        scheda({
          titolo: 'Esito', ico: 'ok',
          corpo: [
            h('div', { class: 'campi' },
              h('label', {}, 'Idoneità tecnico-professionale (All. XVII)', sceltaTP),
              h('label', {}, 'POS (art. 92 c. 1 lett. b)', sceltaEsito),
              ...f.el.children,
              h('label', { class: 'largo' }, 'POS non idoneo perché', testoLegato(v, 'motivo')),
              h('label', { class: 'largo' }, 'Da integrare (in breve, sotto l’esito)', testoLegato(v, 'daIntegrare'))),
          ],
        }),
        scheda({ titolo: 'Integrazioni richieste', ico: 'attenzione', corpo: [h('p', { class: 'mu', style: 'margin-top:0' }, 'Vanno nell’allegato della check list e nella lettera all’impresa.'), editorIntegrazioni(v, aggiornaProposto)] }),
        scheda({
          titolo: 'Lettera all’impresa', ico: 'verbali',
          corpo: h('div', { class: 'campi' },
            campoL('Mittente', 'mittente'),
            campoL('Destinatari (uno per riga)', 'destinatari', 3),
            campoL('Per conoscenza (uno per riga)', 'epc', 2),
            campoL('Oggetto', 'oggetto', 2),
            campoL('Esito della verifica (testo della lettera)', 'esitoTesto', 2),
            h('label', { class: 'largo' }, 'Risultano adeguati (uno per riga)', adeguati),
            campoL('Termini e modalità', 'termini', 3),
            campoL('Luogo', 'luogo', 0, false)),
        })),
      barraSalva(bozza ? 'Proposta da salvare' : salvata ? `Verifica del ${dataIt(salvata.data)}` : 'Nuova verifica',
        bozza ? bottone('chiudi', 'Scarta la proposta', () => { bozzeVerifica.delete(posId); ctx.ricarica(); }, 'q d') : null,
        bottone('salva', 'Salva', prova(async () => { await salva(); avviso('Verifica salvata'); vai(indirizzo(cod, 'impresa', impresa.id)); })),
        bottone('stampa', 'Check list PDF', pdf('checklist')),
        bottone('stampa', 'Lettera PDF', pdf('lettera'), 'p')));
  },
});

// ================================================================== giornale
const CAMPI_VOCE = [
  { chiave: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true },
  { chiave: 'meteo', etichetta: 'Meteo', tipo: 'testo', suggerimento: 'sereno, 8 °C' },
  { chiave: 'oraArrivo', etichetta: 'Arrivo', tipo: 'ora' },
  { chiave: 'oraPartenza', etichetta: 'Partenza', tipo: 'ora' },
  { chiave: 'lavorazioni', etichetta: 'Lavorazioni in corso', tipo: 'testo_lungo' },
  { chiave: 'osservazioni', etichetta: 'Osservazioni del CSE', tipo: 'testo_lungo' },
  { chiave: 'disposizioni', etichetta: 'Disposizioni impartite', tipo: 'testo_lungo' },
];

async function modificaVoce(ctx, voci, voce = null) {
  const dati = await chiedi({
    titolo: voce ? `Giornale di ${giorno(voce.data)} ${dataIt(voce.data)}` : 'Nuova voce del giornale',
    campi: voce ? CAMPI_VOCE.map((c) => (c.chiave === 'data' ? { ...c, solaLettura: true } : c)) : CAMPI_VOCE,
    valori: voce || { data: oggi(), oraArrivo: isoLocale().slice(11, 16) },
    controlla: (d) => (!voce && voci.some((v) => v.data === d.data) ? `Esiste già la voce del ${dataIt(d.data)}: aprila dall’elenco.` : null),
  });
  if (!dati) return;
  const v = voce ? { ...voce, ...dati } : { ...nuovaVoce(voci, dati.data), ...dati };
  await ctx.archivio.salvaRegistrazione(ctx.cantiere.codice, 'giornale', v, nomeFileVoce(v));
  avviso('Giornale salvato');
  ctx.ricarica();
}

registra({
  id: 'giornale', titolo: 'Giornale dei lavori', titoloBreve: 'Giornale', ruolo: 'cse', ordine: 40, sezione: 'giornale', icona: 'giornale',
  async disegna(ctx) {
    const s = await stato(ctx);
    const voci = s.voci;
    const nuova = prova(() => modificaVoce(ctx, voci));
    return h('div', {},
      testata('Giornale dei lavori', 'Una voce per ogni giorno di presenza in cantiere', bottone('piu', voci[0]?.data === oggi() ? 'Nuova voce' : 'Voce di oggi', nuova, 'p')),
      voci.length
        ? h('div', { class: 'tempo' }, voci.map((v) => {
          const nFoto = fotoDelGiorno(s.foto, v.data).length;
          const blocco = (et, testo) => (testo ? h('p', {}, h('span', { class: 'et' }, et), h('br'), testo) : null);
          return h('div', { class: 'card card-b', onclick: prova(() => modificaVoce(ctx, voci, v)) },
            h('div', { class: 'data' }, h('b', {}, `${giorno(v.data)} ${dataIt(v.data)}`),
              v.oraArrivo ? h('span', { class: 'mu piccolo' }, icona('orologio'), ` ${v.oraArrivo}${v.oraPartenza ? `–${v.oraPartenza}` : ''}`) : null,
              v.meteo ? pill(v.meteo) : null,
              nFoto ? h('a', { class: 'pill ac', href: indirizzo(ctx.cantiere.codice, 'foto'), onclick: (e) => e.stopPropagation() }, `${nFoto} foto`) : null),
            blocco('Lavorazioni', v.lavorazioni), blocco('Osservazioni', v.osservazioni), blocco('Disposizioni', v.disposizioni),
            !v.lavorazioni && !v.osservazioni && !v.disposizioni ? h('p', { class: 'mu' }, 'Voce vuota: tocca per compilarla') : null);
        }))
        : scheda({ corpo: vuoto('giornale', 'Giornale vuoto', 'Registra ogni presenza in cantiere: orari, lavorazioni, osservazioni e disposizioni impartite.', bottone('piu', 'Voce di oggi', nuova, 'p')) }));
  },
});

// ================================================================== registro fotografico
const urlFoto = new Map(); // percorso -> URL dell'immagine già letta

async function leggiFoto(ctx, p) {
  if (!urlFoto.has(p)) urlFoto.set(p, URL.createObjectURL(new Blob([await ctx.archivio.disco.leggiByte(p)], { type: 'image/jpeg' })));
  return urlFoto.get(p);
}

const percorsoFoto = (ctx, f) => percorso(cartellaSezione(ctx.cantiere.codice, 'foto'), 'timbrate', f.timbrata);

function miniatura(ctx, f, alClic = null) {
  const el = h('button', { type: 'button', class: 'foto', onclick: () => (alClic ? alClic() : apriFoto(ctx, f)), title: f.didascalia || dataOraIt(f.scattata) },
    h('span', { class: 'attesa' }, icona('foto')),
    h('span', { class: 'ora' }, String(f.scattata).slice(11, 16)),
    f.fonteData !== 'exif' ? h('span', { class: 'attenz pill at', title: 'Data di scatto non presente nella foto: è la data del file' }, '!') : null);
  const carica = async () => {
    try {
      el.querySelector('.attesa')?.replaceWith(h('img', { src: await leggiFoto(ctx, percorsoFoto(ctx, f)), alt: f.didascalia || '', loading: 'lazy' }));
    } catch { /* file non ancora sincronizzato */ }
  };
  if ('IntersectionObserver' in window) {
    const oss = new IntersectionObserver((v) => { if (v.some((x) => x.isIntersecting)) { oss.disconnect(); carica(); } }, { rootMargin: '400px' });
    oss.observe(el);
  } else carica();
  return el;
}

function apriFoto(ctx, f) {
  const p = percorsoFoto(ctx, f);
  const imm = h('div', { class: 'anteprima' }, h('div', { class: 'caricamento' }));
  leggiFoto(ctx, p).then((url) => imm.replaceChildren(h('img', { src: url, alt: f.didascalia || '' }))).catch(() => imm.replaceChildren(nota('File della foto non trovato')));
  const dati = campi([
    { chiave: 'didascalia', etichetta: 'Didascalia', tipo: 'testo', largo: true },
    { chiave: 'luogo', etichetta: 'Posizione in cantiere', tipo: 'testo', largo: true },
  ], f);
  const { chiudi: chiudiF } = finestra(`${giorno(f.scattata)} ${dataOraIt(f.scattata)}`, [
    imm,
    f.fonteData !== 'exif' ? h('div', { style: 'margin-top:12px' }, nota('La foto non contiene la data di scatto: è stata usata la data del file. Verificala.')) : null,
    h('div', { style: 'margin-top:12px' }, dati.el),
    h('p', { class: 'mu piccolo' }, `${f.timbrata} · originale ${f.originale}`),
  ], [
    bottone('apri', 'Apri', () => apri(ctx, p)),
    bottone('salva', 'Salva', prova(async () => {
      await ctx.archivio.salvaRegistrazione(ctx.cantiere.codice, 'foto', { ...f, ...dati.leggi() });
      avviso('Foto salvata');
      chiudiF();
      ctx.ricarica();
    }), 'p'),
  ], 'grande');
}

registra({
  id: 'foto', titolo: 'Registro fotografico', titoloBreve: 'Foto', ruolo: 'cse', ordine: 50, sezione: 'foto', icona: 'foto',
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const gruppi = perGiorno((await stato(ctx)).foto).reverse();
    const importa = prova(async (files) => {
      files = (files || []).filter(Boolean);
      if (!files.length) return;
      const attesa = avviso(files.length === 1 ? 'Importazione della foto…' : `Importazione di ${files.length} foto…`);
      try {
        for (const f of files) await importaFoto(ctx.archivio, cod, f, timbraFoto);
      } finally {
        attesa.remove();
      }
      avviso(files.length === 1 ? 'Foto aggiunta al registro' : `${files.length} foto aggiunte al registro`);
      ctx.ricarica();
    });
    const scatta = () => (ctx.servizi.scatta ? bottone('scatta', 'Scatta foto', prova(async () => importa([await ctx.servizi.scatta()])), 'p') : null);
    const carica = () => bottone('carica', 'Carica foto', prova(async () => importa(ctx.servizi.scegliFoto ? await ctx.servizi.scegliFoto() : await scegliFile(ctx, { accetta: 'image/jpeg' }))), ctx.servizi.scatta ? '' : 'p');
    return h('div', {},
      testata('Registro fotografico', 'Ordinate per data di scatto, stampata in basso a destra su ogni foto (l’originale resta intatto)', carica(), scatta()),
      gruppi.length
        ? gruppi.map((g) => h('div', { class: 'giorno-foto' },
          h('h3', {}, icona('calendario'), `${giorno(g.giorno)} ${dataIt(g.giorno)}`, h('span', { class: 'mu piccolo', style: 'font-weight:500' }, `· ${g.foto.length} foto`)),
          h('div', { class: 'foto-griglia' }, g.foto.map((f) => miniatura(ctx, f)))))
        : scheda({ corpo: vuoto('foto', 'Nessuna foto', ctx.servizi.scatta ? 'Scatta le foto dal telefono o caricale dalla galleria.' : 'Carica le foto (JPEG) dal PC: la data di scatto si legge dalla foto.', carica(), scatta()) }));
  },
});

// ================================================================== verbali
async function nuovoVerbaleDa(ctx) {
  const s = await stato(ctx);
  const v = nuovoVerbaleSopralluogo(s.verbali, { imprese: s.situazione.filter((x) => x.puoLavorare).map((x) => x.impresa) });
  v.oraInizio = isoLocale().slice(11, 16);
  await ctx.archivio.salvaRegistrazione(ctx.cantiere.codice, 'verbali', v, nomeFileVerbale(v));
  vai(indirizzo(ctx.cantiere.codice, 'verbale', v.id));
}

registra({
  id: 'verbali', titolo: 'Verbali di sopralluogo', titoloBreve: 'Verbali', ruolo: 'cse', ordine: 60, sezione: 'verbali', icona: 'verbali',
  conta: async (ctx) => (await stato(ctx)).aperte.length,
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const s = await stato(ctx);
    const nuovo = () => bottone('piu', 'Nuovo verbale', prova(() => nuovoVerbaleDa(ctx)), 'p');
    const doppi = numeriDoppi(s.verbali);
    const nomi = new Map(s.imprese.map((i) => [i.id, i.ragioneSociale]));
    return h('div', {},
      testata('Verbali di sopralluogo', 'Art. 92 D.Lgs 81/08 · si compilano qui e si stampano per la firma su carta', nuovo()),
      doppi.length ? nota(`Numeri usati due volte (${doppi.join(', ')}): probabilmente verbali creati su due dispositivi prima della sincronizzazione. Rinumerali prima di chiuderli.`, 'ko') : null,
      s.aperte.length ? h('div', { style: 'margin-bottom:16px' }, scheda({
        titolo: `Prescrizioni aperte (${s.aperte.length})`, ico: 'attenzione',
        tabella: tabella(['Prescrizione', 'Impresa', 'Entro', 'Verbale'], s.aperte.map((p) => h('tr', {},
          h('td', {}, p.descrizione), h('td', {}, nomi.get(p.impresa) || ''),
          h('td', { class: 'stretta' }, p.entro ? pill(dataIt(p.entro), p.entro < oggi() ? 'ko' : 'at') : '—'),
          h('td', { class: 'stretta' }, `n. ${p.verbale}`)))),
      })) : null,
      s.verbali.length
        ? h('div', { class: 'tw' }, tabella(['N.', 'Data', 'Contenuto', 'Stato'], s.verbali.map((v) => h('tr', { class: 'cliccabile', onclick: () => vai(indirizzo(cod, 'verbale', v.id)) },
          h('td', { class: 'stretta' }, h('b', {}, v.numero), doppi.includes(v.numero) ? [' ', pill('doppio', 'ko')] : null),
          h('td', { class: 'stretta' }, dataIt(v.data)),
          h('td', {}, v.lavorazioniInCorso || h('span', { class: 'mu' }, '—'),
            h('span', { class: 'sotto' }, [
              v.nonConformita?.length ? `${v.nonConformita.length} non conformità` : '',
              v.prescrizioni?.length ? `${v.prescrizioni.length} prescrizioni` : '',
              v.sospensione ? 'sospensione lavorazioni' : '',
            ].filter(Boolean).join(' · '))),
          h('td', { class: 'stretta' }, v.chiuso ? pill('Firmato', 'ok') : pill('In bozza', 'at'))))))
        : scheda({ corpo: vuoto('verbali', 'Nessun verbale', 'Il verbale nuovo è già precompilato: imprese con POS idoneo, controlli del sopralluogo e prescrizioni ancora aperte.', nuovo()) }));
  },
});

// verbale (aperto da "Verbali")
registra({
  id: 'verbale', titolo: 'Verbale', ruolo: 'cse', ordine: 997, nascosto: true, menu: 'verbali',
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const s = await stato(ctx);
    const letto = s.verbali.find((v) => v.id === ctx.resto[0]);
    if (!letto) throw new Error('Verbale non trovato');
    const v = structuredClone(letto);
    const blocco = !!v.chiuso;
    const elencoImprese = 'elenco-imprese';
    const opzImprese = Object.fromEntries(s.imprese.map((i) => [i.id, i.ragioneSociale]));
    const lega = (chiave, tipo, etichetta) => {
      const f = campi([{ chiave, tipo, etichetta, solaLettura: blocco }], v);
      const el = f.el.firstChild;
      const aggiorna = () => Object.assign(v, f.leggi());
      el.addEventListener('input', aggiorna);
      el.addEventListener('change', aggiorna);
      return el;
    };

    const generali = h('div', { class: 'campi' },
      lega('numero', 'numero', 'Numero'), lega('data', 'data', 'Data'),
      lega('oraInizio', 'ora', 'Dalle ore'), lega('oraFine', 'ora', 'Alle ore'),
      lega('lavorazioniInCorso', 'testo_lungo', 'Lavorazioni in corso'));
    const impresePresenti = s.imprese.length ? [
      h('div', { class: 'rif', style: 'margin:16px 0 8px;font-weight:650' }, 'Imprese presenti in cantiere'),
      h('div', { class: 'campi' }, s.imprese.map((i) => {
        const x = s.situazione.find((y) => y.impresa.id === i.id);
        return h('label', { class: 'spunta' }, h('input', {
          type: 'checkbox', disabled: blocco, checked: v.impresePresenti.includes(i.id),
          onchange: (e) => { v.impresePresenti = e.target.checked ? [...v.impresePresenti, i.id] : v.impresePresenti.filter((k) => k !== i.id); },
        }), i.ragioneSociale, x.puoLavorare ? null : pill('POS non idoneo', 'ko'));
      })),
    ] : null;

    const presenti = righe(v.presenti, [
      { chiave: 'nome', etichetta: 'Nome e cognome' },
      { chiave: 'qualifica', etichetta: 'Qualifica', suggerimento: 'capocantiere, preposto…' },
      { chiave: 'impresa', etichetta: 'Impresa', elenco: elencoImprese },
    ], { testoAggiungi: 'Aggiungi', bloccato: blocco, vuota: 'Nessuno: nella stampa restano righe vuote da compilare a mano' });

    const nc = righe(v.nonConformita, [
      { chiave: 'descrizione', etichetta: 'Descrizione', larghezza: '50%' },
      { chiave: 'impresa', etichetta: 'Impresa', tipo: 'scelta', opzioni: opzImprese },
      { chiave: 'gravita', etichetta: 'Gravità', tipo: 'scelta', opzioni: { lieve: 'Lieve', grave: 'Grave', pericolo_grave_imminente: 'Pericolo grave e imminente' } },
    ], { nuova: () => ({ descrizione: '', impresa: '', gravita: 'lieve', foto: [] }), testoAggiungi: 'Aggiungi', bloccato: blocco });

    const prescr = righe(v.prescrizioni, [
      { chiave: 'descrizione', etichetta: 'Prescrizione', larghezza: '55%' },
      { chiave: 'impresa', etichetta: 'Impresa', tipo: 'scelta', opzioni: opzImprese },
      { chiave: 'entro', etichetta: 'Entro il', tipo: 'data' },
    ], { nuova: () => ({ id: nuovoId(), descrizione: '', impresa: '', entro: '' }), testoAggiungi: 'Aggiungi', bloccato: blocco });

    // controlli: quelli nascosti non si vedono (se non si chiede) e non si stampano
    const gruppiControlli = [...new Set(CONTROLLI_SOPRALLUOGO.map((c) => c.gruppo))];
    for (const c of CONTROLLI_SOPRALLUOGO) if (!v.verifiche.find((x) => x.codice === c.codice)) v.verifiche.push({ codice: c.codice, esito: 'nv', note: '' });
    const controlli = h('tbody');
    const contaNascosti = h('span');
    let mostraNascosti = false;
    const disegnaControlli = () => {
      controlli.replaceChildren(...gruppiControlli.flatMap((g) => {
        const qui = CONTROLLI_SOPRALLUOGO.filter((c) => c.gruppo === g)
          .map((c) => [c, v.verifiche.find((x) => x.codice === c.codice)])
          .filter(([, voce]) => mostraNascosti || !voce.nascosta);
        if (!qui.length) return [];
        return [h('tr', { class: 'gr' }, h('td', { colspan: 2 }, g)), ...qui.map(([c, voce]) => h('tr', { class: voce.nascosta ? 'nascosta' : '' },
          h('td', {},
            h('div', { class: 'controllo' }, h('div', { style: 'padding-top:5px' }, c.testo), seg(ESITI_CONTROLLO, voce.esito, (k) => { voce.esito = k; }, TIPO_CONTROLLO, blocco)),
            h('input', { type: 'text', value: voce.note || '', readonly: blocco, placeholder: 'Note', oninput: (e) => { voce.note = e.target.value; } })),
          h('td', { class: 'stretta', style: 'vertical-align:top;padding-top:10px' }, blocco ? null
            : bottone(voce.nascosta ? 'occhio' : 'nascosto', '', () => { voce.nascosta = !voce.nascosta; disegnaControlli(); }, 'q sm icona',
              { title: voce.nascosta ? 'Mostra di nuovo il controllo (e stampalo)' : 'Nascondi il controllo: non compare nel verbale stampato' }))))];
      }));
      const n = v.verifiche.filter((x) => x.nascosta).length;
      contaNascosti.replaceChildren(n ? bottone(mostraNascosti ? 'nascosto' : 'occhio', mostraNascosti ? 'Togli i nascosti' : `Mostra nascosti (${n})`, () => { mostraNascosti = !mostraNascosti; disegnaControlli(); }, 'q sm') : '');
    };
    disegnaControlli();

    // foto del verbale: scelte dal registro fotografico, oppure scattate / caricate adesso
    v.foto = (v.foto || []).filter((id) => s.foto.some((f) => f.id === id));
    const grigliaFoto = h('div', { class: 'foto-griglia' });
    const disegnaFoto = () => grigliaFoto.replaceChildren(...(v.foto.length
      ? v.foto.map((id) => {
        const f = s.foto.find((x) => x.id === id);
        // aprendo la foto (per la didascalia) la pagina si ricarica: prima si salva il verbale
        const el = miniatura(ctx, f, blocco ? null : prova(async () => { await salva(); apriFoto(ctx, f); }));
        if (!blocco) {
          el.append(h('span', {
            class: 'togli', role: 'button', title: 'Togli dal verbale (resta nel registro)',
            onclick: (e) => { e.stopPropagation(); v.foto = v.foto.filter((x) => x !== id); disegnaFoto(); },
          }, icona('chiudi')));
        }
        if (f.didascalia) el.append(h('span', { class: 'dida' }, f.didascalia));
        return el;
      })
      : [h('p', { class: 'mu', style: 'margin:0' }, blocco ? 'Nessuna foto' : 'Nessuna foto: sceglile dal registro fotografico o scattale adesso. Nel PDF vanno dopo le firme, due per riga, con data e didascalia.')]));
    disegnaFoto();
    const aggiungiFoto = (schede) => {
      for (const f of schede) {
        if (!s.foto.some((x) => x.id === f.id)) s.foto.push(f);
        if (!v.foto.includes(f.id)) v.foto.push(f.id);
      }
      disegnaFoto();
    };
    const importa = prova(async (files) => {
      files = (files || []).filter(Boolean);
      if (!files.length) return;
      const attesa = avviso(files.length === 1 ? 'Importazione della foto…' : `Importazione di ${files.length} foto…`);
      const nuove = [];
      try {
        for (const f of files) nuove.push(await importaFoto(ctx.archivio, cod, f, timbraFoto));
      } finally {
        attesa.remove();
      }
      aggiungiFoto(nuove);
      await salva(); // le foto sono già nel registro: il verbale si salva subito
      avviso(nuove.length === 1 ? 'Foto aggiunta al verbale e al registro' : `${nuove.length} foto aggiunte al verbale e al registro`);
    });
    const scegliDalRegistro = () => {
      const scelte = new Set(v.foto);
      const gruppi = perGiorno(s.foto).reverse().sort((a, b) => (b.giorno === v.data) - (a.giorno === v.data));
      const corpo = gruppi.length ? gruppi.map((g) => h('div', { class: 'giorno-foto' },
        h('h3', {}, icona('calendario'), `${giorno(g.giorno)} ${dataIt(g.giorno)}`, g.giorno === v.data ? pill('giorno del verbale', 'ac') : null),
        h('div', { class: 'foto-griglia' }, g.foto.map((f) => {
          const el = miniatura(ctx, f, () => { el.classList.toggle('scelta'); if (scelte.has(f.id)) scelte.delete(f.id); else scelte.add(f.id); });
          if (scelte.has(f.id)) el.classList.add('scelta');
          el.append(h('span', { class: 'spunta-foto' }, icona('ok')));
          return el;
        }))))
        : vuoto('foto', 'Registro fotografico vuoto', 'Scatta o carica le foto: vanno nel registro e nel verbale.');
      const { chiudi: chiudiF } = finestra('Foto dal registro fotografico', corpo, [
        bottone('ok', 'Usa le foto scelte', () => {
          v.foto = [...v.foto.filter((id) => scelte.has(id)), ...[...scelte].filter((id) => !v.foto.includes(id))];
          disegnaFoto();
          chiudiF();
        }, 'p'),
      ], 'grande');
    };
    const azioniFoto = blocco ? [] : [
      bottone('foto', 'Dal registro', scegliDalRegistro, 'sm'),
      ctx.servizi.scatta ? bottone('scatta', 'Scatta', prova(async () => importa([await ctx.servizi.scatta()])), 'sm') : null,
      bottone('carica', 'Carica', prova(async () => importa(ctx.servizi.scegliFoto ? await ctx.servizi.scegliFoto() : await scegliFile(ctx, { accetta: 'image/jpeg' }))), 'sm'),
    ];

    const daVerificare = v.prescrizioniDaVerificare?.length ? scheda({
      titolo: 'Prescrizioni dei verbali precedenti', ico: 'attenzione',
      tabella: tabella(['Prescrizione', 'Verbale', 'Esito'], v.prescrizioniDaVerificare.map((p) => h('tr', {},
        h('td', {}, p.descrizione, h('span', { class: 'sotto' }, [p.entro ? `entro il ${dataIt(p.entro)}` : '', opzImprese[p.impresa] || ''].filter(Boolean).join(' · '))),
        h('td', { class: 'stretta' }, `n. ${p.verbale}`),
        h('td', { class: 'stretta' }, seg({ risolta: 'Risolta', non_risolta: 'Non risolta' }, p.esito, (k) => { p.esito = k; }, { risolta: 'ok', non_risolta: 'ko' }, blocco))))),
    }) : null;

    const sosp = v.sospensione || { lavorazioni: '', motivo: '', dal: '' };
    const campiSosp = h('div', { class: 'campi', style: 'margin:10px 0 0 27px' },
      h('label', { class: 'largo' }, 'Lavorazioni sospese', h('input', { type: 'text', value: sosp.lavorazioni, readonly: blocco, oninput: (e) => { sosp.lavorazioni = e.target.value; } })),
      h('label', { class: 'largo' }, 'Motivo (pericolo grave e imminente)', h('input', { type: 'text', value: sosp.motivo, readonly: blocco, oninput: (e) => { sosp.motivo = e.target.value; } })),
      h('label', {}, 'Dal', h('input', { type: 'datetime-local', value: String(sosp.dal || '').slice(0, 16), readonly: blocco, oninput: (e) => { sosp.dal = e.target.value ? `${e.target.value}:00` : ''; } })));
    campiSosp.hidden = !v.sospensione;
    const provvedimenti = [
      h('label', { class: 'spunta' }, h('input', {
        type: 'checkbox', checked: !!v.sospensione, disabled: blocco,
        onchange: (e) => { v.sospensione = e.target.checked ? sosp : null; campiSosp.hidden = !e.target.checked; },
      }), 'Sospensione delle singole lavorazioni', h('span', { class: 'rif' }, 'art. 92 c. 1 lett. f')),
      campiSosp,
      h('label', { class: 'spunta', style: 'margin-top:12px' }, h('input', { type: 'checkbox', checked: !!v.segnalazioneCommittente, disabled: blocco, onchange: (e) => { v.segnalazioneCommittente = e.target.checked; } }),
        'Segnalazione delle inosservanze al committente / responsabile dei lavori', h('span', { class: 'rif' }, 'art. 92 c. 1 lett. e')),
    ];

    const nomePdf = () => percorso(cartellaSezione(cod, 'verbali'), `Verbale ${String(v.numero).padStart(3, '0')} del ${v.data}.pdf`);
    const salva = async () => {
      const nome = nomeFileVerbale(v);
      const vecchio = v._file && v._file !== nome ? v._file : null; // numero cambiato: si rinomina il file
      const { _file, ...dati } = v;
      const salvato = await ctx.archivio.salvaRegistrazione(cod, 'verbali', dati, nome);
      if (vecchio) await ctx.archivio.eliminaRegistrazione(cod, 'verbali', { _file: vecchio });
      v._file = salvato._file;
      return salvato;
    };
    const stampa = async () => {
      const foto = [];
      if (v.foto.length) {
        const attesa = avviso('Preparazione delle foto per la stampa…');
        try {
          for (const id of v.foto) {
            const f = s.foto.find((x) => x.id === id);
            try {
              foto.push({ src: await immagineStampa(ctx, percorsoFoto(ctx, f)), scattata: f.scattata, didascalia: f.didascalia, luogo: f.luogo });
            } catch { /* file della foto non ancora sincronizzato */ }
          }
        } finally {
          attesa.remove();
        }
      }
      await salvaPdf(ctx, htmlVerbale(ctx.cantiere, v, { imprese: s.imprese, foto }), nomePdf());
    };

    const pulsanti = blocco
      ? [bottone('stampa', 'Stampa / PDF', prova(stampa), 'p')]
      : [
        bottone('cestino', 'Elimina', prova(async () => {
          if (!(await conferma('Eliminare il verbale?', `Verbale n. ${v.numero} in bozza. L’operazione non si annulla.`, 'Elimina', true))) return;
          await ctx.archivio.eliminaRegistrazione(cod, 'verbali', v);
          vai(indirizzo(cod, 'verbali'));
        }), 'q d solo-pc'),
        bottone('salva', 'Salva', prova(async () => { await salva(); avviso('Verbale salvato'); ctx.ricarica(); })),
        bottone('stampa', 'Stampa', prova(async () => { await salva(); await stampa(); })),
        bottone('lucchetto', 'Chiudi', prova(async () => {
          if (!(await conferma('Chiudere il verbale?', 'Un verbale chiuso non si modifica più: per correzioni si fa un nuovo verbale. Viene creato il PDF da stampare e far firmare.', 'Chiudi e crea PDF'))) return;
          Object.assign(v, chiudi(v));
          await salva();
          await stampa();
          ctx.ricarica();
        }), 'p'),
      ];

    return h('div', {},
      h('datalist', { id: elencoImprese }, s.imprese.map((i) => h('option', { value: i.ragioneSociale }))),
      testata(`Verbale di sopralluogo n. ${v.numero}`, `${giorno(v.data)} ${dataIt(v.data)} · ${ctx.cantiere.denominazione}`,
        blocco ? pill('Chiuso', 'ok') : pill('In bozza', 'at'),
        h('a', { class: 'bottone', href: indirizzo(cod, 'verbali') }, icona('indietro'), 'Verbali')),
      blocco ? nota('Verbale chiuso: non si modifica più. Per correzioni o integrazioni fai un nuovo verbale.', 'info') : null,
      h('div', { class: 'pila' },
        scheda({ titolo: 'Sopralluogo', ico: 'calendario', corpo: [generali, impresePresenti] }),
        scheda({ titolo: 'Presenti', ico: 'persone', azioni: [presenti.aggiungi], tabella: presenti.tabella }),
        daVerificare,
        scheda({ titolo: 'Verifiche effettuate', ico: 'ok', azioni: [contaNascosti], tabella: h('table', { class: 't' }, controlli) }),
        scheda({ titolo: 'Non conformità rilevate', ico: 'attenzione', azioni: [nc.aggiungi], tabella: nc.tabella }),
        scheda({ titolo: 'Prescrizioni', ico: 'verbali', azioni: [prescr.aggiungi], tabella: prescr.tabella }),
        scheda({ titolo: 'Provvedimenti', ico: 'psc', corpo: provvedimenti }),
        scheda({ titolo: `Foto del verbale${v.foto.length ? ` (${v.foto.length})` : ''}`, ico: 'foto', azioni: azioniFoto, corpo: grigliaFoto }),
        scheda({ titolo: 'Note', corpo: lega('note', 'testo_lungo', 'Altre annotazioni') })),
      barraSalva(blocco ? 'Da firmare su carta' : `Salvato ${dataOraIt(letto.modificato)}`, pulsanti));
  },
});
