// Dati catastali e ditte: importazione dell'Excel/CSV delle ditte, lettura degli intestatari (anche da testo tipo visura),
// codice fiscale (sesso, persona giuridica), formule di cortesia, raggruppamento in ditte.
(function (ES) {
  'use strict';
  const C = ES.cat = {}, U = ES.U;

  // ---- Codice fiscale ----
  C.reCF = /\b([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z])\b|\b(\d{11})\b/i;
  const OMO = { L: 0, M: 1, N: 2, P: 3, Q: 4, R: 5, S: 6, T: 7, U: 8, V: 9 };
  C.sessoCF = cf => {
    cf = String(cf || '').toUpperCase().trim();
    if (!/^[A-Z]{6}\w{2}[A-Z]\w{2}[A-Z]\w{3}[A-Z]$/.test(cf)) return '';
    const g = cf.slice(9, 11).split('').map(c => (c in OMO ? OMO[c] : c)).join('');
    return +g > 40 ? 'F' : 'M';
  };
  const reSoc = /\b(s\.?\s?r\.?\s?l|s\.?\s?p\.?\s?a|s\.?\s?a\.?\s?s|s\.?\s?n\.?\s?c|s\.?\s?s|soc(?:ieta)?|societa|coop|consorzio|comune|provincia|regione|demanio|ente|azienda|fondazione|associazione|parrocchia|diocesi|banca|istituto|universita|agenzia|stato|ministero|ferrovie|anas|enel|condominio|immobiliare|srls|stp|cooperativa)\b/i;
  C.giuridica = o => /^\d{11}$/.test(String(o.cf || '').trim()) || reSoc.test(U.norm(o.nome)) || !!o.sede;
  C.sesso = o => o.sesso || (C.giuridica(o) ? 'G' : C.sessoCF(o.cf) || '');
  C.saluto = o => ({ M: 'Egr. Sig.', F: 'Gent.ma Sig.ra', G: 'Spett.le' }[C.sesso(o)] || 'Gent.mo/a Sig./Sig.ra');
  C.gentile = o => ({ M: 'Gentile Signore', F: 'Gentile Signora', G: 'Spettabile Ditta' }[C.sesso(o)] || 'Gentile Signore/a');
  C.nato = o => ({ M: 'nato', F: 'nata' }[C.sesso(o)] || 'nato/a');
  // «ROSSI MARIO nato a BELLUNO (BL) il 01/02/1950 - CF: RSS…» oppure «ACME SRL con sede in FELTRE (BL) - CF: 0123…»
  C.anagrafica = o => {
    let s = o.nome || '';
    if (C.giuridica(o) && (o.sede || o.natoA)) s += ' con sede in ' + (o.sede || o.natoA);
    else if (o.natoA || o.natoIl) s += ' ' + C.nato(o) + (o.natoA ? ' a ' + o.natoA : '') + (o.natoIl ? ' il ' + U.dataIt(o.natoIl) : '');
    if (o.cf) s += ' - CF: ' + o.cf;
    return s;
  };
  C.diritto = o => [o.titolo || '', o.quota || ''].filter(Boolean).join(' ').trim();
  C.indirizzo = o => [o.via, [o.cap, o.citta, o.prov ? '(' + o.prov + ')' : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  // Controllo formale: carattere di controllo del codice fiscale (16 caratteri) o della partita IVA (11 cifre)
  C.cfValido = cf => {
    cf = String(cf || '').toUpperCase().replace(/\s/g, '');
    if (/^\d{11}$/.test(cf)) {
      let s = 0; for (let i = 0; i < 10; i++) { let n = +cf[i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; }
      return (10 - s % 10) % 10 === +cf[10];
    }
    if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
    const DISP = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
    let s = 0;
    for (let i = 0; i < 15; i++) {
      const c = cf[i], v = /\d/.test(c) ? +c : c.charCodeAt(0) - 65;
      s += i % 2 ? v : DISP[v];
    }
    return String.fromCharCode(65 + s % 26) === cf[15];
  };

  // Controlli di una ditta: dati mancanti o incoerenti da completare a mano.
  // livello: 'errore' (da correggere), 'manca' (da completare), 'info'
  C.controlli = (d, parts) => {
    const L = [], I = d.intest || [];
    if (!I.length) L.push({ livello: 'errore', msg: 'Nessun intestatario' });
    I.forEach(o => {
      const nome = o.nome || '(senza nome)';
      if (!o.nome) L.push({ livello: 'errore', msg: 'Intestatario senza nome' });
      if (!o.cf) L.push({ livello: 'manca', msg: `Manca il codice fiscale di ${nome}`, campo: 'cf', o });
      else if (!C.cfValido(o.cf)) L.push({ livello: 'errore', msg: `Codice fiscale non valido per ${nome}: ${o.cf}`, campo: 'cf', o });
      if (!o.via && !o.pec) L.push({ livello: 'info', msg: `Manca l'indirizzo di ${nome} (serve per le lettere)`, campo: 'via', o });
      if (!o.titolo && !o.quota) L.push({ livello: 'info', msg: `Manca il diritto e la quota di ${nome}` });
    });
    // Le quote dello stesso diritto devono sommare a 1 (proprietà; nuda proprietà e usufrutto si contano a parte)
    const gruppi = {}, senzaQuota = new Set();
    // Intestatari con diritto ma senza quota in visura (es. «Comproprietario:», «Usufruttuario parziale:»): quota da completare
    I.forEach(o => { if (!o.quota && o.titolo) { const t = /nuda/i.test(o.titolo) ? 'nuda proprietà' : /usufr/i.test(o.titolo) ? 'usufrutto' : /propr/i.test(o.titolo) ? 'proprietà' : null; if (t) senzaQuota.add(t); L.push({ livello: 'manca', msg: `Quota non indicata per ${o.nome || '(senza nome)'} (${o.titolo}): da completare`, campo: 'quota', o }); } });
    I.forEach(o => { if (!o.quota) return; const t = /nuda/i.test(o.titolo) ? 'nuda proprietà' : /usufr/i.test(o.titolo) ? 'usufrutto' : /propr/i.test(o.titolo) || !o.titolo ? 'proprietà' : null; if (t) gruppi[t] = (gruppi[t] || 0) + U.quota(o.quota); });
    Object.entries(gruppi).forEach(([t, q]) => { if (!senzaQuota.has(t) && Math.abs(q - 1) > 1e-6) L.push({ livello: 'errore', msg: `Le quote di ${t} sommano a ${Math.round(q * 1e4) / 1e4} invece di 1` }); });
    if (parts && !parts.length) L.push({ livello: 'errore', msg: 'Ditta senza particelle' });
    return L;
  };

  // ---- Intestatari da testo libero ----
  const reTit = /(nuda\s+propriet\w*'?|propriet\w*'?\s*superficiaria|propriet\w*'?|usufrutt\w*(?:\s+parziale)?|comproprie\w*|enfiteu\w*|livell\w*|diritto\s+del\s+concedente|diritto\s+di\s+superficie|superficie|uso|abitazione|oneri|servit\w*|concedente)(?:\s*:)?(?:\s+per)?\s*(\d+\s*\/\s*\d+)?/i;
  const inizioRiga = /^(nat[oa]|n\.|c\.?\s?f|cod|con\s+sede|sede|residente|res\.|via\b|propriet|nuda|usufrutt|compropr|enfiteu|livell|diritto|quota|\d+\s*\/\s*\d+)/i;

  C.leggiIntestatario = seg => {
    let s = String(seg || '').replace(/\s+/g, ' ').trim().replace(/^[-–•·,;]+\s*/, '');
    if (!s) return null;
    const o = { nome: '', natoA: '', natoIl: '', cf: '', sede: '', titolo: '', quota: '' };
    const mcf = C.reCF.exec(s);
    if (mcf) o.cf = (mcf[1] || mcf[2]).toUpperCase();
    let m = /\b(nat[oa])\s+a\s+(.+?)\s+il\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(s);
    if (m) { o.natoA = m[2].trim(); o.natoIl = U.parseData(m[3]); if (m[1].toLowerCase() === 'nata') o.sesso = 'F'; }
    else if ((m = /\bcon\s+sede\s+(?:in|a)\s+(.+?)(?=\s*[-–,;]?\s*(?:c\.?\s?f\.?|cod|p\.?\s?iva|\d{11}|$))/i.exec(s))) o.sede = m[1].trim();
    // Diritto e quota: di solito dopo il codice fiscale
    const dopo = mcf ? s.slice(mcf.index + mcf[0].length) : s;
    const mt = reTit.exec(dopo) || reTit.exec(s.replace(/^.*?(?=propriet|nuda|usufrutt|compropr|enfiteu|livell|diritto)/i, ''));
    if (mt) { o.titolo = mt[1].replace(/\s+/g, ' ').trim(); o.quota = (mt[2] || '').replace(/\s/g, ''); }
    if (!o.quota) { const mq = /(\d+\s*\/\s*\d+)\s*$/.exec(s); if (mq) o.quota = mq[1].replace(/\s/g, ''); }
    // Nome: quello che sta prima di nato/sede/CF/diritto
    const fine = [/\s+nat[oa]\s+a\s+/i, /\s+con\s+sede\s+/i, /\s*[-–,]?\s*c\.?\s?f\.?\s*:?\s*/i, /\s*[-–,]?\s*cod(?:ice)?\.?\s*fisc/i, C.reCF, /\s+(?:propriet|nuda\s+propr|usufrutt|compropr|enfiteu|livell)/i]
      .map(r => { const x = r.exec(s); return x ? x.index : -1; }).filter(i => i > 0);
    o.nome = (fine.length ? s.slice(0, Math.min(...fine)) : s).replace(/[-–,;:]+$/, '').trim();
    if (!o.nome && !o.cf) return null;
    return o;
  };

  // Più intestatari nello stesso testo: separati da «;», oppure uno per blocco di righe, oppure più codici fiscali di fila
  C.leggiIntestatari = testo => {
    const t = String(testo || '').replace(/\r/g, '').trim();
    if (!t) return [];
    let seg;
    if (/;/.test(t)) seg = t.split(/;/);
    else if (/\n/.test(t)) {
      seg = [];
      t.split('\n').map(x => x.trim()).filter(Boolean).forEach(r => {
        if (!seg.length || !inizioRiga.test(r)) seg.push(r); else seg[seg.length - 1] += ' ' + r;
      });
    } else seg = [t];
    const out = [];
    seg.forEach(s => {
      const cfs = []; const re = new RegExp(C.reCF.source, 'gi'); let m;
      while ((m = re.exec(s))) cfs.push(m.index + m[0].length);
      if (cfs.length > 1) {
        // Spezza dopo ogni codice fiscale (più l'eventuale diritto e quota che lo seguono)
        let start = 0;
        cfs.forEach((end, i) => {
          let e = end; const rest = s.slice(end), mt = /^\s*[-–,]?\s*/.exec(rest), r2 = rest.slice(mt[0].length), md = reTit.exec(r2);
          if (md && md.index === 0) e = end + mt[0].length + md[0].length;
          if (i === cfs.length - 1) e = s.length;
          out.push(s.slice(start, e)); start = e;
        });
      } else out.push(s);
    });
    return out.map(C.leggiIntestatario).filter(Boolean);
  };

  // ---- Importazione tabella ditte/particelle ----
  C.CAMPI = {
    nditta: ['n ditta', 'ditta n', 'numero ditta', 'nr ditta', 'n piano', 'n p', 'np', 'num piano', 'numero piano', 'n ord', 'n ordine', 'progressivo', 'unita negoziale', 'n'],
    espr: ['~esprop', '~espr', 'area espr', '~acquisiz'],
    servop: ['~ingombro', '~sedime', '~servitu opere', '~asservimento opere'],
    serv: ['~servitu', '~asserv', 'area serv'],
    occ: ['~occupaz', '~occ temp', 'area occup', '~occupazione'],
    natoAIl: ['nato a il', 'nato a e il', 'nata a il', 'luogo e data di nascita', 'nascita'],
    natoA: ['nato a', 'nata a', 'luogo di nascita', 'luogo nascita', 'comune di nascita', 'nato'],
    natoIl: ['nato il', 'nata il', 'data di nascita', 'data nascita', 'il'],
    intest: ['intestatari', 'intestatario', 'intestazione', 'ditta catastale', 'ditte catastali', 'proprietari', 'proprietario', 'nominativo', 'nome e cognome', 'cognome e nome', 'denominazione', 'ragione sociale', 'ditta'],
    comune: ['comune catastale', 'comune', 'comune censuario'],
    sez: ['sezione', 'sez'],
    fg: ['foglio', 'fg', 'f', 'fgl'],
    nuovo: ['nuovo mappale', 'mappale derivato', 'mappale nuovo', 'mapp nuovo', 'derivato'],
    ex: ['ex mappale', 'mappale originario', 'ex', 'originario', 'mappale origine'],
    map: ['mappale', 'particella', 'mapp', 'map', 'p lla', 'part', 'numero', 'num'],
    sub: ['subalterno', 'sub'],
    ct: ['catasto', 'tipo catasto'],
    qual: ['qualita classe', 'qualita', 'coltura', 'qualita coltura', 'categoria', 'qual'],
    cls: ['classe', 'cl'],
    ha: ['ha', 'ettari'], are: ['are'], ca: ['ca', 'centiare'],
    sup: ['superficie catastale', 'sup catastale', 'superficie totale', 'superficie', 'sup', 'consistenza', 'mq'],
    rd: ['reddito dominicale', 'reddito domenicale', 'r d', 'rd', 'dominicale', 'domenicale'],
    ra: ['reddito agrario', 'r a', 'ra', 'agrario'],
    zona: ['destinazione urbanistica', 'destinazione', 'zona', 'zto', 'z t o', 'pi', 'prg'],
    cognome: ['cognome'], nome: ['nome'],
    cf: ['codice fiscale', 'cf', 'c f', 'cod fisc', 'partita iva', 'p iva', 'cf piva'],
    titolo: ['diritto reale', 'diritti e oneri reali', 'titolo', 'diritto', 'titolarita', 'proprieta'],
    quota: ['quota', 'quote'],
    via: ['indirizzo', 'via', 'residenza', 'domicilio', 'recapito'],
    cap: ['cap'],
    citta: ['citta', 'comune di residenza', 'comune residenza', 'localita', 'residente a', 'residente'],
    prov: ['provincia', 'prov'],
    pec: ['pec', 'email', 'e mail', 'mail', 'posta elettronica'],
    note: ['note', 'annotazioni']
  };

  // righe → {particelle:[…], ditte:[…], avvisi:[]}. Le ditte hanno n (numero di piano) e intest; le particelle il riferimento nd.
  C.importaTabella = function (righe, opt = {}) {
    const avvisi = [];
    const mp = ES.tab.mappa(righe, C.CAMPI), M = mp.map;
    if (M.map == null && M.intest == null && M.cognome == null) throw new Error('Nella tabella non trovo né la colonna del mappale né quella degli intestatari: controlla le intestazioni');
    const get = (r, k) => (M[k] != null ? r[M[k]] : '');
    const str = v => String(v ?? '').trim();
    righe = righe.map(r => r.slice());
    // «Ditta» può essere il numero di ditta o il nome degli intestatari: si decide dal contenuto
    if (M.intest != null && M.nditta == null) {
      const vals = righe.slice(mp.riga + 1).map(r => str(r[M.intest])).filter(Boolean);
      if (vals.length && vals.filter(v => /^\d{1,4}$/.test(v)).length / vals.length > 0.8) { M.nditta = M.intest; delete M.intest; }
    }
    const part = new Map(), ditteN = new Map(), ownersOf = new Map();
    // Formato a blocchi (riepilogo delle visure): il numero di ditta solo sulla prima riga del blocco, gli intestatari
    // scritti riga per riga sotto («NOME con sede in …», «CF: …», «Proprieta': 1/1») e le particelle nelle stesse righe.
    // Il numero scende alle righe successive e gli intestatari si leggono tutti insieme per blocco.
    const testaBlocco = /^\s*(c\.?\s?f\b|cod\w*\s+fisc|propriet|nuda|usufrutt|compropr|enfiteu|livell|diritto|nat[oa]\s)/i;
    if (M.nditta != null && M.intest != null && righe.slice(mp.riga + 1).some(r => !str(r[M.nditta]) && testaBlocco.test(str(r[M.intest])))) {
      let cur = '';
      righe.slice(mp.riga + 1).forEach(r => {
        const v = str(r[M.nditta]).replace(/^(ditta|np|n\.?)\s*/i, '');
        if (v) cur = v; else if (cur) r[M.nditta] = cur;
        const t = str(r[M.intest]);
        if (t && cur) { const L = ownersOf.get(cur + '\u0000t'); ownersOf.set(cur + '\u0000t', (L ? L + '\n' : '') + t); }
        r[M.intest] = '';
      });
      [...ownersOf.keys()].forEach(k => { ownersOf.set(k.slice(0, -2), C.leggiIntestatari(ownersOf.get(k))); ownersOf.delete(k); });
    }
    let ultima = null;
    righe.slice(mp.riga + 1).forEach((r, ir) => {
      let mapp = str(get(r, 'map')), ex = str(get(r, 'ex')), nuovo = str(get(r, 'nuovo'));
      // «1706 ex 1367»: nuovo mappale 1706 derivato dal 1367
      let m = /^(\S+)\s*(?:\(?\s*ex\s*\.?\s*)(\S+?)\)?$/i.exec(mapp);
      if (m) { nuovo = nuovo || m[1]; mapp = m[2]; }
      if (ex && !nuovo) { nuovo = mapp; mapp = ex; }
      const nd = str(get(r, 'nditta')).replace(/^(ditta|np|n\.?)\s*/i, '');
      let fg = str(get(r, 'fg')) || opt.fg || '';
      // Righe senza mappale ma con un intestatario: continuano la particella o la ditta precedente
      let p = null;
      if (mapp) {
        const sub = str(get(r, 'sub'));
        const k = ES.analisi.chiave(fg, mapp, sub);
        p = part.get(k);
        if (!p) {
          p = { id: U.id(), ct: /f|urb/i.test(str(get(r, 'ct'))) ? 'F' : 'T', comune: str(get(r, 'comune')) || opt.comune || '', sez: str(get(r, 'sez')), fg, map: mapp, sub, nuovo: {}, qual: '', cls: '', sup: 0, rd: '', ra: '', zona: '', man: {}, nd: '', intest: [], note: '' };
          part.set(k, p);
        }
        const q = str(get(r, 'qual')), c = str(get(r, 'cls'));
        if (q && !p.qual) { const mq = /^(.*?)\s*\/\s*(\w*)$/.exec(q); if (mq && !c) { p.qual = mq[1]; p.cls = mq[2]; } else p.qual = q; }
        if (c && !p.cls) p.cls = c;
        let sup = 0;
        if (M.ha != null || M.are != null || M.ca != null) sup = U.fromHaAreCa(get(r, 'ha'), get(r, 'are'), get(r, 'ca'));
        const sv = get(r, 'sup');
        if (!sup && sv !== '') { const mh = /^(\d+)\.(\d{2})\.(\d{2})$/.exec(str(sv)); sup = mh ? U.fromHaAreCa(mh[1], mh[2], mh[3]) : U.num(sv); }
        if (sup && !p.sup) p.sup = sup;
        ['rd', 'ra', 'zona', 'note'].forEach(f => { const v = str(get(r, f)); if (v && !p[f]) p[f] = v; });
        ['espr', 'servop', 'serv', 'occ'].forEach(t => { const v = get(r, t); if (str(v) !== '' && U.num(v)) p.man[t] = U.num(v); });
        if (nuovo) { const t = ['espr', 'servop', 'serv', 'occ'].find(x => p.man[x]) || 'espr'; p.nuovo[t] = nuovo; }
        if (nd) p.nd = nd;
        ultima = p;
      } else if (!nd && ultima) p = ultima;
      // Intestatari della riga
      let L = [];
      const it = str(get(r, 'intest'));
      if (it) L = C.leggiIntestatari(it);
      if (!L.length && (str(get(r, 'cognome')) || str(get(r, 'nome')) || str(get(r, 'cf')))) {
        L = [{ nome: [str(get(r, 'cognome')), str(get(r, 'nome'))].filter(Boolean).join(' '), cf: str(get(r, 'cf')).toUpperCase() }];
      }
      if (L.length === 1) {
        const o = L[0];
        const nai = str(get(r, 'natoAIl'));
        if (nai) { const mm = /(?:nat[oa]\s+)?a?\s*(.+?)\s+(?:il\s+)?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i.exec(nai); if (mm) { o.natoA = o.natoA || mm[1].replace(/^a\s+/i, ''); o.natoIl = o.natoIl || U.parseData(mm[2]); } }
        if (str(get(r, 'natoA'))) o.natoA = str(get(r, 'natoA'));
        if (get(r, 'natoIl') !== '') o.natoIl = U.parseData(get(r, 'natoIl')) || o.natoIl;
        if (str(get(r, 'cf'))) o.cf = str(get(r, 'cf')).toUpperCase();
        if (str(get(r, 'titolo'))) { const t = str(get(r, 'titolo')), mq = /(\d+\s*\/\s*\d+)/.exec(t); o.titolo = t.replace(/(\d+\s*\/\s*\d+)/, '').trim(); if (mq && !o.quota) o.quota = mq[1].replace(/\s/g, ''); }
        if (str(get(r, 'quota'))) o.quota = str(get(r, 'quota'));
        ['via', 'cap', 'citta', 'prov', 'pec'].forEach(f => { const v = str(get(r, f)); if (v) o[f] = v; });
      }
      if (!L.length) return;
      const dest = p ? p.intest : (nd ? (ownersOf.get(nd) || ownersOf.set(nd, []).get(nd)) : null);
      if (!dest) { avvisi.push(`Riga ${mp.riga + ir + 2}: intestatario senza particella né numero di ditta, ignorato`); return; }
      L.forEach(o => {
        // Stessa persona con diritti o quote diversi (es. usufrutto 1/2 e nuda proprietà 1/2) resta su due righe
        const chiave = x => (x.cf || U.norm(x.nome)) + '~' + U.norm(x.titolo) + '~' + String(x.quota || '').replace(/\s/g, '');
        const k = chiave(o);
        const g = dest.find(x => chiave(x) === k);
        if (g) Object.keys(o).forEach(f => { if (o[f] && !g[f]) g[f] = o[f]; }); else dest.push(o);
      });
      if (p && nd) ditteN.set(nd, true);
    });
    // Intestatari indicati solo per ditta: valgono per tutte le particelle della ditta
    const P = [...part.values()];
    ownersOf.forEach((L, nd) => P.filter(p => p.nd === nd && !p.intest.length).forEach(p => { p.intest = U.clone(L); }));
    // Righe della stessa ditta senza intestatari ripetuti: prendono quelli di un'altra particella con lo stesso numero
    P.filter(p => p.nd && !p.intest.length).forEach(p => { const q = P.find(x => x.nd === p.nd && x.intest.length); if (q) p.intest = U.clone(q.intest); });
    const res = C.raggruppa(P, avvisi);
    P.forEach(p => { if (!p.intest.length) avvisi.push(`Fg.${p.fg} mapp.${p.map}: nessun intestatario`); delete p.intest; });
    return { particelle: P, ditte: res, avvisi, colonne: M, rigaIntestazione: mp.riga };
  };

  // Firma della ditta: stessi intestatari con stessi diritti e stesse quote catastali.
  // ROSSI 500/1000 + VERDI 500/1000 è una ditta; ROSSI 100/1000 + VERDI 900/1000 è un'altra ditta.
  // Le quote si confrontano come frazioni (500/1000 = 1/2); i diritti diversi (proprietà, nuda proprietà, usufrutto) separano.
  const quotaK = q => { const s = String(q || '').trim(); if (!s) return ''; const m = /(\d+)\s*\/\s*(\d+)/.exec(s); return m && +m[2] ? (Math.round(+m[1] / +m[2] * 1e6) / 1e6).toString() : U.norm(s); };
  const titoloK = t => { const n = U.norm(t); return /nuda/.test(n) ? 'nuda' : /usufr/.test(n) ? 'usufrutto' : /propr/.test(n) ? 'proprieta' : n; };
  C.firma = L => L.map(o => (o.cf ? o.cf.toUpperCase() : U.norm(o.nome)) + '~' + titoloK(o.titolo) + '~' + quotaK(o.quota)).sort().join('|');

  // Particelle (con intest e nd) → ditte; le particelle ricevono p.ditta = id.
  // La ditta nasce sempre dagli intestatari; il numero di ditta del file serve come numero di piano.
  C.raggruppa = (P, avvisi) => {
    avvisi = avvisi || [];
    const per = new Map();
    P.forEach(p => {
      const key = (p.intest || []).length ? 'f:' + C.firma(p.intest) : 'n:' + (p.nd || p.id);
      let d = per.get(key);
      if (!d) { d = { id: U.id(), n: '', nFile: new Set(), intest: U.clone(p.intest || []), stato: '', procedura: '', cessione: false, cond: null, ev: {}, foto: [], note: '' }; per.set(key, d); }
      if (p.nd) d.nFile.add(String(p.nd));
      p.ditta = d.id;
    });
    const D = [...per.values()];
    const usati = new Set();
    D.forEach(d => {
      const nn = [...d.nFile];
      if (nn.length > 1) avvisi.push(`Stessi intestatari e quote con numeri di ditta diversi nel file (${nn.join(', ')}): uniti nella ditta ${nn[0]}`);
      if (nn.length && !usati.has(nn[0])) { d.n = nn[0]; usati.add(d.n); }
      else if (nn.length) avvisi.push(`Il numero di ditta ${nn[0]} del file corrisponde a intestatari o quote diversi: assegnato un nuovo numero`);
    });
    // Senza numero dal file: progressivo nell'ordine foglio/mappale
    const first = id => P.filter(p => p.ditta === id).sort((a, b) => U.cmp(a.fg, b.fg) || U.cmp(a.map, b.map))[0];
    let n = 1;
    D.filter(d => !d.n).sort((a, b) => { const x = first(a.id), y = first(b.id); return U.cmp(x.fg, y.fg) || U.cmp(x.map, y.map); })
      .forEach(d => { while (usati.has(String(n))) n++; d.n = String(n); usati.add(d.n); });
    D.forEach(d => { delete d.nFile; d.intest.forEach(o => { o.id = o.id || U.id(); }); });
    D.sort((a, b) => U.cmp(a.n, b.n));
    return D;
  };
  // Rinumera le ditte nell'ordine foglio/mappale (1, 2, 3…)
  C.rinumera = (P, D) => {
    const first = id => P.filter(p => p.ditta === id).sort((a, b) => U.cmp(a.fg, b.fg) || U.cmp(a.map, b.map))[0] || {};
    D.slice().sort((a, b) => { const x = first(a.id), y = first(b.id); return U.cmp(x.fg, y.fg) || U.cmp(x.map, y.map); }).forEach((d, i) => { d.n = String(i + 1); });
    D.sort((a, b) => U.cmp(a.n, b.n));
  };

  // Etichetta della particella per gli atti: «Fg. 46 Mapp. 1706 ex 1367»
  C.mappale = (p, tipo) => {
    const nv = p.nuovo && (tipo ? p.nuovo[tipo] : Object.values(p.nuovo).find(Boolean));
    return nv ? nv + ' ex ' + p.map : String(p.map) + (p.sub ? ' sub ' + p.sub : '');
  };
})(ES);
