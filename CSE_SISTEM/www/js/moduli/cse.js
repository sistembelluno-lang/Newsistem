// Moduli del Coordinatore per la sicurezza in fase di esecuzione.
// Interfaccia essenziale: la grafica definitiva verrà dopo. Ogni modulo
// riceve ctx = { archivio, servizi, piattaforma, cantiere, ricarica }.

import { registra } from '../core/registro.js';
import { CAMPI_ANAGRAFICA, nuovaImpresa, nuovoPos } from '../core/modelli.js';
import { SEZIONI, cartellaSezione, percorso } from '../core/cartelle.js';
import { dataIt, dataOraIt, oggi } from '../core/date.js';
import { h, modulo, avviso } from '../ui/dom.js';
import { indirizzo, vai } from '../ui/router.js';
import { caricaDocumento, elencoDocumenti, percorsoDocumento } from '../servizi/documenti.js';
import { importaFoto, perGiorno } from '../servizi/foto.js';
import { timbraFoto } from '../servizi/timbro.js';
import { nuovaVerifica, esitoProposto, prescrizioniProposte, situazionePos } from '../servizi/pos.js';
import { nomeFileVoce, nuovaVoce, ordinaVoci } from '../servizi/giornale.js';
import { nuovoVerbaleSopralluogo, nomeFileVerbale, numeriDoppi } from '../servizi/verbali.js';
import { htmlVerbale, htmlVerificaPos } from '../servizi/stampa.js';
import { CONTENUTI_POS, ESITI_VERIFICA_POS, ESITI_VOCE_POS } from '../servizi/normativa.js';

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
    avviso(`PDF salvato: ${p}`);
  } else {
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  }
}

// ------------------------------------------------------------------ anagrafica
registra({
  id: 'anagrafica', titolo: 'Anagrafica di cantiere', ruolo: 'cse', ordine: 10,
  async disegna(ctx) {
    return h('section', {},
      h('h2', {}, 'Anagrafica di cantiere'),
      modulo(CAMPI_ANAGRAFICA, ctx.cantiere, async (dati) => {
        if (dati.codice !== ctx.cantiere.codice) {
          avviso('Il codice del cantiere non si cambia (è il nome della cartella).', 'errore');
          dati.codice = ctx.cantiere.codice;
        }
        await ctx.archivio.salvaCantiere({ ...ctx.cantiere, ...dati });
        avviso('Anagrafica salvata');
        ctx.ricarica();
      }));
  },
});

// ------------------------------------------------------------------ documenti
for (const [i, sezione] of ['progetto', 'psc', 'notifica'].entries()) {
  registra({
    id: sezione, titolo: SEZIONI[sezione].titolo, ruolo: 'cse', ordine: 20 + i, sezione,
    async disegna(ctx) {
      const docs = await elencoDocumenti(ctx.archivio, ctx.cantiere.codice, sezione);
      return h('section', {},
        h('h2', {}, SEZIONI[sezione].titolo),
        h('button', {
          onclick: async () => {
            for (const f of await scegliFile(ctx)) await caricaDocumento(ctx.archivio, ctx.cantiere.codice, sezione, f);
            ctx.ricarica();
          },
        }, 'Carica documenti…'),
        h('table', { class: 'elenco' },
          h('tr', {}, h('th', {}, 'Documento'), h('th', {}, 'Rev.'), h('th', {}, 'Data'), h('th', {})),
          docs.map((d) => h('tr', {},
            h('td', {}, d.titolo), h('td', {}, d.revisione), h('td', {}, dataIt(d.data)),
            h('td', {}, h('button', { onclick: () => apri(ctx, percorsoDocumento(ctx.cantiere.codice, d)) }, 'Apri'))))));
    },
  });
}

// ------------------------------------------------------------------ imprese e POS
registra({
  id: 'imprese', titolo: 'Imprese, POS e verifiche', ruolo: 'cse', ordine: 30, sezione: 'imprese',
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const imprese = await ctx.archivio.elencoImprese(cod);
    const posTutti = [];
    for (const imp of imprese) posTutti.push(...(await ctx.archivio.leggiTutti(ctx.archivio.cartellaPos(cod, imp))).filter((p) => p.tipo === 'pos'));
    const verifiche = await ctx.archivio.registrazioni(cod, 'verifichePos');
    const situazione = situazionePos(imprese, posTutti, verifiche);
    return h('section', {},
      h('h2', {}, 'Imprese, POS e verifiche'),
      h('button', {
        onclick: async () => {
          const nome = prompt('Ragione sociale della nuova impresa');
          if (!nome) return;
          await ctx.archivio.salvaImpresa(cod, nuovaImpresa({ ragioneSociale: nome, ingresso: oggi() }));
          ctx.ricarica();
        },
      }, 'Nuova impresa…'),
      h('table', { class: 'elenco' },
        h('tr', {}, h('th', {}, 'Impresa'), h('th', {}, 'POS'), h('th', {}, 'Verifica'), h('th', {}, 'Da fare'), h('th', {})),
        situazione.map((s) => h('tr', { class: s.puoLavorare ? 'ok' : 'attenzione' },
          h('td', {}, s.impresa.ragioneSociale),
          h('td', {}, s.pos ? `rev. ${s.pos.revisione} ricevuto il ${dataIt(s.pos.dataRicezione)}` : '—'),
          h('td', {}, s.verifica ? `${ESITI_VERIFICA_POS[s.verifica.esito] || 'in corso'} (${dataIt(s.verifica.data)})` : '—'),
          h('td', {}, s.daFare),
          h('td', {},
            h('button', {
              onclick: async () => {
                const [f] = await scegliFile(ctx, { accetta: '.pdf', multipli: false });
                if (!f) return;
                const cart = ctx.archivio.cartellaPos(cod, s.impresa);
                const nome = await ctx.archivio.salvaFile(cart, f.nome, f.byte);
                const revisione = String(posTutti.filter((p) => p.impresa === s.impresa.id).length);
                await ctx.archivio.scriviJson(percorso(cart, `${nome}.json`), nuovoPos({ impresa: s.impresa.id, file: nome, revisione }));
                ctx.ricarica();
              },
            }, 'Carica POS…'),
            s.pos ? h('button', { onclick: () => vai(indirizzo(cod, 'verifica', s.impresa.id, s.pos.id)) }, 'Verifica') : null)))));
  },
});

// verifica di un POS (pagina aperta da "Imprese")
registra({
  id: 'verifica', titolo: 'Verifica POS', ruolo: 'cse', ordine: 999, nascosto: true,
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const [impresaId, posId] = ctx.resto;
    const impresa = (await ctx.archivio.elencoImprese(cod)).find((i) => i.id === impresaId);
    const pos = (await ctx.archivio.leggiTutti(ctx.archivio.cartellaPos(cod, impresa))).find((p) => p.id === posId);
    const esistenti = (await ctx.archivio.registrazioni(cod, 'verifichePos')).filter((v) => v.pos === posId);
    const verifica = esistenti.pop() || nuovaVerifica(impresaId, posId);
    const righe = CONTENUTI_POS.map((c) => {
      const voce = verifica.voci.find((v) => v.codice === c.codice);
      const sel = h('select', { onchange: (e) => { voce.esito = e.target.value; } },
        h('option', { value: '' }, '—'),
        Object.entries(ESITI_VOCE_POS).map(([k, t]) => h('option', { value: k, selected: voce.esito === k }, t)));
      return h('tr', {}, h('td', {}, `${c.codice}) ${c.testo}`), h('td', {}, sel));
    });
    return h('section', {},
      h('h2', {}, `Verifica del POS – ${impresa.ragioneSociale} (rev. ${pos.revisione})`),
      h('table', { class: 'elenco' }, righe),
      h('button', {
        onclick: async () => {
          verifica.esito = esitoProposto(verifica.voci) || verifica.esito;
          verifica.prescrizioni = verifica.prescrizioni || prescrizioniProposte(verifica.voci);
          const salvata = await ctx.archivio.salvaRegistrazione(cod, 'verifichePos', verifica);
          await salvaPdf(ctx, htmlVerificaPos(ctx.cantiere, impresa, pos, salvata),
            percorso(cartellaSezione(cod, 'verifichePos'), `Verifica POS ${impresa._cartella} rev ${pos.revisione}.pdf`));
          vai(indirizzo(cod, 'imprese'));
        },
      }, 'Salva verifica e crea PDF'));
  },
});

// ------------------------------------------------------------------ giornale
registra({
  id: 'giornale', titolo: 'Giornale dei lavori', ruolo: 'cse', ordine: 40, sezione: 'giornale',
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const voci = ordinaVoci(await ctx.archivio.registrazioni(cod, 'giornale'));
    return h('section', {},
      h('h2', {}, 'Giornale dei lavori'),
      h('button', {
        onclick: async () => {
          try {
            const v = nuovaVoce(voci, oggi());
            v.osservazioni = prompt('Osservazioni del giorno') || '';
            await ctx.archivio.salvaRegistrazione(cod, 'giornale', v, nomeFileVoce(v));
            ctx.ricarica();
          } catch (e) {
            avviso(e.message, 'errore');
          }
        },
      }, 'Voce di oggi…'),
      h('ul', { class: 'elenco' }, voci.map((v) => h('li', {}, h('b', {}, dataIt(v.data)), ' – ', v.osservazioni || v.lavorazioni || ''))));
  },
});

// ------------------------------------------------------------------ registro fotografico
registra({
  id: 'foto', titolo: 'Registro fotografico', ruolo: 'cse', ordine: 50, sezione: 'foto',
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const gruppi = perGiorno(await ctx.archivio.registrazioni(cod, 'foto'));
    const importa = async (files) => {
      for (const f of files) await importaFoto(ctx.archivio, cod, f, timbraFoto);
      ctx.ricarica();
    };
    return h('section', {},
      h('h2', {}, 'Registro fotografico'),
      ctx.servizi.scatta ? h('button', { onclick: async () => importa([await ctx.servizi.scatta()]) }, 'Scatta foto') : null,
      h('button', { onclick: async () => importa(ctx.servizi.scegliFoto ? await ctx.servizi.scegliFoto() : await scegliFile(ctx, { accetta: 'image/jpeg' })) }, 'Carica foto…'),
      gruppi.map((g) => h('div', { class: 'giorno' },
        h('h3', {}, dataIt(g.giorno)),
        h('ul', {}, g.foto.map((f) => h('li', {},
          h('a', { href: '#', onclick: (e) => { e.preventDefault(); apri(ctx, percorso(cartellaSezione(cod, 'foto'), 'timbrate', f.timbrata)); } }, dataOraIt(f.scattata)),
          f.fonteData !== 'exif' ? h('span', { class: 'rif' }, ' (data dal file: verificare)') : null,
          f.didascalia ? ` – ${f.didascalia}` : ''))))));
  },
});

// ------------------------------------------------------------------ verbali
registra({
  id: 'verbali', titolo: 'Verbali di sopralluogo', ruolo: 'cse', ordine: 60, sezione: 'verbali',
  async disegna(ctx) {
    const cod = ctx.cantiere.codice;
    const verbali = (await ctx.archivio.registrazioni(cod, 'verbali')).sort((a, b) => b.numero - a.numero);
    const imprese = await ctx.archivio.elencoImprese(cod);
    return h('section', {},
      h('h2', {}, 'Verbali di sopralluogo'),
      h('button', {
        onclick: async () => {
          const v = nuovoVerbaleSopralluogo(verbali, { imprese });
          v.lavorazioniInCorso = prompt('Lavorazioni in corso') || '';
          const salvato = await ctx.archivio.salvaRegistrazione(cod, 'verbali', v, nomeFileVerbale(v));
          await salvaPdf(ctx, htmlVerbale(ctx.cantiere, salvato, { imprese }),
            percorso(cartellaSezione(cod, 'verbali'), `Verbale ${String(v.numero).padStart(3, '0')} del ${v.data}.pdf`));
          ctx.ricarica();
        },
      }, 'Nuovo verbale…'),
      numeriDoppi(verbali).length
        ? h('p', { class: 'avviso-testo' }, `Attenzione: numeri usati due volte (${numeriDoppi(verbali).join(', ')}), `,
          'probabilmente verbali creati su due dispositivi prima della sincronizzazione. Rinumerarli prima di chiuderli.')
        : null,
      h('ul', { class: 'elenco' }, verbali.map((v) => h('li', {}, `n. ${v.numero} del ${dataIt(v.data)}${v.chiuso ? ' (chiuso)' : ''}`))));
  },
});
