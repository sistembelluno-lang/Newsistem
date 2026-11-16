// Moduli del Coordinatore per la sicurezza in fase di esecuzione.
// Ogni modulo riceve ctx = { archivio, servizi, piattaforma, cantiere, resto, ricarica }
// e restituisce l'elemento della pagina. I dati si leggono una volta per
// pagina con stato(ctx).

import { registra } from '../core/registro.js';
import { CAMPI_ANAGRAFICA, GRUPPI_ANAGRAFICA, nuovaImpresa, nuovoPos } from '../core/modelli.js';
import { SEZIONI, cartellaSezione, percorso } from '../core/cartelle.js';
import { confronta, dataIt, dataOraIt, isoLocale, oggi } from '../core/date.js';
import { nuovoId } from '../core/id.js';
import { h, avviso, bottone, campi, chiedi, conferma, finestra, nota, pill, scheda, tabella, testata, vuoto } from '../ui/dom.js';
import { icona } from '../ui/icone.js';
import { indirizzo, vai } from '../ui/router.js';
import { caricaDocumento, elencoDocumenti, percorsoDocumento } from '../servizi/documenti.js';
import { importaFoto, ordinaFoto, perGiorno } from '../servizi/foto.js';
import { timbraFoto } from '../servizi/timbro.js';
import { nuovaVerifica, esitoProposto, prescrizioniProposte, situazionePos } from '../servizi/pos.js';
import { fotoDelGiorno, nomeFileVoce, nuovaVoce, ordinaVoci } from '../servizi/giornale.js';
import { chiudi, nomeFileVerbale, numeriDoppi, nuovoVerbaleSopralluogo, prescrizioniAperte } from '../servizi/verbali.js';
import { htmlVerbale, htmlVerificaPos } from '../servizi/stampa.js';
import { CONTENUTI_POS, CONTROLLI_SOPRALLUOGO, ESITI_CONTROLLO, ESITI_VERIFICA_POS, ESITI_VOCE_POS } from '../servizi/normativa.js';

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
const TIPO_VOCE_POS = { si: 'ok', parziale: 'at', no: 'ko', nd: '' };
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
  await ctx.archivio.scriviJson(percorso(cart, `${nome}.json`), nuovoPos({ impresa: impresa.id, file: nome, ...dati }));
  avviso('POS caricato: ora va verificato');
  return true;
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
          h('td', {}, x.pos ? `rev. ${x.pos.revisione}` : '—', x.pos ? h('span', { class: 'sotto' }, `ricevuto il ${dataIt(x.pos.dataRicezione)}`) : null),
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
    const posImpresa = s.pos.filter((p) => p.impresa === imp.id).sort((a, b) => confronta(b.dataRicezione, a.dataRicezione) || confronta(b.creato, a.creato));
    const x = s.situazione.find((y) => y.impresa.id === imp.id);
    const salva = prova(async () => {
      await ctx.archivio.salvaImpresa(cod, { ...imp, ...f.leggi() });
      avviso('Impresa salvata');
      ctx.ricarica();
    });
    const caricaBtn = bottone('carica', 'Carica POS', prova(async () => { if (await caricaPos(ctx, imp, posImpresa)) ctx.ricarica(); }), posImpresa.length ? 'sm' : 'p sm');
    return h('div', {},
      testata(imp.ragioneSociale, x.daFare ? `Da fare: ${x.daFare}` : 'POS verificato e trasmesso', pillSituazione(x),
        h('a', { class: 'bottone', href: indirizzo(cod, 'imprese') }, icona('indietro'), 'Imprese')),
      h('div', { class: 'pila' },
        scheda({
          titolo: 'Piano operativo di sicurezza', ico: 'psc', azioni: [caricaBtn],
          tabella: posImpresa.length ? tabella(['Revisione', 'Ricevuto', 'Verifica', ''], posImpresa.map((p) => {
            const v = s.verifiche.filter((y) => y.pos === p.id).sort((a, b) => confronta(a.data, b.data)).pop();
            return h('tr', {},
              h('td', {}, h('b', {}, `rev. ${p.revisione}`), h('span', { class: 'sotto' }, p.file)),
              h('td', {}, dataIt(p.dataRicezione)),
              h('td', {}, v?.esito ? pill(ESITI_VERIFICA_POS[v.esito], TIPO_ESITO_POS[v.esito]) : pill('Da verificare', 'at'),
                v?.trasmessaIl ? h('span', { class: 'sotto' }, `trasmessa il ${dataIt(v.trasmessaIl)}`) : null),
              h('td', { class: 'az' },
                bottone('apri', 'Apri', () => apri(ctx, percorso(ctx.archivio.cartellaPos(cod, imp), p.file)), 'sm'),
                bottone('psc', v ? 'Verifica' : 'Verifica ora', () => vai(indirizzo(cod, 'verifica', imp.id, p.id)), v ? 'sm' : 'p sm')));
          })) : null,
          corpo: posImpresa.length ? null : vuoto('psc', 'POS non ancora ricevuto', 'Carica il PDF del POS ricevuto dall’impresa: poi si fa la verifica di idoneità.'),
        }),
        scheda({ titolo: 'Dati dell’impresa', ico: 'imprese', corpo: f.el })),
      barraSalva(`Ultima modifica ${dataOraIt(imp.modificato)}`, bottone('salva', 'Salva', salva, 'p')));
  },
});

// verifica di un POS (aperta dalla scheda dell'impresa)
registra({
  id: 'verifica', titolo: 'Verifica POS', ruolo: 'cse', ordine: 999, nascosto: true, menu: 'imprese',
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const [impresaId, posId] = ctx.resto;
    const s = await stato(ctx);
    const impresa = s.imprese.find((i) => i.id === impresaId);
    const pos = s.pos.find((p) => p.id === posId);
    if (!impresa || !pos) throw new Error('POS non trovato');
    const precedente = s.verifiche.filter((v) => v.pos === posId).sort((a, b) => confronta(a.data, b.data) || confronta(a.creato, b.creato)).pop();
    const verifica = precedente ? structuredClone(precedente) : nuovaVerifica(impresaId, posId);
    for (const c of CONTENUTI_POS) if (!verifica.voci.find((v) => v.codice === c.codice)) verifica.voci.push({ codice: c.codice, esito: '', note: '' });

    const proposto = h('span');
    const sceltaEsito = h('select', { onchange: (e) => { verifica.esito = e.target.value; } }, h('option', { value: '' }, 'Da completare'),
      Object.entries(ESITI_VERIFICA_POS).map(([k, t]) => h('option', { value: k, selected: verifica.esito === k }, t)));
    const testoPrescr = h('textarea', { rows: 4, oninput: (e) => { verifica.prescrizioni = e.target.value; } }, verifica.prescrizioni || '');
    let sceltoAMano = !!precedente?.esito;
    sceltaEsito.addEventListener('change', () => { sceltoAMano = true; });
    const aggiornaProposto = () => {
      const e = esitoProposto(verifica.voci);
      proposto.replaceChildren(e ? pill(`Proposto: ${ESITI_VERIFICA_POS[e]}`, TIPO_ESITO_POS[e]) : pill(`${verifica.voci.filter((v) => !v.esito).length} voci da compilare`));
      if (e && !sceltoAMano) { verifica.esito = e; sceltaEsito.value = e; }
    };
    aggiornaProposto();

    const corpoTab = h('tbody', {}, CONTENUTI_POS.map((c) => {
      const voce = verifica.voci.find((v) => v.codice === c.codice);
      return h('tr', {},
        h('td', { class: 'stretta', style: 'vertical-align:top;padding-top:14px' }, h('b', {}, c.codice)),
        h('td', {},
          h('div', { class: 'controllo' }, h('div', { style: 'padding-top:5px' }, c.testo), seg(ESITI_VOCE_POS, voce.esito, (k) => { voce.esito = k; aggiornaProposto(); }, TIPO_VOCE_POS)),
          h('input', { type: 'text', value: voce.note || '', placeholder: 'Note', oninput: (e) => { voce.note = e.target.value; } })));
    }));
    const f = campi([
      { chiave: 'data', etichetta: 'Data della verifica', tipo: 'data' },
      { chiave: 'trasmessaIl', etichetta: 'Esito trasmesso all’impresa il', tipo: 'data' },
    ], verifica);

    const salva = async (pdf) => {
      Object.assign(verifica, f.leggi());
      const salvata = await ctx.archivio.salvaRegistrazione(cod, 'verifichePos', verifica);
      avviso('Verifica salvata');
      if (pdf) {
        await salvaPdf(ctx, htmlVerificaPos(ctx.cantiere, impresa, pos, salvata),
          percorso(cartellaSezione(cod, 'verifichePos'), `Verifica POS ${impresa._cartella} rev ${pos.revisione}.pdf`));
      }
      vai(indirizzo(cod, 'impresa', impresa.id));
    };
    return h('div', {},
      testata(`Verifica del POS – ${impresa.ragioneSociale}`, `Revisione ${pos.revisione} ricevuta il ${dataIt(pos.dataRicezione)} · contenuti minimi Allegato XV punto 3.2.1`,
        bottone('apri', 'Apri il POS', () => apri(ctx, percorso(ctx.archivio.cartellaPos(cod, impresa), pos.file)))),
      h('div', { class: 'pila' },
        scheda({ titolo: 'Contenuti minimi', ico: 'psc', azioni: [proposto], tabella: h('table', { class: 't' }, corpoTab) }),
        scheda({
          titolo: 'Esito', ico: 'ok',
          corpo: [
            h('div', { class: 'campi' }, h('label', {}, 'Esito della verifica', sceltaEsito), ...f.el.children),
            h('label', { class: 'campo', style: 'margin-top:12px' }, h('span', { style: 'display:flex;align-items:center;gap:8px' }, 'Prescrizioni / integrazioni richieste',
              bottone('', 'Proponi dalle voci', () => { testoPrescr.value = verifica.prescrizioni = prescrizioniProposte(verifica.voci); }, 'q sm')), testoPrescr),
          ],
        })),
      barraSalva(precedente ? `Verifica del ${dataIt(precedente.data)}` : 'Nuova verifica',
        bottone('salva', 'Salva', prova(() => salva(false))),
        bottone('stampa', 'Salva e crea PDF', prova(() => salva(true)), 'p')));
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

function miniatura(ctx, f) {
  const el = h('button', { type: 'button', class: 'foto', onclick: () => apriFoto(ctx, f), title: f.didascalia || dataOraIt(f.scattata) },
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

    const gruppiControlli = [...new Set(CONTROLLI_SOPRALLUOGO.map((c) => c.gruppo))];
    const controlli = h('tbody', {}, gruppiControlli.map((g) => [
      h('tr', { class: 'gr' }, h('td', {}, g)),
      CONTROLLI_SOPRALLUOGO.filter((c) => c.gruppo === g).map((c) => {
        let voce = v.verifiche.find((x) => x.codice === c.codice);
        if (!voce) v.verifiche.push(voce = { codice: c.codice, esito: 'nv', note: '' });
        return h('tr', {}, h('td', {},
          h('div', { class: 'controllo' }, h('div', { style: 'padding-top:5px' }, c.testo), seg(ESITI_CONTROLLO, voce.esito, (k) => { voce.esito = k; }, TIPO_CONTROLLO, blocco)),
          h('input', { type: 'text', value: voce.note || '', readonly: blocco, placeholder: 'Note', oninput: (e) => { voce.note = e.target.value; } })));
      })]));

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
    const stampa = () => salvaPdf(ctx, htmlVerbale(ctx.cantiere, v, { imprese: s.imprese }), nomePdf());

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
        scheda({ titolo: 'Verifiche effettuate', ico: 'ok', tabella: h('table', { class: 't' }, controlli) }),
        scheda({ titolo: 'Non conformità rilevate', ico: 'attenzione', azioni: [nc.aggiungi], tabella: nc.tabella }),
        scheda({ titolo: 'Prescrizioni', ico: 'verbali', azioni: [prescr.aggiungi], tabella: prescr.tabella }),
        scheda({ titolo: 'Provvedimenti', ico: 'psc', corpo: provvedimenti }),
        scheda({ titolo: 'Note', corpo: lega('note', 'testo_lungo', 'Altre annotazioni') })),
      barraSalva(blocco ? 'Da firmare su carta' : `Salvato ${dataOraIt(letto.modificato)}`, pulsanti));
  },
});
