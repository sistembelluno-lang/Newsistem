// Iter della procedura: fasi comuni della pratica, passi per ditta secondo il percorso scelto, termini e scadenzario.
// I termini sono quelli del D.P.R. 327/2001 (TUES) e della L. 241/1990; sono promemoria, da verificare sul testo vigente.
(function (ES) {
  'use strict';
  const I = ES.iter = {}, U = ES.U;
  const gg = n => s => U.addGiorni(s, n), mesi = n => s => U.addMesi(s, n), anni = n => s => U.addAnni(s, n);

  // Fasi della pratica (una data per pratica). t: termini che nascono dalla data della fase.
  I.FASI = [
    { k: 'accesso', nome: 'Accesso ai fondi per rilievi', art: 'art. 15', t: [{ nome: 'Avviso ai proprietari almeno 7 giorni prima dell\'accesso', f: gg(-7), min: true }] },
    { k: 'avvio11', nome: 'Avvio procedimento apposizione vincolo', art: 'art. 11', t: [{ nome: 'Osservazioni dei proprietari (30 giorni)', f: gg(30) }, { nome: 'Delibera/atto non prima di 20 giorni dall\'avviso', f: gg(20), min: true }] },
    { k: 'avvio16', nome: 'Avvio procedimento dichiarazione di pubblica utilità', art: 'art. 16', t: [{ nome: 'Osservazioni dei proprietari (30 giorni, perentorio)', f: gg(30) }] },
    { k: 'vincolo', nome: 'Vincolo preordinato all\'esproprio efficace', art: 'artt. 9-10', t: [{ nome: 'Decadenza del vincolo (5 anni)', f: anni(5) }] },
    { k: 'dpu', nome: 'Dichiarazione di pubblica utilità efficace (approvazione progetto)', art: 'artt. 12-13', t: [{ nome: 'Termine per il decreto di esproprio (5 anni, prorogabile fino a 2)', f: anni(5) }, { nome: 'Elenco beni e offerta (procedura ordinaria) entro 30 giorni', f: gg(30) }] },
    { k: 'proroga', nome: 'Proroga della dichiarazione di pubblica utilità', art: 'art. 13 c.5', t: [] },
    { k: 'com17', nome: 'Comunicazione efficacia DPU ai proprietari', art: 'art. 17 c.2', t: [{ nome: 'Osservazioni ed elementi per la stima (30 giorni)', f: gg(30) }] },
    { k: 'frazionamento', nome: 'Frazionamento catastale approvato', art: '', t: [] },
    { k: 'decreto', nome: 'Decreto di esproprio / asservimento / occupazione', art: 'artt. 22, 22-bis, 23', t: [{ nome: 'Trasmissione estratto per BUR/GURI (5 giorni)', f: gg(5) }, { nome: 'Esecuzione con immissione in possesso (2 anni, perentorio)', f: anni(2) }] },
    { k: 'decreto22bis', nome: 'Decreto di occupazione d\'urgenza', art: 'art. 22-bis', t: [{ nome: 'Immissione in possesso entro 3 mesi (altrimenti il decreto perde efficacia)', f: mesi(3) }] },
    { k: 'bur', nome: 'Pubblicazione estratto sul BUR / GURI', art: 'art. 23 c.5', t: [{ nome: 'Opposizione dei terzi (30 giorni)', f: gg(30) }] },
    { k: 'trascrizione', nome: 'Registrazione, trascrizione e voltura', art: 'art. 23 c.4', t: [] },
    { k: 'avvio49', nome: 'Avvio procedimento occupazione temporanea', art: 'art. 49 – art. 7 L. 241/1990', t: [{ nome: 'Memorie e documenti (15 giorni)', f: gg(15) }] },
    { k: 'decreto49', nome: 'Decreto di occupazione temporanea', art: 'art. 49', t: [] },
    { k: 'atto42bis', nome: 'Provvedimento di acquisizione sanante', art: 'art. 42-bis', t: [{ nome: 'Pagamento o deposito dell\'indennizzo (30 giorni, condizione sospensiva)', f: gg(30) }, { nome: 'Comunicazione alla Corte dei conti (30 giorni)', f: gg(30) }] },
    { k: 'fine_lavori', nome: 'Ultimazione dell\'opera', art: 'art. 46', t: [] }
  ];

  // Passi per ditta secondo il percorso. Ogni passo ha i modelli di documento collegati e i termini per la ditta.
  const P = (k, nome, art, modelli, t) => ({ k, nome, art, modelli: modelli || [], t: t || [] });
  const comuni = [
    P('avvio', 'Avviso di avvio del procedimento (vincolo e/o DPU)', 'artt. 11 e 16', ['avvio_11_16', 'avvio_16'], [{ nome: 'Osservazioni (30 giorni dal ricevimento)', f: gg(30), da: 'notifica' }]),
    P('com17', 'Comunicazione efficacia DPU e invito a fornire elementi per la stima', 'art. 17 c.2', ['com_17'], [{ nome: 'Osservazioni ed elementi per la stima (30 giorni)', f: gg(30), da: 'notifica' }])
  ];
  const esecuzione = [
    P('avviso_imm', 'Notifica del decreto con avviso di immissione in possesso', 'art. 23 c.1 lett. g', ['avviso_immissione'], [{ nome: 'Immissione non prima di 7 giorni dalla notifica', f: gg(7), da: 'notifica', min: true }]),
    P('immissione', 'Stato di consistenza e verbale di immissione in possesso', 'art. 24', ['verbale_consistenza'], [])
  ];
  const pagamento = [
    P('condivisione', 'Condivisione dell\'indennità e dichiarazione di piena proprietà', 'artt. 20 c.5-6, 22 c.3', ['condivisione'], [{ nome: 'Documentazione di piena e libera proprietà (60 giorni)', f: gg(60) }]),
    P('pagamento', 'Pagamento dell\'indennità', 'artt. 20 c.8, 26', ['pagamento'], []),
    P('deposito', 'Deposito presso MEF – Ragioneria Territoriale dello Stato', 'artt. 20 c.14, 26', ['deposito'], []),
    P('stima21', 'Determinazione definitiva (collegio tecnici o Commissione provinciale)', 'art. 21', ['invito_21'], [{ nome: 'Designazione del tecnico di fiducia (20 giorni)', f: gg(20), da: 'notifica' }])
  ];
  I.PASSI = {
    art20: [...comuni,
      P('offerta', 'Notifica elenco beni e somma offerta', 'art. 20 c.1', ['offerta_20'], [{ nome: 'Osservazioni e documenti (30 giorni dalla notifica)', f: gg(30), da: 'notifica' }]),
      P('det_provv', 'Determinazione e notifica dell\'indennità provvisoria', 'art. 20 c.3-4', ['offerta_20'], [{ nome: 'Condivisione dell\'indennità (30 giorni dalla notifica)', f: gg(30), da: 'notifica' }]),
      ...pagamento.slice(0, 3), P('decreto', 'Decreto di esproprio', 'artt. 20, 23', ['decreto_23', 'estratto_bur'], []), ...esecuzione, pagamento[3]],
    art22: [...comuni, P('decreto', 'Decreto di esproprio con determinazione urgente dell\'indennità', 'artt. 22, 23', ['decreto_esproprio', 'estratto_bur'], []), ...esecuzione,
      P('condivisione', 'Condivisione dell\'indennità (entro 30 giorni dall\'immissione)', 'art. 22 c.3', ['condivisione'], [{ nome: 'Termine per la condivisione', f: gg(30), da: 'immissione' }]),
      ...pagamento.slice(1)],
    art22bis: [...comuni, P('decreto_occ', 'Decreto di occupazione d\'urgenza e indennità provvisoria', 'art. 22-bis', ['decreto_22bis'], []),
      P('avviso_imm', 'Avviso di esecuzione del decreto di occupazione', 'artt. 22-bis c.4, 24', ['avviso_immissione'], [{ nome: 'Immissione non prima di 7 giorni dalla notifica', f: gg(7), da: 'notifica', min: true }]),
      P('immissione', 'Stato di consistenza e verbale di immissione in possesso', 'artt. 22-bis c.4, 24', ['verbale_consistenza'], []),
      P('condivisione', 'Condivisione dell\'indennità (entro 30 giorni dall\'immissione) – acconto 80%', 'art. 22-bis c.3', ['condivisione'], [{ nome: 'Termine per la condivisione', f: gg(30), da: 'immissione' }]),
      ...pagamento.slice(1, 3), P('decreto', 'Decreto di esproprio (entro il termine della DPU)', 'artt. 22-bis, 23', ['decreto_23', 'estratto_bur'], []), pagamento[3]],
    cessione: [...comuni, P('offerta', 'Offerta dell\'indennità', 'art. 20 c.1', ['offerta_20'], [{ nome: 'Osservazioni (30 giorni)', f: gg(30), da: 'notifica' }]),
      P('condivisione', 'Istanza di cessione volontaria', 'art. 45', ['condivisione'], []), P('cessione', 'Atto di cessione volontaria', 'art. 45', ['cessione'], []), pagamento[1]],
    art42bis: [P('avvio42', 'Avvio del procedimento di acquisizione', 'art. 42-bis – art. 7 L. 241/1990', ['avvio_42bis'], [{ nome: 'Memorie e documenti (giorni indicati nell\'avviso)', f: gg(30), da: 'notifica' }]),
      P('atto42', 'Provvedimento di acquisizione e indennizzo', 'art. 42-bis c.1-4', ['atto_42bis'], [{ nome: 'Pagamento o deposito entro 30 giorni dal provvedimento', f: gg(30) }]),
      pagamento[1], pagamento[2]],
    art49: [P('avvio49', 'Avvio del procedimento di occupazione temporanea', 'art. 49 – art. 7 L. 241/1990', ['avvio_49'], [{ nome: 'Memorie e documenti (15 giorni)', f: gg(15), da: 'notifica' }]),
      P('decreto49', 'Decreto di occupazione temporanea', 'artt. 49-50', ['decreto_49'], []),
      P('avviso_imm', 'Avviso di esecuzione dell\'occupazione', 'art. 49 c.4', ['avviso_immissione'], [{ nome: 'Immissione non prima di 7 giorni dalla notifica', f: gg(7), da: 'notifica', min: true }]),
      P('immissione', 'Verbale di immissione e stato di consistenza', 'art. 49', ['verbale_consistenza'], []),
      P('restituzione', 'Avviso e verbale di restituzione delle aree', 'art. 49', ['restituzione'], []), pagamento[1]]
  };
  I.passi = proc => I.PASSI[proc] || I.PASSI.art22;

  // Scadenzario: termini della pratica e delle ditte. Ogni voce: {data, cosa, art, ditta, min, fatto}
  I.scadenze = pr => {
    const out = [], it = pr.iter || {};
    I.FASI.forEach(f => {
      const x = it[f.k]; if (!x || !x.data) return;
      f.t.forEach(t => {
        let data = t.f(x.data);
        if (f.k === 'dpu' && t.nome.startsWith('Termine') && it.proroga && it.proroga.data) data = it.proroga.scadenza || data;
        out.push({ data, cosa: t.nome, fase: f.nome, art: f.art, min: !!t.min });
      });
    });
    const proc0 = (pr.impost && pr.impost.procedura) || 'art22';
    (pr.ditte || []).forEach(d => {
      const ev = d.ev || {};
      I.passi(d.procedura || proc0).forEach(p => {
        const e = ev[p.k] || {};
        p.t.forEach(t => {
          // I termini «dall'immissione» partono dal verbale di immissione anche se il passo non è ancora registrato
          const base = t.da === 'notifica' ? (e.notifica || e.data) : t.da === 'immissione' ? ((ev.immissione || {}).data) : e.data;
          if (!base) return;
          const succ = I.passi(d.procedura || proc0); const idx = succ.indexOf(p);
          const fatto = succ.slice(idx + 1).some(q => ev[q.k] && ev[q.k].data);
          out.push({ data: t.f(base), cosa: t.nome, fase: p.nome, art: p.art, ditta: d, min: !!t.min, fatto });
        });
      });
    });
    return out.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  };
  I.statoScad = (s, oggi = U.oggi()) => {
    if (s.min) return s.data > oggi ? 'attesa' : 'ok';
    if (s.fatto) return 'fatto';
    const g = U.giorniTra(oggi, s.data);
    return g < 0 ? 'scaduta' : g <= 15 ? 'prossima' : 'futura';
  };

  // Avanzamento della ditta: ultimo passo con data
  I.avanzamento = (d, proc0) => {
    const L = I.passi(d.procedura || proc0), ev = d.ev || {};
    let ultimo = null; L.forEach(p => { if (ev[p.k] && ev[p.k].data) ultimo = p; });
    const fatti = L.filter(p => ev[p.k] && ev[p.k].data).length;
    return { ultimo, fatti, totale: L.length, prossimo: L.find(p => !(ev[p.k] && ev[p.k].data)) || null };
  };
})(ES);
