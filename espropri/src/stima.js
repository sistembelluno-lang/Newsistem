// Stima delle indennità (D.P.R. 327/2001). Criteri e percentuali sono nelle impostazioni della pratica e vanno
// verificati dal tecnico estimatore: il programma applica le formule, non sostituisce la perizia.
//  - esproprio: valore venale (art. 37 aree edificabili, art. 38 costruzioni, art. 40 c.1 aree non edificabili
//    dopo Corte cost. 181/2011, che ha eliminato il VAM come base dei commi 2 e 3);
//  - art. 37 c.1: riduzione del 25% per interventi di riforma economico-sociale (opzione);
//  - art. 37 c.2 / art. 45 c.2 lett. a: +10% per aree edificabili in caso di cessione volontaria o indennità condivisa;
//  - art. 40 c.4: indennità aggiuntiva al proprietario coltivatore diretto o IAP (VAM della coltura praticata);
//  - art. 42: indennità aggiuntiva a fittavolo, mezzadro, colono o compartecipante (VAM);
//  - art. 44: servitù = percentuale del valore venale dell'area asservita;
//  - art. 50 (e 22-bis c.5): occupazione = 1/12 annuo dell'indennità di esproprio, 1/12 dell'annua per ogni mese o frazione;
//  - art. 33: deprezzamento della parte residua (importo a corpo); soprassuoli e frutti pendenti a corpo;
//  - art. 42-bis: valore venale + 10% per il pregiudizio non patrimoniale + 5% annuo per il periodo di occupazione senza titolo;
//  - art. 35: ritenuta del 20% a titolo d'imposta per aree in zone omogenee A, B, C, D (solo informativa, non per imprese).
(function (ES) {
  'use strict';
  const S = ES.stima = {}, U = ES.U;

  S.PROCEDURE = {
    art20: { nome: 'Ordinaria (art. 20)', breve: 'Art. 20' },
    art22: { nome: 'Decreto con indennità urgente (art. 22)', breve: 'Art. 22' },
    art22bis: { nome: "Occupazione d'urgenza preordinata (art. 22-bis)", breve: 'Art. 22-bis' },
    cessione: { nome: 'Cessione volontaria (art. 45)', breve: 'Cessione' },
    art42bis: { nome: 'Acquisizione sanante (art. 42-bis)', breve: 'Art. 42-bis' },
    art49: { nome: 'Sola occupazione temporanea (art. 49)', breve: 'Art. 49' }
  };

  S.IMPOST = {
    procedura: 'art22', ragguaglio: false, sottrai: true,
    coeffServop: 1, coeffServ: 0.25, mesiOcc: 12, mesiUrg: 0,
    maggEdif: 10, maggNonEdif: 0, riforma: false, triploVam: false,
    nonPatr42bis: 10, interessi42bis: 5, ritenuta: 20, arrotonda: 0.01
  };

  // Categorie predefinite con le qualità catastali più comuni; «chiavi»: inizi di parola riconosciuti nella qualità della visura
  S.VALORI = [
    { id: 'sem', nome: 'Seminativo', chiavi: 'semin', edif: false, vu: 0, vam: 0 },
    { id: 'pra', nome: 'Prato', chiavi: 'prat', edif: false, vu: 0, vam: 0 },
    { id: 'pas', nome: 'Pascolo / Alpe', chiavi: 'pasc alp', edif: false, vu: 0, vam: 0 },
    { id: 'bos', nome: 'Bosco', chiavi: 'bosc cast', edif: false, vu: 0, vam: 0 },
    { id: 'col', nome: 'Vigneto / frutteto / orto', chiavi: 'vign frut orto ulive', edif: false, vu: 0, vam: 0 },
    { id: 'inc', nome: 'Incolto / improduttivo', chiavi: 'incol impro steril rocc', edif: false, vu: 0, vam: 0 },
    { id: 'eu', nome: 'Ente urbano / corte', chiavi: 'ente fabb corte urb', edif: false, vu: 0, vam: 0 },
    { id: 'edB', nome: 'Area edificabile (zona B)', chiavi: '', edif: true, vu: 0, vam: 0 }
  ];

  // Categoria di stima: quella scelta, altrimenti la prima le cui chiavi (o le prime 4 lettere del nome) iniziano una parola della qualità
  S.categoria = (p, valori) => {
    if (p.val) { const v = valori.find(x => x.id === p.val); if (v) return v; }
    const q = U.norm(p.qual); if (!q) return null;
    const parole = q.split(' ');
    return valori.find(v => {
      const ch = (v.chiavi != null && v.chiavi !== '' ? String(v.chiavi) : v.edif ? '' : U.norm(v.nome).split(' ')[0].slice(0, 4)).split(/[\s,]+/).filter(Boolean).map(U.norm);
      return ch.some(c => parole.some(w => w.startsWith(c)));
    }) || null;
  };
  S.zonaRitenuta = z => /^\s*(z\.?\s*t\.?\s*o\.?\s*)?(zona\s*)?[ABCD](\b|\d)/i.test(String(z || ''));

  // Mesi fra due date (per l'art. 50 la frazione di mese conta come mese intero)
  S.mesi = (da, a) => {
    const x = U.d(da), y = U.d(a); if (!x || !y || y < x) return 0;
    let m = (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth();
    if (y.getDate() > x.getDate()) m++;
    return Math.max(1, m);
  };

  // Calcolo di una particella dentro la sua ditta
  S.particella = (p, d, pr, Sup) => {
    const I = Object.assign({}, S.IMPOST, pr.impost || {});
    const a = ES.analisi.aree(p, Sup, I);
    const cat = S.categoria(p, pr.valori || []);
    const vu = U.num(p.vu) || (cat ? U.num(cat.vu) : 0);
    const edif = p.edif != null && p.edif !== '' ? !!p.edif : !!(cat && cat.edif);
    const vam = cat ? U.num(cat.vam) : 0;
    const proc = (d && d.procedura) || I.procedura;
    const cess = proc === 'cessione' || !!(d && d.cessione);
    const r = x => Math.round(x / I.arrotonda) * I.arrotonda;
    const v = { vu, edif, vam, cat: cat ? cat.nome : '', aree: a, proc, voci: {} };
    const base = a.espr * vu;
    let espr = base, nota = [];
    if (proc === 'art42bis') {
      espr = base; nota.push('valore venale (art. 42-bis c.1)');
    } else if (edif) {
      if (I.riforma) { espr *= 0.75; nota.push('−25% art. 37 c.1'); }
      if (cess && I.maggEdif) { espr *= 1 + I.maggEdif / 100; nota.push('+' + I.maggEdif + '% art. 37 c.2 / 45 c.2 lett. a'); }
    } else if (cess && I.maggNonEdif) { espr *= 1 + I.maggNonEdif / 100; nota.push('+' + I.maggNonEdif + '% cessione area non edificabile'); }
    const cd = d && !edif && (d.intest || []).some(o => o.cd);
    let aggCD = cd && a.espr ? a.espr * vam / 10000 : 0;
    if (cd && cess && I.triploVam && a.espr) { const t = 3 * a.espr * vam / 10000; if (t > espr) { espr = t; nota.push('triplo VAM art. 45 c.2 lett. d'); } aggCD = 0; }
    const aggCond = d && d.cond && d.cond.nome && !edif && a.espr ? a.espr * vam / 10000 : 0;
    const coeffOp = p.coeffServop != null && p.coeffServop !== '' ? U.num(p.coeffServop) : I.coeffServop;
    const coeffSv = p.coeffServ != null && p.coeffServ !== '' ? U.num(p.coeffServ) : I.coeffServ;
    const servop = a.servop * vu * coeffOp, serv = a.serv * vu * coeffSv;
    const mesiOcc = p.mesiOcc != null && p.mesiOcc !== '' ? U.num(p.mesiOcc) : I.mesiOcc;
    // art. 50: indennità annua = 1/12 del valore dell'area; per mese = 1/12 dell'annua
    const occAnnua = a.occ * vu / 12, occ = occAnnua * mesiOcc / 12;
    let urg = 0, mesiUrg = 0;
    if (proc === 'art22bis') {
      mesiUrg = d && d.urgenza && d.urgenza.immissione ? S.mesi(d.urgenza.immissione, d.urgenza.pagamento || U.oggi()) : I.mesiUrg;
      urg = base / 12 * mesiUrg / 12;
    }
    let np42 = 0, ris42 = 0, anni42 = 0;
    if (proc === 'art42bis') {
      np42 = (a.espr * vu + servop + serv) * I.nonPatr42bis / 100;
      const da = d && d.a42 && d.a42.inizio, al = (d && d.a42 && d.a42.fine) || U.oggi();
      anni42 = da ? Math.max(0, U.giorniTra(da, al)) / 365 : 0;
      ris42 = (a.espr * vu + servop + serv) * I.interessi42bis / 100 * anni42;
    }
    const sopr = U.num(p.sopr), depr = U.num(p.depr);
    v.voci = {
      espr: r(espr), aggCD: r(aggCD), servop: r(servop), serv: r(serv), occ: r(occ), urg: r(urg),
      np42: r(np42), ris42: r(ris42), sopr: r(sopr), depr: r(depr), aggCond: r(aggCond)
    };
    v.occAnnua = r(occAnnua); v.mesiOcc = mesiOcc; v.mesiUrg = mesiUrg; v.anni42 = anni42; v.nota = nota.join('; ');
    v.coeffServop = coeffOp; v.coeffServ = coeffSv;
    // Totale spettante alla proprietà (l'aggiuntiva del conduttore va al conduttore)
    v.tot = r(v.voci.espr + v.voci.aggCD + v.voci.servop + v.voci.serv + v.voci.occ + v.voci.urg + v.voci.np42 + v.voci.ris42 + v.voci.sopr + v.voci.depr);
    // Ritenuta art. 35: sulle somme per esproprio/cessione e occupazione di aree in zona A-D
    v.ritenuta = S.zonaRitenuta(p.zona) ? r((v.voci.espr + v.voci.occ + v.voci.urg + v.voci.depr) * I.ritenuta / 100) : 0;
    return v;
  };

  S.VOCI = {
    espr: 'Indennità di esproprio', aggCD: 'Ind. aggiuntiva coltivatore diretto/IAP (art. 40 c.4)', servop: 'Servitù – ingombro opere (art. 44)',
    serv: 'Servitù – fascia (art. 44)', occ: 'Occupazione temporanea (art. 50)', urg: "Occupazione d'urgenza (art. 22-bis c.5)",
    np42: 'Pregiudizio non patrimoniale (art. 42-bis)', ris42: 'Risarcimento occupazione senza titolo (art. 42-bis c.3)',
    sopr: 'Soprassuoli, frutti pendenti, manufatti', depr: 'Deprezzamento parte residua (art. 33)', aggCond: 'Ind. aggiuntiva conduttore (art. 42)'
  };

  // Calcolo dell'intera pratica: per particella, per ditta e totali
  S.calcola = pr => {
    const Sup = ES.analisi.superfici(pr.geo);
    const ditte = new Map((pr.ditte || []).map(d => [d.id, d]));
    const perP = new Map(), perD = new Map();
    const zero = () => ({ espr: 0, aggCD: 0, servop: 0, serv: 0, occ: 0, urg: 0, np42: 0, ris42: 0, sopr: 0, depr: 0, aggCond: 0, tot: 0, ritenuta: 0, aree: { espr: 0, servop: 0, serv: 0, occ: 0 } });
    const T = zero();
    (pr.particelle || []).forEach(p => {
      const d = ditte.get(p.ditta) || null;
      const v = S.particella(p, d, pr, Sup);
      perP.set(p.id, v);
      const D = perD.get(p.ditta) || perD.set(p.ditta, zero()).get(p.ditta);
      [D, T].forEach(X => {
        Object.keys(v.voci).forEach(k => { X[k] += v.voci[k]; });
        X.tot += v.tot; X.ritenuta += v.ritenuta;
        ['espr', 'servop', 'serv', 'occ'].forEach(t => { X.aree[t] += v.aree[t]; });
      });
    });
    perD.forEach(D => { D.acconto80 = U.r2(D.espr * 0.8); });
    return { perP, perD, T, Sup };
  };

  // Ripartizione per intestatario secondo le quote (le quote di nuda proprietà e usufrutto vanno valutate dal tecnico)
  S.ripartisci = (d, tot) => {
    const L = d.intest || [];
    const misto = L.some(o => /usufr|nuda/i.test(o.titolo || ''));
    const q = L.map(o => U.quota(o.quota));
    const somma = q.reduce((s, x) => s + x, 0) || 1;
    return { misto, righe: L.map((o, i) => ({ o, quota: q[i], importo: misto ? null : U.r2(tot * q[i] / somma) })) };
  };
})(ES);
