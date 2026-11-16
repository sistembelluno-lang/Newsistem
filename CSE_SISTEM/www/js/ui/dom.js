// Piccoli aiuti per costruire l'interfaccia senza librerie: elementi, schede,
// campi dei moduli, finestre di inserimento e avvisi.
// (window.prompt/confirm non si usano: in Electron prompt non esiste e su
// Android hanno un aspetto diverso da tutto il resto.)

import { icona } from './icone.js';
import { nuovaPersona } from '../core/modelli.js';

/** h('div', { class: 'x', onclick: f }, 'testo', figlio, ...) */
export function h(tag, attributi = {}, ...figli) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attributi || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const f of figli.flat(Infinity)) {
    if (f === undefined || f === null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

/** Pulsante con icona: bottone('piu', 'Nuovo', f, 'p'). */
export function bottone(ico, testo, onclick, classe = '', extra = {}) {
  return h('button', { type: 'button', class: classe, onclick, ...extra }, ico ? icona(ico) : null, testo);
}

/** Intestazione della pagina con titolo, sottotitolo e azioni. */
export function testata(titolo, sotto, ...azioni) {
  return h('div', { class: 'testata' }, h('div', { class: 'titoli' }, h('h2', {}, titolo), sotto ? h('div', { class: 'sotto' }, sotto) : null), h('div', { class: 'azioni' }, azioni));
}

/** Scheda: { titolo, icona, azioni: [...], corpo: [...], tabella: el } */
export function scheda({ titolo, ico, azioni = [], corpo = null, tabella = null, classe = '' }) {
  return h('div', { class: `card ${classe}` },
    titolo ? h('div', { class: 'card-h' }, h('h3', {}, ico ? icona(ico) : null, titolo), azioni) : null,
    corpo ? h('div', { class: 'card-b' }, corpo) : null,
    tabella ? h('div', { class: 'tw' }, tabella) : null);
}

/** Tabella: intestazioni e righe (array di <tr> già fatti). */
export function tabella(intestazioni, righe) {
  return h('table', { class: 't' },
    h('thead', {}, h('tr', {}, intestazioni.map((t) => h('th', {}, t)))),
    h('tbody', {}, righe));
}

export const pill = (testo, tipo = '') => h('span', { class: `pill ${tipo}` }, testo);

export function vuoto(ico, titolo, testo, ...azioni) {
  return h('div', { class: 'vuoto' }, icona(ico), h('b', {}, titolo), testo ? h('p', {}, testo) : null, azioni.length ? h('div', { class: 'azioni', style: 'justify-content:center' }, azioni) : null);
}

export function nota(testo, tipo = '') {
  return h('div', { class: `nota ${tipo}` }, icona(tipo === 'info' ? 'info' : 'attenzione'), h('div', {}, testo));
}

// ---------------------------------------------------------------- campi
const ETICHETTE_PERSONA = [
  ['nome', 'Nome e cognome / ragione sociale'], ['qualifica', 'Qualifica'], ['indirizzo', 'Indirizzo'],
  ['telefono', 'Telefono'], ['email', 'E-mail'], ['pec', 'PEC'], ['codiceFiscale', 'Codice fiscale / P. IVA'],
];

function editorPersona(titolo, valore, rif, rimuovi) {
  const p = { ...nuovaPersona(), ...(valore || {}) };
  const inputs = {};
  const el = h('div', { class: 'persona' },
    h('div', { class: 'titolo' }, icona('anagrafica'), titolo, rif ? h('span', { class: 'rif' }, rif) : h('span', { class: 'rif' }),
      rimuovi ? bottone('cestino', '', rimuovi, 'q sm icona', { title: 'Togli' }) : null),
    h('div', { class: 'campi' }, ETICHETTE_PERSONA.map(([k, t]) => h('label', {}, t,
      inputs[k] = h('input', { type: k === 'email' || k === 'pec' ? 'email' : 'text', value: p[k] || '' })))));
  return { el, leggi: () => ({ ...p, ...Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()])) }) };
}

function editorPersone(c, valore) {
  const lista = h('div');
  const voci = [];
  const aggiungi = (v) => {
    const voce = editorPersona(`${c.etichettaSingola || 'Soggetto'} ${voci.length + 1}`, v, '', () => {
      voci.splice(voci.indexOf(voce), 1);
      voce.el.remove();
    });
    voci.push(voce);
    lista.append(voce.el);
  };
  (valore?.length ? valore : [{}]).forEach(aggiungi);
  const el = h('div', { class: 'largo' },
    h('div', { class: 'titolo', style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;font-weight:700' }, c.etichetta, c.rif ? h('span', { class: 'rif' }, c.rif) : null),
    lista, h('div', { style: 'margin-top:8px' }, bottone('piu', `Aggiungi`, () => aggiungi({}), 'q sm')));
  return { el, leggi: () => voci.map((v) => v.leggi()).filter((p) => p.nome) };
}

/**
 * Campo di un modulo. c = { chiave, etichetta, tipo, rif, obbligatorio, opzioni, largo }
 * tipi: testo, testo_lungo, data, ora, numero, importo, scelta, spunta, persona, persone
 * Restituisce { el, leggi() }.
 */
export function campo(c, valore) {
  if (c.tipo === 'persona') {
    const e = editorPersona(c.etichetta, valore, c.rif);
    e.el.classList.add('largo');
    return e;
  }
  if (c.tipo === 'persone') return editorPersone(c, valore);
  if (c.tipo === 'spunta') {
    const inp = h('input', { type: 'checkbox', checked: !!valore });
    return { el: h('label', { class: `spunta ${c.largo ? 'largo' : ''}` }, inp, c.etichetta), leggi: () => inp.checked };
  }
  let inp;
  if (c.tipo === 'testo_lungo') inp = h('textarea', { rows: c.righe || 3, required: c.obbligatorio, placeholder: c.suggerimento }, valore ?? '');
  else if (c.tipo === 'scelta') {
    inp = h('select', { required: c.obbligatorio },
      c.vuota !== false ? h('option', { value: '' }, '—') : null,
      Object.entries(c.opzioni || {}).map(([k, t]) => h('option', { value: k, selected: String(valore) === k }, t)));
  } else {
    const tipo = { data: 'date', ora: 'time', numero: 'number', importo: 'number' }[c.tipo] || 'text';
    inp = h('input', { type: tipo, value: valore ?? '', required: c.obbligatorio, readonly: c.solaLettura, placeholder: c.suggerimento, step: c.tipo === 'importo' ? '0.01' : undefined, inputmode: c.tipo === 'importo' ? 'decimal' : undefined });
  }
  const largo = c.largo ?? c.tipo === 'testo_lungo';
  const el = h('label', { class: largo ? 'largo' : '' }, h('span', {}, c.etichetta, c.obbligatorio ? ' *' : '', c.rif ? h('span', { class: 'rif' }, ` · ${c.rif}`) : null), inp);
  const leggi = () => (['numero', 'importo'].includes(c.tipo) ? (inp.value === '' ? null : Number(inp.value)) : inp.value.trim());
  return { el, leggi, input: inp };
}

/** Insieme di campi: { el, leggi() -> { chiave: valore } }. */
export function campi(elenco, valori = {}) {
  const fatti = elenco.map((c) => [c.chiave, campo(c, valori[c.chiave])]);
  return {
    el: h('div', { class: 'campi' }, fatti.map(([, f]) => f.el)),
    leggi: () => Object.fromEntries(fatti.map(([k, f]) => [k, f.leggi()])),
    primo: fatti.find(([, f]) => f.input)?.[1].input,
  };
}

// ---------------------------------------------------------------- finestre
/**
 * Finestra con un modulo. Restituisce i valori inseriti, o null se annullata.
 * chiedi({ titolo, testo, campi: [...], valori, ok: 'Salva', pericolo: false })
 */
export function chiedi({ titolo, testo = '', campi: elenco = [], valori = {}, ok = 'Salva', pericolo = false, contenuto = null, controlla = null }) {
  return new Promise((risolvi) => {
    const f = campi(elenco, valori);
    const errore = h('div');
    const dlg = h('dialog', {},
      h('form', { method: 'dialog' },
        h('div', { class: 'd-h' }, h('h2', {}, titolo), testo ? h('p', {}, testo) : null),
        h('div', { class: 'd-b' }, contenuto, elenco.length ? f.el : null, errore),
        h('div', { class: 'd-f' },
          h('button', { type: 'button', class: 'q', onclick: () => dlg.close('annulla') }, 'Annulla'),
          h('button', { type: 'submit', value: 'ok', class: pericolo ? 'd' : 'p' }, ok))));
    let esito = null;
    dlg.querySelector('form').addEventListener('submit', (e) => {
      const dati = f.leggi();
      const problema = controlla?.(dati);
      if (problema) {
        e.preventDefault();
        errore.replaceChildren(nota(problema, 'ko'));
        return;
      }
      esito = dati;
    });
    dlg.addEventListener('close', () => {
      dlg.remove();
      risolvi(dlg.returnValue === 'ok' ? esito : null);
    });
    document.body.append(dlg);
    dlg.showModal();
    f.primo?.focus();
  });
}

/** Domanda sì/no. */
export async function conferma(titolo, testo, ok = 'Conferma', pericolo = false) {
  return (await chiedi({ titolo, testo, ok, pericolo })) !== null;
}

/** Finestra libera (anteprima foto, ...): restituisce { dlg, chiudi }. */
export function finestra(titolo, corpo, piede = [], classe = '') {
  const dlg = h('dialog', { class: classe },
    h('form', { method: 'dialog' },
      h('div', { class: 'd-h', style: 'display:flex;align-items:center;gap:8px' }, h('h2', { style: 'margin-right:auto' }, titolo),
        h('button', { type: 'submit', class: 'q icona', title: 'Chiudi' }, icona('chiudi'))),
      h('div', { class: 'd-b' }, corpo),
      piede.length ? h('div', { class: 'd-f' }, piede) : null));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, chiudi: () => dlg.close() };
}

// ---------------------------------------------------------------- avvisi
export function avviso(testo, tipo = 'info') {
  let box = document.querySelector('.avvisi');
  if (!box) document.body.append(box = h('div', { class: 'avvisi' }));
  const el = h('div', { class: `avviso ${tipo}`, role: 'status' }, icona(tipo === 'errore' ? 'attenzione' : 'ok'), testo);
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), tipo === 'errore' ? 7000 : 3500);
  return el;
}
