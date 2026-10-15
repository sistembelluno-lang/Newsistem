// Modelli di documento: contesto dei dati (pratica, ditta, intestatario), linguaggio dei modelli integrati,
// trasformazione in blocchi (per anteprima/stampa HTML e per Word .docx), alias dei campi di stampa unione.
//
// Linguaggio dei modelli integrati (modificabili dall'utente):
//   {{campo}}  {{ditta.n}}  {{#lista}}…{{/lista}}  {{^campo}}…{{/campo}}   — come Mustache
//   una riga = un paragrafo (giustificato); riga vuota = spazio
//   # Titolo (centrato, grande)   ## Sottotitolo (centrato)   ### Titoletto   >> testo a destra (destinatario)
//   - punto elenco     **grassetto**     ++sottolineato++
//   [[tabella particelle colonne=fg,map,sup,espr]]  [[tabella intestatari]]  [[tabella indennita]]  [[tabella piano]]
//   [[tabella consistenza]]  [[planimetria scala=1000]]  [[firma Ruolo|Nome]]  [[salto]]
(function (ES) {
  'use strict';
  const M = ES.modelli = {}, U = ES.U, C = ES.cat;

  // ---- Dati per i documenti ----
  M.tipiPresenti = parts => ({ espr: parts.some(p => p.aree.espr > 0), servop: parts.some(p => p.aree.servop > 0), serv: parts.some(p => p.aree.serv > 0), occ: parts.some(p => p.aree.occ > 0) });
  function partCtx(p, v, pr) {
    const a = v.aree, voci = v.voci;
    return {
      id: p.id, ct: p.ct || 'T', catasto: p.ct === 'F' ? 'C.F.' : 'C.T.', comune: p.comune || (pr.ente && pr.ente.comune) || '', sez: p.sez || '', fg: p.fg, map: p.map, sub: p.sub || '',
      mappale: C.mappale(p), mappaleEspr: C.mappale(p, 'espr'), mappaleOcc: C.mappale(p, 'occ'), mappaleServ: C.mappale(p, p.nuovo && p.nuovo.servop ? 'servop' : 'serv'),
      ex: p.nuovo && Object.values(p.nuovo).find(Boolean) ? p.map : '',
      qual: p.qual || '', cls: p.cls || '', qualcls: [p.qual, p.cls].filter(Boolean).join('/'),
      sup: U.mq(p.sup), supN: p.sup || 0, haareca: U.haAreCa(p.sup), rd: p.rd || '', ra: p.ra || '', zona: p.zona || '', confini: p.confini || '',
      espr: a.espr ? U.mq(a.espr) : '', servop: a.servop ? U.mq(a.servop) : '', serv: a.serv ? U.mq(a.serv) : '', occ: a.occ ? U.mq(a.occ) : '',
      esprN: a.espr, servopN: a.servop, servN: a.serv, occN: a.occ, servTot: a.servop + a.serv ? U.mq(a.servop + a.serv) : '',
      vu: U.fmt(v.vu), cat: v.cat, mesiOcc: v.mesiOcc,
      indEspr: U.eur(voci.espr), indServ: U.eur(voci.servop + voci.serv), indOcc: U.eur(voci.occ), ind: U.eur(v.tot), indN: v.tot,
      indEsprN: voci.espr + voci.aggCD + voci.sopr + voci.depr + voci.urg + voci.np42 + voci.ris42, indServN: voci.servop + voci.serv, indOccN: voci.occ,
      note: p.note || '',
      // Righe per lo stato di consistenza (una voce per particella)
      etichetta: 'Fg.' + p.fg + ' Mapp.' + C.mappale(p)
    };
  }
  function intCtx(o, i) {
    return {
      i: i + 1, nome: o.nome || '', cf: o.cf || '', natoA: o.natoA || o.sede || '', natoIl: U.dataIt(o.natoIl), nato: C.nato(o),
      nascita: C.giuridica(o) ? (o.sede ? 'con sede in ' + o.sede : '') : [o.natoA ? C.nato(o) + ' a ' + o.natoA : '', o.natoIl ? 'il ' + U.dataIt(o.natoIl) : ''].filter(Boolean).join(' '),
      anagrafica: C.anagrafica(o), titolo: o.titolo || '', quota: o.quota || '', diritto: C.diritto(o),
      via: o.via || '', cap: o.cap || '', citta: o.citta || '', prov: o.prov || '', pec: o.pec || '', indirizzo: C.indirizzo(o),
      cittaCap: [o.cap, o.citta, o.prov ? '(' + o.prov + ')' : ''].filter(Boolean).join(' '),
      saluto: C.saluto(o), gentile: C.gentile(o), giuridica: C.giuridica(o), femmina: C.sesso(o) === 'F',
      mezzo: o.pec ? 'PEC' : 'RACCOMANDATA A/R', cd: !!o.cd
    };
  }
  const atto = x => x && (x.estremi || x.data) ? [x.estremi, x.data ? 'del ' + U.dataIt(x.data) : ''].filter(Boolean).join(' ') : '______________';
  M.base = (pr, calc) => {
    const e = pr.ente || {}, it = pr.iter || {}, I = Object.assign({}, ES.stima.IMPOST, pr.impost || {});
    const atti = {}; ES.iter.FASI.forEach(f => { const x = it[f.k] || {}; atti[f.k] = { estremi: x.estremi || '', data: U.dataIt(x.data), testo: atto(x), note: x.note || '' }; });
    const T = calc.T;
    return {
      oggi: U.dataIt(U.oggi()), oggiLungo: U.dataLunga(U.oggi()), luogo: e.luogo || e.comune || '', anno: new Date().getFullYear(),
      ente: { nome: e.nome || '', comune: e.comune || '', provincia: e.provincia || '', indirizzo: e.indirizzo || '', cf: e.cf || '', pec: e.pec || '', email: e.email || '', telefono: e.telefono || '',
        ufficio: e.ufficio || '', responsabile: e.responsabile || '', ruolo: e.ruolo || 'Il Responsabile del procedimento', rup: e.rup || '', tecnico: e.tecnico || '', studio: e.studio || '',
        beneficiario: e.beneficiario || e.nome || '', cfBeneficiario: e.cfBeneficiario || e.cf || '', sedeBeneficiario: e.sedeBeneficiario || e.indirizzo || '',
        tribunale: e.tribunale || '', tar: e.tar || '', bur: e.bur || 'Bollettino Ufficiale della Regione', link: e.link || '' },
      pratica: { nome: pr.nome || '', oggetto: pr.nome || '', cup: pr.cup || '', codice: pr.codice || '', descrizione: pr.descrizione || '', urgenza: pr.urgenza || '' },
      atti, mesiOcc: I.mesiOcc, coeffServ: Math.round(I.coeffServ * 100) + '%',
      tot: { tot: U.eur(T.tot), lettere: U.euroLettere(T.tot), espr: U.eur(T.espr + T.aggCD + T.sopr + T.depr + T.urg + T.np42 + T.ris42), serv: U.eur(T.servop + T.serv), occ: U.eur(T.occ),
        esprLettere: U.euroLettere(T.espr + T.aggCD + T.sopr + T.depr + T.urg + T.np42 + T.ris42), servLettere: U.euroLettere(T.servop + T.serv), occLettere: U.euroLettere(T.occ) },
      numeroDitte: (pr.ditte || []).length, piuDi50: (pr.ditte || []).reduce((s, d) => s + (d.intest || []).length, 0) > 50
    };
  };
  M.ditta = (pr, d, calc) => {
    const parts = (pr.particelle || []).filter(p => p.ditta === d.id).sort((a, b) => U.cmp(a.fg, b.fg) || U.cmp(a.map, b.map)).map(p => partCtx(p, calc.perP.get(p.id), pr));
    const D = calc.perD.get(d.id) || { tot: 0, espr: 0, aggCD: 0, servop: 0, serv: 0, occ: 0, sopr: 0, depr: 0, urg: 0, np42: 0, ris42: 0, aggCond: 0, aree: {} };
    const intest = (d.intest || []).map(intCtx);
    const tp = M.tipiPresenti(parts.map(p => ({ aree: { espr: p.esprN, servop: p.servopN, serv: p.servN, occ: p.occN } })));
    const ev = d.ev || {}, evf = {}; Object.keys(ev).forEach(k => { evf[k] = { data: U.dataIt(ev[k].data), notifica: U.dataIt(ev[k].notifica), prot: ev[k].prot || '', ora: ev[k].ora || '', luogo: ev[k].luogo || '' }; });
    const esprN = D.espr + D.aggCD + D.sopr + D.depr + D.urg + D.np42 + D.ris42;
    return {
      id: d.id, n: d.n, np: 'NP' + d.n, nome: intest.map(o => o.nome).join(', '), intestatari: intest, particelle: parts,
      partEspr: parts.filter(p => p.esprN > 0), partServ: parts.filter(p => p.servopN + p.servN > 0), partOcc: parts.filter(p => p.occN > 0),
      ...tp, servitu: tp.servop || tp.serv, procedura: ES.stima.PROCEDURE[d.procedura || (pr.impost || {}).procedura || 'art22'].nome,
      tot: U.eur(D.tot), totN: D.tot, totLettere: U.euroLettere(D.tot), acconto80: U.eur(esprN * 0.8),
      indEspr: U.eur(esprN), indEsprLettere: U.euroLettere(esprN), indServ: U.eur(D.servop + D.serv), indServLettere: U.euroLettere(D.servop + D.serv),
      indOcc: U.eur(D.occ), indOccLettere: U.euroLettere(D.occ), ritenuta: D.ritenuta ? U.eur(D.ritenuta) : '',
      supEspr: U.mq(D.aree.espr || 0), supServ: U.mq((D.aree.servop || 0) + (D.aree.serv || 0)), supOcc: U.mq(D.aree.occ || 0),
      conduttore: d.cond && d.cond.nome ? d.cond : null, ev: evf, note: d.note || '', osservazioni: d.oss || ''
    };
  };
  // Contesti per un documento: uno per intestatario, uno per ditta o uno per l'intera pratica
  M.contesti = (pr, calc, ambito, ditteSel) => {
    const base = M.base(pr, calc);
    const ditte = (pr.ditte || []).filter(d => !ditteSel || ditteSel.includes(d.id));
    if (ambito === 'pratica') {
      const D = (pr.ditte || []).map(d => M.ditta(pr, d, calc));
      // Unità negoziali per il decreto: una per ditta e tipo di intervento, numerate di seguito
      let n = 0;
      const un = t => D.filter(d => d[t === 'serv' ? 'servitu' : t]).map(d => ({ ...d, un: ++n, parts: t === 'espr' ? d.partEspr : t === 'serv' ? d.partServ : d.partOcc }));
      const unEspr = un('espr'), unServ = un('serv'), unOcc = un('occ');
      return [{ ...base, ditte: D, unEspr, unServ, unOcc, haEspr: unEspr.length > 0, haServ: unServ.length > 0, haOcc: unOcc.length > 0 }];
    }
    const out = [];
    ditte.forEach(d => {
      const dc = M.ditta(pr, d, calc);
      if (ambito === 'intestatario') (dc.intestatari.length ? dc.intestatari : [intCtx({ nome: '' }, 0)]).forEach(o => out.push({ ...base, ditta: dc, dest: o, _dittaId: d.id, _calcDitta: calc.perD.get(d.id) }));
      else out.push({ ...base, ditta: dc, dest: dc.intestatari[0] || {}, _dittaId: d.id, _calcDitta: calc.perD.get(d.id) });
    });
    return out;
  };

  // Campi di stampa unione già usati nei modelli Word (es. «Nome_e_Cognome1», «Foglio2», «Sup1»)
  const ALIAS_I = { nome_e_cognome: 'nome', nominativo: 'nome', cognome_e_nome: 'nome', via: 'via', indirizzo: 'via', cap: 'cap', citta: 'citta', comune_residenza: 'citta', provincia: 'prov', prov: 'prov',
    nato_a_il: 'nascita', nascita: 'nascita', nato_a: 'natoA', nato_il: 'natoIl', cf: 'cf', codice_fiscale: 'cf', proprieta: 'titolo', diritto: 'titolo', titolo: 'titolo', quota: 'quota', pec: 'pec' };
  const ALIAS_P = { comune: 'comune', foglio: 'fg', fg: 'fg', particella: 'mappale', mappale: 'mappale', mapp: 'mappale', sub: 'sub', haareca: 'haareca', superficie: 'sup', sup_cat: 'sup',
    reddito_domenicale: 'rd', reddito_dominicale: 'rd', rd: 'rd', reddito_agrario: 'ra', ra: 'ra', qualita: 'qualcls', classe: 'cls', sup: 'espr', sup_espr: 'espr', esproprio: 'espr',
    servitu: 'serv', asservimento: 'serv', occupazione: 'occ', zona: 'zona', confini: 'confini', indennita: 'ind' };
  M.unione = ctx => nome => {
    const m = /^(.*?)_?(\d+)$/.exec(nome), base = U.norm(m ? m[1] : nome).replace(/ /g, '_'), idx = m ? (+m[2] - 1) : 0;
    const d = ctx.ditta; if (!d) return undefined;
    if (ALIAS_I[base]) { const o = (m ? d.intestatari[idx] : ctx.dest) || {}; return o[ALIAS_I[base]] ?? ''; }
    if (ALIAS_P[base]) { const p = d.particelle[m ? idx : 0]; return p ? p[ALIAS_P[base]] ?? '' : ''; }
    if (base === 'ditta' || base === 'n_ditta' || base === 'np') return d.n;
    return undefined;
  };

  // ---- Mustache semplificato per i modelli integrati ----
  const get = (st, path) => {
    if (path === '.') return st[0];
    for (const c of st) { let v = c, ok = true; for (const k of path.split('.')) { if (v != null && typeof v === 'object' && k in v) v = v[k]; else { ok = false; break; } } if (ok) return v; }
    return undefined;
  };
  M.mustache = (tpl, ctx) => {
    const run = (t, st) => {
      let out = '', i = 0;
      const re = /\{\{([#^\/]?)\s*([\w.]+)\s*\}\}/g; let m;
      while ((m = re.exec(t))) {
        out += t.slice(i, m.index); i = re.lastIndex;
        const [, op, k] = m;
        if (op === '#' || op === '^') {
          // Trova la chiusura corrispondente (gestisce sezioni annidate con lo stesso nome)
          let depth = 1, j = re.lastIndex; const r2 = new RegExp('\\{\\{([#^\\/])\\s*' + k.replace(/\./g, '\\.') + '\\s*\\}\\}', 'g'); r2.lastIndex = j; let m2, fine = -1;
          while ((m2 = r2.exec(t))) { if (m2[1] === '/') { if (--depth === 0) { fine = m2.index; break; } } else depth++; }
          if (fine < 0) continue;
          const dentro = t.slice(re.lastIndex, fine); i = fine + ('{{/' + k + '}}').length; re.lastIndex = i;
          const v = get(st, k), vuoto = !v || (Array.isArray(v) && !v.length);
          if (op === '^') { if (vuoto) out += run(dentro, st); }
          else if (Array.isArray(v)) v.forEach((it, n) => { out += run(dentro, [typeof it === 'object' ? { ...it, _primo: n === 0, _ultimo: n === v.length - 1 } : it, ...st]); });
          else if (!vuoto) out += run(dentro, typeof v === 'object' ? [v, ...st] : st);
        } else if (!op) { const v = get(st, k); out += v == null ? '' : String(v); }
      }
      return out + t.slice(i);
    };
    return run(tpl, [ctx]);
  };

  // ---- Colonne delle tabelle ----
  M.COLONNE = {
    np: ['N.P.', 6, (p, d) => d ? d.n : ''], comune: ['Comune', 13, p => p.comune], fg: ['Fg.', 5, p => p.fg], map: ['Mapp.', 10, p => p.mappale], sub: ['Sub', 5, p => p.sub],
    qual: ['Qualità/classe', 13, p => p.qualcls], sup: ['Sup. cat. (mq)', 9, p => p.sup], haareca: ['Superficie (ha.are.ca)', 10, p => p.haareca], rd: ['Reddito dom. (€)', 8, p => p.rd], ra: ['Reddito agr. (€)', 8, p => p.ra],
    espr: ['Sup. esproprio (mq)', 9, p => p.espr || '-'], servop: ['Servitù ingombro opere (mq)', 9, p => p.servop || '-'], serv: ['Servitù fascia (mq)', 9, p => p.serv || '-'],
    servtot: ['Sup. servitù (mq)', 9, p => p.servTot || '-'], occ: ['Occ. temporanea (mq)', 9, p => p.occ || '-'], zona: ['Destinazione', 10, p => p.zona], confini: ['Confini (N-E-S-O)', 26, p => p.confini],
    ind: ['Indennità', 11, p => p.ind], vu: ['€/mq', 7, p => p.vu]
  };
  const allinea = k => (['sup', 'rd', 'ra', 'espr', 'servop', 'serv', 'servtot', 'occ', 'ind', 'vu', 'fg', 'np'].includes(k) ? 'center' : 'left');

  // Testo con **grassetto** e ++sottolineato++ → run
  M.runs = s => {
    const out = []; const re = /(\*\*([\s\S]+?)\*\*|\+\+([\s\S]+?)\+\+)/g; let i = 0, m;
    while ((m = re.exec(s))) { if (m.index > i) out.push({ text: s.slice(i, m.index) }); out.push(m[2] != null ? { text: m[2], b: true } : { text: m[3], u: true }); i = re.lastIndex; }
    if (i < s.length) out.push({ text: s.slice(i) });
    return out.length ? out : [{ text: '' }];
  };
  const opzioni = s => { const o = {}; String(s || '').replace(/(\w+)=([^\s\]]+)/g, (m, k, v) => { o[k] = v; }); return o; };

  function tabella(nome, opt, ctx) {
    const d = ctx.ditta;
    if (nome === 'intestatari') {
      const L = d ? d.intestatari : [];
      return { t: 'table', cols: [34, 30, 20, 16], rows: [{ h: true, cells: ['Intestatario', 'Dati anagrafici', 'Codice fiscale', 'Diritto e quota'].map(text => ({ text })) }]
        .concat(L.map(o => ({ cells: [{ text: o.nome, b: true }, { text: o.nascita }, { text: o.cf }, { text: o.diritto }] }))) };
    }
    if (nome === 'indennita') {
      const v = ctx._calcDitta || {}; const R = [{ h: true, cells: [{ text: 'Voce' }, { text: 'Importo', align: 'right' }] }];
      Object.keys(ES.stima.VOCI).forEach(k => { if (v[k]) R.push({ cells: [{ text: ES.stima.VOCI[k] }, { text: U.eur(v[k]), align: 'right' }] }); });
      R.push({ cells: [{ text: 'Totale', b: true }, { text: U.eur(v.tot || 0), align: 'right', b: true }] });
      return { t: 'table', cols: [75, 25], rows: R };
    }
    if (nome === 'piano') {
      const cols = (opt.colonne || 'np,fg,map,qual,sup,espr,servtot,occ,ind').split(',').filter(k => M.COLONNE[k]);
      const R = [{ h: true, cells: [{ text: 'Ditta' }].concat(cols.filter(k => k !== 'np').map(k => ({ text: M.COLONNE[k][0], align: 'center' }))) }];
      (ctx.ditte || []).forEach(dd => dd.particelle.forEach((p, i) => R.push({ cells: [{ text: i ? '' : dd.np + ' – ' + dd.intestatari.map(o => o.nome + (o.diritto ? ' (' + o.diritto + ')' : '')).join('; '), b: !i }]
        .concat(cols.filter(k => k !== 'np').map(k => ({ text: String(M.COLONNE[k][2](p, dd) ?? ''), align: allinea(k) }))) })));
      return { t: 'table', cols: [28].concat(cols.filter(k => k !== 'np').map(k => M.COLONNE[k][1])), rows: R, size: 15 };
    }
    if (nome === 'consistenza') {
      const parts = d ? d.particelle : [];
      const R = [{ h: true, cells: ['Fg.', 'Mapp.', 'Qualità/classe', 'Sup. cat. (mq)', 'Area espr. (mq)', 'Area serv. (mq)', 'Area occ. temp. (mq)', 'Confini (N-E-S-O)'].map(text => ({ text, align: 'center' })) }];
      parts.forEach(p => R.push({ cells: [p.fg, p.mappale, p.qualcls, p.sup, p.espr || '-', p.servTot || '-', p.occ || '-', p.confini].map((text, i) => ({ text: String(text ?? ''), align: i === 7 || i === 2 ? 'left' : 'center' })) }));
      return { t: 'table', cols: [6, 12, 13, 9, 9, 9, 9, 33], rows: R, size: 15 };
    }
    // particelle (della ditta o elenco passato)
    const parts = (opt.lista && ctx[opt.lista]) || (d ? d.particelle : []);
    const cols = (opt.colonne || 'comune,fg,map,haareca,rd,ra,espr').split(',').filter(k => M.COLONNE[k]);
    return {
      t: 'table', cols: cols.map(k => M.COLONNE[k][1]), size: 16,
      rows: [{ h: true, cells: cols.map(k => ({ text: k === 'occ' && ctx.mesiOcc ? 'Occ. temporanea (' + ctx.mesiOcc + ' mesi) (mq)' : M.COLONNE[k][0], align: 'center' })) }]
        .concat(parts.map(p => ({ cells: cols.map(k => ({ text: String(M.COLONNE[k][2](p, d) ?? ''), align: allinea(k) })) })))
    };
  }

  // Testo del modello (già con i dati) → blocchi
  M.blocchi = (testo, ctx) => {
    const B = [];
    String(testo).replace(/\r/g, '').split('\n').forEach(riga => {
      const r = riga.replace(/\s+$/, '');
      let m;
      if (!r.trim()) { B.push({ t: 'p', runs: [{ text: '' }], after: 0 }); return; }
      if ((m = /^\[\[\s*(\w+)\s*(.*?)\]\]$/.exec(r.trim()))) {
        const [, cmd, rest] = m;
        if (cmd === 'salto') B.push({ t: 'pb' });
        else if (cmd === 'tabella') { const nome = rest.split(/\s+/)[0]; B.push(tabella(nome, opzioni(rest), ctx)); }
        else if (cmd === 'planimetria') B.push({ t: 'img', ref: 'planimetria', opt: opzioni(rest), ditta: ctx._dittaId || null });
        else if (cmd === 'firma') { const [ruolo, nome] = rest.split('|'); B.push({ t: 'p', runs: [{ text: (ruolo || '').trim(), b: true }], align: 'center', ind: 4800, before: 240, after: 0, keep: true }); if (nome && nome.trim()) B.push({ t: 'p', runs: [{ text: nome.trim() }], align: 'center', ind: 4800, after: 0, keep: true }); B.push({ t: 'p', runs: [{ text: '______________________________' }], align: 'center', ind: 4800, before: 360 }); }
        else if (cmd === 'spazio') B.push({ t: 'p', runs: [{ text: '' }], after: 240 });
        return;
      }
      if ((m = /^(#{1,3})\s+(.*)$/.exec(r))) {
        const lv = m[1].length;
        B.push({ t: 'p', runs: M.runs(m[2]).map(x => ({ ...x, b: true, size: lv === 1 ? 26 : lv === 2 ? 22 : undefined })), align: lv === 3 ? 'left' : 'center', before: lv === 1 ? 120 : 60, after: 120, keep: true });
        return;
      }
      if ((m = /^>>\s?(.*)$/.exec(r))) { B.push({ t: 'p', runs: M.runs(m[1]), ind: 5200, after: 0, align: 'left' }); return; }
      if ((m = /^[-•]\s+(.*)$/.exec(r))) { B.push({ t: 'p', runs: M.runs(m[1]), bullet: true, align: 'both', after: 60 }); return; }
      B.push({ t: 'p', runs: M.runs(r), align: 'both' });
    });
    // Righe vuote consecutive: una sola
    return B.filter((b, i) => !(b.t === 'p' && b.after === 0 && b.runs.length === 1 && b.runs[0].text === '' && i && B[i - 1].t === 'p' && B[i - 1].runs.length === 1 && B[i - 1].runs[0].text === '' && B[i - 1].after === 0));
  };

  // Blocchi → HTML per anteprima e stampa (le immagini arrivano già come data URL in b.src)
  M.html = B => B.map(b => {
    const run = r => { let t = U.esc(r.text).replace(/\n/g, '<br>'); if (r.b) t = '<b>' + t + '</b>'; if (r.u) t = '<u>' + t + '</u>'; return t; };
    if (b.t === 'pb') return '<div class="doc-pb"></div>';
    if (b.t === 'img') return b.src ? `<p style="text-align:center"><img src="${b.src}" style="max-width:${b.mm || 170}mm;width:100%"></p>` : '';
    if (b.t === 'table') {
      const tot = b.cols.reduce((s, x) => s + x, 0);
      return `<table class="doc-t" style="font-size:${(b.size || 16) / 2}pt"><colgroup>${b.cols.map(c => `<col style="width:${(100 * c / tot).toFixed(1)}%">`).join('')}</colgroup>${b.rows.map(r => `<tr>${r.cells.map(c => `<${r.h ? 'th' : 'td'}${c.span ? ` colspan="${c.span}"` : ''} style="text-align:${c.align || 'left'}">${c.b ? '<b>' : ''}${U.esc(c.text ?? '').replace(/\n/g, '<br>')}${c.b ? '</b>' : ''}</${r.h ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
    }
    const st = [`text-align:${{ both: 'justify', center: 'center', right: 'right' }[b.align] || 'left'}`];
    if (b.ind) st.push(`margin-left:${(b.ind / 9638 * 100).toFixed(1)}%`);
    if (b.size) st.push(`font-size:${b.size / 2}pt`);
    if (b.before) st.push(`margin-top:${b.before / 20}pt`);
    const txt = b.runs.map(r => (r.size ? `<span style="font-size:${r.size / 2}pt">${run(r)}</span>` : run(r))).join('') || '&nbsp;';
    return b.bullet ? `<p class="doc-li" style="${st.join(';')}">• ${txt}</p>` : `<p style="${st.join(';')}">${txt}</p>`;
  }).join('\n');

  M.intestazione = ctx => [ctx.ente.nome, [ctx.ente.provincia ? 'Provincia di ' + ctx.ente.provincia : '', ctx.ente.ufficio].filter(Boolean).join(' – '), [ctx.ente.indirizzo, ctx.ente.pec ? 'PEC ' + ctx.ente.pec : ''].filter(Boolean).join(' – ')].filter(Boolean);
})(ES);
