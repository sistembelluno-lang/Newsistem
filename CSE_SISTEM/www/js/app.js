// Avvio di CSE_SISTEM: sceglie la piattaforma, apre l'archivio, disegna le pagine.

import { piattaforma } from './piattaforme/index.js';
import { Archivio } from './core/archivio.js';
import { nuovoCantiere } from './core/modelli.js';
import { RUOLI, modulo as cercaModulo, moduliDelRuolo } from './core/registro.js';
import { h, avviso } from './ui/dom.js';
import { leggiIndirizzo, indirizzo, vai } from './ui/router.js';
import { VERSIONE } from './versione.js';
import './moduli/cse.js'; // i moduli si registrano da soli

const p = piattaforma();
const archivio = new Archivio(p.disco);
const ruolo = 'cse'; // in futuro: scelta tra CSE e DL
const radice = document.getElementById('app');

async function paginaCantieri() {
  const cantieri = await archivio.elencoCantieri();
  return h('section', {},
    h('h2', {}, 'Cantieri'),
    h('button', {
      onclick: async () => {
        const codice = prompt('Codice del nuovo cantiere (es. 2026-015)');
        if (!codice) return;
        const denominazione = prompt("Denominazione dell'opera") || codice;
        try {
          await archivio.creaCantiere(nuovoCantiere({ codice, denominazione }));
          vai(indirizzo(codice, 'anagrafica'));
        } catch (e) {
          avviso(e.message, 'errore');
        }
      },
    }, 'Nuovo cantiere…'),
    h('ul', { class: 'elenco' }, cantieri.map((c) => h('li', {},
      h('a', { href: indirizzo(c.codice) }, `${c.codice} – ${c.denominazione}`),
      c.comune ? ` (${c.comune})` : ''))));
}

function menuCantiere(cantiere, attivo) {
  return h('nav', { class: 'menu' },
    h('a', { href: '#/' }, '← Cantieri'),
    h('b', {}, `${cantiere.codice} – ${cantiere.denominazione}`),
    moduliDelRuolo(ruolo).filter((m) => !m.nascosto).map((m) =>
      h('a', { href: indirizzo(cantiere.codice, m.id), class: m.id === attivo ? 'attivo' : '' }, m.titolo)));
}

async function disegna() {
  const ind = leggiIndirizzo();
  radice.replaceChildren(h('p', {}, 'Caricamento…'));
  try {
    let contenuto;
    if (ind.pagina === 'cantieri') {
      contenuto = await paginaCantieri();
    } else {
      const cantiere = await archivio.leggiCantiere(ind.codice);
      if (!cantiere) throw new Error(`Cantiere ${ind.codice} non trovato`);
      const m = cercaModulo(ind.modulo || 'anagrafica');
      if (!m) throw new Error(`Funzione sconosciuta: ${ind.modulo}`);
      const ctx = { archivio, servizi: p.servizi, piattaforma: p.tipo, cantiere, resto: ind.resto || [], ricarica: disegna };
      contenuto = h('div', { class: 'cantiere' }, menuCantiere(cantiere, m.id), h('main', {}, await m.disegna(ctx)));
    }
    radice.replaceChildren(
      h('header', {}, h('h1', {}, 'CSE_SISTEM'), h('span', { class: 'rif' }, `${RUOLI[ruolo].titolo} · v${VERSIONE} · ${p.tipo}`)),
      contenuto);
  } catch (e) {
    radice.replaceChildren(h('p', { class: 'avviso errore' }, e.message), h('a', { href: '#/' }, 'Torna ai cantieri'));
    console.error(e);
  }
}

window.addEventListener('hashchange', disegna);
disegna();
