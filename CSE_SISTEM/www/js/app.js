// Avvio di CSE_SISTEM: sceglie la piattaforma, apre l'archivio, disegna le pagine.

import { piattaforma } from './piattaforme/index.js';
import { Archivio } from './core/archivio.js';
import { nuovoCantiere } from './core/modelli.js';
import { RUOLI, modulo as cercaModulo, moduliDelRuolo } from './core/registro.js';
import { dataIt } from './core/date.js';
import { h, avviso, bottone, chiedi, testata, scheda, vuoto, pill, nota } from './ui/dom.js';
import { icona, marchio } from './ui/icone.js';
import { leggiIndirizzo, indirizzo, vai } from './ui/router.js';
import { VERSIONE } from './versione.js';
import { MODELLO_CLAUDE } from './servizi/claude.js';
import { FILE_LOGO, RADICE } from './core/cartelle.js';
import { clientDrive } from './servizi/drive.js';
import { creaSincronizzatore } from './servizi/sincro.js';
import './moduli/cse.js'; // i moduli si registrano da soli

const p = piattaforma();

// Android: collegamento diretto con Google Drive. Ogni scrittura del programma
// fa partire (dopo qualche secondo) una sincronizzazione; il sincronizzatore
// usa il disco «nudo», così le sue scritture non ne fanno partire altre.
const sincro = p.tipo === 'android' && p.servizi.tokenDrive
  ? creaSincronizzatore({ disco: p.disco, tokenDrive: p.servizi.tokenDrive, creaDrive: (t) => clientDrive(t) })
  : null;
function conAvviso(disco, f) {
  return {
    ...disco,
    async scriviByte(...a) { await disco.scriviByte(...a); f(); },
    async scriviTesto(...a) { await disco.scriviTesto(...a); f(); },
    async elimina(...a) { await disco.elimina(...a); f(); },
  };
}
const archivio = new Archivio(sincro ? conAvviso(p.disco, () => sincro.pianifica()) : p.disco);
const ruolo = 'cse'; // in futuro: scelta tra CSE e DL
const radice = document.getElementById('app');

const STATI = { in_corso: ['In corso', 'ok'], sospeso: ['Sospeso', 'at'], concluso: ['Concluso', ''] };

async function nuovoCantiereDialogo() {
  const dati = await chiedi({
    titolo: 'Nuovo cantiere',
    testo: 'Il codice diventa il nome della cartella del cantiere e non si cambia più. Il resto si completa nell’anagrafica.',
    ok: 'Crea cantiere',
    campi: [
      { chiave: 'codice', etichetta: 'Codice cantiere', tipo: 'testo', obbligatorio: true, suggerimento: 'es. 2026-015' },
      { chiave: 'denominazione', etichetta: "Denominazione dell'opera", tipo: 'testo', obbligatorio: true, suggerimento: 'es. Ristrutturazione scuola media' },
      { chiave: 'comune', etichetta: 'Comune', tipo: 'testo' },
      { chiave: 'indirizzo', etichetta: 'Indirizzo', tipo: 'testo' },
    ],
  });
  if (!dati) return;
  try {
    await archivio.creaCantiere(nuovoCantiere(dati));
    avviso(`Cantiere ${dati.codice} creato`);
    vai(indirizzo(dati.codice, 'anagrafica'));
  } catch (e) {
    avviso(e.message, 'errore');
  }
}

async function paginaCantieri() {
  const cantieri = await archivio.elencoCantieri();
  const nuovo = bottone('piu', 'Nuovo cantiere', nuovoCantiereDialogo, 'p');
  return h('div', { class: 'pagina' },
    testata('Cantieri', cantieri.length ? `${cantieri.length} cantier${cantieri.length === 1 ? 'e' : 'i'} nella cartella dei dati` : '', nuovo),
    p.tipo === 'prova' ? nota('Modalità di prova nel browser: i dati restano in memoria e spariscono chiudendo la pagina.', 'info') : null,
    p.tipo === 'android' && !(await p.servizi.permessoFile().catch(() => true))
      ? nota(h('span', {}, 'Per vedere i cantieri sincronizzati da Google Drive concedi «Accesso a tutti i file»: ', h('a', { href: '#/impostazioni' }, 'vai alle Impostazioni'), '.'))
      : null,
    cantieri.length
      ? h('div', { class: 'cantieri' }, cantieri.map((c) => {
        const [st, tipo] = STATI[c.stato] || STATI.in_corso;
        return h('a', { class: 'card c-cantiere', href: indirizzo(c.codice) },
          h('span', { class: 'cod' }, c.codice),
          h('span', { class: 'nome' }, c.denominazione),
          c.comune || c.indirizzo ? h('span', { class: 'dove' }, icona('luogo'), [c.indirizzo, c.comune].filter(Boolean).join(', ')) : null,
          h('span', { class: 'piede' }, pill(st, tipo),
            c.inizioLavori ? pill(`Inizio ${dataIt(c.inizioLavori)}`) : null,
            c.cse?.nome ? pill(`CSE ${c.cse.nome}`, 'ac') : null));
      }))
      : scheda({ corpo: vuoto('elmetto', 'Nessun cantiere', 'Crea il primo cantiere: il programma prepara la cartella con progetto, PSC, notifica, imprese e POS, giornale, foto e verbali.', bottone('piu', 'Nuovo cantiere', nuovoCantiereDialogo, 'p')) }));
}

/** Impostazioni di Claude (solo Windows): chiave API e prova del collegamento. */
async function schedaClaude() {
  const claude = p.servizi.claude;
  const st = await claude.stato();
  const campoChiave = h('input', { type: 'password', placeholder: st.chiave ? 'Chiave già inserita: scrivi qui per sostituirla' : 'sk-ant-…', autocomplete: 'off' });
  const esito = h('div');
  const prova = async () => {
    esito.replaceChildren(h('p', { class: 'mu' }, 'Prova del collegamento…'));
    const r = await claude.prova(MODELLO_CLAUDE);
    esito.replaceChildren(nota(r.testo, r.ok ? 'info' : 'ko'));
  };
  return scheda({
    titolo: 'Claude: verifica dei POS', ico: 'claude',
    corpo: [
      h('p', {}, 'Chiave API ', st.chiave ? pill(st.daAmbiente ? 'Presa da ANTHROPIC_API_KEY' : 'Inserita', 'ok') : pill('Da inserire', 'at')),
      h('p', { class: 'mu' }, 'Con la chiave API di Anthropic (console.anthropic.com › API keys) Claude legge POS, allegati e PSC e compila la check list e la lettera. La chiave resta su questo PC, cifrata con il portachiavi di Windows; il costo delle verifiche è addebitato sull’account della chiave.'),
      h('label', { class: 'campo' }, 'Chiave API', campoChiave),
      h('div', { class: 'azioni', style: 'margin-top:12px;justify-content:flex-start' },
        bottone('salva', 'Salva la chiave', async () => {
          if (!campoChiave.value.trim()) return avviso('Scrivi la chiave', 'errore');
          await claude.salvaChiave(campoChiave.value);
          const r = await claude.prova(MODELLO_CLAUDE);
          avviso(r.ok ? `Chiave salvata. ${r.testo}` : `Chiave salvata, ma: ${r.testo}`, r.ok ? 'info' : 'errore');
          disegna();
        }, 'p'),
        st.chiave ? bottone('', 'Prova il collegamento', prova) : null,
        st.chiave && !st.daAmbiente ? bottone('cestino', 'Togli la chiave', async () => { await claude.salvaChiave(''); avviso('Chiave tolta'); disegna(); }, 'q d') : null),
      esito,
    ],
  });
}

/** Logo dello studio in alto a destra nei verbali (CSE_SISTEM/logo.png, vale per tutti i cantieri). */
async function schedaLogo() {
  const anteprima = h('div', { class: 'logo-anteprima' });
  try {
    const byte = await archivio.disco.leggiByte(FILE_LOGO);
    anteprima.append(h('img', { src: URL.createObjectURL(new Blob([byte], { type: 'image/png' })), alt: 'Logo' }));
  } catch {
    anteprima.append(h('span', { class: 'mu' }, 'Nessun logo: nel verbale resta lo spazio vuoto.'));
  }
  const scegli = async () => {
    const files = p.servizi.scegliFile ? await p.servizi.scegliFile({ accetta: 'image/png,image/jpeg,.png,.jpg,.jpeg', multipli: false })
      : await new Promise((ok) => {
        const inp = h('input', { type: 'file', accept: 'image/png,image/jpeg' });
        inp.addEventListener('change', async () => ok(inp.files[0] ? [{ nome: inp.files[0].name, byte: new Uint8Array(await inp.files[0].arrayBuffer()) }] : []));
        inp.click();
      });
    if (!files?.length) return;
    try {
      // si salva come PNG, al massimo 800 px di lato
      const img = await createImageBitmap(new Blob([files[0].byte]));
      const k = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
      await archivio.disco.scriviByte(FILE_LOGO, new Uint8Array(await blob.arrayBuffer()));
      avviso('Logo salvato');
      disegna();
    } catch (e) {
      avviso(`Immagine non leggibile: ${e.message}`, 'errore');
    }
  };
  return scheda({
    titolo: 'Logo per le stampe', ico: 'foto',
    corpo: [
      h('p', { class: 'mu', style: 'margin-top:0' }, 'Compare in alto a destra nei verbali di sopralluogo. Si salva nella cartella dei cantieri, quindi arriva anche sugli altri dispositivi con Google Drive.'),
      anteprima,
      h('div', { class: 'azioni', style: 'margin-top:12px;justify-content:flex-start' },
        bottone('carica', 'Scegli il logo (PNG o JPG)', scegli, 'p'),
        bottone('cestino', 'Togli', async () => { await archivio.disco.elimina(FILE_LOGO); avviso('Logo tolto'); disegna(); }, 'q d')),
    ],
  });
}

/** Impronta SHA-1 della chiave con cui è firmato l'APK (android-extra/debug.keystore). */
const SHA1_APP = 'F0:74:47:B0:72:6C:56:0C:16:81:AB:FB:31:9B:42:26:67:F1:33:C4';

/** Pulsante «Copia» per un testo (impronta, nome del pacchetto). */
function copia(testo) {
  return bottone('', 'Copia', async () => {
    try {
      await navigator.clipboard.writeText(testo);
      avviso('Copiato');
    } catch {
      avviso('Copia non riuscita: tieni premuto sul testo per selezionarlo', 'errore');
    }
  }, 'q sm');
}

/** Android: collegamento diretto con Google Drive. */
async function schedaDrive() {
  const c = await sincro.leggi();
  const percorso = h('input', { type: 'text', value: c.percorso || RADICE, placeholder: RADICE });
  const stato = h('div');
  const disegnaStato = (cc) => stato.replaceChildren(...[
    h('p', { style: 'margin:0 0 8px' }, cc.collegato ? pill('Collegato', 'ok') : pill('Non collegato', 'at'),
      cc.collegato ? ` Cartella: Il mio Drive/${cc.percorso}` : ''),
    cc.ultima ? h('p', { class: 'mu', style: 'margin:0 0 6px' }, `Ultima sincronizzazione: ${new Date(cc.ultima).toLocaleString('it-IT')} – ${cc.esito}`) : null,
    cc.errore ? nota(cc.errore, 'ko') : null].filter(Boolean));
  disegnaStato(c);
  const ascolta = async () => disegnaStato(await sincro.leggi());
  document.addEventListener('cse-sincro', ascolta);
  const avanz = h('p', { class: 'mu piccolo', style: 'margin:6px 0 0' });
  const via = sincro.suEventi((ev) => { if (ev.tipo === 'avanzamento') avanz.textContent = ev.testo; if (ev.tipo === 'fine' || ev.tipo === 'errore') avanz.textContent = ''; });
  window.addEventListener('hashchange', () => { document.removeEventListener('cse-sincro', ascolta); via(); }, { once: true });
  const collega = async () => {
    try {
      avviso('Scegli l’account Google e consenti l’accesso a Drive');
      await sincro.collega(percorso.value.trim().replace(/^\/+|\/+$/g, '') || RADICE);
      avviso(`Google Drive collegato: ${(await sincro.leggi()).esito}`);
    } catch (e) {
      avviso(e.message, 'errore');
    }
    disegna();
  };
  return scheda({
    titolo: 'Google Drive: collegamento diretto', ico: 'aggiorna',
    corpo: [
      h('p', { class: 'mu', style: 'margin-top:0' }, 'CSE_SISTEM tiene i cantieri sul telefono (si lavora anche senza rete) e li allinea da solo con la cartella di Google Drive che il PC vede con «Google Drive per desktop». Non serve più Autosync o FolderSync: se lo usavi per questa cartella, disattivalo.'),
      stato,
      c.collegato ? null : h('details', { class: 'preparazione', open: !!c.errore && /riconosce/.test(c.errore) },
        h('summary', {}, 'Prima volta: preparazione in Google Cloud (una sola volta, meglio dal PC)'),
        h('ol', {},
          h('li', {}, 'Su ', h('b', {}, 'console.cloud.google.com'), ', con l’account Google dello studio, crea un progetto (es. «CSE SISTEM»).'),
          h('li', {}, h('b', {}, 'API e servizi › Libreria'), ': cerca «Google Drive API» e premi ', h('b', {}, 'Abilita'), '.'),
          h('li', {}, h('b', {}, 'Google Auth Platform'), ' (o «Schermata consenso OAuth»): nome app CSE_SISTEM, pubblico ', h('b', {}, 'Esterno'), '; in «Accesso ai dati» aggiungi l’ambito ', h('code', {}, 'https://www.googleapis.com/auth/drive'), '; in «Pubblico › Utenti di prova» aggiungi il tuo indirizzo Gmail.'),
          h('li', {}, h('b', {}, 'Client › Crea client › Android'), ', con questi due dati:',
            h('div', { class: 'dato' }, 'Nome del pacchetto: ', h('code', {}, 'it.sistembelluno.csesistem'), copia('it.sistembelluno.csesistem')),
            h('div', { class: 'dato' }, 'Impronta SHA-1: ', h('code', {}, SHA1_APP), copia(SHA1_APP))),
          h('li', {}, 'Torna qui e tocca ', h('b', {}, 'Collega Google Drive'), '.'))),
      h('label', { class: 'campo', style: 'margin-top:10px' }, 'Cartella su Google Drive (dentro «Il mio Drive»)', percorso),
      h('div', { class: 'azioni', style: 'margin-top:12px;justify-content:flex-start' },
        bottone('aggiorna', c.collegato ? 'Ricollega / cambia cartella' : 'Collega Google Drive', collega, c.collegato ? '' : 'p'),
        c.collegato ? bottone('aggiorna', 'Sincronizza ora', aggiornaOra, 'p') : null,
        c.collegato ? bottone('chiudi', 'Scollega', async () => { await sincro.scollega(); avviso('Google Drive scollegato: i cantieri restano sul telefono'); disegna(); }, 'q d') : null),
      avanz,
    ],
  });
}

async function paginaImpostazioni() {
  const parti = [];
  if (p.tipo === 'windows') {
    const attuale = await p.servizi.cartellaDati();
    const drive = await p.servizi.cartelleGoogleDrive();
    const usa = async (cartella) => {
      await p.servizi.usaCartellaDati(cartella);
      avviso(`I cantieri ora stanno in ${cartella}\\CSE_SISTEM`);
      disegna();
    };
    const suDrive = drive.includes(attuale);
    // i tre passi per avere gli stessi cantieri su PC e telefono, con lo stato di ognuno
    const passo = (fatto, titolo, testo, ...azioni) => h('li', { class: fatto ? 'fatto' : '' },
      h('span', { class: 'segno' }, fatto ? icona('ok') : ''), h('div', {}, h('b', {}, titolo), h('p', {}, testo), azioni.length ? h('div', { class: 'azioni', style: 'justify-content:flex-start' }, azioni) : null));
    parti.push(scheda({
      titolo: 'PC e telefono: come sincronizzare', ico: 'aggiorna',
      corpo: h('ol', { class: 'passi-sincro' },
        passo(drive.length > 0, '1. Google Drive per desktop su questo PC',
          drive.length ? `Trovato: ${drive.join(', ')}.` : 'Installa «Google Drive per desktop» (gratuito, da google.com/drive/download) e accedi con l’account Google dello studio: comparirà il disco «Il mio Drive».'),
        passo(suDrive, '2. Cantieri nella cartella di Google Drive',
          suDrive ? `I cantieri stanno in ${attuale}\\CSE_SISTEM: Google Drive li copia online da solo.` : 'Qui sotto, in «Cartella dei cantieri», premi «Usa questa» accanto alla cartella di Google Drive. I cantieri già presenti vanno copiati a mano in quella cartella (Esplora risorse).'),
        passo(false, '3. Sul telefono: collegamento diretto',
          'Installa l’APK, poi sul telefono apri Impostazioni › Google Drive › «Collega Google Drive» e scegli lo stesso account. La prima volta serve la preparazione in Google Cloud (si fa da PC, una volta sola): i passi sono nell’app del telefono e nella guida, capitolo 2.')),
    }));
    parti.push(scheda({
      titolo: 'Cartella dei cantieri', ico: 'cartella',
      corpo: [
        h('p', {}, 'I cantieri stanno in ', h('code', {}, `${attuale}\\CSE_SISTEM`), ' ', suDrive ? pill('Google Drive', 'ok') : pill('Solo su questo PC', 'at')),
        h('p', { class: 'mu' }, 'Per vedere gli stessi cantieri sul telefono e sugli altri PC scegli la cartella di Google Drive (serve l’app «Google Drive per desktop»): il programma lavora lì e Drive sincronizza.'),
        drive.length
          ? h('div', { class: 'tw', style: 'box-shadow:none;margin:12px 0' }, h('table', { class: 't' }, h('tbody', {},
            drive.map((d) => h('tr', {}, h('td', {}, icona('cartella'), ' ', h('code', {}, d)),
              h('td', { class: 'az' }, d === attuale ? pill('In uso', 'ok') : bottone('', 'Usa questa', () => usa(d), 'sm')))))))
          : nota('Google Drive per desktop non trovato su questo PC.'),
        bottone('cartella', 'Scegli un’altra cartella…', async () => {
          const c = await p.servizi.scegliCartellaDati();
          if (c) usa(c);
        }),
      ],
    }));
    parti.push(await schedaClaude());
  } else if (p.tipo === 'android') {
    if (sincro) parti.push(await schedaDrive());
    const concesso = await p.servizi.permessoFile().catch(() => true);
    parti.push(scheda({
      titolo: 'Accesso ai file', ico: 'lucchetto',
      corpo: concesso
        ? h('p', { style: 'margin:0' }, pill('Concesso', 'ok'), ' CSE_SISTEM legge anche i file portati da Google Drive.')
        : [nota('Manca il permesso «Accesso a tutti i file»: senza, i cantieri sincronizzati da Google Drive non si vedono.'),
          bottone('lucchetto', 'Concedi il permesso', async () => {
            await p.servizi.apriPermessoFile();
            // al ritorno dalle impostazioni di Android si ridisegna la pagina
            document.addEventListener('visibilitychange', function rientro() {
              if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', rientro); disegna(); }
            });
          }, 'p')],
    }));
    parti.push(scheda({
      titolo: 'Cartella dei cantieri', ico: 'cartella',
      corpo: [
        h('p', {}, 'Sul telefono i cantieri stanno in ', h('code', {}, 'Documenti/CSE_SISTEM'), '.'),
        h('p', { class: 'mu' }, 'Il modo consigliato per averli anche su Google Drive è il collegamento diretto qui sopra. In alternativa (senza collegamento diretto) si può usare un’app di sincronizzazione:'),
        h('ol', {},
          h('li', {}, 'installa «Autosync per Google Drive» (o FolderSync) dal Play Store;'),
          h('li', {}, 'crea una coppia di cartelle: sul telefono ', h('code', {}, 'Documenti/CSE_SISTEM'), ', su Drive ', h('code', {}, 'Il mio Drive/CSE_SISTEM'), ', sincronizzazione in due direzioni;'),
          h('li', {}, 'in Impostazioni › App › CSE_SISTEM › Autorizzazioni consenti «Accesso a tutti i file».')),
      ],
    }));
  } else {
    parti.push(scheda({ titolo: 'Cartella dei cantieri', ico: 'cartella', corpo: nota('Modalità di prova nel browser: i dati restano in memoria e spariscono chiudendo la pagina.', 'info') }));
  }
  parti.push(await schedaLogo());
  parti.push(scheda({
    titolo: 'Sincronizzazione', ico: 'aggiorna',
    corpo: [
      h('p', { style: 'margin-top:0' }, p.tipo === 'windows'
        ? 'Quando Google Drive porta modifiche fatte sul telefono o su un altro PC, la pagina si aggiorna da sola. Se stai scrivendo, compare in alto l’avviso «Dati nuovi» con il pulsante Aggiorna, così non perdi quello che stai scrivendo.'
        : p.tipo === 'android'
          ? 'Con Google Drive collegato, CSE_SISTEM sincronizza da solo: all’apertura, quando torni nell’app, qualche secondo dopo ogni salvataggio e ogni 3 minuti. Quello che arriva da Drive compare da solo; se stai scrivendo compare l’avviso «Dati nuovi».'
          : 'Nella prova nel browser non c’è sincronizzazione.'),
      h('ul', { class: 'mu', style: 'margin:0' },
        h('li', {}, 'Ogni registrazione (verbale, voce del giornale, verifica, foto) è un file a sé: due dispositivi non si sovrascrivono.'),
        h('li', {}, 'Se lo stesso verbale viene modificato su due dispositivi prima della sincronizzazione, Drive ne fa una copia «(1)»: il programma usa la versione più recente.'),
        h('li', {}, 'Il pulsante ', icona('aggiorna'), ' in alto a destra rilegge tutto quando vuoi.')),
    ],
  }));
  parti.push(scheda({
    titolo: 'Informazioni', ico: 'info',
    corpo: h('p', { class: 'mu', style: 'margin:0' }, `CSE_SISTEM ${VERSIONE} · ${RUOLI[ruolo].titolo} · ${{ windows: 'Windows', android: 'Android', prova: 'browser' }[p.tipo]}`, h('br'), 'SISTEM SRL STP'),
  }));
  return h('div', { class: 'pagina', style: 'max-width:860px' }, testata('Impostazioni'), h('div', { class: 'pila' }, parti));
}

function menuCantiere(cantiere, attivo, conteggi = {}) {
  return h('nav', { class: 'nav' },
    h('a', { class: 'torna', href: '#/' }, icona('indietro'), h('span', {}, 'Tutti i cantieri')),
    h('div', { class: 'chi' }, h('b', {}, cantiere.codice), h('span', {}, cantiere.denominazione)),
    moduliDelRuolo(ruolo).filter((m) => !m.nascosto).map((m) =>
      h('a', { href: indirizzo(cantiere.codice, m.id), class: `voce ${m.id === attivo ? 'attivo' : ''}` },
        icona(m.icona || 'info'), m.titoloBreve || m.titolo,
        conteggi[m.id] ? h('span', { class: 'conta', title: 'Da sistemare' }, conteggi[m.id]) : null)));
}

function barra() {
  return h('header', { class: 'appbar' },
    h('a', { class: 'brand', href: '#/' }, h('span', { class: 'logo' }, marchio()),
      h('div', {}, h('span', { class: 'az' }, 'SISTEM SRL STP'), h('h1', {}, 'CSE_SISTEM'))),
    h('div', { class: 'meta' }, 'Coordinamento sicurezza in esecuzione', h('br'), `D.Lgs 81/2008 · v${VERSIONE}`),
    h('button', { type: 'button', class: `tasto aggiorna ${sincro?.inCorso() ? 'gira' : ''}`, title: sincro ? 'Sincronizza con Google Drive e rileggi i dati' : 'Aggiorna: rilegge i dati (anche quelli arrivati da Google Drive)', onclick: aggiornaOra }, icona('aggiorna')),
    h('a', { class: 'tasto', href: '#/impostazioni', title: 'Impostazioni' }, icona('impostazioni')));
}

let inCorso = 0;
async function disegna() {
  const mio = ++inCorso;
  const ind = leggiIndirizzo();
  const corpo = h('div', { class: 'caricamento' });
  if (!radice.firstChild) radice.replaceChildren(barra(), corpo);
  try {
    let contenuto;
    if (ind.pagina === 'cantieri') {
      contenuto = await paginaCantieri();
    } else if (ind.pagina === 'impostazioni') {
      contenuto = await paginaImpostazioni();
    } else {
      const cantiere = await archivio.leggiCantiere(ind.codice);
      if (!cantiere) throw new Error(`Cantiere ${ind.codice} non trovato`);
      const m = cercaModulo(ind.modulo || 'riepilogo');
      if (!m) throw new Error(`Funzione sconosciuta: ${ind.modulo}`);
      const ctx = { archivio, servizi: p.servizi, piattaforma: p.tipo, cantiere, resto: ind.resto || [], ricarica: disegna };
      const vista = await m.disegna(ctx);
      const conteggi = {};
      for (const x of moduliDelRuolo(ruolo)) if (x.conta) conteggi[x.id] = await x.conta(ctx).catch(() => 0);
      contenuto = h('div', { class: 'pagina' }, h('div', { class: 'cantiere' }, menuCantiere(cantiere, m.menu || m.id, conteggi), h('main', {}, vista)));
    }
    if (mio !== inCorso) return; // nel frattempo si è cambiata pagina
    radice.replaceChildren(barra(), contenuto);
    sporco = false;
    nascondiNovita();
  } catch (e) {
    console.error(e);
    if (mio !== inCorso) return;
    radice.replaceChildren(barra(), h('div', { class: 'pagina' },
      scheda({ corpo: vuoto('attenzione', 'Qualcosa non va', e.message, h('a', { class: 'bottone', href: '#/' }, 'Torna ai cantieri')) })));
  }
}

// ------------------------------------------------------------ dati arrivati da altri dispositivi
// «sporco»: si sta scrivendo qualcosa nella pagina (non si ridisegna sotto le dita)
let sporco = false;
radice.addEventListener('input', () => { sporco = true; });
radice.addEventListener('change', () => { sporco = true; });

let novita = null;
function nascondiNovita() {
  novita?.remove();
  novita = null;
}
function mostraNovita() {
  if (novita) return;
  novita = h('div', { class: 'novita', role: 'status' }, icona('aggiorna'),
    h('span', {}, 'Dati nuovi arrivati da un altro dispositivo.'),
    bottone('', 'Aggiorna', () => { nascondiNovita(); disegna(); }, 'sm p'),
    bottone('chiudi', '', nascondiNovita, 'q sm icona', { title: 'Più tardi' }));
  document.body.append(novita);
}
/** Dati cambiati da fuori: si ridisegna, oppure si avvisa se si sta scrivendo. */
function datiCambiati() {
  if (sporco || document.querySelector('dialog[open]')) mostraNovita();
  else disegna();
}

async function driveCollegato() {
  return !!(sincro && (await sincro.leggi()).collegato);
}

/** Pulsante Aggiorna: con Google Drive collegato sincronizza, altrimenti rilegge. */
async function aggiornaOra() {
  nascondiNovita();
  if (await driveCollegato()) {
    try {
      const e = await sincro.sincronizza();
      avviso(e ? `Google Drive: ${(await sincro.leggi()).esito}` : 'Google Drive sincronizzato');
    } catch (err) {
      avviso(err.message, 'errore');
    }
  }
  disegna();
}

p.servizi.suCambiamenti?.(async () => {
  // Android al rientro nell'app: con Drive collegato si sincronizza (e si ridisegna se è arrivato qualcosa)
  if (await driveCollegato()) sincro.sincronizza().catch(() => {});
  else datiCambiati();
});

if (sincro) {
  sincro.suEventi((ev) => {
    const tasto = document.querySelector('.appbar .tasto.aggiorna');
    if (ev.tipo === 'inizio') tasto?.classList.add('gira');
    if (ev.tipo === 'fine' || ev.tipo === 'errore') tasto?.classList.remove('gira');
    if (ev.tipo === 'fine' && ev.cambiatiQui.length) datiCambiati();
    if (ev.tipo === 'fine' || ev.tipo === 'errore') document.dispatchEvent(new CustomEvent('cse-sincro', { detail: ev }));
  });
  driveCollegato().then((si) => { if (si) sincro.sincronizza().catch(() => {}); });
  setInterval(async () => {
    if (document.visibilityState === 'visible' && await driveCollegato()) sincro.sincronizza().catch(() => {});
  }, 3 * 60 * 1000);
}

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  disegna();
});
disegna();
