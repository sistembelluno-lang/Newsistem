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

async function paginaImpostazioni() {
  const sez = h('section', {}, h('h2', {}, 'Impostazioni'));
  if (p.tipo === 'windows') {
    const attuale = await p.servizi.cartellaDati();
    const drive = await p.servizi.cartelleGoogleDrive();
    const usa = async (cartella) => {
      await p.servizi.usaCartellaDati(cartella);
      avviso(`I cantieri ora stanno in ${cartella}\\CSE_SISTEM`);
      disegna();
    };
    sez.append(
      h('h3', {}, 'Cartella dei cantieri'),
      h('p', {}, 'I cantieri stanno in ', h('b', {}, `${attuale}\\CSE_SISTEM`), '.'),
      h('p', { class: 'rif' }, 'Per vedere gli stessi cantieri sul telefono e su altri PC, scegli la cartella di Google Drive ',
        '(serve l’app «Google Drive per desktop»): il programma lavora lì e Drive sincronizza.'),
      drive.length
        ? h('div', {}, h('p', {}, 'Cartelle di Google Drive trovate su questo PC:'),
          drive.map((d) => h('div', {}, h('code', {}, d), ' ',
            d === attuale ? h('b', {}, '(in uso)') : h('button', { onclick: () => usa(d) }, 'Usa questa'))))
        : h('p', { class: 'avviso-testo' }, 'Google Drive per desktop non trovato su questo PC.'),
      h('button', {
        onclick: async () => {
          const c = await p.servizi.scegliCartellaDati();
          if (c) usa(c);
        },
      }, 'Scegli un’altra cartella…'));
  } else if (p.tipo === 'android') {
    sez.append(
      h('h3', {}, 'Cartella dei cantieri'),
      h('p', {}, 'Sul telefono i cantieri stanno in ', h('b', {}, 'Documenti/CSE_SISTEM'), '.'),
      h('p', { class: 'rif' }, 'Per averli anche su Google Drive, collega questa cartella alla stessa cartella di Drive usata sul PC ',
        'con un’app di sincronizzazione (vedi la guida). Serve il permesso «Accesso a tutti i file» per CSE_SISTEM.'));
  } else {
    sez.append(h('p', {}, 'Modalità di prova: i dati restano in memoria e spariscono chiudendo la pagina.'));
  }
  return sez;
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
    } else if (ind.pagina === 'impostazioni') {
      contenuto = await paginaImpostazioni();
    } else {
      const cantiere = await archivio.leggiCantiere(ind.codice);
      if (!cantiere) throw new Error(`Cantiere ${ind.codice} non trovato`);
      const m = cercaModulo(ind.modulo || 'anagrafica');
      if (!m) throw new Error(`Funzione sconosciuta: ${ind.modulo}`);
      const ctx = { archivio, servizi: p.servizi, piattaforma: p.tipo, cantiere, resto: ind.resto || [], ricarica: disegna };
      contenuto = h('div', { class: 'cantiere' }, menuCantiere(cantiere, m.id), h('main', {}, await m.disegna(ctx)));
    }
    radice.replaceChildren(
      h('header', {}, h('h1', {}, h('a', { href: '#/' }, 'CSE_SISTEM')),
        h('span', { class: 'rif' }, `${RUOLI[ruolo].titolo} · v${VERSIONE} · ${p.tipo}`),
        h('a', { href: '#/impostazioni', class: 'impostazioni' }, 'Impostazioni')),
      contenuto);
  } catch (e) {
    radice.replaceChildren(h('p', { class: 'avviso errore' }, e.message), h('a', { href: '#/' }, 'Torna ai cantieri'));
    console.error(e);
  }
}

window.addEventListener('hashchange', disegna);
disegna();
